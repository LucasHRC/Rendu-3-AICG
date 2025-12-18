/**
 * Module Chat - Logique de conversation avec RAG multi-docs
 */

import { state, addLog } from '../state/state.js';
import { generateCompletion, isModelReady, getLoadedModel } from './webllm.js';
import { searchSimilarChunks, searchForSynthesis, buildRAGContext, getAvailableDocuments, groupResultsByDocument } from '../rag/search.js';

// Historiques séparés pour chaque slot
const chatHistories = {
  primary: [],
  secondary: []
};

// System prompt en français - naturel et académique
const DEFAULT_SYSTEM_PROMPT = `Tu es un assistant de recherche académique francophone. Tu analyses des documents scientifiques et rédiges des synthèses claires.

Ton style :
- Écris de façon naturelle et fluide, comme un chercheur qui explique à un collègue
- Utilise le français académique mais accessible
- Cite tes sources avec [Doc1:Chunk2] après chaque affirmation importante
- Structure tes réponses avec des titres ## et ### quand c'est pertinent
- Utilise des tableaux Markdown pour comparer des éléments (minimum 3 colonnes avec |)
- Mets en **gras** les concepts clés

Pour les synthèses multi-documents :
- Couvre TOUS les documents fournis, aucune exception
- Identifie les points communs et les divergences
- Propose un tableau comparatif quand tu analyses plusieurs sources
- Termine par une conclusion qui fait le lien entre les documents

Reste factuel : si une info n'est pas dans le contexte, dis-le clairement.`;

/**
 * Prompt template pour synthèse de documents (français naturel)
 */
function getSynthesisPromptTemplate(numDocs, docNames) {
  return `Analyse les ${numDocs} documents ci-dessus et rédige une synthèse complète.

Tu dois couvrir ces ${numDocs} documents : ${docNames.join(', ')}

Structure ta réponse ainsi :

## Vue d'ensemble
Résume en 2-3 phrases ce que ces documents apportent collectivement.

## Analyse détaillée
Pour chaque document, explique brièvement :
- De quoi il traite
- Ses apports principaux
- Ses limites éventuelles

## Comparaison
Propose un tableau qui met en regard les documents :

| Document | Sujet | Apport principal | Points forts |
|----------|-------|------------------|--------------|
| ... | ... | ... | ... |

## Conclusion
Fais le lien entre les documents et tire des enseignements globaux.

N'oublie pas de citer tes sources [Doc1:Chunk2] après chaque affirmation.`;
}

/**
 * Ajoute un message à l'historique
 */
export function addMessage(role, content, sources = [], slot = 'primary') {
  const message = {
    id: Date.now().toString() + '-' + slot,
    role,
    content,
    sources,
    timestamp: new Date(),
    slot
  };
  chatHistories[slot].push(message);
  window.dispatchEvent(new CustomEvent('chat:messageAdded', { detail: message }));
  return message;
}

export function getChatHistory(slot = 'primary') {
  return chatHistories[slot] || [];
}

export function clearChatHistory(slot = 'primary') {
  chatHistories[slot] = [];
  window.dispatchEvent(new CustomEvent('chat:cleared', { detail: { slot } }));
  addLog('info', `Historique chat effacé (${slot})`);
}

/**
 * Construit les messages avec contexte RAG structuré
 */
function buildMessages(systemPrompt, ragResults, userQuestion, isSynthesis = false, slot = 'primary') {
  const messages = [];

  // System message
  messages.push({
    role: 'system',
    content: systemPrompt
  });

  // Historique récent
  const recentHistory = chatHistories[slot].slice(-6);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Construire le contexte
  let userContent = '';
  
  if (ragResults && ragResults.length > 0) {
    const context = buildRAGContext(ragResults);
    
    if (isSynthesis) {
      const groups = groupResultsByDocument(ragResults);
      const docNames = groups.map(g => g.docName);
      const synthesisInstructions = getSynthesisPromptTemplate(groups.length, docNames);
      
      userContent = `${context}\n\n---\n\n${synthesisInstructions}\n\n---\n\nUser Request: ${userQuestion}`;
    } else {
      userContent = `${context}\n\n---\n\nUser Question: ${userQuestion}`;
    }
  } else {
    userContent = userQuestion;
  }

  messages.push({ role: 'user', content: userContent });

  return messages;
}

/**
 * Détecte si la requête demande une synthèse/résumé
 */
function isSynthesisRequest(message) {
  const synthKeywords = [
    'résumé', 'resume', 'summary', 'synthèse', 'synthese', 'synthesis',
    'recap', 'récap', 'overview', 'compare', 'comparer', 'comparison',
    'literature review', 'revue de littérature', 'analyse globale',
    'tous les documents', 'all documents', 'ensemble des documents'
  ];
  const lowerMsg = message.toLowerCase();
  return synthKeywords.some(kw => lowerMsg.includes(kw));
}

/**
 * Envoie un message et obtient une réponse
 */
export async function sendMessage(userMessage, options = {}, onToken = () => {}, slot = 'primary') {
  if (!isModelReady(slot)) {
    throw new Error(`Modèle LLM non chargé (${slot})`);
  }

  const {
    temperature = state.settings.temperature || 0.7,
    topN = state.settings.topN || 10,
    maxTokens = state.settings.maxTokens || 1024,
    systemPrompt = state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    forceSynthesis = false
  } = options;

  const modelName = getLoadedModel(slot) || 'Unknown';
  addLog('info', `[${slot}] Message: "${userMessage.substring(0, 50)}..." (${modelName})`);

  // Ajouter message utilisateur
  addMessage('user', userMessage, [], slot);

  // Détecter si c'est une demande de synthèse
  const isSynth = forceSynthesis || isSynthesisRequest(userMessage);
  
  // Recherche RAG adaptée
  let ragResults = [];
  if (state.vectorStore.length > 0) {
    try {
      if (isSynth) {
        // Recherche multi-docs avec couverture garantie
        ragResults = await searchForSynthesis(userMessage, {
          totalChunks: Math.max(topN, 15),
          minChunksPerDoc: 3
        });
        
        const groups = groupResultsByDocument(ragResults);
        addLog('info', `RAG Synthèse: ${ragResults.length} chunks de ${groups.length} documents`);
      } else {
        ragResults = await searchSimilarChunks(userMessage, topN);
        addLog('info', `RAG: ${ragResults.length} chunks`);
      }
    } catch (error) {
      addLog('warning', `RAG failed: ${error.message}`);
    }
  }

  // Construire messages
  const messages = buildMessages(systemPrompt, ragResults, userMessage, isSynth, slot);

  // Générer réponse
  let response = '';
  try {
    response = await generateCompletion(
      messages,
      { temperature, max_tokens: isSynth ? Math.max(maxTokens, 2048) : maxTokens },
      onToken,
      slot
    );
  } catch (error) {
    addLog('error', `Generation failed (${slot}): ${error.message}`);
    throw error;
  }

  // Préparer sources groupées par document
  const groups = groupResultsByDocument(ragResults);
  const sources = groups.flatMap(g => 
    g.chunks.map(c => ({
      source: g.docName,
      text: c.text.substring(0, 200),
      score: c.score,
      docIndex: groups.indexOf(g) + 1,
      chunkIndex: c.chunkIndex + 1
    }))
  );
  
  addMessage('assistant', response, sources, slot);
  addLog('success', `[${slot}] Réponse (${response.length} chars)`);

  return { response, sources, documentGroups: groups };
}

/**
 * Génère une Literature Review complète
 */
export async function generateLiteratureReview(options = {}, onToken = () => {}, slot = 'primary') {
  const availableDocs = getAvailableDocuments();
  const numDocs = availableDocs.length;

  if (numDocs === 0) {
    throw new Error('Aucun document dans la base de connaissances');
  }

  addLog('info', `Literature Review: ${numDocs} documents disponibles`);

  const reviewPrompt = `Rédige une revue de littérature complète sur les ${numDocs} documents disponibles.

Documents à analyser : ${availableDocs.join(', ')}

Ta revue doit :
- Présenter chaque document individuellement
- Identifier les thèmes communs et les divergences
- Proposer un tableau comparatif
- Citer les sources avec [DocX:ChunkY]
- Conclure sur les apports globaux de cette littérature`;

  return sendMessage(reviewPrompt, {
    ...options,
    topN: Math.max(numDocs * 4, 15),
    maxTokens: 3000,
    forceSynthesis: true
  }, onToken, slot);
}

// Export pour debug
if (typeof window !== 'undefined') {
  window.chatModule = {
    addMessage,
    getChatHistory,
    clearChatHistory,
    sendMessage,
    generateLiteratureReview,
    getAvailableDocuments
  };
}

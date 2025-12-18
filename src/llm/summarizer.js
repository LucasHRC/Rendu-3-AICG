/**
 * Summarizer - LLM dedie aux resumes structures avec references
 * Utilise Llama 3B pour des generations de qualite
 */

import { addLog } from '../state/state.js';

const SUMMARIZER_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
const SUMMARIZER_SIZE = '2.3 GB';
let summarizerEngine = null;
let isLoading = false;
let isReady = false;

/**
 * Info sur le summarizer
 */
export function getSummarizerInfo() {
  return {
    model: SUMMARIZER_MODEL,
    name: 'Llama 3.2 3B',
    size: SUMMARIZER_SIZE,
    isReady,
    isLoading
  };
}

/**
 * Charge le LLM summarizer
 */
export async function initSummarizer(onProgress = () => {}) {
  if (isReady) {
    addLog('info', 'Summarizer deja pret');
    return true;
  }
  
  if (isLoading) {
    addLog('warning', 'Summarizer en cours de chargement...');
    return false;
  }

  if (!navigator.gpu) {
    addLog('error', 'WebGPU non disponible');
    return false;
  }

  isLoading = true;
  addLog('info', `Chargement du summarizer (Llama 3B - ${SUMMARIZER_SIZE})...`);

  try {
    let attempts = 0;
    while (!window.webllm && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!window.webllm) {
      throw new Error('WebLLM non charge depuis CDN');
    }

    summarizerEngine = await window.webllm.CreateMLCEngine(SUMMARIZER_MODEL, {
      initProgressCallback: (progress) => {
        const pct = Math.round(progress.progress * 100);
        onProgress(pct, progress.text);
      }
    });

    isLoading = false;
    isReady = true;
    
    window.dispatchEvent(new CustomEvent('summarizer:ready'));
    addLog('success', `Summarizer pret (Llama 3B - ${SUMMARIZER_SIZE})`);
    
    return true;

  } catch (error) {
    isLoading = false;
    addLog('error', `Echec summarizer: ${error.message}`);
    return false;
  }
}

/**
 * Verifie si le summarizer est pret
 */
export function isSummarizerReady() {
  return isReady;
}

/**
 * Verifie si le summarizer est en chargement
 */
export function isSummarizerLoading() {
  return isLoading;
}

/**
 * Genere un resume contextuel avec references
 * @param {string} content - Contenu a resumer
 * @param {Object} context - Contexte (titre, niveau, evidence)
 * @param {Function} onToken - Callback streaming
 */
export async function generateSummary(content, context = {}, onToken = () => {}) {
  if (!summarizerEngine) {
    throw new Error('Summarizer non charge');
  }

  const { title = '', level = 'section', docTitle = '', evidence = [] } = context;

  // Construire les references si disponibles
  let refsContext = '';
  if (evidence.length > 0) {
    refsContext = '\n\nSources disponibles:\n' + evidence.slice(0, 5).map((e, i) => 
      `[Ref:${i + 1}] "${e.excerpt?.substring(0, 150)}..." (${e.doc_title || 'Source'})`
    ).join('\n');
  }

  // Prompt optimise pour resumes structures avec comprehension
  const systemPrompt = `Tu es un expert en analyse documentaire. Tu produis des resumes qui:

1. **EXPLIQUENT** de quoi traite le document/section (sujet, domaine, objectif)
2. **SYNTHETISENT** les points cles de maniere structuree
3. **CITENT** les sources avec [Ref:N] quand des references sont fournies
4. **INTERPRETENT** ce que cela implique ou signifie

Format attendu:
- **Sujet**: Une phrase qui explique clairement de quoi il s'agit
- **Points cles**: Liste a puces des elements importants
- **Implications**: Ce que cela signifie ou suggere

Utilise les references [Ref:N] pour appuyer tes affirmations.
Sois concis mais informatif. Pas de phrases creuses.`;

  const userPrompt = `Analyse et resume${title ? ` "${title}"` : ''}${docTitle ? ` du document "${docTitle}"` : ''}:

${content.substring(0, 3000)}${refsContext}

Produis un resume structure (${level === 'document' ? '8-12 lignes' : '5-8 lignes'}):`;

  let fullResponse = '';

  try {
    const asyncGenerator = await summarizerEngine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 500,
      top_p: 0.9,
      stream: true
    });

    for await (const chunk of asyncGenerator) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullResponse += delta;
        onToken(delta, fullResponse);
      }
    }

    return fullResponse.trim();

  } catch (error) {
    addLog('error', `Erreur summarizer: ${error.message}`);
    throw error;
  }
}

/**
 * Genere un resume de document complet
 */
export async function summarizeDocument(doc, chunks, onToken = () => {}) {
  const content = chunks.map(c => c.text).join('\n\n').substring(0, 4000);
  const evidence = chunks.slice(0, 5).map(c => ({
    excerpt: c.text.substring(0, 200),
    doc_title: doc.displayName || doc.filename,
    chunk_id: c.id
  }));
  
  return generateSummary(content, {
    title: doc.displayName || doc.filename,
    level: 'document',
    docTitle: doc.displayName || doc.filename,
    evidence
  }, onToken);
}

/**
 * Genere un resume de section/node
 */
export async function summarizeSection(node, onToken = () => {}) {
  const content = node.evidence?.map(e => e.excerpt).join('\n\n') || node.summary || '';
  
  return generateSummary(content, {
    title: node.title,
    level: 'section',
    evidence: node.evidence || []
  }, onToken);
}

/**
 * Reset le chat du summarizer
 */
export async function resetSummarizer() {
  if (summarizerEngine) {
    await summarizerEngine.resetChat();
  }
}

// Debug global
if (typeof window !== 'undefined') {
  window.summarizerModule = {
    initSummarizer,
    isSummarizerReady,
    isSummarizerLoading,
    generateSummary,
    summarizeDocument,
    summarizeSection,
    resetSummarizer,
    getSummarizerInfo
  };
}

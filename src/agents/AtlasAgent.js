/**
 * AtlasAgent - Graphe de Connaissances Avancé avec D3.js
 */

import { state, addLog, addChatMessage } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';
import { repairJSON } from '../llm/jsonRepair.js';
import { extractKeywords, extractNGrams, extractClaims, prepareKeywordsContext } from '../utils/keywordExtract.js';
import {
  createEmptyAtlasReport,
  createNode,
  createEdge,
  validateAtlasReport,
  computeNodeScores,
  generateInspectionData,
  NODE_LEVELS,
  STATUS_COLORS,
  EDGE_TYPES
} from './AtlasReport.js';

let currentReport = null;

// System prompt pour génération Atlas
const ATLAS_SYSTEM_PROMPT = `Tu es un analyste de littérature scientifique. Tu génères des graphes de connaissances structurés.

Tu dois identifier:
1. FRAMEWORKS: Cadres théoriques et méthodologiques majeurs (3-5 max)
2. CONCEPTS: Notions clés et termes techniques (10-15)
3. CLAIMS: Affirmations et conclusions importantes (5-10)
4. EVIDENCE: Preuves et données citées (5-8)

Pour chaque élément, fournis:
- id: identifiant unique snake_case
- label: libellé court (2-4 mots)
- type: framework|concept|claim|evidence
- description: 1 phrase descriptive
- docIds: liste des IDs de documents source

Pour les relations (edges), utilise ces types:
- part_of: A fait partie de B
- extends: A étend/spécialise B
- supports: A supporte/confirme B
- contrasts_with: A contraste avec B
- related_to: relation générique
- instance_of: A est une instance de B

Réponds UNIQUEMENT en JSON valide avec cette structure:
{
  "nodes": [...],
  "edges": [{"from": "id1", "to": "id2", "type": "...", "explanation": "raison courte"}]
}`;

/**
 * Génère le rapport Atlas complet
 */
export async function generateAtlasReport(context = '') {
  addLog('info', 'AtlasAgent: Génération du graphe de connaissances...');

  const report = createEmptyAtlasReport();
  report.meta.context = context;
  report.meta.documentCount = state.docs.length;

  if (state.docs.length === 0 || state.chunks.length === 0) {
    addLog('warning', 'AtlasAgent: Aucun document disponible');
    return report;
  }

  // Extraire les concepts et mots-clés
  const keywordsContext = prepareKeywordsContext();

  // Détecter les frameworks
  const frameworks = detectFrameworks(keywordsContext, context);

  // Extraire concepts
  const concepts = extractConceptNodes(keywordsContext);

  // Extraire claims
  const claims = extractClaimNodes();

  // Créer les noeuds evidence
  const evidence = extractEvidenceNodes();

  // Combiner tous les noeuds
  report.nodes = [...frameworks, ...concepts, ...claims, ...evidence];

  // Générer les edges
  if (isModelReady('primary')) {
    const llmResult = await generateEdgesWithLLM(report.nodes, keywordsContext);
    if (llmResult) {
      report.edges = llmResult.edges || [];
      // Enrichir les noeuds si LLM a fourni plus d'infos
      if (llmResult.nodes) {
        mergeNodeInfo(report.nodes, llmResult.nodes);
      }
    } else {
      report.edges = generateEdgesHeuristic(report.nodes, keywordsContext);
    }
  } else {
    report.edges = generateEdgesHeuristic(report.nodes, keywordsContext);
  }

  // Calculer scores et statuts
  computeNodeScores(report.nodes, report.edges, state.chunks);

  // Générer les données d'inspection
  report.inspection = generateInspectionData(report.nodes, report.edges, state.chunks);

  // Mettre à jour meta
  report.meta.nodeCount = report.nodes.length;
  report.meta.edgeCount = report.edges.length;

  currentReport = report;

  // Validation
  const validation = validateAtlasReport(report);
  if (!validation.valid) {
    addLog('warning', `AtlasAgent: Validation partielle - ${validation.errors.length} erreurs`);
  }

  addLog('success', `AtlasAgent: Graphe généré (${report.nodes.length} noeuds, ${report.edges.length} liens)`);

  // Sauvegarder dans l'historique
  addChatMessage({
    role: 'system',
    type: 'agent',
    agentType: 'atlas',
    title: `Atlas: ${report.nodes.length} concepts`,
    data: report,
    timestamp: Date.now(),
    slot: 'primary'
  });

  return report;
}

/**
 * Détecte les frameworks théoriques/méthodologiques
 */
function detectFrameworks(keywordsContext, userContext = '') {
  const frameworks = [];
  
  // Patterns de frameworks courants
  const frameworkPatterns = [
    { pattern: /machine learning|deep learning|neural network/i, label: 'Machine Learning' },
    { pattern: /natural language processing|nlp|traitement.*langage/i, label: 'NLP' },
    { pattern: /computer vision|vision.*ordinateur/i, label: 'Vision par Ordinateur' },
    { pattern: /reinforcement learning|apprentissage.*renforcement/i, label: 'Reinforcement Learning' },
    { pattern: /transformer|attention mechanism/i, label: 'Architecture Transformer' },
    { pattern: /statistical analysis|analyse statistique/i, label: 'Analyse Statistique' },
    { pattern: /qualitative|qualitatif/i, label: 'Méthode Qualitative' },
    { pattern: /quantitative|quantitatif/i, label: 'Méthode Quantitative' },
    { pattern: /graph neural network|gnn/i, label: 'Graph Neural Networks' },
    { pattern: /diffusion model|modèle.*diffusion/i, label: 'Modèles de Diffusion' },
    { pattern: /large language model|llm|grand.*modèle/i, label: 'Large Language Models' }
  ];

  // Chercher dans les chunks
  const allText = state.chunks.map(c => c.text).join(' ').toLowerCase();
  const detectedDocs = {};

  frameworkPatterns.forEach(({ pattern, label }) => {
    if (pattern.test(allText)) {
      const id = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      
      // Trouver les docs qui mentionnent ce framework
      const docIds = [];
      state.chunks.forEach(chunk => {
        if (pattern.test(chunk.text.toLowerCase()) && !docIds.includes(chunk.source)) {
          docIds.push(chunk.source);
        }
      });

      frameworks.push(createNode(id, label, 'framework', {
        description: `Cadre méthodologique: ${label}`,
        importance: 0.9,
        docIds
      }));
    }
  });

  // Limiter à 5 frameworks
  return frameworks.slice(0, 5);
}

/**
 * Extrait les noeuds concepts depuis les mots-clés
 */
function extractConceptNodes(keywordsContext) {
  const concepts = [];
  const seen = new Set();

  // Utiliser les concepts globaux
  keywordsContext.globalConcepts.slice(0, 15).forEach((concept, index) => {
    if (seen.has(concept)) return;
    seen.add(concept);

    const id = `concept_${concept.replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '').substring(0, 30)}`;
    
    // Trouver les docs qui mentionnent ce concept
    const docIds = [];
    state.chunks.forEach(chunk => {
      if (chunk.text.toLowerCase().includes(concept.toLowerCase()) && !docIds.includes(chunk.source)) {
        docIds.push(chunk.source);
      }
    });

    concepts.push(createNode(id, capitalize(concept), 'concept', {
      description: `Concept clé extrait des documents`,
      importance: 0.7 - (index * 0.03),
      docIds
    }));
  });

  // Ajouter quelques n-grams importants
  const allText = state.chunks.map(c => c.text).join(' ');
  const ngrams = extractNGrams(allText, 2, 5);
  
  ngrams.forEach(ngram => {
    if (seen.has(ngram)) return;
    seen.add(ngram);

    const id = `ngram_${ngram.replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '').substring(0, 30)}`;
    
    const docIds = [];
    state.chunks.forEach(chunk => {
      if (chunk.text.toLowerCase().includes(ngram.toLowerCase()) && !docIds.includes(chunk.source)) {
        docIds.push(chunk.source);
      }
    });

    concepts.push(createNode(id, capitalize(ngram), 'concept', {
      description: `Expression clé fréquente`,
      importance: 0.5,
      docIds
    }));
  });

  return concepts.slice(0, 15);
}

/**
 * Extrait les noeuds claims depuis les chunks
 */
function extractClaimNodes() {
  const claims = [];
  const seenClaims = new Set();

  state.chunks.forEach(chunk => {
    const chunkClaims = extractClaims(chunk.text, 2);
    
    chunkClaims.forEach(claimText => {
      // Éviter les doublons
      const normalized = claimText.substring(0, 50).toLowerCase();
      if (seenClaims.has(normalized)) return;
      seenClaims.add(normalized);

      const id = `claim_${Math.random().toString(36).substr(2, 9)}`;
      
      claims.push(createNode(id, truncate(claimText, 50), 'claim', {
        description: claimText,
        importance: 0.6,
        docIds: [chunk.source]
      }));
    });
  });

  return claims.slice(0, 10);
}

/**
 * Extrait les noeuds evidence (passages clés)
 */
function extractEvidenceNodes() {
  const evidence = [];
  
  // Sélectionner les chunks les plus pertinents comme preuves
  const scoredChunks = state.chunks
    .map(chunk => ({
      chunk,
      score: calculateEvidenceScore(chunk.text)
    }))
    .filter(item => item.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  scoredChunks.forEach(({ chunk }, index) => {
    const id = `evidence_${index}`;
    
    evidence.push(createNode(id, truncate(chunk.text, 40), 'evidence', {
      description: chunk.text.substring(0, 200),
      importance: 0.4,
      docIds: [chunk.source]
    }));
  });

  return evidence;
}

/**
 * Calcule un score de pertinence pour un chunk comme preuve
 */
function calculateEvidenceScore(text) {
  let score = 0;
  const lower = text.toLowerCase();

  // Indicateurs de données/résultats
  const indicators = [
    'result', 'finding', 'data show', 'experiment', 'measure',
    'significant', 'p <', 'p=', '%', 'percent',
    'résultat', 'expérience', 'mesure', 'significatif'
  ];

  indicators.forEach(ind => {
    if (lower.includes(ind)) score += 0.15;
  });

  // Présence de chiffres
  if (/\d+(\.\d+)?%/.test(text)) score += 0.2;
  if (/\d+\.\d+/.test(text)) score += 0.1;

  return Math.min(1, score);
}

/**
 * Génère les edges avec le LLM
 */
async function generateEdgesWithLLM(nodes, keywordsContext) {
  const nodesSummary = nodes.slice(0, 20).map(n => `${n.id}: ${n.label} (${n.type})`).join('\n');

  const prompt = `Analyse ces noeuds d'un graphe de connaissances et génère les relations entre eux.

NOEUDS:
${nodesSummary}

Génère un JSON avec les edges (relations) entre ces noeuds.
Chaque edge doit avoir: from, to, type, explanation (courte raison).

Types de relations: ${EDGE_TYPES.join(', ')}

Réponds UNIQUEMENT en JSON: {"edges": [...]}`;

  try {
    const response = await generateCompletion([
      { role: 'system', content: ATLAS_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 1000 });

    const parsed = repairJSON(response);
    if (parsed && parsed.edges) {
      // Valider les edges
      const validEdges = parsed.edges.filter(e => 
        nodes.some(n => n.id === e.from) && 
        nodes.some(n => n.id === e.to) &&
        EDGE_TYPES.includes(e.type)
      );
      return { edges: validEdges };
    }
  } catch (error) {
    addLog('warning', `AtlasAgent LLM error: ${error.message}`);
  }

  return null;
}

/**
 * Génère les edges par heuristiques
 */
function generateEdgesHeuristic(nodes, keywordsContext) {
  const edges = [];
  const edgeSet = new Set();

  const frameworks = nodes.filter(n => n.type === 'framework');
  const concepts = nodes.filter(n => n.type === 'concept');
  const claims = nodes.filter(n => n.type === 'claim');
  const evidence = nodes.filter(n => n.type === 'evidence');

  // Frameworks -> Concepts (part_of)
  frameworks.forEach(fw => {
    concepts.slice(0, 5).forEach(concept => {
      // Si même document, créer une relation
      if (concept.docIds.some(d => fw.docIds.includes(d))) {
        addEdge(edges, edgeSet, fw.id, concept.id, 'part_of', `${concept.label} relié à ${fw.label}`);
      }
    });
  });

  // Concepts <-> Concepts (related_to, co-occurrence)
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < Math.min(i + 4, concepts.length); j++) {
      const c1 = concepts[i];
      const c2 = concepts[j];
      
      // Si apparaissent dans les mêmes documents
      const shared = c1.docIds.filter(d => c2.docIds.includes(d));
      if (shared.length > 0) {
        addEdge(edges, edgeSet, c1.id, c2.id, 'co_occurs_with', `Apparaissent ensemble dans ${shared.length} doc(s)`);
      }
    }
  }

  // Concepts -> Claims (supports)
  concepts.forEach(concept => {
    claims.forEach(claim => {
      if (claim.short_description.toLowerCase().includes(concept.label.toLowerCase())) {
        addEdge(edges, edgeSet, concept.id, claim.id, 'supports', `${concept.label} mentionné dans la claim`);
      }
    });
  });

  // Evidence -> Claims (supports)
  evidence.forEach(ev => {
    const evText = ev.short_description.toLowerCase();
    claims.forEach(claim => {
      // Si même document source
      if (ev.docIds.some(d => claim.docIds.includes(d))) {
        addEdge(edges, edgeSet, ev.id, claim.id, 'supports', `Preuve du même document`);
      }
    });
  });

  return edges;
}

function addEdge(edges, edgeSet, from, to, type, explanation) {
  const key = `${from}-${to}`;
  if (!edgeSet.has(key)) {
    edgeSet.add(key);
    edges.push(createEdge(from, to, type, { explanation }));
  }
}

/**
 * Fusionne les infos LLM dans les noeuds existants
 */
function mergeNodeInfo(existingNodes, llmNodes) {
  if (!llmNodes || !Array.isArray(llmNodes)) return;

  llmNodes.forEach(llmNode => {
    const existing = existingNodes.find(n => n.id === llmNode.id);
    if (existing && llmNode.description) {
      existing.short_description = llmNode.description;
    }
  });
}

// Helpers
function capitalize(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function truncate(str, len) {
  if (str.length <= len) return str;
  return str.substring(0, len - 3) + '...';
}

// Export
export function getAtlasReport() {
  return currentReport;
}

/**
 * Génère la visualisation Atlas (appelée par l'UI)
 */
export async function generateAtlasVisualization(onProgress, onComplete) {
  onProgress(10, 'Extraction des concepts...');

  // Récupérer le contexte utilisateur si disponible
  const contextInput = document.getElementById('atlas-context-input');
  const userContext = contextInput ? contextInput.value : '';

  onProgress(30, 'Génération du graphe...');
  const report = await generateAtlasReport(userContext);

  onProgress(80, 'Rendu de la visualisation...');

  // Dispatcher l'événement pour le dashboard
  window.dispatchEvent(new CustomEvent('atlas:reportReady', { detail: report }));

  onProgress(100, 'Terminé');
  onComplete(report);
}

// Écouter l'événement de génération
window.addEventListener('viz:generate', async (e) => {
  if (e.detail.agent.id === 'atlas') {
    await generateAtlasVisualization(e.detail.onProgress, e.detail.onComplete);
  }
});

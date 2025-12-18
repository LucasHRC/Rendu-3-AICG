/**
 * Module de recherche RAG - Cosine Similarity et recherche multi-docs
 */

import { state } from '../state/state.js';
import { generateEmbedding } from './embeddings.js';
import { addLog } from '../state/state.js';

/**
 * Calcule la similarité cosinus entre deux vecteurs
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    console.warn('Cosine similarity: vecteurs invalides ou de tailles différentes');
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Recherche les chunks les plus similaires avec couverture multi-docs
 * @param {string} query - La requête textuelle
 * @param {number} topN - Nombre total de chunks à retourner
 * @param {Object} options - Options avancées
 * @returns {Promise<Array>} - Chunks groupés par document
 */
export async function searchSimilarChunks(query, topN = 10, options = {}) {
  const { ensureAllDocs = false, minChunksPerDoc = 2 } = options;

  if (!query || query.trim().length === 0) {
    addLog('warning', 'Recherche: requête vide');
    return [];
  }

  if (state.vectorStore.length === 0) {
    addLog('warning', 'Recherche: aucun embedding dans le vector store');
    return [];
  }

  addLog('info', `Recherche RAG: "${query.substring(0, 50)}..." (top ${topN})`);

  try {
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      addLog('error', 'Échec génération embedding pour la requête');
      return [];
    }

    // Calculer scores pour tous les chunks
    const scoredResults = state.vectorStore.map(entry => {
      const chunk = state.chunks.find(c => c.id === entry.chunkId);
      return {
        chunkId: entry.chunkId,
        docId: entry.docId || chunk?.docId,
        source: entry.source || chunk?.source || 'Unknown',
        text: chunk?.text || '',
        chunkIndex: chunk?.chunkIndex ?? -1,
        score: cosineSimilarity(queryEmbedding, entry.vector)
      };
    });

    scoredResults.sort((a, b) => b.score - a.score);

    // Mode standard
    if (!ensureAllDocs) {
      return scoredResults.slice(0, topN);
    }

    // Mode multi-docs avec couverture garantie
    return ensureDocumentCoverage(scoredResults, topN, minChunksPerDoc);

  } catch (error) {
    addLog('error', `Erreur recherche: ${error.message}`);
    return [];
  }
}

/**
 * Assure la couverture de tous les documents disponibles
 */
function ensureDocumentCoverage(scoredResults, totalChunks, minChunksPerDoc) {
  // Grouper par document
  const byDoc = {};
  scoredResults.forEach(r => {
    const docKey = r.source || r.docId || 'unknown';
    if (!byDoc[docKey]) byDoc[docKey] = [];
    byDoc[docKey].push(r);
  });

  const docNames = Object.keys(byDoc);
  const numDocs = docNames.length;
  
  addLog('info', `Multi-doc coverage: ${numDocs} documents détectés`);

  // Calculer combien de chunks par doc
  const chunksPerDoc = Math.max(minChunksPerDoc, Math.floor(totalChunks / numDocs));
  
  const selected = [];

  // Sélectionner les meilleurs chunks de chaque document
  docNames.forEach(docName => {
    const docChunks = byDoc[docName].slice(0, chunksPerDoc);
    selected.push(...docChunks);
    addLog('info', `  - ${docName}: ${docChunks.length} chunks sélectionnés`);
  });

  // Trier par score global
  selected.sort((a, b) => b.score - a.score);

  return selected.slice(0, totalChunks);
}

/**
 * Recherche avec couverture multi-documents garantie pour les synthèses
 */
export async function searchForSynthesis(query, options = {}) {
  const { 
    totalChunks = 15,
    minChunksPerDoc = 3 
  } = options;

  return searchSimilarChunks(query, totalChunks, {
    ensureAllDocs: true,
    minChunksPerDoc
  });
}

/**
 * Groupe les résultats par document pour le contexte structuré
 */
export function groupResultsByDocument(results) {
  const groups = {};
  
  results.forEach((r, idx) => {
    const docName = r.source || 'Unknown';
    if (!groups[docName]) {
      groups[docName] = {
        docName,
        chunks: [],
        avgScore: 0
      };
    }
    groups[docName].chunks.push({
      ...r,
      globalIndex: idx + 1
    });
  });

  // Calculer score moyen par doc
  Object.values(groups).forEach(g => {
    g.avgScore = g.chunks.reduce((sum, c) => sum + c.score, 0) / g.chunks.length;
  });

  return Object.values(groups).sort((a, b) => b.avgScore - a.avgScore);
}

/**
 * Construit le contexte RAG structuré par document
 */
export function buildRAGContext(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return '';
  }

  const groups = groupResultsByDocument(searchResults);
  
  let context = `### Documents disponibles: ${groups.length}\n\n`;

  groups.forEach((group, docIdx) => {
    context += `---\n\n`;
    context += `## Document ${docIdx + 1}: ${group.docName}\n`;
    context += `(${group.chunks.length} extraits, score moyen: ${(group.avgScore * 100).toFixed(0)}%)\n\n`;
    
    group.chunks.forEach(chunk => {
      context += `**[Doc${docIdx + 1}:Chunk${chunk.chunkIndex + 1}]**\n`;
      context += `${chunk.text}\n\n`;
    });
  });

  return context;
}

/**
 * Construit un contexte simplifié (format legacy)
 */
export function buildSimpleContext(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return '';
  }

  const contextParts = searchResults.map((result, idx) => {
    return `[Source ${idx + 1}: ${result.source}]\n${result.text}`;
  });

  return `### Retrieved Context from Documents:\n\n${contextParts.join('\n\n---\n\n')}`;
}

/**
 * Obtient la liste des documents uniques dans le vector store
 */
export function getAvailableDocuments() {
  const docs = new Set();
  state.vectorStore.forEach(entry => {
    const chunk = state.chunks.find(c => c.id === entry.chunkId);
    docs.add(entry.source || chunk?.source || 'Unknown');
  });
  return Array.from(docs);
}

// Debug global
if (typeof window !== 'undefined') {
  window.ragSearch = {
    cosineSimilarity,
    searchSimilarChunks,
    searchForSynthesis,
    groupResultsByDocument,
    buildRAGContext,
    buildSimpleContext,
    getAvailableDocuments
  };
}

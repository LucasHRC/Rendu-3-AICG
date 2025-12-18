/**
 * Module de recherche RAG - Cosine Similarity et recherche de chunks
 */

import { state } from '../state/state.js';
import { generateEmbedding } from './embeddings.js';
import { addLog } from '../state/state.js';

/**
 * Calcule la similarité cosinus entre deux vecteurs
 * Formule: similarity = (A·B) / (||A|| × ||B||)
 * 
 * @param {Float32Array|number[]} vecA - Premier vecteur
 * @param {Float32Array|number[]} vecB - Second vecteur
 * @returns {number} - Score de similarité entre -1 et 1
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
 * Recherche les chunks les plus similaires à une requête
 * 
 * @param {string} query - La requête textuelle
 * @param {number} topN - Nombre de résultats à retourner (défaut: 5)
 * @returns {Promise<Array>} - Liste des chunks triés par similarité décroissante
 */
export async function searchSimilarChunks(query, topN = 5) {
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
    // 1. Générer l'embedding de la requête
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      addLog('error', 'Échec génération embedding pour la requête');
      return [];
    }

    // 2. Calculer la similarité avec tous les vecteurs du store
    const scoredResults = state.vectorStore.map(entry => {
      const chunk = state.chunks.find(c => c.id === entry.chunkId);
      const score = cosineSimilarity(queryEmbedding, entry.vector);

      return {
        chunkId: entry.chunkId,
        source: entry.source || chunk?.source || 'Unknown',
        text: chunk?.text || '',
        chunkIndex: chunk?.chunkIndex ?? -1,
        score: score,
        vector: entry.vector
      };
    });

    // 3. Trier par score décroissant
    scoredResults.sort((a, b) => b.score - a.score);

    // 4. Retourner les top N
    const topResults = scoredResults.slice(0, topN);

    addLog('success', `Recherche terminée: ${topResults.length} résultats (meilleur score: ${topResults[0]?.score.toFixed(3) || 'N/A'})`);

    return topResults;

  } catch (error) {
    addLog('error', `Erreur recherche: ${error.message}`);
    return [];
  }
}

/**
 * Recherche synchrone (si l'embedding de la query est déjà calculé)
 * 
 * @param {Float32Array|number[]} queryVector - Vecteur de la requête
 * @param {number} topN - Nombre de résultats
 * @returns {Array} - Liste des chunks triés par similarité
 */
export function searchByVector(queryVector, topN = 5) {
  if (!queryVector || state.vectorStore.length === 0) {
    return [];
  }

  const scoredResults = state.vectorStore.map(entry => {
    const chunk = state.chunks.find(c => c.id === entry.chunkId);
    return {
      chunkId: entry.chunkId,
      source: entry.source || chunk?.source || 'Unknown',
      text: chunk?.text || '',
      chunkIndex: chunk?.chunkIndex ?? -1,
      score: cosineSimilarity(queryVector, entry.vector)
    };
  });

  return scoredResults
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Construit le contexte RAG à partir des résultats de recherche
 * Format optimisé pour injection dans le prompt LLM
 * 
 * @param {Array} searchResults - Résultats de searchSimilarChunks
 * @returns {string} - Contexte formaté pour le LLM
 */
export function buildRAGContext(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return '';
  }

  const contextParts = searchResults.map((result, idx) => {
    return `[Source ${idx + 1}: ${result.source}]\n${result.text}`;
  });

  return `### Retrieved Context from Documents:\n\n${contextParts.join('\n\n---\n\n')}`;
}

// Exporter pour utilisation globale (debug console)
if (typeof window !== 'undefined') {
  window.ragSearch = {
    cosineSimilarity,
    searchSimilarChunks,
    searchByVector,
    buildRAGContext
  };
}


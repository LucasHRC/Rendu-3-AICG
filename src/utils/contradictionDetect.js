/**
 * Contradiction Detection - Détection sémantique de contradictions entre claims
 */

import { state, addLog } from '../state/state.js';
import { generateEmbedding } from '../rag/embeddings.js';

/**
 * Calcule la similarité cosine entre deux vecteurs
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Mots indicateurs de négation ou opposition
 */
const NEGATION_INDICATORS = new Set([
  'not', 'no', 'never', 'none', 'neither', 'nor', 'cannot', 'without',
  'unlike', 'contrary', 'opposite', 'however', 'but', 'although', 'despite',
  'fails', 'failed', 'reject', 'rejected', 'disagree', 'contradict',
  'ne', 'pas', 'jamais', 'aucun', 'sans', 'contrairement', 'cependant',
  'mais', 'malgré', 'échoue', 'rejette', 'contredit'
]);

/**
 * Vérifie si un texte contient des indicateurs de négation
 */
function hasNegation(text) {
  const words = text.toLowerCase().split(/\s+/);
  return words.some(word => NEGATION_INDICATORS.has(word));
}

/**
 * Détecte les contradictions potentielles entre claims
 * Utilise les embeddings pour trouver les claims similaires puis vérifie les négations
 * 
 * @param {Array} claims - Liste de claims avec id et text
 * @returns {Array} - Liste de contradictions détectées
 */
export async function computeClaimContradictions(claims) {
  if (!claims || claims.length < 2) return [];

  const contradictions = [];
  const claimEmbeddings = [];

  // Générer les embeddings pour chaque claim
  addLog('info', `Génération embeddings pour ${claims.length} claims...`);
  
  for (const claim of claims) {
    try {
      // Utiliser le cache si disponible
      const cached = state.vectorStore.find(v => v.text === claim.text);
      if (cached?.embedding) {
        claimEmbeddings.push({ ...claim, embedding: cached.embedding });
      } else {
        const embedding = await generateEmbedding(claim.text);
        claimEmbeddings.push({ ...claim, embedding });
      }
    } catch (error) {
      // Skip si erreur d'embedding
      claimEmbeddings.push({ ...claim, embedding: null });
    }
  }

  // Comparer chaque paire de claims
  for (let i = 0; i < claimEmbeddings.length; i++) {
    for (let j = i + 1; j < claimEmbeddings.length; j++) {
      const claim1 = claimEmbeddings[i];
      const claim2 = claimEmbeddings[j];

      if (!claim1.embedding || !claim2.embedding) continue;

      // Calculer la similarité
      const similarity = cosineSimilarity(claim1.embedding, claim2.embedding);

      // Claims similaires (même sujet) mais potentiellement contradictoires
      if (similarity > 0.6) {
        const hasNeg1 = hasNegation(claim1.text);
        const hasNeg2 = hasNegation(claim2.text);

        // Si l'un a une négation et l'autre non, possible contradiction
        if (hasNeg1 !== hasNeg2) {
          contradictions.push({
            id: `x${contradictions.length + 1}`,
            claim1: claim1.id,
            claim2: claim2.id,
            similarity: Math.round(similarity * 100) / 100,
            type: 'negation_mismatch',
            evidence: [
              ...(claim1.sources?.map(s => s.chunkId) || []),
              ...(claim2.sources?.map(s => s.chunkId) || [])
            ]
          });

          // Marquer les claims comme ayant des contradictions
          claim1.contradictions = claim1.contradictions || [];
          claim1.contradictions.push(claim2.id);
          claim2.contradictions = claim2.contradictions || [];
          claim2.contradictions.push(claim1.id);
        }
      }
    }
  }

  addLog('info', `${contradictions.length} contradictions potentielles détectées`);
  return contradictions;
}

/**
 * Vérifie si deux claims sont sur le même sujet (sans embeddings)
 * Fallback basé sur les mots-clés communs
 */
export function areSameTopic(text1, text2) {
  const words1 = new Set(
    text1.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4)
  );
  
  const words2 = new Set(
    text2.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4)
  );

  // Compter les mots communs
  let common = 0;
  for (const word of words1) {
    if (words2.has(word)) common++;
  }

  // Au moins 30% de mots communs
  const minSize = Math.min(words1.size, words2.size);
  return minSize > 0 && (common / minSize) >= 0.3;
}

/**
 * Version légère de détection sans embeddings
 */
export function detectContradictionsLight(claims) {
  const contradictions = [];

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const claim1 = claims[i];
      const claim2 = claims[j];

      if (areSameTopic(claim1.text, claim2.text)) {
        const hasNeg1 = hasNegation(claim1.text);
        const hasNeg2 = hasNegation(claim2.text);

        if (hasNeg1 !== hasNeg2) {
          contradictions.push({
            id: `x${contradictions.length + 1}`,
            claim1: claim1.id,
            claim2: claim2.id,
            type: 'negation_mismatch',
            evidence: []
          });
        }
      }
    }
  }

  return contradictions;
}


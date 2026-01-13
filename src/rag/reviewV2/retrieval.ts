/**
 * Retrieval V2 - MMR + Diversification Multi-Doc
 * Évite la concentration sur un seul document
 */

import { Chunk, RetrievedChunk, ReviewV2Options, DEFAULT_OPTIONS } from './types';

// Import des fonctions existantes
// @ts-ignore - JS module
import { cosineSimilarity } from '../search.js';
// @ts-ignore - JS module
import { generateEmbedding } from '../embeddings.js';
// @ts-ignore - JS module
import { state } from '../../state/state.js';

/**
 * Récupère les chunks pour un thème avec MMR et diversification par document
 */
export async function retrieveForTheme(
  theme: string,
  opts: Partial<ReviewV2Options> = {}
): Promise<RetrievedChunk[]> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const { topK, mmrLambda, docPenalty } = options;

  console.log(`[RetrievalV2] Retrieving for theme: "${theme}" (topK=${topK})`);

  // 1. Generate theme embedding
  const themeEmbedding = await generateEmbedding(theme);
  if (!themeEmbedding || themeEmbedding.length === 0) {
    console.warn('[RetrievalV2] Failed to generate theme embedding');
    return [];
  }

  // 2. Score all chunks
  const allScored: { chunk: Chunk; score: number; embedding: number[] }[] = [];

  for (const entry of state.vectorStore) {
    const chunk = state.chunks.find((c: Chunk) => c.id === entry.chunkId);
    if (!chunk) continue;

    // Filter by docIds if specified
    if (options.docIds && options.docIds.length > 0) {
      if (!options.docIds.includes(chunk.docId)) continue;
    }

    const score = cosineSimilarity(themeEmbedding, entry.vector);
    allScored.push({ chunk, score, embedding: entry.vector });
  }

  // Sort by initial score
  allScored.sort((a, b) => b.score - a.score);

  console.log(`[RetrievalV2] Initial candidates: ${allScored.length}`);

  // 3. MMR re-ranking with doc diversification
  const selected: RetrievedChunk[] = [];
  const docCounts = new Map<string, number>();
  const usedIndices = new Set<number>();

  while (selected.length < topK && usedIndices.size < allScored.length) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < allScored.length; i++) {
      if (usedIndices.has(i)) continue;

      const candidate = allScored[i];
      const docId = candidate.chunk.docId;

      // Relevance component
      const relevance = candidate.score;

      // Diversity component (max similarity to already selected)
      let maxSim = 0;
      if (selected.length > 0) {
        for (const sel of selected) {
          const selEntry = allScored.find(a => a.chunk.id === sel.chunk.id);
          if (selEntry) {
            const sim = cosineSimilarity(candidate.embedding, selEntry.embedding);
            maxSim = Math.max(maxSim, sim);
          }
        }
      }

      // MMR score
      const mmrScore = mmrLambda * relevance - (1 - mmrLambda) * maxSim;

      // Doc penalty (éviter concentration sur un seul doc)
      const docCount = docCounts.get(docId) || 0;
      const penalty = docCount * docPenalty;

      const finalScore = mmrScore - penalty;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      usedIndices.add(bestIdx);
      const chosen = allScored[bestIdx];

      const reason: 'vector' | 'mmr' | 'diversified' = 
        selected.length === 0 ? 'vector' : 
        (docCounts.get(chosen.chunk.docId) || 0) > 0 ? 'diversified' : 'mmr';

      selected.push({
        chunk: chosen.chunk,
        score: chosen.score,
        reason
      });

      const docId = chosen.chunk.docId;
      docCounts.set(docId, (docCounts.get(docId) || 0) + 1);
    } else {
      break;
    }
  }

  // Log distribution
  console.log('[RetrievalV2] Doc distribution:', Object.fromEntries(docCounts));
  console.log(`[RetrievalV2] Selected ${selected.length} chunks`);

  return selected;
}

/**
 * Retrieval avec boost de diversité (pour repair loop)
 */
export async function retrieveWithBoost(
  theme: string,
  opts: Partial<ReviewV2Options> = {},
  boostFactor: number = 1.5
): Promise<RetrievedChunk[]> {
  const boostedOpts = {
    ...opts,
    docPenalty: (opts.docPenalty || DEFAULT_OPTIONS.docPenalty) * boostFactor,
    mmrLambda: Math.max(0.5, (opts.mmrLambda || DEFAULT_OPTIONS.mmrLambda) - 0.1),
    topK: Math.min(30, ((opts.topK || DEFAULT_OPTIONS.topK) * 1.5) | 0)
  };

  console.log(`[RetrievalV2] Boosted retrieval (penalty=${boostedOpts.docPenalty})`);
  return retrieveForTheme(theme, boostedOpts);
}

/**
 * Calcule la distribution des documents dans les chunks récupérés
 */
export function computeDocDistribution(chunks: RetrievedChunk[]): Map<string, number> {
  const dist = new Map<string, number>();
  for (const c of chunks) {
    const docId = c.chunk.docId;
    dist.set(docId, (dist.get(docId) || 0) + 1);
  }
  return dist;
}

/**
 * Vérifie si la diversité est suffisante
 */
export function checkDiversity(
  chunks: RetrievedChunk[],
  minDocs: number = 2,
  maxDocShare: number = 0.5
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const dist = computeDocDistribution(chunks);
  
  const uniqueDocs = dist.size;
  const maxCount = Math.max(...dist.values(), 0);
  const share = chunks.length > 0 ? maxCount / chunks.length : 0;

  if (uniqueDocs < minDocs) {
    warnings.push(`Seulement ${uniqueDocs} document(s) trouvé(s), cible: ${minDocs}`);
  }

  if (share > maxDocShare) {
    warnings.push(`Un document représente ${(share * 100).toFixed(0)}% des chunks (max: ${(maxDocShare * 100).toFixed(0)}%)`);
  }

  return {
    ok: warnings.length === 0,
    warnings
  };
}

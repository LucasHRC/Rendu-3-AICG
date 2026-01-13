/**
 * Scope Guard - Filtrage des chunks hors-scope
 * Évite le mélange de domaines non liés
 */

import { Chunk, RetrievedChunk, Fingerprint, ScopeFilterResult, DEFAULT_OPTIONS } from './types';

// @ts-ignore - JS module
import { cosineSimilarity } from '../search.js';
// @ts-ignore - JS module
import { generateEmbedding } from '../embeddings.js';
// @ts-ignore - JS module
import { state } from '../../state/state.js';

// Cache des fingerprints par document
const docFingerprintCache = new Map<string, Fingerprint>();

/**
 * Construit le fingerprint d'un document
 */
export async function buildDocFingerprint(docId: string): Promise<Fingerprint> {
  // Check cache
  if (docFingerprintCache.has(docId)) {
    return docFingerprintCache.get(docId)!;
  }

  const chunks = state.chunks.filter((c: Chunk) => c.docId === docId);
  if (chunks.length === 0) {
    return { id: docId, keywords: [], centroid: [], domain: undefined };
  }

  // Extract keywords from first chunks (title, abstract, intro)
  const textSample = chunks.slice(0, 5).map((c: Chunk) => c.text).join(' ');
  const keywords = extractKeywords(textSample);

  // Get domain from first chunk metadata
  const domain = chunks[0]?.metadata?.domain;
  const year = chunks[0]?.metadata?.year;

  // Compute centroid of embeddings
  const embeddings: number[][] = [];
  for (const chunk of chunks.slice(0, 10)) {
    const entry = state.vectorStore.find((v: { chunkId: string }) => v.chunkId === chunk.id);
    if (entry?.vector) {
      embeddings.push(entry.vector);
    }
  }

  let centroid: number[] = [];
  if (embeddings.length > 0) {
    const dim = embeddings[0].length;
    centroid = new Array(dim).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += emb[i];
      }
    }
    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }
  }

  const fingerprint: Fingerprint = { id: docId, keywords, centroid, domain, year };
  docFingerprintCache.set(docId, fingerprint);

  return fingerprint;
}

/**
 * Construit le fingerprint d'un thème
 */
export async function buildThemeFingerprint(
  theme: string,
  keywords: string[] = []
): Promise<Fingerprint> {
  const embedding = await generateEmbedding(theme);
  const themeKeywords = keywords.length > 0 ? keywords : extractKeywords(theme);

  return {
    id: theme,
    keywords: themeKeywords,
    centroid: embedding || [],
    domain: undefined
  };
}

/**
 * Filtre les chunks par scope (similarité avec le thème)
 */
export async function filterChunksByScope(
  themeFp: Fingerprint,
  chunks: RetrievedChunk[],
  threshold: number = DEFAULT_OPTIONS.scopeThreshold
): Promise<ScopeFilterResult> {
  const kept: RetrievedChunk[] = [];
  const removed: RetrievedChunk[] = [];
  const reasons: string[] = [];

  if (themeFp.centroid.length === 0) {
    // Cannot filter without theme embedding
    return { kept: chunks, removed: [], reason: ['No theme embedding available'] };
  }

  // Group chunks by doc and check scope
  const docScores = new Map<string, number>();

  for (const rc of chunks) {
    const docId = rc.chunk.docId;

    if (!docScores.has(docId)) {
      // Compute doc-theme similarity
      const docFp = await buildDocFingerprint(docId);
      
      if (docFp.centroid.length > 0) {
        const similarity = cosineSimilarity(themeFp.centroid, docFp.centroid);
        docScores.set(docId, similarity);
      } else {
        // No embedding for doc, keep by default
        docScores.set(docId, 1.0);
      }
    }

    const docScore = docScores.get(docId) || 0;

    if (docScore >= threshold) {
      kept.push(rc);
    } else {
      removed.push(rc);
      
      // Find doc name for logging
      const doc = state.docs.find((d: { id: string }) => d.id === docId);
      const docName = doc?.filename || docId;
      reasons.push(`${docName}: similarity ${(docScore * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%`);
    }
  }

  if (removed.length > 0) {
    console.log(`[ScopeGuard] Removed ${removed.length}/${chunks.length} chunks:`, reasons.slice(0, 3));
  }

  return { kept, removed, reason: reasons };
}

/**
 * Vérifie si un chunk est dans le scope du thème
 */
export async function isChunkInScope(
  chunk: Chunk,
  themeFp: Fingerprint,
  threshold: number = DEFAULT_OPTIONS.scopeThreshold
): Promise<boolean> {
  const entry = state.vectorStore.find((v: { chunkId: string }) => v.chunkId === chunk.id);
  if (!entry?.vector || themeFp.centroid.length === 0) {
    return true; // Cannot determine, keep by default
  }

  const similarity = cosineSimilarity(themeFp.centroid, entry.vector);
  return similarity >= threshold;
}

/**
 * Vérifie les keywords communs entre thème et chunk
 */
export function hasKeywordOverlap(
  themeKeywords: string[],
  chunkText: string,
  minOverlap: number = 2
): boolean {
  const chunkWords = new Set(extractKeywords(chunkText));
  let overlap = 0;

  for (const kw of themeKeywords) {
    if (chunkWords.has(kw.toLowerCase())) {
      overlap++;
    }
  }

  return overlap >= minOverlap;
}

/**
 * Extrait les keywords d'un texte
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'from', 'as', 'which', 'who', 'whom', 'what', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then'
  ]);

  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  // Count occurrences
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  // Return top keywords by frequency
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

/**
 * Clear fingerprint cache (pour tests)
 */
export function clearFingerprintCache(): void {
  docFingerprintCache.clear();
}

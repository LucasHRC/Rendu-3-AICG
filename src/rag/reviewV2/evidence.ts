/**
 * Evidence Pack - Construction et statistiques des preuves
 * Calcul du score de confiance par section
 */

import { 
  RetrievedChunk, 
  EvidencePack, 
  EvidenceStats,
  DEFAULT_OPTIONS 
} from './types';

// Patterns pour détecter les valeurs numériques scientifiques
const NUMERIC_PATTERNS = [
  /\d+(\.\d+)?\s*σ/gi,           // sigma levels
  /\d+(\.\d+)?\s*%/gi,           // percentages
  /\d+(\.\d+)?\s*kpc/gi,         // kiloparsecs
  /\d+(\.\d+)?\s*Mpc/gi,         // megaparsecs
  /\d+(\.\d+)?\s*pc/gi,          // parsecs
  /\d+(\.\d+)?\s*AU/gi,          // astronomical units
  /\d+(\.\d+)?\s*M[☉⊙]/gi,       // solar masses
  /\d+(\.\d+)?\s*GeV/gi,         // gigaelectronvolts
  /\d+(\.\d+)?\s*TeV/gi,         // teraelectronvolts
  /\d+(\.\d+)?\s*eV/gi,          // electronvolts
  /\d+(\.\d+)?\s*Hz/gi,          // hertz
  /\d+(\.\d+)?\s*Gyr/gi,         // gigayears
  /\d+(\.\d+)?\s*Myr/gi,         // megayears
  /\d+(\.\d+)?\s*km\/s/gi,       // velocity
  /\d+(\.\d+)?×10\^?\d+/gi,      // scientific notation
  /\d+(\.\d+)?\s*±\s*\d+/gi,     // error margins
];

/**
 * Construit un EvidencePack à partir des chunks récupérés
 */
export function buildEvidencePack(
  theme: string,
  chunks: RetrievedChunk[],
  themeKeywords: string[] = []
): EvidencePack {
  const stats = computeEvidenceStats(chunks);
  const docDistribution = computeDocDistribution(chunks);

  return {
    theme,
    themeKeywords,
    chunks,
    stats,
    docDistribution
  };
}

/**
 * Calcule les statistiques d'un ensemble de chunks
 */
export function computeEvidenceStats(chunks: RetrievedChunk[]): EvidenceStats {
  if (chunks.length === 0) {
    return {
      uniqueDocs: 0,
      distinctChunks: 0,
      maxDocShare: 0,
      excludedByScope: 0,
      numericClaimsCount: 0,
      avgRelevanceScore: 0
    };
  }

  // Unique documents
  const docIds = new Set(chunks.map(c => c.chunk.docId));
  const uniqueDocs = docIds.size;

  // Distinct chunks
  const chunkIds = new Set(chunks.map(c => c.chunk.id));
  const distinctChunks = chunkIds.size;

  // Max doc share
  const docCounts = new Map<string, number>();
  for (const c of chunks) {
    const docId = c.chunk.docId;
    docCounts.set(docId, (docCounts.get(docId) || 0) + 1);
  }
  const maxDocCount = Math.max(...docCounts.values(), 0);
  const maxDocShare = chunks.length > 0 ? maxDocCount / chunks.length : 0;

  // Numeric claims count
  let numericClaimsCount = 0;
  for (const c of chunks) {
    numericClaimsCount += countNumericClaims(c.chunk.text);
  }

  // Average relevance score
  const totalScore = chunks.reduce((sum, c) => sum + c.score, 0);
  const avgRelevanceScore = totalScore / chunks.length;

  return {
    uniqueDocs,
    distinctChunks,
    maxDocShare,
    excludedByScope: 0, // Set externally after scope filtering
    numericClaimsCount,
    avgRelevanceScore
  };
}

/**
 * Calcule la distribution des documents
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
 * Compte les claims numériques dans un texte
 */
export function countNumericClaims(text: string): number {
  let count = 0;
  for (const pattern of NUMERIC_PATTERNS) {
    const matches = text.match(pattern);
    count += matches?.length || 0;
  }
  return count;
}

/**
 * Extrait les claims numériques d'un texte avec leur contexte
 */
export function extractNumericClaims(text: string): { value: string; context: string }[] {
  const claims: { value: string; context: string }[] = [];

  for (const pattern of NUMERIC_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      if (match.index !== undefined) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + match[0].length + 50);
        claims.push({
          value: match[0],
          context: text.slice(start, end).trim()
        });
      }
    }
  }

  return claims;
}

/**
 * Calcule le score de confiance pour une section
 */
export function computeConfidenceScore(
  stats: EvidenceStats,
  opts: { minDocs?: number; minChunks?: number } = {}
): number {
  const { minDocs = 2, minChunks = 3 } = opts;

  // Document coverage (0-1)
  // Score max si ≥ minDocs documents
  const docCoverage = Math.min(1, stats.uniqueDocs / minDocs);

  // Chunk coverage (0-1)
  // Score max si ≥ minChunks chunks distincts
  const chunkCoverage = Math.min(1, stats.distinctChunks / minChunks);

  // Balance (1 = parfait, 0 = un doc a tout)
  // Pénalité si un doc dépasse 50%
  const balance = 1 - Math.max(0, (stats.maxDocShare - 0.5) / 0.5);

  // Scope quality
  // 1 si aucun chunk exclu, 0.7 si <30% exclus, 0.4 sinon
  const totalChunks = stats.distinctChunks + stats.excludedByScope;
  const excludedRatio = totalChunks > 0 ? stats.excludedByScope / totalChunks : 0;
  const scope = excludedRatio === 0 ? 1 : excludedRatio < 0.3 ? 0.7 : 0.4;

  // Weighted average
  const confidence = 
    0.35 * docCoverage + 
    0.25 * chunkCoverage + 
    0.20 * balance + 
    0.20 * scope;

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Convertit un score de confiance en étoiles
 */
export function confidenceToStars(confidence: number): string {
  if (confidence >= 0.85) return '★★★★★';
  if (confidence >= 0.70) return '★★★★☆';
  if (confidence >= 0.55) return '★★★☆☆';
  if (confidence >= 0.40) return '★★☆☆☆';
  return '★☆☆☆☆';
}

/**
 * Génère un résumé des statistiques d'evidence
 */
export function formatEvidenceStats(stats: EvidenceStats): string {
  const parts = [
    `${stats.uniqueDocs} doc(s)`,
    `${stats.distinctChunks} chunks`,
    `${(stats.maxDocShare * 100).toFixed(0)}% max share`,
    `${stats.numericClaimsCount} métriques`
  ];

  if (stats.excludedByScope > 0) {
    parts.push(`${stats.excludedByScope} exclus par scope`);
  }

  return parts.join(' | ');
}

/**
 * Vérifie si l'evidence pack est suffisant pour une section de qualité
 */
export function isEvidenceSufficient(
  stats: EvidenceStats,
  opts: Partial<typeof DEFAULT_OPTIONS> = {}
): { sufficient: boolean; warnings: string[] } {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const warnings: string[] = [];

  if (stats.uniqueDocs < options.minDocsPerSection) {
    warnings.push(`[Attention] Seulement ${stats.uniqueDocs} document(s) disponible(s), cible: ${options.minDocsPerSection}`);
  }

  if (stats.distinctChunks < options.minChunksPerSection) {
    warnings.push(`[Attention] Seulement ${stats.distinctChunks} chunk(s) distinct(s), cible: ${options.minChunksPerSection}`);
  }

  if (stats.maxDocShare > options.maxDocShare) {
    warnings.push(`[Attention] Un document represente ${(stats.maxDocShare * 100).toFixed(0)}% des sources`);
  }

  return {
    sufficient: warnings.length === 0,
    warnings
  };
}

/**
 * Types pour Review V2 - Pipeline RAG Academic Literature Review
 * Multi-doc, diversification, validation stricte
 */

// ==================== CHUNKS ====================

export interface ChunkMetadata {
  year?: number;
  domain?: string;
  keywords?: string[];
  section?: string;
  authors?: string[];
}

export interface Chunk {
  id: string;
  docId: string;
  page: number;
  text: string;
  chunkIndex: number;
  embedding?: number[];
  metadata?: ChunkMetadata;
}

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
  reason: 'vector' | 'mmr' | 'diversified' | 'boosted';
}

// ==================== EVIDENCE ====================

export interface EvidenceStats {
  uniqueDocs: number;
  distinctChunks: number;
  maxDocShare: number;           // 0-1, fraction du doc le plus représenté
  excludedByScope: number;       // nombre de chunks filtrés par scope
  numericClaimsCount: number;    // nombre de valeurs numériques trouvées
  avgRelevanceScore: number;     // score moyen de pertinence
}

export interface EvidencePack {
  theme: string;
  themeKeywords: string[];
  chunks: RetrievedChunk[];
  stats: EvidenceStats;
  docDistribution: Map<string, number>;  // docId -> count
}

// ==================== CITATIONS ====================

export interface Citation {
  docId: string;
  docIndex: number;      // 1-based pour affichage
  page: number;
  chunkId: string;
  chunkIndex: number;    // 0-based interne
  text?: string;         // extrait du chunk
}

export interface CitationStats {
  total: number;
  uniqueDocs: number;
  uniqueChunks: number;
  maxDocShare: number;
  duplicates: number;
  uncitedClaims: number;
}

// ==================== SECTIONS ====================

export interface ReviewSection {
  theme: string;
  markdown: string;
  confidence: number;           // 0-1
  confidenceStars: string;      // ★★★☆☆
  warnings: string[];
  errors: string[];
  usedCitations: Citation[];
  stats: EvidenceStats;
  repairAttempts: number;
}

// ==================== VALIDATION ====================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    citationCount: number;
    uniqueDocs: number;
    distinctChunks: number;
    maxDocShare: number;
    uncitedClaims: number;
    duplicateCitations: number;
    scopeMismatches: number;
  };
}

// ==================== SCOPE ====================

export interface Fingerprint {
  id: string;
  keywords: string[];
  centroid: number[];
  domain?: string;
  year?: number;
}

export interface ScopeFilterResult {
  kept: RetrievedChunk[];
  removed: RetrievedChunk[];
  reason: string[];
}

// ==================== OUTLINE ====================

export interface ThemeOutline {
  title: string;
  keywords: string[];
  relevantDocIndices: number[];  // 1-based doc indices
  priority: number;              // 1 = high, 3 = low
}

export interface ReviewOutline {
  themes: ThemeOutline[];
  mode: 'thematic' | 'portfolio';
  totalDocs: number;
  yearRange: [number, number] | null;
  domains: string[];
}

// ==================== OPTIONS ====================

export interface ReviewV2Options {
  query?: string;
  docIds?: string[];
  yearRange?: [number, number];
  topK?: number;                    // default: 15
  minDocsPerSection?: number;       // default: 2
  minChunksPerSection?: number;     // default: 3
  maxDocShare?: number;             // default: 0.5
  scopeThreshold?: number;          // default: 0.22
  maxRepairAttempts?: number;       // default: 2
  mmrLambda?: number;               // default: 0.7
  docPenalty?: number;              // default: 0.3
  enableScopeGuard?: boolean;       // default: true
  enableComparison?: boolean;       // default: true
}

export const DEFAULT_OPTIONS: Required<ReviewV2Options> = {
  query: '',
  docIds: [],
  yearRange: [2000, 2030],
  topK: 10,              // Réduit de 15 à 10 pour accélérer
  minDocsPerSection: 2,
  minChunksPerSection: 3,
  maxDocShare: 0.5,
  scopeThreshold: 0.22,
  maxRepairAttempts: 1,  // Réduit de 2 à 1 pour accélérer
  mmrLambda: 0.7,
  docPenalty: 0.3,
  enableScopeGuard: true,
  enableComparison: true
};

// ==================== RESULT ====================

export interface ReviewV2Result {
  markdown: string;
  sections: ReviewSection[];
  outline: ReviewOutline;
  comparisonTable: string | null;
  stats: {
    totalDocs: number;
    totalSections: number;
    avgConfidence: number;
    totalCitations: number;
    totalWarnings: number;
    generationTimeMs: number;
  };
  warnings: string[];
  errors: string[];
}

// ==================== PROGRESS ====================

export interface ProgressCallback {
  (phase: string, current: number, total: number, details?: string): void;
}

/**
 * Review V2 - Export principal
 * Pipeline RAG Academic Literature Review avec validation stricte
 */

// Types
export * from './types';

// Core functions
export { retrieveForTheme, retrieveWithBoost, checkDiversity } from './retrieval';
export { buildDocFingerprint, buildThemeFingerprint, filterChunksByScope, clearFingerprintCache } from './scopeGuard';
export { 
  buildEvidencePack, 
  computeEvidenceStats, 
  computeConfidenceScore, 
  confidenceToStars,
  extractNumericClaims,
  isEvidenceSufficient 
} from './evidence';
export { 
  validateSection, 
  extractCitations, 
  countUncitedNumericClaims,
  generateRepairSuggestions,
  formatValidationReport 
} from './validator';
export { 
  buildOutlinePrompt, 
  buildSectionPrompt, 
  buildComparisonPrompt,
  buildRepairPrompt,
  buildDocsContext 
} from './prompt';
export { buildSection, buildSectionsSequential, shouldIncludeComparison } from './sectionBuilder';
export { generateReviewV2, generateOutline, assembleReview } from './generator';

// Convenience wrapper
import { generateReviewV2 } from './generator';
import { ReviewV2Options, ReviewV2Result, ProgressCallback } from './types';

/**
 * Classe wrapper pour une intégration facile
 */
export class ReviewV2Agent {
  private isGenerating = false;

  async generate(
    options?: Partial<ReviewV2Options>,
    onProgress?: ProgressCallback
  ): Promise<ReviewV2Result> {
    if (this.isGenerating) {
      throw new Error('Une génération est déjà en cours');
    }

    this.isGenerating = true;

    try {
      return await generateReviewV2(options, onProgress);
    } finally {
      this.isGenerating = false;
    }
  }

  isRunning(): boolean {
    return this.isGenerating;
  }
}

// Singleton instance
export const reviewV2Agent = new ReviewV2Agent();

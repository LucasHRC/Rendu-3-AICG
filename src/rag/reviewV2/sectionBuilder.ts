/**
 * Section Builder V2 - Génération de sections avec validation et repair loop
 */

import { 
  ReviewSection, 
  EvidencePack, 
  ValidationResult,
  ProgressCallback,
  DEFAULT_OPTIONS 
} from './types';
import { retrieveForTheme, retrieveWithBoost } from './retrieval';
import { buildThemeFingerprint, filterChunksByScope } from './scopeGuard';
import { buildEvidencePack, computeConfidenceScore, confidenceToStars, isEvidenceSufficient } from './evidence';
import { validateSection, extractCitations, generateRepairSuggestions } from './validator';
import { buildSectionPrompt, buildRepairPrompt } from './prompt';

// @ts-ignore - JS module
import { generateCompletion, isModelReady } from '../../llm/webllm.js';
// @ts-ignore - JS module
import { addLog } from '../../state/state.js';

/**
 * Génère une section complète pour un thème
 */
export async function buildSection(
  theme: string,
  themeKeywords: string[] = [],
  opts: Partial<typeof DEFAULT_OPTIONS> = {},
  onProgress?: ProgressCallback
): Promise<ReviewSection> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const startTime = Date.now();
  
  addLog('info', `[SectionBuilder] Génération section: "${theme}"`);
  onProgress?.('section', 0, 1, `Récupération evidence pour: ${theme}`);

  // 1. Retrieve chunks for theme
  let retrieved = await retrieveForTheme(theme, options);
  
  // 2. Apply scope guard if enabled
  let excludedCount = 0;
  if (options.enableScopeGuard) {
    const themeFp = await buildThemeFingerprint(theme, themeKeywords);
    const { kept, removed } = await filterChunksByScope(themeFp, retrieved, options.scopeThreshold);
    retrieved = kept;
    excludedCount = removed.length;
    
    if (excludedCount > 0) {
      addLog('info', `[SectionBuilder] Scope guard: ${excludedCount} chunks exclus`);
    }
  }

  // 3. Build evidence pack
  const evidencePack = buildEvidencePack(theme, retrieved, themeKeywords);
  evidencePack.stats.excludedByScope = excludedCount;

  // 4. Check if evidence is sufficient
  const { sufficient, warnings: evidenceWarnings } = isEvidenceSufficient(evidencePack.stats, options);
  
  // 5. Generate section with repair loop
  onProgress?.('section', 0, 1, `Génération LLM pour: ${theme}`);
  const section = await generateSectionWithRepair(
    theme,
    evidencePack,
    options,
    onProgress
  );

  // Add evidence warnings
  section.warnings.push(...evidenceWarnings);

  // Calculate final confidence
  section.confidence = computeConfidenceScore(evidencePack.stats, {
    minDocs: options.minDocsPerSection,
    minChunks: options.minChunksPerSection
  });
  section.confidenceStars = confidenceToStars(section.confidence);
  section.stats = evidencePack.stats;

  const elapsed = Date.now() - startTime;
  addLog('success', `[SectionBuilder] Section terminée en ${(elapsed/1000).toFixed(1)}s (confiance: ${section.confidenceStars})`);

  return section;
}

/**
 * Génère une section avec boucle de réparation si validation échoue
 */
async function generateSectionWithRepair(
  theme: string,
  evidencePack: EvidencePack,
  options: typeof DEFAULT_OPTIONS,
  onProgress?: ProgressCallback
): Promise<ReviewSection> {
  let attempt = 0;
  let lastValidation: ValidationResult | null = null;
  let lastMarkdown = '';
  let currentEvidencePack = evidencePack;

  while (attempt <= options.maxRepairAttempts) {
    // Build prompt
    const { system, user } = attempt === 0
      ? buildSectionPrompt(theme, currentEvidencePack)
      : buildRepairPrompt(lastMarkdown, lastValidation!.errors, currentEvidencePack);

    // Generate section
    addLog('info', `[SectionBuilder] Génération tentative ${attempt + 1}/${options.maxRepairAttempts + 1}`);
    
    const response = await generateCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      { 
        temperature: attempt === 0 ? 0.2 : 0.3,
        max_tokens: 1500 // Réduit pour accélérer
      },
      () => {}, // No streaming for sections
      'primary'
    );

    lastMarkdown = response;

    // Validate
    lastValidation = validateSection(response, currentEvidencePack, options);
    
    addLog('info', `[SectionBuilder] Validation: ${lastValidation.valid ? 'OK' : 'FAILED'} (${lastValidation.errors.length} erreurs, ${lastValidation.warnings.length} warnings)`);

    if (lastValidation.valid || attempt === options.maxRepairAttempts) {
      // Extract citations
      const citations = extractCitations(response);

      return {
        theme,
        markdown: response,
        confidence: 0, // Set later
        confidenceStars: '',
        warnings: lastValidation.warnings,
        errors: lastValidation.errors,
        usedCitations: citations,
        stats: currentEvidencePack.stats,
        repairAttempts: attempt
      };
    }

    // Repair: boost retrieval diversity
    attempt++;
    onProgress?.('repair', attempt, options.maxRepairAttempts, `Réparation section: ${theme}`);
    
    // Re-retrieve with boosted diversity
    const boostedRetrieved = await retrieveWithBoost(theme, options, 1.5 + (attempt * 0.5));
    currentEvidencePack = buildEvidencePack(theme, boostedRetrieved, currentEvidencePack.themeKeywords);
    currentEvidencePack.stats.excludedByScope = evidencePack.stats.excludedByScope;
  }

  // Should never reach here
  return {
    theme,
    markdown: lastMarkdown,
    confidence: 0,
    confidenceStars: '★☆☆☆☆',
    warnings: lastValidation?.warnings || [],
    errors: lastValidation?.errors || ['Échec génération après réparations'],
    usedCitations: [],
    stats: currentEvidencePack.stats,
    repairAttempts: attempt
  };
}

/**
 * Génère plusieurs sections en parallèle (avec limite de concurrence)
 */
export async function buildSectionsSequential(
  themes: { title: string; keywords: string[] }[],
  opts: Partial<typeof DEFAULT_OPTIONS> = {},
  onProgress?: ProgressCallback
): Promise<ReviewSection[]> {
  const sections: ReviewSection[] = [];

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    onProgress?.('sections', i + 1, themes.length, `Section ${i + 1}/${themes.length}: ${theme.title}`);

    try {
      const section = await buildSection(theme.title, theme.keywords, opts, onProgress);
      sections.push(section);
    } catch (error) {
      addLog('error', `[SectionBuilder] Erreur section "${theme.title}": ${error}`);
      
      // Create error section
      sections.push({
        theme: theme.title,
        markdown: `### ${theme.title}\n\n[ERREUR] lors de la generation de cette section.`,
        confidence: 0,
        confidenceStars: '★☆☆☆☆',
        warnings: [],
        errors: [`Erreur génération: ${error}`],
        usedCitations: [],
        stats: {
          uniqueDocs: 0,
          distinctChunks: 0,
          maxDocShare: 0,
          excludedByScope: 0,
          numericClaimsCount: 0,
          avgRelevanceScore: 0
        },
        repairAttempts: 0
      });
    }
  }

  return sections;
}

/**
 * Vérifie si un tableau comparatif est justifié
 */
export function shouldIncludeComparison(sections: ReviewSection[]): boolean {
  // Collect all unique docs cited across sections
  const citedDocs = new Set<number>();
  
  for (const section of sections) {
    for (const citation of section.usedCitations) {
      citedDocs.add(citation.docIndex);
    }
  }

  // Need at least 2 different docs cited
  if (citedDocs.size < 2) {
    return false;
  }

  // Check if at least one section cites multiple docs
  const hasMultiDocSection = sections.some(s => {
    const sectionDocs = new Set(s.usedCitations.map(c => c.docIndex));
    return sectionDocs.size >= 2;
  });

  return hasMultiDocSection;
}

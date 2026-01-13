/**
 * Generator V2 - Orchestration complète du pipeline de revue
 */

import {
  ReviewV2Options,
  ReviewV2Result,
  ReviewOutline,
  ReviewSection,
  ThemeOutline,
  ProgressCallback,
  DEFAULT_OPTIONS
} from './types';
import { buildOutlinePrompt, buildDocsContext, buildComparisonPrompt } from './prompt';
import { buildSectionsSequential, shouldIncludeComparison } from './sectionBuilder';
import { extractCitations } from './validator';
import { confidenceToStars } from './evidence';

// @ts-ignore - JS module
import { generateCompletion, isModelReady } from '../../llm/webllm.js';
// @ts-ignore - JS module
import { state, addLog } from '../../state/state.js';

/**
 * Génère une revue de littérature complète V2
 */
export async function generateReviewV2(
  opts: Partial<ReviewV2Options> = {},
  onProgress?: ProgressCallback
): Promise<ReviewV2Result> {
  const startTime = Date.now();
  const options = { ...DEFAULT_OPTIONS, ...opts };
  
  addLog('info', '[ReviewV2] Démarrage génération revue V2');
  
  // Vérifications préliminaires
  if (!isModelReady()) {
    throw new Error('Modèle LLM non chargé');
  }

  const docs = state.docs.filter((d: { status: string }) => d.status === 'extracted');
  if (docs.length === 0) {
    throw new Error('Aucun document ingéré');
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: GÉNÉRATION DE L'OUTLINE (THÈMES)
  // ══════════════════════════════════════════════════════════════
  onProgress?.('outline', 0, 1, 'Analyse du corpus et génération des thèmes...');
  addLog('info', `[ReviewV2] Phase 1: Outline (${docs.length} documents)`);

  const docsContext = buildDocsContext();
  const outline = await generateOutline(docsContext, options);
  
  addLog('info', `[ReviewV2] ${outline.themes.length} thèmes identifiés (mode: ${outline.mode})`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: GÉNÉRATION DES SECTIONS
  // ══════════════════════════════════════════════════════════════
  onProgress?.('sections', 0, outline.themes.length, 'Génération des sections thématiques...');
  addLog('info', `[ReviewV2] Phase 2: Sections`);

  const sections = await buildSectionsSequential(
    outline.themes.map(t => ({ title: t.title, keywords: t.keywords })),
    options,
    onProgress
  );

  // Collecter les warnings des sections
  for (const section of sections) {
    if (section.warnings.length > 0) {
      warnings.push(...section.warnings.map(w => `[${section.theme}] ${w}`));
    }
    if (section.errors.length > 0) {
      errors.push(...section.errors.map(e => `[${section.theme}] ${e}`));
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 3: TABLEAU COMPARATIF (CONDITIONNEL)
  // ══════════════════════════════════════════════════════════════
  let comparisonTable: string | null = null;
  
  if (options.enableComparison && shouldIncludeComparison(sections)) {
    onProgress?.('comparison', 0, 1, 'Génération du tableau comparatif...');
    addLog('info', '[ReviewV2] Phase 3: Tableau comparatif');
    
    comparisonTable = await generateComparisonTable(sections, docsContext, options);
  } else {
    addLog('info', '[ReviewV2] Phase 3: Tableau comparatif ignoré (conditions non remplies)');
    if (docs.length >= 2) {
      warnings.push('Tableau comparatif non inclus: les documents ne sont pas suffisamment cités ensemble');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 4: ASSEMBLAGE FINAL
  // ══════════════════════════════════════════════════════════════
  onProgress?.('assembly', 0, 1, 'Assemblage de la revue finale...');
  addLog('info', '[ReviewV2] Phase 4: Assemblage');

  const markdown = assembleReview(docs, outline, sections, comparisonTable);

  // ══════════════════════════════════════════════════════════════
  // STATISTIQUES FINALES
  // ══════════════════════════════════════════════════════════════
  const totalCitations = sections.reduce((sum, s) => sum + s.usedCitations.length, 0);
  const avgConfidence = sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length;
  const generationTimeMs = Date.now() - startTime;

  addLog('success', `[ReviewV2] Revue terminée en ${(generationTimeMs/1000).toFixed(1)}s`);
  addLog('info', `[ReviewV2] Stats: ${totalCitations} citations, confiance moyenne: ${(avgConfidence*100).toFixed(0)}%`);

  return {
    markdown,
    sections,
    outline,
    comparisonTable,
    stats: {
      totalDocs: docs.length,
      totalSections: sections.length,
      avgConfidence,
      totalCitations,
      totalWarnings: warnings.length,
      generationTimeMs
    },
    warnings,
    errors
  };
}

/**
 * Génère l'outline des thèmes
 */
async function generateOutline(
  docsContext: string,
  options: typeof DEFAULT_OPTIONS
): Promise<ReviewOutline> {
  const { system, user } = buildOutlinePrompt(docsContext);

  const response = await generateCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { temperature: 0.3, max_tokens: 800 }, // Réduit pour accélérer outline
    () => {},
    'primary'
  );

  // Parse JSON response
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const themes: ThemeOutline[] = (parsed.themes || []).map((t: any, idx: number) => ({
      title: t.title || `Thème ${idx + 1}`,
      keywords: t.keywords || [],
      relevantDocIndices: t.relevantDocs || [],
      priority: t.priority || 2
    }));

    // Extract metadata from docs
    const docs = state.docs.filter((d: { status: string }) => d.status === 'extracted');
    const years = docs.map((d: any) => {
      const chunk = state.chunks.find((c: any) => c.docId === d.id);
      return chunk?.metadata?.year;
    }).filter((y: any) => y && typeof y === 'number');

    const domains = docs.map((d: any) => {
      const chunk = state.chunks.find((c: any) => c.docId === d.id);
      return chunk?.metadata?.domain;
    }).filter((d: any) => d);

    return {
      themes,
      mode: parsed.mode === 'portfolio' ? 'portfolio' : 'thematic',
      totalDocs: docs.length,
      yearRange: years.length >= 2 ? [Math.min(...years), Math.max(...years)] : null,
      domains: [...new Set(domains)]
    };
  } catch (error) {
    addLog('warning', `[ReviewV2] Échec parsing outline, utilisation fallback: ${error}`);
    
    // Fallback: single generic theme
    const docs = state.docs.filter((d: { status: string }) => d.status === 'extracted');
    return {
      themes: [{
        title: 'Analyse générale',
        keywords: [],
        relevantDocIndices: docs.map((_: any, i: number) => i + 1),
        priority: 1
      }],
      mode: 'portfolio',
      totalDocs: docs.length,
      yearRange: null,
      domains: []
    };
  }
}

/**
 * Génère le tableau comparatif
 */
async function generateComparisonTable(
  sections: ReviewSection[],
  docsContext: string,
  options: typeof DEFAULT_OPTIONS
): Promise<string | null> {
  // Collect cited docs
  const citedDocs = new Set<number>();
  for (const section of sections) {
    for (const citation of section.usedCitations) {
      citedDocs.add(citation.docIndex);
    }
  }

  if (citedDocs.size < 2) {
    return null;
  }

  const { system, user } = buildComparisonPrompt(
    sections.map(s => ({
      theme: s.theme,
      citations: s.usedCitations.map(c => c.docIndex)
    })),
    docsContext
  );

  if (!system || !user) {
    return null;
  }

  try {
    const response = await generateCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      { temperature: 0.2, max_tokens: 800 }, // Réduit pour accélérer
      () => {},
      'primary'
    );

    // Validate the table has citations
    const citations = extractCitations(response);
    if (citations.length < 2) {
      addLog('warning', '[ReviewV2] Tableau comparatif invalide (pas assez de citations)');
      return null;
    }

    return response;
  } catch (error) {
    addLog('error', `[ReviewV2] Erreur génération tableau: ${error}`);
    return null;
  }
}

/**
 * Assemble la revue finale en Markdown
 */
function assembleReview(
  docs: any[],
  outline: ReviewOutline,
  sections: ReviewSection[],
  comparisonTable: string | null
): string {
  const now = new Date().toLocaleString('fr-FR');
  const avgConfidence = sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length;
  const avgStars = confidenceToStars(avgConfidence);

  let md = `# Revue de Littérature Académique (V2)

> **Mode:** ${outline.mode === 'thematic' ? 'Thematique' : 'Portfolio'}
> **Documents:** ${docs.length} | **Sections:** ${sections.length} | **Confiance moyenne:** ${avgStars}
> **Généré le:** ${now}

---

## Introduction

Cette revue analyse **${docs.length}** document(s) scientifique(s)${outline.yearRange ? ` publiés entre ${outline.yearRange[0]} et ${outline.yearRange[1]}` : ''}${outline.domains.length > 0 ? ` dans les domaines: ${outline.domains.join(', ')}` : ''}.

### Documents analysés

| # | Document | Domaine |
|---|----------|---------|
${docs.map((d: any, i: number) => {
  const chunk = state.chunks.find((c: any) => c.docId === d.id);
  const domain = chunk?.metadata?.domain || 'Non spécifié';
  return `| Doc${i + 1} | ${d.filename} | ${domain} |`;
}).join('\n')}

---

## Sections Thematiques

`;

  // Add sections
  for (const section of sections) {
    md += section.markdown;
    md += `\n\n**Confiance RAG:** ${section.confidenceStars} (${(section.confidence * 100).toFixed(0)}%)`;
    
    if (section.warnings.length > 0) {
      md += `\n\n**Avertissements:**\n`;
      for (const w of section.warnings.slice(0, 3)) {
        md += `- ${w}\n`;
      }
    }
    
    md += `\n\n---\n\n`;
  }

  // Add comparison table if available
  if (comparisonTable) {
    md += `## Tableau Comparatif

${comparisonTable}

---

`;
  }

  // Add statistics
  const totalCitations = sections.reduce((sum, s) => sum + s.usedCitations.length, 0);
  const totalRepairs = sections.reduce((sum, s) => sum + s.repairAttempts, 0);

  md += `## Statistiques

| Métrique | Valeur |
|----------|--------|
| Documents analysés | ${docs.length} |
| Sections générées | ${sections.length} |
| Citations totales | ${totalCitations} |
| Confiance moyenne | ${(avgConfidence * 100).toFixed(0)}% |
| Réparations effectuées | ${totalRepairs} |
| Mode de revue | ${outline.mode} |

---

*Revue générée automatiquement par RAG V2*
`;

  return md;
}

/**
 * Export pour utilisation externe
 */
export { generateOutline, assembleReview };

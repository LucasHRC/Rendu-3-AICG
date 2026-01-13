/**
 * Validator V2 - Validation stricte des sections
 * Citations, diversité, claims numériques
 */

import { 
  ReviewSection, 
  EvidencePack, 
  ValidationResult, 
  Citation,
  DEFAULT_OPTIONS 
} from './types';

// Regex pour extraire les citations au format [DocX • pY • chunk_Z]
const CITATION_REGEX = /\[Doc(\d+)\s*[•·]\s*p(\d+)\s*[•·]\s*(chunk_\d+)\]/gi;

// Regex pour détecter les valeurs numériques scientifiques
const NUMERIC_CLAIM_REGEX = /\d+(\.\d+)?\s*(σ|%|kpc|Mpc|pc|AU|M[☉⊙]|GeV|TeV|eV|Hz|Gyr|Myr|km\/s)/gi;

/**
 * Valide une section générée
 */
export function validateSection(
  markdown: string,
  evidencePack: EvidencePack,
  opts: Partial<typeof DEFAULT_OPTIONS> = {}
): ValidationResult {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Extraire toutes les citations
  const citations = extractCitations(markdown);
  const uniqueDocs = new Set(citations.map(c => c.docIndex));
  const uniqueChunks = new Set(citations.map(c => `${c.docIndex}_${c.chunkId}`));

  // 2. Vérifier la présence de citations
  if (citations.length === 0) {
    errors.push('ERREUR: Aucune citation trouvée dans la section');
  }

  // 3. Vérifier la diversité des documents
  if (uniqueDocs.size < options.minDocsPerSection) {
    const msg = `Section repose sur ${uniqueDocs.size} document(s), cible: ${options.minDocsPerSection}`;
    if (uniqueDocs.size === 1) {
      warnings.push(`[Attention] ${msg} - Section mono-document`);
    } else {
      warnings.push(`[Attention] ${msg}`);
    }
  }

  // 4. Vérifier la diversité des chunks
  if (uniqueChunks.size < options.minChunksPerSection) {
    warnings.push(`[Attention] Seulement ${uniqueChunks.size} chunk(s) distinct(s), cible: ${options.minChunksPerSection}`);
  }

  // 5. Vérifier la concentration sur un document
  const docCounts = new Map<number, number>();
  for (const c of citations) {
    docCounts.set(c.docIndex, (docCounts.get(c.docIndex) || 0) + 1);
  }
  const maxCount = Math.max(...docCounts.values(), 0);
  const maxShare = citations.length > 0 ? maxCount / citations.length : 0;

  if (maxShare > options.maxDocShare) {
    warnings.push(`[Attention] Un document represente ${(maxShare * 100).toFixed(0)}% des citations (max: ${(options.maxDocShare * 100).toFixed(0)}%)`);
  }

  // 6. Vérifier les citations dupliquées (même chunk cité plusieurs fois)
  const citationStrings = citations.map(c => `${c.docIndex}_${c.page}_${c.chunkId}`);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const cs of citationStrings) {
    if (seen.has(cs)) {
      duplicates.push(cs);
    }
    seen.add(cs);
  }

  if (duplicates.length > 0) {
    warnings.push(`[Attention] ${duplicates.length} citation(s) dupliquee(s) dans la section`);
  }

  // 7. Vérifier les claims numériques sans citation
  const uncitedClaims = countUncitedNumericClaims(markdown);
  if (uncitedClaims > 0) {
    errors.push(`ERREUR: ${uncitedClaims} valeur(s) numérique(s) sans citation à proximité`);
  }

  // 8. Vérifier que les citations référencent des documents existants
  const availableDocIndices = new Set<number>();
  for (const chunk of evidencePack.chunks) {
    const docIdx = getDocIndexFromId(chunk.chunk.docId);
    availableDocIndices.add(docIdx);
  }

  const invalidCitations = citations.filter(c => !availableDocIndices.has(c.docIndex));
  if (invalidCitations.length > 0) {
    errors.push(`ERREUR: ${invalidCitations.length} citation(s) référençant des documents non disponibles`);
  }

  // 9. Vérifier les mismatches de scope (citations vers docs hors-scope)
  const scopeMismatches = 0; // TODO: implement based on scope filter results

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      citationCount: citations.length,
      uniqueDocs: uniqueDocs.size,
      distinctChunks: uniqueChunks.size,
      maxDocShare: maxShare,
      uncitedClaims,
      duplicateCitations: duplicates.length,
      scopeMismatches
    }
  };
}

/**
 * Extrait toutes les citations d'un texte
 */
export function extractCitations(text: string): Citation[] {
  const citations: Citation[] = [];
  const regex = new RegExp(CITATION_REGEX.source, 'gi');
  let match;

  while ((match = regex.exec(text)) !== null) {
    citations.push({
      docId: `Doc${match[1]}`,
      docIndex: parseInt(match[1]),
      page: parseInt(match[2]),
      chunkId: match[3],
      chunkIndex: parseInt(match[3].replace('chunk_', ''))
    });
  }

  return citations;
}

/**
 * Compte les claims numériques sans citation à proximité
 */
export function countUncitedNumericClaims(markdown: string): number {
  const lines = markdown.split('\n');
  let uncited = 0;

  for (const line of lines) {
    // Skip lines that are headers or empty
    if (line.trim().startsWith('#') || line.trim().length < 10) continue;

    const numbers = line.match(NUMERIC_CLAIM_REGEX);
    if (numbers && numbers.length > 0) {
      // Check if line has a citation nearby
      const hasCitation = CITATION_REGEX.test(line);
      if (!hasCitation) {
        // Check if previous or next content has citation (within same paragraph)
        uncited += numbers.length;
      }
    }
  }

  return uncited;
}

/**
 * Vérifie si une citation est valide (existe dans l'evidence pack)
 */
export function isCitationValid(
  citation: Citation,
  evidencePack: EvidencePack
): boolean {
  const matchingChunk = evidencePack.chunks.find(c => {
    const chunkIdx = c.chunk.chunkIndex;
    const docIdx = getDocIndexFromId(c.chunk.docId);
    return docIdx === citation.docIndex && chunkIdx === citation.chunkIndex;
  });

  return matchingChunk !== undefined;
}

/**
 * Génère des suggestions de réparation
 */
export function generateRepairSuggestions(
  validation: ValidationResult,
  evidencePack: EvidencePack
): string[] {
  const suggestions: string[] = [];

  if (validation.metrics.citationCount === 0) {
    suggestions.push('Ajouter des citations au format [DocX • pY • chunk_Z] pour chaque affirmation');
  }

  if (validation.metrics.uniqueDocs < 2 && evidencePack.stats.uniqueDocs >= 2) {
    suggestions.push('Diversifier les sources en citant d\'autres documents disponibles');
  }

  if (validation.metrics.uncitedClaims > 0) {
    suggestions.push('Ajouter une citation après chaque valeur numérique');
  }

  if (validation.metrics.duplicateCitations > 0) {
    suggestions.push('Éviter de citer le même chunk plusieurs fois');
  }

  if (validation.metrics.maxDocShare > 0.5) {
    suggestions.push('Réduire la dépendance au document principal en ajoutant des sources alternatives');
  }

  return suggestions;
}

/**
 * Formate le rapport de validation
 */
export function formatValidationReport(validation: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`**Validation:** ${validation.valid ? '✅ Valide' : '❌ Invalide'}`);
  lines.push('');

  lines.push(`**Métriques:**`);
  lines.push(`- Citations: ${validation.metrics.citationCount}`);
  lines.push(`- Documents uniques: ${validation.metrics.uniqueDocs}`);
  lines.push(`- Chunks distincts: ${validation.metrics.distinctChunks}`);
  lines.push(`- Part max doc: ${(validation.metrics.maxDocShare * 100).toFixed(0)}%`);

  if (validation.errors.length > 0) {
    lines.push('');
    lines.push('**Erreurs:**');
    for (const err of validation.errors) {
      lines.push(`- ❌ ${err}`);
    }
  }

  if (validation.warnings.length > 0) {
    lines.push('');
    lines.push('**Avertissements:**');
    for (const warn of validation.warnings) {
      lines.push(`- ${warn}`);
    }
  }

  return lines.join('\n');
}

/**
 * Helper: obtient l'index du document depuis son ID
 */
function getDocIndexFromId(docId: string): number {
  // @ts-ignore - JS module
  const { state } = require('../../state/state.js');
  const docs = state.docs.filter((d: { status: string }) => d.status === 'extracted');
  const idx = docs.findIndex((d: { id: string }) => d.id === docId);
  return idx + 1; // 1-based
}

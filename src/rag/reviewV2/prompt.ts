/**
 * Prompts V2 - Templates stricts pour génération académique
 * Citations obligatoires, multi-doc enforcement
 */

import { EvidencePack, ThemeOutline, RetrievedChunk } from './types';

// @ts-ignore - JS module
import { state } from '../../state/state.js';

/**
 * Prompt pour générer l'outline (thèmes) de la revue - COMPACT
 */
export function buildOutlinePrompt(docsContext: string): { system: string; user: string } {
  const system = `Identifie 3-5 thèmes pour revue de littérature. JSON uniquement.`;

  const user = `DOCS:\n${docsContext}

JSON (commence par {, termine par }):
{"themes":[{"title":"Thème","keywords":["k1","k2"],"relevantDocs":[1,2],"priority":1}],"mode":"thematic|portfolio"}`;

  return { system, user };
}

/**
 * Construit le contexte des documents pour le prompt - COMPACT
 */
export function buildDocsContext(): string {
  const docs = state.docs.filter((d: { status: string }) => d.status === 'extracted');
  
  return docs.map((doc: any, idx: number) => {
    const docChunks = state.chunks.filter((c: any) => c.docId === doc.id);
    const firstChunk = docChunks[0];
    const domain = firstChunk?.metadata?.domain || '?';
    const year = firstChunk?.metadata?.year || '?';
    
    // Aperçu très court (150 chars max)
    const preview = (docChunks[0]?.text || '').substring(0, 150).trim();
    
    return `[Doc${idx + 1}] ${doc.filename} | ${domain} | ${year}\n${preview}...`;
  }).join('\n\n');
}

/**
 * Prompt pour générer une section thématique - COMPACT
 */
export function buildSectionPrompt(
  theme: string,
  evidencePack: EvidencePack
): { system: string; user: string } {
  const evidenceContext = formatEvidenceContext(evidencePack);
  const numDocs = evidencePack.stats.uniqueDocs;
  const hasMultipleDocs = numDocs >= 2;

  const system = `Rédacteur académique. Citations obligatoires [DocX • pY • chunk_Z]. Copie valeurs exactes. ${!hasMultipleDocs ? 'UN SEUL DOC - mentionne-le.' : 'Cite 2+ docs.'}`;

  const user = `THÈME: ${theme}

EVIDENCE (${numDocs} doc, ${evidencePack.chunks.length} chunks):
${evidenceContext}

GÉNÈRE:
### ${theme}
${!hasMultipleDocs ? '[Note: Section mono-document]\n' : ''}
**Observations:** (2-3 points avec citations)
**Résultats:** (valeurs exactes + citations)
**Limitations:** (si mentionnées)
${hasMultipleDocs ? '**Comparaison:** (2 docs différents)' : ''}`;

  return { system, user };
}

/**
 * Formate le contexte des chunks pour le prompt - OPTIMISÉ VITESSE
 * Chunks plus courts (300 chars) pour réduire le temps de génération
 */
function formatEvidenceContext(evidencePack: EvidencePack): string {
  const chunksByDoc = new Map<number, RetrievedChunk[]>();
  
  for (const rc of evidencePack.chunks) {
    const docIdx = getDocIndex(rc.chunk.docId);
    if (!chunksByDoc.has(docIdx)) {
      chunksByDoc.set(docIdx, []);
    }
    chunksByDoc.get(docIdx)!.push(rc);
  }

  let context = '';
  
  for (const [docIdx, chunks] of chunksByDoc) {
    context += `\n[DOC${docIdx}]\n`;
    
    for (const rc of chunks.slice(0, 5)) { // Max 5 chunks par doc
      const chunkId = `chunk_${rc.chunk.chunkIndex}`;
      const page = rc.chunk.page || '?';
      
      // Texte raccourci à 300 caractères
      const text = rc.chunk.text.substring(0, 300).trim();
      context += `[${chunkId}|p${page}] ${text}${rc.chunk.text.length > 300 ? '...' : ''}\nCite: [Doc${docIdx} • p${page} • ${chunkId}]\n`;
    }
  }

  return context;
}

/**
 * Prompt pour générer le tableau comparatif
 */
export function buildComparisonPrompt(
  sections: { theme: string; citations: number[] }[],
  docsContext: string
): { system: string; user: string } {
  const citedDocs = new Set<number>();
  for (const s of sections) {
    for (const docIdx of s.citations) {
      citedDocs.add(docIdx);
    }
  }

  if (citedDocs.size < 2) {
    return { system: '', user: '' }; // No comparison possible
  }

  const system = `Tu es un chercheur académique créant un tableau comparatif pour une revue de littérature.

RÈGLES:
- Inclure UNIQUEMENT les documents réellement présents et cités
- Chaque cellule DOIT avoir une citation [DocX • pY • chunk_Z]
- Si information non disponible: "Non spécifié"
- Ne JAMAIS inventer d'information`;

  const user = `DOCUMENTS ANALYSÉS:
${docsContext}

DOCUMENTS RÉELLEMENT CITÉS: ${Array.from(citedDocs).map(d => `Doc${d}`).join(', ')}

GÉNÈRE UN TABLEAU COMPARATIF AU FORMAT:

| Aspect | ${Array.from(citedDocs).map(d => `Doc${d}`).join(' | ')} |
|--------|${Array.from(citedDocs).map(() => '--------').join('|')}|
| Méthode | [description] [DocX•pY•chunk_Z] | ... |
| Résultat clé | [valeur] [DocX•pY•chunk_Z] | ... |
| Limitation | [limite] [DocX•pY•chunk_Z] | ... |

GÉNÈRE LE TABLEAU:`;

  return { system, user };
}

/**
 * Prompt pour la réparation d'une section invalide
 */
export function buildRepairPrompt(
  originalSection: string,
  validationErrors: string[],
  evidencePack: EvidencePack
): { system: string; user: string } {
  const evidenceContext = formatEvidenceContext(evidencePack);

  const system = `Tu dois corriger une section de revue de littérature qui ne respecte pas les règles académiques.

ERREURS À CORRIGER:
${validationErrors.map(e => `- ${e}`).join('\n')}

RÈGLES:
- Ajouter une citation [DocX • pY • chunk_Z] après chaque affirmation factuelle
- Ajouter une citation après chaque valeur numérique
- Utiliser au moins 3 chunks distincts
- Ne citer chaque chunk qu'une seule fois`;

  const user = `SECTION ORIGINALE:
${originalSection}

EVIDENCE DISPONIBLE:
${evidenceContext}

GÉNÈRE LA SECTION CORRIGÉE (avec toutes les citations nécessaires):`;

  return { system, user };
}

// ==================== HELPERS ====================

function getDocIndex(docId: string): number {
  const docs = state.docs.filter((d: { status: string }) => d.status === 'extracted');
  const idx = docs.findIndex((d: { id: string }) => d.id === docId);
  return idx + 1; // 1-based
}

function getDocByIndex(docIdx: number): any {
  const docs = state.docs.filter((d: { status: string }) => d.status === 'extracted');
  return docs[docIdx - 1]; // Convert to 0-based
}

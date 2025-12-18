/**
 * NarrativeAgent - Generateur de rapport narratif interactif
 * Pipeline: chunks -> outline -> key points -> executive summary -> cross-doc
 */

import { state, addLog } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';
import { repairJSON } from '../llm/jsonRepair.js';
import { 
  extractKeywords, 
  extractNGrams, 
  extractClaims, 
  prepareKeywordsContext,
  identifyThemes 
} from '../utils/keywordExtract.js';
import {
  createEmptyNarrativeReport,
  createEmptyDocumentNarrative,
  createOutlineNode,
  createKeyPoint,
  createEvidenceRef,
  findOutlineNode
} from './NarrativeReport.js';

let currentReport = null;
let navigationState = {
  selectedDocId: null,
  selectedNodeId: null,
  breadcrumb: [],
  searchQuery: ''
};

/**
 * Genere le rapport narratif complet
 */
export async function generateNarrativeReport(onProgress, onComplete) {
  addLog('info', 'NarrativeAgent: Generation du rapport narratif...');

  if (state.docs.length === 0 || state.chunks.length === 0) {
    addLog('warning', 'NarrativeAgent: Aucun document ou chunk disponible');
    onComplete(null);
    return;
  }

  if (!isModelReady('primary')) {
    addLog('warning', 'NarrativeAgent: LLM requis pour ce mode');
    onComplete(null);
    return;
  }

  onProgress(5, 'Initialisation...');

  const report = createEmptyNarrativeReport();
  
  // Corpus stats
  report.corpus.doc_count = state.docs.length;
  report.corpus.chunk_count = state.chunks.length;
  report.corpus.language = detectLanguage();
  
  onProgress(10, 'Extraction des themes...');
  
  // Themes globaux
  const themes = identifyThemes(8);
  report.corpus.top_themes = themes.map((t, i) => ({
    label: t.main,
    score: 1 - (i * 0.1)
  }));

  onProgress(20, 'Analyse des documents...');

  // Generer DocumentNarrative pour chaque document
  const chunksByDoc = groupChunksByDocument();
  const docIds = Object.keys(chunksByDoc);
  
  for (let i = 0; i < docIds.length; i++) {
    const docId = docIds[i];
    const doc = state.docs.find(d => d.id === docId);
    const chunks = chunksByDoc[docId];
    
    onProgress(20 + Math.floor((i / docIds.length) * 40), `Analyse: ${doc?.displayName || doc?.filename}...`);
    
    const docNarrative = await generateDocumentNarrative(doc, chunks);
    report.documents.push(docNarrative);
  }

  onProgress(65, 'Generation du resume executif...');
  
  // Executive summary
  report.executive_summary = await generateExecutiveSummary(report);

  onProgress(80, 'Analyse croisee...');
  
  // Cross-doc analysis
  report.cross_doc = await generateCrossDocAnalysis(report);

  onProgress(95, 'Finalisation...');

  report.generated_at = new Date().toISOString();
  currentReport = report;

  onProgress(100, 'Termine');
  onComplete(report);

  addLog('success', 'NarrativeAgent: Rapport genere');
  
  // Dispatch event pour UI
  window.dispatchEvent(new CustomEvent('narrative:reportReady', { detail: report }));
  
  return report;
}

/**
 * Detecte la langue dominante
 */
function detectLanguage() {
  const text = state.chunks.slice(0, 10).map(c => c.text).join(' ').toLowerCase();
  const frWords = ['le', 'la', 'les', 'de', 'du', 'des', 'et', 'est', 'sont', 'dans'];
  const enWords = ['the', 'a', 'an', 'of', 'and', 'is', 'are', 'in', 'to', 'for'];
  
  const frCount = frWords.filter(w => text.includes(` ${w} `)).length;
  const enCount = enWords.filter(w => text.includes(` ${w} `)).length;
  
  return frCount > enCount ? 'fr' : 'en';
}

/**
 * Regroupe les chunks par document
 */
function groupChunksByDocument() {
  const groups = {};
  state.chunks.forEach(chunk => {
    const docId = chunk.docId;
    if (!groups[docId]) groups[docId] = [];
    groups[docId].push(chunk);
  });
  return groups;
}

/**
 * Genere le DocumentNarrative pour un document
 */
async function generateDocumentNarrative(doc, chunks) {
  const docTitle = doc?.displayName || doc?.filename?.replace(/\.pdf$/i, '') || 'Document';
  const narrative = createEmptyDocumentNarrative(doc?.id || 'unknown', docTitle);

  // Extraire texte complet
  const fullText = chunks.map(c => c.text).join('\n\n');
  
  // Keywords et claims
  const keywords = extractKeywords(fullText, 15);
  const claims = extractClaims(fullText, 8);
  const ngrams = extractNGrams(fullText, 2, 10);

  // Construire outline
  narrative.outline = buildOutline(chunks, docTitle);

  // Generer resume avec LLM
  try {
    const summaryPrompt = `Analyse ce document academique et genere un JSON structure.

Titre: ${docTitle}
Mots-cles: ${keywords.join(', ')}
Concepts: ${ngrams.join(', ')}

Extrait (premiers chunks):
${chunks.slice(0, 5).map(c => c.text.substring(0, 500)).join('\n---\n')}

Genere un JSON avec:
{
  "one_liner": "Resume en une phrase (max 100 chars)",
  "abstract": "Resume en 8-12 lignes",
  "key_points": [
    {"label": "Point cle", "explanation": "Explication 1-2 phrases", "type": "key_point"}
  ],
  "definitions": [
    {"label": "Terme", "explanation": "Definition", "type": "definition"}
  ],
  "methods": [
    {"label": "Methode", "explanation": "Description", "type": "method"}
  ],
  "limitations": [
    {"label": "Limite", "explanation": "Description", "type": "limitation"}
  ]
}

Reponds UNIQUEMENT avec le JSON valide.`;

    const response = await generateCompletion([
      { role: 'system', content: 'Tu es un analyste de recherche. Genere des JSON structures et precis.' },
      { role: 'user', content: summaryPrompt }
    ], { temperature: 0.3, max_tokens: 1500 });

    const parsed = repairJSON(response);
    if (parsed) {
      narrative.doc_summary.one_liner = parsed.one_liner || '';
      narrative.doc_summary.abstract = parsed.abstract || '';
      
      // Key points avec evidence
      if (parsed.key_points) {
        narrative.doc_summary.key_points = parsed.key_points.map(kp => {
          const point = createKeyPoint(kp.label, kp.explanation, 'key_point');
          point.evidence = findEvidenceForClaim(kp.explanation, chunks);
          return point;
        });
      }
      
      if (parsed.definitions) {
        narrative.doc_summary.definitions = parsed.definitions.map(d => {
          const point = createKeyPoint(d.label, d.explanation, 'definition');
          point.evidence = findEvidenceForClaim(d.explanation, chunks);
          return point;
        });
      }
      
      if (parsed.methods) {
        narrative.doc_summary.methods_or_frameworks = parsed.methods.map(m => {
          const point = createKeyPoint(m.label, m.explanation, 'method');
          point.evidence = findEvidenceForClaim(m.explanation, chunks);
          return point;
        });
      }
      
      if (parsed.limitations) {
        narrative.doc_summary.limitations = parsed.limitations.map(l => {
          const point = createKeyPoint(l.label, l.explanation, 'limitation');
          point.evidence = findEvidenceForClaim(l.explanation, chunks);
          return point;
        });
      }
    }
  } catch (error) {
    addLog('warning', `NarrativeAgent: Erreur LLM pour ${docTitle}: ${error.message}`);
    // Fallback basique
    narrative.doc_summary.one_liner = `Document sur ${keywords.slice(0, 3).join(', ')}`;
    narrative.doc_summary.abstract = `Ce document aborde les themes suivants: ${keywords.slice(0, 8).join(', ')}.`;
  }

  // Recommended quotes
  narrative.doc_summary.recommended_quotes = claims.slice(0, 5).map(claim => {
    const chunk = findChunkContaining(claim, chunks);
    return {
      quote: claim,
      source: {
        doc_title: docTitle,
        page: chunk?.page || null,
        section: chunk?.section || null,
        chunk_id: chunk?.id || ''
      }
    };
  });

  // Stats
  narrative.stats.coverage_score = Math.min(1, chunks.length / 20);
  narrative.stats.importance_score = Math.min(1, keywords.length / 15);

  return narrative;
}

/**
 * Construit l'outline hierarchique a partir des chunks
 */
function buildOutline(chunks, docTitle) {
  const outline = [];
  
  // Detecter les sections par heuristique
  const sections = detectSections(chunks);
  
  if (sections.length === 0) {
    // Fallback: creer des sections par groupe de chunks
    const chunkGroups = groupChunksIntoSections(chunks, 5);
    chunkGroups.forEach((group, i) => {
      const node = createOutlineNode(
        `section-${i}`,
        `Section ${i + 1}`,
        1,
        summarizeChunks(group)
      );
      node.evidence = group.slice(0, 3).map(c => createEvidenceRef(c.id, c.text.substring(0, 300), docTitle));
      outline.push(node);
    });
  } else {
    sections.forEach((section, i) => {
      const node = createOutlineNode(
        `section-${i}`,
        section.title,
        section.level,
        summarizeChunks(section.chunks)
      );
      node.evidence = section.chunks.slice(0, 3).map(c => 
        createEvidenceRef(c.id, c.text.substring(0, 300), docTitle)
      );
      
      // Sous-sections
      if (section.chunks.length > 3) {
        const subGroups = groupChunksIntoSections(section.chunks, 3);
        subGroups.forEach((subGroup, j) => {
          const subNode = createOutlineNode(
            `section-${i}-${j}`,
            `Sous-section ${j + 1}`,
            section.level + 1,
            summarizeChunks(subGroup)
          );
          subNode.evidence = subGroup.slice(0, 2).map(c => 
            createEvidenceRef(c.id, c.text.substring(0, 200), docTitle)
          );
          node.children.push(subNode);
        });
      }
      
      outline.push(node);
    });
  }
  
  return outline;
}

/**
 * Detecte les sections dans les chunks
 */
function detectSections(chunks) {
  const sections = [];
  let currentSection = null;
  
  // Patterns de titres de section
  const sectionPatterns = [
    /^(?:chapter|chapitre)\s*\d+[.:]/i,
    /^(?:\d+\.)+\s*[A-Z]/,
    /^(?:introduction|conclusion|abstract|resume|methode|method|results|resultats|discussion)/i,
    /^[A-Z][A-Z\s]{10,}$/  // Lignes en majuscules
  ];
  
  chunks.forEach(chunk => {
    const firstLine = chunk.text.split('\n')[0].trim();
    const isTitle = sectionPatterns.some(p => p.test(firstLine));
    
    if (isTitle || (chunk.text.length < 200 && /^[A-Z]/.test(firstLine))) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: firstLine.substring(0, 60),
        level: 1,
        chunks: [chunk]
      };
    } else if (currentSection) {
      currentSection.chunks.push(chunk);
    } else {
      currentSection = {
        title: 'Introduction',
        level: 1,
        chunks: [chunk]
      };
    }
  });
  
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Groupe les chunks en sections de taille fixe
 */
function groupChunksIntoSections(chunks, groupSize) {
  const groups = [];
  for (let i = 0; i < chunks.length; i += groupSize) {
    groups.push(chunks.slice(i, i + groupSize));
  }
  return groups;
}

/**
 * Resume un groupe de chunks
 */
function summarizeChunks(chunks) {
  if (chunks.length === 0) return '';
  
  // Prendre la premiere phrase significative
  const text = chunks[0].text;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  if (sentences.length > 0) {
    return sentences[0].trim().substring(0, 150) + '.';
  }
  
  return text.substring(0, 150) + '...';
}

/**
 * Trouve evidence pour un claim
 */
function findEvidenceForClaim(claim, chunks) {
  const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  
  const scored = chunks.map(chunk => {
    const chunkWords = chunk.text.toLowerCase();
    const matches = claimWords.filter(w => chunkWords.includes(w)).length;
    return { chunk, score: matches / claimWords.length };
  }).filter(s => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  
  return scored.map(s => createEvidenceRef(
    s.chunk.id,
    s.chunk.text.substring(0, 300),
    s.chunk.source || 'Document'
  ));
}

/**
 * Trouve le chunk contenant un texte
 */
function findChunkContaining(text, chunks) {
  const words = text.toLowerCase().split(/\s+/).slice(0, 5);
  return chunks.find(c => words.every(w => c.text.toLowerCase().includes(w)));
}

/**
 * Genere le resume executif
 */
async function generateExecutiveSummary(report) {
  const docSummaries = report.documents.map(d => 
    `- ${d.doc_title}: ${d.doc_summary.one_liner}`
  ).join('\n');
  
  const themes = report.corpus.top_themes.map(t => t.label).join(', ');

  try {
    const prompt = `Genere un resume executif pour cette collection de documents.

Documents analyses:
${docSummaries}

Themes principaux: ${themes}
Nombre de documents: ${report.corpus.doc_count}

Genere un JSON:
{
  "title": "Titre du rapport (10 mots max)",
  "summary": "Resume global en 10-15 lignes",
  "key_takeaways": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "open_questions": ["Question 1", "Question 2", "Question 3"],
  "recommended_next_steps": ["Action 1", "Action 2", "Action 3"]
}

JSON uniquement.`;

    const response = await generateCompletion([
      { role: 'system', content: 'Tu es un consultant senior. Genere des resumes executifs clairs et actionnables.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.4, max_tokens: 1000 });

    const parsed = repairJSON(response);
    if (parsed) {
      return {
        title: parsed.title || 'Rapport Narratif',
        summary: parsed.summary || '',
        key_takeaways: parsed.key_takeaways || [],
        open_questions: parsed.open_questions || [],
        recommended_next_steps: parsed.recommended_next_steps || []
      };
    }
  } catch (error) {
    addLog('warning', `NarrativeAgent: Erreur executive summary: ${error.message}`);
  }

  // Fallback
  return {
    title: 'Rapport Narratif',
    summary: `Ce rapport analyse ${report.corpus.doc_count} documents couvrant les themes: ${themes}.`,
    key_takeaways: report.documents.map(d => d.doc_summary.one_liner).slice(0, 5),
    open_questions: [],
    recommended_next_steps: []
  };
}

/**
 * Genere l'analyse croisee
 */
async function generateCrossDocAnalysis(report) {
  if (report.documents.length < 2) {
    return { agreements: [], tensions: [], gaps: [] };
  }

  const docKeyPoints = report.documents.map(d => ({
    title: d.doc_title,
    points: d.doc_summary.key_points.map(kp => kp.label).join(', ')
  }));

  try {
    const prompt = `Compare ces documents et identifie convergences, divergences et lacunes.

Documents:
${docKeyPoints.map(d => `- ${d.title}: ${d.points}`).join('\n')}

Genere un JSON:
{
  "agreements": [
    {"label": "Theme commun", "explanation": "Description", "involved_docs": ["Doc1", "Doc2"]}
  ],
  "tensions": [
    {"label": "Point de divergence", "explanation": "Description", "involved_docs": ["Doc1", "Doc2"]}
  ],
  "gaps": [
    {"label": "Lacune identifiee", "explanation": "Ce qui manque"}
  ]
}

JSON uniquement.`;

    const response = await generateCompletion([
      { role: 'system', content: 'Tu analyses des documents academiques. Identifie convergences et divergences.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 800 });

    const parsed = repairJSON(response);
    if (parsed) {
      const formatItems = (items) => (items || []).map((item, i) => ({
        id: `cross-${i}`,
        label: item.label || '',
        explanation: item.explanation || '',
        involved_docs: item.involved_docs || [],
        evidence: []
      }));

      return {
        agreements: formatItems(parsed.agreements),
        tensions: formatItems(parsed.tensions),
        gaps: formatItems(parsed.gaps)
      };
    }
  } catch (error) {
    addLog('warning', `NarrativeAgent: Erreur cross-doc: ${error.message}`);
  }

  return { agreements: [], tensions: [], gaps: [] };
}

/**
 * Regenere le resume d'une section specifique
 */
export async function regenerateSection(docId, nodeId) {
  if (!currentReport || !isModelReady('primary')) return null;

  const doc = currentReport.documents.find(d => d.doc_id === docId);
  if (!doc) return null;

  const node = findOutlineNode(doc.outline, nodeId);
  if (!node) return null;

  const evidenceText = node.evidence.map(e => e.excerpt).join('\n\n');

  try {
    const prompt = `Resume ce contenu en 2-3 phrases claires et precises:

Section: ${node.title}

Contenu:
${evidenceText}

Resume:`;

    const response = await generateCompletion([
      { role: 'system', content: 'Tu resumes des textes academiques de facon concise.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 200 });

    node.summary = response.trim();
    
    window.dispatchEvent(new CustomEvent('narrative:sectionUpdated', { 
      detail: { docId, nodeId, summary: node.summary } 
    }));

    return node.summary;
  } catch (error) {
    addLog('warning', `NarrativeAgent: Erreur regeneration: ${error.message}`);
    return null;
  }
}

/**
 * Getters
 */
export function getNarrativeReport() {
  return currentReport;
}

export function getNavigationState() {
  return navigationState;
}

export function setNavigationState(newState) {
  navigationState = { ...navigationState, ...newState };
  window.dispatchEvent(new CustomEvent('narrative:navigationChanged', { detail: navigationState }));
}

// Event listener pour generation
window.addEventListener('viz:generate', async (e) => {
  if (e.detail.agent.id === 'scrolly' || e.detail.agent.id === 'narrative') {
    await generateNarrativeReport(e.detail.onProgress, e.detail.onComplete);
  }
});


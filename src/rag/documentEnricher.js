/**
 * Document Enricher - Extraction de 9 parametres structures par document
 * Utilise le LLM charge pour analyser les chunks et extraire les metadonnees
 */

import { state, addLog, updateDocumentMetadata } from '../state/state.js';
import { generateCompletion, isModelReady, getLoadedModel } from '../llm/webllm.js';
import { generateDocumentRAGSummary } from './documentRAGSummary.js';

/**
 * Schema des 9 parametres a extraire
 */
export const ENRICHMENT_SCHEMA = {
  title: "Titre exact du document",
  authors: "Liste des auteurs",
  year: "Annee de publication (nombre ou null)",
  domain: "Domaine/discipline scientifique",
  abstract: "Resume court (max 100 mots)",
  keywords: "5-10 mots-cles principaux",
  research_question: "Question de recherche principale",
  methodology: "Methodologie utilisee",
  key_findings: "Resultats cles / conclusions"
};

/**
 * Prompt systeme pour l'extraction
 */
const ENRICHMENT_SYSTEM_PROMPT = `Tu es un expert en extraction de metadonnees scientifiques.
Analyse le texte fourni et extrait les informations demandees en JSON valide.
Si une information n'est pas trouvee, utilise null.
Reponds UNIQUEMENT avec le JSON, sans texte avant ou apres.`;

/**
 * Construit le prompt d'extraction
 */
function buildEnrichmentPrompt(textContent, filename, ragSummary = null) {
  let contextSection = '';
  
  if (ragSummary && ragSummary.summaryText) {
    contextSection = `\n\nSYNTHESE RAG DU DOCUMENT (pour contexte):
${ragSummary.summaryText.substring(0, 800)}
\n---\n`;
  }

  return `Document: ${filename}
${contextSection}
Extrait ces 9 informations en JSON:
{
  "title": "titre exact ou null",
  "authors": ["auteur1", "auteur2"] ou [],
  "year": 2024 ou null,
  "domain": "domaine scientifique",
  "abstract": "resume en 1-2 phrases",
  "keywords": ["mot1", "mot2", "mot3"],
  "research_question": "question de recherche principale",
  "methodology": "methode utilisee",
  "key_findings": "resultats principaux"
}

TEXTE A ANALYSER:
${textContent.substring(0, 4000)}

JSON:`;
}

/**
 * Enrichit un document avec les 9 parametres
 * @param {string} docId - ID du document
 * @param {Function} onProgress - Callback de progression
 * @returns {Promise<object>} - Les metadonnees extraites
 */
export async function enrichDocument(docId, onProgress = null) {
  if (!isModelReady()) {
    throw new Error('Modele LLM non charge');
  }

  const doc = state.docs.find(d => d.id === docId);
  if (!doc) {
    throw new Error(`Document non trouve: ${docId}`);
  }

  if (!doc.extractedText) {
    throw new Error(`Texte non extrait pour: ${doc.filename}`);
  }

  addLog('info', `Enrichissement: ${doc.filename}`);
  onProgress?.({ status: 'extracting', message: `Analyse de ${doc.filename}...` });

  try {
    // Générer mini synthèse RAG pour améliorer l'enrichissement
    let ragSummary = null;
    try {
      onProgress?.({ status: 'rag_summary', message: `Synthèse RAG pour ${doc.filename}...` });
      ragSummary = await generateDocumentRAGSummary(docId);
    } catch (ragError) {
      addLog('warning', `Synthèse RAG échouée pour ${doc.filename}, continuation sans RAG: ${ragError.message}`);
      // Continue sans RAG si échec
    }

    const prompt = buildEnrichmentPrompt(doc.extractedText, doc.filename, ragSummary);
    
    let response = '';
    const result = await generateCompletion(
      [
        { role: 'system', content: ENRICHMENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.1, max_tokens: 800 },
      (token, full) => {
        response = full;
        onProgress?.({ status: 'generating', partial: full });
      },
      'primary'
    );

    // Parser le JSON
    let parsed;
    try {
      // Nettoyer la reponse
      let jsonStr = result.trim();
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      addLog('warning', `Parsing JSON echoue pour ${doc.filename}, extraction minimale`);
      parsed = extractMinimalMetadata(doc);
    }

    // Valider et normaliser
    const enrichment = normalizeEnrichment(parsed, doc);

    // Sauvegarder dans le document
    doc.enrichment = enrichment;
    doc.enrichedAt = new Date().toISOString();

    // Mettre a jour les metadonnees existantes
    updateDocumentMetadata(docId, {
      summary: enrichment.abstract,
      subject: enrichment.domain,
      type: 'research_paper'
    }, 'ai');

    addLog('success', `Enrichi: ${doc.filename}`);
    onProgress?.({ status: 'complete', enrichment });

    // Emettre un evenement
    window.dispatchEvent(new CustomEvent('document:enriched', { 
      detail: { docId, enrichment } 
    }));

    return enrichment;

  } catch (error) {
    addLog('error', `Erreur enrichissement ${doc.filename}: ${error.message}`);
    onProgress?.({ status: 'error', error: error.message });
    throw error;
  }
}

/**
 * Enrichit tous les documents extraits
 * @param {Function} onProgress - Callback de progression
 * @returns {Promise<object[]>} - Liste des enrichissements
 */
export async function enrichAllDocuments(onProgress = null) {
  const docs = state.docs.filter(d => d.status === 'extracted' && !d.enrichment);
  
  if (docs.length === 0) {
    addLog('info', 'Aucun document a enrichir');
    return [];
  }

  const results = [];
  
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    onProgress?.({
      status: 'processing',
      current: i + 1,
      total: docs.length,
      filename: doc.filename
    });

    try {
      const enrichment = await enrichDocument(doc.id, (progress) => {
        onProgress?.({
          ...progress,
          current: i + 1,
          total: docs.length
        });
      });
      results.push({ docId: doc.id, enrichment });
    } catch (error) {
      results.push({ docId: doc.id, error: error.message });
    }
  }

  onProgress?.({ status: 'complete', results });
  return results;
}

/**
 * Extraction minimale si le LLM echoue
 */
function extractMinimalMetadata(doc) {
  const text = doc.extractedText || '';
  
  // Extraire l'annee
  const yearMatch = text.match(/\b(19[89]\d|20[0-2]\d)\b/);
  
  // Extraire des mots-cles simples (mots frequents de plus de 6 caracteres)
  const words = text.toLowerCase().match(/\b[a-z]{6,}\b/g) || [];
  const wordFreq = {};
  words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);
  const keywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    title: doc.filename.replace('.pdf', '').replace(/_/g, ' '),
    authors: [],
    year: yearMatch ? parseInt(yearMatch[1]) : null,
    domain: null,
    abstract: text.substring(0, 200) + '...',
    keywords: keywords,
    research_question: null,
    methodology: null,
    key_findings: null
  };
}

/**
 * Normalise et valide l'enrichissement
 */
function normalizeEnrichment(parsed, doc) {
  return {
    title: parsed.title || doc.filename.replace('.pdf', ''),
    authors: Array.isArray(parsed.authors) ? parsed.authors : [],
    year: typeof parsed.year === 'number' ? parsed.year : null,
    domain: parsed.domain || null,
    abstract: parsed.abstract || null,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [],
    research_question: parsed.research_question || null,
    methodology: parsed.methodology || null,
    key_findings: parsed.key_findings || null
  };
}

/**
 * Verifie si un document est enrichi
 */
export function isDocumentEnriched(docId) {
  const doc = state.docs.find(d => d.id === docId);
  return doc && doc.enrichment !== undefined;
}

/**
 * Recupere l'enrichissement d'un document
 */
export function getDocumentEnrichment(docId) {
  const doc = state.docs.find(d => d.id === docId);
  return doc?.enrichment || null;
}

/**
 * Compte les documents enrichis
 */
export function getEnrichmentStats() {
  const total = state.docs.filter(d => d.status === 'extracted').length;
  const enriched = state.docs.filter(d => d.enrichment).length;
  return { total, enriched, pending: total - enriched };
}

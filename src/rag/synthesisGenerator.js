/**
 * Génération de la synthèse finale - PROMPT ACADÉMIQUE RIGOUREUX
 * Rassemble TOUTES les analyses des documents ingérés avec structure académique stricte
 */

import { generateCompletion, isModelReady, getLoadedModel } from '../llm/webllm.js';
import { addLog, state } from '../state/state.js';

// ==================== EXTRACTION DES DONNÉES ====================

/**
 * Extrait les données d'une fiche JSON d'analyse de document
 */
function extractAllDocData(doc, docIndex) {
  const p = doc.parsed || {};
  
  // Parser si nécessaire
  if (!p.doc_id && doc.review) {
    try {
      const parsed = JSON.parse(doc.review);
      Object.assign(p, parsed);
    } catch (e) {
      // Ignorer si pas du JSON
    }
  }
  
  return {
    docNum: docIndex,
    doc_id: p.doc_id || `doc_${docIndex}`,
    title: p.title || 'not found',
    year: p.year || 'not found',
    domain: p.domain || 'not found',
    authors: Array.isArray(p.authors) ? p.authors : (p.authors !== 'not found' && p.authors ? [p.authors] : []),
    research_question: p.research_question || 'not found',
    methodology: Array.isArray(p.methodology) ? p.methodology : (p.methodology ? [p.methodology] : []),
    key_results: Array.isArray(p.key_results) ? p.key_results : (p.key_results ? [p.key_results] : []),
    limitations: Array.isArray(p.limitations) ? p.limitations : (p.limitations ? [p.limitations] : []),
    citations_used: p.citations_used || []
  };
}


// ==================== GÉNÉRATION DU PROMPT ====================

/**
 * Construit le prompt de synthèse finale utilisant les fiches JSON
 */
function buildLiterarySynthesisPrompt(documentAnalyses, cohesionAnalysis) {
  // Extraire les fiches JSON
  const allDocsData = documentAnalyses.map((doc, idx) => {
    // Parser le JSON si nécessaire
    if (!doc.parsed && doc.review) {
      try {
        doc.parsed = JSON.parse(doc.review);
      } catch (e) {
        doc.parsed = {};
      }
    }
    return extractAllDocData(doc, idx + 1);
  });
  
  const numDocs = allDocsData.length;
  
  addLog('info', `[Synthèse finale] ${numDocs} documents`);
  
  // Formater les fiches JSON pour le prompt
  const jsonSummaries = allDocsData.map(doc => {
    return JSON.stringify({
      doc_id: doc.doc_id,
      title: doc.title,
      year: doc.year,
      authors: doc.authors,
      domain: doc.domain,
      research_question: doc.research_question,
      methodology: doc.methodology,
      key_results: doc.key_results,
      limitations: doc.limitations
    }, null, 2);
  }).join('\n\n---\n\n');
  
  const systemPrompt = `You are an Academic Researcher. Use ONLY the document JSON summaries below. Do not invent links or numbers.`;

  const userPrompt = `Write a concise literature review with:
1) Introduction (2-4 sentences)
2) Body:
- If documents share a common topic: compare methods and results.
- Otherwise: PORTFOLIO mode (one short subsection per document: contribution, method, key results).
3) Conclusion (2-4 sentences: gaps + future work)

Every key claim must cite like [doc_id].
No made-up statistics.

Document summaries:
${jsonSummaries}`;

  return { 
    system: systemPrompt, 
    user: userPrompt, 
    mode: 'simple',
    stats: { numDocs }
  };
}

// ==================== FONCTION PRINCIPALE ====================

/**
 * Génère la revue finale - Assemblage académique rigoureux
 */
export async function generateFinalReview(documentAnalyses, cohesionAnalysis, onStreaming = null) {
  if (!isModelReady()) {
    throw new Error('Modèle LLM non chargé');
  }

  const { system, user, mode, stats } = buildLiterarySynthesisPrompt(documentAnalyses, cohesionAnalysis);
  
  addLog('info', `Génération synthèse académique (${stats.numDocs} docs, ${stats.totalMetrics} métriques, ${stats.totalChunks} chunks estimés)`);

  try {
    const result = await callLLM(system, user, onStreaming);
    
    return {
      text: result,
      mode: mode,
      cohesionScore: cohesionAnalysis?.score || 0,
      documentCount: stats.numDocs,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    addLog('error', `Erreur génération synthèse: ${error.message}`);
    throw error;
  }
}

/**
 * Appel LLM avec timeout
 */
async function callLLM(systemPrompt, userPrompt, onStreaming = null, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout après ${timeoutMs}ms`));
    }, timeoutMs);

    generateCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      {
        temperature: 0.2, // Faible pour synthèse précise
        max_tokens: 1500  // Réduit pour synthèse simple
      },
      onStreaming || (() => {}),
      'primary'
    )
      .then(result => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

// Export pour debug
export { buildLiterarySynthesisPrompt, extractAllDocData };

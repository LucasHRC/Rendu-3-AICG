/**
 * Templates de prompts optimisés pour modèles LLM faibles (LLaMA 3B) et forts (Qwen)
 * Version améliorée avec extraction rigoureuse de chiffres et citations
 */

/**
 * Format enrichi des chunks pour prompts - inclut plus de contexte
 */
function formatChunksSimple(chunks) {
  return chunks.map((chunk, idx) => 
    `[CHUNK_${idx}] Page ${chunk.page}:
${chunk.text}
---END_CHUNK_${idx}---`
  ).join('\n\n');
}

/**
 * Prompt d'extraction par document - JSON strict (LLaMA 3B friendly)
 */
export const DOCUMENT_ANALYSIS_PROMPT = {
  system: `You are an academic assistant. Extract ONLY from the provided context. If missing, write "not found". Return JSON only.`,
  
  user: (docId, chunks, enrichment = null) => {
    const chunksText = chunks.map((chunk, idx) => 
      `[chunk_${idx}|p${chunk.page}]:\n${chunk.text}`
    ).join('\n\n');
    
    return `Extract from this document context. If information is missing, write "not found".

Return a JSON object with:
- doc_id: "${docId}"
- title
- year (number or "not found")
- authors (array or "not found")
- domain
- research_question (1 sentence)
- methodology (3 bullets max)
- key_results (3 bullets max, include numbers if present)
- limitations (2 bullets max or "not found")
- citations_used: list of {chunk_id, page}

Context:
${chunksText}

JSON:`;
  }
};




/**
 * Sélectionne le template d'analyse (unifié pour tous les modèles)
 * @param {Object} modelId - Modèle chargé
 * @param {string} docId - ID du document
 * @param {Array} chunks - Chunks du document
 * @param {Object} enrichment - Données d'enrichissement (optionnel)
 */
export function getDocumentAnalysisPrompt(modelId, docId, chunks, enrichment = null) {
  return {
    system: DOCUMENT_ANALYSIS_PROMPT.system,
    user: DOCUMENT_ANALYSIS_PROMPT.user(docId, chunks, enrichment)
  };
}

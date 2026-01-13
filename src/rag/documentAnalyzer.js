/**
 * Analyse structurée par document - Format JSON enrichi
 */

import { state } from '../state/state.js';
import { generateCompletion, isModelReady, getLoadedModel } from '../llm/webllm.js';
import { addLog } from '../state/state.js';
import { getDocumentAnalysisPrompt } from './promptTemplates.js';

/**
 * Prépare les chunks d'un document pour l'analyse (TopK intra-doc)
 * Priorise page 1 + abstract + conclusion
 */
function prepareDocumentChunks(doc) {
  const allChunks = state.chunks.filter(chunk => chunk.docId === doc.id);

  if (allChunks && allChunks.length > 0) {
    const selectedChunks = [];
    const usedIndices = new Set();
    const TopK = 5; // TopK chunks par document

    // 1. PAGE 1 (titre, auteurs, abstract) - PRIORITÉ ABSOLUE
    const page1Chunks = allChunks
      .filter(chunk => {
        const page = parseInt(chunk.page) || parseInt(chunk.metadata?.page) || 999;
        return page === 1;
      })
      .sort((a, b) => {
        const pageA = parseInt(a.page) || parseInt(a.metadata?.page) || 999;
        const pageB = parseInt(b.page) || parseInt(b.metadata?.page) || 999;
        return pageA - pageB;
      })
      .slice(0, 2); // Max 2 chunks de la page 1

    page1Chunks.forEach(chunk => {
      selectedChunks.push(chunk);
      usedIndices.add(chunk.chunkIndex || chunk.id);
    });

    // 2. ABSTRACT (chercher dans les premiers chunks)
    const abstractChunks = allChunks
      .filter(chunk => !usedIndices.has(chunk.chunkIndex || chunk.id))
      .filter(chunk => {
        const text = (chunk.text || chunk.content || '').toLowerCase();
        return text.includes('abstract') || text.includes('résumé') || text.includes('summary');
      })
      .slice(0, 1);

    abstractChunks.forEach(chunk => {
      selectedChunks.push(chunk);
      usedIndices.add(chunk.chunkIndex || chunk.id);
    });

    // 3. CONCLUSION (chercher dans les derniers chunks)
    const conclusionChunks = allChunks
      .filter(chunk => !usedIndices.has(chunk.chunkIndex || chunk.id))
      .filter(chunk => {
        const text = (chunk.text || chunk.content || '').toLowerCase();
        return text.includes('conclusion') || text.includes('discussion') || text.includes('summary');
      })
      .slice(0, 1);

    conclusionChunks.forEach(chunk => {
      selectedChunks.push(chunk);
      usedIndices.add(chunk.chunkIndex || chunk.id);
    });

    // 4. COMPLÉTER JUSQU'À TopK avec chunks restants (par ordre de page)
    const remainingChunks = allChunks
      .filter(chunk => !usedIndices.has(chunk.chunkIndex || chunk.id))
      .sort((a, b) => {
        const pageA = parseInt(a.page) || parseInt(a.metadata?.page) || 999;
        const pageB = parseInt(b.page) || parseInt(b.metadata?.page) || 999;
        return pageA - pageB;
      })
      .slice(0, TopK - selectedChunks.length);

    remainingChunks.forEach(chunk => {
      selectedChunks.push(chunk);
    });

    // FORMATAGE FINAL: TopK chunks max
    return selectedChunks.slice(0, TopK).map((chunk, idx) => ({
      id: `chunk_${idx}`,
      chunk_id: `chunk_${idx}`,
      originalIndex: chunk.chunkIndex || idx,
      page: chunk.page || chunk.metadata?.page || '?',
      text: truncateChunkText(chunk.text || chunk.content || '', 400)
    }));
  }

  // Fallback si pas de chunks
  return [{
    id: 'chunk_0',
    chunk_id: 'chunk_0',
    originalIndex: 0,
    page: '1',
    text: doc.content || doc.text || 'Contenu non disponible'
  }];
}


/**
 * Tronque le texte d'un chunk pour limiter la taille du prompt
 */
function truncateChunkText(text, maxLength = 500) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  if (lastSpaceIndex > maxLength * 0.8) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }

  return truncated + '...';
}

/**
 * Analyse un document et produit une synthèse textuelle simple
 * @param {Object} doc - Document à analyser
 * @param {Function} onStreaming - Callback pour streaming
 * @returns {Promise<Object>} - Résultat avec synthèse textuelle et métadonnées
 */
export async function analyzeDocument(doc, onStreaming = null) {
  if (!isModelReady()) {
    throw new Error('Modèle LLM non chargé');
  }

  const modelId = getLoadedModel();
  const chunks = prepareDocumentChunks(doc);
  const docId = doc.id || doc.filename.replace(/[^a-zA-Z0-9]/g, '_');

  addLog('info', `Analyse document: ${doc.filename} (${chunks.length} chunks)`);

  // Obtenir le prompt d'extraction JSON
  const prompt = getDocumentAnalysisPrompt(modelId, docId, chunks, null);

  // Appel LLM avec retry si necessaire
  let attempts = 0;
  const maxAttempts = 2;
  let lastError = null;
  let parsed = null;

  while (attempts < maxAttempts) {
    try {
      const result = await callLLM(prompt.system, prompt.user, onStreaming);
      const resultText = result.trim();
      
      // Parser le JSON
      try {
        // Nettoyer le JSON (enlever texte avant/premier { et après dernier })
        let cleaned = resultText.trim();
        const firstBrace = cleaned.indexOf('{');
        if (firstBrace > 0) cleaned = cleaned.substring(firstBrace);
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
          cleaned = cleaned.substring(0, lastBrace + 1);
        }
        
        parsed = JSON.parse(cleaned);
        
        // S'assurer que doc_id est présent
        if (!parsed.doc_id) parsed.doc_id = docId;
        
        // Normaliser les champs (arrays pour authors, methodology, key_results, limitations)
        if (parsed.authors && typeof parsed.authors === 'string') {
          parsed.authors = parsed.authors.includes(',') ? parsed.authors.split(',').map(a => a.trim()) : [parsed.authors];
        }
        if (parsed.methodology && typeof parsed.methodology === 'string') {
          parsed.methodology = [parsed.methodology];
        }
        if (parsed.key_results && typeof parsed.key_results === 'string') {
          parsed.key_results = [parsed.key_results];
        }
        if (parsed.limitations && typeof parsed.limitations === 'string') {
          parsed.limitations = [parsed.limitations];
        }
        if (!parsed.citations_used) parsed.citations_used = [];

        return {
          filename: doc.filename,
          review: JSON.stringify(parsed, null, 2),
          parsed: parsed,
          timestamp: new Date().toISOString(),
          validation: { isValid: true, quality: 'medium', warnings: [] }
        };

      } catch (parseError) {
        addLog('warning', `Erreur parsing JSON: ${parseError.message}`);
        attempts++;
        continue;
      }

    } catch (error) {
      lastError = error;
      attempts++;
      addLog('warning', `Tentative ${attempts}/${maxAttempts} echouee: ${error.message}`);
    }
  }

  // Fallback: retourner une structure minimale
  addLog('warning', `Analyse minimale pour ${doc.filename} apres ${maxAttempts} echecs`);
  parsed = {
    doc_id: docId,
    title: doc.filename.replace('.pdf', '').replace(/_/g, ' '),
    year: 'not found',
    authors: 'not found',
    domain: 'not found',
    research_question: 'not found',
    methodology: ['not found'],
    key_results: ['not found'],
    limitations: ['not found'],
    citations_used: []
  };
  
  return {
    filename: doc.filename,
    review: JSON.stringify(parsed, null, 2),
    parsed: parsed,
    timestamp: new Date().toISOString(),
    validation: { isValid: true, quality: 'low', warnings: ['Analyse minimale - extraction LLM echouee'] }
  };
}


/**
 * Appel LLM avec timeout
 */
async function callLLM(systemPrompt, userPrompt, onStreaming = null, timeoutMs = 60000) {
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
        temperature: 0.3,
        max_tokens: 500 // Réduit pour synthèse simple et rapide
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

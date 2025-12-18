/**
 * Summarizer - LLM dedie aux resumes structures avec references
 * Utilise Llama 3B pour des generations de qualite
 */

import { addLog } from '../state/state.js';

const SUMMARIZER_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
const SUMMARIZER_SIZE = '2.3 GB';
let summarizerEngine = null;
let isLoading = false;
let isReady = false;

/**
 * Charge le LLM summarizer
 */
export async function initSummarizer(onProgress = () => {}) {
  if (isReady) {
    addLog('info', 'Summarizer deja pret');
    return true;
  }
  
  if (isLoading) {
    addLog('warning', 'Summarizer en cours de chargement...');
    return false;
  }

  if (!navigator.gpu) {
    addLog('error', 'WebGPU non disponible');
    return false;
  }

  isLoading = true;
  addLog('info', 'Chargement du summarizer (Llama 3B)...');

  try {
    let attempts = 0;
    while (!window.webllm && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!window.webllm) {
      throw new Error('WebLLM non charge depuis CDN');
    }

    summarizerEngine = await window.webllm.CreateMLCEngine(SUMMARIZER_MODEL, {
      initProgressCallback: (progress) => {
        const pct = Math.round(progress.progress * 100);
        onProgress(pct, progress.text);
      }
    });

    isLoading = false;
    isReady = true;
    
    window.dispatchEvent(new CustomEvent('summarizer:ready'));
    addLog('success', 'Summarizer pret (Llama 3B)');
    
    return true;

  } catch (error) {
    isLoading = false;
    addLog('error', `Echec summarizer: ${error.message}`);
    return false;
  }
}

export function getSummarizerInfo() {
  return { model: SUMMARIZER_MODEL, size: SUMMARIZER_SIZE };
}

export function isSummarizerReady() {
  return isReady;
}

export function isSummarizerLoading() {
  return isLoading;
}

/**
 * Genere un resume structure avec references
 * @param {string} content - Contenu a resumer
 * @param {Object} context - Contexte (titre, niveau, type, evidence)
 * @param {Function} onToken - Callback streaming
 */
export async function generateSummary(content, context = {}, onToken = () => {}) {
  if (!summarizerEngine) {
    throw new Error('Summarizer non charge');
  }

  const { title = '', level = 'section', docTitle = '', evidence = [] } = context;

  // Prompt ameliore pour resumes structures avec comprehension
  const systemPrompt = `Tu es un expert en analyse documentaire. Tu produis des resumes:

STRUCTURE:
- Commence par identifier le TYPE de document (article, rapport, these, etc.)
- Explique le SUJET principal en 1-2 phrases
- Liste les POINTS CLES (3-5 max) avec puces
- Indique les CONCLUSIONS ou implications

STYLE:
- Langage clair et accessible
- Phrases courtes et directes
- Pas de jargon inutile
- Commence par l'essentiel

REFERENCES:
- Cite les sources avec [Ref:X] ou X est le numero de la source
- Les references doivent pointer vers des passages precis

FORMAT DE SORTIE:
**Type:** [type de document]
**Sujet:** [description en 1-2 phrases]

**Points cles:**
- Point 1 [Ref:1]
- Point 2 [Ref:2]
- ...

**Conclusion:** [implication ou synthese]`;

  // Construire le contexte avec references numerotees
  let contentWithRefs = content.substring(0, 3000);
  let refList = '';
  
  if (evidence.length > 0) {
    refList = '\n\nSOURCES:\n' + evidence.slice(0, 5).map((e, i) => 
      `[${i + 1}] ${e.doc_title || 'Document'}: "${e.excerpt?.substring(0, 100)}..."`
    ).join('\n');
    contentWithRefs += refList;
  }

  const userPrompt = `Analyse et resume ce contenu${title ? ` (${title})` : ''}${docTitle ? ` du document "${docTitle}"` : ''}:

${contentWithRefs}

Resume structure (${level === 'document' ? 'complet' : 'concis'}):`;

  let fullResponse = '';

  try {
    const asyncGenerator = await summarizerEngine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 500,
      top_p: 0.9,
      stream: true
    });

    for await (const chunk of asyncGenerator) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullResponse += delta;
        onToken(delta, fullResponse);
      }
    }

    return fullResponse.trim();

  } catch (error) {
    addLog('error', `Erreur summarizer: ${error.message}`);
    throw error;
  }
}

/**
 * Genere un resume de document complet
 */
export async function summarizeDocument(doc, chunks, onToken = () => {}) {
  const content = chunks.map(c => c.text).join('\n\n').substring(0, 4000);
  const evidence = chunks.slice(0, 5).map(c => ({
    doc_title: doc.displayName || doc.filename,
    excerpt: c.text.substring(0, 150),
    chunk_id: c.id
  }));
  
  return generateSummary(content, {
    title: doc.displayName || doc.filename,
    level: 'document',
    docTitle: doc.displayName || doc.filename,
    evidence
  }, onToken);
}

/**
 * Genere un resume de section/node
 */
export async function summarizeSection(node, onToken = () => {}) {
  const content = node.evidence?.map(e => e.excerpt).join('\n\n') || node.summary || '';
  
  return generateSummary(content, {
    title: node.title,
    level: 'section',
    evidence: node.evidence || []
  }, onToken);
}

/**
 * Reset le chat du summarizer
 */
export async function resetSummarizer() {
  if (summarizerEngine) {
    await summarizerEngine.resetChat();
  }
}

// Debug global
if (typeof window !== 'undefined') {
  window.summarizerModule = {
    initSummarizer,
    isSummarizerReady,
    isSummarizerLoading,
    generateSummary,
    summarizeDocument,
    summarizeSection,
    resetSummarizer,
    getSummarizerInfo
  };
}

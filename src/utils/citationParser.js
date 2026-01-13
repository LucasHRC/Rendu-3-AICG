/**
 * Parsing et formattage des citations pour l'affichage interactif
 * AMÉLIORÉ: Support click pour voir chunk complet
 */

import { state } from '../state/state.js';

/**
 * Remplit les citations dans le texte avec des spans interactifs
 * Support: hover pour highlight, click pour voir chunk complet
 */
export function renderCitationsInteractive(reviewText, citationManager, documentAnalyses) {
  if (!reviewText || !citationManager) {
    return reviewText || '';
  }

  // Stocker les analyses pour accès global
  if (documentAnalyses) {
    window._ragDocumentAnalyses = documentAnalyses;
  }

  // Remplacer chaque citation par un span interactif
  return reviewText.replace(
    /\[Doc(\d+)\s*•\s*p(\d+)\s*•\s*(chunk_\d+)\]/g,
    (match, docIdx, page, chunkId) => {
      const citation = citationManager.getCitationDetails(parseInt(docIdx), chunkId);
      const docIndex = parseInt(docIdx);
      
      // Trouver le document correspondant
      const docAnalysis = documentAnalyses?.[docIndex - 1];
      const filename = docAnalysis?.filename || `Document ${docIndex}`;
      
      if (!citation) {
        // Citation non trouvée dans la map, mais on peut quand même permettre le clic
        return `<span class="citation-interactive citation-unverified inline-block px-1.5 py-0.5 mx-0.5 rounded bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200 transition-colors border border-yellow-300" 
                      data-doc="${docIdx}" 
                      data-page="${page}" 
                      data-chunk="${chunkId}"
                      data-filename="${filename}"
                      title="Citation non verifiee - Cliquez pour voir le chunk"
                      onclick="viewChunkFromCitation(this)"
                      onmouseenter="highlightCitation(this)"
                      onmouseleave="unhighlightCitation(this)">
                  ${match}
                </span>`;
      }
      
      const excerpt = citation.excerpt || '';
      const section = citation.section || 'Unknown';
      const tooltip = `${filename}\nPage ${citation.page}, Section: ${section}\n${excerpt}\n\nCliquez pour voir le chunk complet`;
      
      return `<span class="citation-interactive inline-block px-1.5 py-0.5 mx-0.5 rounded bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200 hover:ring-2 hover:ring-blue-300 transition-all" 
                    data-doc="${docIdx}" 
                    data-page="${page}" 
                    data-chunk="${chunkId}"
                    data-filename="${filename}"
                    data-section="${section}"
                    title="${tooltip.replace(/"/g, '&quot;').replace(/\n/g, '&#10;')}"
                    onclick="viewChunkFromCitation(this)"
                    onmouseenter="highlightCitation(this)"
                    onmouseleave="unhighlightCitation(this)">
                ${match}
              </span>`;
    }
  );
}

/**
 * Extrait toutes les citations d'un texte
 */
export function extractCitations(text) {
  if (!text) return [];
  
  const regex = /\[Doc(\d+)\s*•\s*p(\d+)\s*•\s*(chunk_\d+)\]/g;
  const matches = [...text.matchAll(regex)];
  
  return matches.map(m => ({
    full: m[0],
    docIndex: parseInt(m[1]),
    page: parseInt(m[2]),
    chunkId: m[3],
    position: m.index
  }));
}

/**
 * Fonctions globales pour l'interactivité (attachées à window)
 */
if (typeof window !== 'undefined') {
  
  /**
   * Affiche le chunk complet quand on clique sur une citation
   */
  window.viewChunkFromCitation = function(element) {
    if (!element) return;
    
    const docIdx = parseInt(element.dataset.doc);
    const page = parseInt(element.dataset.page);
    const chunkIdStr = element.dataset.chunk; // ex: "chunk_5"
    const filename = element.dataset.filename || `Document ${docIdx}`;
    const section = element.dataset.section || 'Unknown';
    
    // Extraire l'index du chunk
    const chunkIndex = parseInt(chunkIdStr.replace('chunk_', '')) + 1; // +1 car l'affichage est 1-based
    
    console.log('[CitationParser] View chunk:', { docIdx, page, chunkIdStr, chunkIndex, filename });
    
    // Trouver le document dans state.docs
    const docs = state.docs.filter(d => d.status === 'extracted');
    const doc = docs[docIdx - 1]; // docIdx est 1-based
    
    if (!doc) {
      console.warn('[CitationParser] Document not found at index:', docIdx - 1);
      alert(`Document ${docIdx} non trouvé dans la bibliothèque.`);
      return;
    }
    
    // Construire l'objet source pour showChunkViewer
    const source = {
      docName: doc.filename || filename,
      source: doc.filename || filename,
      docIndex: docIdx,
      chunkIndex: chunkIndex,
      page: page,
      section: section,
      score: null
    };
    
    console.log('[CitationParser] Calling showChunkViewer with:', source);
    
    // Appeler showChunkViewer
    if (typeof window.showChunkViewer === 'function') {
      window.showChunkViewer(source);
    } else {
      console.error('[CitationParser] showChunkViewer not available');
      alert('Fonction de visualisation non disponible. Rechargez la page.');
    }
  };

  /**
   * Met en surbrillance la citation et le panneau source correspondant
   */
  window.highlightCitation = function(element) {
    if (!element) return;
    
    const docIdx = element.dataset.doc;
    const chunkId = element.dataset.chunk;
    
    // Highlight la citation elle-même
    element.classList.add('ring-2', 'ring-yellow-400', 'bg-yellow-100');
    
    // Highlight dans le panneau sources
    const sourceCard = document.querySelector(`[data-doc-id="Doc${docIdx}"]`);
    if (sourceCard) {
      sourceCard.classList.add('bg-yellow-100', 'ring-2', 'ring-yellow-400', 'shadow-md');
      sourceCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Highlight le chunk spécifique dans la liste
    const chunkElement = document.querySelector(`[data-chunk-id="${chunkId}"][data-doc-id="Doc${docIdx}"]`);
    if (chunkElement) {
      chunkElement.classList.add('bg-yellow-200', 'font-semibold');
    }
  };

  /**
   * Retire la surbrillance de la citation et du panneau source
   */
  window.unhighlightCitation = function(element) {
    if (!element) return;
    
    const docIdx = element.dataset.doc;
    const chunkId = element.dataset.chunk;
    
    // Retirer highlight de la citation
    element.classList.remove('ring-2', 'ring-yellow-400', 'bg-yellow-100');
    
    // Retirer highlight du panneau sources
    const sourceCard = document.querySelector(`[data-doc-id="Doc${docIdx}"]`);
    if (sourceCard) {
      sourceCard.classList.remove('bg-yellow-100', 'ring-2', 'ring-yellow-400', 'shadow-md');
    }
    
    // Retirer highlight du chunk
    const chunkElement = document.querySelector(`[data-chunk-id="${chunkId}"][data-doc-id="Doc${docIdx}"]`);
    if (chunkElement) {
      chunkElement.classList.remove('bg-yellow-200', 'font-semibold');
    }
  };
}

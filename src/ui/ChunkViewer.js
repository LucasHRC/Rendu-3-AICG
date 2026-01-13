/**
 * Module pour visualiser les chunks sources
 * AMÉLIORÉ: Support complet pour citations RAG et chat
 */

import { state } from '../state/state.js';

/**
 * Ouvre un modal pour visualiser un chunk source
 * @param {Object} source - Objet contenant docName/source, docIndex, chunkIndex, page, score, etc.
 */
export function showChunkViewer(source) {
  console.log('[ChunkViewer] Opening chunk viewer for:', source);
  console.log('[ChunkViewer] Available docs:', state.docs.map(d => ({ id: d.id, filename: d.filename, name: d.name, status: d.status })));
  console.log('[ChunkViewer] Total chunks in state:', state.chunks.length);
  
  // Trouver le document - essayer plusieurs champs et normaliser
  const searchName = source.docName || source.source || '';
  const normalizedSearch = searchName.toLowerCase().trim();
  
  // Filtrer les docs extraits
  const extractedDocs = state.docs.filter(d => d.status === 'extracted');
  
  let doc = null;
  
  // Méthode 1: Chercher par docIndex d'abord (plus fiable pour les citations RAG)
  if (source.docIndex && source.docIndex > 0) {
    if (source.docIndex <= extractedDocs.length) {
      doc = extractedDocs[source.docIndex - 1];
      console.log('[ChunkViewer] Found doc by docIndex:', source.docIndex, '->', doc?.filename);
    }
  }
  
  // Méthode 2: Chercher par nom (filename, name, displayName) si pas trouvé par index
  if (!doc && searchName) {
    doc = state.docs.find(d => {
      const filename = (d.filename || '').toLowerCase().trim();
      const name = (d.name || '').toLowerCase().trim();
      const displayName = (d.displayName || '').toLowerCase().trim();
      const normalizedFilename = filename.replace(/\.pdf$/i, '').trim();
      
      return filename === normalizedSearch || 
             name === normalizedSearch ||
             displayName === normalizedSearch ||
             normalizedFilename === normalizedSearch ||
             filename.includes(normalizedSearch) ||
             name.includes(normalizedSearch) ||
             displayName.includes(normalizedSearch) ||
             normalizedSearch.includes(filename) ||
             normalizedSearch.includes(name) ||
             normalizedSearch.includes(normalizedFilename);
    });
  }
  
  // Méthode 3: Si toujours pas trouvé, chercher via les chunks
  if (!doc && source.docIndex) {
    const uniqueDocIds = [...new Set(state.chunks.map(c => c.docId))];
    if (source.docIndex <= uniqueDocIds.length) {
      const docId = uniqueDocIds[source.docIndex - 1];
      doc = state.docs.find(d => d.id === docId);
      console.log('[ChunkViewer] Found doc via chunk docIds:', docId, '->', doc?.filename);
    }
  }
  
  if (!doc) {
    console.warn('[ChunkViewer] Document not found:', searchName, 'docIndex:', source.docIndex);
    console.warn('[ChunkViewer] Available documents:', extractedDocs.map(d => d.filename || d.name));
    
    // Afficher un message d'erreur plus informatif
    const availableList = extractedDocs.map((d, i) => `  ${i + 1}. ${d.filename || d.name || d.id}`).join('\n');
    alert(`Document non trouvé.\n\nRecherche: "${searchName}" (index: ${source.docIndex})\n\nDocuments disponibles:\n${availableList}`);
    return;
  }
  
  console.log('[ChunkViewer] Found document:', doc.filename || doc.name, 'id:', doc.id);

  // Trouver le chunk par docId et chunkIndex
  const chunks = state.chunks.filter(c => c.docId === doc.id);
  console.log('[ChunkViewer] Found chunks for doc:', chunks.length, 'Looking for chunkIndex:', source.chunkIndex);
  console.log('[ChunkViewer] Chunk indices available:', chunks.map(c => c.chunkIndex));
  
  let chunk = null;
  const targetIndex = source.chunkIndex;
  
  // Méthode 1: source.chunkIndex est 1-based (UI), chunk.chunkIndex est 0-based (interne)
  chunk = chunks.find(c => c.chunkIndex === (targetIndex - 1));
  
  // Méthode 2: Essayer avec index direct (0-based)
  if (!chunk && targetIndex !== undefined) {
    chunk = chunks.find(c => c.chunkIndex === targetIndex);
  }
  
  // Méthode 3: Accès par position dans le tableau (targetIndex - 1)
  if (!chunk && targetIndex !== undefined && targetIndex > 0 && targetIndex <= chunks.length) {
    chunk = chunks[targetIndex - 1];
    console.log('[ChunkViewer] Using array position:', targetIndex - 1);
  }
  
  // Méthode 4: Accès par position 0-based
  if (!chunk && targetIndex !== undefined && targetIndex >= 0 && targetIndex < chunks.length) {
    chunk = chunks[targetIndex];
    console.log('[ChunkViewer] Using 0-based position:', targetIndex);
  }
  
  // Méthode 5: Dernier recours - prendre le chunk le plus proche
  if (!chunk && chunks.length > 0) {
    const closestIdx = Math.max(0, Math.min(targetIndex - 1, chunks.length - 1));
    chunk = chunks[closestIdx];
    console.warn('[ChunkViewer] Fallback to closest chunk at index:', closestIdx);
  }

  if (!chunk) {
    console.warn('[ChunkViewer] Chunk not found:', source);
    console.warn('[ChunkViewer] Available chunks:', chunks.map((c, i) => ({ 
      arrayIndex: i, 
      chunkIndex: c.chunkIndex, 
      textPreview: c.text?.substring(0, 50) 
    })));
    alert(`Chunk non trouvé: Doc${source.docIndex}:Chunk${source.chunkIndex}\n\nDocument: ${doc.filename}\nChunks disponibles: ${chunks.length}`);
    return;
  }
  
  console.log('[ChunkViewer] Found chunk:', { 
    chunkIndex: chunk.chunkIndex, 
    page: chunk.page,
    textLength: chunk.text?.length,
    preview: chunk.text?.substring(0, 50) 
  });

  // Créer le modal avec design amélioré
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4';
  modal.id = 'chunk-viewer-modal';

  // Préparer les informations pour l'affichage
  const docName = doc.filename || doc.name || source.source || 'Document';
  const pageInfo = chunk.page || source.page || 'N/A';
  const sectionInfo = source.section || chunk.section || 'Non spécifié';
  const chunkText = chunk.text || chunk.content || 'Contenu non disponible';
  
  // Highlight les nombres scientifiques dans le texte
  const highlightedText = chunkText.replace(
    /(\d+[.,]?\d*\s*(σ|%|kpc|Mpc|km|m\/s|s|kg|Hz|eV|GeV|TeV|±|×|M☉|Gyr|Myr|pc|AU))/g,
    '<span class="bg-yellow-200 px-1 rounded font-semibold">$1</span>'
  );

  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
      <!-- Header -->
      <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div class="flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600 text-white">
                Doc${source.docIndex} • Chunk${source.chunkIndex}
              </span>
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-700">
                Page ${pageInfo}
              </span>
            </div>
            <h3 class="text-lg font-bold text-gray-900 truncate" title="${docName}">${docName}</h3>
            <p class="text-sm text-gray-600 mt-1">Section: ${sectionInfo}</p>
          </div>
          <button id="close-chunk-viewer" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-4">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        ${source.score ? `
          <div class="mt-3 flex items-center gap-2">
            <span class="text-xs font-medium text-gray-600">Score de pertinence:</span>
            <div class="flex-1 max-w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style="width: ${(source.score * 100).toFixed(0)}%"></div>
            </div>
            <span class="text-xs font-bold text-purple-600">${(source.score * 100).toFixed(1)}%</span>
          </div>
        ` : ''}
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <strong>Note:</strong> Les nombres scientifiques sont surlignes en jaune pour faciliter l'identification des metriques cles.
        </div>
        <div class="prose prose-sm max-w-none">
          <div class="bg-gray-50 rounded-lg p-5 border border-gray-200 shadow-inner">
            <div class="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">${highlightedText}</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div class="text-xs text-gray-500 space-x-4">
          <span>${chunkText.length} caracteres</span>
          <span>Index: ${chunk.chunkIndex !== undefined ? chunk.chunkIndex : 'N/A'}</span>
          ${chunk.start !== undefined ? `<span>Position: ${chunk.start} - ${chunk.end}</span>` : ''}
        </div>
        <button id="close-chunk-viewer-btn" class="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
          Fermer
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  const closeBtn = modal.querySelector('#close-chunk-viewer');
  const closeBtn2 = modal.querySelector('#close-chunk-viewer-btn');
  
  const closeModal = () => {
    modal.remove();
  };

  closeBtn?.addEventListener('click', closeModal);
  closeBtn2?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // ESC key
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}


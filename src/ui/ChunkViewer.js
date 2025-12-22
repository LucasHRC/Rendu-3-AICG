/**
 * Module pour visualiser les chunks sources
 */

import { state } from '../state/state.js';

/**
 * Ouvre un modal pour visualiser un chunk source
 */
export function showChunkViewer(source) {
  console.log('[ChunkViewer] Opening chunk viewer for:', source);
  console.log('[ChunkViewer] Available docs:', state.docs.map(d => ({ id: d.id, filename: d.filename, name: d.name })));
  
  // Trouver le document - essayer plusieurs champs et normaliser
  const searchName = source.docName || source.source || '';
  const normalizedSearch = searchName.toLowerCase().trim();
  
  // Aussi chercher par docIndex si disponible (en utilisant les groupes de documents)
  let doc = null;
  
  // Méthode 1: Chercher par nom (filename, name, displayName)
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
  
  // Méthode 2: Si pas trouvé et qu'on a docIndex, chercher via les chunks
  if (!doc && source.docIndex) {
    // Trouver tous les docIds uniques dans les chunks
    const uniqueDocIds = [...new Set(state.chunks.map(c => c.docId))];
    if (source.docIndex <= uniqueDocIds.length) {
      const docId = uniqueDocIds[source.docIndex - 1];
      doc = state.docs.find(d => d.id === docId);
    }
  }
  
  if (!doc) {
    console.warn('[ChunkViewer] Document not found:', searchName);
    console.warn('[ChunkViewer] Available documents:', state.docs.map(d => d.filename || d.name));
    alert(`Document non trouvé: "${searchName}".\n\nDocuments disponibles:\n${state.docs.map(d => `- ${d.filename || d.name || d.id}`).join('\n')}`);
    return;
  }
  
  console.log('[ChunkViewer] Found document:', doc.filename || doc.name);

  // Trouver le chunk par docId et chunkIndex
  const chunks = state.chunks.filter(c => c.docId === doc.id);
  console.log('[ChunkViewer] Found chunks for doc:', chunks.length, 'Looking for chunkIndex:', source.chunkIndex);
  
  // source.chunkIndex est 1-based, chunk.chunkIndex est 0-based
  let chunk = chunks.find(c => c.chunkIndex === (source.chunkIndex - 1));
  
  // Si pas trouvé, essayer avec index direct (si chunkIndex n'est pas défini)
  if (!chunk && source.chunkIndex) {
    chunk = chunks[source.chunkIndex - 1];
  }
  
  // Dernier recours : chercher par index dans le tableau
  if (!chunk && chunks.length > 0) {
    console.warn('[ChunkViewer] Chunk not found by chunkIndex, trying by array index');
    chunk = chunks[Math.min(source.chunkIndex - 1, chunks.length - 1)];
  }

  if (!chunk) {
    console.warn('[ChunkViewer] Chunk not found:', source);
    console.warn('[ChunkViewer] Available chunks:', chunks.map((c, i) => ({ index: i, chunkIndex: c.chunkIndex, text: c.text.substring(0, 50) })));
    alert(`Chunk non trouvé: Doc${source.docIndex}:Chunk${source.chunkIndex}\n\nChunks disponibles: ${chunks.length}`);
    return;
  }
  
  console.log('[ChunkViewer] Found chunk:', chunk.chunkIndex, chunk.text.substring(0, 50));

  // Créer le modal
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
  modal.id = 'chunk-viewer-modal';

  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-bold text-gray-900">Chunk Source</h3>
            <p class="text-sm text-gray-600 mt-1">${source.source} - [Doc${source.docIndex}:Chunk${source.chunkIndex}]</p>
          </div>
          <button id="close-chunk-viewer" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        ${source.score ? `
          <div class="mt-2 flex items-center gap-2">
            <span class="text-xs font-medium text-gray-600">Score de similarité:</span>
            <span class="text-xs font-bold text-purple-600">${(source.score * 100).toFixed(1)}%</span>
          </div>
        ` : ''}
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="prose prose-sm max-w-none">
          <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <pre class="whitespace-pre-wrap text-sm text-gray-800 font-sans">${chunk.text}</pre>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div class="text-xs text-gray-500">
          <span>Position: ${chunk.start || 'N/A'} - ${chunk.end || 'N/A'}</span>
          ${chunk.index !== undefined ? `<span class="ml-4">Index: ${chunk.index}</span>` : ''}
        </div>
        <button id="close-chunk-viewer-btn" class="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
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


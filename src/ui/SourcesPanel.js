/**
 * Panneau Sources Utilisées - Traçabilité des citations
 */

import { CitationManager } from '../rag/citationManager.js';
import { state } from '../state/state.js';

/**
 * Crée le panneau Sources Utilisées
 */
export function createSourcesPanel(documentAnalyses, finalReview, citationManager) {
  if (!documentAnalyses || !finalReview || !citationManager) {
    return '<div class="text-gray-500">Données sources non disponibles</div>';
  }

  const citations = citationManager.extractAllCitations(finalReview.text || finalReview.review || '');
  const citationsByDoc = citationManager.groupCitationsByDoc(citations);
  const citationCounts = citationManager.countCitationsByDoc(citations);
  const topChunks = citationManager.getTopCitedChunks(citations, 5);
  const uncitedDocs = citationManager.getUncitedDocuments(citations);

  const totalCitations = citations.length;
  const citedDocCount = citationsByDoc.size;
  const avgCitationsPerDoc = documentAnalyses.length > 0 
    ? (totalCitations / documentAnalyses.length).toFixed(1) 
    : '0';

  return `
    <div class="sources-panel bg-white rounded-lg shadow p-4 h-full overflow-y-auto">
      <h3 class="text-lg font-semibold mb-4 text-gray-800">Sources Utilisées</h3>
      
      <!-- Statistiques résumées -->
      <div class="stats-summary grid grid-cols-3 gap-3 mb-6">
        <div class="stat-item bg-blue-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-blue-600">${totalCitations}</div>
          <div class="text-xs text-gray-600 mt-1">Citations totales</div>
        </div>
        <div class="stat-item bg-green-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-green-600">${citedDocCount}</div>
          <div class="text-xs text-gray-600 mt-1">Documents cités</div>
        </div>
        <div class="stat-item bg-purple-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-purple-600">${avgCitationsPerDoc}</div>
          <div class="text-xs text-gray-600 mt-1">Moyenne/doc</div>
        </div>
      </div>
      
      <!-- Liste des documents avec citations -->
      <div class="documents-list space-y-3 mb-6">
        <h4 class="font-semibold text-sm text-gray-700 mb-2">Documents Analysés</h4>
        ${renderDocumentCitations(documentAnalyses, citationsByDoc, citationCounts)}
      </div>
      
      <!-- Documents non cités (warning) -->
      ${uncitedDocs.length > 0 ? `
        <div class="uncited-docs mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 class="font-semibold text-sm text-yellow-800 mb-2">Documents non cites</h4>
          <ul class="text-xs text-yellow-700 space-y-1">
            ${uncitedDocs.map(doc => `<li>• ${doc.filename}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <!-- Top chunks cités -->
      ${topChunks.length > 0 ? `
        <div class="top-chunks">
          <h4 class="font-semibold text-sm text-gray-700 mb-2">Chunks les plus cités</h4>
          <div class="space-y-2">
            ${renderTopChunks(topChunks, citationManager)}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Rend les citations par document
 */
function renderDocumentCitations(analyses, citationsByDoc, citationCounts) {
  return analyses.map((analysis, idx) => {
    const docId = `Doc${idx + 1}`;
    const docIndex = idx + 1;
    const citationCount = citationCounts.get(docIndex) || 0;
    const chunks = citationsByDoc.get(docIndex) || [];
    const uniquePages = new Set(chunks.map(c => c.page));
    
    const basicInfo = analysis.parsed?.basic_info || {};
    const title = basicInfo.title || analysis.filename || `Document ${docIndex}`;
    const authors = Array.isArray(basicInfo.authors) && basicInfo.authors.length > 0
      ? basicInfo.authors.join(', ')
      : 'Auteurs non trouvés';
    
    return `
      <div class="doc-citation-card border rounded-lg p-3 hover:bg-gray-50 transition cursor-pointer" 
           data-doc-id="${docId}"
           onclick="scrollToDocument('${docId}')">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-gray-800 text-sm truncate" title="${title}">
              ${docId}: ${title}
            </div>
            <div class="text-xs text-gray-600 mt-1 truncate" title="${authors}">
              ${authors}
            </div>
          </div>
          <div class="text-right ml-2 flex-shrink-0">
            <div class="text-lg font-bold text-blue-600">${citationCount}</div>
            <div class="text-xs text-gray-500">citations</div>
          </div>
        </div>
        <div class="flex gap-4 text-xs text-gray-600 mt-2">
          <span class="flex items-center gap-1">
            <span>${uniquePages.size} pages</span>
          </span>
          <span class="flex items-center gap-1">
            <span>${chunks.length} chunks</span>
          </span>
        </div>
        ${chunks.length > 0 ? `
          <div class="mt-2 pt-2 border-t border-gray-200">
            <div class="text-xs text-gray-500 mb-1">Chunks cités (cliquez pour voir):</div>
            <div class="flex flex-wrap gap-1">
              ${chunks.slice(0, 5).map(c => `
                <button class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 cursor-pointer transition-colors" 
                      data-chunk-id="${c.chunkId}" 
                      data-doc-id="${docId}"
                      data-doc-index="${docIndex}"
                      data-page="${c.page || 1}"
                      onclick="viewChunkFromSourcePanel(this)">
                  ${c.chunkId}
                </button>
              `).join('')}
              ${chunks.length > 5 ? `<span class="text-xs text-gray-500">+${chunks.length - 5} autres</span>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Rend les top chunks cités
 */
function renderTopChunks(topChunks, citationManager) {
  return topChunks.map((chunk, idx) => {
    const details = citationManager.getCitationDetails(chunk.docIndex, chunk.chunkId);
    const docId = `Doc${chunk.docIndex}`;
    
    return `
      <div class="top-chunk-item bg-gray-50 p-2 rounded text-xs">
        <div class="flex justify-between items-center">
          <span class="font-mono text-blue-600">${docId} • ${chunk.chunkId}</span>
          <span class="text-gray-500">${chunk.count}x</span>
        </div>
        ${details ? `
          <div class="text-gray-600 mt-1 text-xs">
            Page ${details.page} • ${details.section}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Fonctions globales pour l'interactivité du panneau sources
 */
if (typeof window !== 'undefined') {
  /**
   * Scroll vers un document dans la revue
   */
  window.scrollToDocument = function(docId) {
    const element = document.querySelector(`[data-document-id="${docId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /**
   * Ouvre le ChunkViewer depuis le panneau sources
   */
  window.viewChunkFromSourcePanel = function(element) {
    if (!element) return;
    
    const chunkId = element.dataset.chunkId; // ex: "chunk_5"
    const docId = element.dataset.docId; // ex: "Doc1"
    const docIndex = parseInt(element.dataset.docIndex) || parseInt(docId.replace('Doc', ''));
    const page = parseInt(element.dataset.page) || 1;
    
    // Extraire l'index du chunk
    const chunkIndex = parseInt(chunkId.replace('chunk_', '')) + 1; // +1 car l'affichage est 1-based
    
    console.log('[SourcesPanel] View chunk:', { docId, docIndex, chunkId, chunkIndex, page });
    
    // Trouver le nom du document via l'import
    let filename = `Document ${docIndex}`;
    
    if (state && state.docs) {
      const docs = state.docs.filter(d => d.status === 'extracted');
      const doc = docs[docIndex - 1];
      if (doc) {
        filename = doc.filename || doc.name || filename;
      }
    }
    
    // Construire l'objet source pour showChunkViewer
    const source = {
      docName: filename,
      source: filename,
      docIndex: docIndex,
      chunkIndex: chunkIndex,
      page: page,
      score: null
    };
    
    // Appeler showChunkViewer
    if (typeof window.showChunkViewer === 'function') {
      window.showChunkViewer(source);
    } else {
      console.error('[SourcesPanel] showChunkViewer not available');
      alert('Fonction de visualisation non disponible.');
    }
  };
}

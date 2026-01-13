/**
 * Modal Bibliotheque - Version avec enrichissement
 */

import { state, removeDocument, getDocument } from '../state/state.js';
import { enrichDocument, enrichAllDocuments, isDocumentEnriched, getDocumentEnrichment } from '../rag/documentEnricher.js';
import { isModelReady } from '../llm/webllm.js';

let currentModal = null;

/**
 * Affiche la modal Bibliotheque
 */
export function showLibraryModal(selectedDocId = null) {
  if (currentModal) {
    currentModal.remove();
  }

  const enrichedCount = state.docs.filter(d => d.enrichment).length;
  const extractedCount = state.docs.filter(d => d.status === 'extracted').length;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="p-6 border-b border-gray-200 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Bibliotheque</h2>
        <div class="flex items-center gap-3">
          <button id="enrich-all-btn" class="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors ${!isModelReady() ? 'opacity-50 cursor-not-allowed' : ''}" ${!isModelReady() ? 'disabled' : ''}>
            Enrichir Tous
          </button>
          <button id="close-library-modal" class="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="p-6 border-b border-gray-200">
        <div class="grid grid-cols-3 gap-4 text-center">
          <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-2xl font-bold text-blue-600">${extractedCount}</div>
            <div class="text-sm text-gray-600">Documents</div>
          </div>
          <div class="bg-green-50 p-4 rounded-lg">
            <div class="text-2xl font-bold text-green-600">${enrichedCount}</div>
            <div class="text-sm text-gray-600">Enrichis</div>
          </div>
          <div class="bg-purple-50 p-4 rounded-lg">
            <div class="text-2xl font-bold text-purple-600">${state.chunks.length}</div>
            <div class="text-sm text-gray-600">Chunks</div>
          </div>
        </div>
      </div>

      <!-- Barre de progression enrichissement -->
      <div id="enrichment-progress" class="hidden px-6 py-3 bg-purple-50 border-b border-purple-200">
        <div class="flex items-center justify-between mb-2">
          <span id="enrichment-status" class="text-sm text-purple-800">Enrichissement en cours...</span>
          <span id="enrichment-count" class="text-sm text-purple-600">0/0</span>
        </div>
        <div class="w-full bg-purple-200 rounded-full h-2">
          <div id="enrichment-bar" class="bg-purple-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
      </div>

      <!-- Grille des documents -->
      <div class="flex-1 overflow-y-auto p-6">
        <div id="documents-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <!-- Documents seront inseres ici -->
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  currentModal = modal;

  // Evenements
  modal.querySelector('#close-library-modal').addEventListener('click', () => modal.remove());
  modal.querySelector('#enrich-all-btn').addEventListener('click', handleEnrichAll);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  renderDocumentsList();
}

/**
 * Enrichit tous les documents
 */
async function handleEnrichAll() {
  const progressDiv = currentModal.querySelector('#enrichment-progress');
  const statusEl = currentModal.querySelector('#enrichment-status');
  const countEl = currentModal.querySelector('#enrichment-count');
  const barEl = currentModal.querySelector('#enrichment-bar');
  const btn = currentModal.querySelector('#enrich-all-btn');

  progressDiv.classList.remove('hidden');
  btn.disabled = true;
  btn.textContent = 'Enrichissement...';

  try {
    const results = await enrichAllDocuments((progress) => {
      if (progress.status === 'processing') {
        statusEl.textContent = `Enrichissement: ${progress.filename || '...'}`;
        countEl.textContent = `${progress.current || 0}/${progress.total || 0}`;
        const percent = progress.current && progress.total 
          ? (progress.current / progress.total) * 100 
          : 0;
        barEl.style.width = `${percent}%`;
      } else if (progress.status === 'complete') {
        const successCount = progress.results?.filter(r => r.enrichment).length || 0;
        const totalCount = progress.results?.length || 0;
        statusEl.textContent = `Terminé: ${successCount}/${totalCount} succès`;
        barEl.style.width = '100%';
      }
    });

    setTimeout(() => {
      progressDiv.classList.add('hidden');
      renderDocumentsList();
      // Mettre a jour les stats
      const enrichedCount = state.docs.filter(d => d.enrichment).length;
      currentModal.querySelector('.bg-green-50 .text-2xl').textContent = enrichedCount;
    }, 1500);

  } catch (error) {
    statusEl.textContent = `Erreur: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enrichir Tous';
  }
}

/**
 * SVG Logo simple pour document
 */
function getDocumentIcon() {
  return `<svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
  </svg>`;
}

/**
 * Crée une carte document moderne
 */
function createDocumentCard(doc) {
  const isEnriched = doc.enrichment !== undefined && doc.enrichment !== null;
  const enrichment = doc.enrichment || {};
  
  const card = document.createElement('div');
  card.className = 'bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-gray-100 hover:border-gray-200 relative';
  card.dataset.docId = doc.id;
  
  card.innerHTML = `
    <div class="p-5" data-action="details" data-doc-id="${doc.id}">
      <!-- Badge Non enrichi -->
      ${!isEnriched ? `
        <div class="absolute top-3 right-3">
          <span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Non enrichi</span>
        </div>
      ` : ''}
      
      <!-- Logo SVG -->
      <div class="flex justify-center mb-4">
        ${getDocumentIcon()}
      </div>
      
      <!-- Titre -->
      <h3 class="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 min-h-[2.5rem]">
        ${enrichment.title || doc.filename}
      </h3>
      
      <!-- Année -->
      ${enrichment.year ? `
        <div class="text-xs text-gray-500 mb-2">${enrichment.year}</div>
      ` : ''}
      
      <!-- Auteurs -->
      ${enrichment.authors && enrichment.authors.length > 0 ? `
        <div class="text-xs text-gray-600 mb-2 line-clamp-1">
          ${enrichment.authors.slice(0, 2).join(', ')}${enrichment.authors.length > 2 ? '...' : ''}
        </div>
      ` : ''}
      
      <!-- Domaine -->
      ${enrichment.domain ? `
        <div class="text-xs text-purple-600 font-medium mb-2">${enrichment.domain}</div>
      ` : ''}
      
      <!-- Résumé court (1 ligne) -->
      ${enrichment.abstract ? `
        <div class="text-xs text-gray-600 line-clamp-1 mt-2">${enrichment.abstract}</div>
      ` : ''}
      
      <!-- Footer avec actions -->
      <div class="mt-4 pt-3 border-t border-gray-100 flex gap-2">
        <button class="flex-1 px-2 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors ${!isModelReady() ? 'opacity-50 cursor-not-allowed' : ''}"
                data-action="enrich" data-doc-id="${doc.id}" ${!isModelReady() ? 'disabled' : ''}>
          ${isEnriched ? 'Re-enrichir' : 'Enrichir'}
        </button>
        <button class="px-2 py-1.5 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors"
                data-action="read" data-doc-id="${doc.id}">
          Lire
        </button>
        <button class="px-2 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors"
                data-action="delete" data-doc-id="${doc.id}">
          ×
        </button>
      </div>
    </div>
  `;
  
  return card;
}

/**
 * Rend la liste des documents (grille)
 */
function renderDocumentsList() {
  const container = currentModal.querySelector('#documents-list');
  const docs = state.docs.filter(d => d.status === 'extracted');

  if (docs.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-12">Aucun document extrait</div>';
    return;
  }

  // Vider le container
  container.innerHTML = '';
  
  // Créer les cartes
  docs.forEach(doc => {
    const card = createDocumentCard(doc);
    container.appendChild(card);
  });

  // Evenements
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = el.dataset.action;
      const docId = el.dataset.docId;

      if (action === 'enrich') {
        await handleEnrichSingle(docId, el);
      } else if (action === 'read') {
        handleReadDocument(docId);
      } else if (action === 'delete') {
        if (confirm('Supprimer ce document ?')) {
          removeDocument(docId);
          renderDocumentsList();
        }
      } else if (action === 'details') {
        showDocumentDetails(docId);
      }
    });
  });
}

/**
 * Enrichit un seul document
 */
async function handleEnrichSingle(docId, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '...';

  try {
    await enrichDocument(docId);
    renderDocumentsList();
  } catch (error) {
    alert(`Erreur: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

/**
 * Affiche les details d'un document (modal avec 9 parametres)
 */
function showDocumentDetails(docId) {
  const doc = getDocument(docId);
  if (!doc) return;

  const enrichment = doc.enrichment || {};
  const chunksCount = state.chunks.filter(c => c.docId === docId).length;

  const detailModal = document.createElement('div');
  detailModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4';
  detailModal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <div class="p-6 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0">
            ${getDocumentIcon()}
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900">${enrichment.title || doc.filename}</h2>
            ${enrichment.year ? `<p class="text-sm text-gray-500 mt-1">${enrichment.year}</p>` : ''}
          </div>
        </div>
        <button id="close-detail-modal" class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        ${doc.enrichment ? `
          <!-- 9 Parametres enrichis -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Auteurs</div>
              <div class="text-sm font-medium text-gray-900">${enrichment.authors?.join(', ') || 'Non disponible'}</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Domaine</div>
              <div class="text-sm font-medium text-gray-900">${enrichment.domain || 'Non disponible'}</div>
            </div>
          </div>

          <div class="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <div class="text-xs font-semibold text-blue-600 mb-2 uppercase tracking-wide">Resume</div>
            <div class="text-sm text-blue-900 leading-relaxed">${enrichment.abstract || 'Non disponible'}</div>
          </div>

          <div class="bg-purple-50 p-4 rounded-xl border border-purple-100">
            <div class="text-xs font-semibold text-purple-600 mb-2 uppercase tracking-wide">Question de recherche</div>
            <div class="text-sm text-purple-900 leading-relaxed">${enrichment.research_question || 'Non disponible'}</div>
          </div>

          <div class="bg-green-50 p-4 rounded-xl border border-green-100">
            <div class="text-xs font-semibold text-green-600 mb-2 uppercase tracking-wide">Methodologie</div>
            <div class="text-sm text-green-900 leading-relaxed">${enrichment.methodology || 'Non disponible'}</div>
          </div>

          <div class="bg-orange-50 p-4 rounded-xl border border-orange-100">
            <div class="text-xs font-semibold text-orange-600 mb-2 uppercase tracking-wide">Resultats cles</div>
            <div class="text-sm text-orange-900 leading-relaxed">${enrichment.key_findings || 'Non disponible'}</div>
          </div>

          ${enrichment.keywords?.length > 0 ? `
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Mots-cles</div>
              <div class="flex flex-wrap gap-2">
                ${enrichment.keywords.map(k => `<span class="px-3 py-1 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-lg shadow-sm">${k}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        ` : `
          <div class="text-center py-8 text-gray-500">
            <p class="mb-4">Ce document n'a pas encore ete enrichi.</p>
            <button id="enrich-from-detail" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 ${!isModelReady() ? 'opacity-50 cursor-not-allowed' : ''}" ${!isModelReady() ? 'disabled' : ''}>
              Enrichir maintenant
            </button>
          </div>
        `}

        <!-- Statistiques -->
        <div class="border-t border-gray-200 pt-4 mt-4">
          <div class="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Statistiques</div>
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
              <div class="text-lg font-bold text-gray-900">${chunksCount}</div>
              <div class="text-xs text-gray-500 mt-1">Chunks</div>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
              <div class="text-lg font-bold text-gray-900">${doc.pageCount || '?'}</div>
              <div class="text-xs text-gray-500 mt-1">Pages</div>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
              <div class="text-lg font-bold text-gray-900">${doc.charCount ? Math.round(doc.charCount / 1000) + 'k' : '?'}</div>
              <div class="text-xs text-gray-500 mt-1">Caracteres</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(detailModal);

  detailModal.querySelector('#close-detail-modal').addEventListener('click', () => detailModal.remove());
  
  const enrichBtn = detailModal.querySelector('#enrich-from-detail');
  if (enrichBtn) {
    enrichBtn.addEventListener('click', async () => {
      enrichBtn.disabled = true;
      enrichBtn.textContent = 'Enrichissement...';
      try {
        await enrichDocument(docId);
        detailModal.remove();
        showDocumentDetails(docId);
        renderDocumentsList();
      } catch (error) {
        alert(`Erreur: ${error.message}`);
        enrichBtn.disabled = false;
        enrichBtn.textContent = 'Enrichir maintenant';
      }
    });
  }

  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) detailModal.remove();
  });
}

/**
 * Affiche le lecteur de document complet
 */
function handleReadDocument(docId) {
  const doc = getDocument(docId);
  if (!doc) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <div class="p-6 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">${doc.filename}</h2>
          <div class="text-sm text-gray-600 mt-1">
            ${doc.pageCount || '?'} pages | ${doc.charCount || '?'} caracteres
          </div>
        </div>
        <div class="flex gap-2">
          <button id="download-doc" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Telecharger
          </button>
          <button id="close-reader-modal" class="p-2 text-gray-500 hover:text-gray-700 rounded-lg">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        <div class="prose prose-lg max-w-none">
          <div class="whitespace-pre-wrap text-gray-800 leading-relaxed font-serif text-lg">
            ${doc.extractedText || 'Texte non disponible'}
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#close-reader-modal').addEventListener('click', () => modal.remove());

  modal.querySelector('#download-doc').addEventListener('click', () => {
    const blob = new Blob([doc.extractedText || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.filename}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.addEventListener('keydown', function handleEscape(e) {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  });
}

/**
 * Ferme la modal bibliotheque
 */
export function hideLibraryModal() {
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
  }
}

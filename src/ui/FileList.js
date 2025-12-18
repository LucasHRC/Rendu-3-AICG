/**
 * Composant UI : Liste des fichiers - Design avec accents couleurs
 */

import { state, removeDocument, updateDocumentStatus, updateDocumentExtraction, addChunks } from '../state/state.js';
import { formatFileSize } from '../utils/fileUtils.js';
import { showPDFViewer } from './PDFViewer.js';
import { extractTextFromPDF } from '../rag/pdfExtract.js';
import { createChunksForDocument } from '../rag/chunker.js';

/**
 * Crée le composant de liste des fichiers
 */
export function createFileList() {
  const container = document.createElement('div');
  container.id = 'file-list-container';

  const list = document.createElement('div');
  list.id = 'file-list';
  list.className = 'space-y-3';

  container.appendChild(list);
  renderFileList();

  // Événements
  window.addEventListener('state:docAdded', renderFileList);
  window.addEventListener('state:docRemoved', renderFileList);
  window.addEventListener('state:docUpdated', renderFileList);
  window.addEventListener('state:docExtracted', renderFileList);

  window.addEventListener('action:extractAll', async () => {
    const docsToExtract = state.docs.filter(doc => !doc.extractedText && doc.status !== 'extracting');
    for (const doc of docsToExtract) {
      await handleExtraction(doc.id);
    }
  });

  return container;
}

/**
 * Rend la liste des fichiers
 */
function renderFileList() {
  const list = document.getElementById('file-list');
  if (!list) return;

  list.innerHTML = '';

  if (state.docs.length === 0) {
    list.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-sm font-medium">No documents yet</p>
        <p class="text-xs mt-1">Drop PDFs above to get started</p>
      </div>
    `;
    return;
  }

  state.docs.forEach((doc) => {
    list.appendChild(createFileCard(doc));
  });
}

/**
 * Crée une carte pour un fichier
 */
function createFileCard(doc) {
  const card = document.createElement('div');
  card.className = 'group bg-gray-50 hover:bg-white border border-gray-200 hover:border-blue-200 rounded-xl p-4 transition-all hover:shadow-md';
  card.dataset.fileId = doc.id;

  // Ligne principale
  const mainRow = document.createElement('div');
  mainRow.className = 'flex items-center gap-4';

  // Icône status avec couleur
  const statusIcon = document.createElement('div');
  const statusColors = {
    uploaded: 'bg-blue-500',
    extracting: 'bg-yellow-500 animate-pulse',
    extracted: 'bg-green-500',
    error: 'bg-red-500'
  };
  statusIcon.className = `w-3 h-3 rounded-full flex-shrink-0 ${statusColors[doc.status] || statusColors.uploaded}`;

  // Nom du fichier
  const nameContainer = document.createElement('div');
  nameContainer.className = 'flex-1 min-w-0';
  
  const filename = document.createElement('span');
  filename.className = 'text-sm font-semibold text-gray-900 truncate block cursor-text hover:text-blue-600';
  filename.textContent = doc.displayName || doc.filename;
  filename.title = 'Double-click to rename';
  
  filename.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    showRenameInput(doc, filename);
  });

  const meta = document.createElement('div');
  meta.className = 'text-xs text-gray-500 mt-1 flex items-center gap-2';
  
  const docChunks = state.chunks.filter(c => c.docId === doc.id);
  
  meta.innerHTML = `
    <span>${formatFileSize(doc.size)}</span>
    ${docChunks.length > 0 ? `<span class="text-purple-600 font-medium">${docChunks.length} chunks</span>` : ''}
  `;

  nameContainer.appendChild(filename);
  nameContainer.appendChild(meta);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity';

  // Bouton renommer
  const renameBtn = createActionButton('Rename', `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  `, 'text-gray-500 hover:text-blue-600 hover:bg-blue-50');
  renameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showRenameInput(doc, filename);
  });

  // Bouton voir
  const viewBtn = createActionButton('View PDF', `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  `, 'text-gray-500 hover:text-blue-600 hover:bg-blue-50');
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showPDFViewer(doc.file, doc.filename);
  });

  // Bouton extraire
  if (!doc.extractedText && doc.status !== 'extracting') {
    const extractBtn = createActionButton('Extract text', `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    `, 'text-white bg-green-600 hover:bg-green-700');
    extractBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleExtraction(doc.id);
    });
    actions.appendChild(extractBtn);
  }

  // Bouton supprimer
  const deleteBtn = createActionButton('Delete', `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  `, 'text-gray-500 hover:text-red-600 hover:bg-red-50');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${doc.displayName || doc.filename}"?`)) {
      removeDocument(doc.id);
    }
  });

  actions.appendChild(renameBtn);
  actions.appendChild(viewBtn);
  actions.appendChild(deleteBtn);

  mainRow.appendChild(statusIcon);
  mainRow.appendChild(nameContainer);
  mainRow.appendChild(actions);
  card.appendChild(mainRow);

  // Preview texte
  if (doc.extractedText) {
    const preview = document.createElement('div');
    preview.className = 'mt-3 pt-3 border-t border-gray-200 hidden';
    preview.id = `preview-${doc.id}`;
    preview.innerHTML = `
      <div class="text-xs text-gray-600 bg-white rounded-lg p-3 max-h-28 overflow-y-auto font-mono leading-relaxed border border-gray-100">
        ${doc.extractedText.substring(0, 400)}...
      </div>
    `;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'mt-2 text-xs font-medium text-blue-600 hover:text-blue-800';
    toggleBtn.textContent = 'Show preview';
    toggleBtn.addEventListener('click', () => {
      preview.classList.toggle('hidden');
      toggleBtn.textContent = preview.classList.contains('hidden') ? 'Show preview' : 'Hide preview';
    });

    card.appendChild(toggleBtn);
    card.appendChild(preview);
  }

  return card;
}

/**
 * Crée un bouton d'action
 */
function createActionButton(title, iconSvg, extraClass = '') {
  const btn = document.createElement('button');
  btn.className = `p-2 rounded-lg transition-colors ${extraClass}`;
  btn.title = title;
  btn.innerHTML = iconSvg;
  return btn;
}

/**
 * Affiche l'input de renommage
 */
function showRenameInput(doc, filenameEl) {
  const currentName = doc.displayName || doc.filename.replace(/\.pdf$/i, '');
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'text-sm font-semibold text-gray-900 bg-white border-2 border-blue-500 rounded-lg px-2 py-1 w-full focus:outline-none';
  
  const originalText = filenameEl.textContent;
  filenameEl.textContent = '';
  filenameEl.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      doc.displayName = newName;
      window.dispatchEvent(new CustomEvent('state:docUpdated', { detail: { id: doc.id } }));
    }
    filenameEl.textContent = doc.displayName || doc.filename;
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { filenameEl.textContent = originalText; }
  });
}

/**
 * Gère l'extraction
 */
async function handleExtraction(docId) {
  const doc = state.docs.find(d => d.id === docId);
  if (!doc) return;

  updateDocumentStatus(docId, 'extracting');
  renderFileList();

  try {
    const extractionData = await extractTextFromPDF(doc.file);
    updateDocumentExtraction(docId, extractionData);

    const chunks = createChunksForDocument(
      extractionData.text,
      doc.filename,
      docId,
      500,
      1
    );

    addChunks(chunks);
    renderFileList();

  } catch (error) {
    console.error('Extraction error:', error);
    updateDocumentStatus(docId, 'error', error.message);
    renderFileList();
  }
}

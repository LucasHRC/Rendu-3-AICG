/**
 * Composant UI : Liste des fichiers uploadés
 */

import { state, removeDocument, updateDocumentStatus, updateDocumentExtraction, addChunks } from '../state/state.js';
import { formatFileSize } from '../utils/fileUtils.js';
import { showPDFViewer } from './PDFViewer.js';
import { extractTextFromPDF } from '../rag/pdfExtract.js';
import { createChunksForDocument } from '../rag/chunker.js';

/**
 * Crée le composant de liste des fichiers
 * @returns {HTMLElement} - Le conteneur de la liste
 */
export function createFileList() {
  const container = document.createElement('div');
  container.id = 'file-list-container';
  container.className = 'mt-6';

  const title = document.createElement('h3');
  title.className = 'text-lg font-bold mb-4 text-gray-800';
  title.textContent = 'Documents Uploades';

  const list = document.createElement('div');
  list.id = 'file-list';
  list.className = 'space-y-3';

  container.appendChild(title);
  container.appendChild(list);

  // Rendu initial
  renderFileList();

  // Écouter les événements de changement d'état
  window.addEventListener('state:docAdded', () => {
    renderFileList();
  });

  window.addEventListener('state:docRemoved', () => {
    renderFileList();
  });

  window.addEventListener('state:docUpdated', () => {
    renderFileList();
  });

  window.addEventListener('state:docExtracted', () => {
    renderFileList();
  });

  // Écouter l'action "Extraire tout"
  window.addEventListener('action:extractAll', async () => {
    const docsToExtract = state.docs.filter(doc => !doc.extractedText && doc.status !== 'extracting');
    for (const doc of docsToExtract) {
      await handleExtraction(doc.id);
    }
  });

  return container;
}

/**
 * Rend la liste des fichiers depuis le state
 */
function renderFileList() {
  const list = document.getElementById('file-list');
  if (!list) return;

  // Vider la liste
  list.innerHTML = '';

  // Si aucun fichier
  if (state.docs.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'text-gray-500 text-center py-8 italic';
    emptyMessage.textContent = 'Aucun document uploadé pour le moment';
    list.appendChild(emptyMessage);
    return;
  }

  // Créer une carte pour chaque fichier
  state.docs.forEach((doc) => {
    const fileCard = createFileCard(doc);
    list.appendChild(fileCard);
  });
}

/**
 * Crée une carte pour un fichier
 * @param {object} doc - Le document à afficher
 * @returns {HTMLElement} - L'élément carte
 */
function createFileCard(doc) {
  const card = document.createElement('div');
  card.className = 'bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow';
  card.dataset.fileId = doc.id;

  // Header avec nom et bouton supprimer
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-2';

  const fileInfo = document.createElement('div');
  fileInfo.className = 'flex items-center space-x-2 flex-1 min-w-0';

  const icon = document.createElement('span');
  icon.className = 'flex-shrink-0';
  icon.innerHTML = `<svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>`;

  const filename = document.createElement('span');
  filename.className = 'font-semibold text-gray-800 truncate';
  filename.textContent = doc.filename;
  filename.title = doc.filename; // Tooltip pour nom complet

  fileInfo.appendChild(icon);
  fileInfo.appendChild(filename);

  // Boutons d'action
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'flex items-center space-x-2 flex-shrink-0';

  // Bouton pour visualiser le PDF
  const viewButton = document.createElement('button');
  viewButton.className = 'px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors';
  viewButton.textContent = 'Voir';
  viewButton.title = 'Visualiser le PDF';
  viewButton.setAttribute('aria-label', `Visualiser ${doc.filename}`);
  viewButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showPDFViewer(doc.file, doc.filename);
  });

  // Bouton pour extraire le texte (si pas encore extrait)
  if (!doc.extractedText && doc.status !== 'extracting') {
    const extractButton = document.createElement('button');
    extractButton.className = 'px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors';
    extractButton.textContent = 'Extraire';
    extractButton.title = 'Extraire le texte du PDF';
    extractButton.setAttribute('aria-label', `Extraire ${doc.filename}`);
    extractButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleExtraction(doc.id);
    });
    actionsContainer.appendChild(extractButton);
  }

  // Indicateur d'extraction en cours
  if (doc.status === 'extracting') {
    const extractingIndicator = document.createElement('span');
    extractingIndicator.className = 'px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded animate-pulse';
    extractingIndicator.textContent = 'Extraction...';
    actionsContainer.appendChild(extractingIndicator);
  }

  actionsContainer.appendChild(viewButton);

  const deleteButton = document.createElement('button');
  deleteButton.className = 'ml-4 text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1 transition-colors flex-shrink-0';
  deleteButton.innerHTML = '×';
  deleteButton.title = 'Supprimer';
  deleteButton.setAttribute('aria-label', `Supprimer ${doc.filename}`);
  deleteButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Voulez-vous supprimer "${doc.filename}" ?`)) {
      removeDocument(doc.id);
    }
  });

  header.appendChild(fileInfo);
  header.appendChild(actionsContainer);
  header.appendChild(deleteButton);

  // Métadonnées
  const metadata = document.createElement('div');
  metadata.className = 'flex items-center space-x-4 text-sm text-gray-600 mt-2';

  const size = document.createElement('span');
  size.textContent = formatFileSize(doc.size);

  const date = document.createElement('span');
  date.textContent = doc.uploadedAt.toLocaleTimeString();

  const statusBadge = createStatusBadge(doc.status);

  metadata.appendChild(size);
  metadata.appendChild(document.createTextNode('•'));
  metadata.appendChild(date);
  metadata.appendChild(document.createTextNode('•'));
  metadata.appendChild(statusBadge);

  // Stats d'extraction si disponible
  if (doc.extractedText) {
    const statsContainer = document.createElement('div');
    statsContainer.className = 'mt-2 flex items-center space-x-2 text-sm text-gray-700';
    
    const pagesIcon = document.createElement('span');
    pagesIcon.textContent = '📊';
    
    // Compter les chunks pour ce document
    const docChunks = state.chunks.filter(c => c.docId === doc.id);
    const chunksInfo = docChunks.length > 0 ? ` • ${docChunks.length} chunks` : '';
    
    const statsText = document.createElement('span');
    statsText.textContent = `${doc.pageCount} pages • ${doc.charCount.toLocaleString()} caractères${chunksInfo}`;
    
    statsContainer.appendChild(pagesIcon);
    statsContainer.appendChild(statsText);
    metadata.appendChild(statsContainer);
  }

  // Preview du texte extrait
  if (doc.extractedText) {
    const previewContainer = document.createElement('div');
    previewContainer.className = 'mt-3 border-t border-gray-200 pt-3';
    
    const previewTitle = document.createElement('div');
    previewTitle.className = 'flex items-center justify-between mb-2';
    
    const previewLabel = document.createElement('span');
    previewLabel.className = 'text-sm font-semibold text-gray-700';
    previewLabel.textContent = 'Preview texte extrait';
    
    previewTitle.appendChild(previewLabel);
    
    const previewText = document.createElement('div');
    previewText.className = 'bg-gray-50 rounded p-3 text-sm text-gray-700 max-h-32 overflow-y-auto border border-gray-200';
    
    // Afficher les 500 premiers caractères avec option d'expansion
    const previewLength = 500;
    const isLong = doc.extractedText.length > previewLength;
    const displayText = isLong ? doc.extractedText.substring(0, previewLength) + '...' : doc.extractedText;
    
    previewText.textContent = displayText;
    previewText.style.whiteSpace = 'pre-wrap';
    previewText.style.wordBreak = 'break-word';
    
    previewContainer.appendChild(previewTitle);
    previewContainer.appendChild(previewText);
    
    // Bouton pour voir tout le texte si long
    if (isLong) {
      let expanded = false;
      const expandButton = document.createElement('button');
      expandButton.className = 'mt-2 text-xs text-blue-600 hover:text-blue-800';
      expandButton.textContent = 'Voir tout le texte';
      expandButton.addEventListener('click', () => {
        if (!expanded) {
          previewText.textContent = doc.extractedText;
          expandButton.textContent = 'Réduire';
          previewText.classList.remove('max-h-32');
          expanded = true;
        } else {
          previewText.textContent = displayText;
          expandButton.textContent = 'Voir tout le texte';
          previewText.classList.add('max-h-32');
          expanded = false;
        }
      });
      previewContainer.appendChild(expandButton);
    }
    
    card.appendChild(previewContainer);
  }

  // Message d'erreur si présent
  if (doc.error) {
    const errorMsg = document.createElement('div');
    errorMsg.className = 'mt-2 text-sm text-red-600';
    errorMsg.textContent = `Erreur: ${doc.error}`;
    card.appendChild(errorMsg);
  }

  card.appendChild(header);
  card.appendChild(metadata);

  return card;
}

/**
 * Gère l'extraction de texte d'un document
 * @param {string} docId - L'ID du document à extraire
 */
async function handleExtraction(docId) {
  const doc = state.docs.find(d => d.id === docId);
  if (!doc) return;

  // Mettre à jour le statut
  updateDocumentStatus(docId, 'extracting');
  renderFileList(); // Mise à jour immédiate de l'UI

  try {
    // Extraire le texte
    const extractionData = await extractTextFromPDF(doc.file);

    // Mettre à jour le document avec les données d'extraction
    updateDocumentExtraction(docId, extractionData);

    // Créer les chunks (500 chars cible, 1 phrase d'overlap)
    const chunks = createChunksForDocument(
      extractionData.text,
      doc.filename,
      docId,
      500,  // targetSize
      1     // overlapSentences
    );

    // Ajouter les chunks au state
    addChunks(chunks);

    // Re-rendre la liste
    renderFileList();

  } catch (error) {
    console.error('Erreur extraction:', error);
    updateDocumentStatus(docId, 'error', error.message);
    renderFileList();
  }
}

/**
 * Crée un badge de statut coloré
 * @param {string} status - Le statut du document
 * @returns {HTMLElement} - Le badge
 */
function createStatusBadge(status) {
  const badge = document.createElement('span');
  
  const statusConfig = {
    uploaded: { text: 'Uploaded', class: 'bg-green-100 text-green-800' },
    extracting: { text: 'Extracting...', class: 'bg-yellow-100 text-yellow-800' },
    extracted: { text: 'Extracted', class: 'bg-blue-100 text-blue-800' },
    processing: { text: 'Processing', class: 'bg-yellow-100 text-yellow-800' },
    error: { text: 'Error', class: 'bg-red-100 text-red-800' }
  };

  const config = statusConfig[status] || statusConfig.uploaded;
  
  badge.className = `px-2 py-1 rounded text-xs font-medium ${config.class}`;
  badge.textContent = config.text;

  return badge;
}


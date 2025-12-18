/**
 * Point d'entrée principal de l'application
 * Design minimaliste avec accents de couleur primaire
 */

import { state, addLog } from './state/state.js';
import { createLogsPanel, renderInitialLogs } from './ui/Logs.js';
import { createDropzone } from './ui/Dropzone.js';
import { createFileList } from './ui/FileList.js';
import { createIngestionPanel } from './ui/IngestionPanel.js';
import { showQuickUploadWorkflow } from './ui/QuickUpload.js';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  addLog('info', 'DOM loaded, initializing UI...');
  
  const app = document.getElementById('app');
  if (!app) {
    console.error('App container not found!');
    return;
  }
  
  createMainUI(app);
  addLog('success', 'UI initialized successfully');
});

/**
 * Crée la structure principale de l'interface
 */
function createMainUI(container) {
  container.className = 'h-screen bg-gray-50 flex flex-col overflow-hidden';
  
  // Header
  const header = document.createElement('header');
  header.className = 'bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0';
  header.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-bold text-gray-900">Literature Reviewer</h1>
          <p class="text-xs text-gray-500">Local AI Research Assistant</p>
        </div>
      </div>
      <div id="header-stats" class="flex items-center gap-5 text-sm">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-blue-500 rounded-full"></span>
          <span class="text-gray-600"><span id="stat-docs" class="font-semibold text-gray-900">0</span> docs</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-purple-500 rounded-full"></span>
          <span class="text-gray-600"><span id="stat-chunks" class="font-semibold text-gray-900">0</span> chunks</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          <span class="text-gray-600"><span id="stat-vectors" class="font-semibold text-gray-900">0</span> vectors</span>
        </div>
      </div>
    </div>
  `;
  
  // Container principal - 2 colonnes
  const mainContainer = document.createElement('div');
  mainContainer.className = 'flex-1 flex gap-4 p-4 min-h-0 overflow-hidden';
  
  // === COLONNE GAUCHE : Documents ===
  const leftColumn = document.createElement('div');
  leftColumn.id = 'left-column';
  leftColumn.className = 'w-1/2 flex flex-col gap-3 min-h-0';
  
  // Section Upload compacte
  const uploadSection = document.createElement('div');
  uploadSection.id = 'upload-section';
  uploadSection.className = 'bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0';
  uploadSection.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-bold text-gray-900">Upload Documents</h2>
      <label class="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
        Quick Upload
        <input type="file" id="quick-upload-input" accept=".pdf,application/pdf" multiple 
               style="position:absolute;left:-9999px;width:1px;height:1px;" />
      </label>
    </div>
  `;
  uploadSection.appendChild(createDropzone());
  
  // Section Liste des documents
  const docsSection = document.createElement('div');
  docsSection.className = 'bg-white rounded-xl border border-gray-200 flex-1 flex flex-col min-h-0 overflow-hidden';
  docsSection.innerHTML = `
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
      <h2 class="text-sm font-bold text-gray-900">Documents</h2>
      <button id="extract-all-btn" class="px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors">
        Extract All
      </button>
    </div>
  `;
  const fileListContainer = document.createElement('div');
  fileListContainer.className = 'flex-1 overflow-y-auto p-3';
  fileListContainer.appendChild(createFileList());
  docsSection.appendChild(fileListContainer);
  
  leftColumn.appendChild(uploadSection);
  leftColumn.appendChild(docsSection);
  
  // === COLONNE DROITE : Ingestion Panel (avec logs intégrés) ===
  const rightColumn = document.createElement('div');
  rightColumn.className = 'w-1/2 flex flex-col min-h-0';
  rightColumn.appendChild(createIngestionPanel());
  
  mainContainer.appendChild(leftColumn);
  mainContainer.appendChild(rightColumn);
  
  // Assembler (plus de footer séparé)
  container.appendChild(header);
  container.appendChild(mainContainer);
  
  setupBulkActions();
  updateHeaderStats();
  setInterval(updateHeaderStats, 1000);
}

/**
 * Configure les actions groupées
 */
function setupBulkActions() {
  const extractAllBtn = document.getElementById('extract-all-btn');
  if (extractAllBtn) {
    extractAllBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('action:extractAll'));
    });
  }

  const quickUploadInput = document.getElementById('quick-upload-input');
  if (quickUploadInput) {
    quickUploadInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        showQuickUploadWorkflow(files);
      }
      e.target.value = '';
    });
  }
}

/**
 * Met à jour les stats dans le header
 */
function updateHeaderStats() {
  const docsEl = document.getElementById('stat-docs');
  const chunksEl = document.getElementById('stat-chunks');
  const vectorsEl = document.getElementById('stat-vectors');
  
  if (docsEl) docsEl.textContent = state.docs.length;
  if (chunksEl) chunksEl.textContent = state.chunks.length;
  if (vectorsEl) vectorsEl.textContent = state.vectorStore.length;
}

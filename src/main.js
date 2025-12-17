/**
 * Point d'entrée principal de l'application
 * Initialise l'UI et wire les composants
 */

import { state, addLog } from './state/state.js';
import { createLogsPanel, renderInitialLogs } from './ui/Logs.js';
import { createDebugPanel } from './ui/Debug.js';
import { createDropzone } from './ui/Dropzone.js';
import { createFileList } from './ui/FileList.js';
import { createIngestionPanel } from './ui/IngestionPanel.js';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  addLog('info', 'DOM loaded, initializing UI...');
  
  const app = document.getElementById('app');
  if (!app) {
    console.error('App container not found!');
    return;
  }
  
  // Créer la structure principale de l'UI
  createMainUI(app);
  
  addLog('success', 'UI initialized successfully');
});

/**
 * Crée la structure principale de l'interface
 */
function createMainUI(container) {
  container.className = 'min-h-screen bg-gray-100 flex flex-col';
  
  // Header compact
  const header = document.createElement('header');
  header.className = 'bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 shadow-lg';
  header.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Local LLM Literature Reviewer</h1>
        <p class="text-blue-100 text-sm">Privacy-first AI research assistant</p>
      </div>
      <div id="header-stats" class="flex items-center gap-4 text-sm">
        <span class="px-3 py-1 bg-white/20 rounded"><span id="stat-docs">0</span> docs</span>
        <span class="px-3 py-1 bg-white/20 rounded"><span id="stat-chunks">0</span> chunks</span>
        <span class="px-3 py-1 bg-white/20 rounded"><span id="stat-vectors">0</span> vectors</span>
      </div>
    </div>
  `;
  
  // Container principal - 2 colonnes égales
  const mainContainer = document.createElement('div');
  mainContainer.className = 'flex-1 flex gap-4 p-4 overflow-hidden';
  
  // === COLONNE GAUCHE : Documents ===
  const leftColumn = document.createElement('div');
  leftColumn.id = 'left-column';
  leftColumn.className = 'w-1/2 flex flex-col gap-4 overflow-hidden';
  
  // Section Upload
  const uploadSection = document.createElement('div');
  uploadSection.id = 'upload-section';
  uploadSection.className = 'bg-white rounded-lg shadow p-4';
  uploadSection.innerHTML = '<h2 class="text-lg font-bold text-gray-800 mb-3">Upload Documents</h2>';
  uploadSection.appendChild(createDropzone());
  
  // Section Liste des documents
  const docsSection = document.createElement('div');
  docsSection.className = 'bg-white rounded-lg shadow p-4 flex-1 overflow-hidden flex flex-col';
  docsSection.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-bold text-gray-800">Documents</h2>
      <div class="flex gap-2">
        <button id="extract-all-btn" class="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors">
          Extraire tout
        </button>
      </div>
    </div>
  `;
  const fileListContainer = document.createElement('div');
  fileListContainer.className = 'flex-1 overflow-y-auto';
  fileListContainer.appendChild(createFileList());
  docsSection.appendChild(fileListContainer);
  
  leftColumn.appendChild(uploadSection);
  leftColumn.appendChild(docsSection);
  
  // === COLONNE DROITE : Ingestion & Vector Store ===
  const rightColumn = document.createElement('div');
  rightColumn.className = 'w-1/2 flex flex-col gap-4 overflow-hidden';
  
  // Panel d'ingestion complet
  const ingestionPanel = createIngestionPanel();
  rightColumn.appendChild(ingestionPanel);
  
  // Assembler
  mainContainer.appendChild(leftColumn);
  mainContainer.appendChild(rightColumn);
  
  // Footer avec logs et debug
  const footer = document.createElement('div');
  footer.className = 'bg-white border-t p-2 flex gap-4';
  
  const logsContainer = document.createElement('div');
  logsContainer.className = 'flex-1 max-h-32 overflow-hidden';
  logsContainer.appendChild(createLogsPanel());
  
  const debugContainer = document.createElement('div');
  debugContainer.className = 'w-64';
  debugContainer.appendChild(createDebugPanel());
  
  footer.appendChild(logsContainer);
  footer.appendChild(debugContainer);
  
  // Assembler tout
  container.appendChild(header);
  container.appendChild(mainContainer);
  container.appendChild(footer);
  
  // Setup des boutons d'action groupée
  setupBulkActions();
  
  // Mettre à jour les stats
  updateHeaderStats();
  setInterval(updateHeaderStats, 1000);
  
  // Rendre les logs initiaux
  const logsPanel = logsContainer.querySelector('#logs-panel');
  if (logsPanel) {
    renderInitialLogs(state.logs, logsPanel);
  }
}

/**
 * Configure les actions groupées
 */
function setupBulkActions() {
  const extractAllBtn = document.getElementById('extract-all-btn');
  if (extractAllBtn) {
    extractAllBtn.addEventListener('click', () => {
      // Déclencher l'extraction pour tous les docs non extraits
      const event = new CustomEvent('action:extractAll');
      window.dispatchEvent(event);
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

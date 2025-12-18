/**
 * Point d'entrée principal de l'application
 * Layout avec onglets Documents / Chat
 */

import { state, addLog } from './state/state.js';
import { createDropzone } from './ui/Dropzone.js';
import { createFileList } from './ui/FileList.js';
import { createIngestionPanel } from './ui/IngestionPanel.js';
import { createChatPanel } from './ui/ChatPanel.js';
import { createSystemControls } from './ui/SystemControls.js';
import { createHistoryPanel } from './ui/HistoryPanel.js';
// VisualizationTabs removed - agents now integrated in ChatPanel

// Import des agents pour enregistrer leurs event listeners
import './agents/HubAgent.js';
import './agents/AtlasAgent.js';
import './agents/TimelineAgent.js';
import './agents/ScrollyAgent.js';
import './utils/exportViz.js';

let currentTab = 'documents';

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
  
  // Header avec onglets
  const header = document.createElement('header');
  header.className = 'bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0';
  header.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <h1 class="text-lg font-bold text-gray-900">Literature Reviewer</h1>
            <p class="text-xs text-gray-500">Local AI Research Assistant</p>
          </div>
        </div>
        
        <!-- Onglets principaux -->
        <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button data-main-tab="documents" class="main-tab px-4 py-2 text-sm font-medium rounded-md bg-white text-gray-900 shadow-sm">
            Documents
          </button>
          <button data-main-tab="chat" class="main-tab px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900">
            Chat
          </button>
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
  
  // Container principal
  const mainContainer = document.createElement('div');
  mainContainer.id = 'main-container';
  mainContainer.className = 'flex-1 flex gap-4 p-4 min-h-0 overflow-hidden';
  
  container.appendChild(header);
  container.appendChild(mainContainer);
  
  // Creer les deux vues
  createDocumentsView(mainContainer);
  createChatView(mainContainer);
  
  // Setup tabs
  setupMainTabs(header);
  setupBulkActions();
  updateHeaderStats();
  setInterval(updateHeaderStats, 1000);
  
  // Afficher la vue par defaut
  showTab('documents');
}

/**
 * Cree la vue Documents (ingestion)
 */
function createDocumentsView(container) {
  const view = document.createElement('div');
  view.id = 'documents-view';
  view.className = 'flex-1 flex gap-4 min-h-0';
  
  // Colonne gauche : Upload + Liste
  const leftColumn = document.createElement('div');
  leftColumn.className = 'w-1/2 flex flex-col gap-3 min-h-0';
  
  // Section Upload (dropzone lance automatiquement Quick Upload)
  const uploadSection = document.createElement('div');
  uploadSection.className = 'bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0';
  uploadSection.innerHTML = `
    <div class="mb-3">
      <h2 class="text-sm font-bold text-gray-900">Upload Documents</h2>
      <p class="text-xs text-gray-500 mt-1">Glissez vos PDFs pour lancer le workflow automatique</p>
    </div>
  `;
  uploadSection.appendChild(createDropzone());
  
  // Section Liste
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
  
  // Colonne droite : Ingestion Panel
  const rightColumn = document.createElement('div');
  rightColumn.className = 'w-1/2 flex flex-col min-h-0';
  rightColumn.appendChild(createIngestionPanel());
  
  view.appendChild(leftColumn);
  view.appendChild(rightColumn);
  container.appendChild(view);
}

/**
 * Cree la vue Chat
 */
function createChatView(container) {
  const view = document.createElement('div');
  view.id = 'chat-view';
  view.className = 'flex-1 flex gap-4 min-h-0 hidden';
  
  // Colonne gauche : Chat (agents intégrés directement)
  const leftColumn = document.createElement('div');
  leftColumn.className = 'flex-1 flex flex-col min-h-0';
  leftColumn.appendChild(createChatPanel());
  
  // Colonne droite : System Controls
  const rightColumn = document.createElement('div');
  rightColumn.className = 'w-80 flex-shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto';
  rightColumn.appendChild(createSystemControls());
  
  // RAG Status compact
  const ragStatus = document.createElement('div');
  ragStatus.className = 'bg-white rounded-xl border border-gray-200 p-4';
  ragStatus.innerHTML = `
    <h3 class="text-sm font-bold text-gray-900 mb-3">Knowledge Base</h3>
    <div class="space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">Documents</span>
        <span id="rag-docs" class="font-semibold text-gray-900">0</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">Chunks</span>
        <span id="rag-chunks" class="font-semibold text-gray-900">0</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">Embeddings</span>
        <span id="rag-vectors" class="font-semibold text-gray-900">0</span>
      </div>
    </div>
  `;
  rightColumn.appendChild(ragStatus);
  
  // Historique des conversations
  rightColumn.appendChild(createHistoryPanel());
  
  view.appendChild(leftColumn);
  view.appendChild(rightColumn);
  container.appendChild(view);
}

/**
 * Setup onglets principaux
 */
function setupMainTabs(header) {
  const tabs = header.querySelectorAll('.main-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.mainTab;
      showTab(tabName);
      
      // Update styles
      tabs.forEach(t => {
        if (t.dataset.mainTab === tabName) {
          t.className = 'main-tab px-4 py-2 text-sm font-medium rounded-md bg-white text-gray-900 shadow-sm';
        } else {
          t.className = 'main-tab px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900';
        }
      });
    });
  });
}

/**
 * Affiche un onglet
 */
function showTab(tabName) {
  currentTab = tabName;
  
  const docsView = document.getElementById('documents-view');
  const chatView = document.getElementById('chat-view');
  
  if (tabName === 'documents') {
    docsView?.classList.remove('hidden');
    chatView?.classList.add('hidden');
  } else {
    docsView?.classList.add('hidden');
    chatView?.classList.remove('hidden');
    updateRAGStatus();
  }
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

/**
 * Met à jour le status RAG dans la vue chat
 */
function updateRAGStatus() {
  const ragDocs = document.getElementById('rag-docs');
  const ragChunks = document.getElementById('rag-chunks');
  const ragVectors = document.getElementById('rag-vectors');
  
  if (ragDocs) ragDocs.textContent = state.docs.length;
  if (ragChunks) ragChunks.textContent = state.chunks.length;
  if (ragVectors) ragVectors.textContent = state.vectorStore.length;
}

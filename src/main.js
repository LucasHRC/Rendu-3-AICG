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
import { createHandsFreePanel, toggleHandsFree, isHandsFreeActive, stopTTS } from './ui/HandsFreePanel.js';
import { showSettingsPanel } from './ui/SettingsPanel.js';
import { showLibraryModal } from './ui/LibraryModal.js';
// VisualizationTabs removed - agents now integrated in ChatPanel

// Agents supprimés - remplacés par Revue RAG unifiée

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
          <img src="./logo-llm-pdf-rag.avif" alt="Logo" class="w-10 h-10 rounded-xl shadow-sm object-cover" />
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
          <button data-main-tab="handsfree" class="main-tab px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900">
            <span class="flex items-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
              </svg>
              Hands-Free
            </span>
          </button>
        </div>
      </div>
      
      <!-- Right side: Library + Settings buttons -->
      <div class="flex items-center gap-2">
        <button id="library-btn" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Bibliothèque">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </button>
        <button id="settings-btn" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Paramètres">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </button>
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

      <!-- Loading Spinner (simple) -->
      <div id="model-loading-spinner" class="hidden flex items-center gap-2 ml-4">
        <div class="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
        <span id="model-loading-text" class="text-xs text-gray-600">Chargement...</span>
      </div>
    </div>
  `;
  
  // Container principal
  const mainContainer = document.createElement('div');
  mainContainer.id = 'main-container';
  mainContainer.className = 'flex-1 flex gap-4 p-4 min-h-0 overflow-hidden';
  
  container.appendChild(header);
  container.appendChild(mainContainer);
  
  // Creer les trois vues
  createDocumentsView(mainContainer);
  createChatView(mainContainer);
  createHandsFreeView(mainContainer);
  
  // Setup tabs
  setupMainTabs(header);
  setupBulkActions();
  updateHeaderStats();
  setInterval(updateHeaderStats, 1000);
  
  // Setup settings button
  const libraryBtn = document.getElementById('library-btn');
  libraryBtn?.addEventListener('click', () => {
    showLibraryModal();
  });

  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn?.addEventListener('click', () => {
    showSettingsPanel();
  });
  
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
 * Crée la vue Hands-Free
 */
function createHandsFreeView(container) {
  const view = document.createElement('div');
  view.id = 'handsfree-view';
  view.className = 'flex-1 flex gap-4 min-h-0 hidden';
  
  // Colonne principale : Hands-Free Panel
  const mainColumn = document.createElement('div');
  mainColumn.className = 'flex-1 flex flex-col min-h-0 max-w-6xl mx-auto w-full px-4';
  mainColumn.appendChild(createHandsFreePanel());
  
  // Colonne droite : System Controls + RAG Status
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
        <span id="hf-rag-docs" class="font-semibold text-gray-900">0</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">Chunks</span>
        <span id="hf-rag-chunks" class="font-semibold text-gray-900">0</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">Embeddings</span>
        <span id="hf-rag-vectors" class="font-semibold text-gray-900">0</span>
      </div>
    </div>
  `;
  rightColumn.appendChild(ragStatus);
  
  // Shortcuts help
  const shortcutsHelp = document.createElement('div');
  shortcutsHelp.className = 'bg-white rounded-xl border border-gray-200 p-4';
  shortcutsHelp.innerHTML = `
    <h3 class="text-sm font-bold text-gray-900 mb-3">Raccourcis clavier</h3>
    <div class="space-y-2 text-xs">
      <div class="flex items-center justify-between">
        <span class="text-gray-500">Toggle ON/OFF</span>
        <kbd class="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">Espace</kbd>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-gray-500">Stop / Annuler</span>
        <kbd class="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">Echap</kbd>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-gray-500">Envoyer</span>
        <kbd class="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">Ctrl+Entrée</kbd>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-gray-500">Mute micro</span>
        <kbd class="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">M</kbd>
      </div>
    </div>
  `;
  rightColumn.appendChild(shortcutsHelp);
  
  view.appendChild(mainColumn);
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
  const handsfreeView = document.getElementById('handsfree-view');
  
  // Cacher toutes les vues
  docsView?.classList.add('hidden');
  chatView?.classList.add('hidden');
  handsfreeView?.classList.add('hidden');
  
  // Afficher la vue demandée
  if (tabName === 'documents') {
    docsView?.classList.remove('hidden');
  } else if (tabName === 'chat') {
    chatView?.classList.remove('hidden');
    updateRAGStatus();
  } else if (tabName === 'handsfree') {
    handsfreeView?.classList.remove('hidden');
    updateHandsFreeRAGStatus();
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

  // Stats selon exigences: total docs importés VS docs retrouvés dans la réponse
  const totalDocs = state.docs.length;
  const extractedDocs = state.docs.filter(d => d.status === 'extracted').length;

  if (docsEl) docsEl.textContent = `${extractedDocs}/${totalDocs}`;
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

/**
 * Met à jour le status RAG dans la vue Hands-Free
 */
function updateHandsFreeRAGStatus() {
  const ragDocs = document.getElementById('hf-rag-docs');
  const ragChunks = document.getElementById('hf-rag-chunks');
  const ragVectors = document.getElementById('hf-rag-vectors');
  
  if (ragDocs) ragDocs.textContent = state.docs.length;
  if (ragChunks) ragChunks.textContent = state.chunks.length;
  if (ragVectors) ragVectors.textContent = state.vectorStore.length;
}

/**
 * Setup raccourcis clavier globaux pour Hands-Free
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ne pas interférer avec les inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      // Sauf pour Escape
      if (e.key !== 'Escape') return;
    }
    
    // Seulement si on est sur l'onglet Hands-Free
    if (currentTab !== 'handsfree') return;
    
    switch (e.key) {
      case ' ': // Espace - Toggle
        if (e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          toggleHandsFree();
        }
        break;
      case 'Escape': // Echap - Stop / Annuler
        e.preventDefault();
        stopTTS();
        // Annuler aussi le compte à rebours si actif
        const countdownEl = document.getElementById('hf-countdown');
        const cancelBtn = document.getElementById('hf-cancel-btn');
        if (countdownEl && !countdownEl.classList.contains('hidden')) {
          // Simuler un clic sur le bouton annuler
          if (cancelBtn) {
            cancelBtn.click();
          }
        }
        break;
      case 'm':
      case 'M': // Mute (toggle)
        if (!e.ctrlKey && !e.metaKey) {
          toggleHandsFree();
        }
        break;
    }
  });
}

// Initialiser les raccourcis après le DOM
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(setupKeyboardShortcuts, 100);
});

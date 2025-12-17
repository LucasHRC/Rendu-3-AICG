/**
 * Point d'entrée principal de l'application
 * Initialise l'UI et wire les composants
 */

import { state, addLog } from './state/state.js';
import { createLogsPanel, renderInitialLogs } from './ui/Logs.js';
import { createDebugPanel } from './ui/Debug.js';
import { createDropzone } from './ui/Dropzone.js';
import { createFileList } from './ui/FileList.js';

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
  // Header
  const header = document.createElement('header');
  header.className = 'bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 mb-6 rounded-lg shadow-lg';
  header.innerHTML = `
    <h1 class="text-3xl font-bold mb-2">📚 Local LLM Multi-Agent Literature Reviewer</h1>
    <p class="text-blue-100">Privacy-first AI research assistant - Tout fonctionne dans votre navigateur</p>
  `;
  
  // Container principal avec grid layout
  const mainGrid = document.createElement('div');
  mainGrid.className = 'grid grid-cols-1 lg:grid-cols-3 gap-6';
  
  // Colonne principale (centre)
  const mainColumn = document.createElement('div');
  mainColumn.className = 'lg:col-span-2 space-y-6';
  
  // Zone de contenu principal
  const mainContent = document.createElement('div');
  mainContent.id = 'main-content';
  mainContent.className = 'bg-white p-6 rounded-lg shadow space-y-6';
  
  // Zone de drag & drop
  const dropzone = createDropzone();
  mainContent.appendChild(dropzone);
  
  // Liste des fichiers
  const fileList = createFileList();
  mainContent.appendChild(fileList);
  
  mainColumn.appendChild(mainContent);
  
  // Colonne latérale (droite)
  const sidebar = document.createElement('div');
  sidebar.className = 'space-y-6';
  
  // Panel de logs
  const logsPanel = createLogsPanel();
  sidebar.appendChild(logsPanel);
  
  // Panel de debug
  const debugPanel = createDebugPanel();
  sidebar.appendChild(debugPanel);
  
  // Assembler la grille
  mainGrid.appendChild(mainColumn);
  mainGrid.appendChild(sidebar);
  
  // Footer avec stats
  const footer = document.createElement('footer');
  footer.className = 'mt-6 bg-gray-100 p-4 rounded-lg';
  footer.id = 'app-footer';
  updateFooter(footer);
  
  // Assembler tout
  container.appendChild(header);
  container.appendChild(mainGrid);
  container.appendChild(footer);
  
  // Rendre les logs initiaux
  renderInitialLogs(state.logs, logsPanel);
  
  // Mettre à jour le footer périodiquement
  setInterval(() => updateFooter(footer), 1000);
}

/**
 * Met à jour le footer avec les stats de l'application
 */
function updateFooter(footer) {
  const stats = {
    docs: state.docs.length,
    chunks: state.chunks.length,
    vectorStore: state.vectorStore.length,
    chatMessages: state.chatHistory.length,
    modelStatus: state.model.loaded ? '✅ Ready' : state.model.loading ? '⏳ Loading...' : '❌ Not loaded'
  };
  
  footer.innerHTML = `
    <div class="flex flex-wrap gap-4 text-sm text-gray-600">
      <span><strong>Documents:</strong> ${stats.docs}</span>
      <span><strong>Chunks:</strong> ${stats.chunks}</span>
      <span><strong>Vector Store:</strong> ${stats.vectorStore}</span>
      <span><strong>Chat Messages:</strong> ${stats.chatMessages}</span>
      <span><strong>Model:</strong> ${stats.modelStatus}</span>
    </div>
  `;
}


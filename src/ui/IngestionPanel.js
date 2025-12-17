/**
 * Panel d'ingestion complet - Gestion des chunks et du vector store
 */

import { state, getChunksStats, getVectorStoreStats, addEmbedding, addLog, addChunks } from '../state/state.js';
import { initEmbeddingModel, generateEmbeddingsForChunks, isModelLoaded } from '../rag/embeddings.js';

// État pour le mode importé
let importedMode = false;

/**
 * Crée le panel d'ingestion
 */
export function createIngestionPanel() {
  const panel = document.createElement('div');
  panel.id = 'ingestion-panel';
  panel.className = 'bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden';
  
  // Header avec onglets
  const header = document.createElement('div');
  header.className = 'border-b bg-gray-50 px-4 py-3';
  header.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-bold text-gray-800">Ingestion & Vector Store</h2>
      <div class="flex items-center gap-2">
        <button id="import-db-btn" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
          Importer
        </button>
        <button id="export-db-btn" class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors">
          Exporter
        </button>
        <span id="webgpu-badge" class="px-2 py-1 text-xs rounded ${navigator.gpu ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
          ${navigator.gpu ? 'WebGPU' : 'WASM'}
        </span>
      </div>
    </div>
    <div id="imported-mode-banner" class="hidden mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
      Mode base importee - Upload desactive
      <button id="clear-imported-btn" class="ml-2 text-blue-600 underline hover:text-blue-800">Effacer</button>
    </div>
    <div class="flex gap-1">
      <button data-tab="chunks" class="tab-btn px-4 py-2 text-sm font-medium rounded-t bg-white border-b-2 border-blue-500 text-blue-600">
        Chunks
      </button>
      <button data-tab="vectors" class="tab-btn px-4 py-2 text-sm font-medium rounded-t text-gray-500 hover:text-gray-700">
        Vector Store
      </button>
      <button data-tab="stats" class="tab-btn px-4 py-2 text-sm font-medium rounded-t text-gray-500 hover:text-gray-700">
        Stats
      </button>
    </div>
  `;
  
  // Section Embeddings (toujours visible)
  const embeddingsSection = document.createElement('div');
  embeddingsSection.className = 'px-4 py-3 bg-purple-50 border-b';
  embeddingsSection.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-purple-800">Embeddings</span>
        <span id="embedding-status" class="text-sm text-purple-600">Pret</span>
      </div>
      <span id="embedding-count" class="text-sm text-gray-600">0 / 0</span>
    </div>
    <div id="embedding-progress" class="hidden mb-2">
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div id="embedding-progress-bar" class="bg-purple-600 h-2 rounded-full transition-all" style="width: 0%"></div>
      </div>
      <div id="embedding-progress-text" class="text-xs text-gray-500 mt-1"></div>
    </div>
    <button id="generate-embeddings-btn" class="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
      Generer Embeddings
    </button>
  `;
  
  // Contenu des onglets
  const content = document.createElement('div');
  content.id = 'ingestion-content';
  content.className = 'flex-1 overflow-y-auto p-4';
  
  panel.appendChild(header);
  panel.appendChild(embeddingsSection);
  panel.appendChild(content);
  
  // Setup
  setTimeout(() => {
    setupTabs(panel);
    setupEmbeddingsButton();
    setupImportExport();
    renderChunksTab();
    updateEmbeddingUI();
  }, 0);
  
  // Écouter les événements
  window.addEventListener('state:chunksAdded', () => {
    renderCurrentTab();
    updateEmbeddingUI();
  });
  window.addEventListener('state:chunksRemoved', () => {
    renderCurrentTab();
    updateEmbeddingUI();
  });
  window.addEventListener('state:embeddingAdded', () => {
    renderCurrentTab();
    updateEmbeddingUI();
  });
  
  return panel;
}

let currentTab = 'chunks';

/**
 * Configure les onglets
 */
function setupTabs(panel) {
  const tabs = panel.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      
      // Update styles
      tabs.forEach(t => {
        t.className = 'tab-btn px-4 py-2 text-sm font-medium rounded-t ' +
          (t.dataset.tab === currentTab 
            ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
            : 'text-gray-500 hover:text-gray-700');
      });
      
      renderCurrentTab();
    });
  });
}

/**
 * Configure l'import/export
 */
function setupImportExport() {
  const importBtn = document.getElementById('import-db-btn');
  const exportBtn = document.getElementById('export-db-btn');
  const clearBtn = document.getElementById('clear-imported-btn');
  
  if (importBtn) {
    importBtn.addEventListener('click', importDatabase);
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', exportDatabase);
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', clearImportedMode);
  }
}

/**
 * Exporte la base de données (chunks + embeddings)
 */
function exportDatabase() {
  const data = {
    version: 1,
    exportDate: new Date().toISOString(),
    chunks: state.chunks,
    vectorStore: state.vectorStore.map(v => ({
      ...v,
      vector: Array.from(v.vector) // Convertir Float32Array en Array
    }))
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `vectordb-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  addLog('success', `Base exportee: ${state.chunks.length} chunks, ${state.vectorStore.length} embeddings`);
}

/**
 * Importe une base de données
 */
function importDatabase() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.style.display = 'none';
  document.body.appendChild(input);
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    document.body.removeChild(input);
    
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.chunks || !data.vectorStore) {
        throw new Error('Format de fichier invalide');
      }
      
      // Vider les données existantes
      state.chunks = [];
      state.vectorStore = [];
      state.docs = [];
      
      // Importer les chunks
      state.chunks = data.chunks;
      
      // Importer les embeddings (reconvertir en Float32Array)
      state.vectorStore = data.vectorStore.map(v => ({
        ...v,
        vector: new Float32Array(v.vector)
      }));
      
      // Activer le mode importé
      setImportedMode(true);
      
      // Rafraîchir l'UI
      renderCurrentTab();
      updateEmbeddingUI();
      
      addLog('success', `Base importee: ${state.chunks.length} chunks, ${state.vectorStore.length} embeddings`);
      
    } catch (error) {
      addLog('error', `Erreur import: ${error.message}`);
    }
  });
  
  input.click();
}

/**
 * Active/désactive le mode importé
 */
function setImportedMode(enabled) {
  importedMode = enabled;
  
  const banner = document.getElementById('imported-mode-banner');
  const uploadSection = document.getElementById('upload-section');
  const leftColumn = document.getElementById('left-column');
  
  if (banner) {
    banner.classList.toggle('hidden', !enabled);
  }
  
  if (uploadSection) {
    uploadSection.classList.toggle('opacity-50', enabled);
    uploadSection.classList.toggle('pointer-events-none', enabled);
  }
  
  // Émettre un événement pour notifier les autres composants
  window.dispatchEvent(new CustomEvent('mode:imported', { detail: { enabled } }));
}

/**
 * Efface le mode importé et réinitialise
 */
function clearImportedMode() {
  state.chunks = [];
  state.vectorStore = [];
  state.docs = [];
  
  setImportedMode(false);
  renderCurrentTab();
  updateEmbeddingUI();
  
  // Rafraîchir la liste des fichiers
  window.dispatchEvent(new CustomEvent('state:docRemoved'));
  
  addLog('info', 'Base effacee');
}

/**
 * Rend l'onglet actuel
 */
function renderCurrentTab() {
  switch (currentTab) {
    case 'chunks':
      renderChunksTab();
      break;
    case 'vectors':
      renderVectorsTab();
      break;
    case 'stats':
      renderStatsTab();
      break;
  }
}

/**
 * Rend l'onglet Chunks
 */
function renderChunksTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  content.innerHTML = '';
  
  if (state.chunks.length === 0) {
    content.innerHTML = `
      <div class="text-center py-12 text-gray-500">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>Aucun chunk cree</p>
        <p class="text-sm mt-1">Uploadez et extrayez des PDFs ou importez une base</p>
      </div>
    `;
    return;
  }
  
  // Grouper par document
  const chunksByDoc = {};
  state.chunks.forEach(chunk => {
    if (!chunksByDoc[chunk.source]) {
      chunksByDoc[chunk.source] = [];
    }
    chunksByDoc[chunk.source].push(chunk);
  });
  
  Object.entries(chunksByDoc).forEach(([source, chunks]) => {
    const embeddedCount = chunks.filter(c => state.vectorStore.find(v => v.chunkId === c.id)).length;
    
    const section = document.createElement('div');
    section.className = 'mb-4 border rounded-lg overflow-hidden';
    
    // Header du document
    const docHeader = document.createElement('div');
    docHeader.className = 'bg-gray-50 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-100';
    docHeader.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-gray-400 transform transition-transform">&#9660;</span>
        <span class="font-medium text-gray-800 truncate" title="${source}">${source}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">${chunks.length} chunks</span>
        <span class="px-2 py-0.5 text-xs ${embeddedCount === chunks.length ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'} rounded">
          ${embeddedCount === chunks.length ? 'Vectorise' : `${embeddedCount}/${chunks.length}`}
        </span>
      </div>
    `;
    
    // Liste des chunks (collapsible)
    const chunksList = document.createElement('div');
    chunksList.className = 'divide-y max-h-64 overflow-y-auto';
    
    chunks.forEach(chunk => {
      const hasEmbedding = state.vectorStore.find(v => v.chunkId === chunk.id);
      
      const chunkItem = document.createElement('div');
      chunkItem.className = 'px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-start gap-2';
      chunkItem.innerHTML = `
        <span class="mt-0.5 w-2 h-2 rounded-full ${hasEmbedding ? 'bg-green-500' : 'bg-gray-300'}"></span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-medium text-gray-600">Chunk ${chunk.chunkIndex + 1}</span>
            <span class="text-xs text-gray-400">${chunk.charCount || chunk.text.length} chars</span>
          </div>
          <p class="text-sm text-gray-700 line-clamp-2">${chunk.text.substring(0, 150)}...</p>
        </div>
      `;
      
      chunkItem.addEventListener('click', () => showChunkDetail(chunk, hasEmbedding));
      chunksList.appendChild(chunkItem);
    });
    
    // Toggle collapse
    let collapsed = false;
    const arrow = docHeader.querySelector('span');
    docHeader.addEventListener('click', () => {
      collapsed = !collapsed;
      chunksList.classList.toggle('hidden', collapsed);
      arrow.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0)';
    });
    
    section.appendChild(docHeader);
    section.appendChild(chunksList);
    content.appendChild(section);
  });
}

/**
 * Rend l'onglet Vector Store
 */
function renderVectorsTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  content.innerHTML = '';
  
  if (state.vectorStore.length === 0) {
    content.innerHTML = `
      <div class="text-center py-12 text-gray-500">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        <p>Vector Store vide</p>
        <p class="text-sm mt-1">Generez des embeddings pour remplir le vector store</p>
      </div>
    `;
    return;
  }
  
  // Liste des vecteurs
  const vectorList = document.createElement('div');
  vectorList.className = 'space-y-2';
  
  state.vectorStore.forEach((entry, idx) => {
    const chunk = state.chunks.find(c => c.id === entry.chunkId);
    
    const item = document.createElement('div');
    item.className = 'border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer';
    item.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium text-sm text-gray-800">Vector #${idx + 1}</span>
        <span class="text-xs text-gray-500">${entry.vector.length}D</span>
      </div>
      <div class="text-xs text-gray-500 mb-2 truncate" title="${entry.source}">${entry.source}</div>
      <div class="text-sm text-gray-700 line-clamp-2">${chunk ? chunk.text.substring(0, 100) + '...' : 'Chunk non trouve'}</div>
      <div class="mt-2 flex gap-1 flex-wrap">
        ${Array.from(entry.vector.slice(0, 8)).map(v => 
          `<span class="px-1 py-0.5 text-xs bg-gray-100 rounded">${v.toFixed(3)}</span>`
        ).join('')}
        <span class="px-1 py-0.5 text-xs text-gray-400">...</span>
      </div>
    `;
    
    item.addEventListener('click', () => showVectorDetail(entry, chunk, idx));
    vectorList.appendChild(item);
  });
  
  content.appendChild(vectorList);
}

/**
 * Rend l'onglet Stats
 */
function renderStatsTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  const chunksStats = getChunksStats();
  const vectorStats = getVectorStoreStats();
  
  content.innerHTML = `
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="bg-blue-50 rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-blue-600">${state.docs.length}</div>
        <div class="text-sm text-blue-800">Documents</div>
      </div>
      <div class="bg-purple-50 rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-purple-600">${chunksStats.total}</div>
        <div class="text-sm text-purple-800">Chunks</div>
      </div>
      <div class="bg-green-50 rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-green-600">${vectorStats.total}</div>
        <div class="text-sm text-green-800">Embeddings</div>
      </div>
      <div class="bg-orange-50 rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-orange-600">${chunksStats.totalChars.toLocaleString()}</div>
        <div class="text-sm text-orange-800">Caracteres</div>
      </div>
    </div>
    
    <div class="border rounded-lg p-4">
      <h3 class="font-semibold text-gray-800 mb-3">Modele d'embedding</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-600">Modele</span>
          <span class="font-medium">Xenova/all-MiniLM-L6-v2</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Dimensions</span>
          <span class="font-medium">384</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Backend</span>
          <span class="font-medium">${navigator.gpu ? 'WebGPU' : 'WASM'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Statut</span>
          <span class="font-medium ${isModelLoaded() ? 'text-green-600' : 'text-gray-500'}">
            ${isModelLoaded() ? 'Charge' : 'Non charge'}
          </span>
        </div>
      </div>
    </div>
    
    <div class="border rounded-lg p-4 mt-4">
      <h3 class="font-semibold text-gray-800 mb-3">Par document</h3>
      <div class="space-y-2">
        ${Object.entries(chunksStats.bySource).map(([source, count]) => {
          const embeddedCount = state.vectorStore.filter(v => v.source === source).length;
          return `
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600 truncate flex-1" title="${source}">${source}</span>
              <span class="text-gray-800">${embeddedCount}/${count}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * Configure le bouton d'embeddings
 */
function setupEmbeddingsButton() {
  const btn = document.getElementById('generate-embeddings-btn');
  if (!btn) return;
  
  btn.addEventListener('click', generateAllEmbeddings);
}

/**
 * Met à jour l'UI des embeddings
 */
function updateEmbeddingUI() {
  const statusEl = document.getElementById('embedding-status');
  const countEl = document.getElementById('embedding-count');
  const btn = document.getElementById('generate-embeddings-btn');
  
  if (!statusEl || !countEl || !btn) return;
  
  const total = state.chunks.length;
  const embedded = state.vectorStore.length;
  
  countEl.textContent = `${embedded} / ${total}`;
  
  if (total === 0) {
    statusEl.textContent = 'Aucun chunk';
    btn.disabled = true;
    btn.textContent = 'Generer Embeddings';
  } else if (embedded === total) {
    statusEl.textContent = 'Complet';
    btn.disabled = true;
    btn.textContent = 'Tous les embeddings generes';
  } else {
    statusEl.textContent = 'Pret';
    btn.disabled = false;
    btn.textContent = `Generer ${total - embedded} embeddings`;
  }
}

/**
 * Génère tous les embeddings
 */
async function generateAllEmbeddings() {
  const btn = document.getElementById('generate-embeddings-btn');
  const progressContainer = document.getElementById('embedding-progress');
  const progressBar = document.getElementById('embedding-progress-bar');
  const progressText = document.getElementById('embedding-progress-text');
  const statusEl = document.getElementById('embedding-status');
  
  if (!btn) return;
  
  btn.disabled = true;
  progressContainer.classList.remove('hidden');
  
  try {
    // Charger le modèle
    if (!isModelLoaded()) {
      statusEl.textContent = 'Chargement modele...';
      progressText.textContent = 'Telechargement du modele (~23MB)...';
      
      await initEmbeddingModel((progress) => {
        progressBar.style.width = `${progress}%`;
      });
      
      addLog('success', 'Modele embedding charge');
    }
    
    // Filtrer les chunks non embedded
    const chunksToEmbed = state.chunks.filter(c => 
      !state.vectorStore.find(v => v.chunkId === c.id)
    );
    
    if (chunksToEmbed.length === 0) {
      progressContainer.classList.add('hidden');
      updateEmbeddingUI();
      return;
    }
    
    // Générer
    statusEl.textContent = 'Generation...';
    progressBar.style.width = '0%';
    
    const results = await generateEmbeddingsForChunks(chunksToEmbed, (current, total) => {
      const pct = Math.round((current / total) * 100);
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `${current} / ${total} chunks`;
    });
    
    // Stocker
    results.forEach(({ chunkId, vector }) => {
      addEmbedding(chunkId, vector);
    });
    
    addLog('success', `${results.length} embeddings generes`);
    
  } catch (error) {
    addLog('error', `Erreur: ${error.message}`);
    statusEl.textContent = 'Erreur';
  }
  
  progressContainer.classList.add('hidden');
  updateEmbeddingUI();
}

/**
 * Affiche le détail d'un chunk
 */
function showChunkDetail(chunk, hasEmbedding) {
  const modal = createModal();
  
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <div class="p-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-lg">Chunk ${chunk.chunkIndex + 1}</h3>
          <p class="text-sm text-gray-500">${chunk.source}</p>
        </div>
        <button class="close-modal text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      <div class="p-4 overflow-y-auto flex-1">
        <div class="flex items-center gap-4 mb-4 text-sm">
          <span class="px-2 py-1 bg-gray-100 rounded">${chunk.charCount || chunk.text.length} caracteres</span>
          <span class="px-2 py-1 ${hasEmbedding ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'} rounded">
            ${hasEmbedding ? 'Vectorise' : 'Non vectorise'}
          </span>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap leading-relaxed">
          ${chunk.text}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setupModalClose(modal);
}

/**
 * Affiche le détail d'un vecteur
 */
function showVectorDetail(entry, chunk, idx) {
  const modal = createModal();
  
  // Formater le vecteur pour l'affichage
  const vectorPreview = Array.from(entry.vector).map((v, i) => 
    `<span class="inline-block px-1 py-0.5 m-0.5 text-xs bg-gray-100 rounded">[${i}] ${v.toFixed(4)}</span>`
  ).join('');
  
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <div class="p-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-lg">Vector #${idx + 1}</h3>
          <p class="text-sm text-gray-500">${entry.source}</p>
        </div>
        <button class="close-modal text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      <div class="p-4 overflow-y-auto flex-1">
        <div class="mb-4">
          <h4 class="font-semibold mb-2">Texte source</h4>
          <div class="bg-gray-50 p-3 rounded text-sm">
            ${chunk ? chunk.text : 'Chunk non trouve'}
          </div>
        </div>
        <div>
          <h4 class="font-semibold mb-2">Embedding (${entry.vector.length} dimensions)</h4>
          <div class="bg-gray-50 p-3 rounded max-h-48 overflow-y-auto">
            ${vectorPreview}
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setupModalClose(modal);
}

/**
 * Crée un modal
 */
function createModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  return modal;
}

/**
 * Configure la fermeture du modal
 */
function setupModalClose(modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
  
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

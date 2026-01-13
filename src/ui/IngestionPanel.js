/**
 * Panel d'ingestion avec Logs et Debug intégrés comme onglets
 */

import { state, getChunksStats, getVectorStoreStats, addEmbedding, addLog, setImportedMode, isImportedMode } from '../state/state.js';
import { initEmbeddingModel, generateEmbeddingsForChunks, isModelLoaded } from '../rag/embeddings.js';
import { searchSimilarChunks, buildRAGContext } from '../rag/search.js';

let currentTab = 'chunks';

/**
 * Crée le panel d'ingestion
 */
export function createIngestionPanel() {
  const panel = document.createElement('div');
  panel.id = 'ingestion-panel';
  panel.className = 'bg-white rounded-xl border border-gray-200 flex-1 flex flex-col min-h-0 overflow-hidden';
  
  // Header avec onglets (Chunks, Vectors, Stats, Console, Debug)
  const header = document.createElement('div');
  header.className = 'border-b border-gray-100 px-4 py-3 flex-shrink-0';
  header.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-bold text-gray-900">Vector Store</h2>
      <div class="flex items-center gap-2">
        <label class="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer">
          Import
          <input type="file" id="import-db-input" accept=".json" 
                 style="position:absolute;left:-9999px;width:1px;height:1px;" />
        </label>
        <button id="export-db-btn" class="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors">
          Export
        </button>
        <span id="webgpu-badge" class="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-500">
          ...
        </span>
      </div>
    </div>
    <div id="imported-mode-banner" class="hidden mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center justify-between">
      <span>Imported database active</span>
      <button id="clear-imported-btn" class="text-blue-900 font-medium hover:underline">Clear</button>
    </div>
    <div class="flex gap-1 flex-wrap">
      <button data-tab="chunks" class="tab-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white">
        Chunks
      </button>
      <button data-tab="vectors" class="tab-btn px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100">
        Vectors
      </button>
      <button data-tab="stats" class="tab-btn px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100">
        Stats
      </button>
      <button data-tab="debug" class="tab-btn px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100">
        Debug
      </button>
      <button data-tab="search" class="tab-btn px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100">
        Search
      </button>
    </div>
  `;
  
  // Section Embeddings (simplifiée - génération automatique uniquement)
  const embeddingsSection = document.createElement('div');
  embeddingsSection.className = 'px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 flex-shrink-0';
  embeddingsSection.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold text-gray-900">Embeddings</span>
      <span id="embedding-status" class="text-xs text-gray-600">Ready</span>
    </div>
    <div id="embedding-progress" class="hidden mt-2">
      <div class="w-full bg-gray-200 rounded-full h-1.5">
        <div id="embedding-progress-bar" class="bg-green-600 h-1.5 rounded-full transition-all" style="width: 0%"></div>
      </div>
      <div id="embedding-progress-text" class="text-xs text-gray-500 mt-1"></div>
    </div>
  `;
  
  // Contenu
  const content = document.createElement('div');
  content.id = 'ingestion-content';
  content.className = 'flex-1 overflow-y-auto p-4 min-h-0';
  
  panel.appendChild(header);
  panel.appendChild(embeddingsSection);
  panel.appendChild(content);
  
  // Setup
  setTimeout(() => {
    setupTabs(panel);
    setupEmbeddingsButton();
    setupImportExport();
    renderCurrentTab();
    updateEmbeddingUI();
    
  }, 0);
  
  // Événements
  window.addEventListener('state:chunksAdded', () => { renderCurrentTab(); updateEmbeddingUI(); });
  window.addEventListener('state:chunksRemoved', () => { renderCurrentTab(); updateEmbeddingUI(); });
  window.addEventListener('state:embeddingAdded', () => { renderCurrentTab(); updateEmbeddingUI(); });
  
  window.addEventListener('embeddings:backendDetected', (e) => {
    const badge = document.getElementById('webgpu-badge');
    if (badge) {
      const backend = e.detail;
      const configs = {
        'webgpu': ['bg-green-600 text-white', 'WebGPU'],
        'webgpu-fallback': ['bg-green-500 text-white', 'WebGPU*'],
        'wasm-forced': ['bg-yellow-100 text-yellow-800', 'WASM'],
        'wasm': ['bg-yellow-100 text-yellow-800', 'WASM'],
        'wasm-fallback': ['bg-yellow-100 text-yellow-800', 'WASM'],
        'none': ['bg-red-100 text-red-700', 'Error']
      };
      const [cls, text] = configs[backend] || ['bg-gray-100 text-gray-500', backend];
      badge.className = `px-2.5 py-1 text-xs font-medium rounded-lg ${cls}`;
      badge.textContent = text;
    }
  });

  window.addEventListener('state:importedModeChanged', (e) => {
    const banner = document.getElementById('imported-mode-banner');
    const dropzone = document.getElementById('dropzone');
    
    if (e.detail) {
      if (banner) banner.classList.remove('hidden');
      if (dropzone) dropzone.classList.add('opacity-50', 'pointer-events-none');
    } else {
      if (banner) banner.classList.add('hidden');
      if (dropzone) dropzone.classList.remove('opacity-50', 'pointer-events-none');
    }
  });

  return panel;
}

function setupTabs(panel) {
  const tabs = panel.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      tabs.forEach(t => {
        if (t.dataset.tab === currentTab) {
          t.className = 'tab-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white';
        } else {
          t.className = 'tab-btn px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100';
        }
      });
      renderCurrentTab();
    });
  });
}

function setupImportExport() {
  const importInput = document.getElementById('import-db-input');
  const exportBtn = document.getElementById('export-db-btn');
  const clearBtn = document.getElementById('clear-imported-btn');

  if (importInput) {
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.chunks || !data.vectorStore) throw new Error('Invalid format');

        // Réinitialiser
        state.chunks = [];
        state.vectorStore = [];
        state.docs = [];
        
        // Importer les documents si présents
        if (data.docs && Array.isArray(data.docs)) {
          state.docs = data.docs.map(doc => ({
            ...doc,
            file: null, // Pas de fichier brut
            status: 'extracted'
          }));
        }
        
        // Importer chunks et vectorStore
        state.chunks = data.chunks;
        state.vectorStore = data.vectorStore.map(v => ({
          ...v,
          vector: new Float32Array(v.vector)
        }));

        setImportedMode(true);
        renderCurrentTab();
        updateEmbeddingUI();
        window.dispatchEvent(new CustomEvent('state:docAdded'));
        addLog('success', `Imported: ${state.docs.length} docs, ${state.chunks.length} chunks, ${state.vectorStore.length} embeddings`);

      } catch (error) {
        addLog('error', `Import error: ${error.message}`);
      }
      e.target.value = '';
    });
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      // Exporter docs sans le fichier brut (File object non sérialisable)
      const exportableDocs = state.docs.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        displayName: doc.displayName,
        size: doc.size,
        extractedText: doc.extractedText,
        pageCount: doc.pageCount,
        charCount: doc.charCount,
        status: doc.status
      }));
      
      const data = {
        version: 2,
        exportDate: new Date().toISOString(),
        docs: exportableDocs,
        chunks: state.chunks,
        vectorStore: state.vectorStore.map(v => ({ ...v, vector: Array.from(v.vector) }))
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vectordb-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog('success', `Exported: ${state.docs.length} docs, ${state.chunks.length} chunks, ${state.vectorStore.length} embeddings`);
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.chunks = [];
      state.vectorStore = [];
      state.docs = [];
      setImportedMode(false);
      renderCurrentTab();
      updateEmbeddingUI();
      window.dispatchEvent(new CustomEvent('state:docRemoved'));
      addLog('info', 'Database cleared');
    });
  }
}

function renderCurrentTab() {
  switch (currentTab) {
    case 'chunks': renderChunksTab(); break;
    case 'vectors': renderVectorsTab(); break;
    case 'stats': renderStatsTab(); break;
    case 'debug': renderDebugTab(); break;
    case 'search': renderSearchTab(); break;
  }
}

function renderChunksTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  content.innerHTML = '';
  
  if (state.chunks.length === 0) {
    content.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <svg class="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-sm font-medium">No chunks yet</p>
        <p class="text-xs mt-1">Upload and extract PDFs first</p>
      </div>
    `;
    return;
  }
  
  const chunksByDoc = {};
  state.chunks.forEach(chunk => {
    if (!chunksByDoc[chunk.source]) chunksByDoc[chunk.source] = [];
    chunksByDoc[chunk.source].push(chunk);
  });
  
  Object.entries(chunksByDoc).forEach(([source, chunks]) => {
    const embeddedCount = chunks.filter(c => state.vectorStore.find(v => v.chunkId === c.id)).length;
    
    const section = document.createElement('div');
    section.className = 'mb-3 border border-gray-200 rounded-xl overflow-hidden';
    
    const docHeader = document.createElement('div');
    docHeader.className = 'bg-gray-50 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors';
    docHeader.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-gray-400 transform transition-transform text-xs">▼</span>
        <span class="text-xs font-medium text-gray-900 truncate">${source}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">${chunks.length}</span>
        <span class="w-2 h-2 rounded-full ${embeddedCount === chunks.length ? 'bg-green-500' : 'bg-gray-300'}"></span>
      </div>
    `;
    
    const chunksList = document.createElement('div');
    chunksList.className = 'divide-y divide-gray-100 max-h-40 overflow-y-auto';
    
    chunks.forEach(chunk => {
      const hasEmbedding = state.vectorStore.find(v => v.chunkId === chunk.id);
      
      const chunkItem = document.createElement('div');
      chunkItem.className = 'px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-start gap-2';
      chunkItem.innerHTML = `
        <span class="mt-1 w-1.5 h-1.5 rounded-full ${hasEmbedding ? 'bg-green-500' : 'bg-gray-300'} flex-shrink-0"></span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-xs font-medium text-gray-700">#${chunk.chunkIndex + 1}</span>
            <span class="text-xs text-gray-400">${chunk.text.length} chars</span>
          </div>
          <p class="text-xs text-gray-600 line-clamp-2">${chunk.text.substring(0, 120)}...</p>
        </div>
      `;
      
      chunkItem.addEventListener('click', () => showChunkDetail(chunk, hasEmbedding));
      chunksList.appendChild(chunkItem);
    });
    
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

function renderVectorsTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  content.innerHTML = '';
  
  if (state.vectorStore.length === 0) {
    content.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <svg class="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        <p class="text-sm font-medium">No vectors yet</p>
        <p class="text-xs mt-1">Generate embeddings first</p>
      </div>
    `;
    return;
  }
  
  const vectorList = document.createElement('div');
  vectorList.className = 'space-y-2';
  
  state.vectorStore.forEach((entry, idx) => {
    const chunk = state.chunks.find(c => c.id === entry.chunkId);
    
    const item = document.createElement('div');
    item.className = 'border border-gray-200 rounded-lg p-3 hover:border-green-300 hover:shadow-sm transition-all cursor-pointer';
    item.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-semibold text-gray-900">#${idx + 1}</span>
        <span class="text-xs font-medium text-green-600 bg-green-100 px-1.5 py-0.5 rounded">${entry.vector.length}D</span>
      </div>
      <div class="text-xs text-gray-500 mb-1 truncate">${entry.source || 'Unknown'}</div>
      <div class="text-xs text-gray-700 line-clamp-1">${chunk ? chunk.text.substring(0, 80) + '...' : 'Chunk not found'}</div>
    `;
    
    item.addEventListener('click', () => showVectorDetail(entry, chunk, idx));
    vectorList.appendChild(item);
  });
  
  content.appendChild(vectorList);
}

function renderStatsTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  const chunksStats = getChunksStats();
  const vectorStats = getVectorStoreStats();
  
  content.innerHTML = `
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="bg-blue-50 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold text-blue-600">${state.docs.length}</div>
        <div class="text-xs font-medium text-blue-800 mt-1">Documents</div>
      </div>
      <div class="bg-purple-50 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold text-purple-600">${chunksStats.total}</div>
        <div class="text-xs font-medium text-purple-800 mt-1">Chunks</div>
      </div>
      <div class="bg-green-50 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold text-green-600">${vectorStats.total}</div>
        <div class="text-xs font-medium text-green-800 mt-1">Embeddings</div>
      </div>
      <div class="bg-orange-50 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold text-orange-600">${(chunksStats.totalChars / 1000).toFixed(1)}k</div>
        <div class="text-xs font-medium text-orange-800 mt-1">Characters</div>
      </div>
    </div>
    
    <div class="border border-gray-200 rounded-xl p-4">
      <h3 class="text-xs font-bold text-gray-900 mb-3">Model Info</h3>
      <div class="space-y-2 text-xs">
        <div class="flex justify-between">
          <span class="text-gray-500">Model</span>
          <span class="font-medium text-gray-900">all-MiniLM-L6-v2</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Dimensions</span>
          <span class="font-medium text-gray-900">384</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Status</span>
          <span class="font-semibold ${isModelLoaded() ? 'text-green-600' : 'text-gray-500'}">
            ${isModelLoaded() ? 'Loaded' : 'Not loaded'}
          </span>
        </div>
      </div>
    </div>
  `;
}

function renderDebugTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  const stateSnapshot = {
    docs: state.docs.length,
    chunks: state.chunks.length,
    vectorStore: state.vectorStore.length,
    logs: state.logs.length,
    importedMode: isImportedMode(),
    modelLoaded: isModelLoaded()
  };
  
  content.innerHTML = `
    <div class="space-y-3">
      <div class="bg-gray-900 rounded-xl p-4 font-mono text-xs">
        <div class="text-green-400 mb-2">// State snapshot</div>
        <pre class="text-gray-300">${JSON.stringify(stateSnapshot, null, 2)}</pre>
      </div>
      
      <div class="border border-gray-200 rounded-xl p-4">
        <h3 class="text-xs font-bold text-gray-900 mb-3">Actions</h3>
        <div class="flex gap-2 flex-wrap">
          <button id="debug-clear-state" class="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
            Clear All State
          </button>
          <button id="debug-export-state" class="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
            Export Full State
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Event listeners for debug actions
  document.getElementById('debug-clear-state')?.addEventListener('click', () => {
    if (confirm('Clear all state? This cannot be undone.')) {
      state.docs = [];
      state.chunks = [];
      state.vectorStore = [];
      state.logs = [];
      setImportedMode(false);
      window.dispatchEvent(new CustomEvent('state:docRemoved'));
      renderDebugTab();
      addLog('info', 'State cleared');
    }
  });
  
  document.getElementById('debug-export-state')?.addEventListener('click', () => {
    const fullState = {
      docs: state.docs.map(d => ({ ...d, file: d.file.name })),
      chunks: state.chunks,
      vectorStore: state.vectorStore.map(v => ({ ...v, vector: Array.from(v.vector) })),
      logs: state.logs.map(l => ({ ...l, timestamp: l.timestamp.toISOString() }))
    };
    
    const blob = new Blob([JSON.stringify(fullState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `full-state-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('success', 'Full state exported');
  });
}

function renderSearchTab() {
  const content = document.getElementById('ingestion-content');
  if (!content) return;
  
  content.innerHTML = `
    <div class="space-y-4">
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 class="text-sm font-bold text-blue-900 mb-2">RAG Search Test</h3>
        <p class="text-xs text-blue-700 mb-3">Testez la recherche par similarité cosinus sur votre base vectorisée.</p>
        <div class="flex gap-2">
          <input type="text" id="search-query" placeholder="Entrez votre requête..."
                 class="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button id="search-btn" class="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            Search
          </button>
        </div>
        <div class="flex items-center gap-3 mt-2">
          <label class="text-xs text-blue-700">Top N:</label>
          <input type="number" id="search-topn" value="5" min="1" max="20"
                 class="w-16 px-2 py-1 text-xs border border-blue-300 rounded" />
        </div>
      </div>
      
      <div id="search-results" class="space-y-2">
        <p class="text-sm text-gray-500 text-center py-8">Entrez une requête pour rechercher</p>
      </div>
    </div>
  `;
  
  // Setup search button
  const searchBtn = content.querySelector('#search-btn');
  const searchInput = content.querySelector('#search-query');
  const topNInput = content.querySelector('#search-topn');
  
  const executeSearch = async () => {
    const query = searchInput.value.trim();
    const topN = parseInt(topNInput.value) || 5;
    
    if (!query) {
      addLog('warning', 'Entrez une requête');
      return;
    }
    
    if (state.vectorStore.length === 0) {
      addLog('warning', 'Aucun embedding - générez les embeddings d\'abord');
      return;
    }
    
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
    
    const resultsContainer = content.querySelector('#search-results');
    resultsContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Recherche en cours...</p>';
    
    try {
      const results = await searchSimilarChunks(query, topN);
      
      if (results.length === 0) {
        resultsContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-8">Aucun résultat trouvé</p>';
      } else {
        resultsContainer.innerHTML = results.map((r, idx) => `
          <div class="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold text-gray-900">#${idx + 1} - ${r.source}</span>
              <span class="px-2 py-0.5 text-xs font-bold rounded ${r.score > 0.7 ? 'bg-green-100 text-green-700' : r.score > 0.4 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}">
                ${(r.score * 100).toFixed(1)}%
              </span>
            </div>
            <p class="text-xs text-gray-700 line-clamp-3">${r.text.substring(0, 200)}...</p>
          </div>
        `).join('');
        
        // Afficher le contexte RAG
        const ragContext = buildRAGContext(results);
        resultsContainer.innerHTML += `
          <div class="mt-4 border-t border-gray-200 pt-4">
            <h4 class="text-xs font-bold text-gray-700 mb-2">RAG Context (pour LLM)</h4>
            <div class="bg-gray-900 rounded-lg p-3 text-xs text-gray-300 font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
${ragContext}
            </div>
          </div>
        `;
      }
      
    } catch (error) {
      resultsContainer.innerHTML = `<p class="text-sm text-red-500 text-center py-4">Erreur: ${error.message}</p>`;
    }
    
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  };
  
  searchBtn.addEventListener('click', executeSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeSearch();
  });
}

function setupEmbeddingsButton() {
  // Plus de bouton manuel - génération automatique uniquement
  // Vérifier l'état au démarrage
  updateEmbeddingUI();
}

function updateEmbeddingUI() {
  const statusEl = document.getElementById('embedding-status');
  const progressContainer = document.getElementById('embedding-progress');
  const progressBar = document.getElementById('embedding-progress-bar');
  const progressText = document.getElementById('embedding-progress-text');

  if (!statusEl) return;

  const total = state.chunks.length;
  const embedded = state.vectorStore.length;
  
  // Vérifier si génération automatique en cours
  const isAutoInProgress = state.embeddingGeneration?.inProgress && state.embeddingGeneration?.isAutomatic;

  if (total === 0) {
    statusEl.textContent = 'No chunks';
    if (progressContainer) progressContainer.classList.add('hidden');
  } else if (embedded === total && !isAutoInProgress) {
    statusEl.textContent = 'Complete';
    if (progressContainer) progressContainer.classList.add('hidden');
  } else if (isAutoInProgress) {
    // Mode génération automatique en cours
    statusEl.textContent = 'Génération en cours...';
    
    if (progressContainer) {
      progressContainer.classList.remove('hidden');
      const current = state.embeddingGeneration.currentProgress || embedded;
      const totalProgress = state.embeddingGeneration.totalProgress || total;
      const percent = totalProgress > 0 ? Math.round((current / totalProgress) * 100) : 0;
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `${current}/${totalProgress} embeddings (${percent}%)`;
    }
  } else {
    statusEl.textContent = 'Ready';
    if (progressContainer) progressContainer.classList.add('hidden');
  }
}

// Ajouter les listeners pour les événements de génération automatique
window.addEventListener('embedding:stateChanged', () => {
  updateEmbeddingUI();
});

window.addEventListener('embedding:progress', (e) => {
  updateEmbeddingUI();
  // Mettre à jour la barre de progression si visible
  const progressContainer = document.getElementById('embedding-progress');
  const progressBar = document.getElementById('embedding-progress-bar');
  const progressText = document.getElementById('embedding-progress-text');
  
  if (progressContainer && progressBar && progressText && !progressContainer.classList.contains('hidden')) {
    const { current, total } = e.detail;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${current}/${total} embeddings (${percent}%)`;
  }
});

let embeddingCancellationToken = { cancelled: false };
let isEmbeddingInProgress = false;

// Export pour permettre l'annulation depuis QuickUpload
export function cancelEmbeddingProcess() {
  if (embeddingCancellationToken) {
    embeddingCancellationToken.cancelled = true;
    addLog('warning', 'Processus d\'embedding annulé');
    // Mettre à jour l'état
    if (state.embeddingGeneration) {
      state.embeddingGeneration.inProgress = false;
      window.dispatchEvent(new CustomEvent('embedding:stateChanged', { 
        detail: state.embeddingGeneration 
      }));
    }
  }
}

// Rendre le token accessible depuis QuickUpload
export function getEmbeddingCancellationToken() {
  return embeddingCancellationToken;
}

async function generateAllEmbeddings() {
  // Fonction conservée pour compatibilité avec MemoryBank.js
  // Les boutons manuels ont été supprimés (génération automatique uniquement)
  const progressContainer = document.getElementById('embedding-progress');
  const progressBar = document.getElementById('embedding-progress-bar');
  const progressText = document.getElementById('embedding-progress-text');
  const statusEl = document.getElementById('embedding-status');

  if (!progressContainer || !progressBar || !progressText || !statusEl) return;

  // Éviter les doubles lancements
  if (isEmbeddingInProgress) {
    addLog('warning', 'Processus d\'embedding déjà en cours');
    return;
  }

  isEmbeddingInProgress = true;

  // Reset cancellation token
  embeddingCancellationToken.cancelled = false;

  progressContainer.classList.remove('hidden');

  try {
    if (!isModelLoaded()) {
      statusEl.textContent = 'Loading model...';
      progressText.textContent = 'Downloading model (~23MB)...';

      await initEmbeddingModel((progress) => {
        progressBar.style.width = `${progress}%`;
      });

      addLog('success', 'Embedding model loaded');
    }

    const chunksToEmbed = state.chunks.filter(c =>
      !state.vectorStore.find(v => v.chunkId === c.id)
    );

    if (chunksToEmbed.length === 0) {
      progressContainer.classList.add('hidden');
      updateEmbeddingUI();
      return;
    }

    statusEl.textContent = 'Generating...';
    progressBar.style.width = '0%';

    const startTime = Date.now();
    let processedCount = 0;
    let successCount = 0;

    const results = await generateEmbeddingsForChunks(
      chunksToEmbed,
      (current, total) => {
        processedCount = current;
        const pct = Math.round((current / total) * 100);
        progressBar.style.width = `${pct}%`;

        // Calculer temps restant estimé (plus précis)
        const elapsed = Date.now() - startTime;
        
        if (current > 0) {
          const avgTimePerChunk = elapsed / current;
          const remaining = total - current;
          const etaMs = remaining * avgTimePerChunk;
          const etaSec = Math.round(etaMs / 1000);
          const elapsedSec = Math.round(elapsed / 1000);

          let etaText = '';
          if (etaSec < 60) {
            etaText = `${etaSec}s restantes`;
          } else if (etaSec < 3600) {
            etaText = `${Math.round(etaSec / 60)}min restantes`;
          } else {
            etaText = `${Math.round(etaSec / 3600)}h restantes`;
          }

          progressText.textContent = `Batch ${Math.ceil(current / 3)}: ${current}/${total} chunks (${pct}%) - ${etaText}`;
        } else {
          progressText.textContent = `Démarrage... ${current}/${total} chunks`;
        }
      },
      {
        batchSize: 3, // Petit batch pour stabilité
        shouldCancel: () => embeddingCancellationToken.cancelled
      }
    );

    // Vérifier si annulé
    if (embeddingCancellationToken.cancelled) {
      addLog('warning', `Processus annulé - ${results.length} embeddings générés avant annulation`);
    } else {
      addLog('success', `${results.length} embeddings générés avec succès`);
    }

    // Sauvegarder les résultats réussis
    results.forEach(({ chunkId, vector }) => {
      addEmbedding(chunkId, vector);
      successCount++;
    });

    // Log final détaillé
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    const failedCount = processedCount - successCount;
    addLog('info', `Résumé: ${successCount} réussis, ${failedCount} échoués, ${totalTime}s total`);

  } catch (error) {
    if (embeddingCancellationToken.cancelled) {
      addLog('info', 'Processus annulé par utilisateur');
    } else {
      addLog('error', `Erreur embedding: ${error.message}`);
      statusEl.textContent = 'Error';
    }
  }

  // Cleanup
  progressContainer.classList.add('hidden');
  isEmbeddingInProgress = false; // Marquer fin du processus
  updateEmbeddingUI();
}

function showChunkDetail(chunk, hasEmbedding) {
  const modal = createModal();
  
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-gray-900">Chunk #${chunk.chunkIndex + 1}</h3>
          <p class="text-xs text-gray-500">${chunk.source}</p>
        </div>
        <button class="close-modal text-gray-400 hover:text-gray-600 text-xl">×</button>
      </div>
      <div class="p-4 overflow-y-auto flex-1">
        <div class="flex items-center gap-2 mb-3">
          <span class="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">${chunk.text.length} chars</span>
          <span class="px-2 py-1 text-xs font-medium rounded ${hasEmbedding ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
            ${hasEmbedding ? 'Vectorized' : 'Not vectorized'}
          </span>
        </div>
        <div class="bg-gray-50 p-4 rounded-xl text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono">
          ${chunk.text}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setupModalClose(modal);
}

function showVectorDetail(entry, chunk, idx) {
  const modal = createModal();
  
  const vectorPreview = Array.from(entry.vector).map((v, i) => 
    `<span class="inline-block px-1 py-0.5 m-0.5 text-xs bg-gray-100 rounded font-mono">[${i}] ${v.toFixed(4)}</span>`
  ).join('');
  
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-gray-900">Vector #${idx + 1}</h3>
          <p class="text-xs text-gray-500">${entry.source}</p>
        </div>
        <button class="close-modal text-gray-400 hover:text-gray-600 text-xl">×</button>
      </div>
      <div class="p-4 overflow-y-auto flex-1">
        <div class="mb-4">
          <h4 class="text-xs font-bold text-gray-700 mb-2">Source Text</h4>
          <div class="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
            ${chunk ? chunk.text : 'Chunk not found'}
          </div>
        </div>
        <div>
          <h4 class="text-xs font-bold text-gray-700 mb-2">Embedding (${entry.vector.length}D)</h4>
          <div class="bg-gray-50 p-3 rounded-lg max-h-40 overflow-y-auto">
            ${vectorPreview}
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setupModalClose(modal);
}

function createModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
  return modal;
}

function setupModalClose(modal) {
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
  const handleEscape = (e) => {
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEscape); }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Composant UI : Memory Bank - Visualisation des chunks et embeddings
 */

import { state, getChunksStats, getVectorStoreStats, addEmbedding, addLog } from '../state/state.js';
import { initEmbeddingModel, generateEmbeddingsForChunks, isModelLoaded, isModelCurrentlyLoading } from '../rag/embeddings.js';

/**
 * Crée le composant Memory Bank
 * @returns {HTMLElement} - Le conteneur Memory Bank
 */
export function createMemoryBank() {
  const container = document.createElement('div');
  container.id = 'memory-bank';
  container.className = 'bg-white p-6 rounded-lg shadow';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';

  const title = document.createElement('h3');
  title.className = 'text-xl font-bold text-gray-800';
  title.textContent = 'Memory Bank';

  const refreshButton = document.createElement('button');
  refreshButton.className = 'px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors';
  refreshButton.textContent = '🔄 Actualiser';
  refreshButton.title = 'Actualiser les statistiques';
  refreshButton.addEventListener('click', () => {
    renderMemoryBank();
  });

  header.appendChild(title);
  header.appendChild(refreshButton);

  // Section Embeddings
  const embeddingsSection = document.createElement('div');
  embeddingsSection.id = 'embeddings-section';
  embeddingsSection.className = 'mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200';
  
  // Détecter WebGPU
  const hasWebGPU = 'gpu' in navigator;
  const webgpuBadge = hasWebGPU 
    ? '<span class="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">WebGPU</span>'
    : '<span class="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">WASM</span>';
  
  embeddingsSection.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <h4 class="font-semibold text-purple-800">Embeddings</h4>
        ${webgpuBadge}
      </div>
      <span id="embeddings-status" class="text-sm text-purple-600">Non initialisé</span>
    </div>
    <div id="model-progress-container" class="hidden mb-2">
      <div class="text-xs text-gray-600 mb-1">Chargement du modèle...</div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div id="model-progress-bar" class="bg-purple-600 h-2 rounded-full transition-all" style="width: 0%"></div>
      </div>
    </div>
    <div id="embedding-progress-container" class="hidden mb-2">
      <div class="text-xs text-gray-600 mb-1">Génération des embeddings...</div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div id="embedding-progress-bar" class="bg-green-600 h-2 rounded-full transition-all" style="width: 0%"></div>
      </div>
      <div id="embedding-progress-text" class="text-xs text-gray-500 mt-1">0 / 0</div>
    </div>
    <button id="generate-embeddings-btn" class="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
      Générer Embeddings
    </button>
  `;

  const content = document.createElement('div');
  content.id = 'memory-bank-content';
  content.className = 'space-y-4';

  container.appendChild(header);
  container.appendChild(embeddingsSection);
  container.appendChild(content);

  // Rendu initial
  renderMemoryBank();
  
  // Setup du bouton après un tick pour s'assurer que le DOM est prêt
  setTimeout(() => {
    setupEmbeddingsButton();
    updateEmbeddingsStatus();
  }, 0);

  // Écouter les événements de changement
  window.addEventListener('state:chunksAdded', () => {
    renderMemoryBank();
  });

  window.addEventListener('state:chunksRemoved', () => {
    renderMemoryBank();
  });

  window.addEventListener('state:docRemoved', () => {
    renderMemoryBank();
  });

  window.addEventListener('state:embeddingAdded', () => {
    updateEmbeddingsStatus();
  });

  return container;
}

/**
 * Configure le bouton de génération d'embeddings
 */
function setupEmbeddingsButton() {
  const btn = document.getElementById('generate-embeddings-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    await generateAllEmbeddings();
  });

  updateEmbeddingsStatus();
}

/**
 * Met à jour le statut des embeddings
 */
function updateEmbeddingsStatus() {
  const statusEl = document.getElementById('embeddings-status');
  const btn = document.getElementById('generate-embeddings-btn');
  if (!statusEl || !btn) return;

  const vectorStats = getVectorStoreStats();
  const chunksStats = getChunksStats();

  if (chunksStats.total === 0) {
    statusEl.textContent = 'Aucun chunk - Extrayez des PDFs';
    btn.textContent = 'Générer Embeddings';
    btn.disabled = true;
    btn.classList.add('opacity-50');
  } else if (vectorStats.total === chunksStats.total) {
    statusEl.textContent = `${vectorStats.total} / ${chunksStats.total} embeddings`;
    btn.textContent = 'Embeddings complets';
    btn.disabled = true;
  } else {
    statusEl.textContent = `${vectorStats.total} / ${chunksStats.total} embeddings`;
    btn.textContent = `Générer Embeddings (${chunksStats.total - vectorStats.total} restants)`;
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

// Écouter les changements de chunks pour mettre à jour le statut
window.addEventListener('state:chunksAdded', updateEmbeddingsStatus);
window.addEventListener('state:chunksRemoved', updateEmbeddingsStatus);

/**
 * Génère les embeddings pour tous les chunks
 */
async function generateAllEmbeddings() {
  const btn = document.getElementById('generate-embeddings-btn');
  const modelProgressContainer = document.getElementById('model-progress-container');
  const modelProgressBar = document.getElementById('model-progress-bar');
  const embeddingProgressContainer = document.getElementById('embedding-progress-container');
  const embeddingProgressBar = document.getElementById('embedding-progress-bar');
  const embeddingProgressText = document.getElementById('embedding-progress-text');
  const statusEl = document.getElementById('embeddings-status');

  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'Chargement...';

  try {
    // 1. Charger le modèle si nécessaire
    if (!isModelLoaded()) {
      modelProgressContainer.classList.remove('hidden');
      statusEl.textContent = 'Chargement du modèle...';
      addLog('info', 'Loading embedding model...');

      await initEmbeddingModel((progress) => {
        modelProgressBar.style.width = `${progress}%`;
      });

      modelProgressContainer.classList.add('hidden');
      addLog('success', 'Embedding model loaded');
    }

    // 2. Filtrer les chunks sans embedding
    const chunksToEmbed = state.chunks.filter(chunk => {
      return !state.vectorStore.find(v => v.chunkId === chunk.id);
    });

    if (chunksToEmbed.length === 0) {
      statusEl.textContent = 'Tous les embeddings sont générés';
      btn.textContent = 'Embeddings complets';
      return;
    }

    // 3. Générer les embeddings
    embeddingProgressContainer.classList.remove('hidden');
    statusEl.textContent = 'Génération en cours...';
    btn.textContent = 'Génération...';

    const results = await generateEmbeddingsForChunks(chunksToEmbed, (current, total) => {
      const progress = Math.round((current / total) * 100);
      embeddingProgressBar.style.width = `${progress}%`;
      embeddingProgressText.textContent = `${current} / ${total}`;
    });

    // 4. Stocker les embeddings
    results.forEach(({ chunkId, vector }) => {
      addEmbedding(chunkId, vector);
    });

    embeddingProgressContainer.classList.add('hidden');
    addLog('success', `${results.length} embeddings générés`);

  } catch (error) {
    addLog('error', `Erreur génération embeddings: ${error.message}`);
    statusEl.textContent = 'Erreur';
    btn.textContent = 'Réessayer';
    btn.disabled = false;
  }

  updateEmbeddingsStatus();
}

/**
 * Rend le contenu du Memory Bank
 */
function renderMemoryBank() {
  const content = document.getElementById('memory-bank-content');
  if (!content) return;

  const stats = getChunksStats();

  // Statistiques globales
  const statsCard = document.createElement('div');
  statsCard.className = 'bg-gray-50 rounded-lg p-4 border border-gray-200';

  const statsGrid = document.createElement('div');
  statsGrid.className = 'grid grid-cols-2 gap-4';

  // Total chunks
  const totalCard = document.createElement('div');
  totalCard.className = 'text-center';
  const totalLabel = document.createElement('div');
  totalLabel.className = 'text-sm text-gray-600 mb-1';
  totalLabel.textContent = 'Total Chunks';
  const totalValue = document.createElement('div');
  totalValue.className = 'text-2xl font-bold text-blue-600';
  totalValue.textContent = stats.total;
  totalCard.appendChild(totalLabel);
  totalCard.appendChild(totalValue);

  // Total caractères
  const charsCard = document.createElement('div');
  charsCard.className = 'text-center';
  const charsLabel = document.createElement('div');
  charsLabel.className = 'text-sm text-gray-600 mb-1';
  charsLabel.textContent = 'Total Caractères';
  const charsValue = document.createElement('div');
  charsValue.className = 'text-2xl font-bold text-green-600';
  charsValue.textContent = stats.totalChars.toLocaleString();
  charsCard.appendChild(charsLabel);
  charsCard.appendChild(charsValue);

  statsGrid.appendChild(totalCard);
  statsGrid.appendChild(charsCard);
  statsCard.appendChild(statsGrid);

  content.innerHTML = '';
  content.appendChild(statsCard);

  // Si aucun chunk
  if (stats.total === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'text-center py-8 text-gray-500 italic';
    emptyMessage.textContent = 'Aucun chunk créé pour le moment. Extrayez et chunker des PDFs pour commencer.';
    content.appendChild(emptyMessage);
    return;
  }

  // Liste des sources avec leurs chunks
  const sourcesList = document.createElement('div');
  sourcesList.className = 'mt-4 space-y-3';

  const sourcesTitle = document.createElement('h4');
  sourcesTitle.className = 'text-lg font-semibold text-gray-800 mb-3';
  sourcesTitle.textContent = 'Chunks par document';
  sourcesList.appendChild(sourcesTitle);

  // Grouper les chunks par source
  const chunksBySource = {};
  state.chunks.forEach(chunk => {
    if (!chunksBySource[chunk.source]) {
      chunksBySource[chunk.source] = [];
    }
    chunksBySource[chunk.source].push(chunk);
  });

  // Afficher chaque source
  Object.entries(chunksBySource).forEach(([source, chunks]) => {
    const sourceCard = document.createElement('div');
    sourceCard.className = 'bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow';

    const sourceHeader = document.createElement('div');
    sourceHeader.className = 'flex items-center justify-between mb-2';

    const sourceName = document.createElement('span');
    sourceName.className = 'font-semibold text-gray-800 truncate flex-1';
    sourceName.textContent = source;
    sourceName.title = source;

    // Compter les chunks avec embeddings
    const embeddedCount = chunks.filter(c => state.vectorStore.find(v => v.chunkId === c.id)).length;
    
    const badgesContainer = document.createElement('div');
    badgesContainer.className = 'flex items-center gap-2';
    
    const chunkCount = document.createElement('span');
    chunkCount.className = 'px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium';
    chunkCount.textContent = `${chunks.length} chunks`;
    
    const embeddedBadge = document.createElement('span');
    if (embeddedCount === chunks.length) {
      embeddedBadge.className = 'px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-medium';
      embeddedBadge.textContent = '✓ Vectorisé';
    } else if (embeddedCount > 0) {
      embeddedBadge.className = 'px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-medium';
      embeddedBadge.textContent = `${embeddedCount}/${chunks.length} vec`;
    } else {
      embeddedBadge.className = 'px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm font-medium';
      embeddedBadge.textContent = 'Non vectorisé';
    }
    
    badgesContainer.appendChild(chunkCount);
    badgesContainer.appendChild(embeddedBadge);

    sourceHeader.appendChild(sourceName);
    sourceHeader.appendChild(badgesContainer);

    // Détails des chunks
    const chunksDetails = document.createElement('div');
    chunksDetails.className = 'mt-2 space-y-1';

    chunks.slice(0, 5).forEach((chunk, idx) => {
      const hasEmbedding = state.vectorStore.find(v => v.chunkId === chunk.id);
      
      const chunkItem = document.createElement('div');
      chunkItem.className = 'text-xs flex items-center justify-between p-1 rounded hover:bg-gray-50 cursor-pointer';
      chunkItem.title = 'Cliquer pour voir le contenu complet';
      
      const chunkLeft = document.createElement('div');
      chunkLeft.className = 'flex items-center gap-2';
      
      const embeddingIcon = document.createElement('span');
      embeddingIcon.textContent = hasEmbedding ? '🟢' : '⚪';
      embeddingIcon.title = hasEmbedding ? 'Embedding généré (384D)' : 'Pas encore vectorisé';
      
      const chunkInfo = document.createElement('span');
      chunkInfo.className = 'text-gray-600';
      chunkInfo.textContent = `Chunk ${chunk.chunkIndex + 1}: ${chunk.charCount || chunk.text.length} chars`;
      
      chunkLeft.appendChild(embeddingIcon);
      chunkLeft.appendChild(chunkInfo);
      
      const chunkPreview = document.createElement('span');
      chunkPreview.className = 'text-gray-400 truncate ml-2 max-w-xs';
      chunkPreview.textContent = chunk.text.substring(0, 40) + '...';

      chunkItem.appendChild(chunkLeft);
      chunkItem.appendChild(chunkPreview);
      
      // Click pour voir le contenu complet
      chunkItem.addEventListener('click', () => {
        showChunkModal(chunk, hasEmbedding);
      });
      
      chunksDetails.appendChild(chunkItem);
    });

    if (chunks.length > 5) {
      const moreInfo = document.createElement('div');
      moreInfo.className = 'text-xs text-gray-500 italic mt-1';
      moreInfo.textContent = `... et ${chunks.length - 5} autres chunks`;
      chunksDetails.appendChild(moreInfo);
    }

    sourceCard.appendChild(sourceHeader);
    sourceCard.appendChild(chunksDetails);
    sourcesList.appendChild(sourceCard);
  });

  content.appendChild(sourcesList);
}

/**
 * Affiche un modal avec le contenu complet d'un chunk
 */
function showChunkModal(chunk, hasEmbedding) {
  // Supprimer modal existant
  const existingModal = document.getElementById('chunk-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'chunk-modal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  
  const content = document.createElement('div');
  content.className = 'bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col';
  
  // Header
  const header = document.createElement('div');
  header.className = 'p-4 border-b bg-gray-50 flex items-center justify-between';
  
  const titleContainer = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'font-bold text-lg';
  title.textContent = `Chunk ${chunk.chunkIndex + 1} - ${chunk.source}`;
  
  const meta = document.createElement('div');
  meta.className = 'text-sm text-gray-500 flex items-center gap-2 mt-1';
  meta.innerHTML = `
    <span>${chunk.charCount || chunk.text.length} caractères</span>
    <span>•</span>
    <span>${hasEmbedding ? '🟢 Vectorisé (384D)' : '⚪ Non vectorisé'}</span>
  `;
  
  titleContainer.appendChild(title);
  titleContainer.appendChild(meta);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'text-gray-500 hover:text-gray-700 text-2xl font-bold';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => modal.remove());
  
  header.appendChild(titleContainer);
  header.appendChild(closeBtn);
  
  // Body
  const body = document.createElement('div');
  body.className = 'p-4 overflow-y-auto flex-1';
  
  const textContent = document.createElement('div');
  textContent.className = 'bg-gray-50 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap font-mono';
  textContent.textContent = chunk.text;
  
  body.appendChild(textContent);
  
  // Footer avec infos embedding
  if (hasEmbedding) {
    const footer = document.createElement('div');
    footer.className = 'p-4 border-t bg-green-50 text-sm text-green-700';
    footer.innerHTML = `
      <strong>Embedding:</strong> Vecteur de 384 dimensions généré avec Xenova/all-MiniLM-L6-v2
    `;
    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);
  } else {
    content.appendChild(header);
    content.appendChild(body);
  }
  
  modal.appendChild(content);
  
  // Fermer en cliquant à l'extérieur
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Fermer avec Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  document.body.appendChild(modal);
}


/**
 * Composant UI : Memory Bank - Visualisation des chunks
 */

import { state, getChunksStats } from '../state/state.js';

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

  const content = document.createElement('div');
  content.id = 'memory-bank-content';
  content.className = 'space-y-4';

  container.appendChild(header);
  container.appendChild(content);

  // Rendu initial
  renderMemoryBank();

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

  return container;
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

    const chunkCount = document.createElement('span');
    chunkCount.className = 'px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium';
    chunkCount.textContent = `${chunks.length} chunks`;

    sourceHeader.appendChild(sourceName);
    sourceHeader.appendChild(chunkCount);

    // Détails des chunks
    const chunksDetails = document.createElement('div');
    chunksDetails.className = 'mt-2 space-y-1';

    chunks.slice(0, 5).forEach((chunk, idx) => {
      const chunkItem = document.createElement('div');
      chunkItem.className = 'text-xs text-gray-600 flex items-center justify-between';
      
      const chunkInfo = document.createElement('span');
      chunkInfo.textContent = `Chunk ${chunk.chunkIndex + 1}: ${chunk.charCount || chunk.text.length} chars`;
      
      const chunkPreview = document.createElement('span');
      chunkPreview.className = 'text-gray-400 truncate ml-2 max-w-xs';
      chunkPreview.textContent = chunk.text.substring(0, 50) + '...';
      chunkPreview.title = chunk.text;

      chunkItem.appendChild(chunkInfo);
      chunkItem.appendChild(chunkPreview);
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


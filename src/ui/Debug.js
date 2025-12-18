/**
 * Composant UI : Panel de debug - Design avec couleurs
 */

import { state } from '../state/state.js';

/**
 * Crée le panel de debug
 */
export function createDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.className = 'h-full bg-gray-50 rounded-xl p-3';

  panel.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-semibold text-gray-700">Debug</span>
      <button id="debug-toggle" class="px-2.5 py-1 text-xs font-medium bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors">
        Show
      </button>
    </div>
    <div id="debug-content" class="hidden">
      <pre id="debug-state" class="text-xs text-gray-600 overflow-auto max-h-20 bg-white rounded-lg p-2 font-mono border border-gray-200"></pre>
    </div>
  `;

  const toggleBtn = panel.querySelector('#debug-toggle');
  const content = panel.querySelector('#debug-content');
  const stateDisplay = panel.querySelector('#debug-state');

  let isVisible = false;

  toggleBtn.addEventListener('click', () => {
    isVisible = !isVisible;
    content.classList.toggle('hidden', !isVisible);
    toggleBtn.textContent = isVisible ? 'Hide' : 'Show';
    
    if (isVisible) {
      updateDebugState(stateDisplay);
    }
  });

  setInterval(() => {
    if (isVisible) {
      updateDebugState(stateDisplay);
    }
  }, 1000);

  return panel;
}

/**
 * Met à jour l'affichage du state
 */
function updateDebugState(element) {
  if (!element) return;
  
  const summary = {
    docs: state.docs.length,
    chunks: state.chunks.length,
    vectors: state.vectorStore.length,
    logs: state.logs.length
  };
  
  element.textContent = JSON.stringify(summary, null, 2);
}

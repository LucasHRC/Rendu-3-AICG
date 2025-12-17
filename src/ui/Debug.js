/**
 * Composant UI : Debug Panel / State Inspector
 * Affiche l'état de l'application en mode debug
 */

import { state, getStateSummary, toggleDebugMode } from '../state/state.js';

export function createDebugPanel() {
  const debugContainer = document.createElement('div');
  debugContainer.id = 'debug-panel';
  debugContainer.className = 'bg-gray-800 text-white p-4 rounded-lg';
  
  // Header avec toggle
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  
  const title = document.createElement('h3');
  title.className = 'text-lg font-bold';
  title.textContent = 'Debug Mode';
  
  const toggle = document.createElement('button');
  toggle.id = 'debug-toggle';
  toggle.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition';
  toggle.textContent = state.settings.debugMode ? 'Disable' : 'Enable';
  toggle.addEventListener('click', () => {
    toggleDebugMode();
    updateToggleButton(toggle);
    updateDebugPanel(debugContainer);
  });
  
  header.appendChild(title);
  header.appendChild(toggle);
  
  // Panel de contenu (caché par défaut si debug désactivé)
  const content = document.createElement('div');
  content.id = 'debug-content';
  content.className = `mt-4 ${state.settings.debugMode ? '' : 'hidden'}`;
  
  const stateDisplay = document.createElement('pre');
  stateDisplay.id = 'debug-state';
  stateDisplay.className = 'bg-gray-900 p-4 rounded text-xs overflow-x-auto';
  stateDisplay.textContent = JSON.stringify(getStateSummary(), null, 2);
  
  content.appendChild(stateDisplay);
  
  debugContainer.appendChild(header);
  debugContainer.appendChild(content);
  
  // Écouter les changements d'état
  window.addEventListener('state:debugToggle', () => {
    updateDebugPanel(debugContainer);
  });
  
  // Mettre à jour périodiquement (toutes les 2 secondes)
  setInterval(() => {
    if (state.settings.debugMode) {
      updateStateDisplay(stateDisplay);
    }
  }, 2000);
  
  return debugContainer;
}

function updateToggleButton(button) {
  button.textContent = state.settings.debugMode ? 'Disable' : 'Enable';
  button.className = state.settings.debugMode
    ? 'px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition'
    : 'px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition';
}

function updateDebugPanel(container) {
  const content = container.querySelector('#debug-content');
  const stateDisplay = container.querySelector('#debug-state');
  
  if (state.settings.debugMode) {
    content.classList.remove('hidden');
    updateStateDisplay(stateDisplay);
  } else {
    content.classList.add('hidden');
  }
}

function updateStateDisplay(element) {
  if (!element) return;
  element.textContent = JSON.stringify(getStateSummary(), null, 2);
}


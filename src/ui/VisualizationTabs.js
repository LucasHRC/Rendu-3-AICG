/**
 * VisualizationTabs - Système d'onglets Chat/Visualisation
 */

import { addLog } from '../state/state.js';
import { createAgentSelector, getSelectedAgent, AGENTS } from './AgentSelector.js';

let activeTab = 'chat';
let visualizationContent = null;

/**
 * Crée le conteneur avec onglets
 */
export function createTabbedContainer(chatContent) {
  const container = document.createElement('div');
  container.id = 'tabbed-container';
  container.className = 'flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden';

  container.innerHTML = `
    <!-- Tabs Header -->
    <div class="flex-shrink-0 flex border-b border-gray-200 bg-gray-50">
      <button id="tab-chat" class="flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 border-blue-500 text-blue-600 bg-white">
        <span class="flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Chat
        </span>
      </button>
      <button id="tab-viz" class="flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100">
        <span class="flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Visualisation
        </span>
      </button>
    </div>

    <!-- Tab Content -->
    <div id="tab-content" class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div id="chat-tab-content" class="flex-1 flex flex-col min-h-0"></div>
      <div id="viz-tab-content" class="flex-1 flex-col min-h-0 hidden"></div>
    </div>
  `;

  setTimeout(() => {
    // Injecter le contenu chat
    const chatContainer = container.querySelector('#chat-tab-content');
    if (chatContainer && chatContent) {
      chatContainer.appendChild(chatContent);
    }

    // Créer le contenu visualisation
    const vizContainer = container.querySelector('#viz-tab-content');
    if (vizContainer) {
      vizContainer.appendChild(createVisualizationContent());
    }

    // Setup events
    setupTabEvents(container);
  }, 0);

  return container;
}

/**
 * Crée le contenu de l'onglet Visualisation
 */
function createVisualizationContent() {
  const content = document.createElement('div');
  content.className = 'flex flex-col h-full';

  content.innerHTML = `
    <!-- Agent Selector -->
    <div id="agent-selector-container" class="flex-shrink-0 p-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
      <h3 class="text-sm font-bold text-gray-800 mb-2">Sélectionner un Agent</h3>
      <div id="agent-cards"></div>
    </div>

    <!-- Visualization Area -->
    <div id="viz-area" class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div id="viz-placeholder" class="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-sm font-medium">Sélectionnez un agent pour générer une visualisation</p>
        <p class="text-xs mt-1">Les visualisations seront basées sur vos documents</p>
      </div>
      <div id="viz-render" class="hidden flex-1 overflow-auto p-4"></div>
    </div>

    <!-- Controls -->
    <div id="viz-controls" class="flex-shrink-0 p-3 border-t border-gray-100 bg-gray-50 hidden">
      <div class="flex items-center justify-between">
        <button id="generate-viz-btn" class="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50">
          Générer la visualisation
        </button>
        <div class="flex gap-2">
          <button id="export-png-btn" class="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50" disabled>
            Export PNG
          </button>
          <button id="export-svg-btn" class="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50" disabled>
            Export SVG
          </button>
          <button id="export-json-btn" class="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50" disabled>
            Export JSON
          </button>
        </div>
      </div>
      <div id="viz-progress" class="hidden mt-3">
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div id="viz-progress-bar" class="bg-purple-600 h-2 rounded-full transition-all" style="width: 0%"></div>
        </div>
        <p id="viz-progress-text" class="text-xs text-gray-500 mt-1 text-center">Génération en cours...</p>
      </div>
    </div>
  `;

  // Injecter les cartes d'agents
  setTimeout(() => {
    const cardsContainer = content.querySelector('#agent-cards');
    if (cardsContainer) {
      const selector = createAgentSelector(handleAgentSelect);
      cardsContainer.appendChild(selector);
    }
  }, 0);

  visualizationContent = content;
  return content;
}

/**
 * Configure les événements des onglets
 */
function setupTabEvents(container) {
  const chatTab = container.querySelector('#tab-chat');
  const vizTab = container.querySelector('#tab-viz');
  const chatContent = container.querySelector('#chat-tab-content');
  const vizContent = container.querySelector('#viz-tab-content');

  chatTab?.addEventListener('click', () => {
    switchTab('chat', chatTab, vizTab, chatContent, vizContent);
  });

  vizTab?.addEventListener('click', () => {
    switchTab('viz', chatTab, vizTab, chatContent, vizContent);
  });
}

/**
 * Change d'onglet
 */
function switchTab(tab, chatTab, vizTab, chatContent, vizContent) {
  activeTab = tab;

  if (tab === 'chat') {
    chatTab.className = 'flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 border-blue-500 text-blue-600 bg-white';
    vizTab.className = 'flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100';
    chatContent.classList.remove('hidden');
    chatContent.classList.add('flex');
    vizContent.classList.add('hidden');
    vizContent.classList.remove('flex');
  } else {
    vizTab.className = 'flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 border-purple-500 text-purple-600 bg-white';
    chatTab.className = 'flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100';
    vizContent.classList.remove('hidden');
    vizContent.classList.add('flex');
    chatContent.classList.add('hidden');
    chatContent.classList.remove('flex');
  }

  window.dispatchEvent(new CustomEvent('tab:changed', { detail: { tab } }));
}

/**
 * Gère la sélection d'un agent
 */
function handleAgentSelect(agent) {
  const controls = document.getElementById('viz-controls');
  const placeholder = document.getElementById('viz-placeholder');
  
  if (controls) controls.classList.remove('hidden');
  if (placeholder) {
    placeholder.innerHTML = `
      <div class="text-center">
        <span class="text-4xl mb-4 block">${agent.icon}</span>
        <p class="text-lg font-semibold text-gray-700">${agent.name}</p>
        <p class="text-sm text-gray-500 mt-1">${agent.description}</p>
        <p class="text-xs text-gray-400 mt-4">Cliquez sur "Générer" pour créer la visualisation</p>
      </div>
    `;
  }

  // Setup generate button
  const generateBtn = document.getElementById('generate-viz-btn');
  generateBtn?.addEventListener('click', () => generateVisualization(agent));
}

/**
 * Lance la génération de visualisation
 */
async function generateVisualization(agent) {
  addLog('info', `Génération visualisation: ${agent.name}`);
  
  const generateBtn = document.getElementById('generate-viz-btn');
  const progress = document.getElementById('viz-progress');
  const progressBar = document.getElementById('viz-progress-bar');
  const progressText = document.getElementById('viz-progress-text');
  
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Génération...';
  }
  if (progress) progress.classList.remove('hidden');

  try {
    // Dispatch event pour que l'agent approprié prenne le relais
    window.dispatchEvent(new CustomEvent('viz:generate', { 
      detail: { 
        agent,
        onProgress: (pct, text) => {
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressText) progressText.textContent = text || `${pct}%`;
        },
        onComplete: (data) => {
          if (progress) progress.classList.add('hidden');
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Régénérer';
          }
          enableExportButtons();
        }
      }
    }));

  } catch (error) {
    addLog('error', `Erreur visualisation: ${error.message}`);
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Réessayer';
    }
    if (progress) progress.classList.add('hidden');
  }
}

/**
 * Active les boutons d'export
 */
function enableExportButtons() {
  const pngBtn = document.getElementById('export-png-btn');
  const svgBtn = document.getElementById('export-svg-btn');
  const jsonBtn = document.getElementById('export-json-btn');
  
  if (pngBtn) pngBtn.disabled = false;
  if (svgBtn) svgBtn.disabled = false;
  if (jsonBtn) jsonBtn.disabled = false;
}

/**
 * Affiche le rendu de visualisation
 */
export function showVisualization(element) {
  const placeholder = document.getElementById('viz-placeholder');
  const render = document.getElementById('viz-render');
  
  if (placeholder) placeholder.classList.add('hidden');
  if (render) {
    render.classList.remove('hidden');
    render.innerHTML = '';
    render.appendChild(element);
  }
}

/**
 * Retourne l'onglet actif
 */
export function getActiveTab() {
  return activeTab;
}

/**
 * Bascule vers l'onglet visualisation
 */
export function switchToVisualization() {
  const vizTab = document.getElementById('tab-viz');
  vizTab?.click();
}


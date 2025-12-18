/**
 * Panel Chat - Interface de conversation avec agents visuels intégrés
 */

import { addLog, state } from '../state/state.js';
import { initWebLLM, isModelReady, isModelLoading, getLoadedModel, isDualMode, MODEL_CATALOG, calculateTotalScore, getScoreColor, getSortedModels } from '../llm/webllm.js';
import { getChatHistory, sendMessage, clearChatHistory } from '../llm/chat.js';
import { parseMarkdown } from '../utils/markdown.js';
import { setHubContext } from '../agents/HubAgent.js';
import { showLoadingOverlay, updateLoadingProgress, hideLoadingOverlay } from './LoadingOverlay.js';

let dualModeEnabled = false;
let currentView = 'chat'; // 'chat' ou 'agent'
let currentAgentData = null;

// Icônes SVG pour les agents
const AGENT_ICONS = {
  hub: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>`,
  atlas: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>`,
  timeline: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  scrolly: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`
};

const AGENT_NAMES = {
  hub: 'Exploration Hub',
  atlas: 'Concept Atlas',
  timeline: 'Timeline',
  scrolly: 'Narrative'
};


/**
 * Cree le panel de chat
 */
export function createChatPanel() {
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.className = 'flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden';

  panel.innerHTML = `
    <!-- Header -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img src="./logo-llm-pdf-rag.avif" alt="Logo" class="w-10 h-10 rounded-xl shadow-sm object-cover" />
          <div>
            <h2 class="text-sm font-bold text-gray-900">AI Research Assistant</h2>
            <p id="chat-mode-label" class="text-xs text-gray-500">Single Model Mode</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="back-to-chat-btn" class="hidden px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
            <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Retour Chat
          </button>
          <button id="toggle-dual-btn" class="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
            Compare
          </button>
          <button id="clear-all-chat-btn" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Clear all chats">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div id="main-content-area" class="flex-1 flex gap-2 p-2 min-h-0 overflow-hidden">
      ${createChatColumn('primary')}
    </div>

    <!-- Agent Visualization Area (hidden by default) -->
    <div id="agent-view" class="hidden flex-1 flex flex-col min-h-0 overflow-hidden">
      <div id="agent-header" class="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-gray-100 to-gray-50 border-b border-gray-200">
        <div class="flex items-center gap-2">
          <span id="agent-icon" class="text-gray-600"></span>
          <span id="agent-title" class="text-sm font-semibold text-gray-800"></span>
          <span id="agent-status" class="text-xs text-gray-500 ml-auto"></span>
        </div>
      </div>
      <div id="agent-content" class="flex-1 overflow-auto p-4"></div>
    </div>

    <!-- Agent Mode Selector with Context Panel -->
    <div class="flex-shrink-0 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
      <!-- Context Input (for Hub agent) -->
      <div id="hub-context-panel" class="hidden p-3 border-b border-gray-200 bg-white">
        <p class="text-xs font-medium text-gray-600 mb-2">Contexte d'analyse (optionnel)</p>
        <textarea id="hub-context-input" 
                  class="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" 
                  rows="2" 
                  placeholder="Décrivez l'objectif de votre analyse, les angles à privilégier ou les questions spécifiques..."></textarea>
      </div>
      <!-- Context Input (for Atlas agent) -->
      <div id="atlas-context-panel" class="hidden p-3 border-b border-gray-200 bg-white">
        <p class="text-xs font-medium text-gray-600 mb-2">Contexte du graphe (optionnel)</p>
        <textarea id="atlas-context-input" 
                  class="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" 
                  rows="2" 
                  placeholder="Précisez le domaine d'étude, les concepts clés à privilégier ou les relations à explorer..."></textarea>
      </div>
      
      <div class="p-3">
        <p class="text-xs font-medium text-gray-500 mb-2">Agents (min. 3B)</p>
        <div id="agent-mode-selector" class="grid grid-cols-4 gap-2">
          <button data-agent="hub" class="agent-mode-btn group p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1" disabled>
            <span class="text-gray-500 group-hover:text-gray-700">${AGENT_ICONS.hub}</span>
            <span class="text-xs font-medium text-gray-600">Hub</span>
          </button>
          <button data-agent="atlas" class="agent-mode-btn group p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1" disabled>
            <span class="text-gray-500 group-hover:text-gray-700">${AGENT_ICONS.atlas}</span>
            <span class="text-xs font-medium text-gray-600">Atlas</span>
          </button>
          <button data-agent="timeline" class="agent-mode-btn group p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1" disabled>
            <span class="text-gray-500 group-hover:text-gray-700">${AGENT_ICONS.timeline}</span>
            <span class="text-xs font-medium text-gray-600">Timeline</span>
          </button>
          <button data-agent="scrolly" class="agent-mode-btn group p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1" disabled>
            <span class="text-gray-500 group-hover:text-gray-700">${AGENT_ICONS.scrolly}</span>
            <span class="text-xs font-medium text-gray-600">Narrative</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Shared input -->
    <div id="chat-input-area" class="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50">
      <div class="flex gap-2">
        <input type="text" id="chat-input" placeholder="Ask about your documents..."
               class="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent disabled:bg-gray-100"
               disabled />
        <button id="send-btn" class="px-4 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  `;

  setTimeout(() => setupChatEvents(panel), 0);

  window.addEventListener('chat:messageAdded', (e) => renderMessages(e.detail.slot));
  window.addEventListener('chat:cleared', (e) => renderMessages(e.detail?.slot || 'primary'));
  window.addEventListener('webllm:ready', (e) => updateModelStatus(e.detail.slot));

  return panel;
}

function createChatColumn(slot) {
  const isPrimary = slot === 'primary';
  const sortedModels = getSortedModels();
  const defaultModel = sortedModels[0];
  
  return `
    <div id="chat-column-${slot}" class="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-xl overflow-hidden">
      <!-- Column header with model selector -->
      <div class="flex-shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-gray-700">${isPrimary ? 'Modèle' : 'Modèle B'}</span>
          <span id="model-status-${slot}" class="text-xs text-gray-500">Non chargé</span>
        </div>
        <div class="flex gap-2">
          <!-- Custom dropdown -->
          <div class="relative flex-1">
            <input type="hidden" id="model-select-${slot}" value="${defaultModel.id}">
            <button id="model-dropdown-btn-${slot}" class="w-full px-3 py-2 text-xs text-left border border-gray-200 rounded-lg bg-white hover:bg-gray-50 flex items-center justify-between">
              <span id="model-dropdown-label-${slot}">${defaultModel.recommended ? '★ ' : ''}${defaultModel.name}</span>
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <!-- Dropdown menu -->
            <div id="model-dropdown-menu-${slot}" class="hidden absolute z-50 w-80 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
              ${sortedModels.map(m => {
                const score = calculateTotalScore(m.scores);
                const scoreColor = getScoreColor(score);
                return `
                <div class="model-option group" data-model-id="${m.id}">
                  <div class="px-3 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 transition-all" data-model-id="${m.id}">
                    <!-- Header: Nom + Score -->
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        ${m.recommended ? '<span class="text-yellow-500">★</span>' : ''}
                        <span class="text-sm font-semibold text-gray-800">${m.name}</span>
                        ${m.agentCompatible ? '<span class="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">🤖 Agents</span>' : ''}
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-lg font-bold" style="color: ${scoreColor}">${score.toFixed(1)}</span>
                        <span class="text-xs text-gray-400">/10</span>
                      </div>
                    </div>
                    <!-- Infos: Taille + Params -->
                    <div class="flex items-center gap-3 mb-2 text-xs text-gray-500">
                      <span>📦 ${m.size} GB</span>
                      <span>⚙️ ${m.params}</span>
                    </div>
                    <!-- Barre globale -->
                    <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                      <div class="h-full rounded-full transition-all" style="width: ${score * 10}%; background-color: ${scoreColor}"></div>
                    </div>
                    <!-- 5 critères détaillés (hidden par défaut, visible au hover) -->
                    <div class="model-specs hidden group-hover:grid grid-cols-5 gap-1 pt-2 border-t border-gray-100">
                      <div class="text-center">
                        <div class="text-[9px] text-gray-400 mb-1">Qualité</div>
                        <div class="w-full h-1.5 bg-gray-200 rounded-full"><div class="h-full bg-green-500 rounded-full" style="width: ${m.scores.quality * 50}%"></div></div>
                        <div class="text-[10px] font-medium text-gray-600 mt-0.5">${m.scores.quality.toFixed(1)}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-[9px] text-gray-400 mb-1">Cohérence</div>
                        <div class="w-full h-1.5 bg-gray-200 rounded-full"><div class="h-full bg-blue-500 rounded-full" style="width: ${m.scores.coherence * 50}%"></div></div>
                        <div class="text-[10px] font-medium text-gray-600 mt-0.5">${m.scores.coherence.toFixed(1)}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-[9px] text-gray-400 mb-1">Agentic</div>
                        <div class="w-full h-1.5 bg-gray-200 rounded-full"><div class="h-full bg-purple-500 rounded-full" style="width: ${m.scores.agentic * 50}%"></div></div>
                        <div class="text-[10px] font-medium text-gray-600 mt-0.5">${m.scores.agentic.toFixed(1)}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-[9px] text-gray-400 mb-1">Latence</div>
                        <div class="w-full h-1.5 bg-gray-200 rounded-full"><div class="h-full bg-yellow-500 rounded-full" style="width: ${m.scores.latency * 50}%"></div></div>
                        <div class="text-[10px] font-medium text-gray-600 mt-0.5">${m.scores.latency.toFixed(1)}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-[9px] text-gray-400 mb-1">Contexte</div>
                        <div class="w-full h-1.5 bg-gray-200 rounded-full"><div class="h-full bg-red-500 rounded-full" style="width: ${m.scores.context * 50}%"></div></div>
                        <div class="text-[10px] font-medium text-gray-600 mt-0.5">${m.scores.context.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
          <button id="load-model-${slot}" class="px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors">
            Charger
          </button>
        </div>
        <div id="model-progress-${slot}" class="hidden mt-2">
          <div class="w-full bg-gray-200 rounded-full h-1.5">
            <div id="progress-bar-${slot}" class="bg-gray-600 h-1.5 rounded-full transition-all" style="width: 0%"></div>
          </div>
          <p id="progress-text-${slot}" class="text-xs text-gray-500 mt-1 text-center"></p>
        </div>
      </div>
      
      <!-- Messages -->
      <div id="messages-${slot}" class="flex-1 overflow-y-auto p-3 space-y-3">
        <div class="text-center py-8 text-gray-400">
          <p class="text-sm">Sélectionnez et chargez un modèle</p>
        </div>
      </div>
    </div>
  `;
}

function setupChatEvents(panel) {
  const sendBtn = panel.querySelector('#send-btn');
  const input = panel.querySelector('#chat-input');
  const clearBtn = panel.querySelector('#clear-all-chat-btn');
  const toggleDualBtn = panel.querySelector('#toggle-dual-btn');
  const backBtn = panel.querySelector('#back-to-chat-btn');
  const agentBtns = panel.querySelectorAll('.agent-mode-btn');

  // Back to chat button
  backBtn?.addEventListener('click', () => {
    showChatView();
  });

  // Agent mode buttons
  agentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const agentId = btn.dataset.agent;
      
      // Pass context if Hub agent
      if (agentId === 'hub') {
        const contextInput = document.getElementById('hub-context-input');
        if (contextInput) {
          setHubContext(contextInput.value.trim());
        }
      }
      
      launchAgent(agentId);
    });

    // Show context panel on hover for Hub and Atlas
    btn.addEventListener('mouseenter', () => {
      const agentId = btn.dataset.agent;
      const hubPanel = document.getElementById('hub-context-panel');
      const atlasPanel = document.getElementById('atlas-context-panel');
      
      if (agentId === 'hub' && hubPanel && !btn.disabled) {
        hubPanel.classList.remove('hidden');
        atlasPanel?.classList.add('hidden');
      } else if (agentId === 'atlas' && atlasPanel && !btn.disabled) {
        atlasPanel.classList.remove('hidden');
        hubPanel?.classList.add('hidden');
      }
    });
  });

  // Toggle dual mode
  toggleDualBtn?.addEventListener('click', () => {
    dualModeEnabled = !dualModeEnabled;
    const containers = panel.querySelector('#main-content-area');
    const modeLabel = panel.querySelector('#chat-mode-label');
    
    if (dualModeEnabled) {
      containers.innerHTML = createChatColumn('primary') + createChatColumn('secondary');
      toggleDualBtn.textContent = 'Single';
      modeLabel.textContent = 'Dual Mode';
    } else {
      containers.innerHTML = createChatColumn('primary');
      toggleDualBtn.textContent = 'Compare';
      modeLabel.textContent = 'Single Model Mode';
    }
    
    setupColumnEvents('primary');
    if (dualModeEnabled) setupColumnEvents('secondary');
    updateInputState();
  });

  setupColumnEvents('primary');

  // Send message
  const handleSend = async () => {
    const message = input.value.trim();
    if (!message) return;

    const slots = dualModeEnabled ? ['primary', 'secondary'] : ['primary'];
    const activeSlots = slots.filter(s => isModelReady(s));
    
    if (activeSlots.length === 0) {
      addLog('warning', 'Load at least one model first');
      return;
    }

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    const promises = activeSlots.map(slot => 
      sendMessage(message, getSettings(), (token, full) => {
        updateStreamingMessage(full, slot);
      }, slot).catch(err => addLog('error', `${slot}: ${err.message}`))
    );

    await Promise.all(promises);

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  };

  sendBtn?.addEventListener('click', handleSend);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  clearBtn?.addEventListener('click', () => {
    if (confirm('Clear all chat history?')) {
      clearChatHistory('primary');
      if (dualModeEnabled) clearChatHistory('secondary');
    }
  });
}

/**
 * Lance un agent et affiche sa visualisation
 */
async function launchAgent(agentId) {
  const mainContent = document.getElementById('main-content-area');
  const agentView = document.getElementById('agent-view');
  const backBtn = document.getElementById('back-to-chat-btn');
  const inputArea = document.getElementById('chat-input-area');
  const agentIcon = document.getElementById('agent-icon');
  const agentTitle = document.getElementById('agent-title');
  const agentStatus = document.getElementById('agent-status');
  const agentContent = document.getElementById('agent-content');

  // Switch to agent view
  mainContent?.classList.add('hidden');
  agentView?.classList.remove('hidden');
  agentView?.classList.add('flex');
  backBtn?.classList.remove('hidden');
  inputArea?.classList.add('hidden');

  // Update header
  if (agentIcon) agentIcon.innerHTML = AGENT_ICONS[agentId];
  if (agentTitle) agentTitle.textContent = AGENT_NAMES[agentId];
  if (agentStatus) agentStatus.textContent = 'Generating...';

  // Show loading overlay
  showLoadingOverlay(`Generation ${AGENT_NAMES[agentId]}`, `${state.docs.length} documents, ${state.chunks.length} chunks`);

  // Show loading in content
  if (agentContent) {
    agentContent.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-gray-400">
        <img src="./logo-llm-pdf-rag.avif" alt="Logo" class="w-16 h-16 rounded-xl shadow-sm object-cover mb-4 opacity-50" />
        <p class="text-sm">Generation ${AGENT_NAMES[agentId]}...</p>
      </div>
    `;
  }

  currentView = 'agent';

  // Trigger agent generation
  window.dispatchEvent(new CustomEvent('viz:generate', {
    detail: {
      agent: { id: agentId, name: AGENT_NAMES[agentId] },
      onProgress: (pct, text) => {
        if (agentStatus) agentStatus.textContent = text || `${pct}%`;
        updateLoadingProgress(pct, text || 'Analyse en cours...', `${AGENT_NAMES[agentId]}`);
      },
      onComplete: (data) => {
        hideLoadingOverlay();
        currentAgentData = { agentId, data, timestamp: new Date() };
        if (agentStatus) agentStatus.textContent = 'Ready';
        
        // Save to history
        saveAgentToHistory(agentId, data);
      }
    }
  }));
}

/**
 * Affiche la vue chat
 */
function showChatView() {
  const mainContent = document.getElementById('main-content-area');
  const agentView = document.getElementById('agent-view');
  const backBtn = document.getElementById('back-to-chat-btn');
  const inputArea = document.getElementById('chat-input-area');

  mainContent?.classList.remove('hidden');
  agentView?.classList.add('hidden');
  agentView?.classList.remove('flex');
  backBtn?.classList.add('hidden');
  inputArea?.classList.remove('hidden');

  currentView = 'chat';
}

/**
 * Sauvegarde un résultat d'agent dans l'historique
 */
function saveAgentToHistory(agentId, data) {
  const entry = {
    id: `agent-${Date.now()}`,
    type: 'agent',
    agentId,
    agentName: AGENT_NAMES[agentId],
    timestamp: new Date(),
    data
  };

  if (!state.agentHistory) {
    state.agentHistory = [];
  }
  state.agentHistory.unshift(entry);

  // Limit to 20 entries
  if (state.agentHistory.length > 20) {
    state.agentHistory.pop();
  }

  window.dispatchEvent(new CustomEvent('agent:saved', { detail: entry }));
}

/**
 * Affiche un résultat d'agent depuis l'historique
 */
export function showAgentFromHistory(entry) {
  const mainContent = document.getElementById('main-content-area');
  const agentView = document.getElementById('agent-view');
  const backBtn = document.getElementById('back-to-chat-btn');
  const inputArea = document.getElementById('chat-input-area');
  const agentIcon = document.getElementById('agent-icon');
  const agentTitle = document.getElementById('agent-title');
  const agentStatus = document.getElementById('agent-status');

  mainContent?.classList.add('hidden');
  agentView?.classList.remove('hidden');
  agentView?.classList.add('flex');
  backBtn?.classList.remove('hidden');
  inputArea?.classList.add('hidden');

  if (agentIcon) agentIcon.innerHTML = AGENT_ICONS[entry.agentId];
  if (agentTitle) agentTitle.textContent = entry.agentName;
  if (agentStatus) agentStatus.textContent = new Date(entry.timestamp).toLocaleTimeString();

  currentView = 'agent';

  // Re-render the visualization
  window.dispatchEvent(new CustomEvent('viz:restore', { detail: entry }));
}

function setupColumnEvents(slot) {
  const loadBtn = document.getElementById(`load-model-${slot}`);
  const modelSelect = document.getElementById(`model-select-${slot}`);
  const dropdownBtn = document.getElementById(`model-dropdown-btn-${slot}`);
  const dropdownMenu = document.getElementById(`model-dropdown-menu-${slot}`);
  const dropdownLabel = document.getElementById(`model-dropdown-label-${slot}`);
  
  // Toggle dropdown
  dropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle('hidden');
  });
  
  // Close dropdown on outside click
  document.addEventListener('click', () => {
    dropdownMenu?.classList.add('hidden');
  });
  
  // Handle option selection
  dropdownMenu?.querySelectorAll('.model-option').forEach(option => {
    const optionInner = option.querySelector('[data-model-id]');
    
    // Select model on click
    optionInner?.addEventListener('click', (e) => {
      e.stopPropagation();
      const modelId = optionInner.dataset.modelId;
      const model = MODEL_CATALOG.find(m => m.id === modelId);
      if (model && modelSelect && dropdownLabel) {
        modelSelect.value = modelId;
        dropdownLabel.textContent = `${model.recommended ? '★ ' : ''}${model.name}`;
        dropdownMenu?.classList.add('hidden');
      }
    });
  });
  
  loadBtn?.addEventListener('click', async () => {
    const modelId = modelSelect.value;
    const model = MODEL_CATALOG.find(m => m.id === modelId);
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    
    const progress = document.getElementById(`model-progress-${slot}`);
    const progressBar = document.getElementById(`progress-bar-${slot}`);
    const progressText = document.getElementById(`progress-text-${slot}`);
    
    progress?.classList.remove('hidden');
    
    // Afficher overlay
    showLoadingOverlay('Chargement du modele', model?.name || modelId);

    try {
      await initWebLLM(modelId, (pct, text) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = text || `${pct}%`;
        updateLoadingProgress(pct, text || 'Telechargement...', `${model?.size || '?'} GB`);
      }, slot);

      hideLoadingOverlay();
      progress?.classList.add('hidden');
      loadBtn.textContent = 'Changer';
      loadBtn.disabled = false;
      // Ne pas désactiver le select pour permettre de changer de modèle
      updateModelStatus(slot);
      updateInputState();

    } catch (error) {
      hideLoadingOverlay();
      progress?.classList.add('hidden');
      loadBtn.disabled = false;
      loadBtn.textContent = 'Retry';
      addLog('error', `${slot}: ${error.message}`);
    }
  });
}

function getSettings() {
  return {
    temperature: state.settings.temperature || 0.7,
    topN: state.settings.topN || 5,
    maxTokens: state.settings.maxTokens || 1024,
    systemPrompt: state.settings.systemPrompt
  };
}

function updateInputState() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const agentBtns = document.querySelectorAll('.agent-mode-btn');

  const anyReady = isModelReady('primary') || isModelReady('secondary');

  if (input) input.disabled = !anyReady;
  if (sendBtn) sendBtn.disabled = !anyReady;

  // Vérifier si un modèle 3B+ est chargé via le flag agentCompatible
  const loadedModelId = getLoadedModel('primary') || getLoadedModel('secondary');
  const loadedModelData = MODEL_CATALOG.find(m => m.id === loadedModelId);
  const is3BPlus = loadedModelData?.agentCompatible === true;

  agentBtns.forEach(btn => {
    btn.disabled = !is3BPlus || state.vectorStore.length === 0;
  });
}

function updateModelStatus(slot) {
  const status = document.getElementById(`model-status-${slot}`);
  if (!status) return;

  if (isModelReady(slot)) {
    const model = MODEL_CATALOG.find(m => m.id === getLoadedModel(slot));
    status.textContent = model?.name || 'Ready';
    status.className = 'text-xs text-green-600 font-medium';
  } else if (isModelLoading(slot)) {
    status.textContent = 'Loading...';
    status.className = 'text-xs text-gray-500';
  } else {
    status.textContent = 'Not loaded';
    status.className = 'text-xs text-gray-500';
  }
}

function renderMessages(slot = 'primary') {
  const container = document.getElementById(`messages-${slot}`);
  if (!container) return;

  const history = getChatHistory(slot);

  if (history.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <p class="text-sm">${isModelReady(slot) ? 'Ready to chat' : 'Select and load a model'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(msg => createMessageHTML(msg)).join('');
  container.scrollTop = container.scrollHeight;
}

function createMessageHTML(msg) {
  const isUser = msg.role === 'user';
  const time = msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let sourcesHTML = '';
  if (!isUser && msg.sources && msg.sources.length > 0) {
    sourcesHTML = `
      <details class="mt-2 text-xs">
        <summary class="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
          ${msg.sources.length} source(s)
        </summary>
        <div class="mt-1 space-y-1 pl-2 border-l-2 border-gray-200">
          ${msg.sources.map((s, i) => `
            <div class="bg-gray-50 p-1.5 rounded text-xs">
              <span class="font-semibold text-gray-700">[${i + 1}] ${s.source}</span>
              <span class="text-gray-500 ml-1">${(s.score * 100).toFixed(0)}%</span>
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  const contentHTML = isUser ? msg.content : parseMarkdown(msg.content);

  return `
    <div class="flex ${isUser ? 'justify-end' : 'justify-start'}">
      <div class="max-w-[90%] ${isUser ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} rounded-xl px-3 py-2">
        <div class="text-xs ${isUser ? '' : 'prose prose-xs max-w-none'}">${contentHTML}</div>
        ${sourcesHTML}
        <div class="text-xs ${isUser ? 'text-gray-400' : 'text-gray-400'} mt-1">${time}</div>
      </div>
    </div>
  `;
}

function updateStreamingMessage(content, slot) {
  const container = document.getElementById(`messages-${slot}`);
  if (!container) return;

  let streamingEl = container.querySelector(`#streaming-${slot}`);
  
  if (!streamingEl) {
    streamingEl = document.createElement('div');
    streamingEl.id = `streaming-${slot}`;
    streamingEl.className = 'flex justify-start';
    container.appendChild(streamingEl);
  }

  const parsedContent = parseMarkdown(content);

  streamingEl.innerHTML = `
    <div class="max-w-[90%] bg-gray-100 text-gray-900 rounded-xl px-3 py-2">
      <div class="text-xs prose prose-xs max-w-none">${parsedContent}</div>
      <div class="flex items-center gap-1 mt-1">
        <span class="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse"></span>
        <span class="text-xs text-gray-400">...</span>
      </div>
    </div>
  `;

  container.scrollTop = container.scrollHeight;
}

window.addEventListener('chat:messageAdded', (e) => {
  if (e.detail.role === 'assistant') {
    const streamingEl = document.getElementById(`streaming-${e.detail.slot}`);
    if (streamingEl) streamingEl.remove();
  }
});

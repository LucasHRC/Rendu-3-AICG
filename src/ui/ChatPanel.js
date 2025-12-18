/**
 * Panel Chat - Interface de conversation avec mode dual pour comparaison
 */

import { addLog, state } from '../state/state.js';
import { initWebLLM, isModelReady, isModelLoading, getLoadedModel, isDualMode, MODEL_CATALOG } from '../llm/webllm.js';
import { getChatHistory, sendMessage, generateLiteratureReview, clearChatHistory } from '../llm/chat.js';
import { parseMarkdown } from '../utils/markdown.js';

let dualModeEnabled = false;

/**
 * Cree le panel de chat
 */
export function createChatPanel() {
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.className = 'flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden';

  panel.innerHTML = `
    <!-- Header -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-bold text-gray-900">AI Research Assistant</h2>
            <p id="chat-mode-label" class="text-xs text-gray-500">Single Model Mode</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="toggle-dual-btn" class="px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors">
            Compare Models
          </button>
          <button id="clear-all-chat-btn" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Clear all chats">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Chat containers -->
    <div id="chat-containers" class="flex-1 flex gap-2 p-2 min-h-0 overflow-hidden">
      ${createChatColumn('primary')}
    </div>

    <!-- Shared input -->
    <div class="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50">
      <div class="flex gap-2 mb-2">
        <button id="lit-review-btn" class="px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50" disabled>
          Generate Literature Review
        </button>
      </div>
      <div class="flex gap-2">
        <input type="text" id="chat-input" placeholder="Ask about your documents..."
               class="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
               disabled />
        <button id="send-btn" class="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
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
  const colorClass = isPrimary ? 'blue' : 'green';
  
  return `
    <div id="chat-column-${slot}" class="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-xl overflow-hidden">
      <!-- Column header with model selector -->
      <div class="flex-shrink-0 px-3 py-2 bg-${colorClass}-50 border-b border-${colorClass}-100">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-${colorClass}-800">${isPrimary ? 'Model A' : 'Model B'}</span>
          <span id="model-status-${slot}" class="text-xs text-gray-500">Not loaded</span>
        </div>
        <div class="flex gap-2">
          <select id="model-select-${slot}" class="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
            ${MODEL_CATALOG.map(m => `
              <option value="${m.id}">${m.name} (${m.size})</option>
            `).join('')}
          </select>
          <button id="load-model-${slot}" class="px-3 py-1.5 text-xs font-medium bg-${colorClass}-600 text-white rounded-lg hover:bg-${colorClass}-700 transition-colors">
            Load
          </button>
        </div>
        <div id="model-progress-${slot}" class="hidden mt-2">
          <div class="w-full bg-gray-200 rounded-full h-1.5">
            <div id="progress-bar-${slot}" class="bg-${colorClass}-600 h-1.5 rounded-full transition-all" style="width: 0%"></div>
          </div>
          <p id="progress-text-${slot}" class="text-xs text-gray-500 mt-1 text-center"></p>
        </div>
      </div>
      
      <!-- Messages -->
      <div id="messages-${slot}" class="flex-1 overflow-y-auto p-3 space-y-3">
        <div class="text-center py-8 text-gray-400">
          <p class="text-sm">Select and load a model</p>
        </div>
      </div>
    </div>
  `;
}

function setupChatEvents(panel) {
  const sendBtn = panel.querySelector('#send-btn');
  const input = panel.querySelector('#chat-input');
  const clearBtn = panel.querySelector('#clear-all-chat-btn');
  const litReviewBtn = panel.querySelector('#lit-review-btn');
  const toggleDualBtn = panel.querySelector('#toggle-dual-btn');

  // Toggle dual mode
  toggleDualBtn?.addEventListener('click', () => {
    dualModeEnabled = !dualModeEnabled;
    const containers = panel.querySelector('#chat-containers');
    const modeLabel = panel.querySelector('#chat-mode-label');
    
    if (dualModeEnabled) {
      containers.innerHTML = createChatColumn('primary') + createChatColumn('secondary');
      toggleDualBtn.textContent = 'Single Mode';
      toggleDualBtn.className = 'px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors';
      modeLabel.textContent = 'Dual Mode - Compare Models';
    } else {
      containers.innerHTML = createChatColumn('primary');
      toggleDualBtn.textContent = 'Compare Models';
      toggleDualBtn.className = 'px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors';
      modeLabel.textContent = 'Single Model Mode';
    }
    
    // Re-setup column events
    setupColumnEvents('primary');
    if (dualModeEnabled) setupColumnEvents('secondary');
    updateInputState();
  });

  // Initial column setup
  setupColumnEvents('primary');

  // Send message to active models
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

    // Send to all active models in parallel
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

  // Clear all
  clearBtn?.addEventListener('click', () => {
    if (confirm('Clear all chat history?')) {
      clearChatHistory('primary');
      if (dualModeEnabled) clearChatHistory('secondary');
    }
  });

  // Literature Review
  litReviewBtn?.addEventListener('click', async () => {
    const slots = dualModeEnabled ? ['primary', 'secondary'] : ['primary'];
    const activeSlots = slots.filter(s => isModelReady(s));
    
    if (activeSlots.length === 0 || state.vectorStore.length === 0) {
      addLog('warning', 'Load models and embed documents first');
      return;
    }

    litReviewBtn.disabled = true;
    litReviewBtn.textContent = 'Generating...';

    const promises = activeSlots.map(slot => 
      generateLiteratureReview(getSettings(), (token, full) => {
        updateStreamingMessage(full, slot);
      }, slot).catch(err => addLog('error', `${slot}: ${err.message}`))
    );

    await Promise.all(promises);

    litReviewBtn.disabled = false;
    litReviewBtn.textContent = 'Generate Literature Review';
  });
}

function setupColumnEvents(slot) {
  const loadBtn = document.getElementById(`load-model-${slot}`);
  const modelSelect = document.getElementById(`model-select-${slot}`);
  
  loadBtn?.addEventListener('click', async () => {
    const modelId = modelSelect.value;
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    
    const progress = document.getElementById(`model-progress-${slot}`);
    const progressBar = document.getElementById(`progress-bar-${slot}`);
    const progressText = document.getElementById(`progress-text-${slot}`);
    
    progress?.classList.remove('hidden');

    try {
      await initWebLLM(modelId, (pct, text) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = text || `${pct}%`;
      }, slot);

      progress?.classList.add('hidden');
      loadBtn.textContent = 'Loaded';
      loadBtn.className = loadBtn.className.replace(/bg-\w+-600/, 'bg-gray-400');
      modelSelect.disabled = true;
      updateModelStatus(slot);
      updateInputState();

    } catch (error) {
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
  const litReviewBtn = document.getElementById('lit-review-btn');

  const anyReady = isModelReady('primary') || isModelReady('secondary');

  if (input) input.disabled = !anyReady;
  if (sendBtn) sendBtn.disabled = !anyReady;
  if (litReviewBtn) litReviewBtn.disabled = !anyReady;
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
    status.className = 'text-xs text-blue-500';
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
        <summary class="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
          ${msg.sources.length} source(s)
        </summary>
        <div class="mt-1 space-y-1 pl-2 border-l-2 border-blue-200">
          ${msg.sources.map((s, i) => `
            <div class="bg-blue-50 p-1.5 rounded text-xs">
              <span class="font-semibold text-blue-800">[${i + 1}] ${s.source}</span>
              <span class="text-blue-600 ml-1">${(s.score * 100).toFixed(0)}%</span>
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  const contentHTML = isUser ? msg.content : parseMarkdown(msg.content);

  return `
    <div class="flex ${isUser ? 'justify-end' : 'justify-start'}">
      <div class="max-w-[90%] ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'} rounded-xl px-3 py-2">
        <div class="text-xs ${isUser ? '' : 'prose prose-xs max-w-none'}">${contentHTML}</div>
        ${sourcesHTML}
        <div class="text-xs ${isUser ? 'text-blue-200' : 'text-gray-400'} mt-1">${time}</div>
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
        <span class="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
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

/**
 * Panel de controles systeme
 */

import { state, addLog } from '../state/state.js';

const DEFAULT_SYSTEM_PROMPT = `You are an Academic Research Assistant specialized in literature reviews.

Your role:
- Analyze and synthesize information from research documents
- Provide accurate, well-structured responses based on the provided context
- Always cite your sources using [Source X] format
- When generating literature reviews, organize content thematically
- Be precise and avoid hallucinating information not in the context`;

/**
 * Cree le panel de controles
 */
export function createSystemControls() {
  const panel = document.createElement('div');
  panel.id = 'system-controls';
  panel.className = 'bg-white rounded-xl border border-gray-200 p-4';

  // Initialiser les settings si non definis
  if (!state.settings.maxTokens) state.settings.maxTokens = 1024;
  if (!state.settings.systemPrompt) state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;

  panel.innerHTML = `
    <h3 class="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
      <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      System Controls
    </h3>

    <div class="space-y-4">
      <!-- Temperature -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-medium text-gray-700">Temperature</label>
          <span id="temp-value" class="text-xs font-semibold text-blue-600">${state.settings.temperature}</span>
        </div>
        <input type="range" id="temp-slider" min="0" max="2" step="0.1" value="${state.settings.temperature}"
               class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      <!-- Top N -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-medium text-gray-700">RAG Top N</label>
          <span id="topn-value" class="text-xs font-semibold text-purple-600">${state.settings.topN}</span>
        </div>
        <input type="range" id="topn-slider" min="1" max="20" step="1" value="${state.settings.topN}"
               class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600" />
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>1 chunk</span>
          <span>20 chunks</span>
        </div>
      </div>

      <!-- Max Tokens -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-medium text-gray-700">Max Tokens</label>
          <span id="tokens-value" class="text-xs font-semibold text-green-600">${state.settings.maxTokens}</span>
        </div>
        <input type="range" id="tokens-slider" min="100" max="2000" step="100" value="${state.settings.maxTokens}"
               class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600" />
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>100</span>
          <span>2000</span>
        </div>
      </div>

      <!-- System Prompt -->
      <div>
        <label class="text-xs font-medium text-gray-700 block mb-1">System Prompt</label>
        <textarea id="system-prompt" rows="4"
                  class="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
        >${state.settings.systemPrompt}</textarea>
        <button id="reset-prompt-btn" class="mt-1 text-xs text-blue-600 hover:text-blue-800">
          Reset to default
        </button>
      </div>
    </div>
  `;

  setTimeout(() => setupControlEvents(panel), 0);

  return panel;
}

function setupControlEvents(panel) {
  // Temperature
  const tempSlider = panel.querySelector('#temp-slider');
  const tempValue = panel.querySelector('#temp-value');
  tempSlider?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.settings.temperature = val;
    tempValue.textContent = val.toFixed(1);
  });

  // Top N
  const topnSlider = panel.querySelector('#topn-slider');
  const topnValue = panel.querySelector('#topn-value');
  topnSlider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.settings.topN = val;
    topnValue.textContent = val;
  });

  // Max Tokens
  const tokensSlider = panel.querySelector('#tokens-slider');
  const tokensValue = panel.querySelector('#tokens-value');
  tokensSlider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.settings.maxTokens = val;
    tokensValue.textContent = val;
  });

  // System Prompt
  const promptTextarea = panel.querySelector('#system-prompt');
  promptTextarea?.addEventListener('change', (e) => {
    state.settings.systemPrompt = e.target.value;
    addLog('info', 'System prompt updated');
  });

  // Reset button
  const resetBtn = panel.querySelector('#reset-prompt-btn');
  resetBtn?.addEventListener('click', () => {
    state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    promptTextarea.value = DEFAULT_SYSTEM_PROMPT;
    addLog('info', 'System prompt reset');
  });
}


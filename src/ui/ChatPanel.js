/**
 * Panel Chat - Interface de conversation avec agents visuels intégrés
 */

import { addLog, state } from '../state/state.js';
import { initWebLLM, isModelReady, isModelLoading, getLoadedModel, isDualMode, MODEL_CATALOG, calculateTotalScore, getScoreColor, getSortedModels } from '../llm/webllm.js';
import { getChatHistory, sendMessage, clearChatHistory } from '../llm/chat.js';
import { parseMarkdown } from '../utils/markdown.js';
import { showChunkViewer } from './ChunkViewer.js';
// Agents supprimés - remplacés par Revue RAG unifiée
import { isSTTSupported, createSpeechRecognition } from '../voice/speechRecognition.js';
import { showRAGReviewModal } from './RAGReviewModal.js';
import { createProgressIndicator, updateProgressIndicator, removeProgressIndicator } from './ProgressIndicator.js';

let dualModeEnabled = false;

// Agents supprimés - remplacés par Revue RAG unifiée


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

    <!-- Revue RAG Area (sera ajoutée plus tard) -->

    <!-- Revue RAG Button -->
    <div class="flex-shrink-0 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-2">
      <button id="rag-review-btn" class="w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center justify-center gap-2">
        <span>RAG</span>
        <span>Revue Littéraire</span>
      </button>
    </div>

    <!-- Shared input -->
    <div id="chat-input-area" class="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50">
      <div class="flex gap-2">
        <div class="flex-1 relative">
          <textarea id="chat-input" placeholder="Ask about your documents..." rows="1"
                    class="w-full px-4 py-3 pr-12 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent disabled:bg-gray-100 resize-none overflow-hidden"
                    disabled></textarea>
          <!-- Dictaphone button -->
          <button id="dictaphone-btn" 
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled
                  title="Mode Dictaphone (transcription vocale)">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
          </button>
          <!-- Dictaphone status indicator -->
          <div id="dictaphone-status" class="hidden absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-2 px-2 py-1 bg-red-50 border border-red-200 rounded-lg">
            <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span class="text-xs text-red-700 font-medium">Écoute...</span>
          </div>
        </div>
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
  
  // Exposer showChunkViewer globalement pour les onclick
  window.showChunkViewer = showChunkViewer;
  window.addEventListener('webllm:ready', (e) => updateModelStatus(e.detail.slot));

  return panel;
}

function createChatColumn(slot) {
  const isPrimary = slot === 'primary';
  const sortedModels = getSortedModels();
  // Utiliser Llama 3.2 3B comme défaut (recommandé)
  const llama3B = MODEL_CATALOG.find(m => m.id === 'Llama-3.2-3B-Instruct-q4f16_1-MLC');
  const defaultModel = llama3B || sortedModels.find(m => m.recommended) || sortedModels[0];
  
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
                        ${m.agentCompatible ? '<span class="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded"> Agents</span>' : ''}
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-lg font-bold" style="color: ${scoreColor}">${score.toFixed(1)}</span>
                        <span class="text-xs text-gray-400">/10</span>
                      </div>
                    </div>
                    <!-- Infos: Taille + Params -->
                    <div class="flex items-center gap-3 mb-2 text-xs text-gray-500">
                      <span>📦 ${m.size} GB</span>
                      <span>${m.params}</span>
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
  // Back to chat button
  backBtn?.addEventListener('click', () => {
    showChatView();
  });

  // Revue RAG button
  const ragReviewBtn = panel.querySelector('#rag-review-btn');
  ragReviewBtn?.addEventListener('click', () => {
    showRAGReviewModal();
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
    // Auto-resize textarea
    if (input.tagName === 'TEXTAREA') {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    }
  });

  // Mode Dictaphone (STT pour transcrire dans le chat)
  let dictaphoneRecognition = null;
  let dictaphoneActive = false;
  const dictaphoneBtn = panel.querySelector('#dictaphone-btn');
  const dictaphoneStatus = panel.querySelector('#dictaphone-status');

  if (dictaphoneBtn) {
    // Vérifier support STT
    if (!isSTTSupported()) {
      dictaphoneBtn.disabled = true;
      dictaphoneBtn.classList.add('opacity-50', 'cursor-not-allowed');
      dictaphoneBtn.title = 'Reconnaissance vocale non disponible (utilisez Chrome/Edge)';
    } else {
      dictaphoneBtn.addEventListener('click', () => {
        if (dictaphoneActive) {
          // Arrêter la transcription
          if (dictaphoneRecognition) {
            try {
              dictaphoneRecognition.stop();
            } catch (e) {
              console.warn('[Dictaphone] Error stopping:', e);
            }
            dictaphoneRecognition = null;
          }
          dictaphoneActive = false;
          dictaphoneBtn.classList.remove('bg-red-500', 'text-red-600');
          dictaphoneBtn.classList.add('text-gray-400');
          dictaphoneStatus?.classList.add('hidden');
          addLog('info', 'Dictaphone arrêté');
        } else {
          // Démarrer la transcription
          dictaphoneActive = true;
          dictaphoneBtn.classList.remove('text-gray-400');
          dictaphoneBtn.classList.add('bg-red-500', 'text-red-600');
          dictaphoneStatus?.classList.remove('hidden');
          addLog('info', 'Dictaphone activé - parlez maintenant');

          dictaphoneRecognition = createSpeechRecognition({
            lang: 'fr-FR',
            continuous: true,
            interimResults: true,
            onResult: ({ interim, final, isFinal }) => {
              if (isFinal && final && final.trim()) {
                // ACCUMULER au lieu de remplacer
                const currentText = input.value.trim();
                const newText = currentText 
                  ? `${currentText} ${final}`  // Ajouter avec espace
                  : final;  // Première transcription
                
                input.value = newText;
                
                // Auto-resize textarea
                if (input.tagName === 'TEXTAREA') {
                  input.style.height = 'auto';
                  input.style.height = input.scrollHeight + 'px';
                }
                
                // Focus pour permettre modification
                input.focus();
                input.scrollTop = input.scrollHeight;
                addLog('success', `Transcription ajoutée: "${final.substring(0, 50)}..."`);
              } else if (!isFinal && interim && interim.trim()) {
                // Pour l'interim, on affiche : texte accumulé + interim
                const currentText = input.value.trim();
                // Extraire le dernier mot final si existe pour le remplacer par interim
                const parts = currentText.split(/\s+/);
                const lastPart = parts[parts.length - 1];
                
                // Si le dernier mot semble être un interim précédent, le remplacer
                // Sinon, ajouter l'interim
                if (interim.startsWith(lastPart) || lastPart.length < 3) {
                  parts[parts.length - 1] = interim;
                  input.value = parts.join(' ');
                } else {
                  input.value = currentText ? `${currentText} ${interim}` : interim;
                }
                
                if (input.tagName === 'TEXTAREA') {
                  input.style.height = 'auto';
                  input.style.height = input.scrollHeight + 'px';
                }
              }
            },
            onError: (error) => {
              console.error('[Dictaphone] Error:', error);
              addLog('error', `Erreur dictaphone: ${error}`);
              // Reset UI
              dictaphoneActive = false;
              dictaphoneBtn.classList.remove('bg-red-500', 'text-red-600');
              dictaphoneBtn.classList.add('text-gray-400');
              dictaphoneStatus?.classList.add('hidden');
            },
            onEnd: () => {
              // Si arrêté inattendu, réinitialiser
              if (dictaphoneActive) {
                console.log('[Dictaphone] Recognition ended, resetting...');
                dictaphoneActive = false;
                dictaphoneBtn.classList.remove('bg-red-500', 'text-red-600');
                dictaphoneBtn.classList.add('text-gray-400');
                dictaphoneStatus?.classList.add('hidden');
              }
            }
          });

          try {
            dictaphoneRecognition.start();
          } catch (e) {
            console.error('[Dictaphone] Failed to start:', e);
            addLog('error', 'Impossible de démarrer le dictaphone');
            dictaphoneActive = false;
            dictaphoneBtn.classList.remove('bg-red-500', 'text-red-600');
            dictaphoneBtn.classList.add('text-gray-400');
            dictaphoneStatus?.classList.add('hidden');
          }
        }
      });
    }
  }

  clearBtn?.addEventListener('click', () => {
    if (confirm('Clear all chat history?')) {
      clearChatHistory('primary');
      if (dualModeEnabled) clearChatHistory('secondary');
    }
  });
}

// Agents supprimés - remplacés par Revue RAG unifiée

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
// Agents supprimés - remplacés par Revue RAG unifiée

// Agents supprimés - remplacés par Revue RAG unifiée

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
    
    const indicatorId = `model-loading-${slot}`;
    createProgressIndicator(indicatorId, {
      title: `Chargement ${model.name}`,
      subtitle: modelId,
      position: 'bottom-right',
      persistent: false
    });

    try {
      await initWebLLM(modelId, (pct, text) => {
        updateProgressIndicator(indicatorId, pct, text || 'Chargement...', '');
      }, slot);

      removeProgressIndicator(indicatorId, true);
      loadBtn.textContent = 'Changer';
      loadBtn.disabled = false;
      updateModelStatus(slot);
      updateInputState();

    } catch (error) {
      removeProgressIndicator(indicatorId, false);
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
  const dictaphoneBtn = document.getElementById('dictaphone-btn');
  const anyReady = isModelReady('primary') || isModelReady('secondary');

  if (input) input.disabled = !anyReady;
  if (sendBtn) sendBtn.disabled = !anyReady || !input?.value.trim();

  // Activer/désactiver dictaphone selon disponibilité modèle
  if (dictaphoneBtn && isSTTSupported()) {
    dictaphoneBtn.disabled = !anyReady;
  }
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

  container.innerHTML = history.map((msg, idx) => createMessageHTML(msg, idx)).join('');
  container.scrollTop = container.scrollHeight;
  
  // Attacher les event listeners pour les boutons "Voir le chunk complet"
  container.querySelectorAll('.chunk-viewer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const msgIdx = parseInt(btn.dataset.msgIdx);
      const sourceIdx = parseInt(btn.dataset.sourceIndex);
      const msg = history[msgIdx];
      if (msg && msg.sources && msg.sources[sourceIdx]) {
        window.showChunkViewer(msg.sources[sourceIdx]);
      }
    });
  });
}

function createMessageHTML(msg, msgIdx) {
  const isUser = msg.role === 'user';
  const time = msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let sourcesHTML = '';
  if (!isUser && msg.sources && msg.sources.length > 0) {
    sourcesHTML = `
      <details class="mt-2 text-xs">
        <summary class="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
          ${msg.sources.length} source(s) - Cliquez pour voir les détails
        </summary>
        <div class="mt-2 space-y-2 pl-2 border-l-2 border-gray-200">
          ${msg.sources.map((s, i) => `
            <div class="bg-gray-50 p-2 rounded-lg border border-gray-200">
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-gray-700">
                  [${i + 1}] ${s.docName || s.source} - Doc${s.docIndex || '?'}:Chunk${s.chunkIndex || '?'}
                </span>
                ${s.score ? `<span class="text-gray-500 text-xs">${(s.score * 100).toFixed(0)}%</span>` : ''}
              </div>
              ${s.text ? `
                <p class="text-gray-600 text-xs line-clamp-2 mb-2">${s.text.substring(0, 150)}${s.text.length > 150 ? '...' : ''}</p>
              ` : ''}
              <button 
                data-msg-idx="${msgIdx}"
                data-source-index="${i}"
                class="chunk-viewer-btn text-xs text-blue-600 hover:text-blue-800 font-medium underline cursor-pointer"
              >
                Voir le chunk complet
              </button>
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

/**
 * Panel de Paramètres Système
 * Permet de modifier Temperature, System Prompt, Top N, paramètres voix, etc.
 */

import { state, addLog } from '../state/state.js';
import { TTS_MODELS, getAllModelsSorted, getModelsByCategory } from '../voice/ttsModels.js';
import { isModelAvailable, getModelStatus } from '../voice/ttsModelValidator.js';

let settingsPanel = null;

/**
 * Crée le panel de paramètres
 */
export function createSettingsPanel() {
  if (settingsPanel) {
    return settingsPanel;
  }

  settingsPanel = document.createElement('div');
  settingsPanel.id = 'settings-panel';
  settingsPanel.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm';
  
  // Charger les paramètres sauvegardés
  const savedSettings = localStorage.getItem('appSettings');
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      Object.assign(state.settings, parsed);
    } catch (e) {
      console.warn('[Settings] Failed to load saved settings:', e);
    }
  }

  settingsPanel.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden m-4 flex flex-col">
      <!-- Header -->
      <div class="flex-shrink-0 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-bold text-gray-900">Paramètres Système</h2>
            <p class="text-xs text-gray-500">Configuration LLM, RAG et voix</p>
          </div>
        </div>
        <button id="close-settings" class="p-2 hover:bg-white rounded-lg transition-colors">
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- LLM Parameters -->
        <section class="bg-gray-50 rounded-lg p-4">
          <h3 class="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            Paramètres LLM
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">
                Temperature: <span id="temp-value" class="text-purple-600 font-bold">${state.settings.temperature}</span>
              </label>
              <input type="range" id="temp-slider" min="0" max="2" step="0.1" 
                     value="${state.settings.temperature}"
                     class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600">
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>Conservateur (0)</span>
                <span>Équilibré (1)</span>
                <span>Créatif (2)</span>
              </div>
              <p class="text-xs text-gray-400 mt-1">Contrôle la créativité des réponses. Plus élevé = plus varié.</p>
            </div>
            
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">
                Top N Chunks (RAG)
              </label>
              <input type="number" id="topn-input" min="1" max="20" step="1"
                     value="${state.settings.topN}"
                     class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              <p class="text-xs text-gray-400 mt-1">Nombre de chunks de documents à inclure dans le contexte RAG.</p>
            </div>
          </div>
        </section>
        
        <!-- System Prompt -->
        <section class="bg-gray-50 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-medium text-gray-600">
              System Prompt
            </label>
            <button id="reset-prompt" class="text-xs text-purple-600 hover:text-purple-700 font-medium">
              Réinitialiser
            </button>
          </div>
          <textarea id="system-prompt-input" rows="8"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Entrez le prompt système...">${state.settings.systemPrompt}</textarea>
          <p class="text-xs text-gray-400 mt-1">Instructions données au modèle pour définir son comportement.</p>
        </section>
        
        <!-- Voice Settings -->
        <section class="bg-gray-50 rounded-lg p-4">
          <h3 class="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
            Paramètres Vocaux
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">
                Moteur TTS (Text-to-Speech)
              </label>
              <select id="tts-engine-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="web-speech" ${state.settings.ttsEngine === 'web-speech' || (!state.settings.ttsEngine && !state.settings.ttsModel) ? 'selected' : ''}>🔊 Web Speech API - Voix système (gratuit, immédiat)</option>
                <option value="xtts" ${state.settings.ttsEngine === 'xtts' ? 'selected' : ''}>🎤 XTTS-v2 - Votre voix (Lucas) - Serveur requis</option>
                <optgroup label="🎯 MAX - Qualité maximale">
                  ${Object.values(getModelsByCategory('max')).map(model => {
                    const available = isModelAvailable(model.id);
                    const status = getModelStatus(model.id);
                    const disabled = !available && status !== null ? 'disabled' : '';
                    const badge = !available && status !== null ? ' ❌ Non disponible' : '';
                    return `<option value="${model.id}" ${(state.settings.ttsEngine === 'open-source' && state.settings.ttsModel === model.id) ? 'selected' : ''} ${disabled}>
                      ${model.name} (${model.size}GB) - Qualité: ${model.quality}/10${badge}
                    </option>`;
                  }).join('')}
                </optgroup>
                <optgroup label="⚖️ MEDIUM - Compromis">
                  ${Object.values(getModelsByCategory('medium')).map(model => {
                    const available = isModelAvailable(model.id);
                    const status = getModelStatus(model.id);
                    const disabled = !available && status !== null ? 'disabled' : '';
                    const badge = !available && status !== null ? ' ❌ Non disponible' : '';
                    return `<option value="${model.id}" ${(state.settings.ttsEngine === 'open-source' && state.settings.ttsModel === model.id) ? 'selected' : ''} ${disabled}>
                      ${model.name} (${model.size}GB) - Score: ${((model.quality + model.performance + model.resources) / 3).toFixed(1)}/10${badge}
                    </option>`;
                  }).join('')}
                </optgroup>
                <optgroup label="⚡ RAPIDE - Léger et rapide">
                  ${Object.values(getModelsByCategory('rapide')).map(model => {
                    const available = isModelAvailable(model.id);
                    const status = getModelStatus(model.id);
                    const disabled = !available && status !== null ? 'disabled' : '';
                    const badge = !available && status !== null ? ' ❌ Non disponible' : '';
                    return `<option value="${model.id}" ${(state.settings.ttsEngine === 'open-source' && state.settings.ttsModel === model.id) ? 'selected' : ''} ${disabled}>
                      ${model.name} (${model.size}GB) - Performance: ${model.performance}/10${badge}
                    </option>`;
                  }).join('')}
                </optgroup>
              </select>
              <p class="text-xs text-gray-400 mt-1">
                <span id="tts-engine-status" class="text-indigo-600"></span>
              </p>
              
              <!-- Indicateur de validation en cours -->
              <div id="tts-validation-indicator" class="hidden mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Validation des modèles TTS en cours...</span>
                </div>
              </div>
              
              <!-- Détails du modèle sélectionné -->
              <div id="tts-model-details" class="mt-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 hidden">
                <div class="text-xs">
                  <p class="font-semibold text-indigo-900 mb-2" id="tts-model-name"></p>
                  <!-- Message d'erreur si modèle non disponible -->
                  <div id="tts-model-error" class="hidden mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
                    <p class="font-medium mb-1">❌ Modèle non disponible</p>
                    <p id="tts-model-error-text" class="text-xs"></p>
                  </div>
                  <div class="grid grid-cols-3 gap-2 text-gray-600">
                    <div>
                      <span class="font-medium">Qualité:</span>
                      <span id="tts-model-quality" class="ml-1"></span>
                    </div>
                    <div>
                      <span class="font-medium">Performance:</span>
                      <span id="tts-model-performance" class="ml-1"></span>
                    </div>
                    <div>
                      <span class="font-medium">Ressources:</span>
                      <span id="tts-model-resources" class="ml-1"></span>
                    </div>
                  </div>
                  <p class="mt-2 text-gray-500" id="tts-model-description"></p>
                  <div class="mt-2 pt-2 border-t border-indigo-200">
                    <p class="text-xs text-gray-600"><strong>Latence:</strong> <span id="tts-model-latency"></span></p>
                    <p class="text-xs text-gray-600"><strong>Vitesse:</strong> <span id="tts-model-speed"></span></p>
                    <p class="text-xs text-gray-600"><strong>RAM:</strong> <span id="tts-model-ram"></span></p>
                  </div>
                </div>
              </div>
              
              <!-- Sélecteur de voix pour le modèle -->
              <div id="tts-voice-selector" class="mt-2 hidden">
                <label class="block text-xs font-medium text-gray-600 mb-2">
                  Voix disponible
                </label>
                <select id="tts-voice-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </select>
              </div>
              
              <!-- Message d'information général -->
              <div class="mt-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                <div class="flex items-start gap-2">
                  <svg class="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <div class="text-xs text-gray-700">
                    <p class="font-semibold text-indigo-900 mb-1">💡 Pourquoi choisir une voix ?</p>
                    <ul class="space-y-1 text-gray-600 ml-1">
                      <li><strong>🎤 XTTS-v2 (Votre voix)</strong> : Utilise votre propre voix enregistrée pour un rendu personnalisé et naturel. Nécessite le serveur XTTS lancé.</li>
                      <li><strong>🔊 Web Speech API</strong> : Utilise les voix système de votre navigateur (gratuit, immédiat, mais moins personnalisé).</li>
                    </ul>
                    <p class="mt-2 text-gray-500 italic">💬 Le système bascule automatiquement vers Web Speech API si XTTS n'est pas disponible.</p>
                  </div>
                </div>
              </div>
              
              <div id="xtts-info" class="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-800 hidden">
                <p class="font-semibold mb-2 flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  📋 Comment utiliser votre voix (Lucas) :
                </p>
                <ol class="list-decimal list-inside space-y-1.5 ml-1">
                  <li>Ouvrez un terminal et lancez : <code class="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">npm run tts:server</code></li>
                  <li>Attendez que le serveur démarre (vous verrez "Serveur TTS prêt!")</li>
                  <li>Le fichier <code class="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">Voix-Lucas.m4a</code> sera automatiquement converti en <code class="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">voice_ref.wav</code></li>
                  <li>Votre voix sera utilisée pour toutes les réponses du mode Hands-Free</li>
                </ol>
                <p class="mt-2 pt-2 border-t border-blue-200 text-blue-700">
                  <strong>⚠️ Note :</strong> Si le serveur n'est pas lancé, le système utilisera automatiquement la voix système de votre navigateur.
                </p>
              </div>
            </div>
            
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">
                Langue STT (Speech-to-Text)
              </label>
              <select id="stt-lang" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="fr-FR" ${state.settings.sttLang === 'fr-FR' ? 'selected' : ''}>Français (fr-FR)</option>
                <option value="en-US" ${state.settings.sttLang === 'en-US' ? 'selected' : ''}>Anglais (en-US)</option>
              </select>
            </div>
            
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">
                Vitesse TTS: <span id="tts-rate-value" class="text-indigo-600 font-bold">${state.settings.ttsRate || 1.0}</span>x
              </label>
              <input type="range" id="tts-rate-slider" min="0.5" max="2" step="0.1" value="${state.settings.ttsRate || 1.0}"
                     class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>Lent (0.5x)</span>
                <span>Normal (1.0x)</span>
                <span>Rapide (2.0x)</span>
              </div>
            </div>
            
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">
                Délai Silence (ms) - Mode Conversation
              </label>
              <input type="number" id="silence-delay" min="500" max="5000" step="100" value="${state.settings.silenceDelay || 2000}"
                     class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <p class="text-xs text-gray-400 mt-1">Temps d'attente après la fin de la parole avant envoi automatique.</p>
            </div>
          </div>
        </section>
        
        <!-- Advanced -->
        <section class="bg-gray-50 rounded-lg p-4">
          <h3 class="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
            </svg>
            Avancé
          </h3>
          <div class="space-y-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="debug-mode" ${state.settings.debugMode ? 'checked' : ''}
                     class="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded">
              <span class="text-xs text-gray-700">Mode Debug (logs détaillés)</span>
            </label>
          </div>
        </section>
      </div>
      
      <!-- Footer Actions -->
      <div class="flex-shrink-0 flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
        <button id="save-settings" 
                class="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-sm">
          Enregistrer
        </button>
        <button id="cancel-settings" 
                class="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
          Annuler
        </button>
      </div>
    </div>
  `;
  
  setupSettingsEvents(settingsPanel);
  
  return settingsPanel;
}

/**
 * Configure les événements du panel
 */
function setupSettingsEvents(panel) {
  // Close buttons
  const closeBtn = panel.querySelector('#close-settings');
  const cancelBtn = panel.querySelector('#cancel-settings');
  
  const closePanel = () => {
    panel.classList.add('hidden');
    // Réinitialiser les styles inline pour permettre la fermeture
    panel.style.display = '';
    panel.style.zIndex = '';
  };
  
  closeBtn?.addEventListener('click', closePanel);
  cancelBtn?.addEventListener('click', closePanel);
  
  // Click outside to close
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      closePanel();
    }
  });
  
  // TTS Engine selector
  const ttsEngineSelect = panel.querySelector('#tts-engine-select');
  const ttsEngineStatus = panel.querySelector('#tts-engine-status');
  const xttsInfo = panel.querySelector('#xtts-info');
  
  // Déclarer les éléments DOM pour les détails du modèle et le sélecteur de voix
  const ttsModelDetails = panel.querySelector('#tts-model-details');
  const ttsVoiceSelector = panel.querySelector('#tts-voice-selector');
  const ttsVoiceSelect = panel.querySelector('#tts-voice-select');
  
  // Fonction pour mettre à jour les détails du modèle TTS
  function updateModelDetails(modelId) {
    if (!modelId || modelId === 'web-speech' || modelId === 'xtts') {
      if (ttsModelDetails) ttsModelDetails.classList.add('hidden');
      if (ttsVoiceSelector) ttsVoiceSelector.classList.add('hidden');
      return;
    }
    
    const model = TTS_MODELS[modelId];
    if (!model) {
      if (ttsModelDetails) ttsModelDetails.classList.add('hidden');
      if (ttsVoiceSelector) ttsVoiceSelector.classList.add('hidden');
      return;
    }
    
    // Vérifier la disponibilité
    const available = isModelAvailable(modelId);
    const status = getModelStatus(modelId);
    
    // Afficher les détails du modèle
    if (ttsModelDetails) {
      const nameEl = ttsModelDetails.querySelector('#tts-model-name');
      const qualityEl = ttsModelDetails.querySelector('#tts-model-quality');
      const performanceEl = ttsModelDetails.querySelector('#tts-model-performance');
      const resourcesEl = ttsModelDetails.querySelector('#tts-model-resources');
      const descriptionEl = ttsModelDetails.querySelector('#tts-model-description');
      const latencyEl = ttsModelDetails.querySelector('#tts-model-latency');
      const speedEl = ttsModelDetails.querySelector('#tts-model-speed');
      const ramEl = ttsModelDetails.querySelector('#tts-model-ram');
      const errorEl = ttsModelDetails.querySelector('#tts-model-error');
      const errorTextEl = ttsModelDetails.querySelector('#tts-model-error-text');
      
      if (nameEl) nameEl.textContent = model.name;
      if (qualityEl) qualityEl.textContent = `${model.quality}/10`;
      if (performanceEl) performanceEl.textContent = `${model.performance}/10`;
      if (resourcesEl) resourcesEl.textContent = `${model.resources}/10`;
      if (descriptionEl) descriptionEl.textContent = model.description || 'Modèle TTS open source';
      if (latencyEl) latencyEl.textContent = model.latency || 'N/A';
      if (speedEl) speedEl.textContent = model.speed || 'N/A';
      if (ramEl) ramEl.textContent = model.ram || 'N/A';
      
      // Afficher/masquer le message d'erreur
      if (errorEl && errorTextEl) {
        if (!available && status && status.error) {
          errorTextEl.textContent = status.error;
          errorEl.classList.remove('hidden');
        } else {
          errorEl.classList.add('hidden');
        }
      }
      
      ttsModelDetails.classList.remove('hidden');
    }
    
    // Afficher le sélecteur de voix si le modèle a des voix disponibles
    if (ttsVoiceSelector && model.voices && Object.keys(model.voices).length > 0) {
      if (ttsVoiceSelect) {
        ttsVoiceSelect.innerHTML = Object.keys(model.voices).map(voiceId => {
          const voice = model.voices[voiceId];
          const selected = state.settings.ttsVoice === voiceId ? 'selected' : '';
          return `<option value="${voiceId}" ${selected}>${voice.name}</option>`;
        }).join('');
      }
      ttsVoiceSelector.classList.remove('hidden');
    } else {
      if (ttsVoiceSelector) ttsVoiceSelector.classList.add('hidden');
    }
  }
  
  // Indicateur de validation
  const validationIndicator = panel.querySelector('#tts-validation-indicator');
  
  // Écouter les mises à jour de validation des modèles
  window.addEventListener('tts:modelValidated', (e) => {
    const { modelId, status, error } = e.detail;
    // Mettre à jour l'affichage si le modèle sélectionné vient d'être validé
    const selectedValue = ttsEngineSelect?.value;
    if (selectedValue === modelId) {
      checkXTTSStatus();
    }
    // Mettre à jour le sélecteur pour refléter le nouveau statut
    updateModelSelectOptions();
  });
  
  // Afficher l'indicateur quand la validation commence
  window.addEventListener('tts:validationStarted', () => {
    if (validationIndicator) {
      validationIndicator.classList.remove('hidden');
    }
  });
  
  // Masquer l'indicateur quand la validation est terminée
  window.addEventListener('tts:validationComplete', () => {
    if (validationIndicator) {
      validationIndicator.classList.add('hidden');
    }
  });
  
  // Mettre à jour les options du sélecteur avec les statuts de validation
  function updateModelSelectOptions() {
    if (!ttsEngineSelect) return;
    
    const selectedValue = ttsEngineSelect.value;
    const options = ttsEngineSelect.querySelectorAll('option');
    
    options.forEach(option => {
      const modelId = option.value;
      if (TTS_MODELS[modelId]) {
        const available = isModelAvailable(modelId);
        const status = getModelStatus(modelId);
        
        if (!available && status !== null) {
          option.disabled = true;
          if (!option.textContent.includes('❌')) {
            option.textContent = option.textContent.replace(' - ', ' ❌ Non disponible - ');
          }
        } else if (status && status.status === 'validating') {
          option.textContent = option.textContent.replace(' ❌ Non disponible', '') + ' ⏳ Validation...';
        } else if (available) {
          option.disabled = false;
          option.textContent = option.textContent.replace(' ❌ Non disponible', '').replace(' ⏳ Validation...', '');
        }
      }
    });
    
    // Restaurer la sélection
    ttsEngineSelect.value = selectedValue;
  }
  
  // Vérifier l'état XTTS au chargement
  async function checkXTTSStatus() {
    const selectedValue = ttsEngineSelect?.value;
    
    if (selectedValue === 'xtts') {
      try {
        const response = await fetch('http://localhost:5055/health');
        const data = await response.json();
        if (data.status === 'ok' && data.model_loaded) {
          ttsEngineStatus.textContent = '✅ Serveur XTTS disponible - Votre voix (Lucas) sera utilisée';
          ttsEngineStatus.className = 'text-indigo-600';
          if (xttsInfo) xttsInfo.classList.add('hidden');
        } else {
          ttsEngineStatus.textContent = '⚠️ Serveur XTTS non disponible - Lancez: npm run tts:server';
          ttsEngineStatus.className = 'text-orange-600';
          if (xttsInfo) xttsInfo.classList.remove('hidden');
        }
      } catch (e) {
        ttsEngineStatus.textContent = '⚠️ Serveur XTTS non disponible - Lancez: npm run tts:server';
        ttsEngineStatus.className = 'text-orange-600';
        if (xttsInfo) xttsInfo.classList.remove('hidden');
      }
      if (ttsModelDetails) ttsModelDetails.classList.add('hidden');
      if (ttsVoiceSelector) ttsVoiceSelector.classList.add('hidden');
    } else if (selectedValue === 'web-speech') {
      ttsEngineStatus.textContent = '✅ Voix système du navigateur (Web Speech API)';
      ttsEngineStatus.className = 'text-indigo-600';
      if (xttsInfo) xttsInfo.classList.add('hidden');
      if (ttsModelDetails) ttsModelDetails.classList.add('hidden');
      if (ttsVoiceSelector) ttsVoiceSelector.classList.add('hidden');
    } else if (TTS_MODELS[selectedValue]) {
      // Modèle TTS open source
      const model = TTS_MODELS[selectedValue];
      const available = isModelAvailable(selectedValue);
      const status = getModelStatus(selectedValue);
      
      if (available) {
        ttsEngineStatus.textContent = `✅ Modèle ${model.name} - WebGPU activé (${model.size}GB)`;
        ttsEngineStatus.className = 'text-indigo-600';
      } else if (status && status.status === 'unavailable') {
        ttsEngineStatus.textContent = `❌ Modèle ${model.name} non disponible: ${status.error || 'Non supporté'}`;
        ttsEngineStatus.className = 'text-red-600';
      } else {
        ttsEngineStatus.textContent = `⏳ Modèle ${model.name} - Validation en cours...`;
        ttsEngineStatus.className = 'text-orange-600';
      }
      
      if (xttsInfo) xttsInfo.classList.add('hidden');
      updateModelDetails(selectedValue);
    } else {
      ttsEngineStatus.textContent = '✅ Voix système du navigateur (Web Speech API)';
      ttsEngineStatus.className = 'text-indigo-600';
      if (xttsInfo) xttsInfo.classList.add('hidden');
      if (ttsModelDetails) ttsModelDetails.classList.add('hidden');
      if (ttsVoiceSelector) ttsVoiceSelector.classList.add('hidden');
    }
  }
  
  // Vérifier au chargement
  checkXTTSStatus();
  
  // Vérifier quand on change le sélecteur
  ttsEngineSelect?.addEventListener('change', () => {
    const selectedValue = ttsEngineSelect.value;
    updateModelDetails(selectedValue);
    checkXTTSStatus();
  });
  
  // Mettre à jour les détails au chargement initial
  if (state.settings.ttsModel) {
    updateModelDetails(state.settings.ttsModel);
  } else if (state.settings.ttsEngine && TTS_MODELS[state.settings.ttsEngine]) {
    updateModelDetails(state.settings.ttsEngine);
  }
  
  // Save button
  const saveBtn = panel.querySelector('#save-settings');
  saveBtn?.addEventListener('click', () => {
    // Récupérer les valeurs
    state.settings.temperature = parseFloat(panel.querySelector('#temp-slider').value);
    state.settings.topN = parseInt(panel.querySelector('#topn-input').value);
    state.settings.systemPrompt = panel.querySelector('#system-prompt-input').value.trim();
    state.settings.sttLang = panel.querySelector('#stt-lang').value;
    const ttsEngineValue = panel.querySelector('#tts-engine-select').value;
    
    // Détecter si c'est un modèle TTS open source ou un moteur classique
    if (TTS_MODELS[ttsEngineValue]) {
      // C'est un modèle open source
      state.settings.ttsEngine = 'open-source';
      state.settings.ttsModel = ttsEngineValue;
      state.settings.ttsVoice = panel.querySelector('#tts-voice-select')?.value || null;
      console.log('[Settings] Modèle open source sélectionné:', ttsEngineValue, 'Voix:', state.settings.ttsVoice);
    } else {
      // C'est un moteur classique (web-speech ou xtts)
      state.settings.ttsEngine = ttsEngineValue;
      state.settings.ttsModel = null;
      state.settings.ttsVoice = null;
      console.log('[Settings] Moteur classique sélectionné:', ttsEngineValue);
    }
    
    state.settings.ttsRate = parseFloat(panel.querySelector('#tts-rate-slider').value);
    state.settings.silenceDelay = parseInt(panel.querySelector('#silence-delay').value);
    state.settings.debugMode = panel.querySelector('#debug-mode').checked;
    
    // Sauvegarder dans localStorage
    localStorage.setItem('appSettings', JSON.stringify(state.settings));
    
    addLog('success', 'Paramètres enregistrés');
    
    // Dispatcher un événement pour que les autres composants se mettent à jour
    window.dispatchEvent(new CustomEvent('settings:updated', { detail: state.settings }));
    
    // Le TTS sera rechargé automatiquement via l'événement settings:updated
    
    closePanel();
  });
  
  // Reset prompt button
  const resetBtn = panel.querySelector('#reset-prompt');
  resetBtn?.addEventListener('click', () => {
    const defaultPrompt = `Tu es un assistant de recherche académique francophone. Tu analyses des documents scientifiques et rédiges des synthèses claires.

Ton style :
- Écris de façon naturelle et fluide, comme un chercheur qui explique à un collègue
- Utilise le français académique mais accessible
- Cite tes sources avec [Doc1:Chunk2] après chaque affirmation importante
- Structure tes réponses avec des titres ## et ### quand c'est pertinent
- Utilise des tableaux Markdown pour comparer des éléments (minimum 3 colonnes avec |)
- Mets en **gras** les concepts clés

Pour les synthèses multi-documents :
- Couvre TOUS les documents fournis, aucune exception
- Identifie les points communs et les divergences
- Propose un tableau comparatif quand tu analyses plusieurs sources
- Termine par une conclusion qui fait le lien entre les documents

Reste factuel : si une info n'est pas dans le contexte, dis-le clairement.`;
    
    panel.querySelector('#system-prompt-input').value = defaultPrompt;
  });
  
  // Sliders en temps réel
  const tempSlider = panel.querySelector('#temp-slider');
  const tempValue = panel.querySelector('#temp-value');
  tempSlider?.addEventListener('input', (e) => {
    tempValue.textContent = e.target.value;
  });
  
  const ttsRateSlider = panel.querySelector('#tts-rate-slider');
  const ttsRateValue = panel.querySelector('#tts-rate-value');
  ttsRateSlider?.addEventListener('input', (e) => {
    ttsRateValue.textContent = e.target.value;
  });
}

/**
 * Affiche le panel de paramètres
 */
export function showSettingsPanel() {
  console.log('[Settings] showSettingsPanel appelé');
  
  if (!settingsPanel) {
    console.log('[Settings] Création du panel...');
    settingsPanel = createSettingsPanel();
    // S'assurer que le panel est ajouté au body
    if (!document.body.contains(settingsPanel)) {
      document.body.appendChild(settingsPanel);
      console.log('[Settings] Panel ajouté au DOM');
    }
  }
  
  // Forcer l'affichage
  settingsPanel.classList.remove('hidden');
  settingsPanel.style.display = 'flex'; // S'assurer que display n'est pas none
  settingsPanel.style.zIndex = '9999'; // S'assurer que le z-index est élevé
  
  console.log('[Settings] Panel ouvert, classes:', settingsPanel.className, 'display:', settingsPanel.style.display);
}

/**
 * Cache le panel de paramètres
 */
export function hideSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.classList.add('hidden');
  }
}



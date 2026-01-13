/**
 * Panel de Parametres Systeme - Version simplifiee
 * Temperature, System Prompt, Top N, parametres STT
 */

import { state, addLog } from '../state/state.js';

let settingsPanel = null;

/**
 * Cree le panel de parametres
 */
export function createSettingsPanel() {
  if (settingsPanel) {
    return settingsPanel;
  }

  settingsPanel = document.createElement('div');
  settingsPanel.id = 'settings-panel';
  settingsPanel.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm';
  
  // Charger les parametres sauvegardes
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
    <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden m-4 flex flex-col">
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
            <h2 class="text-lg font-bold text-gray-900">Parametres Systeme</h2>
            <p class="text-xs text-gray-500">Configuration LLM et RAG</p>
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
            Parametres LLM
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
                <span>Equilibre (1)</span>
                <span>Creatif (2)</span>
              </div>
              <p class="text-xs text-gray-400 mt-1">Controle la creativite des reponses. Plus eleve = plus varie.</p>
            </div>
            
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">
                Top N Chunks (RAG)
              </label>
              <input type="number" id="topn-input" min="1" max="20" step="1"
                     value="${state.settings.topN}"
                     class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              <p class="text-xs text-gray-400 mt-1">Nombre de chunks de documents a inclure dans le contexte RAG.</p>
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
              Reinitialiser
            </button>
          </div>
          <textarea id="system-prompt-input" rows="8"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Entrez le prompt systeme...">${state.settings.systemPrompt}</textarea>
          <p class="text-xs text-gray-400 mt-1">Instructions donnees au modele pour definir son comportement.</p>
        </section>
        
        <!-- Voice Settings -->
        <section class="bg-gray-50 rounded-lg p-4">
          <h3 class="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
            Parametres Vocaux
          </h3>
          <div class="space-y-4">
            <div class="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div class="flex items-start gap-2">
                <svg class="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="text-xs text-gray-700">
                  <p class="font-semibold text-blue-900 mb-1">Mode Hands-Free simplifie</p>
                  <ul class="space-y-1 text-gray-600 ml-1">
                    <li><strong>STT:</strong> Whisper (whisper-base, 74MB) - Transcription locale</li>
                    <li><strong>TTS:</strong> Web Speech API - Voix systeme du navigateur</li>
                  </ul>
                </div>
              </div>
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
                Delai Silence (ms) - Mode Conversation
              </label>
              <input type="number" id="silence-delay" min="500" max="5000" step="100" value="${state.settings.silenceDelay || 2000}"
                     class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <p class="text-xs text-gray-400 mt-1">Temps d'attente apres la fin de la parole avant envoi automatique.</p>
            </div>
          </div>
        </section>
        
        <!-- Advanced -->
        <section class="bg-gray-50 rounded-lg p-4">
          <h3 class="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
            </svg>
            Avance
          </h3>
          <div class="space-y-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="debug-mode" ${state.settings.debugMode ? 'checked' : ''}
                     class="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded">
              <span class="text-xs text-gray-700">Mode Debug (logs detailles)</span>
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
 * Configure les evenements du panel
 */
function setupSettingsEvents(panel) {
  // Close buttons
  const closeBtn = panel.querySelector('#close-settings');
  const cancelBtn = panel.querySelector('#cancel-settings');
  
  const closePanel = () => {
    panel.classList.add('hidden');
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
  
  // Save button
  const saveBtn = panel.querySelector('#save-settings');
  saveBtn?.addEventListener('click', () => {
    // Recuperer les valeurs
    state.settings.temperature = parseFloat(panel.querySelector('#temp-slider').value);
    state.settings.topN = parseInt(panel.querySelector('#topn-input').value);
    state.settings.systemPrompt = panel.querySelector('#system-prompt-input').value.trim();
    state.settings.ttsRate = parseFloat(panel.querySelector('#tts-rate-slider').value);
    state.settings.silenceDelay = parseInt(panel.querySelector('#silence-delay').value);
    state.settings.debugMode = panel.querySelector('#debug-mode').checked;
    
    // Sauvegarder dans localStorage
    localStorage.setItem('appSettings', JSON.stringify(state.settings));
    
    addLog('success', 'Parametres enregistres');
    
    // Dispatcher un evenement pour que les autres composants se mettent a jour
    window.dispatchEvent(new CustomEvent('settings:updated', { detail: state.settings }));
    
    closePanel();
  });
  
  // Reset prompt button
  const resetBtn = panel.querySelector('#reset-prompt');
  resetBtn?.addEventListener('click', () => {
    const defaultPrompt = `Tu es un assistant de recherche academique francophone. Tu analyses des documents scientifiques et rediges des syntheses claires.

Ton style :
- Ecris de facon naturelle et fluide, comme un chercheur qui explique a un collegue
- Utilise le francais academique mais accessible
- Cite tes sources avec [Doc1] apres chaque affirmation importante
- Structure tes reponses avec des titres ## et ### quand c'est pertinent
- Mets en **gras** les concepts cles

Pour les syntheses multi-documents :
- Couvre TOUS les documents fournis, aucune exception
- Identifie les points communs et les divergences
- Termine par une conclusion qui fait le lien entre les documents

Reste factuel : si une info n'est pas dans le contexte, dis-le clairement.`;
    
    panel.querySelector('#system-prompt-input').value = defaultPrompt;
  });
  
  // Sliders en temps reel
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
 * Affiche le panel de parametres
 */
export function showSettingsPanel() {
  if (!settingsPanel) {
    settingsPanel = createSettingsPanel();
    if (!document.body.contains(settingsPanel)) {
      document.body.appendChild(settingsPanel);
    }
  }
  
  settingsPanel.classList.remove('hidden');
  settingsPanel.style.display = 'flex';
  settingsPanel.style.zIndex = '9999';
}

/**
 * Cache le panel de parametres
 */
export function hideSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.classList.add('hidden');
  }
}

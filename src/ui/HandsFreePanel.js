/**
 * Panel Hands-Free - Mode vocal complet STT + TTS
 */

import { isSTTSupported, createSpeechRecognition, createSpeechDetector } from '../voice/speechRecognition.js';
import { isTTSSupported, createTTSManager, getVoices, getBestVoicesForLang, SUPPORTED_LANGUAGES } from '../voice/speechSynthesis.js';
import { getKokoroVoices, initKokoroTTS, isKokoroReady } from '../voice/kokoroTTS.js';
import { createXTTSClient } from '../audio/ttsProviders.js';
import { getChatHistoryRef, sendMessage, addMessage } from '../llm/chat.js';
import { isModelReady, initWebLLM, getLoadedModel, getOralOptimizedModels } from '../llm/webllm.js';
import { parseMarkdown } from '../utils/markdown.js';
import { showChunkViewer } from './ChunkViewer.js';
import { showSettingsPanel } from './SettingsPanel.js';
import { speak as speakOpenSource, initTTSModel, isModelReady as isTTSModelReady } from '../voice/ttsEngine.js';
import { getModelById, TTS_MODELS } from '../voice/ttsModels.js';
import { state } from '../state/state.js';
import { validateAllModels, isModelAvailable, getModelStatus } from '../voice/ttsModelValidator.js';

// États possibles
const STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking'
};

let currentState = STATES.IDLE;
let handsFreeEnabled = false;
let conversationMode = false; // Mode conversation automatique
let recognition = null;
let ttsManager = null;
let xttsClient = null; // Client XTTS-v2
let speechDetector = null;
let currentTranscript = '';
let silenceTimeout = null;
const SILENCE_DELAY = 3000; // 3s de silence avant envoi auto
let useKokoroTTS = false; // Utiliser Kokoro TTS ou voix native
// Charger le moteur TTS depuis les settings
let useXTTS = (() => {
  const savedSettings = localStorage.getItem('appSettings');
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      return parsed.ttsEngine === 'xtts';
    } catch (e) {
      return false; // Par défaut Web Speech API
    }
  }
  return false; // Par défaut Web Speech API (plus fiable)
})();
let interruptCountdownInterval = null; // Interval pour le compte à rebours d'interruption
let spaceKeyListener = null; // Listener pour raccourci ESPACE
let spaceKeyDebounceTimeout = null; // Debounce pour ESPACE
let modelsValidated = false; // Flag pour savoir si les modèles ont été validés

// System prompt optimisé pour réponses orales avec citations et diversité - TAILLE FLEXIBLE
const ORAL_SYSTEM_PROMPT = `Tu es un assistant vocal conversationnel. Réponds en français, de manière ORALE et NATURELLE.

RÈGLE ABSOLUE : TOUJOURS RÉPONDRE EN PHRASES ORALES, JAMAIS DE TABLEAUX MARKDOWN, JAMAIS DE LISTES À PUCES BRUTES

ADAPTATION INTELLIGENTE DE LA LONGUEUR :
- Plus il y a de contexte/d'informations, plus la réponse sera longue (mais toujours optimisée)
- Questions simples → 2-3 phrases courtes (30-60 mots)
- Questions complexes → 5-8 phrases (100-200 mots)
- Beaucoup de contexte → 10-15 phrases (200-400 mots)
- TOUJOURS complète et optimisée, jamais tronquée

STYLE ORAL OPTIMISÉ :
- Phrases complètes avec liaisons naturelles ("c'est-à-dire", "autrement dit", "en effet")
- Ponctuation orale : virgules pour pauses, points pour conclusions
- Transitions fluides : "d'abord", "ensuite", "enfin", "par ailleurs"
- Expressions naturelles : "ah je vois", "effectivement", "d'accord", "c'est intéressant"
- Éviter les listes numérotées brutes : transformer en phrases liées
- Éviter les tableaux : présenter les informations en phrases structurées

EXEMPLE BON (oral, naturel) :
"Ah je vois, Wavestone se présente comme une entreprise centrée sur l'humain [Doc1:Chunk5]. Ils sont engagés dans la responsabilité sociale et environnementale, ce qui se traduit par plusieurs initiatives concrètes [Doc1:Chunk6]. Par ailleurs, leur approche de la transformation digitale s'appuie sur l'accompagnement personnalisé des clients [Doc1:Chunk7]."

EXEMPLE MAUVAIS (à éviter) :
"Voici un tableau :
| Point | Description |
|-------|-------------|
| Vision | Centrée sur l'humain |"

TRANSFORMER EN :
"Leur vision est centrée sur l'humain, avec un engagement fort en responsabilité sociale et environnementale. Ils accompagnent la transformation digitale de manière personnalisée."

CITATIONS ET DIVERSITÉ :
- Cite les sources [Doc1:Chunk2] naturellement dans le flux de la phrase
- Privilégie la diversité : cherche dans plusieurs documents
- Si plusieurs documents : mentionne-les oralement

IMPORTANT :
- Ne JAMAIS utiliser de format markdown (tableaux, listes à puces brutes)
- Toujours des phrases complètes et liées
- Optimiser pour le parlé : liaisons, ponctuation, fluidité
- Plus de contexte = réponse plus longue mais toujours complète et optimisée
- Toujours terminer la réponse, jamais de coupure au milieu`;

// Config par défaut
let voiceConfig = {
  lang: 'fr-FR',
  voiceName: null,
  rate: 1.0,
  pitch: 1.0,
  ttsEngine: 'native' // 'native' ou 'kokoro'
};

/**
 * Crée le panel Hands-Free
 */
export function createHandsFreePanel() {
  const panel = document.createElement('div');
  panel.id = 'handsfree-panel';
  panel.className = 'flex flex-col md:flex-row max-h-[85vh] bg-white rounded-xl border border-gray-200 overflow-hidden';

  const sttSupported = isSTTSupported();
  const ttsSupported = isTTSSupported();

  panel.innerHTML = `
    <!-- Colonne gauche : Micro et contrôles -->
    <div class="flex flex-col w-full md:w-80 border-r-0 md:border-r border-gray-200 border-b md:border-b-0 flex-shrink-0 max-h-[40vh] md:max-h-none overflow-y-auto">
      <!-- Header -->
      <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
              </svg>
            </div>
            <div>
              <h2 class="text-sm font-bold text-gray-900">Mode Hands-Free</h2>
              <p id="hf-status-text" class="text-xs text-gray-500">Inactif</p>
            </div>
          </div>
        </div>
        
        <!-- Mode Toggle (Web/Serveur) - GROSSE FEATURE -->
        <div class="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border-2 border-gray-200 shadow-md">
          <div class="flex items-center gap-3 flex-1">
            <div class="flex items-center gap-2.5">
              <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-sm"></div>
              <span class="text-sm font-bold text-gray-900">Web</span>
            </div>
            <label class="relative inline-flex items-center cursor-not-allowed flex-1 justify-center" title="Mode Serveur (à venir)">
              <input type="checkbox" id="hf-server-mode-toggle" class="sr-only peer" disabled>
              <div class="w-14 h-7 bg-gray-200 rounded-full peer peer-checked:bg-gray-400 transition-colors duration-300 ease-in-out opacity-50 relative shadow-inner">
                <div class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-lg transform transition-transform duration-300 ease-in-out peer-checked:translate-x-7 border border-gray-200"></div>
              </div>
            </label>
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-500">Serveur</span>
              <div class="group relative">
                <svg class="w-5 h-5 text-gray-400 cursor-help hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="absolute bottom-full right-0 mb-3 w-64 p-3 bg-gray-900 text-white text-sm rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="px-2 py-1 bg-yellow-500 text-yellow-900 text-xs font-bold rounded">BONUS</span>
                    <span class="font-bold">Mode Serveur</span>
                  </div>
                  <div class="text-gray-300 leading-relaxed text-xs">
                    TTS hébergé sur serveur pour une meilleure qualité vocale et des voix personnalisées. Fonctionnalité à venir.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Indicateur raccourci ESPACE (quand TTS parle) -->
      <div id="hf-space-hint" class="hidden px-4 py-2 bg-blue-50 border-b border-blue-200">
        <div class="flex items-center gap-2 text-xs text-blue-700">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m-4 4h18"/>
          </svg>
          <span>Appuyez sur <kbd class="px-1.5 py-0.5 bg-blue-100 rounded text-blue-800 font-mono text-xs">ESPACE</kbd> pour interrompre et parler</span>
        </div>
      </div>

      <!-- Indicateur TTS (quand l'assistant parle) -->
      <div id="hf-tts-indicator" class="hidden px-4 py-2 bg-blue-50 border-b border-blue-200">
        <div class="flex items-center gap-2">
          <div class="flex gap-1">
            <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
            <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
          </div>
          <span class="text-xs text-blue-700 font-medium">L'assistant parle...</span>
        </div>
      </div>

    ${!sttSupported ? `
      <!-- Incompatibility Warning -->
      <div class="p-4 bg-yellow-50 border-b border-yellow-200">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-yellow-800">Reconnaissance vocale non disponible</p>
            <p class="text-xs text-yellow-700 mt-1">Utilisez Chrome ou Edge pour profiter du mode Hands-Free complet.${ttsSupported ? ' La synthèse vocale reste disponible.' : ''}</p>
          </div>
        </div>
      </div>
    ` : ''}

      <!-- Main Toggle Button -->
      <div class="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-50 to-white">
        <!-- Message informatif sur les voix -->
        <div id="hf-voice-info" class="mb-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 hidden">
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div class="text-xs text-gray-700 flex-1">
              <p class="font-semibold text-blue-900 mb-1">💡 À propos des voix TTS</p>
              <p class="text-gray-600 mb-2">Le système utilise actuellement : <span id="hf-current-voice" class="font-medium text-indigo-700">Web Speech API (voix système)</span></p>
              <p class="text-gray-600 mb-2">Pour utiliser une voix personnalisée :</p>
              <ol class="list-decimal list-inside space-y-1 ml-2 text-gray-600">
                <li>Ouvrez les <strong>Paramètres</strong> (icône ⚙️ en haut à droite)</li>
                <li>Sélectionnez un modèle TTS open source (MAX, MEDIUM, ou RAPIDE)</li>
                <li>Choisissez une voix dans le sélecteur</li>
                <li>Les modèles open source fonctionnent directement dans le navigateur (pas de serveur requis)</li>
              </ol>
              <p class="text-gray-600 mt-2 text-xs italic">Note : Pour votre voix personnalisée (Lucas), sélectionnez "XTTS-v2" et lancez le serveur.</p>
              <button id="hf-open-settings" class="mt-2 text-xs text-blue-700 hover:text-blue-900 font-medium underline">
                Ouvrir les Paramètres →
              </button>
            </div>
            <button id="hf-close-voice-info" class="text-gray-400 hover:text-gray-600">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Indicateur de progression du chargement du modèle -->
        <div id="hf-model-loading" class="mb-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 hidden w-full max-w-sm">
          <div class="flex items-center gap-3">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
            <div class="flex-1">
              <p class="text-xs font-medium text-indigo-900" id="hf-model-loading-text">Chargement du modèle...</p>
              <div class="mt-1.5 w-full bg-indigo-200 rounded-full h-1.5">
                <div id="hf-model-loading-bar" class="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div>
              </div>
              <p class="text-xs text-indigo-600 mt-1" id="hf-model-loading-percent">0%</p>
            </div>
          </div>
        </div>
        
        <button id="hf-toggle-btn" class="relative w-32 h-32 rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-300 flex items-center justify-center group ${!sttSupported ? 'opacity-50 cursor-not-allowed' : ''}" ${!sttSupported ? 'disabled' : ''}>
          <div id="hf-pulse-ring" class="absolute inset-0 rounded-full opacity-0"></div>
          <svg id="hf-mic-icon" class="w-16 h-16 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
          </svg>
        </button>
        <div class="text-center mt-4">
          <p id="hf-state-label" class="text-sm font-medium text-gray-700">Appuyez pour démarrer</p>
          <p class="text-xs text-gray-400 mt-1">Espace pour activer/désactiver</p>
        </div>
        
        <!-- Mode Conversation Toggle -->
        <label class="flex items-center gap-3 px-4 py-2 mt-6 bg-purple-50 rounded-xl cursor-pointer hover:bg-purple-100 transition-colors ${!sttSupported ? 'opacity-50 pointer-events-none' : ''}">
          <input type="checkbox" id="hf-conversation-mode" class="w-4 h-4 text-purple-600 rounded focus:ring-purple-500" ${!sttSupported ? 'disabled' : ''}>
          <div>
            <span class="text-sm font-medium text-purple-900">Mode Conversation</span>
            <p class="text-xs text-purple-600">Envoi automatique après silence</p>
          </div>
        </label>
      </div>

      <!-- Zone de transcription (visible en live) -->
      <div class="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-white">
        <label class="block text-xs font-medium text-gray-700 mb-2">Transcription en direct</label>
        <div class="relative">
          <textarea 
            id="hf-transcript" 
            readonly 
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            rows="3"
            placeholder="Votre transcription apparaîtra ici en temps réel..."
          ></textarea>
          <div id="hf-interim" class="absolute bottom-2 right-2 text-xs text-gray-400 italic"></div>
        </div>
        <div class="flex items-center justify-between mt-2">
          <div id="hf-countdown" class="text-xs text-purple-600 font-medium hidden"></div>
          <button id="hf-cancel-btn" class="hidden px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Annuler
          </button>
        </div>
      </div>

      <!-- Status Indicator -->
      <div id="hf-status-indicator" class="flex-shrink-0 px-4 py-2 bg-gray-50 border-t border-gray-100">
        <div class="flex items-center justify-center gap-2">
          <span id="hf-status-dot" class="w-2 h-2 rounded-full bg-gray-300"></span>
          <span id="hf-status-label" class="text-xs text-gray-500">En attente</span>
        </div>
      </div>
    </div>

    <!-- Colonne droite : Historique des messages -->
    <div class="flex-1 flex flex-col min-w-0 min-h-0">
      <!-- Header avec indicateurs -->
      <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-white">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-gray-900">Conversation</h3>
          <div class="flex items-center gap-2">
            <!-- Generation Animation avec 3 points style ChatGPT -->
            <div id="hf-generating" class="hidden items-center gap-2">
              <div class="flex gap-1 items-center">
                <span class="w-1.5 h-1.5 rounded-full bg-purple-600 transition-all duration-300" style="opacity: 0.3"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-purple-600 transition-all duration-300" style="opacity: 0.3"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-purple-600 transition-all duration-300" style="opacity: 0.3"></span>
              </div>
              <span class="text-xs font-medium text-purple-800">Génération</span>
              <span id="hf-token-count" class="text-xs text-purple-600">0 tokens</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Interruption Countdown -->
      <div id="hf-interrupt-countdown" class="flex-shrink-0 px-4 py-2 bg-orange-50 border-b border-orange-100 hidden items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
          <span class="text-sm font-medium text-orange-800">Voix détectée - Interruption dans</span>
          <span id="hf-interrupt-timer" class="text-sm font-bold text-orange-900">1.0s</span>
        </div>
        <button id="hf-cancel-interrupt" class="px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 transition-colors">
          Annuler
        </button>
      </div>

      <!-- Error Messages -->
      <div id="hf-error" class="hidden flex-shrink-0 px-4 py-2 bg-red-50 border-b border-red-100">
        <p id="hf-error-text" class="text-xs text-red-600"></p>
      </div>

      <!-- Chat History -->
      <div id="hf-messages" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 min-h-0">
        <div class="text-center py-8 text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <p class="text-sm">Activez le mode Hands-Free pour commencer</p>
          <p class="text-xs mt-1">L'historique du chat est partagé</p>
        </div>
      </div>
    </div>
  `;

  setTimeout(async () => {
    setupHandsFreeEvents(panel);
    renderMessages();
    // Exposer showChunkViewer globalement pour les onclick
    window.showChunkViewer = showChunkViewer;
    
    // Écouter les messages ajoutés au chat pour synchroniser l'historique
    window.addEventListener('chat:messageAdded', (e) => {
      if (e.detail?.slot === 'primary') {
        renderMessages(); // Re-render quand un message est ajouté au chat
      }
    });
  }, 0);

  // Écouter les mises à jour du chat
  window.addEventListener('chat:messageAdded', () => {
    renderMessages();
  });

  // Écouter les changements de modèle
  // Écouter les changements de settings
  window.addEventListener('settings:updated', async (e) => {
    const newSettings = e.detail;
    console.log('[HandsFree] Settings updated:', newSettings);
    
    // Si le moteur TTS a changé, recharger
    const newUseXTTS = newSettings.ttsEngine === 'xtts';
    if (newUseXTTS !== useXTTS) {
      console.log('[HandsFree] TTS engine changed:', useXTTS, '→', newUseXTTS);
      useXTTS = newUseXTTS;
      
      // Réinitialiser le TTS
      ttsManager = null;
      xttsClient = null;
      
      // Réinitialiser si Hands-Free est actif
      if (handsFreeEnabled) {
        await initTTS();
      }
    }
    
    // Mettre à jour la vitesse TTS si disponible
    if (newSettings.ttsRate && ttsManager) {
      // Note: Web Speech API ne supporte pas directement la vitesse, mais on peut l'utiliser pour XTTS
      console.log('[HandsFree] TTS rate updated:', newSettings.ttsRate);
    }
  });
  
  window.addEventListener('webllm:ready', (e) => {
    if (e.detail?.slot === 'primary') {
      // Modèle chargé, prêt pour Hands-Free
      console.log('[HandsFree] Model ready for conversation');
    }
  });

  return panel;
}

/**
 * Charge automatiquement Llama 3.2 3B pour Hands-Free
 */
async function autoLoadBestOralModel() {
  // Si un modèle est déjà chargé dans primary, on l'utilise
  if (isModelReady('primary')) {
    console.log('[HandsFree] Model already loaded in primary slot');
    return;
  }

  // Forcer Llama 3.2 3B pour Hands-Free
  const llama3BModel = {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B'
  };
  
  console.log('[HandsFree] Auto-loading Llama 3.2 3B for Hands-Free');

  try {
    await initWebLLM(llama3BModel.id, (pct, text) => {
      console.log(`[HandsFree] Loading: ${pct}% - ${text}`);
    }, 'primary');
    
    console.log('[HandsFree] Llama 3.2 3B loaded successfully');
  } catch (error) {
    console.error('[HandsFree] Failed to auto-load Llama 3.2 3B:', error);
    // Fallback : essayer un autre modèle oral optimisé
    const oralModels = getOralOptimizedModels();
    if (oralModels.length > 0) {
      const fallbackModel = oralModels[0];
      console.log('[HandsFree] Fallback to:', fallbackModel.name);
      try {
        await initWebLLM(fallbackModel.id, (pct, text) => {
          console.log(`[HandsFree] Loading: ${pct}% - ${text}`);
        }, 'primary');
      } catch (fallbackError) {
        console.error('[HandsFree] Fallback also failed:', fallbackError);
      }
    }
  }
}

/**
 * Diagnostic automatique au démarrage
 */
async function runStartupDiagnostics() {
  const diagnostics = {
    ttsSupported: isTTSSupported(),
    sttSupported: isSTTSupported(),
    ttsWorking: false,
    micPermission: 'unknown',
    micWorking: false
  };
  
  console.log('[HandsFree] Running startup diagnostics...');
  
  // Vérifier TTS (sans test vocal - juste vérifier la disponibilité)
  if (diagnostics.ttsSupported && ttsManager) {
    // Vérifier que le TTS manager est bien initialisé
    diagnostics.ttsWorking = true;
    console.log('[Diagnostic] TTS manager initialized');
  } else if (diagnostics.ttsSupported && !ttsManager) {
    // TTS supporté mais pas encore initialisé
    console.warn('[Diagnostic] TTS supported but not initialized yet');
  }
  
  // Vérifier XTTS si disponible
  if (useXTTS && xttsClient) {
    try {
      const available = await xttsClient.isAvailable();
      if (available) {
        diagnostics.ttsWorking = true;
        console.log('[Diagnostic] XTTS available');
      }
    } catch (e) {
      console.warn('[Diagnostic] XTTS check failed:', e);
    }
  }
  
  // Vérifier permissions microphone
  if (navigator.permissions) {
    try {
      const result = await navigator.permissions.query({name: 'microphone'});
      diagnostics.micPermission = result.state;
      console.log('[Diagnostic] Microphone permission:', result.state);
    } catch (e) {
      console.warn('[Diagnostic] Cannot check mic permission:', e);
      // Essayer getUserMedia comme fallback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        diagnostics.micPermission = 'granted';
        diagnostics.micWorking = true;
        console.log('[Diagnostic] Microphone access confirmed via getUserMedia');
      } catch (mediaError) {
        if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
          diagnostics.micPermission = 'denied';
        } else if (mediaError.name === 'NotFoundError') {
          diagnostics.micPermission = 'not-found';
        }
        console.warn('[Diagnostic] Microphone access failed:', mediaError.name);
      }
    }
  } else {
    // Fallback: essayer getUserMedia directement
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      diagnostics.micPermission = 'granted';
      diagnostics.micWorking = true;
      console.log('[Diagnostic] Microphone access confirmed via getUserMedia (no permissions API)');
    } catch (e) {
      console.warn('[Diagnostic] Cannot test microphone:', e.name);
    }
  }
  
  // Afficher le rapport dans la console
  console.log('[HandsFree] Diagnostics result:', diagnostics);
  
  // Afficher un avertissement si problèmes critiques
  if (!diagnostics.ttsSupported) {
    console.warn('[HandsFree] TTS not supported - Hands-Free will be limited');
  }
  if (!diagnostics.sttSupported) {
    console.warn('[HandsFree] STT not supported - Hands-Free will not work');
  }
  if (diagnostics.micPermission === 'denied') {
    console.warn('[HandsFree] Microphone permission denied - STT will not work');
  }
  
  return diagnostics;
}

/**
 * Affiche l'indicateur de progression du chargement du modèle
 * @param {string} modelName - Nom du modèle en cours de chargement
 * @param {number} percentage - Pourcentage de progression (0-100)
 */
function showModelLoadingProgress(modelName, percentage) {
  const loadingEl = document.getElementById('hf-model-loading');
  const textEl = document.getElementById('hf-model-loading-text');
  const barEl = document.getElementById('hf-model-loading-bar');
  const percentEl = document.getElementById('hf-model-loading-percent');
  
  if (loadingEl) {
    loadingEl.classList.remove('hidden');
    if (textEl) textEl.textContent = `Chargement de ${modelName}...`;
    if (barEl) barEl.style.width = `${percentage}%`;
    if (percentEl) percentEl.textContent = `${percentage}%`;
  }
}

/**
 * Cache l'indicateur de progression du chargement du modèle
 */
function hideModelLoadingProgress() {
  const loadingEl = document.getElementById('hf-model-loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }
}

/**
 * Initialise le TTS
 */
async function initTTS() {
  if (!isTTSSupported()) {
    console.warn('[HandsFree] TTS not supported');
    return;
  }

  if (ttsManager) {
    console.log('[HandsFree] TTS already initialized');
    return;
  }

  // Utiliser les settings ou valeurs par défaut
  const settings = state.settings || {};
  const lang = settings.ttsLang || voiceConfig.lang || 'fr-FR';
  const voiceName = settings.ttsVoiceName || voiceConfig.voiceName || null; // null = voix système par défaut
  
  console.log('[HandsFree] Initializing TTS with voice:', voiceName || 'SYSTÈME (par défaut)');

  // TTS Manager simple
  ttsManager = createTTSManager({
    lang,
    rate: settings.ttsRate || voiceConfig.rate || 1.0,
    pitch: settings.ttsPitch || voiceConfig.pitch || 1.0,
    volume: settings.ttsVolume || 1.0,
    voiceName: voiceName, // null = première voix disponible pour la langue
    onStart: () => {
      console.log('[HandsFree] TTS started');
      setState(STATES.SPEAKING);
      
      // Afficher l'indicateur ESPACE
      const spaceHint = document.getElementById('hf-space-hint');
      if (spaceHint) {
        spaceHint.classList.remove('hidden');
      }
      
      // Afficher l'indicateur TTS
      const ttsIndicator = document.getElementById('hf-tts-indicator');
      if (ttsIndicator) {
        ttsIndicator.classList.remove('hidden');
      }
      
      // Arrêter reconnaissance pendant TTS
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {
          console.warn('[HandsFree] Error stopping recognition on TTS start:', e);
        }
      }
    },
    onEnd: () => {
      console.log('[HandsFree] TTS ended');
      
      // Cacher l'indicateur ESPACE
      const spaceHint = document.getElementById('hf-space-hint');
      if (spaceHint) {
        spaceHint.classList.add('hidden');
      }
      
      // Cacher l'indicateur TTS
      const ttsIndicator = document.getElementById('hf-tts-indicator');
      if (ttsIndicator) {
        ttsIndicator.classList.add('hidden');
      }
      
      // Réactiver l'écoute automatiquement après TTS
      if (handsFreeEnabled) {
        setTimeout(() => {
          if (handsFreeEnabled && !ttsManager.isSpeaking()) {
            startListening();
          }
        }, 300);
      } else {
        setState(STATES.IDLE);
      }
    },
    onError: (err) => {
      console.error('[HandsFree] TTS error:', err);
      
      // Cacher l'indicateur ESPACE
      const spaceHint = document.getElementById('hf-space-hint');
      if (spaceHint) {
        spaceHint.classList.add('hidden');
      }
      
      // Cacher l'indicateur TTS
      const ttsIndicator = document.getElementById('hf-tts-indicator');
      if (ttsIndicator) {
        ttsIndicator.classList.add('hidden');
      }
      
      if (err !== 'interrupted') {
        showError(`Erreur TTS: ${err}`, true);
      }
      
      // Réactiver l'écoute en cas d'erreur
      if (handsFreeEnabled) {
        setTimeout(() => {
          if (handsFreeEnabled) {
            startListening();
          }
        }, 300);
      }
    }
  });

  // Vérifier le moteur TTS sélectionné dans les settings
  const ttsEngine = state.settings.ttsEngine;
  const ttsModel = state.settings.ttsModel;
  const ttsVoice = state.settings.ttsVoice;

  // Initialiser XTTS client seulement si activé dans les settings
  if (ttsEngine === 'xtts') {
    useXTTS = true;
    xttsClient = createXTTSClient({ endpoint: "http://localhost:5055/tts" });
    console.log('[HandsFree] XTTS client créé (voix Lucas)');
    
    try {
      const available = await xttsClient.isAvailable();
      if (available) {
        console.log('[HandsFree] ✅ XTTS disponible - Votre voix (Lucas) sera utilisée');
        console.log('[HandsFree] Serveur XTTS: http://localhost:5055');
      } else {
        console.warn('[HandsFree] ⚠️ Serveur XTTS non disponible, fallback vers Web Speech API');
        console.warn('[HandsFree] Pour utiliser votre voix, lancez: npm run tts:server');
        useXTTS = false;
      }
    } catch (e) {
      console.warn('[HandsFree] ⚠️ Vérification XTTS échouée, fallback Web Speech:', e);
      useXTTS = false;
    }
  } else {
    useXTTS = false;
    console.log('[HandsFree] XTTS désactivé - utilisation de Web Speech API ou modèle open source');
  }

  // Charger les voix disponibles pour Web Speech API
  await loadVoiceOptions();
  
  // Si un modèle open source est sélectionné, le précharger
  if (ttsEngine === 'open-source' && ttsModel) {
    const model = getModelById(ttsModel);
    if (model) {
      console.log(`[HandsFree] ✅ Modèle ${model.name} sélectionné - WebGPU activé (${model.size}GB)`);
      console.log('[HandsFree] Préchargement du modèle...');
      
      try {
        // Vérifier si le modèle est disponible (validé)
        if (!isModelAvailable(ttsModel)) {
          const status = getModelStatus(ttsModel);
          if (status && status.status === 'unavailable') {
            console.warn(`[HandsFree] ⚠️ Modèle ${model.name} non disponible: ${status.error || 'Non supporté'}`);
            console.warn('[HandsFree] Fallback vers Web Speech API');
            hideModelLoadingProgress();
            return;
          }
          // Si non validé, on essaie quand même (validation en cours ou pas encore faite)
          console.log(`[HandsFree] ⚠️ Modèle ${model.name} non encore validé, tentative de chargement...`);
        }
        
        // Précharger le modèle en arrière-plan
        if (!isTTSModelReady(ttsModel)) {
          console.log(`[HandsFree] Chargement du modèle ${model.name}...`);
          showModelLoadingProgress(model.name, 0);
          
          await initTTSModel(ttsModel, ttsVoice, (progress) => {
            // progress est maintenant un nombre (0-100) grâce à formatProgressCallback
            const percentage = typeof progress === 'number' ? progress : 0;
            console.log(`[HandsFree] Chargement modèle: ${percentage}%`);
            showModelLoadingProgress(model.name, percentage);
          });
          
          hideModelLoadingProgress();
          console.log(`[HandsFree] ✅ Modèle ${model.name} chargé et prêt`);
        } else {
          hideModelLoadingProgress();
          console.log(`[HandsFree] ✅ Modèle ${model.name} déjà chargé`);
        }
      } catch (e) {
        hideModelLoadingProgress();
        console.error(`[HandsFree] ❌ Erreur lors du chargement du modèle ${model.name}:`, e);
        console.warn('[HandsFree] Fallback vers Web Speech API');
      }
    } else {
      console.warn(`[HandsFree] ⚠️ Modèle ${ttsModel} non trouvé, fallback Web Speech API`);
    }
  } else if (ttsEngine === 'web-speech' || !ttsEngine) {
    // Web Speech API par défaut
    console.log('[HandsFree] ✅ Web Speech API ready (voix système)');
  }
  
  console.log('[HandsFree] ✅ TTS initialized (Web Speech API - voix système par défaut)');
}

/**
 * Parle en streaming (phrase par phrase) avec bulle animée
 * Utilise le modèle TTS sélectionné (open source, XTTS, ou Web Speech API)
 */
async function speakStreaming(text, onSentenceSpoken) {
  if (!text) {
    console.warn('[HandsFree] speakStreaming: no text provided');
    return;
  }
  
  // Détecter le moteur TTS à utiliser depuis les settings
  const ttsEngine = state.settings.ttsEngine;
  const ttsModel = state.settings.ttsModel;
  const ttsVoice = state.settings.ttsVoice;
  
  // Vérifier si un modèle TTS open source est sélectionné
  // Accepter aussi si ttsModel existe directement (compatibilité)
  const useOpenSource = (ttsEngine === 'open-source' || (ttsModel && TTS_MODELS[ttsModel])) 
                        && ttsModel && getModelById(ttsModel);
  
  console.log('[HandsFree] TTS Engine:', ttsEngine, 'Model:', ttsModel, 'UseOpenSource:', useOpenSource);
  
  // Vérifier disponibilité XTTS (si sélectionné)
  if (ttsEngine === 'xtts' && useXTTS && xttsClient) {
    const available = await xttsClient.isAvailable();
    if (!available) {
      console.warn('[HandsFree] XTTS indisponible, bascule vers Web Speech API');
      useXTTS = false;
    }
  }
  
  // S'assurer qu'au moins Web Speech API est disponible comme fallback
  if (!useOpenSource && ttsEngine !== 'xtts' && !ttsManager) {
    console.error('[HandsFree] speakStreaming: ttsManager not initialized, initializing...');
    await initTTS();
    if (!ttsManager) {
      console.error('[HandsFree] speakStreaming: failed to initialize TTS');
      return;
    }
  }
  
  // Arrêter reconnaissance avant TTS
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.warn('[HandsFree] Error stopping recognition before TTS:', e);
    }
  }
  
  // Découper en phrases
  const sentences = text.match(/[^.!?]+[.!?]+/g) || 
                    text.match(/[^.!?\n]+[.!?\n]+/g) || 
                    [text];
  
  let spokenText = '';
  let currentSentenceIndex = 0;
  const bubble = createStreamingBubble();
  
  for (const sentence of sentences) {
    if (!handsFreeEnabled) break;
    
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    updateStreamingBubble(bubble, trimmedSentence, currentSentenceIndex, sentences.length);
    
    try {
      // Essayer le modèle TTS open source d'abord si sélectionné
      let usedTTS = false;
      
      if (useOpenSource) {
        try {
          const model = getModelById(ttsModel);
          console.log(`[HandsFree] 🎤 Utilisation de ${model.name}${ttsVoice ? ` - ${model.voices[ttsVoice]?.name || ttsVoice}` : ''}`);
          
          setState(STATES.SPEAKING);
          const spaceHint = document.getElementById('hf-space-hint');
          if (spaceHint) {
            spaceHint.classList.remove('hidden');
          }
          const ttsIndicator = document.getElementById('hf-tts-indicator');
          if (ttsIndicator) {
            ttsIndicator.classList.remove('hidden');
          }
          
          // Initialiser le modèle si nécessaire
          if (!isTTSModelReady(ttsModel)) {
            await initTTSModel(ttsModel, ttsVoice, (progress) => {
              console.log(`[HandsFree] Chargement modèle: ${progress}%`);
            });
          }
          
          // Générer et jouer l'audio
          await speakOpenSource(trimmedSentence, ttsModel, ttsVoice);
          
          usedTTS = true;
          
          // Cacher indicateurs après phrase
          if (currentSentenceIndex === sentences.length - 1) {
            if (spaceHint) {
              spaceHint.classList.add('hidden');
            }
            if (ttsIndicator) {
              ttsIndicator.classList.add('hidden');
            }
          }
        } catch (e) {
          console.warn('[HandsFree] Erreur modèle TTS open source, fallback:', e);
        }
      }
      
      // Essayer XTTS si modèle open source non utilisé
      if (!usedTTS && ttsEngine === 'xtts' && useXTTS && xttsClient) {
        try {
          const available = await xttsClient.isAvailable();
          if (available) {
            // Utiliser XTTS-v2
            setState(STATES.SPEAKING);
            const spaceHint = document.getElementById('hf-space-hint');
            if (spaceHint) {
              spaceHint.classList.remove('hidden');
            }
            const ttsIndicator = document.getElementById('hf-tts-indicator');
            if (ttsIndicator) {
              ttsIndicator.classList.remove('hidden');
            }
            
            console.log('[HandsFree] 🎤 Utilisation de votre voix (Lucas) via XTTS');
            await xttsClient.speak(trimmedSentence, {
              language: voiceConfig.lang.split('-')[0] || 'fr',
              speed: 1.15, // 1.1x-1.2x comme spécifié
              emotions: false
            });
            
            usedTTS = true;
            
            // Cacher indicateurs après phrase (mais pas si d'autres phrases suivent)
            if (currentSentenceIndex === sentences.length - 1) {
              if (spaceHint) {
                spaceHint.classList.add('hidden');
              }
              if (ttsIndicator) {
                ttsIndicator.classList.add('hidden');
              }
            }
          }
        } catch (e) {
          console.warn('[HandsFree] XTTS error, fallback to Web Speech:', e);
        }
      }
      
      // Fallback vers Web Speech API si aucun autre TTS n'a été utilisé
      if (!usedTTS) {
        if (ttsManager) {
          // Afficher indicateurs avant de parler
          setState(STATES.SPEAKING);
          const spaceHint = document.getElementById('hf-space-hint');
          if (spaceHint) {
            spaceHint.classList.remove('hidden');
          }
          const ttsIndicator = document.getElementById('hf-tts-indicator');
          if (ttsIndicator) {
            ttsIndicator.classList.remove('hidden');
          }
          
          console.log('[HandsFree] 🔊 Utilisation de Web Speech API (voix système)');
          await ttsManager.speak(trimmedSentence);
          
          // Cacher indicateurs après phrase
          if (currentSentenceIndex === sentences.length - 1) {
            if (spaceHint) {
              spaceHint.classList.add('hidden');
            }
            if (ttsIndicator) {
              ttsIndicator.classList.add('hidden');
            }
          }
        } else {
          console.error('[HandsFree] ⚠️ Aucun TTS disponible - initialisation...');
          await initTTS();
          if (ttsManager) {
            console.log('[HandsFree] TTS initialisé, réessayez de parler');
            setState(STATES.SPEAKING);
            await ttsManager.speak(trimmedSentence);
          } else {
            console.error('[HandsFree] Impossible d\'initialiser le TTS');
            break;
          }
        }
      }
      
      spokenText += trimmedSentence + ' ';
      currentSentenceIndex++;
      
      if (onSentenceSpoken) {
        onSentenceSpoken(spokenText.trim());
      }
    } catch (err) {
      if (err !== 'interrupted' && !err.message?.includes('indisponible')) {
        console.error('[HandsFree] TTS streaming error:', err);
        // Essayer fallback si erreur XTTS
        if (useXTTS && ttsManager) {
          console.log('[HandsFree] Tentative fallback Web Speech API...');
          useXTTS = false;
          try {
            await ttsManager.speak(trimmedSentence);
            spokenText += trimmedSentence + ' ';
            currentSentenceIndex++;
            if (onSentenceSpoken) {
              onSentenceSpoken(spokenText.trim());
            }
          } catch (fallbackErr) {
            console.error('[HandsFree] Fallback aussi échoué:', fallbackErr);
            break;
          }
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }
  
  hideStreamingBubble(bubble);
  
  // Réactivation automatique après TTS
  if (handsFreeEnabled) {
    setTimeout(() => {
      if (handsFreeEnabled && !(useXTTS && xttsClient?.isSpeaking()) && !ttsManager?.isSpeaking()) {
        startListening();
      }
    }, 300);
  } else {
    setState(STATES.IDLE);
  }
}

/**
 * Crée la bulle de streaming TTS
 */
function createStreamingBubble() {
  const container = document.getElementById('hf-messages');
  if (!container) return null;
  
  // Supprimer l'ancienne bulle si elle existe
  const oldBubble = document.getElementById('hf-tts-bubble');
  if (oldBubble) oldBubble.remove();
  
  const bubble = document.createElement('div');
  bubble.id = 'hf-tts-bubble';
  bubble.className = 'flex justify-start mb-3 animate-fade-in';
  bubble.innerHTML = `
    <div class="max-w-[85%] bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
      <div class="flex items-start gap-2">
        <div class="flex-shrink-0 mt-1">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
            <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.383 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.383l4-3.617a1 1 0 011.617.793zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clip-rule="evenodd"/>
            </svg>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs text-indigo-600 font-medium mb-1 flex items-center gap-2">
            <span>Lecture en cours</span>
            <div class="flex gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" style="animation-delay: 0s"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" style="animation-delay: 0.2s"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" style="animation-delay: 0.4s"></span>
            </div>
          </div>
          <div id="hf-tts-bubble-text" class="text-sm prose prose-sm max-w-none text-gray-800">
            <!-- Texte de la phrase en cours avec markdown -->
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  
  return bubble;
}

/**
 * Met à jour la bulle avec la phrase en cours
 */
function updateStreamingBubble(bubble, sentence, currentIndex, totalSentences) {
  if (!bubble) return;
  
  const textEl = bubble.querySelector('#hf-tts-bubble-text');
  if (textEl) {
    // Parser le markdown pour la phrase
    textEl.innerHTML = parseMarkdown(sentence);
  }
  
  // Scroll automatique
  const container = document.getElementById('hf-messages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Cache la bulle de streaming
 */
function hideStreamingBubble(bubble) {
  if (bubble) {
    bubble.classList.add('animate-fade-out');
    setTimeout(() => {
      bubble.remove();
    }, 300);
  }
}

/**
 * Affiche le compte à rebours d'interruption
 */
function showInterruptionCountdown() {
  const container = document.getElementById('hf-interrupt-countdown');
  const timer = document.getElementById('hf-interrupt-timer');
  
  if (!container || !timer) return;
  
  container.classList.remove('hidden');
  
  // Démarrer le compte à rebours
  if (interruptCountdownInterval) {
    clearInterval(interruptCountdownInterval);
  }
  
  interruptCountdownInterval = setInterval(() => {
    if (!speechDetector || (!ttsManager?.isSpeaking() && currentState !== STATES.PROCESSING)) {
      hideInterruptionCountdown();
      return;
    }
    
    const remaining = speechDetector.getRemainingTime();
    if (remaining <= 0) {
      // Interrompre maintenant
      clearInterval(interruptCountdownInterval);
      interruptCountdownInterval = null;
      if (ttsManager?.isSpeaking()) {
        ttsManager.stop();
      }
      setState(STATES.LISTENING);
      hideInterruptionCountdown();
      console.log('[HandsFree] Interrupted after 1s of speech');
    } else {
      // Afficher avec 1 décimale (dixièmes)
      timer.textContent = `${(remaining / 1000).toFixed(1)}s`;
    }
  }, 100); // Mettre à jour toutes les 100ms pour les dixièmes
}

/**
 * Met à jour le compte à rebours d'interruption
 */
function updateInterruptionCountdown() {
  const timer = document.getElementById('hf-interrupt-timer');
  if (!timer || !speechDetector) return;
  
  const remaining = speechDetector.getRemainingTime();
  if (remaining > 0) {
    timer.textContent = `${(remaining / 1000).toFixed(1)}s`;
  }
}

/**
 * Cache le compte à rebours d'interruption
 */
function hideInterruptionCountdown() {
  const container = document.getElementById('hf-interrupt-countdown');
  if (container) {
    container.classList.add('hidden');
  }
  
  if (interruptCountdownInterval) {
    clearInterval(interruptCountdownInterval);
    interruptCountdownInterval = null;
  }
}

/**
 * Charge les options de voix dans le select (meilleures voix en premier)
 */
async function loadVoiceOptions() {
  const select = document.getElementById('hf-voice-select');
  if (!select) return;

  const langPrefix = voiceConfig.lang.split('-')[0];
  const bestVoices = await getBestVoicesForLang(langPrefix);

  select.innerHTML = '<option value="">Voix par défaut</option>' +
    bestVoices.map((v, i) => {
      const badge = i < 3 ? ' ⭐' : '';
      return `<option value="${v.name}">${v.name}${badge}</option>`;
    }).join('');
  
  // Si une voix était sélectionnée et n'existe plus, reset
  if (voiceConfig.voiceName && !bestVoices.find(v => v.name === voiceConfig.voiceName)) {
    voiceConfig.voiceName = null;
    if (ttsManager) {
      ttsManager.setConfig({ voiceName: null });
    }
  }
}

/**
 * Charge les options de voix Kokoro
 */
function loadKokoroVoiceOptions() {
  const select = document.getElementById('hf-voice-select');
  if (!select) return;

  const kokoroVoices = getKokoroVoices();
  const langPrefix = voiceConfig.lang.split('-')[0];
  const filtered = kokoroVoices.filter(v => v.lang.startsWith(langPrefix));

  select.innerHTML = '<option value="">Voix par défaut</option>' +
    filtered.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
}

/**
 * Configure les événements
 */
function setupHandsFreeEvents(panel) {
  const toggleBtn = panel.querySelector('#hf-toggle-btn');
  const sendBtn = panel.querySelector('#hf-send-btn');
  const transcript = panel.querySelector('#hf-transcript');
  const settingsBtn = panel.querySelector('#hf-settings-btn');
  const settingsModal = panel.querySelector('#hf-settings-modal');
  const closeSettings = panel.querySelector('#hf-close-settings');
  
  // Gérer le message informatif sur les voix
  const voiceInfo = panel.querySelector('#hf-voice-info');
  const closeVoiceInfo = panel.querySelector('#hf-close-voice-info');
  const openSettingsBtn = panel.querySelector('#hf-open-settings');
  const currentVoiceSpan = panel.querySelector('#hf-current-voice');
  
  // Fermer le message informatif
  closeVoiceInfo?.addEventListener('click', () => {
    if (voiceInfo) {
      voiceInfo.classList.add('hidden');
      localStorage.setItem('hf-voice-info-dismissed', 'true');
    }
  });
  
  // Ouvrir les settings depuis le message
  openSettingsBtn?.addEventListener('click', () => {
    showSettingsPanel();
    // Scroll vers la section voix
    setTimeout(() => {
      const ttsEngineSelect = document.querySelector('#tts-engine-select');
      if (ttsEngineSelect) {
        ttsEngineSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ttsEngineSelect.focus();
      }
    }, 300);
  });
  
  // Afficher le message si pas déjà fermé
  if (voiceInfo && !localStorage.getItem('hf-voice-info-dismissed')) {
    voiceInfo.classList.remove('hidden');
  }
  
  // Mettre à jour l'affichage de la voix actuelle
  function updateCurrentVoiceDisplay() {
    if (currentVoiceSpan) {
      const ttsEngine = state.settings.ttsEngine;
      const ttsModel = state.settings.ttsModel;
      const ttsVoice = state.settings.ttsVoice;
      
      if (ttsEngine === 'open-source' && ttsModel) {
        // Modèle open source sélectionné
        const model = getModelById(ttsModel);
        if (model) {
          const voiceName = ttsVoice && model.voices[ttsVoice] ? model.voices[ttsVoice].name : '';
          currentVoiceSpan.textContent = `${model.name}${voiceName ? ` - ${voiceName}` : ''} (${model.size}GB)`;
          currentVoiceSpan.className = 'font-medium text-green-700';
        } else {
          currentVoiceSpan.textContent = 'Web Speech API (voix système)';
          currentVoiceSpan.className = 'font-medium text-indigo-700';
        }
      } else if (ttsEngine === 'xtts' && useXTTS && xttsClient) {
        // Vérifier XTTS de manière asynchrone
        xttsClient.isAvailable().then(available => {
          if (available) {
            currentVoiceSpan.textContent = 'XTTS-v2 (Votre voix - Lucas)';
            currentVoiceSpan.className = 'font-medium text-green-700';
          } else {
            currentVoiceSpan.textContent = 'Web Speech API (voix système)';
            currentVoiceSpan.className = 'font-medium text-indigo-700';
          }
        }).catch(() => {
          currentVoiceSpan.textContent = 'Web Speech API (voix système)';
          currentVoiceSpan.className = 'font-medium text-indigo-700';
        });
      } else {
        currentVoiceSpan.textContent = 'Web Speech API (voix système)';
        currentVoiceSpan.className = 'font-medium text-indigo-700';
      }
    }
  }
  
  // Mettre à jour périodiquement
  setInterval(updateCurrentVoiceDisplay, 3000);
  updateCurrentVoiceDisplay();
  
  const langSelect = panel.querySelector('#hf-lang-select');
  const voiceSelect = panel.querySelector('#hf-voice-select');
  const rateSlider = panel.querySelector('#hf-rate-slider');
  const pitchSlider = panel.querySelector('#hf-pitch-slider');
  const testVoice = panel.querySelector('#hf-test-voice');

  // Toggle Hands-Free
  toggleBtn?.addEventListener('click', () => {
    toggleHandsFree();
  });

  // Send button
  sendBtn?.addEventListener('click', () => {
    sendTranscript();
  });

  // Cancel button (silence timer)
  const cancelBtn = panel.querySelector('#hf-cancel-btn');
  cancelBtn?.addEventListener('click', () => {
    if (silenceTimeout) {
      clearTimeout(silenceTimeout);
      silenceTimeout = null;
    }
    const countdownEl = document.getElementById('hf-countdown');
    if (countdownEl) {
      countdownEl.textContent = '';
      countdownEl.classList.add('hidden');
    }
    cancelBtn.classList.add('hidden');
  });

  // Cancel interrupt button
  const cancelInterruptBtn = panel.querySelector('#hf-cancel-interrupt');
  cancelInterruptBtn?.addEventListener('click', () => {
    speechDetector?.reset();
    hideInterruptionCountdown();
    console.log('[HandsFree] Interruption cancelled by user');
  });

  // Transcript input
  transcript?.addEventListener('input', () => {
    updateSendButton();
  });

  transcript?.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      sendTranscript();
    }
  });

  // Les paramètres vocaux sont maintenant dans les settings globaux
  // Plus besoin de modal locale

  // Language change - arrêter TTS si en cours et appliquer
  langSelect?.addEventListener('change', () => {
    voiceConfig.lang = langSelect.value;
    if (recognition) {
      recognition.setLang(voiceConfig.lang);
    }
    if (ttsManager) {
      // Si TTS est en cours, arrêter pour appliquer nouvelle langue
      if (ttsManager.isSpeaking()) {
        ttsManager.stop();
        // Cacher la bulle de streaming
        const bubble = document.getElementById('hf-tts-bubble');
        if (bubble) hideStreamingBubble(bubble);
      }
      ttsManager.setConfig({ lang: voiceConfig.lang });
    }
    loadVoiceOptions();
  });

  // TTS Engine change
  const ttsEngineSelect = panel.querySelector('#hf-tts-engine');
  ttsEngineSelect?.addEventListener('change', async () => {
    const engine = ttsEngineSelect.value;
    voiceConfig.ttsEngine = engine;
    useKokoroTTS = engine === 'kokoro';
    
    if (useKokoroTTS) {
      // Charger Kokoro TTS
      const voiceHint = document.getElementById('hf-voice-hint');
      if (voiceHint) {
        voiceHint.textContent = 'Chargement Kokoro TTS...';
      }
      
      const loaded = await initKokoroTTS('fr-female', (progress) => {
        if (voiceHint) {
          voiceHint.textContent = `Chargement: ${progress}%`;
        }
      });
      
      if (loaded) {
        if (voiceHint) {
          voiceHint.textContent = 'Kokoro TTS chargé';
        }
        // Charger les voix Kokoro dans le select
        loadKokoroVoiceOptions();
      } else {
        // Demander à l'utilisateur si fallback
        const useFallback = confirm('Kokoro TTS n\'est pas encore disponible. Utiliser la voix système native ?');
        if (useFallback) {
          ttsEngineSelect.value = 'native';
          voiceConfig.ttsEngine = 'native';
          useKokoroTTS = false;
          loadVoiceOptions();
        }
      }
    } else {
      loadVoiceOptions();
      const voiceHint = document.getElementById('hf-voice-hint');
      if (voiceHint) {
        voiceHint.textContent = 'Les voix Google/Siri sont recommandées';
      }
    }
  });

  // Voice change - arrêter TTS si en cours et appliquer
  voiceSelect?.addEventListener('change', () => {
    voiceConfig.voiceName = voiceSelect.value || null;
    if (ttsManager && !useKokoroTTS) {
      // Si TTS est en cours, arrêter pour appliquer nouvelle voix
      if (ttsManager.isSpeaking()) {
        ttsManager.stop();
        // Cacher la bulle de streaming
        const bubble = document.getElementById('hf-tts-bubble');
        if (bubble) hideStreamingBubble(bubble);
      }
      ttsManager.setConfig({ voiceName: voiceConfig.voiceName });
    }
  });

  // Rate slider
  rateSlider?.addEventListener('input', () => {
    const value = parseFloat(rateSlider.value);
    voiceConfig.rate = value;
    document.getElementById('hf-rate-value').textContent = value.toFixed(1);
    if (ttsManager) {
      ttsManager.setConfig({ rate: value });
    }
  });

  // Pitch slider
  pitchSlider?.addEventListener('input', () => {
    const value = parseFloat(pitchSlider.value);
    voiceConfig.pitch = value;
    document.getElementById('hf-pitch-value').textContent = value.toFixed(1);
    if (ttsManager) {
      ttsManager.setConfig({ pitch: value });
    }
  });

  // Test voice
  testVoice?.addEventListener('click', () => {
    if (ttsManager) {
      const testText = voiceConfig.lang.startsWith('fr') 
        ? 'Bonjour, ceci est un test de la synthèse vocale.'
        : 'Hello, this is a text-to-speech test.';
      ttsManager.speak(testText);
    }
  });

  // Mode conversation toggle
  const conversationToggle = panel.querySelector('#hf-conversation-mode');
  conversationToggle?.addEventListener('change', () => {
    conversationMode = conversationToggle.checked;
    updateConversationModeUI();
  });
}


/**
 * Met à jour l'UI selon le mode conversation
 */
function updateConversationModeUI() {
  const sendBtn = document.getElementById('hf-send-btn');
  const transcriptLabel = document.querySelector('#handsfree-panel .flex-shrink-0.p-4 label');
  
  if (conversationMode) {
    if (sendBtn) sendBtn.classList.add('hidden');
    if (transcriptLabel) transcriptLabel.textContent = 'Transcription (envoi auto après 1.5s de silence)';
  } else {
    if (sendBtn) sendBtn.classList.remove('hidden');
    if (transcriptLabel) transcriptLabel.textContent = 'Transcription';
  }
}

/**
 * Affiche la popup de confirmation au premier accès
 */
function showHandsFreeConfirmation() {
  return new Promise((resolve) => {
    // Vérifier si déjà confirmé (localStorage)
    const hasConfirmed = localStorage.getItem('handsfree-confirmed');
    if (hasConfirmed === 'true') {
      resolve(true);
      return;
    }
    
    // Créer la popup bloquante
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div class="p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
              </svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900">Mode Hands-Free</h3>
          </div>
          <p class="text-sm text-gray-600 mb-4">
            Le mode Hands-Free nécessite <strong>Qwen 4B Instruct</strong> pour fonctionner.
          </p>
          <p class="text-xs text-gray-500 mb-6">
            Ce modèle sera chargé automatiquement si nécessaire. Vous pourrez converser vocalement avec l'assistant.
          </p>
          <div class="flex gap-3">
            <button id="hf-confirm-cancel" class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Annuler
            </button>
            <button id="hf-confirm-ok" class="flex-1 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors">
              Continuer
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const cancelBtn = modal.querySelector('#hf-confirm-cancel');
    const okBtn = modal.querySelector('#hf-confirm-ok');
    
    cancelBtn.addEventListener('click', () => {
      modal.remove();
      resolve(false);
    });
    
    okBtn.addEventListener('click', () => {
      localStorage.setItem('handsfree-confirmed', 'true');
      modal.remove();
      resolve(true);
    });
    
    // Fermer en cliquant en dehors
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(false);
      }
    });
  });
}

/**
 * Configure le raccourci ESPACE pour couper le TTS
 */
function setupSpaceKeyListener() {
  // Supprimer l'ancien listener si existe
  if (spaceKeyListener) {
    document.removeEventListener('keydown', spaceKeyListener);
  }
  
  spaceKeyListener = (e) => {
    // ESPACE pour couper le TTS et réactiver le micro
    if (e.code === 'Space' && !e.repeat && handsFreeEnabled) {
      // Éviter si on est dans un input/textarea
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }
      
      // Si TTS est en cours (Web Speech API ou XTTS), couper et réactiver
      const isTTSPlaying = (ttsManager?.isSpeaking()) || (useXTTS && xttsClient?.isSpeaking());
      
      if (isTTSPlaying) {
        e.preventDefault();
        console.log('[HandsFree] Space pressed - stopping TTS and reactivating mic');
        
        // Arrêter tous les TTS
        ttsManager?.stop();
        xttsClient?.stop();
        
        // Réinitialiser le transcript pour éviter qu'un ancien message soit renvoyé
        currentTranscript = '';
        const transcriptEl = document.getElementById('hf-transcript');
        if (transcriptEl) transcriptEl.value = '';
        const interimEl = document.getElementById('hf-interim');
        if (interimEl) interimEl.textContent = '';
        
        // Arrêter le timer de silence s'il est actif
        if (silenceTimeout) {
          clearTimeout(silenceTimeout);
          silenceTimeout = null;
        }
        
        // Cacher le compte à rebours
        const countdownEl = document.getElementById('hf-countdown');
        const cancelBtn = document.getElementById('hf-cancel-btn');
        if (countdownEl) {
          countdownEl.classList.add('hidden');
          countdownEl.textContent = '';
        }
        if (cancelBtn) {
          cancelBtn.classList.add('hidden');
        }
        
        // Réactiver le micro après un court délai
        setTimeout(() => {
          if (handsFreeEnabled) {
            setState(STATES.LISTENING);
            startListening();
          }
        }, 150);
      }
    }
  };
  
  document.addEventListener('keydown', spaceKeyListener);
  console.log('[HandsFree] Space key listener configured (press SPACE to interrupt TTS)');
}

/**
 * Supprime le listener ESPACE
 */
function removeSpaceKeyListener() {
  if (spaceKeyListener) {
    document.removeEventListener('keydown', spaceKeyListener);
    spaceKeyListener = null;
  }
  if (spaceKeyDebounceTimeout) {
    clearTimeout(spaceKeyDebounceTimeout);
    spaceKeyDebounceTimeout = null;
  }
}

/**
 * Toggle le mode Hands-Free
 */
export async function toggleHandsFree() {
  if (!isSTTSupported()) return;

  // Afficher popup de confirmation au premier accès
  if (!localStorage.getItem('handsfree-confirmed')) {
    const confirmed = await showHandsFreeConfirmation();
    if (!confirmed) {
      return; // Utilisateur a annulé
    }
  }

  handsFreeEnabled = !handsFreeEnabled;

  if (handsFreeEnabled) {
    // INITIALISATION COMPLÈTE AU PREMIER CLIC
    // Valider les modèles TTS au premier clic (une seule fois)
    if (!modelsValidated) {
      console.log('[HandsFree] Validation des modèles TTS au démarrage...');
      modelsValidated = true;
      
      // Émettre un événement pour indiquer que la validation commence
      window.dispatchEvent(new CustomEvent('tts:validationStarted'));
      
      // Valider tous les modèles en arrière-plan (ne pas bloquer l'UI)
      validateAllModels((modelId, status, error) => {
        console.log(`[HandsFree] Modèle ${modelId}: ${status}${error ? ` (${error})` : ''}`);
        // Mettre à jour le statut dans state
        if (!state.ttsModelStatus) {
          state.ttsModelStatus = {};
        }
        state.ttsModelStatus[modelId] = { status, error, timestamp: Date.now() };
        
        // Émettre un événement pour que les autres composants se mettent à jour
        window.dispatchEvent(new CustomEvent('tts:modelValidated', {
          detail: { modelId, status, error }
        }));
      }).catch(err => {
        console.error('[HandsFree] Erreur lors de la validation des modèles:', err);
      }).finally(() => {
        // Masquer l'indicateur de validation quand terminé
        window.dispatchEvent(new CustomEvent('tts:validationComplete'));
      });
    }
    
    // Initialiser TTS si pas déjà fait
    if (!ttsManager && !xttsClient) {
      console.log('[HandsFree] Initializing TTS on first activation...');
      await initTTS();
      
      // Vérifier le moteur TTS sélectionné
      const ttsEngine = state.settings.ttsEngine;
      const ttsModel = state.settings.ttsModel;
      
      if (ttsEngine === 'xtts' && useXTTS && xttsClient) {
        // Vérifier XTTS seulement si explicitement sélectionné
        const available = await xttsClient.isAvailable();
        if (available) {
          console.log('[HandsFree] ✅ Votre voix (Lucas) est prête via XTTS');
        } else {
          console.warn('[HandsFree] ⚠️ Serveur XTTS non disponible - Lancez: npm run tts:server');
          console.warn('[HandsFree] Utilisation de la voix système en attendant');
        }
      } else if (ttsEngine === 'open-source' && ttsModel) {
        // Modèle open source - pas besoin de serveur
        const model = getModelById(ttsModel);
        if (model) {
          console.log(`[HandsFree] ✅ Modèle ${model.name} sélectionné - WebGPU activé (${model.size}GB)`);
          console.log('[HandsFree] Aucun serveur requis - fonctionne directement dans le navigateur');
        }
      }
    }
    
    // Charger le modèle si pas déjà chargé
    if (!isModelReady('primary')) {
      showError('Chargement du modèle optimisé...');
      // Charger automatiquement le meilleur modèle
      await autoLoadBestOralModel();
      
      if (!isModelReady('primary')) {
        showError('⚠️ Impossible de charger le modèle. Réessayez.');
        handsFreeEnabled = false;
        updateToggleButton();
        return;
      }
    }
    
    // Lancer les diagnostics au premier clic
    const diagnostics = await runStartupDiagnostics();
    console.log('[HandsFree] Diagnostics:', diagnostics);
    
    // Activer automatiquement le mode conversation
    conversationMode = true;
    const conversationToggle = document.getElementById('hf-conversation-mode');
    if (conversationToggle) {
      conversationToggle.checked = true;
    }
    updateConversationModeUI();
    
    // Configurer le raccourci ESPACE
    setupSpaceKeyListener();
    
    // Bip sonore au démarrage
    playStartBeep();
    
    // Démarrer immédiatement l'écoute
    startListening();
  } else {
    stopAll();
    removeSpaceKeyListener();
  }

  updateToggleButton();
}


/**
 * Démarre l'écoute (CORRIGÉ - évite "Recognition already started")
 */
function startListening() {
  if (!isSTTSupported()) return;
  
  // CORRECTION: Vérifier si déjà en cours avant de démarrer
  if (recognition) {
    try {
      // Essayer d'arrêter proprement d'abord
      recognition.stop();
      // Attendre un peu avant de redémarrer
      setTimeout(() => {
        if (handsFreeEnabled) {
          startListeningInternal();
        }
      }, 200);
      return;
    } catch (e) {
      // Si erreur, continuer quand même
      console.warn('[HandsFree] Error stopping recognition before restart:', e);
    }
  }
  
  startListeningInternal();
}

async function startListeningInternal() {
  if (!isSTTSupported()) {
    showError('Reconnaissance vocale non supportée par votre navigateur', false);
    return;
  }
  
  // Vérifier permissions microphone
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop()); // Libérer immédiatement
    console.log('[HandsFree] Microphone permission granted');
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      showError('Permission microphone refusée. Activez-la dans les paramètres du navigateur.', true);
      return;
    } else if (e.name === 'NotFoundError') {
      showError('Aucun microphone détecté. Vérifiez votre matériel.', false);
      return;
    } else {
      showError(`Erreur microphone: ${e.message}`, true);
      return;
    }
  }

  hideError();
  speechDetector = createSpeechDetector(1000);

  // Créer une nouvelle instance si nécessaire
  if (!recognition) {
    recognition = createSpeechRecognition({
    lang: voiceConfig.lang,
    continuous: true,
    interimResults: true,
    onStart: () => {
      console.log('[HandsFree] Recognition started');
      setState(STATES.LISTENING);
    },
    onResult: ({ interim, final, isFinal }) => {
      const interimEl = document.getElementById('hf-interim');
      const transcriptEl = document.getElementById('hf-transcript');

      // AFFICHAGE EN LIVE : Afficher la transcription complète (final + interim) en temps réel
      if (isFinal && final) {
        // Ajouter le texte final à la transcription accumulée
        currentTranscript += (currentTranscript ? ' ' : '') + final.trim();
      }
      
      // Afficher en live : transcription accumulée + interim actuel
      const displayText = currentTranscript + (interim ? (currentTranscript ? ' ' : '') + interim : '');
      
      if (transcriptEl) {
        transcriptEl.value = displayText;
        // Auto-resize si textarea
        if (transcriptEl.tagName === 'TEXTAREA') {
          transcriptEl.style.height = 'auto';
          transcriptEl.style.height = transcriptEl.scrollHeight + 'px';
        }
      }
      
      if (interimEl) {
        // Afficher l'interim séparément (optionnel, pour feedback visuel)
        interimEl.textContent = interim;
      }
      
      updateSendButton();
      
      // Mode conversation : reset le timer de silence seulement si on écoute
      if (conversationMode && currentState === STATES.LISTENING && (isFinal || interim)) {
        resetSilenceTimer();
      }
    },
    onSpeechStart: () => {
      speechDetector?.onSpeechStart();
      console.log('[HandsFree] Speech started');
      
      // Annuler le timer si on recommence à parler
      if (silenceTimeout) {
        console.log('[HandsFree] Cancelling silence timer (user speaking)');
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
      }
      
      // Cacher le compte à rebours et le bouton annuler
      const countdownEl = document.getElementById('hf-countdown');
      const cancelBtn = document.getElementById('hf-cancel-btn');
      if (countdownEl) {
        countdownEl.classList.add('hidden');
      }
      if (cancelBtn) {
        cancelBtn.classList.add('hidden');
      }
      
      // SIMPLIFIÉ: Pas de compte à rebours d'interruption automatique
    },
    onSpeechEnd: () => {
      speechDetector?.onSpeechEnd();
      // Cacher le compte à rebours d'interruption
      hideInterruptionCountdown();
      // Mode conversation : démarrer le timer de silence après un petit délai
      // pour s'assurer que l'utilisateur a vraiment fini de parler
      if (conversationMode && currentTranscript.trim()) {
        // Attendre 200ms après onSpeechEnd pour éviter les faux positifs
        setTimeout(() => {
          // Vérifier qu'on est toujours en mode écoute et qu'il n'y a pas de nouvelle parole
          if (conversationMode && currentState === STATES.LISTENING && currentTranscript.trim()) {
            resetSilenceTimer();
          }
        }, 200);
      }
    },
    onError: ({ message }) => {
      // Ignorer "Recognition already started" (géré ailleurs)
      if (message !== 'Reconnaissance annulée' && !message.includes('already started')) {
        showError(message);
      }
    },
    onEnd: () => {
      // Redémarrer si toujours actif (avec protection)
      if (handsFreeEnabled && currentState === STATES.LISTENING) {
        setTimeout(() => {
          if (handsFreeEnabled && currentState === STATES.LISTENING && !ttsManager?.isSpeaking()) {
            try {
              recognition?.start();
            } catch (e) {
              // Si erreur "already started", ignorer
              if (!e.message?.includes('already started')) {
                console.warn('[HandsFree] Error restarting recognition:', e);
              }
            }
          }
        }, 200);
      }
    }
  });
  } else {
    // Mettre à jour la langue si nécessaire
    recognition.setLang(voiceConfig.lang);
  }

  try {
    recognition.start();
  } catch (e) {
    // Gérer "already started" gracieusement
    if (e.message?.includes('already started')) {
      console.log('[HandsFree] Recognition already running, skipping start');
    } else {
      console.error('[HandsFree] Error starting recognition:', e);
      showError('Erreur de démarrage de la reconnaissance vocale', true);
    }
  }
}

/**
 * Reset le timer de silence pour envoi automatique avec compte à rebours
 */
function resetSilenceTimer() {
  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
  }
  
  // Arrêter le compte à rebours précédent si existant
  const countdownEl = document.getElementById('hf-countdown');
  const cancelBtn = document.getElementById('hf-cancel-btn');
  
  if (countdownEl) {
    countdownEl.textContent = '';
    countdownEl.classList.add('hidden');
  }
  if (cancelBtn) {
    cancelBtn.classList.add('hidden');
  }
  
  if (!conversationMode || !currentTranscript.trim() || !handsFreeEnabled) {
    return;
  }
  
  // Afficher le compte à rebours et le bouton annuler
  if (countdownEl) {
    countdownEl.classList.remove('hidden');
  }
  if (cancelBtn) {
    cancelBtn.classList.remove('hidden');
  }
  
  // Compte à rebours précis : 3 secondes avec mise à jour toutes les 100ms pour affichage fluide
  let remainingMs = SILENCE_DELAY; // 3000ms
  const startTime = Date.now();
  
  const updateCountdown = () => {
    const elapsed = Date.now() - startTime;
    remainingMs = Math.max(0, SILENCE_DELAY - elapsed);
    
    if (countdownEl) {
      // Afficher avec 1 décimale pour plus de précision
      const seconds = (remainingMs / 1000).toFixed(1);
      countdownEl.textContent = `Envoi dans ${seconds}s...`;
    }
    
    if (remainingMs <= 0) {
      // Temps écoulé, envoyer
      if (countdownEl) {
        countdownEl.textContent = '';
        countdownEl.classList.add('hidden');
      }
      if (cancelBtn) {
        cancelBtn.classList.add('hidden');
      }
      if (conversationMode && currentTranscript.trim() && handsFreeEnabled) {
        sendTranscript();
      }
    } else {
      // Mettre à jour toutes les 100ms pour un compte à rebours fluide
      silenceTimeout = setTimeout(updateCountdown, 100);
    }
  };
  
  // Démarrer immédiatement
  updateCountdown();
}

/**
 * Test de reconnaissance vocale au démarrage
 */
async function testRecognition() {
  return new Promise((resolve) => {
    if (!isSTTSupported()) {
      console.warn('[HandsFree] Recognition test skipped: STT not supported');
      resolve(false);
      return;
    }
    
    console.log('[HandsFree] Testing recognition...');
    let resolved = false;
    
    const testRecognition = createSpeechRecognition({
      lang: voiceConfig.lang,
      continuous: false,
      interimResults: false,
      onResult: ({ final }) => {
        if (final && !resolved) {
          console.log('[HandsFree] Recognition test successful:', final);
          resolved = true;
          resolve(true);
        }
      },
      onError: ({ message }) => {
        if (!resolved) {
          console.error('[HandsFree] Recognition test failed:', message);
          resolved = true;
          resolve(false);
        }
      },
      onEnd: () => {
        if (!resolved) {
          console.log('[HandsFree] Recognition test ended without result');
          resolved = true;
          resolve(false);
        }
      }
    });
    
    if (!testRecognition) {
      resolve(false);
      return;
    }
    
    // Timeout de 3 secondes
    const timeout = setTimeout(() => {
      if (!resolved) {
        testRecognition?.stop();
        console.log('[HandsFree] Recognition test timeout');
        resolved = true;
        resolve(false);
      }
    }, 3000);
    
    try {
      testRecognition.start();
      // Nettoyer le timeout si on résout avant
      testRecognition.recognition.onend = () => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      };
    } catch (e) {
      clearTimeout(timeout);
      if (!resolved) {
        console.error('[HandsFree] Recognition test start error:', e);
        resolved = true;
        resolve(false);
      }
    }
  });
}

/**
 * Joue un bip sonore au démarrage de l'écoute
 */
function playStartBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (err) {
    console.warn('[HandsFree] Could not play beep:', err);
  }
}

/**
 * Arrête tout
 */
function stopAll() {
  recognition?.stop();
  recognition = null;
  ttsManager?.stop();
  speechDetector?.reset();
  hideInterruptionCountdown();
  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
  }
  setState(STATES.IDLE);
}

/**
 * Envoie la transcription au chat
 */
/**
 * Détecte la taille de réponse nécessaire selon le message
 */
function detectResponseSize(message) {
  const lowerMessage = message.toLowerCase();
  
  // Mots-clés pour réponses longues
  const longResponseTriggers = [
    'liste', 'tous les', 'énumère', 'détaille', 'explique en détail',
    'tableau', 'comparaison', 'différences', 'similitudes',
    'tout sur', 'beaucoup d\'informations', 'complet', 'exhaustif',
    'pas à pas', 'étape par étape', 'procédure', 'tutorial',
    'exemples', 'montre-moi', 'donne-moi le code', 'code',
    'structure', 'organise', 'sections'
  ];
  
  // Mots-clés pour réponses moyennes
  const mediumResponseTriggers = [
    'explique', 'comment', 'pourquoi', 'qu\'est-ce que',
    'décris', 'parle-moi de', 'raconte'
  ];
  
  // Vérifier réponses longues
  for (const trigger of longResponseTriggers) {
    if (lowerMessage.includes(trigger)) {
      return { size: 'long', maxTokens: 500, description: 'Réponse détaillée' };
    }
  }
  
  // Vérifier réponses moyennes
  for (const trigger of mediumResponseTriggers) {
    if (lowerMessage.includes(trigger)) {
      return { size: 'medium', maxTokens: 300, description: 'Réponse développée' };
    }
  }
  
  // Par défaut : réponse courte
  return { size: 'short', maxTokens: 150, description: 'Réponse synthétique' };
}

async function sendTranscript() {
  const transcriptEl = document.getElementById('hf-transcript');
  const message = transcriptEl?.value?.trim() || currentTranscript.trim();

  if (!message) return;
  
  // Détecter la taille de réponse nécessaire
  const responseConfig = detectResponseSize(message);
  console.log(`[HandsFree] Response size detected: ${responseConfig.size} (${responseConfig.maxTokens} tokens)`);

  if (!isModelReady('primary')) {
    console.error('[HandsFree] Model not ready');
    showError('⚠️ Chargement du modèle en cours...');
    // Essayer de charger automatiquement
    await autoLoadBestOralModel();
    
    if (!isModelReady('primary')) {
      showError('⚠️ Impossible de charger le modèle. Réessayez.');
      setState(STATES.IDLE);
      return;
    }
  }

  const loadedModel = getLoadedModel('primary');
  console.log('[HandsFree] Model ready:', loadedModel);

  // Arrêter l'écoute et le timer
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.warn('[HandsFree] Error stopping recognition:', e);
    }
  }
  
  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
  }
  
  // Cacher le compte à rebours et le bouton annuler
  const countdownEl = document.getElementById('hf-countdown');
  const cancelBtn = document.getElementById('hf-cancel-btn');
  if (countdownEl) {
    countdownEl.classList.add('hidden');
  }
  if (cancelBtn) {
    cancelBtn.classList.add('hidden');
  }
  
  setState(STATES.PROCESSING);
  
  // Afficher l'animation de génération
  const generatingEl = document.getElementById('hf-generating');
  if (generatingEl) {
    generatingEl.classList.remove('hidden');
  }

  // Ne pas ajouter le message ici : sendMessage() le fait déjà (ligne 176 de chat.js)
  // Cela évite les doublons

  // Reset
  currentTranscript = '';
  if (transcriptEl) transcriptEl.value = '';
  const interimEl = document.getElementById('hf-interim');
  if (interimEl) interimEl.textContent = '';
  updateSendButton();

  // Timeout de sécurité (30 secondes max pour éviter blocage infini)
  let timeoutTriggered = false;
  const timeoutId = setTimeout(() => {
    timeoutTriggered = true;
    console.error('[HandsFree] Timeout: sendMessage took more than 30s');
    showError('Timeout: La génération prend trop de temps. Le modèle est peut-être bloqué. Réessayez.');
    
    // Cacher l'animation
    const generatingEl = document.getElementById('hf-generating');
    if (generatingEl) {
      generatingEl.classList.add('hidden');
    }
    
    // Retirer le message utilisateur de l'historique
    const messagesContainer = document.getElementById('hf-messages');
    if (messagesContainer && messagesContainer.lastElementChild) {
      messagesContainer.lastElementChild.remove();
    }
    
    setState(STATES.LISTENING);
    if (handsFreeEnabled) {
      startListening();
    }
  }, 30000);

  try {
    let fullResponse = '';
    
    console.log('[HandsFree] Sending message to LLM:', message);
    
    // Mesures de performance
    const startTime = Date.now();
    let firstTokenTime = null;
    let tokenCount = 0;
    let lastTokenTime = Date.now();
    let streamingActive = false;
    
    // Timeout pour détecter si le streaming bloque
    const streamingTimeout = setInterval(() => {
      const timeSinceLastToken = Date.now() - lastTokenTime;
      if (streamingActive && timeSinceLastToken > 30000) {
        console.warn('[HandsFree] Streaming seems stuck, no tokens for 30s');
        clearInterval(streamingTimeout);
      }
    }, 5000);
    
    // Créer un message assistant pour le streaming
    let streamingMessageId = null;
    let streamingMessageEl = null;
    
    // Utiliser le slot 'handsfree' avec le modèle dédié Hands-Free
    // maxTokens adaptatif selon le type de demande
    const result = await sendMessage(message, {
      systemPrompt: ORAL_SYSTEM_PROMPT,
      temperature: 0.7,
      maxTokens: responseConfig.maxTokens // Adaptatif : 200 (court), 400 (moyen), 800 (long)
    }, (token, full) => {
      // Streaming callback - afficher en temps réel
      streamingActive = true;
      lastTokenTime = Date.now();
      
      // Mesure: time-to-first-token
      if (firstTokenTime === null) {
        firstTokenTime = Date.now();
        const ttft = firstTokenTime - startTime;
        console.log(`[HandsFree] Time-to-first-token: ${ttft}ms`);
      }
      
      fullResponse = full;
      tokenCount++;
      console.log('[HandsFree] Streaming token #' + tokenCount + ', full length:', full.length);
      
      // SUPPRIMÉ: TTS chunking pendant le streaming
      // On attend la fin complète de la génération avant de commencer le TTS
      
      // Mettre à jour l'animation des 3 points style ChatGPT
      const generatingEl = document.getElementById('hf-generating');
      if (generatingEl) {
        generatingEl.classList.remove('hidden');
        // Animation cyclique : un point à la fois
        const dotsContainer = generatingEl.querySelector('.flex.gap-1.items-center');
        if (dotsContainer) {
          const dots = dotsContainer.querySelectorAll('span');
          if (dots.length >= 3) {
            const activeIndex = tokenCount % 3;
            dots.forEach((dot, i) => {
              if (i === activeIndex) {
                dot.style.opacity = '1';
                dot.style.transform = 'scale(1.25)';
              } else {
                dot.style.opacity = '0.3';
                dot.style.transform = 'scale(1)';
              }
            });
          }
        }
      }
      
      // Mettre à jour le compteur de tokens
      const tokenCountEl = document.getElementById('hf-token-count');
      if (tokenCountEl) {
        const wordCount = full.split(/\s+/).length;
        tokenCountEl.textContent = `${wordCount} tokens`;
      }
      
      // Mettre à jour le message assistant en streaming dans l'UI
      // Le message assistant sera créé par sendMessage() dans l'historique
      // On met à jour via renderMessages() pour éviter les conflits
      const messagesContainer = document.getElementById('hf-messages');
      if (messagesContainer) {
        // Trouver le dernier message assistant (en cours de streaming)
        const assistantMessages = messagesContainer.querySelectorAll('[data-message-id]');
        let lastAssistantMsg = null;
        for (let i = assistantMessages.length - 1; i >= 0; i--) {
          const msg = assistantMessages[i];
          if (msg.querySelector('.bg-gray-100')) {
            lastAssistantMsg = msg.querySelector('.message-content');
            break;
          }
        }
        
        if (lastAssistantMsg) {
          // Mettre à jour le contenu en streaming
          lastAssistantMsg.innerHTML = parseMarkdown(full) + '<span class="streaming-text animate-pulse">▊</span>';
        } else {
          // Si pas encore créé, render pour créer le message
          renderMessages();
          // Retrouver après render
          setTimeout(() => {
            const assistantMsgs = messagesContainer.querySelectorAll('[data-message-id]');
            for (let i = assistantMsgs.length - 1; i >= 0; i--) {
              const msg = assistantMsgs[i];
              if (msg.querySelector('.bg-gray-100')) {
                const content = msg.querySelector('.message-content');
                if (content) {
                  content.innerHTML = parseMarkdown(full) + '<span class="streaming-text animate-pulse">▊</span>';
                }
                break;
              }
            }
          }, 50);
        }
        
        // Scroll automatique
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 'primary'); // Utiliser le slot primary pour partager l'historique avec le chat
    
    clearInterval(streamingTimeout);

    // Annuler le timeout si on arrive ici
    clearTimeout(timeoutId);
    
    // Si le timeout a été déclenché, ne pas continuer
    if (timeoutTriggered) {
      console.warn('[HandsFree] Timeout was triggered, aborting');
      return;
    }

    // Debug détaillé
    console.log('[HandsFree] sendMessage result:', result);
    console.log('[HandsFree] result.response:', result?.response);
    console.log('[HandsFree] result keys:', Object.keys(result || {}));
    console.log('[HandsFree] fullResponse length:', fullResponse.length);
    console.log('[HandsFree] fullResponse preview:', fullResponse.substring(0, 100));

    // Cacher l'animation de génération
    const generatingEl = document.getElementById('hf-generating');
    if (generatingEl) {
      generatingEl.classList.add('hidden');
    }

    // Utiliser la réponse du résultat ou le streaming
    // sendMessage() retourne { response, sources, documentGroups }
    let responseText = '';
    
    if (result?.response && result.response.trim().length > 0) {
      responseText = result.response;
      console.log('[HandsFree] Using result.response');
    } else if (fullResponse && fullResponse.trim().length > 0) {
      responseText = fullResponse;
      console.log('[HandsFree] Using fullResponse from streaming');
    } else {
      console.error('[HandsFree] No response found in result or streaming');
      console.error('[HandsFree] result:', result);
      console.error('[HandsFree] fullResponse:', fullResponse);
    }
    
    console.log('[HandsFree] Final responseText length:', responseText.length);
    console.log('[HandsFree] Final responseText preview:', responseText.substring(0, 100));

    // Vérifier qu'on a bien une réponse
    if (!responseText || responseText.trim().length === 0) {
      console.warn('[HandsFree] Empty response');
      showError('Réponse vide du LLM. Vérifiez que le modèle est bien chargé.');
      // Retirer le message utilisateur de l'historique si pas de réponse
      const messagesContainer = document.getElementById('hf-messages');
      if (messagesContainer && messagesContainer.lastElementChild) {
        messagesContainer.lastElementChild.remove();
      }
      setState(STATES.LISTENING);
      if (handsFreeEnabled) {
        startListening();
      }
      return;
    }

    // Render messages (affiche message + réponse)
    // Le message assistant devrait déjà être dans l'historique via sendMessage()
    renderMessages();
    
    // Vérifier que l'historique contient bien la réponse
    const chatHistory = getChatHistoryRef('primary');
    const lastMessage = chatHistory && chatHistory[chatHistory.length - 1];
    console.log('[HandsFree] Last message in history:', lastMessage?.role, lastMessage?.content?.substring(0, 50));
    
    if (!lastMessage || lastMessage.role !== 'assistant') {
      console.error('[HandsFree] WARNING: Assistant message not found in history!');
      console.error('[HandsFree] History:', chatHistory);
    }

    // Lire la réponse complète
    if (responseText) {
      // Nettoyer le markdown pour la lecture
      const cleanText = responseText
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]/g, '$1')
        .replace(/\|[^|\n]+\|/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/-{3,}/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      console.log('[HandsFree] Clean text for TTS (full):', cleanText?.length, 'chars');

      if (cleanText) {
        // TTS ne démarre qu'après la fin complète de la génération
        console.log('[HandsFree] Starting TTS for response, length:', cleanText.length);
        console.log('[HandsFree] XTTS available:', useXTTS && !!xttsClient);
        console.log('[HandsFree] Web Speech available:', !!ttsManager);
        
        // Vérifier disponibilité TTS (XTTS ou Web Speech)
        if (!useXTTS && !ttsManager) {
          console.warn('[HandsFree] TTS manager not initialized, initializing now...');
          await initTTS();
        }
        
        // Vérifier qu'on a au moins un TTS disponible
        const hasTTS = (useXTTS && xttsClient) || ttsManager;
        if (hasTTS) {
          setState(STATES.SPEAKING);
          try {
            await speakStreaming(cleanText, (progressText) => {
              console.log('[HandsFree] TTS progress:', progressText.length, 'chars');
            });
          } catch (ttsErr) {
            if (ttsErr !== 'interrupted' && !ttsErr.message?.includes('indisponible')) {
              console.error('[HandsFree] TTS error:', ttsErr);
            }
          }
        } else {
          console.error('[HandsFree] TTS not available after init');
          showError('TTS non disponible. Vérifiez que le serveur XTTS est démarré ou que votre navigateur supporte la synthèse vocale.', true);
        }
      }
      
      // Reprendre l'écoute après TTS (géré par speakStreaming)
    } else {
      console.log('[HandsFree] No response text');
      setState(STATES.LISTENING);
      if (handsFreeEnabled) {
        startListening();
      }
    }
    
    // Log des mesures de performance finales
    const totalTime = Date.now() - startTime;
    console.log(`[HandsFree] Performance: total=${totalTime}ms, ttft=${firstTokenTime ? firstTokenTime - startTime : 'N/A'}ms`);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[HandsFree] Error in sendTranscript:', err);
    showError(`Erreur: ${err.message || 'Erreur inconnue'}`);
    
    // Retirer le message utilisateur de l'historique en cas d'erreur
    const messagesContainer = document.getElementById('hf-messages');
    if (messagesContainer && messagesContainer.lastElementChild) {
      messagesContainer.lastElementChild.remove();
    }
    
    // Cacher l'animation
    const generatingEl = document.getElementById('hf-generating');
    if (generatingEl) {
      generatingEl.classList.add('hidden');
    }
    
    setState(STATES.LISTENING);
    if (handsFreeEnabled) {
      startListening();
    }
  }
}

/**
 * Met à jour l'état
 */
function setState(state) {
  currentState = state;

  const dot = document.getElementById('hf-status-dot');
  const label = document.getElementById('hf-status-label');
  const statusText = document.getElementById('hf-status-text');
  const stateLabel = document.getElementById('hf-state-label');
  const pulseRing = document.getElementById('hf-pulse-ring');
  const micIcon = document.getElementById('hf-mic-icon');

  const configs = {
    [STATES.IDLE]: {
      dot: 'bg-gray-300',
      label: 'En attente',
      status: 'Inactif',
      stateLabel: 'Appuyez pour démarrer',
      pulse: false,
      micColor: 'text-gray-400'
    },
    [STATES.LISTENING]: {
      dot: 'bg-green-500 animate-pulse',
      label: 'Écoute en cours...',
      status: 'Écoute active',
      stateLabel: 'Je vous écoute',
      pulse: true,
      micColor: 'text-green-500'
    },
    [STATES.PROCESSING]: {
      dot: 'bg-yellow-500 animate-pulse',
      label: 'Traitement...',
      status: 'Traitement',
      stateLabel: 'Réflexion...',
      pulse: false,
      micColor: 'text-yellow-500'
    },
    [STATES.SPEAKING]: {
      dot: 'bg-purple-500 animate-pulse',
      label: 'Lecture en cours...',
      status: 'Parle',
      stateLabel: 'Je réponds...',
      pulse: false,
      micColor: 'text-purple-500'
    }
  };

  const config = configs[state];
  if (!config) return;

  if (dot) {
    dot.className = `w-2 h-2 rounded-full ${config.dot}`;
  }
  if (label) {
    label.textContent = config.label;
  }
  if (statusText) {
    statusText.textContent = config.status;
  }
  if (stateLabel) {
    stateLabel.textContent = config.stateLabel;
  }
  // Animation de pulsation pour STT
  const sttPulse = document.getElementById('hf-stt-pulse');
  if (sttPulse) {
    if (state === STATES.LISTENING && config.pulse) {
      sttPulse.className = 'absolute inset-0 rounded-full bg-green-400 opacity-20 animate-ping';
    } else {
      sttPulse.className = 'absolute inset-0 rounded-full opacity-0 pointer-events-none';
    }
  }
  
  if (micIcon) {
    // SVG elements require setAttribute for class
    const classValue = `w-10 h-10 ${config.micColor} transition-colors`;
    if (micIcon.tagName === 'svg') {
      micIcon.setAttribute('class', classValue);
    } else {
      micIcon.className = classValue;
    }
  }

  if (pulseRing) {
    const pulseClass = config.pulse 
      ? 'absolute inset-0 rounded-full bg-green-400 animate-ping opacity-25'
      : 'absolute inset-0 rounded-full opacity-0';
    
    // pulseRing est une div, pas un SVG
    pulseRing.className = pulseClass;
  }
}

/**
 * Met à jour le bouton toggle
 */
function updateToggleButton() {
  const btn = document.getElementById('hf-toggle-btn');
  if (!btn) return;

  if (handsFreeEnabled) {
    btn.className = 'relative w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 transition-all duration-300 flex items-center justify-center shadow-lg shadow-green-500/30';
  } else {
    btn.className = 'relative w-24 h-24 rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-300 flex items-center justify-center group';
  }
}

/**
 * Met à jour le bouton envoyer
 */
function updateSendButton() {
  const btn = document.getElementById('hf-send-btn');
  const transcript = document.getElementById('hf-transcript');
  if (btn && transcript) {
    btn.disabled = !transcript.value.trim();
  }
}

/**
 * Affiche une erreur
 */
function showError(message, recoverable = false) {
  const errorDiv = document.getElementById('hf-error');
  const errorText = document.getElementById('hf-error-text');
  
  if (errorDiv && errorText) {
    // Nettoyer le contenu précédent (supprimer les boutons de réessai existants)
    const existingRetry = errorText.querySelector('.retry-btn');
    if (existingRetry) {
      existingRetry.remove();
    }
    
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
    
    // Ajouter bouton réessai si récupérable
    if (recoverable) {
      const retryBtn = document.createElement('button');
      retryBtn.textContent = 'Réessayer';
      retryBtn.className = 'retry-btn ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors';
      retryBtn.onclick = () => {
        errorDiv.classList.add('hidden');
        if (handsFreeEnabled) {
          startListening();
        }
      };
      errorText.appendChild(retryBtn);
    }
  }
  
  console.error('[HandsFree] Error:', message);
}

/**
 * Cache l'erreur
 */
function hideError() {
  const errorDiv = document.getElementById('hf-error');
  if (errorDiv) {
    errorDiv.classList.add('hidden');
  }
}

/**
 * Affiche l'historique des messages
 */
function renderMessages() {
  const container = document.getElementById('hf-messages');
  if (!container) return;

  const history = getChatHistoryRef('primary');

  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
        <p class="text-sm">Activez le mode Hands-Free pour commencer</p>
        <p class="text-xs mt-1">L'historique du chat est partagé</p>
      </div>
    `;
    return;
  }

  container.innerHTML = history.map((msg, msgIdx) => {
    const isUser = msg.role === 'user';
    return `
      <div class="flex ${isUser ? 'justify-end' : 'justify-start'}" data-message-id="${msg.id}">
        <div class="max-w-[85%] ${isUser ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-900'} rounded-2xl px-4 py-2.5 ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}">
          <div class="text-sm message-content ${isUser ? '' : 'prose prose-sm max-w-none'}">
            ${isUser ? msg.content : parseMarkdown(msg.content || '')}
          </div>
          ${msg.sources?.length ? `
            <div class="mt-2 pt-2 border-t ${isUser ? 'border-purple-500' : 'border-gray-200'}">
              <details class="cursor-pointer">
                <summary class="text-xs ${isUser ? 'text-purple-200' : 'text-gray-500'} font-medium hover:${isUser ? 'text-purple-100' : 'text-gray-700'}">
                  ${msg.sources.length} source(s) - Cliquez pour voir les détails
                </summary>
                <div class="mt-2 space-y-2">
                  ${msg.sources.map((s, i) => `
                    <div class="bg-${isUser ? 'purple' : 'gray'}-50 p-2 rounded-lg border border-${isUser ? 'purple' : 'gray'}-200">
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold ${isUser ? 'text-purple-800' : 'text-gray-700'}">
                          [${i + 1}] ${s.docName || s.source} - Doc${s.docIndex || '?'}:Chunk${s.chunkIndex || '?'}
                        </span>
                        ${s.score ? `<span class="text-xs ${isUser ? 'text-purple-600' : 'text-gray-500'}">${(s.score * 100).toFixed(0)}%</span>` : ''}
                      </div>
                      ${s.text ? `
                        <p class="text-xs ${isUser ? 'text-purple-700' : 'text-gray-600'} line-clamp-2 mb-2">${s.text.substring(0, 150)}${s.text.length > 150 ? '...' : ''}</p>
                      ` : ''}
                      <button 
                        data-source-index="${i}"
                        data-msg-id="${msg.id}"
                        class="chunk-viewer-btn text-xs ${isUser ? 'text-purple-600 hover:text-purple-800' : 'text-blue-600 hover:text-blue-800'} font-medium underline"
                      >
                        Voir le chunk complet →
                      </button>
                    </div>
                  `).join('')}
                </div>
              </details>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  // Attacher les event listeners pour les boutons chunk viewer
  container.querySelectorAll('.chunk-viewer-btn').forEach((btn, btnIdx) => {
    btn.addEventListener('click', () => {
      const sourceIndex = parseInt(btn.getAttribute('data-source-index'));
      const msgElement = btn.closest('[data-message-id]');
      if (!msgElement) return;
      
      const msgId = msgElement.getAttribute('data-message-id');
      const history = getChatHistoryRef('primary');
      const msg = history.find(m => m.id === msgId);
      
      if (msg && msg.sources && msg.sources[sourceIndex]) {
        showChunkViewer(msg.sources[sourceIndex]);
      }
    });
  });

  container.scrollTop = container.scrollHeight;
}

/**
 * Vérifie si le mode Hands-Free est actif
 */
export function isHandsFreeActive() {
  return handsFreeEnabled;
}

/**
 * Stop le TTS (pour raccourci clavier)
 */
export function stopTTS() {
  ttsManager?.stop();
  xttsClient?.stop();
}


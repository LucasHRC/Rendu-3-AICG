/**
 * Panel Hands-Free - Mode vocal complet STT + TTS
 */

import { isSTTSupported, createSpeechRecognition, createSpeechDetector } from '../voice/speechRecognition.js';
import { isTTSSupported, createTTSManager, getVoices, getBestVoicesForLang, SUPPORTED_LANGUAGES } from '../voice/speechSynthesis.js';
import { getKokoroVoices, initKokoroTTS, isKokoroReady } from '../voice/kokoroTTS.js';
import { getChatHistoryRef, sendMessage } from '../llm/chat.js';
import { isModelReady, initWebLLM, getLoadedModel, getOralOptimizedModels } from '../llm/webllm.js';
import { parseMarkdown } from '../utils/markdown.js';

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
let speechDetector = null;
let currentTranscript = '';
let silenceTimeout = null;
const SILENCE_DELAY = 2000; // 2s de silence avant envoi auto
let useKokoroTTS = false; // Utiliser Kokoro TTS ou voix native
let interruptCountdownInterval = null; // Interval pour le compte à rebours d'interruption

// System prompt optimisé pour réponses orales courtes (2-4 phrases max)
const ORAL_SYSTEM_PROMPT = `Tu es un assistant vocal conversationnel. Réponds en français.

RÈGLES STRICTES :
- 2-4 phrases maximum
- Ton oral, direct, clair
- Pas de listes longues
- Si information manque : finir par 1 question courte
- Ne pas afficher de raisonnement interne
- Utilise des expressions naturelles ("ah je vois", "d'accord", "effectivement")

Sois synthétique et percutant. Évite les longues explications.`;

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
  panel.className = 'flex flex-row h-full bg-white rounded-xl border border-gray-200 overflow-hidden';

  const sttSupported = isSTTSupported();
  const ttsSupported = isTTSSupported();

  panel.innerHTML = `
    <!-- Colonne gauche : Micro et contrôles -->
    <div class="flex flex-col w-80 border-r border-gray-200 flex-shrink-0">
      <!-- Header -->
      <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
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

      <!-- Status Indicator -->
      <div id="hf-status-indicator" class="flex-shrink-0 px-4 py-2 bg-gray-50 border-t border-gray-100">
        <div class="flex items-center justify-center gap-2">
          <span id="hf-status-dot" class="w-2 h-2 rounded-full bg-gray-300"></span>
          <span id="hf-status-label" class="text-xs text-gray-500">En attente</span>
        </div>
      </div>
    </div>

    <!-- Colonne droite : Historique des messages -->
    <div class="flex-1 flex flex-col min-w-0">
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
      <div id="hf-messages" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
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

  setTimeout(() => {
    setupHandsFreeEvents(panel);
    initTTS();
    renderMessages();
    // Charger automatiquement le meilleur modèle optimisé pour l'oral
    autoLoadBestOralModel();
  }, 0);

  // Écouter les mises à jour du chat
  window.addEventListener('chat:messageAdded', () => {
    renderMessages();
  });

  // Écouter les changements de modèle
  window.addEventListener('webllm:ready', (e) => {
    if (e.detail?.slot === 'primary') {
      // Modèle chargé, prêt pour Hands-Free
      console.log('[HandsFree] Model ready for conversation');
    }
  });

  return panel;
}

/**
 * Charge automatiquement le meilleur modèle optimisé pour l'oral
 */
async function autoLoadBestOralModel() {
  // Si un modèle est déjà chargé dans primary, on l'utilise
  if (isModelReady('primary')) {
    console.log('[HandsFree] Model already loaded in primary slot');
    return;
  }

  // Récupérer le meilleur modèle optimisé pour l'oral
  const oralModels = getOralOptimizedModels();
  if (oralModels.length === 0) {
    console.warn('[HandsFree] No oral-optimized models available');
    return;
  }

  // Prendre le premier (déjà trié par score oral)
  const bestModel = oralModels[0];
  console.log('[HandsFree] Auto-loading best oral model:', bestModel.name);

  try {
    await initWebLLM(bestModel.id, (pct, text) => {
      console.log(`[HandsFree] Loading: ${pct}% - ${text}`);
    }, 'primary');
    
    console.log('[HandsFree] Best oral model loaded:', bestModel.name);
  } catch (error) {
    console.error('[HandsFree] Failed to auto-load model:', error);
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

  console.log('[HandsFree] Initializing TTS...');

  ttsManager = createTTSManager({
    ...voiceConfig,
    onStart: () => {
      console.log('[HandsFree] TTS onStart callback');
      setState(STATES.SPEAKING);
      // S'assurer que la reconnaissance est arrêtée pendant le TTS
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {
          console.warn('[HandsFree] Error stopping recognition on TTS start:', e);
        }
      }
    },
    onEnd: () => {
      console.log('[HandsFree] TTS onEnd callback, handsFreeEnabled:', handsFreeEnabled);
      // NE PAS redémarrer l'écoute ici car speakStreaming() gère ça après toutes les phrases
      // Seulement si on n'est pas en mode streaming (appel direct à speak)
      if (handsFreeEnabled && currentState === STATES.SPEAKING && !ttsManager.isSpeaking()) {
        // Petit délai avant de reprendre l'écoute
        setTimeout(() => {
          if (handsFreeEnabled && !ttsManager.isSpeaking()) {
            startListening();
          }
        }, 300);
      } else if (!handsFreeEnabled) {
        setState(STATES.IDLE);
      }
    },
    onError: (err) => {
      console.error('[HandsFree] TTS error:', err);
      showError(`Erreur TTS: ${err}`);
      if (handsFreeEnabled) {
        // Redémarrer l'écoute en cas d'erreur
        setTimeout(() => {
          if (handsFreeEnabled) {
            startListening();
          }
        }, 300);
      }
    }
  });

  // Charger les voix disponibles
  await loadVoiceOptions();
  console.log('[HandsFree] TTS initialized');
}

/**
 * Parle en streaming (phrase par phrase) avec bulle animée
 */
async function speakStreaming(text, onSentenceSpoken) {
  if (!ttsManager || !text) return;
  
  // ARRÊTER la reconnaissance vocale avant de parler pour éviter qu'elle capture la voix du TTS
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.warn('[HandsFree] Error stopping recognition before TTS:', e);
    }
  }
  
  // Découper en phrases intelligemment
  const sentences = text.match(/[^.!?]+[.!?]+/g) || 
                    text.match(/[^.!?\n]+[.!?\n]+/g) || 
                    [text];
  
  let spokenText = '';
  let currentSentenceIndex = 0;
  
  // Créer/afficher la bulle de streaming
  const bubble = createStreamingBubble();
  
  for (const sentence of sentences) {
    if (!handsFreeEnabled) break; // Arrêter si mode désactivé
    
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // Mettre à jour la bulle avec la phrase en cours
    updateStreamingBubble(bubble, trimmedSentence, currentSentenceIndex, sentences.length);
    
    // Parler la phrase
    try {
      await ttsManager.speak(trimmedSentence);
      spokenText += trimmedSentence + ' ';
      currentSentenceIndex++;
      
      // Callback de progression
      if (onSentenceSpoken) {
        onSentenceSpoken(spokenText.trim());
      }
    } catch (err) {
      if (err !== 'interrupted') {
        console.error('[HandsFree] TTS streaming error:', err);
      }
      break;
    }
  }
  
  // Cacher la bulle à la fin
  hideStreamingBubble(bubble);
  
  // Redémarrer l'écoute APRÈS la fin complète du TTS
  if (handsFreeEnabled) {
    setTimeout(() => {
      if (handsFreeEnabled && !ttsManager.isSpeaking()) {
        startListening();
      }
    }, 300);
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
    // Vérifier que le modèle est chargé dans primary
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
    
    // Activer automatiquement le mode conversation
    conversationMode = true;
    const conversationToggle = document.getElementById('hf-conversation-mode');
    if (conversationToggle) {
      conversationToggle.checked = true;
    }
    updateConversationModeUI();
    
    // Bip sonore au démarrage
    playStartBeep();
    
    // Démarrer immédiatement l'écoute
    startListening();
  } else {
    stopAll();
  }

  updateToggleButton();
}


/**
 * Démarre l'écoute
 */
function startListening() {
  if (!isSTTSupported()) return;

  hideError();
  speechDetector = createSpeechDetector(1000); // 1 seconde pour l'interruption

  recognition = createSpeechRecognition({
    lang: voiceConfig.lang,
    continuous: true,
    interimResults: true,
    onStart: () => {
      setState(STATES.LISTENING);
    },
    onResult: ({ interim, final, isFinal }) => {
      const interimEl = document.getElementById('hf-interim');
      const transcriptEl = document.getElementById('hf-transcript');

      if (interimEl) {
        interimEl.textContent = interim;
      }

      // INTERRUPTION IMMÉDIATE : Si TTS parle et utilisateur parle, couper TTS immédiatement
      if (currentState === STATES.SPEAKING && ttsManager?.isSpeaking() && (interim.trim().length > 3 || final.trim().length > 3)) {
        console.log('[HandsFree] User interrupting TTS - immediate stop');
        // Couper TTS immédiatement (speechSynthesis.cancel)
        if (ttsManager) {
          ttsManager.stop();
        }
        // Réinitialiser la transcription
        currentTranscript = '';
        if (transcriptEl) transcriptEl.value = '';
        if (interimEl) interimEl.textContent = '';
        // Retirer le message assistant de l'historique si en cours
        const messagesContainer = document.getElementById('hf-messages');
        if (messagesContainer) {
          const lastMsg = messagesContainer.lastElementChild;
          if (lastMsg && lastMsg.querySelector('.bg-gray-100')) {
            lastMsg.remove();
          }
        }
        setState(STATES.LISTENING);
        hideInterruptionCountdown();
        return;
      }
      
      // Si on est en train de traiter, et que l'utilisateur reparle
      if (currentState === STATES.PROCESSING && interim.trim().length > 5) {
        console.log('[HandsFree] User interrupting during processing');
        // Réinitialiser la transcription
        currentTranscript = '';
        if (transcriptEl) transcriptEl.value = '';
        if (interimEl) interimEl.textContent = '';
        // Retirer le message utilisateur de l'historique
        const messagesContainer = document.getElementById('hf-messages');
        if (messagesContainer && messagesContainer.lastElementChild) {
          messagesContainer.lastElementChild.remove();
        }
        setState(STATES.LISTENING);
        return;
      }

      if (isFinal && final) {
        // Ne plus interrompre immédiatement, utiliser le speechDetector avec délai
        // Si on est en train de traiter ou parler, démarrer le compte à rebours
        if (currentState === STATES.PROCESSING || currentState === STATES.SPEAKING) {
          // Vérifier que c'est de la vraie parole
          const hasRealSpeech = final.trim().length > 5 && final.split(/\s+/).length >= 2;
          if (hasRealSpeech) {
            // Démarrer le compte à rebours d'interruption (1 seconde)
            if (!speechDetector?.isSpeaking) {
              speechDetector?.onSpeechStart();
            }
            showInterruptionCountdown();
          }
        }
        
        currentTranscript += (currentTranscript ? ' ' : '') + final.trim();
        if (transcriptEl) {
          transcriptEl.value = currentTranscript;
        }
        if (interimEl) {
          interimEl.textContent = '';
        }
        updateSendButton();
        
        // Mode conversation : reset le timer de silence seulement si on écoute
        if (conversationMode && currentState === STATES.LISTENING) {
          resetSilenceTimer();
        }
      }
      
      // Vérifier interruption après 1 seconde (pour PROCESSING et SPEAKING)
      if ((currentState === STATES.PROCESSING || currentState === STATES.SPEAKING) && speechDetector?.shouldInterrupt()) {
        const text = interim || final || '';
        const hasRealSpeech = text.trim().length > 5 && text.split(/\s+/).length >= 2;
        
        if (hasRealSpeech) {
          console.log('[HandsFree] Interrupting after 1s of speech');
          if (ttsManager?.isSpeaking()) {
            ttsManager.stop();
          }
          currentTranscript = '';
          if (transcriptEl) transcriptEl.value = '';
          if (interimEl) interimEl.textContent = '';
          // Retirer le message utilisateur de l'historique
          const messagesContainer = document.getElementById('hf-messages');
          if (messagesContainer && messagesContainer.lastElementChild) {
            messagesContainer.lastElementChild.remove();
          }
          setState(STATES.LISTENING);
          hideInterruptionCountdown();
        } else {
          speechDetector.reset();
          hideInterruptionCountdown();
        }
      }

      // Vérifier interruption TTS avec délai et validation
      if (ttsManager?.isSpeaking() && speechDetector?.shouldInterrupt()) {
        // VALIDATION : Vérifier que c'est vraiment de la parole (pas juste du bruit)
        const hasRealSpeech = (interim && interim.trim().length > 5) || 
                              (final && final.trim().length > 5);
        
        // Vérifier aussi que ce n'est pas juste du bruit (mots cohérents)
        const text = interim || final || '';
        const hasWords = text.split(/\s+/).length >= 2;
        
        if (hasRealSpeech && hasWords) {
          console.log('[HandsFree] Real speech detected, interrupting TTS after 1s');
          ttsManager.stop();
          setState(STATES.LISTENING);
          hideInterruptionCountdown();
        } else {
          // C'est probablement du bruit, ne pas interrompre
          console.log('[HandsFree] Noise detected, ignoring');
          speechDetector.reset();
          hideInterruptionCountdown();
        }
      }
      
      // Afficher/mettre à jour le compte à rebours d'interruption si parole détectée
      if ((ttsManager?.isSpeaking() || currentState === STATES.PROCESSING) && speechDetector?.isSpeaking && !speechDetector?.shouldInterrupt()) {
        const text = interim || final || '';
        const hasRealSpeech = text.trim().length > 5 && text.split(/\s+/).length >= 2;
        if (hasRealSpeech) {
          const container = document.getElementById('hf-interrupt-countdown');
          if (container && !container.classList.contains('hidden')) {
            updateInterruptionCountdown();
          } else if (container && container.classList.contains('hidden')) {
            showInterruptionCountdown();
          }
        }
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
      
      // Si TTS est en cours OU si on est en train de traiter, démarrer le compte à rebours (1s)
      if (ttsManager?.isSpeaking() || currentState === STATES.PROCESSING) {
        showInterruptionCountdown();
      }
      
      // Ne plus interrompre immédiatement, attendre 1 seconde via le speechDetector
    },
    onSpeechEnd: () => {
      speechDetector?.onSpeechEnd();
      // Cacher le compte à rebours d'interruption
      hideInterruptionCountdown();
      // Mode conversation : démarrer le timer de silence
      if (conversationMode && currentTranscript.trim()) {
        resetSilenceTimer();
      }
    },
    onError: ({ message }) => {
      if (message !== 'Reconnaissance annulée') {
        showError(message);
      }
    },
    onEnd: () => {
      // Redémarrer si toujours actif
      if (handsFreeEnabled && currentState === STATES.LISTENING) {
        setTimeout(() => {
          if (handsFreeEnabled) {
            recognition?.start();
          }
        }, 100);
      }
    }
  });

  recognition.start();
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
  
  let countdown = 2;
  const updateCountdown = () => {
    if (countdownEl) {
      countdownEl.textContent = `Envoi dans ${countdown}s...`;
    }
    countdown--;
    
    if (countdown < 0) {
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
      silenceTimeout = setTimeout(updateCountdown, 1000);
    }
  };
  
  updateCountdown();
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
async function sendTranscript() {
  const transcriptEl = document.getElementById('hf-transcript');
  const message = transcriptEl?.value?.trim() || currentTranscript.trim();

  if (!message) return;

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

  // Afficher le message envoyé dans l'historique AVANT la réponse
  const messagesContainer = document.getElementById('hf-messages');
  if (messagesContainer) {
    // Supprimer le placeholder si présent
    const placeholder = messagesContainer.querySelector('.text-center');
    if (placeholder) {
      placeholder.remove();
    }
    
    const userMsg = document.createElement('div');
    userMsg.className = 'flex justify-end mb-2';
    userMsg.innerHTML = `
      <div class="max-w-[85%] bg-purple-600 text-white rounded-2xl px-4 py-2.5 rounded-br-md">
        <div class="text-sm">${message}</div>
      </div>
    `;
    messagesContainer.appendChild(userMsg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

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
    let firstSpeechTime = null;
    let tokenCount = 0;
    let lastTokenTime = Date.now();
    let streamingActive = false;
    let ttsStarted = false;
    let accumulatedTextForTTS = ''; // Texte accumulé pour TTS chunking
    
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
    // Utiliser le slot 'handsfree' avec le modèle dédié Hands-Free
    const result = await sendMessage(message, {
      systemPrompt: ORAL_SYSTEM_PROMPT,
      temperature: 0.8,
      maxTokens: 150
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
      
      // TTS CHUNKING: Démarrer TTS avant la fin de génération
      // Démarrer dès qu'on a une phrase complète (terminée par . ! ?) et au moins 50 caractères
      if (!ttsStarted && ttsManager && full.length >= 50) {
        const sentences = full.match(/[^.!?]+[.!?]+/g);
        if (sentences && sentences.length > 0) {
          const firstSentence = sentences[0].trim();
          // Si la première phrase fait au moins 20 caractères, démarrer TTS
          if (firstSentence.length >= 20) {
            accumulatedTextForTTS = firstSentence;
            ttsStarted = true;
            firstSpeechTime = Date.now();
            const ttfst = firstSpeechTime - startTime;
            console.log(`[HandsFree] Time-to-first-speech: ${ttfst}ms`);
            
            // Démarrer TTS en arrière-plan (ne pas attendre)
            (async () => {
              try {
                // Nettoyer le markdown pour TTS
                const cleanText = accumulatedTextForTTS
                  .replace(/#{1,6}\s/g, '')
                  .replace(/\*\*/g, '')
                  .replace(/\*([^*]+)\*/g, '$1')
                  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                  .trim();
                
                if (cleanText) {
                  setState(STATES.SPEAKING);
                  await ttsManager.speak(cleanText);
                }
              } catch (ttsErr) {
                if (ttsErr !== 'interrupted') {
                  console.error('[HandsFree] TTS chunking error:', ttsErr);
                }
              }
            })();
          }
        }
      }
      
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
      
      // Mettre à jour le message en streaming dans l'UI
      if (!streamingMessageEl) {
        // Attendre que le message soit créé
        setTimeout(() => {
          const messagesContainer = document.getElementById('hf-messages');
          if (messagesContainer) {
            streamingMessageEl = messagesContainer.querySelector('[data-message-id]')?.querySelector('.message-content');
            if (!streamingMessageEl) {
              // Re-render pour créer le message
              renderMessages();
              streamingMessageEl = messagesContainer.querySelector('[data-message-id]')?.querySelector('.message-content');
            }
          }
        }, 100);
      }
      
      if (streamingMessageEl) {
        // Afficher le texte en streaming avec markdown
        streamingMessageEl.innerHTML = parseMarkdown(full) + '<span class="streaming-text"></span>';
        
        // Scroll automatique
        const messagesContainer = document.getElementById('hf-messages');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
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
    if (ttsManager && responseText) {
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
        // Si TTS a déjà commencé en chunking, arrêter et relire tout
        if (ttsStarted && ttsManager.isSpeaking()) {
          console.log('[HandsFree] Stopping partial TTS to read full message');
          ttsManager.stop();
          // Petit délai pour s'assurer que le TTS est bien arrêté
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        setState(STATES.SPEAKING);
        try {
          await speakStreaming(cleanText, (progressText) => {
            console.log('[HandsFree] TTS progress:', progressText.length, 'chars');
          });
        } catch (ttsErr) {
          if (ttsErr !== 'interrupted') {
            console.error('[HandsFree] TTS error:', ttsErr);
          }
        }
      }
      
      // Reprendre l'écoute après TTS
      if (handsFreeEnabled) {
        startListening();
      }
    } else {
      console.log('[HandsFree] No TTS manager or no response');
      setState(STATES.LISTENING);
      if (handsFreeEnabled) {
        startListening();
      }
    }
    
    // Log des mesures de performance finales
    const totalTime = Date.now() - startTime;
    console.log(`[HandsFree] Performance: total=${totalTime}ms, ttft=${firstTokenTime ? firstTokenTime - startTime : 'N/A'}ms, ttfst=${firstSpeechTime ? firstSpeechTime - startTime : 'N/A'}ms`);
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
function showError(message) {
  const errorDiv = document.getElementById('hf-error');
  const errorText = document.getElementById('hf-error-text');
  if (errorDiv && errorText) {
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
  }
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

  container.innerHTML = history.map(msg => {
    const isUser = msg.role === 'user';
    return `
      <div class="flex ${isUser ? 'justify-end' : 'justify-start'}" data-message-id="${msg.id}">
        <div class="max-w-[85%] ${isUser ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-900'} rounded-2xl px-4 py-2.5 ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}">
          <div class="text-sm message-content ${isUser ? '' : 'prose prose-sm max-w-none'}">
            ${isUser ? msg.content : parseMarkdown(msg.content || '')}
          </div>
          ${msg.sources?.length ? `
            <div class="mt-2 pt-2 border-t ${isUser ? 'border-purple-500' : 'border-gray-200'}">
              <p class="text-xs ${isUser ? 'text-purple-200' : 'text-gray-500'}">Sources: ${msg.sources.map(s => s.docName || s.source).join(', ')}</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

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
}


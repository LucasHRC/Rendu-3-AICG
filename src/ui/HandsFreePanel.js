/**
 * Panel Hands-Free - Mode vocal simplifie STT (Whisper) + TTS (Web Speech)
 */

import { getChatHistoryRef, sendMessage, addMessage } from '../llm/chat.js';
import { isModelReady, getLoadedModel, MODEL_CATALOG } from '../llm/webllm.js';
import { parseMarkdown } from '../utils/markdown.js';
import { state } from '../state/state.js';
import { buildCompactContext } from '../rag/manifestBuilder.js';

// Etats possibles
const STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking'
};

let currentState = STATES.IDLE;
let handsFreeEnabled = false;
let conversationMode = false;
let whisperPipeline = null;
let mediaRecorder = null;
let audioChunks = [];
let silenceTimeout = null;
const SILENCE_DELAY = 3000;

// System prompt optimise pour reponses orales
const ORAL_SYSTEM_PROMPT = `Tu es un assistant vocal conversationnel. Reponds en francais, de maniere ORALE et NATURELLE.

REGLES:
- Phrases completes, pas de listes ou tableaux
- Longueur adaptee a la complexite de la question
- Liaisons naturelles entre les phrases
- Citations des sources [Doc1] si pertinent

STYLE ORAL:
- Expressions naturelles: "ah je vois", "effectivement", "d'accord"
- Transitions fluides: "d'abord", "ensuite", "par ailleurs"
- Ponctuation pour les pauses naturelles`;

// Config par defaut
let voiceConfig = {
  lang: 'fr-FR',
  rate: 1.0,
  pitch: 1.0
};

/**
 * Cree le panel Hands-Free
 */
export function createHandsFreePanel() {
  const panel = document.createElement('div');
  panel.id = 'handsfree-panel';
  panel.className = 'flex flex-col md:flex-row max-h-[85vh] bg-white rounded-xl border border-gray-200 overflow-hidden';

  panel.innerHTML = `
    <!-- Colonne gauche : Controles -->
    <div class="flex flex-col w-full md:w-80 border-r border-gray-200 flex-shrink-0">
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
      
      <!-- Bouton micro principal -->
      <div class="flex-shrink-0 p-6 flex flex-col items-center">
        <button id="hf-mic-btn" class="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center hover:from-purple-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
          </svg>
        </button>
        <p id="hf-mic-status" class="mt-3 text-sm text-gray-600">Cliquez pour parler</p>
      </div>

      <!-- Mode conversation -->
      <div class="flex-shrink-0 px-4 pb-4">
        <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
          <input type="checkbox" id="hf-conversation-mode" class="w-4 h-4 text-purple-600 rounded focus:ring-purple-500">
          <div>
            <span class="text-sm font-medium text-gray-700">Mode conversation</span>
            <p class="text-xs text-gray-500">Detection automatique de la fin de parole</p>
          </div>
        </label>
      </div>

      <!-- Whisper loading status -->
      <div id="whisper-status" class="flex-shrink-0 px-4 pb-4 hidden">
        <div class="p-3 bg-blue-50 rounded-lg">
          <div class="flex items-center gap-2">
            <div class="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span id="whisper-status-text" class="text-sm text-blue-700">Chargement Whisper...</span>
          </div>
          <div class="mt-2 w-full bg-blue-200 rounded-full h-1">
            <div id="whisper-progress-bar" class="bg-blue-600 h-1 rounded-full transition-all" style="width: 0%"></div>
          </div>
        </div>
      </div>

      <!-- Modele LLM -->
      <div class="flex-shrink-0 px-4 pb-4">
        <div id="hf-model-status" class="p-3 bg-gray-50 rounded-lg">
          <div class="text-xs text-gray-500 mb-1">Modele LLM</div>
          <div id="hf-model-name" class="text-sm font-medium text-gray-700">Non charge</div>
        </div>
      </div>

      <!-- Statistiques -->
      <div class="flex-shrink-0 px-4 pb-4">
        <div class="grid grid-cols-2 gap-2 text-center">
          <div class="p-2 bg-gray-50 rounded-lg">
            <div id="hf-stat-messages" class="text-lg font-bold text-purple-600">0</div>
            <div class="text-xs text-gray-500">Messages</div>
          </div>
          <div class="p-2 bg-gray-50 rounded-lg">
            <div id="hf-stat-duration" class="text-lg font-bold text-indigo-600">0s</div>
            <div class="text-xs text-gray-500">Duree</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Colonne droite : Historique -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 class="text-sm font-semibold text-gray-700">Conversation</h3>
      </div>
      
      <div id="hf-chat-container" class="flex-1 overflow-y-auto p-4 space-y-4">
        <div class="text-center text-gray-400 text-sm py-8">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <p>Appuyez sur le micro pour commencer</p>
          <p class="text-xs mt-1">STT: Whisper | TTS: Web Speech</p>
        </div>
      </div>
    </div>
  `;

  // Setup event listeners
  setTimeout(() => setupEventListeners(panel), 0);

  return panel;
}

/**
 * Configure les event listeners
 */
function setupEventListeners(panel) {
  const micBtn = panel.querySelector('#hf-mic-btn');
  const conversationToggle = panel.querySelector('#hf-conversation-mode');

  micBtn?.addEventListener('click', toggleListening);
  conversationToggle?.addEventListener('change', (e) => {
    conversationMode = e.target.checked;
    updateStatus(conversationMode ? 'Mode conversation actif' : 'Mode manuel');
  });

  // Mettre a jour le statut du modele
  updateModelStatus();
  
  // Ecouter les changements de modele
  window.addEventListener('webllm:ready', updateModelStatus);
}

/**
 * Met a jour le statut du modele LLM
 */
function updateModelStatus() {
  const modelNameEl = document.getElementById('hf-model-name');
  if (!modelNameEl) return;

  if (isModelReady()) {
    const modelId = getLoadedModel();
    const model = MODEL_CATALOG.find(m => m.id === modelId);
    modelNameEl.textContent = model?.name || modelId || 'Charge';
    modelNameEl.className = 'text-sm font-medium text-green-700';
  } else {
    modelNameEl.textContent = 'Non charge';
    modelNameEl.className = 'text-sm font-medium text-gray-500';
  }
}

/**
 * Bascule l'ecoute
 */
async function toggleListening() {
  if (currentState === STATES.LISTENING) {
    stopListening();
  } else if (currentState === STATES.IDLE) {
    await startListening();
  }
}

/**
 * Demarre l'ecoute avec Whisper
 */
async function startListening() {
  // Verifier que le modele LLM est charge
  if (!isModelReady()) {
    updateStatus('Chargez un modele LLM d\'abord');
    return;
  }

  // Charger Whisper si necessaire
  if (!whisperPipeline) {
    await loadWhisper();
  }

  if (!whisperPipeline) {
    updateStatus('Erreur chargement Whisper');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      await processAudio();
    };

    mediaRecorder.start();
    currentState = STATES.LISTENING;
    updateMicButton(true);
    updateStatus('Parlez maintenant...');

    // Mode conversation: detection silence
    if (conversationMode) {
      silenceTimeout = setTimeout(() => {
        if (currentState === STATES.LISTENING) {
          stopListening();
        }
      }, SILENCE_DELAY);
    }

  } catch (error) {
    console.error('Erreur micro:', error);
    updateStatus('Erreur acces microphone');
  }
}

/**
 * Arrete l'ecoute
 */
function stopListening() {
  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
  }

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  currentState = STATES.PROCESSING;
  updateMicButton(false);
  updateStatus('Traitement...');
}

/**
 * Traite l'audio enregistre avec Whisper
 */
async function processAudio() {
  if (audioChunks.length === 0) {
    currentState = STATES.IDLE;
    updateStatus('Aucun audio capture');
    return;
  }

  try {
    updateStatus('Transcription Whisper...');

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const audioBuffer = await audioBlob.arrayBuffer();
    
    // Convertir en format audio compatible
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const decodedAudio = await audioContext.decodeAudioData(audioBuffer);
    const audioData = decodedAudio.getChannelData(0);

    // Transcrire avec Whisper
    const result = await whisperPipeline(audioData, {
      language: 'french',
      task: 'transcribe'
    });

    const transcript = result.text?.trim();

    if (!transcript) {
      currentState = STATES.IDLE;
      updateStatus('Aucune parole detectee');
      return;
    }

    // Afficher le message utilisateur
    addMessageToChat('user', transcript);
    incrementMessageCount();

    // Generer la reponse
    await generateResponse(transcript);

  } catch (error) {
    console.error('Erreur traitement audio:', error);
    updateStatus('Erreur transcription');
    currentState = STATES.IDLE;
  }
}

/**
 * Genere une reponse avec le LLM
 */
async function generateResponse(userMessage) {
  currentState = STATES.PROCESSING;
  updateStatus('Generation reponse...');

  try {
    // Construire le contexte RAG
    const context = await buildCompactContext(userMessage, 5);

    // Envoyer au LLM
    const response = await sendMessage(userMessage, {
      systemPrompt: ORAL_SYSTEM_PROMPT,
      context: context,
      temperature: 0.7,
      maxTokens: 512
    });

    // Afficher la reponse
    addMessageToChat('assistant', response);
    incrementMessageCount();

    // Lire la reponse avec TTS
    await speakResponse(response);

    // Mode conversation: repartir en ecoute
    if (conversationMode) {
      currentState = STATES.IDLE;
      setTimeout(() => startListening(), 500);
    } else {
      currentState = STATES.IDLE;
      updateStatus('Pret');
    }

  } catch (error) {
    console.error('Erreur generation:', error);
    updateStatus('Erreur generation');
    currentState = STATES.IDLE;
  }
}

/**
 * Lit la reponse avec Web Speech TTS
 */
async function speakResponse(text) {
  if (!('speechSynthesis' in window)) {
    return;
  }

  currentState = STATES.SPEAKING;
  updateStatus('Lecture...');

  return new Promise((resolve) => {
    // Nettoyer le texte pour TTS
    const cleanText = text
      .replace(/\[Doc\d+\]/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = voiceConfig.lang;
    utterance.rate = voiceConfig.rate;
    utterance.pitch = voiceConfig.pitch;

    // Choisir une voix francaise
    const voices = speechSynthesis.getVoices();
    const frenchVoice = voices.find(v => v.lang.startsWith('fr'));
    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    utterance.onend = () => {
      currentState = STATES.IDLE;
      updateStatus('Pret');
      resolve();
    };

    utterance.onerror = () => {
      currentState = STATES.IDLE;
      updateStatus('Erreur TTS');
      resolve();
    };

    speechSynthesis.speak(utterance);
  });
}

/**
 * Charge le modele Whisper
 */
async function loadWhisper() {
  const statusDiv = document.getElementById('whisper-status');
  const statusText = document.getElementById('whisper-status-text');
  const progressBar = document.getElementById('whisper-progress-bar');

  if (statusDiv) statusDiv.classList.remove('hidden');
  if (statusText) statusText.textContent = 'Chargement Whisper...';

  try {
    const { pipeline } = await import('@xenova/transformers');
    
    whisperPipeline = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base',
      {
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.progress) {
            const pct = Math.round(progress.progress);
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (statusText) statusText.textContent = `Whisper: ${pct}%`;
          }
        }
      }
    );

    if (statusDiv) statusDiv.classList.add('hidden');
    updateStatus('Whisper pret');

  } catch (error) {
    console.error('Erreur chargement Whisper:', error);
    if (statusText) statusText.textContent = 'Erreur chargement Whisper';
    throw error;
  }
}

/**
 * Ajoute un message au chat
 */
function addMessageToChat(role, content) {
  const container = document.getElementById('hf-chat-container');
  if (!container) return;

  // Supprimer le placeholder
  const placeholder = container.querySelector('.text-center');
  if (placeholder) placeholder.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;

  const bubble = document.createElement('div');
  bubble.className = `max-w-[80%] p-3 rounded-lg ${
    role === 'user' 
      ? 'bg-purple-600 text-white rounded-br-none' 
      : 'bg-gray-100 text-gray-800 rounded-bl-none'
  }`;

  if (role === 'assistant') {
    bubble.innerHTML = parseMarkdown(content);
  } else {
    bubble.textContent = content;
  }

  messageDiv.appendChild(bubble);
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Met a jour le bouton micro
 */
function updateMicButton(isListening) {
  const btn = document.getElementById('hf-mic-btn');
  const status = document.getElementById('hf-mic-status');
  
  if (!btn) return;

  if (isListening) {
    btn.className = 'w-24 h-24 rounded-full bg-red-500 text-white flex items-center justify-center animate-pulse shadow-lg';
    if (status) status.textContent = 'Ecoute en cours...';
  } else {
    btn.className = 'w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center hover:from-purple-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl';
    if (status) status.textContent = 'Cliquez pour parler';
  }
}

/**
 * Met a jour le statut
 */
function updateStatus(text) {
  const statusEl = document.getElementById('hf-status-text');
  if (statusEl) statusEl.textContent = text;
}

/**
 * Incremente le compteur de messages
 */
function incrementMessageCount() {
  const el = document.getElementById('hf-stat-messages');
  if (el) {
    const current = parseInt(el.textContent) || 0;
    el.textContent = current + 1;
  }
}

/**
 * Verifie si le mode Hands-Free est actif
 */
export function isHandsFreeEnabled() {
  return handsFreeEnabled;
}

/**
 * Alias pour compatibilite - verifie si le mode est actif
 */
export function isHandsFreeActive() {
  return handsFreeEnabled;
}

/**
 * Active/desactive le mode Hands-Free
 */
export function setHandsFreeEnabled(enabled) {
  handsFreeEnabled = enabled;
  if (!enabled && currentState === STATES.LISTENING) {
    stopListening();
  }
}

/**
 * Toggle le mode Hands-Free
 */
export function toggleHandsFree() {
  handsFreeEnabled = !handsFreeEnabled;
  const toggleBtn = document.getElementById('hf-toggle');
  if (toggleBtn) {
    toggleBtn.click();
  }
}

/**
 * Arrete la synthese vocale
 */
export function stopTTS() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

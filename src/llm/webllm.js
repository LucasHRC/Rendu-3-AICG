/**
 * Module WebLLM - Support multi-modèles pour comparaison
 */

import { addLog } from '../state/state.js';

// Support 2 engines pour comparaison
const engines = {
  primary: null,
  secondary: null
};

const loadingState = {
  primary: false,
  secondary: false
};

const loadedModels = {
  primary: null,
  secondary: null
};

// Catalogue des modèles (<4GB) - Llama + concurrents qualité rédactionnelle
export const MODEL_CATALOG = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    size: '~700MB',
    speed: 'Rapide',
    quality: 'Bon',
    color: 'blue'
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    size: '~1.5GB',
    speed: 'Moyen',
    quality: 'Très bon',
    color: 'purple',
    recommended: true
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B',
    size: '~1.8GB',
    speed: 'Moyen',
    quality: 'Excellent',
    color: 'green'
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi 3.5 Mini',
    size: '~2.3GB',
    speed: 'Moyen',
    quality: 'Excellent',
    color: 'orange'
  },
  {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    name: 'Mistral 7B',
    size: '~3.8GB',
    speed: 'Lent',
    quality: 'Top',
    color: 'red'
  }
];

/**
 * Initialise WebLLM avec le modele specifie
 * @param {string} modelId - ID du modele
 * @param {Function} onProgress - Callback progression
 * @param {string} slot - 'primary' ou 'secondary'
 */
export async function initWebLLM(modelId, onProgress = () => {}, slot = 'primary') {
  if (loadingState[slot]) {
    addLog('warning', `Slot ${slot} en cours de chargement...`);
    return false;
  }

  // Verifier WebGPU
  if (!navigator.gpu) {
    addLog('error', 'WebGPU non disponible');
    throw new Error('WebGPU requis pour WebLLM');
  }

  loadingState[slot] = true;
  addLog('info', `Chargement ${slot}: ${modelId}...`);

  try {
    let attempts = 0;
    while (!window.webllm && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!window.webllm) {
      throw new Error('WebLLM non charge depuis CDN');
    }

    const webllm = window.webllm;

    engines[slot] = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        const pct = Math.round(progress.progress * 100);
        onProgress(pct, progress.text);
      }
    });

    loadedModels[slot] = modelId;
    loadingState[slot] = false;
    
    window.dispatchEvent(new CustomEvent('webllm:ready', { detail: { slot, modelId } }));
    addLog('success', `${slot} pret: ${modelId}`);
    
    return true;

  } catch (error) {
    loadingState[slot] = false;
    addLog('error', `Echec ${slot}: ${error.message}`);
    throw error;
  }
}

/**
 * Verifie si un slot a un modele pret
 */
export function isModelReady(slot = 'primary') {
  return engines[slot] !== null;
}

/**
 * Verifie si un slot est en chargement
 */
export function isModelLoading(slot = 'primary') {
  return loadingState[slot];
}

/**
 * Retourne l'engine d'un slot
 */
export function getEngine(slot = 'primary') {
  return engines[slot];
}

/**
 * Retourne le modele charge d'un slot
 */
export function getLoadedModel(slot = 'primary') {
  return loadedModels[slot];
}

/**
 * Genere une completion avec streaming
 */
export async function generateCompletion(messages, options = {}, onToken = () => {}, slot = 'primary') {
  const engine = engines[slot];
  if (!engine) {
    throw new Error(`Modele non charge (slot: ${slot})`);
  }

  const {
    temperature = 0.7,
    max_tokens = 1024,
    top_p = 0.95
  } = options;

  let fullResponse = '';

  try {
    const asyncGenerator = await engine.chat.completions.create({
      messages,
      temperature,
      max_tokens,
      top_p,
      stream: true
    });

    for await (const chunk of asyncGenerator) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullResponse += delta;
        onToken(delta, fullResponse);
      }
    }

    return fullResponse;

  } catch (error) {
    addLog('error', `Erreur generation (${slot}): ${error.message}`);
    throw error;
  }
}

/**
 * Reset le chat d'un slot
 */
export async function resetChat(slot = 'primary') {
  if (engines[slot]) {
    await engines[slot].resetChat();
    addLog('info', `Chat reset (${slot})`);
  }
}

/**
 * Verifie si le mode dual est actif
 */
export function isDualMode() {
  return engines.primary !== null && engines.secondary !== null;
}

// Debug global
if (typeof window !== 'undefined') {
  window.webllmModule = {
    initWebLLM,
    isModelReady,
    isModelLoading,
    getEngine,
    getLoadedModel,
    generateCompletion,
    resetChat,
    isDualMode,
    MODEL_CATALOG
  };
}

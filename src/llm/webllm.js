/**
 * Module WebLLM - Support multi-modèles pour comparaison
 */

import { addLog } from '../state/state.js';

// Modèles dédiés par mode
export const CHAT_MODEL = null; // Le chat utilise le modèle sélectionné par l'utilisateur
export const HANDS_FREE_MODEL = 'Qwen 4B Instruct'; // Modèle dédié Hands-Free (string exact comme demandé)

// Support 2 engines pour comparaison
const engines = {
  primary: null,
  secondary: null,
  handsfree: null // Slot dédié pour Hands-Free
};

const loadingState = {
  primary: false,
  secondary: false,
  handsfree: false
};

const loadedModels = {
  primary: null,
  secondary: null,
  handsfree: null
};

// Catalogue des modèles avec notation sur 5 critères
// Scores: quality, coherence, agentic (positifs /2), latency, context (négatifs /2)
export const MODEL_CATALOG = [
  {
    id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.1 8B',
    size: 6.1,
    params: '8B',
    scores: { quality: 2.0, coherence: 1.8, agentic: 1.9, latency: 1.5, context: 1.8 },
    agentCompatible: true,
    recommended: true
  },
  {
    id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
    name: 'DeepSeek R1 7B',
    size: 5.1,
    params: '7B',
    scores: { quality: 1.9, coherence: 1.9, agentic: 1.8, latency: 1.5, context: 1.7 },
    agentCompatible: true,
    recommended: false
  },
  {
    id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
    name: 'Hermes 3 8B',
    size: 4.9,
    params: '8B',
    scores: { quality: 1.8, coherence: 1.7, agentic: 2.0, latency: 1.5, context: 1.5 },
    agentCompatible: true,
    recommended: false
  },
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 7B',
    size: 5.1,
    params: '7B',
    scores: { quality: 1.8, coherence: 1.7, agentic: 1.6, latency: 1.6, context: 1.6 },
    agentCompatible: true,
    recommended: false
  },
  {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    name: 'Mistral 7B',
    size: 4.6,
    params: '7B',
    scores: { quality: 1.7, coherence: 1.6, agentic: 1.5, latency: 1.6, context: 1.6 },
    agentCompatible: true,
    recommended: false
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi 3.5 Mini',
    size: 3.7,
    params: '3.8B',
    scores: { quality: 1.6, coherence: 1.5, agentic: 1.4, latency: 1.7, context: 1.3 },
    agentCompatible: true,
    recommended: false,
    oralOptimized: true
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B',
    size: 2.5,
    params: '3B',
    scores: { quality: 1.4, coherence: 1.3, agentic: 1.2, latency: 1.8, context: 0.8 },
    agentCompatible: true,
    recommended: false,
    oralOptimized: true
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    size: 2.3,
    params: '3B',
    scores: { quality: 1.3, coherence: 1.3, agentic: 1.2, latency: 1.8, context: 0.6 },
    agentCompatible: true,
    recommended: true,
    oralOptimized: true
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    size: 0.9,
    params: '1B',
    scores: { quality: 1.0, coherence: 1.0, agentic: 0.8, latency: 2.0, context: 0.2 },
    agentCompatible: false,
    recommended: false,
    oralOptimized: true
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B',
    size: 0.9,
    params: '0.5B',
    scores: { quality: 0.9, coherence: 0.9, agentic: 0.6, latency: 2.0, context: 0.1 },
    agentCompatible: false,
    recommended: false
  }
];

/**
 * Calcule le score total d'un modèle (/10)
 */
export function calculateTotalScore(scores) {
  return scores.quality + scores.coherence + scores.agentic + scores.latency + scores.context;
}

/**
 * Retourne la couleur selon le score
 */
export function getScoreColor(score) {
  if (score >= 8) return '#22c55e'; // vert
  if (score >= 6) return '#eab308'; // jaune
  return '#ef4444'; // rouge
}

/**
 * Retourne les modèles triés par score décroissant
 */
export function getSortedModels() {
  return [...MODEL_CATALOG].sort((a, b) => 
    calculateTotalScore(b.scores) - calculateTotalScore(a.scores)
  );
}

/**
 * Retourne les modèles optimisés pour l'oral (4-5B max)
 * Triés par score oral (latence + qualité)
 */
export function getOralOptimizedModels() {
  return MODEL_CATALOG
    .filter(m => {
      const paramCount = parseFloat(m.params.replace('B', ''));
      return m.oralOptimized && paramCount <= 5;
    })
    .sort((a, b) => {
      // Trier par score oral (latence + qualité)
      const scoreA = a.scores.latency + a.scores.quality;
      const scoreB = b.scores.latency + b.scores.quality;
      return scoreB - scoreA;
    });
}

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

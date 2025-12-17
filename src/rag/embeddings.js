/**
 * Module d'embeddings avec Transformers.js
 * Utilise le modèle Xenova/all-MiniLM-L6-v2 (384 dimensions)
 */

import { addLog } from '../state/state.js';

let embeddingPipeline = null;
let isModelLoading = false;
let transformersModule = null;

/**
 * Charge le module Transformers.js (attend qu'il soit disponible globalement)
 */
async function loadTransformersJS() {
  if (transformersModule) return transformersModule;
  
  addLog('info', 'Loading Transformers.js library...');
  
  // Attendre que Transformers.js soit chargé globalement
  let attempts = 0;
  while (!window.TransformersJS && attempts < 100) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  
  if (!window.TransformersJS) {
    throw new Error('Transformers.js failed to load from CDN');
  }
  
  transformersModule = window.TransformersJS;
  addLog('success', 'Transformers.js library loaded');
  return transformersModule;
}

/**
 * Initialise le modèle d'embedding
 * @param {Function} onProgress - Callback de progression (0-100)
 * @returns {Promise<boolean>} - true si succès
 */
export async function initEmbeddingModel(onProgress = () => {}) {
  if (embeddingPipeline) {
    addLog('info', 'Embedding model already loaded');
    return true;
  }

  if (isModelLoading) {
    addLog('warning', 'Model is already loading...');
    return false;
  }

  isModelLoading = true;
  
  try {
    // Charger Transformers.js
    const transformers = await loadTransformersJS();
    
    addLog('info', 'Loading embedding model: Xenova/all-MiniLM-L6-v2');

    // Charger le pipeline avec callback de progression
    embeddingPipeline = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: (progress) => {
        if (progress.status === 'progress' && progress.progress) {
          onProgress(Math.round(progress.progress));
        }
        if (progress.status === 'ready') {
          onProgress(100);
        }
      }
    });

    isModelLoading = false;
    addLog('success', 'Embedding model loaded successfully (384 dimensions)');
    onProgress(100);
    return true;

  } catch (error) {
    isModelLoading = false;
    addLog('error', `Failed to load embedding model: ${error.message}`);
    throw error;
  }
}

/**
 * Génère un embedding pour un texte
 * @param {string} text - Le texte à encoder
 * @returns {Promise<Float32Array>} - Vecteur 384D
 */
export async function generateEmbedding(text) {
  if (!embeddingPipeline) {
    throw new Error('Embedding model not initialized. Call initEmbeddingModel() first.');
  }

  // Limiter la longueur du texte (max 512 tokens environ)
  const truncatedText = text.slice(0, 2000);

  const output = await embeddingPipeline(truncatedText, {
    pooling: 'mean',
    normalize: true
  });

  // Convertir en Float32Array
  return new Float32Array(output.data);
}

/**
 * Génère des embeddings pour une liste de chunks
 * @param {Array} chunks - Liste des chunks à encoder
 * @param {Function} onProgress - Callback (current, total)
 * @returns {Promise<Array<{chunkId: string, vector: Float32Array}>>}
 */
export async function generateEmbeddingsForChunks(chunks, onProgress = () => {}) {
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    try {
      const vector = await generateEmbedding(chunk.text);
      results.push({
        chunkId: chunk.id,
        vector: vector
      });
      onProgress(i + 1, chunks.length);
    } catch (error) {
      addLog('error', `Failed to embed chunk ${chunk.id}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Vérifie si le modèle est chargé
 * @returns {boolean}
 */
export function isModelLoaded() {
  return embeddingPipeline !== null;
}

/**
 * Vérifie si le modèle est en cours de chargement
 * @returns {boolean}
 */
export function isModelCurrentlyLoading() {
  return isModelLoading;
}


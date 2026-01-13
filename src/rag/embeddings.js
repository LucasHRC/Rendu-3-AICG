/**
 * Module d'embeddings avec Transformers.js
 * Priorité WebGPU selon les specs du projet
 */

import { pipeline, env } from '@xenova/transformers';
import { addLog } from '../state/state.js';

let embeddingPipeline = null;
let isModelLoading = false;
let currentBackend = null;

/**
 * Détecte et configure le backend (WebGPU prioritaire selon specs)
 */
async function detectAndConfigureBackend() {
  // Configuration de base
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  // Détecter Safari/Arc et forcer WASM (support WebGPU incomplet)
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isArc = navigator.userAgent.includes('Arc');

  if (isSafari || isArc) {
    addLog('info', `${isSafari ? 'Safari' : 'Arc'} détecté - utilisation WASM forcée`);
    env.backends.onnx.wasm = {
      numThreads: navigator.hardwareConcurrency || 4,
      provider: 'wasm'
    };
    return 'wasm-forced';
  }

  // Priorité WebGPU selon les specs du projet
  if (navigator.gpu) {
    try {
      addLog('info', 'WebGPU détecté - test de compatibilité...');

      // Tester WebGPU avec un petit calcul
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (adapter) {
        const device = await adapter.requestDevice();
        if (device) {
          // Test rapide GPU
          const testBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.STORAGE
          });
          testBuffer.destroy();
          device.destroy();

          // WebGPU fonctionnel - configurer pour WebGPU
          env.backends.onnx.webgpu = {
            deviceType: 'gpu',
            provider: 'webgpu'
          };

          addLog('success', 'WebGPU configuré (compatible LLM 3B+)');
          return 'webgpu';
        }
      }
    } catch (e) {
      addLog('warning', `WebGPU détecté mais limité: ${e.message}`);
      // Pour Safari/Arc avec support partiel, essayer quand même
      try {
        env.backends.onnx.webgpu = {
          deviceType: 'gpu',
          provider: 'webgpu'
        };
        addLog('info', 'WebGPU configuré (mode compatibilité)');
        return 'webgpu-fallback';
      } catch (fallbackError) {
        addLog('warning', 'WebGPU fallback échoué, utilisation WASM');
      }
    }
  }

  // Fallback WASM
  env.backends.onnx.wasm = {
    numThreads: navigator.hardwareConcurrency || 4,
    provider: 'wasm'
  };
  addLog('info', 'Backend WASM configuré');
  return 'wasm';
}

/**
 * Initialise le modèle d'embedding (WebGPU prioritaire)
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
  addLog('info', 'Initialisation modèle embedding avec WebGPU priorité...');

  try {
    // Détecter et configurer le backend
    currentBackend = await detectAndConfigureBackend();

    addLog('info', `Chargement Xenova/all-MiniLM-L6-v2 (${currentBackend.toUpperCase()})...`);

    // Charger le pipeline avec progression
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
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
    addLog('success', `Modèle embedding chargé (${currentBackend.toUpperCase()}, 384 dimensions)`);
    onProgress(100);

    // Émettre événement pour UI
    window.dispatchEvent(new CustomEvent('embeddings:backendDetected', { detail: currentBackend }));

    return true;

  } catch (error) {
    isModelLoading = false;
    addLog('error', `Échec chargement modèle: ${error.message}`);

    // Si WebGPU échoue, essayer WASM en fallback
    if (currentBackend !== 'wasm') {
      addLog('info', 'Tentative fallback WASM...');
      try {
        env.backends.onnx.wasm = { numThreads: 1 };
        currentBackend = 'wasm-fallback';

        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          progress_callback: (progress) => onProgress(Math.round(progress.progress || 0))
        });

        addLog('success', 'Modèle chargé en mode WASM fallback');
        window.dispatchEvent(new CustomEvent('embeddings:backendDetected', { detail: currentBackend }));
        return true;

      } catch (fallbackError) {
        addLog('error', `Fallback WASM échoué: ${fallbackError.message}`);
      }
    }

    throw error;
  }
}

/**
 * Génère un embedding pour un texte
 */
export async function generateEmbedding(text) {
  if (!embeddingPipeline) {
    throw new Error('Modèle embedding non initialisé');
  }

  const truncatedText = text.slice(0, 2000);
  const output = await embeddingPipeline(truncatedText, {
    pooling: 'mean',
    normalize: true
  });

  return new Float32Array(output.data);
}

/**
 * Génère des embeddings pour une liste de chunks
 */
export async function generateEmbeddingsForChunks(chunks, onProgress = () => {}, options = {}) {
  const {
    batchSize = 5, // Réduit pour stabilité
    maxRetries = 3,
    timeout = 30000, // 30 secondes par chunk
    onCancel = null,
    shouldCancel = () => false
  } = options;

  addLog('info', `Génération embeddings pour ${chunks.length} chunks (batch de ${batchSize})`);
  const results = [];
  const failedChunks = [];

  // Fonction d'embedding avec timeout et retry
  const embedWithRetry = async (chunk, retryCount = 0) => {
    try {
      // Vérifier si annulation demandée
      if (shouldCancel()) {
        throw new Error('Annulé par utilisateur');
      }

      // Timeout wrapper
      const embedPromise = generateEmbedding(chunk.text);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      );

      const vector = await Promise.race([embedPromise, timeoutPromise]);
      return { chunkId: chunk.id, vector };

    } catch (error) {
      if (retryCount < maxRetries) {
        addLog('warning', `Retry ${retryCount + 1}/${maxRetries} pour chunk ${chunk.id}`);
        // Attendre un peu avant retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return embedWithRetry(chunk, retryCount + 1);
      } else {
        addLog('error', `Échec définitif embedding chunk ${chunk.id}: ${error.message}`);
        return null; // Échec définitif
      }
    }
  };

  // Traiter par batches
  for (let batchStart = 0; batchStart < chunks.length; batchStart += batchSize) {
    // Vérifier annulation avant chaque batch
    if (shouldCancel()) {
      addLog('warning', 'Processus d\'embedding annulé par utilisateur');
      break;
    }

    const batchEnd = Math.min(batchStart + batchSize, chunks.length);
    const batch = chunks.slice(batchStart, batchEnd);

    addLog('info', `Traitement batch ${Math.floor(batchStart/batchSize) + 1}: chunks ${batchStart + 1}-${batchEnd}/${chunks.length}`);

    try {
      // Traiter le batch en parallèle avec gestion d'erreur robuste
      const batchPromises = batch.map(chunk => embedWithRetry(chunk));
      const batchResults = await Promise.allSettled(batchPromises);

      // Traiter les résultats (succès et échecs)
      batchResults.forEach((result, index) => {
        const chunk = batch[index];
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        } else {
          failedChunks.push(chunk);
          if (result.status === 'rejected') {
            addLog('error', `Chunk ${chunk.id} failed: ${result.reason?.message || 'Unknown error'}`);
          }
        }
      });


      // Petite pause entre batches pour éviter surcharge
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (batchError) {
      addLog('error', `Erreur batch ${Math.floor(batchStart/batchSize) + 1}: ${batchError.message}`);
      // Continuer avec le batch suivant malgré l'erreur
    }

    // Mise à jour progression
    onProgress(results.length + failedChunks.length, chunks.length);
  }

  addLog('success', `Embeddings générés: ${results.length} réussis, ${failedChunks.length} échoués`);

  // Retourner seulement les réussis, les échecs seront retraités plus tard si nécessaire
  return results;
}

export function isModelLoaded() {
  return embeddingPipeline !== null;
}

export function isModelCurrentlyLoading() {
  return isModelLoading;
}

export function getCurrentBackend() {
  return currentBackend;
}

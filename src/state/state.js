/**
 * État global de l'application
 * Centralisé pour faciliter la gestion et le debug
 */

import { validatePDF, generateFileId, checkDuplicate } from '../utils/fileUtils.js';

export const state = {
  // Documents uploadés
  docs: [],
  
  // Chunks de texte extraits
  chunks: [],
  
  // Vector Store : chunks avec embeddings
  vectorStore: [],
  
  // Historique de conversation
  chatHistory: [],
  
  // Paramètres de l'application
  settings: {
    temperature: 0.7,
    systemPrompt: 'You are an academic researcher assistant. Help users understand research papers and generate literature reviews.',
    topN: 5, // Nombre de chunks à récupérer pour RAG
    debugMode: false,
    sttLang: 'fr-FR', // Langue pour Speech-to-Text
    ttsRate: 1.0, // Vitesse TTS
    silenceDelay: 2000 // Délai silence en ms pour mode conversation
  },
  
  // État du modèle LLM
  model: {
    loaded: false,
    loading: false,
    name: null,
    error: null
  },

  // Mode importé (désactive upload quand base importée)
  importedMode: false,

  // Logs pour le panel de logs
  logs: []
};

/**
 * Ajoute un log au state
 * @param {string} level - 'info', 'success', 'warning', 'error'
 * @param {string} message - Message du log
 * @param {object} data - Données additionnelles (optionnel)
 */
export function addLog(level, message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = {
    timestamp,
    level,
    message,
    data
  };
  
  state.logs.push(logEntry);
  
  // Limiter à 100 logs pour éviter surcharge mémoire
  if (state.logs.length > 100) {
    state.logs.shift();
  }
  
  // Émettre un événement pour notifier l'UI
  window.dispatchEvent(new CustomEvent('state:log', { detail: logEntry }));
}

/**
 * Toggle le mode debug
 */
export function toggleDebugMode() {
  state.settings.debugMode = !state.settings.debugMode;
  window.dispatchEvent(new CustomEvent('state:debugToggle', { 
    detail: state.settings.debugMode 
  }));
  addLog('info', `Debug mode ${state.settings.debugMode ? 'enabled' : 'disabled'}`);
}

/**
 * Obtient un résumé de l'état (pour debug, sans embeddings complets)
 */
export function getStateSummary() {
  return {
    docs: {
      count: state.docs.length,
      files: state.docs.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        pageCount: doc.pageCount,
        charCount: doc.charCount
      }))
    },
    chunks: {
      count: state.chunks.length,
      sources: [...new Set(state.chunks.map(c => c.source))]
    },
    vectorStore: {
      count: state.vectorStore.length,
      hasEmbeddings: state.vectorStore.filter(v => v.embedding).length
    },
    chatHistory: {
      count: state.chatHistory.length
    },
    model: state.model,
    settings: state.settings
  };
}

/**
 * Ajoute un document au state
 * @param {File} file - Le fichier à ajouter
 * @returns {{success: boolean, doc?: object, error?: string}} - Résultat de l'ajout
 */
export function addDocument(file) {
  // Validation du fichier
  const validation = validatePDF(file);
  if (!validation.valid) {
    addLog('error', `PDF validation failed: ${validation.error}`, { filename: file.name });
    return { success: false, error: validation.error };
  }

  // Vérification des doublons
  if (checkDuplicate(file.name, state.docs)) {
    const error = `File "${file.name}" already exists`;
    addLog('warning', error, { filename: file.name });
    return { success: false, error };
  }

  // Création de l'objet document
  const doc = {
    id: generateFileId(),
    filename: file.name,
    file: file,
    size: file.size,
    uploadedAt: new Date(),
    status: 'uploaded',
    extractedText: null,
    pageCount: null,
    charCount: null
  };

  // Ajout au state
  state.docs.push(doc);

  // Émission d'événement pour notifier l'UI
  window.dispatchEvent(new CustomEvent('state:docAdded', { detail: doc }));

  // Log
  addLog('success', `PDF uploaded: ${file.name}`, { 
    id: doc.id, 
    size: file.size 
  });

  return { success: true, doc };
}

/**
 * Supprime un document du state
 * @param {string} id - L'ID du document à supprimer
 * @returns {boolean} - true si supprimé, false si non trouvé
 */
export function removeDocument(id) {
  const index = state.docs.findIndex(doc => doc.id === id);
  
  if (index === -1) {
    addLog('warning', `Document not found for removal: ${id}`);
    return false;
  }

  const doc = state.docs[index];
  
  // Supprimer les embeddings associés
  removeEmbeddingsByDocId(id);
  
  // Supprimer les chunks associés
  removeChunksByDocId(id);
  
  // Suppression du state
  state.docs.splice(index, 1);

  // Émission d'événement pour notifier l'UI
  window.dispatchEvent(new CustomEvent('state:docRemoved', { detail: { id } }));

  // Log
  addLog('info', `Document removed: ${doc.filename}`, { id });

  return true;
}

/**
 * Récupère un document par son ID
 * @param {string} id - L'ID du document
 * @returns {object|null} - Le document ou null si non trouvé
 */
export function getDocument(id) {
  return state.docs.find(doc => doc.id === id) || null;
}

/**
 * Met à jour le statut d'un document
 * @param {string} id - L'ID du document
 * @param {string} status - Le nouveau statut ('uploaded', 'extracting', 'extracted', 'error')
 * @param {string} error - Message d'erreur optionnel (si status = 'error')
 * @returns {boolean} - true si mis à jour, false si non trouvé
 */
export function updateDocumentStatus(id, status, error = null) {
  const doc = getDocument(id);
  
  if (!doc) {
    addLog('warning', `Document not found for status update: ${id}`);
    return false;
  }

  doc.status = status;
  if (error) {
    doc.error = error;
  } else {
    delete doc.error;
  }

  // Émission d'événement pour notifier l'UI
  window.dispatchEvent(new CustomEvent('state:docUpdated', { detail: { id, status, error } }));

  // Log
  addLog('info', `Document status updated: ${doc.filename} → ${status}`, { id, status });

  return true;
}

/**
 * Met à jour les données d'extraction d'un document
 * @param {string} id - L'ID du document
 * @param {object} extractionData - Données d'extraction {text, pageCount, charCount}
 * @returns {boolean} - true si mis à jour, false si non trouvé
 */
export function updateDocumentExtraction(id, extractionData) {
  const doc = getDocument(id);
  
  if (!doc) {
    addLog('warning', `Document not found for extraction update: ${id}`);
    return false;
  }

  doc.extractedText = extractionData.text;
  doc.pageCount = extractionData.pageCount;
  doc.charCount = extractionData.charCount;
  doc.status = 'extracted';

  // Émission d'événement pour notifier l'UI
  window.dispatchEvent(new CustomEvent('state:docExtracted', { 
    detail: { 
      id, 
      pageCount: extractionData.pageCount, 
      charCount: extractionData.charCount 
    } 
  }));

  // Log
  addLog('success', `Text extracted from ${doc.filename}: ${extractionData.pageCount} pages, ${extractionData.charCount} chars`, { 
    id, 
    pageCount: extractionData.pageCount, 
    charCount: extractionData.charCount 
  });

  return true;
}

/**
 * Ajoute des chunks au state
 * @param {Array} chunks - Liste des chunks à ajouter
 * @returns {boolean} - true si ajouté avec succès
 */
export function addChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return false;
  }

  state.chunks.push(...chunks);

  // Émission d'événement pour notifier l'UI
  window.dispatchEvent(new CustomEvent('state:chunksAdded', { 
    detail: { count: chunks.length, source: chunks[0]?.source } 
  }));

  // Log
  addLog('success', `${chunks.length} chunks créés pour ${chunks[0]?.source}`, { 
    count: chunks.length,
    source: chunks[0]?.source 
  });

  return true;
}

/**
 * Supprime tous les chunks d'un document
 * @param {string} docId - L'ID du document
 * @returns {number} - Nombre de chunks supprimés
 */
export function removeChunksByDocId(docId) {
  const initialLength = state.chunks.length;
  state.chunks = state.chunks.filter(chunk => chunk.docId !== docId);

  const removedCount = initialLength - state.chunks.length;

  if (removedCount > 0) {
    // Émission d'événement pour notifier l'UI
    window.dispatchEvent(new CustomEvent('state:chunksRemoved', { 
      detail: { docId, count: removedCount } 
    }));

    // Log
    addLog('info', `${removedCount} chunks supprimés pour document ${docId}`, { docId, count: removedCount });
  }

  return removedCount;
}

/**
 * Obtient les chunks d'un document
 * @param {string} docId - L'ID du document
 * @returns {Array} - Liste des chunks du document
 */
export function getChunksByDocId(docId) {
  return state.chunks.filter(chunk => chunk.docId === docId);
}

/**
 * Obtient les statistiques des chunks
 * @returns {object} - Statistiques (total, par source, etc.)
 */
export function getChunksStats() {
  const stats = {
    total: state.chunks.length,
    bySource: {},
    totalChars: 0
  };

  state.chunks.forEach(chunk => {
    if (!stats.bySource[chunk.source]) {
      stats.bySource[chunk.source] = 0;
    }
    stats.bySource[chunk.source]++;
    stats.totalChars += chunk.charCount || chunk.text.length;
  });

  return stats;
}

// ============================================
// Fonctions Vector Store (Embeddings)
// ============================================

/**
 * Ajoute un embedding au vector store
 * @param {string} chunkId - L'ID du chunk
 * @param {Float32Array} vector - Le vecteur d'embedding
 * @returns {boolean} - true si ajouté avec succès
 */
export function addEmbedding(chunkId, vector) {
  // Vérifier que le chunk existe
  const chunk = state.chunks.find(c => c.id === chunkId);
  if (!chunk) {
    addLog('warning', `Chunk not found for embedding: ${chunkId}`);
    return false;
  }

  // Créer l'entrée conforme au spec (text, embedding, source)
  const entry = {
    chunkId,
    vector,
    text: chunk.text,         // Conforme spec: texte brut
    embedding: vector,        // Conforme spec: alias pour vector
    source: chunk.source,
    docId: chunk.docId
  };

  // Vérifier si l'embedding existe déjà
  const existingIndex = state.vectorStore.findIndex(v => v.chunkId === chunkId);
  if (existingIndex !== -1) {
    state.vectorStore[existingIndex] = entry;
  } else {
    state.vectorStore.push(entry);
  }

  // Émission d'événement
  window.dispatchEvent(new CustomEvent('state:embeddingAdded', { 
    detail: { chunkId, vectorSize: vector.length } 
  }));

  return true;
}

/**
 * Récupère un embedding par chunkId
 * @param {string} chunkId - L'ID du chunk
 * @returns {Float32Array|null} - Le vecteur ou null
 */
export function getEmbedding(chunkId) {
  const entry = state.vectorStore.find(v => v.chunkId === chunkId);
  return entry ? entry.vector : null;
}

/**
 * Supprime les embeddings d'un document
 * @param {string} docId - L'ID du document
 * @returns {number} - Nombre d'embeddings supprimés
 */
export function removeEmbeddingsByDocId(docId) {
  const initialLength = state.vectorStore.length;
  state.vectorStore = state.vectorStore.filter(v => v.docId !== docId);
  const removedCount = initialLength - state.vectorStore.length;

  if (removedCount > 0) {
    window.dispatchEvent(new CustomEvent('state:embeddingsRemoved', { 
      detail: { docId, count: removedCount } 
    }));
    addLog('info', `${removedCount} embeddings supprimés pour document ${docId}`);
  }

  return removedCount;
}

/**
 * Obtient les statistiques du vector store
 * @returns {object} - Statistiques
 */
export function getVectorStoreStats() {
  return {
    total: state.vectorStore.length,
    chunksWithEmbeddings: state.vectorStore.length,
    chunksWithoutEmbeddings: state.chunks.length - state.vectorStore.length
  };
}

/**
 * Définit le mode importé
 * @param {boolean} isActive - true pour activer le mode importé
 */
export function setImportedMode(isActive) {
  state.importedMode = isActive;
  window.dispatchEvent(new CustomEvent('state:importedModeChanged', { detail: isActive }));
  addLog('info', `Mode importé ${isActive ? 'activé' : 'désactivé'}`);
}

/**
 * Vérifie si le mode importé est actif
 * @returns {boolean}
 */
export function isImportedMode() {
  return state.importedMode;
}

/**
 * Ajoute un message à l'historique de chat
 * @param {object} message - Message à ajouter
 */
export function addChatMessage(message) {
  const messageWithId = {
    ...message,
    id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: message.timestamp || Date.now()
  };
  
  state.chatHistory.push(messageWithId);
  
  window.dispatchEvent(new CustomEvent('state:chatMessageAdded', { detail: messageWithId }));
  
  return messageWithId;
}

// Initialisation
addLog('info', 'Application initialized');


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
    debugMode: false
  },
  
  // État du modèle LLM
  model: {
    loaded: false,
    loading: false,
    name: null,
    error: null
  },
  
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

// Initialisation
addLog('info', 'Application initialized');


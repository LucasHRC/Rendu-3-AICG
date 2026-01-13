/**
 * État global de l'application
 * Centralisé pour faciliter la gestion et le debug
 */

import { validatePDF, generateFileId, checkDuplicate } from '../utils/fileUtils.js';
import {
  initIndexedDB,
  saveDocument as saveDocToDB,
  saveChunk as saveChunkToDB,
  saveChunks as saveChunksToDB,
  saveEmbedding as saveEmbeddingToDB,
  saveManifest as saveManifestToDB,
  getAllDocuments as loadDocsFromDB,
  getAllChunks as loadChunksFromDB,
  getAllEmbeddings as loadEmbeddingsFromDB
} from '../storage/indexedDB.js';

export const state = {
  // Documents uploadés (ancien format)
  docs: [],

  // Chunks de texte extraits (ancien format)
  chunks: [],

  // Vector Store : chunks avec embeddings
  vectorStore: [],

  // NOUVELLES STRUCTURES POUR REVUE LITTÉRAIRE RAG
  // Map des documents avec statuts détaillés
  documents: new Map(),

  // Reviews par document (JSON structuré)
  reviewsByDoc: new Map(),

  // Revue finale assemblée
  litReviewFinal: null,

  // Historique des revues en memoire (perdu au rechargement)
  reviewHistory: [],

  // Etat UI pour la revue
  ui: {
    isReviewRunning: false,
    progress: {
      totalDocs: 0,
      doneDocs: 0,
      currentDocId: null,
      step: null // 'init', 'analyzing', 'assembling', 'complete'
    },
    controls: {
      temperature: 0.0 // Pour JSON strict
    }
  },

  // Historique de conversation
  chatHistory: [],
  
  // Paramètres de l'application
  settings: {
    temperature: 0.7,
    systemPrompt: 'You are an academic researcher assistant. Help users understand research papers and generate literature reviews.',
    topN: 5, // Nombre de chunks à récupérer pour RAG
    debugMode: false,
    sttLang: 'fr-FR', // Langue pour Speech-to-Text
    ttsEngine: 'web-speech', // 'xtts', 'web-speech', ou ID du modèle (bark, kokoro, etc.)
    ttsModel: 'kokoro', // Modèle TTS open source (bark, parler-large, speecht5-large, parler-mini, kokoro, speecht5-base)
    ttsVoice: null, // ID de la voix pour le modèle sélectionné
    ttsRate: 1.0, // Vitesse TTS
    silenceDelay: 2000 // Délai silence en ms pour mode conversation
  },
  
  // Statuts de validation des modèles TTS
  ttsModelStatus: {},
  
  // État du modèle LLM
  model: {
    loaded: false,
    loading: false,
    name: null,
    error: null
  },

  // Mode importé (désactive upload quand base importée)
  importedMode: false,

  // État de génération d'embeddings
  embeddingGeneration: {
    inProgress: false,
    isAutomatic: false, // true si généré automatiquement via QuickUpload
    cancellable: true,
    currentProgress: 0,
    totalProgress: 0
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
    charCount: null,
    // Métadonnées structurées (6 paramètres fixes)
    metadata: {
      summary: null,              // 1-2 phrases max
      subject: null,              // Phrase descriptive
      type: null,                 // Type de document
      context: {                  // Documents liés
        primary: [],              // Contexte principal (IDs de documents)
        secondary: []            // Contextes secondaires
      },
      utility: null,              // Utilité + contenu combinés
      importance: 'moyenne',      // 'faible' | 'moyenne' | 'élevée'
      // Métadonnées techniques
      generatedBy: null,          // 'ai' | 'user' | 'hybrid'
      generatedAt: null,
      lastModified: new Date(),
      confidenceScore: null       // Score de confiance IA (optionnel)
    }
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
  
  // Supprimer les liens avec les autres documents
  removeDocumentLinks(id);
  
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
export async function updateDocumentExtraction(id, extractionData) {
  const doc = getDocument(id);

  if (!doc) {
    addLog('warning', `Document not found for extraction update: ${id}`);
    return false;
  }

  doc.extractedText = extractionData.text;
  doc.pageCount = extractionData.pageCount;
  doc.charCount = extractionData.charCount;
  doc.status = 'extracted';

  // Initialiser metadata si pas encore fait
  if (!doc.metadata) {
    doc.metadata = {
      resume_court: null,
      sujets: [],
      type_document: null,
      contexte_projet: [],
      utilite_principale: null,
      importance_relative: 'moyenne',
      generatedBy: null,
      generatedAt: null,
      lastModified: new Date(),
      confidenceScore: null
    };
  }

  // Sauvegarder dans IndexedDB
  await initIndexedDB();
  await saveDocToDB(doc);

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
export async function addChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return false;
  }

  state.chunks.push(...chunks);

  // Sauvegarder dans IndexedDB
  await initIndexedDB();
  await saveChunksToDB(chunks);

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
export async function addEmbedding(chunkId, vector) {
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

  // Sauvegarder dans IndexedDB
  await initIndexedDB();
  await saveEmbeddingToDB(entry);

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

// ============================================
// Fonctions Metadata (6 paramètres fixes)
// ============================================

/**
 * Met à jour les métadonnées d'un document
 * @param {string} id - L'ID du document
 * @param {object} metadata - Objet de métadonnées (partiel ou complet)
 * @param {string} generatedBy - 'ai' | 'user' | 'hybrid'
 * @returns {boolean} - true si mis à jour, false si non trouvé
 */
export function updateDocumentMetadata(id, metadata, generatedBy = 'user') {
  const doc = getDocument(id);
  
  if (!doc) {
    addLog('warning', `Document not found for metadata update: ${id}`);
    return false;
  }

  // Initialiser metadata si nécessaire
  if (!doc.metadata) {
    doc.metadata = {
      summary: null,
      subject: null,
      type: null,
      context: { primary: [], secondary: [] },
      utility: null,
      importance: 'moyenne',
      generatedBy: null,
      generatedAt: null,
      lastModified: new Date(),
      confidenceScore: null
    };
  }

  // Mettre à jour les champs fournis
  if (metadata.summary !== undefined) doc.metadata.summary = metadata.summary;
  if (metadata.subject !== undefined) doc.metadata.subject = metadata.subject;
  if (metadata.type !== undefined) doc.metadata.type = metadata.type;
  if (metadata.context !== undefined) {
    if (metadata.context.primary !== undefined) doc.metadata.context.primary = metadata.context.primary;
    if (metadata.context.secondary !== undefined) doc.metadata.context.secondary = metadata.context.secondary;
  }
  if (metadata.utility !== undefined) doc.metadata.utility = metadata.utility;
  if (metadata.importance !== undefined) doc.metadata.importance = metadata.importance;
  if (metadata.confidenceScore !== undefined) doc.metadata.confidenceScore = metadata.confidenceScore;

  // Mettre à jour les métadonnées techniques
  doc.metadata.generatedBy = generatedBy;
  doc.metadata.lastModified = new Date();
  if (generatedBy === 'ai' && !doc.metadata.generatedAt) {
    doc.metadata.generatedAt = new Date();
  }

  // Émission d'événement
  window.dispatchEvent(new CustomEvent('state:docMetadataUpdated', { 
    detail: { id, metadata: doc.metadata } 
  }));

  // Log
  addLog('info', `Metadata updated for ${doc.filename}`, { id, generatedBy });

  return true;
}

/**
 * Récupère les métadonnées d'un document
 * @param {string} id - L'ID du document
 * @returns {object|null} - Les métadonnées ou null si non trouvé
 */
export function getDocumentMetadata(id) {
  const doc = getDocument(id);
  return doc ? doc.metadata : null;
}

/**
 * Ajoute un lien entre deux documents (bidirectionnel)
 * @param {string} docId1 - ID du premier document
 * @param {string} docId2 - ID du deuxième document
 * @param {boolean} isPrimary - true pour contexte principal, false pour secondaire
 * @returns {boolean} - true si ajouté, false si erreur
 */
export async function linkDocuments(docId1, docId2, isPrimary = true) {
  const doc1 = getDocument(docId1);
  const doc2 = getDocument(docId2);

  if (!doc1 || !doc2) {
    addLog('warning', `Cannot link documents: one or both not found`, { docId1, docId2 });
    return false;
  }

  // Initialiser metadata si nécessaire
  if (!doc1.metadata) await updateDocumentMetadata(doc1.id, {}, 'user');
  if (!doc2.metadata) await updateDocumentMetadata(doc2.id, {}, 'user');

  const contextArray1 = isPrimary ? doc1.metadata.context.primary : doc1.metadata.context.secondary;
  const contextArray2 = isPrimary ? doc2.metadata.context.primary : doc2.metadata.context.secondary;

  // Ajouter bidirectionnellement
  if (!contextArray1.includes(docId2)) contextArray1.push(docId2);
  if (!contextArray2.includes(docId1)) contextArray2.push(docId1);

  doc1.metadata.lastModified = new Date();
  doc2.metadata.lastModified = new Date();

  // Émission d'événement
  window.dispatchEvent(new CustomEvent('state:docLinked', {
    detail: { docId1, docId2, isPrimary }
  }));

  addLog('info', `Documents linked: ${doc1.filename} ↔ ${doc2.filename}`, { docId1, docId2, isPrimary });

  return true;
}

/**
 * Supprime un lien entre deux documents (bidirectionnel)
 * @param {string} docId1 - ID du premier document
 * @param {string} docId2 - ID du deuxième document
 * @returns {boolean} - true si supprimé, false si erreur
 */
export function unlinkDocuments(docId1, docId2) {
  const doc1 = getDocument(docId1);
  const doc2 = getDocument(docId2);

  if (!doc1 || !doc2 || !doc1.metadata || !doc2.metadata) {
    return false;
  }

  // Supprimer des deux contextes (primary et secondary)
  const removeFromArray = (arr, id) => {
    const index = arr.indexOf(id);
    if (index > -1) arr.splice(index, 1);
  };

  removeFromArray(doc1.metadata.context.primary, docId2);
  removeFromArray(doc1.metadata.context.secondary, docId2);
  removeFromArray(doc2.metadata.context.primary, docId1);
  removeFromArray(doc2.metadata.context.secondary, docId1);

  doc1.metadata.lastModified = new Date();
  doc2.metadata.lastModified = new Date();

  // Émission d'événement
  window.dispatchEvent(new CustomEvent('state:docUnlinked', { 
    detail: { docId1, docId2 } 
  }));

  addLog('info', `Documents unlinked: ${doc1.filename} ↔ ${doc2.filename}`, { docId1, docId2 });

  return true;
}

/**
 * Supprime tous les liens d'un document (lors de sa suppression)
 * @param {string} docId - L'ID du document supprimé
 */
function removeDocumentLinks(docId) {
  state.docs.forEach(doc => {
    if (doc.metadata) {
      const removeFromArray = (arr, id) => {
        const index = arr.indexOf(id);
        if (index > -1) arr.splice(index, 1);
      };
      removeFromArray(doc.metadata.context.primary, docId);
      removeFromArray(doc.metadata.context.secondary, docId);
    }
  });
}

// ============================================
// Chargement depuis IndexedDB
// ============================================

/**
 * Charge tous les documents depuis IndexedDB
 * @returns {Promise<boolean>}
 */
export async function loadAllFromIndexedDB() {
  try {
    await initIndexedDB();

    // Charger documents
    const docs = await loadDocsFromDB();
    state.docs = docs;

    // Charger chunks
    const chunks = await loadChunksFromDB();
    state.chunks = chunks;

    // Charger embeddings
    const embeddings = await loadEmbeddingsFromDB();
    state.vectorStore = embeddings;

    // Charger métadonnées et manifests pour chaque document
    const { getMetadata, getManifest } = await import('../storage/indexedDB.js');
    for (const doc of docs) {
      const metadata = await getMetadata(doc.id);
      if (metadata) {
        if (!doc.metadata) {
          doc.metadata = {
            resume_court: null,
            sujets: [],
            type_document: null,
            contexte_projet: [],
            utilite_principale: null,
            importance_relative: 'moyenne',
            generatedBy: null,
            generatedAt: null,
            lastModified: new Date(),
            confidenceScore: null
          };
        }
        doc.metadata.resume_court = metadata.resume_court;
        doc.metadata.sujets = metadata.sujets;
        doc.metadata.type_document = metadata.type_document;
        doc.metadata.contexte_projet = metadata.contexte_projet;
        doc.metadata.utilite_principale = metadata.utilite_principale;
        doc.metadata.importance_relative = metadata.importance_relative;
        doc.metadata.generatedBy = metadata.generatedBy;
        doc.metadata.generatedAt = metadata.generatedAt;
        doc.metadata.lastModified = metadata.lastModified;
        doc.metadata.confidenceScore = metadata.confidenceScore;
      }

      // Charger le manifest pour récupérer les métadonnées complètes
      const manifest = await getManifest(doc.id);
      if (manifest) {
        if (!doc.metadata) {
          doc.metadata = {
            resume_court: null,
            sujets: [],
            type_document: null,
            contexte_projet: [],
            utilite_principale: null,
            importance_relative: 'moyenne',
            generatedBy: null,
            generatedAt: null,
            lastModified: new Date(),
            confidenceScore: null
          };
        }
        doc.metadata.resume_court = manifest.resume_court;
        doc.metadata.sujets = manifest.sujets;
        doc.metadata.type_document = manifest.type_document;
        doc.metadata.contexte_projet = manifest.contexte_projet;
        doc.metadata.utilite_principale = manifest.utilite_principale;
        doc.metadata.importance_relative = manifest.importance_relative;
      }
    }

    addLog('success', `Données chargées depuis IndexedDB: ${docs.length} docs, ${chunks.length} chunks, ${embeddings.length} embeddings`);
    return true;
  } catch (error) {
    addLog('error', `Erreur chargement IndexedDB: ${error.message}`);
    return false;
  }
}

// Initialisation
addLog('info', 'Application initialized');

// Initialiser IndexedDB au démarrage
initIndexedDB().catch(err => {
  addLog('error', `Échec initialisation IndexedDB: ${err.message}`);
});


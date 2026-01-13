/**
 * Module de stockage IndexedDB pour la persistence des données
 * Gère : documents, chunks, embeddings, métadonnées, manifests
 */

let db = null;
const DB_NAME = 'LiteratureReviewerDB';
const DB_VERSION = 1;

// Stores
const STORES = {
  DOCUMENTS: 'documents',
  CHUNKS: 'chunks',
  EMBEDDINGS: 'embeddings',
  METADATA: 'metadata',
  MANIFESTS: 'manifests'
};

/**
 * Initialise la base de données IndexedDB
 */
export async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB n\'est pas supporté par ce navigateur'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store pour les documents
      if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
        const docStore = db.createObjectStore(STORES.DOCUMENTS, { keyPath: 'id' });
        docStore.createIndex('filename', 'filename', { unique: false });
        docStore.createIndex('status', 'status', { unique: false });
      }

      // Store pour les chunks
      if (!db.objectStoreNames.contains(STORES.CHUNKS)) {
        const chunkStore = db.createObjectStore(STORES.CHUNKS, { keyPath: 'id' });
        chunkStore.createIndex('docId', 'docId', { unique: false });
        chunkStore.createIndex('source', 'source', { unique: false });
      }

      // Store pour les embeddings
      if (!db.objectStoreNames.contains(STORES.EMBEDDINGS)) {
        const embeddingStore = db.createObjectStore(STORES.EMBEDDINGS, { keyPath: 'chunkId' });
        embeddingStore.createIndex('docId', 'docId', { unique: false });
      }

      // Store pour les métadonnées
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        const metadataStore = db.createObjectStore(STORES.METADATA, { keyPath: 'docId' });
        metadataStore.createIndex('type', 'type_document', { unique: false });
        metadataStore.createIndex('importance', 'importance_relative', { unique: false });
      }

      // Store pour les manifests
      if (!db.objectStoreNames.contains(STORES.MANIFESTS)) {
        const manifestStore = db.createObjectStore(STORES.MANIFESTS, { keyPath: 'docId' });
        manifestStore.createIndex('generatedBy', 'generatedBy', { unique: false });
      }
    };
  });
}

/**
 * Sauvegarde un document dans IndexedDB
 */
export async function saveDocument(doc) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DOCUMENTS], 'readwrite');
    const store = transaction.objectStore(STORES.DOCUMENTS);
    const request = store.put(doc);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Sauvegarde un chunk dans IndexedDB
 */
export async function saveChunk(chunk) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
    const store = transaction.objectStore(STORES.CHUNKS);
    const request = store.put(chunk);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Sauvegarde plusieurs chunks en batch
 */
export async function saveChunks(chunks) {
  if (!db) await initIndexedDB();
  if (!Array.isArray(chunks) || chunks.length === 0) return;

  const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
  const store = transaction.objectStore(STORES.CHUNKS);

  return new Promise((resolve, reject) => {
    let completed = 0;
    const total = chunks.length;

    chunks.forEach(chunk => {
      const request = store.put(chunk);
      request.onsuccess = () => {
        completed++;
        if (completed === total) {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Sauvegarde un embedding dans IndexedDB
 */
export async function saveEmbedding(embedding) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.EMBEDDINGS], 'readwrite');
    const store = transaction.objectStore(STORES.EMBEDDINGS);
    const request = store.put(embedding);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Sauvegarde les métadonnées d'un document
 */
export async function saveMetadata(metadata) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORES.METADATA);
    const request = store.put(metadata);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Sauvegarde un manifest complet
 */
export async function saveManifest(manifest) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MANIFESTS], 'readwrite');
    const store = transaction.objectStore(STORES.MANIFESTS);
    const request = store.put(manifest);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// Fonctions de chargement
// ============================================

/**
 * Charge tous les documents depuis IndexedDB
 */
export async function getAllDocuments() {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DOCUMENTS], 'readonly');
    const store = transaction.objectStore(STORES.DOCUMENTS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Charge tous les chunks depuis IndexedDB
 */
export async function getAllChunks() {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readonly');
    const store = transaction.objectStore(STORES.CHUNKS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Charge tous les embeddings depuis IndexedDB
 */
export async function getAllEmbeddings() {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.EMBEDDINGS], 'readonly');
    const store = transaction.objectStore(STORES.EMBEDDINGS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère les métadonnées d'un document
 */
export async function getMetadata(docId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.METADATA], 'readonly');
    const store = transaction.objectStore(STORES.METADATA);
    const request = store.get(docId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère le manifest d'un document
 */
export async function getManifest(docId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MANIFESTS], 'readonly');
    const store = transaction.objectStore(STORES.MANIFESTS);
    const request = store.get(docId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// Fonctions de suppression
// ============================================

/**
 * Supprime un document de IndexedDB
 */
export async function deleteDocument(docId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DOCUMENTS], 'readwrite');
    const store = transaction.objectStore(STORES.DOCUMENTS);
    const request = store.delete(docId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Supprime tous les chunks d'un document
 */
export async function deleteChunksByDocId(docId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
    const store = transaction.objectStore(STORES.CHUNKS);
    const index = store.index('docId');
    const request = index.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.docId === docId) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Supprime tous les embeddings d'un document
 */
export async function deleteEmbeddingsByDocId(docId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.EMBEDDINGS], 'readwrite');
    const store = transaction.objectStore(STORES.EMBEDDINGS);
    const index = store.index('docId');
    const request = index.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.docId === docId) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Supprime les métadonnées d'un document
 */
export async function deleteMetadata(docId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORES.METADATA);
    const request = store.delete(docId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Supprime le manifest d'un document
 */
export async function deleteManifest(docId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MANIFESTS], 'readwrite');
    const store = transaction.objectStore(STORES.MANIFESTS);
    const request = store.delete(docId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// Fonctions utilitaires
// ============================================

/**
 * Vide complètement la base de données
 */
export async function clearDatabase() {
  if (!db) await initIndexedDB();

  const stores = Object.values(STORES);
  const transaction = db.transaction(stores, 'readwrite');

  return new Promise((resolve, reject) => {
    let completed = 0;
    const total = stores.length;

    stores.forEach(storeName => {
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        completed++;
        if (completed === total) {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Obtient les statistiques de la base de données
 */
export async function getDatabaseStats() {
  if (!db) await initIndexedDB();

  const stats = {
    documents: 0,
    chunks: 0,
    embeddings: 0,
    metadata: 0,
    manifests: 0
  };

  const stores = Object.values(STORES);
  const transaction = db.transaction(stores, 'readonly');

  return new Promise((resolve, reject) => {
    let completed = 0;
    const total = stores.length;

    stores.forEach(storeName => {
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => {
        stats[storeName] = request.result;
        completed++;
        if (completed === total) {
          resolve(stats);
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}
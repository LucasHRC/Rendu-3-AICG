/**
 * Module de construction des blocs MANIFEST et RETRIEVED CHUNKS
 * Structure le contexte IA en 2 blocs distincts
 */

import { state, getDocument } from '../state/state.js';

/**
 * Construit le bloc MANIFEST pour tous les documents
 * @returns {string} - Bloc MANIFEST formaté
 */
export function buildManifestBlock() {
  const docs = state.docs.filter(d => d.extractedText && d.status === 'extracted');

  if (docs.length === 0) {
    return 'MANIFEST: Aucun document disponible dans la base.';
  }

  let manifest = `MANIFEST (${docs.length} documents):\n\n`;

  docs.forEach((doc, index) => {
    const metadata = doc.metadata || {};
    const displayName = doc.displayName || doc.filename;

    manifest += `## Document ${index + 1}: ${displayName}\n\n`;

    // 1. resume_court
    manifest += `resume_court: ${metadata.resume_court || 'Non disponible'}\n`;

    // 2. sujets
    const sujets = Array.isArray(metadata.sujets) && metadata.sujets.length > 0
      ? metadata.sujets.join(', ')
      : 'Non définis';
    manifest += `sujets: ${sujets}\n`;

    // 3. type_document
    manifest += `type_document: ${metadata.type_document || 'autre'}\n`;

    // 4. contexte_projet
    const contexte = Array.isArray(metadata.contexte_projet) && metadata.contexte_projet.length > 0
      ? metadata.contexte_projet.join(', ')
      : 'Aucun';
    manifest += `contexte_projet: ${contexte}\n`;

    // 5. utilite_principale
    manifest += `utilite_principale: ${metadata.utilite_principale || 'Non déterminée'}\n`;

    // 6. importance_relative
    manifest += `importance_relative: ${metadata.importance_relative || 'moyenne'}\n\n`;

    manifest += `---\n\n`;
  });

  return manifest;
}

/**
 * Construit le bloc RETRIEVED CHUNKS avec les preuves
 * @param {Array} searchResults - Résultats de la recherche RAG
 * @returns {string} - Bloc RETRIEVED CHUNKS formaté
 */
export function buildRetrievedChunksBlock(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return 'RETRIEVED CHUNKS: Aucun chunk retrouvé pour cette requête.';
  }

  // Grouper par document pour un meilleur affichage
  const groups = {};
  searchResults.forEach(result => {
    const docName = result.source || 'Unknown';
    if (!groups[docName]) {
      groups[docName] = [];
    }
    groups[docName].push(result);
  });

  let chunks = `RETRIEVED CHUNKS (${searchResults.length} chunks de ${Object.keys(groups).length} documents):\n\n`;

  Object.entries(groups).forEach(([docName, docChunks], docIndex) => {
    chunks += `### Document: ${docName} (${docChunks.length} chunks)\n\n`;

    docChunks.forEach((chunk, chunkIndex) => {
      chunks += `**Chunk ${docIndex + 1}-${chunkIndex + 1}:**\n`;
      chunks += `${chunk.text}\n\n`;
    });

    chunks += `---\n\n`;
  });

  return chunks;
}

/**
 * Construit le contexte complet avec MANIFEST + RETRIEVED CHUNKS
 * @param {Array} searchResults - Résultats de la recherche RAG
 * @returns {string} - Contexte complet formaté
 */
export function buildFullContext(searchResults) {
  const manifestBlock = buildManifestBlock();
  const chunksBlock = buildRetrievedChunksBlock(searchResults);

  return `${manifestBlock}\n\n${chunksBlock}`;
}

/**
 * Version optimisée pour les prompts (plus compacte)
 * @param {Array} searchResults - Résultats de la recherche RAG
 * @returns {string} - Contexte optimisé
 */
export function buildCompactContext(searchResults) {
  // MANIFEST compact : seulement les docs pertinents + résumé
  const relevantDocIds = new Set();
  if (searchResults && searchResults.length > 0) {
    searchResults.forEach(result => {
      if (result.docId) relevantDocIds.add(result.docId);
    });
  }

  const allDocs = state.docs.filter(d => d.extractedText && d.status === 'extracted');
  const relevantDocs = allDocs.filter(doc => relevantDocIds.has(doc.id));
  const otherDocs = allDocs.filter(doc => !relevantDocIds.has(doc.id));

  let context = `MANIFEST (Base: ${allDocs.length} docs, Pertinents: ${relevantDocs.length}):\n\n`;

  // Documents pertinents (détail complet)
  if (relevantDocs.length > 0) {
    context += `## Documents pertinents:\n\n`;
    relevantDocs.forEach((doc, index) => {
      const metadata = doc.metadata || {};
      context += `**${doc.displayName || doc.filename}:** ${metadata.resume_court || 'Non disponible'} (${metadata.type_document || 'autre'}, ${metadata.importance_relative || 'moyenne'})\n`;
    });
    context += `\n`;
  }

  // Autres documents (résumé)
  if (otherDocs.length > 0) {
    const types = {};
    const importances = { faible: 0, moyenne: 0, élevée: 0 };

    otherDocs.forEach(doc => {
      const metadata = doc.metadata || {};
      const type = metadata.type_document || 'autre';
      const imp = metadata.importance_relative || 'moyenne';

      types[type] = (types[type] || 0) + 1;
      importances[imp] = (importances[imp] || 0) + 1;
    });

    context += `## Base complète:\n`;
    context += `- **Types:** ${Object.entries(types).map(([t, c]) => `${t}(${c})`).join(', ')}\n`;
    context += `- **Importance:** faible(${importances.faible}), moyenne(${importances.moyenne}), élevée(${importances.élevée})\n\n`;
  }

  // RETRIEVED CHUNKS
  context += buildRetrievedChunksBlock(searchResults);

  return context;
}

/**
 * Exporte un snapshot complet de la base (pour sauvegarde/import)
 * @returns {object} - Snapshot complet
 */
export function exportKnowledgeBase() {
  const timestamp = new Date().toISOString();

  return {
    version: '1.0',
    exportedAt: timestamp,
    docs: state.docs.map(doc => ({
      ...doc,
      file: null // Ne pas exporter le File object
    })),
    chunks: state.chunks,
    vectorStore: state.vectorStore,
    settings: state.settings,
    metadata: {
      totalDocs: state.docs.length,
      extractedDocs: state.docs.filter(d => d.status === 'extracted').length,
      chunksCount: state.chunks.length,
      embeddingsCount: state.vectorStore.length
    }
  };
}

/**
 * Importe un snapshot complet de la base
 * @param {object} snapshot - Snapshot à importer
 * @returns {boolean} - Succès de l'import
 */
export async function importKnowledgeBase(snapshot) {
  try {
    if (!snapshot || !snapshot.version) {
      throw new Error('Snapshot invalide');
    }

    // Restaurer les données
    if (snapshot.docs) state.docs = snapshot.docs;
    if (snapshot.chunks) state.chunks = snapshot.chunks;
    if (snapshot.vectorStore) state.vectorStore = snapshot.vectorStore;
    if (snapshot.settings) Object.assign(state.settings, snapshot.settings);

    // Sauvegarder en IndexedDB
    const { initIndexedDB, saveDocument, saveChunks, saveEmbedding } = await import('../storage/indexedDB.js');
    await initIndexedDB();

    for (const doc of state.docs) {
      await saveDocument(doc);
    }

    await saveChunks(state.chunks);

    for (const embedding of state.vectorStore) {
      await saveEmbedding(embedding);
    }

    // Émettre événements pour mettre à jour l'UI
    window.dispatchEvent(new CustomEvent('state:knowledgeBaseImported'));

    return true;
  } catch (error) {
    console.error('Erreur import KB:', error);
    return false;
  }
}
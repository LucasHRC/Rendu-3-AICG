/**
 * Module de détection automatique de liens entre documents
 * Utilise la similarité sémantique (embeddings) pour détecter les documents liés
 */

import { state, linkDocuments, getDocument, addLog, getChunksByDocId } from '../state/state.js';
import { generateEmbedding } from './embeddings.js';
import { cosineSimilarity } from './search.js';

// Seuil de similarité élevé pour détecter les liens (0.7 = 70%)
const SIMILARITY_THRESHOLD = 0.7;

/**
 * Génère un embedding moyen pour un document (basé sur ses chunks)
 * @param {string} docId - ID du document
 * @returns {Promise<Float32Array|null>} - Embedding moyen ou null
 */
async function getDocumentEmbedding(docId) {
  const chunks = getChunksByDocId(docId);
  if (chunks.length === 0) {
    return null;
  }

  // Récupérer les embeddings des chunks depuis le vectorStore
  const chunkEmbeddings = [];
  for (const chunk of chunks) {
    const vectorEntry = state.vectorStore.find(v => v.chunkId === chunk.id);
    if (vectorEntry && vectorEntry.embedding) {
      chunkEmbeddings.push(vectorEntry.embedding);
    }
  }

  if (chunkEmbeddings.length === 0) {
    // Si pas d'embeddings, générer un embedding à partir du texte extrait
    const doc = getDocument(docId);
    if (doc && doc.extractedText) {
      const text = doc.extractedText.substring(0, 2000); // Limiter pour éviter dépassement
      try {
        const embedding = await generateEmbedding(text);
        return embedding;
      } catch (error) {
        addLog('warning', `Erreur génération embedding pour document ${docId}: ${error.message}`);
        return null;
      }
    }
    return null;
  }

  // Calculer la moyenne des embeddings
  const dimension = chunkEmbeddings[0].length;
  const meanEmbedding = new Float32Array(dimension);

  for (let i = 0; i < dimension; i++) {
    let sum = 0;
    for (const embedding of chunkEmbeddings) {
      sum += embedding[i];
    }
    meanEmbedding[i] = sum / chunkEmbeddings.length;
  }

  return meanEmbedding;
}

/**
 * Détecte les liens entre deux documents
 * @param {string} docId1 - ID du premier document
 * @param {string} docId2 - ID du deuxième document
 * @returns {Promise<{similarity: number, shouldLink: boolean}>} - Résultat de la détection
 */
async function detectLink(docId1, docId2) {
  const embedding1 = await getDocumentEmbedding(docId1);
  const embedding2 = await getDocumentEmbedding(docId2);

  if (!embedding1 || !embedding2) {
    return { similarity: 0, shouldLink: false };
  }

  const similarity = cosineSimilarity(embedding1, embedding2);
  const shouldLink = similarity >= SIMILARITY_THRESHOLD;

  return { similarity, shouldLink };
}

/**
 * Détecte automatiquement les liens pour un document avec tous les autres
 * @param {string} docId - ID du document à analyser
 * @param {boolean} isPrimary - true pour contexte principal, false pour secondaire
 * @returns {Promise<Array>} - Liste des IDs de documents liés détectés
 */
export async function detectLinksForDocument(docId, isPrimary = true) {
  const doc = getDocument(docId);
  if (!doc || !doc.extractedText) {
    addLog('warning', `Document ${docId} non trouvé ou sans texte pour détection de liens`);
    return [];
  }

  addLog('info', `Détection de liens pour ${doc.filename}...`, { docId });

  const linkedDocs = [];
  const otherDocs = state.docs.filter(d => d.id !== docId && d.extractedText);

  if (otherDocs.length === 0) {
    return [];
  }

  // Vérifier chaque document
  for (const otherDoc of otherDocs) {
    try {
      const result = await detectLink(docId, otherDoc.id);
      
      if (result.shouldLink) {
        // Créer le lien bidirectionnel
        await linkDocuments(docId, otherDoc.id, isPrimary);
        linkedDocs.push(otherDoc.id);
        
        addLog('info', `Lien détecté: ${doc.filename} ↔ ${otherDoc.filename} (similarité: ${(result.similarity * 100).toFixed(1)}%)`, {
          docId1: docId,
          docId2: otherDoc.id,
          similarity: result.similarity
        });
      }
    } catch (error) {
      addLog('warning', `Erreur détection lien ${docId} ↔ ${otherDoc.id}: ${error.message}`);
    }
  }

  if (linkedDocs.length > 0) {
    addLog('success', `${linkedDocs.length} lien(s) détecté(s) pour ${doc.filename}`, { docId, count: linkedDocs.length });
  }

  return linkedDocs;
}

/**
 * Détecte les liens pour tous les documents (en arrière-plan)
 * @param {Function} onProgress - Callback de progression (docId, progress)
 * @returns {Promise<object>} - Résumé des liens détectés
 */
export async function detectAllLinks(onProgress = null) {
  const docsWithText = state.docs.filter(d => d.extractedText && d.status === 'extracted');
  
  if (docsWithText.length < 2) {
    addLog('info', 'Pas assez de documents pour détecter des liens (minimum 2)');
    return { total: 0, links: [] };
  }

  addLog('info', `Détection de liens pour ${docsWithText.length} documents...`, { 
    count: docsWithText.length 
  });

  const allLinks = [];
  let processed = 0;

  // Traiter chaque document
  for (const doc of docsWithText) {
    if (onProgress) {
      onProgress(doc.id, { status: 'processing', progress: processed / docsWithText.length });
    }

    try {
      const linkedDocs = await detectLinksForDocument(doc.id, true);
      allLinks.push(...linkedDocs.map(linkedId => ({ from: doc.id, to: linkedId })));
      processed++;
    } catch (error) {
      addLog('error', `Erreur détection liens pour ${doc.filename}: ${error.message}`, { docId: doc.id });
      processed++;
    }

    // Petit délai pour éviter la surcharge
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const uniqueLinks = new Set();
  allLinks.forEach(link => {
    const key = [link.from, link.to].sort().join('-');
    uniqueLinks.add(key);
  });

  addLog('success', `Détection terminée: ${uniqueLinks.size} lien(s) unique(s) détecté(s)`, {
    total: uniqueLinks.size
  });

  return {
    total: uniqueLinks.size,
    links: Array.from(uniqueLinks).map(key => key.split('-'))
  };
}

/**
 * Détecte automatiquement les liens pour un document après extraction
 * Appelé automatiquement après updateDocumentExtraction
 * @param {string} docId - ID du document
 */
export async function autoDetectLinks(docId) {
  const doc = getDocument(docId);
  if (!doc || !doc.extractedText || doc.status !== 'extracted') {
    return;
  }

  // Vérifier qu'il y a au moins un autre document
  const otherDocs = state.docs.filter(d => d.id !== docId && d.extractedText && d.status === 'extracted');
  if (otherDocs.length === 0) {
    return; // Pas d'autres documents, pas de liens possibles
  }

  // Détecter en arrière-plan (ne pas bloquer)
  detectLinksForDocument(docId, true).catch(error => {
    addLog('error', `Erreur détection auto liens: ${error.message}`, { docId });
  });
}

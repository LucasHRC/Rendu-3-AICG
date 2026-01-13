/**
 * Document RAG Summary - Mini synthèse RAG par document
 * Utilise les embeddings déjà générés pour créer un résumé auto-référentiel
 * Améliore la qualité de l'enrichissement en fournissant plus de contexte au LLM
 */

import { state, addLog } from '../state/state.js';
import { searchSimilarChunks } from './search.js';

/**
 * Requêtes ciblées pour extraire les informations clés du document
 */
const TARGET_QUERIES = [
  {
    label: 'objectif',
    query: "Quel est l'objectif principal de cette recherche ? Quelle est la question de recherche ?"
  },
  {
    label: 'methodologie',
    query: 'Quelle méthodologie est utilisée ? Comment les auteurs ont-ils mené leur étude ?'
  },
  {
    label: 'resultats',
    query: 'Quels sont les résultats quantitatifs principaux ? Quelles sont les conclusions ?'
  },
  {
    label: 'limitations',
    query: 'Quelles sont les limitations mentionnées ? Quels sont les points faibles de cette étude ?'
  }
];

/**
 * Génère une mini synthèse RAG pour un document en utilisant ses propres chunks
 * @param {string} docId - ID du document
 * @param {Object} options - Options
 * @param {number} options.topK - Nombre de chunks à récupérer par requête (défaut: 5)
 * @returns {Promise<Object|null>} - Résumé structuré ou null si échec
 */
export async function generateDocumentRAGSummary(docId, options = {}) {
  const { topK = 5 } = options;

  const doc = state.docs.find(d => d.id === docId);
  if (!doc) {
    addLog('warning', `Document RAG Summary: document ${docId} non trouvé`);
    return null;
  }

  // Vérifier que le document a des chunks et des embeddings
  const docChunks = state.chunks.filter(c => c.docId === docId);
  if (docChunks.length === 0) {
    addLog('warning', `Document RAG Summary: aucun chunk pour ${doc.filename}`);
    return null;
  }

  const docEmbeddings = state.vectorStore.filter(v => {
    const chunk = state.chunks.find(c => c.id === v.chunkId);
    return chunk && chunk.docId === docId;
  });

  if (docEmbeddings.length === 0) {
    addLog('warning', `Document RAG Summary: aucun embedding pour ${doc.filename}`);
    return null;
  }

  addLog('info', `Génération synthèse RAG pour ${doc.filename}...`);

  try {
    const summaries = {};

    // Pour chaque requête ciblée, rechercher les chunks pertinents
    for (const { label, query } of TARGET_QUERIES) {
      try {
        // Rechercher les chunks similaires
        const results = await searchSimilarChunks(query, topK);
        
        // Filtrer uniquement les chunks du document en question
        const docResults = results.filter(r => {
          const chunk = state.chunks.find(c => c.id === r.chunkId);
          return chunk && chunk.docId === docId;
        });

        if (docResults.length > 0) {
          summaries[label] = {
            query,
            chunks: docResults.map(r => ({
              text: r.text,
              score: r.score,
              chunkIndex: r.chunkIndex
            })),
            topChunks: docResults
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(r => r.text)
          };
        } else {
          summaries[label] = {
            query,
            chunks: [],
            topChunks: []
          };
        }
      } catch (error) {
        addLog('warning', `Erreur synthèse RAG (${label}) pour ${doc.filename}: ${error.message}`);
        summaries[label] = {
          query,
          chunks: [],
          topChunks: [],
          error: error.message
        };
      }
    }

    // Construire un résumé textuel structuré
    const summaryText = buildSummaryText(summaries);

    const result = {
      docId,
      filename: doc.filename,
      summaries,
      summaryText,
      timestamp: new Date().toISOString()
    };

    addLog('success', `Synthèse RAG générée pour ${doc.filename}`);
    return result;

  } catch (error) {
    addLog('error', `Erreur génération synthèse RAG pour ${doc.filename}: ${error.message}`);
    return null;
  }
}

/**
 * Construit un texte de résumé structuré à partir des résultats RAG
 */
function buildSummaryText(summaries) {
  const parts = [];

  if (summaries.objectif?.topChunks?.length > 0) {
    parts.push(`Objectif: ${summaries.objectif.topChunks[0].substring(0, 200)}`);
  }

  if (summaries.methodologie?.topChunks?.length > 0) {
    parts.push(`Méthodologie: ${summaries.methodologie.topChunks[0].substring(0, 200)}`);
  }

  if (summaries.resultats?.topChunks?.length > 0) {
    parts.push(`Résultats: ${summaries.resultats.topChunks[0].substring(0, 200)}`);
  }

  if (summaries.limitations?.topChunks?.length > 0) {
    parts.push(`Limitations: ${summaries.limitations.topChunks[0].substring(0, 200)}`);
  }

  return parts.join('\n\n');
}

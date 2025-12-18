/**
 * Quick Upload - Workflow automatique avec overlay unifié
 */

import { state as globalState, addDocument, addLog, updateDocumentStatus, updateDocumentExtraction, addChunks, addEmbedding } from '../state/state.js';
import { validatePDF } from '../utils/fileUtils.js';
import { extractTextFromPDF } from '../rag/pdfExtract.js';
import { createChunksForDocument } from '../rag/chunker.js';
import { generateNameSuggestions } from '../utils/namingSuggestions.js';
import { initEmbeddingModel, generateEmbeddingsForChunks, isModelLoaded } from '../rag/embeddings.js';
import { showLoadingOverlay, updateLoadingProgress, hideLoadingOverlay } from './LoadingOverlay.js';

/**
 * Lance le workflow d'upload rapide avec overlay unifié
 * @param {FileList} files - Les fichiers sélectionnés
 */
export async function showQuickUploadWorkflow(files) {
  const validFiles = Array.from(files).filter(f => validatePDF(f).valid);
  
  if (validFiles.length === 0) {
    addLog('error', 'Aucun fichier PDF valide');
    return;
  }

  const totalSteps = 4; // Upload, Extract, Chunk, Embed
  let currentStep = 0;

  const state = {
    files: validFiles,
    documents: [],
    extractions: [],
    chunks: [],
    embeddings: []
  };

  try {
    // === ETAPE 1: Enregistrement ===
    currentStep = 1;
    showLoadingOverlay('Upload Rapide', `${validFiles.length} document(s)`);
    updateLoadingProgress(5, 'Enregistrement des documents...', 'Etape 1/4');
    
    for (const file of validFiles) {
      const result = addDocument(file);
      if (result.success) {
        state.documents.push(result.doc);
      }
    }
    
    addLog('info', `${state.documents.length} documents enregistres`);
    await sleep(300);

    // === ETAPE 2: Extraction PDF ===
    currentStep = 2;
    updateLoadingProgress(15, 'Extraction du texte...', 'Etape 2/4');
    
    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i];
      const progress = 15 + ((i / state.documents.length) * 25);
      
      updateLoadingProgress(progress, `Extraction: ${doc.filename}`, `Document ${i + 1}/${state.documents.length}`);
      updateDocumentStatus(doc.id, 'extracting');

      try {
        const extractionData = await extractTextFromPDF(doc.file);
        updateDocumentExtraction(doc.id, extractionData);
        state.extractions.push({ docId: doc.id, ...extractionData });

        // Auto-renommage avec suggestion
        const suggestions = generateNameSuggestions(extractionData.text, doc.filename);
        if (suggestions.length > 0 && suggestions[0] !== doc.displayName) {
          doc.displayName = suggestions[0];
          const globalDoc = globalState.docs.find(d => d.id === doc.id);
          if (globalDoc) globalDoc.displayName = suggestions[0];
        }

        addLog('success', `Extrait: ${doc.filename} (${extractionData.pages} pages)`);
      } catch (error) {
        addLog('error', `Erreur extraction ${doc.filename}: ${error.message}`);
      }
    }

    // === ETAPE 3: Chunking ===
    currentStep = 3;
    updateLoadingProgress(45, 'Decoupage en chunks...', 'Etape 3/4');
    
    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i];
      const extraction = state.extractions.find(e => e.docId === doc.id);
      if (!extraction) continue;

      const progress = 45 + ((i / state.documents.length) * 15);
      updateLoadingProgress(progress, `Chunking: ${doc.displayName || doc.filename}`, `Document ${i + 1}/${state.documents.length}`);

      try {
        const sourceName = doc.displayName || doc.filename;
        const chunks = createChunksForDocument(
          extraction.text,
          sourceName,
          doc.id,
          500,
          1
        );

        addChunks(chunks);
        state.chunks.push(...chunks);
        addLog('info', `${chunks.length} chunks crees pour ${sourceName}`);
      } catch (error) {
        addLog('error', `Erreur chunking ${doc.filename}: ${error.message}`);
      }
    }

    // === ETAPE 4: Embeddings ===
    currentStep = 4;
    updateLoadingProgress(60, 'Generation des embeddings...', 'Etape 4/4');

    // Charger le modele si necessaire
    if (!isModelLoaded()) {
      updateLoadingProgress(62, 'Chargement modele embeddings...', 'Xenova/all-MiniLM-L6-v2');
      
      await initEmbeddingModel((pct) => {
        const progress = 62 + (pct * 0.15);
        updateLoadingProgress(progress, 'Chargement modele embeddings...', `${pct}%`);
      });
    }

    // Generer les embeddings
    updateLoadingProgress(78, 'Generation des vecteurs...', `${state.chunks.length} chunks`);
    
    const results = await generateEmbeddingsForChunks(state.chunks, (current, total) => {
      const progress = 78 + ((current / total) * 20);
      updateLoadingProgress(progress, `Embedding ${current}/${total}`, state.chunks[current - 1]?.text.substring(0, 40) + '...');
    });

    // Stocker les embeddings
    results.forEach(({ chunkId, vector }) => {
      addEmbedding(chunkId, vector);
    });
    state.embeddings = results;

    // === TERMINE ===
    updateLoadingProgress(100, 'Termine!', `${state.documents.length} docs, ${state.chunks.length} chunks, ${results.length} embeddings`);
    await sleep(800);
    
    hideLoadingOverlay();
    
    addLog('success', `Upload rapide termine: ${state.documents.length} documents, ${state.chunks.length} chunks, ${results.length} embeddings`);

    // Rafraichir l'UI
    window.dispatchEvent(new CustomEvent('state:docUpdated'));
    window.dispatchEvent(new CustomEvent('documents:updated'));
    window.dispatchEvent(new CustomEvent('chunks:updated'));
    window.dispatchEvent(new CustomEvent('embeddings:updated'));

  } catch (error) {
    hideLoadingOverlay();
    addLog('error', `Erreur upload rapide: ${error.message}`);
  }
}

/**
 * Utilitaire sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

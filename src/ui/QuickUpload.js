/**
 * Quick Upload - Workflow automatique avec overlay de chargement
 */

import { state as globalState, addDocument, addLog, updateDocumentStatus, updateDocumentExtraction, addChunks, addEmbedding } from '../state/state.js';
import { validatePDF } from '../utils/fileUtils.js';
import { extractTextFromPDF } from '../rag/pdfExtract.js';
import { createChunksForDocument } from '../rag/chunker.js';
import { generateNameSuggestions } from '../utils/namingSuggestions.js';
import { initEmbeddingModel, generateEmbeddingsForChunks, isModelLoaded } from '../rag/embeddings.js';
import { showLoadingOverlay, updateLoadingProgress, hideLoadingOverlay } from './LoadingOverlay.js';

/**
 * Lance le workflow d'upload rapide avec overlay
 */
export async function showQuickUploadWorkflow(files) {
  const validFiles = Array.from(files).filter(f => validatePDF(f).valid);
  
  if (validFiles.length === 0) {
    addLog('error', 'Aucun fichier PDF valide');
    return;
  }

  addLog('info', `Demarrage upload rapide: ${validFiles.length} fichier(s)`);
  
  // Afficher overlay
  showLoadingOverlay('Upload Rapide', `${validFiles.length} document(s)`);

  const state = {
    files: validFiles,
    documents: [],
    extractions: [],
    chunks: [],
    embeddings: []
  };

  try {
    // Etape 1: Enregistrement des documents
    updateLoadingProgress(5, 'Enregistrement des documents...', `${validFiles.length} fichiers`);
    
    for (const file of validFiles) {
      const doc = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filename: file.name,
        displayName: file.name.replace(/\.pdf$/i, ''),
        file: file,
        size: file.size,
        status: 'pending',
        uploadedAt: new Date().toISOString()
      };
      
      addDocument(doc);
      state.documents.push(doc);
    }

    // Etape 2: Extraction PDF
    updateLoadingProgress(10, 'Extraction du texte...', 'Analyse des PDFs');
    
    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i];
      const pct = 10 + ((i / state.documents.length) * 25);
      
      updateLoadingProgress(pct, `Extraction: ${doc.filename}`, `Document ${i + 1}/${state.documents.length}`);
      updateDocumentStatus(doc.id, 'extracting');

      try {
        const extractionData = await extractTextFromPDF(doc.file);
        updateDocumentExtraction(doc.id, extractionData);
        state.extractions.push({ docId: doc.id, ...extractionData });
        
        // Generer suggestions de nom
        const suggestions = generateNameSuggestions(extractionData.text, doc.filename);
        if (suggestions.length > 0 && suggestions[0] !== doc.displayName) {
          doc.displayName = suggestions[0];
          // Update in global state
          const globalDoc = globalState.docs.find(d => d.id === doc.id);
          if (globalDoc) globalDoc.displayName = suggestions[0];
        }
        
        addLog('success', `Extrait: ${doc.filename} (${extractionData.pages} pages)`);
      } catch (error) {
        addLog('error', `Erreur extraction ${doc.filename}: ${error.message}`);
      }
    }

    // Etape 3: Chunking
    updateLoadingProgress(40, 'Decoupage en chunks...', 'Segmentation semantique');
    
    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i];
      const extraction = state.extractions.find(e => e.docId === doc.id);
      
      if (!extraction) continue;
      
      const pct = 40 + ((i / state.documents.length) * 20);
      updateLoadingProgress(pct, `Chunking: ${doc.displayName}`, `Document ${i + 1}/${state.documents.length}`);

      const docChunks = createChunksForDocument(doc.id, extraction.text, {
        chunkSize: globalState.settings.chunkSize || 500,
        overlap: globalState.settings.overlap || 50,
        source: doc.displayName
      });

      addChunks(docChunks);
      state.chunks.push(...docChunks);
      
      addLog('info', `${docChunks.length} chunks crees pour ${doc.displayName}`);
    }

    // Etape 4: Embeddings
    updateLoadingProgress(65, 'Generation des embeddings...', 'Chargement du modele');
    
    if (!isModelLoaded()) {
      await initEmbeddingModel((pct) => {
        updateLoadingProgress(65 + (pct * 0.15), 'Chargement modele embeddings...', 'Xenova/all-MiniLM-L6-v2');
      });
    }

    updateLoadingProgress(80, 'Vectorisation...', `${state.chunks.length} chunks`);
    
    const results = await generateEmbeddingsForChunks(state.chunks, (current, total) => {
      const pct = 80 + ((current / total) * 18);
      updateLoadingProgress(pct, `Embedding ${current}/${total}`, state.chunks[current - 1]?.text.substring(0, 40) + '...');
    });

    // Stocker les embeddings
    results.forEach(({ chunkId, vector }) => {
      addEmbedding(chunkId, vector);
    });
    state.embeddings = results;

    // Termine
    updateLoadingProgress(100, 'Termine!', `${state.documents.length} docs, ${state.chunks.length} chunks, ${results.length} embeddings`);
    
    addLog('success', `Upload rapide termine: ${state.documents.length} documents, ${state.chunks.length} chunks, ${results.length} embeddings`);

    // Attendre un peu avant de fermer
    await new Promise(r => setTimeout(r, 1000));
    hideLoadingOverlay();

    // Rafraichir l'UI
    window.dispatchEvent(new CustomEvent('documents:updated'));
    window.dispatchEvent(new CustomEvent('chunks:updated'));
    window.dispatchEvent(new CustomEvent('embeddings:updated'));

  } catch (error) {
    hideLoadingOverlay();
    addLog('error', `Erreur upload rapide: ${error.message}`);
  }
}

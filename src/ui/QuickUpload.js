/**
 * Quick Upload - Workflow automatique simplifie
 */

import { state as globalState, addDocument, addLog, updateDocumentStatus, updateDocumentExtraction, addChunks, addEmbedding, state } from '../state/state.js';
import { validatePDF } from '../utils/fileUtils.js';
import { extractTextFromPDF } from '../rag/pdfExtract.js';
import { createChunksForDocument } from '../rag/chunker.js';
import { generateNameSuggestions } from '../utils/namingSuggestions.js';
import { initEmbeddingModel, generateEmbeddingsForChunks, isModelLoaded } from '../rag/embeddings.js';
import { enrichAllDocuments } from '../rag/documentEnricher.js';
import { isModelReady } from '../llm/webllm.js';
import { createProgressIndicator, updateProgressIndicator, removeProgressIndicator } from './ProgressIndicator.js';
import { getEmbeddingCancellationToken } from './IngestionPanel.js';

/**
 * Affiche/cache le spinner de chargement
 */
function showLoadingSpinner(text = 'Chargement...') {
  const spinner = document.getElementById('model-loading-spinner');
  const loadingText = document.getElementById('model-loading-text');
  if (spinner) {
    spinner.classList.remove('hidden');
    if (loadingText) loadingText.textContent = text;
  }
}

function hideLoadingSpinner() {
  const spinner = document.getElementById('model-loading-spinner');
  if (spinner) spinner.classList.add('hidden');
}

/**
 * Affiche un popup proposant l'enrichissement des documents
 * @returns {Promise<boolean>} - true si l'utilisateur accepte, false sinon
 */
function showEnrichmentProposal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-[2000] p-4';
    
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Enrichir les documents ?</h3>
            <p class="text-sm text-gray-600">Extraction automatique des métadonnées</p>
          </div>
        </div>
        
        <p class="text-sm text-gray-700 mb-6">
          Voulez-vous enrichir automatiquement les documents avec des métadonnées structurées 
          (titre, auteurs, année, domaine, question de recherche, méthodologie, résultats clés) ?
          Cela améliorera la qualité de la revue RAG.
        </p>
        
        <div class="flex items-center gap-2 mb-6">
          <input type="checkbox" id="skip-enrichment-checkbox" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
          <label for="skip-enrichment-checkbox" class="text-sm text-gray-600 cursor-pointer">
            Ne plus demander
          </label>
        </div>
        
        <div class="flex gap-3">
          <button id="enrichment-yes-btn" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Oui, enrichir
          </button>
          <button id="enrichment-later-btn" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
            Plus tard
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const yesBtn = modal.querySelector('#enrichment-yes-btn');
    const laterBtn = modal.querySelector('#enrichment-later-btn');
    const skipCheckbox = modal.querySelector('#skip-enrichment-checkbox');
    
    const close = (result) => {
      if (skipCheckbox.checked) {
        localStorage.setItem('skip-enrichment-prompt', 'true');
      }
      modal.remove();
      resolve(result);
    };
    
    yesBtn.addEventListener('click', () => close(true));
    laterBtn.addEventListener('click', () => close(false));
    
    // Fermer en cliquant en dehors
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close(false);
    });
  });
}

/**
 * Lance le workflow d'upload rapide
 */
export async function showQuickUploadWorkflow(files) {
  const validFiles = Array.from(files).filter(f => validatePDF(f).valid);
  
  if (validFiles.length === 0) {
    addLog('error', 'Aucun fichier PDF valide');
    return;
  }

  const state = {
    files: validFiles,
    documents: [],
    extractions: [],
    chunks: [],
    embeddings: []
  };

  try {
    showLoadingSpinner('Enregistrement...');
    
    // === ETAPE 1: Enregistrement ===
    for (const file of validFiles) {
      const result = addDocument(file);
      if (result.success) {
        state.documents.push(result.doc);
      }
    }
    addLog('info', `${state.documents.length} documents enregistres`);

    // === ETAPE 2: Extraction PDF ===
    showLoadingSpinner('Extraction PDF...');
    
    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i];
      updateDocumentStatus(doc.id, 'extracting');

      try {
        const extractionData = await extractTextFromPDF(doc.file);
        updateDocumentExtraction(doc.id, extractionData);
        state.extractions.push({ docId: doc.id, ...extractionData });

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
    showLoadingSpinner('Chunking...');

    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i];
      const extraction = state.extractions.find(e => e.docId === doc.id);
      if (!extraction) continue;

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
    // Obtenir le token d'annulation
    const embeddingCancellationToken = getEmbeddingCancellationToken();
    embeddingCancellationToken.cancelled = false;
    
    // Marquer la génération comme automatique et en cours IMMÉDIATEMENT
    // Cela désactive le bouton "Generate embeddings" avant même de commencer
    state.embeddingGeneration = {
      inProgress: true,
      isAutomatic: true,
      cancellable: true,
      currentProgress: 0,
      totalProgress: state.chunks.length
    };
    // Émettre l'événement IMMÉDIATEMENT pour désactiver le bouton
    window.dispatchEvent(new CustomEvent('embedding:stateChanged', { 
      detail: state.embeddingGeneration 
    }));

    showLoadingSpinner('Embeddings...');

    if (!isModelLoaded()) {
      showLoadingSpinner('Chargement modele IA...');
      await initEmbeddingModel((progress) => {
        showLoadingSpinner(`Chargement modèle ${progress}%...`);
      });
    }

    showLoadingSpinner(`Embeddings (${state.chunks.length} chunks)...`);

    try {
      const results = await generateEmbeddingsForChunks(state.chunks, (current, total) => {
        showLoadingSpinner(`Embeddings ${current}/${total}...`);
        
        // Mettre à jour l'état global
        state.embeddingGeneration.currentProgress = current;
        state.embeddingGeneration.totalProgress = total;
        window.dispatchEvent(new CustomEvent('embedding:progress', { 
          detail: { current, total } 
        }));
        
        // Vérifier si annulé
        if (embeddingCancellationToken.cancelled) {
          throw new Error('Génération annulée par l\'utilisateur');
        }
      }, {
        shouldCancel: () => embeddingCancellationToken.cancelled
      });

      results.forEach(({ chunkId, vector }) => {
        if (!embeddingCancellationToken.cancelled) {
          addEmbedding(chunkId, vector);
        }
      });
      state.embeddings = results;

      hideLoadingSpinner();
      
      if (!embeddingCancellationToken.cancelled) {
        addLog('success', `Upload termine: ${state.documents.length} docs, ${state.chunks.length} chunks, ${results.length} embeddings`);
      } else {
        addLog('warning', `Génération annulée - ${results.length} embeddings générés`);
      }
    } catch (error) {
      if (!embeddingCancellationToken.cancelled) {
        hideLoadingSpinner();
        addLog('error', `Erreur embeddings: ${error.message}`);
        throw error;
      } else {
        addLog('info', 'Génération annulée par l\'utilisateur');
        hideLoadingSpinner();
      }
    } finally {
      // Réinitialiser l'état
      state.embeddingGeneration.inProgress = false;
      state.embeddingGeneration.isAutomatic = false;
      window.dispatchEvent(new CustomEvent('embedding:stateChanged', { 
        detail: state.embeddingGeneration 
      }));
      embeddingCancellationToken.cancelled = false;
    }

    // === ETAPE 5: Proposition d'Enrichissement ===
    if (isModelReady() && !localStorage.getItem('skip-enrichment-prompt')) {
      const shouldEnrich = await showEnrichmentProposal();
      if (shouldEnrich) {
        try {
          const indicatorId = 'auto-enrichment';
          createProgressIndicator(indicatorId, {
            title: 'Enrichissement automatique',
            subtitle: 'Extraction des métadonnées...',
            position: 'bottom-right'
          });

          await enrichAllDocuments((progress) => {
            if (progress.status === 'processing' || progress.status === 'extracting' || progress.status === 'rag_summary') {
              const percent = progress.current && progress.total 
                ? Math.round((progress.current / progress.total) * 100) 
                : 0;
              updateProgressIndicator(
                indicatorId,
                percent,
                progress.filename || progress.message || 'Enrichissement en cours...'
              );
            } else if (progress.status === 'complete') {
              const successCount = progress.results?.filter(r => r.enrichment).length || 0;
              const totalCount = progress.results?.length || 0;
              updateProgressIndicator(
                indicatorId,
                100,
                `Terminé: ${successCount}/${totalCount} documents enrichis`
              );
              setTimeout(() => {
                removeProgressIndicator(indicatorId, true);
              }, 2000);
            }
          });

          addLog('success', 'Enrichissement terminé');
        } catch (error) {
          addLog('warning', `Enrichissement échoué: ${error.message}`);
          removeProgressIndicator('auto-enrichment', false);
        }
      }
    } else if (!isModelReady()) {
      addLog('info', 'Modèle LLM non chargé, enrichissement ignoré');
    }

    // Rafraichir l'UI
    window.dispatchEvent(new CustomEvent('state:docUpdated'));
    window.dispatchEvent(new CustomEvent('documents:updated'));
    window.dispatchEvent(new CustomEvent('chunks:updated'));
    window.dispatchEvent(new CustomEvent('embeddings:updated'));

  } catch (error) {
    hideLoadingSpinner();
    addLog('error', `Erreur upload rapide: ${error.message}`);
  }
}

/**
 * Composant pour l'upload rapide avec workflow automatique guidé
 */

import { state, addDocument, addLog, updateDocumentStatus, updateDocumentExtraction, addChunks } from '../state/state.js';
import { validatePDF } from '../utils/fileUtils.js';
import { extractTextFromPDF } from '../rag/pdfExtract.js';
import { createChunksForDocument } from '../rag/chunker.js';
import { generateNameSuggestions } from '../utils/namingSuggestions.js';
import { initEmbeddingModel, generateEmbeddingsForChunks } from '../rag/embeddings.js';

/**
 * Affiche la modal de workflow d'upload rapide
 * @param {FileList} files - Les fichiers sélectionnés
 */
export function showQuickUploadWorkflow(files) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.id = 'quick-upload-modal';

  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold">Upload Rapide - Traitement Automatique</h2>
          <button id="close-modal-btn" class="text-white hover:text-gray-200 text-2xl">&times;</button>
        </div>
        <p class="text-blue-100 text-sm mt-1">Traitement automatique guidé de ${files.length} document(s)</p>
      </div>

      <!-- Progress Steps -->
      <div class="px-6 py-4 border-b bg-gray-50">
        <div class="flex items-center space-x-4">
          <div id="step-upload" class="flex items-center">
            <div class="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">✓</div>
            <span class="ml-2 text-sm font-medium text-green-700">Upload</span>
          </div>
          <div class="flex-1 h-px bg-gray-300"></div>

          <div id="step-extract" class="flex items-center">
            <div class="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold animate-pulse">2</div>
            <span class="ml-2 text-sm font-medium text-gray-700">Extraction</span>
          </div>
          <div class="flex-1 h-px bg-gray-300"></div>

          <div id="step-naming" class="flex items-center">
            <div class="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-bold">3</div>
            <span class="ml-2 text-sm font-medium text-gray-500">Noms</span>
          </div>
          <div class="flex-1 h-px bg-gray-300"></div>

          <div id="step-chunking" class="flex items-center">
            <div class="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-bold">4</div>
            <span class="ml-2 text-sm font-medium text-gray-500">Chunking</span>
          </div>
          <div class="flex-1 h-px bg-gray-300"></div>

          <div id="step-embeddings" class="flex items-center">
            <div class="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-bold">5</div>
            <span class="ml-2 text-sm font-medium text-gray-500">Embeddings</span>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div id="modal-content" class="flex-1 overflow-y-auto p-6">
        <div id="step-content" class="space-y-4">
          <!-- Contenu dynamique selon l'étape -->
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t bg-gray-50 flex justify-between">
        <button id="cancel-btn" class="px-4 py-2 text-gray-600 hover:text-gray-800">
          Annuler
        </button>
        <div class="flex space-x-3">
          <button id="prev-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 hidden">
            Précédent
          </button>
          <button id="next-btn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Continuer
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Démarrer le workflow
  startWorkflow(files, modal);

  // Gestionnaire de fermeture
  modal.querySelector('#close-modal-btn').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('#cancel-btn').addEventListener('click', () => {
    modal.remove();
  });

  // Cliquer en dehors ferme la modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Démarre le workflow automatique
 */
async function startWorkflow(files, modal) {
  const stepContent = modal.querySelector('#step-content');
  const nextBtn = modal.querySelector('#next-btn');
  const prevBtn = modal.querySelector('#prev-btn');

  let currentStep = 0;
  const workflowSteps = [
    { name: 'upload', fn: showUploadStep },
    { name: 'extract', fn: showExtractStep },
    { name: 'naming', fn: showNamingStep },
    { name: 'chunking', fn: showChunkingStep },
    { name: 'embeddings', fn: showEmbeddingsStep }
  ];

  // État du workflow
  const workflowState = {
    files: Array.from(files),
    documents: [],
    extractions: [],
    chunks: [],
    embeddings: []
  };

  function updateStepUI(stepIndex) {
    // Mettre à jour les indicateurs visuels
    const steps = ['upload', 'extract', 'naming', 'chunking', 'embeddings'];
    steps.forEach((step, index) => {
      const stepEl = modal.querySelector(`#step-${step}`);
      const circle = stepEl.querySelector('div');
      const text = stepEl.querySelector('span');

      if (index < stepIndex) {
        // Étape terminée
        circle.className = 'w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold';
        circle.textContent = '✓';
        text.className = 'ml-2 text-sm font-medium text-green-700';
      } else if (index === stepIndex) {
        // Étape en cours
        circle.className = 'w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold animate-pulse';
        circle.textContent = (index + 1).toString();
        text.className = 'ml-2 text-sm font-medium text-blue-700';
      } else {
        // Étape à venir
        circle.className = 'w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-bold';
        circle.textContent = (index + 1).toString();
        text.className = 'ml-2 text-sm font-medium text-gray-500';
      }
    });

    // Boutons navigation
    prevBtn.classList.toggle('hidden', stepIndex === 0);
    nextBtn.textContent = stepIndex === workflowSteps.length - 1 ? 'Terminer' : 'Continuer';
  }

  async function executeStep(stepIndex) {
    currentStep = stepIndex;
    updateStepUI(stepIndex);

    const step = workflowSteps[stepIndex];
    await step.fn(workflowState, stepContent, modal);

    // Auto-continuer après un délai si c'est une étape automatique
    if (['upload', 'extract', 'chunking', 'embeddings'].includes(step.name)) {
      setTimeout(() => {
        if (currentStep === stepIndex && stepIndex < workflowSteps.length - 1) {
          executeStep(stepIndex + 1);
        }
      }, 1500);
    }
  }

  // Gestion des boutons
  nextBtn.addEventListener('click', () => {
    if (currentStep < workflowSteps.length - 1) {
      executeStep(currentStep + 1);
    } else {
      // Terminer
      modal.remove();
      addLog('success', `Upload rapide terminé : ${workflowState.files.length} documents traités`);
    }
  });

  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      executeStep(currentStep - 1);
    }
  });

  // Démarrer
  await executeStep(0);
}

/**
 * Étape 1: Upload des fichiers
 */
function showUploadStep(state, content, modal) {
  content.innerHTML = `
    <div class="text-center py-8">
      <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">Fichiers uploadés avec succès</h3>
      <p class="text-gray-600 mb-4">Validation et préparation des documents...</p>
      <div class="space-y-2">
        ${state.files.map(file => `
          <div class="flex items-center justify-between bg-gray-50 p-3 rounded">
            <span class="text-sm font-medium">${file.name}</span>
            <span class="text-xs text-gray-500">${(file.size / 1024 / 1024).toFixed(1)} MB</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Ajouter les documents au state global (comme le fait la Dropzone)
  state.documents = state.files.map(file => {
    const result = addDocument(file);
    if (result.success) {
      return result.doc;
    }
    return null;
  }).filter(Boolean);
}

/**
 * Étape 2: Extraction du texte
 */
async function showExtractStep(state, content, modal) {
  content.innerHTML = `
    <div class="py-8">
      <h3 class="text-lg font-semibold text-gray-900 mb-4 text-center">Extraction du texte en cours...</h3>
      <div class="space-y-4">
        ${state.documents.map(doc => `
          <div class="bg-gray-50 p-4 rounded">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium">${doc.filename}</span>
              <div id="progress-${doc.id}" class="text-xs text-gray-500">0%</div>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div id="bar-${doc.id}" class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Extraire le texte pour chaque document
  for (const doc of state.documents) {
    try {
      updateDocumentStatus(doc.id, 'extracting');
      const progressBar = modal.querySelector(`#bar-${doc.id}`);
      const progressText = modal.querySelector(`#progress-${doc.id}`);

      const extractionData = await extractTextFromPDF(doc.file);

      updateDocumentExtraction(doc.id, extractionData);
      state.extractions.push({ docId: doc.id, ...extractionData });

      progressBar.style.width = '100%';
      progressText.textContent = 'Terminé';

      addLog('success', `Texte extrait: ${doc.filename} (${extractionData.pages} pages, ${extractionData.text.length} chars)`);

    } catch (error) {
      addLog('error', `Erreur extraction ${doc.filename}: ${error.message}`);
      progressBar.style.backgroundColor = '#ef4444';
      progressText.textContent = 'Erreur';
    }
  }
}

/**
 * Étape 3: Suggestions de noms
 */
function showNamingStep(state, content, modal) {
  content.innerHTML = `
    <div class="py-8">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Renommer les documents (optionnel)</h3>
      <p class="text-gray-600 mb-6">Pour chaque document, choisissez un nom plus descriptif ou gardez le nom original.</p>

      <div class="space-y-6">
        ${state.documents.map(doc => {
          const extraction = state.extractions.find(e => e.docId === doc.id);
          const suggestions = extraction ? generateNameSuggestions(extraction.text, doc.filename) : [doc.filename.replace(/\.pdf$/i, '')];

          return `
            <div class="border rounded-lg p-4">
              <h4 class="font-medium text-gray-900 mb-3">${doc.filename}</h4>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                ${suggestions.map((suggestion, index) => `
                  <label class="flex items-center">
                    <input type="radio" name="name-${doc.id}" value="${suggestion}"
                           class="mr-2" ${index === 0 ? 'checked' : ''}>
                    <span class="text-sm">${suggestion}</span>
                  </label>
                `).join('')}
              </div>

              <div class="flex items-center">
                <input type="radio" name="name-${doc.id}" value="custom" class="mr-2">
                <input type="text" placeholder="Nom personnalisé..."
                       class="flex-1 px-3 py-1 border rounded text-sm"
                       id="custom-${doc.id}">
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Gérer les inputs personnalisés
  state.documents.forEach(doc => {
    const customRadio = modal.querySelector(`input[name="name-${doc.id}"][value="custom"]`);
    const customInput = modal.querySelector(`#custom-${doc.id}`);

    customRadio.addEventListener('change', () => {
      customInput.focus();
    });

    customInput.addEventListener('input', () => {
      if (customInput.value.trim()) {
        customRadio.checked = true;
      }
    });
  });
}

/**
 * Étape 4: Chunking
 */
async function showChunkingStep(state, content, modal) {
  content.innerHTML = `
    <div class="py-8">
      <h3 class="text-lg font-semibold text-gray-900 mb-4 text-center">Découpage en chunks...</h3>
      <div class="space-y-4">
        ${state.documents.map(doc => `
          <div class="bg-gray-50 p-4 rounded">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium">${doc.filename}</span>
              <div id="chunks-${doc.id}" class="text-xs text-gray-500">Création...</div>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div id="chunks-bar-${doc.id}" class="bg-purple-600 h-2 rounded-full transition-all duration-300" style="width: 100%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Créer les chunks pour chaque document
  for (const doc of state.documents) {
    try {
      const extraction = state.extractions.find(e => e.docId === doc.id);
      if (!extraction) continue;

      const chunks = createChunksForDocument(
        extraction.text,
        doc.filename,
        doc.id,
        500, // chunkSize
        1    // overlapSentences
      );

      addChunks(chunks);
      state.chunks.push(...chunks);

      const chunksCountEl = modal.querySelector(`#chunks-${doc.id}`);
      chunksCountEl.textContent = `${chunks.length} chunks créés`;

      addLog('success', `Chunks créés: ${doc.filename} (${chunks.length} chunks)`);

    } catch (error) {
      addLog('error', `Erreur chunking ${doc.filename}: ${error.message}`);
      const chunksCountEl = modal.querySelector(`#chunks-${doc.id}`);
      chunksCountEl.textContent = 'Erreur';
      chunksCountEl.style.color = '#ef4444';
    }
  }
}

/**
 * Étape 5: Génération d'embeddings
 */
async function showEmbeddingsStep(state, content, modal) {
  content.innerHTML = `
    <div class="py-8">
      <h3 class="text-lg font-semibold text-gray-900 mb-4 text-center">Génération des embeddings...</h3>
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div class="flex items-center">
          <div id="backend-badge" class="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600 mr-3">
            Detection...
          </div>
          <span class="text-sm text-blue-700">Utilisation du backend le plus performant disponible</span>
        </div>
      </div>

      <div class="space-y-4">
        <div class="bg-gray-50 p-4 rounded">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Embeddings pour ${state.chunks.length} chunks</span>
            <div id="embeddings-progress" class="text-xs text-gray-500">0 / ${state.chunks.length}</div>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div id="embeddings-bar" class="bg-green-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Mettre à jour le badge backend quand il sera détecté
  const backendBadge = modal.querySelector('#backend-badge');
  const updateBadge = (backend) => {
    let className, text;
    switch (backend) {
      case 'webgpu':
        className = 'bg-green-100 text-green-700';
        text = 'WebGPU';
        break;
      case 'webgpu-fallback':
        className = 'bg-blue-100 text-blue-700';
        text = 'WebGPU*';
        break;
      default:
        className = 'bg-yellow-100 text-yellow-700';
        text = 'WASM';
    }
    backendBadge.className = `px-2 py-1 text-xs rounded ${className}`;
    backendBadge.textContent = text;
  };

  // Écouter la détection du backend
  const badgeListener = (e) => updateBadge(e.detail);
  window.addEventListener('embeddings:backendDetected', badgeListener);

  try {
    // Générer les embeddings
    const progressBar = modal.querySelector('#embeddings-bar');
    const progressText = modal.querySelector('#embeddings-progress');

    const results = await generateEmbeddingsForChunks(state.chunks, (current, total) => {
      const pct = Math.round((current / total) * 100);
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `${current} / ${total}`;
    });

    state.embeddings = results;
    addLog('success', `${results.length} embeddings générés avec succès`);

  } catch (error) {
    addLog('error', `Échec génération embeddings: ${error.message}`);

    // Afficher un message d'erreur dans la modal
    content.innerHTML += `
      <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded">
        <p class="text-red-700 text-sm">
          ⚠️ Les embeddings n'ont pas pu être générés. L'application fonctionne en mode texte seulement.
        </p>
        <p class="text-red-600 text-xs mt-1">
          ${error.message}
        </p>
      </div>
    `;

    // Permettre de continuer quand même
    setTimeout(() => {
      const nextBtn = modal.querySelector('#next-btn');
      if (nextBtn) {
        nextBtn.textContent = 'Continuer sans embeddings';
        nextBtn.disabled = false;
      }
    }, 2000);

    return;
  } finally {
    window.removeEventListener('embeddings:backendDetected', badgeListener);
  }
}

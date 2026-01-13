/**
 * Modal pour afficher le dashboard Revue RAG
 */

import { ragReviewAgent } from '../rag/RAGReviewAgent.js';
import { addLog } from '../state/state.js';
import { isModelReady, getLoadedModel } from '../llm/webllm.js';
import { state } from '../state/state.js';
import { CitationManager } from '../rag/citationManager.js';
import { createSourcesPanel } from './SourcesPanel.js';
import { renderCitationsInteractive } from '../utils/citationParser.js';
import { validateFinalReview } from '../rag/reviewValidator.js';
import { parseMarkdown } from '../utils/markdown.js';
import { createProgressIndicator, updateProgressIndicator, removeProgressIndicator } from './ProgressIndicator.js';
import { getEnrichmentStats } from '../rag/documentEnricher.js';

let ragReviewModal = null;

export function showRAGReviewModal() {
  console.log('Bouton RAG clique - ouverture modal');
  if (!ragReviewModal) {
    ragReviewModal = document.createElement('div');
    ragReviewModal.id = 'rag-review-modal';
    ragReviewModal.className = 'fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-[1000] p-4 hidden';
    document.body.appendChild(ragReviewModal);
  }

  ragReviewModal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <h2 class="text-xl font-bold text-gray-800">Revue Litteraire Academique RAG</h2>
        <div class="flex gap-2">
          <div class="flex items-center gap-2 text-sm text-gray-600">
            <span id="review-status-badge" class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
              En attente
            </span>
            <span id="review-status-text">Pret a analyser</span>
          </div>
          <button id="start-rag-review-btn" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors" title="Lancer la revue litteraire RAG">
            Lancer Revue
          </button>
          <button id="cancel-rag-review-btn" class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors hidden" title="Annuler la revue en cours">
            Annuler
          </button>
          <button id="export-rag-review-btn" class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors hidden" title="Exporter la revue litteraire au format HTML">
            Exporter
          </button>
          <button id="new-rag-review-btn" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors hidden" title="Lancer une nouvelle revue">
            Nouvelle Revue
          </button>
          <button id="close-rag-review-modal" class="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div id="rag-review-content" class="flex-1 overflow-hidden">
        <!-- Initial State -->
        <div id="rag-review-init" class="flex flex-col items-center justify-center h-full text-gray-500">
          <div class="text-center max-w-md">
            <div class="text-6xl mb-4">
              <svg class="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
              </svg>
            </div>
            <h3 class="text-xl font-semibold mb-2">Revue Litteraire RAG</h3>
            <p class="text-sm mb-4">
              Analyse automatique de vos documents PDF avec RAG local.<br>
              <strong>1 appel LLM par document + 1 synthese finale</strong>
            </p>
            <p class="text-xs text-gray-400">
              Necessite au minimum 1 document PDF ingere dans la bibliotheque.
            </p>
          </div>
        </div>

        <!-- Loading State -->
        <div id="rag-review-loading" class="flex flex-col h-full text-gray-500 hidden">
          <div class="flex-1 overflow-auto p-4">
            <!-- Header avec spinner et titre -->
            <div class="text-center mb-4">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2 mx-auto"></div>
              <h3 class="text-lg font-semibold">Generation en cours...</h3>
              <p id="loading-message" class="text-sm">Analyse des documents avec RAG</p>
            </div>

            <!-- Progress Bar -->
            <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div id="review-progress-bar" class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: 0%"></div>
            </div>
            <p id="review-progress-text" class="text-sm text-gray-600 mb-4">0/0 documents</p>

            <!-- Document Status List -->
            <div id="documents-status" class="mb-4 space-y-2 max-h-32 overflow-y-auto"></div>

            <!-- Streaming Text Area -->
            <div id="streaming-area" class="bg-gray-50 border rounded-lg p-4 max-h-96 overflow-y-auto">
              <h4 class="font-semibold mb-2 text-gray-700">Generation en cours :</h4>
              <pre id="streaming-text" class="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed"></pre>
            </div>

            <!-- Controls -->
            <div class="mt-4 flex justify-between items-center">
              <button id="toggle-autoscroll" class="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs rounded transition-colors">
                Autoscroll: ON
              </button>

              <!-- Debug Panel -->
              <div id="debug-panel" class="flex-1 ml-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                <div class="font-semibold mb-1">Debug:</div>
                <div id="debug-status">Aucun streaming</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Results State -->
        <div id="rag-review-results" class="h-full overflow-auto hidden">
          <div class="p-6 space-y-6">
            <!-- Global Stats -->
            <div id="review-stats" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>

            <!-- Document Mapping -->
            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="text-lg font-semibold mb-3">Documents Analyses</h3>
              <div id="document-mapping" class="space-y-2"></div>
            </div>

            <!-- Final Review -->
            <div class="bg-white border rounded-lg p-6">
              <h3 class="text-xl font-semibold mb-4 text-gray-800">Revue Litteraire Finale</h3>
              <div id="final-review-content" class="prose prose-sm max-w-none text-gray-700 whitespace-pre-line"></div>
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div id="rag-review-error" class="flex flex-col items-center justify-center h-full text-red-500 hidden">
          <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h3 class="text-lg font-semibold mb-2">Erreur de generation</h3>
          <p id="rag-error-message" class="text-center max-w-md"></p>
          <button id="retry-rag-review-btn" class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Reessayer
          </button>
        </div>
      </div>
    </div>
  `;

  // Event Listeners
  setupEventListeners();

  // Show modal
  ragReviewModal.classList.remove('hidden');

  // Initial state
  updateModalState();
}

export function hideRAGReviewModal() {
  if (ragReviewModal) {
    ragReviewModal.classList.add('hidden');
  }
}


/**
 * Configure tous les event listeners
 */
function setupEventListeners() {
  ragReviewModal.querySelector('#close-rag-review-modal').addEventListener('click', hideRAGReviewModal);
  ragReviewModal.querySelector('#start-rag-review-btn').addEventListener('click', startLiteratureReview);
  ragReviewModal.querySelector('#cancel-rag-review-btn').addEventListener('click', cancelLiteratureReview);
  ragReviewModal.querySelector('#export-rag-review-btn').addEventListener('click', exportReview);
  ragReviewModal.querySelector('#new-rag-review-btn').addEventListener('click', startNewReview);

  const autoscrollBtn = ragReviewModal.querySelector('#toggle-autoscroll');
  if (autoscrollBtn) {
    autoscrollBtn.addEventListener('click', () => {
      streamingState.autoScroll = !streamingState.autoScroll;
      autoscrollBtn.textContent = `Autoscroll: ${streamingState.autoScroll ? 'ON' : 'OFF'}`;
    });
  }
}

/**
 * Lance une nouvelle revue (reset et relance)
 */
function startNewReview() {
  // Sauvegarder la revue actuelle dans l'historique si elle existe
  if (state.litReviewFinal) {
    if (!state.reviewHistory) state.reviewHistory = [];
    state.reviewHistory.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      type: 'literature_review',
      data: { ...state.litReviewFinal }
    });
  }
  
  // Reset de l'etat
  state.litReviewFinal = null;
  streamingState.cancelRequested = false;
  
  // Mise a jour de l'interface
  updateModalState();
  
  // Relancer la revue
  startLiteratureReview();
}

/**
 * Met a jour l'etat du modal selon les donnees disponibles
 */
function updateModalState() {
  const hasReview = state.litReviewFinal !== null;
  const hasDocuments = state.docs.filter(d => d.status === 'extracted').length > 0;
  const isRunning = state.ui.isReviewRunning;

  // Vérifier l'état d'enrichissement
  const enrichmentStats = getEnrichmentStats();
  const allEnriched = enrichmentStats.enriched === enrichmentStats.total && enrichmentStats.total > 0;

  const initDiv = ragReviewModal.querySelector('#rag-review-init');
  const loadingDiv = ragReviewModal.querySelector('#rag-review-loading');
  const resultsDiv = ragReviewModal.querySelector('#rag-review-results');
  const startBtn = ragReviewModal.querySelector('#start-rag-review-btn');
  const cancelBtn = ragReviewModal.querySelector('#cancel-rag-review-btn');
  const exportBtn = ragReviewModal.querySelector('#export-rag-review-btn');
  const newBtn = ragReviewModal.querySelector('#new-rag-review-btn');
  const statusBadge = ragReviewModal.querySelector('#review-status-badge');
  const statusText = ragReviewModal.querySelector('#review-status-text');

  if (isRunning && !streamingState.cancelRequested) {
    initDiv.classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    startBtn.disabled = true;
    startBtn.textContent = 'Analyse en cours...';
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    if (newBtn) newBtn.classList.add('hidden');
    statusBadge.className = 'inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800';
    statusBadge.textContent = 'En cours';
    statusText.textContent = 'Generation en cours';
  } else if (hasReview && !streamingState.cancelRequested) {
    initDiv.classList.add('hidden');
    loadingDiv.classList.add('hidden');
    resultsDiv.classList.remove('hidden');
    startBtn.classList.add('hidden');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    exportBtn.classList.remove('hidden');
    if (newBtn) newBtn.classList.remove('hidden');
    statusBadge.className = 'inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800';
    statusBadge.textContent = 'Terminee';
    statusText.textContent = 'Revue prete';
    displayFinalReview();
  } else {
    initDiv.classList.remove('hidden');
    loadingDiv.classList.add('hidden');
    resultsDiv.classList.add('hidden');
    startBtn.classList.remove('hidden');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    exportBtn.classList.add('hidden');
    if (newBtn) newBtn.classList.add('hidden');
    // Vérifier si tous les documents sont enrichis
    if (hasDocuments && allEnriched) {
      startBtn.disabled = false;
      statusBadge.className = 'inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800';
      statusBadge.textContent = 'Pret';
      statusText.textContent = `${state.docs.filter(d => d.status === 'extracted').length} document(s) pret(s)`;
      startBtn.textContent = 'Lancer Revue';
    } else if (hasDocuments && !allEnriched) {
      startBtn.disabled = true;
      statusBadge.className = 'inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800';
      statusBadge.textContent = 'Enrichissement requis';
      statusText.textContent = `${enrichmentStats.enriched}/${enrichmentStats.total} documents enrichis - Enrichissez tous les documents pour lancer la revue`;
      startBtn.textContent = `Enrichir d'abord (${enrichmentStats.enriched}/${enrichmentStats.total})`;
    } else {
      startBtn.disabled = true;
      statusBadge.className = 'inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800';
      statusBadge.textContent = 'En attente';
      statusText.textContent = 'Aucun document';
      startBtn.textContent = 'Ajouter des PDFs d\'abord';
    }
  }
}

// State pour le streaming en temps reel
let streamingState = {
  documents: new Map(),
  synthesis: { status: 'idle', partialText: '', finalText: '', startedAt: null, endedAt: null, error: null },
  autoScroll: true,
  cancelRequested: false
};

/**
 * Annule la revue litteraire RAG en cours
 */
function cancelLiteratureReview() {
  console.log('ANNULATION REVUE RAG demandee');
  state.ui.isReviewRunning = false;
  streamingState.cancelRequested = true;

  const cancelBtn = ragReviewModal.querySelector('#cancel-rag-review-btn');
  const startBtn = ragReviewModal.querySelector('#start-rag-review-btn');
  const statusBadge = ragReviewModal.querySelector('#review-status-badge');
  const statusText = ragReviewModal.querySelector('#review-status-text');

  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = 'Lancer Revue';
  }
  if (statusBadge) {
    statusBadge.className = 'inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800';
    statusBadge.textContent = 'Annule';
  }
  if (statusText) {
    statusText.textContent = 'Revue annulee';
  }

  const streamingText = ragReviewModal.querySelector('#streaming-text');
  if (streamingText) {
    streamingText.textContent += '\n\nREVUE ANNULEE PAR L\'UTILISATEUR\n\n';
  }

  addLog('warning', 'Revue RAG annulee par l\'utilisateur');
}

/**
 * Lance la revue litteraire RAG
 */
async function startLiteratureReview() {
  console.log('Demarrage revue RAG');

  state.ui.isReviewRunning = true;
  updateModalState();

  streamingState = {
    documents: new Map(),
    synthesis: { status: 'idle', partialText: '', finalText: '', startedAt: null, endedAt: null, error: null },
    autoScroll: true,
    cancelRequested: false
  };

  const streamingText = ragReviewModal.querySelector('#streaming-text');
  const debugStatus = ragReviewModal.querySelector('#debug-status');
  const documentsStatus = ragReviewModal.querySelector('#documents-status');

  if (streamingText) streamingText.textContent = '';
  if (debugStatus) debugStatus.textContent = 'Aucun streaming';
  if (documentsStatus) documentsStatus.innerHTML = '';

  try {
    console.log('Appel ragReviewAgent.generateReview...');

    const progressCallback = (progress) => {
      console.log('Progress:', progress.type, progress);
      updateProgressDisplay(progress);
    };

    const result = await ragReviewAgent.generateReview(
      progressCallback,
      () => streamingState.cancelRequested
    );

    console.log('Revue terminee:', result);
    displayResults(result);
    updateModalState();

  } catch (error) {
    console.log('ERREUR:', error);
    addLog('error', `Erreur revue: ${error.message}`);
    showErrorState(error.message);
  } finally {
    state.ui.isReviewRunning = false;
  }
}

/**
 * Met a jour l'affichage de la progression
 */
function updateProgressDisplay(progress) {
  const progressBar = ragReviewModal.querySelector('#review-progress-bar');
  const progressText = ragReviewModal.querySelector('#review-progress-text');
  const loadingMessage = ragReviewModal.querySelector('#loading-message');
  const streamingText = ragReviewModal.querySelector('#streaming-text');
  const debugStatus = ragReviewModal.querySelector('#debug-status');
  const documentsStatus = ragReviewModal.querySelector('#documents-status');

  switch (progress.type) {
    case 'document_start':
      streamingState.documents.set(progress.filename, {
        status: 'running',
        partialText: '',
        startedAt: new Date(),
        filename: progress.filename
      });
      loadingMessage.textContent = `Analyse de ${progress.filename}...`;
      progressText.textContent = `Document ${progress.current}/${progress.total}`;
      progressBar.style.width = `${((progress.current - 1) / progress.total) * 90}%`;
      streamingText.textContent = `Analyse du document: ${progress.filename}\n\n`;
      break;

    case 'document_progress':
      if (progress.partialText && progress.filename) {
        const docState = streamingState.documents.get(progress.filename);
        if (docState) {
          docState.partialText = progress.partialText;
          streamingText.textContent = `Analyse du document: ${progress.filename}\n\n${progress.partialText}`;
        }
        loadingMessage.textContent = `Generation en cours... (${progress.partialText.length} caracteres)`;
      }
      break;

    case 'document_complete':
      if (progress.filename) {
        const docState = streamingState.documents.get(progress.filename);
        if (docState) {
          docState.status = 'done';
          docState.endedAt = new Date();
        }
      }
      loadingMessage.textContent = `Document ${progress.current}/${progress.total} termine`;
      progressBar.style.width = `${(progress.current / progress.total) * 90}%`;
      break;

    case 'synthesis_start':
      streamingState.synthesis = {
        status: 'running',
        partialText: '',
        startedAt: new Date()
      };
      loadingMessage.textContent = `Synthese finale de ${progress.documentCount} documents...`;
      progressText.textContent = 'Generation de la synthese...';
      progressBar.style.width = '90%';
      streamingText.textContent = `Synthese finale en cours...\n\n`;
      break;

    case 'synthesis_progress':
      if (progress.partialText) {
        streamingState.synthesis.partialText = progress.partialText;
        streamingText.textContent = `Synthese finale en cours...\n\n${progress.partialText}`;
        loadingMessage.textContent = `Synthese en cours... (${progress.partialText.length} caracteres)`;
      }
      break;

    case 'complete':
      streamingState.synthesis.status = 'done';
      streamingState.synthesis.endedAt = new Date();
      loadingMessage.textContent = 'Revue terminee';
      progressText.textContent = 'Termine avec succes';
      progressBar.style.width = '100%';
      break;
  }

  updateDebugPanel(debugStatus);
  updateDocumentsStatus(documentsStatus);

  if (streamingState.autoScroll) {
    const streamingArea = ragReviewModal.querySelector('#streaming-area');
    if (streamingArea) streamingArea.scrollTop = streamingArea.scrollHeight;
  }
}

function updateDebugPanel(debugElement) {
  const docCount = streamingState.documents.size;
  const synthesisStatus = streamingState.synthesis.status;
  const synthesisLength = streamingState.synthesis.partialText.length;
  debugElement.textContent = `Documents: ${docCount}, Synthese: ${synthesisStatus} (${synthesisLength} chars)`;
}

function updateDocumentsStatus(container) {
  container.innerHTML = '';
  streamingState.documents.forEach((docState, filename) => {
    const docDiv = document.createElement('div');
    docDiv.className = `text-xs p-2 rounded ${
      docState.status === 'done' ? 'bg-green-100 text-green-800' :
      docState.status === 'running' ? 'bg-blue-100 text-blue-800' :
      'bg-gray-100 text-gray-800'
    }`;
    const statusIcon = docState.status === 'done' ? '[OK]' : docState.status === 'running' ? '[...]' : '[ATTENTE]';
    const duration = docState.endedAt && docState.startedAt ?
      Math.round((docState.endedAt - docState.startedAt) / 1000) + 's' : '';
    docDiv.textContent = `${statusIcon} ${filename} (${docState.partialText.length} chars${duration ? ' - ' + duration : ''})`;
    container.appendChild(docDiv);
  });
}

function displayFinalReview() {
  if (!state.litReviewFinal) return;
  const contentDiv = ragReviewModal.querySelector('#final-review-content');
  const rawText = state.litReviewFinal.text || '';
  const renderedMarkdown = parseMarkdown(rawText);
  contentDiv.innerHTML = `<div class="prose prose-sm max-w-none">${renderedMarkdown}</div>`;
}

function showErrorState(message) {
  const loadingDiv = ragReviewModal.querySelector('#rag-review-loading');
  const errorDiv = ragReviewModal.querySelector('#rag-review-error');
  if (errorDiv) {
    loadingDiv.classList.add('hidden');
    errorDiv.classList.remove('hidden');
    ragReviewModal.querySelector('#rag-error-message').textContent = message;
  }
}

/**
 * Exporte la revue au format HTML
 */
function exportReview() {
  if (!state.litReviewFinal) {
    addLog('error', 'Aucune revue a exporter');
    return;
  }

  const reviewData = state.litReviewFinal;
  const documentReviews = reviewData.documentReviews || [];
  
  const html = generateReviewHTML(documentReviews, reviewData);

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Revue_Litteraire_RAG_${new Date().toISOString().slice(0,10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  addLog('success', 'Revue litteraire exportee avec succes');
}

/**
 * Genere le HTML complet de la revue
 */
function generateReviewHTML(reviews, finalReview) {
  const docCount = reviews.length || finalReview.documentCount || 0;
  const reviewText = finalReview.text || '';
  const generatedAt = finalReview.generatedAt || new Date().toISOString();
  const totalTime = finalReview.totalTime || 0;
  const academicStats = finalReview.academicStats || {};

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Revue Litteraire Academique RAG</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      .prose { max-width: none; }
      .prose p { margin-bottom: 1em; }
      .prose h2 { margin-top: 1.5em; margin-bottom: 0.5em; }
      .citation { 
        background: #e0f2fe; 
        padding: 2px 6px; 
        border-radius: 4px; 
        font-family: monospace;
        font-size: 0.85em;
      }
    </style>
</head>
<body class="bg-gray-50 p-8">
    <div class="max-w-4xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
        <div class="bg-blue-600 text-white p-6">
            <h1 class="text-3xl font-bold">Revue Litteraire Academique</h1>
            <p class="text-blue-100 mt-2">Generee automatiquement avec RAG local - ${docCount} documents analyses</p>
        </div>

        <div class="p-6 space-y-8">
            <!-- Statistiques -->
            <section>
                <h2 class="text-xl font-semibold mb-4 text-gray-800">Statistiques</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-blue-50 p-4 rounded-lg text-center">
                        <div class="text-2xl font-bold text-blue-600">${docCount}</div>
                        <div class="text-sm text-blue-800">Documents</div>
                    </div>
                    <div class="bg-green-50 p-4 rounded-lg text-center">
                        <div class="text-2xl font-bold text-green-600">${academicStats.totalCitations || 0}</div>
                        <div class="text-sm text-green-800">Citations</div>
                    </div>
                    <div class="bg-purple-50 p-4 rounded-lg text-center">
                        <div class="text-2xl font-bold text-purple-600">${academicStats.reviewMode || 'auto'}</div>
                        <div class="text-sm text-purple-800">Mode</div>
                    </div>
                    <div class="bg-orange-50 p-4 rounded-lg text-center">
                        <div class="text-2xl font-bold text-orange-600">${(totalTime/1000).toFixed(1)}s</div>
                        <div class="text-sm text-orange-800">Temps total</div>
                    </div>
                </div>
            </section>

            <!-- Documents analyses -->
            ${reviews.length > 0 ? `
            <section>
                <h2 class="text-xl font-semibold mb-4 text-gray-800">Documents Analyses</h2>
                <div class="space-y-2">
                    ${reviews.map((review, idx) => `
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <div class="flex justify-between items-center">
                                <div>
                                    <span class="font-semibold text-blue-600">Doc${idx + 1}:</span>
                                    <span class="ml-2">${review.parsed?.title || review.filename || 'Document ' + (idx + 1)}</span>
                                </div>
                                <div class="text-sm text-gray-500">
                                    ${review.parsed?.year || ''} ${review.parsed?.domain ? '- ' + review.parsed.domain : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
            ` : ''}

            <!-- Revue finale -->
            <section>
                <h2 class="text-xl font-semibold mb-4 text-gray-800">Revue Litteraire Finale</h2>
                <div class="bg-gray-50 p-6 rounded-lg prose">
                    ${reviewText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/\[Doc(\d+)\]/g, '<span class="citation">[Doc$1]</span>')}
                </div>
            </section>

            <!-- Metadonnees -->
            <section class="text-sm text-gray-500 border-t pt-4">
                <p><strong>Genere le:</strong> ${new Date(generatedAt).toLocaleString('fr-FR')}</p>
                <p><strong>Methode:</strong> RAG local avec ${docCount + 1} appels LLM</p>
                <p><strong>Technologies:</strong> WebLLM, Transformers.js, PDF.js</p>
            </section>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Affiche les resultats de la revue
 */
function displayResults(result) {
  state.ui.isReviewRunning = false;

  state.litReviewFinal = {
    text: result.finalSynthesis.text || result.finalSynthesis.review,
    documentCount: result.documentCount,
    totalTime: result.totalTime,
    generatedAt: result.generatedAt,
    documentReviews: result.documentReviews,
    academicStats: result.academicStats,
    validation: result.validation
  };

  const resultsDiv = document.getElementById('rag-review-results');
  const contentDiv = document.getElementById('final-review-content');

  try {
    const citationManager = result.citationManager || new CitationManager(result.documentReviews);
    const validation = result.validation || validateFinalReview(
      result.finalSynthesis.text || result.finalSynthesis.review,
      result.documentReviews,
      citationManager
    );

    const reviewText = result.finalSynthesis.text || result.finalSynthesis.review || '';
    const renderedMarkdown = parseMarkdown(reviewText);
    const interactiveReview = renderCitationsInteractive(renderedMarkdown, citationManager, result.documentReviews);

    const sourcesPanel = createSourcesPanel(result.documentReviews, result.finalSynthesis, citationManager);

    const academicStats = result.academicStats || {};
    const statsHtml = renderAcademicStats(academicStats, result.timings, validation);

    const layout = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          ${statsHtml}
          
          ${validation.quality !== 'high' && validation.warnings && validation.warnings.length > 0 ? `
            <div class="validation-warnings p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
              <h4 class="font-semibold text-yellow-800 mb-2">Avertissements de validation</h4>
              <ul class="text-sm text-yellow-700 space-y-1">
                ${validation.warnings.map(w => `<li>- ${w}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          <div class="review-content bg-white border rounded-lg p-6">
            <h3 class="text-xl font-bold mb-4 text-gray-800">Revue Litteraire Finale</h3>
            <div class="prose prose-sm max-w-none text-gray-700">
              ${interactiveReview}
            </div>
          </div>
        </div>
        
        <div class="lg:col-span-1">
          ${sourcesPanel}
        </div>
      </div>
    `;

    contentDiv.innerHTML = layout;
    resultsDiv.classList.remove('hidden');
    document.getElementById('rag-review-init').classList.add('hidden');
    document.getElementById('rag-review-loading').classList.add('hidden');
    updateModalState();

  } catch (error) {
    console.error('Erreur affichage resultats:', error);
    displayResultsFallback(result);
  }
}

function renderAcademicStats(academicStats, timings, validation) {
  if (!academicStats) return '';

  return `
    <div class="academic-stats bg-blue-50 rounded-lg p-4">
      <h4 class="font-semibold mb-3 text-gray-800">Metriques Academiques</h4>
      
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="stat-card bg-white p-3 rounded-lg text-center">
          <div class="text-3xl font-bold text-blue-600">${academicStats.totalCitations || 0}</div>
          <div class="text-sm text-gray-600 mt-1">Citations totales</div>
        </div>
        
        <div class="stat-card bg-white p-3 rounded-lg text-center">
          <div class="text-3xl font-bold text-green-600 capitalize">${academicStats.reviewMode || 'auto'}</div>
          <div class="text-sm text-gray-600 mt-1">Mode de revue</div>
        </div>
        
        <div class="stat-card bg-white p-3 rounded-lg text-center">
          <div class="text-3xl font-bold text-purple-600">${academicStats.cohesionScore ? (academicStats.cohesionScore * 100).toFixed(0) : 0}%</div>
          <div class="text-sm text-gray-600 mt-1">Cohesion</div>
        </div>
        
        <div class="stat-card bg-white p-3 rounded-lg text-center">
          <div class="text-3xl font-bold ${validation.quality === 'high' ? 'text-green-600' : 'text-yellow-600'} capitalize">
            ${validation.quality || 'unknown'}
          </div>
          <div class="text-sm text-gray-600 mt-1">Qualite</div>
        </div>
      </div>
      
      ${timings ? `
        <div class="timings mt-4 pt-4 border-t border-gray-200">
          <div class="text-xs text-gray-600 space-y-1">
            <div>Analyse: ${(timings.analysisPhase / 1000).toFixed(1)}s</div>
            <div>Synthese: ${(timings.synthesisPhase / 1000).toFixed(1)}s</div>
            <div>Moyenne/doc: ${(timings.avgTimePerDoc / 1000).toFixed(1)}s</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function displayResultsFallback(result) {
  const resultsDiv = document.getElementById('rag-review-results');
  const contentDiv = document.getElementById('final-review-content');

  const rawText = result.finalSynthesis.text || result.finalSynthesis.review || '';
  const renderedMarkdown = parseMarkdown(rawText);

  contentDiv.innerHTML = `
    <h3 class="text-xl font-bold mb-6">Resultats de l'analyse RAG</h3>
    <div class="p-6 bg-green-50 border-l-4 border-green-400 rounded">
      <h4 class="text-xl font-semibold text-green-800 mb-4">Synthese Finale</h4>
      <div class="prose prose-sm max-w-none text-gray-700">${renderedMarkdown}</div>
    </div>
    <div class="mt-6 p-4 bg-gray-100 rounded text-sm text-gray-600">
      <strong>Statistiques:</strong> ${result.documentCount} documents analyses en ${(result.totalTime/1000).toFixed(1)}s
    </div>
  `;

  resultsDiv.classList.remove('hidden');
  document.getElementById('rag-review-init').classList.add('hidden');
  updateModalState();
}

// Fonction de diagnostic
window.diagnoseRAG = function() {
  const docs = state.docs.filter(d => d.status === 'extracted');
  const modelReady = isModelReady();
  const model = getLoadedModel();

  console.log('=== DIAGNOSTIC RAG ===');
  console.log('DOCUMENTS:', { total: state.docs.length, extracted: docs.length });
  console.log('MODELE:', { ready: modelReady, name: model?.name || 'none' });
  console.log('CAN START:', docs.length > 0 && modelReady);

  return { canStart: docs.length > 0 && modelReady, docs, model };
};

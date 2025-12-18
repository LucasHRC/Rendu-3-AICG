/**
 * NarrativeDashboard - Interface 3 colonnes pour le rapport narratif
 * Layout: Documents | Resume | Outline Tree
 */

import { addLog } from '../state/state.js';
import { 
  getNarrativeReport, 
  getNavigationState, 
  setNavigationState,
  regenerateSection 
} from '../agents/NarrativeAgent.js';
import { 
  exportToMarkdown, 
  formatCitation,
  findOutlineNode,
  getNodePath 
} from '../agents/NarrativeReport.js';
import {
  initSummarizer,
  isSummarizerReady,
  isSummarizerLoading,
  generateSummary,
  summarizeSection,
  getSummarizerInfo
} from '../llm/summarizer.js';
import { showLoadingOverlay, updateLoadingProgress, hideLoadingOverlay } from './LoadingOverlay.js';

let currentReport = null;
let selectedDocId = null;
let selectedNodeId = null;
let drillModalOpen = false;
let citationFormat = 'simple';
let currentSummary = '';
let summaryContext = null;

/**
 * Cree le dashboard narratif
 */
export function createNarrativeDashboard(report) {
  currentReport = report;
  
  const container = document.createElement('div');
  container.id = 'narrative-dashboard';
  container.className = 'w-full h-full flex flex-col bg-gray-50';
  container.setAttribute('tabindex', '0');

  container.innerHTML = `
    <!-- Header avec breadcrumb et actions -->
    <div class="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-gray-900">Rapport Narratif</h2>
          <div id="narrative-breadcrumb" class="flex items-center gap-1 text-sm text-gray-500">
            <span class="cursor-pointer hover:text-gray-700" data-nav="root">Accueil</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <!-- Search -->
          <div class="relative">
            <input type="text" id="narrative-search" 
                   placeholder="Rechercher..." 
                   class="w-48 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500">
            <svg class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <!-- Export buttons -->
          <button id="export-json-btn" class="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            JSON
          </button>
          <button id="export-md-btn" class="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            Markdown
          </button>
          <button id="copy-citations-btn" class="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            Citations
          </button>
        </div>
      </div>
      <!-- Stats mini -->
      <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span>${report.corpus.doc_count} documents</span>
        <span>${report.corpus.chunk_count} chunks</span>
        ${report.corpus.top_themes.slice(0, 4).map(t => 
          `<span class="px-2 py-0.5 bg-gray-100 rounded">${t.label}</span>`
        ).join('')}
      </div>
    </div>

    <!-- Main 3-column layout -->
    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- Colonne gauche: Documents -->
      <div id="docs-column" class="w-64 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div class="p-3">
          <h3 class="text-xs font-bold text-gray-500 uppercase mb-3">Documents</h3>
          <div id="docs-list" class="space-y-2">
            ${renderDocsList(report.documents)}
          </div>
        </div>
      </div>

      <!-- Colonne centrale: Resume -->
      <div id="resume-column" class="flex-1 overflow-y-auto p-4">
        ${renderExecutiveSummary(report.executive_summary)}
        <div id="doc-summary-container"></div>
        <div id="cross-doc-container" class="mt-6">
          ${renderCrossDoc(report.cross_doc)}
        </div>
      </div>

      <!-- Colonne droite: Outline + Resume -->
      <div id="outline-column" class="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
        <!-- Onglets -->
        <div class="flex border-b border-gray-200 flex-shrink-0">
          <button id="tab-outline" class="flex-1 px-3 py-2 text-xs font-medium text-gray-900 bg-gray-50 border-b-2 border-blue-500">
            Structure
          </button>
          <button id="tab-summary" class="flex-1 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700">
            Resume
          </button>
        </div>
        
        <!-- Contenu Outline -->
        <div id="outline-content" class="flex-1 overflow-y-auto p-3">
          <div id="outline-tree" class="text-sm">
            <p class="text-gray-400 text-xs">Selectionnez un document</p>
          </div>
        </div>
        
        <!-- Contenu Resume (cache par defaut) -->
        <div id="summary-content" class="hidden flex-1 overflow-y-auto p-3">
          <!-- Status summarizer -->
          <div id="summarizer-status" class="mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-700">Summarizer (Llama 3B)</span>
              <span id="summarizer-badge" class="text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-600">Non charge</span>
            </div>
            <button id="load-summarizer-btn" class="w-full px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Charger le summarizer
            </button>
            <div id="summarizer-progress" class="hidden mt-2">
              <div class="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div id="summarizer-progress-bar" class="h-full bg-blue-500 rounded-full transition-all" style="width: 0%"></div>
              </div>
              <p id="summarizer-progress-text" class="text-[10px] text-gray-500 mt-1"></p>
            </div>
          </div>
          
          <!-- Contexte actuel -->
          <div id="summary-context" class="mb-3 p-2 bg-gray-50 rounded-lg">
            <p class="text-[10px] text-gray-500 uppercase mb-1">Contexte</p>
            <p id="summary-context-title" class="text-sm font-medium text-gray-800">Vue globale</p>
            <p id="summary-context-path" class="text-[10px] text-gray-500"></p>
          </div>
          
          <!-- Zone de resume -->
          <div id="summary-output" class="min-h-[200px]">
            <div id="summary-placeholder" class="text-center py-8">
              <svg class="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <p class="text-xs text-gray-400">Selectionnez un element puis cliquez sur "Generer"</p>
            </div>
            <div id="summary-loading" class="hidden text-center py-8">
              <div class="w-6 h-6 mx-auto border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
              <p class="text-xs text-gray-500">Generation en cours...</p>
            </div>
            <div id="summary-result" class="hidden">
              <div id="summary-text" class="text-sm text-gray-700 leading-relaxed"></div>
              <div class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <button id="copy-summary-btn" class="text-[10px] text-blue-600 hover:underline">Copier</button>
                <button id="regenerate-summary-btn" class="text-[10px] text-gray-500 hover:text-gray-700">Regenerer</button>
              </div>
            </div>
          </div>
          
          <!-- Bouton generer -->
          <button id="generate-summary-btn" class="w-full mt-3 px-3 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed" disabled>
            Generer le resume
          </button>
        </div>
      </div>
    </div>

    <!-- Drill-down Modal -->
    <div id="drill-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white rounded-xl shadow-2xl w-[80%] h-[80%] flex flex-col overflow-hidden">
        <div id="drill-modal-header" class="flex-shrink-0 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 id="drill-modal-title" class="text-lg font-bold text-gray-900"></h3>
            <p id="drill-modal-path" class="text-sm text-gray-500"></p>
          </div>
          <button id="drill-modal-close" class="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div id="drill-modal-content" class="flex-1 overflow-y-auto p-6"></div>
        <div id="drill-modal-footer" class="flex-shrink-0 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button id="drill-prev-btn" class="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              Precedent
            </button>
            <button id="drill-next-btn" class="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              Suivant
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button id="drill-regenerate-btn" class="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
              Regenerer le resume
            </button>
            <button id="drill-copy-btn" class="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              Copier
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tooltip -->
    <div id="evidence-tooltip" class="hidden fixed z-40 max-w-md p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl">
      <div id="tooltip-content"></div>
    </div>

    <!-- Citation format selector -->
    <div id="citation-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white rounded-xl shadow-xl p-6 w-96">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Format de citation</h3>
        <div class="space-y-2 mb-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="citation-format" value="simple" checked class="text-blue-600">
            <span class="text-sm">Simple (Doc, p.X)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="citation-format" value="apa" class="text-blue-600">
            <span class="text-sm">APA (Auteur, annee)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="citation-format" value="markdown" class="text-blue-600">
            <span class="text-sm">Markdown [lien](#ref)</span>
          </label>
        </div>
        <div id="citations-output" class="bg-gray-50 rounded-lg p-3 text-xs font-mono max-h-48 overflow-y-auto mb-4"></div>
        <div class="flex justify-end gap-2">
          <button id="citation-cancel-btn" class="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            Annuler
          </button>
          <button id="citation-copy-btn" class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            Copier tout
          </button>
        </div>
      </div>
    </div>
  `;

  // Setup events
  setTimeout(() => setupDashboardEvents(container), 0);

  return container;
}

/**
 * Render la liste des documents
 */
function renderDocsList(documents) {
  return documents.map(doc => `
    <div class="doc-card p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all ${selectedDocId === doc.doc_id ? 'border-blue-500 bg-blue-50' : ''}"
         data-doc-id="${doc.doc_id}">
      <div class="font-medium text-sm text-gray-800 truncate">${doc.doc_title}</div>
      <div class="text-xs text-gray-500 mt-1 line-clamp-2">${doc.doc_summary.one_liner}</div>
      <div class="flex items-center gap-2 mt-2">
        <div class="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-blue-500 rounded-full" style="width: ${doc.stats.coverage_score * 100}%"></div>
        </div>
        <span class="text-[10px] text-gray-400">${Math.round(doc.stats.coverage_score * 100)}%</span>
      </div>
    </div>
  `).join('');
}

/**
 * Render le resume executif
 */
function renderExecutiveSummary(summary) {
  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h3 class="text-xl font-bold text-gray-900 mb-4">${summary.title}</h3>
      <p class="text-gray-700 leading-relaxed mb-4">${summary.summary}</p>
      
      ${summary.key_takeaways.length > 0 ? `
        <div class="mb-4">
          <h4 class="text-sm font-bold text-gray-700 mb-2">Points cles</h4>
          <ul class="space-y-1">
            ${summary.key_takeaways.map(t => `
              <li class="flex items-start gap-2 text-sm text-gray-600">
                <span class="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></span>
                ${t}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${summary.open_questions.length > 0 ? `
        <div class="mb-4">
          <h4 class="text-sm font-bold text-gray-700 mb-2">Questions ouvertes</h4>
          <ul class="space-y-1">
            ${summary.open_questions.map(q => `
              <li class="flex items-start gap-2 text-sm text-gray-600">
                <span class="w-1.5 h-1.5 bg-orange-500 rounded-full mt-1.5 flex-shrink-0"></span>
                ${q}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${summary.recommended_next_steps.length > 0 ? `
        <div>
          <h4 class="text-sm font-bold text-gray-700 mb-2">Actions recommandees</h4>
          <ul class="space-y-1">
            ${summary.recommended_next_steps.map(s => `
              <li class="flex items-start gap-2 text-sm text-gray-600">
                <span class="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></span>
                ${s}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render l'analyse croisee
 */
function renderCrossDoc(crossDoc) {
  if (!crossDoc.agreements.length && !crossDoc.tensions.length && !crossDoc.gaps.length) {
    return '';
  }

  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-bold text-gray-900 mb-4">Analyse croisee</h3>
      
      ${crossDoc.agreements.length > 0 ? `
        <div class="mb-4">
          <h4 class="text-sm font-bold text-green-700 mb-2">Convergences</h4>
          ${crossDoc.agreements.map(a => `
            <div class="p-3 bg-green-50 rounded-lg mb-2">
              <div class="font-medium text-sm text-gray-800">${a.label}</div>
              <div class="text-xs text-gray-600 mt-1">${a.explanation}</div>
              <div class="text-xs text-gray-400 mt-1">Documents: ${a.involved_docs.join(', ')}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${crossDoc.tensions.length > 0 ? `
        <div class="mb-4">
          <h4 class="text-sm font-bold text-orange-700 mb-2">Divergences</h4>
          ${crossDoc.tensions.map(t => `
            <div class="p-3 bg-orange-50 rounded-lg mb-2">
              <div class="font-medium text-sm text-gray-800">${t.label}</div>
              <div class="text-xs text-gray-600 mt-1">${t.explanation}</div>
              <div class="text-xs text-gray-400 mt-1">Documents: ${t.involved_docs.join(', ')}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${crossDoc.gaps.length > 0 ? `
        <div>
          <h4 class="text-sm font-bold text-red-700 mb-2">Lacunes identifiees</h4>
          ${crossDoc.gaps.map(g => `
            <div class="p-3 bg-red-50 rounded-lg mb-2">
              <div class="font-medium text-sm text-gray-800">${g.label}</div>
              <div class="text-xs text-gray-600 mt-1">${g.explanation}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render le resume d'un document
 */
function renderDocSummary(doc) {
  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h3 class="text-lg font-bold text-gray-900 mb-2">${doc.doc_title}</h3>
      <p class="text-sm text-gray-500 italic mb-4">${doc.doc_summary.one_liner}</p>
      <p class="text-gray-700 leading-relaxed mb-4">${doc.doc_summary.abstract}</p>
      
      ${renderKeyPointsSection('Points cles', doc.doc_summary.key_points, 'blue')}
      ${renderKeyPointsSection('Definitions', doc.doc_summary.definitions, 'purple')}
      ${renderKeyPointsSection('Methodes', doc.doc_summary.methods_or_frameworks, 'green')}
      ${renderKeyPointsSection('Limites', doc.doc_summary.limitations, 'orange')}
      
      ${doc.doc_summary.recommended_quotes.length > 0 ? `
        <div class="mt-4">
          <h4 class="text-sm font-bold text-gray-700 mb-2">Citations recommandees</h4>
          ${doc.doc_summary.recommended_quotes.map(q => `
            <blockquote class="border-l-2 border-gray-300 pl-3 py-1 mb-2 text-sm text-gray-600 italic quote-item cursor-pointer hover:bg-gray-50"
                        data-chunk-id="${q.source.chunk_id}">
              "${q.quote}"
              <cite class="block text-xs text-gray-400 not-italic mt-1">
                ${q.source.doc_title}${q.source.page ? `, p.${q.source.page}` : ''}
              </cite>
            </blockquote>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render une section de key points
 */
function renderKeyPointsSection(title, points, color) {
  if (!points || points.length === 0) return '';
  
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200'
  };
  
  return `
    <details class="mb-3 group">
      <summary class="cursor-pointer text-sm font-bold text-gray-700 flex items-center gap-2">
        <svg class="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
        ${title} (${points.length})
      </summary>
      <div class="mt-2 space-y-2 pl-6">
        ${points.map(kp => `
          <div class="p-3 rounded-lg border ${colorClasses[color]} key-point-item"
               data-evidence='${JSON.stringify(kp.evidence)}'>
            <div class="font-medium text-sm text-gray-800">${kp.label}</div>
            <div class="text-xs text-gray-600 mt-1">${kp.explanation}</div>
            ${kp.evidence.length > 0 ? `
              <div class="flex items-center gap-1 mt-2">
                <span class="text-[10px] text-gray-400">Sources:</span>
                ${kp.evidence.map(e => `
                  <span class="evidence-ref text-[10px] px-1.5 py-0.5 bg-white rounded cursor-pointer hover:bg-gray-100"
                        data-chunk-id="${e.chunk_id}"
                        data-excerpt="${encodeURIComponent(e.excerpt)}">
                    ${e.doc_title.substring(0, 15)}...
                  </span>
                `).join('')}
              </div>
            ` : ''}
            <div class="flex items-center gap-2 mt-2">
              <span class="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded">${kp.type}</span>
              <span class="text-[10px] text-gray-400">Confiance: ${Math.round(kp.confidence * 100)}%</span>
            </div>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

/**
 * Render l'outline tree
 */
function renderOutlineTree(outline, docId) {
  if (!outline || outline.length === 0) {
    return '<p class="text-gray-400 text-xs">Aucune structure disponible</p>';
  }

  return `
    <div class="outline-tree">
      ${outline.map(node => renderOutlineNode(node, docId)).join('')}
    </div>
  `;
}

/**
 * Render un node de l'outline (recursif)
 */
function renderOutlineNode(node, docId, depth = 0) {
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 12;
  
  return `
    <div class="outline-node" data-node-id="${node.id}" data-doc-id="${docId}">
      <div class="flex items-start gap-1 py-1.5 px-2 rounded cursor-pointer hover:bg-gray-100 transition-colors ${selectedNodeId === node.id ? 'bg-blue-50' : ''}"
           style="padding-left: ${indent + 8}px">
        ${hasChildren ? `
          <button class="outline-toggle w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600">
            <svg class="w-3 h-3 transition-transform ${node.expanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        ` : '<span class="w-4"></span>'}
        <div class="flex-1 min-w-0">
          <div class="text-sm text-gray-800 truncate">${node.title}</div>
          <div class="text-xs text-gray-500 truncate">${node.summary}</div>
        </div>
        <span class="text-[10px] text-gray-400">${node.evidence.length}</span>
      </div>
      ${hasChildren && node.expanded ? `
        <div class="outline-children">
          ${node.children.map(child => renderOutlineNode(child, docId, depth + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Setup des evenements
 */
function setupDashboardEvents(container) {
  // Document selection
  container.querySelectorAll('.doc-card').forEach(card => {
    card.addEventListener('click', () => {
      const docId = card.dataset.docId;
      selectDocument(docId);
    });
  });

  // Outline node click
  container.addEventListener('click', (e) => {
    const nodeEl = e.target.closest('.outline-node');
    if (nodeEl && !e.target.closest('.outline-toggle')) {
      const nodeId = nodeEl.dataset.nodeId;
      const docId = nodeEl.dataset.docId;
      openDrillModal(docId, nodeId);
    }
    
    // Toggle outline
    const toggle = e.target.closest('.outline-toggle');
    if (toggle) {
      const nodeEl = toggle.closest('.outline-node');
      toggleOutlineNode(nodeEl.dataset.docId, nodeEl.dataset.nodeId);
    }
  });

  // Evidence hover
  container.addEventListener('mouseenter', (e) => {
    const ref = e.target.closest('.evidence-ref');
    if (ref) {
      showEvidenceTooltip(ref, decodeURIComponent(ref.dataset.excerpt));
    }
  }, true);

  container.addEventListener('mouseleave', (e) => {
    const ref = e.target.closest('.evidence-ref');
    if (ref) {
      hideEvidenceTooltip();
    }
  }, true);

  // Quote click -> drill modal
  container.addEventListener('click', (e) => {
    const quote = e.target.closest('.quote-item');
    if (quote && selectedDocId) {
      // Find node containing this chunk
      const chunkId = quote.dataset.chunkId;
      const doc = currentReport.documents.find(d => d.doc_id === selectedDocId);
      if (doc) {
        // Open modal with evidence
        openEvidenceModal(chunkId, doc);
      }
    }
  });

  // Export buttons
  container.querySelector('#export-json-btn')?.addEventListener('click', exportJSON);
  container.querySelector('#export-md-btn')?.addEventListener('click', exportMarkdown);
  container.querySelector('#copy-citations-btn')?.addEventListener('click', openCitationsModal);

  // Search
  const searchInput = container.querySelector('#narrative-search');
  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterContent(query);
  });

  // Drill modal
  container.querySelector('#drill-modal-close')?.addEventListener('click', closeDrillModal);
  container.querySelector('#drill-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'drill-modal') closeDrillModal();
  });
  container.querySelector('#drill-regenerate-btn')?.addEventListener('click', handleRegenerate);
  container.querySelector('#drill-copy-btn')?.addEventListener('click', copyDrillContent);

  // Citation modal
  container.querySelector('#citation-cancel-btn')?.addEventListener('click', closeCitationsModal);
  container.querySelector('#citation-copy-btn')?.addEventListener('click', copyAllCitations);
  container.querySelectorAll('input[name="citation-format"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      citationFormat = e.target.value;
      updateCitationsOutput();
    });
  });

  // Keyboard navigation
  container.addEventListener('keydown', handleKeyboard);

  // Breadcrumb navigation
  container.querySelector('#narrative-breadcrumb')?.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const target = nav.dataset.nav;
      if (target === 'root') {
        selectedDocId = null;
        selectedNodeId = null;
        updateUI();
      }
    }
  });

  // Onglets Structure/Resume
  container.querySelector('#tab-outline')?.addEventListener('click', () => switchTab('outline'));
  container.querySelector('#tab-summary')?.addEventListener('click', () => switchTab('summary'));

  // Summarizer
  container.querySelector('#load-summarizer-btn')?.addEventListener('click', loadSummarizerHandler);
  container.querySelector('#generate-summary-btn')?.addEventListener('click', generateSummaryHandler);
  container.querySelector('#copy-summary-btn')?.addEventListener('click', copySummary);
  container.querySelector('#regenerate-summary-btn')?.addEventListener('click', generateSummaryHandler);

  // Update summarizer status on ready
  window.addEventListener('summarizer:ready', updateSummarizerStatus);
}

/**
 * Selectionne un document
 */
function selectDocument(docId) {
  selectedDocId = docId;
  selectedNodeId = null;
  
  const doc = currentReport.documents.find(d => d.doc_id === docId);
  if (!doc) return;

  // Update docs list selection
  document.querySelectorAll('.doc-card').forEach(card => {
    card.classList.toggle('border-blue-500', card.dataset.docId === docId);
    card.classList.toggle('bg-blue-50', card.dataset.docId === docId);
  });

  // Update resume column
  const resumeContainer = document.getElementById('doc-summary-container');
  if (resumeContainer) {
    resumeContainer.innerHTML = renderDocSummary(doc);
  }

  // Update outline
  const outlineContainer = document.getElementById('outline-tree');
  if (outlineContainer) {
    outlineContainer.innerHTML = renderOutlineTree(doc.outline, docId);
  }

  // Update breadcrumb
  updateBreadcrumb([doc.doc_title]);

  // Update summary context
  updateSummaryContext();

  setNavigationState({ selectedDocId: docId, selectedNodeId: null });
}

/**
 * Toggle un node de l'outline
 */
function toggleOutlineNode(docId, nodeId) {
  const doc = currentReport.documents.find(d => d.doc_id === docId);
  if (!doc) return;

  const node = findOutlineNode(doc.outline, nodeId);
  if (node) {
    node.expanded = !node.expanded;
    
    // Re-render outline
    const outlineContainer = document.getElementById('outline-tree');
    if (outlineContainer) {
      outlineContainer.innerHTML = renderOutlineTree(doc.outline, docId);
    }
  }
}

/**
 * Ouvre le modal drill-down
 */
function openDrillModal(docId, nodeId) {
  const doc = currentReport.documents.find(d => d.doc_id === docId);
  if (!doc) return;

  const node = findOutlineNode(doc.outline, nodeId);
  if (!node) return;

  selectedNodeId = nodeId;
  drillModalOpen = true;
  
  // Update summary context
  updateSummaryContext();

  const modal = document.getElementById('drill-modal');
  const title = document.getElementById('drill-modal-title');
  const path = document.getElementById('drill-modal-path');
  const content = document.getElementById('drill-modal-content');

  if (title) title.textContent = node.title;
  if (path) path.textContent = getNodePath(doc.outline, nodeId).join(' > ');
  
  if (content) {
    content.innerHTML = `
      <div class="mb-6">
        <h4 class="text-sm font-bold text-gray-700 mb-2">Resume</h4>
        <p class="text-gray-700">${node.summary || 'Aucun resume disponible'}</p>
      </div>
      
      <div>
        <h4 class="text-sm font-bold text-gray-700 mb-2">Evidence (${node.evidence.length} sources)</h4>
        <div class="space-y-3">
          ${node.evidence.map((e, i) => `
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-gray-500">${e.doc_title}</span>
                <span class="text-xs text-gray-400">Pertinence: ${Math.round(e.relevance * 100)}%</span>
              </div>
              <p class="text-sm text-gray-700">${e.excerpt}</p>
              <button class="mt-2 text-xs text-blue-600 hover:underline copy-excerpt-btn" data-excerpt="${encodeURIComponent(e.excerpt)}">
                Copier l'extrait
              </button>
            </div>
          `).join('')}
        </div>
      </div>
      
      ${node.children && node.children.length > 0 ? `
        <div class="mt-6">
          <h4 class="text-sm font-bold text-gray-700 mb-2">Sous-sections (${node.children.length})</h4>
          <div class="space-y-2">
            ${node.children.map(child => `
              <div class="p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-400 drill-child"
                   data-node-id="${child.id}" data-doc-id="${docId}">
                <div class="font-medium text-sm text-gray-800">${child.title}</div>
                <div class="text-xs text-gray-500">${child.summary}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Setup child click
    content.querySelectorAll('.drill-child').forEach(el => {
      el.addEventListener('click', () => {
        openDrillModal(el.dataset.docId, el.dataset.nodeId);
      });
    });

    // Setup copy excerpt
    content.querySelectorAll('.copy-excerpt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(decodeURIComponent(btn.dataset.excerpt));
        btn.textContent = 'Copie!';
        setTimeout(() => btn.textContent = 'Copier l\'extrait', 1500);
      });
    });
  }

  modal?.classList.remove('hidden');
  
  // Store for regenerate
  modal.dataset.docId = docId;
  modal.dataset.nodeId = nodeId;

  setNavigationState({ selectedNodeId: nodeId });
}

/**
 * Ferme le modal
 */
function closeDrillModal() {
  drillModalOpen = false;
  document.getElementById('drill-modal')?.classList.add('hidden');
}

/**
 * Affiche le tooltip evidence
 */
function showEvidenceTooltip(element, text) {
  const tooltip = document.getElementById('evidence-tooltip');
  const content = document.getElementById('tooltip-content');
  if (!tooltip || !content) return;

  content.textContent = text;
  
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${rect.bottom + 8}px`;
  tooltip.classList.remove('hidden');
}

/**
 * Cache le tooltip
 */
function hideEvidenceTooltip() {
  document.getElementById('evidence-tooltip')?.classList.add('hidden');
}

/**
 * Regenere le resume de la section courante
 */
async function handleRegenerate() {
  const modal = document.getElementById('drill-modal');
  const docId = modal?.dataset.docId;
  const nodeId = modal?.dataset.nodeId;
  
  if (!docId || !nodeId) return;

  const btn = document.getElementById('drill-regenerate-btn');
  if (btn) {
    btn.textContent = 'Generation...';
    btn.disabled = true;
  }

  const newSummary = await regenerateSection(docId, nodeId);
  
  if (btn) {
    btn.textContent = 'Regenerer le resume';
    btn.disabled = false;
  }

  if (newSummary) {
    // Re-open modal with new content
    openDrillModal(docId, nodeId);
  }
}

/**
 * Copie le contenu du modal
 */
function copyDrillContent() {
  const content = document.getElementById('drill-modal-content');
  if (content) {
    navigator.clipboard.writeText(content.innerText);
    const btn = document.getElementById('drill-copy-btn');
    if (btn) {
      btn.textContent = 'Copie!';
      setTimeout(() => btn.textContent = 'Copier', 1500);
    }
  }
}

/**
 * Export JSON
 */
function exportJSON() {
  if (!currentReport) return;
  
  const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `narrative-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export Markdown
 */
function exportMarkdown() {
  if (!currentReport) return;
  
  const markdown = exportToMarkdown(currentReport);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `narrative-report-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Ouvre le modal citations
 */
function openCitationsModal() {
  updateCitationsOutput();
  document.getElementById('citation-modal')?.classList.remove('hidden');
}

/**
 * Ferme le modal citations
 */
function closeCitationsModal() {
  document.getElementById('citation-modal')?.classList.add('hidden');
}

/**
 * Met a jour l'output des citations
 */
function updateCitationsOutput() {
  if (!currentReport) return;
  
  const output = document.getElementById('citations-output');
  if (!output) return;

  const citations = [];
  currentReport.documents.forEach(doc => {
    doc.doc_summary.recommended_quotes.forEach(q => {
      citations.push(formatCitation(q, citationFormat));
    });
  });

  output.textContent = citations.join('\n');
}

/**
 * Copie toutes les citations
 */
function copyAllCitations() {
  const output = document.getElementById('citations-output');
  if (output) {
    navigator.clipboard.writeText(output.textContent);
    closeCitationsModal();
  }
}

/**
 * Filtre le contenu par recherche
 */
function filterContent(query) {
  if (!query) {
    // Reset
    document.querySelectorAll('.doc-card, .key-point-item, .outline-node').forEach(el => {
      el.style.display = '';
    });
    return;
  }

  // Filter docs
  document.querySelectorAll('.doc-card').forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(query) ? '' : 'none';
  });

  // Filter key points
  document.querySelectorAll('.key-point-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(query) ? '' : 'none';
  });

  // Filter outline
  document.querySelectorAll('.outline-node').forEach(node => {
    const text = node.textContent.toLowerCase();
    node.style.display = text.includes(query) ? '' : 'none';
  });
}

/**
 * Update breadcrumb
 */
function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById('narrative-breadcrumb');
  if (!breadcrumb) return;

  breadcrumb.innerHTML = `
    <span class="cursor-pointer hover:text-gray-700" data-nav="root">Accueil</span>
    ${path.map((p, i) => `
      <span class="text-gray-300">/</span>
      <span class="cursor-pointer hover:text-gray-700">${p}</span>
    `).join('')}
  `;
}

/**
 * Keyboard navigation
 */
function handleKeyboard(e) {
  if (e.key === 'Escape') {
    if (drillModalOpen) {
      closeDrillModal();
    }
  }
  
  if (e.key === 'ArrowDown' && e.target.id === 'narrative-search') {
    // Focus first doc card
    document.querySelector('.doc-card')?.focus();
  }
}

/**
 * Update UI state
 */
function updateUI() {
  if (!selectedDocId) {
    document.getElementById('doc-summary-container').innerHTML = '';
    document.getElementById('outline-tree').innerHTML = '<p class="text-gray-400 text-xs">Selectionnez un document</p>';
    updateBreadcrumb([]);
  }
}

/**
 * Open evidence modal for a chunk
 */
function openEvidenceModal(chunkId, doc) {
  // Find evidence in doc
  let foundEvidence = null;
  
  const searchInNodes = (nodes) => {
    for (const node of nodes) {
      const ev = node.evidence.find(e => e.chunk_id === chunkId);
      if (ev) {
        foundEvidence = { node, evidence: ev };
        return true;
      }
      if (node.children && searchInNodes(node.children)) return true;
    }
    return false;
  };
  
  searchInNodes(doc.outline);
  
  if (foundEvidence) {
    openDrillModal(doc.doc_id, foundEvidence.node.id);
  }
}

// ============================================
// FONCTIONS ONGLET RESUME
// ============================================

/**
 * Switch entre les onglets Structure/Resume
 */
function switchTab(tab) {
  const tabOutline = document.getElementById('tab-outline');
  const tabSummary = document.getElementById('tab-summary');
  const outlineContent = document.getElementById('outline-content');
  const summaryContent = document.getElementById('summary-content');

  if (tab === 'outline') {
    tabOutline?.classList.add('text-gray-900', 'bg-gray-50', 'border-b-2', 'border-blue-500');
    tabOutline?.classList.remove('text-gray-500');
    tabSummary?.classList.remove('text-gray-900', 'bg-gray-50', 'border-b-2', 'border-blue-500');
    tabSummary?.classList.add('text-gray-500');
    outlineContent?.classList.remove('hidden');
    summaryContent?.classList.add('hidden');
  } else {
    tabSummary?.classList.add('text-gray-900', 'bg-gray-50', 'border-b-2', 'border-blue-500');
    tabSummary?.classList.remove('text-gray-500');
    tabOutline?.classList.remove('text-gray-900', 'bg-gray-50', 'border-b-2', 'border-blue-500');
    tabOutline?.classList.add('text-gray-500');
    summaryContent?.classList.remove('hidden');
    outlineContent?.classList.add('hidden');
    
    // Update context and status
    updateSummaryContext();
    updateSummarizerStatus();
  }
}

/**
 * Charge le summarizer
 */
async function loadSummarizerHandler() {
  const btn = document.getElementById('load-summarizer-btn');
  const progress = document.getElementById('summarizer-progress');
  const progressBar = document.getElementById('summarizer-progress-bar');
  const progressText = document.getElementById('summarizer-progress-text');

  const info = getSummarizerInfo();
  
  if (btn) btn.disabled = true;
  progress?.classList.remove('hidden');
  
  showLoadingOverlay('Chargement Summarizer', `Llama 3.2 3B (${info.size})`);

  try {
    await initSummarizer((pct, text) => {
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressText) progressText.textContent = text || `${pct}%`;
      updateLoadingProgress(pct, text || 'Telechargement...', 'Llama 3B');
    });
    
    hideLoadingOverlay();
    updateSummarizerStatus();
  } catch (error) {
    hideLoadingOverlay();
    addLog('error', `Erreur chargement summarizer: ${error.message}`);
  }

  if (btn) btn.disabled = false;
  progress?.classList.add('hidden');
}

/**
 * Met a jour le status du summarizer
 */
function updateSummarizerStatus() {
  const badge = document.getElementById('summarizer-badge');
  const loadBtn = document.getElementById('load-summarizer-btn');
  const genBtn = document.getElementById('generate-summary-btn');

  if (isSummarizerReady()) {
    if (badge) {
      badge.textContent = 'Pret';
      badge.className = 'text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700';
    }
    if (loadBtn) loadBtn.classList.add('hidden');
    if (genBtn) genBtn.disabled = false;
    
    // Auto-generate si pas encore de resume
    if (!currentSummary && summaryContext) {
      generateSummaryHandler();
    }
  } else if (isSummarizerLoading()) {
    if (badge) {
      badge.textContent = 'Chargement...';
      badge.className = 'text-[10px] px-2 py-0.5 rounded bg-yellow-100 text-yellow-700';
    }
  } else {
    if (badge) {
      badge.textContent = 'Non charge';
      badge.className = 'text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-600';
    }
    if (loadBtn) loadBtn.classList.remove('hidden');
    if (genBtn) genBtn.disabled = true;
  }
}

/**
 * Met a jour le contexte du resume et genere automatiquement
 */
function updateSummaryContext() {
  const titleEl = document.getElementById('summary-context-title');
  const pathEl = document.getElementById('summary-context-path');
  const oldContext = summaryContext?.type + (summaryContext?.node?.id || summaryContext?.doc?.doc_id || '');

  if (selectedNodeId && selectedDocId) {
    const doc = currentReport?.documents.find(d => d.doc_id === selectedDocId);
    const node = doc ? findOutlineNode(doc.outline, selectedNodeId) : null;
    
    if (node) {
      if (titleEl) titleEl.textContent = node.title;
      if (pathEl) pathEl.textContent = getNodePath(doc.outline, selectedNodeId).join(' > ');
      summaryContext = { type: 'node', node, doc };
    }
  } else if (selectedDocId) {
    const doc = currentReport?.documents.find(d => d.doc_id === selectedDocId);
    if (doc) {
      if (titleEl) titleEl.textContent = doc.doc_title;
      if (pathEl) pathEl.textContent = 'Document complet';
      summaryContext = { type: 'document', doc };
    }
  } else {
    // Vue globale
    if (titleEl) titleEl.textContent = 'Vue globale';
    if (pathEl) pathEl.textContent = `${currentReport?.corpus.doc_count || 0} documents`;
    summaryContext = { type: 'global', report: currentReport };
  }

  // Auto-generate si summarizer pret et contexte change
  const newContext = summaryContext?.type + (summaryContext?.node?.id || summaryContext?.doc?.doc_id || '');
  if (isSummarizerReady() && newContext !== oldContext) {
    generateSummaryHandler();
  }
}

/**
 * Genere le resume pour le contexte actuel
 */
async function generateSummaryHandler() {
  if (!isSummarizerReady()) {
    addLog('warning', 'Summarizer non charge');
    return;
  }

  const placeholder = document.getElementById('summary-placeholder');
  const loading = document.getElementById('summary-loading');
  const result = document.getElementById('summary-result');
  const textEl = document.getElementById('summary-text');

  placeholder?.classList.add('hidden');
  result?.classList.add('hidden');
  loading?.classList.remove('hidden');

  try {
    let content = '';
    let context = {};
    let evidence = [];

    if (summaryContext?.type === 'node') {
      content = summaryContext.node.evidence?.map(e => e.excerpt).join('\n\n') || summaryContext.node.summary || '';
      evidence = summaryContext.node.evidence || [];
      context = { 
        title: summaryContext.node.title, 
        level: 'section', 
        docTitle: summaryContext.doc.doc_title,
        evidence 
      };
    } else if (summaryContext?.type === 'document') {
      content = summaryContext.doc.doc_summary.abstract + '\n\n' + 
                summaryContext.doc.doc_summary.key_points.map(kp => `- ${kp.label}: ${kp.explanation}`).join('\n');
      evidence = summaryContext.doc.doc_summary.key_points.flatMap(kp => kp.evidence || []).slice(0, 5);
      context = { 
        title: summaryContext.doc.doc_title, 
        level: 'document',
        evidence 
      };
    } else {
      // Global
      content = currentReport?.executive_summary.summary + '\n\n' +
                currentReport?.documents.map(d => `${d.doc_title}: ${d.doc_summary.one_liner}`).join('\n');
      evidence = currentReport?.documents.flatMap(d => 
        d.doc_summary.key_points.flatMap(kp => kp.evidence || [])
      ).slice(0, 5) || [];
      context = { 
        title: 'Synthese globale', 
        level: 'document',
        evidence 
      };
    }

    currentSummary = '';
    
    await generateSummary(content, context, (delta, full) => {
      currentSummary = full;
      // Formatter avec references cliquables
      if (textEl) textEl.innerHTML = formatSummaryWithRefs(full, evidence);
    });

    loading?.classList.add('hidden');
    result?.classList.remove('hidden');
    
    // Setup click handlers pour references
    setupRefClickHandlers();

  } catch (error) {
    addLog('error', `Erreur generation resume: ${error.message}`);
    loading?.classList.add('hidden');
    placeholder?.classList.remove('hidden');
  }
}

/**
 * Formate le resume avec references cliquables
 */
function formatSummaryWithRefs(text, evidence) {
  // Convertir les [Ref:X] en liens cliquables
  let formatted = text.replace(/\[Ref:(\d+)\]/g, (match, num) => {
    const idx = parseInt(num) - 1;
    const ref = evidence[idx];
    if (ref) {
      return `<span class="ref-link cursor-pointer text-blue-600 hover:text-blue-800 hover:underline" data-ref-idx="${idx}" title="${ref.doc_title}: ${ref.excerpt?.substring(0, 100)}...">[${num}]</span>`;
    }
    return match;
  });

  // Formatter les sections en gras
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-gray-900">$1</strong>');
  
  // Formatter les listes
  formatted = formatted.replace(/^- (.+)$/gm, '<li class="ml-4 text-gray-700">$1</li>');
  formatted = formatted.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc my-2">$&</ul>');
  
  // Paragraphes
  formatted = formatted.replace(/\n\n/g, '</p><p class="my-2">');
  formatted = `<p class="my-2">${formatted}</p>`;

  return formatted;
}

/**
 * Setup click handlers pour les references
 */
function setupRefClickHandlers() {
  document.querySelectorAll('.ref-link').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.refIdx);
      let evidence = [];
      
      if (summaryContext?.type === 'node') {
        evidence = summaryContext.node.evidence || [];
      } else if (summaryContext?.type === 'document') {
        evidence = summaryContext.doc.doc_summary.key_points.flatMap(kp => kp.evidence || []);
      } else {
        evidence = currentReport?.documents.flatMap(d => 
          d.doc_summary.key_points.flatMap(kp => kp.evidence || [])
        ) || [];
      }
      
      const ref = evidence[idx];
      if (ref) {
        showRefTooltip(el, ref);
      }
    });
  });
}

/**
 * Affiche un tooltip pour une reference
 */
function showRefTooltip(element, ref) {
  // Supprimer tooltip existant
  document.getElementById('ref-tooltip')?.remove();
  
  const tooltip = document.createElement('div');
  tooltip.id = 'ref-tooltip';
  tooltip.className = 'fixed z-50 max-w-md p-4 bg-gray-900 text-white text-sm rounded-lg shadow-xl';
  tooltip.innerHTML = `
    <div class="font-bold text-blue-300 mb-2">${ref.doc_title || 'Source'}</div>
    <p class="text-gray-300 leading-relaxed">"${ref.excerpt}"</p>
    <button class="mt-3 text-xs text-blue-400 hover:text-blue-300" onclick="navigator.clipboard.writeText('${ref.excerpt?.replace(/'/g, "\\'")}'); this.textContent='Copie!'">
      Copier l'extrait
    </button>
    <button class="ml-3 text-xs text-gray-400 hover:text-gray-300" onclick="this.closest('#ref-tooltip').remove()">
      Fermer
    </button>
  `;
  
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${Math.min(rect.left, window.innerWidth - 350)}px`;
  tooltip.style.top = `${rect.bottom + 8}px`;
  
  document.body.appendChild(tooltip);
  
  // Fermer au clic ailleurs
  setTimeout(() => {
    document.addEventListener('click', function closeTooltip(e) {
      if (!tooltip.contains(e.target) && e.target !== element) {
        tooltip.remove();
        document.removeEventListener('click', closeTooltip);
      }
    });
  }, 100);
}

/**
 * Copie le resume
 */
function copySummary() {
  if (currentSummary) {
    navigator.clipboard.writeText(currentSummary);
    const btn = document.getElementById('copy-summary-btn');
    if (btn) {
      btn.textContent = 'Copie!';
      setTimeout(() => btn.textContent = 'Copier', 1500);
    }
  }
}

// Event listener
window.addEventListener('narrative:reportReady', (e) => {
  const container = document.getElementById('agent-content');
  if (container) {
    container.innerHTML = '';
    container.appendChild(createNarrativeDashboard(e.detail));
  }
});


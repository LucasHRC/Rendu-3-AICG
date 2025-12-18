/**
 * HubDashboard - Interface utilisateur du dashboard analytique
 * Onglets: Overview | Themes | Claims | Evidence
 */

import { getSemanticIcon } from '../agents/HubReport.js';
import { addLog } from '../state/state.js';

let currentReport = null;
let currentTab = 'overview';
let filters = {
  themeType: 'all',
  themeStatus: 'all',
  claimSort: 'support'
};

/**
 * Crée le dashboard complet
 */
export function createHubDashboard(report) {
  currentReport = report;

  const container = document.createElement('div');
  container.id = 'hub-dashboard';
  container.className = 'flex flex-col h-full bg-white';

  container.innerHTML = `
    <!-- Tabs -->
    <div class="flex-shrink-0 border-b border-gray-200 bg-gray-50">
      <nav class="flex gap-1 px-4" aria-label="Tabs">
        <button data-tab="overview" class="hub-tab px-4 py-3 text-sm font-medium text-gray-900 border-b-2 border-gray-900">
          Vue d'ensemble
        </button>
        <button data-tab="themes" class="hub-tab px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent">
          Thèmes (${report.themes?.length || 0})
        </button>
        <button data-tab="claims" class="hub-tab px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent">
          Affirmations (${report.claims?.length || 0})
        </button>
        <button data-tab="evidence" class="hub-tab px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent">
          Preuves
        </button>
      </nav>
    </div>

    <!-- Content -->
    <div id="hub-content" class="flex-1 overflow-y-auto p-4">
      ${renderOverviewTab(report)}
    </div>

    <!-- Export -->
    <div class="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
      <button id="export-hub-json" class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
        Exporter JSON
      </button>
    </div>
  `;

  // Setup events
  setTimeout(() => setupDashboardEvents(container), 0);

  return container;
}

function setupDashboardEvents(container) {
  // Tab navigation
  container.querySelectorAll('.hub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(container, tab);
    });
  });

  // Export
  container.querySelector('#export-hub-json')?.addEventListener('click', () => {
    if (currentReport) {
      const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hub-report-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog('success', 'HubReport exporté');
    }
  });
}

function switchTab(container, tab) {
  currentTab = tab;

  // Update tab styles
  container.querySelectorAll('.hub-tab').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('text-gray-900', 'border-gray-900');
      btn.classList.remove('text-gray-500', 'border-transparent');
    } else {
      btn.classList.remove('text-gray-900', 'border-gray-900');
      btn.classList.add('text-gray-500', 'border-transparent');
    }
  });

  // Render content
  const content = container.querySelector('#hub-content');
  if (!content || !currentReport) return;

  switch (tab) {
    case 'overview':
      content.innerHTML = renderOverviewTab(currentReport);
      break;
    case 'themes':
      content.innerHTML = renderThemesTab(currentReport);
      setupThemesEvents(content);
      break;
    case 'claims':
      content.innerHTML = renderClaimsTab(currentReport);
      setupClaimsEvents(content);
      break;
    case 'evidence':
      content.innerHTML = renderEvidenceTab(currentReport);
      break;
  }
}

// ============ OVERVIEW TAB ============

function renderOverviewTab(report) {
  const quality = report.quality || {};
  const coverage = report.coverage || {};

  return `
    <div class="space-y-6">
      <!-- Stats Cards -->
      <div class="grid grid-cols-4 gap-4">
        <div class="bg-gray-50 rounded-xl p-4">
          <p class="text-xs text-gray-500 mb-1">Documents</p>
          <p class="text-2xl font-bold text-gray-900">${report.meta?.documentCount || 0}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <p class="text-xs text-gray-500 mb-1">Thèmes</p>
          <p class="text-2xl font-bold text-gray-900">${report.themes?.length || 0}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <p class="text-xs text-gray-500 mb-1">Affirmations</p>
          <p class="text-2xl font-bold text-gray-900">${report.claims?.length || 0}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <p class="text-xs text-gray-500 mb-1">Contradictions</p>
          <p class="text-2xl font-bold ${quality.contradictionsFound > 0 ? 'text-orange-600' : 'text-gray-900'}">${quality.contradictionsFound || 0}</p>
        </div>
      </div>

      <!-- Quality Metrics -->
      <div class="bg-gray-50 rounded-xl p-4">
        <h3 class="text-sm font-bold text-gray-800 mb-3">Métriques de qualité</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-600">Couverture citations</span>
            <span class="text-sm font-semibold text-gray-900">${Math.round((quality.citationCoverage || 0) * 100)}%</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-600">Couverture globale</span>
            <span class="text-sm font-semibold text-gray-900">${Math.round((coverage.globalScore || 0) * 100)}%</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-600">Chunks dupliqués</span>
            <span class="text-sm font-semibold ${quality.duplicateChunks > 5 ? 'text-orange-600' : 'text-gray-900'}">${quality.duplicateChunks || 0}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-600">Chunks faible signal</span>
            <span class="text-sm font-semibold ${quality.lowSignalChunks > 10 ? 'text-orange-600' : 'text-gray-900'}">${quality.lowSignalChunks || 0}</span>
          </div>
        </div>
      </div>

      <!-- Gaps & Warnings -->
      ${(coverage.gaps?.length > 0 || coverage.dominant) ? `
        <div class="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <h3 class="text-sm font-bold text-orange-800 mb-2">Alertes</h3>
          <ul class="text-xs text-orange-700 space-y-1">
            ${coverage.gaps?.map(g => `<li>Lacune thématique : ${g}</li>`).join('') || ''}
            ${coverage.dominant ? `<li>Document dominant : ${coverage.dominant.docName} (${Math.round(coverage.dominant.avgScore * 100)}%)</li>` : ''}
          </ul>
        </div>
      ` : ''}

      <!-- Mini Heatmap -->
      <div class="bg-gray-50 rounded-xl p-4">
        <h3 class="text-sm font-bold text-gray-800 mb-3">Carte de couverture</h3>
        <div id="mini-heatmap" class="overflow-x-auto">
          ${renderMiniHeatmap(report)}
        </div>
      </div>
    </div>
  `;
}

function renderMiniHeatmap(report) {
  const themes = report.themes || [];
  const coverage = report.coverage || {};
  const docs = coverage.documents || [];
  const matrix = coverage.matrix || [];

  if (themes.length === 0 || matrix.length === 0) {
    return '<p class="text-xs text-gray-400 text-center py-4">Aucune donnée de couverture</p>';
  }

  let html = '<table class="w-full text-xs">';
  
  // Header
  html += '<thead><tr><th class="text-left p-1"></th>';
  themes.forEach(t => {
    html += `<th class="p-1 text-center font-medium text-gray-600" title="${t.label}">${t.label.substring(0, 8)}...</th>`;
  });
  html += '</tr></thead>';

  // Body
  html += '<tbody>';
  docs.forEach((doc, i) => {
    html += `<tr><td class="p-1 text-gray-700 font-medium">${doc.name?.substring(0, 15) || 'Doc ' + (i + 1)}...</td>`;
    themes.forEach((_, j) => {
      const value = matrix[i]?.[j] || 0;
      const color = value > 0.7 ? 'bg-blue-600' : value > 0.4 ? 'bg-blue-400' : value > 0.2 ? 'bg-blue-200' : 'bg-gray-100';
      html += `<td class="p-1"><div class="${color} rounded h-6 flex items-center justify-center text-white text-xs font-medium">${Math.round(value * 100)}%</div></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';

  return html;
}

// ============ THEMES TAB ============

function renderThemesTab(report) {
  const themes = report.themes || [];

  return `
    <div class="space-y-4">
      <!-- Filters -->
      <div class="flex gap-2">
        <select id="filter-theme-type" class="text-xs px-3 py-1.5 border border-gray-200 rounded-lg">
          <option value="all">Tous les types</option>
          <option value="concept">Concepts</option>
          <option value="method">Méthodes</option>
          <option value="application">Applications</option>
          <option value="background">Contexte</option>
        </select>
        <select id="filter-theme-status" class="text-xs px-3 py-1.5 border border-gray-200 rounded-lg">
          <option value="all">Tous les statuts</option>
          <option value="ok">OK</option>
          <option value="warning">Attention</option>
          <option value="gap">Lacune</option>
        </select>
      </div>

      <!-- Theme Cards -->
      <div id="theme-cards" class="grid grid-cols-2 gap-3">
        ${themes.map(theme => renderThemeCard(theme)).join('')}
      </div>
    </div>
  `;
}

function renderThemeCard(theme) {
  const statusColors = {
    ok: 'border-gray-200 bg-white',
    warning: 'border-orange-200 bg-orange-50',
    gap: 'border-red-200 bg-red-50'
  };
  const statusBadge = {
    ok: '<span class="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-700 rounded">OK</span>',
    warning: '<span class="px-1.5 py-0.5 text-xs bg-orange-200 text-orange-700 rounded">Attention</span>',
    gap: '<span class="px-1.5 py-0.5 text-xs bg-red-200 text-red-700 rounded">Lacune</span>'
  };

  return `
    <div class="theme-card p-4 rounded-xl border ${statusColors[theme.status] || statusColors.ok}" data-theme-id="${theme.id}" data-type="${theme.type}" data-status="${theme.status}">
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="text-gray-600">${getSemanticIcon(theme.icon || theme.type, 'w-5 h-5')}</span>
          <h4 class="font-semibold text-gray-900">${theme.label}</h4>
        </div>
        ${statusBadge[theme.status] || ''}
      </div>
      <p class="text-xs text-gray-600 mb-2">${theme.description || ''}</p>
      <div class="flex items-center gap-2">
        <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">${theme.type}</span>
      </div>
    </div>
  `;
}

function setupThemesEvents(container) {
  const typeFilter = container.querySelector('#filter-theme-type');
  const statusFilter = container.querySelector('#filter-theme-status');

  const applyFilters = () => {
    filters.themeType = typeFilter?.value || 'all';
    filters.themeStatus = statusFilter?.value || 'all';

    container.querySelectorAll('.theme-card').forEach(card => {
      const type = card.dataset.type;
      const status = card.dataset.status;

      const matchType = filters.themeType === 'all' || type === filters.themeType;
      const matchStatus = filters.themeStatus === 'all' || status === filters.themeStatus;

      card.style.display = (matchType && matchStatus) ? 'block' : 'none';
    });
  };

  typeFilter?.addEventListener('change', applyFilters);
  statusFilter?.addEventListener('change', applyFilters);
}

// ============ CLAIMS TAB ============

function renderClaimsTab(report) {
  const claims = report.claims || [];
  const contradictions = report.contradictions || [];

  return `
    <div class="space-y-4">
      <!-- Sort -->
      <div class="flex gap-2">
        <select id="sort-claims" class="text-xs px-3 py-1.5 border border-gray-200 rounded-lg">
          <option value="support">Trier par confiance</option>
          <option value="contradictions">Trier par contradictions</option>
        </select>
      </div>

      <!-- Claims List -->
      <div id="claims-list" class="space-y-2">
        ${claims.map(claim => renderClaimCard(claim, contradictions)).join('')}
      </div>
    </div>
  `;
}

function renderClaimCard(claim, contradictions) {
  const hasContradictions = claim.contradictions?.length > 0;
  const borderColor = hasContradictions ? 'border-orange-200' : 'border-gray-200';

  return `
    <div class="claim-card p-3 rounded-lg border ${borderColor} bg-white hover:bg-gray-50 cursor-pointer" data-claim-id="${claim.id}" data-support="${claim.support}">
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm text-gray-900 flex-1">${claim.text}</p>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs font-semibold ${claim.support > 0.7 ? 'text-gray-700' : 'text-orange-600'}">${Math.round(claim.support * 100)}%</span>
          ${hasContradictions ? `<span class="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">${claim.contradictions.length} conflit</span>` : ''}
        </div>
      </div>
      ${claim.sources?.length > 0 ? `
        <div class="mt-2 flex items-center gap-2">
          <span class="text-xs text-gray-500">${claim.sources.length} source(s)</span>
        </div>
      ` : ''}
    </div>
  `;
}

function setupClaimsEvents(container) {
  const sortSelect = container.querySelector('#sort-claims');

  sortSelect?.addEventListener('change', () => {
    const sortBy = sortSelect.value;
    const list = container.querySelector('#claims-list');
    if (!list) return;

    const cards = Array.from(list.querySelectorAll('.claim-card'));
    
    cards.sort((a, b) => {
      if (sortBy === 'support') {
        return parseFloat(b.dataset.support) - parseFloat(a.dataset.support);
      } else {
        const aContr = currentReport?.claims?.find(c => c.id === a.dataset.claimId)?.contradictions?.length || 0;
        const bContr = currentReport?.claims?.find(c => c.id === b.dataset.claimId)?.contradictions?.length || 0;
        return bContr - aContr;
      }
    });

    cards.forEach(card => list.appendChild(card));
  });

  // Click to show details
  container.querySelectorAll('.claim-card').forEach(card => {
    card.addEventListener('click', () => {
      const claimId = card.dataset.claimId;
      const claim = currentReport?.claims?.find(c => c.id === claimId);
      if (claim) {
        showClaimDrawer(claim);
      }
    });
  });
}

function showClaimDrawer(claim) {
  // Remove existing drawer
  document.getElementById('claim-drawer')?.remove();

  const drawer = document.createElement('div');
  drawer.id = 'claim-drawer';
  drawer.className = 'fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col';

  drawer.innerHTML = `
    <div class="flex-shrink-0 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 class="font-bold text-gray-900">Détails de l'affirmation</h3>
      <button id="close-drawer" class="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <div>
        <p class="text-xs font-medium text-gray-500 mb-1">Affirmation</p>
        <p class="text-sm text-gray-900">${claim.text}</p>
      </div>
      <div>
        <p class="text-xs font-medium text-gray-500 mb-1">Score de confiance</p>
        <p class="text-lg font-bold ${claim.support > 0.7 ? 'text-gray-900' : 'text-orange-600'}">${Math.round(claim.support * 100)}%</p>
      </div>
      ${claim.sources?.length > 0 ? `
        <div>
          <p class="text-xs font-medium text-gray-500 mb-2">Sources (${claim.sources.length})</p>
          <div class="space-y-2">
            ${claim.sources.map(s => `
              <div class="p-2 bg-gray-50 rounded-lg text-xs">
                <p class="text-gray-600">${s.excerpt}</p>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${claim.contradictions?.length > 0 ? `
        <div>
          <p class="text-xs font-medium text-orange-600 mb-2">Contradictions (${claim.contradictions.length})</p>
          <div class="space-y-1">
            ${claim.contradictions.map(cId => `<p class="text-xs text-gray-600">Conflit avec : ${cId}</p>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.body.appendChild(drawer);

  drawer.querySelector('#close-drawer')?.addEventListener('click', () => drawer.remove());
}

// ============ EVIDENCE TAB ============

function renderEvidenceTab(report) {
  const claims = report.claims || [];
  const allSources = claims.flatMap(c => c.sources || []);

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-600">Total des preuves : ${allSources.length} chunks</p>
      </div>

      <div class="space-y-2">
        ${allSources.slice(0, 20).map((source, i) => `
          <div class="p-3 rounded-lg border border-gray-200 bg-white">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-500">Chunk ${source.chunkId || i + 1}</span>
              <span class="text-xs text-gray-400">${source.docId || ''}</span>
            </div>
            <p class="text-xs text-gray-700">${source.excerpt || 'Pas d\'extrait'}</p>
          </div>
        `).join('')}
      </div>

      ${allSources.length > 20 ? `<p class="text-xs text-gray-400 text-center">Affichage de 20 sur ${allSources.length}</p>` : ''}
    </div>
  `;
}

// Listen for report ready
window.addEventListener('hub:reportReady', (e) => {
  const agentContent = document.getElementById('agent-content');
  if (agentContent && e.detail) {
    agentContent.innerHTML = '';
    agentContent.appendChild(createHubDashboard(e.detail));
  }
});


/**
 * AtlasDashboard - Interface graphe hiérarchique avec filtres et inspection
 */

import { getAtlasIcon, STATUS_COLORS, NODE_LEVELS, EDGE_TYPES } from '../agents/AtlasReport.js';
import { addLog } from '../state/state.js';

let currentReport = null;
let simulation = null;
let svg = null;
let g = null;
let zoom = null;
let selectedNode = null;

// Filtres actifs
let filters = {
  type: 'all',
  status: 'all',
  doc: 'all',
  minImportance: 0
};

/**
 * Crée le dashboard Atlas complet
 */
export function createAtlasDashboard(report) {
  currentReport = report;

  const container = document.createElement('div');
  container.id = 'atlas-dashboard';
  container.className = 'w-full h-full flex flex-col bg-gray-50';

  container.innerHTML = `
    <!-- Header avec filtres -->
    <div class="flex-shrink-0 p-3 bg-white border-b border-gray-200">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-bold text-gray-800">Atlas des Concepts</h3>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">${report.meta.nodeCount} noeuds, ${report.meta.edgeCount} liens</span>
          <button id="atlas-export-btn" class="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            ${getAtlasIcon('export', 'w-3 h-3 inline mr-1')} Exporter
          </button>
        </div>
      </div>
      
      <!-- Barre de recherche -->
      <div class="mb-3">
        <div class="relative">
          <input type="text" id="atlas-search" placeholder="Rechercher un concept, une affirmation..." 
                 class="w-full px-3 py-2 pl-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400">
          <span class="absolute left-3 top-2.5 text-gray-400">${getAtlasIcon('search', 'w-4 h-4')}</span>
        </div>
      </div>
      
      <!-- Filtres -->
      <div class="flex flex-wrap gap-3">
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500">Type:</label>
          <select id="filter-type" class="text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none">
            <option value="all">Tous</option>
            <option value="framework">Frameworks</option>
            <option value="concept">Concepts</option>
            <option value="claim">Affirmations</option>
            <option value="evidence">Preuves</option>
          </select>
        </div>
        
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500">Statut:</label>
          <select id="filter-status" class="text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none">
            <option value="all">Tous</option>
            <option value="ok">OK</option>
            <option value="warning">Attention</option>
            <option value="gap">Lacune</option>
          </select>
        </div>
        
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500">Document:</label>
          <select id="filter-doc" class="text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none">
            <option value="all">Tous</option>
            ${getDocumentOptions(report)}
          </select>
        </div>
        
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500">Importance min:</label>
          <input type="range" id="filter-importance" min="0" max="100" value="0" 
                 class="w-20 h-1 accent-gray-600">
          <span id="importance-value" class="text-xs text-gray-600">0%</span>
        </div>
      </div>
    </div>

    <!-- Zone graphe principale -->
    <div class="flex-1 relative min-h-0 overflow-hidden">
      <div id="atlas-graph-container" class="w-full h-full"></div>
      
      <!-- Minimap -->
      <div id="atlas-minimap" class="absolute bottom-4 right-4 w-40 h-28 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
        <div id="minimap-content" class="w-full h-full"></div>
        <div id="minimap-viewport" class="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"></div>
      </div>
      
      <!-- Légende -->
      <div class="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md text-xs">
        <div class="font-semibold mb-2 text-gray-700">Types de noeuds</div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-blue-500"></span>
            <span class="text-gray-600">Framework</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-purple-500"></span>
            <span class="text-gray-600">Concept</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-amber-500"></span>
            <span class="text-gray-600">Affirmation</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-green-500"></span>
            <span class="text-gray-600">Preuve</span>
          </div>
        </div>
        <div class="border-t border-gray-200 mt-2 pt-2 space-y-1">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full border-2 border-gray-500"></span>
            <span class="text-gray-600">OK</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full border-2 border-orange-500"></span>
            <span class="text-gray-600">Attention</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full border-2 border-red-500"></span>
            <span class="text-gray-600">Lacune</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal d'inspection -->
    <div id="atlas-inspector-modal" class="fixed inset-0 bg-black/50 hidden z-50 flex items-center justify-center">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div id="inspector-header" class="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span id="inspector-icon"></span>
            <span id="inspector-title" class="font-semibold text-gray-800"></span>
          </div>
          <button id="close-inspector" class="p-1 hover:bg-gray-200 rounded">
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div id="inspector-content" class="p-4 overflow-y-auto max-h-[60vh]"></div>
        <div class="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <button id="export-node-btn" class="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            Exporter JSON
          </button>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    setupDashboardEvents(container, report);
    renderGraph(container, report);
  }, 50);

  return container;
}

/**
 * Génère les options de documents pour le filtre
 */
function getDocumentOptions(report) {
  const docs = new Set();
  report.nodes.forEach(n => {
    (n.docIds || []).forEach(d => docs.add(d));
  });
  return Array.from(docs).map(d => `<option value="${d}">${truncate(d, 30)}</option>`).join('');
}

/**
 * Configure les événements du dashboard
 */
function setupDashboardEvents(container, report) {
  // Filtres
  container.querySelector('#filter-type')?.addEventListener('change', (e) => {
    filters.type = e.target.value;
    applyFilters(container, report);
  });

  container.querySelector('#filter-status')?.addEventListener('change', (e) => {
    filters.status = e.target.value;
    applyFilters(container, report);
  });

  container.querySelector('#filter-doc')?.addEventListener('change', (e) => {
    filters.doc = e.target.value;
    applyFilters(container, report);
  });

  container.querySelector('#filter-importance')?.addEventListener('input', (e) => {
    filters.minImportance = parseInt(e.target.value) / 100;
    container.querySelector('#importance-value').textContent = `${e.target.value}%`;
    applyFilters(container, report);
  });

  // Recherche
  container.querySelector('#atlas-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    searchAndHighlight(query, report);
  });

  // Export
  container.querySelector('#atlas-export-btn')?.addEventListener('click', () => {
    exportAtlas(report);
  });

  // Modal inspector
  container.querySelector('#close-inspector')?.addEventListener('click', () => {
    container.querySelector('#atlas-inspector-modal').classList.add('hidden');
  });

  container.querySelector('#atlas-inspector-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'atlas-inspector-modal') {
      container.querySelector('#atlas-inspector-modal').classList.add('hidden');
    }
  });

  container.querySelector('#export-node-btn')?.addEventListener('click', () => {
    if (selectedNode) {
      const data = {
        node: selectedNode,
        inspection: report.inspection[selectedNode.id]
      };
      downloadJSON(data, `node-${selectedNode.id}.json`);
    }
  });

  // Escape pour fermer modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      container.querySelector('#atlas-inspector-modal')?.classList.add('hidden');
    }
  });
}

/**
 * Applique les filtres sur le graphe
 */
function applyFilters(container, report) {
  if (!g) return;

  g.selectAll('.node-group').each(function(d) {
    const visible = nodePassesFilters(d);
    d3.select(this).style('opacity', visible ? 1 : 0.15);
    d3.select(this).style('pointer-events', visible ? 'all' : 'none');
  });

  // Filtrer les edges aussi
  g.selectAll('.edge-line').each(function(d) {
    const sourceVisible = nodePassesFilters(d.source);
    const targetVisible = nodePassesFilters(d.target);
    d3.select(this).style('opacity', (sourceVisible && targetVisible) ? 0.6 : 0.05);
  });
}

function nodePassesFilters(node) {
  if (filters.type !== 'all' && node.type !== filters.type) return false;
  if (filters.status !== 'all' && node.status !== filters.status) return false;
  if (filters.doc !== 'all' && !(node.docIds || []).includes(filters.doc)) return false;
  if (node.importance_score < filters.minImportance) return false;
  return true;
}

/**
 * Recherche et met en évidence un noeud
 */
function searchAndHighlight(query, report) {
  if (!g) return;

  if (!query) {
    g.selectAll('.node-group').style('opacity', 1);
    g.selectAll('.edge-line').style('opacity', 0.6);
    return;
  }

  g.selectAll('.node-group').each(function(d) {
    const match = d.label.toLowerCase().includes(query) || 
                  (d.short_description || '').toLowerCase().includes(query);
    d3.select(this).style('opacity', match ? 1 : 0.2);
    
    if (match) {
      // Pulse animation
      d3.select(this).select('circle')
        .transition().duration(200)
        .attr('stroke-width', 4)
        .transition().duration(200)
        .attr('stroke-width', 2);
    }
  });
}

/**
 * Rendu du graphe D3.js hiérarchique
 */
function renderGraph(container, report) {
  const graphContainer = container.querySelector('#atlas-graph-container');
  if (!graphContainer || typeof d3 === 'undefined') {
    addLog('error', 'D3.js non disponible');
    return;
  }

  const width = graphContainer.clientWidth || 800;
  const height = graphContainer.clientHeight || 500;

  graphContainer.innerHTML = '';

  svg = d3.select(graphContainer)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height]);

  // Defs pour les flèches
  svg.append('defs').append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '-0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .append('path')
    .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
    .attr('fill', '#999');

  g = svg.append('g');

  // Zoom
  zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
      updateMinimap(container, event.transform, width, height);
    });

  svg.call(zoom);

  // Couleurs par type
  const typeColors = {
    framework: '#3b82f6',
    concept: '#8b5cf6',
    claim: '#f59e0b',
    evidence: '#10b981'
  };

  // Force simulation avec contraintes Y par niveau
  const nodes = report.nodes.map(n => ({...n}));
  const edges = report.edges.map(e => ({
    ...e,
    source: e.from,
    target: e.to
  }));

  // Positions Y par niveau
  const levelY = {
    framework: height * 0.15,
    concept: height * 0.4,
    claim: height * 0.65,
    evidence: height * 0.85
  };

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(80).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('x', d3.forceX(width / 2).strength(0.05))
    .force('y', d3.forceY(d => levelY[d.type] || height / 2).strength(0.3))
    .force('collision', d3.forceCollide().radius(d => 15 + d.importance_score * 20));

  // Edges
  const link = g.append('g')
    .selectAll('line')
    .data(edges)
    .enter()
    .append('line')
    .attr('class', 'edge-line')
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', d => 1 + (d.weight || 0.5) * 2)
    .attr('marker-end', 'url(#arrowhead)')
    .on('mouseover', function(event, d) {
      showEdgeTooltip(event, d);
    })
    .on('mouseout', hideTooltip);

  // Noeuds
  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'node-group')
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // Cercles
  node.append('circle')
    .attr('r', d => 10 + d.importance_score * 15)
    .attr('fill', d => typeColors[d.type] || '#6b7280')
    .attr('stroke', d => STATUS_COLORS[d.status] || '#6b7280')
    .attr('stroke-width', 2)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('stroke-width', 4);
      showNodeTooltip(event, d);
    })
    .on('mouseout', function() {
      d3.select(this).attr('stroke-width', 2);
      hideTooltip();
    })
    .on('click', function(event, d) {
      openInspector(container, d, report);
    })
    .on('dblclick', function(event, d) {
      focusOnNode(d, width, height);
    });

  // Labels
  node.append('text')
    .text(d => truncate(d.label, 15))
    .attr('x', d => 12 + d.importance_score * 15)
    .attr('y', 4)
    .attr('font-size', '10px')
    .attr('fill', '#374151');

  // Tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Drag functions
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Render minimap
  renderMinimap(container, nodes, edges, typeColors, width, height);
}

/**
 * Rendu de la minimap
 */
function renderMinimap(container, nodes, edges, typeColors, mainWidth, mainHeight) {
  const minimapContainer = container.querySelector('#minimap-content');
  if (!minimapContainer) return;

  const mWidth = 160;
  const mHeight = 112;
  const scale = Math.min(mWidth / mainWidth, mHeight / mainHeight) * 0.8;

  minimapContainer.innerHTML = '';

  const mSvg = d3.select(minimapContainer)
    .append('svg')
    .attr('width', mWidth)
    .attr('height', mHeight);

  const mG = mSvg.append('g')
    .attr('transform', `translate(${mWidth/2 - mainWidth*scale/2}, ${mHeight/2 - mainHeight*scale/2}) scale(${scale})`);

  // Edges minimap
  mG.selectAll('line')
    .data(edges)
    .enter()
    .append('line')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 0.5)
    .attr('x1', d => d.source.x || 0)
    .attr('y1', d => d.source.y || 0)
    .attr('x2', d => d.target.x || 0)
    .attr('y2', d => d.target.y || 0);

  // Nodes minimap
  mG.selectAll('circle')
    .data(nodes)
    .enter()
    .append('circle')
    .attr('r', 3)
    .attr('fill', d => typeColors[d.type] || '#6b7280')
    .attr('cx', d => d.x || mainWidth/2)
    .attr('cy', d => d.y || mainHeight/2);

  // Viewport initial
  updateMinimap(container, d3.zoomIdentity, mainWidth, mainHeight);
}

/**
 * Met à jour le viewport de la minimap
 */
function updateMinimap(container, transform, mainWidth, mainHeight) {
  const viewport = container.querySelector('#minimap-viewport');
  if (!viewport) return;

  const mWidth = 160;
  const mHeight = 112;
  const scale = Math.min(mWidth / mainWidth, mHeight / mainHeight) * 0.8;

  const vpWidth = (mainWidth / transform.k) * scale;
  const vpHeight = (mainHeight / transform.k) * scale;
  const vpX = (-transform.x / transform.k) * scale + (mWidth - mainWidth * scale) / 2;
  const vpY = (-transform.y / transform.k) * scale + (mHeight - mainHeight * scale) / 2;

  viewport.style.width = `${vpWidth}px`;
  viewport.style.height = `${vpHeight}px`;
  viewport.style.left = `${vpX}px`;
  viewport.style.top = `${vpY}px`;
}

/**
 * Focus et zoom sur un noeud
 */
function focusOnNode(node, width, height) {
  if (!svg || !zoom) return;

  const scale = 2;
  const x = width / 2 - node.x * scale;
  const y = height / 2 - node.y * scale;

  svg.transition()
    .duration(500)
    .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
}

/**
 * Ouvre le modal d'inspection
 */
function openInspector(container, node, report) {
  selectedNode = node;
  const modal = container.querySelector('#atlas-inspector-modal');
  const title = container.querySelector('#inspector-title');
  const icon = container.querySelector('#inspector-icon');
  const content = container.querySelector('#inspector-content');

  if (!modal || !content) return;

  const inspection = report.inspection[node.id] || {};

  title.textContent = node.label;
  icon.innerHTML = getAtlasIcon(node.type, 'w-5 h-5 text-gray-600');

  content.innerHTML = `
    <div class="space-y-4">
      <!-- Métadonnées -->
      <div class="flex flex-wrap gap-2">
        <span class="px-2 py-1 text-xs rounded-full bg-${getTypeColor(node.type)}-100 text-${getTypeColor(node.type)}-700">${getTypeLabel(node.type)}</span>
        <span class="px-2 py-1 text-xs rounded-full" style="background-color: ${STATUS_COLORS[node.status]}20; color: ${STATUS_COLORS[node.status]}">${getStatusLabel(node.status)}</span>
        <span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">Importance: ${Math.round(node.importance_score * 100)}%</span>
        <span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">Couverture: ${Math.round(node.coverage_score * 100)}%</span>
      </div>
      
      <!-- Résumé -->
      <div>
        <h4 class="text-sm font-semibold text-gray-700 mb-1">Description</h4>
        <p class="text-sm text-gray-600">${node.short_description || 'Aucune description disponible'}</p>
      </div>
      
      <!-- Documents source -->
      <div>
        <h4 class="text-sm font-semibold text-gray-700 mb-1">Documents source</h4>
        <div class="flex flex-wrap gap-1">
          ${(node.docIds || []).map(d => `<span class="px-2 py-0.5 text-xs bg-gray-100 rounded">${truncate(d, 25)}</span>`).join('') || '<span class="text-xs text-gray-400">Aucun</span>'}
        </div>
      </div>
      
      <!-- Preuves -->
      ${inspection.top_evidence && inspection.top_evidence.length > 0 ? `
      <div>
        <h4 class="text-sm font-semibold text-gray-700 mb-2">Preuves (${inspection.top_evidence.length})</h4>
        <div class="space-y-2 max-h-40 overflow-y-auto">
          ${inspection.top_evidence.map(ev => `
            <div class="p-2 bg-gray-50 rounded-lg border border-gray-200">
              <p class="text-xs text-gray-600">"${ev.excerpt}"</p>
              <p class="text-xs text-gray-400 mt-1">— ${ev.doc_title}</p>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
      
      <!-- Noeuds liés -->
      ${inspection.related_nodes && inspection.related_nodes.length > 0 ? `
      <div>
        <h4 class="text-sm font-semibold text-gray-700 mb-2">Noeuds liés (${inspection.related_nodes.length})</h4>
        <div class="flex flex-wrap gap-1">
          ${inspection.related_nodes.map(rn => {
            const relatedNode = report.nodes.find(n => n.id === rn.node_id);
            return relatedNode ? `
              <button class="related-node-btn px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100" data-node-id="${rn.node_id}">
                ${relatedNode.label} <span class="text-purple-400">(${rn.relation_type})</span>
              </button>
            ` : '';
          }).join('')}
        </div>
      </div>
      ` : ''}
    </div>
  `;

  // Events pour noeuds liés
  content.querySelectorAll('.related-node-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nodeId = btn.dataset.nodeId;
      const relatedNode = report.nodes.find(n => n.id === nodeId);
      if (relatedNode) {
        openInspector(container, relatedNode, report);
      }
    });
  });

  modal.classList.remove('hidden');
}

function getTypeColor(type) {
  const colors = { framework: 'blue', concept: 'purple', claim: 'amber', evidence: 'green' };
  return colors[type] || 'gray';
}

function getTypeLabel(type) {
  const labels = { framework: 'Framework', concept: 'Concept', claim: 'Affirmation', evidence: 'Preuve' };
  return labels[type] || type;
}

function getStatusLabel(status) {
  const labels = { ok: 'OK', warning: 'Attention', gap: 'Lacune' };
  return labels[status] || status;
}

/**
 * Tooltips
 */
let tooltipEl = null;

function showNodeTooltip(event, node) {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'fixed bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50';
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = `<strong>${node.label}</strong><br>${node.type} • ${Math.round(node.importance_score * 100)}%`;
  tooltipEl.style.left = `${event.pageX + 10}px`;
  tooltipEl.style.top = `${event.pageY + 10}px`;
  tooltipEl.style.display = 'block';
}

function showEdgeTooltip(event, edge) {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'fixed bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50';
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = `<strong>${edge.type}</strong><br>${edge.explanation || ''}`;
  tooltipEl.style.left = `${event.pageX + 10}px`;
  tooltipEl.style.top = `${event.pageY + 10}px`;
  tooltipEl.style.display = 'block';
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
}

/**
 * Export
 */
function exportAtlas(report) {
  const options = ['JSON', 'SVG', 'PNG'];
  const choice = prompt(`Choisissez le format d'export:\n1. JSON (données brutes)\n2. SVG (image vectorielle)\n3. PNG (image)\n\nEntrez 1, 2 ou 3:`, '1');

  if (choice === '1') {
    downloadJSON(report, 'atlas-report.json');
  } else if (choice === '2') {
    exportSVG();
  } else if (choice === '3') {
    exportPNG();
  }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSVG() {
  if (!svg) return;
  const svgData = new XMLSerializer().serializeToString(svg.node());
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'atlas-graph.svg';
  a.click();
  URL.revokeObjectURL(url);
}

function exportPNG() {
  if (!svg) return;
  const svgData = new XMLSerializer().serializeToString(svg.node());
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'atlas-graph.png';
    a.click();
  };
  
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
}

function truncate(str, len) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.substring(0, len - 3) + '...';
}

// Écouter l'événement atlas:reportReady
window.addEventListener('atlas:reportReady', (e) => {
  const agentContent = document.getElementById('agent-content');
  if (agentContent) {
    agentContent.innerHTML = '';
    agentContent.appendChild(createAtlasDashboard(e.detail));
  }
});


/**
 * AtlasAgent - Knowledge Graph avec D3.js force-directed
 */

import { state, addLog } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';
import { repairJSON, createFallbackJSON } from '../llm/jsonRepair.js';
import { prepareKeywordsContext, extractNGrams } from '../utils/keywordExtract.js';
// showVisualization replaced with direct DOM injection

let currentData = null;
let simulation = null;

/**
 * Génère la visualisation Atlas (Knowledge Graph)
 */
export async function generateAtlasVisualization(onProgress, onComplete) {
  addLog('info', 'AtlasAgent: Génération du graphe de connaissances...');

  if (state.docs.length === 0) {
    addLog('warning', 'AtlasAgent: Aucun document disponible');
    onComplete(null);
    return;
  }

  onProgress(10, 'Extraction des concepts...');

  // Extraire les concepts
  const keywordsContext = prepareKeywordsContext();

  onProgress(30, 'Identification des relations...');

  let graphData;

  if (isModelReady('primary')) {
    graphData = await generateGraphWithLLM(keywordsContext, onProgress);
  } else {
    graphData = generateGraphFromKeywords(keywordsContext);
  }

  onProgress(80, 'Rendu du graphe...');

  const element = createGraphElement(graphData);
  currentData = graphData;
  
  const agentContent = document.getElementById('agent-content');
  if (agentContent) {
    agentContent.innerHTML = '';
    agentContent.appendChild(element);
  }

  onProgress(100, 'Terminé');
  onComplete(graphData);

  addLog('success', 'AtlasAgent: Graphe généré');
}

/**
 * Génère le graphe avec le LLM
 */
async function generateGraphWithLLM(keywordsContext, onProgress) {
  const concepts = keywordsContext.globalConcepts.slice(0, 15);
  
  const prompt = `Analyse ces concepts extraits de documents de recherche et crée un graphe de relations.

Concepts: ${concepts.join(', ')}

Génère un JSON avec cette structure exacte:
{
  "nodes": [
    {"id": "concept1", "label": "Concept 1", "group": 1, "importance": 0.8}
  ],
  "edges": [
    {"source": "concept1", "target": "concept2", "relation": "extends", "weight": 0.7}
  ]
}

Relations possibles: "extends", "uses", "contradicts", "supports", "related", "part_of"
group: 1-5 pour colorer par cluster thématique
importance: 0-1 pour la taille du node

Réponds UNIQUEMENT avec le JSON.`;

  try {
    const response = await generateCompletion([
      { role: 'system', content: 'Tu génères des graphes de connaissances en JSON. Réponds uniquement en JSON valide.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 800 });

    onProgress(60, 'Parsing du graphe...');

    const parsed = repairJSON(response);
    if (parsed && parsed.nodes && parsed.edges) {
      return parsed;
    }
  } catch (error) {
    addLog('warning', `AtlasAgent LLM error: ${error.message}`);
  }

  return generateGraphFromKeywords(keywordsContext);
}

/**
 * Génère le graphe à partir des mots-clés (fallback)
 */
function generateGraphFromKeywords(keywordsContext) {
  const nodes = [];
  const edges = [];
  const conceptSet = new Set();

  // Créer les nodes à partir des concepts globaux
  keywordsContext.globalConcepts.slice(0, 20).forEach((concept, index) => {
    nodes.push({
      id: concept,
      label: concept.charAt(0).toUpperCase() + concept.slice(1),
      group: Math.floor(index / 5) + 1,
      importance: Math.max(0.3, 1 - (index * 0.04))
    });
    conceptSet.add(concept);
  });

  // Créer des edges basées sur la co-occurrence dans les documents
  keywordsContext.perDocument.forEach(doc => {
    const docConcepts = doc.concepts.filter(c => conceptSet.has(c));
    
    for (let i = 0; i < docConcepts.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 3, docConcepts.length); j++) {
        const edgeId = [docConcepts[i], docConcepts[j]].sort().join('-');
        
        if (!edges.find(e => [e.source, e.target].sort().join('-') === edgeId)) {
          edges.push({
            source: docConcepts[i],
            target: docConcepts[j],
            relation: 'related',
            weight: 0.5 + Math.random() * 0.5
          });
        }
      }
    }
  });

  return { nodes, edges };
}

/**
 * Crée l'élément DOM du graphe
 */
function createGraphElement(data) {
  const container = document.createElement('div');
  container.className = 'w-full h-full flex flex-col';

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800">Concept Atlas</h3>
      <div class="flex gap-2">
        <button id="zoom-in" class="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">+</button>
        <button id="zoom-out" class="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">-</button>
        <button id="reset-graph" class="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">Reset</button>
      </div>
    </div>
    <div id="graph-svg" class="flex-1 min-h-[400px] bg-gray-50 rounded-lg overflow-hidden"></div>
    <div id="node-details" class="hidden mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
      <h4 id="detail-label" class="font-semibold text-purple-800"></h4>
      <p id="detail-relations" class="text-sm text-gray-600 mt-1"></p>
    </div>
  `;

  setTimeout(() => renderD3Graph(data, container), 50);

  return container;
}

/**
 * Rendu D3.js du force-directed graph
 */
function renderD3Graph(data, container) {
  const svgContainer = container.querySelector('#graph-svg');
  if (!svgContainer || typeof d3 === 'undefined') {
    addLog('error', 'D3.js non disponible');
    return;
  }

  const width = svgContainer.clientWidth || 600;
  const height = svgContainer.clientHeight || 400;

  svgContainer.innerHTML = '';

  const svg = d3.select(svgContainer)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height]);

  // Zoom handler
  const g = svg.append('g');
  
  const zoom = d3.zoom()
    .scaleExtent([0.3, 4])
    .on('zoom', (event) => g.attr('transform', event.transform));

  svg.call(zoom);

  // Color scale par groupe
  const colorScale = d3.scaleOrdinal()
    .domain([1, 2, 3, 4, 5])
    .range(['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']);

  // Force simulation
  simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.edges).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => 20 + d.importance * 20));

  // Links
  const link = g.append('g')
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .selectAll('line')
    .data(data.edges)
    .enter()
    .append('line')
    .attr('stroke-width', d => d.weight * 3);

  // Nodes
  const node = g.append('g')
    .selectAll('g')
    .data(data.nodes)
    .enter()
    .append('g')
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // Node circles
  node.append('circle')
    .attr('r', d => 10 + d.importance * 15)
    .attr('fill', d => colorScale(d.group))
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('stroke-width', 4);
      showNodeDetails(d, data, container);
    })
    .on('mouseout', function() {
      d3.select(this).attr('stroke-width', 2);
    })
    .on('click', function(event, d) {
      highlightConnections(d, data, g);
    });

  // Node labels
  node.append('text')
    .text(d => d.label)
    .attr('x', d => 12 + d.importance * 15)
    .attr('y', 4)
    .attr('font-size', '11px')
    .attr('fill', '#374151');

  // Tick function
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

  // Zoom buttons
  container.querySelector('#zoom-in')?.addEventListener('click', () => {
    svg.transition().call(zoom.scaleBy, 1.3);
  });

  container.querySelector('#zoom-out')?.addEventListener('click', () => {
    svg.transition().call(zoom.scaleBy, 0.7);
  });

  container.querySelector('#reset-graph')?.addEventListener('click', () => {
    svg.transition().call(zoom.transform, d3.zoomIdentity);
  });
}

function showNodeDetails(nodeData, graphData, container) {
  const detailsPanel = container.querySelector('#node-details');
  const labelEl = container.querySelector('#detail-label');
  const relationsEl = container.querySelector('#detail-relations');

  if (!detailsPanel) return;

  const relatedEdges = graphData.edges.filter(
    e => e.source.id === nodeData.id || e.target.id === nodeData.id ||
         e.source === nodeData.id || e.target === nodeData.id
  );

  const relations = relatedEdges.map(e => {
    const other = (e.source.id || e.source) === nodeData.id 
      ? (e.target.label || e.target) 
      : (e.source.label || e.source);
    return `${e.relation} → ${other}`;
  });

  labelEl.textContent = nodeData.label;
  relationsEl.textContent = relations.length > 0 
    ? `Relations: ${relations.join(', ')}` 
    : 'Aucune relation directe';

  detailsPanel.classList.remove('hidden');
}

function highlightConnections(nodeData, graphData, g) {
  // Reset all
  g.selectAll('line').attr('stroke-opacity', 0.2);
  g.selectAll('circle').attr('opacity', 0.3);

  // Highlight connected
  const connected = new Set([nodeData.id]);
  graphData.edges.forEach(e => {
    const sourceId = e.source.id || e.source;
    const targetId = e.target.id || e.target;
    if (sourceId === nodeData.id) connected.add(targetId);
    if (targetId === nodeData.id) connected.add(sourceId);
  });

  g.selectAll('circle')
    .attr('opacity', d => connected.has(d.id) ? 1 : 0.3);

  g.selectAll('line')
    .attr('stroke-opacity', d => {
      const sourceId = d.source.id || d.source;
      const targetId = d.target.id || d.target;
      return (sourceId === nodeData.id || targetId === nodeData.id) ? 1 : 0.1;
    });

  // Reset après 3 secondes
  setTimeout(() => {
    g.selectAll('line').attr('stroke-opacity', 0.6);
    g.selectAll('circle').attr('opacity', 1);
  }, 3000);
}

export function getAtlasData() {
  return currentData;
}

// Écouter l'événement de génération
window.addEventListener('viz:generate', async (e) => {
  if (e.detail.agent.id === 'atlas') {
    await generateAtlasVisualization(e.detail.onProgress, e.detail.onComplete);
  }
});


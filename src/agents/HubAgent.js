/**
 * HubAgent - Exploration Dashboard avec Heatmap
 */

import { state, addLog } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';
import { repairJSON, createFallbackJSON } from '../llm/jsonRepair.js';
import { identifyThemes, prepareKeywordsContext } from '../utils/keywordExtract.js';
// showVisualization replaced with direct DOM injection

let currentData = null;

/**
 * Génère la visualisation Hub (Heatmap)
 */
export async function generateHubVisualization(onProgress, onComplete) {
  addLog('info', 'HubAgent: Génération de la heatmap...');

  if (state.docs.length === 0) {
    addLog('warning', 'HubAgent: Aucun document disponible');
    onComplete(null);
    return;
  }

  onProgress(10, 'Analyse des thèmes...');

  // Extraire les thèmes et concepts
  const keywordsContext = prepareKeywordsContext();
  const themes = keywordsContext.themes.length > 0 
    ? keywordsContext.themes.map(t => t.main)
    : ['Thème 1', 'Thème 2', 'Thème 3'];

  const docNames = state.docs.map(d => d.displayName || d.filename.replace(/\.pdf$/i, ''));

  onProgress(30, 'Calcul de la couverture...');

  let heatmapData;

  // Si modèle LLM disponible, utiliser pour une analyse plus fine
  if (isModelReady('primary')) {
    heatmapData = await generateHeatmapWithLLM(themes, docNames, onProgress);
  } else {
    // Fallback: calcul basé sur les mots-clés
    heatmapData = generateHeatmapFromKeywords(themes, docNames, keywordsContext);
  }

  onProgress(80, 'Rendu de la visualisation...');

  // Créer et afficher la heatmap
  const element = createHeatmapElement(heatmapData);
  currentData = heatmapData;
  
  const agentContent = document.getElementById('agent-content');
  if (agentContent) {
    agentContent.innerHTML = '';
    agentContent.appendChild(element);
  }

  onProgress(100, 'Terminé');
  onComplete(heatmapData);

  addLog('success', 'HubAgent: Heatmap générée');
}

/**
 * Génère la heatmap avec le LLM
 */
async function generateHeatmapWithLLM(themes, docNames, onProgress) {
  const prompt = `Analyse ces documents et thèmes, puis génère un JSON de couverture.

Documents: ${docNames.join(', ')}
Thèmes identifiés: ${themes.join(', ')}

Génère un JSON avec cette structure exacte:
{
  "heatmap": {
    "themes": ["theme1", "theme2", ...],
    "documents": ["doc1", "doc2", ...],
    "coverage": [[0.8, 0.2], [0.3, 0.9], ...]
  }
}

coverage[i][j] = score entre 0 et 1 indiquant combien le document i couvre le thème j.
Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

  try {
    const response = await generateCompletion([
      { role: 'system', content: 'Tu es un assistant qui analyse des documents et génère des données JSON. Réponds uniquement en JSON valide.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 500 });

    onProgress(60, 'Parsing des résultats...');

    const parsed = repairJSON(response);
    if (parsed && parsed.heatmap) {
      return parsed.heatmap;
    }
  } catch (error) {
    addLog('warning', `HubAgent LLM error: ${error.message}`);
  }

  // Fallback
  return createFallbackJSON('heatmap').heatmap;
}

/**
 * Génère la heatmap à partir des mots-clés (fallback sans LLM)
 */
function generateHeatmapFromKeywords(themes, docNames, keywordsContext) {
  const coverage = [];

  state.docs.forEach((doc, docIndex) => {
    const docConcepts = keywordsContext.perDocument.find(d => d.docId === doc.id)?.concepts || [];
    const row = [];

    themes.forEach(theme => {
      // Score basé sur la présence du thème dans les concepts du doc
      const score = docConcepts.some(c => 
        c.includes(theme.toLowerCase()) || theme.toLowerCase().includes(c)
      ) ? 0.7 + Math.random() * 0.3 : Math.random() * 0.4;
      
      row.push(Math.round(score * 100) / 100);
    });

    coverage.push(row);
  });

  return {
    themes,
    documents: docNames,
    coverage
  };
}

/**
 * Crée l'élément DOM de la heatmap D3.js
 */
function createHeatmapElement(data) {
  const container = document.createElement('div');
  container.className = 'w-full h-full flex flex-col';

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800">Coverage Heatmap</h3>
      <div class="text-sm text-gray-500">Thèmes × Documents</div>
    </div>
    <div id="heatmap-svg" class="flex-1 min-h-[300px]"></div>
    <div id="heatmap-tooltip" class="hidden absolute bg-gray-900 text-white text-xs px-2 py-1 rounded pointer-events-none z-50"></div>
  `;

  // Render D3 après insertion dans le DOM
  setTimeout(() => renderD3Heatmap(data, container), 50);

  return container;
}

/**
 * Rendu D3.js de la heatmap
 */
function renderD3Heatmap(data, container) {
  const svgContainer = container.querySelector('#heatmap-svg');
  if (!svgContainer || typeof d3 === 'undefined') {
    addLog('error', 'D3.js non disponible');
    return;
  }

  const width = svgContainer.clientWidth || 600;
  const height = Math.max(300, svgContainer.clientHeight || 400);
  const margin = { top: 80, right: 30, bottom: 30, left: 150 };

  // Clear previous
  svgContainer.innerHTML = '';

  const svg = d3.select(svgContainer)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Scales
  const xScale = d3.scaleBand()
    .domain(data.themes)
    .range([0, innerWidth])
    .padding(0.05);

  const yScale = d3.scaleBand()
    .domain(data.documents)
    .range([0, innerHeight])
    .padding(0.05);

  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, 1]);

  // Cells
  data.documents.forEach((doc, i) => {
    data.themes.forEach((theme, j) => {
      const value = data.coverage[i]?.[j] || 0;

      g.append('rect')
        .attr('x', xScale(theme))
        .attr('y', yScale(doc))
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('fill', colorScale(value))
        .attr('rx', 4)
        .style('cursor', 'pointer')
        .on('mouseover', function(event) {
          d3.select(this).attr('stroke', '#333').attr('stroke-width', 2);
          showTooltip(event, `${doc} × ${theme}: ${Math.round(value * 100)}%`, container);
        })
        .on('mouseout', function() {
          d3.select(this).attr('stroke', 'none');
          hideTooltip(container);
        })
        .on('click', function() {
          showCellDetails(doc, theme, value);
        });

      // Value label
      if (xScale.bandwidth() > 30 && yScale.bandwidth() > 20) {
        g.append('text')
          .attr('x', xScale(theme) + xScale.bandwidth() / 2)
          .attr('y', yScale(doc) + yScale.bandwidth() / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', value > 0.5 ? 'white' : '#333')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .text(`${Math.round(value * 100)}%`);
      }
    });
  });

  // X axis (themes)
  g.append('g')
    .attr('transform', `translate(0,-10)`)
    .selectAll('text')
    .data(data.themes)
    .enter()
    .append('text')
    .attr('x', d => xScale(d) + xScale.bandwidth() / 2)
    .attr('y', -5)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', '#374151')
    .text(d => d.length > 15 ? d.substring(0, 15) + '...' : d)
    .attr('transform', d => `rotate(-35, ${xScale(d) + xScale.bandwidth() / 2}, -5)`);

  // Y axis (documents)
  g.append('g')
    .attr('transform', `translate(-10,0)`)
    .selectAll('text')
    .data(data.documents)
    .enter()
    .append('text')
    .attr('x', -5)
    .attr('y', d => yScale(d) + yScale.bandwidth() / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '11px')
    .attr('fill', '#374151')
    .text(d => d.length > 20 ? d.substring(0, 20) + '...' : d);

  // Legend
  const legendWidth = 120;
  const legendHeight = 10;
  
  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left}, 20)`);

  const legendScale = d3.scaleLinear()
    .domain([0, 1])
    .range([0, legendWidth]);

  const legendAxis = d3.axisBottom(legendScale)
    .ticks(5)
    .tickFormat(d => `${Math.round(d * 100)}%`);

  // Gradient
  const defs = svg.append('defs');
  const gradient = defs.append('linearGradient')
    .attr('id', 'heatmap-gradient');

  gradient.selectAll('stop')
    .data([0, 0.5, 1])
    .enter()
    .append('stop')
    .attr('offset', d => `${d * 100}%`)
    .attr('stop-color', d => colorScale(d));

  legend.append('rect')
    .attr('width', legendWidth)
    .attr('height', legendHeight)
    .style('fill', 'url(#heatmap-gradient)')
    .attr('rx', 2);

  legend.append('g')
    .attr('transform', `translate(0, ${legendHeight})`)
    .call(legendAxis)
    .selectAll('text')
    .attr('font-size', '9px');

  legend.append('text')
    .attr('x', legendWidth + 10)
    .attr('y', legendHeight / 2)
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '10px')
    .attr('fill', '#6b7280')
    .text('Couverture');
}

function showTooltip(event, text, container) {
  const tooltip = container.querySelector('#heatmap-tooltip');
  if (tooltip) {
    tooltip.textContent = text;
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY - 25}px`;
    tooltip.classList.remove('hidden');
  }
}

function hideTooltip(container) {
  const tooltip = container.querySelector('#heatmap-tooltip');
  if (tooltip) {
    tooltip.classList.add('hidden');
  }
}

function showCellDetails(doc, theme, value) {
  addLog('info', `Détails: ${doc} × ${theme} = ${Math.round(value * 100)}%`);
  // TODO: Afficher les chunks associés dans un modal
}

/**
 * Retourne les données actuelles pour export
 */
export function getHubData() {
  return currentData;
}

// Écouter l'événement de génération
window.addEventListener('viz:generate', async (e) => {
  if (e.detail.agent.id === 'hub') {
    await generateHubVisualization(e.detail.onProgress, e.detail.onComplete);
  }
});


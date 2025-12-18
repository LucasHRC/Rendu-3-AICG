/**
 * TimelineAgent - Frise temporelle avec D3.js
 */

import { state, addLog } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';
import { repairJSON, createFallbackJSON } from '../llm/jsonRepair.js';
// showVisualization replaced with direct DOM injection

let currentData = null;

/**
 * Génère la visualisation Timeline
 */
export async function generateTimelineVisualization(onProgress, onComplete) {
  addLog('info', 'TimelineAgent: Génération de la frise temporelle...');

  if (state.docs.length === 0) {
    addLog('warning', 'TimelineAgent: Aucun document disponible');
    onComplete(null);
    return;
  }

  onProgress(10, 'Extraction des dates...');

  let timelineData;

  if (isModelReady('primary')) {
    timelineData = await extractTimelineWithLLM(onProgress);
  } else {
    timelineData = extractTimelineFromDocs();
  }

  onProgress(80, 'Rendu de la frise...');

  const element = createTimelineElement(timelineData);
  currentData = timelineData;
  
  const agentContent = document.getElementById('agent-content');
  if (agentContent) {
    agentContent.innerHTML = '';
    agentContent.appendChild(element);
  }

  onProgress(100, 'Terminé');
  onComplete(timelineData);

  addLog('success', 'TimelineAgent: Frise générée');
}

/**
 * Extrait la timeline avec le LLM
 */
async function extractTimelineWithLLM(onProgress) {
  // Préparer le contexte des documents
  const docSummaries = state.docs.map(d => {
    const text = d.extractedText || '';
    return `${d.displayName || d.filename}: ${text.substring(0, 500)}...`;
  }).join('\n\n');

  const prompt = `Analyse ces documents et extrait les événements/concepts clés avec leurs dates pour créer une frise temporelle.

Documents:
${docSummaries}

Génère un JSON avec cette structure:
{
  "events": [
    {"date": "2020", "title": "Titre court", "docId": "doc1", "description": "Description brève", "type": "discovery"}
  ],
  "connections": [
    {"from": 0, "to": 1, "type": "influence"}
  ]
}

Types d'événements: "discovery", "publication", "development", "milestone"
Types de connexions: "influence", "evolution", "contradiction"

Réponds UNIQUEMENT avec le JSON.`;

  try {
    onProgress(40, 'Analyse LLM...');

    const response = await generateCompletion([
      { role: 'system', content: 'Tu analyses des documents pour extraire une chronologie. Réponds en JSON valide.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 800 });

    onProgress(60, 'Parsing...');

    const parsed = repairJSON(response);
    if (parsed && parsed.events) {
      return parsed;
    }
  } catch (error) {
    addLog('warning', `TimelineAgent LLM error: ${error.message}`);
  }

  return extractTimelineFromDocs();
}

/**
 * Extrait la timeline à partir des documents (fallback)
 */
function extractTimelineFromDocs() {
  const events = [];
  const datePattern = /\b(19|20)\d{2}\b/g;

  state.docs.forEach((doc, index) => {
    const text = doc.extractedText || '';
    const matches = text.match(datePattern) || [];
    
    // Extraire les années uniques
    const years = [...new Set(matches)].sort();
    
    if (years.length > 0) {
      // Prendre la première et dernière année mentionnées
      events.push({
        date: years[0],
        title: doc.displayName || doc.filename.replace(/\.pdf$/i, ''),
        docId: doc.id,
        description: `Document couvrant la période ${years[0]} - ${years[years.length - 1] || years[0]}`,
        type: 'publication'
      });
    } else {
      // Utiliser la date d'upload comme fallback
      const year = new Date().getFullYear();
      events.push({
        date: String(year),
        title: doc.displayName || doc.filename.replace(/\.pdf$/i, ''),
        docId: doc.id,
        description: 'Date exacte non identifiée',
        type: 'publication'
      });
    }
  });

  // Trier par date
  events.sort((a, b) => parseInt(a.date) - parseInt(b.date));

  // Créer des connexions séquentielles
  const connections = [];
  for (let i = 0; i < events.length - 1; i++) {
    connections.push({
      from: i,
      to: i + 1,
      type: 'evolution'
    });
  }

  return { events, connections };
}

/**
 * Crée l'élément DOM de la timeline
 */
function createTimelineElement(data) {
  const container = document.createElement('div');
  container.className = 'w-full h-full flex flex-col';

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800">Influence Timeline</h3>
      <div class="text-sm text-gray-500">${data.events.length} événements</div>
    </div>
    <div id="timeline-svg" class="flex-1 min-h-[300px] overflow-x-auto"></div>
    <div id="event-details" class="hidden mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
      <h4 id="event-title" class="font-semibold text-green-800"></h4>
      <p id="event-date" class="text-xs text-green-600"></p>
      <p id="event-desc" class="text-sm text-gray-600 mt-1"></p>
    </div>
  `;

  setTimeout(() => renderD3Timeline(data, container), 50);

  return container;
}

/**
 * Rendu D3.js de la timeline
 */
function renderD3Timeline(data, container) {
  const svgContainer = container.querySelector('#timeline-svg');
  if (!svgContainer || typeof d3 === 'undefined') {
    addLog('error', 'D3.js non disponible');
    return;
  }

  const width = Math.max(svgContainer.clientWidth || 800, data.events.length * 150);
  const height = svgContainer.clientHeight || 300;
  const margin = { top: 60, right: 50, bottom: 60, left: 50 };

  svgContainer.innerHTML = '';

  const svg = d3.select(svgContainer)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Extraire les années pour l'axe
  const years = data.events.map(e => parseInt(e.date));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const xScale = d3.scaleLinear()
    .domain([minYear - 1, maxYear + 1])
    .range([0, innerWidth]);

  // Axe horizontal
  const xAxis = d3.axisBottom(xScale)
    .tickFormat(d => d.toString())
    .ticks(Math.min(data.events.length + 2, 10));

  g.append('g')
    .attr('transform', `translate(0,${innerHeight / 2})`)
    .call(xAxis)
    .selectAll('text')
    .attr('font-size', '11px');

  // Ligne principale
  g.append('line')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', innerHeight / 2)
    .attr('y2', innerHeight / 2)
    .attr('stroke', '#e5e7eb')
    .attr('stroke-width', 4);

  // Couleurs par type
  const typeColors = {
    discovery: '#3b82f6',
    publication: '#10b981',
    development: '#8b5cf6',
    milestone: '#f59e0b'
  };

  // Événements
  const eventGroups = g.selectAll('.event')
    .data(data.events)
    .enter()
    .append('g')
    .attr('class', 'event')
    .attr('transform', (d, i) => {
      const x = xScale(parseInt(d.date));
      const y = i % 2 === 0 ? innerHeight / 2 - 60 : innerHeight / 2 + 60;
      return `translate(${x},${y})`;
    })
    .style('cursor', 'pointer');

  // Cercles
  eventGroups.append('circle')
    .attr('r', 12)
    .attr('fill', d => typeColors[d.type] || '#6b7280')
    .attr('stroke', '#fff')
    .attr('stroke-width', 3)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('r', 16);
      showEventDetails(d, container);
    })
    .on('mouseout', function() {
      d3.select(this).attr('r', 12);
    });

  // Lignes vers l'axe
  eventGroups.append('line')
    .attr('x1', 0)
    .attr('x2', 0)
    .attr('y1', 12)
    .attr('y2', (d, i) => i % 2 === 0 ? 48 : -48)
    .attr('stroke', d => typeColors[d.type] || '#6b7280')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '4,4');

  // Labels
  eventGroups.append('text')
    .text(d => d.title.length > 20 ? d.title.substring(0, 18) + '...' : d.title)
    .attr('y', (d, i) => i % 2 === 0 ? -20 : 30)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', '#374151');

  // Dates
  eventGroups.append('text')
    .text(d => d.date)
    .attr('y', (d, i) => i % 2 === 0 ? -35 : 45)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .attr('fill', '#6b7280');

  // Connexions (arcs)
  data.connections.forEach(conn => {
    const fromEvent = data.events[conn.from];
    const toEvent = data.events[conn.to];
    if (!fromEvent || !toEvent) return;

    const x1 = xScale(parseInt(fromEvent.date));
    const x2 = xScale(parseInt(toEvent.date));
    const y = innerHeight / 2;

    const midX = (x1 + x2) / 2;
    const controlY = y - 40;

    g.append('path')
      .attr('d', `M ${x1} ${y} Q ${midX} ${controlY} ${x2} ${y}`)
      .attr('fill', 'none')
      .attr('stroke', conn.type === 'influence' ? '#3b82f6' : 
                      conn.type === 'contradiction' ? '#ef4444' : '#10b981')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', conn.type === 'contradiction' ? '5,5' : 'none')
      .attr('opacity', 0.5);
  });

  // Légende
  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left}, 15)`);

  Object.entries(typeColors).forEach(([type, color], i) => {
    legend.append('circle')
      .attr('cx', i * 100)
      .attr('cy', 0)
      .attr('r', 6)
      .attr('fill', color);

    legend.append('text')
      .attr('x', i * 100 + 12)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#6b7280')
      .text(type);
  });
}

function showEventDetails(eventData, container) {
  const panel = container.querySelector('#event-details');
  const titleEl = container.querySelector('#event-title');
  const dateEl = container.querySelector('#event-date');
  const descEl = container.querySelector('#event-desc');

  if (!panel) return;

  titleEl.textContent = eventData.title;
  dateEl.textContent = eventData.date;
  descEl.textContent = eventData.description;

  panel.classList.remove('hidden');
}

export function getTimelineData() {
  return currentData;
}

// Écouter l'événement de génération
window.addEventListener('viz:generate', async (e) => {
  if (e.detail.agent.id === 'timeline') {
    await generateTimelineVisualization(e.detail.onProgress, e.detail.onComplete);
  }
});


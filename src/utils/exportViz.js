/**
 * Export des visualisations en PNG/SVG/JSON
 */

import { addLog } from '../state/state.js';
import { getHubReport } from '../agents/HubAgent.js';
import { getAtlasReport } from '../agents/AtlasAgent.js';
import { getTimelineData } from '../agents/TimelineAgent.js';
import { getScrollyData } from '../agents/ScrollyAgent.js';

/**
 * Exporte la visualisation courante en PNG
 */
export async function exportToPNG() {
  const svg = document.querySelector('#viz-render svg');
  if (!svg) {
    addLog('warning', 'Aucune visualisation SVG à exporter');
    return;
  }

  try {
    const canvas = await svgToCanvas(svg);
    const dataUrl = canvas.toDataURL('image/png');
    downloadFile(dataUrl, `visualization-${Date.now()}.png`);
    addLog('success', 'PNG exporté');
  } catch (error) {
    addLog('error', `Export PNG échoué: ${error.message}`);
  }
}

/**
 * Exporte la visualisation courante en SVG
 */
export function exportToSVG() {
  const svg = document.querySelector('#viz-render svg');
  if (!svg) {
    addLog('warning', 'Aucune visualisation SVG à exporter');
    return;
  }

  try {
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, `visualization-${Date.now()}.svg`);
    URL.revokeObjectURL(url);
    addLog('success', 'SVG exporté');
  } catch (error) {
    addLog('error', `Export SVG échoué: ${error.message}`);
  }
}

/**
 * Exporte les données de la visualisation courante en JSON
 */
export function exportToJSON(agentId = null) {
  let data = null;

  // Essayer de récupérer les données de chaque agent
  data = getHubReport() || getAtlasReport() || getTimelineData() || getScrollyData();

  if (!data) {
    addLog('warning', 'Aucune donnée à exporter');
    return;
  }

  try {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, `agent-data-${Date.now()}.json`);
    URL.revokeObjectURL(url);
    addLog('success', 'JSON exporté');
  } catch (error) {
    addLog('error', `Export JSON échoué: ${error.message}`);
  }
}

/**
 * Convertit un SVG en canvas
 */
async function svgToCanvas(svg) {
  return new Promise((resolve, reject) => {
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Dimensions
    const bbox = svg.getBoundingClientRect();
    canvas.width = bbox.width * 2; // Retina
    canvas.height = bbox.height * 2;
    ctx.scale(2, 2);

    // Background blanc
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, bbox.width, bbox.height);

    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };

    img.onerror = reject;

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    img.src = URL.createObjectURL(svgBlob);
  });
}

/**
 * Déclenche le téléchargement d'un fichier
 */
function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Setup des boutons d'export
function setupExportButtons() {
  document.getElementById('export-png-btn')?.addEventListener('click', exportToPNG);
  document.getElementById('export-svg-btn')?.addEventListener('click', exportToSVG);
  document.getElementById('export-json-btn')?.addEventListener('click', exportToJSON);
}

// Initialiser quand l'onglet visualisation est actif
window.addEventListener('tab:changed', (e) => {
  if (e.detail.tab === 'viz') {
    setTimeout(setupExportButtons, 100);
  }
});

// Setup initial
setTimeout(setupExportButtons, 500);


/**
 * Composant UI : Panel de Logs
 * Affiche les logs de l'application en temps réel
 */

export function createLogsPanel() {
  const logsContainer = document.createElement('div');
  logsContainer.id = 'logs-panel';
  logsContainer.className = 'bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg overflow-y-auto max-h-64';
  
  const logsTitle = document.createElement('h3');
  logsTitle.className = 'text-white font-bold mb-2 text-lg';
  logsTitle.textContent = 'Logs';
  
  const logsList = document.createElement('div');
  logsList.id = 'logs-list';
  logsList.className = 'space-y-1';
  
  logsContainer.appendChild(logsTitle);
  logsContainer.appendChild(logsList);
  
  // Écouter les nouveaux logs
  window.addEventListener('state:log', (event) => {
    addLogEntry(event.detail, logsList);
  });
  
  return logsContainer;
}

/**
 * Ajoute une entrée de log à la liste
 */
function addLogEntry(logEntry, container) {
  const logElement = document.createElement('div');
  logElement.className = 'flex items-start gap-2';
  
  // Icône selon le niveau
  const icon = getLogIcon(logEntry.level);
  const color = getLogColor(logEntry.level);
  
  logElement.innerHTML = `
    <span class="text-xs text-gray-500">${logEntry.timestamp}</span>
    <span class="${color}">${icon}</span>
    <span class="flex-1">${logEntry.message}</span>
  `;
  
  // Ajouter les données si présentes
  if (logEntry.data) {
    const dataElement = document.createElement('details');
    dataElement.className = 'text-xs text-gray-400 ml-6';
    dataElement.innerHTML = `
      <summary class="cursor-pointer">Details</summary>
      <pre class="mt-1 p-2 bg-gray-800 rounded">${JSON.stringify(logEntry.data, null, 2)}</pre>
    `;
    logElement.appendChild(dataElement);
  }
  
  container.appendChild(logElement);
  
  // Scroll vers le bas
  container.scrollTop = container.scrollHeight;
  
  // Limiter à 50 entrées visibles
  const children = container.children;
  if (children.length > 50) {
    container.removeChild(children[0]);
  }
}

function getLogIcon(level) {
  const icons = {
    info: '[i]',
    success: '[+]',
    warning: '[!]',
    error: '[x]'
  };
  return icons[level] || '[.]';
}

function getLogColor(level) {
  const colors = {
    info: 'text-blue-400',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    error: 'text-red-400'
  };
  return colors[level] || 'text-gray-400';
}

/**
 * Initialise les logs existants depuis le state
 */
export function renderInitialLogs(logs, container) {
  const logsList = container.querySelector('#logs-list');
  if (!logsList) return;
  
  logs.forEach(log => {
    addLogEntry(log, logsList);
  });
}


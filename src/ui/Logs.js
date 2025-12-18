/**
 * Composant UI : Panel de logs - Design avec couleurs
 */

import { state } from '../state/state.js';

/**
 * Crée le panel de logs
 */
export function createLogsPanel() {
  const panel = document.createElement('div');
  panel.id = 'logs-panel';
  panel.className = 'h-full overflow-y-auto text-sm font-mono bg-gray-50 rounded-xl p-3';

  // Écouter les nouveaux logs
  window.addEventListener('state:logAdded', (e) => {
    const log = e.detail;
    const logElement = createLogEntry(log);
    panel.appendChild(logElement);
    panel.scrollTop = panel.scrollHeight;
  });

  return panel;
}

/**
 * Rend les logs initiaux
 */
export function renderInitialLogs(logs, panel) {
  if (!panel) return;
  panel.innerHTML = '';
  logs.forEach((log) => {
    panel.appendChild(createLogEntry(log));
  });
  panel.scrollTop = panel.scrollHeight;
}

/**
 * Crée une entrée de log
 */
function createLogEntry(log) {
  const entry = document.createElement('div');
  entry.className = 'flex items-start gap-3 py-1';

  const time = document.createElement('span');
  time.className = 'text-gray-400 flex-shrink-0 text-xs';
  time.textContent = log.timestamp.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const icon = document.createElement('span');
  const configs = {
    info: ['text-blue-500', '●'],
    success: ['text-green-500', '●'],
    warning: ['text-yellow-500', '●'],
    error: ['text-red-500', '●']
  };
  const [color, symbol] = configs[log.level] || configs.info;
  icon.className = `flex-shrink-0 text-xs ${color}`;
  icon.textContent = symbol;

  const message = document.createElement('span');
  message.className = 'flex-1 min-w-0 truncate text-gray-700';
  message.textContent = log.message;
  message.title = log.message;

  entry.appendChild(time);
  entry.appendChild(icon);
  entry.appendChild(message);

  return entry;
}

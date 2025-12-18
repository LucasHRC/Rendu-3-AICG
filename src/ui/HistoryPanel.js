/**
 * Panneau Historique des Conversations et Agents
 */

import { getChatHistory, clearChatHistory } from '../llm/chat.js';
import { parseMarkdown } from '../utils/markdown.js';
import { addLog, state } from '../state/state.js';
import { showAgentFromHistory } from './ChatPanel.js';

// Icônes SVG pour les agents
const AGENT_ICONS = {
  hub: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"/></svg>`,
  atlas: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"/></svg>`,
  timeline: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  scrolly: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`
};

/**
 * Cree le panneau d'historique
 */
export function createHistoryPanel() {
  const panel = document.createElement('div');
  panel.id = 'history-panel';
  panel.className = 'bg-white rounded-xl border border-gray-200 p-4';

  panel.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-gray-900 flex items-center gap-2">
        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Historique
      </h3>
      <button id="clear-history-btn" class="text-xs text-gray-400 hover:text-red-500 transition-colors">
        Effacer
      </button>
    </div>
    <div id="history-list" class="max-h-[250px] overflow-y-auto space-y-2">
      <p class="text-xs text-gray-400 text-center py-4">Aucune conversation</p>
    </div>
  `;

  // Setup events
  setTimeout(() => {
    setupHistoryEvents(panel);
    renderHistoryList();
  }, 0);

  // Ecouter les nouveaux messages et agents
  window.addEventListener('chat:messageAdded', () => renderHistoryList());
  window.addEventListener('chat:cleared', () => renderHistoryList());
  window.addEventListener('agent:saved', () => renderHistoryList());

  return panel;
}

function setupHistoryEvents(panel) {
  const clearBtn = panel.querySelector('#clear-history-btn');
  clearBtn?.addEventListener('click', () => {
    if (confirm('Effacer tout l\'historique ?')) {
      clearChatHistory('primary');
      clearChatHistory('secondary');
      renderHistoryList();
    }
  });
}

/**
 * Rend la liste des conversations et agents
 */
function renderHistoryList() {
  const container = document.getElementById('history-list');
  if (!container) return;

  // Combiner les historiques chat et agents
  const primaryHistory = getChatHistory('primary') || [];
  const secondaryHistory = getChatHistory('secondary') || [];
  const agentHistory = state.agentHistory || [];
  
  // Grouper par paires Q+R
  const conversations = groupConversations(primaryHistory);
  const secondaryConvs = groupConversations(secondaryHistory);

  // Fusionner tout et trier par date
  const allItems = [
    ...conversations.map(c => ({ ...c, type: 'chat', slot: 'primary' })),
    ...secondaryConvs.map(c => ({ ...c, type: 'chat', slot: 'secondary' })),
    ...agentHistory.map(a => ({ ...a, type: 'agent' }))
  ];
  allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (allItems.length === 0) {
    container.innerHTML = `
      <p class="text-xs text-gray-400 text-center py-4">Aucune activite</p>
    `;
    return;
  }

  container.innerHTML = allItems.slice(0, 20).map((item, idx) => {
    const time = new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (item.type === 'agent') {
      // Affichage agent
      return `
        <div class="history-entry agent-entry p-2 rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-white hover:border-gray-400 cursor-pointer transition-all" 
             data-agent-id="${item.id}" data-idx="${idx}">
          <div class="flex items-center gap-2">
            <span class="text-gray-500">${AGENT_ICONS[item.agentId] || ''}</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-gray-800">${item.agentName}</p>
            </div>
            <span class="text-xs text-gray-400">${time}</span>
          </div>
        </div>
      `;
    } else {
      // Affichage chat
      const truncQuestion = item.question.substring(0, 40) + (item.question.length > 40 ? '...' : '');
      return `
        <div class="history-entry chat-entry p-2 rounded-lg border border-gray-100 hover:border-gray-300 cursor-pointer transition-all" 
             data-conv-idx="${idx}" data-slot="${item.slot}">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-gray-900 truncate">${truncQuestion}</p>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="text-xs text-gray-400">${time}</span>
              ${item.sources?.length > 0 ? `<span class="text-xs px-1 py-0.5 bg-gray-100 text-gray-600 rounded">${item.sources.length}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }
  }).join('');

  // Event listeners pour agents - ouvre un modal d'apercu
  container.querySelectorAll('.agent-entry').forEach(entry => {
    entry.addEventListener('click', () => {
      const agentId = entry.dataset.agentId;
      const agent = agentHistory.find(a => a.id === agentId);
      if (agent) {
        showAgentModal(agent);
      }
    });
  });

  // Event listeners pour chats
  container.querySelectorAll('.chat-entry').forEach(entry => {
    entry.addEventListener('click', () => {
      const idx = parseInt(entry.dataset.convIdx);
      const slot = entry.dataset.slot;
      const convs = slot === 'secondary' ? secondaryConvs : conversations;
      if (convs[idx]) {
        showConversationModal(convs[idx], slot);
      }
    });
  });
}

/**
 * Groupe les messages en paires Q+R
 */
function groupConversations(history) {
  const conversations = [];
  
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'user') {
      // Chercher la reponse suivante
      const response = history[i + 1];
      if (response && response.role === 'assistant') {
        conversations.push({
          id: msg.id,
          question: msg.content,
          response: response.content,
          sources: response.sources || [],
          timestamp: msg.timestamp
        });
        i++; // Skip la reponse
      }
    }
  }
  
  return conversations;
}

/**
 * Affiche le modal de detail
 */
function showConversationModal(conv, slot) {
  const modal = document.createElement('div');
  modal.id = 'conversation-modal';
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';

  const date = new Date(conv.timestamp).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });

  const responseHTML = parseMarkdown(conv.response);

  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 class="font-bold text-gray-900">Conversation</h3>
          <p class="text-xs text-gray-500">${date}</p>
        </div>
        <button id="close-modal-btn" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <!-- Question -->
        <div class="bg-blue-50 rounded-xl p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-semibold text-blue-700">Question</span>
          </div>
          <p class="text-sm text-gray-900">${conv.question}</p>
        </div>

        <!-- Reponse -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-semibold text-gray-700">Reponse</span>
          </div>
          <div class="text-sm text-gray-900 prose prose-sm max-w-none">${responseHTML}</div>
        </div>

        <!-- Sources -->
        ${conv.sources.length > 0 ? `
          <div class="bg-purple-50 rounded-xl p-4">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-xs font-semibold text-purple-700">Sources utilisees (${conv.sources.length})</span>
            </div>
            <div class="space-y-2 max-h-40 overflow-y-auto">
              ${conv.sources.map((s, i) => `
                <div class="bg-white rounded-lg p-2 border border-purple-100">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-purple-800">[${i + 1}] ${s.source}</span>
                    <span class="text-xs text-purple-600">${(s.score * 100).toFixed(0)}%</span>
                  </div>
                  <p class="text-xs text-gray-600 line-clamp-2">${s.text}</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50">
        <div class="flex items-center gap-2">
          <button id="delete-conv-btn" class="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            Supprimer
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button id="copy-conv-btn" class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Copier
          </button>
          <button id="resend-conv-btn" class="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Renvoyer
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  const closeModal = () => modal.remove();
  
  modal.querySelector('#close-modal-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  
  document.addEventListener('keydown', function handleEscape(e) {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  });

  // Actions
  modal.querySelector('#copy-conv-btn')?.addEventListener('click', () => {
    const text = `Question: ${conv.question}\n\nReponse: ${conv.response}`;
    navigator.clipboard.writeText(text);
    addLog('success', 'Conversation copiee');
    
    const btn = modal.querySelector('#copy-conv-btn');
    btn.textContent = 'Copie !';
    setTimeout(() => btn.textContent = 'Copier', 1500);
  });

  modal.querySelector('#resend-conv-btn')?.addEventListener('click', () => {
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = conv.question;
      input.focus();
    }
    closeModal();
    addLog('info', 'Question reinjectee');
  });

  modal.querySelector('#delete-conv-btn')?.addEventListener('click', () => {
    if (confirm('Supprimer cette conversation ?')) {
      // Note: On ne peut pas supprimer une conversation specifique sans refactorer chat.js
      // Pour l'instant, on log juste
      addLog('info', 'Suppression non implementee (session only)');
      closeModal();
    }
  });
}

/**
 * Affiche un modal d'apercu pour un agent
 */
function showAgentModal(agent) {
  const modal = document.createElement('div');
  modal.id = 'agent-modal';
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';

  const date = new Date(agent.timestamp).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Extraire un resume des donnees
  let dataSummary = '';
  if (agent.data) {
    if (agent.agentId === 'hub') {
      const docs = agent.data.documents?.length || 0;
      const themes = agent.data.themes?.length || 0;
      dataSummary = `${docs} documents, ${themes} themes analyses`;
    } else if (agent.agentId === 'atlas') {
      const nodes = agent.data.nodes?.length || 0;
      const links = agent.data.links?.length || 0;
      dataSummary = `${nodes} concepts, ${links} relations`;
    } else if (agent.agentId === 'timeline') {
      const events = agent.data.events?.length || 0;
      dataSummary = `${events} evenements`;
    } else if (agent.agentId === 'scrolly') {
      const sections = agent.data.sections?.length || 0;
      dataSummary = `${sections} sections narratives`;
    }
  }

  // Log des etapes (si disponible)
  const logs = agent.logs || [];

  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-gray-50 to-gray-100">
        <div class="flex items-center gap-3">
          <span class="text-gray-600">${AGENT_ICONS[agent.agentId] || ''}</span>
          <div>
            <h3 class="font-bold text-gray-900">${agent.agentName}</h3>
            <p class="text-xs text-gray-500">${date}</p>
          </div>
        </div>
        <button id="close-agent-modal" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <!-- Résumé données -->
        <div class="bg-gray-50 rounded-xl p-4">
          <p class="text-xs font-semibold text-gray-600 mb-2">Donnees generees</p>
          <p class="text-sm text-gray-800">${dataSummary || 'Donnees disponibles'}</p>
        </div>

        <!-- Aperçu JSON -->
        <div class="bg-gray-900 rounded-xl p-4 overflow-x-auto">
          <p class="text-xs font-semibold text-gray-400 mb-2">Apercu JSON</p>
          <pre class="text-xs text-gray-300 max-h-40 overflow-y-auto"><code>${JSON.stringify(agent.data, null, 2).substring(0, 800)}${JSON.stringify(agent.data).length > 800 ? '\n...' : ''}</code></pre>
        </div>

        <!-- Logs -->
        ${logs.length > 0 ? `
          <div class="bg-blue-50 rounded-xl p-4">
            <p class="text-xs font-semibold text-blue-700 mb-2">Log d'execution</p>
            <ul class="text-xs text-gray-700 space-y-1">
              ${logs.map(l => `<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>${l}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0 bg-gray-50">
        <button id="copy-agent-data" class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          Copier JSON
        </button>
        <button id="open-agent-viz" class="px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors">
          Ouvrir Visualisation
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  
  modal.querySelector('#close-agent-modal')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  modal.querySelector('#copy-agent-data')?.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(agent.data, null, 2));
    addLog('success', 'JSON copie');
    const btn = modal.querySelector('#copy-agent-data');
    btn.textContent = 'Copie !';
    setTimeout(() => btn.textContent = 'Copier JSON', 1500);
  });

  modal.querySelector('#open-agent-viz')?.addEventListener('click', () => {
    closeModal();
    showAgentFromHistory(agent);
  });

  document.addEventListener('keydown', function handleEscape(e) {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  });
}

// Export pour debug
if (typeof window !== 'undefined') {
  window.historyPanel = {
    renderHistoryList,
    groupConversations
  };
}


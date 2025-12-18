/**
 * Panneau Historique des Conversations
 */

import { getChatHistory, clearChatHistory } from '../llm/chat.js';
import { parseMarkdown } from '../utils/markdown.js';
import { addLog } from '../state/state.js';

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

  // Ecouter les nouveaux messages
  window.addEventListener('chat:messageAdded', () => renderHistoryList());
  window.addEventListener('chat:cleared', () => renderHistoryList());

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
 * Rend la liste des conversations
 */
function renderHistoryList() {
  const container = document.getElementById('history-list');
  if (!container) return;

  // Combiner les historiques primary et secondary
  const primaryHistory = getChatHistory('primary') || [];
  const secondaryHistory = getChatHistory('secondary') || [];
  
  // Grouper par paires Q+R
  const conversations = groupConversations(primaryHistory);
  const secondaryConvs = groupConversations(secondaryHistory);

  if (conversations.length === 0 && secondaryConvs.length === 0) {
    container.innerHTML = `
      <p class="text-xs text-gray-400 text-center py-4">Aucune conversation</p>
    `;
    return;
  }

  // Fusionner et trier par date
  const allConvs = [...conversations, ...secondaryConvs.map(c => ({ ...c, isSecondary: true }))];
  allConvs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  container.innerHTML = allConvs.slice(0, 20).map((conv, idx) => {
    const truncQuestion = conv.question.substring(0, 50) + (conv.question.length > 50 ? '...' : '');
    const truncResponse = conv.response.substring(0, 30) + (conv.response.length > 30 ? '...' : '');
    const time = new Date(conv.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const slotBadge = conv.isSecondary ? '<span class="text-xs text-green-600">B</span>' : '';

    return `
      <div class="history-entry p-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 cursor-pointer transition-all" 
           data-conv-idx="${idx}" data-slot="${conv.isSecondary ? 'secondary' : 'primary'}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <p class="text-xs font-medium text-gray-900 truncate">${truncQuestion}</p>
            <p class="text-xs text-gray-500 truncate">${truncResponse}</p>
          </div>
          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span class="text-xs text-gray-400">${time}</span>
            ${conv.sources.length > 0 ? `<span class="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">${conv.sources.length} src</span>` : ''}
            ${slotBadge}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Ajouter les event listeners
  container.querySelectorAll('.history-entry').forEach(entry => {
    entry.addEventListener('click', () => {
      const idx = parseInt(entry.dataset.convIdx);
      const slot = entry.dataset.slot;
      const convs = slot === 'secondary' ? secondaryConvs : conversations;
      showConversationModal(convs[idx], slot);
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

// Export pour debug
if (typeof window !== 'undefined') {
  window.historyPanel = {
    renderHistoryList,
    groupConversations
  };
}


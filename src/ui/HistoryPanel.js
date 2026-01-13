/**
 * Panneau Historique des Conversations et Revues
 */

import { getChatHistory, clearChatHistory } from '../llm/chat.js';
import { parseMarkdown } from '../utils/markdown.js';
import { addLog, state } from '../state/state.js';

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

  window.addEventListener('chat:messageAdded', () => renderHistoryList());
  window.addEventListener('chat:cleared', () => renderHistoryList());
  window.addEventListener('review:completed', () => renderHistoryList());

  return panel;
}

/**
 * Configure les evenements du panneau historique
 */
function setupHistoryEvents(panel) {
  const clearBtn = panel.querySelector('#clear-history-btn');
  clearBtn?.addEventListener('click', () => {
    if (confirm('Effacer tout l\'historique des conversations ?')) {
      clearChatHistory('primary');
      clearChatHistory('secondary');
      state.reviewHistory = [];
      renderHistoryList();
    }
  });
}

/**
 * Rend la liste des conversations et revues
 */
function renderHistoryList() {
  const container = document.getElementById('history-list');
  if (!container) return;

  const primaryHistory = getChatHistory('primary') || [];
  const secondaryHistory = getChatHistory('secondary') || [];

  // Grouper les messages par paires (user -> assistant)
  const groupMessages = (messages, slot) => {
    const conversations = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        const nextMsg = messages[i + 1];
        conversations.push({
          question: msg.content,
          answer: nextMsg && nextMsg.role === 'assistant' ? nextMsg.content : null,
          timestamp: msg.timestamp,
          sources: msg.sources || nextMsg?.sources || [],
          slot: slot,
          type: 'chat'
        });
        if (nextMsg && nextMsg.role === 'assistant') i++;
      }
    }
    return conversations;
  };

  // Convertir les revues en elements d'historique
  const reviewItems = (state.reviewHistory || []).map(review => ({
    question: `Revue Litteraire (${review.data?.documentCount || '?'} docs)`,
    answer: review.data?.text || '',
    timestamp: review.timestamp,
    sources: [],
    slot: 'review',
    type: 'review',
    reviewData: review.data
  }));

  // Ajouter la revue actuelle si elle existe et n'est pas dans l'historique
  if (state.litReviewFinal && !reviewItems.find(r => r.timestamp === state.litReviewFinal.generatedAt)) {
    reviewItems.push({
      question: `Revue Litteraire (${state.litReviewFinal.documentCount || '?'} docs)`,
      answer: state.litReviewFinal.text || '',
      timestamp: state.litReviewFinal.generatedAt || new Date().toISOString(),
      sources: [],
      slot: 'review',
      type: 'review',
      reviewData: state.litReviewFinal
    });
  }

  // Combiner et trier
  const allItems = [
    ...groupMessages(primaryHistory, 'primary'),
    ...groupMessages(secondaryHistory, 'secondary'),
    ...reviewItems
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (allItems.length === 0) {
    container.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Aucune conversation</p>';
    return;
  }

  container.innerHTML = allItems.slice(0, 20).map((item, idx) => {
    const time = new Date(item.timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const truncQuestion = (item.question || '').substring(0, 50) + ((item.question || '').length > 50 ? '...' : '');
    
    // Style different pour les revues
    const isReview = item.type === 'review';
    const bgClass = isReview ? 'bg-purple-50 border-purple-200' : 'border-gray-100';
    const icon = isReview ? 'R' : (item.slot === 'secondary' ? '2' : '1');

    return `
      <div class="history-entry p-2 rounded-lg border ${bgClass} hover:border-gray-300 cursor-pointer transition-all"
           data-idx="${idx}" data-type="${item.type}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <p class="text-xs font-medium text-gray-900 truncate">
              <span class="inline-flex items-center justify-center w-4 h-4 rounded text-xs ${isReview ? 'bg-purple-200 text-purple-700' : 'bg-gray-200 text-gray-600'}">${icon}</span>
              ${truncQuestion}
            </p>
            <p class="text-xs text-gray-600 mt-1">${item.answer ? item.answer.substring(0, 40) + '...' : 'En attente'}</p>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <span class="text-xs text-gray-400">${time}</span>
            ${item.sources?.length > 0 ? `<span class="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">${item.sources.length}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Event listeners
  container.querySelectorAll('.history-entry').forEach(entry => {
    entry.addEventListener('click', async () => {
      const idx = parseInt(entry.dataset.idx);
      const type = entry.dataset.type;
      const item = allItems[idx];
      if (item) {
        if (type === 'review') {
          showReviewModal(item.reviewData);
        } else {
          showConversationModal(item, item.slot);
        }
      }
    });
  });
}

/**
 * Affiche un modal de revue detaillee
 */
function showReviewModal(reviewData) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  
  const stats = reviewData?.academicStats || {};
  const text = reviewData?.text || 'Aucun contenu';
  
  modal.innerHTML = `
    <div class="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <div class="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 class="font-semibold text-gray-900">Revue Litteraire</h3>
        <button id="close-review-modal" class="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <!-- Stats -->
      <div class="p-4 bg-gray-50 border-b grid grid-cols-4 gap-4 text-center text-sm">
        <div>
          <div class="font-bold text-blue-600">${reviewData?.documentCount || 0}</div>
          <div class="text-gray-500">Documents</div>
        </div>
        <div>
          <div class="font-bold text-green-600">${stats.totalCitations || 0}</div>
          <div class="text-gray-500">Citations</div>
        </div>
        <div>
          <div class="font-bold text-purple-600">${stats.reviewMode || 'auto'}</div>
          <div class="text-gray-500">Mode</div>
        </div>
        <div>
          <div class="font-bold text-orange-600">${reviewData?.totalTime ? (reviewData.totalTime / 1000).toFixed(1) + 's' : '-'}</div>
          <div class="text-gray-500">Temps</div>
        </div>
      </div>
      
      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="prose prose-sm max-w-none">
          ${parseMarkdown(text)}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#close-review-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

/**
 * Affiche un modal de conversation detaillee
 */
function showConversationModal(item, slot) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <div class="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 class="font-semibold text-gray-900">Conversation ${slot === 'secondary' ? 'Secondaire' : 'Principale'}</h3>
        <button id="close-conv-modal" class="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div class="bg-blue-50 p-3 rounded-lg">
          <p class="text-sm font-medium text-blue-900">Question:</p>
          <p class="text-sm text-blue-800 mt-1">${item.question}</p>
        </div>
        ${item.answer ? `
          <div class="bg-gray-50 p-3 rounded-lg">
            <p class="text-sm font-medium text-gray-900">Reponse:</p>
            <div class="text-sm text-gray-800 mt-1 prose prose-sm max-w-none">
              ${parseMarkdown(item.answer)}
            </div>
          </div>
        ` : ''}
        ${item.sources && item.sources.length > 0 ? `
          <div class="bg-green-50 p-3 rounded-lg">
            <p class="text-sm font-medium text-green-900">Sources (${item.sources.length}):</p>
            <div class="mt-2 space-y-1">
              ${item.sources.map(source => `
                <div class="text-xs text-green-800 bg-green-100 px-2 py-1 rounded">
                  ${source.docId || source.source}: ${(source.text || '').substring(0, 100)}...
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#close-conv-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

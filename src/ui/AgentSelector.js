/**
 * AgentSelector - Cartes de sélection des agents visuels
 */

import { addLog } from '../state/state.js';

// Définition des 4 agents
export const AGENTS = [
  {
    id: 'hub',
    name: 'Exploration Hub',
    icon: '📊',
    description: 'Dashboard avec heatmap thèmes/documents',
    color: 'blue'
  },
  {
    id: 'atlas',
    name: 'Concept Atlas',
    icon: '🧠',
    description: 'Graphe de connaissances interactif',
    color: 'purple'
  },
  {
    id: 'timeline',
    name: 'Influence Timeline',
    icon: '📅',
    description: 'Frise temporelle des concepts',
    color: 'green'
  },
  {
    id: 'scrolly',
    name: 'Scrollytelling',
    icon: '📜',
    description: 'Narration visuelle animée',
    color: 'orange'
  }
];

let selectedAgent = null;

/**
 * Crée le sélecteur d'agents
 */
export function createAgentSelector(onSelect) {
  const container = document.createElement('div');
  container.id = 'agent-selector';
  container.className = 'grid grid-cols-2 gap-2 p-2';

  AGENTS.forEach(agent => {
    const card = createAgentCard(agent, onSelect);
    container.appendChild(card);
  });

  return container;
}

/**
 * Crée une carte d'agent
 */
function createAgentCard(agent, onSelect) {
  const card = document.createElement('div');
  card.id = `agent-card-${agent.id}`;
  card.className = `
    p-3 rounded-xl border-2 cursor-pointer transition-all duration-200
    hover:shadow-lg hover:scale-[1.02]
    ${getAgentColorClasses(agent.color, false)}
  `;

  card.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="text-xl">${agent.icon}</span>
      <span class="font-semibold text-sm text-gray-800">${agent.name}</span>
    </div>
    <p class="text-xs text-gray-500 leading-tight">${agent.description}</p>
  `;

  card.addEventListener('click', () => {
    selectAgent(agent.id, onSelect);
  });

  return card;
}

/**
 * Sélectionne un agent
 */
export function selectAgent(agentId, onSelect) {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return;

  selectedAgent = agentId;
  
  // Mettre à jour les styles des cartes
  AGENTS.forEach(a => {
    const card = document.getElementById(`agent-card-${a.id}`);
    if (card) {
      const isSelected = a.id === agentId;
      card.className = `
        p-3 rounded-xl border-2 cursor-pointer transition-all duration-200
        hover:shadow-lg hover:scale-[1.02]
        ${getAgentColorClasses(a.color, isSelected)}
      `;
    }
  });

  addLog('info', `Agent sélectionné: ${agent.name}`);
  
  if (onSelect) {
    onSelect(agent);
  }

  window.dispatchEvent(new CustomEvent('agent:selected', { detail: agent }));
}

/**
 * Retourne les classes de couleur pour un agent
 */
function getAgentColorClasses(color, isSelected) {
  const colors = {
    blue: {
      normal: 'border-gray-200 bg-white hover:border-blue-300',
      selected: 'border-blue-500 bg-blue-50 shadow-md'
    },
    purple: {
      normal: 'border-gray-200 bg-white hover:border-purple-300',
      selected: 'border-purple-500 bg-purple-50 shadow-md'
    },
    green: {
      normal: 'border-gray-200 bg-white hover:border-green-300',
      selected: 'border-green-500 bg-green-50 shadow-md'
    },
    orange: {
      normal: 'border-gray-200 bg-white hover:border-orange-300',
      selected: 'border-orange-500 bg-orange-50 shadow-md'
    }
  };

  return colors[color]?.[isSelected ? 'selected' : 'normal'] || colors.blue.normal;
}

/**
 * Retourne l'agent sélectionné
 */
export function getSelectedAgent() {
  return AGENTS.find(a => a.id === selectedAgent) || null;
}

/**
 * Retourne l'ID de l'agent sélectionné
 */
export function getSelectedAgentId() {
  return selectedAgent;
}


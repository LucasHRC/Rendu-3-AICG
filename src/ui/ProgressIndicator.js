/**
 * ProgressIndicator - Indicateurs de progression non-bloquants
 * Affiche des barres de progression dans l'interface sans bloquer l'utilisation
 */

let activeIndicators = new Map();

/**
 * Crée et affiche un indicateur de progression
 * @param {string} id - Identifiant unique pour l'indicateur
 * @param {Object} options - Options de configuration
 * @param {string} options.title - Titre de l'indicateur
 * @param {string} options.subtitle - Sous-titre optionnel
 * @param {string} options.position - Position dans l'UI (top-right, bottom-left, etc.)
 * @param {boolean} options.persistent - Si true, reste visible jusqu'à suppression manuelle
 */
export function createProgressIndicator(id, options = {}) {
  const {
    title = 'Chargement...',
    subtitle = '',
    position = 'bottom-right',
    persistent = false,
    showPercentage = true,
    showTime = true
  } = options;

  // Supprimer l'ancien indicateur s'il existe
  removeProgressIndicator(id);

  const indicator = document.createElement('div');
  indicator.id = `progress-indicator-${id}`;
  indicator.className = `fixed z-50 bg-white rounded-xl shadow-lg border border-gray-200 p-4 min-w-[300px] max-w-[400px] ${getPositionClasses(position)}`;

  indicator.innerHTML = `
    <div class="flex items-start gap-3">
      <!-- Spinner animé -->
      <div class="flex-shrink-0 w-8 h-8">
        <div class="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>

      <!-- Contenu -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-semibold text-gray-900 truncate">${title}</h4>
          ${!persistent ? '<button id="close-indicator" class="text-gray-400 hover:text-gray-600 ml-2">×</button>' : ''}
        </div>

        ${subtitle ? `<p class="text-xs text-gray-500 mb-2 truncate">${subtitle}</p>` : ''}

        <!-- Infos de progression -->
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span id="progress-text">Initialisation...</span>
          <div class="flex items-center gap-2">
            <span id="progress-percent">1%</span>
            <span id="progress-time">1s</span>
          </div>
        </div>

        <!-- Détail optionnel -->
        <div id="progress-detail" class="text-xs text-gray-400 mt-1 truncate h-4"></div>
      </div>
    </div>
  `;

  document.body.appendChild(indicator);

  // Bouton de fermeture si non-persistent
  if (!persistent) {
    const closeBtn = indicator.querySelector('#close-indicator');
    closeBtn?.addEventListener('click', () => removeProgressIndicator(id));
  }

  // Animation initiale pour montrer que ça démarre
  const progressText = indicator.querySelector('#progress-text');

  if (progressText) progressText.classList.add('animate-pulse');

  // Stocker les informations
  activeIndicators.set(id, {
    element: indicator,
    startTime: Date.now(),
    options,
    lastProgress: 1, // Démarre à 1% pour éviter le 0%
    progressHistory: []
  });
  
  // Initialiser à 1% pour éviter l'affichage 0%
  if (options.showPercentage) {
    const progressPercent = indicator.querySelector('#progress-percent');
    if (progressPercent) progressPercent.textContent = '1%';
  }
  
  if (options.showTime) {
    const progressTime = indicator.querySelector('#progress-time');
    if (progressTime) progressTime.textContent = '1s';
  }

  return id;
}

/**
 * Met à jour la progression d'un indicateur
 * @param {string} id - ID de l'indicateur
 * @param {number} percent - Pourcentage 0-100
 * @param {string} text - Texte de statut
 * @param {string} detail - Détail optionnel
 */
export function updateProgressIndicator(id, percent, text = '', detail = '') {
  const indicator = activeIndicators.get(id);
  if (!indicator) return;

  const { element, startTime, options, progressHistory } = indicator;
  
  // Ne pas utiliser 0% si on n'a pas encore de progression réelle
  // Si percent est 0 et qu'on a déjà une progression, garder la dernière valeur
  let smoothPercent = percent;
  if (percent === 0 && indicator.lastProgress > 0 && indicator.lastProgress < 5) {
    smoothPercent = Math.max(1, indicator.lastProgress); // Minimum 1% pour éviter 0%
  } else if (percent === 0 && indicator.lastProgress === 0) {
    smoothPercent = 1; // Initialiser à 1% minimum
  }

  // Mettre à jour les barres avec animations
  const progressText = element.querySelector('#progress-text');
  const progressPercent = element.querySelector('#progress-percent');
  const progressTime = element.querySelector('#progress-time');
  const progressDetail = element.querySelector('#progress-detail');

  // Mise à jour du texte avec animation
  if (progressText && text) {
    progressText.textContent = text;
    progressText.classList.add('animate-pulse');
    setTimeout(() => progressText.classList.remove('animate-pulse'), 200);
  }

  if (progressPercent && options.showPercentage) {
    const percentText = `${Math.round(smoothPercent)}%`;
    if (progressPercent.textContent !== percentText) {
      progressPercent.textContent = percentText;
      progressPercent.classList.add('text-blue-600', 'font-bold');
      setTimeout(() => progressPercent.classList.remove('text-blue-600', 'font-bold'), 300);
    }
  }

  if (progressDetail && detail) {
    progressDetail.textContent = detail;
  }

  // Mettre à jour le temps écoulé - toujours afficher au moins 1s après le démarrage
  if (progressTime && options.showTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const elapsedDisplay = elapsed > 0 ? elapsed : 1; // Minimum 1s
    progressTime.textContent = formatTime(elapsedDisplay);
  }

  // Historique pour calculs
  indicator.lastProgress = smoothPercent;
  progressHistory.push({ time: Date.now(), percent: smoothPercent });
  if (progressHistory.length > 10) progressHistory.shift();
}

/**
 * Supprime un indicateur de progression
 * @param {string} id - ID de l'indicateur
 * @param {boolean} success - Si true, affiche une animation de succès
 */
export function removeProgressIndicator(id, success = false) {
  const indicator = activeIndicators.get(id);
  if (!indicator) return;

  const { element } = indicator;

  if (success) {
    // Animation de succès
    element.classList.add('bg-green-50', 'border-green-200');
    const spinner = element.querySelector('.animate-spin');
    if (spinner) {
      spinner.innerHTML = `
        <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      `;
      spinner.classList.remove('animate-spin');
    }

    setTimeout(() => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(-10px)';
      element.style.transition = 'all 0.3s ease-out';
      setTimeout(() => element.remove(), 300);
    }, 1000);
  } else {
    // Suppression normale
    element.style.opacity = '0';
    element.style.transform = 'translateY(-10px)';
    element.style.transition = 'all 0.3s ease-out';
    setTimeout(() => element.remove(), 300);
  }

  activeIndicators.delete(id);
}

/**
 * Crée un indicateur de streaming pour les opérations longues
 * @param {string} id - ID unique
 * @param {string} title - Titre
 * @param {Function} onUpdate - Callback pour les mises à jour
 */
export function createStreamingIndicator(id, title, onUpdate = null) {
  createProgressIndicator(id, {
    title,
    subtitle: 'Streaming en cours...',
    position: 'bottom-right',
    persistent: true
  });

  // Animation de streaming (points qui bougent)
  const indicator = activeIndicators.get(id);
  if (indicator) {
    const detailEl = indicator.element.querySelector('#progress-detail');
    if (detailEl) {
      let dots = 0;
      const updateDots = () => {
        dots = (dots + 1) % 4;
        detailEl.textContent = 'Streaming' + '.'.repeat(dots);
        setTimeout(updateDots, 500);
      };
      updateDots();
    }
  }

  return id;
}

/**
 * Met à jour le texte d'un indicateur de streaming
 * @param {string} id - ID de l'indicateur
 * @param {string} text - Nouveau texte
 */
export function updateStreamingIndicator(id, text) {
  const indicator = activeIndicators.get(id);
  if (indicator) {
    const progressText = indicator.element.querySelector('#progress-text');
    if (progressText) progressText.textContent = text;
  }
}

/**
 * Supprime tous les indicateurs actifs
 */
export function clearAllProgressIndicators() {
  for (const id of activeIndicators.keys()) {
    removeProgressIndicator(id);
  }
}

/**
 * Obtient les classes CSS pour le positionnement
 */
function getPositionClasses(position) {
  const positions = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'center-top': 'top-4 left-1/2 transform -translate-x-1/2',
    'center-bottom': 'bottom-4 left-1/2 transform -translate-x-1/2'
  };

  return positions[position] || positions['top-right'];
}

/**
 * Formate le temps en string lisible
 */
function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

/**
 * Met à jour la barre de progression du dashboard
 */
export function updateDashboardProgress(percent, text = '', showBar = true) {
  const dashboardProgress = document.getElementById('dashboard-progress');
  const progressBar = document.getElementById('dashboard-progress-bar');
  const progressText = document.getElementById('dashboard-progress-text');
  const progressPercent = document.getElementById('dashboard-progress-percent');
  const progressTime = document.getElementById('dashboard-progress-time');

  if (!dashboardProgress) return;

  // Afficher/cacher la barre selon le paramètre
  if (showBar) {
    dashboardProgress.classList.remove('hidden');
  } else {
    dashboardProgress.classList.add('hidden');
    return;
  }

  // Mettre à jour le texte
  if (progressText && text) {
    progressText.textContent = text;
  }

  // Mettre à jour le pourcentage
  if (progressPercent) {
    progressPercent.textContent = `${Math.round(percent)}%`;
  }

  // Mettre à jour la barre
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }

  // Mettre à jour le temps (si on a un timer global)
  if (progressTime && window.dashboardProgressStartTime) {
    const elapsed = Math.floor((Date.now() - window.dashboardProgressStartTime) / 1000);
    progressTime.textContent = formatTime(elapsed);
  }
}

/**
 * Démarre le timer pour la barre de progression du dashboard
 */
export function startDashboardProgress() {
  window.dashboardProgressStartTime = Date.now();
}

/**
 * Arrête et cache la barre de progression du dashboard
 */
export function hideDashboardProgress() {
  const dashboardProgress = document.getElementById('dashboard-progress');
  if (dashboardProgress) {
    dashboardProgress.classList.add('hidden');
  }
  window.dashboardProgressStartTime = null;
}

// Auto-nettoyage au rechargement de page
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', clearAllProgressIndicators);

  // Exposition globale pour debug
  window.progressIndicators = {
    create: createProgressIndicator,
    update: updateProgressIndicator,
    remove: removeProgressIndicator,
    createStreaming: createStreamingIndicator,
    updateStreaming: updateStreamingIndicator,
    clearAll: clearAllProgressIndicators,
    updateDashboard: updateDashboardProgress,
    startDashboard: startDashboardProgress,
    hideDashboard: hideDashboardProgress
  };
}
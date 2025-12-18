/**
 * LoadingOverlay - Overlay de chargement avec jauge dynamique
 * Affiche progression, temps ecoule, estimation restante
 */

let overlayElement = null;
let startTime = null;
let lastProgress = 0;
let progressHistory = [];

/**
 * Affiche l'overlay de chargement
 * @param {string} title - Titre (ex: "Chargement du modele")
 * @param {string} subtitle - Sous-titre (ex: "Llama 3.1 8B")
 */
export function showLoadingOverlay(title, subtitle = '') {
  startTime = Date.now();
  lastProgress = 0;
  progressHistory = [];

  if (overlayElement) {
    overlayElement.remove();
  }

  overlayElement = document.createElement('div');
  overlayElement.id = 'loading-overlay';
  overlayElement.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm';
  
  overlayElement.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-[420px] max-w-[90vw]">
      <!-- Header avec logo -->
      <div class="flex items-center gap-4 mb-6">
        <img src="/logo-llm-pdf-rag.avif" alt="Logo" class="w-12 h-12 rounded-xl shadow-sm object-cover" />
        <div>
          <h3 class="text-lg font-bold text-gray-900">${title}</h3>
          <p class="text-sm text-gray-500">${subtitle}</p>
        </div>
      </div>
      
      <!-- Jauge principale -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span id="loading-status" class="text-sm text-gray-600">Initialisation...</span>
          <span id="loading-percent" class="text-sm font-bold text-gray-900">0%</span>
        </div>
        <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div id="loading-bar" class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out" style="width: 0%"></div>
        </div>
      </div>
      
      <!-- Stats temps -->
      <div class="flex items-center justify-between text-xs text-gray-500 mb-4">
        <div class="flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Ecoule: <span id="loading-elapsed" class="font-medium text-gray-700">0s</span></span>
        </div>
        <div class="flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span>Restant: <span id="loading-remaining" class="font-medium text-gray-700">--</span></span>
        </div>
      </div>
      
      <!-- Detail etape -->
      <div id="loading-detail" class="text-xs text-gray-400 truncate mb-4 h-4">
        Preparation...
      </div>
      
      <!-- Animation pulse -->
      <div class="flex items-center justify-center gap-1">
        <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0ms"></div>
        <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 150ms"></div>
        <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 300ms"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlayElement);
  
  // Demarrer le timer
  updateElapsedTime();
}

/**
 * Met a jour la progression
 * @param {number} percent - Pourcentage 0-100
 * @param {string} status - Message de status
 * @param {string} detail - Detail optionnel
 */
export function updateLoadingProgress(percent, status = '', detail = '') {
  if (!overlayElement) return;

  const bar = document.getElementById('loading-bar');
  const percentEl = document.getElementById('loading-percent');
  const statusEl = document.getElementById('loading-status');
  const detailEl = document.getElementById('loading-detail');
  const remainingEl = document.getElementById('loading-remaining');

  // Smooth progress (ne pas reculer)
  const smoothPercent = Math.max(percent, lastProgress);
  lastProgress = smoothPercent;

  if (bar) bar.style.width = `${smoothPercent}%`;
  if (percentEl) percentEl.textContent = `${Math.round(smoothPercent)}%`;
  if (status && statusEl) statusEl.textContent = status;
  if (detail && detailEl) detailEl.textContent = detail;

  // Historique pour estimation
  progressHistory.push({ time: Date.now(), percent: smoothPercent });
  if (progressHistory.length > 10) progressHistory.shift();

  // Calculer temps restant
  if (remainingEl && progressHistory.length >= 2 && smoothPercent > 5 && smoothPercent < 95) {
    const remaining = estimateRemainingTime(smoothPercent);
    remainingEl.textContent = remaining;
  }
}

/**
 * Cache l'overlay
 */
export function hideLoadingOverlay() {
  if (overlayElement) {
    // Animation de sortie
    overlayElement.style.opacity = '0';
    overlayElement.style.transition = 'opacity 0.3s ease-out';
    setTimeout(() => {
      overlayElement?.remove();
      overlayElement = null;
    }, 300);
  }
  startTime = null;
  progressHistory = [];
}

/**
 * Met a jour le temps ecoule
 */
function updateElapsedTime() {
  if (!overlayElement || !startTime) return;

  const elapsedEl = document.getElementById('loading-elapsed');
  if (elapsedEl) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    elapsedEl.textContent = formatTime(elapsed);
  }

  requestAnimationFrame(() => {
    setTimeout(updateElapsedTime, 1000);
  });
}

/**
 * Estime le temps restant
 */
function estimateRemainingTime(currentPercent) {
  if (progressHistory.length < 2) return '--';

  const first = progressHistory[0];
  const last = progressHistory[progressHistory.length - 1];
  
  const timeDiff = last.time - first.time;
  const percentDiff = last.percent - first.percent;
  
  if (percentDiff <= 0 || timeDiff <= 0) return '--';

  const msPerPercent = timeDiff / percentDiff;
  const remainingPercent = 100 - currentPercent;
  const remainingMs = msPerPercent * remainingPercent;
  
  const remainingSec = Math.ceil(remainingMs / 1000);
  
  if (remainingSec > 3600) return '>1h';
  if (remainingSec < 5) return '<5s';
  
  return formatTime(remainingSec);
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

// Export pour debug
if (typeof window !== 'undefined') {
  window.loadingOverlay = {
    show: showLoadingOverlay,
    update: updateLoadingProgress,
    hide: hideLoadingOverlay
  };
}


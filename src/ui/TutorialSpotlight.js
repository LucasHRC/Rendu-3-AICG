/**
 * Composant Spotlight pour le tutoriel
 * Crée un overlay avec fond assombri et zone mise en avant
 */

/**
 * Calcule la position et les dimensions d'un élément par rapport au viewport
 */
function getElementBounds(element) {
  if (!element) return null;
  
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
    viewportTop: rect.top,
    viewportLeft: rect.left,
    viewportBottom: rect.bottom,
    viewportRight: rect.right
  };
}

/**
 * Crée le composant spotlight overlay
 */
export function createSpotlightOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-spotlight-overlay';
  overlay.className = 'fixed inset-0 z-[9998] pointer-events-none';
  overlay.style.display = 'none';
  
  // Fond assombri (clip-path pour créer le "trou")
  const backdrop = document.createElement('div');
  backdrop.id = 'tutorial-backdrop';
  backdrop.className = 'fixed inset-0 bg-black/60 transition-opacity duration-300';
  overlay.appendChild(backdrop);
  
  // Zone de texte explicatif (sera positionnée dynamiquement)
  const tooltip = document.createElement('div');
  tooltip.id = 'tutorial-tooltip';
  tooltip.className = 'fixed z-[9999] bg-white rounded-xl shadow-2xl p-6 max-w-sm pointer-events-auto';
  tooltip.style.display = 'none';
  overlay.appendChild(tooltip);
  
  // Contenu du tooltip
  tooltip.innerHTML = `
    <div class="flex flex-col gap-3">
      <div class="flex items-start justify-between">
        <h3 id="tutorial-tooltip-title" class="text-lg font-bold text-gray-900"></h3>
        <button id="tutorial-close-btn" class="text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p id="tutorial-tooltip-message" class="text-sm text-gray-700 leading-relaxed"></p>
      <div id="tutorial-tooltip-actions" class="flex items-center justify-between pt-2 border-t border-gray-100">
        <div class="flex items-center gap-2">
          <span id="tutorial-progress" class="text-xs text-gray-500"></span>
        </div>
        <div class="flex items-center gap-2">
          <button id="tutorial-skip-btn" class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors">
            Passer
          </button>
          <button id="tutorial-next-btn" class="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Suivant
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  return overlay;
}

/**
 * Affiche le spotlight pour un élément cible
 * @param {HTMLElement} targetElement - L'élément à mettre en avant
 * @param {Object} config - Configuration du tooltip
 * @param {string} config.title - Titre du tooltip
 * @param {string} config.message - Message explicatif
 * @param {number} config.currentStep - Étape actuelle
 * @param {number} config.totalSteps - Nombre total d'étapes
 * @param {Function} config.onNext - Callback pour "Suivant"
 * @param {Function} config.onSkip - Callback pour "Passer"
 * @param {Function} config.onClose - Callback pour fermer
 * @param {boolean} config.canProceed - Si false, le bouton "Suivant" est désactivé
 * @param {string} config.position - Position du tooltip: 'top', 'bottom', 'left', 'right', 'auto'
 */
export function showSpotlight(targetElement, config) {
  const overlay = document.getElementById('tutorial-spotlight-overlay');
  if (!overlay) {
    console.error('Spotlight overlay not found');
    return;
  }
  
  // Si pas d'élément cible, masquer le spotlight
  if (!targetElement) {
    hideSpotlight();
    return;
  }
  
  const bounds = getElementBounds(targetElement);
  if (!bounds) {
    hideSpotlight();
    return;
  }
  
  // Afficher l'overlay
  overlay.style.display = 'block';
  
  // Créer le clip-path pour "éclairer" la zone cible
  const padding = 8; // Padding autour de la zone éclairée
  const clipPath = `
    polygon(
      0% 0%,
      0% 100%,
      ${bounds.viewportLeft - padding}px 100%,
      ${bounds.viewportLeft - padding}px ${bounds.viewportTop - padding}px,
      ${bounds.viewportRight + padding}px ${bounds.viewportTop - padding}px,
      ${bounds.viewportRight + padding}px ${bounds.viewportBottom + padding}px,
      ${bounds.viewportLeft - padding}px ${bounds.viewportBottom + padding}px,
      ${bounds.viewportLeft - padding}px 100%,
      100% 100%,
      100% 0%
    )
  `;
  
  const backdrop = overlay.querySelector('#tutorial-backdrop');
  backdrop.style.clipPath = clipPath;
  backdrop.style.WebkitClipPath = clipPath;
  
  // Positionner le tooltip
  const tooltip = overlay.querySelector('#tutorial-tooltip');
  const tooltipTitle = overlay.querySelector('#tutorial-tooltip-title');
  const tooltipMessage = overlay.querySelector('#tutorial-tooltip-message');
  const progressText = overlay.querySelector('#tutorial-progress');
  const nextBtn = overlay.querySelector('#tutorial-next-btn');
  const skipBtn = overlay.querySelector('#tutorial-skip-btn');
  const closeBtn = overlay.querySelector('#tutorial-close-btn');
  
  // Mettre à jour le contenu
  tooltipTitle.textContent = config.title || '';
  tooltipMessage.textContent = config.message || '';
  progressText.textContent = `${config.currentStep || 0}/${config.totalSteps || 0}`;
  
  // Désactiver le bouton Suivant si nécessaire
  nextBtn.disabled = config.canProceed === false;
  
  // Positionner le tooltip (stratégie: essayer en bas, puis en haut, puis à droite)
  tooltip.style.display = 'block';
  const position = config.position || 'auto';
  let tooltipX, tooltipY;
  
  if (position === 'auto') {
    // Essayer en bas d'abord
    if (bounds.viewportBottom + 200 < window.innerHeight) {
      tooltipY = bounds.viewportBottom + 20;
      tooltipX = Math.max(16, Math.min(bounds.viewportLeft, window.innerWidth - 336)); // 336 = max-w-sm
    } 
    // Sinon en haut
    else if (bounds.viewportTop - 200 > 0) {
      tooltipY = bounds.viewportTop - 220;
      tooltipX = Math.max(16, Math.min(bounds.viewportLeft, window.innerWidth - 336));
    }
    // Sinon à droite
    else if (bounds.viewportRight + 350 < window.innerWidth) {
      tooltipX = bounds.viewportRight + 20;
      tooltipY = Math.max(16, bounds.viewportTop);
    }
    // Sinon à gauche
    else if (bounds.viewportLeft - 350 > 0) {
      tooltipX = bounds.viewportLeft - 336 - 20;
      tooltipY = Math.max(16, bounds.viewportTop);
    }
    // Fallback: centré
    else {
      tooltipX = (window.innerWidth - 336) / 2;
      tooltipY = window.innerHeight / 2;
    }
  } else {
    // Positionnement explicite
    switch (position) {
      case 'bottom':
        tooltipY = bounds.viewportBottom + 20;
        tooltipX = Math.max(16, Math.min(bounds.viewportLeft, window.innerWidth - 336));
        break;
      case 'top':
        tooltipY = bounds.viewportTop - 220;
        tooltipX = Math.max(16, Math.min(bounds.viewportLeft, window.innerWidth - 336));
        break;
      case 'right':
        tooltipX = bounds.viewportRight + 20;
        tooltipY = Math.max(16, bounds.viewportTop);
        break;
      case 'left':
        tooltipX = bounds.viewportLeft - 336 - 20;
        tooltipY = Math.max(16, bounds.viewportTop);
        break;
      default:
        tooltipX = bounds.viewportLeft;
        tooltipY = bounds.viewportBottom + 20;
    }
  }
  
  tooltip.style.left = `${tooltipX}px`;
  tooltip.style.top = `${tooltipY}px`;
  
  // Ajouter un halo autour de l'élément cible
  targetElement.style.position = 'relative';
  targetElement.style.zIndex = '9999';
  
  // Event listeners
  const removeListeners = () => {
    nextBtn.onclick = null;
    skipBtn.onclick = null;
    closeBtn.onclick = null;
  };
  
  nextBtn.onclick = () => {
    removeListeners();
    if (config.onNext) config.onNext();
  };
  
  skipBtn.onclick = () => {
    removeListeners();
    if (config.onSkip) config.onSkip();
  };
  
  closeBtn.onclick = () => {
    removeListeners();
    if (config.onClose) config.onClose();
  };
  
  // Retourner une fonction de nettoyage
  return () => {
    removeListeners();
    if (targetElement) {
      targetElement.style.position = '';
      targetElement.style.zIndex = '';
    }
  };
}

/**
 * Masque le spotlight
 */
export function hideSpotlight() {
  const overlay = document.getElementById('tutorial-spotlight-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    
    // Nettoyer les styles des éléments cibles
    const highlightedElements = document.querySelectorAll('[style*="z-index: 9999"]');
    highlightedElements.forEach(el => {
      if (el.style.zIndex === '9999') {
        el.style.position = '';
        el.style.zIndex = '';
      }
    });
  }
}

/**
 * Met à jour la position du spotlight (utile pour les éléments qui se déplacent)
 */
export function updateSpotlightPosition() {
  // Cette fonction peut être appelée lors d'un resize ou scroll
  // Elle recalculera la position si le tutoriel est actif
  // Pour l'instant, simple placeholder
}

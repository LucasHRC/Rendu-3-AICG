/**
 * Système de tutoriel interactif
 * Guide l'utilisateur à travers le workflow complet de l'application
 */

import { createSpotlightOverlay, showSpotlight, hideSpotlight } from './TutorialSpotlight.js';
import {
  loadTutorialState,
  isFirstVisit,
  isTutorialCompleted,
  markStepCompleted,
  markTutorialCompleted,
  markTutorialSkipped,
  setCurrentStep,
  getCurrentStep,
  resetTutorialState
} from '../storage/tutorialState.js';
import { state } from '../state/state.js';
import { isModelReady } from '../llm/webllm.js';

/**
 * Étapes du tutoriel
 */
const TUTORIAL_STEPS = [
  {
    id: 'upload',
    title: 'Étape 1 : Upload de documents',
    message: 'Glissez-déposez vos fichiers PDF ici ou cliquez pour sélectionner. Le système va automatiquement extraire le texte et créer des chunks.',
    targetSelector: '#dropzone',
    targetFallback: '[data-main-tab="documents"]',
    validation: () => state.docs.length > 0,
    waitForValidation: true,
    onShow: () => {
      // S'assurer qu'on est sur l'onglet Documents
      const docsTab = document.querySelector('[data-main-tab="documents"]');
      if (docsTab) {
        docsTab.click();
      }
    }
  },
  {
    id: 'model',
    title: 'Étape 2 : Charger un modèle',
    message: 'Sélectionnez un modèle LLM dans le menu déroulant, puis cliquez sur "Charger". Les modèles 3B+ sont recommandés pour la revue littéraire.',
    targetSelector: '#model-dropdown-btn-primary',
    targetFallback: '#load-model-primary, [data-main-tab="chat"]',
    validation: () => isModelReady(),
    waitForValidation: true,
    onShow: () => {
      // Passer à l'onglet Chat
      const chatTab = document.querySelector('[data-main-tab="chat"]');
      if (chatTab) {
        chatTab.click();
        // Attendre un peu que le panneau se charge
        setTimeout(() => {
          // Chercher le bouton de sélection de modèle
          const modelBtn = document.querySelector('#model-dropdown-btn-primary');
          if (modelBtn) {
            modelBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      }
    }
  },
  {
    id: 'enrich',
    title: 'Étape 3 : Enrichissement (optionnel)',
    message: 'L\'enrichissement extrait automatiquement les métadonnées de vos documents (titre, auteurs, méthodologie, etc.). Cela améliore la qualité de la revue RAG.',
    targetSelector: '[data-enrichment-btn], #enrich-btn, .enrichment-button',
    targetFallback: '#dropzone',
    validation: () => true, // Toujours validable car optionnel
    waitForValidation: false, // Pas besoin d'attendre
    onShow: () => {
      // Retourner à l'onglet Documents pour voir l'enrichissement
      const docsTab = document.querySelector('[data-main-tab="documents"]');
      if (docsTab) {
        docsTab.click();
      }
    },
    optional: true
  },
  {
    id: 'question',
    title: 'Étape 4 : Poser une question',
    message: 'Posez une question sur vos documents dans le champ de saisie. Le système utilise RAG pour trouver les réponses pertinentes avec citations.',
    targetSelector: '#chat-input',
    targetFallback: '[data-main-tab="chat"]',
    validation: () => {
      // Vérifier si un message a été envoyé et une réponse reçue
      const messages = document.querySelectorAll('#chat-panel .message, .chat-message');
      return messages.length >= 2; // Au moins user + assistant
    },
    waitForValidation: true,
    onShow: () => {
      // Passer à l'onglet Chat
      const chatTab = document.querySelector('[data-main-tab="chat"]');
      if (chatTab) {
        chatTab.click();
        setTimeout(() => {
          const input = document.querySelector('#chat-input');
          if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input.focus();
          }
        }, 300);
      }
    }
  },
  {
    id: 'review',
    title: 'Étape 5 : Lancer une revue',
    message: 'Générez une revue littéraire complète de vos documents. Cliquez sur "RAG Revue Littéraire". Cela peut prendre quelques minutes selon le nombre de documents.',
    targetSelector: '#rag-review-btn',
    targetFallback: '[data-main-tab="chat"]',
    validation: () => {
      // Vérifier si la revue a été lancée ou complétée
      const reviewModal = document.getElementById('rag-review-modal');
      return reviewModal && !reviewModal.classList.contains('hidden');
    },
    waitForValidation: false, // On considère que cliquer sur le bouton suffit
    onShow: () => {
      // S'assurer qu'on est sur l'onglet Chat
      const chatTab = document.querySelector('[data-main-tab="chat"]');
      if (chatTab) {
        chatTab.click();
        setTimeout(() => {
          const reviewBtn = document.querySelector('#rag-review-btn');
          if (reviewBtn) {
            reviewBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      }
    }
  }
];

let currentTutorial = null;
let currentStepIndex = -1;
let cleanupFunctions = [];
let validationInterval = null;

/**
 * Initialise le système de tutoriel
 */
export function initTutorial() {
  // Créer l'overlay spotlight
  createSpotlightOverlay();
  
  // Charger l'état
  loadTutorialState();
  
  // Vérifier si on doit démarrer automatiquement
  if (isFirstVisit() && !isTutorialCompleted()) {
    // Attendre que l'UI soit prête
    setTimeout(() => {
      startTutorial();
    }, 1000);
  }
}

/**
 * Démarre le tutoriel
 */
export function startTutorial(fromStep = 0) {
  if (currentTutorial !== null) {
    stopTutorial();
  }
  
  currentStepIndex = fromStep;
  currentTutorial = {
    stepIndex: fromStep,
    startTime: Date.now()
  };
  
  // Démarrer depuis l'étape spécifiée
  showStep(fromStep);
}

/**
 * Arrête le tutoriel
 */
export function stopTutorial() {
  if (currentTutorial === null) return;
  
  // Nettoyer les cleanup functions
  cleanupFunctions.forEach(cleanup => {
    try {
      cleanup();
    } catch (e) {
      console.error('Error in cleanup:', e);
    }
  });
  cleanupFunctions = [];
  
  // Arrêter l'intervalle de validation
  if (validationInterval) {
    clearInterval(validationInterval);
    validationInterval = null;
  }
  
  // Masquer le spotlight
  hideSpotlight();
  
  currentTutorial = null;
  currentStepIndex = -1;
}

/**
 * Affiche une étape du tutoriel
 */
function showStep(stepIndex) {
  if (stepIndex < 0 || stepIndex >= TUTORIAL_STEPS.length) {
    // Tutoriel terminé
    completeTutorial();
    return;
  }
  
  const step = TUTORIAL_STEPS[stepIndex];
  currentStepIndex = stepIndex;
  
  // Nettoyer les étapes précédentes
  cleanupFunctions.forEach(cleanup => cleanup());
  cleanupFunctions = [];
  
  // Exécuter le onShow si présent
  if (step.onShow) {
    try {
      step.onShow();
    } catch (e) {
      console.error('Error in step onShow:', e);
    }
  }
  
  // Attendre un peu que le DOM se mette à jour
  setTimeout(() => {
    // Trouver l'élément cible
    let targetElement = null;
    
    if (step.targetSelector) {
      targetElement = document.querySelector(step.targetSelector);
    }
    
    if (!targetElement && step.targetFallback) {
      targetElement = document.querySelector(step.targetFallback);
    }
    
    if (!targetElement) {
      console.warn(`Tutorial step ${step.id}: target element not found`);
      // Essayer l'étape suivante
      nextStep();
      return;
    }
    
    // Afficher le spotlight
    const cleanup = showSpotlight(targetElement, {
      title: step.title,
      message: step.message,
      currentStep: stepIndex + 1,
      totalSteps: TUTORIAL_STEPS.length,
      canProceed: !step.waitForValidation || step.validation(),
      position: 'auto',
      onNext: () => {
        if (step.validation && step.waitForValidation) {
          // Si on doit valider, vérifier maintenant
          if (step.validation()) {
            markStepCompleted(stepIndex);
            nextStep();
          } else {
            // Recommencer la vérification
            startValidationCheck(stepIndex);
          }
        } else {
          // Pas de validation nécessaire, passer à l'étape suivante
          markStepCompleted(stepIndex);
          nextStep();
        }
      },
      onSkip: () => {
        markTutorialSkipped();
        stopTutorial();
      },
      onClose: () => {
        markTutorialSkipped();
        stopTutorial();
      }
    });
    
    if (cleanup) {
      cleanupFunctions.push(cleanup);
    }
    
    // Si on doit attendre la validation, démarrer le check
    if (step.waitForValidation && step.validation && !step.validation()) {
      startValidationCheck(stepIndex);
    }
    
  }, 500); // Délai pour laisser le DOM se mettre à jour
}

/**
 * Démarre la vérification de validation pour une étape
 */
function startValidationCheck(stepIndex) {
  // Arrêter l'intervalle précédent si présent
  if (validationInterval) {
    clearInterval(validationInterval);
  }
  
  const step = TUTORIAL_STEPS[stepIndex];
  if (!step || !step.validation) return;
  
  // Vérifier immédiatement
  if (step.validation()) {
    // Validation réussie, activer le bouton Suivant
    enableNextButton();
    return;
  }
  
  // Vérifier périodiquement
  validationInterval = setInterval(() => {
    if (step.validation()) {
      clearInterval(validationInterval);
      validationInterval = null;
      enableNextButton();
      
      // Si l'étape est optionnelle, marquer comme complétée automatiquement
      if (step.optional) {
        markStepCompleted(stepIndex);
        // Attendre un peu avant de passer à la suite
        setTimeout(() => {
          nextStep();
        }, 1000);
      }
    }
  }, 500); // Vérifier toutes les 500ms
}

/**
 * Active le bouton Suivant
 */
function enableNextButton() {
  const nextBtn = document.querySelector('#tutorial-next-btn');
  if (nextBtn) {
    nextBtn.disabled = false;
  }
}

/**
 * Passe à l'étape suivante
 */
function nextStep() {
  if (validationInterval) {
    clearInterval(validationInterval);
    validationInterval = null;
  }
  
  const nextIndex = currentStepIndex + 1;
  if (nextIndex < TUTORIAL_STEPS.length) {
    showStep(nextIndex);
  } else {
    completeTutorial();
  }
}

/**
 * Marque le tutoriel comme terminé
 */
function completeTutorial() {
  markTutorialCompleted();
  stopTutorial();
  
  // Afficher un message de félicitations
  setTimeout(() => {
    alert('Tutoriel terminé ! Vous pouvez maintenant utiliser toutes les fonctionnalités de Literature Reviewer.');
  }, 500);
}

/**
 * Réinitialise le tutoriel
 */
export function resetTutorial() {
  stopTutorial();
  resetTutorialState();
}

/**
 * Vérifie si le tutoriel est actif
 */
export function isTutorialActive() {
  return currentTutorial !== null;
}

/**
 * Gestion de l'état du tutoriel
 * Sauvegarde la progression et détecte la première visite
 */

const STORAGE_KEY = 'literature-reviewer-tutorial';
const STORAGE_KEY_COMPLETED = 'literature-reviewer-tutorial-completed';
const STORAGE_KEY_LAST_VERSION = 'literature-reviewer-tutorial-version';

// Version du tutoriel (incrémenter si on change les étapes)
const TUTORIAL_VERSION = '1.0.0';

/**
 * État du tutoriel
 */
const tutorialState = {
  currentStep: 0,
  completed: false,
  skipped: false,
  lastStepCompleted: -1
};

/**
 * Charge l'état depuis localStorage
 */
export function loadTutorialState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      Object.assign(tutorialState, parsed);
    }
    
    // Vérifier si le tutoriel a été complété
    const completed = localStorage.getItem(STORAGE_KEY_COMPLETED) === 'true';
    tutorialState.completed = completed;
    
    // Vérifier la version (si la version change, réinitialiser)
    const lastVersion = localStorage.getItem(STORAGE_KEY_LAST_VERSION);
    if (lastVersion !== TUTORIAL_VERSION) {
      resetTutorialState();
      localStorage.setItem(STORAGE_KEY_LAST_VERSION, TUTORIAL_VERSION);
      return tutorialState;
    }
    
    return tutorialState;
  } catch (error) {
    console.error('Error loading tutorial state:', error);
    return tutorialState;
  }
}

/**
 * Sauvegarde l'état dans localStorage
 */
export function saveTutorialState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentStep: tutorialState.currentStep,
      skipped: tutorialState.skipped,
      lastStepCompleted: tutorialState.lastStepCompleted
    }));
    
    if (tutorialState.completed) {
      localStorage.setItem(STORAGE_KEY_COMPLETED, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY_COMPLETED);
    }
  } catch (error) {
    console.error('Error saving tutorial state:', error);
  }
}

/**
 * Vérifie si c'est la première visite
 */
export function isFirstVisit() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const completed = localStorage.getItem(STORAGE_KEY_COMPLETED) === 'true';
  return !stored && !completed;
}

/**
 * Vérifie si le tutoriel a été complété
 */
export function isTutorialCompleted() {
  return tutorialState.completed || localStorage.getItem(STORAGE_KEY_COMPLETED) === 'true';
}

/**
 * Vérifie si le tutoriel a été ignoré
 */
export function isTutorialSkipped() {
  return tutorialState.skipped;
}

/**
 * Marque une étape comme complétée
 */
export function markStepCompleted(stepIndex) {
  tutorialState.currentStep = stepIndex + 1;
  tutorialState.lastStepCompleted = Math.max(tutorialState.lastStepCompleted, stepIndex);
  saveTutorialState();
}

/**
 * Marque le tutoriel comme complété
 */
export function markTutorialCompleted() {
  tutorialState.completed = true;
  tutorialState.currentStep = 999; // Étape finale
  saveTutorialState();
}

/**
 * Marque le tutoriel comme ignoré
 */
export function markTutorialSkipped() {
  tutorialState.skipped = true;
  saveTutorialState();
}

/**
 * Réinitialise l'état du tutoriel
 */
export function resetTutorialState() {
  tutorialState.currentStep = 0;
  tutorialState.completed = false;
  tutorialState.skipped = false;
  tutorialState.lastStepCompleted = -1;
  
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_COMPLETED);
  localStorage.setItem(STORAGE_KEY_LAST_VERSION, TUTORIAL_VERSION);
}

/**
 * Obtient l'étape actuelle
 */
export function getCurrentStep() {
  return tutorialState.currentStep;
}

/**
 * Définit l'étape actuelle
 */
export function setCurrentStep(step) {
  tutorialState.currentStep = step;
  saveTutorialState();
}

/**
 * Obtient le dernier numéro d'étape complétée
 */
export function getLastCompletedStep() {
  return tutorialState.lastStepCompleted;
}

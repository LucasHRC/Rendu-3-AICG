/**
 * Speech Recognition Wrapper - Web Speech API STT
 * Mode continu avec détection de fin de phrase
 */

// Détection du support navigateur
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * Vérifie si le STT est supporté
 */
export function isSTTSupported() {
  return !!SpeechRecognition;
}

/**
 * Crée une instance de reconnaissance vocale
 */
export function createSpeechRecognition(options = {}) {
  if (!isSTTSupported()) {
    return null;
  }

  const {
    lang = 'fr-FR',
    continuous = true,
    interimResults = true,
    onResult = () => {},
    onError = () => {},
    onEnd = () => {},
    onStart = () => {},
    onSpeechStart = () => {},
    onSpeechEnd = () => {}
  } = options;

  const recognition = new SpeechRecognition();
  let isRunning = false;
  
  // Configuration
  recognition.lang = lang;
  recognition.continuous = continuous;
  recognition.interimResults = interimResults;
  recognition.maxAlternatives = 1;

  // Événements
  recognition.onstart = () => {
    isRunning = true;
    onStart();
  };

  recognition.onspeechstart = () => {
    onSpeechStart();
  };

  recognition.onspeechend = () => {
    onSpeechEnd();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    onResult({
      interim: interimTranscript,
      final: finalTranscript,
      isFinal: finalTranscript.length > 0
    });
  };

  recognition.onerror = (event) => {
    const errorMessages = {
      'no-speech': 'Aucune parole détectée',
      'audio-capture': 'Microphone non disponible',
      'not-allowed': 'Accès au microphone refusé',
      'network': 'Erreur réseau',
      'aborted': 'Reconnaissance annulée',
      'service-not-allowed': 'Service non autorisé'
    };
    
    onError({
      error: event.error,
      message: errorMessages[event.error] || `Erreur: ${event.error}`
    });
  };

  recognition.onend = () => {
    isRunning = false;
    onEnd();
  };

  return {
    recognition,
    
    start() {
      if (isRunning) {
        console.warn('Recognition already started');
        return;
      }
      try {
        recognition.start();
      } catch (e) {
        if (e.message && e.message.includes('already started')) {
          console.warn('Recognition already started (caught)');
          isRunning = true; // Mettre à jour le flag
        } else {
          throw e;
        }
      }
    },
    
    stop() {
      if (isRunning) {
        recognition.stop();
      }
    },
    
    abort() {
      if (isRunning) {
        recognition.abort();
        isRunning = false;
      }
    },
    
    setLang(newLang) {
      recognition.lang = newLang;
    },
    
    isRunning() {
      return isRunning;
    }
  };
}

/**
 * Détecte si l'utilisateur parle (pour interruption TTS)
 * Amélioré avec meilleure sensibilité et réduction des faux positifs
 */
export function createSpeechDetector(delayMs = 3000) {
  let speechStartTime = null;
  let isSpeaking = false;
  let speechDuration = 0;
  let delay = delayMs;
  let speechStreak = 0; // Compteur de détections consécutives pour éviter faux positifs
  const MIN_STREAK = 2; // Minimum 2 détections consécutives pour confirmer parole

  return {
    onSpeechStart() {
      speechStreak++;
      
      // Confirmer parole seulement après MIN_STREAK détections
      if (speechStreak >= MIN_STREAK && !isSpeaking) {
        speechStartTime = Date.now();
        isSpeaking = true;
        speechDuration = 0;
      } else if (speechStreak < MIN_STREAK) {
        // Pas encore confirmé, attendre plus de détections
        speechStartTime = Date.now(); // Démarrer timer mais pas encore isSpeaking
      }
    },
    
    onSpeechEnd() {
      speechStreak = 0; // Reset streak
      
      // Ne confirmer fin que si on était vraiment en train de parler
      if (isSpeaking) {
        speechStartTime = null;
        isSpeaking = false;
        speechDuration = 0;
      }
    },
    
    shouldInterrupt() {
      if (!isSpeaking || !speechStartTime) return false;
      speechDuration = Date.now() - speechStartTime;
      return speechDuration >= delay;
    },
    
    getRemainingTime() {
      if (!isSpeaking || !speechStartTime) return 0;
      const elapsed = Date.now() - speechStartTime;
      return Math.max(0, delay - elapsed);
    },
    
    get isSpeaking() {
      return isSpeaking;
    },
    
    reset() {
      speechStartTime = null;
      isSpeaking = false;
      speechDuration = 0;
      speechStreak = 0;
    }
  };
}


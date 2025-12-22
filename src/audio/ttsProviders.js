/**
 * TTS Providers - Fournisseurs de TTS avec flux audio capturable
 */

/**
 * Crée un TTS provider basé sur AudioElement (capturable pour NCC)
 * @param {Object} options - Options de configuration
 * @param {string} options.endpoint - Endpoint TTS API
 * @returns {Object} Interface TTS avec getAudioElement()
 */
export function createAudioElementTTS({ endpoint = "/api/tts" } = {}) {
  let audioEl = null;
  let currentPromise = null;

  async function speak(text) {
    // Arrêter lecture précédente
    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl = null;
    }

    if (!text || !text.trim()) {
      return null;
    }

    const url = `${endpoint}?text=${encodeURIComponent(text)}`;
    audioEl = new Audio(url);
    audioEl.crossOrigin = "anonymous"; // Important pour CORS
    
    // Gérer les erreurs
    audioEl.onerror = (e) => {
      console.error('[AudioElementTTS] Audio error:', e);
      audioEl = null;
      if (currentPromise) {
        currentPromise.reject(e);
        currentPromise = null;
      }
    };

    return new Promise((resolve, reject) => {
      currentPromise = { resolve, reject };
      
      audioEl.oncanplaythrough = () => {
        audioEl.play()
          .then(() => {
            if (currentPromise) {
              currentPromise.resolve(audioEl);
              currentPromise = null;
            }
          })
          .catch((err) => {
            console.error('[AudioElementTTS] Play failed:', err);
            if (currentPromise) {
              currentPromise.reject(err);
              currentPromise = null;
            }
          });
      };

      audioEl.onended = () => {
        // Audio terminé, garder l'élément pour référence si besoin
      };
    });
  }

  function stop() {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.src = "";
    audioEl = null;
  }

  function isSpeaking() {
    return !!audioEl && !audioEl.paused && !audioEl.ended;
  }

  function getAudioElement() {
    return audioEl;
  }

  return { speak, stop, isSpeaking, getAudioElement };
}


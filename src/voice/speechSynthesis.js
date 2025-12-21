/**
 * Speech Synthesis Wrapper - Web Speech API TTS
 * Configuration voix, vitesse, pitch
 */

const synth = window.speechSynthesis;

/**
 * Vérifie si le TTS est supporté
 */
export function isTTSSupported() {
  return 'speechSynthesis' in window;
}

/**
 * Récupère les voix disponibles par langue
 */
export function getVoices() {
  return new Promise((resolve) => {
    let voices = synth.getVoices();
    
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    
    // Chrome charge les voix de manière asynchrone
    synth.onvoiceschanged = () => {
      voices = synth.getVoices();
      resolve(voices);
    };
    
    // Fallback timeout
    setTimeout(() => {
      resolve(synth.getVoices());
    }, 100);
  });
}

/**
 * Filtre les voix par langue
 */
export async function getVoicesByLang(langCode = 'fr') {
  const voices = await getVoices();
  return voices.filter(v => v.lang.startsWith(langCode));
}

/**
 * Crée un gestionnaire TTS
 */
export function createTTSManager(options = {}) {
  const {
    lang = 'fr-FR',
    rate = 1.0,
    pitch = 1.0,
    volume = 1.0,
    voiceName = null,
    onStart = () => {},
    onEnd = () => {},
    onError = () => {},
    onBoundary = () => {}
  } = options;

  let currentUtterance = null;
  let selectedVoice = null;
  let config = { lang, rate, pitch, volume, voiceName };

  // Charger la voix sélectionnée
  async function loadVoice() {
    const voices = await getVoices();
    
    if (config.voiceName) {
      selectedVoice = voices.find(v => v.name === config.voiceName);
    }
    
    if (!selectedVoice) {
      // Chercher une voix par défaut pour la langue
      selectedVoice = voices.find(v => v.lang === config.lang) ||
                      voices.find(v => v.lang.startsWith(config.lang.split('-')[0])) ||
                      voices[0];
    }
    
    return selectedVoice;
  }

  return {
    async speak(text) {
      if (!isTTSSupported() || !text) {
        console.warn('[TTS] Not supported or no text');
        return Promise.resolve();
      }
      
      // Arrêter toute lecture en cours
      this.stop();
      
      await loadVoice();
      
      return new Promise((resolve, reject) => {
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.lang = config.lang;
        currentUtterance.rate = config.rate;
        currentUtterance.pitch = config.pitch;
        currentUtterance.volume = config.volume;
        
        if (selectedVoice) {
          currentUtterance.voice = selectedVoice;
        }
        
        console.log('[TTS] Speaking:', text.substring(0, 50) + '...', 'Voice:', selectedVoice?.name || 'default');
        
        currentUtterance.onstart = () => {
          console.log('[TTS] Started speaking');
          onStart();
        };
        
        currentUtterance.onend = () => {
          console.log('[TTS] Finished speaking');
          onEnd();
          resolve();
        };
        
        currentUtterance.onerror = (e) => {
          const error = e.error;
          console.error('[TTS] Error:', error);
          
          // "interrupted" n'est pas une vraie erreur, c'est normal
          if (error === 'interrupted') {
            console.log('[TTS] Speech interrupted (normal)');
            onError(error);
            resolve(); // Résoudre au lieu de rejeter pour éviter Uncaught promise
          } else {
            onError(error);
            reject(error);
          }
        };
        
        currentUtterance.onboundary = onBoundary;
        
        // Chrome bug workaround: sometimes speech doesn't start
        // Cancel any pending speech first
        synth.cancel();
        
        // Small delay to ensure cancel is processed
        setTimeout(() => {
          synth.speak(currentUtterance);
          
          // Chrome bug: check if actually speaking after a delay
          setTimeout(() => {
            if (!synth.speaking && currentUtterance) {
              console.warn('[TTS] Speech not started, retrying...');
              synth.speak(currentUtterance);
            }
          }, 100);
        }, 10);
      });
    },
    
    stop() {
      synth.cancel();
      currentUtterance = null;
    },
    
    pause() {
      synth.pause();
    },
    
    resume() {
      synth.resume();
    },
    
    isSpeaking() {
      return synth.speaking;
    },
    
    isPaused() {
      return synth.paused;
    },
    
    setConfig(newConfig) {
      config = { ...config, ...newConfig };
      if (newConfig.voiceName) {
        loadVoice();
      }
    },
    
    getConfig() {
      return { ...config };
    },
    
    async getAvailableVoices() {
      return getVoices();
    },
    
    async getVoicesForLang(langCode) {
      return getVoicesByLang(langCode);
    }
  };
}

/**
 * Langues supportées avec labels
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'fr-FR', label: 'Français' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' }
];

/**
 * Voix recommandées par langue (noms partiels pour matcher)
 * Classées par qualité décroissante
 */
export const RECOMMENDED_VOICES = {
  'fr': [
    // macOS / iOS - Voix Siri de haute qualité
    'Thomas', 'Amelie', 'Audrey', 'Aurelie',
    // Google Chrome
    'Google français',
    // Microsoft Edge
    'Microsoft Denise', 'Microsoft Henri',
    // Fallbacks
    'French'
  ],
  'en': [
    // macOS / iOS - Voix Siri
    'Samantha', 'Alex', 'Daniel', 'Karen', 'Moira',
    // Google Chrome
    'Google US English', 'Google UK English Female', 'Google UK English Male',
    // Microsoft Edge
    'Microsoft Zira', 'Microsoft David', 'Microsoft Mark',
    // Fallbacks
    'English'
  ]
};

/**
 * Récupère les meilleures voix pour une langue
 * Retourne les voix triées par qualité
 */
export async function getBestVoicesForLang(langCode = 'fr') {
  const voices = await getVoices();
  const langPrefix = langCode.split('-')[0];
  const recommended = RECOMMENDED_VOICES[langPrefix] || [];
  
  // Filtrer les voix de cette langue
  const langVoices = voices.filter(v => v.lang.startsWith(langPrefix));
  
  // Trier par qualité (voix recommandées en premier)
  const sorted = langVoices.sort((a, b) => {
    const aIndex = recommended.findIndex(r => a.name.includes(r));
    const bIndex = recommended.findIndex(r => b.name.includes(r));
    
    // Si les deux sont recommandées, garder l'ordre de recommandation
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    // Recommandée > non recommandée
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    // Sinon alphabétique
    return a.name.localeCompare(b.name);
  });
  
  // Retourner max 6 voix
  return sorted.slice(0, 6);
}


/**
 * Module EchoBargeIn - Détection barge-in avec corrélation NCC
 * Version avec corrections pour frame size, tap sécurisé, et optimisations
 */

export class EchoBargeIn {
  constructor() {
    this.audioContext = null;
    this.micStream = null;
    this.micSource = null;
    this.micAnalyser = null;
    this.refAnalyser = null;
    this.refSource = null;
    this.refTapGain = null;
    this.isMonitoring = false;
    this.onUserInterrupt = null;
    this.ttsPlaying = false;
    this._timer = null; // Timer pour setInterval
    this._voiceStreak = 0; // Debounce voix (évite faux positifs)
    
    // Seuils configurables (recommandés)
    this.THRESH_RMS = 0.012; // Seuil VAD (ajuster: 0.008 si pas assez sensible, 0.020 si trop)
    this.THRESH_NCC = 0.2; // Seuil corrélation (ajuster: 0.15 si coupe trop, 0.25 si pas assez)
    this.HANGOVER_MS = 300; // Anti-oscillation (ajuster: 200 pour plus réactif)
    this.FRAME_SIZE = 2048; // fftSize (ajuster: 1024 pour plus réactif mais plus bruité)
    this.VOICE_STREAK_THRESH = 2; // Nombre de frames consécutives avec voix avant interruption
    
    this.lastInterruptTime = 0;
  }

  /**
   * Initialise l'AudioContext et récupère le micro
   */
  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Récupérer le micro avec echoCancellation
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
      console.log('[EchoBargeIn] Supported constraints:', supportedConstraints);
      
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
      this.micAnalyser = this.audioContext.createAnalyser();
      this.micAnalyser.fftSize = this.FRAME_SIZE;
      this.micAnalyser.smoothingTimeConstant = 0.3;
      
      this.micSource.connect(this.micAnalyser);
      
      console.log('[EchoBargeIn] Initialized with echoCancellation');
      return true;
    } catch (error) {
      console.error('[EchoBargeIn] Init failed:', error);
      return false;
    }
  }

  /**
   * Branche le flux TTS comme référence (pour NCC)
   * @param {HTMLAudioElement|AudioNode} source - Source audio TTS
   */
  attachTTSOutput(source) {
    if (!this.audioContext) {
      console.warn('[EchoBargeIn] AudioContext not initialized');
      return;
    }

    try {
      // Détacher l'ancienne référence si elle existe
      if (this.refSource) {
        this.refSource.disconnect();
        if (this.refTapGain) {
          this.refTapGain.disconnect();
        }
      }

      if (source instanceof HTMLAudioElement) {
        // Cas A: Audio element - créer source depuis l'élément
        // IMPORTANT: MediaElementSource ne peut être créé qu'une fois par élément
        this.refSource = this.audioContext.createMediaElementSource(source);
      } else if (source instanceof AudioNode) {
        // Cas B: WebAudio node - utiliser directement
        this.refSource = source;
      } else {
        console.warn('[EchoBargeIn] Unsupported TTS source type');
        return;
      }

      // Créer analyser pour la référence
      this.refAnalyser = this.audioContext.createAnalyser();
      this.refAnalyser.fftSize = this.FRAME_SIZE;
      this.refAnalyser.smoothingTimeConstant = 0.3;

      // Créer un GainNode "tap" pour analyser sans interrompre le flux
      this.refTapGain = this.audioContext.createGain();
      this.refTapGain.gain.value = 1.0;
      
      // Connecter : source -> tap -> analyser (pour analyse)
      this.refSource.connect(this.refTapGain);
      this.refTapGain.connect(this.refAnalyser);
      
      // Si c'est un MediaElementSource, il faut aussi connecter à destination
      // (MediaElementSource ne peut être connecté qu'une fois, donc on le fait ici)
      if (source instanceof HTMLAudioElement) {
        // IMPORTANT: Muter l'élément audio pour éviter double sortie (echo)
        // La sortie se fait uniquement via WebAudio (refTapGain -> destination)
        source.muted = true;
        this.refTapGain.connect(this.audioContext.destination);
        console.log('[EchoBargeIn] Audio element muted, output via WebAudio only');
      }
      // Si c'est un AudioNode, il est probablement déjà connecté ailleurs

      console.log('[EchoBargeIn] TTS output attached for NCC');
    } catch (error) {
      console.error('[EchoBargeIn] Failed to attach TTS output:', error);
    }
  }

  /**
   * Indique que le TTS est en cours de lecture
   */
  setTTSPlaying(playing) {
    this.ttsPlaying = playing;
    if (!playing) {
      // Reset quand TTS s'arrête
      this.lastInterruptTime = 0;
      this._voiceStreak = 0; // Reset debounce aussi
    }
  }

  /**
   * Calcule la corrélation normalisée (NCC) entre mic et ref
   */
  computeNCC(micArray, refArray) {
    if (!refArray || micArray.length !== refArray.length) {
      return 0; // Pas de référence ou tailles différentes
    }

    const len = micArray.length;
    if (len === 0) return 0;

    let sumMic = 0, sumRef = 0, sumMicSq = 0, sumRefSq = 0, sumMicRef = 0;

    // Calculer moyennes
    for (let i = 0; i < len; i++) {
      sumMic += micArray[i];
      sumRef += refArray[i];
    }
    const meanMic = sumMic / len;
    const meanRef = sumRef / len;

    // Calculer corrélation normalisée
    for (let i = 0; i < len; i++) {
      const micNorm = micArray[i] - meanMic;
      const refNorm = refArray[i] - meanRef;
      sumMicSq += micNorm * micNorm;
      sumRefSq += refNorm * refNorm;
      sumMicRef += micNorm * refNorm;
    }

    const denominator = Math.sqrt(sumMicSq * sumRefSq + 1e-12);
    return denominator > 0 ? sumMicRef / denominator : 0;
  }

  /**
   * VAD simple (Voice Activity Detection) basé sur RMS
   */
  computeVAD(dataArray) {
    if (dataArray.length === 0) return false;
    
    let sumSq = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSq += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSq / dataArray.length);
    return rms > this.THRESH_RMS;
  }

  /**
   * Traite une frame audio
   */
  processFrame() {
    if (!this.isMonitoring || !this.micAnalyser) return;

    // CORRECTION: utiliser fftSize, pas frequencyBinCount
    const micBuffer = new Float32Array(this.micAnalyser.fftSize);
    this.micAnalyser.getFloatTimeDomainData(micBuffer);

    // VAD sur le micro
    const hasVoice = this.computeVAD(micBuffer);
    
    // AMÉLIORATION: Debounce voix (évite faux positifs)
    // Incrémente si voix détectée, décrémente sinon (avec limites)
    this._voiceStreak = hasVoice 
      ? Math.min(this._voiceStreak + 1, 5) 
      : Math.max(this._voiceStreak - 1, 0);
    
    // Exige que la voix soit stable sur plusieurs frames
    const voiceStable = this._voiceStreak >= this.VOICE_STREAK_THRESH;
    
    let ncc = 0;
    if (this.refAnalyser && this.ttsPlaying) {
      // Calculer NCC si référence disponible
      const refBuffer = new Float32Array(this.refAnalyser.fftSize);
      this.refAnalyser.getFloatTimeDomainData(refBuffer);
      ncc = this.computeNCC(micBuffer, refBuffer);
    }

    // CORRECTION: utiliser valeur absolue de NCC (pour gérer décalage de phase)
    const nccAbs = Math.abs(ncc);

    // Logique de décision: user interrupt si VAD stable ET NCC faible ET TTS joue
    const now = Date.now();
    if (
      this.ttsPlaying &&
      voiceStable && // Utiliser voiceStable au lieu de hasVoice
      nccAbs < this.THRESH_NCC &&
      (now - this.lastInterruptTime) > this.HANGOVER_MS
    ) {
      // C'est l'utilisateur qui parle, pas le TTS
      console.log(`[EchoBargeIn] User interrupt detected (NCC=${ncc.toFixed(3)}, NCC_abs=${nccAbs.toFixed(3)}, VAD_stable=${voiceStable}, streak=${this._voiceStreak})`);
      this.lastInterruptTime = now;
      this._voiceStreak = 0; // Reset après interruption
      
      if (this.onUserInterrupt) {
        this.onUserInterrupt();
      }
    }

    // Debug amélioré (activer avec window.DEBUG_ECHO_BARGE_IN = true)
    if (window.DEBUG_ECHO_BARGE_IN) {
      console.log(`[EchoBargeIn] NCC=${ncc.toFixed(3)}, NCC_abs=${nccAbs.toFixed(3)}, VAD=${hasVoice}, VAD_stable=${voiceStable}, streak=${this._voiceStreak}, TTS=${this.ttsPlaying}`);
    }
  }

  /**
   * Démarre le monitoring
   */
  startMonitoring({ onUserInterrupt }) {
    if (this.isMonitoring) {
      console.warn('[EchoBargeIn] Already monitoring');
      return;
    }

    if (!this.micAnalyser) {
      console.error('[EchoBargeIn] Not initialized');
      return;
    }

    this.onUserInterrupt = onUserInterrupt;
    this.isMonitoring = true;

    // CORRECTION: utiliser setInterval pour réactivité ~20ms (au lieu de requestAnimationFrame ~16ms)
    this._timer = setInterval(() => {
      this.processFrame();
    }, 20);

    console.log('[EchoBargeIn] Monitoring started (20ms interval)');
  }

  /**
   * Arrête le monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    this.onUserInterrupt = null;
    
    // CORRECTION: clear le timer
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    
    console.log('[EchoBargeIn] Monitoring stopped');
  }

  /**
   * Nettoie les ressources
   */
  cleanup() {
    this.stopMonitoring();
    
    if (this.refSource) {
      try {
        this.refSource.disconnect();
      } catch (e) {}
    }
    if (this.refTapGain) {
      try {
        this.refTapGain.disconnect();
      } catch (e) {}
    }
    
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    
    this.micStream = null;
    this.micSource = null;
    this.micAnalyser = null;
    this.refSource = null;
    this.refTapGain = null;
    this.refAnalyser = null;
    this.audioContext = null;
  }
}


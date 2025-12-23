/**
 * STT Web Speech API + Fallback manuel
 */

const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;

export interface STTOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (result: { interim: string; final: string; isFinal: boolean }) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Vérifier si STT est supporté
 */
export function isSTTSupported(): boolean {
  return !!SpeechRecognition;
}

/**
 * Manager STT avec gestion d'erreurs
 */
export class STTManager {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private onResultCallback: ((result: { interim: string; final: string; isFinal: boolean }) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onStartCallback: (() => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  /**
   * Démarrer la reconnaissance vocale
   */
  start(options: STTOptions = {}): void {
    if (!isSTTSupported()) {
      throw new Error('Speech Recognition not supported in this browser');
    }

    this.stop();

    const {
      lang = 'fr-FR',
      continuous = true,
      interimResults = true
    } = options;

    this.onResultCallback = options.onResult || null;
    this.onErrorCallback = options.onError || null;
    this.onStartCallback = options.onStart || null;
    this.onEndCallback = options.onEnd || null;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = lang;
    this.recognition.continuous = continuous;
    this.recognition.interimResults = interimResults;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStartCallback) this.onStartCallback();
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (this.onResultCallback) {
        this.onResultCallback({
          interim,
          final,
          isFinal: final.length > 0
        });
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessages: Record<string, string> = {
        'no-speech': 'No speech detected',
        'audio-capture': 'No microphone found',
        'not-allowed': 'Microphone permission denied',
        'network': 'Network error',
        'aborted': 'Recognition aborted',
        'service-not-allowed': 'Speech recognition service not allowed'
      };

      const errorMessage = errorMessages[event.error] || `Unknown error: ${event.error}`;
      
      if (this.onErrorCallback) {
        this.onErrorCallback(errorMessage);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEndCallback) this.onEndCallback();
    };

    try {
      this.recognition.start();
    } catch (e: any) {
      if (e.name !== 'InvalidStateError') {
        throw e;
      }
    }
  }

  /**
   * Arrêter la reconnaissance
   */
  stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore si déjà arrêté
      }
      this.recognition = null;
    }
    this.isListening = false;
  }

  /**
   * Vérifier si en train d'écouter
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}


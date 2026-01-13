/**
 * TTS Web Speech API - Chunking intelligent + stop propre
 */

const synth = window.speechSynthesis;
const MAX_CHUNK_LENGTH = 160; // Caractères par chunk

export interface TTSOptions {
  voiceName?: string | null;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: SpeechSynthesisErrorEvent) => void;
}

/**
 * Vérifier si TTS est supporté
 */
export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window;
}

/**
 * Obtenir les voix disponibles
 */
export async function getVoices(): Promise<SpeechSynthesisVoice[]> {
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
 * Découper le texte en chunks intelligents (par phrases)
 */
function chunkText(text: string): string[] {
  // Découper par phrases (., !, ?)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= MAX_CHUNK_LENGTH) {
      currentChunk += sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      // Si une phrase est trop longue, la couper quand même
      if (sentence.length > MAX_CHUNK_LENGTH) {
        const words = sentence.split(' ');
        let longChunk = '';
        for (const word of words) {
          if ((longChunk + word).length <= MAX_CHUNK_LENGTH) {
            longChunk += word + ' ';
          } else {
            if (longChunk) chunks.push(longChunk.trim());
            longChunk = word + ' ';
          }
        }
        if (longChunk) currentChunk = longChunk.trim();
      } else {
        currentChunk = sentence;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Manager TTS avec chunking et gestion propre
 */
export class TTSManager {
  private currentUtterances: SpeechSynthesisUtterance[] = [];
  private isSpeaking: boolean = false;
  private onStartCallback: (() => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onErrorCallback: ((error: SpeechSynthesisErrorEvent) => void) | null = null;

  /**
   * Arrêter toute la synthèse en cours
   */
  stop(): void {
    synth.cancel();
    this.currentUtterances = [];
    this.isSpeaking = false;
  }

  /**
   * Parler un texte avec chunking intelligent
   */
  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    this.stop();

    const {
      voiceName = null,
      rate = 1.0,
      pitch = 1.0,
      volume = 1.0,
      lang = 'fr-FR',
      onStart = null,
      onEnd = null,
      onError = null
    } = options;

    this.onStartCallback = onStart;
    this.onEndCallback = onEnd;
    this.onErrorCallback = onError;

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    const voices = await getVoices();
    const voice = voiceName 
      ? voices.find(v => v.name === voiceName)
      : voices.find(v => v.lang.startsWith(lang.split('-')[0])) || voices[0];

    if (!voice) {
      const error = new Error('No voice available') as any;
      error.type = 'no-voice';
      if (onError) onError(error as SpeechSynthesisErrorEvent);
      return;
    }

    let chunkIndex = 0;
    let hasStarted = false;

    const speakChunk = (): void => {
      if (chunkIndex >= chunks.length) {
        this.isSpeaking = false;
        if (this.onEndCallback) this.onEndCallback();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.voice = voice;
      utterance.rate = Math.max(0.5, Math.min(2.0, rate));
      utterance.pitch = Math.max(0, Math.min(2, pitch));
      utterance.volume = Math.max(0, Math.min(1, volume));
      utterance.lang = lang;

      utterance.onstart = () => {
        if (!hasStarted) {
          hasStarted = true;
          if (this.onStartCallback) this.onStartCallback();
        }
        this.isSpeaking = true;
      };

      utterance.onend = () => {
        chunkIndex++;
        speakChunk();
      };

      utterance.onerror = (e) => {
        if (this.onErrorCallback) {
          this.onErrorCallback(e);
        }
      };

      this.currentUtterances.push(utterance);
      synth.speak(utterance);
    };

    speakChunk();
  }

  /**
   * Vérifier si en train de parler
   */
  getIsSpeaking(): boolean {
    return this.isSpeaking || synth.speaking;
  }
}

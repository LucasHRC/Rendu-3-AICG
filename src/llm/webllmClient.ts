/**
 * WebLLM Client - Wrapper pour streaming + abort
 */

declare global {
  interface Window {
    webllm?: any;
  }
}

let webllmModule: any = null;
let currentEngine: any = null;
let currentModel: string | null = null;

export interface LoadProgress {
  progress: number;
  text: string;
}

/**
 * Initialiser WebLLM depuis CDN
 */
export async function initWebLLM(): Promise<any> {
  if (webllmModule) return webllmModule;
  
  // Attendre que le module soit chargé depuis index.html
  if (window.webllm) {
    webllmModule = window.webllm;
    return webllmModule;
  }

  // Fallback: charger dynamiquement
  try {
    webllmModule = await import('https://esm.run/@mlc-ai/web-llm');
    window.webllm = webllmModule;
    return webllmModule;
  } catch (error) {
    throw new Error(`Failed to load WebLLM: ${error}`);
  }
}

/**
 * Charger un modèle WebLLM
 */
export async function loadModel(
  modelId: string,
  onProgress?: (progress: LoadProgress) => void
): Promise<any> {
  await initWebLLM();
  
  // Si le même modèle est déjà chargé, retourner l'engine existant
  if (currentEngine && currentModel === modelId) {
    return currentEngine;
  }

  // Détruire l'engine précédent si différent
  if (currentEngine && currentModel !== modelId) {
    try {
      // WebLLM n'a pas de méthode destroy explicite, on laisse le GC faire
      currentEngine = null;
    } catch (e) {
      console.warn('[WebLLM] Error cleaning up previous engine:', e);
    }
  }

  // WebLLM utilise CreateMLCEngine
  const engine = await webllmModule.CreateMLCEngine(modelId, {
    initProgressCallback: (report: any) => {
      if (onProgress) {
        onProgress({
          progress: report.progress || 0,
          text: report.text || 'Loading model...'
        });
      }
    }
  });

  currentEngine = engine;
  currentModel = modelId;
  
  return engine;
}

/**
 * Streamer une complétion avec abort support
 */
export async function streamCompletion(
  engine: any,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    onToken?: (token: string, fullText: string) => void;
    abortSignal?: AbortSignal;
  } = {}
): Promise<string> {
  const {
    temperature = 0.7,
    maxTokens = 512,
    onToken = () => {},
    abortSignal = null
  } = options;

  try {
    // WebLLM utilise l'API OpenAI-compatible
    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature,
      max_tokens: maxTokens,
      stream: true
    });

    let fullText = '';
    for await (const chunk of response) {
      // Vérifier l'abort
      if (abortSignal?.aborted) {
        throw new Error('Generation aborted');
      }
      
      const content = chunk.choices?.[0]?.delta?.content || '';
      if (content) {
        fullText += content;
        onToken(content, fullText);
      }
    }

    return fullText;
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      throw new Error('Generation aborted');
    }
    throw error;
  }
}

/**
 * Obtenir l'engine actuel
 */
export function getCurrentEngine(): any {
  return currentEngine;
}

/**
 * Vérifier si un modèle est chargé
 */
export function isModelLoaded(): boolean {
  return currentEngine !== null && currentModel !== null;
}

/**
 * Obtenir le modèle actuellement chargé
 */
export function getCurrentModel(): string | null {
  return currentModel;
}


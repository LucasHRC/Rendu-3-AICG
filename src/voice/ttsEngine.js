/**
 * Stub pour TTS Engine open-source (fonctionnalité supprimée)
 */

export async function initTTSModel(modelId, voiceId, onProgress) {
  return false;
}

export async function speak(text, modelId, voiceId, options) {
  console.warn('[TTS Engine] Open-source TTS models not available');
  return false;
}

export function isModelReady(modelId) {
  return false;
}

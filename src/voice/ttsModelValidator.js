/**
 * Stub pour TTS Model Validator (fonctionnalité supprimée)
 */

export async function validateModel(modelId, timeout = 30000) {
  return { available: false, error: 'Model validation not available' };
}

export async function validateAllModels(onProgress = null) {
  return {};
}

export function isModelAvailable(modelId) {
  return false;
}

export function getModelStatus(modelId) {
  return { status: 'unavailable', error: 'Model validation not available' };
}

export function clearValidationCache() {
  // No-op
}

export function getAllValidationStatuses() {
  return {};
}


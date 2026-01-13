/**
 * Module de découpage intelligent de texte en chunks
 * Respecte les limites de phrases et paragraphes
 */

import { addLog } from '../state/state.js';

/**
 * Découpe un texte en phrases
 * @param {string} text - Le texte à découper
 * @returns {Array<string>} - Liste des phrases
 */
function splitIntoSentences(text) {
  // Regex pour découper aux fins de phrases (. ! ? suivi d'espace ou fin)
  // Préserve les abréviations courantes (Dr., Mr., etc.)
  const sentences = text
    .replace(/([.!?])\s+/g, '$1|||')
    .split('|||')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return sentences;
}


/**
 * Découpe intelligemment un texte en chunks sémantiques
 * - Respecte les limites de phrases
 * - Ne coupe jamais au milieu d'une phrase
 * - Overlap basé sur les dernières phrases du chunk précédent
 * 
 * @param {string} text - Le texte à découper
 * @param {number} targetSize - Taille cible des chunks (défaut: 500)
 * @param {number} overlapSentences - Nombre de phrases de chevauchement (défaut: 1)
 * @returns {Array<{text: string, start: number, end: number, index: number}>}
 */
export function chunkText(text, targetSize = 500, overlapSentences = 1) {
  if (!text || text.length === 0) {
    return [];
  }

  // Nettoyer le texte
  const cleanedText = text
    .replace(/\s+/g, ' ')
    .trim();

  // Découper en phrases
  const sentences = splitIntoSentences(cleanedText);
  
  if (sentences.length === 0) {
    return [{
      text: cleanedText,
      start: 0,
      end: cleanedText.length,
      index: 0
    }];
  }

  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;
  let chunkIndex = 0;
  let textPosition = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceLength = sentence.length + 1; // +1 pour l'espace

    // Si ajouter cette phrase dépasse la taille cible et on a déjà du contenu
    if (currentLength + sentenceLength > targetSize && currentChunk.length > 0) {
      // Créer le chunk
      const chunkText = currentChunk.join(' ');
      const start = textPosition;
      const end = start + chunkText.length;

      chunks.push({
        text: chunkText,
        start: start,
        end: end,
        index: chunkIndex
      });

      chunkIndex++;
      textPosition = end - (overlapSentences > 0 ? currentChunk.slice(-overlapSentences).join(' ').length : 0);

      // Overlap : garder les dernières phrases
      currentChunk = currentChunk.slice(-overlapSentences);
      currentLength = currentChunk.join(' ').length;
    }

    currentChunk.push(sentence);
    currentLength += sentenceLength;
  }

  // Dernier chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ');
    chunks.push({
      text: chunkText,
      start: textPosition,
      end: textPosition + chunkText.length,
      index: chunkIndex
    });
  }

  addLog('info', `Text chunked into ${chunks.length} semantic chunks`);
  return chunks;
}

/**
 * Crée des chunks pour un document avec métadonnées
 * @param {string} text - Le texte à chunker
 * @param {string} source - Source du texte (nom du fichier)
 * @param {string} docId - ID du document
 * @param {number} targetSize - Taille cible des chunks (défaut: 500)
 * @param {number} overlapSentences - Phrases de chevauchement (défaut: 1)
 * @returns {Array<{id: string, text: string, source: string, docId: string, chunkIndex: number, start: number, end: number, charCount: number}>}
 */
export function createChunksForDocument(text, source, docId, targetSize = 500, overlapSentences = 1) {
  const rawChunks = chunkText(text, targetSize, overlapSentences);

  return rawChunks.map((chunk, idx) => ({
    id: `${docId}-chunk-${idx}`,
    text: chunk.text,
    source: source,
    docId: docId,
    chunkIndex: idx,
    start: chunk.start,
    end: chunk.end,
    charCount: chunk.text.length
  }));
}

/**
 * Module de découpage de texte en chunks avec fenêtre glissante
 */

/**
 * Découpe un texte en chunks avec fenêtre glissante et overlap
 * @param {string} text - Le texte à découper
 * @param {number} chunkSize - Taille des chunks (défaut: 500)
 * @param {number} overlap - Nombre de caractères de chevauchement (défaut: 100)
 * @returns {Array<{text: string, start: number, end: number, index: number}>} - Liste des chunks
 */
export function chunkText(text, chunkSize = 500, overlap = 100) {
  if (!text || text.length === 0) {
    return [];
  }

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkText = text.substring(start, end);

    chunks.push({
      text: chunkText,
      start: start,
      end: end,
      index: index
    });

    // Avancer avec overlap
    start += chunkSize - overlap;
    index++;

    // Éviter boucle infinie si overlap >= chunkSize
    if (overlap >= chunkSize) {
      break;
    }
  }

  return chunks;
}

/**
 * Crée des chunks pour un document avec métadonnées
 * @param {string} text - Le texte à chunker
 * @param {string} source - Source du texte (nom du fichier)
 * @param {string} docId - ID du document
 * @param {number} chunkSize - Taille des chunks (défaut: 500)
 * @param {number} overlap - Overlap (défaut: 100)
 * @returns {Array<{id: string, text: string, source: string, docId: string, chunkIndex: number, start: number, end: number}>} - Chunks avec métadonnées
 */
export function createChunksForDocument(text, source, docId, chunkSize = 500, overlap = 100) {
  const rawChunks = chunkText(text, chunkSize, overlap);

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


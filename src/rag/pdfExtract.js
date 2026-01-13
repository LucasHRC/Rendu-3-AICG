/**
 * Module d'extraction de texte depuis PDFs avec PDF.js
 * Optimisations : parallélisation, timeouts, cache
 */

// Cache simple pour éviter retraitement
const extractionCache = new Map();

/**
 * Génère une clé de cache basée sur le fichier
 */
function getCacheKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/**
 * Vérifie si un fichier est en cache
 */
function getCachedExtraction(file) {
  const key = getCacheKey(file);
  const cached = extractionCache.get(key);
  if (cached && Date.now() - cached.timestamp < 3600000) { // 1h cache
    return cached.data;
  }
  return null;
}

/**
 * Met en cache une extraction
 */
function setCachedExtraction(file, data) {
  const key = getCacheKey(file);
  extractionCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Extrait le texte brut d'un fichier PDF avec optimisations
 * @param {File} file - Le fichier PDF à traiter
 * @param {Function} onProgress - Callback de progression (page actuelle / total)
 * @returns {Promise<{text: string, pageCount: number, charCount: number}>} - Texte extrait et statistiques
 */
export async function extractTextFromPDF(file, onProgress = null) {
  try {
    // Vérifier le cache d'abord
    const cached = getCachedExtraction(file);
    if (cached) {
      if (onProgress) onProgress(cached.pageCount, cached.pageCount); // Progression complète
      return cached;
    }

    // Vérifier que PDF.js est chargé
    const pdfjs = window.pdfjsLib || window.pdfjs;
    if (!pdfjs) {
      throw new Error('PDF.js n\'est pas chargé. Vérifiez que le CDN est correctement inclus.');
    }

    // Configurer le worker si nécessaire
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Timeout pour la lecture du fichier (30s max)
    const fileReadPromise = file.arrayBuffer();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout lecture fichier PDF')), 30000)
    );

    const arrayBuffer = await Promise.race([fileReadPromise, timeoutPromise]);

    // Timeout pour le chargement du PDF (60s max pour PDFs volumineux)
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      // Optimisations pour la performance
      disableFontFace: false,
      disableRange: false,
      disableStream: false,
      disableAutoFetch: false
    });

    const pdfLoadPromise = loadingTask.promise;
    const pdfTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout chargement PDF')), 60000)
    );

    const pdf = await Promise.race([pdfLoadPromise, pdfTimeoutPromise]);

    const pageCount = pdf.numPages;
    let fullText = '';

    // Extraire le texte de chaque page avec parallélisation (max 5 pages simultanées)
    const batchSize = Math.min(5, pageCount);
    const pagePromises = [];

    for (let batchStart = 1; batchStart <= pageCount; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, pageCount);
      const batchPromises = [];

      // Créer les promesses pour ce batch
      for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
        batchPromises.push(
          pdf.getPage(pageNum).then(async (page) => {
            try {
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map(item => item.str)
                .join(' ')
                .trim();
              return { pageNum, text: pageText };
            } catch (error) {
              console.warn(`Erreur extraction page ${pageNum}:`, error);
              return { pageNum, text: `[Erreur extraction page ${pageNum}]` };
            }
          })
        );
      }

      // Attendre ce batch et l'ajouter au texte complet
      const batchResults = await Promise.all(batchPromises);
      batchResults.sort((a, b) => a.pageNum - b.pageNum);

      for (const result of batchResults) {
        if (result.text && result.text !== `[Erreur extraction page ${result.pageNum}]`) {
          fullText += result.text + '\n\n';
        }
        // Mise à jour progression par page
        if (onProgress) {
          onProgress(result.pageNum, pageCount);
        }
      }
    }

    // Nettoyer le texte (supprimer espaces multiples, etc.)
    const cleanedText = fullText
      .replace(/\s+/g, ' ')  // Remplacer espaces multiples par un seul
      .replace(/\n\s*\n/g, '\n')  // Supprimer lignes vides multiples
      .trim();

    const charCount = cleanedText.length;
    const result = {
      text: cleanedText,
      pageCount: pageCount,
      charCount: charCount
    };

    // Mettre en cache le résultat
    setCachedExtraction(file, result);

    return result;

  } catch (error) {
    console.error('Erreur lors de l\'extraction du PDF:', error);
    throw new Error(`Échec de l'extraction: ${error.message}`);
  }
}


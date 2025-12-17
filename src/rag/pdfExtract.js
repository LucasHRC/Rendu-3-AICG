/**
 * Module d'extraction de texte depuis PDFs avec PDF.js
 */

/**
 * Extrait le texte brut d'un fichier PDF
 * @param {File} file - Le fichier PDF à traiter
 * @returns {Promise<{text: string, pageCount: number, charCount: number}>} - Texte extrait et statistiques
 */
export async function extractTextFromPDF(file) {
  try {
    // Vérifier que PDF.js est chargé
    const pdfjs = window.pdfjsLib || window.pdfjs;
    if (!pdfjs) {
      throw new Error('PDF.js n\'est pas chargé. Vérifiez que le CDN est correctement inclus.');
    }

    // Configurer le worker si nécessaire
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Lire le fichier en ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Charger le PDF
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const pageCount = pdf.numPages;
    let fullText = '';

    // Extraire le texte de chaque page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Concaténer le texte de la page
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');

      fullText += pageText + '\n\n';
    }

    // Nettoyer le texte (supprimer espaces multiples, etc.)
    const cleanedText = fullText
      .replace(/\s+/g, ' ')  // Remplacer espaces multiples par un seul
      .replace(/\n\s*\n/g, '\n')  // Supprimer lignes vides multiples
      .trim();

    const charCount = cleanedText.length;

    return {
      text: cleanedText,
      pageCount: pageCount,
      charCount: charCount
    };

  } catch (error) {
    console.error('Erreur lors de l\'extraction du PDF:', error);
    throw new Error(`Échec de l'extraction: ${error.message}`);
  }
}


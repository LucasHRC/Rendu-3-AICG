/**
 * Utilitaires pour la gestion des fichiers
 */

/**
 * Valide qu'un fichier est un PDF
 * @param {File} file - Le fichier à valider
 * @returns {{valid: boolean, error?: string}} - Résultat de la validation
 */
export function validatePDF(file) {
  // Vérifier que c'est un objet File
  if (!(file instanceof File)) {
    return { valid: false, error: 'Invalid file object' };
  }

  // Vérifier le type MIME
  if (file.type && file.type !== 'application/pdf') {
    return { valid: false, error: 'File must be a PDF (application/pdf)' };
  }

  // Vérifier l'extension
  const filename = file.name.toLowerCase();
  if (!filename.endsWith('.pdf')) {
    return { valid: false, error: 'File must have .pdf extension' };
  }

  // Limite de taille optionnelle (50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB en bytes
  if (file.size > maxSize) {
    return { valid: false, error: `File too large. Maximum size is ${formatFileSize(maxSize)}` };
  }

  return { valid: true };
}

/**
 * Formate la taille d'un fichier en format lisible
 * @param {number} bytes - Taille en bytes
 * @returns {string} - Taille formatée (KB, MB, GB)
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Génère un ID unique pour un fichier
 * @returns {string} - UUID unique
 */
export function generateFileId() {
  // Utiliser crypto.randomUUID si disponible (navigateurs modernes)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback : génération simple d'UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Vérifie si un fichier avec le même nom existe déjà
 * @param {string} filename - Nom du fichier à vérifier
 * @param {Array} docs - Liste des documents existants
 * @returns {boolean} - true si doublon trouvé
 */
export function checkDuplicate(filename, docs) {
  return docs.some(doc => doc.filename === filename);
}


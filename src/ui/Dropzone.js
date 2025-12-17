/**
 * Composant UI : Zone de drag & drop pour PDFs
 */

import { addDocument, addLog } from '../state/state.js';
import { validatePDF } from '../utils/fileUtils.js';

// Icône SVG pour le document
const PDF_ICON = `
<svg class="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
</svg>
`;

/**
 * Crée la zone de drag & drop
 * @returns {HTMLElement} - L'élément dropzone
 */
export function createDropzone() {
  const container = document.createElement('div');
  
  // Input file caché avec ID unique
  const inputId = 'pdf-file-input-' + Math.random().toString(36).substr(2, 9);
  
  // Utiliser un label qui déclenche nativement l'input
  container.innerHTML = `
    <input type="file" id="${inputId}" accept=".pdf,application/pdf" multiple style="display: none;" />
    <label for="${inputId}" id="dropzone" class="block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer transition-all duration-200 hover:border-blue-400 hover:bg-blue-50">
      <div class="flex flex-col items-center justify-center space-y-3">
        ${PDF_ICON}
        <div class="space-y-1">
          <p class="text-lg font-semibold text-gray-700">Glissez vos PDFs ici</p>
          <p class="text-gray-500 text-sm">ou cliquez pour selectionner</p>
          <p class="text-xs text-gray-400 mt-2">Formats acceptes : .pdf uniquement</p>
        </div>
      </div>
      <div id="dropzone-error" class="mt-4 text-red-500 text-sm hidden"></div>
    </label>
  `;
  
  const fileInput = container.querySelector('input');
  const dropzone = container.querySelector('#dropzone');

  // Gestion des événements drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-gray-300', 'hover:border-blue-400');
    dropzone.classList.add('border-blue-500', 'bg-blue-100', 'border-solid');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-blue-500', 'bg-blue-100', 'border-solid');
    dropzone.classList.add('border-gray-300', 'hover:border-blue-400');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Réinitialiser le style
    dropzone.classList.remove('border-blue-500', 'bg-blue-100', 'border-solid');
    dropzone.classList.add('border-gray-300', 'hover:border-blue-400');

    // Récupérer les fichiers
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files, dropzone);
  });

  // Gestion de la sélection de fichiers via file picker
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files, dropzone);
    // Réinitialiser l'input pour permettre de sélectionner le même fichier à nouveau
    fileInput.value = '';
  });

  return container;
}

/**
 * Traite les fichiers déposés ou sélectionnés
 * @param {File[]} files - Liste des fichiers
 * @param {HTMLElement} dropzone - L'élément dropzone pour afficher les erreurs
 */
function handleFiles(files, dropzone) {
  if (files.length === 0) {
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  files.forEach((file) => {
    // Validation
    const validation = validatePDF(file);
    
    if (!validation.valid) {
      errorCount++;
      showError(dropzone, validation.error);
      return;
    }

    // Ajout au state
    const result = addDocument(file);
    
    if (result.success) {
      successCount++;
    } else {
      errorCount++;
      showError(dropzone, result.error);
    }
  });

  // Message de succès si au moins un fichier a été ajouté
  if (successCount > 0) {
    hideError(dropzone);
    if (successCount === 1) {
      addLog('success', `1 PDF uploaded successfully`);
    } else {
      addLog('success', `${successCount} PDFs uploaded successfully`);
    }
  }

  // Message d'erreur si tous les fichiers ont échoué
  if (errorCount > 0 && successCount === 0) {
    showError(dropzone, errorCount === 1 
      ? 'Failed to upload file. Please check the file format and size.'
      : `Failed to upload ${errorCount} files. Please check the file formats and sizes.`);
  }
}

/**
 * Affiche un message d'erreur dans la dropzone
 * @param {HTMLElement} dropzone - L'élément dropzone
 * @param {string} message - Message d'erreur
 */
function showError(dropzone, message) {
  const errorElement = dropzone.querySelector('#dropzone-error');
  if (!errorElement) return;
  
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
  
  // Ajouter classe d'erreur visuelle
  dropzone.classList.add('border-red-500', 'bg-red-50');
  dropzone.classList.remove('border-gray-300', 'hover:border-blue-400');

  // Masquer l'erreur après 5 secondes
  setTimeout(() => {
    hideError(dropzone);
  }, 5000);
}

/**
 * Masque le message d'erreur dans la dropzone
 * @param {HTMLElement} dropzone - L'élément dropzone
 */
function hideError(dropzone) {
  const errorElement = dropzone.querySelector('#dropzone-error');
  if (!errorElement) return;
  
  errorElement.classList.add('hidden');
  errorElement.textContent = '';
  
  // Réinitialiser le style
  dropzone.classList.remove('border-red-500', 'bg-red-50');
  dropzone.classList.add('border-gray-300', 'hover:border-blue-400');
}

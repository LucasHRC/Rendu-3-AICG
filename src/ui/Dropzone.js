/**
 * Composant UI : Zone de drag & drop pour PDFs
 */

import { addDocument, addLog } from '../state/state.js';
import { validatePDF } from '../utils/fileUtils.js';

/**
 * Crée la zone de drag & drop
 * @returns {HTMLElement} - L'élément dropzone
 */
export function createDropzone() {
  const dropzone = document.createElement('div');
  dropzone.id = 'dropzone';
  dropzone.className = 'border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer transition-all duration-200 hover:border-blue-400 hover:bg-blue-50';
  
  // Contenu de la zone
  dropzone.innerHTML = `
    <div class="flex flex-col items-center justify-center space-y-4">
      <div class="text-6xl">📄</div>
      <div class="space-y-2">
        <p class="text-xl font-semibold text-gray-700">Glissez vos PDFs ici</p>
        <p class="text-gray-500">ou cliquez pour sélectionner</p>
        <p class="text-sm text-gray-400 mt-2">Formats acceptés : .pdf uniquement</p>
      </div>
    </div>
    <div id="dropzone-error" class="mt-4 text-red-500 text-sm hidden"></div>
  `;

  // Input file caché
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf,application/pdf';
  fileInput.multiple = true;
  fileInput.className = 'hidden';
  dropzone.appendChild(fileInput);

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

  // Gestion du click pour ouvrir le file picker
  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  // Gestion de la sélection de fichiers via file picker
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files, dropzone);
    // Réinitialiser l'input pour permettre de sélectionner le même fichier à nouveau
    fileInput.value = '';
  });

  return dropzone;
}

/**
 * Traite les fichiers déposés ou sélectionnés
 * @param {File[]} files - Liste des fichiers
 * @param {HTMLElement} dropzone - L'élément dropzone pour afficher les erreurs
 */
function handleFiles(files, dropzone) {
  const errorElement = dropzone.querySelector('#dropzone-error');
  
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
  errorElement.classList.add('hidden');
  errorElement.textContent = '';
  
  // Réinitialiser le style
  dropzone.classList.remove('border-red-500', 'bg-red-50');
  dropzone.classList.add('border-gray-300', 'hover:border-blue-400');
}


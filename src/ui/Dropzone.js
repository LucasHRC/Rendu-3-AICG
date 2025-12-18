/**
 * Composant UI : Zone de drag & drop - Design avec accents couleurs
 */

import { addLog } from '../state/state.js';
import { validatePDF } from '../utils/fileUtils.js';
import { showQuickUploadWorkflow } from './QuickUpload.js';

/**
 * Crée la zone de drag & drop
 */
export function createDropzone() {
  const container = document.createElement('div');
  
  container.innerHTML = `
    <div id="dropzone" 
         class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50">
      <div class="flex flex-col items-center justify-center">
        <svg class="w-10 h-10 text-blue-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p class="text-base font-semibold text-gray-700">Drop PDFs here</p>
        <p class="text-sm text-gray-500 mt-1">or click to browse</p>
      </div>
      <div id="dropzone-error" class="mt-4 text-red-600 text-sm font-medium hidden"></div>
    </div>
  `;
  
  const dropzone = container.querySelector('#dropzone');

  // Click handler - use label wrapping input for Chrome compatibility
  dropzone.setAttribute('onclick', '');
  
  const labelWrapper = document.createElement('label');
  labelWrapper.style.cssText = 'position:absolute;inset:0;cursor:pointer;';
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf,application/pdf';
  fileInput.multiple = true;
  fileInput.style.cssText = 'position:absolute;left:-9999px;opacity:0;';
  
  fileInput.addEventListener('change', (evt) => {
    if (evt.target.files?.length > 0) {
      handleFiles(Array.from(evt.target.files), dropzone);
    }
    fileInput.value = '';
  });
  
  labelWrapper.appendChild(fileInput);
  dropzone.style.position = 'relative';
  dropzone.appendChild(labelWrapper);

  // Drag events
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('border-blue-500', 'bg-blue-100', 'border-solid');
    dropzone.classList.remove('border-gray-300', 'border-dashed');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-blue-500', 'bg-blue-100', 'border-solid');
    dropzone.classList.add('border-gray-300', 'border-dashed');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-blue-500', 'bg-blue-100', 'border-solid');
    dropzone.classList.add('border-gray-300', 'border-dashed');
    handleFiles(Array.from(e.dataTransfer.files), dropzone);
  });

  return container;
}

/**
 * Traite les fichiers - lance automatiquement le workflow Quick Upload
 */
function handleFiles(files, dropzone) {
  if (files.length === 0) return;

  // Valider tous les fichiers d'abord
  const validFiles = [];
  
  files.forEach((file) => {
    const validation = validatePDF(file);
    if (!validation.valid) {
      showError(dropzone, validation.error);
    } else {
      validFiles.push(file);
    }
  });

  if (validFiles.length === 0) {
    showError(dropzone, 'Aucun fichier PDF valide');
    return;
  }

  hideError(dropzone);
  addLog('info', `${validFiles.length} PDF(s) détecté(s), lancement du workflow...`);
  
  // Lancer automatiquement le Quick Upload
  showQuickUploadWorkflow(validFiles);
}

function showError(dropzone, message) {
  const errorElement = dropzone.querySelector('#dropzone-error');
  if (!errorElement) return;
  
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
  dropzone.classList.add('border-red-400', 'bg-red-50');
  dropzone.classList.remove('border-gray-300');

  setTimeout(() => hideError(dropzone), 5000);
}

function hideError(dropzone) {
  const errorElement = dropzone.querySelector('#dropzone-error');
  if (!errorElement) return;
  
  errorElement.classList.add('hidden');
  errorElement.textContent = '';
  dropzone.classList.remove('border-red-400', 'bg-red-50');
  dropzone.classList.add('border-gray-300');
}

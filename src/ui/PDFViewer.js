/**
 * Composant UI : Visualiseur PDF avec PDF.js
 */

/**
 * Affiche un PDF dans un modal
 * @param {File} file - Le fichier PDF à afficher
 * @param {string} filename - Le nom du fichier
 */
export function showPDFViewer(file, filename) {
  // Créer le modal
  const modal = createModal(filename);
  document.body.appendChild(modal);

  // Charger et afficher le PDF
  loadAndDisplayPDF(file, modal);
}

/**
 * Crée le modal pour afficher le PDF
 * @param {string} filename - Le nom du fichier
 * @returns {HTMLElement} - L'élément modal
 */
function createModal(filename) {
  const modal = document.createElement('div');
  modal.id = 'pdf-viewer-modal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
  
  const content = document.createElement('div');
  content.className = 'bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col';

  // Header
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between p-4 border-b border-gray-200';
  
  const title = document.createElement('h2');
  title.className = 'text-xl font-bold text-gray-800 truncate flex-1';
  title.textContent = filename;
  
  const closeButton = document.createElement('button');
  closeButton.className = 'ml-4 text-gray-500 hover:text-gray-700 text-2xl font-bold';
  closeButton.innerHTML = '×';
  closeButton.setAttribute('aria-label', 'Fermer');
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  header.appendChild(title);
  header.appendChild(closeButton);

  // Contenu PDF
  const pdfContainer = document.createElement('div');
  pdfContainer.id = 'pdf-container';
  pdfContainer.className = 'flex-1 overflow-auto p-4 bg-gray-100';
  
  // Contrôles de navigation
  const controls = document.createElement('div');
  controls.id = 'pdf-controls';
  controls.className = 'flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50';
  
  const prevButton = document.createElement('button');
  prevButton.id = 'pdf-prev';
  prevButton.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed';
  prevButton.textContent = '← Précédent';
  prevButton.disabled = true;

  const pageInfo = document.createElement('span');
  pageInfo.id = 'pdf-page-info';
  pageInfo.className = 'text-gray-700 font-medium';
  pageInfo.textContent = 'Chargement...';

  const nextButton = document.createElement('button');
  nextButton.id = 'pdf-next';
  nextButton.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed';
  nextButton.textContent = 'Suivant →';
  nextButton.disabled = true;

  controls.appendChild(prevButton);
  controls.appendChild(pageInfo);
  controls.appendChild(nextButton);

  content.appendChild(header);
  content.appendChild(pdfContainer);
  content.appendChild(controls);
  modal.appendChild(content);

  // Fermer en cliquant en dehors du modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  // Fermer avec Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  return modal;
}

/**
 * Charge et affiche le PDF avec PDF.js
 * @param {File} file - Le fichier PDF
 * @param {HTMLElement} modal - Le modal contenant le viewer
 */
async function loadAndDisplayPDF(file, modal) {
  const container = modal.querySelector('#pdf-container');
  const pageInfo = modal.querySelector('#pdf-page-info');
  const prevButton = modal.querySelector('#pdf-prev');
  const nextButton = modal.querySelector('#pdf-next');

  try {
    // Vérifier que PDF.js est chargé
    // PDF.js peut être accessible via window.pdfjsLib ou pdfjsLib selon la version
    const pdfjs = window.pdfjsLib || window.pdfjs;
    if (!pdfjs) {
      throw new Error('PDF.js n\'est pas chargé. Vérifiez que le CDN est correctement inclus dans index.html.');
    }

    // Configurer le worker si nécessaire (pour certaines versions)
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Afficher message de chargement
    container.innerHTML = '<div class="text-center py-8"><p class="text-gray-600">Chargement du PDF...</p></div>';
    pageInfo.textContent = 'Chargement...';

    // Lire le fichier en ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Charger le PDF avec PDF.js
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    // Variables pour la navigation
    let currentPage = 1;
    const totalPages = pdf.numPages;

    // Fonction pour rendre une page
    const renderPage = async (pageNum) => {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      // Créer le canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.className = 'mx-auto mb-4 shadow-lg';

      // Rendre la page
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;

      // Afficher dans le container
      container.innerHTML = '';
      container.appendChild(canvas);

      // Mettre à jour les infos de page
      pageInfo.textContent = `Page ${pageNum} / ${totalPages}`;

      // Mettre à jour les boutons
      prevButton.disabled = pageNum <= 1;
      nextButton.disabled = pageNum >= totalPages;
    };

    // Rendre la première page
    await renderPage(1);

    // Gestionnaires d'événements pour la navigation
    prevButton.addEventListener('click', async () => {
      if (currentPage > 1) {
        currentPage--;
        await renderPage(currentPage);
      }
    });

    nextButton.addEventListener('click', async () => {
      if (currentPage < totalPages) {
        currentPage++;
        await renderPage(currentPage);
      }
    });

  } catch (error) {
    console.error('Erreur lors du chargement du PDF:', error);
    container.innerHTML = `
      <div class="text-center py-8">
        <p class="text-red-600 font-semibold mb-2">Erreur lors du chargement du PDF</p>
        <p class="text-gray-600 text-sm">${error.message}</p>
      </div>
    `;
    pageInfo.textContent = 'Erreur';
  }
}


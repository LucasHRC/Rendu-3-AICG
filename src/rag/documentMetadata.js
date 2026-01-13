/**
 * Module de génération automatique des métadonnées (6 paramètres fixes)
 * Génère : résumé, sujet, type, contexte/liens, utilité, importance
 */

import { state, updateDocumentMetadata, getDocument, addLog } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';

// Liste des types de documents prédéfinis (selon exigences utilisateur)
export const DOCUMENT_TYPES = [
  'article scientifique',
  'note de recherche',
  'tutoriel',
  'décision',
  'rapport',
  'présentation',
  'documentation technique',
  'analyse',
  'synthèse',
  'mémoire',
  'thèse',
  'proposition',
  'autre'
];

/**
 * Prompt système pour génération de métadonnées (structure MANIFEST exacte)
 */
const METADATA_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'analyse et la classification de documents académiques et techniques.

Ta mission : analyser un document et générer exactement 6 paramètres de métadonnées au format JSON strict avec ces champs EXACTS :

{
  "resume_court": "1-2 phrases maximum décrivant le contenu principal",
  "sujets": ["mot-clé1", "mot-clé2", "mot-clé3"],
  "type_document": "un des types de la liste fournie",
  "contexte_projet": ["nom_document1.pdf", "nom_document2.pdf"] (documents liés ou []),
  "utilite_principale": "description de l'usage concret et du contenu",
  "importance_relative": "faible|moyenne|élevée"
}

Règles strictes :
- resume_court : 1-2 phrases maximum
- sujets : tableau de mots-clés (3-5 max)
- type_document : choisir UNIQUEMENT parmi la liste fournie
- contexte_projet : noms de fichiers liés ou tableau vide []
- utilite_principale : usage concret + contenu du document
- importance_relative : faible/moyenne/élevée selon pertinence

Réponds UNIQUEMENT avec l'objet JSON, sans texte avant ou après.`;

/**
 * Génère les métadonnées pour un document
 * @param {string} docId - ID du document
 * @param {string} extractedText - Texte extrait du document
 * @param {string} filename - Nom du fichier
 * @returns {Promise<object>} - Métadonnées générées
 */
export async function generateDocumentMetadata(docId, extractedText, filename) {
  const doc = getDocument(docId);
  if (!doc) {
    addLog('error', `Document not found for metadata generation: ${docId}`);
    return null;
  }

  // Limiter le texte pour éviter de dépasser les limites de contexte
  const maxTextLength = 8000; // ~2000 tokens
  const truncatedText = extractedText.length > maxTextLength 
    ? extractedText.substring(0, maxTextLength) + '...'
    : extractedText;

  // Vérifier que le modèle est prêt
  if (!isModelReady('primary')) {
    addLog('warning', 'Modèle LLM non chargé, utilisation de placeholders pour métadonnées');
    return createPlaceholderMetadata(docId, filename);
  }

  const userPrompt = `Analyse ce document et génère les 6 paramètres MANIFEST :

Fichier : ${filename}
Types disponibles : ${DOCUMENT_TYPES.join(', ')}

Texte du document (extrait) :
${truncatedText}

Génère un objet JSON avec EXACTEMENT ces 6 champs :
{
  "resume_court": "1-2 phrases max sur le contenu",
  "sujets": ["mot-clé1", "mot-clé2"],
  "type_document": "type parmi la liste",
  "contexte_projet": ["nom_fichier1.pdf"] ou [],
  "utilite_principale": "usage concret + contenu",
  "importance_relative": "faible|moyenne|élevée"
}

Réponds UNIQUEMENT avec le JSON.`;

  try {
    const messages = [
      { role: 'system', content: METADATA_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    addLog('info', `Génération métadonnées pour ${filename}...`, { docId });

    let jsonResponse = '';
    const response = await generateCompletion(
      messages,
      { 
        temperature: 0.3, // Plus déterministe pour les métadonnées
        max_tokens: 500 
      },
      (token, full) => {
        jsonResponse = full;
      },
      'primary'
    );

    jsonResponse = response || jsonResponse;

    // Nettoyer la réponse (enlever markdown code blocks si présents)
    jsonResponse = jsonResponse.trim();
    if (jsonResponse.startsWith('```json')) {
      jsonResponse = jsonResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonResponse.startsWith('```')) {
      jsonResponse = jsonResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Parser le JSON
    let metadata;
    try {
      metadata = JSON.parse(jsonResponse);
    } catch (parseError) {
      addLog('warning', `Erreur parsing JSON métadonnées pour ${filename}, utilisation placeholders`, { 
        docId, 
        error: parseError.message,
        response: jsonResponse.substring(0, 200)
      });
      return createPlaceholderMetadata(docId, filename);
    }

    // Valider et normaliser les champs selon structure MANIFEST exacte
    const normalizedMetadata = {
      resume_court: metadata.resume_court || `Document ${filename}`,
      sujets: Array.isArray(metadata.sujets) ? metadata.sujets : [],
      type_document: metadata.type_document && DOCUMENT_TYPES.includes(metadata.type_document)
        ? metadata.type_document
        : 'autre',
      contexte_projet: Array.isArray(metadata.contexte_projet) ? metadata.contexte_projet : [],
      utilite_principale: metadata.utilite_principale || 'Utilité à déterminer',
      importance_relative: ['faible', 'moyenne', 'élevée'].includes(metadata.importance_relative)
        ? metadata.importance_relative
        : 'moyenne'
    };

    // Mettre à jour le state
    updateDocumentMetadata(docId, normalizedMetadata, 'ai');

    addLog('success', `Métadonnées générées pour ${filename}`, { docId });

    return normalizedMetadata;

  } catch (error) {
    addLog('error', `Erreur génération métadonnées pour ${filename}: ${error.message}`, { docId });
    return createPlaceholderMetadata(docId, filename);
  }
}

/**
 * Crée des métadonnées placeholder en cas d'erreur
 * @param {string} docId - ID du document
 * @param {string} filename - Nom du fichier
 * @returns {object} - Métadonnées placeholder
 */
async function createPlaceholderMetadata(docId, filename) {
  const placeholder = {
    resume_court: `Document ${filename} - Analyse en attente`,
    sujets: [],
    type_document: 'autre',
    contexte_projet: [],
    utilite_principale: 'Utilité à déterminer',
    importance_relative: 'moyenne'
  };

  // Mettre à jour le state avec placeholders
  await updateDocumentMetadata(docId, placeholder, 'user');

  return placeholder;
}

/**
 * Génère les métadonnées pour plusieurs documents en batch
 * @param {Array<string>} docIds - Liste des IDs de documents
 * @param {number} parallelLimit - Nombre de documents à traiter en parallèle (défaut: 4)
 * @param {Function} onProgress - Callback de progression (docId, progress)
 * @returns {Promise<Array>} - Liste des résultats
 */
export async function generateMetadataBatch(docIds, parallelLimit = 4, onProgress = null) {
  if (!Array.isArray(docIds) || docIds.length === 0) {
    return [];
  }

  addLog('info', `Génération métadonnées batch pour ${docIds.length} documents`, { 
    count: docIds.length 
  });

  const results = [];
  const total = docIds.length;

  // Traiter par chunks de `parallelLimit`
  for (let i = 0; i < docIds.length; i += parallelLimit) {
    const chunk = docIds.slice(i, i + parallelLimit);
    
    const chunkPromises = chunk.map(async (docId) => {
      const doc = getDocument(docId);
      if (!doc || !doc.extractedText) {
        if (onProgress) onProgress(docId, { status: 'skipped', reason: 'No extracted text' });
        return { docId, success: false, error: 'No extracted text' };
      }

      try {
        if (onProgress) onProgress(docId, { status: 'generating' });
        const metadata = await generateDocumentMetadata(docId, doc.extractedText, doc.filename);
        if (onProgress) onProgress(docId, { status: 'completed', metadata });
        return { docId, success: true, metadata };
      } catch (error) {
        if (onProgress) onProgress(docId, { status: 'error', error: error.message });
        return { docId, success: false, error: error.message };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    // Petit délai entre les chunks pour éviter la surcharge
    if (i + parallelLimit < docIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const successCount = results.filter(r => r.success).length;
  addLog('success', `Batch terminé: ${successCount}/${total} métadonnées générées`, { 
    success: successCount,
    total 
  });

  return results;
}

/**
 * Génère automatiquement les métadonnées pour un document après extraction
 * Appelé automatiquement après updateDocumentExtraction
 * @param {string} docId - ID du document
 */
export async function autoGenerateMetadata(docId) {
  const doc = getDocument(docId);
  if (!doc || !doc.extractedText || doc.status !== 'extracted') {
    return;
  }

  // Vérifier si les métadonnées ont déjà été générées
  if (doc.metadata && doc.metadata.generatedBy === 'ai' && doc.metadata.resume_court) {
    addLog('info', `Métadonnées déjà générées pour ${doc.filename}`, { docId });
    return;
  }

  // Générer en arrière-plan (ne pas bloquer)
  generateDocumentMetadata(docId, doc.extractedText, doc.filename).catch(error => {
    addLog('error', `Erreur génération auto métadonnées: ${error.message}`, { docId });
  });
}

/**
 * Module d'enrichissement des documents - Version optimisée
 * 1 appel IA par document avec modèle 3B
 */

import { state, updateDocumentMetadata, getDocument, addLog } from '../state/state.js';
import { generateCompletion } from '../llm/webllm.js';

// Prompt optimisé pour l'enrichissement
const ENRICHMENT_PROMPT = `Analyse ce document et fournis des métadonnées enrichies.

DOCUMENT: {filename}
TYPE: {type}
CONTENU: {content}

RÉPONDS UNIQUEMENT avec ce JSON exact :
{
  "topic_detaille": "Analyse approfondie structurée (300-500 mots avec sections)",
  "resume_executif": "Synthèse exécutive concise (100-150 mots)",
  "citations_cles": [
    {"citation": "extrait important", "contexte": "signification"}
  ]
}`;

export async function generateDocumentEnrichment(docId, extractedText, filename, existingMetadata = {}) {
  try {
    addLog('info', `Enrichissement de ${filename}...`);

    // Tronquer le texte pour éviter les timeouts
    const truncatedText = extractedText.substring(0, 4000);

    // Préparer le prompt
    const prompt = ENRICHMENT_PROMPT
      .replace('{filename}', filename)
      .replace('{type}', existingMetadata?.type_document || 'Non spécifié')
      .replace('{content}', truncatedText);

    // Appel IA avec le modèle principal (pour l'instant)
    const response = await generateCompletion([{
      role: 'user',
      content: prompt
    }], {
      temperature: 0.3,
      max_tokens: 800
    }, (token) => {
      // Callback optionnel pour streaming futur
    }, 'primary');

    // Parser le JSON
    let enrichmentData;
    try {
      const cleanedJson = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*$/g, '')
        .trim();

      enrichmentData = JSON.parse(cleanedJson);
    } catch (parseError) {
      addLog('warning', `Erreur parsing JSON pour ${filename}, utilisation des données brutes`);
      enrichmentData = {
        topic_detaille: response.substring(0, 500) || 'Analyse non disponible',
        resume_executif: 'Résumé non généré automatiquement',
        citations_cles: []
      };
    }

    // Normaliser les données
    const normalizedEnrichment = {
      topic_detaille: enrichmentData.topic_detaille || 'Analyse non disponible',
      resume_executif: enrichmentData.resume_executif || 'Résumé non disponible',
      citations_cles: Array.isArray(enrichmentData.citations_cles)
        ? enrichmentData.citations_cles.slice(0, 3)
        : []
    };

    // Sauvegarder
    const updatedMetadata = {
      ...existingMetadata,
      ...normalizedEnrichment,
      generatedBy: 'ai',
      generatedAt: new Date(),
      lastModified: new Date(),
      confidenceScore: 0.8
    };

    await updateDocumentMetadata(docId, updatedMetadata, 'ai');
    addLog('success', `Enrichissement terminé pour ${filename}`);

    return normalizedEnrichment;

  } catch (error) {
    addLog('error', `Erreur enrichissement ${filename}: ${error.message}`);

    // Fallback
    const fallback = {
      topic_detaille: 'Erreur lors de l\'analyse approfondie',
      resume_executif: 'Erreur lors de la génération du résumé',
      citations_cles: []
    };

    try {
      await updateDocumentMetadata(docId, {
        ...existingMetadata,
        ...fallback,
        generatedBy: 'error'
      }, 'error');
    } catch (saveError) {
      addLog('error', `Erreur sauvegarde fallback: ${saveError.message}`);
    }

    return fallback;
  }
}


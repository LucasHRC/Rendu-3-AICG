/**
 * Utilitaires pour générer des suggestions de noms de documents
 */

import { addLog } from '../state/state.js';

/**
 * Extrait les mots-clés principaux d'un texte
 * @param {string} text - Le texte à analyser
 * @param {number} maxKeywords - Nombre maximum de mots-clés
 * @returns {string[]} - Liste des mots-clés
 */
function extractKeywords(text, maxKeywords = 5) {
  // Nettoyer et tokenizer le texte
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3) // Mots de plus de 3 caractères
    .filter(word => !isStopWord(word)); // Exclure les mots vides

  // Compter la fréquence
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // Trier par fréquence et retourner les plus fréquents
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Vérifie si un mot est un mot vide (stop word)
 * @param {string} word - Le mot à vérifier
 * @returns {boolean} - true si c'est un stop word
 */
function isStopWord(word) {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'has', 'let', 'put', 'say', 'she', 'too', 'use',
    'dans', 'avec', 'pour', 'sur', 'par', 'des', 'les', 'une', 'qui', 'que', 'est', 'pas', 'plus', 'tout', 'faire', 'fait', 'être', 'deux', 'comme', 'mais', 'nous', 'vous', 'ils', 'leur', 'leurs'
  ]);
  return stopWords.has(word.toLowerCase());
}

/**
 * Génère des suggestions de noms pour un document
 * @param {string} text - Le contenu texte du document
 * @param {string} originalName - Le nom original du fichier
 * @returns {string[]} - Liste de 3 suggestions de noms maximum
 */
export function generateNameSuggestions(text, originalName) {
  const suggestions = [];

  try {
    // Suggestion 1: Extraire un titre potentiel du début du document
    const lines = text.split('\n').slice(0, 15); // Premières 15 lignes
    const titleCandidates = lines.filter(line =>
      line.length > 15 && // Assez long
      line.length < 100 && // Pas trop long
      !line.includes('http') && // Pas d'URL
      !line.match(/^\d+\./) && // Pas une liste numérotée
      !line.match(/^[A-Z\s]+:$/) && // Pas un header seul
      line.split(' ').length > 3 // Au moins 3 mots
    );

    if (titleCandidates.length > 0) {
      const titleSuggestion = titleCandidates[0]
        .replace(/[^\w\s\-_]/g, '') // Nettoyer la ponctuation
        .trim()
        .slice(0, 60); // Limiter la longueur

      if (titleSuggestion.length > 10) {
        suggestions.push(titleSuggestion);
      }
    }

    // Suggestion 2: Basée sur les mots-clés principaux
    const keywords = extractKeywords(text, 4);
    if (keywords.length >= 2) {
      const keywordSuggestion = keywords.slice(0, 3).join(' - ');
      if (keywordSuggestion.length > 10 && !suggestions.includes(keywordSuggestion)) {
        suggestions.push(keywordSuggestion);
      }
    }

    // Suggestion 3: Nom original nettoyé (toujours disponible)
    const cleanOriginal = originalName
      .replace(/\.pdf$/i, '') // Enlever l'extension
      .replace(/[^\w\s\-_]/g, ' ') // Nettoyer les caractères spéciaux
      .replace(/\s+/g, ' ') // Normaliser les espaces
      .trim()
      .slice(0, 50); // Limiter la longueur

    if (cleanOriginal && !suggestions.includes(cleanOriginal)) {
      suggestions.push(cleanOriginal);
    }

    // S'assurer qu'on a au moins une suggestion
    if (suggestions.length === 0) {
      suggestions.push(originalName.replace(/\.pdf$/i, ''));
    }

    // Limiter à 3 suggestions maximum
    return suggestions.slice(0, 3);

  } catch (error) {
    addLog('warning', `Erreur génération suggestions noms: ${error.message}`);
    // Fallback: retourner le nom original
    return [originalName.replace(/\.pdf$/i, '')];
  }
}

/**
 * Nettoie et normalise un nom de fichier
 * @param {string} filename - Le nom de fichier à nettoyer
 * @returns {string} - Le nom nettoyé
 */
export function cleanFilename(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[^\w\s\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

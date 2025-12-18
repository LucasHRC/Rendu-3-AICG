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
  const words = text
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëïîôùûüç]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 4) // Mots de plus de 4 caractères
    .filter(word => !isStopWord(word));

  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => capitalize(word));
}

/**
 * Capitalise la première lettre
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Vérifie si un mot est un stop word (inclut mots académiques génériques)
 */
function isStopWord(word) {
  const stopWords = new Set([
    // Anglais courant
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'did', 'let', 'put', 'say', 'she', 'too', 'use', 'been', 'have', 'this', 'that', 'with', 'from', 'they', 'will', 'would', 'could', 'should', 'which', 'there', 'their', 'what', 'when', 'where', 'about', 'into', 'more', 'some', 'than', 'them', 'then', 'these', 'only', 'other', 'also', 'such', 'very', 'just', 'over', 'most', 'even', 'after', 'before',
    // Français courant
    'dans', 'avec', 'pour', 'sur', 'par', 'des', 'les', 'une', 'qui', 'que', 'est', 'pas', 'plus', 'tout', 'faire', 'fait', 'être', 'deux', 'comme', 'mais', 'nous', 'vous', 'ils', 'leur', 'leurs', 'cette', 'sont', 'peut', 'aussi', 'bien', 'sans', 'avoir', 'entre', 'donc', 'autre', 'encore', 'alors', 'tous', 'elle', 'dont',
    // Mots académiques/génériques à exclure
    'page', 'pages', 'figure', 'figures', 'table', 'tables', 'section', 'sections', 'chapter', 'chapters', 'abstract', 'introduction', 'conclusion', 'conclusions', 'reference', 'references', 'document', 'documents', 'paper', 'papers', 'journal', 'article', 'articles', 'volume', 'number', 'issue', 'published', 'author', 'authors', 'university', 'research', 'study', 'studies', 'results', 'method', 'methods', 'analysis', 'data', 'based', 'using', 'used', 'show', 'shows', 'shown', 'present', 'presents', 'proposed', 'approach', 'model', 'models', 'system', 'systems', 'process', 'work', 'works', 'first', 'second', 'third', 'however', 'therefore', 'ainsi', 'notamment', 'permet', 'effet', 'partir', 'niveau', 'terme', 'selon', 'travers'
  ]);
  return stopWords.has(word.toLowerCase());
}

/**
 * Extrait le sujet depuis l'abstract ou l'introduction
 */
function extractFromAbstract(text) {
  // Chercher après "Abstract" ou "Résumé"
  const abstractMatch = text.match(/(?:abstract|résumé|summary)[:\s]*([^.]+\.)/i);
  if (abstractMatch && abstractMatch[1]) {
    const sentence = abstractMatch[1].trim();
    if (sentence.length > 20 && sentence.length < 200) {
      // Extraire les mots-clés de cette phrase
      const keywords = extractKeywords(sentence, 3);
      if (keywords.length >= 2) {
        return keywords.join(' - ');
      }
    }
  }
  return null;
}

/**
 * Génère des suggestions de noms pour un document
 * @param {string} text - Le contenu texte du document
 * @param {string} originalName - Le nom original du fichier
 * @returns {string[]} - Liste de 3 suggestions : courte (3 mots), moyenne (4-5 mots), longue (6-7 mots)
 */
export function generateNameSuggestions(text, originalName) {
  const suggestions = [];

  try {
    const keywords = extractKeywords(text, 8);
    
    // Suggestion 1 : Courte (3 mots max)
    if (keywords.length >= 3) {
      suggestions.push(keywords.slice(0, 3).join(' '));
    } else if (keywords.length >= 2) {
      suggestions.push(keywords.slice(0, 2).join(' '));
    }

    // Suggestion 2 : Moyenne (4-5 mots)
    if (keywords.length >= 5) {
      suggestions.push(keywords.slice(0, 5).join(' '));
    } else if (keywords.length >= 4) {
      suggestions.push(keywords.slice(0, 4).join(' '));
    }

    // Suggestion 3 : Longue (6-7 mots) - phrase descriptive
    const abstractSuggestion = extractFromAbstract(text);
    if (abstractSuggestion) {
      // Limiter à 7 mots
      const words = abstractSuggestion.split(/\s+/).slice(0, 7);
      suggestions.push(words.join(' '));
    } else if (keywords.length >= 6) {
      suggestions.push(keywords.slice(0, 7).join(' '));
    }

    // Fallback si pas assez de suggestions
    while (suggestions.length < 3) {
      const cleanOriginal = originalName
        .replace(/\.pdf$/i, '')
        .replace(/[^\w\sàâäéèêëïîôùûüç\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (!suggestions.includes(cleanOriginal)) {
        suggestions.push(cleanOriginal);
      } else {
        break;
      }
    }

    // Dédupliquer et limiter
    return [...new Set(suggestions)].slice(0, 3);

  } catch (error) {
    addLog('warning', `Erreur génération suggestions noms: ${error.message}`);
    return [originalName.replace(/\.pdf$/i, '')];
  }
}

/**
 * Nettoie et normalise un nom de fichier
 */
export function cleanFilename(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[^\w\sàâäéèêëïîôùûüç\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

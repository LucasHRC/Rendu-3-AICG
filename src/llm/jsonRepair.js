/**
 * JSON Repair - Répare les JSON cassés du LLM
 */

import { addLog } from '../state/state.js';

/**
 * Tente de réparer un JSON malformé
 * @param {string} jsonString - Chaîne JSON potentiellement cassée
 * @returns {object|null} - Objet parsé ou null si échec
 */
export function repairJSON(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return null;
  }

  // Nettoyer la chaîne
  let cleaned = jsonString.trim();
  
  // Extraire le JSON s'il est encapsulé dans du markdown
  cleaned = extractJSONFromMarkdown(cleaned);

  // Essai 1: Parse direct
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue avec les réparations
  }

  // Essai 2: Fermer les brackets/braces manquants
  try {
    const repaired = closeOpenBrackets(cleaned);
    return JSON.parse(repaired);
  } catch (e) {
    // Continue
  }

  // Essai 3: Corriger les virgules trailing
  try {
    const repaired = fixTrailingCommas(cleaned);
    return JSON.parse(repaired);
  } catch (e) {
    // Continue
  }

  // Essai 4: Corriger les quotes manquantes
  try {
    const repaired = fixQuotes(cleaned);
    return JSON.parse(repaired);
  } catch (e) {
    // Continue
  }

  // Essai 5: Combinaison de réparations
  try {
    let repaired = cleaned;
    repaired = fixQuotes(repaired);
    repaired = fixTrailingCommas(repaired);
    repaired = closeOpenBrackets(repaired);
    return JSON.parse(repaired);
  } catch (e) {
    addLog('warning', `Impossible de réparer le JSON: ${e.message}`);
    return null;
  }
}

/**
 * Extrait le JSON d'un bloc markdown ```json ... ```
 */
function extractJSONFromMarkdown(text) {
  // Pattern pour ```json ... ```
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  
  // Chercher le premier { ou [ et le dernier } ou ]
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start = firstBrace === -1 ? firstBracket : 
                firstBracket === -1 ? firstBrace : 
                Math.min(firstBrace, firstBracket);
  
  if (start === -1) return text;
  
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  
  if (end === -1 || end < start) return text;
  
  return text.substring(start, end + 1);
}

/**
 * Ferme les brackets et braces ouverts
 */
function closeOpenBrackets(text) {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') openBraces++;
    else if (char === '}') openBraces--;
    else if (char === '[') openBrackets++;
    else if (char === ']') openBrackets--;
  }

  // Fermer ce qui est ouvert
  let result = text;
  
  // Enlever la virgule trailing avant de fermer
  result = result.replace(/,\s*$/, '');
  
  while (openBrackets > 0) {
    result += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    result += '}';
    openBraces--;
  }

  return result;
}

/**
 * Corrige les virgules trailing (ex: [1, 2,] -> [1, 2])
 */
function fixTrailingCommas(text) {
  // Virgule avant ] ou }
  return text
    .replace(/,(\s*[\]}])/g, '$1')
    .replace(/,\s*$/g, '');
}

/**
 * Corrige les quotes manquantes autour des clés
 */
function fixQuotes(text) {
  // Ajouter des quotes autour des clés non quotées
  return text.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
}

/**
 * Tente d'extraire et parser un JSON partiel
 * Utile pour le streaming où le JSON arrive par morceaux
 */
export function parsePartialJSON(jsonString) {
  const repaired = repairJSON(jsonString);
  if (repaired) return repaired;
  
  // Tenter d'extraire des objets valides
  const objects = [];
  const objectPattern = /\{[^{}]*\}/g;
  let match;
  
  while ((match = objectPattern.exec(jsonString)) !== null) {
    try {
      objects.push(JSON.parse(match[0]));
    } catch (e) {
      // Ignorer les objets invalides
    }
  }
  
  return objects.length > 0 ? objects : null;
}

/**
 * Valide la structure d'un objet JSON selon un schéma minimal
 */
export function validateJSONStructure(obj, requiredKeys) {
  if (!obj || typeof obj !== 'object') return false;
  
  for (const key of requiredKeys) {
    if (!(key in obj)) {
      addLog('warning', `Clé manquante dans le JSON: ${key}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Crée un objet JSON par défaut si la réparation échoue
 */
export function createFallbackJSON(type) {
  const fallbacks = {
    heatmap: {
      heatmap: {
        themes: ['Theme 1', 'Theme 2'],
        documents: ['Document 1'],
        coverage: [[0.5, 0.5]]
      }
    },
    atlas: {
      nodes: [{ id: 'node1', label: 'Concept Principal', docIds: [] }],
      edges: []
    },
    timeline: {
      events: [{ date: new Date().getFullYear().toString(), title: 'Document analysé', docId: null, description: 'Analyse en cours' }],
      connections: []
    },
    scrolly: {
      sections: [{ type: 'intro', title: 'Introduction', text: 'Analyse en cours...', highlight: [] }]
    }
  };
  
  return fallbacks[type] || {};
}


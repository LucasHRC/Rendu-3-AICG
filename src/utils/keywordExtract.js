/**
 * Keyword Extraction - Extraction de mots-clés pour pré-traitement LLM
 */

import { state, addLog } from '../state/state.js';

// Stop words français + anglais + termes académiques génériques
const STOP_WORDS = new Set([
  // Français
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'mais', 'donc', 
  'car', 'ni', 'que', 'qui', 'quoi', 'dont', 'où', 'pour', 'par', 'sur', 'sous',
  'dans', 'avec', 'sans', 'entre', 'vers', 'chez', 'cette', 'ce', 'ces', 'cet',
  'son', 'sa', 'ses', 'leur', 'leurs', 'notre', 'nos', 'votre', 'vos', 'mon', 'ma',
  'mes', 'ton', 'ta', 'tes', 'être', 'avoir', 'faire', 'pouvoir', 'aller', 'voir',
  'vouloir', 'devoir', 'falloir', 'il', 'elle', 'ils', 'elles', 'on', 'nous', 'vous',
  'je', 'tu', 'lui', 'eux', 'aussi', 'bien', 'très', 'plus', 'moins', 'tout', 'tous',
  'toute', 'toutes', 'autre', 'autres', 'même', 'mêmes', 'chaque', 'quelque',
  // Anglais
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from',
  'by', 'on', 'off', 'for', 'in', 'out', 'over', 'to', 'into', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now',
  // Termes académiques génériques
  'paper', 'study', 'research', 'article', 'work', 'analysis', 'method', 'methods',
  'result', 'results', 'conclusion', 'conclusions', 'introduction', 'abstract',
  'figure', 'table', 'section', 'chapter', 'page', 'pages', 'reference', 'references',
  'author', 'authors', 'et', 'al', 'journal', 'volume', 'issue', 'number', 'year',
  'however', 'therefore', 'thus', 'hence', 'moreover', 'furthermore', 'although',
  'while', 'whereas', 'since', 'because', 'due', 'based', 'according', 'using',
  'propose', 'proposed', 'present', 'presented', 'show', 'shown', 'showed',
  'demonstrate', 'demonstrated', 'indicate', 'indicated', 'suggest', 'suggested'
]);

/**
 * Extrait les mots-clés d'un texte
 * @param {string} text - Texte source
 * @param {number} maxKeywords - Nombre max de mots-clés
 * @returns {string[]} - Liste de mots-clés
 */
export function extractKeywords(text, maxKeywords = 20) {
  if (!text || typeof text !== 'string') return [];

  // Tokenization basique
  const words = text
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëïîôùûüç-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !STOP_WORDS.has(word));

  // Comptage de fréquence
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  // Tri par fréquence et sélection des top N
  const sorted = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);

  return sorted;
}

/**
 * Extrait les n-grams (bi-grams, tri-grams) significatifs
 */
export function extractNGrams(text, n = 2, maxNGrams = 10) {
  if (!text || typeof text !== 'string') return [];

  const words = text
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëïîôùûüç-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));

  const ngrams = {};
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(' ');
    ngrams[ngram] = (ngrams[ngram] || 0) + 1;
  }

  return Object.entries(ngrams)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxNGrams)
    .map(([ngram]) => ngram);
}

/**
 * Extrait les concepts clés de tous les documents
 */
export function extractConceptsFromDocs() {
  const allKeywords = {};
  const docKeywords = {};

  state.chunks.forEach(chunk => {
    const keywords = extractKeywords(chunk.text, 10);
    const docId = chunk.docId;

    if (!docKeywords[docId]) {
      docKeywords[docId] = {};
    }

    keywords.forEach(kw => {
      allKeywords[kw] = (allKeywords[kw] || 0) + 1;
      docKeywords[docId][kw] = (docKeywords[docId][kw] || 0) + 1;
    });
  });

  // Concepts globaux triés
  const globalConcepts = Object.entries(allKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([concept, count]) => ({ concept, count }));

  // Concepts par document
  const perDocConcepts = {};
  Object.entries(docKeywords).forEach(([docId, keywords]) => {
    perDocConcepts[docId] = Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([concept, count]) => ({ concept, count }));
  });

  return { globalConcepts, perDocConcepts };
}

/**
 * Trouve les thèmes principaux en regroupant les mots-clés similaires
 */
export function identifyThemes(maxThemes = 5) {
  const { globalConcepts } = extractConceptsFromDocs();
  
  if (globalConcepts.length === 0) return [];

  // Groupement simple par préfixes communs ou co-occurrence
  const themes = [];
  const used = new Set();

  globalConcepts.forEach(({ concept }) => {
    if (used.has(concept)) return;

    // Trouver les concepts liés (même racine ou co-occurrence fréquente)
    const related = globalConcepts
      .filter(c => !used.has(c.concept) && areRelated(concept, c.concept))
      .map(c => c.concept);

    if (related.length >= 1 || themes.length < maxThemes) {
      themes.push({
        main: concept,
        related: related.slice(0, 5)
      });
      used.add(concept);
      related.forEach(r => used.add(r));
    }
  });

  return themes.slice(0, maxThemes);
}

/**
 * Vérifie si deux concepts sont liés (même racine ou très similaires)
 */
function areRelated(a, b) {
  if (a === b) return false;
  
  // Même préfixe (>= 5 chars)
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 5) {
    const prefix = Math.floor(minLen * 0.6);
    if (a.substring(0, prefix) === b.substring(0, prefix)) {
      return true;
    }
  }

  // Distance de Levenshtein simple (pour mots très proches)
  if (Math.abs(a.length - b.length) <= 2 && levenshteinDistance(a, b) <= 2) {
    return true;
  }

  return false;
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Prépare le contexte de mots-clés pour le LLM
 */
export function prepareKeywordsContext() {
  const { globalConcepts, perDocConcepts } = extractConceptsFromDocs();
  const themes = identifyThemes();

  // Récupérer les noms des documents
  const docNames = {};
  state.docs.forEach(doc => {
    docNames[doc.id] = doc.displayName || doc.filename.replace(/\.pdf$/i, '');
  });

  return {
    globalConcepts: globalConcepts.map(c => c.concept),
    themes: themes.map(t => ({ main: t.main, related: t.related })),
    perDocument: Object.entries(perDocConcepts).map(([docId, concepts]) => ({
      docId,
      docName: docNames[docId] || docId,
      concepts: concepts.map(c => c.concept)
    }))
  };
}

// Patterns pour détecter les phrases assertives (claims)
const CLAIM_PATTERNS = [
  /^(?:we|this|the|our|these)\s+(?:show|demonstrate|prove|find|conclude|argue|suggest|propose|confirm|reveal|establish)\s+that\s+(.+)/i,
  /^(?:it|this)\s+(?:is|was|has been)\s+(?:shown|demonstrated|proven|found|concluded|established)\s+that\s+(.+)/i,
  /^(?:results|findings|data|evidence|analysis)\s+(?:show|indicate|suggest|demonstrate|reveal|confirm)\s+(?:that\s+)?(.+)/i,
  /^(?:according to|based on)\s+(?:our|the|this)\s+(?:results|findings|analysis|data),?\s+(.+)/i,
  /^there\s+is\s+(?:evidence|proof|indication)\s+that\s+(.+)/i,
  /^(?:nous|cette|les|notre)\s+(?:montrons|démontrons|prouvons|concluons|suggérons|proposons)\s+que\s+(.+)/i,
  /^(?:il|cela)\s+(?:est|a été)\s+(?:montré|démontré|prouvé|établi)\s+que\s+(.+)/i,
  /^(?:les résultats|l'analyse|les données)\s+(?:montrent|indiquent|suggèrent|révèlent)\s+que\s+(.+)/i
];

/**
 * Extrait les claims (affirmations) d'un texte
 * @param {string} text - Texte source
 * @param {number} maxClaims - Nombre max de claims
 * @returns {string[]} - Liste de claims extraits
 */
export function extractClaims(text, maxClaims = 5) {
  if (!text || typeof text !== 'string') return [];

  const claims = [];
  
  // Découper en phrases
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length >= 30 && s.length <= 300);

  for (const sentence of sentences) {
    if (claims.length >= maxClaims) break;

    // Vérifier si la phrase correspond à un pattern de claim
    for (const pattern of CLAIM_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) {
        claims.push(sentence.trim());
        break;
      }
    }

    // Heuristique supplémentaire: phrases avec indicateurs de certitude
    if (claims.length < maxClaims && !claims.includes(sentence)) {
      const certaintyIndicators = [
        'significantly', 'importantly', 'crucially', 'notably',
        'clearly', 'evidently', 'therefore', 'consequently',
        'significativement', 'clairement', 'donc', 'par conséquent'
      ];
      
      const lowerSentence = sentence.toLowerCase();
      if (certaintyIndicators.some(ind => lowerSentence.includes(ind))) {
        claims.push(sentence.trim());
      }
    }
  }

  return claims.slice(0, maxClaims);
}

/**
 * Normalise un texte pour comparaison
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


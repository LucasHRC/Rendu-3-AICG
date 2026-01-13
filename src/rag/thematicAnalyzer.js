/**
 * Analyse de cohérence thématique entre documents
 * Détermine si les documents sont liés (thématique) ou indépendants (portfolio)
 */

/**
 * Extrait les mots-clés d'un texte
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Mots-clés scientifiques communs (à enrichir)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can']);
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
  
  // Compter les occurrences
  const wordCounts = new Map();
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });
  
  // Retourner les top mots
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

/**
 * Trouve les mots-clés communs entre documents
 */
function findCommonKeywords(allKeywords, threshold = 0.4) {
  if (allKeywords.length === 0) return [];
  
  const keywordSets = allKeywords.map(kw => new Set(kw));
  const allUniqueKeywords = new Set(allKeywords.flat());
  
  const common = [];
  
  allUniqueKeywords.forEach(keyword => {
    let count = 0;
    keywordSets.forEach(keywordSet => {
      if (keywordSet.has(keyword)) count++;
    });
    
    const ratio = count / allKeywords.length;
    if (ratio >= threshold) {
      common.push({
        keyword,
        frequency: ratio,
        documentCount: count
      });
    }
  });
  
  return common.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Trouve les chevauchements dans les méthodologies
 */
function findOverlap(methodologies) {
  if (methodologies.length === 0) return [];
  
  const methodStrings = methodologies.map(m => 
    typeof m === 'string' ? m.toLowerCase() : ''
  ).filter(m => m.length > 0);
  
  // Extraire les mots-clés méthodologiques
  const methodKeywords = methodStrings.map(m => extractKeywords(m));
  return findCommonKeywords(methodKeywords, 0.3);
}

/**
 * Identifie les divergences entre documents
 */
function identifyDivergences(documentAnalyses) {
  const divergences = [];
  
  // Comparer les domaines
  const domains = documentAnalyses.map(d => d.parsed?.basic_info?.domain || 'NOT_FOUND');
  const uniqueDomains = new Set(domains.filter(d => d !== 'NOT_FOUND'));
  
  if (uniqueDomains.size > 2) {
    divergences.push({
      type: 'domain_diversity',
      message: `Documents couvrent ${uniqueDomains.size} domaines différents`,
      domains: Array.from(uniqueDomains)
    });
  }
  
  // Comparer les années (si disponibles)
  const years = documentAnalyses
    .map(d => d.parsed?.basic_info?.year)
    .filter(y => y && y !== 'NOT_FOUND' && typeof y === 'number');
  
  if (years.length > 1) {
    const yearRange = Math.max(...years) - Math.min(...years);
    if (yearRange > 10) {
      divergences.push({
        type: 'temporal_gap',
        message: `Écart temporel de ${yearRange} ans entre documents`,
        range: [Math.min(...years), Math.max(...years)]
      });
    }
  }
  
  return divergences;
}

/**
 * Calcule le score de cohésion thématique
 */
function calculateCohesionScore(factors) {
  let score = 0;
  
  // Domaine similaire (0-0.4)
  if (factors.domainSimilarity) {
    score += 0.4;
  } else if (factors.domainCount <= 3) {
    score += 0.2; // Domaines proches
  }
  
  // Mots-clés communs (0-0.3)
  if (factors.commonKeywordsCount >= 5) {
    score += 0.3;
  } else if (factors.commonKeywordsCount >= 3) {
    score += 0.15;
  } else if (factors.commonKeywordsCount >= 1) {
    score += 0.05;
  }
  
  // Méthodologies similaires (0-0.2)
  if (factors.methodologySimilarity) {
    score += 0.2;
  } else if (factors.methodologyOverlap > 0) {
    score += 0.1;
  }
  
  // Cohérence temporelle (0-0.1)
  if (factors.temporalCoherence) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0);
}

/**
 * Analyse la cohérence thématique entre documents
 */
export function analyzeThematicCohesion(documentAnalyses) {
  if (!documentAnalyses || documentAnalyses.length === 0) {
    return {
      isCoherent: false,
      score: 0,
      commonThemes: [],
      commonMethods: [],
      divergences: [],
      recommendation: 'portfolio'
    };
  }

  // 1. Extraire domaines scientifiques
  const domains = documentAnalyses.map(d => d.parsed?.basic_info?.domain || 'NOT_FOUND');
  const uniqueDomains = new Set(domains.filter(d => d !== 'NOT_FOUND'));
  const domainCount = uniqueDomains.size;
  
  // 2. Analyser mots-clés communs dans research_question
  const researchQuestions = documentAnalyses
    .map(d => {
      // Support ancien format (scientific_content) et nouveau format (research_content)
      const content = d.parsed?.research_content || d.parsed?.scientific_content || {};
      return content.research_question || content.research_problem || '';
    })
    .filter(q => q && q !== 'NOT_FOUND' && q !== 'UNKNOWN');
  
  const keywords = researchQuestions.map(q => extractKeywords(q));
  const commonKeywords = findCommonKeywords(keywords, 0.4);
  
  // 3. Détecter méthodologies similaires
  const methodologies = documentAnalyses.flatMap(d => {
    const content = d.parsed?.research_content || d.parsed?.scientific_content || {};
    const method = content.methodology || [];
    // Support string ou array
    return Array.isArray(method) ? method : (typeof method === 'string' ? [method] : []);
  });
  const commonMethods = findOverlap(methodologies);
  
  // 4. Cohérence temporelle
  const years = documentAnalyses
    .map(d => d.parsed?.basic_info?.year)
    .filter(y => y && y !== 'NOT_FOUND' && typeof y === 'number');
  
  const temporalCoherence = years.length > 1 
    ? (Math.max(...years) - Math.min(...years)) <= 5
    : true;
  
  // 5. Calculer score de cohésion
  const cohesionScore = calculateCohesionScore({
    domainSimilarity: domainCount <= 2,
    domainCount: domainCount,
    commonKeywordsCount: commonKeywords.length,
    methodologySimilarity: commonMethods.length > 0,
    methodologyOverlap: commonMethods.length,
    temporalCoherence: temporalCoherence
  });
  
  // 6. Identifier divergences
  const divergences = identifyDivergences(documentAnalyses);
  
  return {
    isCoherent: cohesionScore > 0.6,
    score: cohesionScore,
    commonThemes: commonKeywords.map(k => k.keyword),
    commonMethods: commonMethods.map(m => m.keyword),
    divergences: divergences,
    recommendation: cohesionScore > 0.6 ? 'thematic' : 'portfolio',
    domainCount: domainCount,
    uniqueDomains: Array.from(uniqueDomains)
  };
}

/**
 * Validation multi-niveaux de l'intégrité académique
 */

/**
 * Valide les informations de base d'un document
 */
function validateBasicInfo(basicInfo) {
  if (!basicInfo) return false;
  
  const hasTitle = basicInfo.title && basicInfo.title !== 'NOT_FOUND' && basicInfo.title !== 'UNKNOWN';
  const hasYear = basicInfo.year && basicInfo.year !== 'NOT_FOUND' && basicInfo.year !== 'UNKNOWN';
  const hasAuthors = Array.isArray(basicInfo.authors) && basicInfo.authors.length > 0;
  const hasDomain = basicInfo.domain && basicInfo.domain !== 'NOT_FOUND' && basicInfo.domain !== 'UNKNOWN';
  
  return hasTitle || hasYear || hasAuthors || hasDomain; // Au moins un champ valide
}

/**
 * Valide le contenu de recherche
 */
function validateResearchContent(researchContent) {
  if (!researchContent) return false;
  
  const hasQuestion = researchContent.research_question && 
    researchContent.research_question !== 'NOT_FOUND' && 
    researchContent.research_question !== 'UNKNOWN';
  
  const hasMethodology = Array.isArray(researchContent.methodology) && 
    researchContent.methodology.length > 0;
  
  const hasResults = Array.isArray(researchContent.key_results) && 
    researchContent.key_results.length > 0;
  
  return hasQuestion || hasMethodology || hasResults;
}

/**
 * Valide le scope et assumptions
 */
function validateScope(scope) {
  if (!scope) return false;
  
  const hasCovered = Array.isArray(scope.covered) && scope.covered.length > 0;
  const hasNotCovered = Array.isArray(scope.not_covered);
  const hasAssumptions = Array.isArray(scope.assumptions);
  
  return hasCovered || hasNotCovered || hasAssumptions;
}

/**
 * Valide les confidence flags
 */
function validateConfidence(flags) {
  if (!flags) return false;
  
  return typeof flags.has_numbers === 'boolean' || 
         typeof flags.has_limitations === 'boolean' ||
         typeof flags.extraction_quality === 'string';
}

/**
 * Génère des warnings basés sur les checks
 */
function generateWarnings(checks, data) {
  const warnings = [];
  
  if (!checks.hasBasicInfo) {
    warnings.push('Métadonnées de base incomplètes (titre, auteurs, année)');
  }
  
  if (!checks.hasResearchContent) {
    warnings.push('Contenu scientifique manquant ou incomplet');
  }
  
  if (!checks.hasNumbersMetrics) {
    warnings.push('Aucune métrique numérique extraite');
  }
  
  if (!checks.hasCitationsUsed) {
    warnings.push('Aucune citation de chunk enregistrée');
  }
  
  if (data.confidence_flags?.extraction_quality === 'low') {
    warnings.push('Qualité d\'extraction faible - beaucoup d\'informations manquantes');
  }
  
  return warnings;
}

/**
 * Valide l'analyse d'un document
 */
export function validateDocumentAnalysis(jsonString, expectedDocId) {
  try {
    const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    
    const checks = {
      hasDocId: data.doc_id === expectedDocId,
      hasBasicInfo: validateBasicInfo(data.basic_info),
      hasResearchContent: validateResearchContent(data.research_content),
      hasNumbersMetrics: Array.isArray(data.numbers_and_metrics),
      hasCitationsUsed: Array.isArray(data.citations_used) && data.citations_used.length > 0,
      hasScopeAssumptions: validateScope(data.scope_and_assumptions),
      hasConfidenceFlags: validateConfidence(data.confidence_flags)
    };
    
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const quality = passedChecks / totalChecks;
    
    return {
      isValid: passedChecks >= 5, // Minimum 5/7 checks
      quality: quality > 0.8 ? 'high' : quality > 0.5 ? 'medium' : 'low',
      checks,
      warnings: generateWarnings(checks, data)
    };
  } catch (e) {
    return {
      isValid: false,
      quality: 'low',
      error: `JSON parse error: ${e.message}`,
      checks: {},
      warnings: [`Erreur de parsing JSON: ${e.message}`]
    };
  }
}

/**
 * Vérifie si une référence de chunk est valide
 */
export function isValidChunkReference(citation, documentAnalysis) {
  if (!documentAnalysis || !documentAnalysis.parsed) return false;
  
  const citationsUsed = documentAnalysis.parsed.citations_used || [];
  return citationsUsed.some(c => c.chunk_id === citation.chunkId);
}

/**
 * Groupe les citations par document
 */
export function groupCitationsByDoc(citations) {
  const groups = new Map();
  
  citations.forEach(citation => {
    if (!groups.has(citation.docIndex)) {
      groups.set(citation.docIndex, []);
    }
    groups.get(citation.docIndex).push(citation);
  });
  
  return groups;
}

/**
 * Génère des warnings de validation pour la revue finale
 */
function generateValidationWarnings(metrics) {
  const warnings = [];
  
  if (metrics.citationCoverage < 0.7) {
    warnings.push(`Couverture de citations faible: ${(metrics.citationCoverage * 100).toFixed(0)}% des paragraphes ont des citations`);
  }
  
  if (metrics.invalidCitations > 0) {
    warnings.push(`${metrics.invalidCitations} citation(s) invalide(s) détectée(s)`);
  }
  
  if (metrics.uncitedDocs > 0) {
    warnings.push(`${metrics.uncitedDocs} document(s) non cité(s) dans la revue`);
  }
  
  if (metrics.uncitedNumbers > 0) {
    warnings.push(`${metrics.uncitedNumbers} nombre(s) sans citation détecté(s)`);
  }
  
  return warnings;
}

/**
 * Valide la revue finale
 */
export function validateFinalReview(reviewText, documentAnalyses, citationManager) {
  if (!reviewText || !documentAnalyses || !citationManager) {
    return {
      isValid: false,
      quality: 'low',
      metrics: {},
      warnings: ['Données de validation manquantes']
    };
  }
  
  const citations = citationManager.extractAllCitations(reviewText);
  
  // Check 1: Présence de citations
  const paragraphs = reviewText.split('\n\n').filter(p => p.length > 100);
  const paragraphsWithCitations = paragraphs.filter(p => 
    /\[Doc\d+\s*•\s*p\d+\s*•\s*chunk_\d+\]/.test(p)
  );
  const citationCoverage = paragraphs.length > 0 
    ? paragraphsWithCitations.length / paragraphs.length 
    : 0;
  
  // Check 2: Validité des références
  const invalidCitations = citations.filter(c => {
    if (c.docIndex > documentAnalyses.length) return true;
    const docAnalysis = documentAnalyses[c.docIndex - 1];
    return !isValidChunkReference(c, docAnalysis);
  });
  
  // Check 3: Distribution des citations
  const citationsByDoc = groupCitationsByDoc(citations);
  const uncitedDocs = documentAnalyses
    .map((_, idx) => idx + 1)
    .filter(docIdx => !citationsByDoc.has(docIdx));
  
  // Check 4: Chiffres sans citations
  const numbersRegex = /\d+[.,]?\d*\s*(σ|%|km|m|s|kg|Hz|eV|GeV|±|×|×10)/g;
  const numbersInText = [...reviewText.matchAll(numbersRegex)];
  const uncitedNumbers = numbersInText.filter(match => {
    const context = reviewText.slice(Math.max(0, match.index - 200), match.index + 200);
    return !/\[Doc\d+/.test(context);
  });
  
  const metrics = {
    citationCoverage,
    totalCitations: citations.length,
    invalidCitations: invalidCitations.length,
    uncitedDocs: uncitedDocs.length,
    uncitedNumbers: uncitedNumbers.length
  };
  
  return {
    isValid: citationCoverage > 0.7 && invalidCitations.length === 0,
    quality: citationCoverage > 0.8 ? 'high' : citationCoverage > 0.6 ? 'medium' : 'low',
    metrics,
    warnings: generateValidationWarnings(metrics)
  };
}

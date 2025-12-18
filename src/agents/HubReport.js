/**
 * HubReport - Structure de données et validation pour le dashboard analytique
 */

// Mapping des icônes sémantiques vers Heroicons SVG paths
export const SEMANTIC_ICONS = {
  // Themes types
  concept: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />`,
  method: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />`,
  application: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />`,
  background: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />`,
  
  // Status indicators
  ok: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />`,
  warning: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`,
  gap: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />`,
  
  // General icons
  layers: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />`,
  network: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />`,
  alert: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`,
  document: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />`,
  chart: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />`,
  search: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />`
};

/**
 * Crée un hubReport vide avec la structure complète
 */
export function createEmptyHubReport() {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      context: '',
      documentCount: 0,
      chunkCount: 0
    },
    themes: [],
    coverage: {
      matrix: [],
      documents: [],
      globalScore: 0,
      gaps: [],
      dominant: null
    },
    claims: [],
    contradictions: [],
    quality: {
      citationCoverage: 0,
      duplicateChunks: 0,
      lowSignalChunks: 0,
      contradictionsFound: 0,
      retrievalBias: null
    }
  };
}

/**
 * Valide la structure d'un hubReport
 * @param {object} obj - Objet à valider
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateHubReport(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['hubReport must be an object'] };
  }

  // Meta
  if (!obj.meta) {
    errors.push('Missing meta section');
  } else {
    if (!obj.meta.generatedAt) errors.push('Missing meta.generatedAt');
    if (typeof obj.meta.documentCount !== 'number') errors.push('meta.documentCount must be a number');
  }

  // Themes
  if (!Array.isArray(obj.themes)) {
    errors.push('themes must be an array');
  } else {
    obj.themes.forEach((theme, i) => {
      if (!theme.id) errors.push(`themes[${i}] missing id`);
      if (!theme.label) errors.push(`themes[${i}] missing label`);
      if (!['concept', 'method', 'application', 'background'].includes(theme.type)) {
        errors.push(`themes[${i}] invalid type: ${theme.type}`);
      }
      if (!['ok', 'warning', 'gap'].includes(theme.status)) {
        errors.push(`themes[${i}] invalid status: ${theme.status}`);
      }
    });
  }

  // Coverage
  if (!obj.coverage) {
    errors.push('Missing coverage section');
  } else {
    if (!Array.isArray(obj.coverage.matrix)) errors.push('coverage.matrix must be an array');
    if (typeof obj.coverage.globalScore !== 'number') errors.push('coverage.globalScore must be a number');
  }

  // Claims
  if (!Array.isArray(obj.claims)) {
    errors.push('claims must be an array');
  } else {
    obj.claims.forEach((claim, i) => {
      if (!claim.id) errors.push(`claims[${i}] missing id`);
      if (!claim.text) errors.push(`claims[${i}] missing text`);
      if (typeof claim.support !== 'number') errors.push(`claims[${i}] support must be a number`);
    });
  }

  // Quality
  if (!obj.quality) {
    errors.push('Missing quality section');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Renvoie le SVG d'une icône sémantique
 * @param {string} iconName - Nom de l'icône
 * @param {string} className - Classes CSS additionnelles
 */
export function getSemanticIcon(iconName, className = 'w-5 h-5') {
  const path = SEMANTIC_ICONS[iconName] || SEMANTIC_ICONS.document;
  return `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${path}</svg>`;
}

/**
 * Calcule les métriques de qualité à partir des données
 */
export function computeQualityMetrics(claims, chunks, contradictions) {
  const claimsWithSources = claims.filter(c => c.sources && c.sources.length > 0);
  const citationCoverage = claims.length > 0 ? claimsWithSources.length / claims.length : 0;

  // Détection duplicates simples (même texte)
  const textSet = new Set();
  let duplicateChunks = 0;
  chunks.forEach(chunk => {
    const normalized = chunk.text.toLowerCase().trim().substring(0, 100);
    if (textSet.has(normalized)) {
      duplicateChunks++;
    } else {
      textSet.add(normalized);
    }
  });

  // Low signal: chunks très courts
  const lowSignalChunks = chunks.filter(c => c.text.length < 100).length;

  return {
    citationCoverage: Math.round(citationCoverage * 100) / 100,
    duplicateChunks,
    lowSignalChunks,
    contradictionsFound: contradictions.length,
    retrievalBias: null
  };
}

/**
 * Détecte le document dominant dans la couverture
 */
export function detectDominantDocument(coverage, documents) {
  if (!coverage.matrix || coverage.matrix.length === 0) return null;

  const docScores = coverage.matrix.map((row, i) => ({
    docId: documents[i]?.id || `doc-${i}`,
    docName: documents[i]?.name || `Document ${i + 1}`,
    avgScore: row.reduce((sum, val) => sum + val, 0) / row.length
  }));

  docScores.sort((a, b) => b.avgScore - a.avgScore);

  // Dominant si score > 1.5x la moyenne
  const avgAll = docScores.reduce((sum, d) => sum + d.avgScore, 0) / docScores.length;
  if (docScores[0].avgScore > avgAll * 1.5) {
    return docScores[0];
  }

  return null;
}

/**
 * Identifie les gaps thématiques
 */
export function detectThemeGaps(themes, coverage) {
  const gaps = [];

  themes.forEach((theme, i) => {
    // Score moyen pour ce thème sur tous les docs
    let themeAvg = 0;
    if (coverage.matrix.length > 0) {
      themeAvg = coverage.matrix.reduce((sum, row) => sum + (row[i] || 0), 0) / coverage.matrix.length;
    }

    if (themeAvg < 0.3) {
      gaps.push(theme.id);
      theme.status = 'gap';
    } else if (themeAvg < 0.5) {
      theme.status = 'warning';
    } else {
      theme.status = 'ok';
    }
  });

  return gaps;
}


/**
 * NarrativeReport - Schema de donnees pour le Narrative Agent
 * Structure hierarchique pour navigation drill-down
 */

/**
 * @typedef {Object} EvidenceRef
 * @property {string} chunk_id - ID du chunk source
 * @property {string} excerpt - Extrait (100-400 chars)
 * @property {string} doc_title - Titre du document
 * @property {string} [section] - Section du document
 * @property {number} [page] - Numero de page
 * @property {number} relevance - Score de pertinence 0..1
 */

/**
 * @typedef {Object} EvidenceQuote
 * @property {string} quote - Citation litterale
 * @property {Object} source
 * @property {string} source.doc_title
 * @property {number} [source.page]
 * @property {string} [source.section]
 * @property {string} source.chunk_id
 */

/**
 * @typedef {Object} KeyPoint
 * @property {string} id - ID unique
 * @property {string} label - Titre court
 * @property {string} explanation - Explication (1-3 phrases)
 * @property {EvidenceRef[]} evidence - 1-3 references
 * @property {string[]} tags - Tags thematiques
 * @property {number} confidence - Score de confiance 0..1
 * @property {string} type - definition|method|example|limitation|key_point
 */

/**
 * @typedef {Object} OutlineNode
 * @property {string} id - ID unique
 * @property {string} title - Titre de la section
 * @property {number} level - Niveau 1..4
 * @property {string} summary - Resume court (1-2 phrases)
 * @property {OutlineNode[]} [children] - Sous-sections
 * @property {EvidenceRef[]} evidence - 1-3 chunks sources
 * @property {boolean} expanded - Etat d'expansion UI
 */

/**
 * @typedef {Object} DocumentSummary
 * @property {string} one_liner - Resume en une ligne
 * @property {string} abstract - Resume (8-12 lignes)
 * @property {KeyPoint[]} key_points - 5-10 points cles
 * @property {KeyPoint[]} definitions - 0-8 definitions
 * @property {KeyPoint[]} methods_or_frameworks - 0-8 methodes
 * @property {KeyPoint[]} examples - 0-8 exemples
 * @property {KeyPoint[]} limitations - 0-8 limites
 * @property {EvidenceQuote[]} recommended_quotes - 3-8 citations fortes
 */

/**
 * @typedef {Object} DocumentNarrative
 * @property {string} doc_id - ID du document
 * @property {string} doc_title - Titre du document
 * @property {Object} [doc_meta] - Metadonnees
 * @property {string} [doc_meta.author]
 * @property {string} [doc_meta.date]
 * @property {string} [doc_meta.type]
 * @property {DocumentSummary} doc_summary - Resume structure
 * @property {OutlineNode[]} outline - Structure semantique
 * @property {Object} stats
 * @property {number} stats.coverage_score - 0..1
 * @property {number} stats.importance_score - 0..1
 */

/**
 * @typedef {Object} CrossItem
 * @property {string} id - ID unique
 * @property {string} label - Titre
 * @property {string} explanation - Explication
 * @property {string[]} involved_docs - Documents concernes
 * @property {EvidenceRef[]} evidence - Preuves
 */

/**
 * @typedef {Object} ExecutiveSummary
 * @property {string} title - Titre du rapport
 * @property {string} summary - Resume global (10-15 lignes)
 * @property {string[]} key_takeaways - 5-8 points cles
 * @property {string[]} open_questions - 3-6 questions ouvertes
 * @property {string[]} recommended_next_steps - 3-6 actions
 */

/**
 * @typedef {Object} NarrativeReport
 * @property {string} generated_at - Timestamp ISO
 * @property {Object} corpus
 * @property {number} corpus.doc_count
 * @property {number} corpus.chunk_count
 * @property {string} corpus.language - fr|en
 * @property {Array<{label: string, score: number}>} corpus.top_themes
 * @property {ExecutiveSummary} executive_summary
 * @property {DocumentNarrative[]} documents
 * @property {Object} cross_doc
 * @property {CrossItem[]} cross_doc.agreements - Convergences
 * @property {CrossItem[]} cross_doc.tensions - Divergences
 * @property {CrossItem[]} cross_doc.gaps - Lacunes
 */

/**
 * Cree un rapport vide
 * @returns {NarrativeReport}
 */
export function createEmptyNarrativeReport() {
  return {
    generated_at: new Date().toISOString(),
    corpus: {
      doc_count: 0,
      chunk_count: 0,
      language: 'fr',
      top_themes: []
    },
    executive_summary: {
      title: 'Rapport Narratif',
      summary: '',
      key_takeaways: [],
      open_questions: [],
      recommended_next_steps: []
    },
    documents: [],
    cross_doc: {
      agreements: [],
      tensions: [],
      gaps: []
    }
  };
}

/**
 * Cree un DocumentNarrative vide
 * @param {string} docId
 * @param {string} docTitle
 * @returns {DocumentNarrative}
 */
export function createEmptyDocumentNarrative(docId, docTitle) {
  return {
    doc_id: docId,
    doc_title: docTitle,
    doc_meta: {},
    doc_summary: {
      one_liner: '',
      abstract: '',
      key_points: [],
      definitions: [],
      methods_or_frameworks: [],
      examples: [],
      limitations: [],
      recommended_quotes: []
    },
    outline: [],
    stats: {
      coverage_score: 0,
      importance_score: 0
    }
  };
}

/**
 * Cree un OutlineNode
 * @param {string} id
 * @param {string} title
 * @param {number} level
 * @param {string} summary
 * @returns {OutlineNode}
 */
export function createOutlineNode(id, title, level, summary = '') {
  return {
    id,
    title,
    level,
    summary,
    children: [],
    evidence: [],
    expanded: level === 1
  };
}

/**
 * Cree un KeyPoint
 * @param {string} label
 * @param {string} explanation
 * @param {string} type
 * @returns {KeyPoint}
 */
export function createKeyPoint(label, explanation, type = 'key_point') {
  return {
    id: `kp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    label,
    explanation,
    evidence: [],
    tags: [],
    confidence: 0.5,
    type
  };
}

/**
 * Cree une EvidenceRef
 * @param {string} chunkId
 * @param {string} excerpt
 * @param {string} docTitle
 * @returns {EvidenceRef}
 */
export function createEvidenceRef(chunkId, excerpt, docTitle) {
  return {
    chunk_id: chunkId,
    excerpt: excerpt.substring(0, 400),
    doc_title: docTitle,
    section: null,
    page: null,
    relevance: 0.5
  };
}

/**
 * Valide un NarrativeReport
 * @param {NarrativeReport} report
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateNarrativeReport(report) {
  const errors = [];

  if (!report) {
    return { valid: false, errors: ['Report is null'] };
  }

  if (!report.generated_at) errors.push('Missing generated_at');
  if (!report.corpus) errors.push('Missing corpus');
  if (!report.executive_summary) errors.push('Missing executive_summary');
  if (!Array.isArray(report.documents)) errors.push('documents must be array');

  // Valider chaque document
  report.documents?.forEach((doc, i) => {
    if (!doc.doc_id) errors.push(`Document ${i}: missing doc_id`);
    if (!doc.doc_title) errors.push(`Document ${i}: missing doc_title`);
    if (!doc.outline || !Array.isArray(doc.outline)) {
      errors.push(`Document ${i}: outline must be array`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Trouve un node dans l'outline par ID (recursif)
 * @param {OutlineNode[]} nodes
 * @param {string} nodeId
 * @returns {OutlineNode|null}
 */
export function findOutlineNode(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children?.length > 0) {
      const found = findOutlineNode(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Calcule le chemin breadcrumb vers un node
 * @param {OutlineNode[]} nodes
 * @param {string} nodeId
 * @param {string[]} path
 * @returns {string[]}
 */
export function getNodePath(nodes, nodeId, path = []) {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return [...path, node.title];
    }
    if (node.children?.length > 0) {
      const found = getNodePath(node.children, nodeId, [...path, node.title]);
      if (found.length > path.length + 1) return found;
    }
  }
  return path;
}

/**
 * Compte tous les nodes dans l'outline
 * @param {OutlineNode[]} nodes
 * @returns {number}
 */
export function countOutlineNodes(nodes) {
  let count = nodes.length;
  for (const node of nodes) {
    if (node.children?.length > 0) {
      count += countOutlineNodes(node.children);
    }
  }
  return count;
}

/**
 * Exporte le rapport en Markdown
 * @param {NarrativeReport} report
 * @returns {string}
 */
export function exportToMarkdown(report) {
  const lines = [];
  
  // Titre
  lines.push(`# ${report.executive_summary.title}`);
  lines.push('');
  lines.push(`*Genere le ${new Date(report.generated_at).toLocaleDateString('fr-FR')}*`);
  lines.push('');
  
  // Corpus stats
  lines.push(`**Corpus:** ${report.corpus.doc_count} documents, ${report.corpus.chunk_count} chunks`);
  if (report.corpus.top_themes.length > 0) {
    lines.push(`**Themes principaux:** ${report.corpus.top_themes.map(t => t.label).join(', ')}`);
  }
  lines.push('');
  
  // Executive Summary
  lines.push('## Resume Executif');
  lines.push('');
  lines.push(report.executive_summary.summary);
  lines.push('');
  
  if (report.executive_summary.key_takeaways.length > 0) {
    lines.push('### Points cles');
    report.executive_summary.key_takeaways.forEach(t => {
      lines.push(`- ${t}`);
    });
    lines.push('');
  }
  
  if (report.executive_summary.open_questions.length > 0) {
    lines.push('### Questions ouvertes');
    report.executive_summary.open_questions.forEach(q => {
      lines.push(`- ${q}`);
    });
    lines.push('');
  }
  
  // Documents
  lines.push('## Analyse par Document');
  lines.push('');
  
  report.documents.forEach(doc => {
    lines.push(`### ${doc.doc_title}`);
    lines.push('');
    lines.push(`*${doc.doc_summary.one_liner}*`);
    lines.push('');
    lines.push(doc.doc_summary.abstract);
    lines.push('');
    
    if (doc.doc_summary.key_points.length > 0) {
      lines.push('#### Points cles');
      doc.doc_summary.key_points.forEach(kp => {
        lines.push(`- **${kp.label}:** ${kp.explanation}`);
        if (kp.evidence.length > 0) {
          lines.push(`  - *Source: ${kp.evidence[0].doc_title}*`);
        }
      });
      lines.push('');
    }
    
    if (doc.doc_summary.recommended_quotes.length > 0) {
      lines.push('#### Citations');
      doc.doc_summary.recommended_quotes.forEach(q => {
        lines.push(`> "${q.quote}"`);
        lines.push(`> -- ${q.source.doc_title}${q.source.page ? `, p.${q.source.page}` : ''}`);
        lines.push('');
      });
    }
  });
  
  // Cross-doc
  if (report.cross_doc.agreements.length > 0 || report.cross_doc.tensions.length > 0) {
    lines.push('## Analyse Croisee');
    lines.push('');
    
    if (report.cross_doc.agreements.length > 0) {
      lines.push('### Convergences');
      report.cross_doc.agreements.forEach(a => {
        lines.push(`- **${a.label}:** ${a.explanation}`);
        lines.push(`  - Documents: ${a.involved_docs.join(', ')}`);
      });
      lines.push('');
    }
    
    if (report.cross_doc.tensions.length > 0) {
      lines.push('### Divergences');
      report.cross_doc.tensions.forEach(t => {
        lines.push(`- **${t.label}:** ${t.explanation}`);
        lines.push(`  - Documents: ${t.involved_docs.join(', ')}`);
      });
      lines.push('');
    }
    
    if (report.cross_doc.gaps.length > 0) {
      lines.push('### Lacunes identifiees');
      report.cross_doc.gaps.forEach(g => {
        lines.push(`- **${g.label}:** ${g.explanation}`);
      });
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Formate une citation selon le style choisi
 * @param {EvidenceQuote} quote
 * @param {string} style - apa|simple|markdown
 * @returns {string}
 */
export function formatCitation(quote, style = 'simple') {
  const { doc_title, page, section, chunk_id } = quote.source;
  
  switch (style) {
    case 'apa':
      return `(${doc_title}${page ? `, p. ${page}` : ''})`;
    case 'markdown':
      return `[${doc_title}${page ? `, p.${page}` : ''}](#${chunk_id})`;
    case 'simple':
    default:
      return `${doc_title}${page ? `, p.${page}` : ''}${section ? ` (${section})` : ''}`;
  }
}


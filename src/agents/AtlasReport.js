/**
 * AtlasReport - Structure de données et validation pour le Concept Atlas
 */

// Mapping des icônes sémantiques par type de noeud
export const ATLAS_ICONS = {
  // Types de noeuds
  framework: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />`,
  concept: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />`,
  claim: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />`,
  evidence: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />`,

  // Status
  ok: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />`,
  warning: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`,
  gap: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />`,

  // General
  link: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />`,
  search: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />`,
  export: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />`
};

// Types de relations possibles entre noeuds
export const EDGE_TYPES = [
  'part_of',       // A fait partie de B (concept -> framework)
  'extends',       // A étend/spécialise B
  'related_to',    // Relation générique
  'supports',      // A supporte/confirme B (evidence -> claim)
  'instance_of',   // A est une instance de B
  'contrasts_with', // A contraste avec B
  'co_occurs_with'  // A co-occurre souvent avec B
];

// Types de noeuds avec leur niveau hiérarchique (Y)
export const NODE_LEVELS = {
  framework: 0,    // Haut du graphe
  concept: 1,
  claim: 2,
  evidence: 3      // Bas du graphe
};

// Couleurs par statut
export const STATUS_COLORS = {
  ok: '#6b7280',      // gray-500
  warning: '#f59e0b', // amber-500
  gap: '#ef4444'      // red-500
};

/**
 * Crée un atlasReport vide avec la structure complète
 */
export function createEmptyAtlasReport() {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      context: '',
      documentCount: 0,
      nodeCount: 0,
      edgeCount: 0
    },
    nodes: [],
    edges: [],
    inspection: {}
  };
}

/**
 * Crée un noeud avec les champs requis
 */
export function createNode(id, label, type, options = {}) {
  return {
    id,
    label,
    type, // framework, concept, claim, evidence
    short_description: options.description || '',
    importance_score: options.importance || 0.5,
    coverage_score: options.coverage || 0.5,
    status: options.status || 'ok',
    recommended_icon: type, // Par défaut, l'icône correspond au type
    docIds: options.docIds || []
  };
}

/**
 * Crée une relation entre deux noeuds
 */
export function createEdge(from, to, type, options = {}) {
  return {
    from,
    to,
    type, // part_of, extends, related_to, supports, instance_of, contrasts_with, co_occurs_with
    weight: options.weight || 0.5,
    explanation: options.explanation || ''
  };
}

/**
 * Crée une entrée d'inspection pour un noeud
 */
export function createInspectionEntry(nodeId, summary, topEvidence = [], relatedNodes = []) {
  return {
    summary,
    top_evidence: topEvidence.slice(0, 5).map(ev => ({
      evidence_id: ev.id || '',
      excerpt: ev.text || '',
      doc_title: ev.docTitle || '',
      section: ev.section || '',
      relevance_score: ev.relevance || 0.5
    })),
    related_nodes: relatedNodes.map(rn => ({
      node_id: rn.id,
      relation_type: rn.relationType || 'related_to'
    }))
  };
}

/**
 * Valide la structure d'un atlasReport
 */
export function validateAtlasReport(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['atlasReport doit être un objet'] };
  }

  // Meta
  if (!obj.meta) {
    errors.push('Section meta manquante');
  } else {
    if (!obj.meta.generatedAt) errors.push('meta.generatedAt manquant');
    if (typeof obj.meta.nodeCount !== 'number') errors.push('meta.nodeCount doit être un nombre');
    if (typeof obj.meta.edgeCount !== 'number') errors.push('meta.edgeCount doit être un nombre');
  }

  // Nodes
  if (!Array.isArray(obj.nodes)) {
    errors.push('nodes doit être un tableau');
  } else {
    obj.nodes.forEach((node, i) => {
      if (!node.id) errors.push(`nodes[${i}] id manquant`);
      if (!node.label) errors.push(`nodes[${i}] label manquant`);
      if (!['framework', 'concept', 'claim', 'evidence'].includes(node.type)) {
        errors.push(`nodes[${i}] type invalide: ${node.type}`);
      }
      if (!['ok', 'warning', 'gap'].includes(node.status)) {
        errors.push(`nodes[${i}] status invalide: ${node.status}`);
      }
      if (typeof node.importance_score !== 'number' || node.importance_score < 0 || node.importance_score > 1) {
        errors.push(`nodes[${i}] importance_score invalide`);
      }
    });
  }

  // Edges
  if (!Array.isArray(obj.edges)) {
    errors.push('edges doit être un tableau');
  } else {
    const nodeIds = new Set((obj.nodes || []).map(n => n.id));
    obj.edges.forEach((edge, i) => {
      if (!edge.from) errors.push(`edges[${i}] from manquant`);
      if (!edge.to) errors.push(`edges[${i}] to manquant`);
      if (!nodeIds.has(edge.from)) errors.push(`edges[${i}] from référence un noeud inexistant`);
      if (!nodeIds.has(edge.to)) errors.push(`edges[${i}] to référence un noeud inexistant`);
      if (!EDGE_TYPES.includes(edge.type)) {
        errors.push(`edges[${i}] type invalide: ${edge.type}`);
      }
    });
  }

  // Inspection
  if (!obj.inspection || typeof obj.inspection !== 'object') {
    errors.push('inspection doit être un objet');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Renvoie le SVG d'une icône Atlas
 */
export function getAtlasIcon(iconName, className = 'w-5 h-5') {
  const path = ATLAS_ICONS[iconName] || ATLAS_ICONS.concept;
  return `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${path}</svg>`;
}

/**
 * Calcule les scores d'importance et de couverture pour les noeuds
 */
export function computeNodeScores(nodes, edges, chunks) {
  const inDegree = {};
  const outDegree = {};
  
  edges.forEach(e => {
    inDegree[e.to] = (inDegree[e.to] || 0) + 1;
    outDegree[e.from] = (outDegree[e.from] || 0) + 1;
  });

  nodes.forEach(node => {
    // Importance = centralité (in + out degree normalisé)
    const totalDegree = (inDegree[node.id] || 0) + (outDegree[node.id] || 0);
    const maxDegree = Math.max(1, ...Object.values({...inDegree, ...outDegree}));
    node.importance_score = Math.min(1, 0.2 + (totalDegree / maxDegree) * 0.8);

    // Coverage = proportion de docs qui mentionnent ce concept
    if (chunks && chunks.length > 0) {
      const uniqueDocs = new Set(chunks.map(c => c.source));
      const docsMentioning = node.docIds?.length || 0;
      node.coverage_score = docsMentioning / Math.max(1, uniqueDocs.size);
    }

    // Status basé sur coverage
    if (node.coverage_score < 0.3) {
      node.status = 'gap';
    } else if (node.coverage_score < 0.6) {
      node.status = 'warning';
    } else {
      node.status = 'ok';
    }
  });

  return nodes;
}

/**
 * Génère les données d'inspection pour tous les noeuds
 */
export function generateInspectionData(nodes, edges, chunks) {
  const inspection = {};

  nodes.forEach(node => {
    // Trouver les preuves liées
    const relatedEvidence = chunks
      .filter(c => {
        const text = c.text.toLowerCase();
        const label = node.label.toLowerCase();
        return text.includes(label) || label.split(' ').some(w => text.includes(w));
      })
      .slice(0, 5)
      .map(c => ({
        id: c.id || `chunk-${Math.random().toString(36).substr(2, 9)}`,
        text: c.text.substring(0, 200) + (c.text.length > 200 ? '...' : ''),
        docTitle: c.source || 'Document inconnu',
        section: '',
        relevance: 0.7 + Math.random() * 0.3
      }));

    // Trouver les noeuds liés
    const relatedNodes = edges
      .filter(e => e.from === node.id || e.to === node.id)
      .map(e => ({
        id: e.from === node.id ? e.to : e.from,
        relationType: e.type
      }))
      .slice(0, 10);

    inspection[node.id] = createInspectionEntry(
      node.id,
      node.short_description || `${node.label} - ${node.type}`,
      relatedEvidence,
      relatedNodes
    );
  });

  return inspection;
}


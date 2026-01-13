/**
 * Module de construction de la vue globale des documents
 * Génère une vue structurée lisible par l'humain pour injection dans le contexte IA
 */

import { state, getDocument } from '../state/state.js';

// Seuil pour déterminer "petite base" vs "grande base"
const SMALL_BASE_THRESHOLD = 50;

/**
 * Construit la vue globale complète (tous les documents)
 * @returns {string} - Vue globale formatée
 */
function buildFullGlobalView() {
  const docs = state.docs.filter(d => d.extractedText && d.status === 'extracted');
  
  if (docs.length === 0) {
    return 'Aucun document disponible dans la base.';
  }

  let view = `# VUE GLOBALE DE LA BASE DE DOCUMENTS\n\n`;
  view += `Total: ${docs.length} document(s) analysé(s)\n\n`;
  view += `---\n\n`;

  // Trier par importance (élevée > moyenne > faible)
  const importanceOrder = { 'élevée': 3, 'moyenne': 2, 'faible': 1 };
  const sortedDocs = [...docs].sort((a, b) => {
    const aImp = importanceOrder[a.metadata?.importance || 'moyenne'] || 2;
    const bImp = importanceOrder[b.metadata?.importance || 'moyenne'] || 2;
    if (bImp !== aImp) return bImp - aImp;
    // Si même importance, trier par date (plus récent d'abord)
    return new Date(b.uploadedAt) - new Date(a.uploadedAt);
  });

  sortedDocs.forEach((doc, index) => {
    const metadata = doc.metadata || {};
    const displayName = doc.displayName || doc.filename;
    
    view += `## Document ${index + 1}: ${displayName}\n\n`;
    
    // 1. Résumé
    view += `**Résumé:** ${metadata.summary || 'Non disponible'}\n\n`;
    
    // 2. Sujet principal
    view += `**Sujet:** ${metadata.subject || 'Non déterminé'}\n\n`;
    
    // 3. Type
    view += `**Type:** ${metadata.type || 'autre'}\n\n`;
    
    // 4. Contexte/Projet (documents liés)
    const primaryLinks = metadata.context?.primary || [];
    const secondaryLinks = metadata.context?.secondary || [];
    const allLinks = [...primaryLinks, ...secondaryLinks];
    
    if (allLinks.length > 0) {
      const linkedDocNames = allLinks
        .map(id => {
          const linkedDoc = getDocument(id);
          return linkedDoc ? (linkedDoc.displayName || linkedDoc.filename) : null;
        })
        .filter(Boolean);
      
      if (linkedDocNames.length > 0) {
        view += `**Contexte/Projet:** Lié à ${linkedDocNames.length} document(s): ${linkedDocNames.join(', ')}\n\n`;
      } else {
        view += `**Contexte/Projet:** Aucun document lié\n\n`;
      }
    } else {
      view += `**Contexte/Projet:** Aucun document lié\n\n`;
    }
    
    // 5. Utilité principale
    view += `**Utilité:** ${metadata.utility || 'Non déterminée'}\n\n`;
    
    // 6. Importance relative
    const importance = metadata.importance || 'moyenne';
    const importanceEmoji = {
      'élevée': '🔴',
      'moyenne': '🟡',
      'faible': ''
    };
    view += `**Importance:** ${importanceEmoji[importance] || ''} ${importance}\n\n`;
    
    view += `---\n\n`;
  });

  return view;
}

/**
 * Construit un résumé statistique de la base
 * @param {Array} relevantDocs - Documents pertinents à inclure en détail
 * @returns {string} - Vue globale avec résumé
 */
function buildSummarizedGlobalView(relevantDocs = []) {
  const docs = state.docs.filter(d => d.extractedText && d.status === 'extracted');
  
  if (docs.length === 0) {
    return 'Aucun document disponible dans la base.';
  }

  // Statistiques
  const stats = {
    total: docs.length,
    byType: {},
    byImportance: { 'élevée': 0, 'moyenne': 0, 'faible': 0 },
    withLinks: 0,
    withoutLinks: 0
  };

  docs.forEach(doc => {
    const metadata = doc.metadata || {};
    
    // Par type
    const type = metadata.type || 'autre';
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    
    // Par importance
    const importance = metadata.importance || 'moyenne';
    stats.byImportance[importance] = (stats.byImportance[importance] || 0) + 1;
    
    // Avec/sans liens
    const hasLinks = (metadata.context?.primary?.length || 0) + (metadata.context?.secondary?.length || 0) > 0;
    if (hasLinks) {
      stats.withLinks++;
    } else {
      stats.withoutLinks++;
    }
  });

  let view = `# VUE GLOBALE DE LA BASE DE DOCUMENTS\n\n`;
  view += `## Statistiques\n\n`;
  view += `- **Total:** ${stats.total} document(s)\n`;
  view += `- **Importance:** ${stats.byImportance['élevée']} élevée, ${stats.byImportance['moyenne']} moyenne, ${stats.byImportance['faible']} faible\n`;
  view += `- **Liens:** ${stats.withLinks} document(s) avec liens, ${stats.withoutLinks} sans liens\n`;
  
  if (Object.keys(stats.byType).length > 0) {
    view += `- **Types:** ${Object.entries(stats.byType).map(([type, count]) => `${type} (${count})`).join(', ')}\n`;
  }
  
  view += `\n---\n\n`;

  // Documents pertinents en détail
  if (relevantDocs.length > 0) {
    view += `## Documents pertinents (${relevantDocs.length})\n\n`;
    
    relevantDocs.forEach((doc, index) => {
      const metadata = doc.metadata || {};
      const displayName = doc.displayName || doc.filename;
      
      view += `### ${index + 1}. ${displayName}\n\n`;
      view += `- **Résumé:** ${metadata.summary || 'Non disponible'}\n`;
      view += `- **Sujet:** ${metadata.subject || 'Non déterminé'}\n`;
      view += `- **Type:** ${metadata.type || 'autre'}\n`;
      view += `- **Utilité:** ${metadata.utility || 'Non déterminée'}\n`;
      view += `- **Importance:** ${metadata.importance || 'moyenne'}\n`;
      
      const allLinks = [...(metadata.context?.primary || []), ...(metadata.context?.secondary || [])];
      if (allLinks.length > 0) {
        const linkedDocNames = allLinks
          .map(id => {
            const linkedDoc = getDocument(id);
            return linkedDoc ? (linkedDoc.displayName || linkedDoc.filename) : null;
          })
          .filter(Boolean)
          .slice(0, 3); // Limiter à 3 pour le résumé
        view += `- **Liens:** ${linkedDocNames.join(', ')}${allLinks.length > 3 ? '...' : ''}\n`;
      }
      
      view += `\n`;
    });
    
    view += `---\n\n`;
  }

  // Liste des autres documents (sans détails)
  const otherDocs = docs.filter(d => !relevantDocs.some(rd => rd.id === d.id));
  if (otherDocs.length > 0) {
    view += `## Autres documents (${otherDocs.length})\n\n`;
    otherDocs.forEach(doc => {
      const displayName = doc.displayName || doc.filename;
      const metadata = doc.metadata || {};
      view += `- ${displayName} (${metadata.type || 'autre'}, ${metadata.importance || 'moyenne'})\n`;
    });
  }

  return view;
}

/**
 * Construit la vue globale intelligente
 * - Petite base (<50 docs) : vue complète
 * - Grande base (50+ docs) : documents pertinents + résumé
 * @param {Array<string>} relevantDocIds - IDs des documents pertinents (optionnel)
 * @returns {string} - Vue globale formatée
 */
export function buildGlobalView(relevantDocIds = []) {
  const docs = state.docs.filter(d => d.extractedText && d.status === 'extracted');
  
  // Petite base : vue complète
  if (docs.length < SMALL_BASE_THRESHOLD) {
    return buildFullGlobalView();
  }

  // Grande base : vue résumée avec documents pertinents
  const relevantDocs = relevantDocIds
    .map(id => getDocument(id))
    .filter(doc => doc && doc.extractedText && doc.status === 'extracted');

  return buildSummarizedGlobalView(relevantDocs);
}

/**
 * Construit la vue globale pour une requête spécifique
 * Identifie les documents pertinents basés sur la requête
 * @param {string} query - Requête utilisateur
 * @param {Array} ragResults - Résultats RAG (optionnel, pour identifier documents pertinents)
 * @returns {string} - Vue globale formatée
 */
export function buildGlobalViewForQuery(query, ragResults = []) {
  // Extraire les IDs des documents pertinents depuis les résultats RAG
  const relevantDocIds = [];
  if (ragResults && ragResults.length > 0) {
    ragResults.forEach(result => {
      if (result.docId && !relevantDocIds.includes(result.docId)) {
        relevantDocIds.push(result.docId);
      }
    });
  }

  // Si pas de documents pertinents identifiés, utiliser la vue complète/résumée standard
  return buildGlobalView(relevantDocIds);
}

/**
 * Obtient un résumé très court de la base (pour contextes limités)
 * @returns {string} - Résumé ultra-court
 */
export function getShortSummary() {
  const docs = state.docs.filter(d => d.extractedText && d.status === 'extracted');
  
  if (docs.length === 0) {
    return 'Aucun document dans la base.';
  }

  const stats = {
    total: docs.length,
    byImportance: { 'élevée': 0, 'moyenne': 0, 'faible': 0 }
  };

  docs.forEach(doc => {
    const importance = doc.metadata?.importance || 'moyenne';
    stats.byImportance[importance] = (stats.byImportance[importance] || 0) + 1;
  });

  return `${stats.total} document(s): ${stats.byImportance['élevée']} élevée, ${stats.byImportance['moyenne']} moyenne, ${stats.byImportance['faible']} faible.`;
}

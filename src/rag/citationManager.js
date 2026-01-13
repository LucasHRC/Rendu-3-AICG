/**
 * Gestion et validation des citations
 * Format: [DocX • pY • chunk_Z]
 */

export class CitationManager {
  constructor(documentAnalyses) {
    this.documentAnalyses = documentAnalyses;
    this.citationMap = this.buildCitationMap(documentAnalyses);
  }

  /**
   * Construit la map des citations disponibles
   */
  buildCitationMap(analyses) {
    const map = new Map();
    
    analyses.forEach((analysis, idx) => {
      const docId = `Doc${idx + 1}`;
      const docIndex = idx + 1;
      
      // Utiliser les citations_used de l'analyse si disponibles
      if (analysis.parsed && analysis.parsed.citations_used) {
        analysis.parsed.citations_used.forEach(citation => {
          const key = `${docId}_${citation.chunk_id}`;
          map.set(key, {
            docId,
            docIndex,
            page: citation.page,
            chunkId: citation.chunk_id,
            section: citation.section || 'Unknown',
            excerpt: citation.text_excerpt || '',
            relevance: citation.relevance || 'medium'
          });
        });
      }
      
      // Fallback: construire depuis les chunks utilisés dans l'analyse
      if (analysis.parsed && analysis.parsed.research_content) {
        const keyResults = analysis.parsed.research_content.key_results || [];
        keyResults.forEach(result => {
          if (result.chunk_id) {
            const key = `${docId}_${result.chunk_id}`;
            if (!map.has(key)) {
              map.set(key, {
                docId,
                docIndex,
                page: result.page || 'Unknown',
                chunkId: result.chunk_id,
                section: 'Results',
                excerpt: result.result?.substring(0, 30) || '',
                relevance: 'high'
              });
            }
          }
        });
      }
    });
    
    return map;
  }

  /**
   * Formate une citation selon le format standard
   */
  formatCitation(docIndex, page, chunkId) {
    return `[Doc${docIndex} • p${page} • ${chunkId}]`;
  }

  /**
   * Valide le format d'une citation
   */
  validateCitation(citationString) {
    const regex = /\[Doc(\d+)\s*•\s*p(\d+)\s*•\s*(chunk_\d+)\]/;
    return regex.test(citationString);
  }

  /**
   * Extrait toutes les citations d'un texte
   */
  extractAllCitations(text) {
    const regex = /\[Doc(\d+)\s*•\s*p(\d+)\s*•\s*(chunk_\d+)\]/g;
    const matches = [...text.matchAll(regex)];
    
    return matches.map(m => ({
      full: m[0],
      docIndex: parseInt(m[1]),
      page: parseInt(m[2]),
      chunkId: m[3],
      position: m.index
    }));
  }

  /**
   * Vérifie si une citation est valide (existe dans la map)
   */
  isValidCitation(citation) {
    const key = `Doc${citation.docIndex}_${citation.chunkId}`;
    return this.citationMap.has(key);
  }

  /**
   * Obtient les détails d'une citation
   */
  getCitationDetails(docIndex, chunkId) {
    const key = `Doc${docIndex}_${chunkId}`;
    return this.citationMap.get(key) || null;
  }

  /**
   * Groupe les citations par document
   */
  groupCitationsByDoc(citations) {
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
   * Compte les citations par document
   */
  countCitationsByDoc(citations) {
    const counts = new Map();
    
    citations.forEach(citation => {
      const current = counts.get(citation.docIndex) || 0;
      counts.set(citation.docIndex, current + 1);
    });
    
    return counts;
  }

  /**
   * Obtient les chunks les plus cités
   */
  getTopCitedChunks(citations, topN = 10) {
    const chunkCounts = new Map();
    
    citations.forEach(citation => {
      const key = `${citation.docIndex}_${citation.chunkId}`;
      const current = chunkCounts.get(key) || 0;
      chunkCounts.set(key, current + 1);
    });
    
    // Trier par nombre de citations
    const sorted = Array.from(chunkCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
    
    return sorted.map(([key, count]) => {
      const [docIndex, chunkId] = key.split('_');
      return {
        docIndex: parseInt(docIndex),
        chunkId: chunkId,
        count: count
      };
    });
  }

  /**
   * Vérifie quels documents ne sont pas cités
   */
  getUncitedDocuments(citations) {
    const citedDocIndices = new Set(citations.map(c => c.docIndex));
    const uncited = [];
    
    this.documentAnalyses.forEach((analysis, idx) => {
      const docIndex = idx + 1;
      if (!citedDocIndices.has(docIndex)) {
        uncited.push({
          docIndex,
          filename: analysis.filename || `Document ${docIndex}`,
          title: analysis.parsed?.basic_info?.title || 'Unknown'
        });
      }
    });
    
    return uncited;
  }
}

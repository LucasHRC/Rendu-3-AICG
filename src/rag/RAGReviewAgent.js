/**
 * Agent de Revue Littéraire RAG - Version Académique Complète
 * Pipeline en 2 étapes avec validation, citations et statistiques enrichies
 */

import { state } from '../state/state.js';
import { isModelReady } from '../llm/webllm.js';
import { addLog } from '../state/state.js';
import { analyzeDocument } from './documentAnalyzer.js';
import { generateFinalReview } from './synthesisGenerator.js';
import { analyzeThematicCohesion } from './thematicAnalyzer.js';
import { CitationManager } from './citationManager.js';
import { validateFinalReview } from './reviewValidator.js';

export class RAGReviewAgent {
  constructor() {
    this.isGenerating = false;
  }

  /**
   * Génère une revue RAG simple : 1 appel par document + 1 synthèse
   */
  async generateReview(onProgress = null, cancelCheck = null) {
    if (this.isGenerating) {
      throw new Error('Une génération est déjà en cours');
    }

    this.isGenerating = true;
    const startTime = Date.now();

    try {
      // Vérifications de base
      if (!isModelReady()) {
        throw new Error('Modèle LLM non chargé');
      }

      const docs = state.docs.filter(d => d.status === 'extracted');
      if (docs.length === 0) {
        throw new Error('Aucun document ingéré');
      }

      addLog('info', `DEBUT REVUE RAG - ${docs.length} documents`);
      console.log(`DEBUT REVUE RAG - ${docs.length} documents`);

      // === PHASE 1: ANALYSE PAR DOCUMENT ===
      const documentReviews = [];
      const analysisStartTime = Date.now();

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];

        // Vérification d'annulation
        if (cancelCheck && cancelCheck()) {
          addLog('warning', `REVUE ANNULÉE à document ${i + 1}/${docs.length}`);
          console.log(`REVUE ANNULÉE à document ${i + 1}/${docs.length}`);
          throw new Error('REVUE ANNULÉE PAR L\'UTILISATEUR');
        }

        addLog('info', `ANALYSE DOC ${i + 1}/${docs.length}: ${doc.filename}`);
        console.log(`ANALYSE DOC ${i + 1}/${docs.length}: ${doc.filename}`);

        onProgress?.({
          type: 'document_start',
          current: i + 1,
          total: docs.length,
          filename: doc.filename
        });

        try {
          // Utiliser le nouveau module documentAnalyzer
          const review = await analyzeDocument(doc, (token, full) => {
            onProgress?.({
              type: 'document_progress',
              current: i + 1,
              total: docs.length,
              filename: doc.filename,
              partialText: full
            });
          });

          documentReviews.push(review);

          onProgress?.({
            type: 'document_complete',
            current: i + 1,
            total: docs.length,
            review: review
          });

          addLog('success', `ANALYSE DOC ${i + 1} TERMINEE (qualité: ${review.validation?.quality || 'unknown'})`);
          console.log(`ANALYSE DOC ${i + 1} TERMINEE`);

        } catch (error) {
          addLog('error', `ECHEC ANALYSE DOC ${i + 1}: ${error.message}`);
          console.log(`ECHEC ANALYSE DOC ${i + 1}: ${error.message}`);
          // Créer un objet d'erreur structuré
          documentReviews.push({
            filename: doc.filename,
            error: error.message,
            parsed: null,
            validation: { isValid: false, quality: 'low' }
          });
        }
      }

      const analysisEndTime = Date.now();

      // === PHASE 2: ANALYSE DE COHÉRENCE THÉMATIQUE ===
      // Vérification d'annulation avant synthèse
      if (cancelCheck && cancelCheck()) {
        addLog('warning', 'REVUE ANNULÉE avant synthèse finale');
        console.log('REVUE ANNULÉE avant synthèse finale');
        throw new Error('REVUE ANNULÉE PAR L\'UTILISATEUR');
      }

      addLog('info', `ANALYSE COHERENCE THEMATIQUE - ${docs.length} documents`);
      
      // Filtrer les analyses valides (avec parsed OU au moins un filename)
      let validReviews = documentReviews.filter(r => r.parsed && !r.error);
      
      // Si aucune analyse structuree, utiliser les documents bruts comme fallback
      if (validReviews.length === 0) {
        addLog('warning', 'Aucune analyse structuree, utilisation des documents bruts');
        
        // Creer des analyses minimales a partir des documents
        validReviews = docs.map(doc => {
          const chunks = state.chunks.filter(c => c.docId === doc.id).slice(0, 5);
          const textPreview = chunks.map(c => c.text || c.content || '').join('\n').substring(0, 2000);
          
          return {
            filename: doc.filename,
            parsed: {
              doc_id: doc.id,
              title: doc.filename.replace('.pdf', ''),
              year: null,
              domain: null,
              research_question: null,
              methodology: [],
              key_results: [],
              metrics: [],
              limitations: [],
              quality: 'low',
              // Contenu brut pour la synthese
              raw_content: textPreview
            },
            validation: { isValid: true, quality: 'low' }
          };
        });
        
        if (validReviews.length === 0) {
          throw new Error('Aucun document disponible pour la synthese');
        }
      }

      // Analyser la cohérence thématique
      const cohesionAnalysis = analyzeThematicCohesion(validReviews);
      addLog('info', `Cohésion détectée: ${cohesionAnalysis.recommendation} (score: ${(cohesionAnalysis.score * 100).toFixed(0)}%)`);

      // === PHASE 3: SYNTHÈSE FINALE ===
      addLog('info', `SYNTHESE FINALE - Mode: ${cohesionAnalysis.recommendation}`);
      console.log(`SYNTHESE FINALE - Mode: ${cohesionAnalysis.recommendation}`);

      onProgress?.({
        type: 'synthesis_start',
        documentCount: docs.length,
        mode: cohesionAnalysis.recommendation
      });

      const synthesisStartTime = Date.now();
      const finalSynthesis = await generateFinalReview(validReviews, cohesionAnalysis, (token, full) => {
        onProgress?.({
          type: 'synthesis_progress',
          partialText: full
        });
      });

      // === VALIDATION ET STATISTIQUES ===
      const citationManager = new CitationManager(validReviews);
      const validation = validateFinalReview(finalSynthesis.text, validReviews, citationManager);
      
      const citations = citationManager.extractAllCitations(finalSynthesis.text);
      const citationsByDoc = citationManager.groupCitationsByDoc(citations);
      const topChunks = citationManager.getTopCitedChunks(citations, 10);
      const uncitedDocs = citationManager.getUncitedDocuments(citations);

      addLog('info', `Validation revue: ${validation.quality} (${validation.metrics.totalCitations} citations)`);

      // Construire le résultat enrichi
      const result = {
        documentReviews: validReviews,
        finalSynthesis,
        generatedAt: new Date().toISOString(),
        documentCount: docs.length,
        totalTime: Date.now() - startTime,
        
        // Statistiques académiques
        academicStats: {
          totalCitations: citations.length,
          citationsPerDoc: docs.length > 0 ? (citations.length / docs.length).toFixed(1) : 0,
          citationsByDoc: Object.fromEntries(Array.from(citationsByDoc.entries()).map(([k, v]) => [k, v.length])),
          uncitedDocuments: uncitedDocs.map(d => d.filename),
          topChunksUsed: topChunks,
          reviewMode: cohesionAnalysis.recommendation,
          cohesionScore: cohesionAnalysis.score,
          validationQuality: validation.quality
        },
        
        // Timings détaillés
        timings: {
          analysisPhase: analysisEndTime - startTime,
          synthesisPhase: Date.now() - synthesisStartTime,
          avgTimePerDoc: validReviews.length > 0 ? (analysisEndTime - startTime) / validReviews.length : 0
        },
        
        // Métriques de qualité
        qualityMetrics: {
          analysisQuality: validReviews.map(r => r.validation?.quality || r.parsed?.confidence_flags?.extraction_quality || 'unknown'),
          citationCoverage: validation.metrics.citationCoverage,
          validationWarnings: validation.warnings
        },
        
        // Données pour l'UI
        citationManager: citationManager,
        validation: validation,
        cohesionAnalysis: cohesionAnalysis
      };

      onProgress?.({
        type: 'complete',
        result
      });

      addLog('success', `REVUE RAG TERMINEE - ${docs.length} documents synthetises en ${(Date.now() - startTime)/1000}s`);
      console.log(`REVUE RAG TERMINEE - ${docs.length} documents synthetises`);

      return result;

    } catch (error) {
      addLog('error', `ERREUR REVUE RAG: ${error.message}`);
      console.error(`ERREUR REVUE RAG: ${error.message}`);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

}

export const ragReviewAgent = new RAGReviewAgent();
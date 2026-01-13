/**
 * Module de calcul dynamique de l'importance des documents
 * L'importance est mise à jour selon la fréquence d'utilisation dans les réponses RAG
 */

import { state, updateDocumentMetadata, getDocument, addLog } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';

// Compteurs d'utilisation par document (en mémoire)
const usageCounters = {};

// Poids pour le calcul d'importance
const IMPORTANCE_WEIGHTS = {
  usageFrequency: 0.4,    // 40% - Fréquence d'utilisation
  relevanceScore: 0.3,    // 30% - Score de pertinence (calculé par IA)
  linkCount: 0.2,         // 20% - Nombre de liens avec autres documents
  recency: 0.1            // 10% - Récence (documents récents = plus importants)
};

/**
 * Enregistre l'utilisation d'un document dans une réponse RAG
 * @param {string} docId - ID du document utilisé
 */
export function recordDocumentUsage(docId) {
  if (!usageCounters[docId]) {
    usageCounters[docId] = {
      count: 0,
      lastUsed: null,
      firstUsed: null
    };
  }

  usageCounters[docId].count++;
  usageCounters[docId].lastUsed = new Date();
  if (!usageCounters[docId].firstUsed) {
    usageCounters[docId].firstUsed = new Date();
  }

  // Mettre à jour l'importance immédiatement
  updateImportanceForDocument(docId);
}

/**
 * Calcule un score de pertinence pour un document via IA
 * @param {string} docId - ID du document
 * @returns {Promise<number>} - Score de pertinence (0-1)
 */
async function calculateRelevanceScore(docId) {
  const doc = getDocument(docId);
  if (!doc || !doc.metadata) {
    return 0.5; // Score par défaut
  }

  // Si le modèle n'est pas prêt, utiliser un score basé sur les métadonnées
  if (!isModelReady('primary')) {
    // Score basique basé sur la présence de métadonnées
    let score = 0.5;
    if (doc.metadata.summary && doc.metadata.summary !== 'Document non analysé') score += 0.1;
    if (doc.metadata.subject && doc.metadata.subject !== 'Sujet à déterminer') score += 0.1;
    if (doc.metadata.utility && doc.metadata.utility !== 'Utilité à déterminer') score += 0.1;
    if (doc.metadata.context.primary.length > 0) score += 0.1;
    if (doc.metadata.context.secondary.length > 0) score += 0.1;
    return Math.min(score, 1.0);
  }

  // Utiliser l'IA pour calculer un score de pertinence
  const prompt = `Évalue la pertinence et l'importance de ce document sur une échelle de 0 à 1.

Document: ${doc.filename}
Résumé: ${doc.metadata.summary || 'Non disponible'}
Sujet: ${doc.metadata.subject || 'Non disponible'}
Type: ${doc.metadata.type || 'Non disponible'}
Utilité: ${doc.metadata.utility || 'Non disponible'}
Liens: ${doc.metadata.context.primary.length + doc.metadata.context.secondary.length} document(s) lié(s)

Réponds UNIQUEMENT avec un nombre entre 0 et 1 (ex: 0.75), sans texte.`;

  try {
    const messages = [
      { role: 'system', content: 'Tu es un assistant qui évalue la pertinence de documents. Réponds uniquement avec un nombre entre 0 et 1.' },
      { role: 'user', content: prompt }
    ];

    let response = '';
    await generateCompletion(
      messages,
      { temperature: 0.2, max_tokens: 50 },
      (token, full) => { response = full; },
      'primary'
    );

    // Parser le nombre
    const match = response.match(/0?\.?\d+/);
    if (match) {
      const score = parseFloat(match[0]);
      return Math.max(0, Math.min(1, score)); // Clamper entre 0 et 1
    }

    return 0.5; // Fallback
  } catch (error) {
    addLog('warning', `Erreur calcul score pertinence pour ${doc.filename}: ${error.message}`, { docId });
    return 0.5;
  }
}

/**
 * Calcule le score de fréquence d'utilisation (normalisé)
 * @param {string} docId - ID du document
 * @returns {number} - Score entre 0 et 1
 */
function calculateUsageFrequencyScore(docId) {
  const usage = usageCounters[docId];
  if (!usage || usage.count === 0) {
    return 0;
  }

  // Normaliser par rapport au document le plus utilisé (avec minimum 1 pour éviter division par zéro)
  const maxUsage = Math.max(...Object.values(usageCounters).map(u => u.count || 0), 1);
  return Math.min(usage.count / maxUsage, 1.0);
}

/**
 * Calcule le score de récence
 * @param {string} docId - ID du document
 * @returns {number} - Score entre 0 et 1
 */
function calculateRecencyScore(docId) {
  const doc = getDocument(docId);
  if (!doc) return 0;

  const now = new Date();
  const uploadedAt = new Date(doc.uploadedAt);
  const daysSinceUpload = (now - uploadedAt) / (1000 * 60 * 60 * 24);

  // Documents récents (< 7 jours) = score élevé
  if (daysSinceUpload < 7) return 1.0;
  // Documents anciens (> 30 jours) = score faible
  if (daysSinceUpload > 30) return 0.3;
  // Entre 7 et 30 jours = interpolation linéaire
  return Math.max(0.3, 1.0 - ((daysSinceUpload - 7) / 23) * 0.7);
}

/**
 * Calcule le score de liens
 * @param {string} docId - ID du document
 * @returns {number} - Score entre 0 et 1
 */
function calculateLinkScore(docId) {
  const doc = getDocument(docId);
  if (!doc || !doc.metadata) return 0;

  const totalLinks = Array.isArray(doc.metadata.contexte_projet) ? doc.metadata.contexte_projet.length : 0;

  // Normaliser : 0 liens = 0, 5+ liens = 1
  return Math.min(totalLinks / 5, 1.0);
}

/**
 * Calcule et met à jour l'importance d'un document
 * @param {string} docId - ID du document
 * @returns {Promise<string>} - Nouvelle importance ('faible' | 'moyenne' | 'élevée')
 */
export async function updateImportanceForDocument(docId) {
  const doc = getDocument(docId);
  if (!doc) {
    return 'moyenne';
  }

  // Calculer les scores individuels
  const usageScore = calculateUsageFrequencyScore(docId);
  const linkScore = calculateLinkScore(docId);
  const recencyScore = calculateRecencyScore(docId);
  const relevanceScore = await calculateRelevanceScore(docId);

  // Calculer le score global pondéré
  const globalScore = 
    usageScore * IMPORTANCE_WEIGHTS.usageFrequency +
    relevanceScore * IMPORTANCE_WEIGHTS.relevanceScore +
    linkScore * IMPORTANCE_WEIGHTS.linkCount +
    recencyScore * IMPORTANCE_WEIGHTS.recency;

  // Convertir le score en importance
  let importance;
  if (globalScore >= 0.7) {
    importance = 'élevée';
  } else if (globalScore >= 0.4) {
    importance = 'moyenne';
  } else {
    importance = 'faible';
  }

    // Mettre à jour seulement si différent
    if (doc.metadata && doc.metadata.importance_relative !== importance) {
      await updateDocumentMetadata(docId, { importance_relative: importance }, 'ai');
      addLog('info', `Importance mise à jour pour ${doc.filename}: ${importance} (score: ${(globalScore * 100).toFixed(1)}%)`, {
        docId,
        importance,
        score: globalScore
      });
    }

  return importance;
}

/**
 * Met à jour l'importance de tous les documents
 * @param {Function} onProgress - Callback de progression
 * @returns {Promise<object>} - Résumé des mises à jour
 */
export async function updateAllImportances(onProgress = null) {
  const docs = state.docs.filter(d => d.extractedText && d.status === 'extracted');
  
  if (docs.length === 0) {
    return { updated: 0, total: 0 };
  }

  addLog('info', `Mise à jour importance pour ${docs.length} documents...`, { count: docs.length });

  let updated = 0;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    
    if (onProgress) {
      onProgress(doc.id, { status: 'updating', progress: i / docs.length });
    }

    try {
      const oldImportance = doc.metadata?.importance || 'moyenne';
      const newImportance = await updateImportanceForDocument(doc.id);
      
      if (oldImportance !== newImportance) {
        updated++;
      }
    } catch (error) {
      addLog('error', `Erreur mise à jour importance pour ${doc.filename}: ${error.message}`, { docId: doc.id });
    }

    // Petit délai pour éviter la surcharge
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  addLog('success', `Mise à jour terminée: ${updated}/${docs.length} document(s) mis à jour`, {
    updated,
    total: docs.length
  });

  return { updated, total: docs.length };
}

/**
 * Initialise les compteurs d'utilisation depuis le state (pour persistence)
 */
export function initializeUsageCounters() {
  // Réinitialiser les compteurs
  Object.keys(usageCounters).forEach(key => delete usageCounters[key]);

  // Les compteurs seront reconstruits au fur et à mesure de l'utilisation
  // Pour une vraie persistence, il faudrait sauvegarder dans localStorage
}

/**
 * Obtient les statistiques d'utilisation d'un document
 * @param {string} docId - ID du document
 * @returns {object|null} - Statistiques ou null
 */
export function getUsageStats(docId) {
  return usageCounters[docId] || null;
}

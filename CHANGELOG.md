# Changements depuis le dernier commit (Hands-Free)

## Nouveau système de Revue Littéraire RAG

### Vue d'ensemble
Implémentation d'un système complet de génération automatique de revues de littérature scientifique basé sur RAG (Retrieval-Augmented Generation). Le système analyse plusieurs documents PDF et génère une revue structurée avec extraction JSON et synthèse finale.

### Architecture
**Workflow : 1 appel LLM par document + 1 appel final**
- Chaque document est analysé individuellement avec extraction JSON structurée
- La synthèse finale assemble les fiches JSON en revue complète
- Mode automatique : comparaison si sujets similaires, sinon mode PORTFOLIO

### Composants principaux

#### 1. `RAGReviewAgent.js`
- Orchestre le processus complet de revue
- Gère l'analyse des documents, la cohésion thématique et la synthèse finale
- Interface UI avec progression et annulation

#### 2. `documentAnalyzer.js`
- Analyse individuelle de chaque document
- Extraction JSON structurée (titre, année, auteurs, domaine, question de recherche, méthodologie, résultats, limitations)
- Retrieval TopK intra-document (priorité page 1 + abstract + conclusion)
- Format JSON strict optimisé pour LLaMA 3B

#### 3. `synthesisGenerator.js`
- Génération de la revue finale
- Utilise uniquement les fiches JSON (pas les chunks bruts)
- Mode comparaison ou PORTFOLIO automatique
- Citations simples : [doc_id]

#### 4. `promptTemplates.js`
- Prompts unifiés pour tous les modèles
- Prompt d'extraction par document : JSON strict, court, adapté LLaMA 3B
- Prompt de synthèse finale : assembly des fiches JSON

#### 5. `RAGReviewModal.js`
- Interface utilisateur pour la revue littéraire
- Affichage de la progression, résultats intermédiaires et finale
- Suppression des suggestions de modèles (interface épurée)

### Modules de support

- `documentMetadata.js` : Extraction automatique de métadonnées
- `documentEnricher.js` : Enrichissement des documents
- `documentLinker.js` : Détection de liens entre documents
- `thematicAnalyzer.js` : Analyse de cohésion thématique
- `reviewValidator.js` : Validation des résultats
- `citationManager.js` : Gestion des citations
- `LibraryModal.js` : Modal de bibliothèque de documents
- `ProgressIndicator.js` : Indicateurs de progression
- `SourcesPanel.js` : Panneau d'affichage des sources

### Stockage
- `storage/indexedDB.js` : Persistance des documents, chunks et embeddings

### Améliorations techniques

1. **Prompts optimisés** : Unifié en un seul prompt efficace pour tous les modèles
2. **Extraction JSON stricte** : Format standardisé avec gestion "not found"
3. **Retrieval optimisé** : TopK intra-document avec priorité page 1/abstract/conclusion
4. **Pas d'inventions** : Règle stricte "not found" au lieu d'hallucinations
5. **Interface épurée** : Suppression des suggestions de modèles

### Nettoyage effectué

- Suppression des fichiers inutiles : `clean-emojis.js`, `test-file-input.html`, `postcss.config.js.bak`, `to do.md`
- Suppression des fonctions non utilisées : `calculateChunkScore`, `splitIntoParagraphs`, `DOCUMENT_ANALYSIS_SCHEMA`
- Suppression des templates obsolètes : `CITATION_RULES`, `THEMATIC_REVIEW_TEMPLATE`, `PORTFOLIO_REVIEW_TEMPLATE`
- Suppression des imports non utilisés : `validateDocumentAnalysis`

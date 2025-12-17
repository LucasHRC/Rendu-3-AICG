# Local LLM Multi-Agent Literature Reviewer

Une application de revue de littérature assistée par IA, fonctionnant entièrement dans le navigateur, sans backend. Respect de la vie privée garanti : tout le traitement se fait localement sur votre machine.

## Objectif

Construire un assistant de recherche académique qui peut :
- Ingérer des PDFs de recherche
- Les indexer dans une base de données vectorielle côté client
- Utiliser un agent LLM pour synthétiser une revue de littérature de haute qualité basée sur vos questions et les documents fournis

## Privacy-First

Contrairement aux solutions cloud, cette application s'exécute entièrement côté client en utilisant :
- **WebLLM** (pour le raisonnement)
- **Transformers.js** (pour les embeddings et l'audio)

Aucune donnée n'est envoyée à des serveurs externes.

## Tech Stack

- **WebLLM** : Inférence LLM haute performance dans le navigateur
- **Transformers.js** : Machine Learning pour le web (Embeddings/Whisper)
- **PDF.js** : Bibliothèque d'analyse PDF
- **Tailwind CSS** : Framework CSS utilitaire
- **Vanilla JavaScript** : Pas de framework, code pur
- **Vite** : Build tool et dev server

## Local Setup

### Prérequis

- Node.js 18+ installé
- Navigateur moderne avec support WebGPU (Chrome/Edge recommandé)

### Installation

```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

L'application sera accessible sur `http://localhost:3000`

**Note importante** : Vous devez utiliser un serveur local (pas juste ouvrir `index.html` directement) car le projet utilise des modules ES et charge des fichiers externes.

### Alternative avec Python

Si vous préférez Python :

```bash
python -m http.server
# Puis ouvrir http://localhost:8000
```

## Deployment GH Pages

```bash
# Build pour production
npm run build

# Le dossier dist/ contient les fichiers à déployer
# Configurer GitHub Pages pour pointer vers dist/
```


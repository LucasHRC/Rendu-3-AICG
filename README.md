# Literature Reviewer - Assistant de Recherche IA Local

Application web client-side pour la revue de littérature scientifique. Utilise WebLLM pour le raisonnement et Transformers.js pour les embeddings. **Aucune donnée ne quitte votre navigateur** - tout est traité localement.

## Vue d'ensemble

Literature Reviewer vous permet d'importer vos articles PDF, de les vectoriser automatiquement, puis d'interroger vos documents via un chatbot RAG ou de générer des revues littéraires complètes.

```
PDF → Extraction → Chunking → Embeddings → Vector Store → RAG → LLM
```

## Démarrage rapide

### Prérequis

- **Node.js 18+** installé sur votre machine
- **Navigateur moderne** avec support WebGPU :
  - Chrome 113+ (recommandé)
  - Edge 113+
  - Safari 17+ (support partiel, utilise WASM)

### Installation

1. **Cloner le dépôt** :
   ```bash
   git clone https://github.com/your-username/Rendu-3-AICG.git
   cd Rendu-3-AICG
   ```

2. **Installer les dépendances** :
   ```bash
   npm install
   ```

3. **Lancer l'application** :
   ```bash
   npm run dev
   ```

4. **Ouvrir dans le navigateur** :
   L'application sera accessible à `http://localhost:5173`

### Premier lancement

À votre première visite, un **tutoriel interactif** vous guide automatiquement à travers toutes les fonctionnalités. Vous pouvez également relancer le tutoriel à tout moment via le bouton **"Aide"** dans le panneau de contrôles système.

## Guide pas à pas

### 1. Upload de documents

1. Naviguez vers l'onglet **"Documents"**
2. Glissez-déposez vos fichiers PDF dans la zone de drop, ou cliquez pour sélectionner
3. Le système lance automatiquement :
   - Extraction du texte
   - Découpage en chunks (morceaux de texte)
   - Génération d'embeddings (vectorisation)
   - Extraction automatique des métadonnées (enrichissement)

**Astuce** : Vous pouvez uploader plusieurs PDFs en une seule fois. Le traitement se fait automatiquement pour tous les fichiers.

### 2. Charger un modèle LLM

1. Passez à l'onglet **"Chat"**
2. Dans le panneau de gauche, sélectionnez un modèle dans le menu déroulant
3. Cliquez sur **"Charger"** pour télécharger et initialiser le modèle

**Recommandations** :
- **Modèles 3B+** : Recommandés pour la revue littéraire (meilleure qualité)
- **Llama 3.1 8B** : Excellent équilibre qualité/performance (recommandé par défaut)
- **Qwen 4B** : Optimisé pour le mode Hands-Free (réponses courtes)

**Note** : Le premier téléchargement d'un modèle peut prendre quelques minutes (3-8 GB selon le modèle). Les modèles sont mis en cache localement pour les utilisations suivantes.

### 3. Poser une question

Une fois le modèle chargé :

1. Saisissez votre question dans le champ de texte en bas du panneau de chat
2. Appuyez sur **Entrée** ou cliquez sur le bouton d'envoi
3. Le système :
   - Trouve les passages pertinents dans vos documents (RAG)
   - Génère une réponse basée sur ces passages
   - Affiche les citations sources [Source X]

**Exemples de questions** :
- "Quelle est la méthodologie utilisée dans ces articles ?"
- "Comparez les résultats des études A et B"
- "Quels sont les points communs entre tous les documents ?"

### 4. Générer une revue littéraire

Pour générer une revue complète de vos documents :

1. Assurez-vous d'avoir au moins un document uploadé et un modèle chargé
2. Dans l'onglet **"Chat"**, cliquez sur le bouton **"RAG Revue Littéraire"**
3. Le système va :
   - Analyser chaque document individuellement
   - Extraire les métadonnées structurées (question de recherche, méthodologie, résultats, limitations)
   - Générer une synthèse finale complète

**Durée** : Compte ~1-2 minutes par document selon la taille et la complexité.

### 5. Mode Hands-Free (optionnel)

Pour une interaction vocale complète :

1. Passez à l'onglet **"Hands-Free"**
2. Cliquez sur le bouton micro pour activer l'écoute
3. Parlez votre question
4. L'assistant répond vocalement

**Raccourcis clavier** :
- **Espace** : Activer/désactiver l'écoute
- **Échap** : Arrêter/interrompre
- **Ctrl+Entrée** : Envoyer le message
- **M** : Muter le micro

**Configuration** : Le mode Hands-Free nécessite un serveur TTS séparé (voir section Configuration avancée).

## Fonctionnalités détaillées

### Upload et gestion de documents

- **Drag & Drop multi-fichiers** : Uploadez plusieurs PDFs simultanément
- **Workflow automatique** : Extraction, chunking et embeddings automatiques
- **Visualisation** : Consultez vos documents dans la liste, renommez-les, visualisez les PDFs
- **Statistiques** : Suivez le nombre de documents, chunks et embeddings en temps réel

### Sélection et chargement de modèles

Le sélecteur de modèles affiche 10 modèles triés par score global. Chaque modèle est évalué sur 5 critères :

| Critère | Description |
|---------|-------------|
| **Qualité** | Précision et pertinence des réponses |
| **Cohérence** | Consistance logique du raisonnement |
| **Agentic** | Capacité à suivre des instructions complexes |
| **Latence** | Vitesse d'inférence (plus c'est rapide, mieux c'est) |
| **Contexte** | Taille de fenêtre contextuelle (plus grand = mieux) |

Les modèles compatibles avec les agents (3B+) affichent un badge **"Agents"**. Au survol, les 5 critères détaillés apparaissent avec barres de progression colorées.

**Mode comparaison** : Activez le mode "Compare" pour charger deux modèles simultanément et comparer leurs réponses.

### Chat RAG avec citations

Le système utilise **RAG (Retrieval Augmented Generation)** :

1. **Recherche sémantique** : Votre question est convertie en vecteur et comparée aux embeddings de vos documents
2. **Sélection des chunks** : Les passages les plus pertinents sont sélectionnés (Top N, configurable)
3. **Génération** : Le modèle LLM génère une réponse basée sur ces passages
4. **Citations** : Chaque réponse inclut des références [Source X] cliquables pour voir le passage original

**Configuration RAG** : Dans le panneau "System Controls", ajustez :
- **Top N** : Nombre de chunks à utiliser (1-20, défaut: 5)
- **Temperature** : Créativité des réponses (0 = précis, 2 = créatif)
- **Max Tokens** : Longueur maximale des réponses (100-2000)

### Revue littéraire automatique

Le système de revue littéraire génère automatiquement des revues académiques structurées :

**Workflow** :
1. **Analyse par document** (1 appel LLM par document) :
   - Métadonnées (titre, auteurs, année, domaine)
   - Question de recherche
   - Méthodologie
   - Résultats clés
   - Limitations

2. **Synthèse finale** (1 appel LLM) :
   - Assemblage des analyses individuelles
   - Mode comparaison si documents liés, sinon mode PORTFOLIO
   - Organisation thématique
   - Citations traçables

**Export** : La revue peut être exportée au format HTML pour utilisation externe.

### Mode Hands-Free

Interaction vocale complète avec barge-in automatique :

- **Barge-in** : Si vous parlez pendant que l'assistant répond, il s'arrête automatiquement
- **TTS en streaming** : Lecture phrase par phrase avec bulle animée
- **Modèle dédié** : Utilise "Qwen 4B Instruct" optimisé pour réponses orales courtes

**Installation du serveur TTS** (optionnel) :
```bash
cd tts-server
npm install
npm start
```

Le serveur écoute sur `http://localhost:3001/api/tts`. Si non disponible, le mode Hands-Free utilise `speechSynthesis` du navigateur (half-duplex).

### Export/Import de base vectorielle

**Export** :
- Exportez votre base vectorielle complète (documents, chunks, embeddings) au format JSON
- Permet de sauvegarder votre travail et de le réutiliser plus tard

**Import** :
- Importez une base vectorielle précédemment exportée
- Pratique pour partager des collections de documents avec d'autres utilisateurs

**Localisation** : Tout est stocké dans le navigateur (IndexedDB) - aucune donnée n'est envoyée à un serveur.

## Configuration avancée

### Contrôles système

Dans le panneau "System Controls" (visible dans l'onglet Chat et Hands-Free) :

- **Temperature** (0-2) : Contrôle la créativité des réponses
- **RAG Top N** (1-20) : Nombre de chunks utilisés pour le contexte
- **Max Tokens** (100-2000) : Longueur maximale des réponses
- **System Prompt** : Personnalisez le comportement de l'assistant

### Serveur TTS (Mode Hands-Free)

Pour utiliser le serveur TTS dédié :

1. **Installer les dépendances** :
   ```bash
   cd tts-server
   npm install
   ```

2. **Lancer le serveur** :
   ```bash
   npm start
   ```
   Ou en parallèle avec l'app principale :
   ```bash
   npm run dev:all
   ```

Le serveur TTS utilise `say` (macOS) + `afconvert` pour générer des fichiers WAV.

### Réglages du barge-in

Les seuils de détection vocale sont dans `src/audio/EchoBargeIn.js`. Ajustez selon votre environnement :

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `THRESH_RMS` | 0.012 | Seuil détection voix |
| `THRESH_NCC` | 0.2 | Seuil corrélation (utilisateur vs TTS) |
| `HANGOVER_MS` | 300 | Anti-oscillation (ms) |

**Debug** : Activez les logs détaillés :
```javascript
window.DEBUG_ECHO_BARGE_IN = true;
```

## FAQ

### Puis-je utiliser l'application sans connexion internet ?

**Oui**, une fois l'application lancée et les modèles téléchargés, vous pouvez travailler entièrement hors ligne. Seul le premier téléchargement des modèles nécessite une connexion.

### Les données sont-elles envoyées à un serveur ?

**Non**. Tout le traitement se fait dans votre navigateur :
- PDFs : jamais uploadés
- Extraction : PDF.js côté client
- Embeddings : Transformers.js local
- LLM : WebLLM local (modèles téléchargés une fois)
- Stockage : IndexedDB dans votre navigateur

### Pourquoi le premier chargement d'un modèle est-il lent ?

Les modèles LLM font plusieurs GB (3-8 GB selon le modèle). Le premier téléchargement peut prendre quelques minutes selon votre connexion. Les modèles sont ensuite mis en cache pour les utilisations suivantes.

### Quel modèle choisir ?

- **Pour la revue littéraire** : Llama 3.1 8B ou DeepSeek R1 7B (qualité supérieure)
- **Pour le chat rapide** : Llama 3.2 3B ou Qwen 2.5 3B (plus rapide, moins de RAM)
- **Pour le Hands-Free** : Qwen 4B Instruct (optimisé pour réponses courtes)

### Comment réinitialiser le tutoriel ?

Cliquez sur le bouton **"Aide"** dans le panneau System Controls, ou supprimez les clés de localStorage :
```javascript
localStorage.removeItem('literature-reviewer-tutorial');
localStorage.removeItem('literature-reviewer-tutorial-completed');
```

### Le mode Hands-Free ne coupe pas quand je parle

Vérifiez :
1. Que le serveur TTS est lancé et accessible
2. Les permissions microphone dans le navigateur
3. Les seuils de détection vocale (voir section Configuration avancée)

## Dépannage

### L'application ne démarre pas

- Vérifiez que Node.js 18+ est installé : `node --version`
- Réinstallez les dépendances : `rm -rf node_modules && npm install`
- Vérifiez les logs dans la console du navigateur

### Les modèles ne se chargent pas

- Vérifiez que WebGPU est activé dans votre navigateur (chrome://gpu pour Chrome)
- Si WebGPU n'est pas disponible, le système bascule automatiquement sur WASM (plus lent)
- Vérifiez votre espace disque (chaque modèle fait plusieurs GB)

### Les PDFs ne s'extraient pas

- Vérifiez que le PDF n'est pas protégé par mot de passe
- Assurez-vous que le PDF contient du texte (pas uniquement des images)
- Consultez les logs dans la console pour plus de détails

### Les réponses sont lentes

- Réduisez le nombre de chunks (Top N) dans System Controls
- Utilisez un modèle plus petit (3B au lieu de 7B/8B)
- Fermez d'autres onglets pour libérer de la mémoire

### Le mode Hands-Free ne fonctionne pas

- Vérifiez que le serveur TTS est lancé (pour macOS)
- Activez les permissions microphone dans les paramètres du navigateur
- Si le serveur TTS n'est pas disponible, le mode utilise `speechSynthesis` (half-duplex)

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Vanilla JS (ES Modules) |
| Build | Vite |
| Style | Tailwind CSS |
| PDF | PDF.js |
| Embeddings | Transformers.js (all-MiniLM-L6-v2, 384 dim) |
| LLM | WebLLM (Llama 3.1/3.2, Qwen 2.5, Phi 3.5, Mistral 7B, DeepSeek R1, Hermes 3) |
| Visualisation | D3.js, GSAP |
| Stockage | IndexedDB |

## Privacy

**Toutes les données restent sur votre machine** :
- PDFs : jamais uploadés
- Extraction : client-side via PDF.js
- Embeddings : générés localement avec Transformers.js
- Vector database : stockée en mémoire et IndexedDB
- LLM : exécuté localement via WebLLM

Aucune donnée ne quitte votre navigateur.

## Compatibilité navigateurs

| Navigateur | WebGPU | WASM | Status |
|------------|--------|------|--------|
| Chrome 113+ | Oui | Oui | Support complet |
| Edge 113+ | Oui | Oui | Support complet |
| Safari 17+ | Partiel | Oui | Support WASM uniquement |
| Firefox | Non | Oui | Support WASM uniquement (plus lent) |

## Build pour production

```bash
npm run build
npm run preview
```

Les fichiers sont générés dans le dossier `dist/`.

## Licence

MIT

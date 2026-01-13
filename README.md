# Local LLM Literature Reviewer

Application web client-side pour la revue de litterature scientifique. Utilise WebLLM pour le raisonnement et Transformers.js pour les embeddings. Aucune donnee ne quitte le navigateur.

## Vue d'ensemble

```
PDF --> Extraction --> Chunking --> Embeddings --> Vector Store --> RAG --> LLM
```

Importez vos articles PDF, vectorisez automatiquement le contenu, puis interrogez vos documents via un chatbot RAG ou generez des visualisations interactives.

## Fonctionnalites principales

- Upload drag-and-drop multi-fichiers
- Extraction PDF (PDF.js) + chunking semantique
- Embeddings Transformers.js (all-MiniLM-L6-v2, 384 dim)
- Vector store custom avec recherche cosine
- Chat RAG avec citations de sources
- Export/Import base vectorielle complete
- Historique des conversations

## Agents Visuels

Quatre agents specialises generent des visualisations interactives a partir de vos documents (necessite modele 3B+).

| Agent | Description | Technologie |
|-------|-------------|-------------|
| **Hub** | Heatmap de couverture thematique documents/themes | D3.js |
| **Atlas** | Graphe de force des concepts et leurs relations | D3.js |
| **Timeline** | Chronologie des idees et publications | D3.js |
| **Narrative** | Presentation scrollytelling animee | GSAP |

### Hub (Exploration Hub)
Dashboard analytique complet avec 4 onglets :
- Vue d'ensemble : statistiques globales, metriques qualite, carte de couverture
- Themes : cards filtrables par type (concept, methode, application, contexte) et statut
- Affirmations : liste triable avec score de confiance et detection de contradictions
- Preuves : index des chunks sources avec navigation

### Atlas (Concept Atlas)
Cartographie les concepts extraits et leurs connexions. Les noeuds representent les idees, les liens leurs relations semantiques.

### Timeline (Influence Timeline)
Visualise l'evolution temporelle des publications et concepts. Permet d'identifier les pivots et tendances.

### Narrative (Scrollytelling)
Genere une narration guidee par le scroll. Presente les insights cles avec transitions animees.

## Selection de Modeles

Le selecteur de modeles affiche 10 modeles tries par score global. Chaque modele est evalue sur 5 criteres :

| Critere | Description | Type |
|---------|-------------|------|
| Qualite | Precision et pertinence des reponses | Positif |
| Coherence | Consistance logique du raisonnement | Positif |
| Agentic | Capacite a suivre des instructions complexes | Positif |
| Latence | Vitesse d'inference (inverse) | Negatif |
| Contexte | Taille de fenetre contextuelle (inverse) | Negatif |

Les modeles compatibles avec les agents (3B+) affichent un badge. Au survol, les 5 criteres detailles apparaissent avec barres de progression colorees.

## Revue Littéraire RAG

Le système de revue littéraire permet de générer automatiquement des revues de littérature scientifique à partir de vos documents PDF.

### Fonctionnalités

- **Analyse par document** : Extraction structurée JSON pour chaque document (métadonnées, question de recherche, méthodologie, résultats, limitations)
- **Synthèse finale** : Assemblage automatique des analyses en revue complète
- **Mode adaptatif** : Comparaison si documents liés, sinon mode PORTFOLIO
- **Retrieval optimisé** : TopK chunks par document avec priorité page 1/abstract/conclusion
- **Citations traçables** : Références aux sources utilisées

### Utilisation

1. Chargez vos documents PDF dans l'onglet Documents
2. Attendez l'extraction et l'indexation (chunks + embeddings)
3. Cliquez sur "Revue Littéraire" dans l'interface
4. Le système génère automatiquement une revue structurée

### Workflow technique

```
1. Analyse individuelle (1 appel LLM par document)
   → Extraction JSON structurée
   
2. Synthèse finale (1 appel LLM)
   → Assembly des fiches JSON
   → Mode comparaison ou PORTFOLIO
```

Voir `CHANGELOG.md` pour les détails techniques complets.

## Mode Hands-Free

Le mode Hands-Free permet une conversation vocale complète avec l'assistant.

### Fonctionnalités

- **Barge-in automatique** : Détection intelligente de la voix utilisateur vs TTS via corrélation NCC
- **TTS en streaming** : Lecture phrase par phrase avec bulle animée
- **Interruption immédiate** : Si l'utilisateur parle pendant le TTS, arrêt automatique
- **Modèle dédié** : Utilise "Qwen 4B Instruct" optimisé pour réponses orales courtes

### Installation et lancement

1. **Installer les dépendances du serveur TTS** :
   ```bash
   cd tts-server && npm install
   ```

2. **Lancer le serveur TTS** (dans un terminal) :
   ```bash
   cd tts-server && npm start
   ```
   Le serveur écoute sur `http://localhost:3001/api/tts`

3. **Lancer l'application** (dans un autre terminal) :
   ```bash
   npm run dev
   ```

   **OU lancer les deux en parallèle** :
   ```bash
   npm run dev:all
   ```

### Configuration

- **Endpoint TTS** : Configuré dans `src/ui/HandsFreePanel.js` (ligne ~264)
- **Seuils NCC** : Ajustables dans `src/audio/EchoBargeIn.js` (voir section "Réglages" ci-dessous)
- **Fallback** : Si le serveur TTS n'est pas disponible, utilise `speechSynthesis` (half-duplex)

### Réglages du barge-in

Les seuils sont dans `src/audio/EchoBargeIn.js` (constructeur). Ajustez selon votre environnement :

| Paramètre | Défaut | Description | Ajustement |
|-----------|--------|-------------|------------|
| `THRESH_RMS` | 0.012 | Seuil VAD (détection voix) | **0.008** si ne détecte pas votre voix<br>**0.020** si coupe trop facilement |
| `THRESH_NCC` | 0.2 | Seuil corrélation (utilisateur vs TTS) | **0.15** si coupe même sans parler<br>**0.25** si ne coupe pas quand vous parlez |
| `HANGOVER_MS` | 300 | Anti-oscillation (ms) | **200** pour plus réactif<br>**400** si oscillations |
| `FRAME_SIZE` | 2048 | Taille frame audio | **1024** pour plus réactif (mais plus bruité) |
| `VOICE_STREAK_THRESH` | 2 | Frames consécutives avec voix | **3** si faux positifs fréquents |

**Debug** : Activez les logs détaillés dans la console :
```javascript
window.DEBUG_ECHO_BARGE_IN = true;
```

### Tests et dépannage

1. **Test rapide** :
   ```bash
   # Terminal 1: Serveur TTS
   cd tts-server && npm install && npm start
   
   # Terminal 2: Front
   npm run dev
   ```

2. **Vérifier l'endpoint TTS** :
   - Ouvrir `http://localhost:3001/api/tts?text=bonjour` dans le navigateur
   - Doit télécharger un fichier WAV

3. **Si ça ne coupe pas quand vous parlez** :
   - Vérifier que `attachTTSOutput(audioEl)` est appelé (logs console)
   - Baisser `THRESH_RMS` à 0.008
   - Vérifier que NCC change (debug activé)

4. **Si ça coupe trop facilement** :
   - Monter `THRESH_RMS` à 0.020
   - Descendre `THRESH_NCC` à 0.15
   - Monter `VOICE_STREAK_THRESH` à 3

5. **Audio double/écho** :
   - L'élément audio est automatiquement muté (`audioEl.muted = true`)
   - La sortie se fait uniquement via WebAudio

### Notes techniques

- Le serveur TTS utilise `say` (macOS) + `afconvert` pour générer des fichiers WAV
- Le barge-in utilise la corrélation normalisée (NCC) entre le signal micro et la référence TTS
- EchoCancellation/noiseSuppression activés automatiquement sur le micro
- Debounce voix intégré (évite faux positifs)

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Vanilla JS (ES Modules) |
| Build | Vite |
| Style | Tailwind CSS |
| PDF | PDF.js |
| Embeddings | Transformers.js (all-MiniLM-L6-v2) |
| LLM | WebLLM (Llama 3.1/3.2, Qwen 2.5, Phi 3.5, Mistral 7B, DeepSeek R1, Hermes 3) |
| Visualisation | D3.js, GSAP |

## Architecture

```
src/
├── main.js                 # Entry point
├── state/state.js          # State centralise
├── rag/
│   ├── pdfExtract.js       # Extraction PDF
│   ├── chunker.js          # Chunking semantique
│   ├── embeddings.js       # Transformers.js
│   └── search.js           # Recherche cosine
├── llm/
│   ├── webllm.js           # WebLLM integration
│   ├── chat.js             # Logique RAG + prompts
│   └── jsonRepair.js       # Reparation JSON LLM
├── agents/
│   ├── HubAgent.js         # Pipeline analyse + generation rapport
│   ├── HubReport.js        # Schema donnees + validation
│   ├── AtlasAgent.js       # Force graph concepts
│   ├── TimelineAgent.js    # Timeline chronologique
│   └── ScrollyAgent.js     # Scrollytelling GSAP
├── ui/
│   ├── ChatPanel.js        # Interface chat + agents
│   ├── HubDashboard.js     # Dashboard multi-onglets Hub
│   ├── HistoryPanel.js     # Historique conversations
│   ├── QuickUpload.js      # Workflow upload guide
│   └── ...
└── utils/
    ├── markdown.js         # Rendu GFM complet
    ├── keywordExtract.js   # Extraction mots-cles + claims
    ├── contradictionDetect.js # Detection contradictions
    └── exportViz.js        # Export PNG/SVG/JSON
```

## Local Development

### Prerequisites

- Node.js 18+
- Modern browser with WebGPU support (Chrome 113+, Edge 113+)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/Rendu-3-AICG.git
cd Rendu-3-AICG

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

1. **Upload Documents**: Drag PDFs into the dropzone or use Quick Upload
2. **Extract Text**: Click "Extract All" or extract individual documents
3. **Generate Embeddings**: Click "Generate Embeddings" to vectorize all chunks
4. **Search**: Use the Search tab to test semantic queries
5. **Export**: Save your vector database for later use

## Privacy

All processing happens locally in your browser:

- PDFs are never uploaded to any server
- Text extraction runs client-side via PDF.js
- Embeddings are generated locally using Transformers.js
- Vector database is stored in browser memory
- Export creates a local JSON file

No data leaves your machine.

## Browser Compatibility

| Browser | WebGPU | WASM | Status |
|---------|--------|------|--------|
| Chrome 113+ | Yes | Yes | Full support |
| Edge 113+ | Yes | Yes | Full support |
| Safari 17+ | Partial | Yes | WASM fallback |
| Firefox | No | Yes | WASM only |

## License

MIT

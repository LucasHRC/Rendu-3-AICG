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
Analyse la couverture de chaque document sur les themes identifies. Affiche une matrice interactive ou l'intensite represente la pertinence.

### Atlas (Concept Atlas)
Cartographie les concepts extraits et leurs connexions. Les noeuds representent les idees, les liens leurs relations semantiques.

### Timeline (Influence Timeline)
Visualise l'evolution temporelle des publications et concepts. Permet d'identifier les pivots et tendances.

### Narrative (Scrollytelling)
Genere une narration guidee par le scroll. Presente les insights cles avec transitions animees.

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Vanilla JS (ES Modules) |
| Build | Vite |
| Style | Tailwind CSS |
| PDF | PDF.js |
| Embeddings | Transformers.js (all-MiniLM-L6-v2) |
| LLM | WebLLM (Llama 3.2, Qwen, Phi, Mistral) |
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
│   ├── HubAgent.js         # Heatmap coverage
│   ├── AtlasAgent.js       # Force graph concepts
│   ├── TimelineAgent.js    # Timeline chronologique
│   └── ScrollyAgent.js     # Scrollytelling GSAP
├── ui/
│   ├── ChatPanel.js        # Interface chat + agents
│   ├── HistoryPanel.js     # Historique conversations
│   ├── QuickUpload.js      # Workflow upload guide
│   └── ...
└── utils/
    ├── markdown.js         # Rendu GFM complet
    ├── keywordExtract.js   # Extraction mots-cles
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

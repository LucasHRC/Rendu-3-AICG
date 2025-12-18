# Local LLM Literature Reviewer

A privacy-first, fully browser-based AI research assistant. This application runs entirely on the client side using WebLLM for reasoning and Transformers.js for embeddings. No data leaves your browser.

## Overview

Upload PDF research papers, automatically extract and vectorize their content, then use semantic search to find relevant passages. The RAG (Retrieval Augmented Generation) engine enables context-aware interactions with your documents.

```
PDF Upload --> Text Extraction --> Chunking --> Embeddings --> Vector Store --> Semantic Search
```

## Features

- Drag-and-drop PDF upload with multi-file support
- Automatic text extraction using PDF.js
- Intelligent semantic chunking (respects sentence boundaries)
- Vector embeddings with Transformers.js (all-MiniLM-L6-v2, 384 dimensions)
- Custom vector store with cosine similarity search
- WebGPU acceleration with WASM fallback
- Export/Import vector database
- Real-time console and debug tools

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Vanilla JavaScript (ES Modules) |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| PDF Processing | PDF.js |
| Embeddings | Transformers.js (Xenova/all-MiniLM-L6-v2) |
| LLM Inference | WebLLM (planned) |
| Deployment | GitHub Pages |

## Architecture

```
src/
├── main.js              # Application entry point
├── state/
│   └── state.js         # Centralized state management
├── rag/
│   ├── pdfExtract.js    # PDF text extraction
│   ├── chunker.js       # Semantic text chunking
│   ├── embeddings.js    # Transformers.js integration
│   └── search.js        # Cosine similarity search
├── ui/
│   ├── Dropzone.js      # File upload component
│   ├── FileList.js      # Document management
│   ├── IngestionPanel.js # Vector store UI
│   ├── PDFViewer.js     # PDF preview modal
│   └── QuickUpload.js   # Guided upload workflow
└── utils/
    ├── fileUtils.js     # File validation
    └── namingSuggestions.js
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

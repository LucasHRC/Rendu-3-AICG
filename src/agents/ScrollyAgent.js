/**
 * ScrollyAgent - Narration visuelle avec GSAP ScrollTrigger
 */

import { state, addLog } from '../state/state.js';
import { generateCompletion, isModelReady } from '../llm/webllm.js';
import { repairJSON, createFallbackJSON } from '../llm/jsonRepair.js';
import { prepareKeywordsContext } from '../utils/keywordExtract.js';
// showVisualization replaced with direct DOM injection

let currentData = null;

/**
 * Génère la visualisation Scrollytelling
 */
export async function generateScrollyVisualization(onProgress, onComplete) {
  addLog('info', 'ScrollyAgent: Génération de la narration...');

  if (state.docs.length === 0) {
    addLog('warning', 'ScrollyAgent: Aucun document disponible');
    onComplete(null);
    return;
  }

  onProgress(10, 'Préparation du contenu...');

  let scrollyData;

  if (isModelReady('primary')) {
    scrollyData = await generateNarrativeWithLLM(onProgress);
  } else {
    scrollyData = generateNarrativeFromDocs();
  }

  onProgress(80, 'Rendu de la narration...');

  const element = createScrollyElement(scrollyData);
  currentData = scrollyData;
  
  const agentContent = document.getElementById('agent-content');
  if (agentContent) {
    agentContent.innerHTML = '';
    agentContent.appendChild(element);
  }

  onProgress(100, 'Terminé');
  onComplete(scrollyData);

  addLog('success', 'ScrollyAgent: Narration générée');
}

/**
 * Génère la narration avec le LLM
 */
async function generateNarrativeWithLLM(onProgress) {
  const keywordsContext = prepareKeywordsContext();
  const docNames = state.docs.map(d => d.displayName || d.filename.replace(/\.pdf$/i, ''));

  const prompt = `Crée une narration structurée pour présenter ces documents de recherche.

Documents: ${docNames.join(', ')}
Concepts clés: ${keywordsContext.globalConcepts.slice(0, 10).join(', ')}

Génère un JSON avec cette structure:
{
  "sections": [
    {"type": "intro", "title": "Introduction", "text": "Texte d'intro...", "highlight": ["concept1"]},
    {"type": "document", "title": "Doc 1", "text": "Analyse...", "docId": "...", "highlight": []},
    {"type": "comparison", "title": "Comparaison", "docs": ["doc1", "doc2"], "insight": "Point clé..."},
    {"type": "conclusion", "title": "Conclusion", "key_points": ["point1", "point2"]}
  ]
}

Types: "intro", "document", "comparison", "insight", "conclusion"
highlight: concepts clés à mettre en évidence

Réponds UNIQUEMENT avec le JSON.`;

  try {
    onProgress(40, 'Génération narrative...');

    const response = await generateCompletion([
      { role: 'system', content: 'Tu crées des narrations structurées en JSON. Réponds en JSON valide.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.5, max_tokens: 1000 });

    onProgress(60, 'Parsing...');

    const parsed = repairJSON(response);
    if (parsed && parsed.sections) {
      return parsed;
    }
  } catch (error) {
    addLog('warning', `ScrollyAgent LLM error: ${error.message}`);
  }

  return generateNarrativeFromDocs();
}

/**
 * Génère la narration à partir des documents (fallback)
 */
function generateNarrativeFromDocs() {
  const sections = [];
  const keywordsContext = prepareKeywordsContext();

  // Introduction
  sections.push({
    type: 'intro',
    title: 'Vue d\'ensemble',
    text: `Cette analyse couvre ${state.docs.length} document(s) de recherche. Les concepts principaux identifiés sont : ${keywordsContext.globalConcepts.slice(0, 5).join(', ')}.`,
    highlight: keywordsContext.globalConcepts.slice(0, 3)
  });

  // Section par document
  state.docs.forEach((doc, i) => {
    const docName = doc.displayName || doc.filename.replace(/\.pdf$/i, '');
    const docConcepts = keywordsContext.perDocument.find(d => d.docId === doc.id)?.concepts || [];
    
    sections.push({
      type: 'document',
      title: docName,
      text: `Ce document aborde les thèmes suivants : ${docConcepts.slice(0, 5).join(', ')}. ${doc.pageCount ? `Il contient ${doc.pageCount} page(s).` : ''}`,
      docId: doc.id,
      highlight: docConcepts.slice(0, 2)
    });
  });

  // Comparaison si plusieurs docs
  if (state.docs.length >= 2) {
    sections.push({
      type: 'comparison',
      title: 'Points de convergence',
      docs: state.docs.slice(0, 2).map(d => d.displayName || d.filename),
      insight: `Les documents partagent des thèmes communs autour de : ${keywordsContext.globalConcepts.slice(0, 3).join(', ')}.`
    });
  }

  // Conclusion
  sections.push({
    type: 'conclusion',
    title: 'Synthèse',
    key_points: [
      `${state.docs.length} documents analysés`,
      `${keywordsContext.globalConcepts.length} concepts identifiés`,
      keywordsContext.themes.length > 0 ? `Thème principal : ${keywordsContext.themes[0]?.main}` : 'Analyse thématique disponible'
    ]
  });

  return { sections };
}

/**
 * Crée l'élément DOM du scrollytelling
 */
function createScrollyElement(data) {
  const container = document.createElement('div');
  container.className = 'w-full h-full flex flex-col overflow-hidden';

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4 flex-shrink-0">
      <h3 class="text-lg font-bold text-gray-800">Narrative Scrollytelling</h3>
      <div class="text-sm text-gray-500">${data.sections.length} sections</div>
    </div>
    <div id="scrolly-container" class="flex-1 overflow-y-auto pr-2 scroll-smooth">
      ${data.sections.map((section, i) => createSectionHTML(section, i)).join('')}
    </div>
  `;

  // Initialiser GSAP après insertion
  setTimeout(() => initGSAPAnimations(container), 100);

  return container;
}

/**
 * Crée le HTML d'une section
 */
function createSectionHTML(section, index) {
  const typeStyles = {
    intro: 'border-l-blue-500 bg-blue-50',
    document: 'border-l-purple-500 bg-purple-50',
    comparison: 'border-l-green-500 bg-green-50',
    insight: 'border-l-yellow-500 bg-yellow-50',
    conclusion: 'border-l-gray-500 bg-gray-50'
  };

  const typeIcons = {
    intro: '📖',
    document: '📄',
    comparison: '⚖️',
    insight: '💡',
    conclusion: '✨'
  };

  const style = typeStyles[section.type] || 'border-l-gray-300 bg-gray-50';
  const icon = typeIcons[section.type] || '📌';

  let content = '';

  if (section.text) {
    // Mettre en évidence les concepts
    let text = section.text;
    if (section.highlight) {
      section.highlight.forEach(h => {
        const regex = new RegExp(`(${h})`, 'gi');
        text = text.replace(regex, '<span class="font-semibold text-purple-700 bg-purple-100 px-1 rounded">$1</span>');
      });
    }
    content = `<p class="text-gray-700 leading-relaxed">${text}</p>`;
  }

  if (section.insight) {
    content += `<p class="text-green-700 italic mt-2">"${section.insight}"</p>`;
  }

  if (section.key_points) {
    content += `
      <ul class="mt-3 space-y-1">
        ${section.key_points.map(p => `<li class="text-gray-600 flex items-center gap-2"><span class="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>${p}</li>`).join('')}
      </ul>
    `;
  }

  if (section.docs) {
    content += `
      <div class="flex gap-2 mt-3">
        ${section.docs.map(d => `<span class="px-2 py-1 text-xs bg-white rounded-full border border-gray-200">${d}</span>`).join('')}
      </div>
    `;
  }

  return `
    <div class="scrolly-section opacity-0 translate-y-8 mb-6 p-5 rounded-xl border-l-4 ${style} transition-all duration-500" data-section="${index}">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-2xl">${icon}</span>
        <h4 class="text-lg font-semibold text-gray-800">${section.title}</h4>
        <span class="ml-auto text-xs text-gray-400 uppercase">${section.type}</span>
      </div>
      ${content}
    </div>
  `;
}

/**
 * Initialise les animations GSAP ScrollTrigger
 */
function initGSAPAnimations(container) {
  const scrollContainer = container.querySelector('#scrolly-container');
  const sections = container.querySelectorAll('.scrolly-section');

  if (!scrollContainer || !sections.length) return;

  // Vérifier si GSAP est disponible
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    // Fallback: animation CSS simple
    sections.forEach((section, i) => {
      setTimeout(() => {
        section.classList.remove('opacity-0', 'translate-y-8');
      }, i * 200);
    });
    addLog('warning', 'GSAP non disponible, utilisation d\'animations CSS');
    return;
  }

  // Enregistrer ScrollTrigger
  gsap.registerPlugin(ScrollTrigger);

  // Animer chaque section à l'entrée dans le viewport
  sections.forEach((section, i) => {
    // Animation initiale progressive
    gsap.fromTo(section, 
      { 
        opacity: 0, 
        y: 50,
        scale: 0.95
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.6,
        delay: i * 0.15,
        ease: 'power2.out'
      }
    );

    // ScrollTrigger pour les re-animations au scroll
    ScrollTrigger.create({
      trigger: section,
      scroller: scrollContainer,
      start: 'top 80%',
      onEnter: () => {
        gsap.to(section, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.4
        });
      },
      onLeaveBack: () => {
        gsap.to(section, {
          opacity: 0.5,
          y: 20,
          scale: 0.98,
          duration: 0.3
        });
      }
    });
  });

  // Animation des highlights au hover
  const highlights = container.querySelectorAll('.scrolly-section span.bg-purple-100');
  highlights.forEach(hl => {
    hl.addEventListener('mouseenter', () => {
      gsap.to(hl, { scale: 1.1, duration: 0.2 });
    });
    hl.addEventListener('mouseleave', () => {
      gsap.to(hl, { scale: 1, duration: 0.2 });
    });
  });
}

export function getScrollyData() {
  return currentData;
}

// Écouter l'événement de génération
window.addEventListener('viz:generate', async (e) => {
  if (e.detail.agent.id === 'scrolly') {
    await generateScrollyVisualization(e.detail.onProgress, e.detail.onComplete);
  }
});


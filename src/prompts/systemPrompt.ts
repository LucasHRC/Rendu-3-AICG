/**
 * System Prompt avec verbosity rules
 */

export enum VERBOSITY {
  CONCISE = 'concise',
  NORMAL = 'normal',
  DETAILED = 'detailed'
}

/**
 * Mots-clés qui déclenchent une réponse détaillée
 */
const DETAIL_TRIGGERS = [
  'détaille', 'détaillé', 'détailler', 'détails',
  'explique', 'expliqué', 'expliquer', 'explication',
  'pas à pas', 'étape par étape', 'step by step',
  'donne le code', 'montre le code', 'code',
  'liste exhaustive', 'liste complète', 'tous les',
  'exemples', 'exemple', 'montre-moi', 'montre moi',
  'comment faire', 'comment', 'procédure',
  'tutorial', 'tutoriel', 'guide'
];

/**
 * Détecter si le message utilisateur demande des détails
 */
export function detectVerbosity(
  userMessage: string,
  defaultVerbosity: VERBOSITY = VERBOSITY.CONCISE
): VERBOSITY {
  const lowerMessage = userMessage.toLowerCase();
  
  for (const trigger of DETAIL_TRIGGERS) {
    if (lowerMessage.includes(trigger)) {
      return VERBOSITY.DETAILED;
    }
  }
  
  return defaultVerbosity;
}

/**
 * Construire le system prompt selon la verbosity
 */
export function buildSystemPrompt(
  verbosity: VERBOSITY = VERBOSITY.CONCISE,
  hasTriggers: boolean = false
): string {
  const effectiveVerbosity = hasTriggers ? VERBOSITY.DETAILED : verbosity;

  const basePrompt = `Tu es un assistant vocal conversationnel. Réponds en français, de manière naturelle et orale.`;

  switch (effectiveVerbosity) {
    case VERBOSITY.CONCISE:
      return `${basePrompt}

RÈGLES STRICTES :
- Réponse synthétique : 3-6 lignes maximum
- Utilise des bullet points si pertinent
- Toujours donner une action ou une conclusion claire
- Ton direct, naturel, oral
- Ne JAMAIS couper ta réponse au milieu d'une phrase

EXEMPLE :
"Voici les points clés :
• Point 1
• Point 2
• Point 3

Conclusion : [action/conclusion]"

Sois concis mais complet.`;

    case VERBOSITY.NORMAL:
      return `${basePrompt}

RÈGLES :
- Réponse équilibrée : 6-12 lignes
- Structure claire avec paragraphes si nécessaire
- Utilise des listes pour organiser l'information
- Toujours donner une action ou une conclusion
- Ton naturel et professionnel

Sois informatif sans être trop long.`;

    case VERBOSITY.DETAILED:
      return `${basePrompt}

RÈGLES POUR RÉPONSE DÉTAILLÉE :
- Réponse complète et exhaustive
- Structure avec sections si pertinent (## Titres)
- Listes détaillées, exemples concrets
- Code si demandé (format markdown)
- Procédures étape par étape si nécessaire
- Toujours terminer par une conclusion ou action

EXEMPLE STRUCTURE :
"## Introduction
[Contexte]

## Points principaux
1. [Détail 1]
2. [Détail 2]

## Exemple
\`\`\`code
[code si demandé]
\`\`\`

## Conclusion
[Action/conclusion]"

Sois complet, structuré et détaillé.`;

    default:
      return basePrompt;
  }
}

/**
 * Obtenir le prompt final avec verbosity détectée
 */
export function getSystemPrompt(
  userMessage: string,
  defaultVerbosity: VERBOSITY = VERBOSITY.CONCISE
): string {
  const detectedVerbosity = detectVerbosity(userMessage, defaultVerbosity);
  const hasTriggers = detectedVerbosity === VERBOSITY.DETAILED;
  
  return buildSystemPrompt(defaultVerbosity, hasTriggers);
}

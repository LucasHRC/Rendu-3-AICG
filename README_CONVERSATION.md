# Conversation Mode - Documentation

## Vue d'ensemble

Conversation Mode est un système de conversation vocale 100% client-side utilisant WebLLM (WebGPU) pour le LLM et Web Speech API pour la synthèse vocale (TTS) et la reconnaissance vocale (STT).

## Compatibilité

### Recommandé
- **Chrome/Edge macOS** : Support complet de Web Speech API et WebGPU
- **Chrome/Edge Windows** : Support complet
- **Chrome/Edge Linux** : Support complet

### Limitations
- **Firefox** : STT non supporté (fallback manuel disponible)
- **Safari** : Support partiel (STT limité)
- **Mobile** : Support variable selon le navigateur

### WebGPU Requirements
- GPU compatible WebGPU (Chrome 113+, Edge 113+)
- Drivers à jour
- WebGPU activé dans les flags si nécessaire

## Architecture

```
src/
├── conversation/
│   ├── stateMachine.ts       # State machine (IDLE → LISTENING → ...)
│   ├── conversationStore.ts  # Store (messages, settings)
│   └── useConversation.ts   # Hook React principal
├── llm/
│   └── webllmClient.ts      # Wrapper WebLLM (streaming + abort)
├── audio/
│   ├── ttsWebSpeech.ts      # TTS Web Speech API
│   └── sttWebSpeech.ts      # STT Web Speech API + fallback
├── prompts/
│   └── systemPrompt.ts      # System prompt + verbosity
└── components/
    ├── ConversationMode.tsx # UI principale
    └── SettingsPanel.tsx     # Settings drawer
```

## Installation

```bash
npm install
npm run dev
```

## Utilisation

### Démarrage
1. Ouvrir l'application dans Chrome/Edge
2. Cliquer sur l'onglet "Conversation"
3. Attendre le chargement du modèle (première fois)
4. Cliquer sur le bouton micro pour démarrer

### Fonctionnalités

#### Push-to-Interrupt
- Appuyer sur **Espace** pendant que l'assistant parle ou génère
- Arrête immédiatement TTS et génération LLM
- Repasse en mode listening si auto-listen activé

#### Auto-Listen
- Après la fin du TTS, le micro se réactive automatiquement
- Configurable dans Settings

#### Verbosity
- **Concise** (défaut) : 3-6 lignes, bullet points
- **Normal** : 6-12 lignes, structuré
- **Detailed** : Réponse complète (déclenché automatiquement si mots-clés détectés)

#### Détection automatique de verbosity
Si le message utilisateur contient :
- "détaille", "explique", "pas à pas"
- "donne le code", "montre le code"
- "liste exhaustive", "tous les"
- "exemples", "comment faire"

→ La réponse passe automatiquement en mode **detailed**

## Settings

### Model (WebLLM)
Sélection du modèle WebLLM. Modèles recommandés pour conversation :
- **Qwen 2.5 3B** (2.5GB) - Rapide, optimisé oral
- **Llama 3.2 3B** (2.3GB) - Équilibré
- **Phi 3.5 Mini** (3.7GB) - Bonne qualité

### Voice (Web Speech API)
Sélection de la voix système. Les voix disponibles dépendent de votre OS.

### Verbosity
- **Concise** : Réponses courtes par défaut
- **Normal** : Réponses équilibrées
- **Detailed** : Réponses complètes (ou auto-détecté)

### Toggles
- **Auto-listen after speak** : Réactive le micro après TTS
- **Push-to-interrupt (Space)** : Active l'interruption par Espace
- **Server TTS (Bonus)** : Feature flag désactivé (coming later)

## Server TTS (Bonus) - Non implémenté

Cette fonctionnalité est prévue pour le futur mais n'est **pas encore implémentée**.

### Plan d'implémentation future
1. Créer un serveur TTS (ex: XTTS-v2, Coqui TTS)
2. Endpoint REST `/tts` acceptant `{ text, voice }`
3. Activer le toggle dans Settings
4. Fallback automatique vers Web Speech API si serveur indisponible

### Pour activer plus tard
1. Implémenter le client TTS serveur dans `src/audio/ttsServer.ts`
2. Modifier `useConversation.ts` pour utiliser le serveur si `serverTTSEnabled === true`
3. Tester le fallback

## Limitations

### STT (Speech Recognition)
- **Chrome/Edge uniquement** : Support natif complet
- **Firefox** : Non supporté → fallback manuel (input texte)
- **Safari** : Support limité, qualité variable
- **Permissions** : Nécessite autorisation microphone

### TTS (Speech Synthesis)
- **Voix système** : Dépend de l'OS (macOS, Windows, Linux)
- **Qualité variable** : Selon la voix sélectionnée
- **Pas de voix personnalisée** : Web Speech API uniquement

### WebLLM
- **Premier chargement** : Téléchargement du modèle (peut prendre plusieurs minutes)
- **RAM** : 2-8GB selon le modèle
- **WebGPU requis** : GPU compatible nécessaire

## Plan de test manuel

### 1. Micro on/off
- [ ] Cliquer sur le bouton micro → passe en "Listening..."
- [ ] Parler → transcription apparaît
- [ ] Cliquer à nouveau → passe en "idle"

### 2. Interruption (Space)
- [ ] Démarrer une conversation
- [ ] Pendant que l'assistant parle, appuyer sur Espace
- [ ] Vérifier que TTS s'arrête immédiatement
- [ ] Vérifier que génération LLM s'arrête

### 3. Auto-listen
- [ ] Activer "Auto-listen after speak" dans Settings
- [ ] Démarrer une conversation
- [ ] Après la fin du TTS, vérifier que le micro se réactive automatiquement

### 4. Chargement modèle
- [ ] Ouvrir l'application (première fois)
- [ ] Vérifier la progression du chargement (0-100%)
- [ ] Attendre la fin du chargement
- [ ] Vérifier que le bouton micro devient actif

### 5. Changement voix
- [ ] Ouvrir Settings
- [ ] Sélectionner une voix différente
- [ ] Démarrer une conversation
- [ ] Vérifier que la nouvelle voix est utilisée

### 6. Verbosity
- [ ] Tester avec message simple → réponse concise
- [ ] Tester avec "détaille-moi..." → réponse détaillée
- [ ] Changer verbosity dans Settings → tester

## Troubleshooting

### Micro ne fonctionne pas
- Vérifier les permissions navigateur
- Vérifier que Chrome/Edge est utilisé
- Vérifier que le micro n'est pas utilisé par une autre app

### Modèle ne charge pas
- Vérifier WebGPU : `chrome://gpu`
- Vérifier la connexion internet (téléchargement modèle)
- Vérifier la RAM disponible (2-8GB selon modèle)

### TTS ne fonctionne pas
- Vérifier qu'une voix est disponible : `speechSynthesis.getVoices()`
- Vérifier la console pour erreurs
- Essayer une autre voix dans Settings

### STT ne fonctionne pas
- Vérifier que Chrome/Edge est utilisé
- Vérifier les permissions microphone
- Vérifier la langue (fr-FR par défaut)

## Structure du code

### State Machine
- **États** : IDLE, LISTENING, TRANSCRIBING, THINKING, STREAMING, SPEAKING, ERROR
- **Transitions** : Explicites, validées
- **Interruption** : Via `interrupt()` qui abort la génération

### WebLLM Client
- **Chargement** : `loadModel(modelId, onProgress)`
- **Streaming** : `streamCompletion(engine, messages, systemPrompt, options)`
- **Abort** : Via `AbortController` dans state machine

### TTS Manager
- **Chunking** : Phrases ≤ 160 caractères
- **Stop** : `speechSynthesis.cancel()`
- **Voix** : Sélection automatique par langue ou manuelle

### STT Manager
- **Start/Stop** : Gestion propre
- **Erreurs** : Messages clairs (no-speech, denied, etc.)
- **Fallback** : Manuel si non supporté (à implémenter)

## Développement

### Ajouter un nouveau modèle
1. Ajouter dans `MODEL_CATALOG` (SettingsPanel.tsx)
2. Vérifier compatibilité WebLLM
3. Tester le chargement

### Modifier le system prompt
1. Éditer `src/prompts/systemPrompt.ts`
2. Modifier `buildSystemPrompt()` selon verbosity
3. Tester avec différents verbosity

### Ajouter une fonctionnalité
1. Étendre la state machine si nouvel état nécessaire
2. Modifier `useConversation.ts` pour orchestrer
3. Mettre à jour l'UI dans `ConversationMode.tsx`

## License

Voir LICENSE dans le repo principal.


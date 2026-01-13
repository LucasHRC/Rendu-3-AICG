/**
 * Hook React principal pour orchestrer Conversation Mode
 * Gère state machine + WebLLM + TTS + STT
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationStateMachine, ConversationState } from './stateMachine';
import { conversationStore, Message } from './conversationStore';
import { loadModel, streamCompletion, isModelLoaded, getCurrentEngine } from '../llm/webllmClient';
import { TTSManager } from '../audio/ttsWebSpeech';
import { STTManager, isSTTSupported } from '../audio/sttWebSpeech';
import { getSystemPrompt, VERBOSITY } from '../prompts/systemPrompt';
import { searchSimilarChunks, buildRAGContext } from '../rag/search';
import { state } from '../state/state';

export function useConversation() {
  const [state, setState] = useState<ConversationState>(ConversationState.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [statusText, setStatusText] = useState('');
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);

  const stateMachineRef = useRef(new ConversationStateMachine());
  const ttsManagerRef = useRef(new TTSManager());
  const sttManagerRef = useRef(new STTManager());

  // Écouter les changements d'état
  useEffect(() => {
    const unsubscribe = stateMachineRef.current.subscribe((newState) => {
      setState(newState);
      
      // Mettre à jour le texte de statut
      switch (newState) {
        case ConversationState.IDLE:
          setStatusText('');
          break;
        case ConversationState.LISTENING:
          setStatusText('Listening...');
          break;
        case ConversationState.TRANSCRIBING:
          setStatusText('Transcribing...');
          break;
        case ConversationState.THINKING:
          setStatusText('Thinking...');
          break;
        case ConversationState.STREAMING:
          setStatusText('Generating...');
          break;
        case ConversationState.SPEAKING:
          setStatusText('Speaking...');
          break;
        case ConversationState.ERROR:
          setStatusText('Error');
          break;
      }
    });

    return unsubscribe;
  }, []);

  // Charger les messages depuis le store
  useEffect(() => {
    setMessages(conversationStore.getMessages());
    const unsubscribe = conversationStore.subscribe(() => {
      setMessages(conversationStore.getMessages());
    });
    return unsubscribe;
  }, []);

  // Charger le modèle au démarrage
  useEffect(() => {
    const settings = conversationStore.getSettings();
    if (!isModelLoaded() && !isModelLoading) {
      setIsModelLoading(true);
      loadModel(settings.modelId, (progress) => {
        setModelLoadProgress(progress.progress);
      })
        .then(() => {
          setIsModelLoading(false);
        })
        .catch((error) => {
          console.error('[useConversation] Failed to load model:', error);
          setIsModelLoading(false);
          stateMachineRef.current.transition(ConversationState.ERROR);
        });
    }
  }, [isModelLoading]);

  // Ref pour startListening pour éviter dépendance circulaire
  const startListeningRef = useRef<(() => void) | null>(null);

  // Générer la réponse
  const generateResponse = useCallback(async (userMessage: string) => {
    if (!isModelLoaded()) {
      stateMachineRef.current.transition(ConversationState.ERROR);
      setStatusText('Model not loaded');
      return;
    }

    stateMachineRef.current.transition(ConversationState.THINKING);
    setCurrentText('');

    // === RAG RETRIEVAL ===
    let ragContext = '';
    if (state.vectorStore && state.vectorStore.length > 0) {
      try {
        setStatusText('Recherche de sources pertinentes...');
        const relevantChunks = await searchSimilarChunks(userMessage, 5);
        if (relevantChunks && relevantChunks.length > 0) {
          ragContext = buildRAGContext(relevantChunks);
          setStatusText(`Trouvé ${relevantChunks.length} source(s) pertinente(s)`);
        }
      } catch (error) {
        console.error('[RAG] Retrieval failed:', error);
        // Continue sans RAG si échec
      }
    }

    const engine = getCurrentEngine();
    const currentSettings = conversationStore.getSettings();
    
    // Construire le system prompt avec contexte RAG si disponible
    const baseSystemPrompt = getSystemPrompt(userMessage, currentSettings.verbosity as VERBOSITY);
    const systemPrompt = ragContext 
      ? `${baseSystemPrompt}\n\n### Contexte Récupéré (RAG):\n${ragContext}\n\nBASE TA RÉPONSE SUR LE CONTEXTE CI-DESSUS. Cite les sources comme [DocX • pY] si possible.`
      : baseSystemPrompt;
    
    const history = conversationStore.getMessages()
      .filter(m => m.role !== 'system')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    const abortController = stateMachineRef.current.createAbortController();

    try {
      const fullText = await streamCompletion(
        engine,
        history,
        systemPrompt,
        {
          temperature: 0.7,
          maxTokens: currentSettings.verbosity === 'detailed' ? 1024 : 512,
          onToken: (token, full) => {
            setCurrentText(full);
            stateMachineRef.current.transition(ConversationState.STREAMING);
          },
          abortSignal: abortController.signal
        }
      );

      // Ajouter le message assistant
      conversationStore.addMessage({
        role: 'assistant',
        content: fullText
      });

      // Parler la réponse
      stateMachineRef.current.transition(ConversationState.SPEAKING);
      
      await new Promise<void>((resolve) => {
        ttsManagerRef.current.speak(fullText, {
          voiceName: currentSettings.voiceName,
          rate: 1.0,
          pitch: 1.0,
          lang: 'fr-FR',
          onEnd: () => {
            resolve();
            // Auto-listen après TTS
            if (currentSettings.autoListen && startListeningRef.current) {
              setTimeout(() => {
                startListeningRef.current!();
              }, 500);
            } else {
              stateMachineRef.current.transition(ConversationState.IDLE);
            }
          },
          onError: (error) => {
            console.error('[useConversation] TTS error:', error);
            resolve();
            stateMachineRef.current.transition(ConversationState.IDLE);
          }
        });
      });
    } catch (error: any) {
      if (error.message?.includes('aborted')) {
        // Interruption normale
        return;
      }
      console.error('[useConversation] Generation error:', error);
      stateMachineRef.current.transition(ConversationState.ERROR);
      setStatusText(`Error: ${error.message || 'Unknown error'}`);
    }
  }, []);

  // Démarrer l'écoute
  const startListening = useCallback(() => {
    if (!isSTTSupported()) {
      stateMachineRef.current.transition(ConversationState.ERROR);
      setStatusText('Speech Recognition not supported');
      return;
    }

    // Ne pas démarrer si on est en train de parler (anti-echo)
    if (ttsManagerRef.current.getIsSpeaking()) {
      return;
    }

    stateMachineRef.current.transition(ConversationState.LISTENING);

    sttManagerRef.current.start({
      lang: 'fr-FR',
      continuous: true,
      interimResults: true,
      onResult: (result) => {
        if (result.isFinal && result.final.trim()) {
          // Transition vers transcription puis thinking
          stateMachineRef.current.transition(ConversationState.TRANSCRIBING);
          
          // Ajouter le message utilisateur
          const userMessage = conversationStore.addMessage({
            role: 'user',
            content: result.final.trim()
          });

          // Générer la réponse
          generateResponse(userMessage.content);
        }
      },
      onError: (error) => {
        console.error('[useConversation] STT error:', error);
        stateMachineRef.current.transition(ConversationState.ERROR);
        setStatusText(`STT Error: ${error}`);
      }
    });
  }, [generateResponse]);

  // Mettre à jour le ref
  startListeningRef.current = startListening;

  // Arrêter l'écoute
  const stopListening = useCallback(() => {
    sttManagerRef.current.stop();
    stateMachineRef.current.transition(ConversationState.IDLE);
  }, []);

  // Gérer l'interruption (Space key)
  const handleInterrupt = useCallback(() => {
    if (stateMachineRef.current.canInterrupt()) {
      ttsManagerRef.current.stop();
      stateMachineRef.current.interrupt();
      
      // Si auto-listen activé, repasser en listening
      const currentSettings = conversationStore.getSettings();
      if (currentSettings.autoListen && startListeningRef.current) {
        setTimeout(() => {
          startListeningRef.current!();
        }, 300);
      }
    }
  }, []);

  // Gérer la touche Space
  useEffect(() => {
    const currentSettings = conversationStore.getSettings();
    if (!currentSettings.pushToInterrupt) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          return;
        }
        handleInterrupt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInterrupt]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (state === ConversationState.LISTENING) {
      stopListening();
    } else if (state === ConversationState.IDLE || state === ConversationState.ERROR) {
      startListening();
    }
  }, [state, startListening, stopListening]);

  return {
    state,
    messages,
    currentText,
    statusText,
    isModelLoading,
    modelLoadProgress,
    toggleListening,
    handleInterrupt,
    startListening,
    stopListening
  };
}

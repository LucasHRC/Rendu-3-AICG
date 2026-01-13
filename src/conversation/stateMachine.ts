/**
 * State Machine pour Conversation Mode
 * États: IDLE, LISTENING, TRANSCRIBING, THINKING, STREAMING, SPEAKING, ERROR
 */

export enum ConversationState {
  IDLE = 'idle',
  LISTENING = 'listening',
  TRANSCRIBING = 'transcribing',
  THINKING = 'thinking',
  STREAMING = 'streaming',
  SPEAKING = 'speaking',
  ERROR = 'error'
}

type StateTransition = {
  from: ConversationState;
  to: ConversationState[];
};

const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  [ConversationState.IDLE]: [
    ConversationState.LISTENING,
    ConversationState.ERROR
  ],
  [ConversationState.LISTENING]: [
    ConversationState.TRANSCRIBING,
    ConversationState.IDLE,
    ConversationState.ERROR
  ],
  [ConversationState.TRANSCRIBING]: [
    ConversationState.THINKING,
    ConversationState.IDLE,
    ConversationState.ERROR
  ],
  [ConversationState.THINKING]: [
    ConversationState.STREAMING,
    ConversationState.ERROR
  ],
  [ConversationState.STREAMING]: [
    ConversationState.SPEAKING,
    ConversationState.IDLE,
    ConversationState.ERROR
  ],
  [ConversationState.SPEAKING]: [
    ConversationState.LISTENING,
    ConversationState.IDLE,
    ConversationState.ERROR
  ],
  [ConversationState.ERROR]: [
    ConversationState.IDLE
  ]
};

export class ConversationStateMachine {
  private state: ConversationState = ConversationState.IDLE;
  private listeners: Set<(state: ConversationState) => void> = new Set();
  public abortController: AbortController | null = null;

  /**
   * S'abonner aux changements d'état
   */
  subscribe(callback: (state: ConversationState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notifier tous les listeners
   */
  private notify(): void {
    this.listeners.forEach(cb => cb(this.state));
  }

  /**
   * Transitionner vers un nouvel état
   */
  transition(newState: ConversationState): boolean {
    const validNextStates = VALID_TRANSITIONS[this.state];
    
    if (!validNextStates.includes(newState)) {
      console.warn(
        `[StateMachine] Invalid transition: ${this.state} → ${newState}. ` +
        `Valid transitions: ${validNextStates.join(', ')}`
      );
      return false;
    }

    this.state = newState;
    this.notify();
    return true;
  }

  /**
   * Vérifier si on peut interrompre (STREAMING ou SPEAKING)
   */
  canInterrupt(): boolean {
    return [
      ConversationState.STREAMING,
      ConversationState.SPEAKING
    ].includes(this.state);
  }

  /**
   * Interrompre la génération/parole
   */
  interrupt(): boolean {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    return this.transition(ConversationState.IDLE);
  }

  /**
   * Réinitialiser à IDLE
   */
  reset(): void {
    this.interrupt();
    this.transition(ConversationState.IDLE);
  }

  /**
   * Obtenir l'état actuel
   */
  getState(): ConversationState {
    return this.state;
  }

  /**
   * Créer un nouvel AbortController
   */
  createAbortController(): AbortController {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    return this.abortController;
  }
}

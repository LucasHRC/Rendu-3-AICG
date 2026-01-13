/**
 * Store minimal pour Conversation Mode
 * Messages, settings, persistence localStorage
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationSettings {
  modelId: string;
  voiceName: string | null;
  verbosity: 'concise' | 'normal' | 'detailed';
  autoListen: boolean;
  pushToInterrupt: boolean;
  serverTTSEnabled: boolean; // Feature flag désactivé
}

const DEFAULT_SETTINGS: ConversationSettings = {
  modelId: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  voiceName: null,
  verbosity: 'concise',
  autoListen: true,
  pushToInterrupt: true,
  serverTTSEnabled: false
};

const STORAGE_KEY = 'conversation-settings';
const MESSAGES_KEY = 'conversation-messages';

export class ConversationStore {
  private messages: Message[] = [];
  private settings: ConversationSettings = { ...DEFAULT_SETTINGS };
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadSettings();
    this.loadMessages();
  }

  /**
   * S'abonner aux changements
   */
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }

  /**
   * Messages
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  addMessage(message: Omit<Message, 'id' | 'timestamp'>): Message {
    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    this.messages.push(newMessage);
    this.saveMessages();
    this.notify();
    return newMessage;
  }

  clearMessages(): void {
    this.messages = [];
    this.saveMessages();
    this.notify();
  }

  /**
   * Settings
   */
  getSettings(): ConversationSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<ConversationSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    this.notify();
  }

  /**
   * Persistence
   */
  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('[ConversationStore] Failed to load settings:', e);
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('[ConversationStore] Failed to save settings:', e);
    }
  }

  private loadMessages(): void {
    try {
      const stored = localStorage.getItem(MESSAGES_KEY);
      if (stored) {
        this.messages = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[ConversationStore] Failed to load messages:', e);
    }
  }

  private saveMessages(): void {
    try {
      // Garder seulement les 50 derniers messages
      const recentMessages = this.messages.slice(-50);
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(recentMessages));
    } catch (e) {
      console.warn('[ConversationStore] Failed to save messages:', e);
    }
  }
}

// Singleton
export const conversationStore = new ConversationStore();

/**
 * Composant principal Conversation Mode
 * Layout: bouton micro (gauche) + chat (droite)
 */

import React, { useState } from 'react';
import { useConversation } from '../conversation/useConversation';
import { ConversationState } from '../conversation/stateMachine';
import SettingsPanel from './SettingsPanel';
import '../styles/conversation.css';

function ConversationMode() {
  const {
    state,
    messages,
    currentText,
    statusText,
    isModelLoading,
    modelLoadProgress,
    toggleListening,
    handleInterrupt
  } = useConversation();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const getMicroButtonClass = (): string => {
    return `micro-button ${state}`;
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="conversation-container">
      {/* Section Micro (Gauche) */}
      <div className="micro-section">
        <button
          className={getMicroButtonClass()}
          onClick={toggleListening}
          disabled={isModelLoading || state === ConversationState.ERROR}
          title={isModelLoading ? 'Loading model...' : 'Toggle listening'}
        >
          <svg
            className="micro-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>
        
        {isModelLoading ? (
          <div className="micro-status">
            Loading model... {Math.round(modelLoadProgress * 100)}%
          </div>
        ) : (
          <div className="micro-status">
            {statusText || 'Ready'}
          </div>
        )}
      </div>

      {/* Section Chat (Droite) */}
      <div className="chat-section">
        <div className="chat-header">
          <h2 className="chat-title">Conversation</h2>
          <div className="header-actions">
            <span className="status-line">{statusText}</span>
            <button
              onClick={() => setSettingsOpen(true)}
              style={{
                marginLeft: '1rem',
                padding: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280'
              }}
              title="Settings"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-content">
                {message.content}
              </div>
              <div className="message-time">
                {formatTime(message.timestamp)}
              </div>
            </div>
          ))}
          
          {/* Message en cours de streaming */}
          {currentText && (
            <div className="message assistant">
              <div className="message-content">
                {currentText}
                <span className="streaming-indicator" />
              </div>
            </div>
          )}

          {messages.length === 0 && !currentText && (
            <div className="placeholder">
              <p>Start a conversation by clicking the microphone</p>
            </div>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default ConversationMode;

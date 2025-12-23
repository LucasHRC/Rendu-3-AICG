/**
 * Composant principal de l'application
 * Router simple: Documents / Chat / Conversation
 */

import React, { useState } from 'react';
import ConversationMode from './components/ConversationMode';
import './styles/app.css';
import './styles/conversation.css';

type Tab = 'documents' | 'chat' | 'conversation';

function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('conversation');

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Literature Reviewer</h1>
            <p>Local AI Research Assistant</p>
          </div>
          
          <nav className="header-tabs">
            <button
              className={currentTab === 'documents' ? 'active' : ''}
              onClick={() => setCurrentTab('documents')}
            >
              Documents
            </button>
            <button
              className={currentTab === 'chat' ? 'active' : ''}
              onClick={() => setCurrentTab('chat')}
            >
              Chat
            </button>
            <button
              className={currentTab === 'conversation' ? 'active' : ''}
              onClick={() => setCurrentTab('conversation')}
            >
              Conversation
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {currentTab === 'conversation' && <ConversationMode />}
        {currentTab === 'documents' && (
          <div className="placeholder">
            <p>Documents view (to be implemented)</p>
          </div>
        )}
        {currentTab === 'chat' && (
          <div className="placeholder">
            <p>Chat view (to be implemented)</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;


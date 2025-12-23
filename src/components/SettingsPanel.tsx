/**
 * Settings Panel - Drawer pour configuration
 */

import React, { useState, useEffect } from 'react';
import { conversationStore, ConversationSettings } from '../conversation/conversationStore';
import { getVoices } from '../audio/ttsWebSpeech';
// Import model catalog from existing webllm.js
const MODEL_CATALOG = [
  {
    id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.1 8B',
    size: 6.1
  },
  {
    id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
    name: 'DeepSeek R1 7B',
    size: 5.1
  },
  {
    id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
    name: 'Hermes 3 8B',
    size: 4.9
  },
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 7B',
    size: 5.1
  },
  {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    name: 'Mistral 7B',
    size: 4.6
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi 3.5 Mini',
    size: 3.7
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B',
    size: 2.5
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    size: 2.3
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    size: 0.9
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B',
    size: 0.9
  }
];
import '../styles/conversation.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<ConversationSettings>(conversationStore.getSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadVoices();
    }
  }, [isOpen]);

  const loadVoices = async () => {
    const availableVoices = await getVoices();
    setVoices(availableVoices.filter(v => v.lang.startsWith('fr')));
  };

  const updateSetting = <K extends keyof ConversationSettings>(
    key: K,
    value: ConversationSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    conversationStore.updateSettings(newSettings);
  };

  return (
    <div className={`settings-panel ${isOpen ? 'open' : ''}`}>
      <div className="settings-header">
        <h3 className="settings-title">Settings</h3>
        <button className="settings-close" onClick={onClose}>
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="settings-content">
        {/* Model Selection */}
        <div className="settings-group">
          <label className="settings-label">Model (WebLLM)</label>
          <select
            className="settings-select"
            value={settings.modelId}
            onChange={(e) => updateSetting('modelId', e.target.value)}
          >
            {MODEL_CATALOG.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.size}GB)
              </option>
            ))}
          </select>
        </div>

        {/* Voice Selection */}
        <div className="settings-group">
          <label className="settings-label">Voice (Web Speech API)</label>
          <select
            className="settings-select"
            value={settings.voiceName || ''}
            onChange={(e) => updateSetting('voiceName', e.target.value || null)}
          >
            <option value="">Default (System)</option>
            {voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </div>

        {/* Verbosity */}
        <div className="settings-group">
          <label className="settings-label">Verbosity</label>
          <select
            className="settings-select"
            value={settings.verbosity}
            onChange={(e) => updateSetting('verbosity', e.target.value as any)}
          >
            <option value="concise">Concise (3-6 lines)</option>
            <option value="normal">Normal (6-12 lines)</option>
            <option value="detailed">Detailed (full response)</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="settings-group">
          <div className="settings-toggle">
            <div>
              <label className="settings-label" style={{ marginBottom: 0 }}>
                Auto-listen after speak
              </label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                Automatically start listening after TTS ends
              </p>
            </div>
            <div
              className={`toggle-switch ${settings.autoListen ? 'active' : ''}`}
              onClick={() => updateSetting('autoListen', !settings.autoListen)}
            />
          </div>

          <div className="settings-toggle" style={{ marginTop: '1rem' }}>
            <div>
              <label className="settings-label" style={{ marginBottom: 0 }}>
                Push-to-interrupt (Space)
              </label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                Press Space to interrupt TTS and generation
              </p>
            </div>
            <div
              className={`toggle-switch ${settings.pushToInterrupt ? 'active' : ''}`}
              onClick={() => updateSetting('pushToInterrupt', !settings.pushToInterrupt)}
            />
          </div>

          <div className="settings-toggle" style={{ marginTop: '1rem' }}>
            <div>
              <label className="settings-label" style={{ marginBottom: 0 }}>
                Server TTS (Bonus)
                <span className="tooltip">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="tooltip-text">Coming later - Server-side TTS feature</span>
                </span>
              </label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                Enable server-side TTS (not implemented)
              </p>
            </div>
            <div
              className="toggle-switch"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              title="Feature not yet implemented"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;


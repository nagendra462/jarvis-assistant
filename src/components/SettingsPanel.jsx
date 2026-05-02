import React, { useState } from 'react';
import { speak, getVoiceSettings, saveVoiceSettings } from '../utils/voice';

export default function SettingsPanel({ onClose }) {
  const saved = getVoiceSettings();
  const [pitch, setPitch] = useState(saved.pitch ?? 0);
  const [rate, setRate]   = useState(saved.rate  ?? 0);
  const [bass, setBass]   = useState(saved.bass  ?? 0);
  const [voiceStatus, setVoiceStatus] = useState('');

  function handleSaveVoice() {
    saveVoiceSettings({ pitch, rate, bass });
    setVoiceStatus('✅ Saved.');
    setTimeout(() => setVoiceStatus(''), 2000);
  }

  function handleTestVoice() {
    // Save first so the test uses the current sliders
    saveVoiceSettings({ pitch, rate, bass });
    speak(
      "Systems online. Neural pathways nominal. Ready to serve, sir.",
      () => setVoiceStatus('Speaking...'),
      () => setVoiceStatus('✅ Voice ready.')
    );
    setTimeout(() => setVoiceStatus(''), 4000);
  }

  function handleClearData() {
    if (confirm('Clear ALL JARVIS data? This cannot be undone.')) {
      localStorage.clear();
      setTimeout(() => window.location.reload(), 500);
    }
  }

  function handleClearMemory() {
    localStorage.removeItem('jarvis_memories');
    localStorage.removeItem('jarvis_chat_history');
    alert('Memory and chat history cleared, sir.');
    window.location.reload();
  }

  return (
    <div className="overlay">
      <div className="overlay-card settings-card">
        <div className="overlay-header">
          <h2>⚙️ Settings</h2>
          <button className="overlay-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <p className="settings-desc">
            Powered by <strong>Gemini 2.5 Flash</strong> + <strong>Jenny Neural</strong> voice.
          </p>

          <div className="settings-divider" />

          {/* Voice Tuning */}
          <label className="settings-label">
            <span>🎙️ Voice Tuning</span>
          </label>
          <p className="settings-hint">Adjust to taste. Test after saving.</p>

          <div className="voice-sliders">
            <div className="slider-row">
              <span className="slider-label">Pitch</span>
              <input
                type="range" min="-5" max="5" step="1"
                value={pitch}
                onChange={e => setPitch(Number(e.target.value))}
                className="voice-slider"
              />
              <span className="slider-val">{pitch > 0 ? `+${pitch}` : pitch}st</span>
            </div>

            <div className="slider-row">
              <span className="slider-label">Speed</span>
              <input
                type="range" min="-30" max="10" step="1"
                value={rate}
                onChange={e => setRate(Number(e.target.value))}
                className="voice-slider"
              />
              <span className="slider-val">{rate > 0 ? `+${rate}` : rate}%</span>
            </div>

            <div className="slider-row">
              <span className="slider-label">Bass</span>
              <input
                type="range" min="0" max="10" step="1"
                value={bass}
                onChange={e => setBass(Number(e.target.value))}
                className="voice-slider"
              />
              <span className="slider-val">{bass} dB</span>
            </div>
          </div>

          {voiceStatus && <p className="sync-status">{voiceStatus}</p>}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn-secondary settings-save" onClick={handleTestVoice} style={{ flex: 1 }}>
              ▶ Test Voice
            </button>
            <button className="btn-secondary settings-save" onClick={handleSaveVoice} style={{ flex: 1 }}>
              💾 Save
            </button>
          </div>

          <div className="settings-divider" style={{ marginTop: '24px' }} />

          {/* Memory */}
          <label className="settings-label" style={{ marginTop: '8px' }}>
            <span>🧠 Memory</span>
          </label>
          <p className="settings-hint">Clears memories and chat history. Goals and habits are kept.</p>
          <button className="btn-secondary settings-save" onClick={handleClearMemory}>
            Clear Memory &amp; Chat
          </button>

          <div className="settings-divider" style={{ marginTop: '24px' }} />

          {/* Data */}
          <label className="settings-label" style={{ marginTop: '8px' }}>
            <span>💾 Data</span>
          </label>
          <p className="settings-hint">Wipes all JARVIS data from this device.</p>
          <button className="btn-danger settings-save" onClick={handleClearData} style={{ marginTop: '8px' }}>
            🗑️ Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}

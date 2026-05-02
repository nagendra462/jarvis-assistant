import React, { useState, useEffect, useRef, useCallback } from 'react';
import { stopSpeaking, markUserInteraction } from './utils/voice';
import { stopAlarmSound, playWakeSound, playFocusCompleteSound, resumeAudio } from './utils/sounds';
import { logFocusSession } from './utils/analytics';
import { getTodayJournal, updateTodayJournal } from './utils/journal';
import { isWeeklyReportDue } from './utils/patterns';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { streamChat } from './utils/gemini';
import { buildAIContext } from './utils/jarvis-brain';

// --- Hooks ---
import { useJarvisChat } from './hooks/useJarvisChat';
import { useWakeWord } from './hooks/useWakeWord';
import { useJarvisLifecycle } from './hooks/useJarvisLifecycle';
import { useJarvisActions } from './hooks/useJarvisActions';

// --- Components ---
import HUD from './components/HUD';
import FocusOverlay from './components/FocusOverlay';
import GoalsOverlay from './components/GoalsOverlay';
import SettingsPanel from './components/SettingsPanel';
import SkillsPanel from './components/SkillsPanel';
import JournalPanel from './components/JournalPanel';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import WeeklyReport from './components/WeeklyReport';

const JarvisNative = registerPlugin('JarvisNative');

// ===== Tiny presentational components (no state, no side-effects) =====
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

function ParticlesCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;
    const particles = [];
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 60; i++) {
      particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5, opacity: Math.random() * 0.5 + 0.1 });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.opacity})`; ctx.fill();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.08 * (1 - dist / 120)})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="particles-canvas" />;
}

function ArcReactor({ state, onClick }) {
  const labels = { idle: 'Online', listening: 'Listening', thinking: 'Processing', speaking: 'Speaking' };
  return (
    <div className="orb-container" onClick={onClick} style={{ cursor: 'pointer' }} title="Click to interrupt JARVIS">
      <div className={`orb ${state}`}>
        <div className="orb-ring ring-1" /><div className="orb-ring ring-2" />
        <div className="orb-ring ring-3" /><div className="orb-core" />
      </div>
      <div className="orb-status">{labels[state] || 'Online'}</div>
    </div>
  );
}

function ChatMessage({ msg }) {
  return (
    <div className={`msg ${msg.sender}`}>
      <span className="msg-label">{msg.sender === 'jarvis' ? 'JARVIS' : 'YOU'}</span>
      <span className="msg-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
    </div>
  );
}

function TypingIndicator() {
  return <div className="typing-indicator"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div>;
}

// ===== Main App =====
export default function App() {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focusMode, setFocusMode] = useState(null);
  const [focusPaused, setFocusPaused] = useState(false);
  const [focusStartTime, setFocusStartTime] = useState(null);
  const [showSkills, setShowSkills] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const inputRef = useRef(null);

  // --- Core chat state & speakResponse ---
  const {
    messages, setMessages, orbState, setOrbState,
    isTyping, setIsTyping, chatEndRef,
    addJarvisMessage, addUserMessage, speakResponse, stopResponse,
  } = useJarvisChat();

  // --- Action dispatcher ---
  const { executeActions } = useJarvisActions({
    addJarvisMessage, speakResponse,
    setFocusMode, setFocusPaused, setFocusStartTime,
    setShowGoals, setShowSettings, setShowSkills,
    setShowJournal, setShowAnalytics, setShowWeeklyReport,
  });

  // --- Main command handler (defined before lifecycle so it can be passed in) ---
  const handleCommand = useCallback(async (text, isSilent = false) => {
    if (!text.trim()) return;
    stopSpeaking(); stopAlarmSound(); setOrbState('idle');
    if (!isSilent) addUserMessage(text);
    setIsTyping(true); setOrbState('thinking');

    const { detectEmotionalTone, buildEmotionalContext, updateSessionMood, extractMentionedPeople } = await import('./utils/emotion');
    const { setEmotionalContext } = await import('./utils/gemini');
    const { searchSemanticMemory, storeSemanticMemory } = await import('./utils/rag');
    const { logCommitment } = await import('./utils/patterns');
    const { logSignificantExchange, trackRelationship } = await import('./utils/memory');
    const { processCommand } = await import('./utils/jarvis-brain');
    const { formatReadingLog, fetchAndSummarize, detectURL } = await import('./utils/reader');

    const tone = detectEmotionalTone(text);
    updateSessionMood(tone);
    const pastContext = await searchSemanticMemory(text, 2);
    const deepMemory = pastContext.length > 0
      ? '\n\n[DEEP MEMORY]:\n' + pastContext.map(p => `- (${new Date(p.timestamp).toLocaleDateString()}): ${p.text}`).join('\n')
      : '';
    setEmotionalContext(buildEmotionalContext(tone) + deepMemory);

    const response = await processCommand(text);
    setIsTyping(false);

    const processExchange = (jarvisText) => {
      logCommitment(text);
      if (text.length > 20 || jarvisText.length > 30) {
        logSignificantExchange(text, jarvisText).catch(() => {});
        storeSemanticMemory(`User: "${text}" | JARVIS: "${jarvisText}"`).catch(() => {});
      }
      extractMentionedPeople(text).forEach(p => trackRelationship(p, 'Contact', text).catch(() => {}));
    };

    if (response.type === 'goals_ui') { setShowGoals(true); setOrbState('idle'); return; }
    if (response.type === 'focus') {
      const mins = parseInt((response.text.match(/__FOCUS_START_(\d+)__/) || [])[1]) || 25;
      setFocusMode({ minutes: mins }); setFocusPaused(false); setFocusStartTime(new Date().toISOString());
      const msg = `Focus mode activated for **${mins} minutes**, sir. All distractions eliminated.`;
      addJarvisMessage(msg); speakResponse(msg); return;
    }
    if (response.type === 'focus_stop') { setFocusMode(null); const msg = 'Focus session ended, sir. Well done.'; addJarvisMessage(msg); speakResponse(msg); return; }
    if (response.type === 'settings') { setShowSettings(true); return; }
    if (response.type === 'skills_ui') { setShowSkills(true); setOrbState('idle'); return; }
    if (response.type === 'journal_ui') { setShowJournal(true); setOrbState('idle'); return; }
    if (response.type === 'analytics_ui') { setShowAnalytics(true); setOrbState('idle'); return; }
    if (response.type === 'weekly_report_ui') { setShowWeeklyReport(true); setOrbState('idle'); return; }
    if (response.type === 'reading_log_ui') { setOrbState('idle'); addJarvisMessage(formatReadingLog()); return; }
    if (response.type === 'read_url') {
      setOrbState('thinking');
      const url = (text.match(/https?:\/\/[^\s]+/) || [])[0];
      if (url) {
        addJarvisMessage('Reading that for you, sir. One moment...');
        const result = await fetchAndSummarize(url, streamChat);
        setOrbState('idle');
        if (result.success) { addJarvisMessage(result.displayText); speakResponse(result.displayText); }
        else { const e = `Couldn't read that URL, sir: ${result.error}`; addJarvisMessage(e); speakResponse(e); }
      }
      return;
    }

    if (response.type === 'skill_log_natural' || response.type === 'skill_add_natural' || response.type === 'ai_needed') {
      const streamMsgId = Date.now();
      setMessages(prev => [...prev, { sender: 'jarvis', text: '', id: streamMsgId, streaming: true }]);
      setOrbState('thinking');
      const contextStr = buildAIContext();
      let streamedText = '';
      const finalResult = await streamChat(text, contextStr, (chunk) => {
        streamedText += chunk;
        setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: streamedText } : m));
        setOrbState('speaking');
      });
      setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: finalResult.text, streaming: false } : m));
      if (finalResult.actions?.length > 0) executeActions(finalResult.actions);
      processExchange(finalResult.text);
      speakResponse(finalResult.text); return;
    }

    if (response.actions?.length > 0) executeActions(response.actions);
    processExchange(response.text);
    addJarvisMessage(response.text);
    speakResponse(response.text);
  }, [focusMode, focusPaused, focusStartTime, addJarvisMessage, addUserMessage, speakResponse, setIsTyping, setOrbState, setMessages, executeActions, setFocusMode, setFocusPaused, setFocusStartTime, setShowGoals, setShowSkills, setShowJournal, setShowAnalytics, setShowWeeklyReport, setShowSettings]);

  // --- Lifecycle: startup, visibility, polling ---
  useJarvisLifecycle({ addJarvisMessage, speakResponse, setShowWeeklyReport, handleCommand });

  // --- Wake word ---
  const { toggleMic, resumeListeningAfterSpeak } = useWakeWord({
    onCommand: handleCommand, setIsListening, setOrbState, setWakeWordActive,
  });

  // --- Native background command listener ---
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform()) return;
    const listener = JarvisNative.addListener('onCommandDetected', (data) => {
      if (data?.command) handleCommand(data.command);
    });
    return () => { listener.then(l => l.remove()).catch(() => {}); };
  }, [handleCommand]);

  // --- Focus distraction polling ---
  useEffect(() => {
    if (!focusMode || focusPaused) return;
    const interval = setInterval(async () => {
      try {
        if (!window.Capacitor?.isNativePlatform()) return;
        const { packageName = '' } = await JarvisNative.getForegroundApp();
        const distractions = ['com.instagram.android', 'com.twitter.android', 'com.google.android.youtube', 'com.zhiliaoapp.musically', 'com.facebook.katana'];
        if (distractions.includes(packageName)) {
          const msg = 'Sir, close that app and return to deep work. Your focus session is still active.';
          addJarvisMessage(msg);
          import('./utils/voice').then(({ speak }) => speak(msg, () => setOrbState('speaking'), () => setOrbState('idle')));
        }
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [focusMode, focusPaused, addJarvisMessage]);

  // --- Cmd+K shortcut ---
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Focus complete handler ---
  async function handleFocusStop(completed) {
    const endedAt = new Date().toISOString();
    const plannedMins = focusMode?.minutes || 25;
    const startedAt = focusStartTime || new Date(Date.now() - plannedMins * 60000).toISOString();
    const actualMins = Math.round((new Date(endedAt) - new Date(startedAt)) / 60000);
    logFocusSession({ startedAt, plannedMinutes: plannedMins, actualMinutes: Math.min(actualMins, plannedMins), completed });
    try {
      const existing = await getTodayJournal();
      const sessions = [...(existing.focusSessions || []), { startedAt, endedAt, plannedMinutes: plannedMins, actualMinutes: Math.min(actualMins, plannedMins), completed }];
      updateTodayJournal({ focusSessions: sessions }).catch(() => {});
    } catch {}
    setFocusMode(null); setFocusPaused(false); setFocusStartTime(null);
    if (completed) {
      await resumeAudio();
      playFocusCompleteSound();
      if (Notification.permission === 'granted') new Notification('⏱️ JARVIS — Focus Complete', { body: 'Outstanding, sir. Your session is complete.' });
      const msg = 'Outstanding work, sir. Your focus session is complete. You have just outworked 99 percent of people. Take a moment, breathe, and tell me when you are ready to go again.';
      addJarvisMessage('🏆 **Focus session complete!** Outstanding discipline, sir. Shall we go again?');
      setTimeout(() => speakResponse(msg), 2700);
    } else {
      const msg = 'Focus session ended early, sir. Every minute of deep work compounds. Remember that.';
      addJarvisMessage(msg); speakResponse(msg);
    }
  }

  // --- Mic toggle ---
  function handleMic() {
    if (!toggleMic()) {
      addJarvisMessage('Voice recognition isn\'t available in this browser, sir. Please use Chrome.');
      return;
    }
    if (window.Capacitor?.isNativePlatform()) JarvisNative.startBackgroundService().catch(() => {});
    playWakeSound();
  }

  function handleSend() {
    if (!inputText.trim()) return;
    handleCommand(inputText);
    setInputText('');
    inputRef.current?.focus();
  }

  const handleFirstInteraction = useCallback(() => {
    markUserInteraction();
    if (window.__pendingStartupSpeech) {
      const speech = window.__pendingStartupSpeech;
      window.__pendingStartupSpeech = null;
      setTimeout(() => speakResponse(speech), 300);
    }
  }, [speakResponse]);

  return (
    <div onClickCapture={handleFirstInteraction} onKeyDownCapture={handleFirstInteraction} style={{ display: 'contents' }}>
      <ParticlesCanvas />
      <HUD onSettingsClick={() => setShowSettings(true)} wakeWordActive={wakeWordActive} />
      <main className="app-main">
        <ArcReactor
          state={orbState}
          onClick={() => {
            if (orbState === 'speaking') { stopSpeaking(); setOrbState('idle'); addJarvisMessage('*[Interrupted]*'); }
          }}
        />
        <div className="chat-container">
          <div className="chat-log">
            {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
            {isTyping && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>
        </div>
        <div className="input-area">
          <button className={`mic-btn ${isListening ? 'active' : ''}`} onClick={handleMic} title="Voice Input">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
          <input
            ref={inputRef} className="text-input" type="text" value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Talk to JARVIS...  (⌘K to focus)"
            autoComplete="off"
          />
          <button className="send-btn" onClick={handleSend} title="Send">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </main>

      {showGoals && <GoalsOverlay onClose={() => setShowGoals(false)} />}
      {focusMode && <FocusOverlay minutes={focusMode.minutes} paused={focusPaused} onPause={() => setFocusPaused(p => !p)} onStop={handleFocusStop} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showSkills && <SkillsPanel onClose={() => setShowSkills(false)} />}
      {showJournal && <JournalPanel onClose={() => setShowJournal(false)} />}
      {showAnalytics && <AnalyticsDashboard onClose={() => setShowAnalytics(false)} />}
      {showWeeklyReport && <WeeklyReport onClose={() => setShowWeeklyReport(false)} autoGenerate={isWeeklyReportDue()} />}
    </div>
  );
}

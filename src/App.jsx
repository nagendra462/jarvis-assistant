import React, { useState, useEffect, useRef, useCallback } from 'react';
import { processCommand, getGoals, addGoal, saveStreak, buildAIContext, TASK_COMPLETE_RESPONSES, pickRandom, formatTime, formatDate } from './utils/jarvis-brain';
import { streamChat, restoreHistory, setUserModelContext } from './utils/gemini';
import { speak as jarvisSpeak, stopSpeaking, preloadVoices, markUserInteraction } from './utils/voice';
import { syncSave } from './utils/sync';
import { runProactiveChecks, generateBriefing, addReminder, syncProfileFromMemories } from './utils/proactive';
import { playWakeSound, playReminderSound, playAlarmSound, stopAlarmSound, playFocusCompleteSound, resumeAudio } from './utils/sounds';
import { addHabit, checkInHabit, getHabitReport, setSleepSchedule, checkSleepSchedule } from './utils/habits';
import { loadUserModel, syncModelFromMemories, getModelContext } from './utils/memory';
import { isMorningRitualDue, isEveningDebriefDue } from './utils/rituals';
import { logFocusSession } from './utils/analytics';
import { runPatternChecks, isWeeklyReportDue } from './utils/patterns';
import { detectURL, fetchAndSummarize, formatReadingLog } from './utils/reader';
import { logStudySession, addSkill as addNewSkill } from './utils/skills';
import { updateTodayJournal, getTodayJournal } from './utils/journal';
import HUD from './components/HUD';
import FocusOverlay from './components/FocusOverlay';
import GoalsOverlay from './components/GoalsOverlay';
import SettingsPanel from './components/SettingsPanel';
import SkillsPanel from './components/SkillsPanel';
import JournalPanel from './components/JournalPanel';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import WeeklyReport from './components/WeeklyReport';
import MorningRitual from './components/MorningRitual';
import EveningDebrief from './components/EveningDebrief';


// ===== Particles Background =====
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

// ===== Markdown Renderer =====
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

// ===== Arc Reactor Orb =====
function ArcReactor({ state }) {
  const labels = { idle: 'Online', listening: 'Listening', thinking: 'Processing', speaking: 'Speaking' };
  return (
    <div className="orb-container">
      <div className={`orb ${state}`}>
        <div className="orb-ring ring-1" /><div className="orb-ring ring-2" />
        <div className="orb-ring ring-3" /><div className="orb-core" />
      </div>
      <div className="orb-status">{labels[state] || 'Online'}</div>
    </div>
  );
}

// ===== Chat Message =====
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

// ===== Widget Bar =====
const WIDGETS = [
  { icon: '🕐', label: 'Time', cmd: 'what time is it' },
  { icon: '🎯', label: 'Goals', cmd: 'show my goals' },
  { icon: '⏱️', label: 'Focus', cmd: 'start focus' },
  { icon: '🔥', label: 'Motivate', cmd: 'motivate me' },
  { icon: '📚', label: 'Skills', cmd: 'show skills' },
  { icon: '📖', label: 'Journal', cmd: 'show journal' },
  { icon: '📊', label: 'Analytics', cmd: 'show analytics' },
  { icon: '🌅', label: 'Morning', cmd: 'morning ritual' },
  { icon: '🌙', label: 'Evening', cmd: 'evening debrief' },
  { icon: '📝', label: 'Notes', cmd: 'show my notes' },
  { icon: '🗑️', label: 'Clear', action: 'clear' },
];

function WidgetBar({ onCommand, onClear }) {
  return (
    <div className="widgets">
      {WIDGETS.map((w, i) => (
        <button key={i} className="widget-btn" onClick={() => w.action === 'clear' ? onClear() : onCommand(w.cmd)}>
          <span className="widget-icon">{w.icon}</span>
          <span className="widget-label">{w.label}</span>
        </button>
      ))}
    </div>
  );
}

// ===== Goal carry-forward =====
function carryForwardGoals() {
  const today = new Date().toDateString();
  try {
    const data = JSON.parse(localStorage.getItem('jarvis_goals') || '{}');
    if (!data.date || data.date === today) return; // already today
    const incomplete = (data.items || []).filter(g => !g.done);
    if (incomplete.length === 0) return;
    const newGoals = {
      date: today,
      items: incomplete.map(g => ({ ...g, carried: true, done: false })),
    };
    localStorage.setItem('jarvis_goals', JSON.stringify(newGoals));
    return incomplete.length;
  } catch { return 0; }
}

// ===== Main App =====
export default function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('jarvis_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [inputText, setInputText] = useState('');
  const [orbState, setOrbState] = useState('idle');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focusMode, setFocusMode] = useState(null);
  const [focusPaused, setFocusPaused] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [showMorningRitual, setShowMorningRitual] = useState(false);
  const [showEveningDebrief, setShowEveningDebrief] = useState(false);
  const [focusStartTime, setFocusStartTime] = useState(null);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const wakeListeningRef = useRef(false);
  const activeListeningRef = useRef(false);
  const autoResumeTimerRef = useRef(null);
  const wakeHealthRef = useRef(null);


  // ===== Helpers =====
  const addJarvisMessage = useCallback((text) => {
    setMessages(prev => [...prev, { sender: 'jarvis', text, id: Date.now() }]);
  }, []);

  const addUserMessage = useCallback((text) => {
    setMessages(prev => [...prev, { sender: 'user', text, id: Date.now() }]);
  }, []);

  // ===== Scroll to bottom =====
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ===== Persist chat history =====
  useEffect(() => {
    const toSave = messages.map(m => ({ ...m, streaming: false })).slice(-100);
    localStorage.setItem('jarvis_chat_history', JSON.stringify(toSave));
  }, [messages]);

  // ===== Initialization =====
  useEffect(() => {
    preloadVoices();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    try {
      const saved = JSON.parse(localStorage.getItem('jarvis_chat_history') || '[]');
      restoreHistory(saved.slice(-20));
    } catch {}
    const carried = carryForwardGoals();
    if (carried > 0) {
      setTimeout(() => {
        addJarvisMessage(`↩ I've carried forward **${carried} unfinished goal${carried > 1 ? 's' : ''}** from yesterday, sir. Let's finish what we started.`);
      }, 1200);
    }
    saveStreak();
    syncProfileFromMemories();

    (async () => {
      try {
        await syncModelFromMemories();
        const modelCtx = await getModelContext();
        setUserModelContext(modelCtx);
      } catch {}

      const lastBriefing = localStorage.getItem('jarvis_last_briefing_date');
      const today = new Date().toDateString();
      if (lastBriefing !== today) {
        const briefing = generateBriefing();
        setTimeout(() => {
          addJarvisMessage(briefing);
          // Don't auto-speak on startup — AudioContext needs a user gesture first.
          // JARVIS will speak as soon as they type or click anything.
          localStorage.setItem('jarvis_last_briefing_date', today);
        }, 800);
      }

      try {
        const morningDue = await isMorningRitualDue();
        if (morningDue) setTimeout(() => setShowMorningRitual(true), 1800);
      } catch {}
    })();
  }, []); // eslint-disable-line

  // ===== Auto-briefing on tab return (Feature #3) =====
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const lastBriefing = localStorage.getItem('jarvis_last_briefing_date');
      const today = new Date().toDateString();
      const lastActiveStr = localStorage.getItem('jarvis_last_active_ts');
      const lastActive = lastActiveStr ? parseInt(lastActiveStr) : 0;
      const hoursSinceActive = (Date.now() - lastActive) / 3600000;

      // Trigger fresh briefing if: new day OR been away 8+ hours
      if (lastBriefing !== today || hoursSinceActive >= 8) {
        const briefing = generateBriefing();
        addJarvisMessage(briefing);
        speakResponse(briefing);
        localStorage.setItem('jarvis_last_briefing_date', today);
      }
      localStorage.setItem('jarvis_last_active_ts', String(Date.now()));
    };

    // Track when we go hidden
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem('jarvis_last_active_ts', String(Date.now()));
      }
    };

    document.addEventListener('visibilitychange', () => {
      onVisible();
      onHidden();
    });
    localStorage.setItem('jarvis_last_active_ts', String(Date.now()));
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []); // eslint-disable-line

  // ===== Proactive check-ins every 5 min =====
  useEffect(() => {
    const interval = setInterval(async () => {
      const { reminders, checkIn } = runProactiveChecks();
      for (const r of reminders) {
        playReminderSound();
        const msg = `⏰ **Reminder**, sir: ${r.text}`;
        addJarvisMessage(msg); speakResponse(msg);
      }
      if (checkIn) { addJarvisMessage(checkIn); speakResponse(checkIn); }
      const sleep = checkSleepSchedule();
      if (sleep.sleepReminder) { playReminderSound(); addJarvisMessage(sleep.sleepReminder); speakResponse(sleep.sleepReminder); }
      if (sleep.wakeAlarm) { playAlarmSound(); addJarvisMessage(sleep.wakeAlarm); speakResponse(sleep.wakeAlarm); }

      // Pattern checks
      try {
        const patterns = await runPatternChecks();
        for (const p of patterns) { playReminderSound(); addJarvisMessage(p.message); speakResponse(p.message); }
      } catch {}

      // Evening debrief check
      try {
        const eveningDue = await isEveningDebriefDue();
        if (eveningDue) setShowEveningDebrief(true);
      } catch {}

      // Weekly report (Sunday 8pm+)
      if (isWeeklyReportDue()) setShowWeeklyReport(true);

      // Refresh model context
      try { const ctx = await getModelContext(); setUserModelContext(ctx); } catch {}
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // ===== Cmd+K / Ctrl+K shortcut to focus input (Feature #6) =====
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ===== Speech Recognition — resilient wake word (Feature #4) =====
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let restartAttempts = 0;

    const safeStart = () => {
      if (!wakeListeningRef.current) return;
      try { recognition.start(); restartAttempts = 0; } catch {
        // Already running — ignore
      }
    };

    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript.trim();
      if (activeListeningRef.current && lastResult.isFinal) {
        activeListeningRef.current = false;
        setIsListening(false);
        setOrbState('idle');
        const cleaned = transcript.replace(/^(hey\s+)?jarvis\s*/i, '').trim();
        if (cleaned.length > 0) handleCommand(cleaned);
        return;
      }
      if (wakeListeningRef.current && !activeListeningRef.current) {
        const lower = transcript.toLowerCase();
        if (lower.includes('jarvis')) {
          playWakeSound();
          const afterWake = lower.split(/jarvis\s*/i).pop().trim();
          if (lastResult.isFinal && afterWake.length > 2) {
            activeListeningRef.current = false;
            setIsListening(false); setOrbState('idle');
            handleCommand(afterWake);
          } else {
            activeListeningRef.current = true;
            setIsListening(true); setOrbState('listening');
          }
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        if (wakeListeningRef.current) {
          activeListeningRef.current = false; setIsListening(false);
          // Exponential backoff
          const delay = Math.min(300 * Math.pow(2, restartAttempts), 5000);
          restartAttempts++;
          setTimeout(safeStart, delay);
        }
        return;
      }
      activeListeningRef.current = false; setIsListening(false); setOrbState('idle');
    };

    recognition.onend = () => {
      activeListeningRef.current = false; setIsListening(false);
      if (wakeListeningRef.current) setTimeout(safeStart, 300);
      else setOrbState('idle');
    };

    recognitionRef.current = recognition;

    // Health-check: if wake mode is on but recognition silently died, restart it
    wakeHealthRef.current = setInterval(() => {
      if (wakeListeningRef.current) {
        try { recognition.start(); } catch { /* already running, that's fine */ }
      }
    }, 30000);

    return () => clearInterval(wakeHealthRef.current);
  }, []); // eslint-disable-line

  // ===== speakResponse =====
  function speakResponse(text) {
    jarvisSpeak(text, () => setOrbState('speaking'), () => {
      setOrbState('idle');
      if (wakeListeningRef.current && recognitionRef.current) {
        activeListeningRef.current = true; setIsListening(true); setOrbState('listening');
        clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = setTimeout(() => {
          activeListeningRef.current = false; setIsListening(false); setOrbState('idle');
        }, 6000);
      }
    });
  }

  // ===== Main command handler =====
  const handleCommand = useCallback(async (text) => {
    if (!text.trim()) return;
    stopSpeaking(); stopAlarmSound(); setOrbState('idle');
    addUserMessage(text);
    setIsTyping(true); setOrbState('thinking');

    const response = await processCommand(text);
    setIsTyping(false);

    if (response.type === 'goals_ui') { setShowGoals(true); setOrbState('idle'); return; }
    if (response.type === 'focus') {
      const match = response.text.match(/__FOCUS_START_(\d+)__/);
      const mins = match ? parseInt(match[1]) : 25;
      setFocusMode({ minutes: mins }); setFocusPaused(false);
      setFocusStartTime(new Date().toISOString());
      const msg = `Focus mode activated for **${mins} minutes**, sir. All distractions eliminated.`;
      addJarvisMessage(msg); speakResponse(msg); return;
    }
    if (response.type === 'focus_stop') {
      setFocusMode(null);
      const msg = 'Focus session ended, sir. Well done.';
      addJarvisMessage(msg); speakResponse(msg); return;
    }
    if (response.type === 'settings') { setShowSettings(true); return; }
    if (response.type === 'skills_ui') { setShowSkills(true); setOrbState('idle'); return; }
    if (response.type === 'journal_ui') { setShowJournal(true); setOrbState('idle'); return; }
    if (response.type === 'analytics_ui') { setShowAnalytics(true); setOrbState('idle'); return; }
    if (response.type === 'weekly_report_ui') { setShowWeeklyReport(true); setOrbState('idle'); return; }
    if (response.type === 'morning_ritual') { setShowMorningRitual(true); setOrbState('idle'); return; }
    if (response.type === 'evening_debrief') { setShowEveningDebrief(true); setOrbState('idle'); return; }
    if (response.type === 'reading_log_ui') {
      setIsTyping(false); setOrbState('idle');
      addJarvisMessage(formatReadingLog()); return;
    }
    if (response.type === 'read_url') {
      setIsTyping(false); setOrbState('thinking');
      const url = detectURL(response.raw || text);
      if (url) {
        addJarvisMessage('Reading that for you, sir. One moment...');
        const result = await fetchAndSummarize(url, streamChat);
        setOrbState('idle');
        if (result.success) { addJarvisMessage(result.displayText); speakResponse(result.displayText); }
        else { const e = `Couldn't read that URL, sir: ${result.error}`; addJarvisMessage(e); speakResponse(e); }
      }
      return;
    }
    if (response.type === 'skill_log_natural' || response.type === 'skill_add_natural') {
      setIsTyping(true); setOrbState('thinking');
      const streamMsgId = Date.now();
      setMessages(prev => [...prev, { sender: 'jarvis', text: '', id: streamMsgId, streaming: true }]);
      let streamed = '';
      const finalResult = await streamChat(text, buildAIContext(), (chunk) => {
        streamed += chunk;
        setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: streamed } : m));
      });
      setIsTyping(false);
      setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: finalResult.text, streaming: false } : m));
      if (finalResult.actions?.length > 0) executeActions(finalResult.actions);
      speakResponse(finalResult.text); return;
    }

    if (response.type === 'ai_needed') {
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
      speakResponse(finalResult.text); return;
    }

    if (response.actions?.length > 0) executeActions(response.actions);
    addJarvisMessage(response.text);
    speakResponse(response.text);
  }, []); // eslint-disable-line

  // ===== Action executor =====
  function executeActions(actions) {
    for (const action of actions) {
      switch (action.type) {
        case 'FOCUS_START': setFocusMode({ minutes: parseInt(action.value) || 25 }); setFocusPaused(false); setFocusStartTime(new Date().toISOString()); break;
        case 'FOCUS_STOP': setFocusMode(null); break;
        case 'GOALS_SHOW': setShowGoals(true); break;
        case 'GOAL_ADD': if (action.value) addGoal(action.value); break;
        case 'NOTE_ADD': {
          if (action.value) {
            const notes = JSON.parse(localStorage.getItem('jarvis_notes') || '[]');
            notes.push({ text: action.value, created: Date.now() });
            localStorage.setItem('jarvis_notes', JSON.stringify(notes));
          }
          break;
        }
        case 'NOTES_SHOW': {
          const notes = JSON.parse(localStorage.getItem('jarvis_notes') || '[]');
          if (notes.length > 0) {
            let notesList = `📝 **Your Notes** (${notes.length}):\n\n`;
            notes.forEach((n, i) => { notesList += `**${i + 1}.** ${n.text}\n`; });
            addJarvisMessage(notesList);
          }
          break;
        }
        case 'REMINDER_SET': {
          const parts = action.value.split('|');
          const reminderText = parts[0]?.trim();
          const mins = parseInt(parts[1]) || 30;
          if (reminderText) addReminder(reminderText, mins);
          break;
        }
        case 'SEARCH': if (action.value) window.open(`https://www.google.com/search?q=${encodeURIComponent(action.value)}`, '_blank'); break;
        case 'HABIT_ADD': if (action.value) { const r = addHabit(action.value); if (!r) addJarvisMessage(`Already tracking **${action.value}**, sir.`); } break;
        case 'HABIT_CHECK': if (action.value) { const r = checkInHabit(action.value); if (r?.alreadyDone) addJarvisMessage(`Already checked in **${action.value}** today, sir. 💪`); } break;
        case 'HABIT_REPORT': { const rpt = getHabitReport(); if (rpt) addJarvisMessage(rpt); break; }
        case 'SLEEP_SET': if (action.value) setSleepSchedule({ bedtime: action.value }); break;
        case 'WAKE_SET': if (action.value) setSleepSchedule({ wakeTime: action.value }); break;
        case 'OPEN_URL': if (action.value) { let url = action.value; if (!url.startsWith('http')) url = 'https://' + url; window.open(url, '_blank'); } break;
        case 'COPY': if (action.value) { navigator.clipboard.writeText(action.value).catch(() => {}); addJarvisMessage('Copied to clipboard, sir.'); } break;
        case 'SETTINGS': setShowSettings(true); break;
        case 'SKILLS_SHOW': setShowSkills(true); break;
        case 'SKILL_ADD': {
          if (action.value) {
            const [name, cat, topicsStr] = action.value.split('|');
            const topics = topicsStr ? topicsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
            if (name?.trim()) {
              const res = addNewSkill(name.trim(), cat?.trim() || 'General', topics);
              addJarvisMessage(res ? `✅ Tracking **${name.trim()}** now, sir.` : `Already tracking **${name.trim()}**, sir.`);
            }
          }
          break;
        }
        case 'SKILL_LOG': {
          if (action.value) {
            const [skillName, mins, topicName] = action.value.split('|');
            if (skillName?.trim()) {
              const res = logStudySession(skillName.trim(), parseInt(mins) || 30, topicName?.trim() || null);
              if (res) {
                let msg = `✅ Logged **${mins || 30} min** on **${skillName.trim()}**${topicName ? ` — ${topicName}` : ''}.`;
                if (res.newMilestone) msg += `\n🏆 **Milestone!** ${res.newMilestone.description}`;
                addJarvisMessage(msg);
                updateTodayJournal({ lastStudySkill: skillName.trim() }).catch(() => {});
              } else { addJarvisMessage(`Couldn't find skill "${skillName}", sir. Add it first via the Skills panel.`); }
            }
          }
          break;
        }
        case 'JOURNAL_SHOW': setShowJournal(true); break;
        case 'ANALYTICS_SHOW': setShowAnalytics(true); break;
        case 'WEEKLY_REPORT': setShowWeeklyReport(true); break;
        case 'READING_SHOW': addJarvisMessage(formatReadingLog()); break;
        case 'MORNING_RITUAL': setShowMorningRitual(true); break;
        case 'EVENING_DEBRIEF': setShowEveningDebrief(true); break;
      }
    }
  }

  // ===== Focus complete =====
  async function handleFocusStop(completed) {
    const endedAt = new Date().toISOString();
    const plannedMins = focusMode?.minutes || 25;
    const startedAt = focusStartTime || new Date(Date.now() - plannedMins * 60000).toISOString();
    const actualMins = Math.round((new Date(endedAt) - new Date(startedAt)) / 60000);
    const sessionEntry = logFocusSession({ startedAt, plannedMinutes: plannedMins, actualMinutes: Math.min(actualMins, plannedMins), completed });
    // Append session to today's journal (read-then-write to avoid wiping array)
    try {
      const existing = await getTodayJournal();
      const sessions = [...(existing.focusSessions || []), {
        startedAt, endedAt, plannedMinutes: plannedMins,
        actualMinutes: Math.min(actualMins, plannedMins), completed,
      }];
      updateTodayJournal({ focusSessions: sessions }).catch(() => {});
    } catch {}
    setFocusMode(null); setFocusPaused(false); setFocusStartTime(null);
    if (completed) {
      await resumeAudio();
      playFocusCompleteSound();
      if (Notification.permission === 'granted') {
        new Notification('⏱️ JARVIS — Focus Complete', {
          body: 'Outstanding, sir. Your session is complete. Time to recover.',
          silent: false,
        });
      }
      const announcement = 'Outstanding work, sir. Your focus session is complete. You have just outworked 99 percent of people on this planet. Take a moment, breathe, and tell me when you are ready to go again.';
      const chatMsg = '🏆 **Focus session complete!** Outstanding discipline, sir. You\'ve just outworked 99% of people. Shall we go again?';
      addJarvisMessage(chatMsg);
      setTimeout(() => speakResponse(announcement), 2700);
    } else {
      const msg = 'Focus session ended early, sir. Every minute of deep work compounds. Remember that.';
      addJarvisMessage(msg); speakResponse(msg);
    }
  }

  // ===== Mic toggle =====
  function handleMic() {
    if (!recognitionRef.current) {
      addJarvisMessage('Voice recognition isn\'t available in this browser, sir. Please use Chrome.');
      return;
    }
    if (wakeListeningRef.current) {
      wakeListeningRef.current = false; activeListeningRef.current = false;
      setWakeWordActive(false); setIsListening(false); setOrbState('idle');
      try { recognitionRef.current.stop(); } catch {}
      addJarvisMessage('Voice mode deactivated, sir. Type or click the mic to reach me.');
    } else {
      wakeListeningRef.current = true; setWakeWordActive(true); setOrbState('idle');
      try { recognitionRef.current.start(); } catch {
        try { recognitionRef.current.stop(); } catch {}
        setTimeout(() => { try { recognitionRef.current.start(); } catch {} }, 300);
      }
      addJarvisMessage('Voice mode activated, sir. Say **"JARVIS"** and I\'m all ears.');
      speakResponse('Voice mode activated, sir.');
    }
  }

  function handleSend() {
    if (!inputText.trim()) return;
    handleCommand(inputText);
    setInputText('');
    inputRef.current?.focus();
  }

  // Mark user interaction on first click or keypress anywhere — unlocks AudioContext
  const handleFirstInteraction = useCallback(() => {
    markUserInteraction();
  }, []);

  return (
    <div
      onClickCapture={handleFirstInteraction}
      onKeyDownCapture={handleFirstInteraction}
      style={{ display: 'contents' }}
    >
      <ParticlesCanvas />
      <HUD onSettingsClick={() => setShowSettings(true)} wakeWordActive={wakeWordActive} />
      <main className="app-main">
        <ArcReactor state={orbState} />
        <div className="chat-container">
          <div className="chat-log">
            {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
            {isTyping && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>
        </div>
        <WidgetBar
          onCommand={handleCommand}
          onClear={() => {
            setMessages([]);
            localStorage.removeItem('jarvis_chat_history');
            addJarvisMessage('Chat history cleared, sir. Clean slate.');
          }}
        />
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
      {focusMode && (
        <FocusOverlay
          minutes={focusMode.minutes}
          paused={focusPaused}
          onPause={() => setFocusPaused(p => !p)}
          onStop={handleFocusStop}
        />
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showSkills && <SkillsPanel onClose={() => setShowSkills(false)} />}
      {showJournal && <JournalPanel onClose={() => setShowJournal(false)} />}
      {showAnalytics && <AnalyticsDashboard onClose={() => setShowAnalytics(false)} />}
      {showWeeklyReport && (
        <WeeklyReport
          onClose={() => setShowWeeklyReport(false)}
          autoGenerate={isWeeklyReportDue()}
        />
      )}
      {showMorningRitual && (
        <MorningRitual
          onComplete={(summary) => { setShowMorningRitual(false); addJarvisMessage(summary); speakResponse(summary); }}
          onSkip={() => setShowMorningRitual(false)}
        />
      )}
      {showEveningDebrief && (
        <EveningDebrief
          onComplete={(summary) => { setShowEveningDebrief(false); addJarvisMessage(summary); speakResponse(summary); }}
          onSkip={() => setShowEveningDebrief(false)}
        />
      )}
    </div>
  );
}

import { useEffect } from 'react';
import {
  runProactiveChecks, generateBriefing, syncProfileFromMemories
} from '../utils/proactive';
import { isMorningRitualDue, isEveningDebriefDue } from '../utils/rituals';
import { runPatternChecks, isWeeklyReportDue } from '../utils/patterns';
import { syncModelFromMemories, getModelContext, runWeeklyModelExtraction } from '../utils/memory';
import { setUserModelContext } from '../utils/gemini';
import { streamChat } from '../utils/gemini';
import { checkSleepSchedule } from '../utils/habits';
import { playReminderSound, playAlarmSound } from '../utils/sounds';
import { saveStreak } from '../utils/jarvis-brain';
import { restoreHistory } from '../utils/gemini';
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';
import { requestNotificationPermission, scheduleDailyNotification } from '../utils/notifications';
import { preloadVoices } from '../utils/voice';

const JarvisNative = registerPlugin('JarvisNative');

function carryForwardGoals() {
  const today = new Date().toDateString();
  try {
    const data = JSON.parse(localStorage.getItem('jarvis_goals') || '{}');
    if (!data.date || data.date === today) return 0;
    const incomplete = (data.items || []).filter(g => !g.done);
    if (incomplete.length === 0) return 0;
    localStorage.setItem('jarvis_goals', JSON.stringify({
      date: today,
      items: incomplete.map(g => ({ ...g, carried: true, done: false })),
    }));
    return incomplete.length;
  } catch { return 0; }
}

/**
 * useJarvisLifecycle — Handles all startup, proactive polling, and
 * visibility change logic. Keeps App.jsx clean of initialization noise.
 */
export function useJarvisLifecycle({
  addJarvisMessage,
  speakResponse,
  setShowWeeklyReport,
  handleCommand,
}) {
  // --- Startup ---
  useEffect(() => {
    preloadVoices();

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    requestNotificationPermission().then(granted => {
      if (granted) {
        scheduleDailyNotification(2001, 'JARVIS', 'Good morning, sir. Time for your morning ritual.', 8, 0);
        scheduleDailyNotification(2002, 'JARVIS', 'Evening check-in, sir. Let us review the day.', 20, 0);
      }
    });

    if (Capacitor.isNativePlatform()) {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (apiKey) JarvisNative.setApiKey({ apiKey }).catch(() => {});
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
        localStorage.setItem('jarvis_last_briefing_date', today);
        const briefing = await generateBriefing();
        setTimeout(() => {
          addJarvisMessage(briefing);
          if (Capacitor.isNativePlatform()) {
            speakResponse(briefing);
          } else {
            window.__pendingStartupSpeech = briefing;
          }
        }, 800);
      }

      try {
        const morningDue = await isMorningRitualDue();
        if (morningDue) {
          setTimeout(() => {
            handleCommand('[System: The user just woke up. Do NOT wait for them to speak first. Instantly initiate the morning ritual conversationally. Start by warmly greeting them and asking how they slept/their energy level.]', true);
          }, 1800);
        }
      } catch {}
    })();
  }, []); // eslint-disable-line

  // --- Visibility change ---
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const lastBriefing = localStorage.getItem('jarvis_last_briefing_date');
      const today = new Date().toDateString();
      const lastActive = parseInt(localStorage.getItem('jarvis_last_active_ts') || '0');
      const hoursSinceActive = (Date.now() - lastActive) / 3600000;
      if (lastBriefing !== today || hoursSinceActive >= 8) {
        localStorage.setItem('jarvis_last_briefing_date', today);
        const briefing = await generateBriefing();
        addJarvisMessage(briefing);
        speakResponse(briefing);
      }
      localStorage.setItem('jarvis_last_active_ts', String(Date.now()));
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem('jarvis_last_active_ts', String(Date.now()));
      }
    };
    const handler = () => { onVisible(); onHidden(); };
    document.addEventListener('visibilitychange', handler);
    localStorage.setItem('jarvis_last_active_ts', String(Date.now()));
    return () => document.removeEventListener('visibilitychange', handler);
  }, []); // eslint-disable-line

  // --- Proactive 5-min polling ---
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

      try {
        const patterns = await runPatternChecks();
        for (const p of patterns) { playReminderSound(); addJarvisMessage(p.message); speakResponse(p.message); }
      } catch {}

      try {
        const eveningDue = await isEveningDebriefDue();
        if (eveningDue) {
          handleCommand('[System: It is evening. Initiate the evening debrief conversationally. Start by asking if they completed their MITs.]', true);
        }
      } catch {}

      if (isWeeklyReportDue()) setShowWeeklyReport(true);

      const now = new Date();
      if (now.getDay() === 0 && now.getHours() >= 21) {
        const lastExtraction = localStorage.getItem('jarvis_last_extraction_date');
        const today = now.toDateString();
        if (lastExtraction !== today) {
          runWeeklyModelExtraction(streamChat).catch(console.error);
          localStorage.setItem('jarvis_last_extraction_date', today);
        }
      }

      try { const ctx = await getModelContext(); setUserModelContext(ctx); } catch {}
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line
}

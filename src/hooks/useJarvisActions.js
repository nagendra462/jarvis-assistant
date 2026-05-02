import { useCallback } from 'react';
import { processCommand, addGoal } from '../utils/jarvis-brain';
import { streamChat, setEmotionalContext } from '../utils/gemini';
import { detectEmotionalTone, buildEmotionalContext, updateSessionMood, extractMentionedPeople } from '../utils/emotion';
import { logCommitment } from '../utils/patterns';
import { logSignificantExchange, trackRelationship } from '../utils/memory';
import { searchSemanticMemory, storeSemanticMemory } from '../utils/rag';
import { buildAIContext } from '../utils/jarvis-brain';
import { stopAlarmSound } from '../utils/sounds';
import { stopSpeaking } from '../utils/voice';
import { detectURL, fetchAndSummarize, formatReadingLog } from '../utils/reader';
import { logStudySession, addSkill as addNewSkill } from '../utils/skills';
import { updateTodayJournal } from '../utils/journal';
import { addHabit, checkInHabit, getHabitReport, setSleepSchedule } from '../utils/habits';
import { addReminder } from '../utils/proactive';


/**
 * useJarvisActions — The entire executeActions switch dispatcher,
 * so it lives outside of App.jsx and is independently testable.
 */
export function useJarvisActions({ addJarvisMessage, speakResponse, setFocusMode, setFocusPaused, setFocusStartTime, setShowGoals, setShowSettings, setShowSkills, setShowJournal, setShowAnalytics, setShowWeeklyReport }) {
  const executeActions = useCallback((actions) => {
    for (const action of actions) {
      switch (action.type) {
        case 'FOCUS_START': setFocusMode({ minutes: parseInt(action.value) || 25 }); setFocusPaused(false); setFocusStartTime(new Date().toISOString()); break;
        case 'FOCUS_STOP': setFocusMode(null); break;
        case 'GOALS_SHOW': setShowGoals(true); break;
        case 'GOAL_ADD': if (action.value) addGoal(action.value); break;
        case 'NOTE_ADD': {
          if (action.value) {
            import('../utils/jarvis-brain').then(({ addNote }) => addNote(action.value)).catch(() => {});
          }
          break;
        }
        case 'NOTES_SHOW': {
          const notes = JSON.parse(localStorage.getItem('jarvis_notes') || '[]');
          if (notes.length > 0) {
            let list = `📝 **Your Notes** (${notes.length}):\n\n`;
            notes.forEach((n, i) => { list += `**${i + 1}.** ${n.text}\n`; });
            addJarvisMessage(list);
          }
          break;
        }
        case 'REMINDER_SET': {
          const parts = action.value?.split('|');
          if (parts?.[0]) addReminder(parts[0].trim(), parseInt(parts[1]) || 30);
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
      }
    }
  }, [addJarvisMessage, setFocusMode, setFocusPaused, setFocusStartTime, setShowGoals, setShowSettings, setShowSkills, setShowJournal, setShowAnalytics, setShowWeeklyReport]);

  return { executeActions };
}

/**
 * useHandleCommand — The main AI request pipeline. Takes user text,
 * routes it through processCommand or streamChat, and fires actions.
 */
export function useHandleCommand({ addJarvisMessage, addUserMessage, speakResponse, setIsTyping, setOrbState, stopAlarmSoundFn, executeActions, focusMode, focusPaused, focusStartTime, setFocusMode, setFocusPaused, setFocusStartTime, setShowGoals, setShowSkills, setShowJournal, setShowAnalytics, setShowWeeklyReport, setShowSettings }) {
  const handleCommand = useCallback(async (text, isSilent = false) => {
    if (!text.trim()) return;
    stopSpeaking();
    stopAlarmSoundFn?.();
    setOrbState('idle');
    if (!isSilent) addUserMessage(text);
    setIsTyping(true);
    setOrbState('thinking');

    const tone = detectEmotionalTone(text);
    updateSessionMood(tone);

    const pastContext = await searchSemanticMemory(text, 2);
    let deepMemoryStr = '';
    if (pastContext.length > 0) {
      deepMemoryStr = '\n\n[DEEP MEMORY RETRIEVAL]:\n' +
        pastContext.map(p => `- (From ${new Date(p.timestamp).toLocaleDateString()}): ${p.text}`).join('\n');
    }
    setEmotionalContext(buildEmotionalContext(tone) + deepMemoryStr);

    const response = await processCommand(text);
    setIsTyping(false);

    const processExchange = (jarvisText) => {
      logCommitment(text);
      if (text.length > 20 || jarvisText.length > 30) {
        logSignificantExchange(text, jarvisText).catch(() => {});
        storeSemanticMemory(`User said: "${text}" | JARVIS replied: "${jarvisText}"`).catch(() => {});
      }
      extractMentionedPeople(text).forEach(p => trackRelationship(p, 'Contact', text).catch(() => {}));
    };

    // --- UI Actions ---
    if (response.type === 'goals_ui') { setShowGoals(true); setOrbState('idle'); return; }
    if (response.type === 'focus') {
      const match = response.text.match(/__FOCUS_START_(\d+)__/);
      const mins = match ? parseInt(match[1]) : 25;
      setFocusMode({ minutes: mins }); setFocusPaused(false); setFocusStartTime(new Date().toISOString());
      const msg = `Focus mode activated for **${mins} minutes**, sir.`;
      addJarvisMessage(msg); speakResponse(msg); return;
    }
    if (response.type === 'focus_stop') { setFocusMode(null); const msg = 'Focus session ended, sir.'; addJarvisMessage(msg); speakResponse(msg); return; }
    if (response.type === 'settings') { setShowSettings(true); return; }
    if (response.type === 'skills_ui') { setShowSkills(true); setOrbState('idle'); return; }
    if (response.type === 'journal_ui') { setShowJournal(true); setOrbState('idle'); return; }
    if (response.type === 'analytics_ui') { setShowAnalytics(true); setOrbState('idle'); return; }
    if (response.type === 'weekly_report_ui') { setShowWeeklyReport(true); setOrbState('idle'); return; }
    if (response.type === 'reading_log_ui') { setOrbState('idle'); addJarvisMessage(formatReadingLog()); return; }

    if (response.type === 'read_url') {
      setIsTyping(false); setOrbState('thinking');
      const url = (() => { const m = text.match(/https?:\/\/[^\s]+/); return m ? m[0] : null; })();
      if (url) {
        addJarvisMessage('Reading that for you, sir. One moment...');
        const result = await fetchAndSummarize(url, streamChat);
        setOrbState('idle');
        if (result.success) { addJarvisMessage(result.displayText); speakResponse(result.displayText); }
        else { const e = `Couldn't read that URL, sir: ${result.error}`; addJarvisMessage(e); speakResponse(e); }
      }
      return;
    }

    // --- AI Streaming ---
    if (response.type === 'skill_log_natural' || response.type === 'skill_add_natural' || response.type === 'ai_needed') {
      const streamMsgId = Date.now();
      addJarvisMessage('');
      // Replace last message with streaming one
      const contextStr = buildAIContext();
      let streamedText = '';
      const finalResult = await streamChat(text, contextStr, (chunk) => {
        streamedText += chunk;
      });
      if (finalResult.actions?.length > 0) executeActions(finalResult.actions);
      processExchange(finalResult.text);
      speakResponse(finalResult.text);
      return;
    }

    if (response.actions?.length > 0) executeActions(response.actions);
    processExchange(response.text);
    addJarvisMessage(response.text);
    speakResponse(response.text);
  }, [focusMode, focusPaused, focusStartTime, addJarvisMessage, addUserMessage, speakResponse, setIsTyping, setOrbState, executeActions, setFocusMode, setFocusPaused, setFocusStartTime, setShowGoals, setShowSkills, setShowJournal, setShowAnalytics, setShowWeeklyReport, setShowSettings]);

  return { handleCommand };
}

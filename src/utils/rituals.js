// JARVIS Ritual Engine
// State machine for morning check-in and evening debrief
// Persists state in localStorage, results in journal

import { getTodayJournal, updateTodayJournal } from './journal.js';
import { logMood } from './memory.js';
import { getBacklog, saveBacklog, addGoal } from './jarvis-brain.js';

const today = () => new Date().toISOString().slice(0, 10);

// ===== Check if rituals are due =====
export async function isMorningRitualDue() {
  const hour = new Date().getHours();
  if (hour < 5 || hour > 11) return false; // only 5am-11am
  const journal = await getTodayJournal();
  if (journal?.morningRitual) return false; // already done

  // Don't re-prompt within 4 hours if they dismissed/skipped it
  const lastPrompt = localStorage.getItem('jarvis_morning_last_prompt');
  if (lastPrompt && Date.now() - parseInt(lastPrompt) < 4 * 60 * 60 * 1000) return false;
  localStorage.setItem('jarvis_morning_last_prompt', String(Date.now()));
  
  return true;
}

export async function isEveningDebriefDue() {
  const hour = new Date().getHours();
  if (hour < 20) return false; // only after 8pm
  const journal = await getTodayJournal();
  if (journal?.eveningDebrief) return false; // already done
  // Don't re-prompt within 30 min
  const lastPrompt = localStorage.getItem('jarvis_evening_last_prompt');
  if (lastPrompt && Date.now() - parseInt(lastPrompt) < 30 * 60 * 1000) return false;
  localStorage.setItem('jarvis_evening_last_prompt', String(Date.now()));
  return true;
}

// JARVIS Ritual Engine
// State machine for morning check-in and evening debrief
// Persists state in localStorage, results in journal

import { getTodayJournal, updateTodayJournal } from './journal.js';
import { logMood } from './memory.js';

const today = () => new Date().toISOString().slice(0, 10);

// ===== Morning Ritual =====
export const MORNING_STEPS = [
  {
    id: 'energy',
    question: "Good morning, sir. Before we begin — on a scale of **1 to 10**, how are you feeling right now?",
    hint: "Just a number is fine",
    type: 'number',
  },
  {
    id: 'yesterday_review',
    question: "How did yesterday go? Did you finish what you set out to do?",
    hint: "Be honest — yes, no, or partially",
    type: 'text',
  },
  {
    id: 'mit_1',
    question: "What is your **first Most Important Thing** for today? The one task that, if only this gets done, makes today a win?",
    hint: "Be specific. Not 'work on DSA' — 'finish the arrays module'",
    type: 'text',
  },
  {
    id: 'mit_2',
    question: "Your **second MIT** for today?",
    hint: "Second priority",
    type: 'text',
  },
  {
    id: 'mit_3',
    question: "And your **third MIT** — or say 'skip' if two is enough today.",
    hint: "Third priority (optional)",
    type: 'text',
  },
  {
    id: 'intention',
    question: "Last one: what would make today **remarkable** for you — beyond just completing tasks?",
    hint: "Could be a feeling, a breakthrough, a conversation",
    type: 'text',
  },
];

// ===== Evening Debrief =====
export const EVENING_STEPS = [
  {
    id: 'mit_check',
    question: "Evening check-in time, sir. Let's review your MITs. Did you complete them?",
    hint: "Tell me which ones you finished — or say 'none' if it was that kind of day",
    type: 'text',
  },
  {
    id: 'biggest_win',
    question: "Regardless of your MITs — what was today's **biggest win**, however small?",
    hint: "There's always something. Find it.",
    type: 'text',
  },
  {
    id: 'carry_forward',
    question: "What's **carrying forward** to tomorrow? What didn't get done that must get done?",
    hint: "This becomes tomorrow's starting point",
    type: 'text',
  },
  {
    id: 'mood_word',
    question: "One word for how today felt.",
    hint: "e.g. focused, scattered, energized, slow, proud, frustrated",
    type: 'text',
  },
  {
    id: 'gratitude',
    question: "Finally — what's one thing you're grateful for today? (Say 'skip' to end.)",
    hint: "Optional. Builds perspective over time.",
    type: 'text',
  },
];

// ===== State management =====
const RITUAL_KEY = 'jarvis_ritual_state';

export function getRitualState() {
  try { return JSON.parse(localStorage.getItem(RITUAL_KEY) || 'null'); } catch { return null; }
}

export function setRitualState(state) {
  if (!state) localStorage.removeItem(RITUAL_KEY);
  else localStorage.setItem(RITUAL_KEY, JSON.stringify(state));
}

export function clearRitualState() { localStorage.removeItem(RITUAL_KEY); }

// ===== Check if rituals are due =====
export async function isMorningRitualDue() {
  const hour = new Date().getHours();
  if (hour < 5 || hour > 11) return false; // only 5am-11am
  const journal = await getTodayJournal();
  return !journal?.morningRitual; // not done today
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

// ===== Process a step answer =====
export function startMorningRitual() {
  const state = { type: 'morning', step: 0, answers: {}, startedAt: new Date().toISOString() };
  setRitualState(state);
  return { state, question: MORNING_STEPS[0] };
}

export function startEveningDebrief(todayMITs = []) {
  const state = { type: 'evening', step: 0, answers: {}, startedAt: new Date().toISOString(), todayMITs };
  setRitualState(state);
  return { state, question: EVENING_STEPS[0] };
}

export function getCurrentStep() {
  const state = getRitualState();
  if (!state) return null;
  const steps = state.type === 'morning' ? MORNING_STEPS : EVENING_STEPS;
  if (state.step >= steps.length) return null;
  return steps[state.step];
}

export async function answerStep(answer) {
  const state = getRitualState();
  if (!state) return null;
  const steps = state.type === 'morning' ? MORNING_STEPS : EVENING_STEPS;
  const currentStep = steps[state.step];

  state.answers[currentStep.id] = answer.trim();
  state.step += 1;

  if (state.step >= steps.length) {
    // Ritual complete
    const result = await completeRitual(state);
    clearRitualState();
    return { done: true, summary: result };
  }

  setRitualState(state);
  return { done: false, nextQuestion: steps[state.step] };
}

async function completeRitual(state) {
  const a = state.answers;
  if (state.type === 'morning') {
    const mits = [a.mit_1, a.mit_2, a.mit_3].filter(m => m && m.toLowerCase() !== 'skip' && m.trim().length > 0);
    const energy = parseInt(a.energy) || null;
    const ritualData = {
      completedAt: new Date().toISOString(),
      energy,
      yesterdayReview: a.yesterday_review,
      todayMITs: mits,
      intention: a.intention,
    };
    await updateTodayJournal({ morningRitual: ritualData, energyMorning: energy });
    return buildMorningSummary(ritualData);
  } else {
    const moodWord = a.mood_word?.toLowerCase() || null;
    const ritualData = {
      completedAt: new Date().toISOString(),
      mitCheck: a.mit_check,
      biggestWin: a.biggest_win,
      carryForward: a.carry_forward,
      moodWord,
      gratitude: a.gratitude?.toLowerCase() === 'skip' ? null : a.gratitude,
    };
    await updateTodayJournal({ eveningDebrief: ritualData, moodWord });
    if (moodWord) await logMood(moodWord);
    return buildEveningSummary(ritualData);
  }
}

function buildMorningSummary(data) {
  const mits = data.todayMITs;
  const energyStr = data.energy ? `You're at **${data.energy}/10** energy.` : '';
  const mitsStr = mits.length > 0
    ? `Your MITs for today:\n${mits.map((m, i) => `  **${i + 1}.** ${m}`).join('\n')}`
    : '';
  const intentionStr = data.intention ? `\nYour intention: *"${data.intention}"*` : '';
  return `Morning ritual complete. ${energyStr}\n\n${mitsStr}${intentionStr}\n\nI'll hold you to these, sir. Let's make today count.`;
}

function buildEveningSummary(data) {
  const mood = data.moodWord ? `Today felt **${data.moodWord}**.` : '';
  const win = data.biggestWin ? `\n\n🏆 **Biggest win:** ${data.biggestWin}` : '';
  const carry = data.carryForward ? `\n\n📌 **Carrying forward:** ${data.carryForward}` : '';
  const gratitude = data.gratitude ? `\n\n🙏 **Grateful for:** ${data.gratitude}` : '';
  return `Evening debrief complete. ${mood}${win}${carry}${gratitude}\n\nGood work showing up for this, sir. Rest well. Tomorrow's a new shot.`;
}

// ===== Check if ritual is active =====
export function isRitualActive() { return getRitualState() !== null; }

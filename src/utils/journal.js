// JARVIS Journal System
// One JSON entry per day, persisted server-side in jarvis-journals/
// Aggregates: morning ritual, evening debrief, focus sessions, goals, mood

const today = () => new Date().toISOString().slice(0, 10);

// ===== Server persistence =====
export async function saveJournal(updates) {
  const date = updates.date || today();
  try {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, ...updates }),
    });
    return res.ok;
  } catch { return false; }
}

export async function loadJournal(date = today()) {
  try {
    const res = await fetch(`/api/journal/get?date=${date}`);
    if (res.ok) return await res.json();
  } catch {}
  // Fallback to localStorage
  try { return JSON.parse(localStorage.getItem(`jarvis_journal_${date}`) || '{}'); } catch { return {}; }
}

export async function listJournals(days = 30) {
  try {
    const res = await fetch(`/api/journal/list?days=${days}`);
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

export async function getTodayJournal() {
  return loadJournal(today());
}

export async function updateTodayJournal(updates) {
  const existing = await getTodayJournal();
  const merged = { ...existing, ...updates, date: today(), updatedAt: new Date().toISOString() };
  // Also save to localStorage as backup
  localStorage.setItem(`jarvis_journal_${today()}`, JSON.stringify(merged));
  return saveJournal(merged);
}

// ===== Journal entry helpers =====
export function buildEmptyEntry(date = today()) {
  return {
    date,
    morningRitual: null,    // { completedAt, energy, yesterdayMITDone, todayMITs, intention }
    eveningDebrief: null,   // { completedAt, mitsCompleted, biggestWin, carryForward, moodWord, gratitude }
    focusSessions: [],      // [{ startedAt, minutes, completed, skill }]
    goalsSet: [],
    goalsCompleted: [],
    energyMorning: null,
    moodWord: null,
    aiSummary: null,
    productivityScore: null, // 0–100 computed
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Compute productivity score 0-100 for a journal entry
export function computeProductivityScore(entry) {
  let score = 0;
  // Morning ritual done (+10)
  if (entry.morningRitual) score += 10;
  // Evening debrief done (+10)
  if (entry.eveningDebrief) score += 10;
  // Focus sessions (+30 max, 10 per session up to 3)
  score += Math.min(30, (entry.focusSessions || []).filter(s => s.completed).length * 10);
  // Goals (+30 max based on completion rate)
  const set = (entry.goalsSet || []).length;
  const done = (entry.goalsCompleted || []).length;
  if (set > 0) score += Math.round((done / set) * 30);
  // Energy (+10 if high)
  if (entry.energyMorning >= 7) score += 10;
  // Mood (+10 if positive)
  const positiveMoods = ['great', 'amazing', 'focused', 'productive', 'energized', 'happy', 'motivated', 'strong'];
  if (entry.moodWord && positiveMoods.some(m => entry.moodWord.toLowerCase().includes(m))) score += 10;
  return Math.min(100, score);
}

// Get last N days of journal summaries for Gemini context
export async function getRecentJournalContext(days = 5) {
  const journals = await listJournals(days);
  if (journals.length === 0) return '';
  let context = '\n\n## Recent Journal Entries:\n';
  for (const j of journals.slice(0, 5)) {
    const score = computeProductivityScore(j);
    context += `\n**${j.date}** (score: ${score}/100)`;
    if (j.energyMorning) context += ` | Energy: ${j.energyMorning}/10`;
    if (j.moodWord) context += ` | Mood: ${j.moodWord}`;
    if (j.morningRitual?.todayMITs?.length) {
      context += `\n  MITs: ${j.morningRitual.todayMITs.join(', ')}`;
    }
    if (j.eveningDebrief?.biggestWin) context += `\n  Win: ${j.eveningDebrief.biggestWin}`;
    if (j.eveningDebrief?.carryForward) context += `\n  Carry forward: ${j.eveningDebrief.carryForward}`;
    const sessions = (j.focusSessions || []).filter(s => s.completed);
    if (sessions.length > 0) context += `\n  Focus: ${sessions.length} sessions`;
    context += '\n';
  }
  return context;
}

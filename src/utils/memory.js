// JARVIS Deep Memory Engine
// The living user model — grows more accurate every week.
// Stored server-side in jarvis-usermodel.json

import { getMemories } from './gemini.js';
import { listJournals, getRecentJournalContext } from './journal.js';
import { readJson, writeJson } from './storage.js';

// ===== Default model structure =====
function defaultModel() {
  return {
    profile: {
      name: null,
      profession: null,
      company: null,
      currentFocus: [],
      longTermGoals: [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    behavioral: {
      averageSleepTime: null,
      averageWakeTime: null,
      peakFocusHour: null,
      procrastinationTriggers: [],
      followThroughRate: null,    // 0.0 – 1.0
      mostProductiveDay: null,
      lateNightCount: 0,          // messages sent after 11pm this week
    },
    emotional: {
      recentMood: null,
      stressTriggers: [],
      motivationSources: [],
      lastLowPoint: null,
      lastHighPoint: null,
      moodHistory: [],            // [{ date, word, score }]
    },
    goals: {
      longTerm: [],
      completionHistory: {},       // { "2026-04": 0.42 }
    },
    relationships: [],            // [{ name, role, context, lastMentioned }]
    skills: [],                   // managed by skills.js, mirrored here for context
    weeklyPatterns: [],           // [{ week, focusHours, goalsSet, goalsCompleted, ... }]
    readingLog: [],               // managed by reader.js, mirrored here
    recentExchanges: [],          // [{ date, userMsg, jarvisReply }]
    lastModelUpdate: null,
  };
}

// ===== Load / Save =====
let _modelCache = null;

export async function loadUserModel() {
  if (_modelCache) return _modelCache;
  try {
    const data = await readJson('jarvis-usermodel.json');
    if (data && Object.keys(data).length > 0) {
      _modelCache = { ...defaultModel(), ...data };
      return _modelCache;
    }
  } catch {}
  // Fallback
  try {
    const local = JSON.parse(localStorage.getItem('jarvis_usermodel') || '{}');
    _modelCache = { ...defaultModel(), ...local };
    return _modelCache;
  } catch {}
  _modelCache = defaultModel();
  return _modelCache;
}

export async function saveUserModel(model) {
  model.profile.updatedAt = new Date().toISOString();
  _modelCache = model;
  localStorage.setItem('jarvis_usermodel', JSON.stringify(model));
  try {
    await writeJson('jarvis-usermodel.json', model);
  } catch {}
}

export async function updateModel(path, value) {
  const model = await loadUserModel();
  // path like 'profile.name' or 'behavioral.followThroughRate'
  const keys = path.split('.');
  let obj = model;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  await saveUserModel(model);
  return model;
}

// ===== Extract from Gemini memories (auto-populates profile) =====
export async function syncModelFromMemories() {
  const model = await loadUserModel();
  const memories = getMemories();
  let changed = false;
  for (const mem of memories) {
    const lower = mem.toLowerCase();
    if (/name is/i.test(mem) && !model.profile.name) {
      model.profile.name = mem.replace(/.*name is\s*/i, '').replace(/[.!,].*/, '').trim();
      changed = true;
    }
    if (/(engineer|developer|designer|manager|student|analyst)/i.test(lower) && !model.profile.profession) {
      model.profile.profession = mem;
      changed = true;
    }
    if (/(faang|google|amazon|meta|apple|interview|prep)/i.test(lower)) {
      if (!model.profile.currentFocus.includes(mem)) {
        model.profile.currentFocus.push(mem);
        changed = true;
      }
    }
    if (/(goal|want to|plan to|will)/i.test(lower)) {
      if (!model.goals.longTerm.includes(mem)) {
        model.goals.longTerm.push(mem);
        changed = true;
      }
    }
  }
  if (changed) await saveUserModel(model);
  return model;
}

// ===== Track a person mention =====
export async function trackRelationship(name, role, context) {
  const model = await loadUserModel();
  const existing = model.relationships.find(r => r.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.lastMentioned = new Date().toISOString().slice(0, 10);
    existing.context = context;
  } else {
    model.relationships.push({ name, role, context, lastMentioned: new Date().toISOString().slice(0, 10) });
    if (model.relationships.length > 50) model.relationships.shift();
  }
  await saveUserModel(model);
}

// ===== Track significant exchanges for cross-session continuity =====
export async function logSignificantExchange(userMsg, jarvisReply) {
  const model = await loadUserModel();
  if (!model.recentExchanges) model.recentExchanges = [];
  model.recentExchanges.unshift({ date: new Date().toISOString(), userMsg, jarvisReply });
  if (model.recentExchanges.length > 10) model.recentExchanges.pop();
  await saveUserModel(model);
}

// ===== Log mood =====
export async function logMood(word, score = null) {
  const model = await loadUserModel();
  model.emotional.recentMood = word;
  model.emotional.moodHistory.push({ date: new Date().toISOString().slice(0, 10), word, score });
  if (model.emotional.moodHistory.length > 90) model.emotional.moodHistory.shift();
  // Track high/low points
  if (score !== null) {
    if (score <= 3) model.emotional.lastLowPoint = new Date().toISOString().slice(0, 10);
    if (score >= 8) model.emotional.lastHighPoint = new Date().toISOString().slice(0, 10);
  }
  await saveUserModel(model);
}

// ===== Update behavioral stats from analytics =====
export async function updateBehavioral(updates) {
  const model = await loadUserModel();
  Object.assign(model.behavioral, updates);
  await saveUserModel(model);
}

// ===== Log weekly pattern (called every Sunday) =====
export async function logWeeklyPattern(weekData) {
  const model = await loadUserModel();
  model.weeklyPatterns.unshift(weekData);
  if (model.weeklyPatterns.length > 52) model.weeklyPatterns.pop(); // 1 year
  await saveUserModel(model);
}

// ===== Build rich context string for Gemini =====
export async function getModelContext() {
  const model = await loadUserModel();
  const recentJournals = await getRecentJournalContext(5);
  const parts = [];

  parts.push('\n\n## Living User Model');

  // Profile
  const p = model.profile;
  if (p.name || p.profession) {
    let profileStr = '**Profile:** ';
    if (p.name) profileStr += `Name: ${p.name}`;
    if (p.profession) profileStr += ` | ${p.profession}`;
    if (p.company) profileStr += ` at ${p.company}`;
    parts.push(profileStr);
  }

  if (p.currentFocus.length > 0) {
    parts.push(`**Current Focus:** ${p.currentFocus.slice(0, 3).join(', ')}`);
  }

  if (model.goals.longTerm.length > 0) {
    parts.push(`**Long-term Goals:** ${model.goals.longTerm.slice(0, 3).join(' | ')}`);
  }

  // Behavioral
  const b = model.behavioral;
  const behaviorParts = [];
  if (b.peakFocusHour !== null) behaviorParts.push(`Peak focus: ${b.peakFocusHour}:00`);
  if (b.followThroughRate !== null) behaviorParts.push(`Follow-through: ${Math.round(b.followThroughRate * 100)}%`);
  if (b.mostProductiveDay) behaviorParts.push(`Best day: ${b.mostProductiveDay}`);
  if (b.lateNightCount > 0) behaviorParts.push(`Late-night messages this week: ${b.lateNightCount}`);
  if (behaviorParts.length > 0) parts.push(`**Behavioral Patterns:** ${behaviorParts.join(' | ')}`);

  if (b.procrastinationTriggers.length > 0) {
    parts.push(`**Procrastination triggers:** ${b.procrastinationTriggers.join(', ')}`);
  }

  // Emotional
  const e = model.emotional;
  if (e.recentMood) parts.push(`**Current mood trend:** ${e.recentMood}`);
  if (e.lastLowPoint) parts.push(`**Last low point:** ${e.lastLowPoint}`);

  // Goal completion history
  const months = Object.entries(model.goals.completionHistory).slice(-3);
  if (months.length > 0) {
    const histStr = months.map(([m, r]) => `${m}: ${Math.round(r * 100)}%`).join(', ');
    parts.push(`**Goal completion history:** ${histStr}`);
  }

  // Recent weekly patterns
  if (model.weeklyPatterns.length > 0) {
    const lastWeek = model.weeklyPatterns[0];
    parts.push(`**Last week:** ${lastWeek.focusHours}h focus | ${lastWeek.goalsCompleted}/${lastWeek.goalsSet} goals | ${lastWeek.moodSummary || ''}`);
  }

  // Skills (brief)
  const skills = JSON.parse(localStorage.getItem('jarvis_skills') || '[]');
  if (skills.length > 0) {
    const skillsStr = skills.slice(0, 3).map(s => `${s.name} (${s.selfProficiency}%)`).join(', ');
    parts.push(`**Skills in progress:** ${skillsStr}`);
  }

  // Relationships
  if (model.relationships && model.relationships.length > 0) {
    const recent = model.relationships.slice(0, 3).map(r => `${r.name} (${r.role})`).join(', ');
    parts.push(`**People mentioned recently:** ${recent}`);
  }

  // Recent exchanges
  if (model.recentExchanges && model.recentExchanges.length > 0) {
    parts.push('\n## Recent Notable Exchanges:');
    model.recentExchanges.slice(0, 3).forEach(ex => {
      const dateStr = ex.date.slice(0, 10);
      parts.push(`[${dateStr}] User: "${ex.userMsg}" -> JARVIS: "${ex.jarvisReply}"`);
    });
  }

  return parts.join('\n') + recentJournals;
}

// ===== Weekly model extraction via Gemini =====
export async function runWeeklyModelExtraction(streamChat) {
  const model = await loadUserModel();
  const journals = await listJournals(7);
  if (journals.length === 0) return;

  const journalSummary = journals.map(j => {
    const lines = [`Date: ${j.date}`];
    if (j.energyMorning) lines.push(`Energy: ${j.energyMorning}/10`);
    if (j.moodWord) lines.push(`Mood: ${j.moodWord}`);
    if (j.morningRitual?.todayMITs?.length) lines.push(`MITs: ${j.morningRitual.todayMITs.join(', ')}`);
    if (j.eveningDebrief?.biggestWin) lines.push(`Win: ${j.eveningDebrief.biggestWin}`);
    if (j.eveningDebrief?.carryForward) lines.push(`Unfinished: ${j.eveningDebrief.carryForward}`);
    const sessions = (j.focusSessions || []).filter(s => s.completed);
    if (sessions.length) lines.push(`Focus sessions: ${sessions.length}`);
    return lines.join(' | ');
  }).join('\n');

  const prompt = `Based on this week's journal data, extract behavioral insights in JSON. Return ONLY valid JSON, nothing else.

Journal data:
${journalSummary}

Return JSON matching this schema:
{
  "peakFocusHour": number or null (hour 0-23 when most focus sessions happened),
  "followThroughRate": number (0.0-1.0, fraction of MITs completed),
  "mostProductiveDay": string or null,
  "procrastinationTriggers": [string],
  "moodSummary": string (one sentence),
  "keyWin": string,
  "keyStruggle": string,
  "aiInsights": string (2-3 sentences of honest behavioral analysis),
  "totalFocusHours": number
}`;

  try {
    let result = '';
    await streamChat(prompt, '', (chunk) => { result += chunk; });
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const insights = JSON.parse(jsonMatch[0]);
      // Update behavioral model
      if (insights.peakFocusHour !== null) model.behavioral.peakFocusHour = insights.peakFocusHour;
      if (insights.followThroughRate !== null) model.behavioral.followThroughRate = insights.followThroughRate;
      if (insights.mostProductiveDay) model.behavioral.mostProductiveDay = insights.mostProductiveDay;
      if (insights.procrastinationTriggers?.length) {
        model.behavioral.procrastinationTriggers = [
          ...new Set([...model.behavioral.procrastinationTriggers, ...insights.procrastinationTriggers])
        ].slice(0, 10);
      }
      if (insights.moodSummary) model.emotional.recentMood = insights.moodSummary;

      // Log weekly pattern
      const weekNum = getWeekNumber(new Date());
      model.weeklyPatterns.unshift({
        week: weekNum,
        focusHours: insights.totalFocusHours || 0,
        goalsSet: journals.reduce((s, j) => s + (j.goalsSet?.length || 0), 0),
        goalsCompleted: journals.reduce((s, j) => s + (j.goalsCompleted?.length || 0), 0),
        moodSummary: insights.moodSummary,
        keyWin: insights.keyWin,
        keyStruggle: insights.keyStruggle,
        aiInsights: insights.aiInsights,
        generatedAt: new Date().toISOString(),
      });
      if (model.weeklyPatterns.length > 52) model.weeklyPatterns.pop();
      model.lastModelUpdate = new Date().toISOString();
      await saveUserModel(model);
    }
  } catch (err) { console.error('[JARVIS] Weekly model extraction failed:', err); }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}

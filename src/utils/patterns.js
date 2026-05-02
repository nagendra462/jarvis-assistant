// JARVIS Pattern Recognition Engine
// Detects behavioral patterns and fires calibrated interrupts
// The mirror — shows you what you can't see about yourself

import { getSessions } from './analytics.js';
import { loadUserModel } from './memory.js';

const PATTERN_LOG_KEY = 'jarvis_patterns';

function getPatternLog() {
  try { return JSON.parse(localStorage.getItem(PATTERN_LOG_KEY) || '{}'); } catch { return {}; }
}

function savePatternLog(log) { localStorage.setItem(PATTERN_LOG_KEY, JSON.stringify(log)); }

// Check if a pattern interrupt should fire (throttled to once per 48h per type)
function shouldFire(type, minHours = 48) {
  const log = getPatternLog();
  const last = log[type];
  if (!last) return true;
  const hoursSince = (Date.now() - last) / 3600000;
  return hoursSince >= minHours;
}

function recordFired(type) {
  const log = getPatternLog();
  log[type] = Date.now();
  savePatternLog(log);
}

// ===== Pattern Detectors =====

// Late night: message sent after 11pm — compare to stated goal
export async function checkLateNightPattern() {
  const hour = new Date().getHours();
  if (hour < 23 && hour > 4) return null;
  if (!shouldFire('late_night', 24)) return null;

  const model = await loadUserModel();
  const bedtime = JSON.parse(localStorage.getItem('jarvis_sleep_schedule') || '{}').bedtime;

  // Count late night messages this week
  const chatHistory = JSON.parse(localStorage.getItem('jarvis_chat_history') || '[]');
  const weekAgo = Date.now() - 7 * 86400000;
  const lateMessages = chatHistory.filter(m => {
    const t = new Date(m.id); // id is Date.now() timestamp
    return m.id > weekAgo && (t.getHours() >= 23 || t.getHours() < 4);
  });

  if (lateMessages.length === 0) return null;

  recordFired('late_night');
  const bedStr = bedtime ? ` (your target was ${bedtime})` : '';
  return `Sir, it's **${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}**${bedStr}. This is the **${lateMessages.length}${ordinal(lateMessages.length)} late-night session** this week. Your cortisol is elevated and your cognitive performance tomorrow will take a hit. I'm telling you because you asked me to.`;
}

// Repeated complaint: same struggle keyword 3+ times in past 7 days
export function checkRepeatComplaints() {
  if (!shouldFire('repeat_complaint', 48)) return null;
  const chatHistory = JSON.parse(localStorage.getItem('jarvis_chat_history') || '[]');
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = chatHistory.filter(m => m.sender === 'user' && m.id > weekAgo);

  const patterns = [
    { keywords: ['overwhelm', 'too much', 'can\'t handle', 'stressed out'], label: 'feeling overwhelmed' },
    { keywords: ['behind', 'falling behind', 'not enough time', 'behind schedule'], label: 'falling behind' },
    { keywords: ['procrastinat', 'can\'t focus', 'distracted', 'wasted time'], label: 'procrastinating' },
    { keywords: ['tired', 'exhausted', 'no energy', 'burnt out'], label: 'exhaustion' },
    { keywords: ['stuck', 'blocked', 'don\'t know how', 'confused'], label: 'feeling stuck' },
  ];

  for (const p of patterns) {
    const count = recent.filter(m => p.keywords.some(k => m.text.toLowerCase().includes(k))).length;
    if (count >= 3) {
      recordFired('repeat_complaint');
      return `Sir, you've mentioned **${p.label}** ${count} times this week. This is a signal, not just a feeling. Would you like to talk about what's actually driving this? Sometimes naming it clearly is the first step to fixing it.`;
    }
  }
  return null;
}

// Goal-action gap: goal set 3+ days ago, not marked complete
export function checkGoalActionGap() {
  if (!shouldFire('goal_gap', 48)) return null;
  try {
    const goals = JSON.parse(localStorage.getItem('jarvis_goals') || '{}');
    const today = new Date();
    const stalledGoals = (goals.items || [])
      .filter(g => !g.done && g.created)
      .filter(g => Math.floor((today - new Date(g.created)) / 86400000) >= 3);
    if (stalledGoals.length === 0) return null;
    recordFired('goal_gap');
    const names = stalledGoals.slice(0, 2).map(g => `"${g.text}"`).join(' and ');
    return `Sir — you set the goal${stalledGoals.length > 1 ? 's' : ''} ${names} **${Math.floor((today - new Date(stalledGoals[0].created)) / 86400000)} days ago**. ${stalledGoals.length > 1 ? 'They\'re' : 'It\'s'} still untouched. Is there a blocker, or do we need to revisit whether these are real priorities?`;
  } catch { return null; }
}

// Inconsistency pattern: stated vs actual behavior
export async function checkInconsistencyPattern() {
  if (!shouldFire('inconsistency', 72)) return null;
  const model = await loadUserModel();
  if (!model.behavioral.followThroughRate) return null;
  if (model.behavioral.followThroughRate >= 0.6) return null;
  const pct = Math.round(model.behavioral.followThroughRate * 100);
  if (pct < 50) {
    recordFired('inconsistency');
    return `Sir, looking at your data over the past few weeks — your stated goal completion rate is **${pct}%**. You're setting intentions consistently, but following through on less than half of them. The gap between planning and execution is where most potential dies. What's the real barrier?`;
  }
  return null;
}

// Focus drop: no focus sessions in 3+ days
export function checkFocusDrop() {
  if (!shouldFire('focus_drop', 48)) return null;
  const sessions = getSessions(3);
  if (sessions.length > 0) return null;
  const allSessions = getSessions(30);
  if (allSessions.length === 0) return null; // never tracked, don't interrupt
  const daysSinceLast = allSessions.length > 0
    ? Math.floor((Date.now() - new Date(allSessions[allSessions.length - 1].date)) / 86400000)
    : null;
  if (!daysSinceLast || daysSinceLast < 3) return null;
  recordFired('focus_drop');
  return `Sir, your last logged focus session was **${daysSinceLast} days ago**. I'm not asking what happened — I'm asking what's next. Even 25 minutes today breaks the drift. Want to start one now?`;
}

// ===== Proactive Commitment Tracker =====
export function logCommitment(text) {
  const lower = text.toLowerCase();
  const commitPhrases = ['i will', "i'll", 'i am going to', "i'm going to", 'tomorrow i', 'this week i', 'my plan is'];
  if (!commitPhrases.some(p => lower.includes(p))) return false;

  const commitments = JSON.parse(localStorage.getItem('jarvis_commitments') || '[]');
  commitments.push({ text, date: Date.now(), resolved: false, mentioned: false });
  localStorage.setItem('jarvis_commitments', JSON.stringify(commitments));
  return true;
}

export function checkUnresolvedCommitments() {
  if (!shouldFire('unresolved_commitment', 24)) return null;
  const commitments = JSON.parse(localStorage.getItem('jarvis_commitments') || '[]');
  const now = Date.now();
  
  // Find a commitment older than 24h, not resolved, not mentioned
  const pending = commitments.find(c => !c.resolved && !c.mentioned && (now - c.date > 86400000));
  if (!pending) return null;

  pending.mentioned = true;
  localStorage.setItem('jarvis_commitments', JSON.stringify(commitments));
  
  recordFired('unresolved_commitment');
  
  const daysAgo = Math.floor((now - pending.date) / 86400000);
  const timeStr = daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
  return `Sir, ${timeStr} you said: "${pending.text}". I'm just checking in — did you follow through, or is it still pending?`;
}

// ===== Run all pattern checks (call every 5 min from proactive loop) =====
export async function runPatternChecks() {
  const results = [];
  const lateNight = await checkLateNightPattern();
  if (lateNight) results.push({ type: 'late_night', message: lateNight, severity: 2 });
  const complaints = checkRepeatComplaints();
  if (complaints) results.push({ type: 'repeat_complaint', message: complaints, severity: 2 });
  const goalGap = checkGoalActionGap();
  if (goalGap) results.push({ type: 'goal_gap', message: goalGap, severity: 1 });
  const inconsistency = await checkInconsistencyPattern();
  if (inconsistency) results.push({ type: 'inconsistency', message: inconsistency, severity: 3 });
  const focusDrop = checkFocusDrop();
  if (focusDrop) results.push({ type: 'focus_drop', message: focusDrop, severity: 1 });
  const commitment = checkUnresolvedCommitments();
  if (commitment) results.push({ type: 'unresolved_commitment', message: commitment, severity: 1 });
  return results;
}

// ===== Weekly Honesty Report (generated every Sunday) =====
export async function generateWeeklyHonestyReport(streamChat) {
  const sessions = getSessions(7);
  const goals = JSON.parse(localStorage.getItem('jarvis_goals') || '{}');
  const habits = JSON.parse(localStorage.getItem('jarvis_habits') || '[]');
  const chatHistory = JSON.parse(localStorage.getItem('jarvis_chat_history') || '[]');
  const weekAgo = Date.now() - 7 * 86400000;
  const weekMessages = chatHistory.filter(m => m.id > weekAgo);
  const model = await loadUserModel();

  const focusHours = sessions.filter(s => s.completed).reduce((s, x) => s + x.actualMinutes, 0) / 60;
  const today = new Date().toDateString();
  const goalsCompleted = (goals.items || []).filter(g => g.done).length;
  const goalsTotal = (goals.items || []).length;
  const habitsCompleted = habits.filter(h => h.lastChecked === today).length;
  const habitsTotal = habits.length;

  const context = `
Weekly data for JARVIS user:
- Focus sessions this week: ${sessions.length} (${Math.round(focusHours * 10) / 10}h completed)
- Goals: ${goalsCompleted}/${goalsTotal} completed
- Habits: ${habitsCompleted}/${habitsTotal} done today
- Messages sent this week: ${weekMessages.length}
- User profile: ${model.profile.name || 'Unknown'} | ${model.profile.profession || ''} | Focus: ${model.profile.currentFocus.join(', ')}
- Follow-through rate (historical): ${model.behavioral.followThroughRate ? Math.round(model.behavioral.followThroughRate * 100) + '%' : 'unknown'}
${model.weeklyPatterns[0] ? `- Last week's AI insights: ${model.weeklyPatterns[0].aiInsights || ''}` : ''}
`;

  const prompt = `Generate a weekly JARVIS honesty report. Be direct, personal, and data-driven. No corporate speak. Format as markdown.

${context}

Structure:
1. **The Numbers** — focus hours, goal completion rate, habits
2. **The Trend** — better or worse than last week and why
3. **The Hard Truth** — 2-3 sentences of honest, unfiltered behavioral assessment (reference specific data)
4. **One Commitment** — Ask the user to commit to ONE specific thing next week

Keep it under 200 words. Be like a coach who has your data and cares about your growth — direct, honest, but supportive.`;

  let report = '';
  try {
    await streamChat(prompt, context, (chunk) => { report += chunk; });
  } catch { report = `📊 **Weekly Report**\n\nFocus: ${Math.round(focusHours * 10) / 10}h | Goals: ${goalsCompleted}/${goalsTotal} | Habits: ${habitsCompleted}/${habitsTotal}\n\nKeep showing up, sir.`; }
  return report;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ===== Check if weekly report is due =====
export function isWeeklyReportDue() {
  const day = new Date().getDay(); // 0=Sun
  const hour = new Date().getHours();
  if (day !== 0 || hour < 20) return false; // only Sunday 8pm+
  const last = localStorage.getItem('jarvis_last_weekly_report');
  if (!last) return true;
  const daysSince = (Date.now() - parseInt(last)) / 86400000;
  return daysSince >= 6;
}

export function markWeeklyReportDone() {
  localStorage.setItem('jarvis_last_weekly_report', String(Date.now()));
}

// JARVIS Focus Analytics Engine
// Every focus session logged and analyzed — no hiding from the data

const SESSIONS_KEY = 'jarvis_focus_sessions';
const MAX_SESSIONS = 500;

// ===== Session Logging =====
export function logFocusSession(session) {
  const sessions = getSessions();
  const entry = {
    id: Date.now().toString(),
    date: new Date().toISOString().slice(0, 10),
    startedAt: session.startedAt || new Date().toISOString(),
    endedAt: new Date().toISOString(),
    plannedMinutes: session.plannedMinutes || 25,
    actualMinutes: session.actualMinutes || session.plannedMinutes || 25,
    completed: session.completed !== false,
    earlyEndReason: session.earlyEndReason || null,
    skill: session.skill || null,
    timeOfDay: getTimeOfDay(new Date()),
    dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
  };
  sessions.push(entry);
  if (sessions.length > MAX_SESSIONS) sessions.shift();
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  return entry;
}

export function getSessions(days = 365) {
  try {
    const all = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    if (days === 365) return all;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return all.filter(s => new Date(s.date) >= cutoff);
  } catch { return []; }
}

function getTimeOfDay(date) {
  const h = date.getHours();
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

// ===== Statistics =====
export function computeStats(days = 30) {
  const sessions = getSessions(days);
  if (sessions.length === 0) return null;

  const completed = sessions.filter(s => s.completed);
  const totalMinutes = completed.reduce((s, x) => s + x.actualMinutes, 0);

  // Group by date for daily totals
  const byDate = {};
  for (const s of sessions) {
    if (!byDate[s.date]) byDate[s.date] = { total: 0, count: 0, completed: 0 };
    byDate[s.date].total += s.actualMinutes;
    byDate[s.date].count += 1;
    if (s.completed) byDate[s.date].completed += 1;
  }

  const dates = Object.keys(byDate).sort();
  const dailyMinutes = dates.map(d => ({ date: d, minutes: byDate[d].total, sessions: byDate[d].count }));

  // Best time of day
  const byHour = {};
  for (const s of completed) {
    const h = new Date(s.startedAt).getHours();
    byHour[h] = (byHour[h] || 0) + 1;
  }
  const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];

  // Best day of week
  const byDay = {};
  for (const s of completed) {
    byDay[s.dayOfWeek] = (byDay[s.dayOfWeek] || 0) + 1;
  }
  const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

  // Streak
  const streak = computeStreak(dates);

  // Completion rate
  const completionRate = sessions.length > 0 ? completed.length / sessions.length : 0;

  // This week vs last week
  const thisWeekSessions = getSessions(7);
  const lastWeekSessions = getSessionsRange(7, 14);
  const thisWeekMinutes = thisWeekSessions.filter(s => s.completed).reduce((s, x) => s + x.actualMinutes, 0);
  const lastWeekMinutes = lastWeekSessions.filter(s => s.completed).reduce((s, x) => s + x.actualMinutes, 0);

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    totalMinutes,
    completionRate: Math.round(completionRate * 100),
    avgSessionMinutes: completed.length > 0 ? Math.round(totalMinutes / completed.length) : 0,
    peakHour: peakHour ? parseInt(peakHour[0]) : null,
    bestDay: bestDay ? bestDay[0] : null,
    currentStreak: streak,
    dailyMinutes,
    thisWeekHours: Math.round(thisWeekMinutes / 60 * 10) / 10,
    lastWeekHours: Math.round(lastWeekMinutes / 60 * 10) / 10,
    weekChange: lastWeekMinutes > 0 ? Math.round(((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100) : null,
  };
}

function getSessionsRange(fromDays, toDays) {
  try {
    const all = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    const from = new Date(); from.setDate(from.getDate() - toDays);
    const to = new Date(); to.setDate(to.getDate() - fromDays);
    return all.filter(s => {
      const d = new Date(s.date);
      return d >= from && d <= to;
    });
  } catch { return []; }
}

function computeStreak(sortedDates) {
  if (sortedDates.length === 0) return 0;
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const unique = [...new Set(sortedDates)].sort().reverse();
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let current = new Date(unique[0]);
  for (const d of unique) {
    const date = new Date(d);
    const diffDays = Math.round((current - date) / 86400000);
    if (diffDays <= 1) { streak++; current = date; }
    else break;
  }
  return streak;
}

export function getDailyFocusMinutes(days = 14) {
  const sessions = getSessions(days);
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const daySessions = sessions.filter(s => s.date === dateStr && s.completed);
    result.push({
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      minutes: daySessions.reduce((s, x) => s + x.actualMinutes, 0),
      sessions: daySessions.length,
    });
  }
  return result;
}

export function formatAnalyticsSummary(days = 30) {
  const stats = computeStats(days);
  if (!stats) return 'No focus sessions logged yet, sir. Start a session and I\'ll track everything.';
  const weekTrend = stats.weekChange !== null
    ? (stats.weekChange >= 0 ? `📈 +${stats.weekChange}% vs last week` : `📉 ${stats.weekChange}% vs last week`)
    : '';
  const peakHourStr = stats.peakHour !== null
    ? `${stats.peakHour}:00–${stats.peakHour + 1}:00`
    : 'not enough data';
  return `⏱️ **Focus Analytics** (last ${days} days)\n\n` +
    `📊 **Total:** ${stats.totalHours}h across ${stats.completedSessions} sessions\n` +
    `✅ **Completion rate:** ${stats.completionRate}%\n` +
    `⏲️ **Average session:** ${stats.avgSessionMinutes} min\n` +
    `🔥 **Current streak:** ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}\n` +
    `📅 **This week:** ${stats.thisWeekHours}h ${weekTrend}\n` +
    `🕐 **Peak focus hour:** ${peakHourStr}\n` +
    `📆 **Best day:** ${stats.bestDay || 'TBD'}`;
}

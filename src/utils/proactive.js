// JARVIS Proactive Engine — makes JARVIS initiate conversations
// Handles scheduled check-ins, reminders, daily briefings, and accountability

import { getGoals, getStreak, getNotes, formatTime, formatDate } from './jarvis-brain.js';
import { getMemories } from './gemini.js';

// ===== Reminder System =====
function getReminders() {
  try {
    return JSON.parse(localStorage.getItem('jarvis_reminders') || '[]');
  } catch { return []; }
}

function saveReminders(reminders) {
  localStorage.setItem('jarvis_reminders', JSON.stringify(reminders));
}

function addReminder(text, minutesFromNow) {
  const reminders = getReminders();
  reminders.push({
    text,
    triggerAt: Date.now() + (minutesFromNow * 60 * 1000),
    created: Date.now(),
    fired: false,
  });
  saveReminders(reminders);
  return reminders.length;
}

function clearReminder(index) {
  const reminders = getReminders();
  if (index >= 0 && index < reminders.length) {
    reminders.splice(index, 1);
    saveReminders(reminders);
    return true;
  }
  return false;
}

// ===== Check for due reminders =====
function checkReminders() {
  const reminders = getReminders();
  const now = Date.now();
  const due = [];

  reminders.forEach((r, i) => {
    if (!r.fired && now >= r.triggerAt) {
      due.push({ ...r, index: i });
      r.fired = true;
    }
  });

  // Clean up fired reminders older than 1 hour
  const active = reminders.filter(r => !r.fired || (now - r.triggerAt < 3600000));
  saveReminders(active);

  return due;
}

// ===== Daily Briefing =====
function generateBriefing() {
  const goals = getGoals();
  const streak = getStreak();
  const memories = getMemories();
  const hour = new Date().getHours();
  const reminders = getReminders().filter(r => !r.fired);

  let timeGreeting;
  if (hour < 12) timeGreeting = 'Good morning';
  else if (hour < 17) timeGreeting = 'Good afternoon';
  else timeGreeting = 'Good evening';

  // Find user's name from memories
  const nameMem = memories.find(m => /name is/i.test(m));
  const name = nameMem ? nameMem.replace(/.*name is\s*/i, '').replace(/[.!,].*/, '').trim() : 'sir';

  let briefing = `${timeGreeting}, ${name}. Here's your briefing for **${formatDate()}**:\n\n`;

  // Streak
  if (streak.count > 0) {
    briefing += `🔥 **Streak**: ${streak.count} day${streak.count > 1 ? 's' : ''} and counting.\n\n`;
  }

  // Goals
  if (goals.items.length > 0) {
    const done = goals.items.filter(g => g.done).length;
    const remaining = goals.items.filter(g => !g.done);
    briefing += `🎯 **Goals**: ${done}/${goals.items.length} completed.`;
    if (remaining.length > 0) {
      briefing += ` Remaining:\n`;
      remaining.forEach(g => { briefing += `  • ${g.text}\n`; });
    }
    briefing += '\n';
  } else {
    briefing += `🎯 **Goals**: None set yet. Shall we set some targets for today, ${name}?\n\n`;
  }

  // Pending reminders
  if (reminders.length > 0) {
    briefing += `⏰ **Upcoming reminders** (${reminders.length}):\n`;
    reminders.forEach(r => {
      const minsLeft = Math.round((r.triggerAt - Date.now()) / 60000);
      briefing += `  • ${r.text} (in ${minsLeft > 0 ? minsLeft + ' min' : 'now'})\n`;
    });
    briefing += '\n';
  }

  briefing += `\nReady when you are, ${name}. Let's make today count.`;
  return briefing;
}

// ===== Proactive Check-in Messages =====
function getCheckInMessage() {
  const hour = new Date().getHours();
  const goals = getGoals();
  const done = goals.items.filter(g => g.done).length;
  const total = goals.items.length;
  const memories = getMemories();
  const nameMem = memories.find(m => /name is/i.test(m));
  const name = nameMem ? nameMem.replace(/.*name is\s*/i, '').replace(/[.!,].*/, '').trim() : 'sir';

  // Evening accountability (after 8 PM)
  if (hour >= 20 && total > 0 && done < total) {
    const remaining = total - done;
    return `${name}, it's getting late and you have **${remaining} goal${remaining > 1 ? 's' : ''}** still pending. The day isn't over yet — shall we knock them out?`;
  }

  // Afternoon check (2-4 PM)
  if (hour >= 14 && hour <= 16 && total > 0) {
    const pct = Math.round((done / total) * 100);
    if (pct < 50) {
      return `Afternoon check-in, ${name}. You're at **${pct}%** of your goals. We can still catch up — what should we tackle first?`;
    }
    if (pct >= 50 && pct < 100) {
      return `Solid progress, ${name} — **${pct}%** of today's goals done. Keep this momentum going.`;
    }
  }

  // Late night (after 11 PM)
  if (hour >= 23) {
    return `It's past 11 PM, ${name}. Your body needs rest to perform at its best tomorrow. Consider wrapping up and getting some sleep.`;
  }

  return null;
}

// ===== Proactive Engine =====
// Call this periodically (every 5 minutes) from App.jsx
function runProactiveChecks() {
  const results = {
    reminders: checkReminders(),
    checkIn: null,
  };

  // Only do check-ins once per hour
  const lastCheckIn = parseInt(localStorage.getItem('jarvis_last_checkin') || '0');
  const now = Date.now();
  if (now - lastCheckIn > 3600000) { // 1 hour
    const checkInMsg = getCheckInMessage();
    if (checkInMsg) {
      results.checkIn = checkInMsg;
      localStorage.setItem('jarvis_last_checkin', now.toString());
    }
  }

  return results;
}

// ===== Structured User Profile =====
function getUserProfile() {
  try {
    return JSON.parse(localStorage.getItem('jarvis_user_profile') || '{}');
  } catch { return {}; }
}

function updateUserProfile(updates) {
  const profile = getUserProfile();
  Object.assign(profile, updates);
  localStorage.setItem('jarvis_user_profile', JSON.stringify(profile));
  return profile;
}

// Auto-extract profile data from memories
function syncProfileFromMemories() {
  const memories = getMemories();
  const profile = getUserProfile();

  for (const mem of memories) {
    const lower = mem.toLowerCase();
    if (/name is/i.test(mem) && !profile.name) {
      profile.name = mem.replace(/.*name is\s*/i, '').replace(/[.!,].*/, '').trim();
    }
    if (/engineer|developer|designer|manager|student/i.test(lower) && !profile.profession) {
      profile.profession = mem;
    }
    if (/prepar|interview|faang|google|amazon|meta|apple/i.test(lower)) {
      profile.currentFocus = profile.currentFocus || [];
      if (!profile.currentFocus.includes(mem)) profile.currentFocus.push(mem);
    }
    if (/morning|evening|night|routine|habit/i.test(lower)) {
      profile.habits = profile.habits || [];
      if (!profile.habits.includes(mem)) profile.habits.push(mem);
    }
  }

  localStorage.setItem('jarvis_user_profile', JSON.stringify(profile));
  return profile;
}

export {
  getReminders,
  addReminder,
  clearReminder,
  checkReminders,
  generateBriefing,
  getCheckInMessage,
  runProactiveChecks,
  getUserProfile,
  updateUserProfile,
  syncProfileFromMemories,
};

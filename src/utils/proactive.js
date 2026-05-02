// JARVIS Proactive Engine — makes JARVIS initiate conversations
// Handles scheduled check-ins, reminders, daily briefings, and accountability

import { getGoals, getStreak, getNotes, formatTime, formatDate } from './jarvis-brain.js';
import { getMemories } from './gemini.js';
import { loadJournal } from './journal.js';
import { loadUserModel } from './memory.js';
import { scheduleNotification } from './notifications.js';

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
  const triggerAt = Date.now() + (minutesFromNow * 60 * 1000);
  const id = Math.floor(Math.random() * 2000000000);
  
  reminders.push({
    id,
    text,
    triggerAt,
    created: Date.now(),
    fired: false,
  });
  saveReminders(reminders);
  
  // Schedule native notification
  scheduleNotification(id, 'JARVIS Reminder', text, new Date(triggerAt));
  
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
async function generateBriefing() {
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

  // Yesterday's context
  try {
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterday = await loadJournal(yesterdayDate);
    let yContext = [];
    if (yesterday && Object.keys(yesterday).length > 0) {
      if (yesterday.eveningDebrief?.biggestWin) {
        yContext.push(`Yesterday's biggest win was "${yesterday.eveningDebrief.biggestWin}".`);
      }
      if (yesterday.eveningDebrief?.carryForward) {
        yContext.push(`You mentioned struggling with "${yesterday.eveningDebrief.carryForward}". Let's clear that block today.`);
      } else if (yesterday.morningRitual?.todayMITs) {
        const set = yesterday.morningRitual.todayMITs.length;
        const done = yesterday.eveningDebrief?.mitsCompleted || 0;
        yContext.push(`You finished ${done} of your ${set} MITs yesterday.`);
      }
      if (yesterday.focusSessions?.length) {
        const completed = yesterday.focusSessions.filter(s => s.completed).length;
        if (completed > 0) yContext.push(`You completed ${completed} focus session${completed > 1 ? 's' : ''}.`);
      }
      
      if (yContext.length > 0) {
        briefing += `**Yesterday's Review:**\n${yContext.join(' ')}\n\n`;
      }
    }
  } catch (e) { console.error('Failed to load yesterday journal for briefing', e); }

  // Streak
  if (streak.count > 0) {
    briefing += `🔥 **Streak**: ${streak.count} day${streak.count > 1 ? 's' : ''} and counting.\n\n`;
  }

  // Relationship Follow-ups
  try {
    const model = await loadUserModel();
    const nowMs = Date.now();
    const followUpPeople = (model.relationships || []).filter(r => {
      const msAgo = nowMs - new Date(r.lastMentioned).getTime();
      const daysAgo = Math.floor(msAgo / 86400000);
      return daysAgo >= 1 && daysAgo <= 3;
    });
    if (followUpPeople.length > 0) {
      const names = followUpPeople.map(p => p.name).join(' and ');
      briefing += `👥 **Relationships:** You mentioned ${names} recently. Just checking — any follow-up needed there?\n\n`;
    }
  } catch (e) { console.error('Failed to load relationships', e); }

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

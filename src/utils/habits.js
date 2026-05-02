// JARVIS Habit Tracker & Sleep Schedule
// Track multiple habits with streaks, manage sleep/wake times

import { getItem, setItem } from './store';
import { scheduleNotification, cancelNotification } from './notifications.js';

// ===== Habit Tracking =====
function getHabits() {
  return getItem('jarvis_habits', []);
}

function saveHabits(habits) {
  setItem('jarvis_habits', habits);
}

function addHabit(name) {
  const habits = getHabits();
  if (habits.find(h => h.name.toLowerCase() === name.toLowerCase())) {
    return null; // already exists
  }
  habits.push({
    name,
    streak: 0,
    lastChecked: null,
    history: [], // array of date strings when completed
    created: Date.now(),
  });
  saveHabits(habits);
  return habits.length;
}

function checkInHabit(name) {
  const habits = getHabits();
  const habit = habits.find(h => h.name.toLowerCase() === name.toLowerCase());
  if (!habit) return null;

  const today = new Date().toDateString();
  if (habit.lastChecked === today) {
    return { ...habit, alreadyDone: true };
  }

  // Check if yesterday was checked (for streak)
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (habit.lastChecked === yesterday) {
    habit.streak += 1;
  } else if (habit.lastChecked !== today) {
    habit.streak = 1; // Reset streak
  }

  habit.lastChecked = today;
  habit.history.push(today);
  saveHabits(habits);
  return { ...habit, alreadyDone: false };
}

function getHabitReport() {
  const habits = getHabits();
  if (habits.length === 0) return null;

  const today = new Date().toDateString();
  let report = `📊 **Habit Report**\n\n`;

  for (const h of habits) {
    const done = h.lastChecked === today;
    const icon = done ? '✅' : '⬜';
    report += `${icon} **${h.name}** — ${h.streak} day streak ${done ? '(done today!)' : ''}\n`;
  }

  const completedToday = habits.filter(h => h.lastChecked === today).length;
  report += `\n**${completedToday}/${habits.length}** habits completed today.`;

  return report;
}

function deleteHabit(name) {
  const habits = getHabits();
  const idx = habits.findIndex(h => h.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) return false;
  habits.splice(idx, 1);
  saveHabits(habits);
  return true;
}

// ===== Sleep/Wake Schedule =====
function getSleepSchedule() {
  return getItem('jarvis_sleep_schedule', {});
}

function setSleepSchedule(schedule) {
  const current = getSleepSchedule();
  const updated = { ...current, ...schedule };
  setItem('jarvis_sleep_schedule', updated);

  if (updated.wakeTime) {
    const [h, m] = updated.wakeTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1);
    
    cancelNotification(1001);
    scheduleNotification(1001, 'JARVIS Wake Alarm', `Rise and shine, sir! It's ${updated.wakeTime} — time to conquer the day.`, date);
  }
  
  if (updated.bedtime) {
    const [h, m] = updated.bedtime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1);
    
    cancelNotification(1002);
    scheduleNotification(1002, 'JARVIS Bedtime', `Sir, it is your target bedtime (${updated.bedtime}). Systems powering down.`, date);
  }
}

// Check if it's time for sleep or wake reminders — ESCALATING WARNINGS
function checkSleepSchedule() {
  const schedule = getSleepSchedule();
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTime = currentHour * 60 + currentMin; // minutes since midnight
  const today = now.toDateString();

  const result = { sleepReminder: null, wakeAlarm: null, severity: 0 };

  // Sleep enforcement — escalating warnings
  if (schedule.bedtime) {
    const [bH, bM] = schedule.bedtime.split(':').map(Number);
    const bedMin = bH * 60 + bM;
    const minutesPast = currentTime - bedMin;

    // Handle midnight crossover (e.g., bedtime 23:00, current 00:30)
    const effectiveMinutesPast = minutesPast < -720 ? minutesPast + 1440 : minutesPast;

    const lastLevel = parseInt(getItem('jarvis_sleep_warn_level', '0'));
    const lastWarnDate = getItem('jarvis_sleep_warn_date');

    // Reset warning level for new day
    if (lastWarnDate !== today) {
      setItem('jarvis_sleep_warn_level', '0');
      setItem('jarvis_sleep_warn_date', today);
    }

    // Level 1: 30 min before bedtime — gentle
    if (effectiveMinutesPast >= -30 && effectiveMinutesPast < -25 && lastLevel < 1) {
      result.sleepReminder = `Sir, your bedtime of **${schedule.bedtime}** is in 30 minutes. Start winding down — put away the screens and let your mind decompress.`;
      result.severity = 1;
      setItem('jarvis_sleep_warn_level', '1');
    }
    // Level 2: At bedtime — firm
    else if (effectiveMinutesPast >= 0 && effectiveMinutesPast < 5 && lastLevel < 2) {
      result.sleepReminder = `It's **${schedule.bedtime}**, sir. Bedtime. Not "five more minutes" time. Not "one more video" time. **Bed. Now.** You set this target for a reason — don't negotiate with your future self.`;
      result.severity = 2;
      setItem('jarvis_sleep_warn_level', '2');
    }
    // Level 3: 30 min past — health warnings
    else if (effectiveMinutesPast >= 25 && effectiveMinutesPast < 35 && lastLevel < 3) {
      result.sleepReminder = `Sir, you're **30 minutes past bedtime**. Here's what's happening to your body right now:\n\n• Your **cortisol** levels are spiking — stress hormone that causes belly fat\n• Your **cognitive performance** tomorrow will drop by **25-40%**\n• Your **immune system** is weakening with every minute you stay up\n• Your **emotional regulation** tomorrow will be comparable to being legally drunk\n\nThis isn't a suggestion. **Go to sleep.**`;
      result.severity = 3;
      setItem('jarvis_sleep_warn_level', '3');
    }
    // Level 4: 1 hour+ past — aggressive
    else if (effectiveMinutesPast >= 55 && effectiveMinutesPast < 65 && lastLevel < 4) {
      result.sleepReminder = `**One hour past bedtime.** Sir, I need to be direct with you:\n\n🧠 **Brain**: Every hour of lost sleep reduces your IQ by 1 point. You're sabotaging tomorrow's performance.\n💪 **Muscle**: Growth hormone is released during deep sleep. No sleep = no gains.\n❤️ **Heart**: Chronic sleep deprivation increases heart attack risk by **48%**.\n😤 **Willpower**: You'll have **zero discipline** tomorrow — you'll skip the gym, eat junk, and procrastinate.\n\nYou hired me to hold you accountable. I'm doing my job. **Put the phone down and sleep. NOW.**`;
      result.severity = 4;
      setItem('jarvis_sleep_warn_level', '4');
    }
  }

  // Wake alarm — at wake time
  if (schedule.wakeTime) {
    const [wH, wM] = schedule.wakeTime.split(':').map(Number);
    const wakeMin = wH * 60 + wM;
    const lastWakeAlarm = getItem('jarvis_last_wake_alarm');

    if (lastWakeAlarm !== today) {
      if (currentTime >= wakeMin && currentTime <= wakeMin + 5) {
        result.wakeAlarm = `Rise and shine, sir! It's **${schedule.wakeTime}** — time to conquer the day. The world doesn't wait for anyone — let's make sure it waits for you.`;
        setItem('jarvis_last_wake_alarm', today);
      }
    }
  }

  return result;
}

// Get sleep stats
function getSleepLog() {
  return getItem('jarvis_sleep_log', []);
}

function logSleep(event) {
  const log = getSleepLog();
  log.push({
    type: event, // 'sleep' or 'wake'
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString(),
    date: new Date().toDateString(),
  });
  // Keep last 30 entries
  if (log.length > 30) log.shift();
  setItem('jarvis_sleep_log', log);
}

export {
  getHabits,
  addHabit,
  checkInHabit,
  getHabitReport,
  deleteHabit,
  getSleepSchedule,
  setSleepSchedule,
  checkSleepSchedule,
  logSleep,
  getSleepLog,
};

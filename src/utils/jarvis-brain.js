// JARVIS Brain — the personality, responses, and command processing engine
import { chat as geminiChat, streamChat as geminiStreamChat, isConfigured as isGeminiConfigured } from './gemini';

const GREETINGS = {
  morning: [
    "Good morning, sir. I trust you slept well. Shall we make today extraordinary?",
    "Rise and shine, sir. The world isn't going to conquer itself.",
    "Morning, sir. Another day, another chance to build something legendary.",
    "Good morning. I've been running diagnostics while you rested. All systems nominal. Shall we begin?",
  ],
  afternoon: [
    "Good afternoon, sir. I hope you're being productive and not doomscrolling.",
    "Afternoon, sir. How's the empire-building going?",
    "Good afternoon. Halfway through the day — are we halfway through greatness too?",
  ],
  evening: [
    "Good evening, sir. Let's review what you've accomplished today.",
    "Evening, sir. I trust you've made today count?",
    "Good evening. The day's winding down, but legends don't clock out.",
  ],
  night: [
    "It's getting late, sir. Even geniuses need rest. Shall we wrap up?",
    "Burning the midnight oil, I see. Just like old times, sir.",
    "Late night session? I admire the dedication. Let's make it count.",
  ],
};

const MOTIVATIONAL_QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "I'm not a businessman. I'm a business, man.", author: "Jay-Z" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Your time is limited. Don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "It's not about money or connections — it's the willingness to outwork and outlearn everyone.", author: "Mark Cuban" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "The man who moves a mountain begins by carrying away small stones.", author: "Confucius" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { text: "Greatness is not a function of circumstance. It is largely a matter of conscious choice and discipline.", author: "Jim Collins" },
  { text: "The cost of being wrong is less than the cost of doing nothing.", author: "Seth Godin" },
  { text: "Every next level of your life will demand a different version of you.", author: "Leonardo DiCaprio" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "If you want to achieve greatness, stop asking for permission.", author: "Anonymous" },
  { text: "Comfort is the enemy of progress.", author: "P.T. Barnum" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
];

const DISTRACTION_RESPONSES = [
  "Sir, I'd strongly advise against that. Your future self will thank you for staying focused.",
  "Respectfully, sir, that sounds like cheap dopamine talking. You're better than that.",
  "I believe your time would be better invested in something that compounds. Shall I suggest an alternative?",
  "Sir, scrolling won't build the life you want. Shall we channel that energy into something meaningful?",
  "I'm afraid I can't let you waste your potential like that, sir. What's your most important task right now?",
];

const FOCUS_ENCOURAGEMENTS = [
  "Excellent focus, sir. This is how empires are built.",
  "Stay in the zone, sir. You're doing magnificent work.",
  "Deep work in progress. I'll keep watch. You keep creating.",
  "The world fades away when you focus like this. Beautiful.",
  "This is the version of you that wins. Keep going.",
];

const TASK_COMPLETE_RESPONSES = [
  "Well done, sir. Another goal conquered. Shall we tackle the next one?",
  "Outstanding. Your discipline is showing, sir.",
  "Goal complete. That's the compound effect in action, sir.",
  "Excellent work. The gap between you and greatness just got smaller.",
  "Marked as done. You're building momentum, sir. Don't stop.",
];

const HELP_TEXT = `Here's what I can help you with, sir:

🧠 **AI Conversations** — Ask me *anything*. I understand natural language and can help with coding, advice, brainstorming, analysis, and more
🕐 **Time & Date** — "What time is it?", "What's today's date?"
🌤️ **Weather** — "What's the weather?" (uses your location)
🧮 **Calculator** — "Calculate 15 * 24 + 100"
📝 **Notes** — "Note: buy groceries", "Show my notes", "Delete note 1"
🎯 **Goals** — "Show my goals", "Add goal: finish project" — with visual tracker
⏱️ **Focus Mode** — "Start focus" / "Start focus 45" for a Pomodoro timer
🔥 **Motivation** — "Motivate me", "I'm feeling lazy", "I want to scroll"
📊 **Daily Report** — "Daily report" for your productivity summary
🔍 **Web Search** — "Search how to learn React" — opens Google
🔋 **System Info** — "Battery status", "Am I online?"
💬 **Just talk** — I'm here to help with anything. Try me.

*Pro tip: Click the 🎤 mic button to talk to me by voice, sir.*`;

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getGreeting() {
  return pickRandom(GREETINGS[getTimeOfDay()]);
}

function formatTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ===== Server sync helper =====
function serverSave(key, value) {
  // Fire-and-forget — save to server for cross-device sync
  fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  }).catch(() => {}); // silent fail if server unreachable
}

// Notes management
function getNotes() {
  try { return JSON.parse(localStorage.getItem('jarvis_notes') || '[]'); }
  catch { return []; }
}

function saveNotes(notes) {
  localStorage.setItem('jarvis_notes', JSON.stringify(notes));
  serverSave('jarvis_notes', notes);
}

function addNote(text) {
  const notes = getNotes();
  notes.push({ text, created: Date.now() });
  saveNotes(notes);
  return notes.length;
}

function deleteNote(index) {
  const notes = getNotes();
  if (index < 1 || index > notes.length) return null;
  const removed = notes.splice(index - 1, 1);
  saveNotes(notes);
  return removed[0];
}

// Goals management
function getGoals() {
  const today = new Date().toDateString();
  try {
    const data = JSON.parse(localStorage.getItem('jarvis_goals') || '{}');
    if (data.date !== today) return { date: today, items: [] };
    return data;
  } catch { return { date: today, items: [] }; }
}

function saveGoals(goals) {
  localStorage.setItem('jarvis_goals', JSON.stringify(goals));
  serverSave('jarvis_goals', goals);
}

function addGoal(text) {
  const goals = getGoals();
  goals.items.push({ text, done: false, created: Date.now() });
  saveGoals(goals);
  return goals;
}

function toggleGoal(index) {
  const goals = getGoals();
  if (index >= 0 && index < goals.items.length) {
    goals.items[index].done = !goals.items[index].done;
    saveGoals(goals);
  }
  return goals;
}

function deleteGoal(index) {
  const goals = getGoals();
  if (index >= 0 && index < goals.items.length) {
    goals.items.splice(index, 1);
    saveGoals(goals);
  }
  return goals;
}

// Streak tracking
function getStreak() {
  try {
    const data = JSON.parse(localStorage.getItem('jarvis_streak') || '{}');
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    if (data.lastDate === today) return data;
    if (data.lastDate === yesterday) {
      return { count: (data.count || 0) + 1, lastDate: today };
    }
    return { count: 1, lastDate: today };
  } catch { return { count: 1, lastDate: new Date().toDateString() }; }
}

function saveStreak() {
  const streak = getStreak();
  localStorage.setItem('jarvis_streak', JSON.stringify(streak));
  serverSave('jarvis_streak', streak);
  return streak;
}

// Weather
async function getWeather() {
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
    );
    const { latitude, longitude } = pos.coords;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`
    );
    const data = await res.json();
    const c = data.current;
    const weatherDesc = getWeatherDescription(c.weather_code);
    return `Currently it's **${c.temperature_2m}°C** with ${weatherDesc}. Wind speed: ${c.wind_speed_10m} km/h, Humidity: ${c.relative_humidity_2m}%. Shall I suggest appropriate attire, sir?`;
  } catch (err) {
    return "I'm unable to access your location, sir. Please enable location services so I can provide weather updates.";
  }
}

function getWeatherDescription(code) {
  const descriptions = {
    0: 'clear skies ☀️', 1: 'mainly clear skies 🌤️', 2: 'partly cloudy skies ⛅',
    3: 'overcast skies ☁️', 45: 'foggy conditions 🌫️', 48: 'rime fog 🌫️',
    51: 'light drizzle 🌦️', 53: 'moderate drizzle 🌦️', 55: 'dense drizzle 🌧️',
    61: 'slight rain 🌧️', 63: 'moderate rain 🌧️', 65: 'heavy rain ⛈️',
    71: 'slight snowfall ❄️', 73: 'moderate snowfall 🌨️', 75: 'heavy snowfall 🌨️',
    80: 'rain showers 🌦️', 81: 'moderate rain showers 🌧️', 82: 'violent rain showers ⛈️',
    95: 'thunderstorm ⛈️', 96: 'thunderstorm with hail ⛈️', 99: 'severe thunderstorm ⛈️',
  };
  return descriptions[code] || 'varied conditions';
}

// Calculator
function calculate(expr) {
  try {
    // Clean and sanitize — only allow math characters
    const cleaned = expr.replace(/[^0-9+\-*/().%\s^]/g, '')
      .replace(/\^/g, '**');
    if (!cleaned.trim()) return null;
    const result = Function('"use strict"; return (' + cleaned + ')')();
    if (typeof result === 'number' && isFinite(result)) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// Daily report
function getDailyReport() {
  const goals = getGoals();
  const notes = getNotes();
  const streak = getStreak();
  const total = goals.items.length;
  const done = goals.items.filter(g => g.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  let report = `📊 **Daily Status Report**\n\n`;
  report += `📅 ${formatDate()}\n`;
  report += `🔥 Current streak: **${streak.count} day${streak.count !== 1 ? 's' : ''}**\n\n`;

  if (total > 0) {
    report += `🎯 Goals: **${done}/${total}** completed (${pct}%)\n`;
    goals.items.forEach((g, i) => {
      report += `${g.done ? '  ✅' : '  ⬜'} ${g.text}\n`;
    });
  } else {
    report += `🎯 No goals set for today. That's unlike you, sir. Shall we set some?`;
  }

  report += `\n📝 Total notes saved: ${notes.length}\n`;

  if (pct === 100 && total > 0) {
    report += `\n🏆 *Perfect score today, sir. Absolutely brilliant.*`;
  } else if (pct >= 50) {
    report += `\n💪 *Good progress, sir. Let's push for 100%.*`;
  } else if (total > 0) {
    report += `\n⚡ *We've got work to do, sir. Let's not waste another minute.*`;
  }

  return report;
}

// Main command processor
export async function processCommand(input) {
  const text = input.toLowerCase().trim();
  const aiEnabled = isGeminiConfigured();

  // ===== UI-Action Commands (always regex-matched, these control the app) =====

  // Help
  if (/^(help|what can you do|commands|menu)$/i.test(text)) {
    return { text: HELP_TEXT, type: 'help' };
  }

  // Goals — show (triggers overlay)
  if (/\b(show|list|view|open|my)\s*(all\s*)?(goals?|mission|tasks?|todos?)\b/.test(text)) {
    return { text: '__SHOW_GOALS__', type: 'goals_ui' };
  }

  // Goals — add
  if (/\b(add|set|new)\s*(goal|task|mission|todo)\s*:?\s*/i.test(text)) {
    const goalText = input.replace(/^.*?(goal|task|mission|todo)\s*:?\s*/i, '').trim();
    if (goalText) {
      addGoal(goalText);
      return { text: `Goal set, sir: *"${goalText}"*. Now go make it happen.`, type: 'success' };
    }
    return { text: "What's the goal, sir?", type: 'question' };
  }

  // Focus / Pomodoro (triggers timer overlay)
  if (/\b(start|begin)\s*(focus|pomodoro|timer|deep\s*work)\b/i.test(text)) {
    const match = text.match(/(\d+)/);
    const minutes = match ? parseInt(match[1]) : 25;
    return { text: `__FOCUS_START_${minutes}__`, type: 'focus' };
  }

  // Stop focus
  if (/\b(stop|end|cancel|quit)\s*(focus|pomodoro|timer)\b/i.test(text)) {
    return { text: '__FOCUS_STOP__', type: 'focus_stop' };
  }

  // Notes — add
  if (/^(note|remember|jot)\s*:\s+/i.test(text)) {
    const noteText = input.replace(/^(note|remember|jot)\s*:\s+/i, '').trim();
    if (noteText) {
      const count = addNote(noteText);
      return { text: `Noted, sir. That's note #${count}. I'll remember that for you.`, type: 'success' };
    }
    return { text: "What would you like me to note down, sir?", type: 'question' };
  }

  // Notes — show
  if (/^(show|list|view)\s*(all\s*)?(my\s*)?(notes|note)\s*$/i.test(text)) {
    const notes = getNotes();
    if (notes.length === 0) {
      return { text: "You have no saved notes, sir. Say **\"Note: your text\"** to save one.", type: 'info' };
    }
    let response = `📝 **Your Notes** (${notes.length}):\n\n`;
    notes.forEach((n, i) => {
      response += `**${i + 1}.** ${n.text}\n`;
    });
    response += `\n*Say "delete note [number]" to remove one.*`;
    return { text: response, type: 'notes' };
  }

  // Notes — delete
  if (/\b(delete|remove|clear)\s*(note)\s*(\d+)/i.test(text)) {
    const match = text.match(/(\d+)/);
    if (match) {
      const removed = deleteNote(parseInt(match[1]));
      if (removed) {
        return { text: `Done, sir. I've removed: "${removed.text}"`, type: 'success' };
      }
    }
    return { text: "I couldn't find that note, sir. Check the number and try again.", type: 'error' };
  }

  // Notes — clear all
  if (/\b(clear|delete)\s*(all)\s*(notes)\b/.test(text)) {
    saveNotes([]);
    return { text: "All notes cleared, sir. Clean slate.", type: 'success' };
  }

  // Explicit web search
  if (/^(search|google|look up)\s+(for\s+)?(.+)/i.test(text)) {
    const query = text.replace(/^(search|google|look up)\s*(for)?\s*/i, '').trim();
    if (query) {
      return { 
        text: `I've opened a search for *"${query}"*, sir. Knowledge is power.`, 
        type: 'action',
        actions: [{ type: 'OPEN_URL', value: `https://www.google.com/search?q=${encodeURIComponent(query)}` }]
      };
    }
  }

  // Open URL directly
  if (/^(open|launch)\s+(.+)/i.test(text) && !/settings/i.test(text) && !/goals/i.test(text)) {
    const target = text.replace(/^(open|launch)\s+/i, '').trim();
    if (target) {
      // Very basic URL extraction for fallback
      let url = `https://${target.replace(/\s+/g, '')}.com`;
      if (target.includes('.')) url = `https://${target}`;
      return {
        text: `Opening ${target}, sir.`,
        type: 'action',
        actions: [{ type: 'OPEN_URL', value: url }]
      };
    }
  }

  // Copy text (Regex fallback only detects exact "copy: text")
  if (/^(copy)\s*:\s+(.+)/i.test(text)) {
    const content = text.replace(/^(copy)\s*:\s+/i, '').trim();
    return {
      text: "Copied to your clipboard, sir.",
      type: 'action',
      actions: [{ type: 'COPY', value: content }]
    };
  }

  // Settings
  if (/^(settings|config|setup|configure|open settings)$/i.test(text)) {
    return { text: "Opening settings, sir.", type: 'settings' };
  }

  // ===== Skills =====
  if (/\b(show|open|view)\s*(my\s*)?(skills?|learning|tracker)\b/i.test(text)) {
    return { text: '__SKILLS__', type: 'skills_ui' };
  }
  if (/\b(log|did|studied?|finished?|completed?)\s*(\d+)\s*(min|minutes?|hour|hr)s?\s*(of\s+)?(.+)/i.test(text)) {
    return { text: '__SKILL_LOG__', type: 'skill_log_natural', raw: input };
  }
  if (/\b(add|track|start\s+learning)\s+(skill|learning)\s*:?\s*(.+)/i.test(text)) {
    return { text: '__SKILL_ADD__', type: 'skill_add_natural', raw: input };
  }

  // ===== Journal =====
  if (/\b(show|open|view|my)\s*(journal|life\s*log|diary)\b/i.test(text)) {
    return { text: '__JOURNAL__', type: 'journal_ui' };
  }

  // ===== Analytics =====
  if (/\b(show|view|open)\s*(analytics|focus\s*stats?|focus\s*data|productivity\s*stats?)\b/i.test(text)
    || /\bhow\s*(much|many)\s*(did\s*I\s*)?(focus|work)\b/i.test(text)) {
    return { text: '__ANALYTICS__', type: 'analytics_ui' };
  }

  // ===== Weekly Report =====
  if (/\b(weekly\s*report|weekly\s*review|week\s*in\s*review|honesty\s*report)\b/i.test(text)) {
    return { text: '__WEEKLY_REPORT__', type: 'weekly_report_ui' };
  }

  // ===== Reading Log =====
  if (/\b(reading\s*log|show.*read|articles?\s*I.*read)\b/i.test(text)) {
    return { text: '__READING_LOG__', type: 'reading_log_ui' };
  }

  // ===== Morning Ritual =====
  if (/\b(morning\s*(ritual|check.?in|review)|start\s*my\s*day|daily\s*check.?in|good\s*morning.*ritual)\b/i.test(text)) {
    return { text: '__MORNING_RITUAL__', type: 'morning_ritual' };
  }

  // ===== Evening Debrief =====
  if (/\b(evening\s*(debrief|check.?in|review)|end\s*(of\s*)?day.*debrief|daily\s*debrief)\b/i.test(text)) {
    return { text: '__EVENING_DEBRIEF__', type: 'evening_debrief' };
  }

  // ===== URL Reading =====
  if (/https?:\/\/[^\s]+/.test(input)) {
    return { text: '__READ_URL__', type: 'read_url', raw: input };
  }



  // ===== Always-local queries — never send these to the API =====

  // Greetings
  if (/^(hi|hello|hey|yo|sup|good\s*(morning|afternoon|evening|night)|greetings|jarvis)\s*$/i.test(text)) {
    return { text: getGreeting(), type: 'greeting' };
  }

  // Time
  if (/\b(what\s*time|current\s*time|time\s*is\s*it)\b/i.test(text)) {
    return { text: `It's **${formatTime()}**, sir.`, type: 'info' };
  }

  // Date
  if (/\b(what.*(date|day)|today'?s?\s*date|what day)\b/i.test(text)) {
    return { text: `Today is **${formatDate()}**, sir.`, type: 'info' };
  }

  // Weather
  if (/\b(weather|temperature|forecast)\b/i.test(text)) {
    return { text: await getWeather(), type: 'weather' };
  }

  // Calculator
  if (/\b(calc|calculate|compute)\b/i.test(text) || /^\d+[\s]*[+\-*/^]/.test(text)) {
    const expr = text.replace(/^(calc|calculate|compute)\s*/i, '').replace(/\?$/, '');
    const result = calculate(expr);
    if (result !== null) {
      return { text: `The answer is **${result}**, sir.`, type: 'calc' };
    }
  }

  // Daily report
  if (/^(daily\s*report|show\s*report|my\s*report)$/i.test(text)) {
    return { text: getDailyReport(), type: 'report' };
  }

  // ===== AI Brain — everything else goes here =====
  if (aiEnabled) {
    return { text: '', type: 'ai_needed' };
  }

  // ===== No AI — use basic regex responses =====

  // Greetings
  if (/^(hi|hello|hey|yo|sup|good\s*(morning|afternoon|evening|night)|greetings|jarvis)\s*$/i.test(text)) {
    return { text: getGreeting(), type: 'greeting' };
  }

  // Time
  if (/\b(what\s*time|current\s*time)\b/.test(text)) {
    return { text: `It's currently **${formatTime()}**, sir.`, type: 'info' };
  }

  // Date
  if (/\b(what.*(date|day)|today's date)\b/.test(text)) {
    return { text: `Today is **${formatDate()}**, sir.`, type: 'info' };
  }

  // Weather
  if (/\b(weather|temperature|forecast)\b/.test(text)) {
    return { text: await getWeather(), type: 'weather', async: true };
  }

  // Calculator
  if (/\b(calc|calculate|compute)\b/.test(text) || /^\d+[\s]*[+\-*/^]/.test(text)) {
    const expr = text.replace(/^(calc|calculate|compute)\s*/i, '').replace(/\?$/, '');
    const result = calculate(expr);
    if (result !== null) {
      return { text: `The answer is **${result}**, sir.`, type: 'calc' };
    }
  }

  // Motivation
  if (/(motivat|inspir|push me|i need a push|pump me|fire me up|hype me)/i.test(text)) {
    const q = pickRandom(MOTIVATIONAL_QUOTES);
    return { text: `*"${q.text}"*\n— **${q.author}**\n\nRemember, sir — you're not here to be average. You're here to be extraordinary.`, type: 'motivation' };
  }

  // Daily report
  if (/^(daily\s*report|show\s*report|my\s*report)$/i.test(text)) {
    return { text: getDailyReport(), type: 'report' };
  }

  // Who are you
  if (/\b(who are you|your name|what are you)\b/.test(text)) {
    return {
      text: "I am **J.A.R.V.I.S.** — Just A Rather Very Intelligent System. I'm your personal assistant, life strategist, and accountability partner. Connect my **AI Brain** in Settings to unlock my full potential, sir.",
      type: 'info'
    };
  }

  // Fallback — no AI configured
  return {
    text: "I'd love to help with that, sir, but my AI brain isn't connected yet. Open **Settings → AI Brain** and add your free Gemini API key. Then I'll be able to understand and help with **anything** you ask.",
    type: 'default'
  };
}

// Build context string for AI
export function buildAIContext() {
  const goals = getGoals();
  const notes = getNotes();
  const streak = getStreak();
  const contextParts = [];
  contextParts.push(`Current time: ${formatTime()}, Date: ${formatDate()}`);
  if (streak.count > 1) contextParts.push(`User's streak: ${streak.count} days`);
  if (goals.items.length > 0) {
    const done = goals.items.filter(g => g.done).length;
    contextParts.push(`Today's goals: ${done}/${goals.items.length} completed`);
    const pending = goals.items.filter(g => !g.done).map(g => g.text);
    if (pending.length > 0) contextParts.push(`Pending goals: ${pending.slice(0, 3).join(', ')}`);
  }
  if (notes.length > 0) contextParts.push(`User has ${notes.length} saved notes`);
  return contextParts.join('. ');
}

export { getGreeting, getGoals, addGoal, toggleGoal, deleteGoal, saveStreak, getStreak, getNotes, FOCUS_ENCOURAGEMENTS, TASK_COMPLETE_RESPONSES, pickRandom, formatTime, formatDate, isGeminiConfigured };


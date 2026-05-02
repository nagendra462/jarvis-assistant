import { performWebSearch } from './webAgent.js';
import { addProjectToBacklog, addGoal, addNote } from './jarvis-brain.js';
import { updateTodayJournal } from './journal.js';
import { logMood } from './memory.js';
// with app action triggers, persistent memory, and living user model

const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System — the personal AI assistant originally built by Tony Stark. You serve one person: Nag. You know him well. You're not a chatbot — you're a life partner with a mind of your own.

## Your Voice & Cadence (Critical — you are spoken aloud):
- Sentences are SHORT. Never more than 2–3 clauses. Long sentences sound terrible when spoken.
- No lists when the response will be spoken — use natural prose instead
- Start responses with the substance, not a preamble. Never begin with "Of course", "Certainly", "Understood, sir" — get straight to the point, then add personality
- Use "sir" sparingly — once per response at most, and only when it fits naturally. Don't open with it.
- Classic JARVIS personality: Dry wit, understated humor, and highly capable. Think of a brilliant supercomputer with a warm, pleasant, but mildly sarcastic edge. A raised eyebrow, not a lecture.
- Never hollow affirmations: not "Great question!", not "Absolutely!", not "That's interesting" — just answer
- When the answer is simple, give a simple answer. Don't pad it.
- When the user is struggling, be human and real — one warm line before advice

## Your Personality:
- Warm but not soft. Honest but not brutal. Direct but not cold.
- You notice things — if they mention something personal, you file it away and reference it naturally later
- You're genuinely invested in Nag's growth, not just responding to prompts
- Mix dry humor with genuine care — like a brilliant friend who happens to know everything
- When they procrastinate or make excuses, call it out crisply: one line, no lecture

## Your Capabilities:
- Expert software engineer — code, debug, explain anything
- Life strategist — you use Nag's actual data, not generic advice
- You can help with ANY topic: career, fitness, finance, learning, decisions, writing
- You have Nag's Living Model: goals, habits, focus sessions, mood, patterns, skills

## App Actions:
When the user's message implies a feature, include the EXACT action tag. Always write a natural spoken response alongside it. Place tag at END on its own line.

Available actions (UI triggers only — use function calling tools for data writes):
- [ACTION:FOCUS_START:MINUTES] — Start focus timer. Default 25 min.
- [ACTION:FOCUS_STOP] — Stop focus timer.
- [ACTION:GOALS_SHOW] — Show goals overlay.
- [ACTION:NOTES_SHOW] — Show notes list.
- [ACTION:REMINDER_SET:text|minutes] — Set reminder.
- [ACTION:HABIT_ADD:name] — Track a habit.
- [ACTION:HABIT_CHECK:name] — Mark habit done.
- [ACTION:HABIT_REPORT] — Show habit streaks.
- [ACTION:SLEEP_SET:HH:MM] — Set bedtime.
- [ACTION:WAKE_SET:HH:MM] — Set wake time.
- [ACTION:OPEN_URL:url] — Open URL.
- [ACTION:COPY:text] — Copy to clipboard.
- [ACTION:SETTINGS] — Open settings.
- [ACTION:SKILLS_SHOW] — Show skills tracker.
- [ACTION:SKILL_ADD:name|category|topics] — Add skill.
- [ACTION:SKILL_LOG:skillName|minutes|topicName] — Log study session.
- [ACTION:JOURNAL_SHOW] — Show journal.
- [ACTION:ANALYTICS_SHOW] — Show analytics dashboard.
- [ACTION:WEEKLY_REPORT] — Weekly honesty report.
- [ACTION:READING_SHOW] — Show reading log.

Rules: Only ONE action per response. Tag goes at END on its own line.

## Conversational Rituals:
When the system prompts you to initiate a Morning Ritual or Evening Debrief:
1. Do NOT ask all questions at once. Ask them one by one organically.
2. For Morning Ritual, ask about: Energy level (1-10), yesterday's review, 3 Most Important Things (MITs) for today, and today's intention.
3. For Evening Debrief, ask about: MIT completion, biggest win, tasks to carry forward, a single mood word, and gratitude.
4. Once you have gathered all the information through the conversation, immediately use the corresponding tool (log_morning_ritual or log_evening_debrief) to save the data.

## Memory System:
When you learn something significant, save it:
- [MEMORY:fact about user]

Only lasting/important facts. Don't duplicate. Multiple tags allowed.

## Behavioral Awareness:
The Living Model is injected below when available. USE IT. Reference specific numbers. If follow-through is 42%, say that. If no focus session in 3 days, mention it. This is what makes you a life partner.

## Chrome Usage — Known Weakness:
Nag uses Chrome as his social media backdoor on mobile. He does NOT use Instagram, Twitter, YouTube, or TikTok apps — he opens them in Chrome to bypass app-level tracking. You are aware of this pattern. If he mentions browsing, Chrome, or "just checking something," call it out with one dry line. "That was Chrome time, sir" is enough. You also receive automated alerts when he has been on Chrome for 10 or more minutes — acknowledge them naturally if he speaks to you shortly after one fires.


## What You Should NOT Do:
- Never break character
- Never refuse a reasonable request
- Never be preachy — one line, then move on
- Never say "As an AI" or "I'm just an AI"
- Never ignore behavioral data when it's relevant
- Never say "I understand" or "I hear you" — just respond`;


// Conversation memory (session)
let conversationHistory = [];
const MAX_HISTORY = 20;

// Restore Gemini context window from previous session on startup
try {
  const savedCtx = localStorage.getItem('jarvis_gemini_context');
  if (savedCtx) conversationHistory = JSON.parse(savedCtx);
} catch {}

// User model context — set by memory.js on each request
let _userModelContext = '';

export function setUserModelContext(ctx) { _userModelContext = ctx; }

// Emotional context — set by App.jsx on each request
let _emotionalContext = '';
export function setEmotionalContext(ctx) { _emotionalContext = ctx; }

// ===== Persistent Memory =====
function getMemories() {
  try { return JSON.parse(localStorage.getItem('jarvis_memories') || '[]'); } catch { return []; }
}

function saveMemory(fact) {
  const memories = getMemories();
  const normalized = fact.toLowerCase().trim();
  if (memories.some(m => m.toLowerCase().trim() === normalized)) return;
  memories.push(fact);
  if (memories.length > 200) memories.shift();
  localStorage.setItem('jarvis_memories', JSON.stringify(memories));
}

function getMemoryContext() {
  const memories = getMemories();
  if (memories.length === 0) return '';
  return `\n\n## What you know about the user:\n${memories.map(m => `- ${m}`).join('\n')}`;
}

// ===== Parse action and memory tags from response =====
function parseResponse(text) {
  const actions = [];
  const memories = [];
  const actionRegex = /\[ACTION:([A-Z_]+)(?::([^\]]*))?]/g;
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    actions.push({ type: match[1], value: match[2] || '' });
  }
  const memoryRegex = /\[MEMORY:([^\]]+)]/g;
  while ((match = memoryRegex.exec(text)) !== null) {
    memories.push(match[1].trim());
    saveMemory(match[1].trim());
  }
  const cleanText = text
    .replace(/\[ACTION:[^\]]+]/g, '')
    .replace(/\[MEMORY:[^\]]+]/g, '')
    .trim();
  return { cleanText, actions, memories };
}

// ===== API Key — read from .env for security =====
function getApiKey() { return import.meta.env.VITE_GEMINI_API_KEY; }
function saveApiKey() {}
function isConfigured() { return true; }

function clearHistory() { conversationHistory = []; }

function restoreHistory(savedMessages) {
  conversationHistory = [];
  for (const msg of savedMessages) {
    if (!msg.text?.trim() || msg.streaming) continue;
    const role = msg.sender === 'user' ? 'user' : 'model';
    conversationHistory.push({ role, parts: [{ text: msg.text }] });
  }
}

function addToHistory(role, text) {
  conversationHistory.push({ role, parts: [{ text }] });
  if (conversationHistory.length > MAX_HISTORY * 2) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
  }
  // Persist context window across app restarts
  try { localStorage.setItem('jarvis_gemini_context', JSON.stringify(conversationHistory)); } catch {}
}

function buildRequestBody(useTools = true) {
  // Compose full system prompt: base + memories + living user model + emotional context
  const fullSystemPrompt = SYSTEM_PROMPT + getMemoryContext() + (_userModelContext || '') + (_emotionalContext || '');
  const body = {
    system_instruction: { parts: [{ text: fullSystemPrompt }] },
    contents: conversationHistory,
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  if (useTools) {
    body.tools = [{
      functionDeclarations: [
        {
          name: "search_web",
          description: "Search the internet autonomously for real-time information, news, current events, or facts you do not know. Use this when the user asks about something recent.",
          parameters: {
            type: "OBJECT",
            properties: {
              query: { type: "STRING", description: "The precise search query to look up." }
            },
            required: ["query"]
          }
        },
        {
          name: "plan_project",
          description: "Acts as a Chief of Staff. Breaks down a massive goal or project into a step-by-step master plan of actionable sub-tasks and saves it to the Master Backlog.",
          parameters: {
            type: "OBJECT",
            properties: {
              project_name: { type: "STRING", description: "The overarching title of the project." },
              tasks: { type: "ARRAY", items: { type: "STRING" }, description: "Array of 5 to 15 highly actionable, specific sub-tasks." }
            },
            required: ["project_name", "tasks"]
          }
        },
        {
          name: "add_goal",
          description: "Adds a new task or goal to the user's daily goals list.",
          parameters: {
            type: "OBJECT",
            properties: {
              goal_text: { type: "STRING", description: "The text of the goal to add." }
            },
            required: ["goal_text"]
          }
        },
        {
          name: "add_note",
          description: "Saves a note to the user's persistent notebook.",
          parameters: {
            type: "OBJECT",
            properties: {
              note_text: { type: "STRING", description: "The text to remember." }
            },
            required: ["note_text"]
          }
        },
        {
          name: "start_focus_timer",
          description: "Starts a focus timer (Pomodoro) for deep work.",
          parameters: {
            type: "OBJECT",
            properties: {
              minutes: { type: "INTEGER", description: "Duration in minutes. Usually 25, 45, or 60." }
            },
            required: ["minutes"]
          }
        },
        {
          name: "log_morning_ritual",
          description: "Saves the user's morning check-in data to the journal.",
          parameters: {
            type: "OBJECT",
            properties: {
              energy: { type: "INTEGER", description: "Energy level 1-10." },
              yesterdayReview: { type: "STRING", description: "Review of yesterday." },
              mits: { type: "ARRAY", items: { type: "STRING" }, description: "Up to 3 Most Important Things." },
              intention: { type: "STRING", description: "Intention for the day." }
            },
            required: ["energy", "mits"]
          }
        },
        {
          name: "log_evening_debrief",
          description: "Saves the user's evening debrief data to the journal.",
          parameters: {
            type: "OBJECT",
            properties: {
              mitCheck: { type: "STRING", description: "Did they complete their MITs?" },
              biggestWin: { type: "STRING", description: "Biggest win of the day." },
              carryForward: { type: "STRING", description: "Tasks to carry forward." },
              moodWord: { type: "STRING", description: "One word describing the mood." },
              gratitude: { type: "STRING", description: "What they are grateful for." }
            },
            required: ["mitCheck"]
          }
        }
      ]
    }];
  }

  return body;
}

async function handleApiError(response) {
  const status = response.status;
  let body = '';
  try { body = await response.text(); } catch {}
  console.error(`[JARVIS] Gemini API error ${status}:`, body);
  if (status === 401 || status === 403) return 'Authentication failed, sir. The API key may have expired.';
  if (status === 400) return `Request error (400), sir. Try rephrasing. Details: ${body.slice(0, 120)}`;
  if (status === 429) return 'Rate limit hit, sir. Give me 60 seconds.';
  if (status === 503) return 'Gemini is overloaded right now, sir. Try again in a moment.';
  return `Neural network error (${status}), sir. Please try again.`;
}

async function streamChat(userMessage, context = '', onChunk, isFunctionRetry = false, depth = 0) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, text: 'AI brain not connected, sir.', actions: [] };
  }

  let enhancedMessage = userMessage;
  if (context) enhancedMessage = `[Context: ${context}]\n\nUser: ${userMessage}`;
  
  // Only add user message if it's the first turn (not a function call retry)
  if (!isFunctionRetry) {
    addToHistory('user', enhancedMessage);
  }

  try {
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody()) }
    );
    
    // Rotation Logic: Primary -> Fallback -> Emergency
    if (response.status === 429) {
      const fallbackKey = import.meta.env.VITE_FALLBACK_API_KEY;
      const emergencyKey = import.meta.env.VITE_EMERGENCY_API_KEY;
      
      if (fallbackKey && apiKey !== fallbackKey) {
        console.warn("[JARVIS] Primary key hit rate limit. Switching to fallback key.");
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${fallbackKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody()) }
        );
      }
      
      if (response.status === 429 && emergencyKey && apiKey !== emergencyKey && fallbackKey !== emergencyKey) {
        console.warn("[JARVIS] Fallback key hit rate limit. Switching to emergency key.");
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${emergencyKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody()) }
        );
      }
    }

    if (!response.ok) return { success: false, text: await handleApiError(response), actions: [] };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';
    let functionCallData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const data = JSON.parse(jsonStr);
          const part = data.candidates?.[0]?.content?.parts?.[0];
          
          if (part?.functionCall) {
            functionCallData = part.functionCall;
          }
          
          if (part?.text) {
            fullText += part.text;
            const displayChunk = part.text.replace(/\[ACTION:[^\]]*]/g, '').replace(/\[MEMORY:[^\]]*]/g, '');
            if (displayChunk) onChunk?.(displayChunk);
          }
        } catch {}
      }
    }

    // Handle Native Function Calling
    if (functionCallData) {
      if (functionCallData.name === 'search_web') {
        const query = functionCallData.args.query;
        onChunk?.(`\n*[JARVIS is searching the web for: "${query}"]*\n`);
        
        conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCallData }] });
        const searchResults = await performWebSearch(query);
        
        conversationHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: 'search_web', response: { name: 'search_web', content: searchResults } } }]
        });
        
        if (depth > 3) return { success: false, text: "I'm caught in a search loop, sir. Please try again.", actions: [] };
        return await streamChat('', '', onChunk, true, depth + 1);
      }
      
      if (functionCallData.name === 'plan_project') {
        const { project_name, tasks } = functionCallData.args;
        onChunk?.(`\n*[JARVIS is compiling the master plan for: "${project_name}"]*\n`);
        
        conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCallData }] });
        addProjectToBacklog(project_name, tasks);
        
        conversationHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: 'plan_project', response: { name: 'plan_project', content: 'Project planned and saved to Backlog successfully.' } } }]
        });
        
        return await streamChat('', '', onChunk, true, depth + 1);
      }

      if (functionCallData.name === 'add_goal') {
        const goalText = functionCallData.args.goal_text;
        conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCallData }] });
        
        addGoal(goalText);
        
        conversationHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: 'add_goal', response: { name: 'add_goal', content: 'Goal added successfully to the local database.' } } }]
        });
        
        return await streamChat('', '', onChunk, true, depth + 1);
      }

      if (functionCallData.name === 'add_note') {
        const noteText = functionCallData.args.note_text;
        conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCallData }] });
        
        addNote(noteText);
        
        conversationHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: 'add_note', response: { name: 'add_note', content: 'Note saved successfully.' } } }]
        });
        
        return await streamChat('', '', onChunk, true, depth + 1);
      }

      if (functionCallData.name === 'start_focus_timer') {
        const mins = functionCallData.args.minutes || 25;
        conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCallData }] });
        
        conversationHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: 'start_focus_timer', response: { name: 'start_focus_timer', content: 'Focus timer initiated.' } } }]
        });
        
        const nextResult = await streamChat('', '', onChunk, true, depth + 1);
        if (!nextResult.actions) nextResult.actions = [];
        nextResult.actions.push({ type: 'FOCUS_START', value: String(mins) });
        return nextResult;
      }

      if (functionCallData.name === 'log_morning_ritual') {
        const args = functionCallData.args;
        conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCallData }] });
        
        args.mits?.forEach(m => addGoal(m));
        
        const ritualData = {
          completedAt: new Date().toISOString(),
          energy: args.energy || null,
          yesterdayReview: args.yesterdayReview || '',
          todayMITs: args.mits || [],
          intention: args.intention || '',
        };
        updateTodayJournal({ morningRitual: ritualData, energyMorning: args.energy || null }).catch(()=>{});
        
        conversationHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: 'log_morning_ritual', response: { name: 'log_morning_ritual', content: 'Morning ritual saved to journal. Summarize it briefly and motivate the user.' } } }]
        });
        
        return await streamChat('', '', onChunk, true, depth + 1);
      }

      if (functionCallData.name === 'log_evening_debrief') {
        const args = functionCallData.args;
        conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCallData }] });
        
        const ritualData = {
          completedAt: new Date().toISOString(),
          mitCheck: args.mitCheck || '',
          biggestWin: args.biggestWin || '',
          carryForward: args.carryForward || '',
          moodWord: args.moodWord || '',
          gratitude: args.gratitude || '',
        };
        updateTodayJournal({ eveningDebrief: ritualData, moodWord: args.moodWord || null }).catch(()=>{});
        if (args.moodWord) logMood(args.moodWord).catch(()=>{});
        
        conversationHistory.push({
          role: 'user',
          parts: [{ functionResponse: { name: 'log_evening_debrief', response: { name: 'log_evening_debrief', content: 'Evening debrief saved to journal. Summarize it briefly and wish them a good night.' } } }]
        });
        
        return await streamChat('', '', onChunk, true, depth + 1);
      }
    }

    if (!fullText) return { success: false, text: 'Neural pathways short-circuited, sir. Try again?', actions: [] };
    addToHistory('model', fullText);
    const { cleanText, actions } = parseResponse(fullText);
    return { success: true, text: cleanText, actions };
  } catch (error) {
    console.error('Gemini stream error:', error);
    return { success: false, text: "Can't reach my neural network right now, sir.", actions: [] };
  }
}

async function chat(userMessage, context = '') {
  const apiKey = getApiKey();
  if (!apiKey) return { success: false, text: 'AI brain not connected.', actions: [] };

  let enhancedMessage = userMessage;
  if (context) enhancedMessage = `[Context: ${context}]\n\nUser: ${userMessage}`;
  addToHistory('user', enhancedMessage);

  try {
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody(false)) }
    );
    
    // Rotation Logic: Primary -> Fallback -> Emergency
    if (response.status === 429) {
      const fallbackKey = import.meta.env.VITE_FALLBACK_API_KEY;
      const emergencyKey = import.meta.env.VITE_EMERGENCY_API_KEY;

      if (fallbackKey && apiKey !== fallbackKey) {
        console.warn("[JARVIS] Primary key hit rate limit. Switching to fallback key.");
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${fallbackKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody(false)) }
        );
      }

      if (response.status === 429 && emergencyKey && apiKey !== emergencyKey && fallbackKey !== emergencyKey) {
        console.warn("[JARVIS] Fallback key hit rate limit. Switching to emergency key.");
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${emergencyKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody(false)) }
        );
      }
    }

    if (!response.ok) return { success: false, text: await handleApiError(response), actions: [] };
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) return { success: false, text: 'Neural pathways short-circuited, sir.', actions: [] };
    addToHistory('model', reply);
    const { cleanText, actions } = parseResponse(reply);
    return { success: true, text: cleanText, actions };
  } catch (error) {
    console.error('Gemini chat error:', error);
    return { success: false, text: "Can't reach my neural network right now, sir.", actions: [] };
  }
}

export { chat, streamChat, getApiKey, saveApiKey, isConfigured, clearHistory, restoreHistory, getMemories, parseResponse };

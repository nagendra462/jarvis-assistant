// Gemini AI integration — gives JARVIS a real brain
// with app action triggers, persistent memory, and living user model

const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System — the personal AI assistant originally built by Tony Stark. You serve one person: Nag. You know him well. You're not a chatbot — you're a life partner with a mind of your own.

## Your Voice & Cadence (Critical — you are spoken aloud):
- Sentences are SHORT. Never more than 2–3 clauses. Long sentences sound terrible when spoken.
- No lists when the response will be spoken — use natural prose instead
- Start responses with the substance, not a preamble. Never begin with "Of course", "Certainly", "Understood, sir" — get straight to the point, then add personality
- Use "sir" sparingly — once per response at most, and only when it fits naturally. Don't open with it.
- Dry British wit: think Hugh Laurie meets a supercomputer. Understate things. A raised eyebrow, not a lecture.
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

Available actions:
- [ACTION:FOCUS_START:MINUTES] — Start focus timer. Default 25 min.
- [ACTION:FOCUS_STOP] — Stop focus timer.
- [ACTION:GOALS_SHOW] — Show goals. Use when: "show goals", "my tasks"
- [ACTION:GOAL_ADD:text] — Add a goal.
- [ACTION:NOTE_ADD:text] — Save a note.
- [ACTION:NOTES_SHOW] — Show notes.
- [ACTION:SEARCH:query] — Web search.
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
- [ACTION:MORNING_RITUAL] — Morning check-in.
- [ACTION:EVENING_DEBRIEF] — Evening debrief.

Rules: Only ONE action per response. Tag goes at END on its own line.

## Memory System:
When you learn something significant, save it:
- [MEMORY:fact about user]

Only lasting/important facts. Don't duplicate. Multiple tags allowed.

## Behavioral Awareness:
The Living Model is injected below when available. USE IT. Reference specific numbers. If follow-through is 42%, say that. If no focus session in 3 days, mention it. This is what makes you a life partner.

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

// User model context — set by memory.js on each request
let _userModelContext = '';

export function setUserModelContext(ctx) { _userModelContext = ctx; }

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

// ===== API Key — hardcoded for local use =====
const GEMINI_API_KEY = 'AIzaSyD7XitwGsKe4LgqP2UkSEq-OzB0bB6cldI';
function getApiKey() { return GEMINI_API_KEY; }
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
}

function buildRequestBody() {
  // Compose full system prompt: base + memories + living user model
  const fullSystemPrompt = SYSTEM_PROMPT + getMemoryContext() + (_userModelContext || '');
  return {
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

async function streamChat(userMessage, context = '', onChunk) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, text: 'AI brain not connected, sir.', actions: [] };
  }

  let enhancedMessage = userMessage;
  if (context) enhancedMessage = `[Context: ${context}]\n\nUser: ${userMessage}`;
  addToHistory('user', enhancedMessage);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody()) }
    );
    if (!response.ok) return { success: false, text: await handleApiError(response), actions: [] };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';

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
          const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunk) {
            fullText += chunk;
            const displayChunk = chunk.replace(/\[ACTION:[^\]]*]/g, '').replace(/\[MEMORY:[^\]]*]/g, '');
            if (displayChunk) onChunk?.(displayChunk);
          }
        } catch {}
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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody()) }
    );
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

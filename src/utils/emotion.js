// JARVIS Emotional Intelligence Engine
// Detects emotional tone in real-time from message content.
// Feeds into the AI system prompt to modulate JARVIS's tone.
// Also tracks mood history in the user model.

const STRESS_SIGNALS = [
  'overwhelmed', 'stressed', 'anxious', 'worried', 'panicking', 'panic',
  'can\'t handle', 'too much', 'breaking down', 'burnt out', 'burnout',
  'can\'t do this', 'done with', 'give up', 'hopeless', 'fucked', 'screwed',
  'behind on everything', 'everything is falling apart',
];

const FRUSTRATION_SIGNALS = [
  'ugh', 'fuck', 'damn', 'shit', 'ugh', 'argh', 'frustrated', 'annoying',
  'stupid', 'dumb', 'hate this', 'this sucks', 'doesn\'t work', 'broken',
  'why won\'t it', 'keeps failing', 'not working', 'useless',
];

const FATIGUE_SIGNALS = [
  'tired', 'exhausted', 'no energy', 'sleepy', 'drained', 'can\'t focus',
  'brain dead', 'so tired', 'dead', 'running on empty', 'barely awake',
  'haven\'t slept',
];

const EXCITEMENT_SIGNALS = [
  'excited', 'pumped', 'let\'s go', 'crushing it', 'feeling great', 'amazing',
  'fired up', 'motivated', 'on fire', 'unstoppable', 'killing it', 'yes!',
  'finally', 'got it', 'nailed it', 'smashed it',
];

const SELF_DOUBT_SIGNALS = [
  'i\'m bad at', 'i can\'t', 'i\'m not good enough', 'not smart enough',
  'i always fail', 'what\'s the point', 'i\'ll never', 'i\'m terrible',
  'i\'m not cut out', 'maybe i should quit', 'imposter', 'don\'t deserve',
];

const PROCRASTINATION_SIGNALS = [
  'can\'t start', 'don\'t know where to start', 'been putting off', 'avoiding',
  'keep procrastinating', 'distracted all day', 'wasted the day', 'did nothing',
  'scrolled all day', 'can\'t stop scrolling', 'can\'t focus',
];

// ===== Score a message for emotional signals =====
export function detectEmotionalTone(message) {
  const lower = message.toLowerCase();
  const scores = {
    stress: 0,
    frustration: 0,
    fatigue: 0,
    excitement: 0,
    selfDoubt: 0,
    procrastination: 0,
  };

  for (const sig of STRESS_SIGNALS) if (lower.includes(sig)) scores.stress++;
  for (const sig of FRUSTRATION_SIGNALS) if (lower.includes(sig)) scores.frustration++;
  for (const sig of FATIGUE_SIGNALS) if (lower.includes(sig)) scores.fatigue++;
  for (const sig of EXCITEMENT_SIGNALS) if (lower.includes(sig)) scores.excitement++;
  for (const sig of SELF_DOUBT_SIGNALS) if (lower.includes(sig)) scores.selfDoubt++;
  for (const sig of PROCRASTINATION_SIGNALS) if (lower.includes(sig)) scores.procrastination++;

  // Also detect late night as context
  const hour = new Date().getHours();
  const isLateNight = hour >= 23 || hour < 4;

  // Find the dominant negative tone
  const negatives = ['stress', 'frustration', 'fatigue', 'selfDoubt', 'procrastination'];
  const dominant = negatives
    .filter(k => scores[k] > 0)
    .sort((a, b) => scores[b] - scores[a])[0] || null;

  const isPositive = scores.excitement > 0 && !dominant;
  const intensity = dominant ? scores[dominant] : 0;

  return { dominant, isPositive, isLateNight, scores, intensity };
}

// ===== Build tone instruction for Gemini system prompt =====
export function buildEmotionalContext(tone) {
  if (!tone || !tone.dominant && !tone.isPositive && !tone.isLateNight) return '';

  const parts = ['## Current Emotional Context (adapt your tone accordingly):'];

  if (tone.dominant === 'stress') {
    parts.push(
      tone.intensity >= 2
        ? '⚠️ User is clearly stressed right now. Lead with acknowledgment before advice. Be calm, grounding, one step at a time. No big-picture pressure right now.'
        : '⚡ Mild stress detected. Acknowledge it briefly, then help them regain control with a concrete first step.'
    );
  }

  if (tone.dominant === 'frustration') {
    parts.push('😤 User is frustrated. Don\'t pile on. Validate the frustration in one line, then redirect to what\'s solvable. Avoid being cheery or dismissive.');
  }

  if (tone.dominant === 'fatigue') {
    parts.push('😴 User is tired. Be gentler and shorter than usual. Don\'t overwhelm them. If appropriate, suggest rest or a small win rather than a big push.');
  }

  if (tone.dominant === 'selfDoubt') {
    parts.push('🧠 User is expressing self-doubt. This requires careful handling: challenge the narrative with specific evidence from their data (wins, streaks, progress). Don\'t be dismissive — be honest but accurate. They\'ve earned more credit than they\'re giving themselves.');
  }

  if (tone.dominant === 'procrastination') {
    parts.push('🪤 Procrastination mode detected. Don\'t lecture. Give a 2-minute entry point — the smallest possible start. Shame doesn\'t work; momentum does. Be direct but kind.');
  }

  if (tone.isPositive) {
    parts.push('🔥 User is energized and positive. Match their energy. Amplify it. This is a great moment to push them toward a challenging goal or focus session.');
  }

  if (tone.isLateNight) {
    parts.push('🌙 It\'s past midnight. The user is up late. Factor this into your response — acknowledge it without being preachy, but make sure any plan or task you suggest accounts for their likely fatigue state.');
  }

  return '\n\n' + parts.join('\n');
}

// ===== Track mood session-wide =====
let _sessionMood = { dominant: null, isPositive: false };

export function updateSessionMood(tone) {
  if (tone.dominant) _sessionMood.dominant = tone.dominant;
  if (tone.isPositive) _sessionMood.isPositive = true;
}

export function getSessionMood() {
  return _sessionMood;
}

// ===== Detect relationship mentions for follow-up tracking =====
const NAME_CONTEXT_PATTERNS = [
  { pattern: /(?:my|talked to|spoke with|meeting with|from|manager|boss|friend|colleague|teammate|partner|mom|dad|sister|brother)\s+([A-Z][a-z]+)/g, role: 'person' },
  { pattern: /([A-Z][a-z]+)\s+(?:said|told me|helped|messaged|called|texted)/g, role: 'person' },
];

export function extractMentionedPeople(message) {
  const people = new Set();
  for (const { pattern } of NAME_CONTEXT_PATTERNS) {
    const regex = new RegExp(pattern.source, 'g');
    let match;
    while ((match = regex.exec(message)) !== null) {
      const name = match[1];
      // Filter out common false positives
      if (!['I', 'The', 'My', 'His', 'Her', 'Its', 'They', 'We', 'JARVIS'].includes(name)) {
        people.add(name);
      }
    }
  }
  return [...people];
}

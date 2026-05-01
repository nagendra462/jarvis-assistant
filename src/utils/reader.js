// JARVIS URL Reading Companion
// Send JARVIS an article, get a summary + key takeaways + reading log

const READING_LOG_KEY = 'jarvis_reading_log';
const MAX_LOG = 200;

// ===== URL Detection =====
export function detectURL(text) {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex);
  return matches ? matches[0] : null;
}

// ===== Fetch and Summarize =====
export async function fetchAndSummarize(url, streamChat) {
  // Step 1: Fetch URL content via server (bypasses CORS)
  let title = url, content = '';
  try {
    const res = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    title = data.title || url;
    content = data.text || '';
  } catch (err) {
    return { success: false, error: err.message };
  }

  if (!content || content.length < 100) {
    return { success: false, error: 'Could not extract readable content from this page.' };
  }

  // Step 2: Summarize via Gemini
  const prompt = `You are JARVIS, summarizing an article for your user. Be concise and practical. Return in this exact format:

**Title:** ${title}
**Summary:** [2-3 sentence summary — what is this article about and why does it matter]
**Key Takeaways:**
1. [specific, actionable insight]
2. [specific, actionable insight]
3. [specific, actionable insight]
**Action Item:** [one concrete thing the user could do with this information]
**Tags:** [comma-separated topic tags, e.g., system design, habit formation, leadership]

Article content:
${content.slice(0, 8000)}`;

  let result = '';
  try {
    await streamChat(prompt, '', (chunk) => { result += chunk; });
  } catch (err) {
    return { success: false, error: 'Failed to summarize with AI.' };
  }

  // Parse response
  const tagsMatch = result.match(/\*\*Tags:\*\*\s*([^\n]+)/i);
  const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
  const actionMatch = result.match(/\*\*Action Item:\*\*\s*([^\n]+)/i);
  const actionItem = actionMatch ? actionMatch[1].trim() : null;

  // Save to reading log
  const entry = {
    id: Date.now().toString(),
    url,
    title,
    summary: result,
    actionItem,
    tags,
    readAt: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
  };
  addToReadingLog(entry);

  return { success: true, entry, displayText: result };
}

// ===== Reading Log =====
export function addToReadingLog(entry) {
  try {
    const log = getReadingLog();
    log.unshift(entry);
    if (log.length > MAX_LOG) log.pop();
    localStorage.setItem(READING_LOG_KEY, JSON.stringify(log));
  } catch {}
}

export function getReadingLog() {
  try { return JSON.parse(localStorage.getItem(READING_LOG_KEY) || '[]'); } catch { return []; }
}

export function getReadingLogByTag(tag) {
  return getReadingLog().filter(e => e.tags?.includes(tag.toLowerCase()));
}

export function getReadingLogContext(limit = 5) {
  const log = getReadingLog().slice(0, limit);
  if (log.length === 0) return '';
  let ctx = '\n\n## Recently Read Articles:\n';
  for (const entry of log) {
    ctx += `- **${entry.title}** (${entry.date}) — Tags: ${entry.tags.join(', ')}\n`;
    if (entry.actionItem) ctx += `  Action: ${entry.actionItem}\n`;
  }
  return ctx;
}

export function formatReadingLog() {
  const log = getReadingLog();
  if (log.length === 0) return 'No articles read yet, sir. Share a URL and I\'ll summarize it and add it to your reading log.';
  let text = `📚 **Reading Log** (${log.length} articles)\n\n`;
  // Group by tag
  const tags = [...new Set(log.flatMap(e => e.tags))].slice(0, 5);
  if (tags.length > 0) {
    text += `**Topics covered:** ${tags.join(', ')}\n\n`;
  }
  for (const entry of log.slice(0, 10)) {
    text += `📖 **${entry.title}**\n  ${entry.date}`;
    if (entry.tags.length > 0) text += ` | ${entry.tags.slice(0, 3).join(', ')}`;
    if (entry.actionItem) text += `\n  → *${entry.actionItem}*`;
    text += '\n\n';
  }
  if (log.length > 10) text += `...and ${log.length - 10} more.`;
  return text;
}

// Search reading log semantically (keyword match)
export function searchReadingLog(query) {
  const log = getReadingLog();
  const q = query.toLowerCase();
  return log.filter(e =>
    e.title?.toLowerCase().includes(q) ||
    e.tags?.some(t => t.includes(q)) ||
    e.summary?.toLowerCase().includes(q)
  );
}

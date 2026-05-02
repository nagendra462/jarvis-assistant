// Agentic Web Search using DuckDuckGo Lite and a CORS proxy

export async function performWebSearch(query) {
  try {
    const corsProxy = 'https://api.allorigins.win/get?url=';
    const targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const res = await fetch(corsProxy + encodeURIComponent(targetUrl));
    if (!res.ok) throw new Error('Proxy failed');
    
    const data = await res.json();
    const html = data.contents;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const results = Array.from(doc.querySelectorAll('.result__snippet'))
      .slice(0, 5)
      .map(el => el.textContent.trim().replace(/\s+/g, ' '));
      
    if (results.length === 0) return "Search returned no snippets.";
    return results.map((r, i) => `[Result ${i+1}]: ${r}`).join('\n');
  } catch (e) {
    console.error("Agentic search failed", e);
    return `Error searching the web: ${e.message}`;
  }
}

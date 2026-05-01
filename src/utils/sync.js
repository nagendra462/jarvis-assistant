// Local Sync — shares data between devices via the Mac Vite server
// Falls back to localStorage when server is unreachable

export async function syncSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  } catch {} // silent fail
}

export async function syncLoad(key, fallback) {
  try {
    const res = await fetch(`/api/data/${key}`);
    if (res.ok) {
      const { value } = await res.json();
      if (value !== null && value !== undefined) {
        localStorage.setItem(key, JSON.stringify(value));
        return value;
      }
    }
  } catch {}
  try {
    const local = JSON.parse(localStorage.getItem(key));
    return local ?? fallback;
  } catch { return fallback; }
}

// Stubs kept for backward compat
export function initSync() { return false; }
export function isSyncEnabled() { return false; }
export function setupRealtimeSync() {}

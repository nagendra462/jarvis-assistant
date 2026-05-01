/**
 * JARVIS Persistent Store
 * Dual-write abstraction layer: writes to localStorage immediately (for fast UI),
 * and syncs asynchronously to the server (jarvis-data.json) as the source of truth.
 *
 * This makes JARVIS resilient to browser cache clears and prepares the app
 * for a 1-line swap to SQLite when compiled for native mobile via Capacitor.
 */

const SYNC_QUEUE = [];
let isSyncing = false;

/**
 * Hydrate localStorage from the server. Call this on app launch.
 */
export async function hydrateStore() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return;
    const serverData = await res.json();

    // Iterate over server data and populate localStorage
    for (const [key, value] of Object.entries(serverData)) {
      if (key.startsWith('jarvis_')) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
    console.log('JARVIS Store: Hydrated from server.');
  } catch (err) {
    console.warn('JARVIS Store: Failed to hydrate from server.', err);
  }
}

/**
 * Read from local cache (fast).
 * @param {string} key e.g., 'jarvis_habits'
 * @param {any} defaultValue what to return if undefined
 */
export function getItem(key, defaultValue = null) {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return defaultValue;
    return JSON.parse(val);
  } catch {
    return defaultValue;
  }
}

/**
 * Write to local cache and queue async sync to server.
 * @param {string} key e.g., 'jarvis_habits'
 * @param {any} value The JSON-serializable object to save
 */
export function setItem(key, value) {
  // 1. Write local (instant)
  localStorage.setItem(key, JSON.stringify(value));

  // 2. Queue server sync
  SYNC_QUEUE.push({ key, value });
  processSyncQueue();
}

/**
 * Background worker to sync items to the server sequentially
 */
async function processSyncQueue() {
  if (isSyncing || SYNC_QUEUE.length === 0) return;
  isSyncing = true;

  while (SYNC_QUEUE.length > 0) {
    // Take the latest update for a key, dropping redundant older updates in the queue
    const uniqueUpdates = new Map();
    while (SYNC_QUEUE.length > 0) {
      const item = SYNC_QUEUE.shift();
      uniqueUpdates.set(item.key, item.value);
    }

    for (const [key, value] of uniqueUpdates.entries()) {
      try {
        await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
      } catch (err) {
        console.warn(`JARVIS Store: Failed to sync ${key}`, err);
        // Put it back in the queue to retry next time if it's important
        // For now, we drop it to avoid infinite loops, as the next edit will trigger a sync anyway.
      }
    }
  }

  isSyncing = false;
}

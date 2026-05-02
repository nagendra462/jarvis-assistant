// Local Sync — shares data between devices via native filesystem on mobile
// Falls back to localStorage if filesystem is unavailable

import { readJson, writeJson } from './storage.js';

export async function syncSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  try {
    const data = await readJson('jarvis-data.json') || {};
    data[key] = value;
    await writeJson('jarvis-data.json', data);
  } catch {} // silent fail
}

export async function syncLoad(key, fallback) {
  try {
    const data = await readJson('jarvis-data.json');
    if (data && data[key] !== undefined && data[key] !== null) {
      localStorage.setItem(key, JSON.stringify(data[key]));
      return data[key];
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

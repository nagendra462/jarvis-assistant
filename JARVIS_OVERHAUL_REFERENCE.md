# JARVIS Overhaul: Cinematic Voice + Gap Analysis & Fixes

The current JARVIS app has a robotic voice and several architectural/feature gaps that prevent it from being a truly useful personal assistant. This plan addresses the voice quality problem and fixes every major gap identified.

## User Review Required

> [!IMPORTANT]
> **Voice approach**: We'll use SSML with `msedge-tts` to add prosody control (pitch lowering, subtle rate adjustment, natural pauses via `<break>` tags) to the `en-GB-RyanNeural` voice. This is **free, no API key needed**, and will make a dramatic difference. The current TTS just passes raw text — no SSML tuning at all.

> [!IMPORTANT]
> **Web Audio post-processing**: After TTS generates the audio, we'll apply real-time audio processing (subtle bass boost, slight compression, mild reverb) via the Web Audio API to give it that signature cinematic "through a high-end comm system" quality. This is the secret sauce that turns a good neural voice into something that *sounds* like JARVIS.

---

## Gap Analysis: What's Wrong With the App

### 🔴 Critical Gaps (Broken/Missing Core Functionality)

| # | Gap | Impact | 
|---|-----|--------|
| 1 | **Voice sounds robotic** | No SSML prosody control, no audio post-processing. Raw text piped straight to TTS. |
| 2 | **Browser fallback uses FEMALE voice** | `voice.js` prefers "Samantha" and "Google UK English Female" — completely wrong for JARVIS |
| 3 | **Settings Voice tab is dead code** | Voice settings tab references Google Cloud TTS which isn't integrated; saving does nothing |
| 4 | **No conversation persistence** | Chat history is lost on every page refresh — terrible for a personal assistant |
| 5 | **No calendar/scheduling integration** | Can't view upcoming events, can't set real calendar entries |
| 6 | **No clipboard integration** | Can't read/write clipboard — basic assistant functionality missing |
| 7 | **Sync system is a no-op** | `initSync()` always returns `false`, Firebase UI in settings does nothing useful |

### 🟡 Major Gaps (Significantly Limits Usefulness)

| # | Gap | Impact |
|---|-----|--------|
| 8 | **No conversation export/history** | Can't review past conversations, no "what did we discuss yesterday?" |
| 9 | **Memory system is shallow** | Only 50 memories, no categorization, no importance ranking, no decay |
| 10 | **No email/message drafting** | Can't compose emails or messages — common assistant task |
| 11 | **No quick math display** | Calculator results are text-only, no formatted display |
| 12 | **Speech recognition drops silently** | No visual feedback when wake word detection fails or restarts |
| 13 | **No interruption handling** | Can't interrupt JARVIS mid-sentence naturally (speaking + new input collision) |
| 14 | **Focus mode has no ambient sounds** | Just a timer — no white noise, rain, lo-fi beats options |
| 15 | **No URL/link opening** | Can't say "open YouTube" or "open Gmail" |
| 16 | **Reminder notifications don't persist** | If app is closed, reminders are lost (no Push API / service worker integration) |
| 17 | **No expense/finance tracking** | Common daily assistant task completely absent |

### 🟢 Polish Gaps (Makes It Feel Unfinished)

| # | Gap | Impact |
|---|-----|--------|
| 18 | **No typing sound effects** | When JARVIS "types" a response, no subtle keyboard/processing sounds |
| 19 | **No greeting variation based on activity** | Same greeting structure whether you've been away 5 minutes or 5 hours |
| 20 | **Widget bar doesn't update** | No visual state (e.g. focus widget doesn't show "active") |
| 21 | **No dark/light theme toggle** | Fixed dark theme only |
| 22 | **No mobile haptic feedback** | No vibration on wake word detection or alerts |
| 23 | **PWA service worker is basic** | Only caches during install, no runtime caching, no background sync |

---

## Proposed Changes (This Implementation)

We'll focus on the **highest-impact changes**: Voice quality, critical bugs, and the most important missing features.

---

### Voice Engine Overhaul

#### [MODIFY] [vite.config.js](file:///Users/nagendrareddy/.gemini/antigravity/scratch/jarvis/vite.config.js)
- Use SSML with `<prosody>` for pitch (`-2st`), rate (`-5%`), and volume control
- Add `<break>` tags for natural pauses at sentence boundaries
- XML-escape all user text to prevent SSML injection
- Use higher quality output format (`AUDIO_24KHZ_96KBITRATE_MONO_MP3`)

#### [MODIFY] [voice.js](file:///Users/nagendrareddy/.gemini/antigravity/scratch/jarvis/src/utils/voice.js)
- Add Web Audio API post-processing pipeline after receiving TTS audio:
  - **Low-pass filter** at ~6kHz — removes harsh sibilance
  - **Bass boost** (low-shelf filter, +3dB at 200Hz) — adds warmth/depth
  - **Subtle compression** via DynamicsCompressorNode — evens out dynamics
  - **Convolution reverb** — tiny room impulse to add "spatial" quality
- Fix browser fallback to use **male** British voice (`Google UK English Male`, `Daniel`)
- Add voice speed/pitch settings the user can fine-tune
- Add `cleanForSSML()` function that XML-escapes special characters

---

### Chat Persistence

#### [MODIFY] [App.jsx](file:///Users/nagendrareddy/.gemini/antigravity/scratch/jarvis/src/App.jsx)
- Save messages to `localStorage` on every new message
- Load messages from `localStorage` on app init
- Add "Clear Chat" button to the HUD
- Limit stored messages to last 100 to prevent storage bloat

---

### Useful Quick Actions

#### [MODIFY] [jarvis-brain.js](file:///Users/nagendrareddy/.gemini/antigravity/scratch/jarvis/src/utils/jarvis-brain.js)
- Add URL/app opening: "open YouTube", "open Gmail", etc.
- Add clipboard commands: "copy that", "paste from clipboard"
- Add conversation awareness: track last interaction time for smarter greetings

#### [MODIFY] [gemini.js](file:///Users/nagendrareddy/.gemini/antigravity/scratch/jarvis/src/utils/gemini.js)
- Add `[ACTION:OPEN_URL:url]` to the system prompt so the AI can open links
- Add `[ACTION:COPY:text]` for clipboard operations
- Increase memory limit from 50 to 200
- Add memory categorization (personal, work, preferences, habits)

---

### Settings Cleanup

#### [MODIFY] [SettingsPanel.jsx](file:///Users/nagendrareddy/.gemini/antigravity/scratch/jarvis/src/components/SettingsPanel.jsx)
- Replace dead Voice tab with actual voice tuning controls (pitch, rate, bass boost)
- Add "Test Voice" button to preview settings
- Add "Clear All Data" option with confirmation
- Remove Firebase configuration (since sync is local-server based)

---

### Interruption Handling & Auto-Resume Improvement

#### [MODIFY] [App.jsx](file:///Users/nagendrareddy/.gemini/antigravity/scratch/jarvis/src/App.jsx)
- When user sends a new message while JARVIS is speaking → immediately stop speech, process new input
- Extend auto-resume timeout from 4s to 6s for more natural pauses
- Add visual indicator showing wake word is active (persistent dot on HUD)

---

## Open Questions

> [!IMPORTANT]
> **Expense tracking**: Should I add a basic expense tracker (add expense, view monthly summary)? It would add ~200 lines but could be very useful for daily tracking. Or would you prefer to keep the scope focused on voice + gaps?

---

## Verification Plan

### Automated Tests
- Start the dev server and verify TTS endpoint returns audio with SSML
- Test voice post-processing pipeline renders audio in the browser
- Verify chat persistence survives page reload
- Test all new action commands (open URL, clipboard, etc.)

### Manual Verification
- Listen to before vs after voice quality — should sound noticeably warmer, deeper, more cinematic
- Test full conversation flow: wake word → command → response → auto-resume
- Verify settings panel controls actually affect voice output

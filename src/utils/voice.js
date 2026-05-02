// JARVIS Voice Engine — Microsoft Neural TTS (free, no API key)
// Uses Edge Read Aloud neural voices served from local /api/tts

import { Capacitor, registerPlugin } from '@capacitor/core';
const JarvisNative = registerPlugin('JarvisNative');

let audioCtx = null;
let sourceNode = null;
let _userInteracted = false;
let _pendingSpeech = null;

// Track user interaction — required to unlock AudioContext on browsers
export function markUserInteraction() {
  _userInteracted = true;
  // If speech was queued before user interacted, play it now
  if (_pendingSpeech) {
    const { text, onStart, onEnd } = _pendingSpeech;
    _pendingSpeech = null;
    speakNeural(text, onStart, onEnd);
  }
}

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

async function ensureAudioContextResumed() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch (e) {
    console.warn('AudioContext resume failed:', e);
  }
}

// ===== Text Cleanup =====
function cleanForSpeech(text) {
  // Strip markdown and action tags
  return text
    .replace(/\[ACTION:[^\]]*]/g, '')
    .replace(/\[MEMORY:[^\]]*]/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')   // strip markdown links
    .replace(/```[\s\S]*?```/g, '')   // strip code blocks
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ===== Neural TTS via local server =====
async function speakNeural(text, onStart, onEnd) {
  const cleanText = cleanForSpeech(text);
  if (!cleanText) { onEnd?.(); return; }

  // If the user hasn't interacted yet, queue and wait
  if (!_userInteracted) {
    _pendingSpeech = { text, onStart, onEnd };
    return;
  }

  try {
    await ensureAudioContextResumed();

    const settings = getVoiceSettings();
    const config = {
      pitch: settings.pitch !== undefined ? settings.pitch : 0,
      rate:  settings.rate  !== undefined ? settings.rate  : 0,
      bass:  settings.bass  !== undefined ? settings.bass  : 0,
    };

    onStart?.();

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, pitch: config.pitch, rate: config.rate }),
    });

    if (!response.ok) {
      console.warn('Neural TTS failed, falling back to browser voice. Status:', response.status);
      speakBrowser(cleanText, null, onEnd);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.warn('Neural TTS returned empty buffer');
      speakBrowser(cleanText, null, onEnd);
      return;
    }

    await ensureAudioContextResumed();
    const ctx = getAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Stop any currently playing audio
    if (sourceNode) {
      try { sourceNode.onended = null; sourceNode.stop(); } catch {}
      sourceNode.disconnect();
      sourceNode = null;
    }

    // Create audio processing pipeline — subtle, cinematic JARVIS feel
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    // 1. Low-pass filter — removes harsh high-frequency sibilance
    const lowPass = ctx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 6500;
    lowPass.Q.value = 0.7;

    // 2. Gentle bass shelf — warmth without making it "boomy"
    const bassBoost = ctx.createBiquadFilter();
    bassBoost.type = 'lowshelf';
    bassBoost.frequency.value = 200;
    bassBoost.gain.value = config.bass;  // 0dB default

    // 3. Subtle compression — evens dynamics, adds density
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.1;

    // Pipeline: Source → LowPass → Bass → Compressor → Out
    sourceNode.connect(lowPass);
    lowPass.connect(bassBoost);
    bassBoost.connect(compressor);
    compressor.connect(ctx.destination);

    sourceNode.onended = () => {
      sourceNode = null;
      onEnd?.();
    };

    sourceNode.start(0);
  } catch (err) {
    console.warn('Neural TTS error:', err);
    speakBrowser(cleanText, null, onEnd);
  }
}

// ===== Browser TTS fallback =====
function speakBrowser(text, onStart, onEnd) {
  const synth = window.speechSynthesis;
  if (!synth) { onEnd?.(); return; }

  synth.cancel();
  if (!text) { onEnd?.(); return; }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  utterance.volume = 1;

  const voices = synth.getVoices();
  // Prefer Microsoft Jenny (Edge) or similar quality female voices
  const voicePreference = [
    v => /Microsoft.*Jenny.*Online/i.test(v.name),          // Edge TTS Jenny
    v => /Google US English/i.test(v.name),                  // Chrome — clear
    v => /Samantha/i.test(v.name) && v.lang.startsWith('en'), // Mac OS
    v => /Zira/i.test(v.name) && v.lang.startsWith('en'),    // Windows
    v => v.lang.startsWith('en-US') && /female/i.test(v.name),
    v => v.lang.startsWith('en') && /female/i.test(v.name),
    v => /Samantha|Victoria|Karen|Moira/i.test(v.name),
    v => v.lang.startsWith('en-US'),
    v => v.lang.startsWith('en'),
  ];

  for (const predicate of voicePreference) {
    const found = voices.find(predicate);
    if (found) { utterance.voice = found; break; }
  }

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
}

// ===== Main speak function =====
export async function speak(text, onStart, onEnd) {
  const cleanText = cleanForSpeech(text);
  if (!cleanText) { onEnd?.(); return; }

  if (Capacitor.isNativePlatform()) {
    onStart?.();
    try {
      await JarvisNative.speakText({ text: cleanText });
      const durationEstimate = cleanText.split(' ').length * 350;
      setTimeout(() => onEnd?.(), durationEstimate);
    } catch (e) {
      console.warn('Native TTS failed:', e);
      speakNeural(text, onStart, onEnd);
    }
    return;
  }

  speakNeural(text, onStart, onEnd);
}

// ===== Stop speech =====
export function stopSpeaking() {
  if (Capacitor.isNativePlatform()) {
    JarvisNative.stopSpeaking().catch(()=>{});
  }
  window.speechSynthesis?.cancel();
  if (sourceNode) {
    try { sourceNode.onended = null; sourceNode.stop(); } catch {}
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  _pendingSpeech = null;
}

// ===== Preload browser voices (fallback) =====
export function preloadVoices() {
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

// ===== Voice settings — reads from localStorage =====
export function getVoiceSettings() {
  try {
    return JSON.parse(localStorage.getItem('jarvis_voice_settings') || '{}');
  } catch { return {}; }
}

export function saveVoiceSettings(settings) {
  localStorage.setItem('jarvis_voice_settings', JSON.stringify(settings));
}

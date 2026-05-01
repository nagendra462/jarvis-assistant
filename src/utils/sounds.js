// JARVIS Sound Effects — synthesized HUD sounds using Web Audio API
// No external files needed — all sounds generated programmatically

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Resume AudioContext if it was suspended (happens in background tabs).
// Must be called before any audio playback in a completion handler.
export async function resumeAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch (e) {
    console.warn('AudioContext resume failed:', e);
  }
}

// ===== Focus Session Complete Sound =====
// A loud, dramatic 4-beat ascending fanfare — designed to be impossible to miss.
export function playFocusCompleteSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Master gain — loud
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.55, now);
    masterGain.connect(ctx.destination);

    // 4 ascending chime beats
    const beats = [
      { freq: 523.25, t: 0 },      // C5
      { freq: 659.25, t: 0.22 },   // E5
      { freq: 783.99, t: 0.44 },   // G5
      { freq: 1046.5, t: 0.66 },   // C6 — the triumphant top note
    ];

    beats.forEach(({ freq, t }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + t);
      env.gain.setValueAtTime(0, now + t);
      env.gain.linearRampToValueAtTime(1, now + t + 0.02); // fast attack
      env.gain.exponentialRampToValueAtTime(0.001, now + t + 0.55); // decay
      osc.connect(env);
      env.connect(masterGain);
      osc.start(now + t);
      osc.stop(now + t + 0.6);
    });

    // Sustained hold tone on C6 after the 4 beats (sounds like a triumph hold)
    const holdOsc = ctx.createOscillator();
    const holdEnv = ctx.createGain();
    holdOsc.type = 'sine';
    holdOsc.frequency.setValueAtTime(1046.5, now + 1.0);
    holdEnv.gain.setValueAtTime(0, now + 1.0);
    holdEnv.gain.linearRampToValueAtTime(0.7, now + 1.05);
    holdEnv.gain.setValueAtTime(0.7, now + 1.8);
    holdEnv.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
    holdOsc.connect(holdEnv);
    holdEnv.connect(masterGain);
    holdOsc.start(now + 1.0);
    holdOsc.stop(now + 2.5);

  } catch (e) {
    console.warn('Focus complete sound failed:', e);
  }
}

// ===== Iron Man HUD Activation Sound =====
// A rising dual-tone sweep + subtle click — the signature JARVIS wake sound
export function playWakeSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Rising sweep tone 1 (low → mid)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(200, now);
    osc1.frequency.exponentialRampToValueAtTime(800, now + 0.25);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Rising sweep tone 2 (higher, delayed slightly)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(400, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.4);

    // Confirmation click/beep
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1000, now + 0.3);
    gain3.gain.setValueAtTime(0.12, now + 0.3);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.3);
    osc3.stop(now + 0.45);
  } catch (e) {
    console.warn('Wake sound failed:', e);
  }
}

// ===== Notification/Reminder Sound =====
export function playReminderSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Two-note chime
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 600 : 800, now + i * 0.15);
      gain.gain.setValueAtTime(0.1, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.3);
    }
  } catch (e) {
    console.warn('Reminder sound failed:', e);
  }
}

// ===== Alarm Sound (repeating) =====
let alarmInterval = null;

export function playAlarmSound() {
  stopAlarmSound();
  let count = 0;
  const maxBeeps = 20;

  function beep() {
    if (count >= maxBeeps) { stopAlarmSound(); return; }
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
      count++;
    } catch {}
  }

  beep();
  alarmInterval = setInterval(beep, 500);
}

export function stopAlarmSound() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
}

import React, { useState, useEffect, useRef } from 'react';
import { FOCUS_ENCOURAGEMENTS, pickRandom } from '../utils/jarvis-brain';

const FOCUS_END_KEY = 'jarvis_focus_end_ts';
const FOCUS_PAUSED_REMAINING_KEY = 'jarvis_focus_paused_ms';

export default function FocusOverlay({ minutes, onStop, onPause, paused }) {
  // Compute initial values once — avoid calling helpers twice
  const initialEndTime = (() => {
    const stored = localStorage.getItem(FOCUS_END_KEY);
    return stored ? parseInt(stored, 10) : null;
  })();

  const initialRemaining = (() => {
    if (paused) {
      const stored = localStorage.getItem(FOCUS_PAUSED_REMAINING_KEY);
      return stored ? parseInt(stored, 10) : minutes * 60 * 1000;
    }
    if (initialEndTime) {
      const left = initialEndTime - Date.now();
      return left > 0 ? left : 0;
    }
    return minutes * 60 * 1000;
  })();

  const [displayMs, setDisplayMs] = useState(initialRemaining);
  const remainingMsRef = useRef(initialRemaining);
  const endTimeRef = useRef(initialEndTime);
  const onStopRef = useRef(onStop);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  useEffect(() => {
    if (paused) {
      if (endTimeRef.current) {
        const left = endTimeRef.current - Date.now();
        remainingMsRef.current = left > 0 ? left : 0;
        setDisplayMs(remainingMsRef.current);
        endTimeRef.current = null;
        localStorage.removeItem(FOCUS_END_KEY);
        localStorage.setItem(FOCUS_PAUSED_REMAINING_KEY, String(remainingMsRef.current));
      }
      return;
    }

    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + remainingMsRef.current;
    }
    localStorage.setItem(FOCUS_END_KEY, String(endTimeRef.current));
    localStorage.removeItem(FOCUS_PAUSED_REMAINING_KEY);

    const tick = () => {
      if (!endTimeRef.current) return;
      const left = endTimeRef.current - Date.now();
      if (left <= 0) {
        setDisplayMs(0);
        remainingMsRef.current = 0;
        endTimeRef.current = null;
        localStorage.removeItem(FOCUS_END_KEY);
        if (onStopRef.current) onStopRef.current(true);
      } else {
        setDisplayMs(left);
        remainingMsRef.current = left;
      }
    };

    const intervalId = setInterval(tick, 500);
    tick();

    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [paused]);

  // Clean up keys on unmount
  useEffect(() => {
    return () => {
      localStorage.removeItem(FOCUS_END_KEY);
      localStorage.removeItem(FOCUS_PAUSED_REMAINING_KEY);
    };
  }, []);

  const displaySecs = Math.ceil(displayMs / 1000);
  const minsStr = Math.floor(displaySecs / 60).toString().padStart(2, '0');
  const secsStr = (displaySecs % 60).toString().padStart(2, '0');

  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>⏱️ Focus Mode</h2>
        <div className="focus-timer-display">{minsStr}:{secsStr}</div>
        <p className="focus-status-text">
          {paused ? "Paused. Ready when you are, sir." : pickRandom(FOCUS_ENCOURAGEMENTS)}
        </p>
        <div className="overlay-actions">
          <button className="btn-secondary" onClick={onPause}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn-danger" onClick={() => onStopRef.current && onStopRef.current(false)}>End Session</button>
        </div>
      </div>
    </div>
  );
}

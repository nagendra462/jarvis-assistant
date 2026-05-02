import { useRef, useEffect, useCallback } from 'react';
import { playWakeSound } from '../utils/sounds';
import { stopSpeaking } from '../utils/voice';
import { markUserInteraction } from '../utils/voice';

/**
 * useWakeWord — Encapsulates all Web Speech API logic:
 * continuous wake-word listening, active command capture,
 * silence-submit timer, and the health-check watchdog.
 */
export function useWakeWord({ onCommand, setIsListening, setOrbState, setWakeWordActive }) {
  const recognitionRef = useRef(null);
  const wakeListeningRef = useRef(false);
  const activeListeningRef = useRef(false);
  const autoResumeTimerRef = useRef(null);
  const silenceSubmitTimerRef = useRef(null);
  const wakeHealthRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let restartAttempts = 0;

    const safeStart = () => {
      if (!wakeListeningRef.current) return;
      try { recognition.start(); restartAttempts = 0; } catch {}
    };

    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript.trim();

      if (!activeListeningRef.current && wakeListeningRef.current) {
        const lower = transcript.toLowerCase();
        if (lower.includes('jarvis')) {
          playWakeSound();
          activeListeningRef.current = true;
          setIsListening(true);
          setOrbState('listening');

          const afterWake = lower.split(/jarvis\s*/i).pop().trim();
          if (lastResult.isFinal && afterWake.length > 2) {
            activeListeningRef.current = false;
            setIsListening(false); setOrbState('idle');
            onCommand(afterWake);
            return;
          }
          try { recognition.stop(); } catch {}
          clearTimeout(autoResumeTimerRef.current);
          autoResumeTimerRef.current = setTimeout(() => {
            activeListeningRef.current = false; setIsListening(false); setOrbState('idle');
          }, 8000);
          return;
        }
      }

      if (activeListeningRef.current) {
        let fullText = '';
        for (let i = 0; i < event.results.length; i++) {
          fullText += event.results[i][0].transcript + ' ';
        }
        fullText = fullText.trim().replace(/^(hey\s+)?jarvis\s*/i, '');

        if (fullText.length > 0) {
          clearTimeout(autoResumeTimerRef.current);
          clearTimeout(silenceSubmitTimerRef.current);
          silenceSubmitTimerRef.current = setTimeout(() => {
            activeListeningRef.current = false;
            setIsListening(false);
            setOrbState('idle');
            onCommand(fullText);
            try { recognition.stop(); } catch {}
          }, 2000);
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        if (wakeListeningRef.current) {
          const delay = Math.min(300 * Math.pow(2, restartAttempts), 5000);
          restartAttempts++;
          setTimeout(safeStart, delay);
        }
      }
    };

    recognition.onend = () => {
      if (wakeListeningRef.current) setTimeout(safeStart, 150);
    };

    recognitionRef.current = recognition;

    wakeHealthRef.current = setInterval(() => {
      if (wakeListeningRef.current) {
        try { recognition.start(); } catch {}
      }
    }, 30000);

    return () => clearInterval(wakeHealthRef.current);
  }, []); // eslint-disable-line

  const toggleMic = useCallback(() => {
    if (!recognitionRef.current) return false; // not available
    if (wakeListeningRef.current) {
      wakeListeningRef.current = false;
      activeListeningRef.current = false;
      setWakeWordActive(false);
      setIsListening(false);
      setOrbState('idle');
      clearTimeout(autoResumeTimerRef.current);
      clearTimeout(silenceSubmitTimerRef.current);
      try { recognitionRef.current.stop(); } catch {}
      return 'off';
    } else {
      markUserInteraction();
      wakeListeningRef.current = true;
      activeListeningRef.current = true;
      setWakeWordActive(true);
      setIsListening(true);
      setOrbState('listening');
      try { recognitionRef.current.start(); } catch {
        try { recognitionRef.current.stop(); } catch {}
        setTimeout(() => { try { recognitionRef.current.start(); } catch {} }, 300);
      }
      playWakeSound();
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = setTimeout(() => {
        activeListeningRef.current = false; setIsListening(false); setOrbState('idle');
      }, 8000);
      return 'on';
    }
  }, [setIsListening, setOrbState, setWakeWordActive]);

  // Resume listening after JARVIS finishes speaking
  const resumeListeningAfterSpeak = useCallback(() => {
    if (wakeListeningRef.current && recognitionRef.current) {
      activeListeningRef.current = true;
      setIsListening(true);
      setOrbState('listening');
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = setTimeout(() => {
        activeListeningRef.current = false; setIsListening(false); setOrbState('idle');
      }, 6000);
    }
  }, [setIsListening, setOrbState]);

  return { recognitionRef, wakeListeningRef, activeListeningRef, toggleMic, resumeListeningAfterSpeak };
}

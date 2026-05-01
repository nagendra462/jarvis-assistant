import React, { useState, useEffect } from 'react';
import { formatTime, formatDate } from '../utils/jarvis-brain';

export default function HUD({ wakeWordActive, onSettingsClick }) {
  const [time, setTime] = useState(formatTime(new Date()));
  const [date, setDate] = useState(formatDate(new Date()));
  const [battery, setBattery] = useState('--');
  const [network, setNetwork] = useState(navigator.onLine ? 'Online' : 'Offline');

  useEffect(() => {
    const tick = setInterval(() => {
      setTime(formatTime(new Date()));
      setDate(formatDate(new Date()));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then(b => {
        setBattery(`${Math.round(b.level * 100)}%`);
        b.addEventListener('levelchange', () => setBattery(`${Math.round(b.level * 100)}%`));
      }).catch(() => {});
    }
    const handleOnline = () => setNetwork('Online');
    const handleOffline = () => setNetwork('Offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="hud">
      <div className="hud-left">
        <span className="hud-label">J.A.R.V.I.S.</span>
        <span className="hud-version">v3.2.1</span>
      </div>
      <div className="hud-center">
        <span>{time}</span>
        <span className="hud-sep">|</span>
        <span>{date}</span>
      </div>
      <div className="hud-right">
        {wakeWordActive && <span title="Listening" className="sync-badge" style={{color: 'var(--red)', filter: 'drop-shadow(0 0 5px var(--red))'}}>🎤</span>}
        <span title="Battery">⚡ {battery}</span>
        <span title="Network">📡 {network}</span>
        <button className="hud-settings-btn" onClick={onSettingsClick} title="Settings">⚙️</button>
      </div>
    </header>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { computeStats, getDailyFocusMinutes, getSessions } from '../utils/analytics.js';

export default function AnalyticsDashboard({ onClose }) {
  const [stats, setStats] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [range, setRange] = useState(14);
  const canvasRef = useRef(null);

  useEffect(() => {
    const s = computeStats(range);
    const d = getDailyFocusMinutes(range);
    setStats(s);
    setDailyData(d);
  }, [range]);

  useEffect(() => {
    if (!canvasRef.current || dailyData.length === 0) return;
    drawChart(canvasRef.current, dailyData);
  }, [dailyData]);

  function drawChart(canvas, data) {
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth;
    const H = 140;
    canvas.width = W;
    canvas.height = H;

    const maxMinutes = Math.max(...data.map(d => d.minutes), 60);
    const barW = Math.floor((W - 40) / data.length) - 4;
    const barAreaH = H - 30;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,212,255,0.07)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(frac => {
      const y = barAreaH * (1 - frac);
      ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W, y); ctx.stroke();
    });

    // Y-axis labels
    ctx.fillStyle = 'rgba(0,212,255,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    const maxH = Math.ceil(maxMinutes / 60);
    [0, maxH / 2, maxH].forEach(h => {
      const y = barAreaH * (1 - h / maxH);
      ctx.fillText(`${h}h`, 26, y + 4);
    });

    // Bars
    data.forEach((d, i) => {
      const x = 30 + i * (barW + 4);
      const barH = d.minutes > 0 ? Math.max(3, (d.minutes / maxMinutes) * barAreaH) : 0;
      const y = barAreaH - barH;

      // Bar gradient
      const isToday = d.date === new Date().toISOString().slice(0, 10);
      const grad = ctx.createLinearGradient(x, y, x, barAreaH);
      if (d.minutes === 0) {
        grad.addColorStop(0, 'rgba(0,212,255,0.06)');
        grad.addColorStop(1, 'rgba(0,212,255,0.03)');
      } else if (isToday) {
        grad.addColorStop(0, 'rgba(46,213,115,0.9)');
        grad.addColorStop(1, 'rgba(46,213,115,0.4)');
      } else {
        grad.addColorStop(0, 'rgba(0,212,255,0.85)');
        grad.addColorStop(1, 'rgba(0,212,255,0.3)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect?.(x, y, barW, barH, [3, 3, 0, 0]) || ctx.fillRect(x, y, barW, barH);
      ctx.fill();

      // X labels (every 3rd)
      if (i % 3 === 0 || i === data.length - 1) {
        ctx.fillStyle = 'rgba(122,155,181,0.6)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        const label = d.label.split(',')[0]; // just "Mon 5/1"
        ctx.fillText(label, x + barW / 2, H - 4);
      }
    });
  }

  return (
    <div className="overlay">
      <div className="overlay-card analytics-panel">
        <div className="overlay-header">
          <h2>⏱️ Focus Analytics</h2>
          <button className="overlay-close" onClick={onClose}>✕</button>
        </div>

        {/* Range selector */}
        <div className="analytics-range">
          {[7, 14, 30].map(d => (
            <button key={d} className={`range-btn ${range === d ? 'active' : ''}`} onClick={() => setRange(d)}>
              {d}d
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="analytics-chart-container">
          <canvas ref={canvasRef} className="analytics-chart" />
        </div>

        {!stats ? (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
            No focus sessions yet, sir. Start one and I'll track everything.
          </p>
        ) : (
          <>
            {/* Stat grid */}
            <div className="analytics-grid">
              <div className="analytics-stat">
                <span className="analytics-stat-value">{stats.totalHours}h</span>
                <span className="analytics-stat-label">Total Focus</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{stats.completionRate}%</span>
                <span className="analytics-stat-label">Completion Rate</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{stats.currentStreak}d</span>
                <span className="analytics-stat-label">Streak</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{stats.avgSessionMinutes}m</span>
                <span className="analytics-stat-label">Avg Session</span>
              </div>
            </div>

            {/* Week comparison */}
            <div className="analytics-week-compare">
              <span>This week: <strong>{stats.thisWeekHours}h</strong></span>
              <span>Last week: <strong>{stats.lastWeekHours}h</strong></span>
              {stats.weekChange !== null && (
                <span className={stats.weekChange >= 0 ? 'trend-up' : 'trend-down'}>
                  {stats.weekChange >= 0 ? '📈' : '📉'} {Math.abs(stats.weekChange)}%
                </span>
              )}
            </div>

            {/* Insights */}
            <div className="analytics-insights">
              {stats.peakHour !== null && (
                <div className="analytics-insight">
                  🕐 Peak focus: <strong>{stats.peakHour}:00–{stats.peakHour + 1}:00</strong>
                </div>
              )}
              {stats.bestDay && (
                <div className="analytics-insight">
                  📅 Best day: <strong>{stats.bestDay}</strong>
                </div>
              )}
            </div>

            {/* Recent sessions */}
            <div className="recent-sessions">
              <p className="analytics-section-label">Recent Sessions</p>
              {getSessions(7).slice(-8).reverse().map(s => (
                <div key={s.id} className="session-item">
                  <span className={`session-dot ${s.completed ? 'done' : 'stopped'}`} />
                  <span className="session-date">{s.date}</span>
                  <span className="session-mins">{s.actualMinutes}m</span>
                  <span className="session-time">{s.timeOfDay}</span>
                  {s.skill && <span className="session-skill">{s.skill}</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

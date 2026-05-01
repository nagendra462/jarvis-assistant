import React, { useState, useEffect } from 'react';
import { listJournals, computeProductivityScore } from '../utils/journal.js';

export default function JournalPanel({ onClose }) {
  const [journals, setJournals] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('calendar'); // 'calendar' | 'detail'

  useEffect(() => {
    async function load() {
      const j = await listJournals(90);
      setJournals(j);
      setLoading(false);
    }
    load();
  }, []);

  function handleSelectDate(entry) {
    setSelectedDate(entry.date);
    setSelectedEntry(entry);
    setView('detail');
  }

  function getScoreColor(score) {
    if (score >= 75) return 'var(--green)';
    if (score >= 50) return 'var(--cyan)';
    if (score >= 25) return 'var(--gold)';
    return 'var(--red)';
  }

  // Build calendar (last 12 weeks)
  const calendarData = {};
  for (const j of journals) {
    calendarData[j.date] = { score: computeProductivityScore(j), entry: j };
  }

  // Last 84 days (12 weeks)
  const days = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }), ...calendarData[dateStr] });
  }

  // Group into weeks
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="overlay">
      <div className="overlay-card journal-panel">
        <div className="overlay-header">
          <h2>📖 Life Journal</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {view === 'detail' && <button className="overlay-close" onClick={() => setView('calendar')} title="Back">←</button>}
            <button className="overlay-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {view === 'calendar' && (
          <>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '12px' }}>
              Last 90 days — click any day to see your entry
            </p>

            {/* Day labels */}
            <div className="journal-day-labels">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <span key={d} className="journal-day-label">{d}</span>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="journal-calendar">
              {weeks.map((week, wi) => (
                <div key={wi} className="journal-week">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className={`journal-day ${day.entry ? 'has-entry' : ''} ${day.date === selectedDate ? 'selected' : ''}`}
                      style={day.entry ? { background: getScoreColor(day.score), opacity: 0.3 + day.score / 140 } : {}}
                      onClick={() => day.entry && handleSelectDate(day.entry)}
                      title={day.date + (day.entry ? ` (score: ${day.score})` : ' — no entry')}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="journal-legend">
              <span style={{ color: 'var(--text-dim)' }}>Less</span>
              {['var(--text-dim)', 'var(--red)', 'var(--gold)', 'var(--cyan)', 'var(--green)'].map((c, i) => (
                <div key={i} className="legend-dot" style={{ background: c }} />
              ))}
              <span style={{ color: 'var(--text-dim)' }}>More</span>
            </div>

            {/* Stats */}
            <div className="journal-stats">
              <div className="journal-stat"><span>{journals.length}</span><span>days logged</span></div>
              <div className="journal-stat">
                <span>{journals.filter(j => computeProductivityScore(j) >= 75).length}</span>
                <span>great days</span>
              </div>
              <div className="journal-stat">
                <span>{journals.filter(j => j.morningRitual).length}</span>
                <span>morning rituals</span>
              </div>
              <div className="journal-stat">
                <span>{journals.filter(j => j.eveningDebrief).length}</span>
                <span>evening debriefs</span>
              </div>
            </div>
          </>
        )}

        {view === 'detail' && selectedEntry && (
          <div className="journal-detail">
            <h3 className="journal-entry-date">{new Date(selectedEntry.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
            <div className="journal-score-badge" style={{ color: getScoreColor(computeProductivityScore(selectedEntry)) }}>
              Score: {computeProductivityScore(selectedEntry)}/100
            </div>

            {selectedEntry.morningRitual && (
              <div className="journal-section">
                <p className="journal-section-title">🌅 Morning</p>
                {selectedEntry.morningRitual.energy && <p><strong>Energy:</strong> {selectedEntry.morningRitual.energy}/10</p>}
                {selectedEntry.morningRitual.yesterdayReview && <p><strong>Yesterday:</strong> {selectedEntry.morningRitual.yesterdayReview}</p>}
                {selectedEntry.morningRitual.todayMITs?.length > 0 && (
                  <div>
                    <strong>MITs:</strong>
                    <ul className="journal-mits">{selectedEntry.morningRitual.todayMITs.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </div>
                )}
                {selectedEntry.morningRitual.intention && <p><em>Intention: "{selectedEntry.morningRitual.intention}"</em></p>}
              </div>
            )}

            {(selectedEntry.focusSessions?.length > 0) && (
              <div className="journal-section">
                <p className="journal-section-title">⏱️ Focus Sessions</p>
                {selectedEntry.focusSessions.map((s, i) => (
                  <p key={i} className="journal-session-item">
                    {s.completed ? '✅' : '⏹️'} {s.actualMinutes || s.plannedMinutes}m
                    {s.skill ? ` — ${s.skill}` : ''}
                  </p>
                ))}
              </div>
            )}

            {selectedEntry.eveningDebrief && (
              <div className="journal-section">
                <p className="journal-section-title">🌙 Evening</p>
                {selectedEntry.eveningDebrief.biggestWin && <p><strong>Win:</strong> {selectedEntry.eveningDebrief.biggestWin}</p>}
                {selectedEntry.eveningDebrief.moodWord && <p><strong>Mood:</strong> {selectedEntry.eveningDebrief.moodWord}</p>}
                {selectedEntry.eveningDebrief.carryForward && <p><strong>Carry forward:</strong> {selectedEntry.eveningDebrief.carryForward}</p>}
                {selectedEntry.eveningDebrief.gratitude && <p><strong>Grateful for:</strong> {selectedEntry.eveningDebrief.gratitude}</p>}
              </div>
            )}

            {!selectedEntry.morningRitual && !selectedEntry.eveningDebrief && (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                Partial data for this day — rituals not completed.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

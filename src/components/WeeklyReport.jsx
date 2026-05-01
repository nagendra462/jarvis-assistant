import React, { useState, useEffect } from 'react';
import { isWeeklyReportDue, generateWeeklyHonestyReport, markWeeklyReportDone } from '../utils/patterns.js';
import { streamChat } from '../utils/gemini.js';

export default function WeeklyReport({ onClose, autoGenerate = false }) {
  const [report, setReport] = useState('');
  const [generating, setGenerating] = useState(false);
  const [commitment, setCommitment] = useState('');
  const [commitmentSaved, setCommitmentSaved] = useState(false);

  useEffect(() => {
    if (autoGenerate) handleGenerate();
  }, []); // eslint-disable-line

  async function handleGenerate() {
    setGenerating(true);
    setReport('');
    const result = await generateWeeklyHonestyReport((prompt, ctx, cb) =>
      streamChat(prompt, ctx, cb)
    );
    setReport(result);
    setGenerating(false);
    markWeeklyReportDone();
  }

  function handleSaveCommitment() {
    if (!commitment.trim()) return;
    const commitments = JSON.parse(localStorage.getItem('jarvis_commitments') || '[]');
    commitments.unshift({
      text: commitment.trim(),
      date: new Date().toISOString().slice(0, 10),
      week: getWeekLabel(),
      fulfilled: false,
    });
    if (commitments.length > 52) commitments.pop();
    localStorage.setItem('jarvis_commitments', JSON.stringify(commitments));
    setCommitmentSaved(true);
    setTimeout(() => setCommitmentSaved(false), 2000);
  }

  // Past commitments
  const commitments = JSON.parse(localStorage.getItem('jarvis_commitments') || '[]');
  const openCommitments = commitments.filter(c => !c.fulfilled).slice(0, 3);

  function toggleCommitment(i) {
    const updated = [...commitments];
    updated[i].fulfilled = !updated[i].fulfilled;
    localStorage.setItem('jarvis_commitments', JSON.stringify(updated));
  }

  return (
    <div className="overlay">
      <div className="overlay-card weekly-report-panel">
        <div className="overlay-header">
          <h2>📊 Weekly Honesty Report</h2>
          <button className="overlay-close" onClick={onClose}>✕</button>
        </div>

        {/* Open commitments from last week */}
        {openCommitments.length > 0 && !report && (
          <div className="past-commitments">
            <p className="analytics-section-label">⚠️ Open Commitments</p>
            {openCommitments.map((c, i) => (
              <div key={i} className="commitment-item">
                <input
                  type="checkbox"
                  onChange={() => toggleCommitment(commitments.indexOf(c))}
                  checked={c.fulfilled}
                />
                <span>{c.text}</span>
                <span className="commitment-date">{c.week}</span>
              </div>
            ))}
          </div>
        )}

        {!report && !generating && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <p style={{ color: 'var(--text-dim)', marginBottom: '20px' }}>
              I'll analyze your week — focus sessions, goals, habits, patterns — and give you an unfiltered assessment.
            </p>
            <button className="btn-primary" style={{ width: '100%' }} onClick={handleGenerate}>
              Generate This Week's Report
            </button>
          </div>
        )}

        {generating && (
          <div className="weekly-report-generating">
            <div className="typing-indicator" style={{ margin: '20px auto' }}>
              <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
            </div>
            <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>Analyzing your week...</p>
          </div>
        )}

        {report && (
          <>
            <div
              className="weekly-report-content"
              dangerouslySetInnerHTML={{
                __html: report
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/^#{1,3}\s+(.+)$/gm, '<h3>$1</h3>')
                  .replace(/\n/g, '<br/>')
              }}
            />
            <div className="commitment-section">
              <p className="analytics-section-label">📌 My Commitment This Week</p>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px' }}>
                Write one specific, measurable thing you commit to doing next week.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="settings-input"
                  value={commitment}
                  onChange={e => setCommitment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveCommitment()}
                  placeholder="e.g. Complete 5 focus sessions and sleep by midnight every day"
                />
                <button className="btn-primary" style={{ whiteSpace: 'nowrap', padding: '8px 14px' }} onClick={handleSaveCommitment}>
                  {commitmentSaved ? '✓' : 'Save'}
                </button>
              </div>
            </div>
            <button className="btn-secondary" style={{ width: '100%', marginTop: '12px' }} onClick={handleGenerate}>
              Regenerate
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function getWeekLabel() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

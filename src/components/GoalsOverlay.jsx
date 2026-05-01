import React, { useState } from 'react';
import { getGoals, addGoal, toggleGoal, deleteGoal } from '../utils/jarvis-brain';
import { syncSave } from '../utils/sync';

export default function GoalsOverlay({ onClose }) {
  const [goals, setGoals] = useState(getGoals());
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (!input.trim()) return;
    const newGoals = addGoal(input.trim());
    setGoals({ ...newGoals });
    syncSave('jarvis_goals', newGoals);
    setInput('');
  };

  const handleToggle = (i) => {
    const newGoals = toggleGoal(i);
    setGoals({ ...newGoals });
    syncSave('jarvis_goals', newGoals);
  };

  const handleDelete = (i) => {
    const newGoals = deleteGoal(i);
    setGoals({ ...newGoals });
    syncSave('jarvis_goals', newGoals);
  };

  const total = goals.items.length;
  const done = goals.items.filter(g => g.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="overlay">
      <div className="overlay-card goals-card">
        <div className="overlay-header">
          <h2>🎯 Today's Mission</h2>
          <button className="overlay-close" onClick={onClose}>✕</button>
        </div>
        <div className="goals-list">
          {goals.items.length === 0 && (
            <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
              No goals yet, sir. Set a target and pursue it relentlessly.
            </p>
          )}
          {goals.items.map((g, i) => (
            <div key={i} className={`goal-item ${g.done ? 'done' : ''} ${g.carried ? 'carried' : ''}`}>
              <input
                type="checkbox"
                className="goal-checkbox"
                checked={g.done}
                onChange={() => handleToggle(i)}
              />
              <span className="goal-text">
                {g.carried && <span className="carried-tag">↩ </span>}
                {g.text}
              </span>
              <button className="goal-delete" onClick={() => handleDelete(i)}>🗑️</button>
            </div>
          ))}
        </div>
        <div className="goal-input-row">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Add a new goal..."
          />
          <button className="btn-primary" onClick={handleAdd}>Add</button>
        </div>
        {total > 0 && (
          <div className="goals-progress">
            {done}/{total} COMPLETED ({pct}%)
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

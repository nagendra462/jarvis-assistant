import React, { useState, useEffect } from 'react';
import {
  getSkills, addSkill, deleteSkill, logStudySession,
  updateTopicStatus, addTopicToSkill, getNextStudyRecommendation,
  formatSkillsReport, getTopicsNeedingReview
} from '../utils/skills.js';

export default function SkillsPanel({ onClose, onCommand }) {
  const [skills, setSkills] = useState(getSkills());
  const [activeSkill, setActiveSkill] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' | 'detail' | 'add'
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('');
  const [newTopics, setNewTopics] = useState('');
  const [logMin, setLogMin] = useState('');
  const [logTopic, setLogTopic] = useState('');
  const [status, setStatus] = useState('');
  const recommendation = getNextStudyRecommendation();
  const reviewsNeeded = getTopicsNeedingReview();

  function refresh() { setSkills(getSkills()); }

  function handleAddSkill() {
    if (!newSkillName.trim()) return;
    const topics = newTopics.split(',').map(t => t.trim()).filter(Boolean);
    addSkill(newSkillName.trim(), newSkillCategory.trim() || 'General', topics);
    setNewSkillName(''); setNewSkillCategory(''); setNewTopics('');
    refresh();
    setView('overview');
    setStatus(`✅ Added skill: ${newSkillName}`);
    setTimeout(() => setStatus(''), 2000);
  }

  function handleLogSession() {
    if (!activeSkill || !logMin) return;
    const result = logStudySession(activeSkill.name, parseInt(logMin), logTopic || null);
    setLogMin(''); setLogTopic('');
    refresh();
    setActiveSkill(getSkills().find(s => s.id === activeSkill.id));
    if (result?.newMilestone) {
      setStatus(`🏆 Milestone! ${result.newMilestone.description}`);
    } else {
      setStatus(`✅ Logged ${logMin} min${logTopic ? ` on ${logTopic}` : ''}`);
    }
    setTimeout(() => setStatus(''), 3000);
  }

  function handleTopicStatusChange(skillName, topicName, newStatus) {
    const confidence = newStatus === 'done' ? 8 : newStatus === 'in_progress' ? 5 : 0;
    updateTopicStatus(skillName, topicName, newStatus, confidence);
    refresh();
    setActiveSkill(getSkills().find(s => s.name === skillName));
  }

  function handleDelete(id) {
    if (confirm('Delete this skill and all its history?')) {
      deleteSkill(id);
      refresh();
      setView('overview');
      setActiveSkill(null);
    }
  }

  const totalHours = skills.reduce((s, sk) => s + Math.floor(sk.totalMinutes / 60), 0);
  const totalSessions = skills.reduce((s, sk) => s + sk.totalSessions, 0);

  return (
    <div className="overlay">
      <div className="overlay-card skills-panel">
        <div className="overlay-header">
          <h2>📚 Skills Tracker</h2>
          <button className="overlay-close" onClick={onClose}>✕</button>
        </div>

        {/* Stats row */}
        <div className="skills-stats-row">
          <div className="skill-stat"><span className="skill-stat-value">{skills.length}</span><span className="skill-stat-label">Skills</span></div>
          <div className="skill-stat"><span className="skill-stat-value">{totalHours}h</span><span className="skill-stat-label">Total</span></div>
          <div className="skill-stat"><span className="skill-stat-value">{totalSessions}</span><span className="skill-stat-label">Sessions</span></div>
        </div>

        {/* Recommendation */}
        {recommendation && (
          <div className="skills-recommendation">
            {recommendation.type === 'review' && `🔄 Review: ${recommendation.topic} in ${recommendation.skill} (${recommendation.daysSince}d ago)`}
            {recommendation.type === 'continue' && `▶️ Continue: ${recommendation.topic} in ${recommendation.skill}`}
            {recommendation.type === 'start' && `🆕 Start: ${recommendation.topic} in ${recommendation.skill}`}
          </div>
        )}

        {reviewsNeeded.length > 0 && (
          <div className="skills-review-alert">
            ⚠️ {reviewsNeeded.length} topic{reviewsNeeded.length > 1 ? 's' : ''} due for spaced repetition review
          </div>
        )}

        {status && <div className="skills-status">{status}</div>}

        {/* Nav tabs */}
        <div className="skills-tabs">
          <button className={`skills-tab ${view === 'overview' ? 'active' : ''}`} onClick={() => { setView('overview'); setActiveSkill(null); }}>Overview</button>
          {activeSkill && <button className={`skills-tab ${view === 'detail' ? 'active' : ''}`} onClick={() => setView('detail')}>{activeSkill.name}</button>}
          <button className={`skills-tab ${view === 'add' ? 'active' : ''}`} onClick={() => setView('add')}>+ Add Skill</button>
        </div>

        {/* OVERVIEW */}
        {view === 'overview' && (
          <div className="skills-list">
            {skills.length === 0 && (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>
                No skills tracked yet, sir.<br />Add one to start building your knowledge map.
              </p>
            )}
            {skills.map(skill => {
              const totalHours = Math.floor(skill.totalMinutes / 60);
              const done = skill.topics.filter(t => t.status === 'done').length;
              const total = skill.topics.length;
              return (
                <div key={skill.id} className="skill-card" onClick={() => { setActiveSkill(skill); setView('detail'); }}>
                  <div className="skill-card-header">
                    <div>
                      <span className="skill-card-name">{skill.name}</span>
                      <span className="skill-card-category">{skill.category}</span>
                    </div>
                    <span className="skill-card-pct">{skill.selfProficiency}%</span>
                  </div>
                  <div className="skill-progress-bar">
                    <div className="skill-progress-fill" style={{ width: `${skill.selfProficiency}%` }} />
                  </div>
                  <div className="skill-card-meta">
                    <span>{totalHours}h logged</span>
                    {total > 0 && <span>{done}/{total} topics</span>}
                    {skill.lastSession && <span>Last: {skill.lastSession}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DETAIL */}
        {view === 'detail' && activeSkill && (
          <div className="skill-detail">
            <div className="skill-detail-header">
              <div className="skill-detail-stats">
                <span>🕐 {Math.floor(activeSkill.totalMinutes / 60)}h {activeSkill.totalMinutes % 60}m</span>
                <span>📊 {activeSkill.totalSessions} sessions</span>
                <span>📅 {activeSkill.selfProficiency}% proficiency</span>
              </div>
            </div>

            {/* Log session */}
            <div className="log-session-row">
              <input
                type="number"
                placeholder="Minutes"
                value={logMin}
                onChange={e => setLogMin(e.target.value)}
                className="log-min-input"
              />
              <select
                value={logTopic}
                onChange={e => setLogTopic(e.target.value)}
                className="log-topic-select"
              >
                <option value="">All topics</option>
                {activeSkill.topics.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              <button className="btn-primary" onClick={handleLogSession} disabled={!logMin}>Log</button>
            </div>

            {/* Topics */}
            {activeSkill.topics.length > 0 && (
              <div className="topics-list">
                <p className="topics-label">Topics</p>
                {activeSkill.topics.map(t => (
                  <div key={t.name} className={`topic-item status-${t.status}`}>
                    <select
                      value={t.status}
                      onChange={e => handleTopicStatusChange(activeSkill.name, t.name, e.target.value)}
                      className="topic-status-select"
                    >
                      <option value="not_started">Not started</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done ✓</option>
                    </select>
                    <span className="topic-name">{t.name}</span>
                    {t.confidence > 0 && <span className="topic-confidence">{t.confidence}/10</span>}
                    {t.completedAt && <span className="topic-date">{t.completedAt}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Milestones */}
            {activeSkill.milestones.length > 0 && (
              <div className="milestones-list">
                <p className="topics-label">Milestones 🏆</p>
                {activeSkill.milestones.map((m, i) => (
                  <div key={i} className="milestone-item">
                    <span>🏆 {m.description}</span>
                    <span className="topic-date">{m.date}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-danger" style={{ marginTop: '16px', width: '100%' }} onClick={() => handleDelete(activeSkill.id)}>Delete Skill</button>
          </div>
        )}

        {/* ADD */}
        {view === 'add' && (
          <div className="skill-add-form">
            <label className="settings-label"><span>Skill Name</span>
              <input className="settings-input" value={newSkillName} onChange={e => setNewSkillName(e.target.value)} placeholder="e.g. Data Structures & Algorithms" />
            </label>
            <label className="settings-label"><span>Category</span>
              <input className="settings-input" value={newSkillCategory} onChange={e => setNewSkillCategory(e.target.value)} placeholder="e.g. FAANG Prep, Programming, Design" />
            </label>
            <label className="settings-label"><span>Topics (comma-separated, optional)</span>
              <input className="settings-input" value={newTopics} onChange={e => setNewTopics(e.target.value)} placeholder="Arrays, Linked Lists, Trees, Graphs..." />
            </label>
            <button className="btn-primary settings-save" onClick={handleAddSkill} disabled={!newSkillName.trim()}>Add Skill</button>
          </div>
        )}
      </div>
    </div>
  );
}

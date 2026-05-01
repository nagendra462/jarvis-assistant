// JARVIS Skills & Learning Tracker
// Track everything you're learning — topics, sessions, proficiency, next steps

import { getItem, setItem } from './store';

const SKILLS_KEY = 'jarvis_skills';

// ===== CRUD =====
export function getSkills() {
  return getItem(SKILLS_KEY, []);
}

export function saveSkills(skills) {
  setItem(SKILLS_KEY, skills);
}

export function addSkill(name, category = 'General', topics = []) {
  const skills = getSkills();
  if (skills.find(s => s.name.toLowerCase() === name.toLowerCase())) return null;
  const skill = {
    id: Date.now().toString(),
    name,
    category,
    selfProficiency: 0,
    startedAt: new Date().toISOString().slice(0, 10),
    topics: topics.map(t => ({
      name: t,
      status: 'not_started',     // 'not_started' | 'in_progress' | 'done'
      confidence: 0,              // 0-10
      startedAt: null,
      completedAt: null,
      lastReviewed: null,
    })),
    sessions: [],                 // [{ date, minutes, topicName, notes }]
    totalMinutes: 0,
    totalSessions: 0,
    lastSession: null,
    milestones: [],               // [{ date, description }]
    notes: '',
  };
  skills.push(skill);
  saveSkills(skills);
  return skill;
}

export function deleteSkill(id) {
  const skills = getSkills().filter(s => s.id !== id);
  saveSkills(skills);
}

// ===== Session Logging =====
export function logStudySession(skillName, minutes, topicName = null, notes = '') {
  const skills = getSkills();
  const skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) return null;

  const session = {
    date: new Date().toISOString().slice(0, 10),
    startedAt: new Date().toISOString(),
    minutes: parseInt(minutes) || 30,
    topicName,
    notes,
  };

  skill.sessions.push(session);
  skill.totalMinutes += session.minutes;
  skill.totalSessions += 1;
  skill.lastSession = session.date;

  // Update topic status
  if (topicName) {
    const topic = skill.topics.find(t => t.name.toLowerCase() === topicName.toLowerCase());
    if (topic && topic.status === 'not_started') {
      topic.status = 'in_progress';
      topic.startedAt = session.date;
    }
  }

  // Auto-compute proficiency (based on sessions + topic completion)
  skill.selfProficiency = computeProficiency(skill);

  // Check for milestones
  const milestoneHours = [1, 5, 10, 25, 50, 100];
  const totalHours = Math.floor(skill.totalMinutes / 60);
  for (const h of milestoneHours) {
    if (totalHours >= h && !skill.milestones.find(m => m.hours === h)) {
      skill.milestones.push({
        hours: h,
        date: session.date,
        description: `${h} hours logged in ${skill.name}`,
      });
    }
  }

  saveSkills(skills);
  return { skill, session, newMilestone: skill.milestones[skill.milestones.length - 1] };
}

// ===== Topic management =====
export function updateTopicStatus(skillName, topicName, status, confidence = null) {
  const skills = getSkills();
  const skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) return null;
  const topic = skill.topics.find(t => t.name.toLowerCase() === topicName.toLowerCase());
  if (!topic) return null;

  topic.status = status;
  if (confidence !== null) topic.confidence = confidence;
  if (status === 'done') topic.completedAt = new Date().toISOString().slice(0, 10);
  if (status === 'in_progress') topic.startedAt = topic.startedAt || new Date().toISOString().slice(0, 10);

  skill.selfProficiency = computeProficiency(skill);
  saveSkills(skills);
  return skill;
}

export function addTopicToSkill(skillName, topicName) {
  const skills = getSkills();
  const skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) return null;
  if (skill.topics.find(t => t.name.toLowerCase() === topicName.toLowerCase())) return skill;
  skill.topics.push({ name: topicName, status: 'not_started', confidence: 0, startedAt: null, completedAt: null });
  saveSkills(skills);
  return skill;
}

// ===== Smart recommendations =====
export function getNextStudyRecommendation(skillName = null) {
  const skills = getSkills();
  const targetSkills = skillName
    ? skills.filter(s => s.name.toLowerCase() === skillName.toLowerCase())
    : skills;

  if (targetSkills.length === 0) return null;

  // Find topics needing review (done > 14 days ago)
  const today = new Date().toISOString().slice(0, 10);
  for (const skill of targetSkills) {
    for (const topic of skill.topics) {
      if (topic.status === 'done' && topic.completedAt) {
        const daysSince = Math.floor((new Date(today) - new Date(topic.completedAt)) / 86400000);
        if (daysSince >= 14) {
          return { type: 'review', skill: skill.name, topic: topic.name, daysSince };
        }
      }
    }
  }

  // Find lowest-confidence in-progress topic
  let bestRec = null;
  let lowestConfidence = 11;
  for (const skill of targetSkills) {
    for (const topic of skill.topics) {
      if (topic.status === 'in_progress' && topic.confidence < lowestConfidence) {
        lowestConfidence = topic.confidence;
        bestRec = { type: 'continue', skill: skill.name, topic: topic.name, confidence: topic.confidence };
      }
    }
  }
  if (bestRec) return bestRec;

  // Find next not_started topic
  for (const skill of targetSkills) {
    const next = skill.topics.find(t => t.status === 'not_started');
    if (next) return { type: 'start', skill: skill.name, topic: next.name };
  }

  return null;
}

// ===== Spaced repetition checks =====
export function getTopicsNeedingReview() {
  const skills = getSkills();
  const today = new Date();
  const needsReview = [];
  for (const skill of skills) {
    for (const topic of skill.topics) {
      if (topic.status === 'done' && topic.completedAt) {
        const daysSince = Math.floor((today - new Date(topic.completedAt)) / 86400000);
        // Spaced repetition intervals: 1, 7, 14, 30 days
        if ([14, 30, 60].includes(daysSince) || (daysSince > 60 && daysSince % 30 === 0)) {
          needsReview.push({ skill: skill.name, topic: topic.name, daysSince });
        }
      }
    }
  }
  return needsReview;
}

// ===== Context for Gemini =====
export function getSkillsContext() {
  const skills = getSkills();
  if (skills.length === 0) return '';
  let ctx = '\n\n## Skills Being Tracked:\n';
  for (const skill of skills) {
    const totalHours = Math.floor(skill.totalMinutes / 60);
    const done = skill.topics.filter(t => t.status === 'done').length;
    const total = skill.topics.length;
    ctx += `**${skill.name}** (${skill.category}) — ${skill.selfProficiency}% proficiency | ${totalHours}h logged`;
    if (total > 0) ctx += ` | Topics: ${done}/${total} done`;
    if (skill.lastSession) ctx += ` | Last session: ${skill.lastSession}`;
    ctx += '\n';
    // Show in-progress topics
    const inProgress = skill.topics.filter(t => t.status === 'in_progress');
    if (inProgress.length > 0) ctx += `  Currently learning: ${inProgress.map(t => t.name).join(', ')}\n`;
    const notStarted = skill.topics.filter(t => t.status === 'not_started');
    if (notStarted.length > 0) ctx += `  Not started yet: ${notStarted.slice(0, 3).map(t => t.name).join(', ')}\n`;
  }
  return ctx;
}

function computeProficiency(skill) {
  const topicScore = skill.topics.length > 0
    ? (skill.topics.filter(t => t.status === 'done').length / skill.topics.length) * 60
    : 0;
  const sessionScore = Math.min(40, Math.floor(skill.totalMinutes / 60) * 0.8);
  return Math.min(100, Math.round(topicScore + sessionScore));
}

export function formatSkillsReport() {
  const skills = getSkills();
  if (skills.length === 0) return 'No skills being tracked yet, sir. Tell me what you\'re learning and I\'ll track it.';
  let report = '📚 **Skills Tracker**\n\n';
  for (const skill of skills) {
    const totalHours = Math.floor(skill.totalMinutes / 60);
    const done = skill.topics.filter(t => t.status === 'done').length;
    const total = skill.topics.length;
    const bar = '█'.repeat(Math.floor(skill.selfProficiency / 10)) + '░'.repeat(10 - Math.floor(skill.selfProficiency / 10));
    report += `**${skill.name}** [${bar}] ${skill.selfProficiency}%\n`;
    report += `  📊 ${totalHours}h logged | ${skill.totalSessions} sessions`;
    if (total > 0) report += ` | ${done}/${total} topics done`;
    if (skill.lastSession) report += ` | Last: ${skill.lastSession}`;
    report += '\n\n';
  }
  const rec = getNextStudyRecommendation();
  if (rec) {
    if (rec.type === 'review') report += `\n🔄 **Recommended review:** ${rec.topic} in ${rec.skill} (${rec.daysSince} days since completion)`;
    else if (rec.type === 'continue') report += `\n▶️ **Continue with:** ${rec.topic} in ${rec.skill}`;
    else if (rec.type === 'start') report += `\n🆕 **Start next:** ${rec.topic} in ${rec.skill}`;
  }
  return report;
}

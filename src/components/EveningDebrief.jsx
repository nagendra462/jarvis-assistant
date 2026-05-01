import React, { useState, useEffect, useRef } from 'react';
import { EVENING_STEPS, startEveningDebrief, answerStep } from '../utils/rituals.js';
import { getTodayJournal } from '../utils/journal.js';
import { speak } from '../utils/voice.js';

export default function EveningDebrief({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [todayMITs, setTodayMITs] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    async function init() {
      const journal = await getTodayJournal();
      const mits = journal?.morningRitual?.todayMITs || [];
      setTodayMITs(mits);
      const { question } = startEveningDebrief(mits);
      setCurrentQuestion(question);
      setTimeout(() => {
        speak(question.question.replace(/\*\*/g, ''), null, null);
        inputRef.current?.focus();
      }, 300);
    }
    init();
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, [step]);

  async function handleSubmit() {
    if (!answer.trim() || loading) return;
    setLoading(true);
    const result = await answerStep(answer.trim());
    setAnswer('');
    setLoading(false);
    if (!result) return;
    if (result.done) {
      setIsComplete(true);
      setSummary(result.summary);
      speak(result.summary.replace(/\*\*/g, '').replace(/[#\[\]🏆📌🙏]/g, ''), null, null);
    } else {
      setStep(s => s + 1);
      setCurrentQuestion(result.nextQuestion);
      setTimeout(() => speak(result.nextQuestion.question.replace(/\*\*/g, ''), null, null), 200);
    }
  }

  const totalSteps = EVENING_STEPS.length;
  const progress = (step / totalSteps) * 100;

  if (isComplete) {
    return (
      <div className="overlay">
        <div className="overlay-card ritual-card">
          <div className="ritual-complete-header">
            <span className="ritual-icon">🌙</span>
            <h2>Evening debrief complete</h2>
          </div>
          <div className="ritual-summary" dangerouslySetInnerHTML={{
            __html: summary.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
          }} />
          <button className="btn-primary ritual-close-btn" onClick={() => onComplete(summary)}>
            Rest well
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="overlay-card ritual-card">
        <div className="ritual-header">
          <span className="ritual-icon">🌙</span>
          <div className="ritual-title-area">
            <h2>Evening Debrief</h2>
            <span className="ritual-step-count">{step + 1} of {totalSteps}</span>
          </div>
          <button className="overlay-close" onClick={onSkip}>✕</button>
        </div>

        <div className="ritual-progress-bar">
          <div className="ritual-progress-fill evening" style={{ width: `${progress}%` }} />
        </div>

        {/* Show today's MITs on the first step */}
        {step === 0 && todayMITs.length > 0 && (
          <div className="ritual-mits-reminder">
            <p className="ritual-mits-label">Today's MITs:</p>
            {todayMITs.map((mit, i) => (
              <div key={i} className="ritual-mit-item">
                <span className="ritual-mit-num">{i + 1}</span>
                <span>{mit}</span>
              </div>
            ))}
          </div>
        )}

        {currentQuestion && (
          <div className="ritual-question-area">
            <p className="ritual-question" dangerouslySetInnerHTML={{
              __html: currentQuestion.question.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            }} />
            {currentQuestion.hint && <p className="ritual-hint">{currentQuestion.hint}</p>}
          </div>
        )}

        <div className="ritual-input-area">
          <textarea
            ref={inputRef}
            className="ritual-textarea"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={currentQuestion?.hint || 'Your answer...'}
            rows={3}
          />
          <button
            className="btn-primary ritual-next-btn"
            onClick={handleSubmit}
            disabled={!answer.trim() || loading}
          >
            {loading ? '...' : step === totalSteps - 1 ? 'Complete ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

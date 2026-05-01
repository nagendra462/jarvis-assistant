import React, { useState, useEffect, useRef } from 'react';
import { MORNING_STEPS, getRitualState, startMorningRitual, answerStep, getCurrentStep } from '../utils/rituals.js';
import { speak } from '../utils/voice.js';

export default function MorningRitual({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const { question } = startMorningRitual();
    setCurrentQuestion(question);
    setStep(0);
    setTimeout(() => {
      speak(question.question.replace(/\*\*/g, ''), null, null);
      inputRef.current?.focus();
    }, 300);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

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
      speak(result.summary.replace(/\*\*/g, '').replace(/[#\[\]]/g, ''), null, null);
    } else {
      setStep(s => s + 1);
      setCurrentQuestion(result.nextQuestion);
      setTimeout(() => {
        speak(result.nextQuestion.question.replace(/\*\*/g, ''), null, null);
      }, 200);
    }
  }

  const totalSteps = MORNING_STEPS.length;
  const progress = ((step) / totalSteps) * 100;

  if (isComplete) {
    return (
      <div className="overlay">
        <div className="overlay-card ritual-card">
          <div className="ritual-complete-header">
            <span className="ritual-icon">🌅</span>
            <h2>Morning ritual complete</h2>
          </div>
          <div className="ritual-summary" dangerouslySetInnerHTML={{
            __html: summary.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
          }} />
          <button className="btn-primary ritual-close-btn" onClick={() => onComplete(summary)}>
            Let's go, JARVIS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="overlay-card ritual-card">
        <div className="ritual-header">
          <span className="ritual-icon">🌅</span>
          <div className="ritual-title-area">
            <h2>Morning Check-in</h2>
            <span className="ritual-step-count">{step + 1} of {totalSteps}</span>
          </div>
          <button className="overlay-close" onClick={onSkip} title="Skip today">✕</button>
        </div>

        <div className="ritual-progress-bar">
          <div className="ritual-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {currentQuestion && (
          <div className="ritual-question-area">
            <p className="ritual-question" dangerouslySetInnerHTML={{
              __html: currentQuestion.question.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            }} />
            {currentQuestion.hint && <p className="ritual-hint">{currentQuestion.hint}</p>}
          </div>
        )}

        <div className="ritual-input-area">
          {currentQuestion?.type === 'number' ? (
            <div className="energy-selector">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  className={`energy-btn ${answer === String(n) ? 'selected' : ''}`}
                  onClick={() => setAnswer(String(n))}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              ref={inputRef}
              className="ritual-textarea"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder={currentQuestion?.hint || 'Your answer...'}
              rows={3}
            />
          )}
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

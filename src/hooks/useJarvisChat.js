import { useState, useCallback, useEffect, useRef } from 'react';
import { speak as jarvisSpeak, stopSpeaking } from '../utils/voice';

/**
 * useJarvisChat — Manages message state, chat history persistence,
 * scroll-to-bottom, and the speakResponse helper.
 */
export function useJarvisChat() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('jarvis_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [orbState, setOrbState] = useState('idle');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const toSave = messages.map(m => ({ ...m, streaming: false })).slice(-100);
    localStorage.setItem('jarvis_chat_history', JSON.stringify(toSave));
  }, [messages]);

  const addJarvisMessage = useCallback((text) => {
    setMessages(prev => [...prev, { sender: 'jarvis', text, id: Date.now() }]);
  }, []);

  const addUserMessage = useCallback((text) => {
    setMessages(prev => [...prev, { sender: 'user', text, id: Date.now() }]);
  }, []);

  const speakResponse = useCallback((text) => {
    jarvisSpeak(
      text,
      () => setOrbState('speaking'),
      () => setOrbState('idle'),
    );
  }, []);

  const stopResponse = useCallback(() => {
    stopSpeaking();
    setOrbState('idle');
  }, []);

  return {
    messages, setMessages,
    orbState, setOrbState,
    isTyping, setIsTyping,
    chatEndRef,
    addJarvisMessage, addUserMessage,
    speakResponse, stopResponse,
  };
}

'use client';
import { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '@/api/aiApi';
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import styles from './AiChatbot.module.css';

const SUGGESTIONS = [
  'How many leaves do I have?',
  "What's today's lunch menu?",
  'Show my attendance this week',
  'Any pending announcements?',
];

function Message({ msg }) {
  const isBot = msg.role === 'assistant';
  return (
    <div className={`${styles.message} ${!isBot ? styles.userMessage : ''}`}>
      <div className={`${styles.messageAvatar} ${isBot ? styles.botAvatar : styles.userAvatar}`}>
        {isBot ? <Bot size={14} color="#fff" /> : <User size={14} color="#64748b" />}
      </div>
      <div className={`${styles.bubble} ${isBot ? styles.botBubble : styles.userBubble}`}>
        {msg.content}
      </div>
    </div>
  );
}

export default function AiChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your HR Assistant 👋\nAsk me anything about your leaves, attendance, today\'s menu, or company updates!' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res = await sendChatMessage(msg, history);
      const botMsg = { role: 'assistant', content: res.data.reply };
      setMessages(prev => [...prev, botMsg]);
      if (!open) setUnread(u => u + 1);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t process that. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={styles.floatingButton}
        title="AI Assistant"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && unread > 0 && (
          <span className={styles.unread}>{unread}</span>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className={styles.window}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIcon}>
              <Sparkles size={16} color="#fff" />
            </div>
            <div>
              <p className={styles.headerTitle}>HR Assistant</p>
              <p className={styles.headerSubtitle}>Powered by AI · Always here to help</p>
            </div>
            <button onClick={() => setOpen(false)} className={styles.closeButton}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className={styles.messages}>
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {loading && (
              <div className={styles.loadingMessage}>
                <div className={`${styles.messageAvatar} ${styles.botAvatar}`}>
                  <Bot size={14} color="#fff" />
                </div>
                <div className={styles.thinking}>
                  <Loader2 size={14} color="#6366f1" className={styles.spinner} />
                  <span className={styles.thinkingText}>Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions (only when few messages) */}
          {messages.length <= 2 && (
            <div className={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className={styles.suggestion}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask anything…"
              className={styles.input}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className={styles.sendButton}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

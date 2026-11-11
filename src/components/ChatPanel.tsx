import { useEffect, useRef, useState } from 'react';
import { hasKey, materialFrom, tutorReply } from '../lib/ai';
import { getState, updateDeck, type Deck } from '../lib/store';
import { IconClose, IconRefresh, IconSend } from './Icons';
import { Markdown } from './Markdown';
import { NoKeyNotice } from './NoKey';

const SUGGESTIONS = ['Fasse dieses Deck für mich zusammen.', 'Stell mir eine prüfungsähnliche Frage.', 'Wie lerne ich das am besten?'];

export function TutorFace({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <path d="M19 9 C21 4 26 2 29 2.5 C27 5 26 8 26 11z" fill="#2489bf" /><circle cx="20" cy="22" r="15" fill="#45b4e3" /><ellipse cx="20" cy="28" rx="8.5" ry="7" fill="#e3f6fd" /><ellipse cx="20" cy="26" rx="5" ry="3" fill="#9fdcf4" /><path d="M17 26.2q3 2.6 6 0" stroke="#0b2540" strokeWidth="1.2" fill="none" strokeLinecap="round" /><circle cx="14" cy="19" r="4.6" fill="#fff" /><circle cx="26" cy="19" r="4.6" fill="#fff" /><circle cx="14.4" cy="19.4" r="2.5" fill="#0b2540" /><circle cx="25.6" cy="19.4" r="2.5" fill="#0b2540" /><circle cx="15.3" cy="18.4" r=".9" fill="#fff" /><circle cx="26.5" cy="18.4" r=".9" fill="#fff" /><circle cx="10" cy="24.5" r="1.8" fill="#f6a5c0" opacity={0.7} /><circle cx="30" cy="24.5" r="1.8" fill="#f6a5c0" opacity={0.7} />
    </svg>
  );
}

export function ChatPanel({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = deck.chat;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    setError('');
    const history = [...deck.chat, { role: 'user' as const, content: t }];
    updateDeck(deck.id, { chat: history });
    setBusy(true);
    try {
      const fresh = getState().data.decks.find((d) => d.id === deck.id) ?? deck;
      const reply = await tutorReply(fresh.name, materialFrom(fresh.source, fresh.cards, 16000), history);
      updateDeck(deck.id, (d) => ({ chat: [...d.chat, { role: 'assistant', content: reply.trim() || '…' }] }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = hasKey('chat');

  return (
    <aside className="chat-panel" aria-label="KI-Tutor">
      <div className="chat-head">
        <b>Tutor Pip</b>
        <span className="grow" />
        {msgs.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => updateDeck(deck.id, { chat: [] })}>
            <IconRefresh size={14} /> Neuer Chat
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Tutor schließen" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <div className="chat-scroll">
        {!ready ? (
          <NoKeyNotice compact />
        ) : msgs.length === 0 ? (
          <div className="chat-empty">
            <TutorFace />
            <p>Hallo! Wobei kann ich dir bei „{deck.name}“ helfen?</p>
            {SUGGESTIONS.map((s) => (
              <button type="button" key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
            </div>
          ))
        )}
        {busy && <div className="msg assistant typing">Pip denkt nach …</div>}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          rows={2}
          value={input}
          disabled={!ready}
          placeholder="Was möchtest du wissen?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button type="submit" className="send" aria-label="Senden" disabled={!input.trim() || busy || !ready}>
          <IconSend size={16} />
        </button>
      </form>
    </aside>
  );
}

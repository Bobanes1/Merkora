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
      <circle cx="20" cy="22" r="15" fill="#0f8552" />
      <circle cx="20" cy="27" r="8" fill="#62bc8b" />
      <circle cx="14" cy="19" r="5.5" fill="#fff" />
      <circle cx="26" cy="19" r="5.5" fill="#fff" />
      <circle cx="14.5" cy="19.5" r="2.4" fill="#002c17" />
      <circle cx="25.5" cy="19.5" r="2.4" fill="#002c17" />
      <path d="M18 24h4l-2 3z" fill="#f2b84b" />
      <path d="M8 10l5 4M32 10l-5 4" stroke="#0f8552" strokeWidth="3" strokeLinecap="round" />
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

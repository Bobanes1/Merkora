import { useEffect, useRef, useState } from 'react';
import { CostHint } from './CostHint';
import { estimate } from '../lib/costs';
import { hasKey, materialFrom, tutorReply } from '../lib/ai';
import { getState, updateDeck, type Deck } from '../lib/store';
import { IconClose, IconRefresh, IconSend } from './Icons';
import { FinnFace, Mascot, type Mood } from './Mascot';
import { Markdown } from './Markdown';
import { NoKeyNotice } from './NoKey';

const SUGGESTIONS = ['Fasse dieses Deck für mich zusammen.', 'Stell mir eine prüfungsähnliche Frage.', 'Wie lerne ich das am besten?'];

/** Finn's head – still, small (kept under the old name for other places). */
export const TutorFace = ({ size = 64 }: { size?: number }) => <FinnFace size={size} />;

export function ChatPanel({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = deck.chat;
  // Finn's mood follows the conversation: thinking while the answer comes, happy when it is there, sad on errors
  const [mood, setMood] = useState<Mood>('idle');
  const [pulse, setPulse] = useState(0);
  const calm = useRef<number>();
  const feel = (m: Mood, ms?: number) => {
    window.clearTimeout(calm.current);
    setMood(m);
    setPulse((p) => p + 1);
    if (ms) calm.current = window.setTimeout(() => setMood('idle'), ms);
  };
  useEffect(() => () => window.clearTimeout(calm.current), []);

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
    feel('think');
    try {
      const fresh = getState().data.decks.find((d) => d.id === deck.id) ?? deck;
      const reply = await tutorReply(fresh.name, materialFrom(fresh.source, fresh.cards, 16000), history);
      updateDeck(deck.id, (d) => ({ chat: [...d.chat, { role: 'assistant', content: reply.trim() || '…' }] }));
      feel('happy', 2500);
    } catch (e) {
      setError((e as Error).message);
      feel('sad', 4000);
    } finally {
      setBusy(false);
    }
  };

  const ready = hasKey('chat');

  return (
    <aside className="chat-panel" aria-label="KI-Tutor">
      <div className="chat-head">
        <button type="button" className="chat-mascot" aria-label="Finn" title="Hallo, ich bin Finn – ein Kollege von Pip!" onClick={() => !busy && feel('cheer', 2200)}>
          <Mascot who="finn" mood={mood} pulse={pulse} size={38} />
        </button>
        <b>Tutor Finn</b>
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
            <Mascot who="finn" mood="wave" size={104} />
            <p>Hallo! Wobei kann ich dir bei „{deck.name}“ helfen?</p>
            {SUGGESTIONS.map((s) => (
              <button type="button" key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : (
          msgs.map((m, i) =>
            m.role === 'assistant' ? (
              <div key={i} className="msg-row">
                <FinnFace size={26} />
                <div className={`msg assistant${i === msgs.length - 1 ? ' msg-in' : ''}`}>
                  <Markdown text={m.content} />
                </div>
              </div>
            ) : (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
              </div>
            ),
          )
        )}
        {busy && (
          <div className="msg-row" role="status" aria-label="Finn denkt nach">
            <FinnFace size={26} />
            <div className="msg assistant typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
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
      <CostHint
        className="chat-cost"
        label="Pro Frage"
        est={estimate.chat(materialFrom(deck.source, deck.cards, 16000).length, msgs.slice(-12).reduce((n, m) => n + m.content.length, 0) + input.length)}
      />
    </aside>
  );
}

import { useEffect, useRef, useState } from 'react';
import { CostHint } from './CostHint';
import { estimate } from '../lib/costs';
import { hasKey, materialFrom, tutorReply } from '../lib/ai';
import { addCards, getState, updateDeck, type Deck } from '../lib/store';
import { IconCheck, IconClose, IconCopy, IconPlus, IconRefresh, IconSend } from './Icons';
import { Mascot, PipFace } from './Mascot';
import { Markdown } from './Markdown';
import { NoKeyNotice } from './NoKey';
import { SpeakButton } from './SpeakButton';
import { markdownSpeech } from '../lib/speechText';

const SUGGESTIONS = [
  'Fasse dieses Deck für mich zusammen.',
  'Stell mir eine prüfungsähnliche Frage.',
  'Wie lerne ich das am besten?',
];
const QUICK_FOLLOWUPS = [
  { label: 'Einfacher erklären', prompt: 'Erklär mir das noch einmal deutlich einfacher mit einem Alltagsbeispiel.' },
  { label: 'Eselsbrücke', prompt: 'Gib mir eine gute Eselsbrücke oder einen kurzen Merksatz dazu.' },
  { label: 'Quizfrage', prompt: 'Stell mir dazu eine kurze Verständnisfrage, um mich abzufragen.' },
];

/** Pip's head – still, small. */
export const TutorFace = ({ size = 64 }: { size?: number }) => <PipFace size={size} />;

export function ChatPanel({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<Record<number, boolean>>({});
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

  const copyMsg = (idx: number, content: string) => {
    void navigator.clipboard?.writeText(content).catch(() => undefined);
    setCopiedIdx(idx);
    window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
  };

  const saveAsCard = (idx: number, content: string) => {
    // Use the immediately preceding user message as the card front (fallback: deck name)
    let front = deck.name;
    for (let j = idx - 1; j >= 0; j--) {
      if (msgs[j].role === 'user') {
        front = msgs[j].content.trim();
        break;
      }
    }
    const cleanBack = content.replace(/^#+\s*/gm, '').trim();
    if (!cleanBack) return;
    addCards(deck.id, [{ front, back: cleanBack, tags: ['Tutor'] }]);
    setSavedIdx((s) => ({ ...s, [idx]: true }));
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
            <Mascot who="pip" mood="wave" size={104} />
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
                <PipFace size={26} />
                <div className={`msg assistant${i === msgs.length - 1 ? ' msg-in' : ''}`}>
                  <Markdown text={m.content} />
                  <div className="chat-msg-actions">
                    <button
                      type="button"
                      className="chat-act-btn"
                      title="Antwort kopieren"
                      onClick={() => copyMsg(i, m.content)}
                    >
                      {copiedIdx === i ? <IconCheck size={12} /> : <IconCopy size={12} />} {copiedIdx === i ? 'Kopiert' : 'Kopieren'}
                    </button>
                    <SpeakButton text={markdownSpeech(m.content)} label="Vorlesen" className="chat-act-btn" withText />
                    <button
                      type="button"
                      className="chat-act-btn"
                      disabled={!!savedIdx[i]}
                      title="Frage & Antwort als neue Karteikarte ins Deck speichern"
                      onClick={() => saveAsCard(i, m.content)}
                    >
                      {savedIdx[i] ? <IconCheck size={12} /> : <IconPlus size={12} />} {savedIdx[i] ? 'Als Karte gespeichert' : 'Als Karteikarte'}
                    </button>
                  </div>
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
          <div className="msg-row" role="status" aria-label="Pip denkt nach">
            <PipFace size={26} />
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
      {ready && msgs.length > 0 && !busy && (
        <div className="chat-quickbar">
          {QUICK_FOLLOWUPS.map((q) => (
            <button key={q.label} type="button" className="chip" onClick={() => send(q.prompt)}>
              {q.label}
            </button>
          ))}
        </div>
      )}
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

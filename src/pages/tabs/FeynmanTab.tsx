/**
 * Feynman Mode ("Erklär es Pip"):
 * - Extracts 4–8 key concepts from the deck 100% locally (0 tokens).
 * - Learner explains the topic in own words (via microphone or keyboard).
 * - Pip listens, checks off covered concepts live, asks 1 focused follow-up per turn using compact context (~5k chars via `purpose: 'chat'`),
 *   and offers 1-click gap flashcards for uncovered points.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CostHint } from '../../components/CostHint';
import { IconCheck, IconPlus, IconRefresh, IconSend, IconSparkle } from '../../components/Icons';
import { Mascot, PipFace } from '../../components/Mascot';
import { NoKeyNotice } from '../../components/NoKey';
import { estimate } from '../../lib/costs';
import {
  buildFeynmanContext,
  extractKeyConcepts,
  feynmanTurn,
  type FeynmanAssessment,
  type FeynmanMessage,
} from '../../lib/feynman';
import { hasKey } from '../../lib/ai';
import { speak, stopSpeaking } from '../../lib/speech';
import { detectSpeechLang } from '../../lib/speechLang';
import { addCards, type Deck } from '../../lib/store';
import { useVoiceInput } from '../../lib/voiceInput';

export default function FeynmanTab({ deck }: { deck: Deck }) {
  const ready = hasKey('chat');
  const concepts = useMemo(() => extractKeyConcepts(deck), [deck]);
  const ctxChars = useMemo(() => buildFeynmanContext(deck, concepts).length, [deck, concepts]);
  const lang = useMemo(() => detectSpeechLang(deck.name, 'de'), [deck.name]);

  const [messages, setMessages] = useState<FeynmanMessage[]>([]);
  const [assessment, setAssessment] = useState<FeynmanAssessment | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [speakPip, setSpeakPip] = useState(true);
  const [savedGaps, setSavedGaps] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceInput({
    lang,
    continuous: false,
    onFinal: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy]);

  useEffect(() => () => stopSpeaking(), [deck.id]);

  const coveredSet = useMemo(
    () => new Set((assessment?.covered ?? []).map((c) => c.toLowerCase())),
    [assessment?.covered],
  );

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy || !ready) return;
    voice.stop();
    stopSpeaking();
    setInput('');
    setError('');
    setSavedGaps(false);

    const nextHistory: FeynmanMessage[] = [...messages, { role: 'user', text }];
    setMessages(nextHistory);
    setBusy(true);
    try {
      const res = await feynmanTurn(deck, concepts, nextHistory, assessment?.covered ?? []);
      setAssessment(res);
      setMessages([...nextHistory, { role: 'assistant', text: res.reply }]);
      if (speakPip) speak(res.reply);
    } catch (e) {
      setError((e as Error).message || 'Antwort fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const resetSession = () => {
    stopSpeaking();
    voice.stop();
    setMessages([]);
    setAssessment(null);
    setInput('');
    setError('');
    setSavedGaps(false);
  };

  const saveGapCards = () => {
    const cards = assessment?.gapCards ?? [];
    if (!cards.length) return;
    addCards(
      deck.id,
      cards.map((c) => ({ front: c.front, back: c.back, tags: ['Feynman'] })),
    );
    setSavedGaps(true);
  };

  const score = assessment?.score ?? 0;

  return (
    <div className="panel feynman-panel">
      {/* Compact Header with Pip & Live Score */}
      <div className="feynman-head">
        <Mascot
          who="pip"
          mood={busy ? 'think' : assessment?.done ? 'celebrate' : messages.length ? 'happy' : 'wave'}
          size={64}
        />
        <div className="feynman-head-info">
          <b>Erklär es Pip · Feynman-Methode</b>
          <p className="muted small">
            Erklär „{deck.name}“ frei in eigenen Worten. Pip hakt gezielt bei Lücken nach, bis das ganze Thema sitzt.
          </p>
        </div>
        <span className="grow" />
        <label className="switch small">
          <input type="checkbox" checked={speakPip} onChange={(e) => setSpeakPip(e.target.checked)} />
          <span>Pip spricht</span>
        </label>
        {messages.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={resetSession}>
            <IconRefresh size={14} /> Neu starten
          </button>
        )}
      </div>

      {/* Live Concept Checklist (extracted 100% offline) */}
      <div className="feynman-concepts">
        <div className="row-gap between">
          <span className="small muted">Schlüsselkonzepte ({assessment?.covered.length ?? 0} / {concepts.length})</span>
          <b className="small">{score} % verstanden</b>
        </div>
        <span className="bar">
          <i style={{ width: `${score}%` }} />
        </span>
        <div className="feynman-pills">
          {concepts.map((c) => {
            const ok = coveredSet.has(c.toLowerCase());
            return (
              <span key={c} className={`feynman-pill${ok ? ' done' : ''}`}>
                {ok && <IconCheck size={12} />} {c}
              </span>
            );
          })}
        </div>
      </div>

      {!ready ? (
        <NoKeyNotice compact />
      ) : (
        <>
          {/* Dialogue Stream */}
          <div className="feynman-chat">
            {messages.length === 0 ? (
              <div className="feynman-intro muted small">
                <p>
                  <b>So geht’s:</b> Stell dir vor, du erklärst dieses Thema einem Freund ohne Fachchinesisch – per Mikrofon oder Tastatur.
                  Pip hört zu, hakt bei Unklarheiten nach und zeigt dir am Ende genau, was noch gefehlt hat.
                </p>
                <CostHint label="ca. für 5 Runden (Chat-Modell)" est={estimate.feynman(ctxChars, 5)} />
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === 'assistant' ? (
                  <div key={i} className="msg-row">
                    <PipFace size={26} />
                    <div className="msg assistant">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="msg user">
                    {m.text}
                  </div>
                ),
              )
            )}
            {busy && (
              <div className="msg-row">
                <PipFace size={26} />
                <div className="msg assistant typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Misconceptions & Gap Cards */}
          {assessment && assessment.misconceptions.length > 0 && (
            <div className="form-warn small">
              <b>Kleine Korrektur:</b> {assessment.misconceptions.join(' · ')}
            </div>
          )}

          {assessment && assessment.gapCards.length > 0 && (
            <div className="feynman-gaps">
              <div className="row-gap between">
                <span className="small">
                  <IconSparkle size={13} /> <b>{assessment.gapCards.length} Lücken-Karten vorgeschlagen</b>
                </span>
                {savedGaps ? (
                  <span className="pill-ok small">Im Deck gespeichert</span>
                ) : (
                  <button type="button" className="btn outline sm" onClick={saveGapCards}>
                    <IconPlus size={13} /> Ins Deck übernehmen
                  </button>
                )}
              </div>
            </div>
          )}

          {error && <p className="form-error small">{error}</p>}
          {voice.error && <p className="form-error small">{voice.error}</p>}

          {/* Input Bar with Mic + Text */}
          <form
            className="feynman-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {voice.supported && (
              <button
                type="button"
                className={`btn ${voice.listening ? 'danger' : 'outline'} sm`}
                title={voice.listening ? 'Aufnahme stoppen' : 'Per Mikrofon erklären'}
                onClick={() => voice.toggle()}
              >
                {voice.listening ? '⏹' : '🎙'}
              </button>
            )}
            <textarea
              className="input"
              rows={2}
              placeholder={voice.listening ? voice.interim || 'Ich höre zu …' : 'Erklär das Thema in eigenen Worten …'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="submit" className="btn primary" disabled={!input.trim() || busy} aria-label="Senden">
              <IconSend size={15} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

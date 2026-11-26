/**
 * Hands-Free Audio Study Mode ("Audio-Modus"):
 * - Reads card front aloud via Piper Neural-TTS (or OS voice fallback).
 * - Listens via Web Speech API (or clean keyboard fallback if unsupported).
 * - DEFAULT = 0 API tokens: local keyword/stem matching (`localVoiceMatch`) + voice commands ("Nochmal / Schwer / Gut / Einfach").
 * - Optional opt-in toggle for AI grading of the single current card (~250 tokens).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gradeAnswer, hasKey } from '../lib/ai';
import { htmlToText } from '../lib/content';
import { localVoiceMatch, type LocalVoiceResult } from '../lib/interference';
import { countAnswerTime } from '../lib/pomodoro';
import { speak, stopSpeaking } from '../lib/speech';
import { detectSpeechLang } from '../lib/speechLang';
import { htmlSpeech } from '../lib/speechText';
import { RATINGS, type Rating } from '../lib/srs';
import { addXp, logReview, reviewCard, type Deck } from '../lib/store';
import { parseVoiceCommand, useVoiceInput } from '../lib/voiceInput';
import { IconClose, IconPlay, IconRefresh, IconSparkle } from './Icons';
import { Mascot } from './Mascot';

export function VoiceStudyMode({
  deck,
  cardIds,
  mode,
  onClose,
}: {
  deck: Deck;
  cardIds: string[];
  mode: 'due' | 'all';
  onClose: () => void;
}) {
  const [queue, setQueue] = useState<string[]>(cardIds);
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState<'question' | 'answer'>('question');
  const [spoken, setSpoken] = useState('');
  const [typed, setTyped] = useState('');
  const [localRes, setLocalRes] = useState<LocalVoiceResult | null>(null);
  const [aiGrade, setAiGrade] = useState<{ score: number; verdict: string; feedback: string } | null>(null);
  const [useAiCheck, setUseAiCheck] = useState(false);
  const [autoListen, setAutoListen] = useState(true);
  const [busyAi, setBusyAi] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const card = useMemo(() => deck.cards.find((c) => c.id === queue[0]), [deck.cards, queue]);
  const frontText = card ? (card.html ? htmlSpeech(card.front) : card.front) : '';
  const backText = card ? (card.html ? htmlSpeech(card.back) : card.back) : '';
  const lang = useMemo(() => detectSpeechLang(frontText || deck.name, 'de'), [frontText, deck.name]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cardRef = useRef(card);
  cardRef.current = card;

  const rateCard = useCallback(
    (r: Rating) => {
      const c = cardRef.current;
      if (!c) return;
      stopSpeaking();
      const scheduled = mode === 'due' || c.srs.due <= Date.now();
      if (scheduled) reviewCard(deck.id, c.id, r);
      else logReview(deck.id, c.id, r);
      addXp(r === 1 ? 2 : r === 2 ? 5 : r === 3 ? 8 : 10);
      countAnswerTime();
      setQueue((q) => (r === 1 ? [...q.slice(1), q[0]] : q.slice(1)));
      if (r !== 1) setDone((n) => n + 1);
      setPhase('question');
      setSpoken('');
      setTyped('');
      setLocalRes(null);
      setAiGrade(null);
    },
    [deck.id, mode],
  );

  const evaluateAnswer = useCallback(
    async (answerText: string) => {
      const c = cardRef.current;
      if (!c) return;
      const cleanAns = answerText.trim();
      setSpoken(cleanAns);
      const expected = c.html ? htmlToText(c.back) : c.back;
      const local = localVoiceMatch(cleanAns, expected);
      setLocalRes(local);
      setPhase('answer');

      if (useAiCheck && hasKey('chat') && cleanAns) {
        setBusyAi(true);
        try {
          const g = await gradeAnswer(c.html ? htmlToText(c.front) : c.front, expected, cleanAns);
          setAiGrade(g);
          setSpeaking(true);
          speak(`${g.verdict}. ${g.feedback}`, () => setSpeaking(false));
        } catch {
          setSpeaking(true);
          speak(backText, () => setSpeaking(false));
        } finally {
          setBusyAi(false);
        }
      } else {
        setSpeaking(true);
        const intro =
          local.verdict === 'strong'
            ? 'Super getroffen! Die Lösung lautet: '
            : local.verdict === 'partial'
              ? 'Teilweise richtig. Vollständig lautet es: '
              : 'Lösung: ';
        speak(cleanAns ? intro + backText : backText, () => setSpeaking(false));
      }
    },
    [backText, useAiCheck],
  );

  const voice = useVoiceInput({
    lang,
    continuous: false,
    onFinal: (text) => {
      const cmd = parseVoiceCommand(text);
      if (cmd?.type === 'stop') {
        stopSpeaking();
        onClose();
        return;
      }
      if (cmd?.type === 'repeat') {
        setSpeaking(true);
        speak(phaseRef.current === 'question' ? frontText : backText, () => setSpeaking(false));
        return;
      }
      if (phaseRef.current === 'answer' && cmd?.type === 'rate') {
        rateCard(cmd.rating);
        return;
      }
      if (phaseRef.current === 'question') {
        if (cmd?.type === 'reveal') {
          void evaluateAnswer('');
        } else {
          void evaluateAnswer(text);
        }
      }
    },
  });

  // Auto-read each new question aloud, then optionally start listening hands-free
  useEffect(() => {
    if (!card || phase !== 'question') return;
    setSpeaking(true);
    speak(frontText, () => {
      setSpeaking(false);
      if (autoListen && voice.supported) {
        window.setTimeout(() => voice.start(), 260);
      }
    });
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, phase]);

  // Keyboard shortcuts (Space to reveal, 1-4 to rate, Esc to close)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'Escape') {
        stopSpeaking();
        onClose();
      } else if (e.key === ' ' && phase === 'question') {
        e.preventDefault();
        void evaluateAnswer(typed);
      } else if (phase === 'answer' && ['1', '2', '3', '4'].includes(e.key)) {
        rateCard(Number(e.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, typed, evaluateAnswer, rateCard, onClose]);

  useEffect(() => () => stopSpeaking(), []);

  if (!card) {
    return (
      <div className="voice-stage panel">
        <div className="voice-top">
          <b>Audio-Modus · {deck.name}</b>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        <div className="empty">
          <Mascot who="pip" mood="cheer" size={88} />
          <b>Audio-Runde geschafft!</b>
          <p className="muted">
            {done} {done === 1 ? 'Karte' : 'Karten'} freihändig geübt.
          </p>
          <button type="button" className="btn primary" onClick={onClose}>
            Zurück zum Deck
          </button>
        </div>
      </div>
    );
  }

  const suggested = aiGrade?.score ?? localRes?.suggestedRating;

  return (
    <div className="voice-stage panel">
      <div className="voice-top">
        <div>
          <b>Audio-Modus</b>
          <span className="muted small" style={{ marginLeft: 8 }}>
            {done} / {done + queue.length}
          </span>
        </div>
        <span className="grow" />
        {voice.supported && (
          <label className="switch small">
            <input type="checkbox" checked={autoListen} onChange={(e) => setAutoListen(e.target.checked)} />
            <span>Auto-Mikro</span>
          </label>
        )}
        {hasKey('chat') && (
          <label className="switch small" title="Standardmäßig 0 Tokens (lokaler Abgleich). Optional pro Karte per KI bewerten (~250 Tokens).">
            <input type="checkbox" checked={useAiCheck} onChange={(e) => setUseAiCheck(e.target.checked)} />
            <span>KI-Check</span>
          </label>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Audio-Modus beenden"
          onClick={() => {
            stopSpeaking();
            voice.stop();
            onClose();
          }}
        >
          <IconClose />
        </button>
      </div>

      <span className="bar session-bar">
        <i style={{ width: `${(done / Math.max(1, done + queue.length)) * 100}%` }} />
      </span>

      <div className="voice-hero">
        <div className={`voice-orb${voice.listening ? ' listening' : speaking ? ' speaking' : ''}`}>
          <Mascot
            who="pip"
            mood={voice.listening ? 'think' : phase === 'answer' && (suggested ?? 3) >= 3 ? 'happy' : 'idle'}
            size={74}
          />
        </div>
        <div className="voice-status small muted">
          {voice.listening
            ? voice.interim || 'Ich höre zu – sprich deine Antwort …'
            : speaking
              ? 'Pip liest vor …'
              : phase === 'question'
                ? 'Bereit für deine Antwort (Mikrofon oder tippen)'
                : 'Sag „Nochmal / Schwer / Gut / Einfach“ oder tippe 1–4'}
        </div>
      </div>

      <div className="voice-card">
        <div className="row-gap between">
          <small className="muted">FRAGE</small>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setSpeaking(true);
              speak(frontText, () => setSpeaking(false));
            }}
          >
            <IconRefresh size={13} /> Nochmal vorlesen
          </button>
        </div>
        <p className="voice-q">{frontText}</p>

        {spoken && (
          <div className="voice-spoken">
            <small className="muted">Deine Antwort:</small> <span>„{spoken}“</span>
          </div>
        )}

        {phase === 'answer' && (
          <>
            <hr />
            <small className="muted">LÖSUNG</small>
            <p className="voice-a">{backText}</p>
            {busyAi ? (
              <p className="muted small">KI prüft deine Antwort …</p>
            ) : aiGrade ? (
              <div className={`grade g${aiGrade.score}`}>
                <b>{aiGrade.verdict}</b>
                <p>{aiGrade.feedback}</p>
              </div>
            ) : localRes && spoken ? (
              <div className={`voice-local-badge v-${localRes.verdict}`}>
                <b>{localRes.percent} % Schlüsselbegriffe getroffen</b>
                <span className="muted small"> · Lokal geprüft (0 Tokens)</span>
                {localRes.missedTerms.length > 0 && (
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    Noch offen: {localRes.missedTerms.join(', ')}
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {voice.error && <p className="form-error small">{voice.error}</p>}

      {phase === 'question' ? (
        <div className="voice-controls">
          {voice.supported && (
            <button
              type="button"
              className={`btn ${voice.listening ? 'danger' : 'primary'}`}
              onClick={() => {
                stopSpeaking();
                voice.toggle();
              }}
            >
              {voice.listening ? '⏹ Stopp' : '🎙 Antwort sprechen'}
            </button>
          )}
          <div className="voice-type-row">
            <input
              className="input"
              placeholder={voice.supported ? 'Oder kurz eintippen …' : 'Antwort eintippen …'}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && typed.trim()) void evaluateAnswer(typed);
              }}
            />
            <button type="button" className="btn outline" onClick={() => void evaluateAnswer(typed)}>
              <IconPlay size={14} /> Prüfen
            </button>
          </div>
        </div>
      ) : (
        <div className="voice-controls">
          <div className="rate-row">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`rate ${r.cls}${suggested === r.value ? ' suggested' : ''}`}
                onClick={() => rateCard(r.value)}
              >
                <b>{r.label}</b>
                <small>Taste {r.key}</small>
              </button>
            ))}
          </div>
          {voice.supported && (
            <div className="row-gap center">
              <button type="button" className="btn ghost sm" onClick={() => voice.toggle()}>
                {voice.listening ? '🎙 Höre auf Bewertung …' : '🎙 Bewertung sprechen'}
              </button>
              {useAiCheck && (
                <span className="muted small">
                  <IconSparkle size={12} /> KI-Check aktiv
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

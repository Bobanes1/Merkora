import { useEffect, useRef, useState } from 'react';
import { IconDownload, IconPause, IconPlay, IconSparkle, IconStop } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { NoKeyNotice } from '../../components/NoKey';
import { aiConfig, openAiSpeech } from '../../lib/ai';
import { startJob } from '../../lib/jobs';
import { getState, useStore, type Deck, type PodcastLine } from '../../lib/store';
import { download, slugify } from '../../lib/util';
import { useAiReady } from './SummaryTab';

const NAMES = { A: 'Lena', B: 'Tom' };

function browserVoices() {
  const all = window.speechSynthesis?.getVoices() ?? [];
  const de = all.filter((v) => v.lang.toLowerCase().startsWith('de'));
  const pool = de.length ? de : all;
  return { A: pool[0], B: pool[1] ?? pool[0] };
}

export default function PodcastTab({ deck }: { deck: Deck }) {
  const ready = useAiReady();
  const provider = useStore((s) => s.data.settings.provider);
  const [minutes, setMinutes] = useState(4);
  const [exporting, setExporting] = useState(false);
  const job = useJob(deck.id, 'podcast');
  const busy = isActive(job) ? 'script' : exporting ? 'export' : '';
  const [error, setError] = useState('');
  const [line, setLine] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const stopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<Map<number, Promise<Blob | null>>>(new Map());
  const script = deck.podcast;
  const useOpenAi = provider === 'openai' && !!getState().apiKey;
  const hasMaterial = deck.source.trim() || deck.cards.length;

  useEffect(
    () => () => {
      stopRef.current = true;
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  useEffect(() => {
    cache.current.clear();
  }, [script]);

  const run = () => {
    stop();
    setError('');
    startJob('podcast', deck, { minutes });
  };

  const speechFor = (i: number, lines: PodcastLine[]) => {
    if (!cache.current.has(i)) {
      const { settings } = getState().data;
      const l = lines[i];
      cache.current.set(i, openAiSpeech(l.text, l.speaker === 'A' ? settings.ttsVoiceA : settings.ttsVoiceB));
    }
    return cache.current.get(i)!;
  };

  const playFrom = async (start: number) => {
    if (!script) return;
    stopRef.current = false;
    setPlaying(true);
    setError('');
    try {
      for (let i = start; i < script.length; i++) {
        if (stopRef.current) return;
        setLine(i);
        if (useOpenAi) {
          const blob = await speechFor(i, script);
          if (i + 1 < script.length) void speechFor(i + 1, script).catch(() => undefined);
          if (stopRef.current || !blob) return;
          const url = URL.createObjectURL(blob);
          await new Promise<void>((resolve, reject) => {
            const a = new Audio(url);
            a.playbackRate = rate;
            audioRef.current = a;
            a.onended = () => resolve();
            a.onerror = () => reject(new Error('Audio konnte nicht abgespielt werden.'));
            a.onpause = () => stopRef.current && resolve();
            a.play().catch(reject);
          });
          URL.revokeObjectURL(url);
        } else {
          await new Promise<void>((resolve) => {
            const u = new SpeechSynthesisUtterance(script[i].text);
            const v = browserVoices();
            const voice = script[i].speaker === 'A' ? v.A : v.B;
            if (voice) u.voice = voice;
            u.lang = voice?.lang ?? 'de-DE';
            u.rate = rate;
            u.pitch = script[i].speaker === 'A' ? 1.1 : 0.85;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            window.speechSynthesis.speak(u);
          });
        }
      }
      setLine(-1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!stopRef.current) setPlaying(false);
    }
  };

  const pause = () => {
    stopRef.current = true;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setPlaying(false);
  };
  const stop = () => {
    pause();
    setLine(-1);
  };

  const exportAudio = async () => {
    if (!script) return;
    setExporting(true);
    setError('');
    try {
      const blobs: Blob[] = [];
      for (let i = 0; i < script.length; i++) {
        const b = await speechFor(i, script);
        if (b) blobs.push(b);
      }
      const all = new Blob(blobs, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(all);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(deck.name)}-podcast.mp3`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const cfg = aiConfig();

  return (
    <div className="podcast">
      {busy === 'script' && job && <JobBanner job={job} />}
      <JobError job={job} />
      {!script ? (
        <div className="empty">
          <b>Lern-Podcast</b>
          <p className="muted">Die KI schreibt ein Gespräch zwischen {NAMES.A} und {NAMES.B} über deinen Stoff – zum Anhören unterwegs.</p>
          {!ready ? (
            <NoKeyNotice compact />
          ) : (
            <>
              <label className="field-label" htmlFor="pod-min">
                Länge: etwa {minutes} Minuten
              </label>
              <input id="pod-min" type="range" min={2} max={12} value={minutes} onChange={(e) => setMinutes(+e.target.value)} />
              <button type="button" className="btn primary" onClick={run} disabled={!!busy || !hasMaterial}>
                <IconSparkle size={16} /> {busy === 'script' ? 'Skript wird geschrieben …' : 'Podcast erstellen'}
              </button>
            </>
          )}
          {!hasMaterial && <p className="muted small">Füge zuerst Lernmaterial oder Karten hinzu.</p>}
        </div>
      ) : (
        <>
          <div className="panel player">
            <div className="player-art">
              <span className="pod-cover">
                <IconSparkle size={28} />
              </span>
              <div>
                <b>{deck.name}</b>
                <small className="muted">
                  {script.length} Abschnitte · Stimmen: {useOpenAi ? `${cfg.info.short} (natürliche Stimmen)` : 'Browser-Sprachausgabe'}
                </small>
              </div>
            </div>
            <div className="player-controls">
              {playing ? (
                <button type="button" className="play-btn" onClick={pause} aria-label="Pause">
                  <IconPause size={20} />
                </button>
              ) : (
                <button type="button" className="play-btn" onClick={() => playFrom(line >= 0 ? line : 0)} aria-label="Abspielen">
                  <IconPlay size={20} />
                </button>
              )}
              <button type="button" className="icon-btn" onClick={stop} aria-label="Stopp">
                <IconStop size={18} />
              </button>
              <label className="speed">
                Tempo
                <select value={rate} onChange={(e) => setRate(+e.target.value)}>
                  {[0.75, 1, 1.25, 1.5].map((r) => (
                    <option key={r} value={r}>
                      {r}×
                    </option>
                  ))}
                </select>
              </label>
              <span className="grow" />
              <button type="button" className="btn ghost sm" onClick={() => download(`${slugify(deck.name)}-podcast.txt`, script.map((l) => `${NAMES[l.speaker]}: ${l.text}`).join('\n\n'), 'text/plain')}>
                <IconDownload size={14} /> Skript
              </button>
              {useOpenAi && (
                <button type="button" className="btn ghost sm" onClick={exportAudio} disabled={!!busy}>
                  <IconDownload size={14} /> {busy === 'export' ? 'Audio wird erstellt …' : 'MP3'}
                </button>
              )}
              {ready && (
                <button type="button" className="btn outline sm" onClick={run} disabled={!!busy}>
                  <IconSparkle size={14} /> {busy === 'script' ? 'Wird geschrieben …' : 'Neu erstellen'}
                </button>
              )}
            </div>
            {!useOpenAi && (
              <p className="muted small">Tipp: Mit einem OpenAI-Key klingen die Stimmen deutlich natürlicher.</p>
            )}
          </div>
          <div className="transcript">
            {script.map((l, i) => (
              <button type="button" key={i} className={`t-line ${l.speaker} ${i === line ? 'now' : ''}`} onClick={() => { stop(); setTimeout(() => playFrom(i), 50); }}>
                <span className="t-name">{NAMES[l.speaker]}</span>
                <span>{l.text}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

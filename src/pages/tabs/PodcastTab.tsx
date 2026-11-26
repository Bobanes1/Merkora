/**
 * Clean, relaxed Offline 2-Voice Learning Podcast ("Lern-Podcast"):
 * - 1 single compact API call generates the structured 2-host dialogue with chapters.
 * - Playback runs 100% locally via 2 distinct Piper ONNX voices (with automatic OS voice fallback).
 * - Seamless pre-buffering (next 2 lines prepared ahead) + local WAV export of the entire episode.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CostHint } from '../../components/CostHint';
import { IconDownload, IconPause, IconPlay, IconRefresh, IconSparkle } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { NoKeyNotice } from '../../components/NoKey';
import { materialFrom } from '../../lib/ai';
import { estimate } from '../../lib/costs';
import { startJob } from '../../lib/jobs';
import {
  concatWavPcm,
  estimatePodcastMinutes,
  podcastChapters,
  type PodcastLength,
} from '../../lib/podcast';
import {
  pickPodcastVoices,
  speak,
  stopSpeaking,
  synthesizeLineWav,
  useNeuralTtsStatus,
} from '../../lib/speech';
import { detectSpeechLang } from '../../lib/speechLang';
import { updateDeck, type Deck } from '../../lib/store';
import { slugify } from '../../lib/util';
import { useAiReady } from './SummaryTab';

const LENGTHS: { min: PodcastLength; label: string; desc: string }[] = [
  { min: 3, label: 'Kurz (3 Min.)', desc: 'Kompakter Überblick' },
  { min: 6, label: 'Standard (6 Min.)', desc: 'Ausgewogener Deep-Dive' },
  { min: 10, label: 'Tiefgang (10 Min.)', desc: 'Ausführlich mit Beispielen' },
];
const SPEEDS = [0.85, 1, 1.15, 1.3, 1.5];

export default function PodcastTab({ deck }: { deck: Deck }) {
  const ready = useAiReady();
  const job = useJob(deck.id, 'podcast');
  const busy = isActive(job);
  const neural = useNeuralTtsStatus();

  const [length, setLength] = useState<PodcastLength>((deck.podcastMeta?.minutes as PodcastLength) || 6);
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rate, setRate] = useState(1);
  const [exporting, setExporting] = useState<string>('');
  const [playErr, setPlayErr] = useState('');

  const lines = deck.podcast ?? [];
  const chapters = useMemo(() => podcastChapters(lines), [lines]);
  const estMin = useMemo(() => (lines.length ? estimatePodcastMinutes(lines) : length), [lines, length]);
  const material = useMemo(() => materialFrom(deck.source, deck.cards), [deck.source, deck.cards]);
  const hasMaterial = material.trim().length >= 30;
  const lang = useMemo(() => detectSpeechLang(lines[0]?.text || deck.name, 'de'), [lines, deck.name]);

  const installedVoices = neural?.engineInstalled ? neural.installedVoices : [];
  const autoVoices = useMemo(() => pickPodcastVoices(installedVoices, lang), [installedVoices, lang]);
  const voiceA = deck.podcastMeta?.voiceA && installedVoices.includes(deck.podcastMeta.voiceA) ? deck.podcastMeta.voiceA : autoVoices.voiceA;
  const voiceB = deck.podcastMeta?.voiceB && installedVoices.includes(deck.podcastMeta.voiceB) ? deck.podcastMeta.voiceB : autoVoices.voiceB;
  const hasPiper = Boolean(voiceA && voiceB);

  const runToken = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if (playing) activeLineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [idx, playing]);

  const stopPlayback = () => {
    runToken.current++;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
    stopSpeaking();
    setPlaying(false);
  };

  useEffect(() => () => stopPlayback(), [deck.id]);

  const playFrom = (startIndex: number) => {
    if (!lines.length) return;
    stopPlayback();
    setPlayErr('');
    const token = ++runToken.current;
    const clamped = Math.max(0, Math.min(lines.length - 1, startIndex));
    setIdx(clamped);
    setPlaying(true);

    void (async () => {
      try {
        for (let i = clamped; i < lines.length; i++) {
          if (token !== runToken.current) return;
          setIdx(i);
          const line = lines[i];

          if (hasPiper) {
            const vid = line.speaker === 'A' ? voiceA! : voiceB!;
            // Pre-buffer next 2 lines in background for seamless turn-taking
            for (const nextI of [i + 1, i + 2]) {
              if (nextI < lines.length) {
                const nl = lines[nextI];
                const nvid = nl.speaker === 'A' ? voiceA! : voiceB!;
                void synthesizeLineWav(nl.text, nvid).catch(() => undefined);
              }
            }
            const { url } = await synthesizeLineWav(line.text, vid);
            if (token !== runToken.current) return;
            await new Promise<void>((resolve) => {
              const audio = new Audio(url);
              audio.playbackRate = rateRef.current;
              const p = audio as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
              if ('preservesPitch' in p) p.preservesPitch = true;
              if ('webkitPreservesPitch' in p) p.webkitPreservesPitch = true;
              audioRef.current = audio;
              const finish = () => {
                if (audioRef.current === audio) audioRef.current = null;
                resolve();
              };
              audio.onended = finish;
              audio.onerror = finish;
              audio.play().catch(finish);
            });
          } else {
            // Smooth fallback to system TTS (distinct speech pacing per speaker)
            await new Promise<void>((resolve) => {
              speak(line.text, resolve, { forceSystem: true, lang });
            });
          }
          if (token !== runToken.current) return;
          await new Promise((r) => window.setTimeout(r, 180));
        }
      } catch (e) {
        if (token === runToken.current) setPlayErr((e as Error).message || 'Wiedergabe unterbrochen.');
      } finally {
        if (token === runToken.current) setPlaying(false);
      }
    })();
  };

  const exportWav = async () => {
    if (!lines.length || !hasPiper || exporting) return;
    setPlayErr('');
    try {
      const buffers: Uint8Array[] = [];
      for (let i = 0; i < lines.length; i++) {
        setExporting(`Rendere ${i + 1} / ${lines.length} …`);
        const l = lines[i];
        const vid = l.speaker === 'A' ? voiceA! : voiceB!;
        const { bytes } = await synthesizeLineWav(l.text, vid);
        buffers.push(bytes);
      }
      setExporting('Füge WAV zusammen …');
      const combined = concatWavPcm(buffers, 280);
      const blob = new Blob([combined], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(deck.podcastMeta?.title || deck.name)}-podcast.wav`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setPlayErr((e as Error).message || 'WAV-Export fehlgeschlagen.');
    } finally {
      setExporting('');
    }
  };

  const generate = () => {
    stopPlayback();
    startJob('podcast', deck, { minutes: length });
  };

  const voiceLabel = (id: string) => neural?.catalog.find((v) => v.id === id)?.name ?? id;

  return (
    <div className="panel podcast-panel">
      {busy && job && <JobBanner job={job} />}
      <JobError job={job} />

      {!lines.length ? (
        <div className="empty podcast-empty">
          <b>Noch kein Lern-Podcast</b>
          <p className="muted">
            Die KI schreibt einmalig ein entspanntes 2-Stimmen-Gespräch zu „{deck.name}“ – die gesamte Sprachausgabe läuft anschließend 100 % offline mit deinen Stimmen.
          </p>
          <div className="seg compact" role="radiogroup" aria-label="Podcast-Länge">
            {LENGTHS.map((o) => (
              <button key={o.min} type="button" className={length === o.min ? 'on' : ''} onClick={() => setLength(o.min)}>
                {o.label}
              </button>
            ))}
          </div>
          {!ready ? (
            <NoKeyNotice compact />
          ) : (
            <>
              <button type="button" className="btn primary" disabled={busy || !hasMaterial} onClick={generate}>
                <IconSparkle size={16} /> {busy ? 'Podcast wird geschrieben …' : 'Lern-Podcast erstellen'}
              </button>
              {hasMaterial && <CostHint label="Einmalig fürs Skript (Audio 0 $)" est={estimate.podcast(material.length, length)} />}
            </>
          )}
          {!hasMaterial && <p className="muted small">Füge zuerst Lernmaterial oder Karten hinzu.</p>}
        </div>
      ) : (
        <>
          {/* Clean Hero Player Card */}
          <div className="pod-player-card">
            <div className="pod-player-top">
              <button
                type="button"
                className={`pod-play-btn${playing ? ' playing' : ''}`}
                aria-label={playing ? 'Pausieren' : 'Abspielen'}
                onClick={() => (playing ? stopPlayback() : playFrom(idx >= lines.length - 1 ? 0 : idx))}
              >
                {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
              </button>

              <div className="pod-meta">
                <b className="pod-title">{deck.podcastMeta?.title || `Lern-Podcast · ${deck.name}`}</b>
                <span className="muted small">
                  ca. {estMin} Min. · Abschnitt {idx + 1} / {lines.length} ·{' '}
                  {hasPiper ? `Offline Piper (${voiceLabel(voiceA!)} & ${voiceLabel(voiceB!)})` : 'System-Stimme'}
                </span>
              </div>

              <span className="grow" />

              <div className="row-gap">
                <select
                  className="input sm pod-speed"
                  aria-label="Geschwindigkeit"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>

                {hasPiper && (
                  <button type="button" className="btn outline sm" disabled={!!exporting} onClick={() => void exportWav()}>
                    <IconDownload size={14} /> {exporting || 'WAV speichern'}
                  </button>
                )}

                {ready && (
                  <button type="button" className="btn ghost sm" disabled={busy} onClick={generate} title="Neues Podcast-Skript erstellen">
                    <IconRefresh size={14} /> Neu
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="pod-progress">
              <i style={{ width: `${((idx + 1) / Math.max(1, lines.length)) * 100}%` }} />
            </div>

            {/* Optional Piper voice pair picker (shown cleanly only when >= 2 Piper voices are installed) */}
            {installedVoices.length >= 2 && (
              <div className="pod-voices small muted">
                <span>Stimme A:</span>
                <select
                  className="input sm"
                  value={voiceA}
                  onChange={(e) => updateDeck(deck.id, { podcastMeta: { ...deck.podcastMeta, voiceA: e.target.value } })}
                >
                  {installedVoices.map((id) => (
                    <option key={id} value={id}>
                      {voiceLabel(id)}
                    </option>
                  ))}
                </select>
                <span>Stimme B:</span>
                <select
                  className="input sm"
                  value={voiceB}
                  onChange={(e) => updateDeck(deck.id, { podcastMeta: { ...deck.podcastMeta, voiceB: e.target.value } })}
                >
                  {installedVoices.map((id) => (
                    <option key={id} value={id}>
                      {voiceLabel(id)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Chapter quick-jump pills */}
            {chapters.length > 0 && (
              <div className="pod-chapters">
                {chapters.map((ch) => (
                  <button
                    key={ch.index}
                    type="button"
                    className={`chip sm${idx >= ch.index && (chapters.find((c) => c.index > ch.index)?.index ?? Infinity) > idx ? ' on' : ''}`}
                    onClick={() => playFrom(ch.index)}
                  >
                    {ch.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {playErr && <p className="form-error small">{playErr}</p>}

          {/* Clean clickable transcript */}
          <div className="pod-transcript" role="list" aria-label="Podcast-Transkript">
            {lines.map((line, i) => {
              const active = i === idx && playing;
              return (
                <div key={i}>
                  {line.chapter && <div className="pod-chapter-divider">{line.chapter}</div>}
                  <button
                    ref={active ? activeLineRef : undefined}
                    type="button"
                    role="listitem"
                    className={`pod-line sp-${line.speaker.toLowerCase()}${active ? ' active' : i === idx ? ' current' : ''}`}
                    onClick={() => playFrom(i)}
                  >
                    <span className={`pod-badge sp-${line.speaker.toLowerCase()}`}>
                      {line.speaker === 'A' ? 'Host A' : 'Host B'}
                    </span>
                    <span className="pod-line-text">{line.text}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

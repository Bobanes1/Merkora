import { useMemo, useState } from 'react';
import { VISUAL_PRESETS, type VisualPreset } from '../../lib/visualPresets';
import { BuildFigure } from '../practice/Visuals';
import { IconSearch } from '../Icons';

type Cat = 'all' | 'space' | 'bio' | 'phys' | 'tech' | 'soc';

const CAT_LABEL: Record<Cat, string> = {
  all: 'Alle (30)',
  space: 'Erde & Weltall',
  bio: 'Mensch & Biologie',
  phys: 'Physik & Chemie',
  tech: 'Informatik',
  soc: 'Wirtschaft, Recht & Musik',
};

const CAT_OF: Record<string, Cat> = {
  sonnensystem: 'space', mondphasen: 'space', erdschichten: 'space', wasserkreislauf: 'space', vulkan: 'space', treibhauseffekt: 'space',
  anatomie: 'bio', herz: 'bio', blutkreislauf: 'bio', atmung: 'bio', gehirn: 'bio', zelle: 'bio', dna: 'bio', synapse: 'bio', fotosynthese: 'bio',
  stromkreis: 'phys', tragflaeche: 'phys', optik: 'phys', atom: 'phys', motor: 'phys', hebel: 'phys', aggregatzustaende: 'phys', saeure_base: 'phys',
  computer: 'tech', internet: 'tech', datenbank: 'tech',
  wirtschaftskreislauf: 'soc', angebot_nachfrage: 'soc', gewaltenteilung: 'soc', musik_kreis: 'soc',
};

/** Interactive browser for all 30 handcrafted animated Studyflix visual presets. */
export function VisualLibraryTool() {
  const [cat, setCat] = useState<Cat>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(VISUAL_PRESETS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VISUAL_PRESETS.filter((p) => {
      if (cat !== 'all' && (CAT_OF[p.id] ?? 'phys') !== cat) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.id.includes(q) ||
        p.tags.some((t) => t.includes(q))
      );
    });
  }, [cat, query]);

  const active: VisualPreset = VISUAL_PRESETS.find((p) => p.id === selectedId) ?? filtered[0] ?? VISUAL_PRESETS[0];

  return (
    <section className="panel visual-lib">
      <div className="panel-head">
        <div>
          <h2>Interaktive Grafik-Bibliothek</h2>
          <p className="muted small">Alle {VISUAL_PRESETS.length} animierten Lern-Szenen direkt erkunden – Bestandteile anklicken, Zustände umschalten oder den Rundgang starten.</p>
        </div>
      </div>

      <div className="visual-lib-stage">
        <BuildFigure
          key={active.id}
          diagram={{ type: 'preset', preset: active.id, title: active.title }}
          caption={active.summary}
        />
      </div>

      <div className="visual-lib-controls">
        <label className="search visual-lib-search">
          <IconSearch size={15} />
          <input
            type="search"
            placeholder="Thema suchen (z. B. Herz, Motor, pH, Planeten …)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips">
          {(Object.keys(CAT_LABEL) as Cat[]).map((c) => (
            <button key={c} type="button" className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
              {CAT_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="visual-lib-grid">
        {filtered.map((p) => {
          const on = p.id === active.id;
          return (
            <button
              key={p.id}
              type="button"
              className={'visual-lib-card' + (on ? ' on' : '')}
              aria-pressed={on}
              onClick={() => setSelectedId(p.id)}
            >
              <div className="visual-lib-card-head">
                <b>{p.title}</b>
                {p.states?.length ? <span className="badge ok">{p.states.length} Zustände</span> : null}
              </div>
              <small className="muted">{p.summary}</small>
              <span className="visual-lib-meta">{p.parts.length} klickbare Teile</span>
            </button>
          );
        })}
        {!filtered.length && <p className="muted small">Keine Grafik passt zur Suche „{query}“.</p>}
      </div>
    </section>
  );
}

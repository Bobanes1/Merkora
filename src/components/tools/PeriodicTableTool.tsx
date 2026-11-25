import { useMemo, useState } from 'react';
import { ELEMENT_CAT_LABEL, elementOrbitDiagram, ELEMENTS, type ChemElement, type ElementCat } from '../../lib/periodicTable';
import { BuildFigure } from '../practice/Visuals';
import { IconSearch } from '../Icons';

/** Interactive 118-element Periodic Table with category filter, search, and live animated Bohr shell model. */
export function PeriodicTableTool() {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<ElementCat | 'all'>('all');
  const [selectedZ, setSelectedZ] = useState<number>(6); // Carbon by default

  const selected: ChemElement = ELEMENTS.find((e) => e.z === selectedZ) ?? ELEMENTS[0];
  const orbitDiagram = useMemo(() => elementOrbitDiagram(selected), [selected]);

  const matches = (e: ChemElement) => {
    if (cat !== 'all' && e.cat !== cat) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || e.sym.toLowerCase() === q || String(e.z) === q;
  };

  return (
    <section className="panel ptable-tool">
      <div className="panel-head">
        <div>
          <h2>Interaktives Periodensystem</h2>
          <p className="muted small">Klicke auf ein Element, um Kennzahlen und das animierte Bohrsche Schalenmodell zu erkunden.</p>
        </div>
      </div>

      <div className="ptable-detail">
        <div className={`ptable-hero cat-${selected.cat}`}>
          <span className="ptable-hero-z">{selected.z}</span>
          <b className="ptable-hero-sym">{selected.sym}</b>
          <span className="ptable-hero-name">{selected.name}</span>
          <small>{selected.mass.toString().replace('.', ',')} u</small>
        </div>
        <div className="ptable-info">
          <div className="ptable-stats">
            <span className="badge">{ELEMENT_CAT_LABEL[selected.cat]}</span>
            <span className="badge">Zustand: {selected.state}</span>
            {selected.en !== undefined && <span className="badge">EN: {selected.en.toString().replace('.', ',')}</span>}
            <span className="badge">Schalen: {selected.shells.join(' · ')}</span>
          </div>
          <p className="ptable-note">{selected.note}</p>
        </div>
      </div>

      <div className="ptable-orbit">
        <BuildFigure key={selected.z} diagram={orbitDiagram} />
      </div>

      <div className="visual-lib-controls">
        <label className="search visual-lib-search">
          <IconSearch size={15} />
          <input
            type="search"
            placeholder="Element suchen (z. B. Gold, Au, 79, Sauerstoff …)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips">
          <button type="button" className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>
            Alle
          </button>
          {(Object.keys(ELEMENT_CAT_LABEL) as ElementCat[]).map((c) => (
            <button key={c} type="button" className={`chip ptable-chip cat-${c}${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
              {ELEMENT_CAT_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="ptable-scroll">
        <div className="ptable-grid" role="grid" aria-label="Periodensystem der Elemente">
          {ELEMENTS.map((e) => {
            const hit = matches(e);
            const on = e.z === selected.z;
            return (
              <button
                key={e.z}
                type="button"
                className={`ptable-cell cat-${e.cat}${on ? ' on' : ''}${hit ? '' : ' dim'}`}
                style={{ gridColumn: e.col, gridRow: e.row }}
                title={`${e.z} ${e.name} (${e.sym}) – ${e.mass} u`}
                aria-pressed={on}
                onClick={() => setSelectedZ(e.z)}
              >
                <small>{e.z}</small>
                <b>{e.sym}</b>
                <span>{e.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

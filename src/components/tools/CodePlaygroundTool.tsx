import { useEffect, useMemo, useState } from 'react';
import { CodeEditor } from '../CodeEditor';
import { JavaSetup } from '../JavaSetup';
import { IconPlay, IconRefresh } from '../Icons';
import { runJs, runPython, runSql, type SqlTable } from '../../lib/codeRun';
import { buildHarness, localJava, runJavaLocal, runJavaOnline } from '../../lib/javaRun';
import { setSettings } from '../../lib/store';

type PlayLang = 'python' | 'javascript' | 'java' | 'sql';

const LANG_LABEL: Record<PlayLang, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  sql: 'SQL (SQLite)',
};

const SQL_DATABASES: { id: string; name: string; schema: string; starter: string }[] = [
  {
    id: 'shop',
    name: 'Online-Shop',
    schema: `CREATE TABLE kunden (id INT, name TEXT, stadt TEXT);
INSERT INTO kunden VALUES (1,'Lea Meier','Berlin'),(2,'Tim Schulz','München'),(3,'Sara Ali','Hamburg'),(4,'Noah Frei','Zürich');
CREATE TABLE produkte (id INT, titel TEXT, preis REAL, kategorie TEXT);
INSERT INTO produkte VALUES (1,'Kopfhörer',79.90,'Audio'),(2,'Notizbuch',12.50,'Papier'),(3,'Tischlampe',44.00,'Licht'),(4,'Lernkarten-Box',18.90,'Papier');
CREATE TABLE bestellungen (id INT, kunde_id INT, produkt_id INT, menge INT);
INSERT INTO bestellungen VALUES (10,1,1,1),(11,1,2,3),(12,2,3,2),(13,4,4,2),(14,3,2,5);`,
    starter: `SELECT k.name, k.stadt, ROUND(SUM(p.preis * b.menge), 2) AS umsatz\nFROM kunden k\nJOIN bestellungen b ON k.id = b.kunde_id\nJOIN produkte p ON p.id = b.produkt_id\nGROUP BY k.id\nORDER BY umsatz DESC;`,
  },
  {
    id: 'uni',
    name: 'Universität',
    schema: `CREATE TABLE studierende (id INT, name TEXT, fach TEXT, semester INT);
INSERT INTO studierende VALUES (1,'Emma Graf','Informatik',3),(2,'Lukas Roth','Biologie',5),(3,'Mia Weber','Informatik',1),(4,'Ben Keller','Jura',4);
CREATE TABLE pruefungen (id INT, stud_id INT, modul TEXT, note REAL);
INSERT INTO pruefungen VALUES (1,1,'Algorithmen',1.3),(2,1,'Datenbanken',1.7),(3,2,'Genetik',2.0),(4,3,'Programmieren',1.0),(5,4,'Strafrecht',2.3);`,
    starter: `SELECT s.fach, COUNT(*) AS pruefungen, ROUND(AVG(p.note), 2) AS schnitt\nFROM studierende s\nJOIN pruefungen p ON s.id = p.stud_id\nGROUP BY s.fach\nORDER BY schnitt ASC;`,
  },
  {
    id: 'clinic',
    name: 'Krankenhaus',
    schema: `CREATE TABLE stationen (id INT, name TEXT, betten INT);
INSERT INTO stationen VALUES (1,'Kardiologie',24),(2,'Neurologie',18),(3,'Notaufnahme',12);
CREATE TABLE patienten (id INT, name TEXT, station_id INT, tage INT);
INSERT INTO patienten VALUES (1,'Anna B.',1,4),(2,'Paul K.',1,7),(3,'Clara M.',2,3),(4,'Jonas T.',3,1),(5,'Eva S.',2,6);`,
    starter: `SELECT st.name AS station, COUNT(p.id) AS patienten, ROUND(AVG(p.tage), 1) AS avg_tage\nFROM stationen st\nLEFT JOIN patienten p ON st.id = p.station_id\nGROUP BY st.id\nORDER BY patienten DESC;`,
  },
];

const SNIPPETS: Record<PlayLang, { name: string; code: string }[]> = {
  python: [
    { name: 'Hallo & Schleife', code: `for i in range(1, 6):\n    print(f"Quadrat von {i} ist {i * i}")` },
    { name: 'Statistik & Funktion', code: `import statistics\n\nnoten = [1.7, 2.0, 1.3, 2.3, 1.7]\nprint("Schnitt:", round(statistics.mean(noten), 2))\nprint("Median:", statistics.median(noten))` },
    { name: 'Fibonacci', code: `a, b = 0, 1\nfor _ in range(8):\n    print(a)\n    a, b = b, a + b` },
  ],
  javascript: [
    { name: 'Hallo & Array', code: `const zahlen = [2, 4, 6, 8, 10];\nconst summe = zahlen.reduce((a, b) => a + b, 0);\nconsole.log("Summe:", summe, "Mittel:", summe / zahlen.length);` },
    { name: 'Funktion & Filter', code: `const personen = [\n  { name: "Lea", punkte: 92 },\n  { name: "Tim", punkte: 74 },\n  { name: "Sara", punkte: 88 },\n];\nconsole.log(personen.filter(p => p.punkte >= 80).map(p => p.name));` },
  ],
  java: [
    {
      name: 'Hallo Merkora',
      code: `class Solution {\n    public static void main(String[] args) {\n        System.out.println("Hallo Merkora!");\n    }\n}`,
    },
    {
      name: 'Schleife & Summe',
      code: `class Solution {\n    public static void main(String[] args) {\n        int sum = 0;\n        for (int i = 1; i <= 10; i++) sum += i;\n        System.out.println("Summe 1..10 = " + sum);\n    }\n}`,
    },
  ],
  sql: [
    { name: 'Umsatz pro Kunde (JOIN)', code: SQL_DATABASES[0].starter },
    { name: 'Alle Produkte filtern', code: `SELECT titel, kategorie, preis\nFROM produkte\nWHERE preis < 50\nORDER BY preis ASC;` },
  ],
};

function parseSchemaTables(schema: string): { name: string; cols: string[] }[] {
  const out: { name: string; cols: string[] }[] = [];
  for (const m of schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)\s*\(([^)]+)\)/gi)) {
    const cols = m[2]
      .split(',')
      .map((c) => c.trim().split(/\s+/)[0])
      .filter(Boolean);
    out.push({ name: m[1], cols });
  }
  return out;
}

const STORE_KEY = 'merkora.playground.v1';
function loadSaved(): Partial<Record<PlayLang, string>> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Record<PlayLang, string>>;
  } catch {
    return {};
  }
}

/** 4-language interactive code playground (Python, JavaScript, SQLite WASM, Java) with syntax highlighting, SQL schema browser & run history. */
export function CodePlaygroundTool() {
  const [lang, setLang] = useState<PlayLang>('python');
  const [saved, setSaved] = useState<Partial<Record<PlayLang, string>>>(loadSaved);
  const [sqlDbId, setSqlDbId] = useState(SQL_DATABASES[0].id);
  const [sqlSchema, setSqlSchema] = useState(SQL_DATABASES[0].schema);
  const [out, setOut] = useState('');
  const [table, setTable] = useState<SqlTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlineJava, setOnlineJava] = useState(false);
  const [history, setHistory] = useState<{ lang: PlayLang; code: string; at: number }[]>([]);

  const code = saved[lang] ?? SNIPPETS[lang][0].code;
  const setCode = (next: string) => setSaved((s) => ({ ...s, [lang]: next }));

  const schemaTables = useMemo(() => parseSchemaTables(sqlSchema), [sqlSchema]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  const pickSqlDb = (id: string) => {
    const db = SQL_DATABASES.find((d) => d.id === id);
    if (!db) return;
    setSqlDbId(db.id);
    setSqlSchema(db.schema);
    setCode(db.starter);
    setOut('');
    setTable(null);
  };

  const pickSnippet = (idx: number) => {
    const sn = SNIPPETS[lang][idx];
    if (!sn) return;
    setCode(sn.code);
    setOut('');
    setTable(null);
  };

  const run = async (overrideCode?: string) => {
    const srcCode = overrideCode ?? code;
    setBusy(true);
    setOut('');
    setTable(null);
    setHistory((h) => [{ lang, code: srcCode, at: Date.now() }, ...h.filter((x) => !(x.lang === lang && x.code === srcCode))].slice(0, 6));
    try {
      if (lang === 'javascript' || lang === 'python') {
        const r = lang === 'python' ? await runPython(srcCode, []) : await runJs(srcCode, []);
        if (r.timedOut) setOut('Das Programm hat zu lange gebraucht und wurde gestoppt.');
        else if (r.compileError) setOut(r.compileError);
        else setOut(r.logs.trim() || '(keine Ausgabe)');
      } else if (lang === 'sql') {
        const r = await runSql(sqlSchema, srcCode);
        if ('error' in r) setOut(r.error);
        else setTable(r);
      } else {
        const src = buildHarness(srcCode, []);
        let r = (await localJava()) ? await runJavaLocal(src) : 'no-java';
        if (r === 'no-java') {
          if (!onlineJava) {
            setOut('Auf diesem Gerät gibt es noch kein Java. Installiere es oben mit einem Klick – oder nutze „Online ausführen“ (wandbox.org).');
            return;
          }
          r = await runJavaOnline(src);
        }
        setOut((r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() || '(keine Ausgabe)');
      }
    } catch (e) {
      setOut((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Code-Spielwiese</h2>
          <p className="muted small">Echtes Python (Pyodide), JavaScript, SQLite (WASM) &amp; Java mit Syntax-Highlighting – Ausführen mit Strg+Enter.</p>
        </div>
      </div>

      <div className="tool">
        <div className="seg wrap">
          {(['python', 'javascript', 'sql', 'java'] as PlayLang[]).map((l) => (
            <button key={l} type="button" className={lang === l ? 'on' : ''} onClick={() => (setLang(l), setOut(''), setTable(null))}>
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>

        {lang === 'sql' ? (
          <>
            <div className="chips">
              <small className="muted">Übungs-Datenbank:</small>
              {SQL_DATABASES.map((db) => (
                <button key={db.id} type="button" className={'chip' + (sqlDbId === db.id ? ' on' : '')} onClick={() => pickSqlDb(db.id)}>
                  {db.name}
                </button>
              ))}
            </div>
            {schemaTables.length > 0 && (
              <div className="sql-schema-browser">
                <small className="muted">Tabellen (Klick zeigt Inhalt):</small>
                <div className="sql-tables-row">
                  {schemaTables.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      className="sql-table-pill"
                      onClick={() => {
                        const q = `SELECT * FROM ${t.name} LIMIT 20;`;
                        setCode(q);
                        void run(q);
                      }}
                    >
                      <b>{t.name}</b>
                      <small>{t.cols.join(', ')}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <details className="sql-schema-details">
              <summary className="muted small">Tabellen-Schema bearbeiten (CREATE TABLE / INSERT)</summary>
              <textarea className="input mono sql-schema-area" rows={6} value={sqlSchema} onChange={(e) => setSqlSchema(e.target.value)} />
            </details>
          </>
        ) : (
          <div className="chips">
            <small className="muted">Vorlagen:</small>
            {SNIPPETS[lang].map((sn, idx) => (
              <button key={sn.name} type="button" className="chip" onClick={() => pickSnippet(idx)}>
                {sn.name}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => pickSnippet(0)} title="Auf Start-Beispiel zurücksetzen">
              <IconRefresh size={12} /> Zurücksetzen
            </button>
          </div>
        )}

        {lang === 'java' && <JavaSetup />}

        <CodeEditor value={code} onChange={setCode} onRun={() => void run()} lang={lang} label={`${LANG_LABEL[lang]}-Code`} />

        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
            <IconPlay size={14} /> {busy ? 'Läuft …' : `${LANG_LABEL[lang]} ausführen`}
          </button>
          <small className="muted">Strg+Enter</small>
          {lang === 'java' && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={onlineJava}
                onChange={(e) => (setOnlineJava(e.target.checked), e.target.checked && setSettings({ onlineCodeOk: true }))}
              />{' '}
              Online ausführen (wandbox.org), wenn kein Java da ist
            </label>
          )}
        </div>

        {out && (
          <div className="code-output">
            <pre>{out}</pre>
          </div>
        )}

        {table && (
          <div className="sql-result-wrap">
            {table.columns.length ? (
              <table className="lang-table">
                <thead>
                  <tr>
                    {table.columns.map((c, i) => (
                      <th key={i}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{cell === null ? 'NULL' : String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted small">Abfrage ausgeführt (keine Zeilen zurückgegeben).</p>
            )}
          </div>
        )}

        {history.filter((h) => h.lang === lang).length > 1 && (
          <div className="chips" style={{ marginTop: 4 }}>
            <small className="muted">Verlauf:</small>
            {history
              .filter((h) => h.lang === lang)
              .slice(0, 4)
              .map((h) => (
                <button key={h.at} type="button" className="chip" onClick={() => setCode(h.code)}>
                  {h.code.split('\n')[0].slice(0, 34)}
                  {h.code.length > 34 ? '…' : ''}
                </button>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

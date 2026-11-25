import { useEffect, useState } from 'react';
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
  sql: 'SQL',
};

const SNIPPETS: Record<PlayLang, { name: string; code: string; schema?: string }[]> = {
  python: [
    { name: 'Hallo & Schleife', code: `for i in range(1, 6):\n    print(f"Quadrat von {i} ist {i * i}")` },
    { name: 'Listen & Funktion', code: `def durchschnitt(werte):\n    return sum(werte) / len(werte)\n\nnoten = [1.7, 2.0, 1.3, 2.3]\nprint("Schnitt:", round(durchschnitt(noten), 2))` },
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
    {
      name: 'Kunden & Bestellungen (JOIN)',
      schema: `CREATE TABLE kunden (id INT, name TEXT, stadt TEXT);\nINSERT INTO kunden VALUES (1,'Lea Meier','Berlin'),(2,'Tim Schulz','München'),(3,'Sara Ali','Hamburg');\nCREATE TABLE bestellungen (id INT, kunde_id INT, betrag INT);\nINSERT INTO bestellungen VALUES (10,1,49),(11,1,19),(12,2,85);`,
      code: `SELECT k.name, k.stadt, SUM(b.betrag) AS gesamt\nFROM kunden k\nJOIN bestellungen b ON k.id = b.kunde_id\nGROUP BY k.id\nORDER BY gesamt DESC;`,
    },
    {
      name: 'Alle Kunden filtern',
      schema: `CREATE TABLE kunden (id INT, name TEXT, stadt TEXT);\nINSERT INTO kunden VALUES (1,'Lea Meier','Berlin'),(2,'Tim Schulz','München'),(3,'Sara Ali','Hamburg');`,
      code: `SELECT * FROM kunden WHERE stadt != 'München' ORDER BY name;`,
    },
  ],
};

const STORE_KEY = 'merkora.playground.v1';
function loadSaved(): Partial<Record<PlayLang, string>> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Record<PlayLang, string>>;
  } catch {
    return {};
  }
}

/** 4-language interactive code playground (Python, JavaScript, Java, SQL) with starter snippets and auto-save. */
export function CodePlaygroundTool() {
  const [lang, setLang] = useState<PlayLang>('python');
  const [saved, setSaved] = useState<Partial<Record<PlayLang, string>>>(loadSaved);
  const [sqlSchema, setSqlSchema] = useState(SNIPPETS.sql[0].schema ?? '');
  const [out, setOut] = useState('');
  const [table, setTable] = useState<SqlTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlineJava, setOnlineJava] = useState(false);

  const code = saved[lang] ?? SNIPPETS[lang][0].code;
  const setCode = (next: string) => setSaved((s) => ({ ...s, [lang]: next }));

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  const pickSnippet = (idx: number) => {
    const sn = SNIPPETS[lang][idx];
    if (!sn) return;
    setCode(sn.code);
    if (sn.schema) setSqlSchema(sn.schema);
    setOut('');
    setTable(null);
  };

  const run = async () => {
    setBusy(true);
    setOut('');
    setTable(null);
    try {
      if (lang === 'javascript' || lang === 'python') {
        const r = lang === 'python' ? await runPython(code, []) : await runJs(code, []);
        if (r.timedOut) setOut('Das Programm hat zu lange gebraucht und wurde gestoppt.');
        else if (r.compileError) setOut(r.compileError);
        else setOut(r.logs.trim() || '(keine Ausgabe)');
      } else if (lang === 'sql') {
        const r = await runSql(sqlSchema, code);
        if ('error' in r) setOut(r.error);
        else setTable(r);
      } else {
        const src = buildHarness(code, []);
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
          <p className="muted small">Python, JavaScript, SQL (direkt lokal im Browser) &amp; Java frei ausprobieren – dein letzter Code bleibt gespeichert.</p>
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

        {lang === 'java' && <JavaSetup />}

        {lang === 'sql' && (
          <details className="sql-schema-details">
            <summary className="muted small">Tabellen-Schema bearbeiten (CREATE TABLE / INSERT)</summary>
            <textarea className="input mono sql-schema-area" rows={5} value={sqlSchema} onChange={(e) => setSqlSchema(e.target.value)} />
          </details>
        )}

        <CodeEditor value={code} onChange={setCode} />

        <div className="row-gap">
          <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
            <IconPlay size={14} /> {busy ? 'Läuft …' : `${LANG_LABEL[lang]} ausführen`}
          </button>
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
              <p className="muted small">Abfrage erfolgreich (keine Ergebniszeilen).</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

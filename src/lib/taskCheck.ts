/**
 * The counter-check of AI-made tasks before they are solved: first what can be checked without AI
 * (plausibility, running the AI's own code solution against its own tests), then one AI call that checks
 * every task like a careful tutor and repairs broken ones. Only untouched tasks are changed.
 * The pure parts are tested in scripts/test-srs.mts.
 */
import { LANG_RULE, type Prompt } from './ai';
import { parseTask, taskList, type PracticeSet, type ProblemProgress, type Task } from './practice';

/** Obvious mistakes a task can have, found without AI (null = nothing noticed). Pure – tested. */
export function plausibility(t: Task): string | null {
  switch (t.type) {
    case 'estimate':
      if (!(t.answer >= t.min && t.answer <= t.max)) return `Die Lösung ${t.answer} liegt außerhalb des Schiebereglers (${t.min}–${t.max}).`;
      return null;
    case 'calc':
      if (t.answer.type === 'choice' && t.answer.options?.length && !t.answer.options.some((o) => o.trim().toLowerCase() === t.answer.value.trim().toLowerCase()))
        return 'Die richtige Antwort steht nicht unter den Auswahlmöglichkeiten.';
      return null;
    case 'case':
      if (!t.solution.trim()) return 'Die Musterlösung fehlt.';
      return null;
    case 'explain':
      if (!t.solution.trim()) return 'Die Mustererklärung fehlt.';
      if (t.keyPoints.length < 2) return 'Es gibt zu wenige Kernpunkte.';
      return null;
    case 'code':
      if (!t.solution.trim()) return 'Die Musterlösung fehlt.';
      if (t.lang !== 'sql' && !t.tests.length) return 'Es gibt keine Tests.';
      return null;
    default:
      return null;
  }
}

/** Runs the AI's own solution of a JavaScript or SQL task: does it pass its own tests? Null = fine or not checkable. */
export async function codeSelfCheck(t: Task): Promise<string | null> {
  if (t.type !== 'code') return null;
  try {
    if (t.lang === 'javascript') {
      const { runJs, testResults } = await import('./codeRun');
      const run = await runJs(t.solution, t.tests.map((x) => x.call));
      if (run.compileError) return `Die Musterlösung lässt sich nicht ausführen: ${run.compileError}`;
      const bad = testResults(t.tests, run).filter((r) => !r.ok);
      if (bad.length) return `Die Musterlösung besteht ${bad.length} von ${t.tests.length} eigenen Tests nicht (z. B. Test ${bad[0].n}: erwartet ${t.tests[bad[0].n - 1].expected}, bekommen ${'got' in bad[0] ? bad[0].got : bad[0].error}).`;
      return null;
    }
    if (t.lang === 'sql' && t.schema) {
      const { runSql } = await import('./codeRun');
      const r = await runSql(t.schema, t.solution);
      if ('error' in r) return `Die Musterlösung (SQL) läuft nicht: ${r.error}`;
      if (!r.rows.length) return 'Die Musterlösung (SQL) liefert keine einzige Zeile – die Beispieldaten passen vermutlich nicht.';
      return null;
    }
  } catch {
    // the check itself failed (e.g. no worker): say nothing
  }
  return null;
}

/** What the lesson explained (snippets, intro, theory, worked example) – so the check sees what may be asked. Pure – tested. */
export function explanationOf(set: PracticeSet): string {
  const parts = [
    ...(set.bites ?? []).map((b) => `${b.title ? b.title + ': ' : ''}${b.text}`),
    set.theory ?? '',
    set.bites?.length ? '' : set.intro,
    set.example ? `Beispiel: ${set.example.problem} ${set.example.steps.join(' ')}` : '',
  ].filter((x) => x && x.trim());
  return parts.join('\n').slice(0, 6000);
}

/** The AI check of a whole set; `notes` = what the checks without AI found per task number (from 1). */
export function verifyPrompt(set: PracticeSet, notes: Record<number, string> = {}, extraRule = ''): Prompt {
  const tasks = taskList(set);
  const explained = explanationOf(set);
  const list = tasks.map((t, k) => `AUFGABE ${k + 1}${notes[k + 1] ? ` – BEFUND: ${notes[k + 1]}` : ''}:\n${JSON.stringify(t).slice(0, 4000)}`).join('\n\n');
  return {
    system: `Du prüfst Übungsaufgaben, bevor Lernende sie lösen – wie ein sorgfältiger Tutor. ${LANG_RULE}
${extraRule ? extraRule + '\n' : ''}Prüfe JEDE Aufgabe:
1. Ist die angegebene Lösung/Antwort wirklich richtig? Rechne bzw. löse sie selbst.
2. Enthält die Aufgabe alle Angaben, die man zum Lösen braucht?
3. Ist sie eindeutig – gibt es genau eine richtige Antwort (oder sind die Alternativen als richtig hinterlegt)?
4. Fallaufgaben: Erfüllt die Musterlösung jedes Kriterium des Schemas, und verlangt das Schema nichts, was nicht in der Musterlösung steht?
5. Code: Passen Tests, Startcode und Musterlösung zusammen? Ein BEFUND aus dem Ausführen ist verlässlich.
6. Passt der Aufgabentyp zum Thema? Eine unpassende Aufgabe (z. B. eine Rechentabelle mit erfundenen Zahlen zu einem Theorie-Thema) ersetzt du durch einen passenden Typ zum selben Inhalt.
${explained ? '7. Wurde alles, was die Aufgabe verlangt, ausdrücklich in der ERKLÄRUNG DER LEKTION behandelt? Fragt eine Aufgabe einen Begriff, eine Abkürzung (z. B. „IPv4“, „Orderbuch“) oder eine Schätz-/Faktenzahl ab, die dort nicht erklärt wurde, ersetze sie streng durch eine Aufgabe zum tatsächlich erklärten Inhalt (kein blindes Raten!).\n' : ''}
Liste NUR Aufgaben mit einem echten Fehler. Korrigiere sie so wenig wie nötig (gleicher Typ, gleiches Thema, gleiche Schwierigkeit) und gib die vollständige korrigierte Aufgabe im selben JSON-Format zurück. Eine Aufgabe, die sich nicht sinnvoll reparieren lässt, kommt in "drop".
Format: {"fixes":[{"task":3,"why":"kurzer Grund","fixed":{…vollständige Aufgabe…}}],"drop":[5]} – ist alles in Ordnung: {"fixes":[],"drop":[]}.
Antworte ausschließlich mit gültigem JSON.`,
    user: `THEMA: ${set.topic}${explained ? `\n\nERKLÄRUNG DER LEKTION (nur das wurde erklärt):\n${explained}` : ''}\n\n${list}`,
    maxTokens: 6000,
    json: true,
  };
}

export type VerifyResult = { fixes: { index: number; why: string; task: Task }[]; drop: number[] };

/** The AI's verdict, made safe: only valid repairs, at most half of the tasks changed, at least 3 core tasks left. Pure – tested. */
export function parseVerify(raw: unknown, set: PracticeSet): VerifyResult {
  const r = (raw ?? {}) as { fixes?: unknown; drop?: unknown };
  const n = taskList(set).length;
  const fixes: VerifyResult['fixes'] = [];
  for (const f of Array.isArray(r.fixes) ? r.fixes : []) {
    const o = (f ?? {}) as { task?: unknown; why?: unknown; fixed?: unknown };
    const index = Number(o.task) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= n || fixes.some((x) => x.index === index)) continue;
    const task = parseTask(o.fixed);
    if (task) fixes.push({ index, why: String(o.why ?? '').slice(0, 300), task });
  }
  let drop = [...new Set((Array.isArray(r.drop) ? r.drop : []).map((x) => Number(x) - 1))].filter((k) => Number.isInteger(k) && k >= 0 && k < n && !fixes.some((f) => f.index === k));
  const core = set.progress.filter((p) => !p.extra).length || n;
  const max = Math.floor(n / 2);
  const keepFix = fixes.slice(0, max);
  drop = drop.slice(0, Math.max(0, Math.min(max - keepFix.length, core - 3)));
  return { fixes: keepFix, drop };
}

/** Not touched yet: no try, no hint, nothing looked at – only such tasks may be changed. */
export const untouched = (p?: ProblemProgress) => !p || (!p.solved && !p.tries && !p.hints && !p.shown && !p.dunno);

/** The set with the repairs applied – only to untouched tasks; tasks and progress stay in step. Pure – tested. */
export function applyVerify(set: PracticeSet, v: VerifyResult): { patch: Pick<PracticeSet, 'tasks' | 'progress'>; fixed: number; dropped: number } {
  const tasks = [...taskList(set)];
  const progress = [...set.progress];
  let fixed = 0;
  for (const f of v.fixes) {
    if (!untouched(progress[f.index])) continue;
    tasks[f.index] = { ...f.task, ...(tasks[f.index].level && !f.task.level ? { level: tasks[f.index].level } : {}) };
    progress[f.index] = { ...(progress[f.index] ?? { tries: 0, hints: 0 }), fixed: true };
    fixed++;
  }
  const gone = new Set(v.drop.filter((k) => untouched(progress[k])));
  return {
    patch: { tasks: tasks.filter((_, k) => !gone.has(k)), progress: progress.filter((_, k) => !gone.has(k)) },
    fixed,
    dropped: gone.size,
  };
}

/**
 * Global search (Strg+K): courses, decks, skills, exams, to-dos, tools, files and cards in one list.
 * Pure – tested in scripts/test-srs.mts.
 */
type SCourse = { id: string; name: string; workspaceId: string };
type SDeck = {
  id: string;
  name: string;
  courseId: string;
  cards: { id: string; front: string; back: string; hint?: string; tags?: string[] }[];
  files?: { id: string; name: string }[];
};
type SSkill = { id: string; title: string; topic: string; mini?: boolean };
type SExam = { id: string; title: string; date: string; note?: string };
type STodo = { id: string; text: string; due?: string; doneAt?: number };

export type SearchToolItem = { id: string; title: string; sub: string; keywords: string; route: string };

export const SEARCHABLE_TOOLS: SearchToolItem[] = [
  { id: 'pomodoro', title: 'Pomodoro-Timer', sub: 'Werkzeuge · Fokus & Pausen', keywords: 'timer fokus pause lernzeit uhr', route: '/tools?tab=pomodoro' },
  { id: 'sounds', title: 'Klanglandschaften', sub: 'Werkzeuge · Regen, Café, Rauschen', keywords: 'sound musik regen cafe rauschen fokus audio', route: '/tools?tab=sounds' },
  { id: 'calc', title: 'Wissenschaftlicher Rechner & Einheiten', sub: 'Werkzeuge · Mathe, Brüche, Umrechner', keywords: 'taschenrechner mathe rechnen sin cos einheiten umrechner', route: '/tools?tab=calc' },
  { id: 'ptable', title: 'Interaktives Periodensystem', sub: 'Werkzeuge · 118 Elemente & Schalenmodell', keywords: 'chemie elemente pse atome bohr schalenmodell', route: '/tools?tab=ptable' },
  { id: 'visuals', title: 'Animierte Grafik-Bibliothek', sub: 'Werkzeuge · 30+ interaktive Modelle', keywords: 'diagramm grafik animation physik biologie schaltkreis', route: '/tools?tab=visuals' },
  { id: 'code', title: 'Code-Playground (JS & Python)', sub: 'Werkzeuge · Programmieren & Ausführen', keywords: 'programmieren javascript python editor konsole', route: '/tools?tab=code' },
  { id: 'notes', title: 'Notizblock & Schmierblatt', sub: 'Werkzeuge · Text & Zeichnen', keywords: 'notizen schreiben zeichnen skizze whiteboard', route: '/tools?tab=notes' },
  { id: 'breath', title: 'Atemübung (4-7-8 & Box)', sub: 'Werkzeuge · Entspannung & Fokus', keywords: 'atmen entspannung stress pause prüfungsangst', route: '/tools?tab=breath' },
  { id: 'piano', title: 'Klavier, Musiktheorie & Metronom', sub: 'Werkzeuge · Tonleitern, Akkorde, Takt', keywords: 'musik klavier piano akkorde tonleiter metronom', route: '/tools?tab=piano' },
  { id: 'plan', title: 'Arbeitsplanung', sub: 'Werkzeuge · Tagesplan & Energie-Profil', keywords: 'arbeitsplan zeitplan aufgaben planen', route: '/tools?tab=plan' },
  { id: 'labs', title: 'Funktionsplotter & Mathe-Labor', sub: 'Werkzeuge · Graphen & Kurven', keywords: 'funktion plot graph parabel kurve ableitung', route: '/tools?tab=labs' },
];

export type SearchHit =
  | { kind: 'course'; id: string; title: string; sub: string }
  | { kind: 'deck'; id: string; title: string; sub: string }
  | { kind: 'skill'; id: string; title: string; sub: string }
  | { kind: 'exam'; id: string; title: string; sub: string }
  | { kind: 'todo'; id: string; title: string; sub: string }
  | { kind: 'tool'; id: string; title: string; sub: string; route: string }
  | { kind: 'file'; id: string; deckId: string; title: string; sub: string }
  | { kind: 'card'; id: string; deckId: string; title: string; sub: string; snippet: string; term: string };

const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{([^{}]+?)(?:::[^{}]+?)?\}\}/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,;:])/g, '$1')
    .trim();
/** Lower case (also Ä → ä), so "osmose" finds "Osmose". */
const norm = (s: string) => s.toLocaleLowerCase('de');

/** A short piece of text around the first match. */
export function snippetAround(text: string, word: string, size = 70): string {
  const i = norm(text).indexOf(norm(word));
  if (i < 0) return text.length > size ? text.slice(0, size).trimEnd() + ' …' : text;
  const start = Math.max(0, i - Math.round(size / 3));
  const out = text.slice(start, start + size).trim();
  return (start > 0 ? '… ' : '') + out + (start + size < text.length ? ' …' : '');
}

/**
 * Everything that contains all words of the query. Courses, decks, skills, exams, open to-dos, tools, files
 * and cards (front, back, tags, hint – a match in the question ranks first).
 */
export function searchAll(
  data: { courses: SCourse[]; decks: SDeck[]; skills?: SSkill[]; exams?: SExam[]; todos?: STodo[] },
  query: string,
  max: { cards: number; other: number } = { cards: 20, other: 6 },
): SearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = (s: string) => {
    const n = norm(s);
    return words.every((w) => n.includes(w));
  };
  const courseName = new Map(data.courses.map((c) => [c.id, c.name]));
  const courses: SearchHit[] = data.courses
    .filter((c) => all(c.name))
    .slice(0, max.other)
    .map((c) => ({ kind: 'course', id: c.id, title: c.name, sub: `${data.decks.filter((d) => d.courseId === c.id).length} Decks` }));
  const decks: SearchHit[] = data.decks
    .filter((d) => all(d.name))
    .slice(0, max.other)
    .map((d) => ({ kind: 'deck', id: d.id, title: d.name, sub: `${courseName.get(d.courseId) ?? ''} · ${d.cards.length} Karten` }));
  const skills: SearchHit[] = (data.skills ?? [])
    .filter((s) => all(`${s.title} ${s.topic}`))
    .slice(0, max.other)
    .map((s) => ({ kind: 'skill', id: s.id, title: s.title, sub: s.mini ? 'Mini-Skill' : 'Skill' }));
  const exams: SearchHit[] = (data.exams ?? [])
    .filter((e) => all(`${e.title} ${e.note ?? ''} ${e.date}`))
    .slice(0, max.other)
    .map((e) => ({ kind: 'exam', id: e.id, title: e.title, sub: `Prüfung am ${e.date}` }));
  const todos: SearchHit[] = (data.todos ?? [])
    .filter((t) => !t.doneAt && all(t.text))
    .slice(0, max.other)
    .map((t) => ({ kind: 'todo', id: t.id, title: t.text, sub: t.due ? `To-do · fällig ${t.due}` : 'Offenes To-do' }));
  const tools: SearchHit[] = SEARCHABLE_TOOLS.filter((t) => all(`${t.title} ${t.sub} ${t.keywords}`))
    .slice(0, 4)
    .map((t) => ({ kind: 'tool', id: t.id, title: t.title, sub: t.sub, route: t.route }));
  const files: SearchHit[] = data.decks
    .flatMap((d) => (d.files ?? []).filter((f) => all(f.name)).map((f) => ({ kind: 'file' as const, id: f.id, deckId: d.id, title: f.name, sub: d.name })))
    .slice(0, max.other);
  const cards: { hit: SearchHit; rank: number; i: number }[] = [];
  let i = 0;
  for (const d of data.decks)
    for (const c of d.cards) {
      const f = plain(c.front);
      const b = plain(c.back);
      const extra = [c.hint ? plain(c.hint) : '', ...(c.tags ?? [])].filter(Boolean).join(' ');
      const rank = all(f) ? 0 : all(`${f} ${b} ${extra}`) ? 1 : -1;
      if (rank < 0) continue;
      const term = words.reduce((a, w) => (w.length > a.length ? w : a), '');
      const snippetSrc = all(b) || !extra ? b : `${b}${extra ? ` · ${extra}` : ''}`;
      cards.push({ hit: { kind: 'card', id: c.id, deckId: d.id, title: f, sub: d.name, snippet: snippetAround(snippetSrc, term), term }, rank, i: i++ });
    }
  cards.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return [...courses, ...decks, ...skills, ...exams, ...todos, ...tools, ...files, ...cards.slice(0, max.cards).map((x) => x.hit)];
}

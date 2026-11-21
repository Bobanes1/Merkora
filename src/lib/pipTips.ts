/** Pip's short tips per area of the app – at most one per area and day, each tip once in turn. Pure choice – tested. */

export const PIP_TIPS: Record<string, string[]> = {
  start: [
    'Tipp: Der Ring rechts zeigt dein Tagesziel – außen die Karten, innen die Minuten.',
    'Mit Strg K findest du jede Karte, jedes Deck und jeden Kurs in Sekunden.',
    'Lieber jeden Tag 15 Minuten als einmal pro Woche drei Stunden – so bleibt mehr hängen.',
    'Tippe mich an, dann mache ich einen Salto.',
  ],
  library: [
    'Zieh eine PDF, Word- oder PowerPoint-Datei hierher – ich mache Karteikarten daraus.',
    'Gib jedem Deck ein eigenes Cover: im Deck oben auf das kleine Bild tippen.',
    'Die Pflanze neben einem Deck wächst, je besser du es kannst – bis sie blüht.',
    'Ordner helfen bei vielen Decks: Kurs öffnen und „Neuer Ordner“.',
  ],
  deck: [
    'Auf dem Handy kannst du Karten wischen: rechts = gewusst, links = nochmal.',
    'Im Lernpfad lernst du in kleinen Stationen mit Sternen – ideal für zwischendurch.',
    '„Prüfung üben“ macht eine Probeprüfung mit Note aus deinen Karten.',
    'Bei schwierigen Karten hilft „Verstehen“: Zusammenfassung und Mindmap.',
  ],
  skills: [
    'Skills sind für Themen ohne Karteikarten: Mathe, Programmieren, Jura, Musik …',
    'Zu schwer? In jeder Lektion gibt es „Einfacher erklären“.',
    'Nach jeder Stufe wartet ein Pokal: der Stufentest.',
  ],
  tools: [
    'In „Klänge“ findest du Regen, Meer oder ruhiges Klavier – mischbar und mit Timer.',
    'Die Arbeitsplanung teilt lange Aufgaben automatisch mit Pausen auf.',
    'In der To-do-Liste erkennt die Schnelleingabe „morgen 14:00 !hoch 30min“.',
    'Prüfungstermine eintragen lohnt sich: dann plant Merkora deine Wiederholungen.',
  ],
  stats: [
    'Für jeden Lernerfolg zieht jemand Neues in dein Aquarium – schau, was noch fehlt.',
    'Die Heatmap zeigt, an welchen Tagen du gelernt hast. Lücken sind okay – Hauptsache dranbleiben.',
  ],
  settings: [
    'Unter „Darstellung“ kannst du Effekte, Glas-Optik und Töne an- oder ausschalten.',
    'Mit Sync bleibt dein Lernstand auf Handy und PC gleich.',
  ],
};

export type TipMemory = Record<string, { day: string; next: number }>;

/** The tip to show now for an area, or null (already one today / no tips). Returns the new memory too. */
export function pickTip(area: string, mem: TipMemory, day: string): { text: string; mem: TipMemory } | null {
  const tips = PIP_TIPS[area];
  if (!tips?.length) return null;
  const m = mem[area];
  if (m?.day === day) return null;
  const i = (m?.next ?? 0) % tips.length;
  return { text: tips[i], mem: { ...mem, [area]: { day, next: i + 1 } } };
}

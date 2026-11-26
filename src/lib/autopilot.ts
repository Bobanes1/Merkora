/**
 * 100% offline "Heute zählt" Study Autopilot planner.
 * Combines exam urgency, FSRS forgetting risk R(t_exam), leeches, closed-loop exam retest boosts,
 * open skill lessons, and time-of-day strengths into one focused 15 / 30 / 60 minute session.
 * Pure – tested in scripts/test-srs.mts.
 */
import { timeOfDayStats } from './appExtras';
import { isLeech } from './cardLinks';
import { countdownText, examAt, examCards, upcomingExams } from './exams';
import { cardRetrievability } from './interference';
import { nextLesson, skillProgress } from './skills';
import { dueCards, type Card, type Data, type Deck } from './store';
import { DAY } from './util';

export type AutopilotBudget = 15 | 30 | 60;

export type AutopilotCardItem = {
  deckId: string;
  cardId: string;
  reason: 'exam' | 'retest' | 'leech' | 'due';
  priority: number;
};

export type AutopilotPlan = {
  budget: AutopilotBudget;
  cards: AutopilotCardItem[];
  counts: { exam: number; retest: number; leech: number; due: number };
  nextSkill?: { skillId: string; title: string; lessonTitle: string; pct: number };
  feynmanDeck?: { deckId: string; deckName: string; url: string };
  headline: string;
  rationale: string;
  timeHint?: string;
  estMinutes: number;
};

function cardPriority(card: Card, deck: Deck, isExamDeck: boolean, examTimestamp: number | null, now: number): { reason: AutopilotCardItem['reason']; priority: number } {
  const isDue = card.srs.due <= now;
  const leech = isLeech(card);
  const recentRetest = !!card.retestBoostAt && now - card.retestBoostAt < 7 * DAY;
  const rNow = cardRetrievability(card, now);
  const rTarget = examTimestamp ? cardRetrievability(card, examTimestamp) : rNow;

  if (recentRetest) return { reason: 'retest', priority: 100 + (1 - rNow) * 40 };
  if (isExamDeck && examTimestamp) {
    const daysLeft = Math.max(1, (examTimestamp - now) / DAY);
    const urgency = Math.min(40, 120 / daysLeft);
    return { reason: 'exam', priority: 70 + urgency + (1 - rTarget) * 50 + (isDue ? 15 : 0) };
  }
  if (leech) return { reason: 'leech', priority: 60 + card.srs.lapses * 4 + (isDue ? 20 : 0) };
  return { reason: 'due', priority: (isDue ? 45 : 10) + (1 - rNow) * 35 };
}

/**
 * Builds a balanced, zero-API-cost study plan for `budget` minutes (15, 30 or 60).
 */
export function buildAutopilotPlan(data: Data, budget: AutopilotBudget = 30, now = Date.now()): AutopilotPlan {
  const activeDecks = data.decks.filter((d) => !d.archived && d.cards.some((c) => !c.suspended));
  const exams = upcomingExams(data, now);
  const nextExam = exams[0];
  const nextExamTime = nextExam ? examAt(nextExam) : null;
  const examDeckIds = new Set<string>();
  if (nextExam) {
    for (const pair of examCards(data, nextExam)) examDeckIds.add(pair.deck.id);
  }

  // Approximate pace: ~2.4 cards/min (leaving breathing room for skills / reflection)
  const cardCap = budget === 15 ? 20 : budget === 30 ? 40 : 75;
  const candidates: AutopilotCardItem[] = [];

  for (const deck of activeDecks) {
    const dueSet = new Set(dueCards(deck, now).map((c) => c.id));
    const isExamDeck = examDeckIds.has(deck.id);
    for (const card of deck.cards) {
      if (card.suspended) continue;
      const include =
        dueSet.has(card.id) ||
        (!!card.retestBoostAt && now - card.retestBoostAt < 7 * DAY) ||
        (isExamDeck && cardRetrievability(card, nextExamTime ?? now) < 0.8) ||
        (isLeech(card) && cardRetrievability(card, now) < 0.78);
      if (!include) continue;
      const { reason, priority } = cardPriority(card, deck, isExamDeck, isExamDeck ? nextExamTime : null, now);
      candidates.push({ deckId: deck.id, cardId: card.id, reason, priority });
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const picked = candidates.slice(0, cardCap);
  const counts = { exam: 0, retest: 0, leech: 0, due: 0 };
  for (const item of picked) counts[item.reason]++;

  // Pick next active skill lesson if any exists
  const activeSkill = [...(data.skills ?? [])]
    .filter((s) => s.status === 'active')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const nl = activeSkill ? nextLesson(activeSkill) : null;
  const nextSkill =
    activeSkill && nl
      ? {
          skillId: activeSkill.id,
          title: activeSkill.title,
          lessonTitle: nl.lesson.title,
          pct: skillProgress(activeSkill).pct,
        }
      : undefined;

  // Recommend a Feynman explanation deck (preferring exam deck or most-lapsed active deck)
  const feynmanTarget =
    (nextExam && activeDecks.find((d) => examDeckIds.has(d.id))) ||
    [...activeDecks].sort((a, b) => b.cards.filter(isLeech).length - a.cards.filter(isLeech).length)[0];
  let feynmanDeck: AutopilotPlan['feynmanDeck'];
  if (feynmanTarget) {
    const course = data.courses.find((c) => c.id === feynmanTarget.courseId);
    const ws = course ? data.workspaces.find((w) => w.id === course.workspaceId) : undefined;
    const url = ws && course ? `/library/${ws.slug}/${course.slug}/${feynmanTarget.slug}?tab=feynman` : '/library';
    feynmanDeck = { deckId: feynmanTarget.id, deckName: feynmanTarget.name, url };
  }

  // Time-of-day strength hint from user's real review history
  const tod = timeOfDayStats(data.reviews).filter((x) => x.total >= 8 && x.percent !== null);
  const bestTod = tod.length ? [...tod].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0] : null;
  const timeHint = bestTod ? `Deine stärkste Lernzeit: ${bestTod.label} (${bestTod.percent} % richtig)` : undefined;

  // Human-readable headline & rationale
  let headline = 'Heute zählt: dein fokussierter Lern-Mix';
  const parts: string[] = [];
  if (nextExam) {
    headline = `Fokus auf „${nextExam.title}“ (${countdownText(nextExam, now)})`;
    if (counts.exam > 0) parts.push(`${counts.exam} Prüfungs-Karten`);
  }
  if (counts.retest > 0) parts.push(`${counts.retest} aus letzter Probeprüfung`);
  if (counts.leech > 0) parts.push(`${counts.leech} Problemkarten`);
  if (counts.due > 0) parts.push(`${counts.due} fällige Wiederholungen`);
  if (nextSkill) parts.push(`1 Skill-Lektion`);

  const rationale = parts.length
    ? parts.join(' · ')
    : 'Alles aktuell im grünen Bereich – ideal für eine kurze Feynman-Erklärung oder neue Karten.';

  const estMinutes = Math.min(budget, Math.max(picked.length ? 3 : 0, Math.round(picked.length / 2.4) + (nextSkill ? 6 : 0)));

  return {
    budget,
    cards: picked,
    counts,
    nextSkill,
    feynmanDeck,
    headline,
    rationale,
    timeHint,
    estMinutes,
  };
}

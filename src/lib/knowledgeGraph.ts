/**
 * 100% offline Knowledge Graph & Forgetting-Radar engine for a course/module (or whole library).
 * Builds concept nodes from decks, mindmaps, tags, and linked skills, connects related concepts,
 * and projects FSRS recall probability R(t) to any future date (e.g. exam day).
 * Pure – tested in scripts/test-srs.mts.
 */
import { cardRetrievability, cleanCardText } from './interference';
import { skillProgress } from './skills';
import type { Card, Data, Deck } from './store';

export type GraphNodeKind = 'deck' | 'topic' | 'skill';

export type GraphNode = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  deckId?: string;
  skillId?: string;
  cardRefs: { deckId: string; cardId: string }[];
  /** Projected recall probability 0..100 at target timestamp `at`. */
  retention: number;
  /** Number of cards / lessons represented by this node. */
  weight: number;
  /** Initial deterministic layout coordinates in [-1, 1]. */
  x: number;
  y: number;
};

export type GraphEdge = {
  from: string;
  to: string;
  strength: number; // 1..3
};

export type KnowledgeGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  avgRetention: number;
  atRiskNodes: number;
  atRiskCards: { deckId: string; cardId: string }[];
};

const normKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const hashAngle = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 3600) * ((Math.PI * 2) / 3600);
};

function termsOfCard(c: Card): Set<string> {
  const txt = `${cleanCardText(c.front)} ${cleanCardText(c.back)} ${(c.tags ?? []).join(' ')}`.toLowerCase();
  const words = txt.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
  return new Set(words);
}

/**
 * Builds an interactive concept graph for a course (or all active decks if `courseId` is omitted)
 * with FSRS recall probabilities projected to `targetAt`.
 */
export function buildCourseGraph(data: Data, courseId?: string, targetAt = Date.now()): KnowledgeGraph {
  const decks: Deck[] = data.decks.filter((d) => !d.archived && (!courseId || d.courseId === courseId));
  const skills = (data.skills ?? []).filter((s) => s.status !== 'archived' && (!courseId || s.courseId === courseId));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  const addEdge = (from: string, to: string, strength = 1) => {
    if (from === to) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from, to, strength });
  };

  // Precompute token sets for cross-deck / skill linking
  const cardTokens = new Map<string, Set<string>>();
  const deckCardList: { deck: Deck; active: Card[] }[] = decks.map((deck) => {
    const active = deck.cards.filter((c) => !c.suspended);
    for (const c of active) cardTokens.set(`${deck.id}:${c.id}`, termsOfCard(c));
    return { deck, active };
  });

  const deckCount = Math.max(1, deckCardList.length);
  deckCardList.forEach(({ deck, active }, di) => {
    const baseAngle = (di / deckCount) * Math.PI * 2 - Math.PI / 2;
    const deckRadius = deckCount === 1 ? 0 : 0.42;
    const dx = Math.cos(baseAngle) * deckRadius;
    const dy = Math.sin(baseAngle) * deckRadius;
    const deckRet = active.length
      ? Math.round((active.reduce((sum, c) => sum + cardRetrievability(c, targetAt), 0) / active.length) * 100)
      : 50;

    const deckNodeId = `deck:${deck.id}`;
    nodes.push({
      id: deckNodeId,
      label: deck.name,
      kind: 'deck',
      deckId: deck.id,
      cardRefs: active.map((c) => ({ deckId: deck.id, cardId: c.id })),
      retention: deckRet,
      weight: Math.max(1, active.length),
      x: dx,
      y: dy,
    });

    // Extract up to 6 concept sub-nodes per deck from mindmap branches or tags
    const topicDefs: { label: string; cards: Card[] }[] = [];
    if (deck.mindmap?.type === 'mindmap' && deck.mindmap.branches?.length) {
      for (const br of deck.mindmap.branches.slice(0, 6)) {
        const keywords = [br.label, ...br.children]
          .join(' ')
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((w) => w.length >= 4);
        const matched = active.filter((c) => {
          const ts = cardTokens.get(`${deck.id}:${c.id}`);
          return ts && keywords.some((k) => ts.has(k));
        });
        topicDefs.push({ label: br.label, cards: matched.length ? matched : active.slice(0, 3) });
      }
    } else {
      // Group by tags if available
      const byTag = new Map<string, Card[]>();
      for (const c of active) {
        for (const t of c.tags ?? []) {
          const clean = t.trim();
          if (!clean || clean === 'Tutor') continue;
          const arr = byTag.get(clean) ?? [];
          arr.push(c);
          byTag.set(clean, arr);
        }
      }
      const tagEntries = [...byTag.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
      for (const [label, cards] of tagEntries) topicDefs.push({ label, cards });
    }

    topicDefs.forEach((tp, ti) => {
      const spread = (ti / Math.max(1, topicDefs.length)) * Math.PI * 2 + baseAngle + 0.35;
      const dist = deckCount === 1 ? 0.56 : 0.32;
      const ret = tp.cards.length
        ? Math.round((tp.cards.reduce((s, c) => s + cardRetrievability(c, targetAt), 0) / tp.cards.length) * 100)
        : deckRet;
      const tid = `topic:${deck.id}:${ti}`;
      nodes.push({
        id: tid,
        label: tp.label,
        kind: 'topic',
        deckId: deck.id,
        cardRefs: tp.cards.map((c) => ({ deckId: deck.id, cardId: c.id })),
        retention: ret,
        weight: Math.max(1, tp.cards.length),
        x: dx + Math.cos(spread) * dist,
        y: dy + Math.sin(spread) * dist,
      });
      addEdge(deckNodeId, tid, 2);
    });
  });

  // Add linked Skills as interactive nodes
  skills.forEach((sk, si) => {
    const prog = skillProgress(sk);
    const angle = hashAngle(sk.id) + si * 0.4;
    const skId = `skill:${sk.id}`;
    const skWords = new Set(normKey(`${sk.title} ${sk.goal}`).split(' ').filter((w) => w.length >= 4));
    nodes.push({
      id: skId,
      label: sk.title,
      kind: 'skill',
      skillId: sk.id,
      cardRefs: [],
      retention: prog.pct,
      weight: Math.max(2, prog.total),
      x: Math.cos(angle) * 0.78,
      y: Math.sin(angle) * 0.78,
    });
    // Connect skill to matching decks or topics
    for (const n of nodes) {
      if (n.kind === 'skill') continue;
      const nWords = normKey(n.label).split(' ').filter((w) => w.length >= 4);
      if (nWords.some((w) => skWords.has(w))) addEdge(skId, n.id, 2);
    }
  });

  // Cross-link nodes across different decks when labels/keywords overlap
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const aWords = new Set(normKey(a.label).split(' ').filter((w) => w.length >= 4));
    if (!aWords.size) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (a.deckId && a.deckId === b.deckId) continue;
      const bWords = normKey(b.label).split(' ').filter((w) => w.length >= 4);
      const overlap = bWords.filter((w) => aWords.has(w)).length;
      if (overlap >= 1) addEdge(a.id, b.id, Math.min(3, overlap + 1));
    }
  }

  // Compute at-risk cards (R(targetAt) < 65%) deduplicated
  const riskMap = new Map<string, { deckId: string; cardId: string; r: number }>();
  for (const { deck, active } of deckCardList) {
    for (const c of active) {
      const r = cardRetrievability(c, targetAt);
      if (r < 0.65) riskMap.set(`${deck.id}:${c.id}`, { deckId: deck.id, cardId: c.id, r });
    }
  }
  const atRiskCards = [...riskMap.values()]
    .sort((a, b) => a.r - b.r)
    .map(({ deckId, cardId }) => ({ deckId, cardId }));

  const avgRetention = nodes.length ? Math.round(nodes.reduce((s, n) => s + n.retention, 0) / nodes.length) : 0;
  const atRiskNodes = nodes.filter((n) => n.retention < 65).length;

  return { nodes, edges, avgRetention, atRiskNodes, atRiskCards };
}

/** Extracts deduplicated card refs from nodes below `threshold` percent recall probability. */
export function atRiskCardIds(graph: KnowledgeGraph, threshold = 65): { deckId: string; cardId: string }[] {
  const seen = new Set<string>();
  const out: { deckId: string; cardId: string }[] = [];
  for (const n of graph.nodes) {
    if (n.retention >= threshold) continue;
    for (const ref of n.cardRefs) {
      const k = `${ref.deckId}:${ref.cardId}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(ref);
      }
    }
  }
  return out.length ? out : graph.atRiskCards;
}

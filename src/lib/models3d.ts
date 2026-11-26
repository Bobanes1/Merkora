/**
 * Pure 3D mathematical geometry & educational 3D scene generator for Merkora's Interactive 3D Studio.
 * Zero external dependencies: perspective projection, Euler orbit rotation, Phong/Lambert lighting helpers,
 * and 8 scientifically accurate interactive 3D models across Biology, Chemistry, Physics, Astronomy & Math.
 * Pure – tested in scripts/test-srs.mts.
 */

export type Vec3 = [number, number, number];

export type Model3DCat = 'Biologie' | 'Chemie' | 'Physik' | 'Astronomie' | 'Mathematik';

export type Sphere3D = {
  kind: 'sphere';
  pos: Vec3;
  r: number;
  color: string;
  alpha?: number;
  glow?: boolean;
  label?: string;
  partId?: string;
  layer?: string;
  explode?: Vec3;
  ring?: { rInner: number; rOuter: number; color: string; tilt: number };
};

export type Bond3D = {
  kind: 'bond';
  a: Vec3;
  b: Vec3;
  radius: number;
  color: string;
  double?: boolean;
  alpha?: number;
  partId?: string;
  layer?: string;
  explode?: Vec3;
};

export type Curve3D = {
  kind: 'curve';
  pts: Vec3[];
  width: number;
  color: string;
  alpha?: number;
  dashed?: boolean;
  partId?: string;
  layer?: string;
  explode?: Vec3;
};

export type Face3D = {
  kind: 'face';
  pts: Vec3[];
  fill: string;
  stroke?: string;
  alpha?: number;
  partId?: string;
  layer?: string;
  explode?: Vec3;
};

export type Primitive3D = Sphere3D | Bond3D | Curve3D | Face3D;

export type Hotspot3D = {
  id: string;
  label: string;
  note: string;
  pos: Vec3;
  color: string;
  layer?: string;
};

export type Model3DLayer = { id: string; label: string; color: string };

export type Model3DScene = {
  primitives: Primitive3D[];
  hotspots: Hotspot3D[];
  layerExplode?: Record<string, Vec3>;
};

export type Model3DVariant = { id: string; label: string; subtitle: string };

export type Model3DDef = {
  id: string;
  title: string;
  category: Model3DCat;
  summary: string;
  defaultRot: [number, number]; // [rotX, rotY] in radians
  variants?: Model3DVariant[];
  layers?: Model3DLayer[];
  build: (t: number, variantId?: string) => Model3DScene;
};

// ---------- Pure 3D Math ----------

/** Rotates a 3D point around Y (yaw) then X (pitch). */
export function rotate3D([x, y, z]: Vec3, rotX: number, rotY: number): Vec3 {
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const y2 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  return [x1, y2, z2];
}

/** Projects a rotated 3D point into 2D screen coordinates + scale factor. */
export function project3D(
  [x, y, z]: Vec3,
  cx: number,
  cy: number,
  fov = 420,
  camDist = 5.4,
  zoom = 1,
): { x: number; y: number; z: number; scale: number } {
  const dz = Math.max(0.6, camDist - z);
  const scale = (fov * zoom) / dz;
  return { x: cx + x * scale, y: cy - y * scale, z, scale };
}

/** Computes unit normal for a polygon face (for Lambert directional lighting). */
export function faceNormal(pts: Vec3[]): Vec3 {
  if (pts.length < 3) return [0, 0, 1];
  const [ax, ay, az] = pts[0];
  const [bx, by, bz] = pts[1];
  const [cx, cy, cz] = pts[2];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// ---------- Scene Builders (8 rich interactive models) ----------

function buildDna(t: number): Model3DScene {
  const primitives: Primitive3D[] = [];
  const strandA: Vec3[] = [];
  const strandB: Vec3[] = [];
  const rungs = 14;
  const radius = 0.78;
  const height = 3.2;

  for (let i = 0; i < rungs; i++) {
    const u = i / (rungs - 1);
    const y = (u - 0.5) * height;
    const ang = u * Math.PI * 3.1 + t * 0.25;
    const ax = Math.cos(ang) * radius;
    const az = Math.sin(ang) * radius;
    const bx = -ax;
    const bz = -az;
    const pA: Vec3 = [ax, y, az];
    const pB: Vec3 = [bx, y, bz];
    strandA.push(pA);
    strandB.push(pB);

    const isAT = i % 2 === 0;
    const col1 = isAT ? '#16a39a' : '#3b82f6';
    const col2 = isAT ? '#f59e0b' : '#e11d74';
    const mid: Vec3 = [0, y, 0];

    primitives.push(
      { kind: 'bond', a: pA, b: mid, radius: 0.055, color: col1, partId: isAT ? 'at' : 'gc' },
      { kind: 'bond', a: mid, b: pB, radius: 0.055, color: col2, partId: isAT ? 'at' : 'gc' },
      { kind: 'sphere', pos: pA, r: 0.115, color: '#8b5cf6', partId: 'backbone' },
      { kind: 'sphere', pos: pB, r: 0.115, color: '#8b5cf6', partId: 'backbone' },
    );
  }
  primitives.push(
    { kind: 'curve', pts: strandA, width: 5, color: '#7c3aed', partId: 'backbone' },
    { kind: 'curve', pts: strandB, width: 5, color: '#a855f7', partId: 'backbone' },
  );

  const hotspots: Hotspot3D[] = [
    { id: 'backbone', label: 'Zucker-Phosphat-Rückgrat', note: 'Zwei gegenläufige (antiparallele) Stränge aus Desoxyribose und Phosphatgruppen geben der DNA Stabilität.', pos: strandA[11], color: '#8b5cf6' },
    { id: 'at', label: 'Adenin – Thymin (A–T)', note: 'Komplementäres Basenpaar, verbunden über 2 Wasserstoffbrückenbindungen.', pos: [0, 0.25, 0], color: '#16a39a' },
    { id: 'gc', label: 'Guanin – Cytosin (G–C)', note: 'Komplementäres Basenpaar, besonders stabil dank 3 Wasserstoffbrückenbindungen.', pos: [0, -0.45, 0], color: '#e11d74' },
  ];
  return { primitives, hotspots };
}

function buildMolecules(_t: number, variantId = 'h2o'): Model3DScene {
  const primitives: Primitive3D[] = [];
  const hotspots: Hotspot3D[] = [];

  if (variantId === 'ch4') {
    // Methane CH4: exact tetrahedral angle 109.47°
    const d = 0.85;
    const c: Vec3 = [0, 0, 0];
    const h: Vec3[] = [
      [d, d, d],
      [d, -d, -d],
      [-d, d, -d],
      [-d, -d, d],
    ];
    primitives.push({ kind: 'sphere', pos: c, r: 0.44, color: '#475569', label: 'C', partId: 'c' });
    for (const p of h) {
      primitives.push(
        { kind: 'bond', a: c, b: p, radius: 0.08, color: '#94a3b8', partId: 'bond' },
        { kind: 'sphere', pos: p, r: 0.26, color: '#e2e8f0', label: 'H', partId: 'h' },
      );
    }
    hotspots.push(
      { id: 'c', label: 'Kohlenstoff (C)', note: 'sp³-hybridisiert: bildet 4 gleichwertige kovalente Einfachbindungen in Tetraeder-Geometrie.', pos: c, color: '#475569' },
      { id: 'h', label: 'Wasserstoff (4× H)', note: 'Bindungswinkel exakt 109,5° — maximaler Abstand der Elektronenpaare (VSEPR-Modell).', pos: h[0], color: '#38bdf8' },
    );
  } else if (variantId === 'co2') {
    // CO2: linear 180° with double bonds
    const c: Vec3 = [0, 0, 0];
    const o1: Vec3 = [-1.45, 0, 0];
    const o2: Vec3 = [1.45, 0, 0];
    primitives.push(
      { kind: 'bond', a: c, b: o1, radius: 0.075, color: '#94a3b8', double: true, partId: 'double' },
      { kind: 'bond', a: c, b: o2, radius: 0.075, color: '#94a3b8', double: true, partId: 'double' },
      { kind: 'sphere', pos: c, r: 0.42, color: '#475569', label: 'C', partId: 'c' },
      { kind: 'sphere', pos: o1, r: 0.38, color: '#ef4444', label: 'O', partId: 'o' },
      { kind: 'sphere', pos: o2, r: 0.38, color: '#ef4444', label: 'O', partId: 'o' },
    );
    hotspots.push(
      { id: 'c', label: 'Zentralatom C (180°)', note: 'Linear gebaut (sp-hybridisiert): die beiden Dipolmomente heben sich gegenseitig auf → unpolares Molekül!', pos: c, color: '#475569' },
      { id: 'double', label: 'Doppelbindungen (O=C=O)', note: 'Zwei polare C=O-Doppelbindungen (je eine σ- und eine π-Bindung).', pos: [0.72, 0.16, 0], color: '#ef4444' },
    );
  } else if (variantId === 'benzol') {
    // Benzene C6H6: planar regular hexagon (120°) + delocalized pi ring
    const rC = 1.05;
    const rH = 1.78;
    const cPts: Vec3[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      const cp: Vec3 = [Math.cos(ang) * rC, 0, Math.sin(ang) * rC];
      const hp: Vec3 = [Math.cos(ang) * rH, 0, Math.sin(ang) * rH];
      cPts.push(cp);
      primitives.push(
        { kind: 'sphere', pos: cp, r: 0.28, color: '#475569', label: 'C', partId: 'ring' },
        { kind: 'bond', a: cp, b: hp, radius: 0.055, color: '#94a3b8', partId: 'h' },
        { kind: 'sphere', pos: hp, r: 0.18, color: '#e2e8f0', label: 'H', partId: 'h' },
      );
    }
    for (let i = 0; i < 6; i++) {
      primitives.push({ kind: 'bond', a: cPts[i], b: cPts[(i + 1) % 6], radius: 0.075, color: '#cbd5e1', partId: 'ring' });
    }
    // Delocalized pi-electron clouds above and below the ring
    const piTop: Vec3[] = [];
    const piBot: Vec3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      piTop.push([Math.cos(a) * 0.72, 0.34, Math.sin(a) * 0.72]);
      piBot.push([Math.cos(a) * 0.72, -0.34, Math.sin(a) * 0.72]);
    }
    primitives.push(
      { kind: 'curve', pts: piTop, width: 3.5, color: '#a855f7', alpha: 0.78, dashed: true, partId: 'pi' },
      { kind: 'curve', pts: piBot, width: 3.5, color: '#a855f7', alpha: 0.78, dashed: true, partId: 'pi' },
    );
    hotspots.push(
      { id: 'ring', label: 'Sechsring (120°)', note: 'Alle 6 C–C-Bindungen sind exakt gleich lang (Mesomerie zwischen Einfach- und Doppelbindung).', pos: cPts[0], color: '#475569' },
      { id: 'pi', label: 'Delokalisierte π-Elektronen', note: '6 π-Elektronen schweben frei über und unter der Ringebene → hohe aromatische Stabilität (Hückel-Regel).', pos: [0, 0.38, 0.7], color: '#a855f7' },
    );
  } else if (variantId === 'ethanol') {
    // Ethanol CH3-CH2-OH
    const c1: Vec3 = [-0.92, -0.1, 0];
    const c2: Vec3 = [0.05, 0.36, 0.12];
    const o: Vec3 = [1.0, -0.12, -0.1];
    const ho: Vec3 = [1.58, 0.38, -0.22];
    const hs: [Vec3, Vec3][] = [
      [c1, [-1.52, 0.48, 0.36]],
      [c1, [-1.18, -0.45, -0.82]],
      [c1, [-0.88, -0.85, 0.62]],
      [c2, [0.05, 1.15, -0.28]],
      [c2, [0.05, 0.56, 0.98]],
    ];
    primitives.push(
      { kind: 'bond', a: c1, b: c2, radius: 0.08, color: '#94a3b8', partId: 'alkyl' },
      { kind: 'bond', a: c2, b: o, radius: 0.08, color: '#94a3b8', partId: 'oh' },
      { kind: 'bond', a: o, b: ho, radius: 0.075, color: '#fca5a5', partId: 'oh' },
      { kind: 'sphere', pos: c1, r: 0.34, color: '#475569', label: 'C', partId: 'alkyl' },
      { kind: 'sphere', pos: c2, r: 0.34, color: '#475569', label: 'C', partId: 'alkyl' },
      { kind: 'sphere', pos: o, r: 0.36, color: '#ef4444', label: 'O', partId: 'oh' },
      { kind: 'sphere', pos: ho, r: 0.21, color: '#e2e8f0', label: 'H', partId: 'oh' },
    );
    for (const [a, b] of hs) {
      primitives.push(
        { kind: 'bond', a, b, radius: 0.055, color: '#94a3b8', partId: 'alkyl' },
        { kind: 'sphere', pos: b, r: 0.2, color: '#e2e8f0', label: 'H', partId: 'alkyl' },
      );
    }
    hotspots.push(
      { id: 'oh', label: 'Hydroxylgruppe (–OH)', note: 'Polar & hydrophil: bildet Wasserstoffbrücken mit Wasser → Ethanol ist vollständig wasserlöslich.', pos: o, color: '#ef4444' },
      { id: 'alkyl', label: 'Ethylrest (–CH₂–CH₃)', note: 'Unpolarer, lipophiler Kohlenwasserstoff-Rest → löst auch Fette und unpolare Stoffe.', pos: c1, color: '#475569' },
    );
  } else if (variantId === 'caffeine') {
    // Caffeine (C8H10N4O2) purine double-ring skeleton
    const atoms: { pos: Vec3; el: 'C' | 'N' | 'O'; part: string }[] = [
      { pos: [-0.95, 0.42, 0], el: 'N', part: 'purine' },
      { pos: [-0.95, -0.45, 0], el: 'C', part: 'purine' },
      { pos: [-0.15, -0.88, 0], el: 'N', part: 'purine' },
      { pos: [0.58, -0.42, 0], el: 'C', part: 'purine' },
      { pos: [0.58, 0.45, 0], el: 'C', part: 'purine' },
      { pos: [-0.18, 0.88, 0], el: 'C', part: 'purine' },
      // 5-membered imidazole ring
      { pos: [1.38, 0.68, 0], el: 'N', part: 'purine' },
      { pos: [1.84, 0.0, 0], el: 'C', part: 'purine' },
      { pos: [1.38, -0.68, 0], el: 'N', part: 'purine' },
      // Two carbonyl oxygens
      { pos: [-1.62, -0.88, 0.08], el: 'O', part: 'carbonyl' },
      { pos: [-0.18, 1.64, 0.08], el: 'O', part: 'carbonyl' },
      // Three methyl groups (CH3)
      { pos: [-1.72, 0.88, -0.14], el: 'C', part: 'methyl' },
      { pos: [-0.15, -1.68, -0.14], el: 'C', part: 'methyl' },
      { pos: [1.66, 1.44, -0.12], el: 'C', part: 'methyl' },
    ];
    const bonds: [number, number, boolean?][] = [
      [0, 1], [1, 2], [2, 3], [3, 4, true], [4, 5], [5, 0],
      [4, 6], [6, 7], [7, 8, true], [8, 3],
      [1, 9, true], [5, 10, true],
      [0, 11], [2, 12], [6, 13],
    ];
    for (const [i, j, dbl] of bonds) {
      primitives.push({ kind: 'bond', a: atoms[i].pos, b: atoms[j].pos, radius: 0.055, color: '#94a3b8', double: dbl, partId: atoms[j].part });
    }
    for (const a of atoms) {
      const col = a.el === 'N' ? '#3b82f6' : a.el === 'O' ? '#ef4444' : '#475569';
      primitives.push({ kind: 'sphere', pos: a.pos, r: a.el === 'O' ? 0.24 : 0.22, color: col, label: a.el, partId: a.part });
    }
    hotspots.push(
      { id: 'purine', label: 'Purin-Doppelring', note: 'Ähnelt dem körpereigenen Adenosin → Koffein blockiert Adenosin-Rezeptoren im Gehirn und verhindert Müdigkeit.', pos: [0.58, 0.0, 0], color: '#3b82f6' },
      { id: 'carbonyl', label: 'Carbonylgruppen (C=O)', note: 'Zwei polare Sauerstoff-Doppelbindungen sorgen für gute Bindung am Rezeptor.', pos: [-0.18, 1.64, 0.08], color: '#ef4444' },
      { id: 'methyl', label: '3 Methylgruppen (–CH₃)', note: 'Machen Koffein (1,3,7-Trimethylxanthin) fettlöslich genug, um die Blut-Hirn-Schranke rasch zu passieren.', pos: [-1.72, 0.88, -0.14], color: '#475569' },
    );
  } else {
    // Water H2O: bent 104.5° + lone pairs
    const half = (104.5 * Math.PI) / 360;
    const len = 1.25;
    const o: Vec3 = [0, 0.25, 0];
    const h1: Vec3 = [-Math.sin(half) * len, 0.25 - Math.cos(half) * len, 0];
    const h2: Vec3 = [Math.sin(half) * len, 0.25 - Math.cos(half) * len, 0];
    const lp1: Vec3 = [0, 0.92, 0.52];
    const lp2: Vec3 = [0, 0.92, -0.52];
    primitives.push(
      { kind: 'bond', a: o, b: h1, radius: 0.085, color: '#94a3b8', partId: 'bond' },
      { kind: 'bond', a: o, b: h2, radius: 0.085, color: '#94a3b8', partId: 'bond' },
      { kind: 'sphere', pos: o, r: 0.48, color: '#ef4444', label: 'O', partId: 'o' },
      { kind: 'sphere', pos: h1, r: 0.3, color: '#e2e8f0', label: 'H', partId: 'h' },
      { kind: 'sphere', pos: h2, r: 0.3, color: '#e2e8f0', label: 'H', partId: 'h' },
      { kind: 'sphere', pos: lp1, r: 0.24, color: '#a855f7', alpha: 0.38, glow: true, partId: 'lone' },
      { kind: 'sphere', pos: lp2, r: 0.24, color: '#a855f7', alpha: 0.38, glow: true, partId: 'lone' },
    );
    hotspots.push(
      { id: 'o', label: 'Sauerstoff (δ−)', note: 'Stark elektronegativ: zieht Bindungselektronen an und trägt zwei freie Elektronenpaare.', pos: o, color: '#ef4444' },
      { id: 'h', label: 'Wasserstoff (δ+)', note: 'Gewinkelter Bau (104,5°) macht Wasser zu einem starken Dipol → Wasserstoffbrücken & hoher Siedepunkt!', pos: h2, color: '#38bdf8' },
      { id: 'lone', label: 'Freie Elektronenpaare', note: 'Drücken die beiden H-Atome von 109,5° auf 104,5° zusammen.', pos: lp1, color: '#a855f7' },
    );
  }

  return { primitives, hotspots };
}

function buildCell(t: number): Model3DScene {
  const primitives: Primitive3D[] = [];
  // Translucent outer plasma membrane + cutaway equator
  primitives.push({ kind: 'sphere', pos: [0, 0, 0], r: 1.55, color: '#0ea5e9', alpha: 0.16, partId: 'membrane' });
  const eq: Vec3[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    eq.push([Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55]);
  }
  primitives.push({ kind: 'curve', pts: eq, width: 2, color: '#38bdf8', alpha: 0.45, dashed: true, partId: 'membrane' });

  // Nucleus & Nucleolus
  primitives.push(
    { kind: 'sphere', pos: [-0.15, 0.15, 0], r: 0.56, color: '#8b5cf6', alpha: 0.85, glow: true, partId: 'nucleus' },
    { kind: 'sphere', pos: [-0.1, 0.2, 0.1], r: 0.22, color: '#c084fc', partId: 'nucleus' },
  );

  // Mitochondria (capsules made of thick bonds + end caps)
  const mitos: [Vec3, Vec3][] = [
    [[0.75, -0.35, 0.45], [1.05, -0.1, 0.55]],
    [[-0.85, -0.55, -0.3], [-0.55, -0.78, -0.45]],
    [[0.45, 0.78, -0.45], [0.8, 0.62, -0.35]],
  ];
  for (const [a, b] of mitos) {
    primitives.push(
      { kind: 'bond', a, b, radius: 0.17, color: '#f97316', partId: 'mito' },
      { kind: 'sphere', pos: a, r: 0.17, color: '#fb923c', partId: 'mito' },
      { kind: 'sphere', pos: b, r: 0.17, color: '#ea580c', partId: 'mito' },
    );
  }

  // Endoplasmic Reticulum ribbon wrapping around nucleus
  const erPts: Vec3[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 1.65 - 0.5;
    erPts.push([-0.15 + Math.cos(a) * 0.82, 0.12 + Math.sin(a * 2) * 0.25, Math.sin(a) * 0.82]);
  }
  primitives.push({ kind: 'curve', pts: erPts, width: 5.5, color: '#14b8a6', alpha: 0.88, partId: 'er' });

  // Gently drifting ribosomes
  const riboSeeds: Vec3[] = [
    [-0.9, 0.55, 0.4],
    [0.2, -0.95, 0.35],
    [0.85, 0.15, -0.75],
    [-0.35, 0.92, -0.35],
    [0.1, -0.4, -0.95],
    [-0.65, -0.1, 0.85],
  ];
  riboSeeds.forEach(([x, y, z], idx) => {
    const bob = Math.sin(t * 1.6 + idx) * 0.04;
    primitives.push({ kind: 'sphere', pos: [x, y + bob, z], r: 0.075, color: '#facc15', partId: 'ribo' });
  });

  const hotspots: Hotspot3D[] = [
    { id: 'nucleus', label: 'Zellkern (Nukleus)', note: 'Steuerzentrale der Zelle: enthält die DNA-Erbinformation und steuert Zellteilung & Genexpression.', pos: [-0.15, 0.15, 0], color: '#8b5cf6' },
    { id: 'mito', label: 'Mitochondrien', note: '„Kraftwerke der Zelle“: erzeugen durch Zellatmung den universellen Energieträger ATP.', pos: [0.9, -0.22, 0.5], color: '#f97316' },
    { id: 'er', label: 'Endoplasmatisches Retikulum', note: 'Membransystem rund um den Kern für Proteinfaltung (raues ER) und Lipidsynthese (glattes ER).', pos: [0.6, 0.25, 0.3], color: '#14b8a6' },
    { id: 'membrane', label: 'Zellmembran', note: 'Selektiv permeable Phospholipid-Doppelschicht: grenzt die Zelle ab und regelt den Stofftransport.', pos: [1.5, 0, 0], color: '#38bdf8' },
  ];
  return { primitives, hotspots };
}

function buildHeart(t: number): Model3DScene {
  // Subtle physiological double-beat pulse (lub-dub)
  const phase = (t * 1.15) % 1;
  const pulse = 1 + (phase < 0.16 ? Math.sin((phase / 0.16) * Math.PI) * 0.075 : phase > 0.24 && phase < 0.38 ? Math.sin(((phase - 0.24) / 0.14) * Math.PI) * 0.045 : 0);

  const primitives: Primitive3D[] = [
    // Right atrium & right ventricle (oxygen-poor -> blue-teal)
    { kind: 'sphere', pos: [-0.52 * pulse, 0.32 * pulse, 0.15], r: 0.44 * pulse, color: '#3b82f6', partId: 'right' },
    { kind: 'sphere', pos: [-0.36 * pulse, -0.38 * pulse, 0.22], r: 0.52 * pulse, color: '#2563eb', partId: 'right' },
    // Left atrium & left ventricle (oxygen-rich -> crimson/red)
    { kind: 'sphere', pos: [0.46 * pulse, 0.36 * pulse, -0.05], r: 0.43 * pulse, color: '#f43f5e', partId: 'left' },
    { kind: 'sphere', pos: [0.28 * pulse, -0.45 * pulse, 0.05], r: 0.58 * pulse, color: '#dc2626', partId: 'left' },
    // Apex tip
    { kind: 'sphere', pos: [0.06 * pulse, -0.92 * pulse, 0.12], r: 0.32 * pulse, color: '#b91c1c', partId: 'left' },
    // Aortic arch (red curved vessel)
    {
      kind: 'curve',
      pts: [
        [0.15, 0.25, 0.05],
        [0.12, 0.98, 0.1],
        [0.42, 1.32, -0.05],
        [0.62, 1.05, -0.32],
        [0.46, 0.35, -0.45],
      ],
      width: 11,
      color: '#ef4444',
      partId: 'aorta',
    },
    // Pulmonary artery (blue vessel)
    {
      kind: 'curve',
      pts: [
        [-0.25, 0.1, 0.3],
        [-0.18, 0.82, 0.36],
        [-0.78, 1.05, 0.18],
      ],
      width: 9,
      color: '#60a5fa',
      partId: 'pulm',
    },
    // Superior Vena Cava
    {
      kind: 'bond',
      a: [-0.62, 0.55, 0.08],
      b: [-0.65, 1.38, 0.02],
      radius: 0.14,
      color: '#1d4ed8',
      partId: 'right',
    },
  ];

  const hotspots: Hotspot3D[] = [
    { id: 'left', label: 'Linke Herzhälfte (O₂-reich)', note: 'Kräftige linke Herzkammer pumpt sauerstoffreiches Blut mit hohem Druck in den gesamten Körperkreislauf.', pos: [0.35, -0.42, 0.2], color: '#ef4444' },
    { id: 'right', label: 'Rechte Herzhälfte (O₂-arm)', note: 'Empfängt sauerstoffarmes Blut über die Hohlvene und pumpt es über den Lungenkreislauf zur Lunge.', pos: [-0.45, -0.32, 0.3], color: '#3b82f6' },
    { id: 'aorta', label: 'Aorta (Hauptschlagader)', note: 'Größte Arterie des Körpers: leitet das frische Blut aus der linken Kammer in alle Organe.', pos: [0.42, 1.32, -0.05], color: '#f43f5e' },
    { id: 'pulm', label: 'Lungenarterie', note: 'Transportiert sauerstoffarmes Blut von der rechten Kammer zur Lunge zum Gasaustausch.', pos: [-0.65, 1.0, 0.22], color: '#60a5fa' },
  ];
  return { primitives, hotspots };
}

function buildCrystal(_t: number, variantId = 'nacl'): Model3DScene {
  const primitives: Primitive3D[] = [];
  const hotspots: Hotspot3D[] = [];

  if (variantId === 'diamond') {
    // Tetrahedral diamond carbon cell
    const nodes: Vec3[] = [
      [0, 0, 0],
      [0.62, 0.62, 0.62],
      [0.62, -0.62, -0.62],
      [-0.62, 0.62, -0.62],
      [-0.62, -0.62, 0.62],
      [1.24, 0, 1.24],
      [1.24, 1.24, 0],
      [0, 1.24, 1.24],
      [-1.24, 0, -1.24],
      [-1.24, -1.24, 0],
    ];
    const edges: [number, number][] = [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 5], [1, 6], [1, 7],
      [3, 8], [4, 9],
    ];
    for (const [i, j] of edges) {
      primitives.push({ kind: 'bond', a: nodes[i], b: nodes[j], radius: 0.06, color: '#94a3b8', partId: 'bond' });
    }
    for (const p of nodes) {
      primitives.push({ kind: 'sphere', pos: p, r: 0.2, color: '#38bdf8', partId: 'carbon' });
    }
    hotspots.push(
      { id: 'carbon', label: 'sp³-Kohlenstoff-Netzwerk', note: 'Jedes C-Atom ist tetraedrisch (109,5°) mit 4 Nachbarn kovalent verbunden → extreme Härte (Mohshärte 10)!', pos: nodes[0], color: '#38bdf8' },
    );
  } else {
    // 3x3x3 NaCl cubic ionic lattice
    const step = 0.82;
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        for (let iz = -1; iz <= 1; iz++) {
          const pos: Vec3 = [ix * step, iy * step, iz * step];
          const isNa = (ix + iy + iz + 6) % 2 === 0;
          primitives.push({
            kind: 'sphere',
            pos,
            r: isNa ? 0.18 : 0.28,
            color: isNa ? '#3b82f6' : '#10b981',
            partId: isNa ? 'na' : 'cl',
          });
          if (ix < 1) primitives.push({ kind: 'bond', a: pos, b: [(ix + 1) * step, iy * step, iz * step], radius: 0.035, color: '#64748b', alpha: 0.55 });
          if (iy < 1) primitives.push({ kind: 'bond', a: pos, b: [ix * step, (iy + 1) * step, iz * step], radius: 0.035, color: '#64748b', alpha: 0.55 });
          if (iz < 1) primitives.push({ kind: 'bond', a: pos, b: [ix * step, iy * step, (iz + 1) * step], radius: 0.035, color: '#64748b', alpha: 0.55 });
        }
      }
    }
    hotspots.push(
      { id: 'na', label: 'Natrium-Kation (Na⁺)', note: 'Kleineres, positiv geladenes Ion — von je 6 Cl⁻-Ionen oktaedrisch umgeben.', pos: [step, step, 0], color: '#3b82f6' },
      { id: 'cl', label: 'Chlorid-Anion (Cl⁻)', note: 'Größeres, negativ geladenes Ion — starke elektrostatische Anziehung erzeugt hohen Schmelzpunkt (801 °C).', pos: [step, step, step], color: '#10b981' },
    );
  }
  if (variantId === 'graphene') {
    primitives.length = 0;
    hotspots.length = 0;
    const pts: Vec3[] = [];
    const r = 0.36;
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        const cx = col * r * 1.5;
        const cz = (row + (col & 1) * 0.5) * r * Math.sqrt(3);
        const y = Math.sin(cx * 1.4) * 0.1;
        pts.push([cx, y, cz]);
      }
    }
    const maxD = r * 1.08;
    for (let i = 0; i < pts.length; i++) {
      primitives.push({ kind: 'sphere', pos: pts[i], r: 0.12, color: '#334155', partId: 'c' });
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
        if (d < maxD) {
          primitives.push({ kind: 'bond', a: pts[i], b: pts[j], radius: 0.04, color: '#38bdf8', partId: 'bond' });
        }
      }
    }
    hotspots.push(
      { id: 'c', label: 'sp²-Kohlenstoff-Wabe', note: 'Einlagiges 2D-Wabengitter (nur 1 Atom dick!): 200× zugfester als Stahl und extrem leitfähig.', pos: pts[12] ?? [0, 0, 0], color: '#38bdf8' },
      { id: 'bond', label: 'Kovalente σ- & π-Bindungen', note: 'Frei bewegliche π-Elektronen machen Graphen zu einem herausragenden elektrischen & thermischen Leiter.', pos: pts[7] ?? [0.4, 0, 0.3], color: '#0ea5e9' },
    );
  }
  return { primitives, hotspots };
}

function buildSolar(t: number): Model3DScene {
  const primitives: Primitive3D[] = [
    { kind: 'sphere', pos: [0, 0, 0], r: 0.38, color: '#f59e0b', glow: true, label: 'Sonne', partId: 'sun' },
  ];
  const planets = [
    { id: 'merkur', label: 'Merkur', r: 0.62, sz: 0.075, speed: 1.6, col: '#94a3b8', inc: 0.12 },
    { id: 'venus', label: 'Venus', r: 0.88, sz: 0.11, speed: 1.15, col: '#fbbf24', inc: 0.06 },
    { id: 'erde', label: 'Erde', r: 1.18, sz: 0.125, speed: 0.85, col: '#38bdf8', inc: 0.0 },
    { id: 'mars', label: 'Mars', r: 1.48, sz: 0.095, speed: 0.62, col: '#ef4444', inc: -0.05 },
    { id: 'saturn', label: 'Saturn', r: 1.92, sz: 0.2, speed: 0.36, col: '#eab308', inc: 0.08, ringed: true },
  ];

  const earthPos: Vec3 = [0, 0, 0];
  const saturnPos: Vec3 = [0, 0, 0];

  for (const pl of planets) {
    const orb: Vec3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      orb.push([Math.cos(a) * pl.r, Math.sin(a) * pl.r * pl.inc, Math.sin(a) * pl.r]);
    }
    primitives.push({ kind: 'curve', pts: orb, width: 1.3, color: '#94a3b8', alpha: 0.34, partId: pl.id });
    const ang = t * pl.speed + pl.r * 3;
    const pos: Vec3 = [Math.cos(ang) * pl.r, Math.sin(ang) * pl.r * pl.inc, Math.sin(ang) * pl.r];
    if (pl.id === 'erde') {
      earthPos[0] = pos[0]; earthPos[1] = pos[1]; earthPos[2] = pos[2];
      // Orbiting Moon
      const mAng = t * 3.8;
      primitives.push({ kind: 'sphere', pos: [pos[0] + Math.cos(mAng) * 0.22, pos[1] + 0.04, pos[2] + Math.sin(mAng) * 0.22], r: 0.04, color: '#e2e8f0', partId: 'erde' });
    }
    if (pl.id === 'saturn') {
      saturnPos[0] = pos[0]; saturnPos[1] = pos[1]; saturnPos[2] = pos[2];
    }
    primitives.push({
      kind: 'sphere',
      pos,
      r: pl.sz,
      color: pl.col,
      label: pl.label,
      partId: pl.id,
      ...(pl.ringed ? { ring: { rInner: 0.26, rOuter: 0.4, color: '#fde047', tilt: 0.45 } } : {}),
    });
  }

  const hotspots: Hotspot3D[] = [
    { id: 'sun', label: 'Sonne (Zentralstern)', note: 'Enthält 99,86 % der gesamten Masse unseres Sonnensystems und hält alle Planeten per Gravitation auf Bahn.', pos: [0, 0, 0], color: '#f59e0b' },
    { id: 'erde', label: 'Erde & Mond', note: 'Befindet sich in der habitablen Zone — flüssiges Wasser und schützende Atmosphäre ermöglichen Leben.', pos: earthPos, color: '#38bdf8' },
    { id: 'saturn', label: 'Saturn & Ringsystem', note: 'Gasriese mit spektakulärem Ringsystem aus Milliarden Eis- und Gesteinspartikeln.', pos: saturnPos, color: '#eab308' },
  ];
  return { primitives, hotspots };
}

function buildEarthMagnetic(_t: number): Model3DScene {
  const primitives: Primitive3D[] = [
    // Layered Earth core + crust
    { kind: 'sphere', pos: [0, 0, 0], r: 0.92, color: '#2563eb', alpha: 0.55, partId: 'crust' },
    { kind: 'sphere', pos: [0, 0, 0], r: 0.65, color: '#ec4899', alpha: 0.5, partId: 'mantle' },
    { kind: 'sphere', pos: [0, 0, 0], r: 0.34, color: '#f59e0b', glow: true, partId: 'core' },
    // Magnetic axis bar
    { kind: 'bond', a: [0, -1.25, 0], b: [0, 1.25, 0], radius: 0.045, color: '#e2e8f0', alpha: 0.85, partId: 'axis' },
  ];

  // 8 3D dipole magnetic field lines (r = L * sin^2(theta))
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * Math.PI * 2;
    const pts: Vec3[] = [];
    const L = k % 2 === 0 ? 1.85 : 1.45;
    for (let i = 0; i <= 26; i++) {
      const th = 0.25 + (i / 26) * (Math.PI - 0.5);
      const r = L * Math.sin(th) * Math.sin(th);
      pts.push([r * Math.sin(th) * Math.cos(phi), r * Math.cos(th), r * Math.sin(th) * Math.sin(phi)]);
    }
    primitives.push({ kind: 'curve', pts, width: 2.2, color: '#14b8a6', alpha: 0.72, dashed: k % 2 === 1, partId: 'field' });
  }

  const hotspots: Hotspot3D[] = [
    { id: 'core', label: 'Erdkern (Geodynamo)', note: 'Konvektionsströme im flüssigen äußeren Eisen-Nickel-Kern erzeugen das Erdmagnetfeld.', pos: [0, 0, 0], color: '#f59e0b' },
    { id: 'field', label: 'Dipol-Magnetfeld', note: 'Schützt die Erde wie ein Schild vor dem geladenen Sonnenwind und erzeugt Polarlichter an den Polen.', pos: [1.65, 0, 0], color: '#14b8a6' },
    { id: 'crust', label: 'Erdkruste & Mantel', note: 'Feste Kruste (5–70 km) über dem zähflüssigen Erdmantel (Plattentektonik).', pos: [0, 0.88, 0.2], color: '#3b82f6' },
  ];
  return { primitives, hotspots };
}

function buildGeometry(_t: number, variantId = 'cube'): Model3DScene {
  const primitives: Primitive3D[] = [];
  const hotspots: Hotspot3D[] = [];

  if (variantId === 'vectors') {
    const O: Vec3 = [0, 0, 0];
    const axX: Vec3 = [1.55, 0, 0];
    const axY: Vec3 = [0, 1.55, 0];
    const axZ: Vec3 = [0, 0, 1.55];
    const vA: Vec3 = [1.15, 0.15, 0.3];
    const vB: Vec3 = [0.25, 0.1, 1.15];
    // Cross product a x b
    const vC: Vec3 = [
      vA[1] * vB[2] - vA[2] * vB[1],
      vA[2] * vB[0] - vA[0] * vB[2],
      vA[0] * vB[1] - vA[1] * vB[0],
    ];
    const vSum: Vec3 = [vA[0] + vB[0], vA[1] + vB[1], vA[2] + vB[2]];

    primitives.push(
      { kind: 'bond', a: [-1.4, 0, 0], b: axX, radius: 0.025, color: '#64748b', alpha: 0.5 },
      { kind: 'bond', a: [0, -1.4, 0], b: axY, radius: 0.025, color: '#64748b', alpha: 0.5 },
      { kind: 'bond', a: [0, 0, -1.4], b: axZ, radius: 0.025, color: '#64748b', alpha: 0.5 },
      { kind: 'face', pts: [O, vA, vSum, vB], fill: '#14b8a6', stroke: '#14b8a6', alpha: 0.28, partId: 'area' },
      { kind: 'bond', a: O, b: vA, radius: 0.065, color: '#3b82f6', partId: 'va' },
      { kind: 'sphere', pos: vA, r: 0.12, color: '#3b82f6', label: 'a', partId: 'va' },
      { kind: 'bond', a: O, b: vB, radius: 0.065, color: '#f59e0b', partId: 'vb' },
      { kind: 'sphere', pos: vB, r: 0.12, color: '#f59e0b', label: 'b', partId: 'vb' },
      { kind: 'bond', a: O, b: vC, radius: 0.075, color: '#e11d74', partId: 'vc' },
      { kind: 'sphere', pos: vC, r: 0.14, color: '#e11d74', label: 'a×b', partId: 'vc' },
    );
    hotspots.push(
      { id: 'vc', label: 'Kreuzprodukt a × b', note: 'Steht exakt senkrecht (90°) auf beiden Vektoren a und b (Rechte-Hand-Regel)!', pos: vC, color: '#e11d74' },
      { id: 'area', label: 'Parallelogramm-Fläche', note: 'Die Länge |a × b| entspricht exakt dem Flächeninhalt des von a und b aufgespannten Parallelogramms.', pos: [vSum[0] * 0.5, vSum[1] * 0.5, vSum[2] * 0.5], color: '#14b8a6' },
    );
    return { primitives, hotspots };
  }

  let verts: Vec3[];
  let faces: number[][];
  let note: string;
  if (variantId === 'tetra') {
    const s = 1.05;
    verts = [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]];
    faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
    note = '4 gleichseitige Dreiecke · 4 Ecken · 6 Kanten (Euler: E − K + F = 4 − 6 + 4 = 2).';
  } else if (variantId === 'octa') {
    const s = 1.35;
    verts = [[s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0], [0, 0, s], [0, 0, -s]];
    faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
    note = '8 gleichseitige Dreiecke · 6 Ecken · 12 Kanten (Dualkörper zum Würfel).';
  } else {
    const s = 0.92;
    verts = [
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
    ];
    faces = [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
      [2, 6, 7, 3], [0, 3, 7, 4], [1, 5, 6, 2],
    ];
    note = '6 Quadrate · 8 Ecken · 12 Kanten (Euler-Polyedersatz: 8 − 12 + 6 = 2).';
  }

  for (const f of faces) {
    primitives.push({ kind: 'face', pts: f.map((idx) => verts[idx]), fill: '#0ea5e9', stroke: '#38bdf8', alpha: 0.42, partId: 'solid' });
  }
  for (const v of verts) {
    primitives.push({ kind: 'sphere', pos: v, r: 0.09, color: '#f59e0b', partId: 'solid' });
  }
  hotspots.push({
    id: 'solid',
    label: variantId === 'tetra' ? 'Tetraeder' : variantId === 'octa' ? 'Oktaeder' : 'Würfel (Hexaeder)',
    note,
    pos: verts[0],
    color: '#0ea5e9',
  });
  return { primitives, hotspots };
}

// ---------- 9. Human Brain (Cortex Lobes, Cerebellum, Brainstem & Inner Limbic System) ----------
function buildBrain(_t: number): Model3DScene {
  const primitives: Primitive3D[] = [];
  // Frontal lobe (front, +Z / +Y)
  for (const side of [-1, 1]) {
    primitives.push(
      { kind: 'sphere', pos: [side * 0.42, 0.32, 0.68], r: 0.48, color: '#f43f5e', partId: 'frontal', layer: 'frontal' },
      { kind: 'sphere', pos: [side * 0.36, 0.08, 0.92], r: 0.36, color: '#fb7185', partId: 'frontal', layer: 'frontal' },
      // Parietal lobe (top-back)
      { kind: 'sphere', pos: [side * 0.45, 0.62, -0.05], r: 0.46, color: '#3b82f6', partId: 'parietal', layer: 'parietal' },
      { kind: 'sphere', pos: [side * 0.42, 0.48, -0.52], r: 0.4, color: '#60a5fa', partId: 'parietal', layer: 'parietal' },
      // Temporal lobe (sides)
      { kind: 'sphere', pos: [side * 0.78, -0.14, 0.12], r: 0.38, color: '#10b981', partId: 'temporal', layer: 'temporal' },
      { kind: 'sphere', pos: [side * 0.72, -0.22, -0.28], r: 0.33, color: '#34d399', partId: 'temporal', layer: 'temporal' },
      // Occipital lobe (back)
      { kind: 'sphere', pos: [side * 0.38, 0.08, -0.96], r: 0.4, color: '#a855f7', partId: 'occipital', layer: 'occipital' },
      // Cerebellum (lower back)
      { kind: 'sphere', pos: [side * 0.38, -0.62, -0.68], r: 0.34, color: '#f59e0b', partId: 'cerebellum', layer: 'cerebellum' },
    );
  }
  // Brainstem
  primitives.push(
    { kind: 'bond', a: [0, -0.2, -0.22], b: [0, -1.25, -0.35], radius: 0.18, color: '#cbd5e1', partId: 'stem', layer: 'cerebellum' },
    { kind: 'sphere', pos: [0, -0.55, -0.25], r: 0.24, color: '#e2e8f0', partId: 'stem', layer: 'cerebellum' },
  );
  // Inner Limbic System (Hippocampus & Amygdala – revealed in X-Ray / Explode / hiding lobes!)
  for (const side of [-1, 1]) {
    const hippo: Vec3[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI * 1.15 - 0.3;
      hippo.push([side * (0.28 + Math.sin(a) * 0.14), -0.05 + Math.sin(a) * 0.32, Math.cos(a) * 0.46]);
    }
    primitives.push(
      { kind: 'curve', pts: hippo, width: 6, color: '#eab308', partId: 'limbic', layer: 'limbic' },
      { kind: 'sphere', pos: [side * 0.3, -0.18, 0.34], r: 0.14, color: '#ef4444', glow: true, partId: 'limbic', layer: 'limbic' },
    );
  }
  const hotspots: Hotspot3D[] = [
    { id: 'frontal', label: 'Frontallappen (Stirnlappen)', note: 'Planung, Logik, Arbeitsgedächtnis, Impulskontrolle & Motorik (präfrontaler Kortex).', pos: [0.42, 0.36, 0.96], color: '#f43f5e', layer: 'frontal' },
    { id: 'parietal', label: 'Parietallappen (Scheitellappen)', note: 'Tastsinn, räumliche Orientierung, Rechnen und Integration von Sinnesreizen.', pos: [0.45, 0.85, -0.1], color: '#3b82f6', layer: 'parietal' },
    { id: 'temporal', label: 'Temporallappen (Schläfenlappen)', note: 'Hören, Sprachverständnis (Wernicke-Areal) und Verknüpfung mit dem Gedächtnis.', pos: [0.95, -0.14, 0.12], color: '#10b981', layer: 'temporal' },
    { id: 'occipital', label: 'Okzipitallappen (Hinterhaupt)', note: 'Primäre Sehrinde: verarbeitet Farben, Formen, Bewegung und visuelle Muster.', pos: [0.38, 0.12, -1.2], color: '#a855f7', layer: 'occipital' },
    { id: 'cerebellum', label: 'Kleinhirn & Hirnstamm', note: 'Kleinhirn koordiniert Feinmotorik & Gleichgewicht; Hirnstamm steuert Atmung & Herzschlag.', pos: [0.42, -0.78, -0.78], color: '#f59e0b', layer: 'cerebellum' },
    { id: 'limbic', label: 'Limbisches System (Hippocampus)', note: 'Überträgt Gelerntes ins Langzeitgedächtnis (Tipp: Röntgen-Modus oder Explosion einschalten!).', pos: [0.3, -0.12, 0.35], color: '#eab308', layer: 'limbic' },
  ];
  return {
    primitives,
    hotspots,
    layerExplode: {
      frontal: [0, 0.35, 0.95],
      parietal: [0, 0.85, -0.25],
      temporal: [0, -0.1, 0],
      occipital: [0, 0.1, -0.95],
      cerebellum: [0, -0.75, -0.55],
      limbic: [0, 0, 0],
    },
  };
}

// ---------- 10. Electric DC Motor (Animated Rotor, Stator Magnets, Commutator & Lorentz Force) ----------
function buildMotor(t: number): Model3DScene {
  const primitives: Primitive3D[] = [];
  const ang = t * 1.9;
  const ca = Math.cos(ang), sa = Math.sin(ang);

  // North (left, red) & South (right, blue) Stator Magnet poles
  for (let iy = -1; iy <= 1; iy++) {
    for (let iz = -1; iz <= 1; iz++) {
      primitives.push(
        { kind: 'sphere', pos: [-1.45, iy * 0.42, iz * 0.42], r: 0.28, color: '#ef4444', partId: 'stator', layer: 'stator' },
        { kind: 'sphere', pos: [1.45, iy * 0.42, iz * 0.42], r: 0.28, color: '#3b82f6', partId: 'stator', layer: 'stator' },
      );
    }
  }
  // Magnetic B-field lines from North (-X) to South (+X)
  for (const y of [-0.55, 0, 0.55]) {
    primitives.push({
      kind: 'curve',
      pts: [[-1.15, y, 0], [0, y, 0], [1.15, y, 0]],
      width: 2.2,
      color: '#38bdf8',
      alpha: 0.55,
      dashed: true,
      partId: 'field',
      layer: 'field',
    });
  }

  // Rotating Copper Armature Coil (in XZ/YZ plane around Z axis)
  const rCoil = 0.78;
  const lenCoil = 0.95;
  const p1: Vec3 = [ca * rCoil, sa * rCoil, -lenCoil];
  const p2: Vec3 = [ca * rCoil, sa * rCoil, lenCoil];
  const p3: Vec3 = [-ca * rCoil, -sa * rCoil, lenCoil];
  const p4: Vec3 = [-ca * rCoil, -sa * rCoil, -lenCoil];
  primitives.push(
    { kind: 'bond', a: p1, b: p2, radius: 0.075, color: '#f97316', partId: 'rotor', layer: 'rotor' },
    { kind: 'bond', a: p2, b: p3, radius: 0.075, color: '#ea580c', partId: 'rotor', layer: 'rotor' },
    { kind: 'bond', a: p3, b: p4, radius: 0.075, color: '#f97316', partId: 'rotor', layer: 'rotor' },
    { kind: 'bond', a: p4, b: p1, radius: 0.075, color: '#ea580c', partId: 'rotor', layer: 'rotor' },
    // Central steel shaft
    { kind: 'bond', a: [0, 0, -1.55], b: [0, 0, 1.55], radius: 0.08, color: '#94a3b8', partId: 'rotor', layer: 'rotor' },
  );

  // Split-ring Commutator + carbon brushes at +Z end
  primitives.push(
    { kind: 'sphere', pos: [0, 0, 1.18], r: 0.24, color: '#eab308', partId: 'commutator', layer: 'commutator' },
    { kind: 'sphere', pos: [-0.36, 0, 1.18], r: 0.13, color: '#334155', partId: 'commutator', layer: 'commutator' },
    { kind: 'sphere', pos: [0.36, 0, 1.18], r: 0.13, color: '#334155', partId: 'commutator', layer: 'commutator' },
  );

  // Lorentz Force Vectors on the two active wire arms
  const f1End: Vec3 = [ca * rCoil - sa * 0.55, sa * rCoil + ca * 0.55, 0];
  const f2End: Vec3 = [-ca * rCoil + sa * 0.55, -sa * rCoil - ca * 0.55, 0];
  primitives.push(
    { kind: 'bond', a: [ca * rCoil, sa * rCoil, 0], b: f1End, radius: 0.055, color: '#22c55e', partId: 'lorentz', layer: 'field' },
    { kind: 'sphere', pos: f1End, r: 0.1, color: '#22c55e', glow: true, partId: 'lorentz', layer: 'field' },
    { kind: 'bond', a: [-ca * rCoil, -sa * rCoil, 0], b: f2End, radius: 0.055, color: '#22c55e', partId: 'lorentz', layer: 'field' },
    { kind: 'sphere', pos: f2End, r: 0.1, color: '#22c55e', glow: true, partId: 'lorentz', layer: 'field' },
  );

  const hotspots: Hotspot3D[] = [
    { id: 'stator', label: 'Stator-Magnete (N & S)', note: 'Erzeugen das konstante äußere Magnetfeld B vom Nordpol (rot) zum Südpol (blau).', pos: [-1.45, 0.35, 0], color: '#ef4444', layer: 'stator' },
    { id: 'rotor', label: 'Anker / Kupferspule (Rotor)', note: 'Stromdurchflossene Leiterschleife im Magnetfeld — dreht sich durch das resultierende Drehmoment.', pos: p1, color: '#f97316', layer: 'rotor' },
    { id: 'commutator', label: 'Kommutator (Polwender)', note: 'Kehrt die Stromrichtung alle 180° um, damit der Rotor kontinuierlich in dieselbe Richtung weiterdreht.', pos: [0, 0, 1.25], color: '#eab308', layer: 'commutator' },
    { id: 'lorentz', label: 'Lorentzkraft F = I · (l × B)', note: 'Wirkt senkrecht zu Stromrichtung und Magnetfeld (Dreifingerregel) und treibt die Spule an.', pos: f1End, color: '#22c55e', layer: 'field' },
  ];
  return {
    primitives,
    hotspots,
    layerExplode: {
      stator: [0, 0.7, 0],
      rotor: [0, 0, 0],
      commutator: [0, 0, 0.9],
      field: [0, -0.5, 0],
    },
  };
}

// ---------- 11. Atom & 3D Quantum Orbitals (Bohr Carbon / 2p Orbitals / 3d Orbitals) ----------
function buildAtom(t: number, variantId = 'orbitals2p'): Model3DScene {
  const primitives: Primitive3D[] = [];
  const hotspots: Hotspot3D[] = [];

  // Nucleus cluster (protons + neutrons)
  const nucOffsets: [Vec3, boolean][] = [
    [[0.1, 0.08, 0.06], true], [[-0.1, -0.07, 0.08], false], [[0.06, -0.1, -0.08], true],
    [[-0.08, 0.1, -0.06], false], [[0, 0, 0.12], true], [[0, 0, -0.12], false],
  ];
  for (const [pos, proton] of nucOffsets) {
    primitives.push({ kind: 'sphere', pos, r: 0.13, color: proton ? '#ef4444' : '#94a3b8', partId: 'nucleus', layer: 'nucleus' });
  }
  hotspots.push({
    id: 'nucleus',
    label: 'Atomkern (Protonen & Neutronen)',
    note: 'Positiv geladener Kern — vereint >99,9 % der Atommasse auf winzigem Raum.',
    pos: [0, 0, 0],
    color: '#ef4444',
    layer: 'nucleus',
  });

  if (variantId === 'bohr') {
    // Carbon: 2 inner K-shell + 4 outer L-shell electrons
    const shells = [
      { r: 0.85, n: 2, speed: 2.1, tilt: 0.35, id: 'shell1', col: '#38bdf8' },
      { r: 1.55, n: 4, speed: 1.15, tilt: -0.45, id: 'shell2', col: '#a855f7' },
    ];
    for (const sh of shells) {
      const orb: Vec3[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        orb.push([Math.cos(a) * sh.r, Math.sin(a) * sh.r * Math.sin(sh.tilt), Math.sin(a) * sh.r * Math.cos(sh.tilt)]);
      }
      primitives.push({ kind: 'curve', pts: orb, width: 2, color: sh.col, alpha: 0.5, partId: sh.id, layer: sh.id });
      for (let k = 0; k < sh.n; k++) {
        const a = t * sh.speed + (k / sh.n) * Math.PI * 2;
        const pos: Vec3 = [Math.cos(a) * sh.r, Math.sin(a) * sh.r * Math.sin(sh.tilt), Math.sin(a) * sh.r * Math.cos(sh.tilt)];
        primitives.push({ kind: 'sphere', pos, r: 0.1, color: sh.col, glow: true, partId: sh.id, layer: sh.id });
      }
    }
    hotspots.push(
      { id: 'shell1', label: 'K-Schale (2 e⁻)', note: 'Innerste Elektronenschale (n = 1) ist mit 2 Elektronen voll besetzt.', pos: [0.85, 0, 0], color: '#38bdf8', layer: 'shell1' },
      { id: 'shell2', label: 'Valenzschale L (4 e⁻)', note: 'Äußerste Schale bestimmt die chemischen Bindungen (Kohlenstoff bildet 4 Bindungen).', pos: [1.55, 0, 0], color: '#a855f7', layer: 'shell2' },
    );
  } else if (variantId === 'orbitals3d') {
    // 3d_xy cloverleaf orbital (4 lobes with alternating wavefunction phase +/-)
    const lobes: [Vec3, string][] = [
      [[0.85, 0.85, 0], '#38bdf8'],
      [[-0.85, -0.85, 0], '#38bdf8'],
      [[-0.85, 0.85, 0], '#f43f5e'],
      [[0.85, -0.85, 0], '#f43f5e'],
    ];
    for (const [dir, col] of lobes) {
      for (const s of [0.42, 0.72, 1.0]) {
        primitives.push({
          kind: 'sphere',
          pos: [dir[0] * s, dir[1] * s, dir[2] * s],
          r: 0.24 + s * 0.24,
          color: col,
          alpha: 0.42,
          glow: true,
          partId: 'd3',
          layer: 'shell2',
        });
      }
    }
    hotspots.push({
      id: 'd3',
      label: '3d-Kleeblatt-Orbital',
      note: 'Aufenthaltswahrscheinlichkeit der Elektronen in Nebengruppen-Elementen (Übergangsmetalle); Farben zeigen Phasen (+ / −).',
      pos: [0.95, 0.95, 0],
      color: '#38bdf8',
      layer: 'shell2',
    });
  } else {
    // 1s + 2px, 2py, 2pz dumbbell orbitals
    primitives.push({ kind: 'sphere', pos: [0, 0, 0], r: 0.56, color: '#14b8a6', alpha: 0.28, partId: 's1', layer: 'shell1' });
    const axes: { dir: Vec3; colA: string; colB: string; id: string }[] = [
      { dir: [1, 0, 0], colA: '#38bdf8', colB: '#0284c7', id: 'p2' },
      { dir: [0, 1, 0], colA: '#f43f5e', colB: '#e11d48', id: 'p2' },
      { dir: [0, 0, 1], colA: '#a855f7', colB: '#7c3aed', id: 'p2' },
    ];
    for (const ax of axes) {
      for (const sign of [-1, 1]) {
        const col = sign > 0 ? ax.colA : ax.colB;
        primitives.push(
          { kind: 'sphere', pos: [ax.dir[0] * sign * 0.65, ax.dir[1] * sign * 0.65, ax.dir[2] * sign * 0.65], r: 0.34, color: col, alpha: 0.38, partId: ax.id, layer: 'shell2' },
          { kind: 'sphere', pos: [ax.dir[0] * sign * 1.12, ax.dir[1] * sign * 1.12, ax.dir[2] * sign * 1.12], r: 0.44, color: col, alpha: 0.42, glow: true, partId: ax.id, layer: 'shell2' },
        );
      }
    }
    hotspots.push(
      { id: 's1', label: '1s-Orbital (Kugelsymmetrisch)', note: 'Innerster Aufenthaltsraum — rotationssymmetrisch um den Kern.', pos: [0.55, 0.3, 0], color: '#14b8a6', layer: 'shell1' },
      { id: 'p2', label: '2p-Hantelorbitale (px, py, pz)', note: 'Drei senkrecht aufeinander stehende Hantel-Räume entlang der X-, Y- und Z-Achse.', pos: [0, 1.35, 0], color: '#f43f5e', layer: 'shell2' },
    );
  }
  return {
    primitives,
    hotspots,
    layerExplode: { nucleus: [0, 0, 0], shell1: [0, 0.45, 0], shell2: [0, -0.45, 0] },
  };
}

// ---------- 12. 3D Math Function Surfaces (True GPU-lit Triangle Mesh!) ----------
function buildSurfaces(t: number, variantId = 'saddle'): Model3DScene {
  const primitives: Primitive3D[] = [];
  const N = 22;
  const span = 1.45;
  const evalZ = (x: number, z: number): number => {
    if (variantId === 'wave') {
      const r = Math.hypot(x, z) * 3.4;
      return (r < 0.001 ? 1 : Math.sin(r - t * 1.8) / (0.65 + r * 0.55)) * 0.85;
    }
    if (variantId === 'gauss') {
      return Math.exp(-(x * x + z * z) * 1.25) * 1.35 - 0.35;
    }
    // Hyperbolic paraboloid (saddle): y = (x^2 - z^2) * 0.45
    return (x * x - z * z) * 0.48;
  };

  const grid: Vec3[][] = [];
  for (let i = 0; i <= N; i++) {
    const row: Vec3[] = [];
    const x = -span + (2 * span * i) / N;
    for (let j = 0; j <= N; j++) {
      const z = -span + (2 * span * j) / N;
      row.push([x, evalZ(x, z), z]);
    }
    grid.push(row);
  }

  // Color ramp by height (cool indigo -> teal -> warm amber)
  const colorForY = (y: number) => {
    if (y > 0.55) return '#f59e0b';
    if (y > 0.2) return '#10b981';
    if (y > -0.15) return '#0ea5e9';
    if (y > -0.5) return '#3b82f6';
    return '#6366f1';
  };

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const a = grid[i][j];
      const b = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];
      const avgY = (a[1] + b[1] + c[1] + d[1]) * 0.25;
      primitives.push({
        kind: 'face',
        pts: [a, b, c, d],
        fill: colorForY(avgY),
        alpha: 0.94,
        partId: 'surface',
      });
    }
  }

  // Coordinate axes
  primitives.push(
    { kind: 'bond', a: [-1.7, 0, 0], b: [1.7, 0, 0], radius: 0.02, color: '#ef4444', alpha: 0.7, partId: 'axes' },
    { kind: 'bond', a: [0, -1.2, 0], b: [0, 1.35, 0], radius: 0.02, color: '#22c55e', alpha: 0.7, partId: 'axes' },
    { kind: 'bond', a: [0, 0, -1.7], b: [0, 0, 1.7], radius: 0.02, color: '#3b82f6', alpha: 0.7, partId: 'axes' },
  );

  const hotspots: Hotspot3D[] =
    variantId === 'wave'
      ? [{ id: 'surface', label: 'Wellenfunktion f(x,y) = sin(r)/r', note: 'Radialsymmetrische Interferenz-Welle — wichtig in Optik, Akustik und Signalverarbeitung.', pos: [0, 0.85, 0], color: '#f59e0b' }]
      : variantId === 'gauss'
        ? [{ id: 'surface', label: '2D-Gauß-Glocke e^(−(x²+y²))', note: 'Zweidimensionale Normalverteilung — zentral in Statistik, Quantenmechanik & Bildverarbeitung.', pos: [0, 1.0, 0], color: '#f59e0b' }]
        : [{ id: 'surface', label: 'Sattelpunkt f(x,y) = x² − y²', note: 'In X-Richtung ein Minimum, in Y-Richtung ein Maximum: Gradient = 0, aber kein Extremum!', pos: [0, 0.05, 0], color: '#0ea5e9' }];

  return { primitives, hotspots };
}

export const MODELS_3D: Model3DDef[] = [
  {
    id: 'dna',
    title: 'DNA-Doppelhelix',
    category: 'Biologie',
    summary: 'Drehbare 3D-Doppelhelix mit Zucker-Phosphat-Rückgrat und komplementären Basenpaaren (A–T, G–C).',
    defaultRot: [0.22, 0.4],
    layers: [
      { id: 'backbone', label: 'Rückgrat', color: '#8b5cf6' },
      { id: 'at', label: 'Basen A–T', color: '#16a39a' },
      { id: 'gc', label: 'Basen G–C', color: '#e11d74' },
    ],
    build: (t) => ({
      ...buildDna(t),
      layerExplode: { backbone: [0, 0.35, 0], at: [0.55, 0, 0], gc: [-0.55, 0, 0] },
    }),
  },
  {
    id: 'brain',
    title: 'Menschliches Gehirn',
    category: 'Biologie',
    summary: 'Zerlegbares 3D-Gehirn mit allen 4 Großhirnlappen, Kleinhirn, Hirnstamm & innerem limbischem System.',
    defaultRot: [0.22, -0.58],
    layers: [
      { id: 'frontal', label: 'Frontallappen', color: '#f43f5e' },
      { id: 'parietal', label: 'Parietallappen', color: '#3b82f6' },
      { id: 'temporal', label: 'Temporallappen', color: '#10b981' },
      { id: 'occipital', label: 'Okzipitallappen', color: '#a855f7' },
      { id: 'cerebellum', label: 'Kleinhirn', color: '#f59e0b' },
      { id: 'limbic', label: 'Hippocampus', color: '#eab308' },
    ],
    build: buildBrain,
  },
  {
    id: 'cell',
    title: 'Eukaryotische Zelle',
    category: 'Biologie',
    summary: 'Zerlegbare 3D-Zelle mit abnehmbarer Zellmembran, Zellkern, Mitochondrien, ER und Ribosomen.',
    defaultRot: [0.28, 0.5],
    layers: [
      { id: 'membrane', label: 'Zellmembran', color: '#38bdf8' },
      { id: 'nucleus', label: 'Zellkern', color: '#8b5cf6' },
      { id: 'mito', label: 'Mitochondrien', color: '#f97316' },
      { id: 'er', label: 'ER', color: '#14b8a6' },
      { id: 'ribo', label: 'Ribosomen', color: '#facc15' },
    ],
    build: (t) => ({
      ...buildCell(t),
      layerExplode: { membrane: [0, 0.75, 0], nucleus: [0, 0, 0], mito: [0.75, -0.3, 0.4], er: [-0.65, 0.25, 0.3], ribo: [0, -0.65, 0] },
    }),
  },
  {
    id: 'heart',
    title: 'Menschliches Herz',
    category: 'Biologie',
    summary: 'Animiert schlagendes 3D-Herz mit linkem & rechtem Kreislauf, Aorta und Lungenarterie.',
    defaultRot: [0.15, -0.25],
    layers: [
      { id: 'left', label: 'Linkes Herz (O₂)', color: '#ef4444' },
      { id: 'right', label: 'Rechtes Herz', color: '#3b82f6' },
      { id: 'aorta', label: 'Aorta', color: '#dc2626' },
      { id: 'pulm', label: 'Lungenarterie', color: '#60a5fa' },
    ],
    build: (t) => ({
      ...buildHeart(t),
      layerExplode: { left: [0.55, 0, 0], right: [-0.55, 0, 0], aorta: [0.25, 0.75, 0], pulm: [-0.25, 0.75, 0] },
    }),
  },
  {
    id: 'molecules',
    title: '3D-Moleküle',
    category: 'Chemie',
    summary: 'Räumliche Molekülgeometrie – von H₂O, Methan, CO₂ und Benzol bis zu Ethanol und Koffein.',
    defaultRot: [0.35, 0.55],
    variants: [
      { id: 'h2o', label: 'Wasser (H₂O)', subtitle: 'Gewinkelt (104,5°) · starker Dipol' },
      { id: 'ch4', label: 'Methan (CH₄)', subtitle: 'Tetraeder (109,5°) · unpolar' },
      { id: 'co2', label: 'CO₂', subtitle: 'Linear (180°) · 2 Doppelbindungen' },
      { id: 'benzol', label: 'Benzol (C₆H₆)', subtitle: 'Planarer Sechsring (120°) · Aromat' },
      { id: 'ethanol', label: 'Ethanol (C₂H₅OH)', subtitle: 'Polare OH-Gruppe & unpolarer Ethylrest' },
      { id: 'caffeine', label: 'Koffein (C₈H₁₀N₄O₂)', subtitle: 'Purin-Alkaloid · Adenosin-Antagonist' },
    ],
    build: buildMolecules,
  },
  {
    id: 'crystal',
    title: 'Kristallgitter',
    category: 'Chemie',
    summary: '3D-Aufbau von Festkörpern: Kochsalz-Ionengitter (NaCl), Diamant-Gitter und Graphen-Wabe.',
    defaultRot: [0.38, 0.62],
    variants: [
      { id: 'nacl', label: 'NaCl-Ionengitter', subtitle: 'Kubisches 3×3×3-Gitter (Na⁺ & Cl⁻)' },
      { id: 'diamond', label: 'Diamant (C)', subtitle: 'Tetraedrisches Elektronenpaar-Netzwerk' },
      { id: 'graphene', label: 'Graphen (2D-Wabe)', subtitle: 'Einlagiges sp²-Kohlenstoff-Gitter' },
    ],
    build: buildCrystal,
  },
  {
    id: 'motor',
    title: 'Elektromotor',
    category: 'Physik',
    summary: 'Animierter Gleichstrom-Elektromotor mit rotierender Spule, Magnetfeld, Kommutator & Lorentzkraft.',
    defaultRot: [0.34, 0.52],
    layers: [
      { id: 'stator', label: 'Stator-Magnete', color: '#ef4444' },
      { id: 'rotor', label: 'Rotor-Spule', color: '#f97316' },
      { id: 'commutator', label: 'Kommutator', color: '#eab308' },
      { id: 'field', label: 'Feld & Kraft', color: '#22c55e' },
    ],
    build: buildMotor,
  },
  {
    id: 'atom',
    title: 'Atom & 3D-Orbitale',
    category: 'Physik',
    summary: 'Vom Bohr-Schalenmodell zu quantenmechanischen 2p-Hantelorbitalen und 3d-Kleeblatt-Orbitalen.',
    defaultRot: [0.32, 0.55],
    variants: [
      { id: 'orbitals2p', label: '1s & 2p-Orbitale', subtitle: 'Kugel + 3 senkrechte Hantel-Orbitale' },
      { id: 'orbitals3d', label: '3d-Orbital', subtitle: 'Kleeblatt-Aufenthaltswahrscheinlichkeit' },
      { id: 'bohr', label: 'Bohr-Modell (C)', subtitle: '2 Schalen · 6 Elektronen auf Kreisbahnen' },
    ],
    layers: [
      { id: 'nucleus', label: 'Atomkern', color: '#ef4444' },
      { id: 'shell1', label: 'Innere Schale', color: '#14b8a6' },
      { id: 'shell2', label: 'Äußere Orbitale', color: '#f43f5e' },
    ],
    build: buildAtom,
  },
  {
    id: 'earth',
    title: 'Erde & Magnetfeld',
    category: 'Physik',
    summary: 'Schalenbau der Erde mit Geodynamo-Kern und räumlichen 3D-Dipol-Magnetfeldlinien.',
    defaultRot: [0.32, 0.45],
    layers: [
      { id: 'crust', label: 'Erdkruste', color: '#0ea5e9' },
      { id: 'mantle', label: 'Erdmantel', color: '#f97316' },
      { id: 'core', label: 'Erdkern', color: '#facc15' },
      { id: 'field', label: 'Magnetfeld', color: '#38bdf8' },
    ],
    build: (t) => ({
      ...buildEarthMagnetic(t),
      layerExplode: { crust: [0, 0.7, 0], mantle: [0.55, 0, 0], core: [0, 0, 0], field: [0, -0.5, 0] },
    }),
  },
  {
    id: 'solar',
    title: 'Sonnensystem in 3D',
    category: 'Astronomie',
    summary: 'Live kreisende Planeten auf geneigten 3D-Bahnen inkl. Erde mit Mond und 3D-Saturnringen.',
    defaultRot: [0.58, 0.3],
    build: buildSolar,
  },
  {
    id: 'surfaces',
    title: '3D-Funktionsflächen',
    category: 'Mathematik',
    summary: 'Echte WebGL-beleuchtete 3D-Flächen zum Drehen: Sattelfläche, Interferenz-Welle & 2D-Gauß-Glocke.',
    defaultRot: [0.48, 0.62],
    variants: [
      { id: 'saddle', label: 'Sattelfläche', subtitle: 'f(x,y) = x² − y² · klassischer Sattelpunkt' },
      { id: 'wave', label: 'Wellenfunktion', subtitle: 'f(x,y) = sin(r)/r · animierte Interferenz' },
      { id: 'gauss', label: 'Gauß-Glocke', subtitle: 'f(x,y) = e^(−(x²+y²)) · 2D-Normalverteilung' },
    ],
    build: buildSurfaces,
  },
  {
    id: 'geometry',
    title: 'Platonische Körper & Vektoren',
    category: 'Mathematik',
    summary: 'Raumgeometrie zum Drehen: Würfel, Tetraeder, Oktaeder und das 3D-Kreuzprodukt a × b.',
    defaultRot: [0.42, 0.68],
    variants: [
      { id: 'cube', label: 'Würfel', subtitle: '6 Flächen · 8 Ecken · 12 Kanten' },
      { id: 'tetra', label: 'Tetraeder', subtitle: '4 Dreiecke · 4 Ecken · 6 Kanten' },
      { id: 'octa', label: 'Oktaeder', subtitle: '8 Dreiecke · 6 Ecken · 12 Kanten' },
      { id: 'vectors', label: 'Kreuzprodukt a × b', subtitle: 'Normalenvektor & Parallelogramm-Fläche' },
    ],
    build: buildGeometry,
  },
];

/** Concise catalogue line for AI Skill/Practice prompts so Pip can embed matching 3D models into lessons. */
export const MODEL3D_PROMPT_HINT =
  'Interaktives 3D-Modell: Wenn das Thema zu einem unserer 3D-Modelle passt, gib in "labs" {"type":"model3d","modelId":"…","variantId":"…","focusPart":"…","ask":"Kurzer Entdeckungs-Auftrag (z. B. Blende die Membran aus und sieh dir die Mitochondrien an)"}. Verfügbare modelId (und optionale variantId): dna, brain, cell, heart, molecules (h2o|ch4|co2|benzol|ethanol|caffeine), crystal (nacl|diamond|graphene), motor, atom (orbitals2p|orbitals3d|bohr), earth, solar, surfaces (saddle|wave|gauss), geometry (cube|tetra|octa|vectors).';

/**
 * Pure topic matcher: finds a clearly matching built-in 3D model for a lesson topic
 * (used as reliable fallback if the AI did not explicitly emit a model3d lab).
 */
export function matchModel3DForTopic(topic: string): { modelId: string; variantId?: string } | null {
  const t = topic.toLowerCase();
  if (/\b(dna|dns|doppelhelix|basenpaar|nukleotid)/.test(t)) return { modelId: 'dna' };
  if (/\b(gehirn|großhirn|kortex|cortex|hippocampus|amygdala|kleinhirn|frontallappen|neuroanatom)/.test(t)) return { modelId: 'brain' };
  if (/\b(zelle|zellen|eukaryot|mitochondri|zellkern|organell|endoplasmat|ribosom)/.test(t)) return { modelId: 'cell' };
  if (/\b(herz|aorta|herzkammer|blutkreislauf|lungenarterie|myokard)/.test(t)) return { modelId: 'heart' };
  if (/\b(koffein|caffeine|purin)/.test(t)) return { modelId: 'molecules', variantId: 'caffeine' };
  if (/\b(ethanol|hydroxyl)/.test(t)) return { modelId: 'molecules', variantId: 'ethanol' };
  if (/\b(benzol|aromat|mesomerie)/.test(t)) return { modelId: 'molecules', variantId: 'benzol' };
  if (/\b(methan|ch4)\b/.test(t)) return { modelId: 'molecules', variantId: 'ch4' };
  if (/\b(co2|kohlendioxid|kohlenstoffdioxid)/.test(t)) return { modelId: 'molecules', variantId: 'co2' };
  if (/\b(vsepr|wassermolek|h2o|dipol.*wasser|molekülgeometr)/.test(t)) return { modelId: 'molecules', variantId: 'h2o' };
  if (/\b(graphen|graphene)/.test(t)) return { modelId: 'crystal', variantId: 'graphene' };
  if (/\b(diamant.*gitter|kristallgitter|ionengitter|nacl|kochsalz)/.test(t)) {
    return { modelId: 'crystal', variantId: /diamant/.test(t) ? 'diamond' : 'nacl' };
  }
  if (/\b(elektromotor|gleichstrommotor|kommutator|lorentzkraft)/.test(t)) return { modelId: 'motor' };
  if (/\b(orbital|elektronenwolke|quantenzahl|bohr.*modell|atommodell|atomschale)/.test(t)) {
    return { modelId: 'atom', variantId: /bohr|schale/.test(t) ? 'bohr' : /3d/.test(t) ? 'orbitals3d' : 'orbitals2p' };
  }
  if (/\b(erdmagnet|geodynamo|schalenbau.*erde|erdkern|erdmantel)/.test(t)) return { modelId: 'earth' };
  if (/\b(sonnensystem|planetenbahn|saturn.*ring)/.test(t)) return { modelId: 'solar' };
  if (/\b(sattelpunkt|sattelfläch|paraboloid|gauß.*glock|mehrdimensionale.*funktion)/.test(t)) {
    return { modelId: 'surfaces', variantId: /gauß|gauss/.test(t) ? 'gauss' : /welle/.test(t) ? 'wave' : 'saddle' };
  }
  if (/\b(kreuzprodukt|vektorprodukt|platonische.*körper|oktaeder|tetraeder)/.test(t)) {
    return { modelId: 'geometry', variantId: /kreuz|vektor/.test(t) ? 'vectors' : /okta/.test(t) ? 'octa' : /tetra/.test(t) ? 'tetra' : 'cube' };
  }
  return null;
}

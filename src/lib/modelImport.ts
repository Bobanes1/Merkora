/**
 * Pure parsers for loading user-supplied 3D models & chemistry molecules into Merkora's 3D Studio:
 * - Wavefront .obj 3D triangle meshes
 * - Chemistry .xyz coordinate files (auto CPK colors + covalent bond detection)
 * - Protein Data Bank .pdb files (ATOM/HETATM records + covalent/backbone bonds)
 * Pure – unit-tested in scripts/test-srs.mts.
 */
import type { Hotspot3D, Model3DScene, Primitive3D, Vec3 } from './models3d';

const CPK_COLORS: Record<string, { color: string; r: number }> = {
  H: { color: '#e2e8f0', r: 0.13 },
  C: { color: '#475569', r: 0.21 },
  N: { color: '#3b82f6', r: 0.2 },
  O: { color: '#ef4444', r: 0.2 },
  S: { color: '#eab308', r: 0.24 },
  P: { color: '#f97316', r: 0.23 },
  CL: { color: '#22c55e', r: 0.23 },
  F: { color: '#84cc16', r: 0.18 },
  BR: { color: '#991b1b', r: 0.25 },
  NA: { color: '#a855f7', r: 0.25 },
  FE: { color: '#ea580c', r: 0.25 },
  CA: { color: '#14b8a6', r: 0.24 },
  MG: { color: '#10b981', r: 0.22 },
};

function cpk(el: string): { color: string; r: number } {
  return CPK_COLORS[el.trim().toUpperCase()] ?? { color: '#06b6d4', r: 0.2 };
}

function normalizePoints(pts: Vec3[], targetRadius = 1.65): { norm: Vec3[]; scale: number } {
  if (!pts.length) return { norm: [], scale: 1 };
  let cx = 0, cy = 0, cz = 0;
  for (const [x, y, z] of pts) {
    cx += x;
    cy += y;
    cz += z;
  }
  cx /= pts.length;
  cy /= pts.length;
  cz /= pts.length;
  let maxD = 0.0001;
  for (const [x, y, z] of pts) {
    const d = Math.hypot(x - cx, y - cy, z - cz);
    if (d > maxD) maxD = d;
  }
  const scale = targetRadius / maxD;
  return {
    norm: pts.map(([x, y, z]) => [(x - cx) * scale, (y - cy) * scale, (z - cz) * scale]),
    scale,
  };
}

/** Parses a Wavefront .obj 3D mesh into centered, normalized Face3D primitives. */
export function parseObjModel(text: string): Model3DScene {
  const rawVerts: Vec3[] = [];
  const facesIdx: number[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      const x = Number(parts[1]), y = Number(parts[2]), z = Number(parts[3]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) rawVerts.push([x, y, z]);
    } else if (parts[0] === 'f' && parts.length >= 4) {
      const idxs: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const raw = parseInt(parts[i].split('/')[0], 10);
        if (!Number.isFinite(raw) || raw === 0) continue;
        const idx = raw > 0 ? raw - 1 : rawVerts.length + raw;
        if (idx >= 0 && idx < rawVerts.length) idxs.push(idx);
      }
      if (idxs.length >= 3) facesIdx.push(idxs);
    }
  }
  if (!rawVerts.length || !facesIdx.length) {
    throw new Error('Die OBJ-Datei enthält keine gültigen 3D-Flächen.');
  }
  const { norm } = normalizePoints(rawVerts, 1.75);
  const primitives: Primitive3D[] = [];
  // Triangulate polygons (fan) and cap at 25,000 triangles for responsive 60 FPS rendering
  const maxTris = 25000;
  for (const poly of facesIdx) {
    for (let k = 1; k < poly.length - 1; k++) {
      if (primitives.length >= maxTris) break;
      primitives.push({
        kind: 'face',
        pts: [norm[poly[0]], norm[poly[k]], norm[poly[k + 1]]],
        fill: '#38bdf8',
        alpha: 1,
        partId: 'mesh',
      });
    }
    if (primitives.length >= maxTris) break;
  }
  const hotspots: Hotspot3D[] = [
    {
      id: 'mesh',
      label: `3D-Mesh (${primitives.length.toLocaleString('de-DE')} Dreiecke)`,
      note: `${rawVerts.length.toLocaleString('de-DE')} Vertices aus deiner OBJ-Datei, lokal per WebGL2 gerendert.`,
      pos: [0, 0, 0],
      color: '#38bdf8',
    },
  ];
  return { primitives, hotspots };
}

const COV_RADIUS: Record<string, number> = {
  H: 0.35, C: 0.77, N: 0.75, O: 0.73, F: 0.71, P: 1.07, S: 1.05, CL: 1.0, BR: 1.14, NA: 1.54, FE: 1.25,
};
const covR = (el: string) => COV_RADIUS[el.trim().toUpperCase()] ?? 0.85;

function buildMoleculeScene(atoms: { el: string; pos: Vec3 }[]): Model3DScene {
  if (!atoms.length) throw new Error('Keine Atome in der Datei gefunden.');
  const capped = atoms.slice(0, 600);
  const { norm, scale } = normalizePoints(capped.map((a) => a.pos), 1.65);
  const primitives: Primitive3D[] = [];
  const counts = new Map<string, number>();

  // Auto-detect covalent bonds using sum of covalent radii + 0.38 Å tolerance
  const minBondSq = (0.35 * scale) ** 2;
  const atomScale = Math.max(0.45, Math.min(1.0, 1.35 / Math.pow(capped.length, 0.22)));

  if (capped.length <= 280) {
    for (let i = 0; i < capped.length; i++) {
      const ri = covR(capped[i].el);
      for (let j = i + 1; j < capped.length; j++) {
        const a = norm[i], b = norm[j];
        const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const maxD = (ri + covR(capped[j].el) + 0.35) * scale;
        if (d2 >= minBondSq && d2 <= maxD * maxD) {
          primitives.push({
            kind: 'bond',
            a,
            b,
            radius: 0.048 * atomScale,
            color: '#94a3b8',
            partId: 'bonds',
          });
        }
      }
    }
  } else {
    // Larger proteins: connect sequential backbone trace
    primitives.push({
      kind: 'curve',
      pts: norm,
      width: 2.6,
      color: '#38bdf8',
      partId: 'bonds',
    });
  }

  for (let i = 0; i < capped.length; i++) {
    const el = capped[i].el.toUpperCase();
    counts.set(el, (counts.get(el) ?? 0) + 1);
    const style = cpk(el);
    primitives.push({
      kind: 'sphere',
      pos: norm[i],
      r: style.r * atomScale,
      color: style.color,
      label: capped.length <= 45 ? el : undefined,
      partId: el,
    });
  }

  const formula = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([el, n]) => (n > 1 ? `${el}${n}` : el))
    .join(' ');

  const hotspots: Hotspot3D[] = [...counts.entries()].slice(0, 6).map(([el, n]) => {
    const idx = capped.findIndex((a) => a.el.toUpperCase() === el);
    return {
      id: el,
      label: `Element ${el} (${n}×)`,
      note: `Teil des geladenen Moleküls (${formula}, ${capped.length} Atome insgesamt).`,
      pos: norm[Math.max(0, idx)],
      color: cpk(el).color,
    };
  });
  return { primitives, hotspots };
}

/** Parses standard chemistry .xyz coordinate files. */
export function parseXyzMolecule(text: string): Model3DScene {
  const atoms: { el: string; pos: Vec3 }[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 4 && /^[A-Za-z]{1,2}$/.test(parts[0])) {
      const x = Number(parts[1]), y = Number(parts[2]), z = Number(parts[3]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        atoms.push({ el: parts[0], pos: [x, y, z] });
      }
    }
  }
  return buildMoleculeScene(atoms);
}

/** Parses Protein Data Bank (.pdb) ATOM and HETATM coordinates. */
export function parsePdbMolecule(text: string): Model3DScene {
  const atoms: { el: string; pos: Vec3 }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('ATOM  ') && !line.startsWith('HETATM')) continue;
    const x = parseFloat(line.slice(30, 38));
    const y = parseFloat(line.slice(38, 46));
    const z = parseFloat(line.slice(46, 54));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    let el = line.slice(76, 78).trim();
    if (!el) el = line.slice(12, 16).trim().replace(/[0-9]/g, '').slice(0, 2) || 'C';
    atoms.push({ el, pos: [x, y, z] });
  }
  return buildMoleculeScene(atoms);
}

/** Dispatches by file extension (.obj, .xyz, .pdb) to parse a user-loaded 3D model or molecule. */
export function parseCustom3DFile(name: string, text: string): Model3DScene {
  const lower = name.toLowerCase();
  if (lower.endsWith('.obj')) return parseObjModel(text);
  if (lower.endsWith('.xyz')) return parseXyzMolecule(text);
  if (lower.endsWith('.pdb')) return parsePdbMolecule(text);
  throw new Error('Unterstützte 3D-Formate: .obj (3D-Modelle), .pdb und .xyz (Moleküle).');
}

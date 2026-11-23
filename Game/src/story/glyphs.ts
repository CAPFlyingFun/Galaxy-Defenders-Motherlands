// ============================================================================
// glyphs.ts -- THE ANCIENT MARKINGS, drawn in code (the prologue's walls and the scanner's display).
//
// Joshua's opening demo, Draft 1 (2026-11-22): "Ancient passageways stretch ahead... geometric markings cover the
// stone walls"; John scans one and "the A.R.C.H. display reconstructs part of an inscription, but several symbols
// remain unidentified"; in the chamber the symbols "repeat around the room, but they're not identical. Almost
// like... instructions."
//
// So every symbol is made from a NUMBER (its seed): the same number always draws the same symbol, on a wall and on
// the scanner alike, and two numbers that share their first part share their outer shape (a "family"), which is how
// later scenes can have symbols that repeat but are not identical. Nothing here is a picture file: a symbol is a few
// circles, lines, arcs and dots drawn on a 2D canvas, so they cost no download.
//
// A BLOCKOUT (2026-11-22): these are stand-ins until the markings are designed; only their look changes then.
// ============================================================================

/** A small, repeatable random number maker (mulberry32): the same seed always gives the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The outer shapes a symbol can have (its "family": the seed's hundreds). */
const OUTERS = ['ring', 'triangle', 'diamond', 'square', 'arch', 'none'] as const;

/**
 * Draw one symbol, centred on (cx, cy), `size` pixels across, in the context's current stroke and fill colours.
 * The seed's hundreds choose its outer shape; the rest its inner marks.
 */
export function drawGlyph(g: CanvasRenderingContext2D, seed: number, cx: number, cy: number, size: number): void {
  const r = size / 2;
  const outer = OUTERS[Math.floor(seed / 100) % OUTERS.length];
  const random = seeded(seed * 7919 + 13);
  g.save();
  g.translate(cx, cy);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1.5, size * 0.07);
  // THE OUTER SHAPE
  g.beginPath();
  if (outer === 'ring') g.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  else if (outer === 'triangle') { g.moveTo(0, -r * 0.9); g.lineTo(r * 0.82, r * 0.62); g.lineTo(-r * 0.82, r * 0.62); g.closePath(); }
  else if (outer === 'diamond') { g.moveTo(0, -r * 0.92); g.lineTo(r * 0.8, 0); g.lineTo(0, r * 0.92); g.lineTo(-r * 0.8, 0); g.closePath(); }
  else if (outer === 'square') g.rect(-r * 0.74, -r * 0.74, r * 1.48, r * 1.48);
  else if (outer === 'arch') { g.moveTo(-r * 0.78, r * 0.8); g.lineTo(-r * 0.78, 0); g.arc(0, 0, r * 0.78, Math.PI, 0); g.lineTo(r * 0.78, r * 0.8); }
  if (outer !== 'none') g.stroke();
  // THE INNER MARKS: two to four of them, mirrored left to right half the time (the old carvers liked symmetry)
  const marks = 2 + Math.floor(random() * 3);
  const mirror = random() < 0.5;
  for (let i = 0; i < marks; i++) {
    const kind = Math.floor(random() * 6);
    const a = random() * Math.PI * 2, d = r * (0.15 + random() * 0.4);
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    const draw = (sx: number): void => {
      g.beginPath();
      if (kind === 0) { g.moveTo(0, 0); g.lineTo(sx * x * 1.5, y * 1.5); g.stroke(); }                       // a spoke
      else if (kind === 1) { g.arc(sx * x, y, r * 0.09, 0, Math.PI * 2); g.fill(); }                          // a dot
      else if (kind === 2) { g.arc(0, 0, r * (0.3 + random() * 0.3), a, a + 1.2 + random()); g.stroke(); }   // an arc
      else if (kind === 3) { g.moveTo(-r * 0.5, sx * y); g.lineTo(r * 0.5, sx * y); g.stroke(); }             // a bar
      else if (kind === 4) { g.arc(sx * x, y, r * 0.2, 0, Math.PI * 2); g.stroke(); }                         // a small ring
      else { g.moveTo(sx * x, y - r * 0.25); g.lineTo(sx * x + r * 0.18, y); g.lineTo(sx * x, y + r * 0.25); g.stroke(); } // a chevron
    };
    draw(1);
    if (mirror && kind !== 2 && kind !== 3) draw(-1);
  }
  g.restore();
}

/** One inscription: a few rows of symbols (seeds), and which of them the A.R.C.H. scanner can name. */
export interface Inscription {
  /** Rows of symbol seeds, top to bottom. */
  readonly rows: readonly (readonly number[])[];
  /** The seeds the scanner recognises (the rest show as unidentified). */
  readonly known: ReadonlySet<number>;
  /** How much of it the scanner reconstructs, 0..1 (worn away, or under sediment, the rest). */
  readonly reconstructed: number;
}

/**
 * A worn stone panel with an inscription carved into it, as a canvas: grey-brown stone, the symbols cut in darker with
 * a lighter edge, some of it worn away. `worn` 0 (fresh) .. 1 (mostly gone). The panel's own size is set by the caller.
 */
export function inscriptionCanvas(ins: Inscription, width: number, height: number, worn: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  // (the panel is see-through but for the carving: it lies on the wall, which shows round the symbols)
  g.clearRect(0, 0, width, height);
  const rows = ins.rows.length;
  const cellH = height / rows;
  const random = seeded(seed);
  ins.rows.forEach((row, r) => {
    const cellW = width / row.length;
    const size = Math.min(cellW, cellH) * 0.72;
    row.forEach((glyph, c) => {
      const cx = cellW * (c + 0.5), cy = cellH * (r + 0.5);
      // (a symbol worn away is not drawn at all; a worn one is fainter)
      const wear = random();
      if (wear < worn * 0.35) return;
      const alpha = 1 - Math.max(0, wear - 0.6) * worn;
      // the cut: a lighter edge a pixel up-left, then the dark groove (lit from above, as carvings are)
      g.strokeStyle = `rgba(214, 198, 170, ${0.55 * alpha})`;
      g.fillStyle = g.strokeStyle;
      drawGlyph(g, glyph, cx - 1.5, cy - 1.5, size);
      g.strokeStyle = `rgba(28, 22, 18, ${0.9 * alpha})`;
      g.fillStyle = g.strokeStyle;
      drawGlyph(g, glyph, cx, cy, size);
    });
  });
  // a border cut round it, and grit (the stone's wear) over all of it
  g.strokeStyle = 'rgba(28, 22, 18, 0.7)';
  g.lineWidth = Math.max(2, width * 0.008);
  g.strokeRect(width * 0.02, height * 0.03, width * 0.96, height * 0.94);
  for (let i = 0; i < width * height * 0.0015; i++) {
    g.fillStyle = random() < 0.5 ? 'rgba(20, 16, 12, 0.35)' : 'rgba(220, 205, 180, 0.18)';
    g.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 2);
  }
  return canvas;
}

/**
 * The same carving's symbols in WHITE on black, worn exactly as `inscriptionCanvas` wears them (the same seed): the
 * glow a scannable panel lights up with when John is near enough to scan it (world/prologue/tunnel.ts).
 */
export function inscriptionGlowCanvas(ins: Inscription, width: number, height: number, worn: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  const rows = ins.rows.length;
  const cellH = height / rows;
  const random = seeded(seed);
  ins.rows.forEach((row, r) => {
    const cellW = width / row.length;
    const size = Math.min(cellW, cellH) * 0.72;
    row.forEach((glyph, c) => {
      const wear = random();
      if (wear < worn * 0.35) return;
      const alpha = 1 - Math.max(0, wear - 0.6) * worn;
      g.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      g.fillStyle = g.strokeStyle;
      drawGlyph(g, glyph, cellW * (c + 0.5), cellH * (r + 0.5), size);
    });
  });
  return canvas;
}

/**
 * The same inscription as the SCANNER shows it: each symbol on a dark screen, the ones it knows in A.R.C.H. teal with
 * a number under them, the unknown ones dim with a "?". Used by the story overlay (ui/storyOverlay.ts).
 */
export function scannerCanvas(ins: Inscription, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const rows = ins.rows.length;
  const cellH = height / rows;
  ins.rows.forEach((row, r) => {
    const cellW = width / row.length;
    const size = Math.min(cellW, cellH) * 0.54;
    row.forEach((glyph, c) => {
      const cx = cellW * (c + 0.5), cy = cellH * (r + 0.38);
      const known = ins.known.has(glyph);
      g.strokeStyle = known ? '#5ee8c8' : 'rgba(150, 170, 190, 0.45)';
      g.fillStyle = g.strokeStyle;
      drawGlyph(g, glyph, cx, cy, size);
      g.font = `600 ${Math.round(cellH * 0.24)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = known ? 'rgba(201, 255, 241, 0.9)' : 'rgba(255, 200, 120, 0.9)';
      g.fillText(known ? `S-${glyph}` : '?', cx, cy + size * 0.5 + cellH * 0.22);
    });
  });
  return canvas;
}

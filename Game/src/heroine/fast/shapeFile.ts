// ============================================================================
// shapeFile.ts -- the small binary file a BAKED LOOK keeps her shape in.
//
// WHAT IS IN IT. One entry for every point (vertex) of her skin, in the same
// order as the builder's body file (sarah-v2-body-slim.glb):
//   position    where the Character Builder put the point, for THIS look, as she stands (before any pose)
//   normal      which way her surface faces there (what the builder lit it with)
//   uv          where the point sits in the BAKED PICTURES' texture layout (the file's own layout with its islands
//               moved apart: src/bake/repackUv.ts)
//   skinIndex   which four bones move the point...
//   skinWeight  ...and by how much each (the builder corrects some of the file's own, at her fingers for one)
//
// WHY A FILE. In the builder her shape is put together by a great deal of code
// every time she loads (her belly's and bust's sizes, smoothing files, shape
// sliders, softening under painted clothes). The bake page (src/bake/) lets the
// builder do all of that ONCE and writes down the answer; the fast heroine
// (fastHeroine.ts) just reads it.
//
// THE FORMAT, kept simple so it can be read anywhere:
//   4 bytes   the letters "GDMS"
//   4 bytes   N, the length of the header text (little-endian)
//   N bytes   the header: JSON text (ShapeHeader below), padded with spaces to a multiple of 4
//   the rest  the arrays named in the header, one after another
// Numbers are packed small: a position is three 16-bit steps across her
// bounding box (a step is under 0.03 mm), a normal three signed bytes, a
// weight one byte.
//
// This file has NO three.js in it, so the bake page and the game share it.
// ============================================================================

const MAGIC = 'GDMS';

/** Where one array sits in the file, and how its numbers are packed. */
export interface ShapeSection {
  /** How each number is stored: 16-bit steps, signed bytes, or plain bytes. */
  readonly type: 'u16' | 'i8' | 'u8';
  /** Numbers for each point (3 for a position, 4 for bones). */
  readonly itemSize: number;
  /** Where the array starts, in bytes after the header. */
  readonly offset: number;
  /** For 'u16' positions: the smallest value on each axis, and the size of the box on each axis. */
  readonly min?: readonly number[];
  readonly size?: readonly number[];
}

export interface ShapeHeader {
  readonly version: 1;
  /** How many points her skin has (must equal the body file's, or the shape is not used). */
  readonly count: number;
  readonly sections: Readonly<Record<string, ShapeSection>>;
}

/** Her shape, unpacked into plain arrays. */
export interface BakedShape {
  readonly count: number;
  /** x, y, z for each point, in the body file's own geometry units. */
  readonly position: Float32Array;
  /** x, y, z for each point, unit length. */
  readonly normal: Float32Array;
  /** u, v for each point in the baked pictures' own layout, or null when they use the body file's. */
  readonly uv: Float32Array | null;
  /** Four bone numbers for each point, or null when the file keeps the body file's own. */
  readonly skinIndex: Uint16Array | null;
  /** Four weights for each point (they add up to 1), or null as above. */
  readonly skinWeight: Float32Array | null;
}

/** Pack a shape into the bytes of a shape file. */
export function packShape(shape: BakedShape): Uint8Array {
  const n = shape.count;
  const sections: Record<string, ShapeSection> = {};
  const parts: Uint8Array[] = [];
  let offset = 0;
  const add = (name: string, section: Omit<ShapeSection, 'offset'>, bytes: Uint8Array): void => {
    sections[name] = { ...section, offset };
    parts.push(bytes);
    // (every array starts on a multiple of 4 bytes, so it can be read in place)
    const padded = Math.ceil(bytes.length / 4) * 4;
    if (padded > bytes.length) parts.push(new Uint8Array(padded - bytes.length));
    offset += padded;
  };

  // positions: 16-bit steps across her bounding box
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n * 3; i++) { const v = shape.position[i], c = i % 3; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
  const size = max.map((m, c) => Math.max(1e-9, m - min[c]));
  const steps = new Uint16Array(n * 3);
  for (let i = 0; i < n * 3; i++) { const c = i % 3; steps[i] = Math.round(((shape.position[i] - min[c]) / size[c]) * 65535); }
  add('position', { type: 'u16', itemSize: 3, min, size }, new Uint8Array(steps.buffer));

  // normals: three signed bytes
  const facing = new Int8Array(n * 3);
  for (let i = 0; i < n * 3; i++) facing[i] = Math.max(-127, Math.min(127, Math.round(shape.normal[i] * 127)));
  add('normal', { type: 'i8', itemSize: 3 }, new Uint8Array(facing.buffer));

  if (shape.uv) {
    // texture places: 16-bit steps across the picture (a step is a sixteenth of a texel of a 4096 picture)
    const places = new Uint16Array(n * 2);
    for (let i = 0; i < n * 2; i++) places[i] = Math.round(Math.max(0, Math.min(1, shape.uv[i])) * 65535);
    add('uv', { type: 'u16', itemSize: 2 }, new Uint8Array(places.buffer));
  }

  if (shape.skinIndex && shape.skinWeight) {
    const bones = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
    for (let i = 0; i < n * 4; i++) {
      if (shape.skinIndex[i] > 255) throw new Error('shape file: a bone number over 255 does not fit in a byte');
      bones[i] = shape.skinIndex[i];
      weights[i] = Math.round(Math.max(0, Math.min(1, shape.skinWeight[i])) * 255);
    }
    add('skinIndex', { type: 'u8', itemSize: 4 }, bones);
    add('skinWeight', { type: 'u8', itemSize: 4 }, weights);
  }

  const header: ShapeHeader = { version: 1, count: n, sections };
  let text = JSON.stringify(header);
  while (text.length % 4 !== 0) text += ' ';
  const headerBytes = new TextEncoder().encode(text);
  const out = new Uint8Array(8 + headerBytes.length + offset);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(4, headerBytes.length, true);
  out.set(headerBytes, 8);
  let at = 8 + headerBytes.length;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/** Read a shape file's bytes back into plain arrays. Throws if the bytes are not a shape file. */
export function unpackShape(buffer: ArrayBuffer): BakedShape {
  const bytes = new Uint8Array(buffer);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('not a shape file (it does not start with "GDMS")');
  const headerLength = new DataView(buffer).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as ShapeHeader;
  if (header.version !== 1) throw new Error(`shape file version ${String(header.version)} is not one this game reads`);
  const data = 8 + headerLength, n = header.count;
  const need = (name: string): ShapeSection => {
    const s = header.sections[name];
    if (!s) throw new Error(`the shape file has no "${name}"`);
    return s;
  };

  const p = need('position');
  const steps = new Uint16Array(buffer.slice(data + p.offset, data + p.offset + n * 3 * 2));
  const position = new Float32Array(n * 3);
  const min = p.min ?? [0, 0, 0], size = p.size ?? [1, 1, 1];
  for (let i = 0; i < n * 3; i++) { const c = i % 3; position[i] = min[c] + (steps[i] / 65535) * size[c]; }

  const f = need('normal');
  const facing = new Int8Array(buffer, data + f.offset, n * 3);
  const normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = facing[i * 3], y = facing[i * 3 + 1], z = facing[i * 3 + 2], length = Math.hypot(x, y, z) || 1;
    normal[i * 3] = x / length; normal[i * 3 + 1] = y / length; normal[i * 3 + 2] = z / length;
  }

  let uv: Float32Array | null = null;
  const placesAt = header.sections.uv;
  if (placesAt) {
    const places = new Uint16Array(buffer.slice(data + placesAt.offset, data + placesAt.offset + n * 2 * 2));
    uv = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) uv[i] = places[i] / 65535;
  }

  let skinIndex: Uint16Array | null = null, skinWeight: Float32Array | null = null;
  const bonesAt = header.sections.skinIndex, weightsAt = header.sections.skinWeight;
  if (bonesAt && weightsAt) {
    const bones = new Uint8Array(buffer, data + bonesAt.offset, n * 4), weights = new Uint8Array(buffer, data + weightsAt.offset, n * 4);
    skinIndex = new Uint16Array(n * 4);
    skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // (a point's four weights are made to add up to exactly 1 again after their trip through bytes)
      const sum = weights[i * 4] + weights[i * 4 + 1] + weights[i * 4 + 2] + weights[i * 4 + 3] || 1;
      for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = bones[i * 4 + k]; skinWeight[i * 4 + k] = weights[i * 4 + k] / sum; }
    }
  }
  return { count: n, position, normal, uv, skinIndex, skinWeight };
}

// ============================================================================
// piecesFile.ts -- the file a BAKED LOOK keeps her EXTRA PIECES in.
//
// Besides her skin, the Character Builder's room draws a few small pieces of
// its own making that belong to an outfit: the strip of fabric a sports bra
// stretches across her cleavage, her sneakers. They are not in the body file,
// so the bake page writes them down here and the fast heroine draws them as
// ordinary skinned meshes on her skeleton (extraPieces.ts).
//
// THE FORMAT (the same plan as shapeFile.ts):
//   4 bytes  "GDMP"   |   4 bytes  N   |   N bytes of JSON (`PiecesHeader`)   |   the arrays
// Each piece's arrays are stored plainly (32-bit floats, bytes, 32-bit triangle
// numbers): the pieces are small.
//
// No three.js in this file, so the bake page and the game share it.
// ============================================================================

const MAGIC = 'GDMP';

/** One extra piece, as plain arrays. */
export interface BakedPiece {
  /** What it is ('cleavageBridge', 'sneakerL'...). */
  readonly name: string;
  /** x, y, z for each point, in the units her skinning expects (see `bindMatrix`). */
  readonly position: Float32Array;
  /** x, y, z for each point. */
  readonly normal: Float32Array;
  /** r, g, b for each point, 0-255, stored the way a colour picture is (sRGB). */
  readonly colour: Uint8Array;
  /** u, v for each point, when the piece has a picture (`map`). */
  readonly uv: Float32Array | null;
  /** Four bone numbers and four weights (0-255) for each point. */
  readonly skinIndex: Uint8Array;
  readonly skinWeight: Uint8Array;
  /** Her four motion shapes' moves for each point (4 x 3 numbers a point), when the piece rides her belly or bust. */
  readonly motion: Float32Array | null;
  /** Three point numbers for each triangle. */
  readonly index: Uint32Array;
  /** The 16 numbers of the matrix the piece is bound to her skeleton with (three.js's `bindMatrix`). */
  readonly bindMatrix: readonly number[];
  /** How rough and how metallic its surface is (0-1), and whether both of its sides are drawn. */
  readonly roughness: number;
  readonly metalness: number;
  readonly doubleSided: boolean;
  /** The file name of its picture beside look.json, or null when its colour is all in `colour`. */
  readonly map: string | null;
  /** True when its picture has see-through parts that cut its outline (the cleavage strip is cut to the neckline). */
  readonly cutOut: boolean;
}

interface Where { readonly offset: number; readonly length: number }
interface PieceHeader {
  readonly name: string; readonly points: number; readonly bindMatrix: readonly number[];
  readonly roughness: number; readonly metalness: number; readonly doubleSided: boolean; readonly map: string | null; readonly cutOut: boolean;
  readonly arrays: Readonly<Record<string, Where>>;
}
interface PiecesHeader { readonly version: 1; readonly pieces: readonly PieceHeader[] }

/** Pack pieces into the bytes of a pieces file. */
export function packPieces(pieces: readonly BakedPiece[]): Uint8Array {
  const parts: Uint8Array[] = [];
  let offset = 0;
  const put = (array: Float32Array | Uint8Array | Uint32Array | null): Where | null => {
    if (!array) return null;
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const where = { offset, length: array.length };
    parts.push(bytes);
    // (every array starts on a multiple of 4 bytes)
    const padded = Math.ceil(bytes.length / 4) * 4;
    if (padded > bytes.length) parts.push(new Uint8Array(padded - bytes.length));
    offset += padded;
    return where;
  };
  const header: PiecesHeader = {
    version: 1,
    pieces: pieces.map((p) => {
      const arrays: Record<string, Where> = {};
      for (const [name, array] of Object.entries({ position: p.position, normal: p.normal, colour: p.colour, uv: p.uv, skinIndex: p.skinIndex, skinWeight: p.skinWeight, motion: p.motion, index: p.index })) {
        const where = put(array);
        if (where) arrays[name] = where;
      }
      return { name: p.name, points: p.position.length / 3, bindMatrix: p.bindMatrix, roughness: p.roughness, metalness: p.metalness, doubleSided: p.doubleSided, map: p.map, cutOut: p.cutOut, arrays };
    }),
  };
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

/** Read a pieces file's bytes back. Throws if the bytes are not a pieces file. */
export function unpackPieces(buffer: ArrayBuffer): BakedPiece[] {
  if (new TextDecoder().decode(new Uint8Array(buffer, 0, 4)) !== MAGIC) throw new Error('not a pieces file (it does not start with "GDMP")');
  const headerLength = new DataView(buffer).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))) as PiecesHeader;
  if (header.version !== 1) throw new Error(`pieces file version ${String(header.version)} is not one this game reads`);
  const data = 8 + headerLength;
  return header.pieces.map((p) => {
    const f32 = (name: string): Float32Array | null => { const w = p.arrays[name]; return w ? new Float32Array(buffer.slice(data + w.offset, data + w.offset + w.length * 4)) : null; };
    const u8 = (name: string): Uint8Array | null => { const w = p.arrays[name]; return w ? new Uint8Array(buffer.slice(data + w.offset, data + w.offset + w.length)) : null; };
    const u32 = (name: string): Uint32Array | null => { const w = p.arrays[name]; return w ? new Uint32Array(buffer.slice(data + w.offset, data + w.offset + w.length * 4)) : null; };
    const need = <T>(value: T | null, name: string): T => { if (!value) throw new Error(`the piece "${p.name}" has no ${name}`); return value; };
    return {
      name: p.name,
      position: need(f32('position'), 'position'), normal: need(f32('normal'), 'normal'), colour: need(u8('colour'), 'colour'),
      uv: f32('uv'), skinIndex: need(u8('skinIndex'), 'skinIndex'), skinWeight: need(u8('skinWeight'), 'skinWeight'),
      motion: f32('motion'), index: need(u32('index'), 'index'),
      bindMatrix: p.bindMatrix, roughness: p.roughness, metalness: p.metalness, doubleSided: p.doubleSided, map: p.map, cutOut: p.cutOut === true,
    };
  });
}

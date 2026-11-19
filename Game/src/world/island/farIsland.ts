// ============================================================================
// farIsland.ts -- the WHOLE island, coarse, for what is past the tiles.
//
// Only the 3 x 3 tiles round her are loaded (tileStreamer.ts: 21 km square).
// Looking out from the beach, the mountains and the far coast should still be
// there, so this draws the whole 56 km island as ONE mesh of 192 x 192 squares
// (about 290 m each) from one small height picture of all of it
// (public/island/kauai/overview.png, made by scripts/make_island_overview.py).
// One draw for the whole view, light enough for a phone.
//
// It uses the same ground colouring as the tiles (groundPaint.ts), and leaves
// out every square where a tile is drawn in full, so the two never overlap.
// ============================================================================
import * as THREE from 'three';
import { decodeElevation } from './terrainSampling';
import { makeGroundMaterial, type GroundPictures } from './groundPaint';

/** Squares along each side of the far island. */
const FAR_SEG = 192;

export async function createFarIsland(base: string, sizeM: number, pictures: GroundPictures, shown: THREE.DataTexture, origin: THREE.Vector2): Promise<THREE.Mesh> {
  // the overview picture's heights (read once, on the game's own thread: it is small)
  const picture = await new THREE.ImageLoader().loadAsync(`${base}kauai/overview.png`);
  const P = picture.width;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = P;
  const pen = canvas.getContext('2d', { willReadFrequently: true })!;
  pen.drawImage(picture, 0, 0);
  const colours = pen.getImageData(0, 0, P, P).data;
  const heights = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) heights[i] = decodeElevation(colours[i * 4], colours[i * 4 + 1], colours[i * 4 + 2]);

  const geometry = new THREE.PlaneGeometry(sizeM, sizeM, FAR_SEG, FAR_SEG);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const elevation = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const fx = Math.min(P - 1, Math.max(0, (position.getX(i) / sizeM + 0.5) * (P - 1)));
    const fy = Math.min(P - 1, Math.max(0, (position.getZ(i) / sizeM + 0.5) * (P - 1)));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(P - 1, x0 + 1), y1 = Math.min(P - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const y = heights[y0 * P + x0] * (1 - tx) * (1 - ty) + heights[y0 * P + x1] * tx * (1 - ty) + heights[y1 * P + x0] * (1 - tx) * ty + heights[y1 * P + x1] * tx * ty;
    position.setY(i, y);
    elevation[i] = y;
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('aElev', new THREE.BufferAttribute(elevation, 1));
  const mesh = new THREE.Mesh(geometry, makeGroundMaterial(pictures, { shown, origin }));
  mesh.name = 'island-far';
  // the island's centre is the middle of the picture; the game's centre is where she arrives
  mesh.position.set(-origin.x, 0, -origin.y);
  mesh.updateMatrixWorld(true);
  return mesh;
}

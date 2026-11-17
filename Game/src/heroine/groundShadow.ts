// ============================================================================
// groundShadow.ts -- a soft round shadow on the ground under the heroine.
//
// She is drawn by the builder's room (roomDraw.ts), which the game's lights
// cannot cast real shadows from. A dark, soft-edged disc under her feet does
// the job a real shadow does for the eye -- it sits her on the ground -- for
// the cost of two triangles, which suits a phone.
// ============================================================================
import * as THREE from 'three';

export interface GroundShadow {
  readonly object: THREE.Mesh;
  dispose(): void;
}

export function createGroundShadow(radius = 0.55, darkness = 0.5): GroundShadow {
  // The picture: black in the middle fading to nothing at the edge, painted once on a small canvas.
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fade.addColorStop(0, `rgba(0,0,0,${darkness})`);
  fade.addColorStop(0.45, `rgba(0,0,0,${darkness * 0.6})`);
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);

  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2);
  // (see-through, and it never writes depth: it is a stain on the ground, not a thing standing on it)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const object = new THREE.Mesh(geometry, material);
  object.name = 'heroine-ground-shadow';
  object.position.y = 0.012;
  // (drawn before other see-through things, so sparks and shots blend over it)
  object.renderOrder = -1;

  return {
    object,
    dispose(): void { geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}

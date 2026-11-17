// ============================================================================
// roomDraw.ts -- drawing the builder's room INSIDE the game's picture.
//
// THE PROBLEM. The Character Builder draws her in its own space: centimetres,
// her feet at its origin, facing +Z. Much of its code depends on that space --
// its cloth and springs are worked out in it, and several of its shaders
// compare a pixel's place in the WORLD with numbers the builder worked out in
// that same world (how the tee lies over her navel, for one). Simply putting
// her objects inside a moved, turned, scaled-down group in the game's scene
// changes "the world" under those shaders, and her tee draws blotched.
// (Tried first, 2026-11-16; the blotches are in the report.)
//
// THE ANSWER. Her objects never leave the builder's space. Instead, while the
// game is drawing its own scene, the room is drawn into the SAME picture with
// a camera that has been moved the opposite way: if the game puts her 3 m to
// the left and turns her a quarter turn, the room is drawn from a camera 3 m
// to the right, turned a quarter turn back, at a hundred times the scale. The
// pixels come out exactly where the game wants her, the depth buffer agrees
// with the rest of the scene (walls in front of her hide her, she hides what
// is behind her), and every builder shader sees the world it was written for.
//
// HOW IT IS HOOKED IN. `proxy` is an invisible box round her that the game's
// scene DOES contain (inside the heroine's root). three.js calls a mesh's
// `onBeforeRender` just before drawing it; the proxy's draws the room. Two
// good things follow:
//   * when the box is outside the camera's view three.js skips it, so she is
//     not drawn at all when she is off screen;
//   * the box is an ordinary solid object, so she is drawn with the game's
//     solid things, BEFORE its see-through things (dome glass, sparks, shots),
//     which then blend over her correctly.
// (three.js's own mirror and water objects draw their reflections the same
// way: a render inside `onBeforeRender`.)
//
// LIGHT. The room has no lights of its own any more. Each of the game's
// lights is given a twin inside the room, moved into the room's space, so she
// is lit by the game's world wherever she stands and however she is turned.
//
// WHAT THIS DOES NOT DO: she casts no shadow from the game's lights and
// receives none (a soft round shadow under her feet stands in: see
// builderHeroine.ts). See the report for the other limits.
// ============================================================================
import * as THREE from 'three';

/** How often the game's scene is searched again for lights added or removed (milliseconds). */
const FIND_LIGHTS_EVERY_MS = 500;

export class RoomDrawer {
  /** The invisible box round her. It must be inside the heroine's root, in the game's scene. */
  readonly proxy: THREE.Mesh;

  /** The camera the room is drawn with: the game's camera, moved into the room's space. */
  private readonly roomCamera = new THREE.PerspectiveCamera();
  /** The twins of the game's lights, kept in the room's scene. */
  private readonly twins = new THREE.Group();
  private readonly twinOf = new Map<THREE.Light, THREE.Light>();
  private lightsFoundAt = -Infinity;
  private roomFog: THREE.Fog | THREE.FogExp2 | null = null;
  /** True while the room is being drawn, so the room's own draw can never start another. */
  private drawing = false;

  // scratch objects, made once
  private readonly rootInverse = new THREE.Matrix4();
  private readonly rootTurnBack = new THREE.Quaternion();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly shrink = new THREE.Matrix4();

  /**
   * @param roomScene the builder's own scene (her model, hair, cloth), in the builder's units
   * @param root      the heroine's root in the game's scene: where her feet are, which way she faces
   * @param units     the builder's units in one metre (100)
   */
  constructor(private readonly roomScene: THREE.Scene, private readonly root: THREE.Object3D, private readonly units: number) {
    // The box: wide enough for her arms held out with guns, tall enough for her head. Nothing of it is ever seen:
    // its material writes neither colour nor depth.
    const box = new THREE.BoxGeometry(2.2, 2.1, 2.2).translate(0, 1.0, 0);
    this.proxy = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
    this.proxy.name = 'heroine-room-proxy';
    this.proxy.onBeforeRender = (renderer, scene, camera) => this.draw(renderer as THREE.WebGLRenderer, scene as THREE.Scene, camera);

    this.roomCamera.matrixAutoUpdate = false;
    // (its matrices are written by hand in `aimCamera`; three.js must not work them out again from position and rotation)
    this.roomCamera.matrixWorldAutoUpdate = false;
    this.twins.name = 'game-light-twins';
    roomScene.add(this.twins);
  }

  /** Make the room's lights, fog and reflections match the game's scene now (also done by every draw). */
  matchScene(gameScene: THREE.Scene): void {
    this.root.updateWorldMatrix(true, false);
    this.readRoot();
    this.matchLights(gameScene);
    this.matchAir(gameScene);
  }

  /** The room's camera for a game camera (for compiling her materials ahead of the first draw). */
  cameraFor(gameCamera: THREE.Camera): THREE.Camera {
    this.root.updateWorldMatrix(true, false);
    gameCamera.updateWorldMatrix(true, false);
    this.readRoot();
    this.aimCamera(gameCamera);
    return this.roomCamera;
  }

  dispose(): void {
    this.proxy.removeFromParent();
    this.proxy.geometry.dispose();
    (this.proxy.material as THREE.Material).dispose();
    this.twins.removeFromParent();
    for (const twin of this.twinOf.values()) twin.dispose();
    this.twinOf.clear();
  }

  // ------------------------------------------------------------------ the draw

  private draw(renderer: THREE.WebGLRenderer, gameScene: THREE.Scene, gameCamera: THREE.Camera): void {
    if (this.drawing) return;
    this.readRoot();
    this.matchLights(gameScene);
    this.matchAir(gameScene);
    this.aimCamera(gameCamera);

    // Draw the room into the picture the game is in the middle of drawing: nothing cleared, the same depth buffer.
    // The renderer's settings that a second draw would disturb are put back afterwards.
    // (and the room's own dark backdrop colour is taken away for the moment: three.js always clears to a scene's
    // backdrop colour, which would wipe the game's picture; the room wants it back for its own theme code)
    const backdrop = this.roomScene.background;
    this.roomScene.background = null;
    const keep = { autoClear: renderer.autoClear, xr: renderer.xr.enabled, shadows: renderer.shadowMap.autoUpdate, count: renderer.info.autoReset };
    renderer.autoClear = false;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    // (her triangles and draw calls are added to this frame's count, not counted as a frame of their own)
    renderer.info.autoReset = false;
    this.drawing = true;
    try {
      renderer.render(this.roomScene, this.roomCamera);
    } finally {
      this.drawing = false;
      this.roomScene.background = backdrop;
      renderer.autoClear = keep.autoClear;
      renderer.xr.enabled = keep.xr;
      renderer.shadowMap.autoUpdate = keep.shadows;
      renderer.info.autoReset = keep.count;
    }
  }

  /** Read where the root is in the game's world: the matrix that undoes it, and the rotation that undoes its turn. */
  private readRoot(): void {
    this.root.matrixWorld.decompose(this.v, this.rootTurnBack, this.s);
    this.rootTurnBack.invert();
    this.rootInverse.copy(this.root.matrixWorld).invert();
  }

  /** A point in the game's world, as the room sees it. */
  private toRoom(point: THREE.Vector3): THREE.Vector3 {
    return point.applyMatrix4(this.rootInverse).multiplyScalar(this.units);
  }
  /** A direction in the game's world, as the room sees it (turned, never moved or stretched). */
  private turnToRoom(direction: THREE.Vector3): THREE.Vector3 {
    return direction.applyQuaternion(this.rootTurnBack);
  }

  /**
   * Put the room's camera where the game's camera is, as seen from the room.
   *   position: the game camera's place, taken into the room's space (and so into its units);
   *   rotation: the game camera's, with the root's own turn taken off;
   *   lens:     the game camera's own projection, told that distances are now in the room's units.
   * With these, a point of her drawn by the room lands on the same pixel, at the same depth, as if she had been an
   * ordinary object in the game's scene at the root.
   */
  private aimCamera(gameCamera: THREE.Camera): void {
    const cam = this.roomCamera;
    gameCamera.matrixWorld.decompose(this.v, this.q, this.s);
    this.toRoom(this.v);
    this.q.premultiply(this.rootTurnBack);
    cam.matrixWorld.compose(this.v, this.q, this.s.set(1, 1, 1));
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    // projection × (shrink the room's units back to metres): the same lens, measured in the room's units
    const k = 1 / this.units;
    cam.projectionMatrix.copy(gameCamera.projectionMatrix).multiply(this.shrink.makeScale(k, k, k));
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.layers.mask = gameCamera.layers.mask;
    const lens = gameCamera as THREE.PerspectiveCamera;
    if (lens.isPerspectiveCamera) { cam.near = lens.near * this.units; cam.far = lens.far * this.units; }
  }

  // ------------------------------------------------------------------ the light

  /** Find the game's lights (now and then), and move each one's twin to where the room sees that light. */
  private matchLights(gameScene: THREE.Scene): void {
    const now = performance.now();
    if (now - this.lightsFoundAt > FIND_LIGHTS_EVERY_MS) {
      this.lightsFoundAt = now;
      const found = new Set<THREE.Light>();
      gameScene.traverseVisible((n) => { if ((n as THREE.Light).isLight) found.add(n as THREE.Light); });
      for (const [light, twin] of this.twinOf) {
        if (found.has(light)) continue;
        this.twins.remove(twin);
        twin.dispose();
        this.twinOf.delete(light);
      }
      for (const light of found) {
        if (this.twinOf.has(light)) continue;
        const twin = makeTwin(light);
        if (!twin) continue;
        this.twinOf.set(light, twin);
        this.twins.add(twin);
        const aimed = twin as THREE.DirectionalLight | THREE.SpotLight;
        if (aimed.target) this.twins.add(aimed.target);
      }
    }
    const k = this.units;
    for (const [light, twin] of this.twinOf) {
      twin.visible = light.visible;
      twin.color.copy(light.color);
      twin.intensity = light.intensity;
      const from = light as THREE.DirectionalLight, to = twin as THREE.DirectionalLight;
      if (from.isDirectionalLight) {
        // only its direction matters: from the light toward its target, turned into the room
        this.v.setFromMatrixPosition(from.matrixWorld).sub(this.w.setFromMatrixPosition(from.target.matrixWorld));
        to.position.copy(this.turnToRoom(this.v).normalize().multiplyScalar(1000));
        to.target.position.set(0, 0, 0);
      } else if ((light as THREE.HemisphereLight).isHemisphereLight) {
        (twin as THREE.HemisphereLight).groundColor.copy((light as THREE.HemisphereLight).groundColor);
        // (a hemisphere light's "up" is the direction of its own position)
        twin.position.copy(this.turnToRoom(this.v.setFromMatrixPosition(light.matrixWorld).normalize()));
        if (twin.position.lengthSq() < 0.5) twin.position.set(0, 1, 0);
      } else if ((light as THREE.PointLight).isPointLight || (light as THREE.SpotLight).isSpotLight) {
        const p = light as THREE.SpotLight, t = twin as THREE.SpotLight;
        t.position.copy(this.toRoom(this.v.setFromMatrixPosition(p.matrixWorld)));
        t.distance = p.distance * k;
        t.decay = p.decay;
        // light thins with distance to the power `decay`; the room's distances are k times longer, so it is made that much stronger
        t.intensity = p.intensity * Math.pow(k, p.decay);
        if (p.isSpotLight) {
          t.angle = p.angle; t.penumbra = p.penumbra;
          t.target.position.copy(this.toRoom(this.v.setFromMatrixPosition(p.target.matrixWorld)));
        }
      }
    }
  }

  /** The game scene's fog and reflections, for the room. */
  private matchAir(gameScene: THREE.Scene): void {
    const room = this.roomScene, k = this.units;
    room.environment = gameScene.environment;
    room.environmentIntensity = gameScene.environmentIntensity;
    const fog = gameScene.fog;
    if (!fog) { room.fog = null; return; }
    if ((fog as THREE.Fog).isFog) {
      if (!(this.roomFog instanceof THREE.Fog)) this.roomFog = new THREE.Fog(0);
      this.roomFog.color.copy(fog.color); this.roomFog.near = (fog as THREE.Fog).near * k; this.roomFog.far = (fog as THREE.Fog).far * k;
    } else {
      if (!(this.roomFog instanceof THREE.FogExp2)) this.roomFog = new THREE.FogExp2(0);
      this.roomFog.color.copy(fog.color); this.roomFog.density = (fog as THREE.FogExp2).density / k;
    }
    room.fog = this.roomFog;
  }
}

/** A light of the same kind for the room, or null for a kind she is not lit by (area lights, light probes). */
function makeTwin(light: THREE.Light): THREE.Light | null {
  if ((light as THREE.AmbientLight).isAmbientLight) return new THREE.AmbientLight();
  if ((light as THREE.HemisphereLight).isHemisphereLight) return new THREE.HemisphereLight();
  if ((light as THREE.DirectionalLight).isDirectionalLight) return new THREE.DirectionalLight();
  if ((light as THREE.SpotLight).isSpotLight) return new THREE.SpotLight();
  if ((light as THREE.PointLight).isPointLight) return new THREE.PointLight();
  return null;
}

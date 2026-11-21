// =====================================================================================================================
// gpuTally.ts -- AN ESTIMATE OF THE GRAPHICS MEMORY THE GAME HAS ASKED FOR (Joshua and ChatGPT's review, 2026-11-21:
// the iPhone closes the game a split second after Blaze and John are both drawn; "measure before cutting quality").
// ---------------------------------------------------------------------------------------------------------------------
// A web page cannot read how much memory the phone's graphics chip really uses. What it CAN see is every picture and
// every buffer it hands the chip, and how big each one is. This wraps the few WebGL calls that hand them over
// (texImage2D / texStorage2D / texImage3D / texStorage3D / compressedTexImage2D, bufferData, renderbufferStorage) and
// their deletes, and keeps a running total for each kind:
//
//   textures       every picture: her skin, outfit and fabric pictures, the island's, three.js's bone and shape
//                  pictures (each body's 'morph' and 'bone' textures), shadow maps; with their smaller copies (mipmaps)
//   buffers        every list of points and triangles (each body, each detail level, the island's ground, the trees)
//   renderbuffers  the screen's own depth and anti-aliasing buffers
//
// It is an ESTIMATE, always shown as one ("est."): the chip may pad, compress or keep extra copies, and Safari itself
// keeps its own copy of some of it. But it moves exactly as the game's demands move, so it shows which step of loading
// (or which character) asks for how much.
// =====================================================================================================================

type GL = WebGL2RenderingContext;

/** The totals, in bytes, and how many of each are alive. */
export interface GpuTally {
  textureBytes: number; bufferBytes: number; renderbufferBytes: number;
  textures: number; buffers: number;
  /** Everything together, in megabytes (1 MB = 1,048,576 bytes). */
  totalMB(): number;
}

/** Bytes per pixel for the sized formats three.js uses (anything else: worked out from format and type). */
function bytesPerPixel(gl: GL, internal: number, format?: number, type?: number): number {
  switch (internal) {
    case gl.R8: case gl.ALPHA: case gl.LUMINANCE: return 1;
    case gl.RG8: case gl.R16F: case gl.LUMINANCE_ALPHA: case gl.DEPTH_COMPONENT16: return 2;
    case gl.RGB8: case gl.SRGB8: return 3; // (most chips pad these to 4: counted as 3, an honest lower bound)
    case gl.RGBA8: case gl.SRGB8_ALPHA8: case gl.R32F: case gl.RG16F: case gl.DEPTH_COMPONENT24: case gl.DEPTH24_STENCIL8:
    case gl.DEPTH_COMPONENT32F: case gl.R32UI: case gl.R32I: case gl.RGB10_A2: case gl.R11F_G11F_B10F: return 4;
    case gl.RGB16F: return 6;
    case gl.RGBA16F: case gl.RG32F: case gl.DEPTH32F_STENCIL8: return 8;
    case gl.RGB32F: return 12;
    case gl.RGBA32F: case gl.RGBA32UI: case gl.RGBA32I: return 16;
  }
  // (unsized: the format's channels times the type's size)
  const channels = format === gl.RGBA ? 4 : format === gl.RGB ? 3 : format === gl.RG ? 2 : 1;
  const size = type === gl.FLOAT ? 4 : type === gl.HALF_FLOAT ? 2 : type === gl.UNSIGNED_SHORT ? 2 : 1;
  return channels * size;
}

/** Wrap a WebGL2 context so every upload and delete is counted. Call once, before anything is uploaded. */
export function installGpuTally(gl: GL): GpuTally {
  const tally: GpuTally = {
    textureBytes: 0, bufferBytes: 0, renderbufferBytes: 0, textures: 0, buffers: 0,
    totalMB() { return (this.textureBytes + this.bufferBytes + this.renderbufferBytes) / 1048576; },
  };
  // what each live object holds (a texture by its mip levels and layers, so re-uploading a level replaces it)
  const texBytes = new Map<WebGLTexture, Map<number, number>>();
  const bufBytes = new Map<WebGLBuffer, number>();
  const rbBytes = new Map<WebGLRenderbuffer, number>();
  // what is bound now: textures per unit and target, buffers and the renderbuffer per target
  let unit = 0;
  const boundTex = new Map<number, WebGLTexture | null>(); // (key: unit * 65536 + target, a number: no garbage per bind)
  const boundBuf = new Map<number, WebGLBuffer | null>();
  let boundRb: WebGLRenderbuffer | null = null;

  const texOf = (target: number): WebGLTexture | null => {
    // (a cube map's six faces are uploaded to the cube's own binding)
    const t = target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? gl.TEXTURE_CUBE_MAP : target;
    return boundTex.get(unit * 65536 + t) ?? null;
  };
  const setLevel = (tex: WebGLTexture | null, key: number, bytes: number): void => {
    if (!tex) return;
    let levels = texBytes.get(tex);
    if (!levels) { levels = new Map(); texBytes.set(tex, levels); tally.textures++; }
    tally.textureBytes += bytes - (levels.get(key) ?? 0);
    levels.set(key, bytes);
  };
  // (a mip chain from w x h down to 1 x 1, `levels` deep: about a third more than the top level)
  const chain = (w: number, h: number, levels: number, bpp: number, layers = 1): number => {
    let sum = 0;
    for (let i = 0; i < levels; i++) { sum += Math.max(1, w >> i) * Math.max(1, h >> i) * bpp * layers; }
    return sum;
  };

  const wrap = <K extends keyof GL>(name: K, after: (...args: never[]) => void): void => {
    const original = (gl[name] as unknown as (...a: unknown[]) => unknown).bind(gl);
    (gl as unknown as Record<string, unknown>)[name as string] = (...args: unknown[]) => {
      const result = original(...args);
      try { (after as (...a: unknown[]) => void)(...args, result); } catch { /* never let counting break drawing */ }
      return result;
    };
  };

  // (the three called hundreds of times a frame are wrapped by hand, with no list made per call)
  const activeTexture = gl.activeTexture.bind(gl), bindTexture = gl.bindTexture.bind(gl), bindBuffer = gl.bindBuffer.bind(gl);
  gl.activeTexture = (u: number): void => { activeTexture(u); unit = u - gl.TEXTURE0; };
  gl.bindTexture = (target: number, tex: WebGLTexture | null): void => { bindTexture(target, tex); boundTex.set(unit * 65536 + target, tex); };
  gl.bindBuffer = (target: number, buf: WebGLBuffer | null): void => { bindBuffer(target, buf); boundBuf.set(target, buf); };
  wrap('texImage2D', (...a: unknown[]) => {
    const target = a[0] as number, level = a[1] as number, internal = a[2] as number;
    // two shapes of call: (target, level, internal, width, height, border, format, type, ...) or
    // (target, level, internal, format, type, source) where the size is the picture's own
    let w = 0, h = 0, format: number | undefined, type: number | undefined;
    if (typeof a[3] === 'number' && typeof a[4] === 'number' && typeof a[6] === 'number') { w = a[3]; h = a[4] as number; format = a[6] as number; type = a[7] as number; }
    else { const src = a[5] as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined; w = src?.videoWidth ?? src?.width ?? 0; h = src?.videoHeight ?? src?.height ?? 0; format = a[3] as number; type = a[4] as number; }
    const face = target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? target - gl.TEXTURE_CUBE_MAP_POSITIVE_X : 0;
    setLevel(texOf(target), face * 100 + level, w * h * bytesPerPixel(gl, internal, format, type));
  });
  wrap('texStorage2D', (target: number, levels: number, internal: number, w: number, h: number) => {
    setLevel(texOf(target), 0, chain(w, h, levels, bytesPerPixel(gl, internal)) * (target === gl.TEXTURE_CUBE_MAP ? 6 : 1));
  });
  wrap('texImage3D', (...a: unknown[]) => {
    const target = a[0] as number, level = a[1] as number, internal = a[2] as number;
    setLevel(texOf(target), level, (a[3] as number) * (a[4] as number) * (a[5] as number) * bytesPerPixel(gl, internal, a[7] as number, a[8] as number));
  });
  wrap('texStorage3D', (target: number, levels: number, internal: number, w: number, h: number, depth: number) => {
    setLevel(texOf(target), 0, chain(w, h, levels, bytesPerPixel(gl, internal), depth));
  });
  wrap('compressedTexImage2D', (...a: unknown[]) => {
    const data = a[6] as ArrayBufferView | undefined;
    setLevel(texOf(a[0] as number), a[1] as number, data?.byteLength ?? 0);
  });
  wrap('generateMipmap', (target: number) => {
    const tex = texOf(target), levels = tex ? texBytes.get(tex) : undefined, top = levels?.get(0);
    if (top) setLevel(tex, 1, Math.round(top / 3)); // (the smaller copies: about a third of the top level together)
  });
  wrap('deleteTexture', (tex: WebGLTexture | null) => {
    const levels = tex ? texBytes.get(tex) : undefined;
    if (!tex || !levels) return;
    for (const b of levels.values()) tally.textureBytes -= b;
    texBytes.delete(tex);
    tally.textures--;
  });

  wrap('bufferData', (target: number, data: number | ArrayBufferView | ArrayBuffer | null) => {
    const buf = boundBuf.get(target);
    if (!buf) return;
    const bytes = typeof data === 'number' ? data : data ? data.byteLength : 0;
    if (!bufBytes.has(buf)) tally.buffers++;
    tally.bufferBytes += bytes - (bufBytes.get(buf) ?? 0);
    bufBytes.set(buf, bytes);
  });
  wrap('deleteBuffer', (buf: WebGLBuffer | null) => {
    if (!buf || !bufBytes.has(buf)) return;
    tally.bufferBytes -= bufBytes.get(buf)!;
    bufBytes.delete(buf);
    tally.buffers--;
  });

  wrap('bindRenderbuffer', (_target: number, rb: WebGLRenderbuffer | null) => { boundRb = rb; });
  const storeRb = (samples: number, internal: number, w: number, h: number): void => {
    if (!boundRb) return;
    const bytes = w * h * bytesPerPixel(gl, internal) * Math.max(1, samples);
    tally.renderbufferBytes += bytes - (rbBytes.get(boundRb) ?? 0);
    rbBytes.set(boundRb, bytes);
  };
  wrap('renderbufferStorage', (_t: number, internal: number, w: number, h: number) => storeRb(1, internal, w, h));
  wrap('renderbufferStorageMultisample', (_t: number, samples: number, internal: number, w: number, h: number) => storeRb(samples, internal, w, h));
  wrap('deleteRenderbuffer', (rb: WebGLRenderbuffer | null) => {
    if (!rb || !rbBytes.has(rb)) return;
    tally.renderbufferBytes -= rbBytes.get(rb)!;
    rbBytes.delete(rb);
  });
  return tally;
}

/**
 * THE GRAPHICS CHIP'S OWN TIME FOR A FRAME, where the phone offers it (WebGL2's EXT_disjoint_timer_query_webgl2;
 * Safari 17 and up may). `begin` before drawing, `end` after; the answer comes a few frames later (`ms`, or null while
 * none has come, or when the phone does not offer it: `available` false).
 */
export class GpuTimer {
  readonly available: boolean;
  ms: number | null = null;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly waiting: WebGLQuery[] = [];
  private running: WebGLQuery | null = null;
  constructor(private readonly gl: GL) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    this.available = !!this.ext;
  }
  begin(): void {
    if (!this.ext || this.running || this.waiting.length > 3) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.running = q;
  }
  end(): void {
    if (!this.ext || !this.running) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.waiting.push(this.running);
    this.running = null;
    // (the oldest answers that have come in)
    while (this.waiting.length) {
      const q = this.waiting[0];
      if (!this.gl.getQueryParameter(q, this.gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      const ns = this.gl.getQueryParameter(q, this.gl.QUERY_RESULT) as number;
      if (!disjoint) this.ms = this.ms === null ? ns / 1e6 : this.ms + (ns / 1e6 - this.ms) * 0.2;
      this.gl.deleteQuery(q);
      this.waiting.shift();
    }
  }
}

// =====================================================================================================================
// glTrouble.ts -- GRAPHICS TROUBLE SAID ON SCREEN (Joshua, 2026-11-21: on his iPhone John stood there as only his belt,
// sneakers and shadow, "a cool effect like for a transparent character", while the same build drew him whole here).
// ---------------------------------------------------------------------------------------------------------------------
// When a phone's graphics chip will not build a shader, three.js says so only in the browser's console, which cannot be
// opened on an iPhone. This listens for those messages (three.js writes them with console.error, starting
// "THREE.WebGLProgram" or "THREE.WebGLShader"), and for the graphics being lost altogether, and hands a short line to
// whoever wants it (main.ts shows it as a notice), so a screenshot tells us what went wrong.
// =====================================================================================================================

/** Lines said so far, oldest first (also in the browser's console as `gdmGlTrouble`). */
const said: string[] = [];
let listener: ((line: string) => void) | null = null;

const tell = (line: string): void => {
  said.push(line);
  (window as unknown as { gdmGlTrouble: string[] }).gdmGlTrouble = said;
  listener?.(line);
};

/** Start listening (once, before the first frame is drawn). */
export function watchGlTrouble(canvas: HTMLCanvasElement): void {
  const plainError = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    plainError(...args);
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.startsWith('THREE.WebGLProgram') || first.startsWith('THREE.WebGLShader')) {
      // (the useful part is the chip's own reason, usually the first "ERROR:" line of the log three.js prints)
      const text = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
      const reason = /ERROR:[^\n]*/.exec(text)?.[0] ?? first;
      tell(`Shader trouble: ${reason.slice(0, 90)}`);
    }
  };
  canvas.addEventListener('webglcontextlost', () => tell('Graphics were lost (the phone took them back)'));
}

/** Who to tell from now on; anything said before is told at once. */
export function onGlTrouble(tellMe: (line: string) => void): void {
  listener = tellMe;
  for (const line of said) tellMe(line);
}

export const MAX_DPR = 2;

export interface Renderer {
  dispose(): void;
}

/** Full-window WebGL2 canvas that tracks its CSS size in device pixels and clears every frame. */
export function createRenderer(
  canvas: HTMLCanvasElement,
  clearColor: readonly [number, number, number],
): Renderer {
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) throw new Error('WebGL2 is not supported in this browser.');

  let cssWidth = canvas.clientWidth;
  let cssHeight = canvas.clientHeight;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentBoxSize[0];
    if (!box) return;
    cssWidth = box.inlineSize;
    cssHeight = box.blockSize;
  });
  observer.observe(canvas);

  let frame = 0;
  const draw = (): void => {
    resize(); // also picks up DPR changes (zoom, moving between monitors)
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  return {
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}

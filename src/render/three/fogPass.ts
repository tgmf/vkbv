// The fog as the viewer draws it (06 §2; Tagir, 2026-11-25: one fog, everything outside the lanterns):
// the scene is drawn sharp, a blurred copy beside it, and the two are mixed by a mask of the lanterns
// laid on the ground, so everything outside a lantern is blurred and the lantern stays crisp.
import {
  CircleGeometry,
  Color,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** A 9-tap Gaussian along `dir` (in texels × spread), with linear sampling between taps. */
const BLUR = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tSrc, vUv) * 0.2270270270;
  c += texture2D(tSrc, vUv + dir * 1.3846153846) * 0.3162162162;
  c += texture2D(tSrc, vUv - dir * 1.3846153846) * 0.3162162162;
  c += texture2D(tSrc, vUv + dir * 3.2307692308) * 0.0702702703;
  c += texture2D(tSrc, vUv - dir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;

const COMPOSE = /* glsl */ `
uniform sampler2D tSharp;
uniform sampler2D tBlur;
uniform sampler2D tMask;
varying vec2 vUv;
void main() {
  float inside = texture2D(tMask, vUv).r;
  gl_FragColor = mix(texture2D(tBlur, vUv), texture2D(tSharp, vUv), inside);
  #include <colorspace_fragment>
}`;

/** Blur passes at 1/DOWN of the resolution, and how far apart their taps are, in those texels. */
const DOWN = 2;
const PASSES = 1;
const SPREAD = 2.2;
/** The mask reaches a little past the lantern's edge, so cats standing at it stay sharp. */
const MASK_OVERSCAN = 1.08;

export interface FogPass {
  /** Draws `scene` to the screen, blurred outside the given lantern discs (world x, z, radius in m). */
  render(
    gl: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    lanterns: readonly { x: number; z: number; r: number }[],
  ): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

/** `feather`: a white disc on transparent whose alpha is 1 inside the lantern, 0 outside. */
export function createFogPass(feather: Texture): FogPass {
  const opts = { type: HalfFloatType };
  const sharp = new WebGLRenderTarget(1, 1, opts);
  const ping = new WebGLRenderTarget(1, 1, opts);
  const pong = new WebGLRenderTarget(1, 1, opts);
  const mask = new WebGLRenderTarget(1, 1);
  const texel = new Vector2(1, 1);

  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2));
  quadScene.add(quad);
  // three binds these objects when it compiles the shaders: change their values, never replace them
  const blurU = { tSrc: { value: null as Texture | null }, dir: { value: new Vector2() } };
  const composeU = {
    tSharp: { value: null as Texture | null },
    tBlur: { value: null as Texture | null },
    tMask: { value: null as Texture | null },
  };
  const blur = new ShaderMaterial({
    uniforms: blurU,
    vertexShader: VERTEX,
    fragmentShader: BLUR,
    depthTest: false,
    depthWrite: false,
  });
  const compose = new ShaderMaterial({
    uniforms: composeU,
    vertexShader: VERTEX,
    fragmentShader: COMPOSE,
    depthTest: false,
    depthWrite: false,
  });

  const maskScene = new Scene();
  maskScene.background = new Color(0, 0, 0);
  const discs: Mesh[] = [];
  const discMaterial = new MeshBasicMaterial({ map: feather, transparent: true, depthTest: false });
  const discAt = (i: number): Mesh => {
    let d = discs[i];
    if (!d) {
      d = new Mesh(new CircleGeometry(1, 96), discMaterial);
      d.rotation.x = -Math.PI / 2;
      maskScene.add(d);
      discs.push(d);
    }
    d.visible = true;
    return d;
  };

  const pass = (gl: WebGLRenderer, material: ShaderMaterial, target: WebGLRenderTarget | null) => {
    quad.material = material;
    gl.setRenderTarget(target);
    gl.render(quadScene, quadCamera);
  };

  return {
    render(gl, scene, camera, lanterns) {
      gl.setRenderTarget(sharp);
      gl.render(scene, camera);

      lanterns.forEach((l, i) => {
        const d = discAt(i);
        d.position.set(l.x, 0.45, l.z);
        d.scale.setScalar(Math.max(1, l.r) * MASK_OVERSCAN);
      });
      for (const d of discs.slice(lanterns.length)) d.visible = false;
      gl.setRenderTarget(mask);
      gl.render(maskScene, camera);

      let src: Texture = sharp.texture;
      for (let i = 0; i < PASSES; i++) {
        blurU.tSrc.value = src;
        blurU.dir.value.set(texel.x * SPREAD, 0);
        pass(gl, blur, ping);
        blurU.tSrc.value = ping.texture;
        blurU.dir.value.set(0, texel.y * SPREAD);
        pass(gl, blur, pong);
        src = pong.texture;
      }

      composeU.tSharp.value = sharp.texture;
      composeU.tBlur.value = pong.texture;
      composeU.tMask.value = mask.texture;
      pass(gl, compose, null);
    },
    setSize(width, height) {
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      sharp.setSize(w, h);
      const hw = Math.max(1, Math.round(w / DOWN));
      const hh = Math.max(1, Math.round(h / DOWN));
      for (const t of [ping, pong, mask]) t.setSize(hw, hh);
      texel.set(1 / hw, 1 / hh);
    },
    dispose() {
      for (const t of [sharp, ping, pong, mask]) t.dispose();
      blur.dispose();
      compose.dispose();
      discMaterial.dispose();
    },
  };
}

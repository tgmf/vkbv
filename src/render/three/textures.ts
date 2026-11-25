// Canvas-drawn textures for the graybox (06 §2): cut-out cat silhouettes in their `look` colours, a
// soft disc for the lantern and glows, rain streaks, barrier stripes. Placeholder art only.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas');
  return [el, ctx];
}

function texture(el: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(el);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A sitting cat seen from the front: body, head, two ears; accent belly; optional accessories. */
export function catTexture(look: Readonly<Record<string, unknown>>): CanvasTexture {
  const [el, g] = canvas(128, 160);
  const fur = typeof look['fur'] === 'string' ? look['fur'] : '#888888';
  const accent = typeof look['accent'] === 'string' ? look['accent'] : '#ffffff';
  g.lineWidth = 6;
  g.strokeStyle = '#111317';
  g.fillStyle = fur;
  // body
  g.beginPath();
  g.ellipse(64, 112, 40, 44, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // head and ears
  g.beginPath();
  g.moveTo(30, 52);
  g.lineTo(36, 10);
  g.lineTo(56, 34);
  g.lineTo(72, 34);
  g.lineTo(92, 10);
  g.lineTo(98, 52);
  g.arc(64, 56, 34, 0, Math.PI);
  g.closePath();
  g.fill();
  g.stroke();
  // belly
  g.fillStyle = accent;
  g.beginPath();
  g.ellipse(64, 120, 20, 26, 0, 0, Math.PI * 2);
  g.fill();
  // eyes
  g.fillStyle = '#111317';
  g.beginPath();
  g.arc(50, 56, 5, 0, Math.PI * 2);
  g.arc(78, 56, 5, 0, Math.PI * 2);
  g.fill();
  if (look['glasses'] === true) {
    g.strokeStyle = '#f2f2f2';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(50, 56, 10, 0, Math.PI * 2);
    g.moveTo(88, 56);
    g.arc(78, 56, 10, 0, Math.PI * 2);
    g.stroke();
  }
  if (typeof look['scarf'] === 'string') {
    g.fillStyle = look['scarf'];
    g.fillRect(34, 84, 60, 10);
  }
  if (look['hat'] === 'hardhat') {
    g.fillStyle = '#f2c230';
    g.beginPath();
    g.arc(64, 30, 26, Math.PI, 0);
    g.fill();
  }
  return texture(el);
}

/** A white disc fading to transparent: the lantern, glows, focus halos. */
export function softDisc(): CanvasTexture {
  const [el, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return texture(el);
}

/** Slanted rain streaks, tiling. */
export function rainTexture(): CanvasTexture {
  const [el, g] = canvas(64, 64);
  g.strokeStyle = 'rgba(170,200,255,0.9)';
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = (i * 23) % 64;
    const y = (i * 37) % 64;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 6, y + 14);
    g.stroke();
  }
  const t = texture(el);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}

/** Red and white barrier stripes. */
export function stripeTexture(): CanvasTexture {
  const [el, g] = canvas(64, 16);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 === 0 ? '#d23b2f' : '#f4f4f4';
    g.beginPath();
    g.moveTo(i * 8, 16);
    g.lineTo(i * 8 + 8, 0);
    g.lineTo(i * 8 + 16, 0);
    g.lineTo(i * 8 + 8, 16);
    g.fill();
  }
  return texture(el);
}

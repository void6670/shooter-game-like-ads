import * as THREE from 'three';

export const FONT = '"Lilita One", "Arial Black", Impact, sans-serif';

function drawCoin(ctx, cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#fff0a0');
  g.addColorStop(0.55, '#ffc61a');
  g.addColorStop(1, '#e09a00');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = r * 0.16; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
}

function drawText(ctx, cw, ch, text, o) {
  ctx.clearRect(0, 0, cw, ch);
  let size = ch * 0.8;
  const measure = () => {
    ctx.font = `${size}px ${FONT}`;
    return ctx.measureText(text).width + (o.icon ? size * 0.95 : 0);
  };
  let tw = measure();
  const maxW = cw * 0.9;
  if (tw > maxW) { size *= maxW / tw; tw = measure(); }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const x0 = (cw - tw) / 2;
  const y = ch * 0.54;
  if (o.stroke) {
    ctx.lineWidth = size * o.strokeRatio * 2;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(text, x0, y);
  }
  ctx.fillStyle = o.fill;
  ctx.fillText(text, x0, y);
  if (o.icon === 'coin') {
    const textW = ctx.measureText(text).width;
    drawCoin(ctx, x0 + textW + size * 0.5, ch * 0.5, size * 0.36);
  }
}

/** A text plane in the world whose text can change (barrel HP, gate values). */
export class Label {
  constructor(w, h, opts = {}) {
    this.opts = { fill: '#ffffff', stroke: '#d9411e', strokeRatio: 0.13, icon: null, ...opts };
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = Math.round(512 * h / w);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.renderOrder = 2;
    this.text = null;
  }

  set(text) {
    if (text === this.text) return;
    this.text = text;
    drawText(this.ctx, this.canvas.width, this.canvas.height, text, this.opts);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}

const spriteTex = new Map();

/** A camera-facing floating text (coin popups, gate results). Texture cached per string+style. */
export function textSprite(text, { fill = '#ffffff', stroke = '#1d2633', height = 0.8 } = {}) {
  const key = `${text}|${fill}|${stroke}`;
  let entry = spriteTex.get(key);
  if (!entry) {
    if (spriteTex.size > 300) {
      for (const e of spriteTex.values()) e.tex.dispose();
      spriteTex.clear();
    }
    const ch = 128;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = `${ch * 0.8}px ${FONT}`;
    c.width = Math.ceil(ctx.measureText(text).width + ch * 0.4);
    c.height = ch;
    drawText(ctx, c.width, ch, text, { fill, stroke, strokeRatio: 0.1 });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    entry = { tex, aspect: c.width / ch };
    spriteTex.set(key, entry);
  }
  const mat = new THREE.SpriteMaterial({ map: entry.tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(height * entry.aspect, height, 1);
  s.renderOrder = 20;
  return s;
}

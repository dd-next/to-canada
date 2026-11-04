/**
 * Screen-space layout for markers and labels (constant size under zoom):
 *  - dodge(): pushes overlapping markers apart (bigger markers move less) so
 *    Ottawa/Gatineau or the Golden Horseshoe stay clickable at country scale;
 *    displaced markers get a leader line back to their true position.
 *  - placeLabels(): greedy label placement by priority with collision avoidance.
 */

export interface LayoutNode {
  id: string;
  /** true (projected + zoomed) screen position */
  x0: number;
  y0: number;
  r: number;
  /** dodged position */
  x: number;
  y: number;
}

export function dodge(nodes: LayoutNode[], gap = 1.5, iterations = 28): void {
  const n = nodes.length;
  for (const nd of nodes) {
    nd.x = nd.x0;
    nd.y = nd.y0;
  }
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const min = a.r + b.r + gap;
        if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1e-3) {
          // Coincident points: split deterministically (golden angle by index).
          const ang = (i * 2.39996 + j * 0.7) % (Math.PI * 2);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        const aa = a.r * a.r;
        const bb = b.r * b.r;
        const wa = (2 * bb) / (aa + bb);
        const wb = (2 * aa) / (aa + bb);
        a.x -= ux * push * wa;
        a.y -= uy * push * wa;
        b.x += ux * push * wb;
        b.y += uy * push * wb;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

export interface LabelInput {
  id: string;
  text: string;
  x: number;
  y: number;
  r: number;
  /** higher = placed first */
  priority: number;
  /** always shown (selected / hovered), even if it collides */
  force?: boolean;
  /** font size in px */
  size: number;
  weight: number;
}

export interface PlacedLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  size: number;
  weight: number;
  box: Rect;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

let ctx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
/** Measure label width with the real font (falls back to an estimate). */
export function measure(text: string, size: number, weight: number): number {
  const key = `${weight}:${size}:${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  let w = text.length * size * 0.56;
  try {
    if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `${weight} ${size}px "Archivo Variable", Archivo, Arial, sans-serif`;
      w = ctx.measureText(text).width;
    }
  } catch {
    /* estimate */
  }
  widthCache.set(key, w);
  return w;
}
/** Clear measurements (call once web fonts have loaded). */
export const resetMeasureCache = () => widthCache.clear();

export function placeLabels(labels: LabelInput[], markers: { x: number; y: number; r: number; id: string }[], bounds: Rect, avoid: Rect[] = []): PlacedLabel[] {
  const taken: Rect[] = [...avoid];
  const markerBoxes = markers.map((m) => ({ id: m.id, box: { x: m.x - m.r, y: m.y - m.r, w: m.r * 2, h: m.r * 2 } }));
  const order = [...labels].sort((a, b) => Number(!!b.force) - Number(!!a.force) || b.priority - a.priority);
  const out: PlacedLabel[] = [];
  for (const l of order) {
    const w = measure(l.text, l.size, l.weight) + 2;
    const h = l.size + 2;
    const gap = 4;
    const candidates: { x: number; y: number; anchor: PlacedLabel['anchor']; box: Rect }[] = [
      { x: l.x + l.r + gap, y: l.y + l.size * 0.36, anchor: 'start', box: { x: l.x + l.r + gap - 1, y: l.y - h / 2, w, h } },
      { x: l.x - l.r - gap, y: l.y + l.size * 0.36, anchor: 'end', box: { x: l.x - l.r - gap - w + 1, y: l.y - h / 2, w, h } },
      { x: l.x, y: l.y - l.r - gap - 1, anchor: 'middle', box: { x: l.x - w / 2, y: l.y - l.r - gap - h + 1, w, h } },
      { x: l.x, y: l.y + l.r + gap + l.size * 0.8, anchor: 'middle', box: { x: l.x - w / 2, y: l.y + l.r + gap - 1, w, h } },
      { x: l.x + l.r * 0.7 + gap, y: l.y - l.r * 0.7 - 2, anchor: 'start', box: { x: l.x + l.r * 0.7 + gap - 1, y: l.y - l.r * 0.7 - 2 - h * 0.8, w, h } },
      { x: l.x + l.r * 0.7 + gap, y: l.y + l.r * 0.7 + l.size * 0.9, anchor: 'start', box: { x: l.x + l.r * 0.7 + gap - 1, y: l.y + l.r * 0.7 + 1, w, h } },
    ];
    const inside = (b: Rect) => b.x >= bounds.x && b.y >= bounds.y && b.x + b.w <= bounds.x + bounds.w && b.y + b.h <= bounds.y + bounds.h;
    const free = (b: Rect) => !taken.some((t) => overlaps(t, b)) && !markerBoxes.some((m) => m.id !== l.id && overlaps(m.box, b));
    let chosen = candidates.find((c) => inside(c.box) && free(c.box));
    if (!chosen && l.force) chosen = candidates.find((c) => inside(c.box)) ?? candidates[0];
    if (!chosen) continue;
    taken.push(chosen.box);
    out.push({ id: l.id, text: l.text, x: chosen.x, y: chosen.y, anchor: chosen.anchor, size: l.size, weight: l.weight, box: chosen.box });
  }
  return out;
}

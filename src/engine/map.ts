import type { Team, Vec2 } from './types';

export const MAP_W = 1680;
export const MAP_H = 1040;

export interface Rect { x: number; y: number; w: number; h: number }

export const BLUE_BASE: Vec2 = { x: 130, y: 520 };
export const RED_BASE: Vec2 = { x: 1550, y: 520 };

export const LANE_POINTS: Vec2[] = [
  { x: 130, y: 520 },
  { x: 330, y: 520 },
  { x: 520, y: 500 },
  { x: 700, y: 520 },
  { x: 840, y: 520 },
  { x: 1000, y: 540 },
  { x: 1180, y: 520 },
  { x: 1360, y: 520 },
  { x: 1550, y: 520 }
];

export const TOWER_POS: Record<Team, Vec2[]> = {
  0: [{ x: 380, y: 520 }, { x: 680, y: 515 }],
  1: [{ x: 1300, y: 520 }, { x: 1000, y: 535 }]
};
export const CORE_POS: Record<Team, Vec2> = { 0: BLUE_BASE, 1: RED_BASE };

export interface Bush extends Rect {}

export const BUSHES: Bush[] = [
  { x: 470, y: 350, w: 190, h: 90 },
  { x: 470, y: 600, w: 190, h: 90 },
  { x: 1020, y: 350, w: 190, h: 90 },
  { x: 1020, y: 600, w: 190, h: 90 },
  { x: 760, y: 380, w: 150, h: 70 }
];

export const FLANK_ZONES: Rect[] = [
  { x: 560, y: 170, w: 220, h: 120 },
  { x: 900, y: 750, w: 220, h: 120 }
];

export const NEUTRAL_AREA: Rect = { x: 740, y: 440, w: 200, h: 160 };

export const WALLS: Rect[] = [
  { x: 300, y: 180, w: 260, h: 55 },
  { x: 300, y: 805, w: 260, h: 55 },
  { x: 1120, y: 180, w: 260, h: 55 },
  { x: 1120, y: 805, w: 260, h: 55 },
  { x: 720, y: 120, w: 60, h: 180 },
  { x: 900, y: 740, w: 60, h: 180 },
  { x: 760, y: 250, w: 160, h: 45 },
  { x: 760, y: 745, w: 160, h: 45 }
];

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function inRect(p: Vec2, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

export function pointInBush(p: Vec2): boolean {
  return BUSHES.some((b) => inRect(p, b));
}

function segIntersectsRect(a: Vec2, b: Vec2, r: Rect): boolean {
  const steps = Math.max(2, Math.ceil(dist(a, b) / 18));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (inRect(p, r)) return true;
  }
  return false;
}

export function lineBlocked(a: Vec2, b: Vec2, blockers: Rect[] = WALLS): boolean {
  return blockers.some((r) => segIntersectsRect(a, b, r));
}

export function collideWalls(p: Vec2, radius: number): Vec2 {
  let q = { x: clamp(p.x, radius + 8, MAP_W - radius - 8), y: clamp(p.y, radius + 8, MAP_H - radius - 8) };
  for (let iter = 0; iter < 2; iter++) {
    for (const w of WALLS) {
      const cx = clamp(q.x, w.x, w.x + w.w);
      const cy = clamp(q.y, w.y, w.y + w.h);
      const dx = q.x - cx;
      const dy = q.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.01;
        if (d2 === 0) {
          q.y = w.y - radius;
        } else {
          const push = radius - d;
          q = { x: q.x + (dx / d) * push, y: q.y + (dy / d) * push };
        }
      }
    }
  }
  return q;
}

export function nearestLanePoint(p: Vec2): { point: Vec2; index: number } {
  let best = LANE_POINTS[0];
  let bi = 0;
  let bd = Infinity;
  LANE_POINTS.forEach((lp, i) => {
    const d = dist2(p, lp);
    if (d < bd) { bd = d; best = lp; bi = i; }
  });
  return { point: best, index: bi };
}

export function moveAlongLane(pos: Vec2, team: Team, distance: number): Vec2 {
  const forward = team === 0 ? 1 : -1;
  let remaining = distance;
  let current = { ...pos };
  let idx = nearestLanePoint(current).index;
  while (remaining > 0) {
    const nextIdx = idx + forward;
    if (nextIdx < 0 || nextIdx >= LANE_POINTS.length) return current;
    const target = LANE_POINTS[nextIdx];
    const d = dist(current, target);
    if (d <= remaining) {
      current = { ...target };
      idx = nextIdx;
      remaining -= d;
    } else {
      current = {
        x: current.x + ((target.x - current.x) / d) * remaining,
        y: current.y + ((target.y - current.y) / d) * remaining
      };
      remaining = 0;
    }
  }
  return current;
}

import type { Vec } from './types';

// 《星环决斗场》地图常量：单条横向主战线，基地位于左右两端。
export const WORLD = {
  width: 3200,
  height: 1200,
  laneY: 600,
  laneHalfWidth: 130,
  baseRadius: 200
};

export const BASE_POS: Record<'blue' | 'red', Vec> = {
  blue: { x: 170, y: 600 },
  red: { x: 3030, y: 600 }
};

// 防御塔位置：每方两座（外塔、内塔）
export const TOWER_POS = {
  blue: [{ x: 820, y: 600 }, { x: 440, y: 600 }],
  red: [{ x: 2380, y: 600 }, { x: 2760, y: 600 }]
};

export const TOWER_STATS = {
  hp: 2200,
  atk: 130,
  range: 300,
  interval: 1.0,
  goldBounty: 280,
  xpBounty: 180
};

export const CORE_STATS = { hp: 3000, atk: 0, range: 0 };

export interface Rect { x: number; y: number; w: number; h: number }

// 草丛（矩形）：进入草丛的单位对草丛外敌人不可见
export const BUSHES: Rect[] = [
  { x: 700, y: 360, w: 300, h: 120 },
  { x: 700, y: 720, w: 300, h: 120 },
  { x: 1450, y: 340, w: 320, h: 130 },
  { x: 1450, y: 730, w: 320, h: 130 },
  { x: 2200, y: 360, w: 300, h: 120 },
  { x: 2200, y: 720, w: 300, h: 120 }
];

// 不可通行墙体 / 障碍（线段 + 厚度），技能与移动均会被阻挡
export interface Wall { a: Vec; b: Vec; thickness: number }
export const WALLS: Wall[] = [
  { a: { x: 1150, y: 300 }, b: { x: 1330, y: 420 }, thickness: 46 },
  { a: { x: 1150, y: 900 }, b: { x: 1330, y: 780 }, thickness: 46 },
  { a: { x: 1870, y: 420 }, b: { x: 2050, y: 300 }, thickness: 46 },
  { a: { x: 1870, y: 780 }, b: { x: 2050, y: 900 }, thickness: 46 },
  // 中央中立遗迹的环形残垣（留出上下两个绕后缺口）
  { a: { x: 1560, y: 520 }, b: { x: 1640, y: 520 }, thickness: 40 },
  { a: { x: 1560, y: 680 }, b: { x: 1640, y: 680 }, thickness: 40 }
];

// 两处绕后区域（草丛 + 通道提示，无碰撞）
export const FLANK_ZONES: Rect[] = [
  { x: 1080, y: 220, w: 420, h: 160 },
  { x: 1700, y: 820, w: 420, h: 160 }
];

// 中央中立区域（能量点刷新点）
export const NEUTRAL_AREA: Rect = { x: 1360, y: 420, w: 480, h: 360 };
export const ENERGY_NODE_POS: Vec = { x: 1600, y: 600 };

// 路线封锁事件使用的临时路障位置
export const BLOCK_POINTS: Vec[] = [
  { x: 1250, y: 600 },
  { x: 1950, y: 600 }
];

export function pointInRect(p: Vec, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function pointInBush(p: Vec): boolean {
  return BUSHES.some((b) => pointInRect(p, b));
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 点到线段距离
function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// 线段是否被墙体阻挡（用于技能穿墙判定）
export function segmentBlocked(a: Vec, b: Vec, extraWalls: Wall[] = []): boolean {
  for (const w of [...WALLS, ...extraWalls]) {
    const clearance = w.thickness / 2 + 18;
    if (segmentsIntersect(a, b, w.a, w.b)) return true;
    if (distToSegment(a, w.a, w.b) < clearance && distToSegment(b, w.a, w.b) < clearance) {
      // 两端都贴近同一墙时也视作被挡
    }
    // 若端点穿过墙体厚度区域
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
      if (distToSegment(p, w.a, w.b) < w.thickness / 2) return true;
    }
  }
  return false;
}

function ccw(a: Vec, b: Vec, c: Vec): boolean {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  // 仅按墙体厚度扩张后的中线近似检测
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

// 尝试将位置从墙体中推出（移动碰撞）
export function resolveWalls(p: Vec, radius: number, extraWalls: Wall[] = []): Vec {
  let out = { ...p };
  for (const w of [...WALLS, ...extraWalls]) {
    const d = distToSegment(out, w.a, w.b);
    const minD = w.thickness / 2 + radius;
    if (d < minD) {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      const side = (out.x - mid.x) * nx + (out.y - mid.y) * ny >= 0 ? 1 : -1;
      out = {
        x: out.x + nx * side * (minD - d),
        y: out.y + ny * side * (minD - d)
      };
    }
  }
  out.x = Math.max(30, Math.min(WORLD.width - 30, out.x));
  out.y = Math.max(30, Math.min(WORLD.height - 30, out.y));
  return out;
}

export const MAX_LEVEL = 8;

export const XP_CURVE = [0, 120, 300, 560, 900, 1340, 1900, 2600];

export function xpForLevel(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return XP_CURVE[level - 1] ?? Infinity;
}

export const MATCH_DURATION = 15 * 60;
export const WAVE_INTERVAL = 22;
export const FIRST_WAVE = 3;
export const SIEGE_EVERY = 3;

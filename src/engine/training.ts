import { BLUE_BASE, RED_BASE } from './map';
import { makeStats } from './factory';
import type { Hero } from './types';

export interface TrainingConfig {
  startLevel: number;
  startGold: number;
  fullMana: boolean;
  enableAI: boolean;
  autoWaves: boolean;
}

export const TRAINING_LIMITS = {
  minLevel: 1,
  maxLevel: 8,
  minGold: 0,
  maxGold: 6000,
  maxTargets: 3
} as const;

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  startLevel: 1,
  startGold: 500,
  fullMana: true,
  enableAI: true,
  autoWaves: true
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeTrainingConfig(input?: Partial<TrainingConfig> | null): TrainingConfig {
  const source = input ?? {};
  return {
    startLevel: clampInt(source.startLevel, TRAINING_LIMITS.minLevel, TRAINING_LIMITS.maxLevel, DEFAULT_TRAINING_CONFIG.startLevel),
    startGold: clampInt(source.startGold, TRAINING_LIMITS.minGold, TRAINING_LIMITS.maxGold, DEFAULT_TRAINING_CONFIG.startGold),
    fullMana: boolOr(source.fullMana, DEFAULT_TRAINING_CONFIG.fullMana),
    enableAI: boolOr(source.enableAI, DEFAULT_TRAINING_CONFIG.enableAI),
    autoWaves: boolOr(source.autoWaves, DEFAULT_TRAINING_CONFIG.autoWaves)
  };
}

export function restoreHeroVitals(hero: Hero): void {
  hero.alive = true;
  hero.deadTimer = 0;
  hero.hp = hero.maxHp;
  hero.mana = hero.maxMana;
  hero.statuses = [];
  hero.recall = 0;
  hero.attackCd = 0;
  for (const key of Object.keys(hero.cooldowns)) hero.cooldowns[key] = 0;
  hero.moveTarget = undefined;
  hero.attackTargetId = undefined;
  hero.forcedTarget = undefined;
}

export function applyTrainingHeroState(hero: Hero, config: TrainingConfig): void {
  hero.level = config.startLevel;
  hero.xp = 0;
  hero.gold = config.startGold;
  hero.items = [];
  hero.skillLevels = [0, 0, 0, 0];
  hero.stats = makeStats(hero.heroId, config.startLevel, []);
  hero.maxHp = hero.stats.maxHp;
  hero.maxMana = hero.stats.maxMana;
  restoreHeroVitals(hero);
  hero.mana = config.fullMana ? hero.maxMana : 0;
  hero.pos = hero.team === 0 ? { ...BLUE_BASE } : { ...RED_BASE };
  hero.kills = 0;
  hero.deaths = 0;
  hero.lastHits = 0;
  hero.damageDealt = 0;
  hero.damageToHeroes = 0;
  hero.damageTaken = 0;
}

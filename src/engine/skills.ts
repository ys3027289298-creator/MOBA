import { TACTICAL_SKILLS, getHeroDef } from '../data/heroes';
import type { SkillDef } from './types';
import type { Game } from './game';
import { dist, lineBlocked } from './map';

export function skillDefAt(heroId: string, slot: number): SkillDef | undefined {
  if (slot >= 4) return TACTICAL_SKILLS.find((s) => s.slot === slot);
  return getHeroDef(heroId).skills[slot];
}

export function canCast(game: Game, hero: { heroId: string; mana: number; cooldowns: Record<string, number>; alive: boolean; statuses: { type: string; duration: number }[] }, slot: number): { ok: boolean; reason?: string } {
  if (!hero.alive) return { ok: false, reason: '已死亡' };
  const def = skillDefAt(hero.heroId, slot);
  if (!def) return { ok: false, reason: '无技能' };
  const level = slot < 4 ? (game as unknown as { heroLevelOf: (h: typeof hero) => number }).heroLevelOf(hero as never) : 1;
  if (slot < 4 && level <= 0) return { ok: false, reason: '技能未学习' };
  if ((hero.cooldowns[def.key] ?? 0) > 0) return { ok: false, reason: '冷却中' };
  if (hero.mana < def.cost(level)) return { ok: false, reason: '法力不足' };
  if (hero.statuses.some((s) => s.type === 'stun' && s.duration > 0)) return { ok: false, reason: '眩晕中' };
  if (hero.statuses.some((s) => s.type === 'silence' && s.duration > 0)) return { ok: false, reason: '沉默中' };
  return { ok: true };
}

export function executeSkill(game: Game, heroId2: string, slot: number, input: { point?: { x: number; y: number }; entityId?: number }): boolean {
  const hero = game.heroes.find((h) => h.heroId === heroId2);
  if (!hero) return false;
  return game.castSkill(hero, slot, input);
}

export function blockedTo(game: Game, from: { x: number; y: number }, target: { x: number; y: number }): boolean {
  return lineBlocked(from, target, game.activeBlockers());
}

export function inRange(hero: { pos: { x: number; y: number } }, point: { x: number; y: number }, range: number): boolean {
  return dist(hero.pos, point) <= range;
}

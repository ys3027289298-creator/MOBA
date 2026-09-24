import { dist, lineBlocked } from './map';
import { skillDefAt } from './skills';
import type { Game } from './game';
import type { CastInput, GameEntity, Hero, SkillDef, Vec2 } from './types';

export type EntityContract = 'enemy' | 'allyHero';

export function entityContract(heroId: string, slot: number): EntityContract {
  if (heroId === 'lumi' && slot === 1) return 'allyHero';
  return 'enemy';
}

export interface CastPlan {
  def: SkillDef;
  level: number;
  point?: Vec2;
  target?: GameEntity;
}

export type PrecheckResult = { ok: true; plan: CastPlan } | { ok: false; reason: string };

function finitePoint(point: Vec2 | undefined): point is Vec2 {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function precheckCast(game: Game, hero: Hero, slot: number, input: CastInput): PrecheckResult {
  const base = game.canCast(hero, slot);
  if (!base.ok) return { ok: false, reason: base.reason ?? '无法释放' };
  const def = skillDefAt(hero.heroId, slot);
  if (!def) return { ok: false, reason: '无技能' };
  const level = slot < 4 ? hero.skillLevels[slot] : 1;
  if (def.targetMode === 'none') return { ok: true, plan: { def, level } };

  if (def.targetMode === 'entity') {
    if (input.entityId === undefined || !Number.isFinite(input.entityId)) return { ok: false, reason: '需要选择目标' };
    const target = game.entityById(input.entityId);
    if (!target) return { ok: false, reason: '目标不存在' };
    if (!target.alive) return { ok: false, reason: '目标已死亡' };
    const contract = entityContract(hero.heroId, slot);
    if (contract === 'enemy' && target.team === hero.team) return { ok: false, reason: '不能以友军为目标' };
    if (contract === 'allyHero' && (target.team !== hero.team || target.kind !== 'hero')) {
      return { ok: false, reason: '只能以自身或友方英雄为目标' };
    }
    if (dist(hero.pos, target.pos) > def.range + 24) return { ok: false, reason: '距离过远' };
    if (slot !== 2 && lineBlocked(hero.pos, target.pos, game.activeBlockers())) return { ok: false, reason: '被墙体阻挡' };
    return { ok: true, plan: { def, level, point: { ...target.pos }, target } };
  }

  if (!finitePoint(input.point)) return { ok: false, reason: '目标点无效' };
  const point = { x: input.point.x, y: input.point.y };
  if (dist(hero.pos, point) > def.range + 24) return { ok: false, reason: '距离过远' };
  if (lineBlocked(hero.pos, point, game.activeBlockers()) && slot !== 2) return { ok: false, reason: '被墙体阻挡' };
  return { ok: true, plan: { def, level, point } };
}

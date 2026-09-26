import { skillDefAt } from './skills';
import { dist, lineBlocked } from './map';
import type { Game } from './game';
import type { CastInput, GameEntity, Hero, SkillDef, Vec2 } from './types';

export interface CastResolution {
  ok: boolean;
  reason?: string;
  def?: SkillDef;
  level?: number;
  point?: Vec2;
  target?: GameEntity;
}

function isFinitePoint(point: Vec2 | undefined): point is Vec2 {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isBlinkSkill(def: SkillDef): boolean {
  return def.description.includes('位移') || def.description.includes('瞬移');
}

export function liveEntity(game: Game, entity: GameEntity | undefined): entity is GameEntity {
  return !!entity && entity.alive && game.entityById(entity.id) === entity;
}

export function entityTargetOk(hero: Hero, def: SkillDef, target: GameEntity): boolean {
  const contract = def.entityTarget ?? 'enemy';
  if (contract === 'ally-hero') return target.team === hero.team && target.kind === 'hero';
  return target.team !== hero.team;
}

export function validateCast(game: Game, hero: Hero, slot: number, input: CastInput): CastResolution {
  const state = game.canCast(hero, slot);
  if (!state.ok) return { ok: false, reason: state.reason };
  const def = skillDefAt(hero.heroId, slot);
  if (!def) return { ok: false, reason: '无技能' };
  const level = slot < 4 ? hero.skillLevels[slot] : 1;
  if (def.targetMode === 'none') return { ok: true, def, level };

  let target: GameEntity | undefined;
  if (def.targetMode === 'entity') {
    if (input.entityId === undefined || !Number.isFinite(input.entityId)) return { ok: false, reason: '需要选择目标' };
    const entity = game.entityById(input.entityId);
    if (!entity) return { ok: false, reason: '目标不存在' };
    if (!entity.alive) return { ok: false, reason: '目标已死亡' };
    if (!entityTargetOk(hero, def, entity)) {
      return { ok: false, reason: (def.entityTarget ?? 'enemy') === 'ally-hero' ? '只能以友方英雄为目标' : '无法以友军为目标' };
    }
    target = entity;
  }

  const point = def.targetMode === 'entity' ? target!.pos : input.point;
  if (!isFinitePoint(point)) return { ok: false, reason: '目标点无效' };
  if (dist(hero.pos, point) > def.range + 24) return { ok: false, reason: '距离过远' };
  if (!isBlinkSkill(def) && lineBlocked(hero.pos, point, game.activeBlockers())) return { ok: false, reason: '被墙体阻挡' };
  return { ok: true, def, level, point, target };
}

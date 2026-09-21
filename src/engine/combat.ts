import type { DamageInfo, DamageType, GameEntity, Hero, Status, Team, Vec2 } from './types';
import type { Game } from './game';

export function hasStatus(entity: GameEntity, type: Status['type']): boolean {
  return entity.statuses.some((s) => s.type === type && s.duration > 0);
}

export function addStatus(target: GameEntity, status: Status) {
  if (status.type === 'shield') {
    const existing = target.statuses.find((s) => s.type === 'shield');
    if (existing) {
      existing.value = Math.max(existing.value, status.value);
      existing.duration = Math.max(existing.duration, status.duration);
      return;
    }
  }
  if (status.type === 'stun' || status.type === 'silence' || status.type === 'slow' || status.type === 'haste' || status.type === 'reveal') {
    const existing = target.statuses.find((s) => s.type === status.type);
    if (existing) {
      existing.duration = Math.max(existing.duration, status.duration);
      existing.value = Math.max(existing.value, status.value);
      return;
    }
  }
  target.statuses.push({ ...status });
}

export function shieldAmount(entity: GameEntity): number {
  return entity.statuses.filter((s) => s.type === 'shield' && s.duration > 0).reduce((sum, s) => sum + s.value, 0);
}

export function moveSpeedMultiplier(entity: GameEntity): number {
  let mult = 1;
  for (const s of entity.statuses) {
    if (s.duration <= 0) continue;
    if (s.type === 'slow') mult *= 1 - Math.min(0.75, s.value);
    if (s.type === 'haste') mult *= 1 + s.value;
  }
  return mult;
}

export function defenseReduction(defense: number): number {
  return Math.max(0.12, 1 - defense / (defense + 130));
}

export function applyDamage(game: Game, target: GameEntity, info: DamageInfo): number {
  if (!target.alive) return 0;
  if (hasStatus(target, 'invulnerable')) return 0;
  let amount = info.amount;
  if (info.type === 'physical') {
    const defense = 'stats' in target ? (target as Hero).stats.defense : target.kind === 'minion' ? 8 : 35;
    amount *= defenseReduction(defense);
  }
  if (game.baseAlarm[target.team] > 0 && (target.kind === 'turret' || target.kind === 'core')) amount *= 1.25;
  const hadShield = target.statuses.some((s) => s.type === 'shield' && s.duration > 0 && s.value > 0);
  for (const shield of target.statuses.filter((s) => s.type === 'shield' && s.duration > 0)) {
    const absorbed = Math.min(shield.value, amount);
    shield.value -= absorbed;
    amount -= absorbed;
    if (shield.value <= 0) shield.duration = 0;
  }
  amount = Math.round(amount);
  if (!hadShield && amount <= 0) amount = 1;
  target.hp -= amount;
  target.damageTaken += amount;
  if (info.source) {
    info.source.damageDealt = (info.source.damageDealt ?? 0) + amount;
    if (target.kind === 'hero' && info.source.kind === 'hero') {
      (info.source as Hero).damageToHeroes += amount;
    }
  }
  game.floatText(String(amount), target.pos, info.type === 'energy' ? '#7bdff2' : '#ffd166');
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    game.onDeath(target, info.source, info.sourceSkill);
  }
  return amount;
}

export function healEntity(game: Game, target: GameEntity, amount: number, source?: GameEntity) {
  if (!target.alive) return;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  const gained = target.hp - before;
  if (gained > 0) game.floatText(`+${Math.round(gained)}`, target.pos, '#80ed99');
  if (source && source.kind === 'hero') source.damageDealt = source.damageDealt ?? 0;
}

export function damageTypeColor(type: DamageType): number {
  return type === 'energy' ? 0x4cc9f0 : 0xffb703;
}

export function enemyTeam(team: Team): Team {
  return team === 0 ? 1 : 0;
}

export function nearestEnemy(game: Game, pos: Vec2, team: Team, range: number, requireVisible = false): GameEntity | undefined {
  let best: GameEntity | undefined;
  let bestD = range;
  for (const e of game.allEntities()) {
    if (!e.alive || e.team === team) continue;
    if (requireVisible && !game.canSee(team, e.pos)) continue;
    const d = Math.hypot(e.pos.x - pos.x, e.pos.y - pos.y);
    if (d <= bestD) { bestD = d; best = e; }
  }
  return best;
}

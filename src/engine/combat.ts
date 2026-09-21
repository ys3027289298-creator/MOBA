import type { DamageType, StatusEffect, Unit, ControlKind } from './types';

export interface DamageResult { dealt: number; killed: boolean; shieldAbsorbed: number }

export function isStunned(u: Unit): boolean {
  return u.alive && u.statuses.some((s) => s.kind === 'stun' && s.remaining > 0);
}

export function isSilenced(u: Unit): boolean {
  return u.alive && u.statuses.some((s) => s.kind === 'silence' && s.remaining > 0);
}

export function slowFactor(u: Unit): number {
  let factor = 1;
  for (const s of u.statuses) {
    if (s.kind === 'slow' && s.remaining > 0) factor -= s.amount;
  }
  return Math.max(0.3, factor);
}

export function addStatus(u: Unit, kind: ControlKind, duration: number, amount: number, sourceId: number): void {
  // 同类控制取更强效果，刷新时长
  const existing = u.statuses.find((s) => s.kind === kind);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, duration);
    existing.duration = Math.max(existing.duration, duration);
    existing.amount = Math.max(existing.amount, amount);
    existing.sourceId = sourceId;
  } else {
    const status: StatusEffect = { kind, remaining: duration, duration, amount, sourceId };
    u.statuses.push(status);
  }
}

export function addDot(u: Unit, duration: number, dps: number, type: DamageType, sourceId: number): void {
  u.dots.push({ remaining: duration, tickEvery: 0.5, tickTimer: 0, dps, type, sourceId });
}

export function addShield(u: Unit, amount: number, duration = 5): void {
  u.shields.push({ remaining: duration, amount });
}

function defenseOf(u: Unit, type: DamageType): number {
  let def = type === 'physical' ? u.stats.physDef : u.stats.energyDef;
  // 古尔被动：磐岩体
  if (u.heroId === 'gurr') {
    def += 0.1;
    if (u.stats.hp / u.stats.hpMax < 0.35) def += 0.15;
  }
  return Math.min(0.85, def);
}

// 造成伤害；返回实际扣除生命的伤害
export function dealDamage(
  target: Unit,
  rawAmount: number,
  type: DamageType,
  source: Unit | null,
  allUnits: Unit[]
): DamageResult {
  if (!target.alive) return { dealt: 0, killed: false, shieldAbsorbed: 0 };
  let amount = rawAmount * (1 - defenseOf(target, type));
  if (source && source.heroId === 'gurr') {
    // 防御定位整体减伤已在 defenseOf 处理
  }
  let shieldAbsorbed = 0;
  for (const shield of target.shields) {
    if (shield.amount <= 0 || amount <= 0) continue;
    const absorbed = Math.min(shield.amount, amount);
    shield.amount -= absorbed;
    amount -= absorbed;
    shieldAbsorbed += absorbed;
  }
  target.shields = target.shields.filter((s) => s.amount > 0 && s.remaining > 0);
  target.stats.hp = Math.max(0, target.stats.hp - amount);
  if (source) {
    target.lastDamagerId = source.id;
    source.damageDealt = (source.damageDealt ?? 0) + amount;
    // 物理吸血
    if (amount > 0 && source.stats.lifesteal > 0) {
      source.stats.hp = Math.min(source.stats.hpMax, source.stats.hp + amount * source.stats.lifesteal);
    }
    // 防御塔仇恨转移：英雄在塔范围内攻击敌方英雄
    maybeTowerAggro(source, target, allUnits);
  }
  let killed = false;
  if (target.stats.hp <= 0) {
    killed = true;
  }
  return { dealt: amount, killed, shieldAbsorbed };
}

function maybeTowerAggro(attacker: Unit, victim: Unit, allUnits: Unit[]): void {
  if (attacker.kind !== 'hero' || victim.kind !== 'hero') return;
  for (const tower of allUnits) {
    if (tower.kind !== 'tower' || !tower.alive || tower.team !== victim.team) continue;
    const d = Math.hypot(attacker.pos.x - tower.pos.x, attacker.pos.y - tower.pos.y);
    if (d <= tower.atkRange) {
      tower.aggroTargetId = attacker.id;
    }
  }
}

export function heal(u: Unit, amount: number): number {
  if (!u.alive) return 0;
  const before = u.stats.hp;
  u.stats.hp = Math.min(u.stats.hpMax, u.stats.hp + amount);
  return u.stats.hp - before;
}

// 推进持续伤害与状态计时
export function tickTimers(u: Unit, dt: number, allUnits: Unit[], onTickDamage: (target: Unit, dps: number, type: DamageType, source: Unit | null) => void): void {
  for (const s of u.statuses) s.remaining -= dt;
  u.statuses = u.statuses.filter((s) => s.remaining > 0);
  for (const shield of u.shields) shield.remaining -= dt;
  u.shields = u.shields.filter((s) => s.remaining > 0 && s.amount > 0);
  for (const dot of u.dots) {
    dot.remaining -= dt;
    dot.tickTimer -= dt;
    if (dot.tickTimer <= 0) {
      dot.tickTimer += dot.tickEvery;
      const source = allUnits.find((x) => x.id === dot.sourceId) ?? null;
      onTickDamage(u, dot.dps * dot.tickEvery, dot.type, source);
    }
  }
  u.dots = u.dots.filter((d) => d.remaining > 0);
}

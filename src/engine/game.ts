import type {
  ActiveEvent, FloatingText, GameResult, KillEvent, MatchConfig,
  MinionType, ProjectileView, Team, Unit, Vec, DamageType
} from './types';
import { HEROES, getHero } from './heroes';
import { getItem, RECOMMENDED } from './items';
import {
  BASE_POS, CORE_STATS, dist, ENERGY_NODE_POS, pointInBush, WORLD,
  resolveWalls, segmentBlocked, TOWER_POS, TOWER_STATS, type Wall
} from './map';
import {
  addDot, addShield, addStatus, dealDamage, heal, isSilenced, isStunned,
  slowFactor, tickTimers
} from './combat';

export interface SpawnProjectileEvent {
  team: Team; from: Vec; target: Vec; color: number; speed: number;
  kind: 'attack' | 'skill'; radius: number;
  onHit: () => void; onArrive?: () => void;
}

export interface AreaEffectView {
  id: number; pos: Vec; radius: number; color: number; remaining: number; max: number;
}

export interface WardView { id: number; team: Team; pos: Vec; remaining: number }

interface EngineProjectile {
  pos: Vec; target: Vec; speed: number;
  onHit: () => void; done: boolean; color: number; kind: 'attack' | 'skill'; team: Team; radius: number;
}

const XP_CURVE = [0, 120, 280, 480, 740, 1080, 1500, 2000];

export class Match {
  units: Unit[] = [];
  time = 0;
  result: GameResult = 'running';
  config: MatchConfig;
  player!: Unit;
  ai!: Unit;
  towers: Record<Team, Unit[]> = { blue: [], red: [] };
  cores: Record<Team, Unit> = {} as Record<Team, Unit>;
  kills: Record<Team, number> = { blue: 0, red: 0 };
  killLog: KillEvent[] = [];
  floatingTexts: FloatingText[] = [];
  areaEffects: AreaEffectView[] = [];
  wards: WardView[] = [];
  projectiles: EngineProjectile[] = [];
  energyNode: { alive: boolean; pos: Vec; respawn: number; buffTeam: Team | null; buffTimer: number } = {
    alive: true, pos: ENERGY_NODE_POS, respawn: 0, buffTeam: null, buffTimer: 0
  };
  events: ActiveEvent[] = [];
  paused = false;
  speed = 1;

  private nextId = 1;
  private waveTimer = 2;
  private waveNumber = 0;
  private eventTimer = 45;
  private blockWalls: Wall[] = [];
  private itemCooldowns = new Map<string, number>();
  private comboHits = new Map<number, { target: number; count: number }>();
  private weatherMoveFactor = 1;
  private weatherVisionFactor = 1;

  onProjectile: ((e: SpawnProjectileEvent) => void) | null = null;

  spawnProjectile(team: Team, from: Vec, target: Vec, color: number, speed: number,
    kind: 'attack' | 'skill', radius: number, onHit: () => void): void {
    const p: EngineProjectile = { pos: { ...from }, target: { ...target }, speed, onHit, done: false, color, kind, team, radius };
    this.projectiles.push(p);
    this.onProjectile?.({ team, from, target, color, speed, kind, radius, onHit });
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.done) continue;
      const d = dist(p.pos, p.target);
      const stepLen = p.speed * dt;
      if (d <= stepLen + 4) {
        p.pos = { ...p.target };
        p.onHit();
        p.done = true;
      } else {
        const n = { x: (p.target.x - p.pos.x) / d, y: (p.target.y - p.pos.y) / d };
        p.pos.x += n.x * stepLen;
        p.pos.y += n.y * stepLen;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }
  onEvent: ((msg: string, kind: string) => void) | null = null;

  constructor(config: MatchConfig) {
    this.config = config;
  }

  setup(playerHeroId: string): void {
    this.spawnStructures();
    this.player = this.spawnHero('blue', playerHeroId, { ...BASE_POS.blue, x: BASE_POS.blue.x + 60 });
    const others = HEROES.filter((h) => h.id !== playerHeroId);
    const aiId = this.config.aiHeroId ?? others[Math.floor(Math.random() * others.length)].id;
    this.ai = this.spawnHero('red', aiId, { ...BASE_POS.red, x: BASE_POS.red.x - 60 });
    this.announce('战斗开始：摧毁敌方基地核心即可获胜！', 'info');
  }

  private spawnStructures(): void {
    for (const team of ['blue', 'red'] as Team[]) {
      TOWER_POS[team].forEach((pos, i) => {
        const tower: Unit = {
          id: this.nextId++, team, kind: 'tower',
          name: `${team === 'blue' ? '星蓝' : '赤星'}${i === 0 ? '外塔' : '内塔'}`,
          pos: { ...pos }, facing: { x: team === 'blue' ? 1 : -1, y: 0 }, radius: 34,
          stats: { hp: TOWER_STATS.hp, hpMax: TOWER_STATS.hp, mp: 0, mpMax: 0, atk: TOWER_STATS.atk, physDef: 0, energyDef: 0, moveSpeed: 0, power: 0, hpRegen: 0, mpRegen: 0, lifesteal: 0 },
          atkRange: TOWER_STATS.range, atkInterval: TOWER_STATS.interval, atkTimer: 0,
          damageType: 'physical', projectileSpeed: 900, alive: true,
          statuses: [], dots: [], shields: [], moveTarget: null, attackTargetId: null,
          structure: true, towerIndex: i, aggroTargetId: null
        };
        this.towers[team].push(tower);
        this.units.push(tower);
      });
      const core: Unit = {
        id: this.nextId++, team, kind: 'core',
        name: team === 'blue' ? '星蓝基地核心' : '赤星基地核心',
        pos: { ...BASE_POS[team] }, facing: { x: 0, y: 0 }, radius: 60,
        stats: { hp: CORE_STATS.hp, hpMax: CORE_STATS.hp, mp: 0, mpMax: 0, atk: 0, physDef: 0, energyDef: 0, moveSpeed: 0, power: 0, hpRegen: 0, mpRegen: 0, lifesteal: 0 },
        atkRange: 0, atkInterval: 0, atkTimer: 0, damageType: 'physical',
        projectileSpeed: 0, alive: true, statuses: [], dots: [], shields: [],
        moveTarget: null, attackTargetId: null, structure: true
      };
      this.cores[team] = core;
      this.units.push(core);
    }
  }

  spawnHero(team: Team, heroId: string, pos: Vec): Unit {
    const def = getHero(heroId);
    const hero: Unit = {
      id: this.nextId++, team, kind: 'hero', name: def.name,
      pos: { ...pos }, facing: { x: team === 'blue' ? 1 : -1, y: 0 }, radius: 22,
      stats: { ...def.base, hp: def.base.hpMax, mp: def.base.mpMax },
      atkRange: def.atkRange, atkInterval: def.atkInterval, atkTimer: 0,
      damageType: 'physical', projectileSpeed: def.projectileSpeed, alive: true,
      statuses: [], dots: [], shields: [], moveTarget: null, attackTargetId: null,
      heroId, level: 1, xp: 0, gold: 500, skillPoints: 1, skillLevels: [0, 0, 0, 0],
      cooldowns: [0, 0, 0, 0], kills: 0, deaths: 0, cs: 0, damageDealt: 0,
      recallTimer: 0, items: []
    };
    this.comboHits.set(hero.id, { target: -1, count: 0 });
    this.units.push(hero);
    this.recomputeStats(hero);
    return hero;
  }

  getHeroDef(u: Unit) { return getHero(u.heroId!); }

  // ---------- 属性 / 升级 ----------
  recomputeStats(u: Unit): void {
    const def = this.getHeroDef(u);
    const lvl = (u.level ?? 1) - 1;
    const base = def.base;
    const g = def.growth;
    const items = u.items ?? [];
    const stat = <K extends keyof Unit['stats']>(key: K): Unit['stats'][K] =>
      items.reduce<number>((n, id) => n + ((getItem(id).stats[key] as number) ?? 0), 0) as Unit['stats'][K];
    const s = u.stats;
    const hpRatio = u.alive && s.hpMax > 0 ? s.hp / s.hpMax : 1;
    s.hpMax = base.hpMax + (g.hpMax ?? 0) * lvl + (stat('hpMax') as number);
    s.mpMax = base.mpMax + (g.mpMax ?? 0) * lvl + (stat('mpMax') as number);
    s.atk = base.atk + (g.atk ?? 0) * lvl + (stat('atk') as number);
    s.power = (g.power ?? 0) * lvl + (stat('power') as number);
    s.physDef = Math.min(0.8, base.physDef + (stat('physDef') as number));
    s.energyDef = Math.min(0.8, base.energyDef + (stat('energyDef') as number));
    s.moveSpeed = base.moveSpeed + (stat('moveSpeed') as number);
    s.hpRegen = base.hpRegen + (stat('hpRegen') as number);
    s.mpRegen = base.mpRegen + (stat('mpRegen') as number);
    s.lifesteal = base.lifesteal + (stat('lifesteal') as number);
    if (u.alive) {
      s.hp = Math.min(s.hpMax, s.hpMax * hpRatio + (hpRatio > 0.985 ? s.hpMax - s.hpMax * hpRatio : 0));
    }
  }

  canUpgradeSkill(u: Unit, slot: number): boolean {
    const sk = this.getHeroDef(u).skills[slot];
    const lvl = u.skillLevels![slot];
    return (u.skillPoints ?? 0) > 0 && lvl < sk.maxLevel && (u.level ?? 1) >= sk.unlockLevel;
  }

  upgradeSkill(u: Unit, slot: number): boolean {
    if (!this.canUpgradeSkill(u, slot)) return false;
    u.skillLevels![slot]++;
    u.skillPoints!--;
    this.announce(`${u.name} 强化了 ${this.getHeroDef(u).skills[slot].name}`, u.team === 'blue' ? 'upgrade' : 'info');
    return true;
  }

  grantXp(u: Unit, amount: number): void {
    if (u.kind !== 'hero' || !u.alive) return;
    u.xp! += Math.round(amount * (this.energyNode.buffTeam === u.team ? 1.25 : 1));
    while ((u.level ?? 1) < 8) {
      const need = XP_CURVE[u.level!];
      if (u.xp! < need) break;
      u.xp! -= need;
      u.level!++;
      u.skillPoints!++;
      const oldMax = u.stats.hpMax;
      this.recomputeStats(u);
      u.stats.hp += u.stats.hpMax - oldMax;
      u.stats.mp = Math.min(u.stats.mpMax, u.stats.mp + 40);
      this.float(u.pos, `升级！Lv.${u.level}`, '#ffe066');
      this.announce(`${u.name} 升至 ${u.level} 级`, u.team === 'blue' ? 'upgrade' : 'info');
    }
  }

  grantGold(u: Unit, amount: number): void {
    if (u.kind !== 'hero') return;
    u.gold = (u.gold ?? 0) + amount;
  }

  // ---------- 装备 ----------
  canBuy(u: Unit, itemId: string): { ok: boolean; reason?: string } {
    if (u.kind !== 'hero') return { ok: false, reason: '非法购买' };
    const item = getItem(itemId);
    const nonConsumables = (u.items ?? []).filter((id) => getItem(id).category !== 'consumable').length;
    if (nonConsumables >= 6) return { ok: false, reason: '装备栏已满（6 件）' };
    if (item.category === 'consumable' && (u.items ?? []).filter((id) => id === itemId).length >= 3) {
      return { ok: false, reason: '消耗品最多携带 3 个' };
    }
    if ((u.gold ?? 0) < item.price) return { ok: false, reason: '金币不足' };
    if (dist(u.pos, BASE_POS[u.team]) > 260 && !this.config.practice) {
      return { ok: false, reason: '只能在己方基地购买' };
    }
    return { ok: true };
  }

  buy(u: Unit, itemId: string): boolean {
    const check = this.canBuy(u, itemId);
    if (!check.ok) {
      if (u === this.player) this.announce(check.reason ?? '无法购买', 'warn');
      return false;
    }
    const item = getItem(itemId);
    let cost = item.price;
    if (item.buildsFrom) {
      for (const from of item.buildsFrom) {
        const idx = u.items!.indexOf(from);
        if (idx >= 0) {
          u.items!.splice(idx, 1);
          cost -= getItem(from).price;
        }
      }
    }
    u.gold! -= cost;
    u.items!.push(itemId);
    this.recomputeStats(u);
    if (u === this.player) {
      this.announce(`购买了 ${item.name}`, 'buy');
      this.float(u.pos, `-${cost} 金币`, '#ffd166');
    }
    return true;
  }

  itemCooldownLeft(u: Unit, slotIndex: number): number {
    const id = u.items?.[slotIndex];
    if (!id) return 0;
    return this.itemCooldowns.get(`${u.id}:${id}`) ?? 0;
  }

  useItem(u: Unit, slotIndex: number, point?: Vec): boolean {
    const id = u.items?.[slotIndex];
    if (!id) return false;
    const item = getItem(id);
    if (!item.active) return false;
    const key = `${u.id}:${id}`;
    if ((this.itemCooldowns.get(key) ?? 0) > 0) return false;
    if (item.active.kind === 'heal') {
      heal(u, item.active.amount);
      this.float(u.pos, `+${item.active.amount}`, '#69db7c');
    } else if (item.active.kind === 'ward') {
      const pos = point ? this.clampToWalkable({ ...point }) : { ...u.pos };
      this.wards.push({ id: this.nextId++, team: u.team, pos, remaining: item.active.amount });
      this.announce('侦测萤灯已部署，可照出草丛敌人', u.team === 'blue' ? 'ward' : 'info');
    }
    this.itemCooldowns.set(key, item.active.cooldown);
    return true;
  }

  private clampToWalkable(p: Vec): Vec {
    return resolveWalls(p, 10, this.blockWalls);
  }

  tempBuffs = new Map<number, import('./types').TempBuff[]>();
  private damageZones: { team: Team; pos: Vec; radius: number; remaining: number; dps: number; type: DamageType; sourceId: number; slow: number }[] = [];

  // ---------- 技能 ----------
  getSkill(u: Unit, slot: number) {
    const level = u.skillLevels?.[slot] ?? 0;
    if (level <= 0) return null;
    return { def: this.getHeroDef(u).skills[slot], level };
  }

  canCast(u: Unit, slot: number): { ok: boolean; reason?: string } {
    if (!u.alive) return { ok: false, reason: '英雄已阵亡' };
    if (isStunned(u)) return { ok: false, reason: '眩晕中' };
    const sk = this.getSkill(u, slot);
    if (!sk) return { ok: false, reason: '技能尚未学习' };
    if (isSilenced(u) && sk.def.kind !== 'buff' && sk.def.kind !== 'heal') {
      return { ok: false, reason: '沉默中' };
    }
    if (u.cooldowns![slot] > 0) return { ok: false, reason: '技能冷却中' };
    if (u.stats.mp < sk.def.cost[sk.level - 1]) return { ok: false, reason: '法力不足' };
    return { ok: true };
  }

  private norm(v: Vec): Vec {
    const l = Math.hypot(v.x, v.y);
    return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
  }

  private pointInRange(origin: Vec, aim: Vec, range: number): Vec {
    const d = dist(origin, aim);
    if (d <= range) return { ...aim };
    const n = this.norm({ x: aim.x - origin.x, y: aim.y - origin.y });
    return { x: origin.x + n.x * range, y: origin.y + n.y * range };
  }

  private pointToSegment(p: Vec, a: Vec, b: Vec): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  private linecastMove(a: Vec, b: Vec, radius: number): Vec {
    const steps = 10;
    let last = a;
    for (let i = 1; i <= steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
      if (segmentBlocked(last, p, this.blockWalls)) break;
      last = p;
    }
    return resolveWalls(last, radius, this.blockWalls);
  }

  findNearestEnemy(u: Unit, near: Vec, tolerance = 40): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const v of this.units) {
      if (v.team === u.team || !v.alive) continue;
      const d = dist(v.pos, near);
      if (d < bestD) { best = v; bestD = d; }
    }
    void tolerance;
    return best;
  }

  private applyBuff(u: Unit, def: ReturnType<Match['getHeroDef']>['skills'][number], li: number): void {
    if (!def.buff) return;
    const buffs = this.tempBuffs.get(u.id) ?? [];
    buffs.push({
      remaining: def.buff.duration[li], duration: def.buff.duration[li],
      atkBonus: def.buff.atk?.[li] ?? 0,
      moveBonus: def.buff.moveSpeed?.[li] ?? 0
    });
    this.tempBuffs.set(u.id, buffs);
  }

  castSkill(caster: Unit, slot: number, aim: Vec, targetUnit?: Unit): boolean {
    const check = this.canCast(caster, slot);
    if (!check.ok) {
      if (caster === this.player) this.announce(check.reason ?? '无法释放', 'warn');
      return false;
    }
    const { def, level } = this.getSkill(caster, slot)!;
    const li = level - 1;
    const range = def.range[li];
    const radius = def.radius[li];
    const damage = def.baseDamage[li] + caster.stats.power * def.powerScale;
    const origin = { ...caster.pos };
    const dir = this.norm({ x: aim.x - origin.x, y: aim.y - origin.y });
    if (dir.x === 0 && dir.y === 0) dir.x = caster.facing.x >= 0 ? 1 : -1;
    caster.facing = { ...dir };
    caster.stats.mp -= def.cost[li];
    caster.cooldowns![slot] = def.cooldown[li] * (this.energyNode.buffTeam === caster.team ? 0.85 : 1);
    const enemyTeam: Team = caster.team === 'blue' ? 'red' : 'blue';

    const refund = () => { caster.stats.mp += def.cost[li]; caster.cooldowns![slot] = 0; };
    const hitEnemy = (v: Unit, dmg: number) => {
      const res = dealDamage(v, dmg, def.damageType, caster, this.units);
      if (res.dealt > 0) {
        this.float(v.pos, `${Math.round(res.dealt)}`, def.damageType === 'energy' ? '#9aa3ff' : '#ff8787');
      }
      if (def.control) {
        addStatus(v, def.control.kind, def.control.duration[li], def.control.amount[li], caster.id);
        if (def.control.kind === 'knockback') {
          const kd = this.norm({ x: v.pos.x - origin.x, y: v.pos.y - origin.y });
          v.pos = resolveWalls({
            x: v.pos.x + kd.x * def.control.amount[li],
            y: v.pos.y + kd.y * def.control.amount[li]
          }, v.radius, this.blockWalls);
        }
      }
      if (def.dot && def.kind !== 'line') {
        addDot(v, def.dot.duration[li], def.dot.dps[li] + caster.stats.power * 0.25, def.damageType, caster.id);
      }
      this.afterSpellHit(caster);
      if (res.killed) this.killUnit(v, caster);
    };

    switch (def.kind) {
      case 'bolt': case 'beam': case 'shock': {
        if (def.heal && targetUnit && targetUnit.team === caster.team && targetUnit.kind === 'hero') {
          heal(targetUnit, def.heal[li] + caster.stats.power * 0.6);
          this.float(targetUnit.pos, `+${Math.round(def.heal[li])}`, '#69db7c');
          break;
        }
        let target = targetUnit && targetUnit.team !== caster.team ? targetUnit : undefined;
        if (!target) {
          const near = { x: origin.x + dir.x * range, y: origin.y + dir.y * range };
          const candidate = this.findNearestEnemy(caster, near);
          if (candidate && dist(origin, candidate.pos) <= range + candidate.radius &&
              this.pointToSegment(candidate.pos, origin, near) <= radius + candidate.radius + 30) {
            target = candidate;
          }
        }
        if (!target || dist(origin, target.pos) > range + target.radius) { refund(); return false; }
        this.fireProjectile(caster, target, def, li, damage, def.kind === 'shock');
        break;
      }
      case 'heal': {
        if (def.mode === 'self') {
          for (const v of this.units) {
            if (v.team === caster.team && v.kind === 'hero' && v.alive && dist(v.pos, origin) <= radius) {
              heal(v, def.heal![li] + caster.stats.power * 0.6);
              this.float(v.pos, `+${Math.round(def.heal![li])}`, '#69db7c');
              if (def.shield) addShield(v, def.shield[li] + caster.stats.power * 0.5, 4);
              if (def.buff) this.applyBuff(v, def, li);
            }
          }
          this.areaEffects.push({ id: this.nextId++, pos: { ...origin }, radius, color: getHero(caster.heroId!).accent, remaining: 0.5, max: 0.5 });
        } else {
          const ally = targetUnit && targetUnit.team === caster.team && targetUnit.kind === 'hero'
            ? targetUnit
            : this.units.find((v) => v.team === caster.team && v.kind === 'hero' && v.alive && dist(v.pos, aim) <= 90);
          if (!ally || dist(origin, ally.pos) > range) { refund(); return false; }
          heal(ally, def.heal![li] + caster.stats.power * 0.6);
          this.float(ally.pos, `+${Math.round(def.heal![li])}`, '#69db7c');
          if (def.buff) this.applyBuff(ally, def, li);
        }
        break;
      }
      case 'buff': {
        this.applyBuff(caster, def, li);
        if (def.shield) addShield(caster, def.shield![li] + caster.stats.power * 0.5, 5);
        this.float(origin, def.name, '#ffd43b');
        this.areaEffects.push({ id: this.nextId++, pos: { ...origin }, radius: 60, color: getHero(caster.heroId!).accent, remaining: 0.4, max: 0.4 });
        break;
      }
      case 'nova': {
        const center = def.mode === 'self' ? origin : this.pointInRange(origin, aim, range);
        if (def.mode === 'point' && segmentBlocked(origin, center, this.blockWalls)) {
          refund();
          if (caster === this.player) this.announce('技能被墙体阻挡', 'warn');
          return false;
        }
        this.areaEffects.push({ id: this.nextId++, pos: { ...center }, radius, color: getHero(caster.heroId!).accent, remaining: 0.45, max: 0.45 });
        for (const v of this.units) {
          if (v.team === enemyTeam && v.alive && dist(v.pos, center) <= radius + v.radius) hitEnemy(v, damage);
        }
        if (def.mode === 'point') caster.pos = this.clampToWalkable({ ...center });
        break;
      }
      case 'line': {
        const endPoint = { x: origin.x + dir.x * range, y: origin.y + dir.y * range };
        if (segmentBlocked(origin, endPoint, this.blockWalls)) {
          refund();
          if (caster === this.player) this.announce('技能被墙体阻挡', 'warn');
          return false;
        }
        const center = def.mode === 'point' ? this.pointInRange(origin, aim, range)
          : { x: origin.x + dir.x * range * 0.5, y: origin.y + dir.y * range * 0.5 };
        this.areaEffects.push({
          id: this.nextId++, pos: { ...center },
          radius: def.mode === 'point' ? radius : radius * 0.7,
          color: getHero(caster.heroId!).accent, remaining: def.dot ? def.dot.duration[li] : 0.4,
          max: def.dot ? def.dot.duration[li] : 0.4
        });
        if (def.dot) {
          this.damageZones.push({
            team: caster.team, pos: { ...center }, radius,
            remaining: def.dot.duration[li], dps: def.dot.dps[li] + caster.stats.power * 0.25,
            type: def.damageType, sourceId: caster.id, slow: 0
          });
        }
        for (const v of this.units) {
          if (v.team !== enemyTeam || !v.alive) continue;
          const inArea = def.mode === 'point'
            ? dist(v.pos, center) <= radius + v.radius
            : this.pointToSegment(v.pos, origin, endPoint) <= radius + v.radius;
          if (inArea) hitEnemy(v, damage);
        }
        break;
      }
      case 'dash': {
        const d = def.dashDistance![li];
        const dest = this.linecastMove(origin, { x: origin.x + dir.x * d, y: origin.y + dir.y * d }, caster.radius);
        caster.pos = dest;
        this.areaEffects.push({ id: this.nextId++, pos: { ...dest }, radius, color: getHero(caster.heroId!).accent, remaining: 0.3, max: 0.3 });
        if (def.shield) addShield(caster, def.shield![li] + caster.stats.power * 0.5, 3);
        if (def.buff) this.applyBuff(caster, def, li);
        for (const v of this.units) {
          if (v.team === enemyTeam && v.alive && dist(v.pos, dest) <= radius + v.radius) hitEnemy(v, damage);
        }
        break;
      }
    }
    return true;
  }

  private afterSpellHit(caster: Unit): void {
    if (caster.heroId === 'vera') {
      const buffs = this.tempBuffs.get(caster.id) ?? [];
      buffs.push({ remaining: 1.5, duration: 1.5, atkBonus: 0, moveBonus: caster.stats.moveSpeed * 0.12 });
      this.tempBuffs.set(caster.id, buffs);
    }
  }

  private fireProjectile(caster: Unit, target: Unit, def: ReturnType<Match['getHeroDef']>['skills'][number], li: number, damage: number, instant: boolean): void {
    const onHit = () => {
      if (!target.alive || target.team === caster.team) return;
      const res = dealDamage(target, damage, def.damageType, caster, this.units);
      if (res.dealt > 0) this.float(target.pos, `${Math.round(res.dealt)}`, def.damageType === 'energy' ? '#9aa3ff' : '#ff8787');
      if (def.control) addStatus(target, def.control.kind, def.control.duration[li], def.control.amount[li], caster.id);
      this.afterSpellHit(caster);
      if (res.killed) this.killUnit(target, caster);
    };
    if (instant) {
      onHit();
      this.areaEffects.push({ id: this.nextId++, pos: { ...target.pos }, radius: def.radius[li] + 10, color: 0xffffff, remaining: 0.25, max: 0.25 });
      return;
    }
    this.spawnProjectile(caster.team, { ...caster.pos }, { ...target.pos },
      getHero(caster.heroId!).accent, 750, 'skill', 9, onHit);
  }

  // ---------- 指令：移动 / 普攻 ----------
  commandMove(u: Unit, point: Vec): void {
    if (!u.alive || isStunned(u)) return;
    u.moveTarget = this.clampToWalkable({ ...point });
    u.attackTargetId = null;
    u.recallTimer = 0;
  }

  commandAttack(u: Unit, target: Unit): void {
    if (!u.alive || isStunned(u)) return;
    if (target.team === u.team || !target.alive) return;
    u.attackTargetId = target.id;
    u.moveTarget = null;
    u.recallTimer = 0;
  }

  recall(u: Unit): boolean {
    if (!u.alive) return false;
    u.recallTimer = 4;
    u.moveTarget = null;
    u.attackTargetId = null;
    this.announce(`${u.name} 开始回城`, u.team === 'blue' ? 'recall' : 'info');
    return true;
  }

  private effectiveStats(u: Unit): { atk: number; move: number } {
    let atkBonus = 0;
    let moveBonus = 0;
    for (const b of this.tempBuffs.get(u.id) ?? []) {
      atkBonus += b.atkBonus;
      moveBonus += b.moveBonus;
    }
    return { atk: u.stats.atk + atkBonus, move: u.stats.moveSpeed + moveBonus };
  }

  private tryBasicAttack(u: Unit, target: Unit, dt: number): boolean {
    u.atkTimer -= dt;
    const range = u.atkRange + u.radius + target.radius;
    if (dist(u.pos, target.pos) > range) return false;
    if (u.atkTimer > 0) return true;
    u.atkTimer = u.atkInterval;
    u.facing = this.norm({ x: target.pos.x - u.pos.x, y: target.pos.y - u.pos.y });
    const eff = this.effectiveStats(u);
    const execute = () => {
      const res = dealDamage(target, eff.atk, u.damageType, u, this.units);
      if (res.dealt > 0) this.float(target.pos, `${Math.round(res.dealt)}`, u.kind === 'tower' ? '#ffa94d' : '#ffffff');
      this.onPassiveHit(u, target, res.dealt);
      if (res.killed) this.killUnit(target, u);
    };
    if (u.projectileSpeed > 0) {
      this.spawnProjectile(u.team, { ...u.pos }, { ...target.pos },
        u.heroId ? getHero(u.heroId).color : 0xd0d0d0, u.projectileSpeed, 'attack', 7, execute);
    } else {
      execute();
    }
    return true;
  }

  private oldProjectileShot(u: Unit, eff: { atk: number; move: number }, execute: () => void): void {
    void u; void eff; void execute;
  }

  private onPassiveHit(u: Unit, target: Unit, _dmg: number): void {
    // 岚：星裂印记，同一目标连续 3 次普攻触发额外能量伤害
    if (u.heroId === 'lan') {
      const combo = this.comboHits.get(u.id)!;
      if (combo.target === target.id) combo.count++;
      else { combo.target = target.id; combo.count = 1; }
      const cd = this.passiveCooldown.get(u.id) ?? 0;
      if (combo.count >= 3 && cd <= 0 && target.alive) {
        combo.count = 0;
        this.passiveCooldown.set(u.id, 6);
        const bonus = 40 + (u.level ?? 1) * 18 + u.stats.power * 0.6;
        const res = dealDamage(target, bonus, 'energy', u, this.units);
        this.float(target.pos, `裂印 ${Math.round(res.dealt)}`, '#ffd166');
        this.areaEffects.push({ id: this.nextId++, pos: { ...target.pos }, radius: 50, color: 0xffd166, remaining: 0.3, max: 0.3 });
        if (res.killed) this.killUnit(target, u);
      }
    }
  }

  private passiveCooldown = new Map<number, number>();

  private moveToward(u: Unit, target: Vec, dt: number, stopAt = 0): boolean {
    const d = dist(u.pos, target);
    if (d <= stopAt + 1) return true;
    const n = this.norm({ x: target.x - u.pos.x, y: target.y - u.pos.y });
    let speed = this.effectiveStats(u).move * slowFactor(u) * this.weatherMoveFactor;
    if (this.energyNode.buffTeam === u.team) speed *= 1.08;
    const step = Math.min(d - stopAt, speed * dt);
    const next = { x: u.pos.x + n.x * step, y: u.pos.y + n.y * step };
    u.pos = resolveWalls(next, u.radius, this.blockWalls);
    u.facing = n;
    return false;
  }

  // ---------- 兵线 ----------
  private spawnWave(): void {
    this.waveNumber++;
    const mega = this.events.some((e) => e.type === 'mega-wave');
    const siege = this.waveNumber % 3 === 0;
    for (const team of ['blue', 'red'] as Team[]) {
      const start = { ...BASE_POS[team] };
      const types: MinionType[] = ['melee', 'melee', 'melee', 'ranged', 'ranged'];
      if (siege) types.push('siege');
      types.forEach((type, i) => {
        this.spawnMinion(team, type, {
          x: start.x + (team === 'blue' ? 30 : -30),
          y: WORLD.laneY + (i - 2) * 26
        }, mega);
      });
    }
    this.announce(`第 ${this.waveNumber} 波小兵出发${siege ? '（含重型小兵）' : ''}`, 'wave');
  }

  private spawnMinion(team: Team, type: MinionType, pos: Vec, mega: boolean): Unit {
    const profile = {
      melee: { hp: 320, atk: 26, range: 90, interval: 1.1, speed: 130, proj: 0, gold: 22, xp: 60, radius: 16 },
      ranged: { hp: 220, atk: 34, range: 300, interval: 1.3, speed: 130, proj: 600, gold: 18, xp: 50, radius: 15 },
      siege: { hp: 600, atk: 60, range: 340, interval: 1.8, speed: 115, proj: 520, gold: 60, xp: 120, radius: 22 }
    }[type];
    const mult = mega ? 1.35 : 1;
    const minion: Unit = {
      id: this.nextId++, team, kind: 'minion',
      name: type === 'melee' ? '近战卫士' : type === 'ranged' ? '星能射手' : '重型破垒者',
      pos, facing: { x: team === 'blue' ? 1 : -1, y: 0 }, radius: profile.radius,
      stats: {
        hp: profile.hp * mult, hpMax: profile.hp * mult, mp: 0, mpMax: 0,
        atk: profile.atk * mult, physDef: 0.08, energyDef: 0.05,
        moveSpeed: profile.speed, power: 0, hpRegen: 0, mpRegen: 0, lifesteal: 0
      },
      atkRange: profile.range, atkInterval: profile.interval, atkTimer: 0,
      damageType: 'physical', projectileSpeed: profile.proj, alive: true,
      statuses: [], dots: [], shields: [], moveTarget: null, attackTargetId: null,
      minionType: type, goldBounty: Math.round(profile.gold * (mega ? 1.2 : 1)),
      xpBounty: profile.xp
    };
    this.units.push(minion);
    return minion;
  }

  // ---------- 死亡 / 复活 ----------
  killUnit(victim: Unit, killer: Unit | null): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.stats.hp = 0;
    victim.moveTarget = null;
    victim.attackTargetId = null;
    victim.statuses = [];
    victim.dots = [];

    if (victim.kind === 'minion') {
      // 补刀金币归最后一击者；经验给附近友方英雄
      if (killer && killer.kind === 'hero' && killer.team !== victim.team) {
        this.grantGold(killer, victim.goldBounty!);
        killer.cs = (killer.cs ?? 0) + 1;
        this.float(killer.pos, `+${victim.goldBounty} 金币`, '#ffd43b');
      } else {
        // 被小兵/塔击杀：附近英雄获得少量金币
        for (const hero of this.heroes()) {
          if (hero.team !== victim.team && dist(hero.pos, victim.pos) < 500) {
            this.grantGold(hero, Math.round(victim.goldBounty! * 0.4));
          }
        }
      }
      for (const hero of this.heroes()) {
        if (hero.team !== victim.team && hero.alive && dist(hero.pos, victim.pos) < 650) {
          this.grantXp(hero, victim.xpBounty!);
        }
      }
      this.units = this.units.filter((u) => u !== victim);
      return;
    }

    if (victim.kind === 'tower') {
      const team: Team = victim.team;
      if (killer && killer.kind === 'hero' && killer.team !== team) {
        this.grantGold(killer, TOWER_STATS.goldBounty);
        this.grantXp(killer, TOWER_STATS.xpBounty);
        this.float(killer.pos, `+${TOWER_STATS.goldBounty} 金币`, '#ffd43b');
      }
      this.announce(`${team === 'blue' ? '蓝方' : '红方'}${victim.towerIndex === 0 ? '外塔' : '内塔'}被摧毁！`, 'tower');
      this.units = this.units.filter((u) => u !== victim);
      this.towers[team] = this.towers[team].filter((t) => t !== victim);
      return;
    }

    if (victim.kind === 'core') {
      this.finish(victim.team === 'blue' ? 'defeat' : 'victory');
      return;
    }

    if (victim.kind === 'hero') {
      victim.deaths = (victim.deaths ?? 0) + 1;
      if (killer && killer.kind === 'hero') {
        killer.kills = (killer.kills ?? 0) + 1;
        this.grantGold(killer, 300);
        this.grantXp(killer, 150);
        this.kills[killer.team]++;
        this.killLog.push({ killer: killer.name, victim: victim.name, team: killer.team, time: this.time });
        this.announce(`${killer.name} 击杀了 ${victim.name}！`, killer.team === 'blue' ? 'kill-blue' : 'kill-red');
      } else {
        this.killLog.push({ killer: '小兵/防御塔', victim: victim.name, team: victim.team === 'blue' ? 'red' : 'blue', time: this.time });
        this.announce(`${victim.name} 被战场击杀`, 'info');
      }
      victim.respawnTimer = Math.min(12, 4 + (victim.level ?? 1) * 1.2);
      this.float(victim.pos, `${victim.name} 阵亡`, '#ff6b6b');
    }
  }

  heroes(): Unit[] {
    return this.units.filter((u) => u.kind === 'hero');
  }

  private respawnHero(u: Unit): void {
    u.alive = true;
    u.pos = { ...BASE_POS[u.team], x: BASE_POS[u.team].x + (u.team === 'blue' ? 60 : -60) };
    u.stats.hp = u.stats.hpMax;
    u.stats.mp = u.stats.mpMax;
    u.statuses = [];
    u.dots = [];
    u.shields = [];
    u.respawnTimer = 0;
    u.moveTarget = null;
    u.attackTargetId = null;
    this.recomputeStats(u);
    u.stats.hp = u.stats.hpMax;
    this.float(u.pos, '已复活', '#69db7c');
  }

  // ---------- 视野 ----------
  // 判断 toSee 是否被 observer 看见：草丛内外规则 + 萤灯 + 基础视野
  canSee(observer: Unit, toSee: Unit): boolean {
    if (!toSee.alive) return false;
    if (observer.team === toSee.team) return true;
    if (toSee.kind !== 'hero') return true; // 小兵与建筑不被草丛隐藏
    const observerInBush = pointInBush(observer.pos);
    const targetInBush = pointInBush(toSee.pos);
    if (targetInBush && !observerInBush) {
      // 只能通过萤灯或贴脸（120 距离）看见
      if (dist(observer.pos, toSee.pos) < 120) return true;
      if (this.scanActive(observer.team) && dist(observer.pos, toSee.pos) < 520) return true;
      return this.wards.some((w) => w.team === observer.team && w.remaining > 0 &&
        dist(w.pos, toSee.pos) < 220 && (!targetInBush || pointInBush(w.pos) || dist(w.pos, toSee.pos) < 160));
    }
    const sightRange = 620 * this.weatherVisionFactor;
    return dist(observer.pos, toSee.pos) <= sightRange;
  }

  // 玩家可见的敌方单位
  visibleEnemiesFor(team: Team): Unit[] {
    const observers = this.units.filter((u) => u.team === team && u.alive && u.kind !== 'core');
    return this.units.filter((u) => u.team !== team && u.alive && observers.some((o) => this.canSee(o, u)));
  }

  float(pos: Vec, text: string, color: string): void {
    this.floatingTexts.push({
      id: this.nextId++, pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y - 20 },
      text, color, remaining: 1, vy: 40
    });
  }

  announce(msg: string, kind: string): void {
    this.onEvent?.(msg, kind);
  }

  // ---------- 主循环 ----------
  update(rawDt: number): void {
    if (this.paused || this.result !== 'running') return;
    const dt = Math.min(0.05, rawDt) * this.speed;
    this.time += dt;

    // 兵线生成
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.spawnWave();
      this.waveTimer = 22;
    }

    // 动态事件
    this.updateEvents(dt);
    this.updateTimersTactical(dt);

    // 能量点
    this.updateEnergyNode(dt);

    // 单位更新
    for (const u of [...this.units]) this.updateUnit(u, dt);

    // 弹道（权威模拟）
    this.updateProjectiles(dt);

    // 持续伤害区域
    this.updateDamageZones(dt);

    // 临时增益 / 冷却
    for (const u of this.heroes()) {
      const buffs = this.tempBuffs.get(u.id);
      if (buffs) {
        for (const b of buffs) b.remaining -= dt;
        this.tempBuffs.set(u.id, buffs.filter((b) => b.remaining > 0));
      }
      for (let i = 0; i < 4; i++) u.cooldowns![i] = Math.max(0, u.cooldowns![i] - dt);
      const cd = (this.passiveCooldown.get(u.id) ?? 0) - dt;
      this.passiveCooldown.set(u.id, Math.max(0, cd));
    }
    for (const [key, val] of this.itemCooldowns) this.itemCooldowns.set(key, Math.max(0, val - dt));

    // 琪琪被动：萤光庇护
    this.qiqiPassive(dt);

    // 萤灯
    for (const w of this.wards) w.remaining -= dt;
    this.wards = this.wards.filter((w) => w.remaining > 0);

    // 视觉特效计时
    for (const fx of this.areaEffects) fx.remaining -= dt;
    this.areaEffects = this.areaEffects.filter((fx) => fx.remaining > 0);
    for (const t of this.floatingTexts) {
      t.remaining -= dt;
      t.pos.y -= t.vy * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((t) => t.remaining > 0);

    // 超时判定（15 分钟 = 900 秒；测试/演示可通过 config.duration 缩短）
    if (this.time >= this.config.duration) {
      const blueHp = this.cores.blue.stats.hp;
      const redHp = this.cores.red.stats.hp;
      this.finish(blueHp >= redHp ? 'timeout-victory' : 'timeout-defeat');
    }
  }

  private finish(result: GameResult): void {
    this.result = result;
    this.announce(
      result === 'victory' || result === 'timeout-victory' ? '胜利！敌方基地核心已摧毁' :
      result === 'defeat' ? '失败：基地核心被摧毁' : '超时：基地核心耐久劣势',
      'result'
    );
  }

  private qiqiPassive(dt: number): void {
    for (const qiqi of this.heroes().filter((h) => h.heroId === 'qiqi' && h.alive)) {
      const data = this.tempBuffs.get(qiqi.id) ?? [];
      const regen = (qiqi.passiveTimer ?? 0) + dt;
      qiqi.passiveTimer = regen;
      if (regen >= 4) {
        qiqi.passiveTimer = 0;
        for (const ally of this.heroes()) {
          if (ally.team === qiqi.team && ally.alive && dist(ally.pos, qiqi.pos) < 500) {
            heal(ally, 30 + (qiqi.level ?? 1) * 10 + qiqi.stats.power * 0.3);
          }
        }
      }
      void data;
    }
  }

  private updateDamageZones(dt: number): void {
    for (const zone of this.damageZones) {
      zone.remaining -= dt;
      for (const v of this.units) {
        if (v.team === zone.team || !v.alive) continue;
        if (dist(v.pos, zone.pos) <= zone.radius + v.radius) {
          const source = this.units.find((u) => u.id === zone.sourceId) ?? null;
          const res = dealDamage(v, zone.dps * dt, zone.type, source, this.units);
          if (res.killed) this.killUnit(v, source);
        }
      }
    }
    this.damageZones = this.damageZones.filter((z) => z.remaining > 0);
  }

  private updateEnergyNode(dt: number): void {
    if (this.energyNode.alive) {
      // 中立能量点：英雄触碰即占领
      for (const hero of this.heroes()) {
        if (hero.alive && dist(hero.pos, this.energyNode.pos) < 70) {
          this.energyNode.alive = false;
          this.energyNode.respawn = 60;
          this.energyNode.buffTeam = hero.team;
          this.energyNode.buffTimer = 40;
          this.announce(`${hero.team === 'blue' ? '蓝方' : '红方'}夺取了中央能量点：伤害/经验/移速提升！`, 'node');
          this.grantGold(hero, 120);
          this.grantXp(hero, 100);
          break;
        }
      }
    } else {
      this.energyNode.respawn -= dt;
      this.energyNode.buffTimer -= dt;
      if (this.energyNode.buffTimer <= 0) this.energyNode.buffTeam = null;
      if (this.energyNode.respawn <= 0) {
        this.energyNode.alive = true;
        this.announce('中央能量点再次刷新', 'node');
      }
    }
  }

  private updateUnit(u: Unit, dt: number): void {
    if (!u.alive) {
      if (u.kind === 'hero') {
        u.respawnTimer! -= dt;
        if (u.respawnTimer! <= 0) this.respawnHero(u);
      }
      return;
    }

    // 状态计时与 DoT
    tickTimers(u, dt, this.units, (target, amount, type, source) => {
      const res = dealDamage(target, amount, type, source, this.units);
      if (res.dealt > 0) this.float(target.pos, `${Math.round(res.dealt)}`, '#b197fc');
      if (res.killed) this.killUnit(target, source);
    });

    if (u.kind === 'hero') {
      // 回复
      const nearBase = dist(u.pos, BASE_POS[u.team]) < 240;
      const regenMult = nearBase ? 4 : 1;
      u.stats.hp = Math.min(u.stats.hpMax, u.stats.hp + u.stats.hpRegen * regenMult * dt);
      u.stats.mp = Math.min(u.stats.mpMax, u.stats.mp + u.stats.mpRegen * regenMult * dt);

      // 回城
      if (u.recallTimer && u.recallTimer > 0) {
        u.recallTimer -= dt;
        if (u.recallTimer <= 0) {
          u.pos = { ...BASE_POS[u.team], x: BASE_POS[u.team].x + (u.team === 'blue' ? 60 : -60) };
          u.stats.hp = u.stats.hpMax;
          u.stats.mp = u.stats.mpMax;
          this.float(u.pos, '回到基地', '#69db7c');
        }
      }
    }

    if (u.kind === 'minion') this.updateMinion(u, dt);
    else if (u.kind === 'tower') this.updateTower(u, dt);
    else if (u.kind === 'hero') {
      if (u === this.ai) this.updateAI(dt);
      this.updateHeroCombat(u, dt);
    }
  }

  private updateHeroCombat(u: Unit, dt: number): void {
    if (isStunned(u)) return;
    const target = u.attackTargetId != null ? this.units.find((x) => x.id === u.attackTargetId && x.alive) : null;
    if (target) {
      const inRange = this.tryBasicAttack(u, target, dt);
      if (!inRange) {
        // 追击：靠近至攻击距离（避免无限深入，由 AI/玩家指令控制）
        this.moveToward(u, target.pos, dt, u.atkRange + target.radius - 6);
      }
    } else if (u.moveTarget) {
      const arrived = this.moveToward(u, u.moveTarget, dt, 4);
      if (arrived) u.moveTarget = null;
    } else {
      u.atkTimer -= dt;
    }
  }

  private acquireMinionTarget(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const v of this.units) {
      if (v.team === u.team || !v.alive) continue;
      if (v.kind !== 'minion' && v.kind !== 'tower' && v.kind !== 'core' && v.kind !== 'hero') continue;
      const d = dist(u.pos, v.pos);
      if (d > 340 + u.atkRange) continue;
      // 优先级：攻击自己/友军的敌人 > 小兵 > 建筑
      let score = d;
      if (v.kind === 'hero') score -= 600;
      if (v.kind === 'minion') score -= 300;
      if (v.kind === 'tower') score += 100;
      if (v.kind === 'core') score += 400;
      if (score < bestScore) { bestScore = score; best = v; }
    }
    return best;
  }

  private laneDestination(team: Team): Vec {
    // 沿主战线进攻：目标依次为 敌方外塔→内塔→核心；无塔时走核心
    const enemyTowers = this.towers[team === 'blue' ? 'red' : 'blue'];
    if (enemyTowers.length > 0) {
      return enemyTowers.reduce((a, b) =>
        dist(a.pos, BASE_POS[team]) < dist(b.pos, BASE_POS[team]) ? a : b
      ).pos;
    }
    return BASE_POS[team === 'blue' ? 'red' : 'blue'];
  }

  private updateMinion(u: Unit, dt: number): void {
    if (isStunned(u)) { u.atkTimer -= dt; return; }
    let target: Unit | null = null;
    let bestD = Infinity;
    for (const v of this.units) {
      if (v.team === u.team || !v.alive) continue;
      const d = dist(u.pos, v.pos);
      let aggro = 260;
      if (v.kind === 'minion') aggro = 300;
      if (v.kind === 'hero') aggro = 220;
      if (v.kind === 'tower' || v.kind === 'core') aggro = 180;
      if (d < aggro && d < bestD) { target = v; bestD = d; }
    }
    if (target) {
      const inRange = this.tryBasicAttack(u, target, dt);
      if (!inRange) this.moveToward(u, target.pos, dt, u.atkRange + target.radius - 4);
    } else {
      const dest = this.laneDestination(u.team);
      // 小兵贴主战线走，受墙体阻挡
      const aim = { x: dest.x, y: WORLD.laneY + (u.pos.y - WORLD.laneY) * 0.9 };
      this.moveToward(u, aim, dt, 20);
    }
  }

  private updateTower(u: Unit, dt: number): void {
    u.atkTimer -= dt;
    // 目标选择：被英雄攻击引发的仇恨优先；其次范围内敌方小兵；最后英雄
    let target: Unit | null = null;
    if (u.aggroTargetId != null) {
      const forced = this.units.find((x) => x.id === u.aggroTargetId && x.alive);
      if (forced && forced.kind === 'hero' && dist(u.pos, forced.pos) <= u.atkRange) {
        target = forced;
      } else {
        u.aggroTargetId = null;
      }
    }
    if (!target) {
      const candidates = this.units.filter((v) =>
        v.team !== u.team && v.alive && dist(u.pos, v.pos) <= u.atkRange &&
        (v.kind === 'minion' || v.kind === 'hero'));
      const minions = candidates.filter((v) => v.kind === 'minion');
      target = (minions[0] ?? candidates.find((v) => v.kind === 'hero') ?? null);
    }
    if (target && u.atkTimer <= 0) {
      u.atkTimer = u.atkInterval;
      const hitTarget = target;
      this.spawnProjectile(u.team, { ...u.pos }, { ...target.pos },
        u.team === 'blue' ? 0x66d9ff : 0xff7b66, u.projectileSpeed, 'attack', 10,
        () => {
          const res = dealDamage(hitTarget, u.stats.atk, 'physical', u, this.units);
          if (res.dealt > 0) this.float(hitTarget.pos, `${Math.round(res.dealt)}`, '#ffa94d');
          if (res.killed) this.killUnit(hitTarget, u);
        });
    }
  }

  // ---------- 电脑英雄 AI ----------
  private updateAI(dt: number): void {
    const ai = this.ai;
    if (!ai.alive || isStunned(ai)) return;
    const def = getHero(ai.heroId!);
    const t = def.aiTendency;
    ai.aiTimer = (ai.aiTimer ?? 0) - dt;

    const enemy = this.player;
    const canSeeEnemy = enemy.alive && this.canSee(ai, enemy);
    const enemyDist = canSeeEnemy ? dist(ai.pos, enemy.pos) : 9999;
    const hpRatio = ai.stats.hp / ai.stats.hpMax;
    const mpRatio = ai.stats.mp / ai.stats.mpMax;
    const nearOwnBase = dist(ai.pos, BASE_POS.red) < 300;
    const underBlueTower = this.towers.blue.some((tw) => tw.alive && dist(tw.pos, ai.pos) < tw.atkRange);

    // 残血撤退 / 回城
    if (hpRatio < (enemy && canSeeEnemy ? 0.3 + t.caution * 0.15 : 0.18) && !nearOwnBase) {
      ai.aiState = 'retreat';
      ai.attackTargetId = null;
      this.commandMove(ai, BASE_POS.red);
      // 利用位移技能逃跑
      const dashSlot = def.skills.findIndex((s) => s.kind === 'dash');
      if (dashSlot >= 0 && this.canCast(ai, dashSlot).ok) {
        this.castSkill(ai, dashSlot, BASE_POS.red);
      }
      if (hpRatio < 0.2 && dist(ai.pos, BASE_POS.red) < 500) this.recall(ai);
      return;
    }

    // 回城后购买推荐装备
    if (nearOwnBase && (ai.aiTimer ?? 0) <= 0) {
      ai.aiTimer = 2;
      const plan = RECOMMENDED[ai.heroId!];
      const owned = new Set(ai.items ?? []);
      const next = plan.find((id) => !owned.has(id) || (getItem(id).category === 'consumable' && (ai.items ?? []).filter((x) => x === id).length < 2));
      if (next) this.buy(ai, next);
      // 学习技能
      for (let slot = 0; slot < 4; slot++) {
        if (this.canUpgradeSkill(ai, slot)) { this.upgradeSkill(ai, slot); break; }
      }
    }

    // 兵线定位：找最近的敌方残血小兵补刀，否则向当前兵线交会处推进
    let lastHit: Unit | null = null;
    let lastHitScore = Infinity;
    for (const m of this.units) {
      if (m.team !== 'red' || m.kind !== 'minion' || !m.alive) continue;
      if (dist(ai.pos, m.pos) > ai.atkRange + 60) continue;
      const oneShot = m.stats.hp <= ai.stats.atk * 1.1;
      const score = m.stats.hp + (oneShot ? -10000 : 0);
      if (score < lastHitScore) { lastHitScore = score; lastHit = m; }
    }

    // 防御：己方防御塔/核心附近出现大量敌方小兵时回防
    const threatMinions = this.units.filter((m) =>
      m.team === 'blue' && m.alive && m.kind === 'minion' &&
      dist(m.pos, BASE_POS.red) < 700);
    if (threatMinions.length >= 3 && dist(ai.pos, threatMinions[0].pos) > 300) {
      this.commandMove(ai, threatMinions[0].pos);
      return;
    }

    // 技能释放：依据距离、冷却、法力
    if (canSeeEnemy && mpRatio > 0.25) {
      for (let slot = 0; slot < 4; slot++) {
        const sk = this.getSkill(ai, slot);
        if (!sk) continue;
        if (!this.canCast(ai, slot).ok) continue;
        const sdef = sk.def;
        const li = sk.level - 1;
        const range = sdef.range[li] || sdef.radius[li];
        const isHeal = sdef.kind === 'heal' || sdef.kind === 'buff';
        // 控制/防御型在敌人贴近时才开控制技能；辅助型在友方（自身）低血量时治疗
        if (sdef.kind === 'buff' && hpRatio > 0.55) continue;
        if (isHeal && (sdef.heal || sdef.shield) && hpRatio > 0.7) continue;
        if (sdef.kind === 'dash' && enemyDist > 260 && hpRatio > 0.5) continue;
        if (underBlueTower && enemyDist > ai.atkRange && t.caution > 0.5) continue;
        const willPoke = t.poke > 0.6 ? enemyDist <= range : enemyDist <= range * (0.55 + t.aggression * 0.4);
        if (willPoke || isHeal) {
          const aim = enemy.pos;
          if (sdef.mode === 'self') this.castSkill(ai, slot, ai.pos);
          else if (sdef.mode === 'target') this.castSkill(ai, slot, aim, enemy);
          else this.castSkill(ai, slot, aim);
          break;
        }
      }
    }

    // 普攻决策
    if (canSeeEnemy) {
      const desired = (t.aggression > 0.7 ? ai.atkRange + 40 : ai.atkRange - 20);
      if (enemyDist <= desired + enemy.radius && (!underBlueTower || hpRatio > 0.7)) {
        this.commandAttack(ai, enemy);
        return;
      }
      if (enemyDist < 200 && t.aggression < 0.6) {
        this.commandMove(ai, { x: ai.pos.x + (ai.pos.x - enemy.pos.x), y: ai.pos.y + (ai.pos.y - enemy.pos.y) });
        return;
      }
    }

    // 补刀 / 推线
    if (lastHit) {
      this.commandAttack(ai, lastHit);
      return;
    }
    const laneMinions = this.units
      .filter((m) => m.team === 'blue' && m.alive && m.kind === 'minion')
      .sort((a, b) => dist(a.pos, BASE_POS.red) - dist(b.pos, BASE_POS.red));
    if (laneMinions.length > 0) {
      const m = laneMinions[0];
      if (dist(ai.pos, m.pos) > ai.atkRange + 20) this.commandMove(ai, m.pos);
      else this.commandAttack(ai, m);
      return;
    }

    // 随兵线向敌方外塔推进（不无限追击）
    const frontTower = this.towers.blue[0] ?? this.cores.blue;
    this.commandMove(ai, { x: frontTower.pos.x + 220, y: WORLD.laneY });
  }

  // ---------- 动态事件 ----------
  private updateEvents(dt: number): void {
    for (const ev of this.events) ev.remaining -= dt;

    // 天气结束时恢复
    if (this.events.every((e) => e.type !== 'weather')) {
      this.weatherMoveFactor = 1;
      this.weatherVisionFactor = 1;
    }
    // 路线封锁结束移除路障
    if (this.events.every((e) => e.type !== 'route-block') && this.blockWalls.length > 0) {
      this.blockWalls = [];
    }
    const finished = this.events.filter((e) => e.remaining <= 0);
    this.events = this.events.filter((e) => e.remaining > 0);
    for (const ev of finished) this.onEventEnd(ev);

    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.triggerRandomEvent();
      this.eventTimer = 55 + Math.random() * 25;
    }
  }

  private triggerRandomEvent(): void {
    const pool: ActiveEvent['type'][] = ['mega-wave', 'energy-node', 'weather', 'route-block', 'base-alarm'];
    const type = pool[Math.floor(Math.random() * pool.length)];
    let ev: ActiveEvent;
    switch (type) {
      case 'mega-wave':
        ev = { type, name: '星潮强化：下一波小兵全面强化', remaining: 25, duration: 25 };
        this.events.push(ev);
        this.waveTimer = Math.min(this.waveTimer, 1.5);
        this.announce('事件：星潮强化 —— 即将出现强化兵线！', 'event');
        break;
      case 'energy-node':
        ev = { type, name: '能量共鸣：中央能量点立即刷新', remaining: 12, duration: 12 };
        this.events.push(ev);
        this.energyNode.alive = true;
        this.energyNode.respawn = 0;
        this.announce('事件：能量共鸣 —— 中央能量点已刷新！', 'event');
        break;
      case 'weather':
        ev = { type, name: '离子风暴：全图移速与视野下降', remaining: 30, duration: 30 };
        this.events.push(ev);
        this.weatherMoveFactor = 0.8;
        this.weatherVisionFactor = 0.72;
        this.announce('事件：离子风暴 —— 视野与移速降低，草丛埋伏更危险！', 'event');
        break;
      case 'route-block': {
        ev = { type, name: '星尘坍塌：主战线一处路段临时封锁', remaining: 25, duration: 25 };
        this.events.push(ev);
        const bp = Math.random() < 0.5 ? { x: 1250, y: 600 } : { x: 1950, y: 600 };
        this.blockWalls = [
          { a: { x: bp.x - 40, y: bp.y - 150 }, b: { x: bp.x - 40, y: bp.y - 60 }, thickness: 50 },
          { a: { x: bp.x + 40, y: bp.y + 60 }, b: { x: bp.x + 40, y: bp.y + 150 }, thickness: 50 }
        ];
        this.announce('事件：星尘坍塌 —— 主线路段封锁，需要绕行草丛/绕后通道！', 'event');
        break;
      }
      case 'base-alarm': {
        // 基地警报：随机一方基地核心短暂暴露弱点（受到伤害 +20%），同时该方加速下波出兵
        const team: Team = Math.random() < 0.5 ? 'blue' : 'red';
        ev = { type, name: `${team === 'blue' ? '星蓝' : '赤星'}基地警报：核心护甲下调 20%`, remaining: 20, duration: 20, data: { team: team === 'blue' ? 0 : 1 } };
        this.events.push(ev);
        const core = this.cores[team];
        core.stats.physDef = -0.2;
        core.stats.energyDef = -0.2;
        this.announce(`事件：${team === 'blue' ? '蓝方' : '红方'}基地警报 —— 核心受到的伤害提升！`, 'event');
        break;
      }
    }
  }

  private onEventEnd(ev: ActiveEvent): void {
    if (ev.type === 'base-alarm' && ev.data) {
      const team: Team = ev.data.team === 0 ? 'blue' : 'red';
      this.cores[team].stats.physDef = 0;
      this.cores[team].stats.energyDef = 0;
      this.announce('基地警报解除，核心护甲恢复', 'event');
    }
    if (ev.type === 'mega-wave') this.announce('星潮强化结束，兵线恢复普通强度', 'event');
  }

  // ---------- 战术技能 D / F ----------
  tacticalCooldowns: Record<'blink' | 'scan', number> = { blink: 0, scan: 0 };
  private scanTimer: Record<Team, number> = { blue: 0, red: 0 };

  castTactical(u: Unit, kind: 'blink' | 'scan', aim: Vec): boolean {
    if (!u.alive || isStunned(u)) return false;
    if (this.tacticalCooldowns[kind] > 0) {
      if (u === this.player) this.announce('战术技能冷却中', 'warn');
      return false;
    }
    if (kind === 'blink') {
      const origin = { ...u.pos };
      const dirv = this.norm({ x: aim.x - origin.x, y: aim.y - origin.y });
      const target = this.pointInRange(origin, aim, 380);
      const dest = this.linecastMove(origin, target, u.radius);
      if (dist(origin, dest) < 30) {
        if (u === this.player) this.announce('闪烁落点被阻挡', 'warn');
        return false;
      }
      u.pos = dest;
      this.areaEffects.push({ id: this.nextId++, pos: { ...origin }, radius: 50, color: 0x7df9ff, remaining: 0.35, max: 0.35 });
      this.areaEffects.push({ id: this.nextId++, pos: { ...dest }, radius: 50, color: 0x7df9ff, remaining: 0.35, max: 0.35 });
      this.tacticalCooldowns.blink = 120;
      return true;
    }
    // 扫描：短时间侦测自身周围 520 范围草丛中的敌人
    this.scanTimer[u.team] = 6;
    this.tacticalCooldowns.scan = 90;
    this.areaEffects.push({ id: this.nextId++, pos: { ...u.pos }, radius: 520, color: 0x7df9ff, remaining: 0.8, max: 0.8 });
    this.announce('星图扫描启动：6 秒内可侦测附近草丛', u.team === 'blue' ? 'ward' : 'info');
    return true;
  }

  scanActive(team: Team): boolean {
    return this.scanTimer[team] > 0;
  }

  // 覆盖视野判定：扫描或萤灯影响草丛可见
  private updateTimersTactical(dt: number): void {
    this.tacticalCooldowns.blink = Math.max(0, this.tacticalCooldowns.blink - dt);
    this.tacticalCooldowns.scan = Math.max(0, this.tacticalCooldowns.scan - dt);
    this.scanTimer.blue = Math.max(0, this.scanTimer.blue - dt);
    this.scanTimer.red = Math.max(0, this.scanTimer.red - dt);
  }

  // 比赛统计快照（供结算页 / localStorage）
  snapshotStats(u: Unit) {
    return {
      name: u.name, heroId: u.heroId, level: u.level, kills: u.kills, deaths: u.deaths,
      cs: u.cs, gold: u.gold, items: [...(u.items ?? [])], damageDealt: Math.round(u.damageDealt ?? 0),
      towersLeft: this.towers[u.team].length, coreHp: Math.round(this.cores[u.team].stats.hp)
    };
  }
}

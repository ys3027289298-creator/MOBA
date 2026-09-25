import { getHeroDef, TACTICAL_SKILLS } from '../data/heroes';
import { getItem, purchasePrice, type ItemDef } from '../data/items';
import {
  BLUE_BASE, BUSHES, MAP_H, MAP_W, NEUTRAL_AREA, RED_BASE,
  WALLS, collideWalls, dist, inRect, lineBlocked, moveAlongLane, nearestLanePoint,
  type Rect
} from './map';
import { FIRST_WAVE, MATCH_DURATION, MAX_LEVEL, SIEGE_EVERY, WAVE_INTERVAL, xpForLevel } from './progression';
import { addStatus, applyDamage, healEntity, moveSpeedMultiplier, nearestEnemy } from './combat';
import { createBuildings, createHero, createMinion, makeStats, newId, type CombatMinion } from './factory';
import { skillDefAt } from './skills';
import { PingSystem, inMapBounds, type PingResult, type PingType } from './pings';
import type {
  Building, CastInput, DamageInfo, FloatingText, GameEntity, Hero, KillRecord, Minion,
  Projectile, Status, Team, Vec2
} from './types';

export interface GameConfig {
  mode: 'practice' | 'full';
  playerHero: string;
  enemyHero?: string;
}

export interface ArenaEventState {
  id: string;
  name: string;
  description: string;
  startsIn: number;
  duration: number;
  active: boolean;
}

export class Game {
  config: GameConfig;
  time = 0;
  heroes: Hero[] = [];
  minions: Minion[] = [];
  buildings: Building[] = [];
  projectiles: Projectile[] = [];
  texts: FloatingText[] = [];
  wards: { id: number; team: Team; pos: Vec2; ttl: number }[] = [];
  kills: KillRecord[] = [];
  score: [number, number] = [0, 0];
  result: 'running' | 'victory' | 'defeat' | 'timeout' = 'running';
  paused = false;
  speed = 1;
  waveTimer = FIRST_WAVE;
  waveNumber = 0;
  events: ArenaEventState[] = [];
  energyNode = { pos: { x: 840, y: 520 } as Vec2, ttl: 0, active: false, hold: [0, 0] as [number, number] };
  weather: { kind: 'none' | 'storm' | 'aurora'; ttl: number } = { kind: 'none', ttl: 0 };
  blockade: Rect | null = null;
  baseAlarm: [number, number] = [0, 0];
  notifications: { text: string; t: number; color: string }[] = [];
  pendingEffects: { t: number; action: () => void }[] = [];
  readonly pingSystem = new PingSystem();
  private textId = 1;

  constructor(config: GameConfig) {
    this.config = config;
    if (config.mode === 'practice') this.waveTimer = 2;
    this.heroes.push(createHero(config.playerHero, 0, true));
    const enemyId = config.enemyHero ?? ['emberfang', 'veilora', 'thorvall', 'lumi'].find((id) => id !== config.playerHero)!;
    this.heroes.push(createHero(enemyId, 1, false));
    this.buildings = createBuildings();
    this.scheduleEvents();
  }

  get player(): Hero { return this.heroes[0]; }
  get enemy(): Hero { return this.heroes[1]; }

  private scheduleEvents() {
    this.events = [
      { id: 'surge', name: '强化兵线', description: '立即增援一波强化小兵', startsIn: 120, duration: 0, active: false },
      { id: 'energy', name: '中央能量点', description: '占领中央能量点可获得回复与冷却加速', startsIn: 90, duration: 25, active: false },
      { id: 'storm', name: '离子风暴', description: '视野降低，路线外移速下降', startsIn: 180, duration: 20, active: false },
      { id: 'blockade', name: '路线封锁', description: '星环碎片短暂封锁主路线', startsIn: 240, duration: 12, active: false },
      { id: 'alarm', name: '基地警报', description: '双方基地建筑暴露并承受额外伤害', startsIn: 330, duration: 18, active: false },
      { id: 'aurora', name: '极光潮汐', description: '冷却恢复与法力回复大幅提升', startsIn: 420, duration: 20, active: false }
    ];
  }

  notify(text: string, color = '#ffe066') {
    this.notifications.push({ text, t: 4, color });
    if (this.notifications.length > 8) this.notifications.shift();
  }

  floatText(text: string, pos: Vec2, color = '#ffffff') {
    this.texts.push({ id: this.textId++, text, pos: { ...pos }, t: 1.1, color });
  }

  allEntities(): GameEntity[] {
    return [...this.heroes, ...this.minions, ...this.buildings];
  }

  entityById(id: number): GameEntity | undefined {
    return this.allEntities().find((e) => e.id === id);
  }

  activeBlockers(): Rect[] {
    return this.blockade ? [this.blockade, ...WALLS] : WALLS;
  }

  heroLevelOf(hero: Hero): number {
    return hero.level;
  }

  update(rawDt: number) {
    this.updateTransient(rawDt);
    if (this.result !== 'running') {
      this.pingSystem.clear();
      return;
    }
    if (this.paused) return;
    const dt = Math.min(0.05, rawDt) * this.speed;
    this.time += dt;
    this.pingSystem.update(dt);
    this.spawnWaves(dt);
    this.updateEvents(dt);
    for (const hero of this.heroes) this.updateHero(hero, dt);
    this.updateMinions(dt);
    this.updateBuildings(dt);
    this.updateProjectiles(dt);
    this.updatePending(dt);
    this.separateEntities();
    this.updateWards(dt);
    this.checkEnd();
  }

  private updateTransient(dt: number) {
    for (const text of this.texts) { text.t -= dt; text.pos.y -= 28 * dt; }
    this.texts = this.texts.filter((t) => t.t > 0);
    for (const notification of this.notifications) notification.t -= dt;
    this.notifications = this.notifications.filter((n) => n.t > 0);
  }

  private updatePending(dt: number) {
    for (const effect of this.pendingEffects) effect.t -= dt;
    const ready = this.pendingEffects.filter((e) => e.t <= 0);
    this.pendingEffects = this.pendingEffects.filter((e) => e.t > 0);
    for (const effect of ready) effect.action();
  }

  private spawnWaves(dt: number) {
    this.waveTimer -= dt;
    if (this.waveTimer > 0) return;
    this.waveNumber++;
    this.waveTimer = WAVE_INTERVAL;
    for (const team of [0, 1] as Team[]) this.spawnWave(team, false);
  }

  spawnWave(team: Team, promoted: boolean) {
    const base = team === 0 ? BLUE_BASE : RED_BASE;
    const list: Array<[Minion['minionType'], Vec2]> = [
      ['melee', { x: 0, y: -38 }],
      ['melee', { x: 0, y: 38 }],
      ['ranged', { x: -18, y: -20 }],
      ['ranged', { x: -18, y: 20 }]
    ];
    if (this.waveNumber % SIEGE_EVERY === 0 || this.waveNumber >= 7) list.push(['siege', { x: -34, y: 0 }]);
    list.forEach(([type, offset], i) => {
      this.minions.push(createMinion(type, team, { x: base.x + offset.x, y: base.y + offset.y }, this.waveNumber, promoted, i));
    });
  }

  private updateEvents(dt: number) {
    for (const event of this.events) {
      event.startsIn -= dt;
      if (event.active && event.startsIn <= 0) {
        this.endEvent(event);
      } else if (!event.active && event.startsIn <= 0) {
        this.startEvent(event);
      }
    }
    this.baseAlarm = [Math.max(0, this.baseAlarm[0] - dt), Math.max(0, this.baseAlarm[1] - dt)];
    if (this.weather.ttl > 0) {
      this.weather.ttl -= dt;
      if (this.weather.ttl <= 0) this.weather.kind = 'none';
    }
    if (this.energyNode.active) this.updateEnergyNode(dt);
    if (this.blockade && !this.events.find((e) => e.id === 'blockade')?.active) this.blockade = null;
  }

  private startEvent(event: ArenaEventState) {
    event.active = true;
    event.startsIn = event.duration || 0.1;
    this.notify(`${event.name}：${event.description}`, '#8ecae6');
    if (event.id === 'surge') {
      this.waveNumber++;
      for (const team of [0, 1] as Team[]) this.spawnWave(team, true);
      event.active = false;
      event.startsIn = 150;
    } else if (event.id === 'energy') {
      this.energyNode.active = true;
      this.energyNode.hold = [0, 0];
    } else if (event.id === 'storm') {
      this.weather = { kind: 'storm', ttl: event.duration };
    } else if (event.id === 'blockade') {
      this.blockade = { x: 790, y: 430, w: 100, h: 180 };
    } else if (event.id === 'alarm') {
      this.baseAlarm = [event.duration, event.duration];
    } else if (event.id === 'aurora') {
      this.weather = { kind: 'aurora', ttl: event.duration };
    }
  }

  private endEvent(event: ArenaEventState) {
    event.active = false;
    if (event.id === 'energy') this.energyNode.active = false;
    if (event.id === 'blockade') this.blockade = null;
    const repeat: Record<string, number> = { surge: 150, energy: 110, storm: 170, blockade: 160, alarm: 220, aurora: 200 };
    event.startsIn = repeat[event.id] ?? 180;
  }

  private updateEnergyNode(dt: number) {
    for (const team of [0, 1] as Team[]) {
      const holder = this.heroes.find((h) => h.team === team && h.alive && inRect(h.pos, NEUTRAL_AREA));
      const other = team === 0 ? 1 : 0;
      if (holder) {
        this.energyNode.hold[team] += dt;
        this.energyNode.hold[other] = Math.max(0, this.energyNode.hold[other] - dt * 0.5);
      }
      if (this.energyNode.hold[team] >= 4) {
        for (const hero of this.heroes.filter((h) => h.team === team && h.alive)) {
          healEntity(this, hero, 70 * dt, hero);
          hero.mana = Math.min(hero.maxMana, hero.mana + 35 * dt);
          for (const key of Object.keys(hero.cooldowns)) hero.cooldowns[key] = Math.max(0, hero.cooldowns[key] - dt * 0.7);
        }
      }
    }
  }

  commandMove(hero: Hero, point: Vec2) {
    if (!hero.alive) return;
    hero.moveTarget = { ...point };
    hero.attackTargetId = undefined;
    hero.recall = 0;
  }

  tryPing(type: PingType, pos: Vec2): PingResult {
    if (this.result !== 'running') return { ok: false, reason: '比赛已结束' };
    if (this.paused) return { ok: false, reason: '游戏已暂停' };
    if (!inMapBounds(pos)) return { ok: false, reason: '位置超出地图' };
    const player = this.player;
    if (!player.alive || this.isControlled(player)) return { ok: false, reason: '当前无法操作' };
    return this.pingSystem.add(type, player.team, pos, this.time);
  }

  commandAttack(hero: Hero, target: GameEntity) {
    if (!hero.alive || target.team === hero.team) return;
    hero.attackTargetId = target.id;
    hero.moveTarget = undefined;
    hero.recall = 0;
  }

  recall(hero: Hero) {
    if (!hero.alive || hero.recall > 0) return;
    hero.recall = 6;
    hero.moveTarget = undefined;
    hero.attackTargetId = undefined;
  }

  private isControlled(hero: Hero): boolean {
    return hero.statuses.some((s) => (s.type === 'stun' || s.type === 'knockback') && s.duration > 0);
  }

  private updateHero(hero: Hero, dt: number) {
    const cdr = this.weather.kind === 'aurora' ? 1.7 : 1;
    for (const key of Object.keys(hero.cooldowns)) hero.cooldowns[key] = Math.max(0, hero.cooldowns[key] - dt * cdr);
    this.tickStatuses(hero, dt);
    if (!hero.alive) {
      hero.deadTimer -= dt;
      if (hero.deadTimer <= 0) this.respawn(hero);
      return;
    }
    hero.hp = Math.min(hero.maxHp, hero.hp + hero.stats.hpRegen * dt);
    hero.mana = Math.min(hero.maxMana, hero.mana + hero.stats.manaRegen * dt * (this.weather.kind === 'aurora' ? 2 : 1));
    hero.attackCd = Math.max(0, hero.attackCd - dt);
    if (hero.recall > 0) {
      hero.recall -= dt;
      if (hero.recall <= 0) {
        hero.pos = hero.team === 0 ? { ...BLUE_BASE } : { ...RED_BASE };
        hero.hp = hero.maxHp;
        hero.mana = hero.maxMana;
        this.floatText('回城完成', hero.pos, '#80ed99');
      }
      return;
    }
    if (hero.ai) this.runAI(hero, dt);
    else this.handlePlayerCommand(hero, dt);
  }

  private handlePlayerCommand(hero: Hero, dt: number) {
    if (this.isControlled(hero)) return;
    const target = hero.attackTargetId !== undefined ? this.entityById(hero.attackTargetId) : undefined;
    if (target && target.alive) this.attackOrChase(hero, target, dt);
    else if (hero.moveTarget) this.moveToward(hero, hero.moveTarget, hero.stats.moveSpeed, dt, () => { hero.moveTarget = undefined; });
  }

  private attackOrChase(hero: Hero, target: GameEntity, dt: number) {
    const range = hero.stats.attackRange + target.radius;
    if (dist(hero.pos, target.pos) <= range && !lineBlocked(hero.pos, target.pos, this.activeBlockers())) {
      hero.moveTarget = undefined;
      this.basicAttack(hero, target);
    } else {
      this.moveToward(hero, target.pos, hero.stats.moveSpeed, dt, undefined, target.radius + 4);
    }
  }

  moveToward(entity: GameEntity, target: Vec2, baseSpeed: number, dt: number, onArrive?: () => void, stopRadius = 6): boolean {
    if (this.isControlled(entity as Hero)) return false;
    const slow = entity.kind === 'hero' ? moveSpeedMultiplier(entity) : 1;
    const stormPenalty = this.weather.kind === 'storm' && BUSHES.every((b) => !inRect(entity.pos, b)) ? 0.82 : 1;
    const speed = baseSpeed * slow * stormPenalty;
    const dx = target.x - entity.pos.x;
    const dy = target.y - entity.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= stopRadius) {
      onArrive?.();
      return true;
    }
    const step = Math.min(d, speed * dt);
    let next = { x: entity.pos.x + (dx / d) * step, y: entity.pos.y + (dy / d) * step };
    next = this.avoidBlockade(collideWalls(next, entity.radius));
    entity.pos = next;
    return false;
  }

  private avoidBlockade(p: Vec2): Vec2 {
    if (!this.blockade) return p;
    const b = this.blockade;
    if (!inRect(p, b, 4)) return p;
    return { x: p.x, y: p.y < b.y + b.h / 2 ? b.y - 6 : b.y + b.h + 6 };
  }

  basicAttack(attacker: GameEntity, target: GameEntity) {
    if (!attacker.alive || !target.alive || attacker.attackCd > 0) return false;
    if (target.team === attacker.team) return false;
    let range: number;
    let interval: number;
    let damage: number;
    let ranged: boolean;
    let type: DamageInfo['type'];
    if (attacker.kind === 'hero') {
      const hero = attacker as Hero;
      range = hero.stats.attackRange + target.radius;
      interval = hero.stats.attackInterval;
      damage = hero.stats.attack;
      ranged = getHeroDef(hero.heroId).ranged;
      type = 'physical';
      if (Math.random() < this.critChance(hero)) { damage *= 1.75; this.floatText('暴击!', target.pos, '#ff7b7b'); }
    } else if (attacker.kind === 'minion') {
      const minion = attacker as CombatMinion;
      range = minion.attackRange + target.radius;
      interval = minion.attackInterval;
      damage = minion.attackPower;
      ranged = minion.minionType !== 'melee';
      type = minion.damageType;
    } else {
      const building = attacker as Building;
      range = building.range;
      interval = building.interval;
      damage = building.damage;
      ranged = true;
      type = 'energy';
    }
    if (dist(attacker.pos, target.pos) > range || lineBlocked(attacker.pos, target.pos, this.activeBlockers())) return false;
    attacker.attackCd = interval;
    const info: DamageInfo = { amount: damage, type, source: attacker, sourceSkill: '普攻' };
    if (ranged) {
      this.projectiles.push({
        id: newId(), team: attacker.team, pos: { ...attacker.pos }, targetId: target.id,
        speed: attacker.kind === 'turret' || attacker.kind === 'core' ? 760 : 620,
        info, kind: attacker.kind === 'minion' || attacker.kind === 'hero' ? 'attack' : 'turret',
        sourceId: attacker.id
      });
    } else {
      this.dealAttackDamage(attacker, target, info);
    }
    return true;
  }

  private dealAttackDamage(attacker: GameEntity, target: GameEntity, info: DamageInfo) {
    applyDamage(this, target, info);
    if (attacker.kind === 'hero' && target.kind === 'hero') this.registerHeroAggro(attacker as Hero, target as Hero);
    if (attacker.kind === 'hero') {
      const lifestealValue = this.lifestealOf(attacker as Hero) * info.amount;
      if (lifestealValue > 0) healEntity(this, attacker, lifestealValue, attacker);
    }
  }

  critChance(hero: Hero): number {
    return hero.items.reduce((sum, id) => sum + (getItem(id).stats.crit ?? 0), 0);
  }

  lifestealOf(hero: Hero): number {
    return hero.items.reduce((sum, id) => sum + (getItem(id).stats.lifesteal ?? 0), 0);
  }

  private registerHeroAggro(attacker: Hero, target: Hero) {
    for (const building of this.buildings) {
      if (!building.alive || building.team !== target.team || building.kind === 'core') continue;
      if (dist(building.pos, attacker.pos) <= building.range + 40) building.aggroHeroId = attacker.id;
    }
  }

  private updateProjectiles(dt: number) {
    const alive: Projectile[] = [];
    for (const projectile of this.projectiles) {
      const target = projectile.targetId !== undefined ? this.entityById(projectile.targetId) : undefined;
      const destination = target?.alive ? target.pos : projectile.target;
      if (!destination) continue;
      const dx = destination.x - projectile.pos.x;
      const dy = destination.y - projectile.pos.y;
      const d = Math.hypot(dx, dy);
      const step = projectile.speed * dt;
      if (d <= step + 8) {
        if (target?.alive) {
          const source = this.entityById(projectile.sourceId);
          if (source && (projectile.kind === 'attack' || projectile.kind === 'turret')) {
            this.dealAttackDamage(source, target, projectile.info);
          } else if (source) {
            applyDamage(this, target, { ...projectile.info, source });
          } else {
            applyDamage(this, target, projectile.info);
          }
          if (projectile.onHit) this.resolveProjectileEffect(projectile, target);
        }
      } else {
      const previous = { ...projectile.pos };
      projectile.pos.x += (dx / d) * step;
      projectile.pos.y += (dy / d) * step;
      if (lineBlocked(previous, projectile.pos, WALLS)) continue;
      alive.push(projectile);
      }
    }
    this.projectiles = alive;
  }

  private resolveProjectileEffect(projectile: Projectile, target: GameEntity) {
    if (projectile.onHit === 'silence') addStatus(target, { type: 'silence', duration: 1.4, value: 1 });
  }

  tickStatuses(entity: GameEntity, dt: number) {
    for (const status of entity.statuses) {
      if (status.duration <= 0) continue;
      status.duration -= dt;
      if (status.type === 'dot' && status.duration > 0) {
        status.tick = (status.tick ?? 0) - dt;
        if (status.tick <= 0) {
          status.tick = 0.5;
          const source = status.sourceId !== undefined ? this.entityById(status.sourceId) : undefined;
          applyDamage(this, entity, { amount: status.value, type: status.damageType ?? 'energy', source, sourceSkill: '持续伤害' });
        }
      }
      if (status.type === 'knockback' && status.duration > 0 && entity.alive) {
        const angle = entity.statuses.find((s) => s === status)?.value;
        const dir = typeof angle === 'number' ? angle : 0;
        entity.pos = collideWalls({
          x: entity.pos.x + Math.cos(dir) * 260 * dt,
          y: entity.pos.y + Math.sin(dir) * 260 * dt
        }, entity.radius);
      }
    }
    entity.statuses = entity.statuses.filter((s) => s.duration > 0 || (s.type === 'shield' && s.value > 0));
  }

  private updateMinions(dt: number) {
    const alive: Minion[] = [];
    for (const minion of this.minions) {
      if (!minion.alive) continue;
      this.tickStatuses(minion, dt);
      minion.attackCd = Math.max(0, minion.attackCd - dt);
      const combat = minion as CombatMinion;
      let target = minion.attackTargetId !== undefined ? this.entityById(minion.attackTargetId) : undefined;
      if (!target?.alive) {
        target = this.acquireMinionTarget(minion);
        minion.attackTargetId = target?.id;
      }
      if (target && target.alive) {
        const range = combat.attackRange + target.radius;
        if (dist(minion.pos, target.pos) <= range && !lineBlocked(minion.pos, target.pos, this.activeBlockers())) {
          this.basicAttack(minion, target);
        } else if (target) {
          this.moveToward(minion, target.pos, 205, dt, undefined, target.radius);
        }
      } else {
        const destination = moveAlongLane(minion.pos, minion.team, 205 * dt);
        this.moveToward(minion, destination, 205, dt, undefined, 0);
      }
      alive.push(minion);
    }
    if (alive.length !== this.minions.length) this.minions = alive;
  }

  private acquireMinionTarget(minion: Minion): GameEntity | undefined {
    let best: GameEntity | undefined;
    let score = Infinity;
    for (const enemy of this.allEntities()) {
      if (!enemy.alive || enemy.team === minion.team) continue;
      const d = dist(minion.pos, enemy.pos);
      if (d > 330) continue;
      const priority = enemy.kind === 'minion' ? 0 : enemy.kind === 'hero' ? 2 : 1;
      const value = d + priority * 1000;
      if (value < score) { score = value; best = enemy; }
    }
    return best;
  }

  private updateBuildings(dt: number) {
    for (const building of this.buildings) {
      if (!building.alive) continue;
      this.tickStatuses(building, dt);
      building.attackCd = Math.max(0, building.attackCd - dt);
      if (building.attackCd > 0) continue;
      let target: GameEntity | undefined;
      const aggroHero = building.aggroHeroId !== undefined ? this.entityById(building.aggroHeroId) : undefined;
      const stillDamagingEnemy = aggroHero?.alive && aggroHero.team !== building.team &&
        dist(building.pos, aggroHero.pos) <= building.range &&
        (aggroHero as Hero).attackCd > ((aggroHero as Hero).stats?.attackInterval ?? 1) * 0.55;
      if (stillDamagingEnemy) {
        target = aggroHero;
      } else {
        building.aggroHeroId = undefined;
      }
      if (!target) {
        const candidates = this.allEntities().filter((e) => e.alive && e.team !== building.team && dist(e.pos, building.pos) <= building.range);
        target = candidates.find((e) => e.kind === 'minion') ?? candidates.find((e) => e.kind === 'hero') ?? candidates[0];
      }
      if (target) this.basicAttack(building, target);
    }
  }

  onDeath(victim: GameEntity, killer?: GameEntity, skill?: string) {
    victim.alive = false;
    victim.hp = 0;
    victim.moveTarget = undefined;
    victim.attackTargetId = undefined;
    this.kills.push({ victim, killer, skill, time: this.time });
    if (victim.kind === 'hero') {
      const hero = victim as Hero;
      hero.deaths++;
      hero.deadTimer = Math.min(42, 10 + hero.level * 3);
      if (killer?.kind === 'hero') {
        killer as Hero;
        const slayer = killer as Hero;
        slayer.kills++;
        slayer.gold += 300;
        this.giveXp(slayer, 160 + hero.level * 18);
        this.score[slayer.team]++;
        this.notify(`${slayer.name} 击杀了 ${hero.name}`, '#ff7b7b');
      } else {
        this.notify(`${hero.name} 阵亡`, '#ffd166');
      }
      for (const ally of this.heroes.filter((h) => h.team !== hero.team && h.alive && dist(h.pos, hero.pos) < 700)) {
        ally.gold += 90;
        this.giveXp(ally, 80);
      }
    } else if (victim.kind === 'minion') {
      const minion = victim as Minion;
      this.creditMinion(minion, killer);
    } else if (victim.kind === 'turret' || victim.kind === 'core') {
      const reward = victim.kind === 'turret' ? 250 : 0;
      for (const hero of this.heroes.filter((h) => h.team !== victim.team)) {
        hero.gold += reward;
        this.giveXp(hero, 120);
      }
      this.notify(killer ? `${victim.name} 被摧毁` : `${victim.name} 被摧毁`, '#8ecae6');
    }
  }

  private creditMinion(minion: Minion, killer?: GameEntity) {
    for (const hero of this.heroes) {
      if (!hero.alive || hero.team === minion.team || dist(hero.pos, minion.pos) > 720) continue;
      hero.gold += Math.round(minion.bountyGold * 0.45);
      this.giveXp(hero, Math.round(minion.bountyXp * 0.7));
      if (killer === hero) {
        hero.gold += minion.bountyGold;
        this.giveXp(hero, minion.bountyXp);
        hero.lastHits++;
        this.floatText('补刀 +' + minion.bountyGold, hero.pos, '#ffd166');
      }
    }
  }

  giveXp(hero: Hero, amount: number) {
    if (hero.level >= MAX_LEVEL) return;
    hero.xp += amount;
    while (hero.level < MAX_LEVEL && hero.xp >= xpForLevel(hero.level)) {
      hero.xp -= xpForLevel(hero.level);
      this.levelUp(hero);
    }
  }

  private levelUp(hero: Hero) {
    hero.level++;
    const oldMaxHp = hero.maxHp;
    const oldMaxMana = hero.maxMana;
    hero.stats = makeStats(hero.heroId, hero.level, hero.items);
    hero.maxHp = hero.stats.maxHp;
    hero.maxMana = hero.stats.maxMana;
    hero.hp += hero.maxHp - oldMaxHp;
    hero.mana += hero.maxMana - oldMaxMana;
    this.floatText(`升级 ${hero.level}`, hero.pos, '#c77dff');
    this.notify(`${hero.name} 升到 ${hero.level} 级`, '#c77dff');
  }

  learnSkill(hero: Hero, slot: number): boolean {
    if (hero.level <= hero.skillLevels.reduce((a, b) => a + b, 0)) return false;
    const current = hero.skillLevels[slot];
    const maxLevel = slot === 3 ? 3 : 4;
    const required = slot === 3 ? [6, 7, 8][current] : [1, 2, 3, 5][current];
    if (current >= maxLevel || hero.level < required) return false;
    hero.skillLevels[slot]++;
    return true;
  }

  private respawn(hero: Hero) {
    hero.alive = true;
    hero.hp = hero.maxHp;
    hero.mana = hero.maxMana;
    hero.statuses = [];
    hero.pos = hero.team === 0 ? { ...BLUE_BASE } : { ...RED_BASE };
    hero.moveTarget = undefined;
    hero.attackTargetId = undefined;
    this.notify(`${hero.name} 已复活`, '#80ed99');
  }

  canCast(hero: Hero, slot: number): { ok: boolean; reason?: string } {
    if (!hero.alive) return { ok: false, reason: '已死亡' };
    const def = slot >= 4 ? TACTICAL_SKILLS.find((s) => s.slot === slot) : getHeroDef(hero.heroId).skills[slot];
    if (!def) return { ok: false, reason: '无技能' };
    const level = slot < 4 ? hero.skillLevels[slot] : 1;
    if (slot < 4 && level <= 0) return { ok: false, reason: '技能未学习' };
    if ((hero.cooldowns[def.key] ?? 0) > 0) return { ok: false, reason: '冷却中' };
    if (hero.mana < def.cost(level)) return { ok: false, reason: '法力不足' };
    if (hero.statuses.some((s) => s.type === 'stun' && s.duration > 0)) return { ok: false, reason: '眩晕中' };
    if (hero.statuses.some((s) => s.type === 'silence' && s.duration > 0)) return { ok: false, reason: '沉默中' };
    return { ok: true };
  }

  castSkill(hero: Hero, slot: number, input: CastInput): boolean {
    const check = this.canCast(hero, slot);
    if (!check.ok) {
      this.floatText(check.reason ?? '无法释放', hero.pos, '#ff7b7b');
      return false;
    }
    const def = slot >= 4 ? TACTICAL_SKILLS.find((s) => s.slot === slot)! : getHeroDef(hero.heroId).skills[slot];
    const level = slot < 4 ? hero.skillLevels[slot] : 1;
    const point = input.point ?? (input.entityId !== undefined ? this.entityById(input.entityId)?.pos : undefined);
    if (def.targetMode !== 'none') {
      if (!point) return false;
      if (dist(hero.pos, point) > def.range + 24) {
        this.floatText('距离过远', hero.pos, '#ff7b7b');
        return false;
      }
      if (def.targetMode === 'entity' && (input.entityId === undefined || !this.entityById(input.entityId)?.alive)) return false;
      if ((def.targetMode === 'point' || def.targetMode === 'entity') && lineBlocked(hero.pos, point, this.activeBlockers()) && slot !== 2) {
        this.floatText('被墙体阻挡', hero.pos, '#ff7b7b');
        return false;
      }
    }
    hero.mana -= def.cost(level);
    const cdr = 1 - Math.min(0.4, hero.items.reduce((sum, id) => sum + (getItem(id).stats.cooldownReduce ?? 0), 0));
    hero.cooldowns[def.key] = def.cooldown(level) * cdr;
    hero.recall = 0;
    if (slot < 4) this.executeHeroSkill(hero, slot, level, input, point ?? hero.pos);
    else this.executeTactical(hero, slot, point ?? hero.pos);
    return true;
  }

  private apScale(hero: Hero, multiplier: number): number {
    return hero.stats.abilityPower * multiplier;
  }

  private enemiesInRadius(pos: Vec2, team: Team, radius: number): GameEntity[] {
    return this.allEntities().filter((e) => e.alive && e.team !== team && dist(e.pos, pos) <= radius + e.radius);
  }

  private alliesInRadius(pos: Vec2, team: Team, radius: number): GameEntity[] {
    return this.allEntities().filter((e) => e.alive && e.team === team && e.kind === 'hero' && dist(e.pos, pos) <= radius);
  }

  private executeHeroSkill(hero: Hero, slot: number, level: number, input: CastInput, point: Vec2) {
    const id = hero.heroId;
    const enemyHeroes = this.heroes.filter((h) => h.team !== hero.team);
    const target = input.entityId !== undefined ? this.entityById(input.entityId) : undefined;
    if (id === 'emberfang') {
      if (slot === 0 && target) {
        hero.pos = collideWalls({ x: target.pos.x - 28, y: target.pos.y }, hero.radius);
        this.skillDamage(hero, target, 70 + level * 32 + this.apScale(hero, 0.7), 'physical');
      } else if (slot === 1) {
        addStatus(hero, { type: 'shield', duration: 3.5, value: 80 + level * 38 + this.apScale(hero, 0.5) });
        addStatus(hero, { type: 'haste', duration: 3, value: 0.35 });
      } else if (slot === 2) {
        for (const enemy of this.enemiesInRadius(hero.pos, hero.team, 180)) {
          this.skillDamage(hero, enemy, 55 + level * 24 + this.apScale(hero, 0.65), 'energy');
          addStatus(enemy, { type: 'slow', duration: 1.5, value: 0.35 + level * 0.05 });
        }
      } else if (slot === 3) {
        hero.pos = collideWalls(point, hero.radius);
        for (const enemy of this.enemiesInRadius(point, hero.team, 170)) {
          this.skillDamage(hero, enemy, 55 + level * 40 + this.apScale(hero, 0.9), 'physical', '烬灭千刃');
          if (enemy.kind === 'hero') addStatus(enemy, { type: 'stun', duration: 0.7 + level * 0.15, value: 1 });
        }
      }
    } else if (id === 'veilora') {
      if (slot === 0) {
        this.spawnLineBolt(hero, point, 520, 70, 70 + level * 30 + this.apScale(hero, 0.8), 'energy');
      } else if (slot === 1) {
        for (let t = 0; t < 4; t++) {
          for (const enemy of this.enemiesInRadius(point, hero.team, 150)) {
            addStatus(enemy, { type: 'slow', duration: 0.6, value: 0.3 });
            this.delayedDamage(hero, enemy, 18 + level * 10 + this.apScale(hero, 0.22), 'energy', t * 0.45);
          }
        }
      } else if (slot === 2) {
        this.blink(hero, point, 300);
        addStatus(hero, { type: 'haste', duration: 2, value: 0.25 + level * 0.04 });
      } else if (slot === 3) {
        for (const enemy of this.enemiesInRadius(point, hero.team, 210)) {
          for (let t = 0; t < 3; t++) this.delayedDamage(hero, enemy, 45 + level * 28 + this.apScale(hero, 0.45), 'energy', t * 0.5);
          addStatus(enemy, { type: 'stun', duration: 0.9, value: 1 });
        }
      }
    } else if (id === 'thorvall') {
      if (slot === 0) {
        for (const enemy of this.enemiesInRadius(point, hero.team, 120)) {
          this.skillDamage(hero, enemy, 60 + level * 28 + hero.stats.attack * 0.4, 'physical');
          addStatus(enemy, { type: 'stun', duration: 0.8 + level * 0.12, value: 1 });
        }
      } else if (slot === 1) {
        addStatus(hero, { type: 'shield', duration: 4, value: 120 + level * 55 + hero.maxHp * 0.08 });
      } else if (slot === 2 && target) {
        this.skillDamage(hero, target, 50 + level * 30 + this.apScale(hero, 0.5), 'physical');
        addStatus(target, { type: 'silence', duration: 1.2 + level * 0.2, value: 1 });
        this.knockback(target, hero.pos, 150);
      } else if (slot === 3) {
        for (let t = 0; t < 5; t++) {
          for (const ally of this.alliesInRadius(point, hero.team, 230)) healEntity(this, ally, 24 + level * 12 + this.apScale(hero, 0.25), hero);
          for (const enemy of this.enemiesInRadius(point, hero.team, 230)) {
            this.delayedDamage(hero, enemy, 20 + level * 12, 'energy', t * 0.4);
            addStatus(enemy, { type: 'slow', duration: 0.5, value: 0.3 });
          }
        }
      }
    } else if (id === 'lumi') {
      if (slot === 0 && target) {
        this.projectiles.push({
          id: newId(), team: hero.team, pos: { ...hero.pos }, targetId: target.id, speed: 680,
          info: { amount: 55 + level * 28 + this.apScale(hero, 0.75), type: 'energy', source: hero, sourceSkill: '萤光飞弹' },
          kind: 'skill', onHit: 'silence', sourceId: hero.id
        });
      } else if (slot === 1) {
        const ally = target && target.team === hero.team ? target : hero;
        healEntity(this, ally, 80 + level * 42 + this.apScale(hero, 0.7), hero);
        addStatus(ally, { type: 'haste', duration: 2, value: 0.2 + level * 0.04 });
      } else if (slot === 2) {
        for (const enemy of this.enemiesInRadius(hero.pos, hero.team, 110)) this.skillDamage(hero, enemy, 40 + level * 18, 'energy');
        this.blink(hero, point, 360);
        for (const enemy of this.enemiesInRadius(hero.pos, hero.team, 110)) this.skillDamage(hero, enemy, 40 + level * 18, 'energy');
      } else if (slot === 3) {
        for (let t = 0; t < 5; t++) {
          for (const ally of this.alliesInRadius(point, hero.team, 240)) this.delayedHeal(ally as Hero, 30 + level * 15 + this.apScale(hero, 0.28), t * 0.4);
          for (const enemy of this.enemiesInRadius(point, hero.team, 240)) {
            this.delayedDamage(hero, enemy, 22 + level * 12 + this.apScale(hero, 0.22), 'energy', t * 0.4);
            addStatus(enemy, { type: 'slow', duration: 0.5, value: 0.25 });
          }
        }
      }
    }
  }

  private executeTactical(hero: Hero, slot: 4 | 5 | number, point: Vec2) {
    if (slot === 4) this.blink(hero, point, 280);
    if (slot === 5) {
      healEntity(this, hero, 180, hero);
      hero.mana = Math.min(hero.maxMana, hero.mana + 120);
    }
  }

  skillDamage(source: Hero, target: GameEntity, amount: number, type: DamageInfo['type'], skill?: string) {
    applyDamage(this, target, { amount, type, source, sourceSkill: skill });
    if (target.kind === 'hero') this.registerHeroAggro(source, target as Hero);
  }

  delayedDamage(source: Hero, target: GameEntity, amount: number, type: DamageInfo['type'], delay: number) {
    this.pendingEffects.push({ t: delay, action: () => this.skillDamage(source, target, amount, type) });
  }

  delayedHeal(target: Hero, amount: number, delay: number) {
    this.pendingEffects.push({ t: delay, action: () => healEntity(this, target, amount, target) });
  }

  knockback(entity: GameEntity, from: Vec2, distance: number) {
    const angle = Math.atan2(entity.pos.y - from.y, entity.pos.x - from.x);
    entity.pos = collideWalls({
      x: entity.pos.x + Math.cos(angle) * distance,
      y: entity.pos.y + Math.sin(angle) * distance
    }, entity.radius);
    addStatus(entity, { type: 'knockback', duration: 0.25, value: angle });
  }

  blink(hero: Hero, point: Vec2, maxDistance: number) {
    const d = dist(hero.pos, point);
    const scale = d > maxDistance ? maxDistance / d : 1;
    const destination = collideWalls({
      x: hero.pos.x + (point.x - hero.pos.x) * scale,
      y: hero.pos.y + (point.y - hero.pos.y) * scale
    }, hero.radius);
    hero.pos = destination;
    hero.moveTarget = undefined;
  }

  private spawnLineBolt(hero: Hero, point: Vec2, length: number, width: number, amount: number, type: DamageInfo['type']) {
    const angle = Math.atan2(point.y - hero.pos.y, point.x - hero.pos.x);
    const end = { x: hero.pos.x + Math.cos(angle) * length, y: hero.pos.y + Math.sin(angle) * length };
    const targets = this.allEntities().filter((enemy) => {
      if (!enemy.alive || enemy.team === hero.team) return false;
      const vx = enemy.pos.x - hero.pos.x;
      const vy = enemy.pos.y - hero.pos.y;
      const projection = vx * Math.cos(angle) + vy * Math.sin(angle);
      const sideways = Math.abs(vx * Math.sin(angle) - vy * Math.cos(angle));
      return projection >= 0 && projection <= length && sideways <= width;
    });
    for (const enemy of targets) this.skillDamage(hero, enemy, amount, type, '星辉弹');
  }

  private separateEntities() {
    const movers = [...this.heroes.filter((h) => h.alive), ...this.minions.filter((m) => m.alive)];
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i];
        const b = movers[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = a.radius + b.radius;
        if (d < min) {
          const push = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.pos = collideWalls({ x: a.pos.x - ux * push, y: a.pos.y - uy * push }, a.radius);
          b.pos = collideWalls({ x: b.pos.x + ux * push, y: b.pos.y + uy * push }, b.radius);
        }
      }
    }
  }

  isAtBase(hero: Hero): boolean {
    const base = hero.team === 0 ? BLUE_BASE : RED_BASE;
    return dist(hero.pos, base) < 190;
  }

  buyItem(hero: Hero, itemId: string): boolean {
    const item = getItem(itemId);
    if (!this.isAtBase(hero)) {
      this.floatText('只能在基地购买', hero.pos, '#ff7b7b');
      return false;
    }
    if (hero.items.filter((id) => id !== 'potion').length >= 6 && !item.id.startsWith('potion')) return false;
    if (hero.items.includes(itemId) && itemId !== 'potion') return false;
    const price = purchasePrice(item, hero.items);
    if (hero.gold < price) {
      this.floatText('金币不足', hero.pos, '#ff7b7b');
      return false;
    }
    hero.gold -= price;
    for (const component of item.recipe) {
      const index = hero.items.indexOf(component);
      if (index >= 0) hero.items.splice(index, 1);
    }
    hero.items.push(itemId);
    const oldHp = hero.maxHp;
    const oldMana = hero.maxMana;
    hero.stats = makeStats(hero.heroId, hero.level, hero.items);
    hero.maxHp = hero.stats.maxHp;
    hero.maxMana = hero.stats.maxMana;
    hero.hp += hero.maxHp - oldHp;
    hero.mana += hero.maxMana - oldMana;
    this.notify(`${hero.name} 购买了 ${item.name}`, '#80ed99');
    return true;
  }

  useItem(hero: Hero, itemId: string): boolean {
    if (!hero.items.includes(itemId)) return false;
    const item = getItem(itemId);
    if (item.active === 'heal150') {
      healEntity(this, hero, 150, hero);
      hero.mana = Math.min(hero.maxMana, hero.mana + 80);
      this.removeItem(hero, itemId);
    } else if (item.active === 'heal260') {
      healEntity(this, hero, 260, hero);
      hero.mana = Math.min(hero.maxMana, hero.mana + 160);
    } else if (item.active === 'reviveReady') {
      healEntity(this, hero, 320, hero);
      addStatus(hero, { type: 'shield', duration: 4, value: 260 });
    } else if (item.active === 'ward') {
      this.wards.push({ id: newId(), team: hero.team, pos: { ...hero.pos }, ttl: 90 });
      this.notify('侦测守卫已放置', '#8ecae6');
    }
    return true;
  }

  private removeItem(hero: Hero, itemId: string) {
    const index = hero.items.indexOf(itemId);
    if (index >= 0) hero.items.splice(index, 1);
  }

  private updateWards(dt: number) {
    for (const ward of this.wards) {
      ward.ttl -= dt;
      for (const enemy of this.heroes.filter((h) => h.team !== ward.team)) {
        if (dist(ward.pos, enemy.pos) < 360) addStatus(enemy, { type: 'reveal', duration: 0.2, value: 1, sourceTeam: ward.team });
      }
    }
    this.wards = this.wards.filter((w) => w.ttl > 0);
  }

  canSee(team: Team, pos: Vec2): boolean {
    const viewer = this.heroes.find((h) => h.team === team && h.alive);
    if (!viewer) return false;
    const enemy = this.heroes.find((h) => h.team !== team && h.alive && dist(h.pos, pos) < 20);
    const inBush = BUSHES.some((b) => inRect(pos, b));
    if (enemy && inBush) {
      if (dist(viewer.pos, pos) < 170) return true;
      if (this.wards.some((w) => w.team === team && dist(w.pos, pos) < 360)) return true;
      const revealed = enemy.statuses.some((s) => s.type === 'reveal' && s.duration > 0 && s.sourceTeam === team);
      return revealed;
    }
    const baseRadius = this.weather.kind === 'storm' ? 520 : 760;
    if (dist(viewer.pos, pos) <= baseRadius) return true;
    return this.minions.some((m) => m.alive && m.team === team && dist(m.pos, pos) < 320)
      || this.buildings.some((b) => b.alive && b.team === team && dist(b.pos, pos) < 430)
      || this.wards.some((w) => w.team === team && dist(w.pos, pos) < 360);
  }

  private runAI(hero: Hero, dt: number) {
    const ai = hero.ai!;
    ai.timer -= dt;
    const enemy = this.heroes.find((h) => h.team !== hero.team)!;
    const visibleEnemy = enemy.alive && this.canSee(hero.team, enemy.pos);
    const lowHp = hero.hp / hero.maxHp < 0.28;
    const enemyLow = visibleEnemy && enemy.hp / enemy.maxHp < 0.35;
    const ownTowerNear = this.buildings.some((b) => b.alive && b.team !== hero.team && dist(b.pos, hero.pos) < b.range + 70);
    const laneCenter = moveAlongLane(this.aiLaneAnchor(hero), hero.team, 120);
    this.aiBuy(hero);
    if (lowHp) {
      if (this.isAtBase(hero) && hero.hp / hero.maxHp < 0.85) {
        ai.state = 'base';
      } else {
        ai.state = 'retreat';
        const base = hero.team === 0 ? BLUE_BASE : RED_BASE;
        this.moveToward(hero, base, hero.stats.moveSpeed, dt);
        if (dist(hero.pos, base) < 260 && hero.hp / hero.maxHp < 0.55) this.recall(hero);
        this.aiCastDefensive(hero, enemy, visibleEnemy);
        return;
      }
    } else if (visibleEnemy && (enemyLow || hero.hp / hero.maxHp > 0.7) && !ownTowerNear && dist(hero.pos, enemy.pos) < 460) {
      ai.state = 'fight';
      this.aiFight(hero, enemy, dt);
    } else {
      ai.state = 'lane';
      this.aiFarm(hero, laneCenter, dt);
    }
    if (visibleEnemy && dist(hero.pos, enemy.pos) < 420) this.aiCastOffensive(hero, enemy);
  }

  private aiLaneAnchor(hero: Hero): Vec2 {
    const ownMinions = this.minions.filter((m) => m.alive && m.team === hero.team);
    if (ownMinions.length) return ownMinions.reduce((best, m) => dist(m.pos, hero.team === 0 ? RED_BASE : BLUE_BASE) < dist(best.pos, hero.team === 0 ? RED_BASE : BLUE_BASE) ? m : best).pos;
    return hero.team === 0 ? BLUE_BASE : RED_BASE;
  }

  private aiFarm(hero: Hero, lanePoint: Vec2, dt: number) {
    let lastHit: Minion | undefined;
    for (const minion of this.minions) {
      if (!minion.alive || minion.team === hero.team) continue;
      if (dist(minion.pos, hero.pos) <= hero.stats.attackRange + minion.radius + 4 && minion.hp < 90) lastHit = minion;
    }
    if (lastHit) {
      this.commandAttack(hero, lastHit);
      this.basicAttack(hero, lastHit);
      return;
    }
    this.moveToward(hero, lanePoint, hero.stats.moveSpeed * 0.9, dt);
  }

  private aiFight(hero: Hero, enemy: Hero, dt: number) {
    if (dist(hero.pos, enemy.pos) > hero.stats.attackRange + enemy.radius + 10) {
      this.moveToward(hero, enemy.pos, hero.stats.moveSpeed, dt, undefined, enemy.radius + 4);
    } else {
      this.basicAttack(hero, enemy);
    }
  }

  private aiCastOffensive(hero: Hero, enemy: Hero) {
    for (let slot = 0; slot < 4; slot++) {
      if (hero.skillLevels[slot] <= 0 || !this.canCast(hero, slot).ok) continue;
      const def = getHeroDef(hero.heroId).skills[slot];
      if (def.targetMode === 'entity' && dist(hero.pos, enemy.pos) <= def.range) this.castSkill(hero, slot, { entityId: enemy.id });
      else if (def.targetMode === 'point' && dist(hero.pos, enemy.pos) <= def.range) this.castSkill(hero, slot, { point: { ...enemy.pos } });
      else if (def.targetMode === 'direction' && dist(hero.pos, enemy.pos) <= def.range) this.castSkill(hero, slot, { point: { ...enemy.pos } });
      else if (def.targetMode === 'none' && dist(hero.pos, enemy.pos) < 220) this.castSkill(hero, slot, {});
    }
  }

  private aiCastDefensive(hero: Hero, enemy: Hero, visible: boolean) {
    for (let slot = 0; slot < 4; slot++) {
      const def = getHeroDef(hero.heroId).skills[slot];
      if (!this.canCast(hero, slot).ok) continue;
      if (def.name.includes('壁垒') || def.name.includes('护体')) this.castSkill(hero, slot, {});
      if (def.name.includes('跃迁') || def.name.includes('跃步')) {
        const base = hero.team === 0 ? BLUE_BASE : RED_BASE;
        this.castSkill(hero, slot, { point: base });
      }
      if (def.name.includes('祝福')) this.castSkill(hero, slot, { entityId: hero.id });
    }
    if (this.canCast(hero, 4).ok && visible && dist(hero.pos, enemy.pos) < 240) {
      const base = hero.team === 0 ? BLUE_BASE : RED_BASE;
      this.castSkill(hero, 4, { point: base });
    }
  }

  private aiBuy(hero: Hero) {
    if (!this.isAtBase(hero) || hero.items.length >= 6) return;
    const recommended = getHeroDef(hero.heroId).recommended;
    for (const itemId of recommended) {
      const item = getItem(itemId);
      if (hero.items.includes(itemId)) continue;
      const ownedRecipe = item.recipe.every((r) => hero.items.includes(r));
      if (item.recipe.length && !ownedRecipe) continue;
      if (hero.gold >= purchasePrice(item, hero.items) + 80) this.buyItem(hero, itemId);
      break;
    }
  }

  private checkEnd() {
    const blueCore = this.buildings.find((b) => b.kind === 'core' && b.team === 0)!;
    const redCore = this.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    if (!redCore.alive) this.result = 'victory';
    else if (!blueCore.alive) this.result = 'defeat';
    else if (this.time >= MATCH_DURATION) {
      this.result = this.score[0] >= this.score[1] ? 'victory' : 'defeat';
      if (this.score[0] === this.score[1]) this.result = 'timeout';
    }
  }
}

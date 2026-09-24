import { getHeroDef } from '../data/heroes';
import { getItem } from '../data/items';
import type { Hero, Minion, MinionType, Stats, Team, Vec2, Building, DamageType } from './types';

let nextId = 1;
export const newId = () => nextId++;

import { BLUE_BASE, CORE_POS, RED_BASE, TOWER_POS } from './map';

export function makeStats(heroId: string, level: number, items: string[]): Stats {
  const def = getHeroDef(heroId);
  const n = level - 1;
  const stats: Stats = {
    maxHp: def.base.maxHp + def.growth.hp * n,
    maxMana: def.base.maxMana + def.growth.mana * n,
    attack: def.base.attack + def.growth.attack * n,
    defense: def.base.defense + def.growth.defense * n,
    moveSpeed: def.base.moveSpeed,
    abilityPower: def.base.abilityPower + def.growth.ap * n,
    attackRange: def.base.attackRange,
    attackInterval: def.base.attackInterval,
    hpRegen: def.base.hpRegen + n * 0.8,
    manaRegen: def.base.manaRegen + n * 0.9
  };
  for (const itemId of items) {
    const item = getItem(itemId);
    for (const [key, value] of Object.entries(item.stats)) {
      if (typeof value !== 'number') continue;
      if (key === 'lifesteal' || key === 'cooldownReduce' || key === 'crit') continue;
      const record = stats as unknown as Record<string, number>;
      record[key] = (record[key] ?? 0) + value;
    }
  }
  return stats;
}

export function createHero(heroId: string, team: Team, isPlayer: boolean): Hero {
  const def = getHeroDef(heroId);
  const stats = makeStats(heroId, 1, []);
  return {
    id: newId(),
    kind: 'hero',
    team,
    name: def.name,
    heroId,
    pos: team === 0 ? { ...BLUE_BASE } : { ...RED_BASE },
    radius: 22,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    alive: true,
    statuses: [],
    attackCd: 0,
    mana: stats.maxMana,
    maxMana: stats.maxMana,
    stats,
    level: 1,
    xp: 0,
    gold: 500,
    skillLevels: [0, 0, 0, 0],
    cooldowns: { Q: 0, W: 0, E: 0, R: 0, D: 0, F: 0 },
    items: [],
    recall: 0,
    deadTimer: 0,
    lastHits: 0,
    kills: 0,
    deaths: 0,
    damageTaken: 0,
    damageDealt: 0,
    damageToHeroes: 0,
    ai: isPlayer ? undefined : { state: 'lane', timer: 1, buyTier: 0 }
  };
}

export interface MinionCombat {
  attackPower: number;
  attackRange: number;
  attackInterval: number;
  damageType: DamageType;
}

export type CombatMinion = Minion & MinionCombat;

export function createMinion(type: MinionType, team: Team, pos: Vec2, wave: number, promoted: boolean, index: number): CombatMinion {
  const scale = (1 + wave * 0.055 + (wave >= 6 ? 0.25 : 0)) * (promoted ? 1.35 : 1);
  const data = {
    melee: { hp: 300, attack: 30, range: 78, interval: 1.05, bounty: 22, xp: 38 },
    ranged: { hp: 210, attack: 38, range: 260, interval: 1.2, bounty: 16, xp: 28 },
    siege: { hp: 520, attack: 48, range: 300, interval: 1.65, bounty: 60, xp: 70 }
  }[type];
  return {
    id: newId(),
    kind: 'minion',
    team,
    name: type === 'melee' ? '先锋兵' : type === 'ranged' ? '弧光兵' : '重装机兵',
    pos: { ...pos },
    radius: type === 'siege' ? 20 : 15,
    hp: data.hp * scale,
    maxHp: data.hp * scale,
    alive: true,
    statuses: [],
    attackCd: index * 0.15,
    mana: 0,
    maxMana: 0,
    bountyGold: data.bounty,
    bountyXp: data.xp,
    wave,
    minionType: type,
    promoted,
    damageTaken: 0,
    attackPower: data.attack * scale,
    attackRange: data.range,
    attackInterval: data.interval,
    damageType: type === 'ranged' ? 'energy' : 'physical'
  };
}

export function createBuildings(): Building[] {
  const buildings: Building[] = [];
  for (const team of [0, 1] as Team[]) {
    TOWER_POS[team].forEach((pos, i) => {
      buildings.push({
        id: newId(),
        kind: 'turret',
        team,
        name: i === 0 ? '外环防御塔' : '内环防御塔',
        pos: { ...pos },
        radius: 30,
        hp: 1900,
        maxHp: 1900,
        alive: true,
        statuses: [],
        attackCd: 0,
        range: 300,
        interval: 1,
        damage: 135 + i * 25,
        slot: i,
        damageTaken: 0
      });
    });
    buildings.push({
      id: newId(),
      kind: 'core',
      team,
      name: team === 0 ? '星蓝基地核心' : '赤曜基地核心',
      pos: { ...CORE_POS[team] },
      radius: 42,
      hp: 3000,
      maxHp: 3000,
      alive: true,
      statuses: [],
      attackCd: 0,
      range: 330,
      interval: 0.9,
      damage: 160,
      slot: 9,
      damageTaken: 0
    });
  }
  return buildings;
}

export function createTrainingTarget(team: Team, pos: Vec2, index: number): CombatMinion {
  const target = createMinion('melee', team, pos, 0, false, index);
  target.name = '训练木桩';
  target.training = true;
  target.maxHp = 1500;
  target.hp = 1500;
  target.bountyGold = 0;
  target.bountyXp = 0;
  target.attackPower = 0;
  return target;
}

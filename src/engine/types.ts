export type Team = 0 | 1;
export type DamageType = 'physical' | 'energy';
export type ControlType = 'slow' | 'stun' | 'knockback' | 'silence';
export type EntityKind = 'hero' | 'minion' | 'turret' | 'core' | 'ward' | 'target';
export type MinionType = 'melee' | 'ranged' | 'siege';

export interface Vec2 { x: number; y: number }

export interface Stats {
  maxHp: number;
  maxMana: number;
  attack: number;
  defense: number;
  moveSpeed: number;
  abilityPower: number;
  attackRange: number;
  attackInterval: number;
  hpRegen: number;
  manaRegen: number;
}

export interface Status {
  type: ControlType | 'shield' | 'dot' | 'haste' | 'reveal' | 'invulnerable';
  duration: number;
  value: number;
  sourceTeam?: Team;
  sourceId?: number;
  tick?: number;
  damageType?: DamageType;
}

export interface DamageInfo {
  amount: number;
  type: DamageType;
  source?: GameEntity;
  sourceSkill?: string;
}

export interface KillRecord {
  victim: GameEntity;
  killer?: GameEntity;
  skill?: string;
  time: number;
}

export interface GameEntity {
  id: number;
  kind: EntityKind;
  team: Team;
  name: string;
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  statuses: Status[];
  attackCd: number;
  attackTargetId?: number;
  moveTarget?: Vec2;
  forcedTarget?: Vec2;
  damageTaken: number;
  damageDealt?: number;
}

export interface Hero extends GameEntity {
  kind: 'hero';
  heroId: string;
  mana: number;
  maxMana: number;
  stats: Stats;
  level: number;
  xp: number;
  gold: number;
  skillLevels: number[];
  cooldowns: Record<string, number>;
  items: string[];
  recall: number;
  deadTimer: number;
  lastHits: number;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageToHeroes: number;
  abilityCast?: { slot: number; input: CastInput; t: number };
  ai?: { state: string; target?: number; timer: number; buyTier: number };
}

export interface Minion extends GameEntity {
  kind: 'minion';
  minionType: MinionType;
  mana: number;
  maxMana: number;
  bountyGold: number;
  bountyXp: number;
  wave: number;
  promoted?: boolean;
}

export interface TrainingTarget extends GameEntity {
  kind: 'target';
}

export interface Building extends GameEntity {
  kind: 'turret' | 'core';
  range: number;
  interval: number;
  damage: number;
  slot: number;
  aggroHeroId?: number;
}

export interface Projectile {
  id: number;
  team: Team;
  pos: Vec2;
  targetId?: number;
  target?: Vec2;
  speed: number;
  info: DamageInfo;
  kind: 'attack' | 'skill' | 'turret';
  onHit?: string;
  sourceId: number;
}

export interface FloatingText { id: number; text: string; pos: Vec2; t: number; color: string }

export interface CastInput {
  point?: Vec2;
  entityId?: number;
}

export interface SkillDef {
  slot: number;
  key: 'Q' | 'W' | 'E' | 'R' | 'D' | 'F' | 'P';
  name: string;
  description: string;
  targetMode: 'none' | 'point' | 'direction' | 'entity';
  range: number;
  radius: number;
  cooldown: (level: number) => number;
  cost: (level: number) => number;
  color: number;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  role: '近战爆发型' | '远程消耗型' | '防御控制型' | '灵活辅助型';
  color: number;
  accent: number;
  ranged: boolean;
  blurb: string;
  base: Stats;
  growth: { hp: number; mana: number; attack: number; defense: number; ap: number };
  skills: SkillDef[];
  recommended: string[];
}

// 《星环决斗场》核心类型定义：所有战斗逻辑均围绕这些纯数据类型运转，可在 Node/Vitest 中直接测试。

export type Team = 'blue' | 'red';
export type UnitKind = 'hero' | 'minion' | 'tower' | 'core';
export type MinionType = 'melee' | 'ranged' | 'siege';
export type DamageType = 'physical' | 'energy';
export type ControlKind = 'slow' | 'stun' | 'knockback' | 'silence';

export interface Vec { x: number; y: number }

export interface StatusEffect {
  kind: ControlKind;
  remaining: number;
  duration: number;
  amount: number;
  sourceId: number;
}

export interface DotEffect {
  remaining: number;
  tickEvery: number;
  tickTimer: number;
  dps: number;
  type: DamageType;
  sourceId: number;
}

export interface Shield { remaining: number; amount: number }

export interface Stats {
  hp: number; hpMax: number;
  mp: number; mpMax: number;
  atk: number;
  physDef: number;
  energyDef: number;
  moveSpeed: number;
  power: number;
  hpRegen: number;
  mpRegen: number;
  lifesteal: number;
}

export interface Unit {
  id: number;
  team: Team;
  kind: UnitKind;
  name: string;
  pos: Vec;
  facing: Vec;
  radius: number;
  stats: Stats;
  atkRange: number;
  atkInterval: number;
  atkTimer: number;
  damageType: DamageType;
  projectileSpeed: number;
  alive: boolean;
  statuses: StatusEffect[];
  dots: DotEffect[];
  shields: Shield[];
  moveTarget: Vec | null;
  attackTargetId: number | null;
  heroId?: string;
  level?: number;
  xp?: number;
  gold?: number;
  skillPoints?: number;
  skillLevels?: number[];
  cooldowns?: number[];
  passiveTimer?: number;
  respawnTimer?: number;
  kills?: number; deaths?: number; cs?: number; damageDealt?: number;
  recallTimer?: number;
  items?: string[];
  aiState?: string;
  aiTimer?: number;
  lastDamagerId?: number;
  minionType?: MinionType;
  goldBounty?: number;
  xpBounty?: number;
  structure?: boolean;
  towerIndex?: number;
  aggroTargetId?: number | null;
}

export type SkillTargetMode = 'self' | 'point' | 'direction' | 'target';
export type SkillKind =
  | 'bolt' | 'nova' | 'line' | 'dash' | 'beam'
  | 'heal' | 'buff' | 'shock';

export interface SkillDef {
  id: string;
  slot: number;
  name: string;
  desc: string;
  kind: SkillKind;
  mode: SkillTargetMode;
  maxLevel: number;
  unlockLevel: number;
  cooldown: number[];
  cost: number[];
  range: number[];
  radius: number[];
  baseDamage: number[];
  powerScale: number;
  damageType: DamageType;
  control?: { kind: ControlKind; duration: number[]; amount: number[] };
  dot?: { duration: number[]; dps: number[] };
  heal?: number[];
  shield?: number[];
  buff?: { atk?: number[]; moveSpeed?: number[]; duration: number[] };
  dashDistance?: number[];
  passive?: boolean;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  role: '近战爆发型' | '远程消耗型' | '防御控制型' | '灵活辅助型';
  color: number;
  accent: number;
  desc: string;
  passiveName: string;
  passiveDesc: string;
  base: Stats;
  growth: Partial<Stats>;
  atkRange: number;
  atkInterval: number;
  projectileSpeed: number;
  skills: SkillDef[];
  aiTendency: { aggression: number; poke: number; caution: number };
}

export interface ItemDef {
  id: string;
  name: string;
  category: 'attack' | 'defense' | 'skill' | 'movement' | 'recovery' | 'consumable';
  price: number;
  desc: string;
  stats: Partial<Stats>;
  powerBonus?: number;
  active?: { kind: 'ward' | 'heal'; amount: number; cooldown: number };
  buildsFrom?: string[];
}

export type GameEventType =
  | 'mega-wave' | 'energy-node' | 'weather' | 'route-block' | 'base-alarm';

export interface ActiveEvent {
  type: GameEventType;
  name: string;
  remaining: number;
  duration: number;
  data?: Record<string, number>;
}

export interface FloatingText {
  id: number; pos: Vec; text: string; color: string; remaining: number; vy: number;
}

export interface ProjectileView {
  id: number; team: Team; pos: Vec; target: Vec; color: number;
  radius: number; speed: number; kind: 'attack' | 'skill'; alive: boolean;
}

export interface CastPreview {
  unitId: number; slot: number; mode: SkillTargetMode;
  range: number; radius: number; origin: Vec; dir: Vec;
}

export type GameResult = 'running' | 'victory' | 'defeat' | 'timeout-victory' | 'timeout-defeat';

export interface KillEvent { killer: string; victim: string; team: Team; time: number }

export interface MatchConfig { practice: boolean; duration: number; aiHeroId?: string }

export interface TempBuff {
  remaining: number;
  duration: number;
  atkBonus: number;
  moveBonus: number;
}

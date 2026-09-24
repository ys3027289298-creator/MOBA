import type { Stats } from '../engine/types';

export type ItemCategory = 'attack' | 'defense' | 'ability' | 'movement' | 'recovery' | 'active';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  cost: number;
  stats: Partial<Stats> & { lifesteal?: number; cooldownReduce?: number; crit?: number };
  recipe: string[];
  active?: string;
  description: string;
}

export const ITEMS: ItemDef[] = [
  { id: 'blade', name: '微晶短剑', category: 'attack', cost: 350, stats: { attack: 14 }, recipe: [], description: '+14 攻击力' },
  { id: 'edge', name: '裂星战刃', category: 'attack', cost: 1050, stats: { attack: 42, attackInterval: -0.12 }, recipe: ['blade'], description: '+42 攻击，攻击更快' },
  { id: 'cannon', name: '轨道手炮', category: 'attack', cost: 1700, stats: { attack: 65, attackRange: 45, crit: 0.2 }, recipe: ['edge'], description: '+65 攻击、射程与暴击' },
  { id: 'vest', name: '纤维护甲', category: 'defense', cost: 350, stats: { defense: 18, maxHp: 90 }, recipe: [], description: '+18 防御、90 生命' },
  { id: 'aegis', name: '折光神盾', category: 'defense', cost: 1050, stats: { defense: 42, maxHp: 260 }, recipe: ['vest'], description: '+42 防御、260 生命' },
  { id: 'bulwark', name: '堡星壁垒', category: 'defense', cost: 1850, stats: { defense: 68, maxHp: 520, hpRegen: 12 }, recipe: ['aegis'], description: '极高防御与生命' },
  { id: 'orb', name: '辉光法球', category: 'ability', cost: 380, stats: { abilityPower: 22, maxMana: 80 }, recipe: [], description: '+22 技能强度' },
  { id: 'nova', name: '新星核心', category: 'ability', cost: 1100, stats: { abilityPower: 62, maxMana: 180, cooldownReduce: 0.12 }, recipe: ['orb'], description: '+62 技能强度与冷却缩减' },
  { id: 'eternity', name: '永曜星枢', category: 'ability', cost: 1900, stats: { abilityPower: 110, maxMana: 320, cooldownReduce: 0.25 }, recipe: ['nova'], description: '大量技能强度与冷却缩减' },
  { id: 'sandals', name: '轻便行靴', category: 'movement', cost: 320, stats: { moveSpeed: 35 }, recipe: [], description: '+35 移速' },
  { id: 'boots', name: '跃迁战靴', category: 'movement', cost: 850, stats: { moveSpeed: 62, attackInterval: -0.06 }, recipe: ['sandals'], description: '+62 移速' },
  { id: 'gauntlet', name: '撼地护手', category: 'movement', cost: 1450, stats: { moveSpeed: 45, defense: 28, attack: 22 }, recipe: ['boots'], description: '移速、防御、攻击均衡提升' },
  { id: 'potion', name: '星露补给', category: 'recovery', cost: 180, stats: {}, recipe: [], active: 'heal150', description: '主动：回复 150 生命和 80 法力' },
  { id: 'chalice', name: '回涌圣杯', category: 'recovery', cost: 900, stats: { maxMana: 180, manaRegen: 12, hpRegen: 8 }, recipe: [], active: 'heal260', description: '主动：回复 260 生命和 160 法力' },
  { id: 'phoenix', name: '不死鸟羽', category: 'recovery', cost: 1600, stats: { maxHp: 320, hpRegen: 14, abilityPower: 28 }, recipe: ['chalice'], active: 'reviveReady', description: '生命值低时提供护盾，主动回复生命' },
  { id: 'wardstone', name: '侦幕晶石', category: 'active', cost: 600, stats: { maxHp: 100, maxMana: 60 }, recipe: [], active: 'ward', description: '主动：放置侦测守卫，揭示草丛 90 秒' }
];

export function getItem(id: string): ItemDef {
  const item = findItem(id);
  if (!item) throw new Error(`未知装备: ${id}`);
  return item;
}

export function findItem(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function canAfford(item: ItemDef, gold: number, owned: string[]): boolean {
  const ownsComponents = item.recipe.every((r) => owned.includes(r));
  const componentValue = item.recipe.reduce((sum, r) => sum + getItem(r).cost, 0);
  const price = ownsComponents ? item.cost - componentValue : item.cost;
  return gold >= price;
}

export function purchasePrice(item: ItemDef, owned: string[]): number {
  const ownsComponents = item.recipe.every((r) => owned.includes(r));
  const componentValue = item.recipe.reduce((sum, r) => sum + getItem(r).cost, 0);
  return ownsComponents ? Math.max(0, item.cost - componentValue) : item.cost;
}

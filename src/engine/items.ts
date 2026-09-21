import type { ItemDef } from './types';

// 商店装备：五类常规装备 + 消耗品。部分高级装备由低级装备合成。
export const ITEMS: ItemDef[] = [
  // 攻击
  { id: 'shard', name: '裂星碎片', category: 'attack', price: 350, desc: '+18 攻击力', stats: { atk: 18 } },
  { id: 'edge', name: '环蚀之刃', category: 'attack', price: 900, desc: '+45 攻击力，+8% 物理吸血', stats: { atk: 45, lifesteal: 0.08 }, buildsFrom: ['shard'] },
  { id: 'cannon', name: '湮灭重炮', category: 'attack', price: 1750, desc: '+80 攻击力', stats: { atk: 80 }, buildsFrom: ['edge'] },
  // 防御
  { id: 'plate', name: '星铁护板', category: 'defense', price: 350, desc: '+160 生命，+8% 物理减伤', stats: { hpMax: 160, physDef: 0.08 } },
  { id: 'aegis', name: '苍穹盾', category: 'defense', price: 950, desc: '+380 生命，+12% 物理减伤，+8% 能量减伤', stats: { hpMax: 380, physDef: 0.12, energyDef: 0.08 }, buildsFrom: ['plate'] },
  { id: 'bulwark', name: '星环壁垒', category: 'defense', price: 1800, desc: '+700 生命，+18% 物理减伤，+12% 能量减伤', stats: { hpMax: 700, physDef: 0.18, energyDef: 0.12 }, buildsFrom: ['aegis'] },
  // 技能
  { id: 'lens', name: '聚焦透镜', category: 'skill', price: 380, desc: '+25 技能强度，+0.4 法力回复', stats: { power: 25, mpRegen: 0.4 } },
  { id: 'prism', name: '折光棱镜', category: 'skill', price: 1000, desc: '+60 技能强度，+0.8 法力回复', stats: { power: 60, mpRegen: 0.8 }, buildsFrom: ['lens'] },
  { id: 'nova-core', name: '新星核心', category: 'skill', price: 1850, desc: '+110 技能强度，+1.2 法力回复', stats: { power: 110, mpRegen: 1.2 }, buildsFrom: ['prism'] },
  // 移动
  { id: 'boots', name: '游骑兵靴', category: 'movement', price: 450, desc: '+45 移动速度', stats: { moveSpeed: 45 } },
  { id: 'grav-boots', name: '反重力战靴', category: 'movement', price: 1000, desc: '+75 移动速度，+120 生命', stats: { moveSpeed: 75, hpMax: 120 }, buildsFrom: ['boots'] },
  // 恢复
  { id: 'pendant', name: '潮汐挂坠', category: 'recovery', price: 400, desc: '+220 生命，+4 生命回复', stats: { hpMax: 220, hpRegen: 4 } },
  { id: 'chalice', name: '星辉圣杯', category: 'recovery', price: 950, desc: '+300 生命，+250 法力，+6 生命回复，+3 法力回复', stats: { hpMax: 300, mpMax: 250, hpRegen: 6, mpRegen: 3 }, buildsFrom: ['pendant'] },
  // 消耗品 / 主动
  { id: 'potion', name: '修复药剂', category: 'consumable', price: 90, desc: '主动：立即回复 200 生命（30 秒冷却），最多叠加 3 层', stats: {}, active: { kind: 'heal', amount: 200, cooldown: 30 } },
  { id: 'ward', name: '侦测萤灯', category: 'consumable', price: 70, desc: '主动：在指定位置放置持续 45 秒的侦测萤灯，可照出草丛中的敌人', stats: {}, active: { kind: 'ward', amount: 45, cooldown: 20 } }
];

export function getItem(id: string): ItemDef {
  const item = ITEMS.find((it) => it.id === id);
  if (!item) throw new Error(`未知装备: ${id}`);
  return item;
}

// 推荐出装（按英雄定位）
export const RECOMMENDED: Record<string, string[]> = {
  lan: ['boots', 'shard', 'potion', 'edge', 'grav-boots', 'cannon'],
  vera: ['boots', 'lens', 'potion', 'prism', 'grav-boots', 'nova-core'],
  gurr: ['boots', 'plate', 'potion', 'aegis', 'grav-boots', 'bulwark'],
  qiqi: ['boots', 'lens', 'ward', 'prism', 'chalice', 'nova-core']
};

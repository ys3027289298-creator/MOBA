const veraSkills: SkillDef[] = [
  {
    id: 'vera-q', slot: 0, name: '星轨飞弹', kind: 'bolt', mode: 'target',
    desc: '发射星轨飞弹，命中首个敌人造成能量伤害。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [5, 4, 3], cost: [35, 40, 45], range: [520, 560, 600], radius: [26, 26, 26],
    baseDamage: [60, 95, 130], powerScale: 0.85, damageType: 'energy'
  },
  {
    id: 'vera-w', slot: 1, name: '灼星领域', kind: 'line', mode: 'point',
    desc: '在目标位置制造灼烧星域，持续灼伤其中敌人。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [11, 9.5, 8], cost: [60, 70, 80], range: [480, 500, 520], radius: [120, 130, 140],
    baseDamage: [20, 30, 40], powerScale: 0.4, damageType: 'energy',
    dot: { duration: [3, 3, 3], dps: [30, 50, 70] }
  },
  {
    id: 'vera-e', slot: 2, name: '碎星束缚', kind: 'shock', mode: 'target',
    desc: '用星能锁链轰击目标，造成能量伤害并沉默。',
    maxLevel: 3, unlockLevel: 2,
    cooldown: [14, 12, 10], cost: [70, 80, 90], range: [460, 480, 500], radius: [30, 30, 30],
    baseDamage: [70, 105, 140], powerScale: 0.8, damageType: 'energy',
    control: { kind: 'silence', duration: [1.2, 1.5, 1.8], amount: [1, 1, 1] }
  },
  {
    id: 'vera-r', slot: 3, name: '超新星坍缩', kind: 'nova', mode: 'point',
    desc: '在目标区域引发坍缩，造成巨额能量伤害并大幅减速。',
    maxLevel: 2, unlockLevel: 6,
    cooldown: [75, 60], cost: [100, 120], range: [520, 560], radius: [200, 220],
    baseDamage: [280, 400], powerScale: 1.5, damageType: 'energy',
    control: { kind: 'slow', duration: [2, 2.5], amount: [0.5, 0.6] }
  }
];

import type { HeroDef, SkillDef } from './types';

// 技能数值数组索引 = 技能等级-1

const lanSkills: SkillDef[] = [
  {
    id: 'lan-q', slot: 0, name: '裂光斩', kind: 'line', mode: 'direction',
    desc: '沿裂光方向挥斩，对矩形范围内敌人造成物理伤害并减速。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [6, 5, 4], cost: [40, 45, 50], range: [260, 280, 300], radius: [60, 60, 60],
    baseDamage: [70, 110, 150], powerScale: 0.9, damageType: 'physical',
    control: { kind: 'slow', duration: [1.5, 1.75, 2], amount: [0.3, 0.35, 0.4] }
  },
  {
    id: 'lan-w', slot: 1, name: '突进裂击', kind: 'dash', mode: 'direction',
    desc: '向指定方向冲刺，落点对周围敌人造成物理伤害与短暂击退。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [12, 10, 8], cost: [50, 55, 60], range: [300, 330, 360], radius: [110, 110, 110],
    baseDamage: [60, 95, 130], powerScale: 0.8, damageType: 'physical',
    control: { kind: 'knockback', duration: [0.3, 0.3, 0.3], amount: [90, 90, 90] },
    dashDistance: [300, 330, 360]
  },
  {
    id: 'lan-e', slot: 2, name: '刃甲共振', kind: 'buff', mode: 'self',
    desc: '4 秒内提升攻击力与移动速度。',
    maxLevel: 3, unlockLevel: 2,
    cooldown: [15, 13, 11], cost: [45, 50, 55], range: [0, 0, 0], radius: [0, 0, 0],
    baseDamage: [0, 0, 0], powerScale: 0, damageType: 'physical',
    buff: { atk: [25, 40, 55], moveSpeed: [40, 55, 70], duration: [4, 4, 4] }
  },
  {
    id: 'lan-r', slot: 3, name: '陨星处决', kind: 'nova', mode: 'point',
    desc: '跃向目标区域引爆陨星，造成高额物理伤害并眩晕中心敌人。',
    maxLevel: 2, unlockLevel: 6,
    cooldown: [70, 55], cost: [100, 120], range: [420, 460], radius: [170, 190],
    baseDamage: [260, 380], powerScale: 1.4, damageType: 'physical',
    control: { kind: 'stun', duration: [1.2, 1.5], amount: [1, 1] }
  }
];

const gurrSkills: SkillDef[] = [
  {
    id: 'gurr-q', slot: 0, name: '震地猛击', kind: 'nova', mode: 'self',
    desc: '重击地面，对周围敌人造成物理伤害并减速。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [7, 6, 5], cost: [40, 45, 50], range: [0, 0, 0], radius: [190, 205, 220],
    baseDamage: [55, 90, 125], powerScale: 0.7, damageType: 'physical',
    control: { kind: 'slow', duration: [1.5, 1.75, 2], amount: [0.35, 0.4, 0.45] }
  },
  {
    id: 'gurr-w', slot: 1, name: '磐岩壁垒', kind: 'buff', mode: 'self',
    desc: '获得持续 5 秒的高额护盾。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [14, 12, 10], cost: [50, 55, 60], range: [0, 0, 0], radius: [0, 0, 0],
    baseDamage: [0, 0, 0], powerScale: 0, damageType: 'physical',
    shield: [120, 200, 280]
  },
  {
    id: 'gurr-e', slot: 2, name: '岩拳冲锋', kind: 'shock', mode: 'target',
    desc: '冲锋拳击目标，造成物理伤害并眩晕。',
    maxLevel: 3, unlockLevel: 2,
    cooldown: [13, 11, 9], cost: [55, 60, 65], range: [320, 350, 380], radius: [40, 40, 40],
    baseDamage: [65, 100, 135], powerScale: 0.8, damageType: 'physical',
    control: { kind: 'stun', duration: [1, 1.25, 1.5], amount: [1, 1, 1] }
  },
  {
    id: 'gurr-r', slot: 3, name: '星陨封界', kind: 'line', mode: 'direction',
    desc: '向前掀起地脉，造成物理伤害、击退并眩晕敌人。',
    maxLevel: 2, unlockLevel: 6,
    cooldown: [80, 65], cost: [100, 120], range: [400, 440], radius: [90, 100],
    baseDamage: [240, 350], powerScale: 1.2, damageType: 'physical',
    control: { kind: 'knockback', duration: [0.6, 0.8], amount: [140, 160] }
  }
];

const qiqiSkills: SkillDef[] = [
  {
    id: 'qiqi-q', slot: 0, name: '萤光弹', kind: 'bolt', mode: 'target',
    desc: '投掷萤光弹造成能量伤害；若目标为友方英雄则转为治疗。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [5, 4.2, 3.5], cost: [35, 40, 45], range: [480, 510, 540], radius: [28, 28, 28],
    baseDamage: [50, 80, 110], powerScale: 0.7, damageType: 'energy',
    heal: [55, 85, 115]
  },
  {
    id: 'qiqi-w', slot: 1, name: '萤影迷踪', kind: 'dash', mode: 'direction',
    desc: '化作萤光瞬移，落点获得护盾与移动速度提升。',
    maxLevel: 3, unlockLevel: 1,
    cooldown: [11, 9.5, 8], cost: [45, 50, 55], range: [320, 350, 380], radius: [100, 100, 100],
    baseDamage: [0, 0, 0], powerScale: 0, damageType: 'energy',
    shield: [60, 95, 130],
    buff: { moveSpeed: [60, 75, 90], duration: [2, 2, 2] },
    dashDistance: [320, 350, 380]
  },
  {
    id: 'qiqi-e', slot: 2, name: '生机光种', kind: 'heal', mode: 'target',
    desc: '为友方英雄播撒光种，恢复生命并提升移动速度。',
    maxLevel: 3, unlockLevel: 2,
    cooldown: [13, 11, 9], cost: [60, 70, 80], range: [420, 440, 460], radius: [40, 40, 40],
    baseDamage: [0, 0, 0], powerScale: 0, damageType: 'energy',
    heal: [110, 170, 230],
    buff: { moveSpeed: [30, 40, 50], duration: [2.5, 2.5, 2.5] }
  },
  {
    id: 'qiqi-r', slot: 3, name: '星环祈愿', kind: 'heal', mode: 'self',
    desc: '祈愿星环，治疗自身周围友军并赋予护盾与加速。',
    maxLevel: 2, unlockLevel: 6,
    cooldown: [75, 60], cost: [100, 120], range: [0, 0], radius: [260, 280],
    baseDamage: [0, 0], powerScale: 0, damageType: 'energy',
    heal: [220, 330], shield: [150, 220],
    buff: { moveSpeed: [50, 70], duration: [3, 3] }
  }
];

export const HEROES: HeroDef[] = [
  {
    id: 'lan', name: '岚', title: '裂星刃', role: '近战爆发型',
    color: 0xff5a3c, accent: 0xffd166,
    desc: '来自星环外缘的赏金刃者，擅长近身连段与处决，瞬间爆发极高。',
    passiveName: '星裂印记', passiveDesc: '连续普攻击中同一目标 3 次时触发裂印，造成额外能量伤害。',
    base: { hp: 580, hpMax: 580, mp: 280, mpMax: 280, atk: 58, physDef: 0.22, energyDef: 0.2, moveSpeed: 175, power: 0, hpRegen: 6, mpRegen: 5, lifesteal: 0 },
    growth: { hpMax: 85, atk: 6.5, mpMax: 25 },
    atkRange: 130, atkInterval: 0.85, projectileSpeed: 0,
    skills: lanSkills,
    aiTendency: { aggression: 0.9, poke: 0.25, caution: 0.4 }
  },
  {
    id: 'vera', name: '薇拉', title: '星轨术士', role: '远程消耗型',
    color: 0x8b5cff, accent: 0x66e8ff,
    desc: '执掌星轨方程式的术士，依靠远程飞弹与灼烧星域压制敌人。',
    passiveName: '星轨加速', passiveDesc: '技能命中敌人后获得 12% 移动速度，持续 1.5 秒。',
    base: { hp: 470, hpMax: 470, mp: 380, mpMax: 380, atk: 48, physDef: 0.14, energyDef: 0.2, moveSpeed: 168, power: 0, hpRegen: 4.5, mpRegen: 7, lifesteal: 0 },
    growth: { hpMax: 65, atk: 4.5, mpMax: 35, power: 3 },
    atkRange: 420, atkInterval: 1.05, projectileSpeed: 720,
    skills: veraSkills,
    aiTendency: { aggression: 0.6, poke: 0.95, caution: 0.65 }
  },
  {
    id: 'gurr', name: '古尔', title: '磐岩守望', role: '防御控制型',
    color: 0x4ca64c, accent: 0xd4a373,
    desc: '星环要塞最后的守望者，以坚壁与大地之拳掌控战线。',
    passiveName: '磐岩体', passiveDesc: '受到伤害时降低 10%，生命低于 35% 时额外提升 15% 防御力。',
    base: { hp: 720, hpMax: 720, mp: 300, mpMax: 300, atk: 54, physDef: 0.3, energyDef: 0.26, moveSpeed: 160, power: 0, hpRegen: 8, mpRegen: 5, lifesteal: 0 },
    growth: { hpMax: 110, atk: 5, mpMax: 20, power: 2 },
    atkRange: 150, atkInterval: 1.1, projectileSpeed: 0,
    skills: gurrSkills,
    aiTendency: { aggression: 0.7, poke: 0.3, caution: 0.75 }
  },
  {
    id: 'qiqi', name: '琪琪', title: '萤光游灵', role: '灵活辅助型',
    color: 0x2ec4b6, accent: 0xfff278,
    desc: '穿梭星环的游灵，以治疗、护盾与灵动位移扭转战局。',
    passiveName: '萤光庇护', passiveDesc: '附近友方英雄（含自己）每 4 秒恢复少量生命。',
    base: { hp: 500, hpMax: 500, mp: 360, mpMax: 360, atk: 46, physDef: 0.16, energyDef: 0.18, moveSpeed: 182, power: 0, hpRegen: 5, mpRegen: 8, lifesteal: 0 },
    growth: { hpMax: 70, atk: 4, mpMax: 35, power: 3.5 },
    atkRange: 380, atkInterval: 1.0, projectileSpeed: 680,
    skills: qiqiSkills,
    aiTendency: { aggression: 0.45, poke: 0.6, caution: 0.7 }
  }
];

export function getHero(id: string): HeroDef {
  const hero = HEROES.find((h) => h.id === id);
  if (!hero) throw new Error(`未知英雄: ${id}`);
  return hero;
}


import type { HeroDef } from '../engine/types';

export const HEROES: HeroDef[] = [
  {
    id: 'emberfang',
    name: '烬牙',
    title: '赤刃突进者',
    role: '近战爆发型',
    color: 0xff5a3c,
    accent: 0xffd166,
    ranged: false,
    blurb: '高机动近战刺客，擅长瞬间贴近并打出连环爆发。',
    base: { maxHp: 620, maxMana: 300, attack: 58, defense: 24, moveSpeed: 315, abilityPower: 30, attackRange: 78, attackInterval: 0.85, hpRegen: 7, manaRegen: 6 },
    growth: { hp: 95, mana: 42, attack: 6.2, defense: 4.2, ap: 6 },
    skills: [
      { slot: 0, key: 'Q', name: '裂星斩', description: '冲向范围内目标并造成物理伤害。', targetMode: 'entity', range: 260, radius: 60, cooldown: (l) => Math.max(3, 7 - l * 0.5), cost: () => 45, color: 0xff7a4d },
      { slot: 1, key: 'W', name: '熔火护体', description: '获得护盾并提升攻击速度。', targetMode: 'none', range: 0, radius: 0, cooldown: (l) => 13 - l, cost: () => 55, color: 0xffb347 },
      { slot: 2, key: 'E', name: '炽焰横扫', description: '对周围敌人造成范围能量伤害与减速。', targetMode: 'none', range: 0, radius: 180, cooldown: (l) => 10 - l * 0.6, cost: () => 60, color: 0xff4d6d },
      { slot: 3, key: 'R', name: '烬灭千刃', description: '突进并反复斩击目标区域，造成高额伤害与短暂眩晕。', targetMode: 'point', range: 420, radius: 170, cooldown: (l) => 75 - l * 5, cost: () => 100, color: 0xff1f4b }
    ],
    recommended: ['edge', 'boots', 'cannon', 'aegis', 'nova', 'phoenix']
  },
  {
    id: 'veilora',
    name: '薇洛菈',
    title: '弧光占星师',
    role: '远程消耗型',
    color: 0x4cc9f0,
    accent: 0xb8f2ff,
    ranged: true,
    blurb: '远程能量射手，利用持续消耗和控制距离压制敌人。',
    base: { maxHp: 500, maxMana: 380, attack: 52, defense: 17, moveSpeed: 292, abilityPower: 45, attackRange: 330, attackInterval: 1.05, hpRegen: 5, manaRegen: 9 },
    growth: { hp: 70, mana: 55, attack: 5.2, defense: 3, ap: 9 },
    skills: [
      { slot: 0, key: 'Q', name: '星辉弹', description: '发射穿透星弹，对首个方向敌人造成能量伤害。', targetMode: 'direction', range: 560, radius: 70, cooldown: (l) => Math.max(2.4, 5 - l * 0.3), cost: () => 38, color: 0x48cae4 },
      { slot: 1, key: 'W', name: '极光囚笼', description: '在目标位置形成力场，持续减速并造成伤害。', targetMode: 'point', range: 460, radius: 150, cooldown: (l) => 14 - l, cost: () => 70, color: 0x90e0ef },
      { slot: 2, key: 'E', name: '相位跃迁', description: '向选定方向短距位移，并获得短暂加速。', targetMode: 'direction', range: 300, radius: 0, cooldown: (l) => 12 - l, cost: () => 50, color: 0xcaf0f8 },
      { slot: 3, key: 'R', name: '天陨星轨', description: '召唤连续陨石轰击指定区域，造成高额范围伤害和眩晕。', targetMode: 'point', range: 620, radius: 210, cooldown: (l) => 80 - l * 6, cost: () => 110, color: 0x00b4d8 }
    ],
    recommended: ['orb', 'boots', 'nova', 'cannon', 'eternity', 'wardstone']
  },
  {
    id: 'thorvall',
    name: '索尔瓦',
    title: '环界守望者',
    role: '防御控制型',
    color: 0x80ed99,
    accent: 0xd8f3dc,
    ranged: false,
    blurb: '坚固前排守护者，能够击退敌人、保护防线并控制区域。',
    base: { maxHp: 780, maxMana: 320, attack: 50, defense: 36, moveSpeed: 278, abilityPower: 25, attackRange: 95, attackInterval: 1.1, hpRegen: 10, manaRegen: 6 },
    growth: { hp: 125, mana: 40, attack: 4.5, defense: 6, ap: 5 },
    skills: [
      { slot: 0, key: 'Q', name: '震地重锤', description: '猛击地面，伤害并眩晕前方敌人。', targetMode: 'direction', range: 230, radius: 120, cooldown: (l) => 9 - l * 0.6, cost: () => 50, color: 0x95d5b2 },
      { slot: 1, key: 'W', name: '星钢壁垒', description: '获得巨额护盾并短暂减免受到的伤害。', targetMode: 'none', range: 0, radius: 0, cooldown: (l) => 16 - l, cost: () => 60, color: 0x74c69d },
      { slot: 2, key: 'E', name: '斥力冲拳', description: '击退目标并造成物理伤害与沉默。', targetMode: 'entity', range: 170, radius: 70, cooldown: (l) => 12 - l, cost: () => 55, color: 0x52b788 },
      { slot: 3, key: 'R', name: '星环圣域', description: '展开守护领域：治疗友军并持续眩晕踏入的敌人。', targetMode: 'point', range: 300, radius: 230, cooldown: (l) => 85 - l * 6, cost: () => 105, color: 0x40916c }
    ],
    recommended: ['aegis', 'boots', 'bulwark', 'phoenix', 'gauntlet', 'wardstone']
  },
  {
    id: 'lumi',
    name: '露米',
    title: '萤翼游星',
    role: '灵活辅助型',
    color: 0xc77dff,
    accent: 0xe0aaff,
    ranged: true,
    blurb: '灵活辅助，可治疗、加速、沉默并用位移改变战局。',
    base: { maxHp: 520, maxMana: 420, attack: 44, defense: 18, moveSpeed: 305, abilityPower: 42, attackRange: 300, attackInterval: 1.0, hpRegen: 6, manaRegen: 11 },
    growth: { hp: 72, mana: 62, attack: 4, defense: 3.2, ap: 8 },
    skills: [
      { slot: 0, key: 'Q', name: '萤光飞弹', description: '发射追踪飞弹，造成伤害并沉默目标。', targetMode: 'entity', range: 430, radius: 60, cooldown: (l) => 8 - l * 0.5, cost: () => 45, color: 0xb388eb },
      { slot: 1, key: 'W', name: '春星祝福', description: '治疗自身或一名友方英雄，并提供短暂加速。', targetMode: 'entity', range: 360, radius: 0, cooldown: (l) => 11 - l * 0.7, cost: () => 65, color: 0x9d4edd },
      { slot: 2, key: 'E', name: '折光跃步', description: '瞬移至目标点，起点和终点造成能量伤害。', targetMode: 'point', range: 360, radius: 110, cooldown: (l) => 10 - l * 0.6, cost: () => 55, color: 0xe0aaff },
      { slot: 3, key: 'R', name: '星籁交响', description: '大范围持续治疗友军、伤害并减速敌军。', targetMode: 'point', range: 520, radius: 240, cooldown: (l) => 80 - l * 6, cost: () => 110, color: 0x7b2cbf }
    ],
    recommended: ['orb', 'boots', 'chalice', 'nova', 'eternity', 'wardstone']
  }
];

export const TACTICAL_SKILLS = [
  { slot: 4, key: 'D' as const, name: '跃迁疾行', description: '短距离位移，可穿越小兵但不能穿墙。', targetMode: 'direction' as const, range: 280, radius: 0, cooldown: () => 90, cost: () => 0, color: 0xffffff },
  { slot: 5, key: 'F' as const, name: '复苏信标', description: '立刻回复生命与法力。', targetMode: 'none' as const, range: 0, radius: 0, cooldown: () => 120, cost: () => 0, color: 0x80ffdb }
];

export function getHeroDef(id: string): HeroDef {
  const def = HEROES.find((h) => h.id === id);
  if (!def) throw new Error(`未知英雄: ${id}`);
  return def;
}

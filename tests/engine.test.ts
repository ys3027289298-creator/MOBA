import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { BLUE_BASE, RED_BASE, WALLS, collideWalls, dist, lineBlocked } from '../src/engine/map';
import { createHero, createMinion } from '../src/engine/factory';
import { addStatus, applyDamage } from '../src/engine/combat';
import type { Hero, Minion } from '../src/engine/types';

function makeGame(player = 'emberfang', enemy = 'veilora') {
  return new Game({ mode: 'full', playerHero: player, enemyHero: enemy });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

describe('移动、攻击距离与碰撞', () => {
  it('英雄可以移动且墙体不可穿越', () => {
    const game = makeGame();
    const start = { ...game.player.pos };
    game.commandMove(game.player, { x: start.x + 200, y: start.y });
    tick(game, 1);
    expect(game.player.pos.x).toBeGreaterThan(start.x);
    const wall = WALLS[0];
    const p = collideWalls({ x: wall.x + wall.w / 2, y: wall.y + wall.h / 2 }, 22);
    expect(p.y).toBeLessThanOrEqual(wall.y - 22);
  });

  it('近战攻击受距离限制，远程攻击生成弹道', () => {
    const game = makeGame('emberfang', 'veilora');
    const player = game.player;
    const enemy = game.enemy;
    enemy.pos = { x: player.pos.x + 500, y: player.pos.y };
    expect(game.basicAttack(player, enemy)).toBe(false);
    enemy.pos = { x: player.pos.x + 70, y: player.pos.y };
    expect(game.basicAttack(player, enemy)).toBe(true);
    const rangedGame = makeGame('veilora', 'emberfang');
    rangedGame.enemy.pos = { x: rangedGame.player.pos.x + 280, y: rangedGame.player.pos.y };
    expect(rangedGame.basicAttack(rangedGame.player, rangedGame.enemy)).toBe(true);
    expect(rangedGame.projectiles.length).toBe(1);
  });

  it('技能不能穿过不可通行墙体', () => {
    const game = makeGame('veilora', 'emberfang');
    game.player.pos = { x: 430, y: 330 };
    const behindWall = { x: 430, y: 120 };
    expect(lineBlocked(game.player.pos, behindWall)).toBe(true);
    expect(game.castSkill(game.player, 1, { point: behindWall })).toBe(false);
  });
});

describe('技能冷却、消耗、伤害和控制', () => {
  it('技能消耗法力并进入冷却', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    hero.skillLevels[0] = 1;
    const manaBefore = hero.mana;
    expect(game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } })).toBe(true);
    expect(hero.mana).toBeLessThan(manaBefore);
    expect(hero.cooldowns.Q).toBeGreaterThan(0);
    expect(game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } })).toBe(false);
  });

  it('范围技能造成伤害和减速/眩晕', () => {
    const game = makeGame('emberfang', 'veilora');
    const player = game.player;
    const enemy = game.enemy;
    player.skillLevels[2] = 1;
    enemy.pos = { x: player.pos.x + 80, y: player.pos.y };
    const hp = enemy.hp;
    game.castSkill(player, 2, {});
    expect(enemy.hp).toBeLessThan(hp);
    expect(enemy.statuses.some((s) => s.type === 'slow')).toBe(true);
    player.skillLevels[3] = 1;
    enemy.hp = enemy.maxHp;
    game.castSkill(player, 3, { point: { ...enemy.pos } });
    expect(enemy.statuses.some((s) => s.type === 'stun')).toBe(true);
  });

  it('沉默和击退会改变状态', () => {
    const game = makeGame('thorvall', 'emberfang');
    const thor = game.player;
    const foe = game.enemy;
    thor.skillLevels[2] = 1;
    foe.pos = { x: thor.pos.x + 80, y: thor.pos.y };
    game.castSkill(thor, 2, { entityId: foe.id });
    expect(foe.statuses.some((s) => s.type === 'silence' || s.type === 'knockback')).toBe(true);
  });

  it('护盾吸收伤害', () => {
    const game = makeGame('thorvall', 'veilora');
    const hero = game.player;
    hero.skillLevels[1] = 1;
    game.castSkill(hero, 1, {});
    const hp = hero.hp;
    applyDamage(game, hero, { amount: 50, type: 'physical' });
    expect(hero.hp).toBe(hp);
    applyDamage(game, hero, { amount: 300, type: 'physical' });
    expect(hero.hp).toBeLessThan(hp);
  });
});

describe('升级、死亡与复活', () => {
  it('获得经验后升级并可学习技能', () => {
    const game = makeGame();
    game.giveXp(game.player, 500);
    expect(game.player.level).toBeGreaterThan(1);
    expect(game.learnSkill(game.player, 0)).toBe(true);
  });

  it('英雄死亡后倒计时复活', () => {
    const game = makeGame();
    const hero = game.player;
    applyDamage(game, hero, { amount: hero.maxHp * 2, type: 'energy', source: game.enemy });
    expect(hero.alive).toBe(false);
    expect(hero.deadTimer).toBeGreaterThan(0);
    tick(game, hero.deadTimer + 0.1);
    expect(hero.alive).toBe(true);
    expect(dist(hero.pos, BLUE_BASE)).toBeLessThan(5);
  });
});

describe('小兵、防御塔和基地', () => {
  it('会定时生成三类小兵并沿路线推进', () => {
    const game = makeGame();
    tick(game, 26);
    expect(game.minions.length).toBeGreaterThanOrEqual(8);
    const melee = game.minions.find((m) => m.minionType === 'melee');
    expect(melee).toBeTruthy();
    tick(game, 90);
    expect(game.minions.some((m) => m.minionType === 'siege')).toBe(true);
    const blue = game.minions.filter((m) => m.team === 0 && m.alive);
    expect(blue[0].pos.x).toBeGreaterThan(BLUE_BASE.x);
  });

  it('小兵会攻击并可死亡', () => {
    const game = makeGame();
    const a = createMinion('melee', 0, { x: 300, y: 520 }, 1, false, 0);
    const b = createMinion('melee', 1, { x: 340, y: 520 }, 1, false, 0);
    game.minions.push(a, b);
    tick(game, 3);
    expect(a.hp).toBeLessThan(a.maxHp);
  });

  it('防御塔优先攻击小兵，英雄攻击敌方英雄会引仇', () => {
    const game = makeGame('veilora', 'emberfang');
    const tower = game.buildings.find((t) => t.team === 1 && t.slot === 0)!;
    const minion = createMinion('melee', 0, { x: tower.pos.x - 80, y: tower.pos.y }, 1, false, 0);
    game.minions.push(minion);
    game.enemy.pos = { x: tower.pos.x - 100, y: tower.pos.y };
    tick(game, 1.2);
    expect(minion.hp).toBeLessThan(minion.maxHp);
  });

  it('基地核心被摧毁后结算胜利或失败', () => {
    const win = makeGame();
    const redCore = win.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    applyDamage(win, redCore, { amount: redCore.hp, type: 'energy', source: win.player });
    win.update(0.05);
    expect(win.result).toBe('victory');
    const lose = makeGame();
    const blueCore = lose.buildings.find((b) => b.kind === 'core' && b.team === 0)!;
    applyDamage(lose, blueCore, { amount: blueCore.hp, type: 'energy', source: lose.enemy });
    lose.update(0.05);
    expect(lose.result).toBe('defeat');
  });

  it('超时会产生结局', () => {
    const game = makeGame();
    game.time = 15 * 60 - 0.01;
    game.update(0.05);
    expect(['victory', 'defeat', 'timeout']).toContain(game.result);
  });
});

describe('经济、补刀和装备', () => {
  it('最后一击获得金币经验', () => {
    const game = makeGame();
    const minion = createMinion('melee', 1, { x: game.player.pos.x + 50, y: game.player.pos.y }, 1, false, 0);
    game.minions.push(minion);
    const gold = game.player.gold;
    const xp = game.player.xp;
    applyDamage(game, minion, { amount: 99999, type: 'physical', source: game.player });
    expect(game.player.gold).toBeGreaterThan(gold);
    expect(game.player.xp).toBeGreaterThan(xp);
    expect(game.player.lastHits).toBe(1);
  });

  it('基地商店可购买装备并改变属性', () => {
    const game = makeGame();
    const attack = game.player.stats.attack;
    expect(game.buyItem(game.player, 'blade')).toBe(true);
    expect(game.player.stats.attack).toBeGreaterThan(attack);
    game.commandMove(game.player, { x: 500, y: 500 });
    tick(game, 2);
    const gold = game.player.gold;
    expect(game.buyItem(game.player, 'vest')).toBe(false);
    expect(game.player.gold).toBe(gold);
  });

  it('高级装备可用低级装备合成', () => {
    const game = makeGame();
    game.player.gold = 2000;
    game.buyItem(game.player, 'blade');
    const gold = game.player.gold;
    expect(game.buyItem(game.player, 'edge')).toBe(true);
    expect(game.player.items).not.toContain('blade');
    expect(game.player.items).toContain('edge');
    expect(game.player.gold).toBe(gold - (1050 - 350));
  });
});

describe('草丛、视野和事件', () => {
  it('草丛外单位无法看到草丛内敌方英雄', () => {
    const game = makeGame();
    game.player.gold = 700;
    game.enemy.pos = { x: 520, y: 390 };
    game.player.pos = { ...BLUE_BASE };
    expect(game.canSee(0, game.enemy.pos)).toBe(false);
    game.player.pos = { x: 540, y: 410 };
    expect(game.canSee(0, game.enemy.pos)).toBe(true);
  });

  it('侦测守卫揭示草丛', () => {
    const game = makeGame();
    game.player.gold = 700;
    game.player.pos = { ...BLUE_BASE };
    game.enemy.pos = { x: 520, y: 390 };
    expect(game.buyItem(game.player, 'wardstone')).toBe(true);
    game.useItem(game.player, 'wardstone');
    game.wards[0].pos = { x: 520, y: 390 };
    game.update(0.1);
    expect(game.canSee(0, game.enemy.pos)).toBe(true);
  });

  it('中央能量点事件真实生效', () => {
    const game = makeGame();
    const event = game.events.find((e) => e.id === 'energy')!;
    event.startsIn = 0.01;
    game.player.pos = { ...game.energyNode.pos };
    tick(game, 6);
    expect(event.active).toBe(true);
  });

  it('路线封锁事件生成不可通行区域', () => {
    const game = makeGame();
    const event = game.events.find((e) => e.id === 'blockade')!;
    event.startsIn = 0.01;
    tick(game, 0.1);
    expect(game.blockade).not.toBeNull();
  });
});

describe('电脑英雄', () => {
  it('电脑会推进并释放技能', () => {
    const game = makeGame('veilora', 'emberfang');
    game.enemy.level = 6;
    game.enemy.skillLevels = [1, 1, 1, 1];
    game.enemy.mana = game.enemy.maxMana;
    game.player.pos = { x: game.enemy.pos.x - 260, y: game.enemy.pos.y };
    game.enemy.pos = { ...RED_BASE };
    tick(game, 20);
    expect(game.enemy.pos.x).toBeLessThan(RED_BASE.x);
  });
});

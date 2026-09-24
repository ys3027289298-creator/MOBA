import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { addStatus, applyDamage } from '../src/engine/combat';
import { createMinion } from '../src/engine/factory';
import { precheckCast, entityContract } from '../src/engine/targeting';
import type { Hero } from '../src/engine/types';

function makeGame(player = 'emberfang', enemy = 'veilora') {
  return new Game({ mode: 'full', playerHero: player, enemyHero: enemy });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

function learn(hero: Hero, ...slots: number[]) {
  for (const slot of slots) hero.skillLevels[slot] = 1;
}

function snapshot(game: Game, hero: Hero) {
  return {
    mana: hero.mana,
    cooldowns: { ...hero.cooldowns },
    pos: { ...hero.pos },
    statuses: hero.statuses.length,
    recall: hero.recall,
    projectiles: game.projectiles.length,
    pending: game.pendingEffects.length,
    notifications: game.notifications.length,
    damageDealt: hero.damageDealt,
    damageToHeroes: hero.damageToHeroes
  };
}

function expectUnchanged(game: Game, hero: Hero, snap: ReturnType<typeof snapshot>) {
  expect(hero.mana).toBe(snap.mana);
  expect(hero.cooldowns).toEqual(snap.cooldowns);
  expect(hero.pos).toEqual(snap.pos);
  expect(hero.statuses.length).toBe(snap.statuses);
  expect(hero.recall).toBe(snap.recall);
  expect(game.projectiles.length).toBe(snap.projectiles);
  expect(game.pendingEffects.length).toBe(snap.pending);
  expect(game.notifications.length).toBe(snap.notifications);
  expect(hero.damageDealt).toBe(snap.damageDealt);
  expect(hero.damageToHeroes).toBe(snap.damageToHeroes);
}

function placeNear(hero: Hero, target: { pos: { x: number; y: number } }, offset = 100) {
  target.pos = { x: hero.pos.x + offset, y: hero.pos.y };
}

describe('entity 技能目标契约', () => {
  it('烬牙 Q 对合法敌方目标生效且只扣一次资源', () => {
    const game = makeGame('emberfang', 'veilora');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 0);
    placeNear(hero, enemy);
    const mana = hero.mana;
    const hp = enemy.hp;
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(true);
    expect(enemy.hp).toBeLessThan(hp);
    const cost = mana - hero.mana;
    expect(cost).toBeGreaterThan(0);
    expect(hero.cooldowns.Q).toBeGreaterThan(0);
    const manaAfter = hero.mana;
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(false);
    expect(hero.mana).toBe(manaAfter);
  });

  it('烬牙 Q 拒绝友方目标（建筑、小兵、自身）', () => {
    const game = makeGame('emberfang', 'veilora');
    const hero = game.player;
    learn(hero, 0);
    const allyTurret = game.buildings.find((b) => b.team === 0 && b.alive)!;
    allyTurret.pos = { x: hero.pos.x + 80, y: hero.pos.y };
    const allyMinion = createMinion('melee', 0, { x: hero.pos.x + 60, y: hero.pos.y }, 1, false, 0);
    game.minions.push(allyMinion);
    for (const target of [allyTurret, allyMinion, hero]) {
      const snap = snapshot(game, hero);
      expect(game.castSkill(hero, 0, { entityId: target.id })).toBe(false);
      expectUnchanged(game, hero, snap);
    }
  });

  it('索尔瓦 E 对敌方造成沉默击退，对友方拒绝', () => {
    const game = makeGame('thorvall', 'emberfang');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 2);
    placeNear(hero, enemy, 80);
    expect(game.castSkill(hero, 2, { entityId: enemy.id })).toBe(true);
    expect(enemy.statuses.some((s) => s.type === 'silence')).toBe(true);
    game.enemy.statuses = [];
    hero.cooldowns.E = 0;
    hero.mana = hero.maxMana;
    const snap = snapshot(game, hero);
    expect(game.castSkill(hero, 2, { entityId: hero.id })).toBe(false);
    expectUnchanged(game, hero, snap);
  });

  it('露米 Q 只攻击敌方，拒绝友方小兵', () => {
    const game = makeGame('lumi', 'emberfang');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 0);
    placeNear(hero, enemy, 200);
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(true);
    expect(game.projectiles.length).toBe(1);
    hero.cooldowns.Q = 0;
    hero.mana = hero.maxMana;
    const allyMinion = createMinion('melee', 0, { x: hero.pos.x + 60, y: hero.pos.y }, 1, false, 0);
    game.minions.push(allyMinion);
    const snap = snapshot(game, hero);
    expect(game.castSkill(hero, 0, { entityId: allyMinion.id })).toBe(false);
    expectUnchanged(game, hero, snap);
  });

  it('露米 W 治疗自身，拒绝敌方目标且不再悄悄治自己', () => {
    const game = makeGame('lumi', 'emberfang');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 1);
    hero.hp = hero.maxHp - 300;
    placeNear(hero, enemy, 200);
    expect(game.castSkill(hero, 1, { entityId: hero.id })).toBe(true);
    expect(hero.hp).toBeGreaterThan(hero.maxHp - 300);
    hero.cooldowns.W = 0;
    hero.mana = hero.maxMana;
    hero.hp = hero.maxHp - 300;
    const snap = snapshot(game, hero);
    expect(game.castSkill(hero, 1, { entityId: enemy.id })).toBe(false);
    expectUnchanged(game, hero, snap);
    expect(hero.hp).toBe(hero.maxHp - 300);
  });

  it('死亡目标、缺失 entityId、过期 entityId 都被拒绝', () => {
    const game = makeGame('emberfang', 'veilora');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 0);
    placeNear(hero, enemy);
    applyDamage(game, enemy, { amount: 999999, type: 'energy' });
    expect(enemy.alive).toBe(false);
    for (const input of [{ entityId: enemy.id }, {}, { entityId: 987654 }]) {
      const snap = snapshot(game, hero);
      expect(game.castSkill(hero, 0, input)).toBe(false);
      expectUnchanged(game, hero, snap);
    }
  });

  it('重复点击同一无效目标不叠加副作用', () => {
    const game = makeGame('emberfang', 'veilora');
    const hero = game.player;
    learn(hero, 0);
    const snap = snapshot(game, hero);
    for (let i = 0; i < 5; i++) expect(game.castSkill(hero, 0, { entityId: 424242 })).toBe(false);
    expectUnchanged(game, hero, snap);
  });
});

describe('point / direction 输入校验', () => {
  it('NaN、Infinity、缺字段的点位被拒绝', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    learn(hero, 1);
    const inputs = [
      { point: { x: NaN, y: 100 } },
      { point: { x: Infinity, y: 100 } },
      { point: { x: 100, y: -Infinity } },
      {}
    ];
    for (const input of inputs) {
      const snap = snapshot(game, hero);
      expect(game.castSkill(hero, 1, input)).toBe(false);
      expectUnchanged(game, hero, snap);
    }
  });

  it('远距离点位被拒绝', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    learn(hero, 1);
    const snap = snapshot(game, hero);
    expect(game.castSkill(hero, 1, { point: { x: hero.pos.x + 5000, y: hero.pos.y } })).toBe(false);
    expectUnchanged(game, hero, snap);
  });

  it('墙后目标（entity 与 direction）被拒绝', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 0);
    hero.pos = { x: 430, y: 330 };
    enemy.pos = { x: 430, y: 120 };
    const snap = snapshot(game, hero);
    expect(game.castSkill(hero, 0, { point: { ...enemy.pos } })).toBe(false);
    expectUnchanged(game, hero, snap);
    const entityGame = makeGame('emberfang', 'veilora');
    const fighter = entityGame.player;
    learn(fighter, 0);
    fighter.pos = { x: 430, y: 330 };
    entityGame.enemy.pos = { x: 430, y: 120 };
    const snap2 = snapshot(entityGame, fighter);
    expect(entityGame.castSkill(fighter, 0, { entityId: entityGame.enemy.id })).toBe(false);
    expectUnchanged(entityGame, fighter, snap2);
  });

  it('露米 E 点位位移仍然生效', () => {
    const game = makeGame('lumi', 'emberfang');
    const hero = game.player;
    learn(hero, 2);
    const destination = { x: hero.pos.x + 200, y: hero.pos.y };
    expect(game.castSkill(hero, 2, { point: destination })).toBe(true);
    expect(hero.pos.x).toBeGreaterThan(destination.x - 60);
  });

  it('无目标技能与战术技能正常释放', () => {
    const game = makeGame('emberfang', 'veilora');
    const hero = game.player;
    learn(hero, 1);
    expect(game.castSkill(hero, 1, {})).toBe(true);
    expect(hero.statuses.some((s) => s.type === 'shield')).toBe(true);
    const point = { x: hero.pos.x + 120, y: hero.pos.y };
    expect(game.castSkill(hero, 4, { point })).toBe(true);
    expect(hero.cooldowns.D).toBeGreaterThan(0);
    expect(game.castSkill(hero, 5, {})).toBe(true);
    expect(hero.cooldowns.F).toBeGreaterThan(0);
  });
});

describe('状态与资源预检', () => {
  it('被眩晕或沉默时无法施法且零副作用', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    learn(hero, 0);
    addStatus(hero, { type: 'stun', duration: 1, value: 1 });
    let snap = snapshot(game, hero);
    expect(game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } })).toBe(false);
    expectUnchanged(game, hero, snap);
    hero.statuses = [];
    addStatus(hero, { type: 'silence', duration: 1, value: 1 });
    snap = snapshot(game, hero);
    expect(game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } })).toBe(false);
    expectUnchanged(game, hero, snap);
  });

  it('法力不足时拒绝且不打断回城', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    learn(hero, 0);
    hero.mana = 1;
    hero.recall = 6;
    const snap = snapshot(game, hero);
    expect(game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } })).toBe(false);
    expectUnchanged(game, hero, snap);
  });

  it('合法施法会打断回城且只结算一次', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    learn(hero, 0);
    hero.recall = 6;
    const mana = hero.mana;
    expect(game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } })).toBe(true);
    expect(hero.recall).toBe(0);
    expect(mana - hero.mana).toBeCloseTo(38, 5);
  });
});

describe('执行阶段与延迟效果安全', () => {
  it('延迟伤害在目标死亡后安全结束，不伤友军', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 1);
    placeNear(hero, enemy, 200);
    expect(game.castSkill(hero, 1, { point: { ...enemy.pos } })).toBe(true);
    expect(game.pendingEffects.length).toBeGreaterThan(0);
    applyDamage(game, enemy, { amount: 999999, type: 'energy' });
    const taken = enemy.damageTaken;
    tick(game, 2);
    expect(enemy.damageTaken).toBe(taken);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it('延迟伤害不会对友军生效，延迟治疗跳过死亡目标', () => {
    const game = makeGame('thorvall', 'veilora');
    const hero = game.player;
    const allyMinion = createMinion('melee', 0, { x: hero.pos.x + 40, y: hero.pos.y }, 1, false, 0);
    game.minions.push(allyMinion);
    game.delayedDamage(hero, allyMinion, 500, 'energy', 0.1);
    game.delayedHeal(hero, 100, 0.1);
    applyDamage(game, hero, { amount: 999999, type: 'energy' });
    tick(game, 0.5);
    expect(allyMinion.hp).toBe(allyMinion.maxHp);
    expect(hero.alive).toBe(false);
    expect(hero.hp).toBe(0);
  });

  it('露米 Q 弹道在目标死亡后不再命中', () => {
    const game = makeGame('lumi', 'emberfang');
    const hero = game.player;
    const enemy = game.enemy;
    learn(hero, 0);
    placeNear(hero, enemy, 300);
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(true);
    applyDamage(game, enemy, { amount: 999999, type: 'energy' });
    const taken = enemy.damageTaken;
    tick(game, 2);
    expect(enemy.damageTaken).toBe(taken);
  });
});

describe('目标契约与 AI 回归', () => {
  it('entityContract 映射攻击型与治疗型技能', () => {
    expect(entityContract('emberfang', 0)).toBe('enemy');
    expect(entityContract('thorvall', 2)).toBe('enemy');
    expect(entityContract('lumi', 0)).toBe('enemy');
    expect(entityContract('lumi', 1)).toBe('allyHero');
  });

  it('precheckCast 返回结构化失败原因', () => {
    const game = makeGame('lumi', 'emberfang');
    const hero = game.player;
    learn(hero, 1);
    const result = precheckCast(game, hero, 1, { entityId: game.enemy.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('友方英雄');
  });

  it('AI 进攻与防守施法在新校验下仍然生效', () => {
    const game = makeGame('veilora', 'lumi');
    const ai = game.enemy;
    ai.level = 6;
    ai.skillLevels = [1, 1, 1, 1];
    ai.mana = ai.maxMana;
    game.player.pos = { x: ai.pos.x - 300, y: ai.pos.y };
    tick(game, 6);
    const usedSkill = Object.values(ai.cooldowns).some((cd) => cd > 0) || game.projectiles.length > 0;
    expect(usedSkill).toBe(true);
    ai.hp = ai.maxHp * 0.2;
    ai.cooldowns = {};
    ai.mana = ai.maxMana;
    tick(game, 3);
    expect(Object.keys(ai.cooldowns).length).toBeGreaterThan(0);
  });
});

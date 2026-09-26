import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { WALLS } from '../src/engine/map';
import { addStatus, applyDamage } from '../src/engine/combat';
import { createHero } from '../src/engine/factory';
import { validateCast } from '../src/engine/targeting';
import type { Hero } from '../src/engine/types';

function makeGame(player = 'emberfang', enemy = 'veilora') {
  return new Game({ mode: 'full', playerHero: player, enemyHero: enemy });
}

function setup(player: string, enemy: string) {
  const game = makeGame(player, enemy);
  const hero = game.player;
  hero.level = 9;
  hero.skillLevels = [1, 1, 1, 1];
  hero.mana = hero.maxMana;
  game.enemy.pos = { x: hero.pos.x + 100, y: hero.pos.y };
  return { game, hero, enemy: game.enemy };
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

function firePending(game: Game, dt: number) {
  (game as unknown as { updatePending: (d: number) => void }).updatePending(dt);
}

interface Snap {
  mana: number;
  cooldowns: Record<string, number>;
  pos: { x: number; y: number };
  recall: number;
  statuses: number;
  projectiles: number;
  pending: number;
  notifications: number;
  damageDealt: number;
  damageToHeroes: number;
}

function snapshot(game: Game, hero: Hero): Snap {
  return {
    mana: hero.mana,
    cooldowns: { ...hero.cooldowns },
    pos: { ...hero.pos },
    recall: hero.recall,
    statuses: hero.statuses.length,
    projectiles: game.projectiles.length,
    pending: game.pendingEffects.length,
    notifications: game.notifications.length,
    damageDealt: hero.damageDealt ?? 0,
    damageToHeroes: hero.damageToHeroes
  };
}

function expectUnchanged(game: Game, hero: Hero, snap: Snap) {
  expect(hero.mana).toBe(snap.mana);
  expect(hero.cooldowns).toEqual(snap.cooldowns);
  expect(hero.pos).toEqual(snap.pos);
  expect(hero.recall).toBe(snap.recall);
  expect(hero.statuses.length).toBe(snap.statuses);
  expect(game.projectiles.length).toBe(snap.projectiles);
  expect(game.pendingEffects.length).toBe(snap.pending);
  expect(game.notifications.length).toBe(snap.notifications);
  expect(hero.damageDealt ?? 0).toBe(snap.damageDealt);
  expect(hero.damageToHeroes).toBe(snap.damageToHeroes);
}

function expectRejected(game: Game, hero: Hero, slot: number, input: { point?: { x: number; y: number }; entityId?: number }) {
  const snap = snapshot(game, hero);
  for (let i = 0; i < 3; i++) expect(game.castSkill(hero, slot, input)).toBe(false);
  expectUnchanged(game, hero, snap);
}

describe('entity 技能目标契约', () => {
  it('烬牙 Q 对敌方英雄造成伤害且只扣一次资源', () => {
    const { game, hero, enemy } = setup('emberfang', 'veilora');
    const mana = hero.mana;
    const hp = enemy.hp;
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(true);
    expect(enemy.hp).toBeLessThan(hp);
    expect(hero.mana).toBeLessThan(mana);
    expect(hero.cooldowns.Q).toBeGreaterThan(0);
    const manaAfter = hero.mana;
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(false);
    expect(hero.mana).toBe(manaAfter);
  });

  it('烬牙 Q 可以合法瞄准敌方小兵', () => {
    const { game, hero } = setup('emberfang', 'veilora');
    game.spawnWave(1, false);
    const minion = game.minions.find((m) => m.team === 1)!;
    minion.pos = { x: hero.pos.x + 90, y: hero.pos.y };
    const hp = minion.hp;
    expect(game.castSkill(hero, 0, { entityId: minion.id })).toBe(true);
    expect(minion.hp).toBeLessThan(hp);
  });

  it('烬牙 Q 拒绝自己、友方小兵和友方建筑', () => {
    const { game, hero } = setup('emberfang', 'veilora');
    expectRejected(game, hero, 0, { entityId: hero.id });
    game.spawnWave(0, false);
    const minion = game.minions.find((m) => m.team === 0)!;
    minion.pos = { x: hero.pos.x + 60, y: hero.pos.y };
    expectRejected(game, hero, 0, { entityId: minion.id });
    const turret = game.buildings.find((b) => b.team === 0 && b.kind === 'turret')!;
    expectRejected(game, hero, 0, { entityId: turret.id });
  });

  it('索尔瓦 E 拒绝友方目标，对敌方目标仍然生效', () => {
    const { game, hero, enemy } = setup('thorvall', 'emberfang');
    expectRejected(game, hero, 2, { entityId: hero.id });
    expect(game.castSkill(hero, 2, { entityId: enemy.id })).toBe(true);
    expect(enemy.statuses.some((s) => s.type === 'silence' || s.type === 'knockback')).toBe(true);
  });

  it('露米 Q 拒绝友方目标，对敌方目标生成追踪弹', () => {
    const { game, hero, enemy } = setup('lumi', 'emberfang');
    expectRejected(game, hero, 0, { entityId: hero.id });
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(true);
    expect(game.projectiles.length).toBe(1);
  });

  it('露米 W 治疗自身或友方英雄', () => {
    const { game, hero } = setup('lumi', 'emberfang');
    hero.hp = 200;
    expect(game.castSkill(hero, 1, { entityId: hero.id })).toBe(true);
    expect(hero.hp).toBeGreaterThan(200);
    expect(hero.statuses.some((s) => s.type === 'haste')).toBe(true);
    const ally = createHero('veilora', 0, false);
    ally.pos = { x: hero.pos.x + 80, y: hero.pos.y };
    ally.hp = 100;
    game.heroes.push(ally);
    hero.cooldowns.W = 0;
    hero.mana = hero.maxMana;
    expect(game.castSkill(hero, 1, { entityId: ally.id })).toBe(true);
    expect(ally.hp).toBeGreaterThan(100);
  });

  it('露米 W 拒绝敌方英雄与友方小兵，且不会悄悄改奶自己', () => {
    const { game, hero, enemy } = setup('lumi', 'emberfang');
    hero.hp = 200;
    expectRejected(game, hero, 1, { entityId: enemy.id });
    expect(hero.hp).toBe(200);
    game.spawnWave(0, false);
    const minion = game.minions.find((m) => m.team === 0)!;
    minion.pos = { x: hero.pos.x + 60, y: hero.pos.y };
    expectRejected(game, hero, 1, { entityId: minion.id });
    expect(hero.hp).toBe(200);
  });

  it('死亡目标、缺失 entityId、过期 entityId 都被拒绝', () => {
    const { game, hero, enemy } = setup('emberfang', 'veilora');
    enemy.alive = false;
    enemy.hp = 0;
    expectRejected(game, hero, 0, { entityId: enemy.id });
    enemy.alive = true;
    enemy.hp = enemy.maxHp;
    expectRejected(game, hero, 0, {});
    expectRejected(game, hero, 0, { entityId: 999999 });
    expectRejected(game, hero, 0, { entityId: NaN });
  });

  it('entity 目标在墙后时被拒绝', () => {
    const { game, hero, enemy } = setup('emberfang', 'veilora');
    hero.pos = { x: 430, y: 330 };
    enemy.pos = { x: 430, y: 120 };
    expectRejected(game, hero, 0, { entityId: enemy.id });
  });
});

describe('point 与 direction 输入校验', () => {
  it('NaN、Infinity、缺字段的点位被拒绝', () => {
    const { game, hero } = setup('veilora', 'emberfang');
    expectRejected(game, hero, 1, { point: { x: NaN, y: 100 } });
    expectRejected(game, hero, 1, { point: { x: Infinity, y: 100 } });
    expectRejected(game, hero, 1, { point: { x: 100, y: NaN } });
    expectRejected(game, hero, 1, { point: {} as { x: number; y: number } });
    expectRejected(game, hero, 0, {});
  });

  it('超出范围的点位被拒绝', () => {
    const { game, hero } = setup('veilora', 'emberfang');
    expectRejected(game, hero, 1, { point: { x: hero.pos.x + 2000, y: hero.pos.y } });
  });

  it('墙后点位与墙后方向都被拒绝', () => {
    const { game, hero } = setup('veilora', 'emberfang');
    hero.pos = { x: 430, y: 330 };
    expectRejected(game, hero, 1, { point: { x: 430, y: 120 } });
    const thor = setup('thorvall', 'emberfang');
    thor.hero.pos = { x: 430, y: 330 };
    expectRejected(thor.game, thor.hero, 0, { point: { x: 430, y: 120 } });
    expect(WALLS.length).toBeGreaterThan(0);
  });

  it('位移类技能保留穿墙特性', () => {
    const { game, hero } = setup('lumi', 'emberfang');
    hero.pos = { x: 430, y: 330 };
    expect(game.castSkill(hero, 2, { point: { x: 430, y: 120 } })).toBe(true);
    expect(hero.pos.y).toBeLessThan(330);
  });
});

describe('状态与资源预检', () => {
  it('沉默与眩晕中无法施法且零副作用', () => {
    const { game, hero, enemy } = setup('emberfang', 'veilora');
    addStatus(hero, { type: 'silence', duration: 2, value: 1 });
    expectRejected(game, hero, 0, { entityId: enemy.id });
    addStatus(hero, { type: 'stun', duration: 2, value: 1 });
    expectRejected(game, hero, 0, { entityId: enemy.id });
  });

  it('法力不足被拒绝且不打断回城', () => {
    const { game, hero, enemy } = setup('emberfang', 'veilora');
    hero.mana = 5;
    hero.recall = 3;
    expectRejected(game, hero, 0, { entityId: enemy.id });
    expect(hero.recall).toBe(3);
  });

  it('预检失败不会产生通知与伤害统计', () => {
    const { game, hero } = setup('lumi', 'emberfang');
    const check = validateCast(game, hero, 1, { entityId: game.enemy.id });
    expect(check.ok).toBe(false);
    expect(check.reason).toBeTruthy();
    expect(game.notifications.length).toBe(0);
    expect(hero.damageToHeroes).toBe(0);
  });
});

describe('合法玩法回归', () => {
  it('无目标技能与战术技能 D/F 正常释放', () => {
    const { game, hero } = setup('emberfang', 'veilora');
    expect(game.castSkill(hero, 1, {})).toBe(true);
    expect(hero.statuses.some((s) => s.type === 'shield')).toBe(true);
    const start = { ...hero.pos };
    expect(game.castSkill(hero, 4, { point: { x: start.x + 200, y: start.y } })).toBe(true);
    expect(hero.pos.x).toBeGreaterThan(start.x);
    expect(hero.cooldowns.D).toBeGreaterThan(0);
    hero.hp = 100;
    expect(game.castSkill(hero, 5, {})).toBe(true);
    expect(hero.hp).toBeGreaterThan(100);
  });

  it('露米 E 点位位移保留', () => {
    const { game, hero } = setup('lumi', 'emberfang');
    const start = { ...hero.pos };
    expect(game.castSkill(hero, 2, { point: { x: start.x + 200, y: start.y } })).toBe(true);
    expect(hero.pos.x).toBeGreaterThan(start.x + 100);
  });

  it('延迟伤害在目标死亡后安全结束', () => {
    const { game, hero, enemy } = setup('thorvall', 'veilora');
    expect(game.castSkill(hero, 3, { point: { ...enemy.pos } })).toBe(true);
    expect(game.pendingEffects.length).toBeGreaterThan(0);
    applyDamage(game, enemy, { amount: 99999, type: 'physical', source: hero });
    const taken = enemy.damageTaken;
    const toHeroes = hero.damageToHeroes;
    firePending(game, 5);
    expect(enemy.damageTaken).toBe(taken);
    expect(hero.damageToHeroes).toBe(toHeroes);
  });

  it('延迟治疗在目标死亡后安全结束', () => {
    const { game, hero } = setup('thorvall', 'veilora');
    const ally = createHero('lumi', 0, false);
    ally.pos = { x: hero.pos.x + 60, y: hero.pos.y };
    game.heroes.push(ally);
    expect(game.castSkill(hero, 3, { point: { ...ally.pos } })).toBe(true);
    ally.alive = false;
    ally.hp = 0;
    firePending(game, 5);
    expect(ally.hp).toBe(0);
  });

  it('追踪弹在目标死亡后不再命中', () => {
    const { game, hero, enemy } = setup('lumi', 'emberfang');
    expect(game.castSkill(hero, 0, { entityId: enemy.id })).toBe(true);
    enemy.alive = false;
    enemy.hp = 0;
    enemy.deadTimer = 30;
    const taken = enemy.damageTaken;
    tick(game, 2);
    expect(enemy.damageTaken).toBe(taken);
    expect(game.projectiles.length).toBe(0);
  });

  it('AI 进攻与防守施法回归', () => {
    const offensive = makeGame('emberfang', 'veilora');
    const ai = offensive.enemy;
    ai.level = 9;
    ai.skillLevels = [1, 1, 1, 1];
    ai.mana = ai.maxMana;
    ai.pos = { x: 840, y: 520 };
    offensive.player.pos = { x: 1040, y: 520 };
    const hp = offensive.player.hp;
    tick(offensive, 0.2);
    expect(Object.values(ai.cooldowns).some((cd) => cd > 0)).toBe(true);
    expect(offensive.player.hp).toBeLessThanOrEqual(hp);

    const defensive = makeGame('emberfang', 'lumi');
    const healer = defensive.enemy;
    healer.level = 9;
    healer.skillLevels = [1, 1, 1, 1];
    healer.mana = healer.maxMana;
    healer.pos = { x: 840, y: 520 };
    healer.hp = healer.maxHp * 0.2;
    defensive.player.pos = { x: 980, y: 520 };
    tick(defensive, 0.2);
    expect(healer.cooldowns.W).toBeGreaterThan(0);
  });
});

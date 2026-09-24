import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { makeStats } from '../src/engine/factory';
import { applyDamage } from '../src/engine/combat';
import { BLUE_BASE, dist } from '../src/engine/map';
import {
  DEFAULT_TRAINING_CONFIG, TRAINING_LIMITS, normalizeTrainingConfig, trainingCommandsEnabled
} from '../src/engine/training';
import type { TrainingConfig } from '../src/engine/training';

function makePractice(training?: Partial<TrainingConfig>, player = 'veilora') {
  return new Game({ mode: 'practice', playerHero: player, training });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

describe('训练配置归一化', () => {
  it('缺省输入返回安全默认值', () => {
    expect(normalizeTrainingConfig()).toEqual(DEFAULT_TRAINING_CONFIG);
    expect(normalizeTrainingConfig(null)).toEqual(DEFAULT_TRAINING_CONFIG);
    expect(normalizeTrainingConfig({})).toEqual(DEFAULT_TRAINING_CONFIG);
  });

  it('边界值保持不变', () => {
    const config = normalizeTrainingConfig({ startLevel: 1, startGold: 0 });
    expect(config.startLevel).toBe(1);
    expect(config.startGold).toBe(0);
    const upper = normalizeTrainingConfig({ startLevel: 8, startGold: 6000 });
    expect(upper.startLevel).toBe(8);
    expect(upper.startGold).toBe(6000);
  });

  it('非法、缺失和超范围的值被归一化', () => {
    const config = normalizeTrainingConfig({
      startLevel: 99,
      startGold: -500,
      fullMana: 'yes' as unknown as boolean,
      enemyEnabled: undefined,
      autoWaves: 0 as unknown as boolean
    });
    expect(config.startLevel).toBe(TRAINING_LIMITS.maxLevel);
    expect(config.startGold).toBe(TRAINING_LIMITS.minGold);
    expect(config.fullMana).toBe(DEFAULT_TRAINING_CONFIG.fullMana);
    expect(config.enemyEnabled).toBe(DEFAULT_TRAINING_CONFIG.enemyEnabled);
    expect(config.autoWaves).toBe(DEFAULT_TRAINING_CONFIG.autoWaves);
    const nan = normalizeTrainingConfig({ startLevel: NaN, startGold: Number.POSITIVE_INFINITY });
    expect(nan.startLevel).toBe(DEFAULT_TRAINING_CONFIG.startLevel);
    expect(nan.startGold).toBe(DEFAULT_TRAINING_CONFIG.startGold);
    expect(normalizeTrainingConfig({ startGold: 99999 }).startGold).toBe(TRAINING_LIMITS.maxGold);
  });

  it('完整对战忽略练习参数', () => {
    const game = new Game({
      mode: 'full',
      playerHero: 'emberfang',
      training: { startLevel: 8, startGold: 6000, fullMana: false, enemyEnabled: false, autoWaves: false }
    });
    expect(game.training).toBeUndefined();
    expect(game.player.level).toBe(1);
    expect(game.player.gold).toBe(500);
    expect(game.heroes.length).toBe(2);
    expect(game.trainingTargets.length).toBe(0);
    expect(game.resetTrainingScenario()).toBe(false);
    expect(game.refreshTrainingTargets()).toBe(false);
  });
});

describe('训练初始化', () => {
  it('按配置初始化等级和金币', () => {
    const game = makePractice({ startLevel: 5, startGold: 3000 });
    expect(game.player.level).toBe(5);
    expect(game.player.gold).toBe(3000);
    expect(game.player.maxHp).toBe(makeStats('veilora', 5, []).maxHp);
    expect(game.player.hp).toBe(game.player.maxHp);
  });

  it('满法力开关控制初始法力', () => {
    const full = makePractice({ fullMana: true });
    expect(full.player.mana).toBe(full.player.maxMana);
    const half = makePractice({ fullMana: false });
    expect(half.player.mana).toBeLessThan(half.player.maxMana);
  });

  it('关闭电脑对手时不生成敌方英雄，目标仍可被攻击和施法命中', () => {
    const game = makePractice({ enemyEnabled: false }, 'emberfang');
    expect(game.heroes.length).toBe(1);
    expect(game.heroes.some((h) => h.ai)).toBe(false);
    expect(game.trainingTargets.length).toBe(3);
    const target = game.trainingTargets[0];
    game.player.pos = { x: target.pos.x - 60, y: target.pos.y };
    expect(game.basicAttack(game.player, target)).toBe(true);
    expect(target.hp).toBeLessThan(target.maxHp);
    game.player.skillLevels[0] = 1;
    game.player.mana = game.player.maxMana;
    const hp = target.hp;
    expect(game.castSkill(game.player, 0, { entityId: target.id })).toBe(true);
    expect(target.hp).toBeLessThan(hp);
  });
});

describe('训练面板命令', () => {
  it('重置场景清理小兵、弹道、守卫卫、浮字、通知、延迟效果、封锁和事件状态', () => {
    const game = makePractice();
    game.spawnWaveNow();
    game.projectiles.push({
      id: 9991, team: 0, pos: { x: 0, y: 0 }, speed: 1,
      info: { amount: 1, type: 'physical' }, kind: 'attack', sourceId: 1
    });
    game.wards.push({ id: 9992, team: 0, pos: { x: 1, y: 1 }, ttl: 90 });
    game.floatText('测试', { x: 0, y: 0 });
    game.notify('测试通知');
    game.delayedDamage(game.player, game.enemy, 10, 'energy', 5);
    game.blockade = { x: 790, y: 430, w: 100, h: 180 };
    const energy = game.events.find((e) => e.id === 'energy')!;
    energy.startsIn = 0.01;
    tick(game, 0.2);
    expect(energy.active).toBe(true);
    const oldTargetIds = game.trainingTargets.map((t) => t.id);
    expect(game.resetTrainingScenario()).toBe(true);
    expect(game.minions.length).toBe(0);
    expect(game.projectiles.length).toBe(0);
    expect(game.wards.length).toBe(0);
    expect(game.texts.length).toBe(0);
    expect(game.notifications.length).toBe(0);
    expect(game.pendingEffects.length).toBe(0);
    expect(game.blockade).toBeNull();
    expect(game.events.every((e) => !e.active)).toBe(true);
    expect(game.energyNode.active).toBe(false);
    for (const id of oldTargetIds) expect(game.entityById(id)).toBeUndefined();
  });

  it('重置清零技能冷却并恢复英雄状态、装备和训练金币/等级', () => {
    const game = makePractice({ startLevel: 3, startGold: 1200 });
    const player = game.player;
    player.skillLevels[0] = 1;
    expect(game.castSkill(player, 0, { point: { x: player.pos.x + 100, y: player.pos.y } })).toBe(true);
    expect(player.cooldowns.Q).toBeGreaterThan(0);
    game.buyItem(player, 'blade');
    applyDamage(game, player, { amount: 200, type: 'physical' });
    player.pos = { x: 900, y: 520 };
    player.gold = 37;
    player.level = 7;
    game.resetTrainingScenario();
    const fresh = game.player;
    expect(fresh.cooldowns.Q).toBe(0);
    expect(fresh.items.length).toBe(0);
    expect(fresh.hp).toBe(fresh.maxHp);
    expect(fresh.mana).toBe(fresh.maxMana);
    expect(fresh.gold).toBe(1200);
    expect(fresh.level).toBe(3);
    expect(dist(fresh.pos, BLUE_BASE)).toBeLessThan(5);
    expect(fresh.statuses.length).toBe(0);
    expect(fresh.recall).toBe(0);
  });

  it('重置后可以再次释放技能', () => {
    const game = makePractice();
    const learn = () => { game.player.skillLevels[0] = 1; game.player.mana = game.player.maxMana; };
    learn();
    const point = () => ({ x: game.player.pos.x + 100, y: game.player.pos.y });
    expect(game.castSkill(game.player, 0, { point: point() })).toBe(true);
    expect(game.castSkill(game.player, 0, { point: point() })).toBe(false);
    game.resetTrainingScenario();
    learn();
    expect(game.castSkill(game.player, 0, { point: point() })).toBe(true);
  });

  it('恢复玩家状态只影响玩家，不影响敌方核心和比赛结算', () => {
    const game = makePractice();
    const player = game.player;
    applyDamage(game, player, { amount: 300, type: 'physical' });
    player.cooldowns.Q = 5;
    player.pos = { x: 800, y: 500 };
    const redCore = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    redCore.hp = 500;
    const enemyHp = game.enemy.hp;
    expect(game.restorePlayerState()).toBe(true);
    expect(player.hp).toBe(player.maxHp);
    expect(player.mana).toBe(player.maxMana);
    expect(player.cooldowns.Q).toBe(0);
    expect(dist(player.pos, BLUE_BASE)).toBeLessThan(5);
    expect(redCore.hp).toBe(500);
    expect(game.enemy.hp).toBe(enemyHp);
    expect(game.result).toBe('running');
  });

  it('清除单位只移除小兵、弹道和守卫', () => {
    const game = makePractice();
    game.spawnWaveNow();
    game.wards.push({ id: 9993, team: 0, pos: { x: 1, y: 1 }, ttl: 90 });
    expect(game.minions.length).toBeGreaterThan(0);
    expect(game.clearUnits()).toBe(true);
    expect(game.minions.length).toBe(0);
    expect(game.wards.length).toBe(0);
    expect(game.heroes.length).toBe(2);
    expect(game.buildings.length).toBeGreaterThan(0);
    expect(game.trainingTargets.length).toBe(3);
  });

  it('立即生成一波兵，关闭自动兵线后不自动出兵', () => {
    const game = makePractice();
    expect(game.spawnWaveNow()).toBe(true);
    expect(game.minions.length).toBeGreaterThanOrEqual(8);
    const quiet = makePractice({ autoWaves: false });
    tick(quiet, 30);
    expect(quiet.minions.length).toBe(0);
  });

  it('测试目标最多保留 3 个，受伤后可手动刷新', () => {
    const game = makePractice();
    for (let i = 0; i < 5; i++) game.refreshTrainingTargets();
    expect(game.trainingTargets.length).toBe(TRAINING_LIMITS.maxTargets);
    const target = game.trainingTargets[0];
    applyDamage(game, target, { amount: 400, type: 'physical', source: game.player });
    expect(target.hp).toBeLessThan(target.maxHp);
    game.refreshTrainingTargets();
    expect(game.trainingTargets.length).toBe(3);
    expect(target.hp).toBe(target.maxHp);
  });

  it('击破全部训练目标不会触发胜负，目标也不会加入兵线', () => {
    const game = makePractice();
    for (const target of game.trainingTargets) {
      applyDamage(game, target, { amount: 99999, type: 'energy', source: game.player });
    }
    game.update(0.05);
    expect(game.result).toBe('running');
    expect(game.minions.every((m) => m.kind === 'minion')).toBe(true);
    expect(game.trainingTargets.every((t) => t.kind === 'target')).toBe(true);
  });

  it('暂停或结算时训练命令不可用', () => {
    const game = makePractice();
    expect(game.canUseTrainingControls()).toBe(true);
    game.paused = true;
    expect(game.canUseTrainingControls()).toBe(false);
    game.paused = false;
    const redCore = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    applyDamage(game, redCore, { amount: redCore.hp, type: 'energy', source: game.player });
    game.update(0.05);
    expect(game.result).toBe('victory');
    expect(game.canUseTrainingControls()).toBe(false);
    expect(trainingCommandsEnabled({ paused: false, result: 'running' })).toBe(true);
    expect(trainingCommandsEnabled({ paused: true, result: 'running' })).toBe(false);
    expect(trainingCommandsEnabled({ paused: false, result: 'defeat' })).toBe(false);
  });
});

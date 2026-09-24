import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { makeStats } from '../src/engine/factory';
import { applyDamage } from '../src/engine/combat';
import { RED_BASE, dist } from '../src/engine/map';
import {
  DEFAULT_TRAINING_CONFIG, TRAINING_LIMITS, normalizeTrainingConfig, type TrainingConfig
} from '../src/engine/training';

function makePractice(training?: Partial<TrainingConfig>, player = 'veilora', enemy = 'emberfang') {
  return new Game({ mode: 'practice', playerHero: player, enemyHero: enemy, training });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

describe('训练配置归一化', () => {
  it('缺省配置使用安全默认值', () => {
    expect(normalizeTrainingConfig(undefined)).toEqual(DEFAULT_TRAINING_CONFIG);
    expect(normalizeTrainingConfig(null)).toEqual(DEFAULT_TRAINING_CONFIG);
    expect(normalizeTrainingConfig({})).toEqual(DEFAULT_TRAINING_CONFIG);
  });

  it('超范围数值被钳制到合法区间', () => {
    const config = normalizeTrainingConfig({ startLevel: 0, startGold: -100 });
    expect(config.startLevel).toBe(1);
    expect(config.startGold).toBe(0);
    const high = normalizeTrainingConfig({ startLevel: 99, startGold: 99999 });
    expect(high.startLevel).toBe(8);
    expect(high.startGold).toBe(6000);
  });

  it('非法类型和小数归一化为合法值', () => {
    const config = normalizeTrainingConfig({
      startLevel: Number.NaN,
      startGold: 'abc' as unknown as number,
      fullMana: 'yes' as unknown as boolean,
      enableAI: 0 as unknown as boolean
    });
    expect(config).toEqual(DEFAULT_TRAINING_CONFIG);
    expect(normalizeTrainingConfig({ startLevel: 3.7, startGold: 1234.6 }).startLevel).toBe(4);
    expect(normalizeTrainingConfig({ startGold: 1234.6 }).startGold).toBe(1235);
  });

  it('完整对战模式忽略练习参数', () => {
    const game = new Game({
      mode: 'full',
      playerHero: 'emberfang',
      enemyHero: 'veilora',
      training: { startLevel: 8, startGold: 6000, fullMana: false, enableAI: false, autoWaves: false }
    });
    expect(game.training).toBeUndefined();
    expect(game.player.level).toBe(1);
    expect(game.player.gold).toBe(500);
    expect(game.player.mana).toBe(game.player.maxMana);
    expect(game.enemy.ai).toBeDefined();
    tick(game, 26);
    expect(game.minions.length).toBeGreaterThan(0);
  });
});

describe('训练初始化', () => {
  it('按配置初始化等级和金币', () => {
    const game = makePractice({ startLevel: 5, startGold: 2000 });
    expect(game.player.level).toBe(5);
    expect(game.player.gold).toBe(2000);
    expect(game.player.maxHp).toBe(makeStats(game.player.heroId, 5, []).maxHp);
    expect(game.player.hp).toBe(game.player.maxHp);
  });

  it('满法力开关控制初始法力', () => {
    expect(makePractice({ fullMana: true }).player.mana).toBe(makePractice({ fullMana: true }).player.maxMana);
    expect(makePractice({ fullMana: false }).player.mana).toBe(0);
  });

  it('关闭电脑对手后电脑不行动', () => {
    const game = makePractice({ enableAI: false, autoWaves: false });
    expect(game.enemy.ai).toBeUndefined();
    tick(game, 10);
    expect(dist(game.enemy.pos, RED_BASE)).toBeLessThan(5);
    expect(game.enemy.items.length).toBe(0);
  });

  it('关闭自动生成兵线后不出兵', () => {
    const game = makePractice({ autoWaves: false });
    tick(game, 30);
    expect(game.minions.length).toBe(0);
    const normal = makePractice({ autoWaves: true });
    tick(normal, 5);
    expect(normal.minions.length).toBeGreaterThan(0);
  });
});

describe('训练控制台命令', () => {
  it('重置场景清理所有临时状态', () => {
    const game = makePractice({ startLevel: 3, startGold: 1000 });
    game.spawnWaveNow();
    game.wards.push({ id: 999, team: 0, pos: { x: 100, y: 100 }, ttl: 90 });
    game.pendingEffects.push({ t: 1, action: () => undefined });
    game.blockade = { x: 790, y: 430, w: 100, h: 180 };
    game.weather = { kind: 'storm', ttl: 10 };
    game.energyNode.active = true;
    game.baseAlarm = [5, 5];
    game.notify('旧通知');
    game.floatText('旧浮字', { x: 0, y: 0 });
    game.events.find((e) => e.id === 'energy')!.active = true;
    expect(game.resetTrainingScene()).toBe(true);
    expect(game.minions.length).toBe(0);
    expect(game.projectiles.length).toBe(0);
    expect(game.wards.length).toBe(0);
    expect(game.pendingEffects.length).toBe(0);
    expect(game.blockade).toBeNull();
    expect(game.weather.kind).toBe('none');
    expect(game.energyNode.active).toBe(false);
    expect(game.baseAlarm).toEqual([0, 0]);
    expect(game.events.every((e) => !e.active && e.startsIn > 0)).toBe(true);
    expect(game.texts.length).toBe(0);
    expect(game.notifications.map((n) => n.text)).not.toContain('旧通知');
  });

  it('重置恢复等级金币装备属性和技能冷却', () => {
    const game = makePractice({ startLevel: 4, startGold: 1500 }, 'emberfang');
    const player = game.player;
    player.gold = 5000;
    expect(game.buyItem(player, 'blade')).toBe(true);
    player.skillLevels[2] = 1;
    game.castSkill(player, 2, {});
    expect(player.cooldowns.E).toBeGreaterThan(0);
    player.level = 7;
    game.resetTrainingScene();
    expect(player.level).toBe(4);
    expect(player.gold).toBe(1500);
    expect(player.items).toEqual([]);
    expect(player.stats.attack).toBe(makeStats(player.heroId, 4, []).attack);
    expect(Object.values(player.cooldowns).every((cd) => cd === 0)).toBe(true);
    expect(player.hp).toBe(player.maxHp);
  });

  it('重置后可再次学习并释放技能', () => {
    const game = makePractice({ startLevel: 8 }, 'veilora');
    const player = game.player;
    game.learnSkill(player, 0);
    expect(game.castSkill(player, 0, { point: { x: player.pos.x + 100, y: player.pos.y } })).toBe(true);
    expect(game.canCast(player, 0).ok).toBe(false);
    game.resetTrainingScene();
    expect(game.learnSkill(player, 0)).toBe(true);
    expect(game.castSkill(player, 0, { point: { x: player.pos.x + 100, y: player.pos.y } })).toBe(true);
  });

  it('重置不留下旧目标 ID 和旧的延迟效果', () => {
    const game = makePractice({});
    game.spawnOrRefreshTrainingTargets();
    const oldTargetId = game.trainingTargets()[0].id;
    game.player.attackTargetId = oldTargetId;
    game.pendingEffects.push({ t: 0.5, action: () => undefined });
    game.resetTrainingScene();
    expect(game.player.attackTargetId).toBeUndefined();
    expect(game.pendingEffects.length).toBe(0);
    expect(game.entityById(oldTargetId)).toBeUndefined();
  });

  it('恢复玩家状态只影响玩家', () => {
    const game = makePractice({});
    const player = game.player;
    const enemy = game.enemy;
    const enemyCore = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    player.hp = 100;
    player.mana = 0;
    player.cooldowns.Q = 9;
    player.recall = 3;
    player.statuses.push({ type: 'stun', duration: 2, value: 1 });
    enemy.hp = 50;
    enemyCore.hp = 1000;
    expect(game.restorePlayerState()).toBe(true);
    expect(player.hp).toBe(player.maxHp);
    expect(player.mana).toBe(player.maxMana);
    expect(player.cooldowns.Q).toBe(0);
    expect(player.recall).toBe(0);
    expect(player.statuses.length).toBe(0);
    expect(enemy.hp).toBe(50);
    expect(enemyCore.hp).toBe(1000);
    expect(game.result).toBe('running');
  });

  it('恢复玩家状态会复活已死亡的玩家', () => {
    const game = makePractice({});
    applyDamage(game, game.player, { amount: 99999, type: 'energy', source: game.enemy });
    expect(game.player.alive).toBe(false);
    game.restorePlayerState();
    expect(game.player.alive).toBe(true);
    expect(game.player.deadTimer).toBe(0);
  });

  it('清除单位只移除小兵', () => {
    const game = makePractice({});
    game.spawnWaveNow();
    game.spawnOrRefreshTrainingTargets();
    expect(game.minions.length).toBeGreaterThan(0);
    expect(game.clearUnits()).toBe(true);
    expect(game.minions.length).toBe(0);
    expect(game.heroes.length).toBe(2);
    expect(game.buildings.length).toBeGreaterThan(0);
  });

  it('立即生成一波兵在关闭自动出兵时仍可用', () => {
    const game = makePractice({ autoWaves: false });
    expect(game.spawnWaveNow()).toBe(true);
    expect(game.waveNumber).toBe(1);
    expect(game.minions.length).toBeGreaterThanOrEqual(8);
    expect(game.minions.some((m) => m.team === 0)).toBe(true);
    expect(game.minions.some((m) => m.team === 1)).toBe(true);
  });
});

describe('训练目标', () => {
  it('最多保留 3 个可攻击目标', () => {
    const game = makePractice({});
    for (let i = 0; i < 5; i++) game.spawnOrRefreshTrainingTargets();
    expect(game.trainingTargets().length).toBe(TRAINING_LIMITS.maxTargets);
  });

  it('目标静止且受伤后可手动刷新', () => {
    const game = makePractice({ autoWaves: false });
    game.spawnOrRefreshTrainingTargets();
    const target = game.trainingTargets()[0];
    const pos = { ...target.pos };
    tick(game, 3);
    expect(dist(target.pos, pos)).toBeLessThan(1);
    target.hp = 100;
    game.spawnOrRefreshTrainingTargets();
    expect(target.hp).toBe(target.maxHp);
    expect(game.trainingTargets().length).toBe(2);
  });

  it('目标被消灭不触发胜负也不计分', () => {
    const game = makePractice({});
    game.spawnOrRefreshTrainingTargets();
    const target = game.trainingTargets()[0];
    applyDamage(game, target, { amount: 99999, type: 'physical', source: game.player });
    game.update(0.05);
    expect(game.result).toBe('running');
    expect(game.score).toEqual([0, 0]);
    expect(game.trainingTargets().length).toBe(0);
  });

  it('关闭电脑对手时目标仍可被选中、施法和命中', () => {
    const game = makePractice({ enableAI: false, autoWaves: false }, 'emberfang');
    game.spawnOrRefreshTrainingTargets();
    const target = game.trainingTargets()[0];
    game.commandAttack(game.player, target);
    expect(game.player.attackTargetId).toBe(target.id);
    game.player.skillLevels[0] = 1;
    game.player.pos = { x: target.pos.x - 60, y: target.pos.y };
    expect(game.castSkill(game.player, 0, { entityId: target.id })).toBe(true);
    expect(target.hp).toBeLessThan(target.maxHp);
  });
});

describe('状态边界保护', () => {
  it('暂停时所有训练命令被拒绝', () => {
    const game = makePractice({});
    game.paused = true;
    expect(game.canTrainModify()).toBe(false);
    expect(game.resetTrainingScene()).toBe(false);
    expect(game.restorePlayerState()).toBe(false);
    expect(game.clearUnits()).toBe(false);
    expect(game.spawnWaveNow()).toBe(false);
    expect(game.spawnOrRefreshTrainingTargets()).toBe(false);
    expect(game.minions.length).toBe(0);
  });

  it('比赛结算后训练命令被拒绝', () => {
    const game = makePractice({});
    game.result = 'victory';
    expect(game.canTrainModify()).toBe(false);
    expect(game.resetTrainingScene()).toBe(false);
    expect(game.spawnWaveNow()).toBe(false);
    expect(game.restorePlayerState()).toBe(false);
  });

  it('完整对战模式不提供训练命令', () => {
    const game = new Game({ mode: 'full', playerHero: 'emberfang', enemyHero: 'veilora' });
    expect(game.canTrainModify()).toBe(false);
    expect(game.resetTrainingScene()).toBe(false);
    expect(game.spawnOrRefreshTrainingTargets()).toBe(false);
    expect(game.trainingTargets().length).toBe(0);
  });
});

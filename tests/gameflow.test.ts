import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';
import { loadSettings, saveSettings, saveRecord, loadRecords, clearRecords } from '../src/engine/storage';

describe('胜负、超时与完整流程', () => {
  it('比赛超时按基地核心生命判定胜负', () => {
    const match = createMatch('lan', 'vera', 20);
    match.cores.red.stats.hp = 2000;
    match.cores.blue.stats.hp = 2500;
    step(match, 21);
    expect(match.result).toBe('timeout-victory');
  });

  it('比赛超时核心生命较低则判负', () => {
    const match = createMatch('lan', 'vera', 20);
    match.cores.blue.stats.hp = 1000;
    match.cores.red.stats.hp = 3000;
    step(match, 21);
    expect(match.result).toBe('timeout-defeat');
  });

  it('暂停时游戏状态不推进', () => {
    const match = createMatch();
    match.paused = true;
    step(match, 10);
    expect(match.time).toBe(0);
    expect(match.units.filter((u) => u.kind === 'minion')).toHaveLength(0);
  });

  it('完整对战中兵线交火、塔可被消耗，模拟推进直到摧毁核心', () => {
    const match = createMatch('gurr', 'qiqi', 900);
    // 玩家跟随推进并持续攻击红方建筑
    step(match, 30);
    expect(match.units.filter((u) => u.kind === 'minion').length).toBeGreaterThan(0);
    for (const tower of [...match.towers.red]) {
      match.player.pos = { x: tower.pos.x - 120, y: 600 };
      tower.stats.hp = 1;
      match.commandAttack(match.player, tower);
      step(match, 1);
    }
    expect(match.towers.red).toHaveLength(0);
    match.cores.red.stats.hp = 1;
    match.player.pos = { x: match.cores.red.pos.x - 80, y: 600 };
    match.commandAttack(match.player, match.cores.red);
    step(match, 1);
    expect(match.result).toBe('victory');
  });
});

describe('localStorage 设置与记录', () => {
  it('设置可以保存与读取', () => {
    const s = loadSettings();
    s.cameraZoom = 1.5;
    saveSettings(s);
    expect(loadSettings().cameraZoom).toBe(1.5);
  });

  it('对战记录可以保存与读取、清空', () => {
    clearRecords();
    saveRecord({
      result: 'victory', duration: 600, heroId: 'lan', aiHeroId: 'vera',
      kills: 5, deaths: 2, cs: 120, gold: 9000, damageDealt: 25000, practice: false
    });
    expect(loadRecords()).toHaveLength(1);
    clearRecords();
    expect(loadRecords()).toHaveLength(0);
  });
});

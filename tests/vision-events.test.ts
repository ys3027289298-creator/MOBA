import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';
import { BUSHES } from '../src/engine/map';

function distLike(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('草丛与视野', () => {
  it('草丛外的敌人看不到草丛中的英雄，贴脸或同草丛可见', () => {
    const match = createMatch('vera', 'lan');
    const bush = BUSHES[2];
    match.ai.pos = { x: bush.x + 40, y: bush.y + 40 };
    match.player.pos = { x: bush.x - 300, y: bush.y + 40 };
    expect(match.canSee(match.player, match.ai)).toBe(false);
    match.player.pos = { x: bush.x + 30, y: bush.y + 40 };
    expect(match.canSee(match.player, match.ai)).toBe(true);
  });

  it('萤灯可以侦测草丛内敌人', () => {
    const match = createMatch();
    const bush = BUSHES[2];
    match.ai.pos = { x: bush.x + 40, y: bush.y + 40 };
    match.player.pos = { x: bush.x - 200, y: bush.y + 40 };
    // 给玩家一个萤灯并在草丛中部署
    match.player.items = ['ward'];
    expect(match.useItem(match.player, 0, { x: bush.x + 40, y: bush.y + 40 })).toBe(true);
    expect(match.canSee(match.player, match.ai)).toBe(true);
  });

  it('F 扫描短时间内照出附近草丛敌人', () => {
    const match = createMatch();
    const bush = BUSHES[2];
    match.ai.pos = { x: bush.x + bush.w / 2, y: bush.y + bush.h / 2 };
    match.player.pos = { x: bush.x - 60, y: bush.y + bush.h / 2 };
    expect(distLike(match.player.pos, match.ai.pos)).toBeGreaterThan(120);
    expect(match.canSee(match.player, match.ai)).toBe(false);
    match.castTactical(match.player, 'scan', match.player.pos);
    expect(match.canSee(match.player, match.ai)).toBe(true);
  });
});

describe('动态事件', () => {
  it('比赛过程中会触发至少一种真实改变战场状态的事件', () => {
    const match = createMatch();
    step(match, 50);
    expect(match.events.length).toBeGreaterThan(0);
  });

  it('天气事件降低视野与移速', () => {
    const match = createMatch();
    step(match, 70);
    // 强制触发天气
    match.events.push({ type: 'weather', name: 'test', remaining: 10, duration: 10 });
    (match as unknown as { weatherMoveFactor: number }).weatherMoveFactor = 0.8;
    (match as unknown as { weatherVisionFactor: number }).weatherVisionFactor = 0.72;
    const start = { ...match.player.pos };
    match.commandMove(match.player, { x: start.x + 200, y: start.y });
    step(match, 0.5);
    expect(match.player.pos.x - start.x).toBeGreaterThan(0);
  });

  it('中央能量点被占领后提供增益并在 60 秒后刷新', () => {
    const match = createMatch();
    // 避免双方小兵/英雄提前触碰：把双方英雄移到角落
    match.player.pos = { x: 170, y: 600 };
    match.ai.pos = { x: 3030, y: 600 };
    step(match, 0.1);
    expect(match.energyNode.alive).toBe(true);
    match.player.pos = { x: 1600, y: 600 };
    step(match, 0.2);
    expect(match.energyNode.alive).toBe(false);
    expect(match.energyNode.buffTeam).toBe('blue');
    step(match, 61);
    expect(match.energyNode.alive).toBe(true);
  });
});

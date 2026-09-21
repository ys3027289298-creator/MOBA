import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';
import { getItem } from '../src/engine/items';

describe('金币、补刀、装备购买与属性', () => {
  it('金币不足不能购买；购买后扣除金币并改变属性', () => {
    const match = createMatch();
    match.player.gold = 100;
    expect(match.buy(match.player, 'boots')).toBe(false);
    match.player.gold = 600;
    const speedBefore = match.player.stats.moveSpeed;
    expect(match.buy(match.player, 'boots')).toBe(true);
    expect(match.player.items).toContain('boots');
    expect(match.player.gold).toBe(150);
    expect(match.player.stats.moveSpeed).toBe(speedBefore + 45);
  });

  it('装备栏最多 6 件常规装备', () => {
    const match = createMatch();
    match.player.gold = 100000;
    for (const id of ['boots', 'shard', 'plate', 'lens', 'pendant', 'cannon']) {
      expect(match.buy(match.player, id)).toBe(true);
    }
    expect(match.buy(match.player, 'aegis')).toBe(false);
  });

  it('高级装备由低级装备合成，仅支付差价', () => {
    const match = createMatch();
    match.player.gold = 1000;
    match.buy(match.player, 'shard');
    const goldAfterShard = match.player.gold!;
    match.player.gold = goldAfterShard + 900;
    expect(match.buy(match.player, 'edge')).toBe(true);
    expect(match.player.items).toContain('edge');
    expect(match.player.items).not.toContain('shard');
    // 差价 900 - 350 = 550
    expect(match.player.gold).toBe(goldAfterShard + 900 - (900 - 350));
  });

  it('只能在己方基地附近购买', () => {
    const match = createMatch();
    match.player.gold = 5000;
    match.player.pos = { x: 1600, y: 600 };
    expect(match.buy(match.player, 'boots')).toBe(false);
  });

  it('修复药剂主动使用立即回血并进入冷却', () => {
    const match = createMatch();
    match.player.gold = 200;
    match.buy(match.player, 'potion');
    match.player.stats.hp = 50;
    expect(match.useItem(match.player, 0)).toBe(true);
    expect(match.player.stats.hp).toBe(250);
    expect(match.useItem(match.player, 0)).toBe(false);
  });

  it('电脑英雄会在回城后自动购买装备', () => {
    const match = createMatch();
    match.ai.gold = 5000;
    match.ai.pos = { x: 3030, y: 600 };
    // 模拟 AI 更新逻辑若干次
    match.ai.aiTimer = 0;
    for (let i = 0; i < 40; i++) {
      (match as unknown as { updateAI: (dt: number) => void }).updateAI(2.1);
    }
    expect((match.ai.items ?? []).length).toBeGreaterThan(0);
  });

  it('装备属性数值与描述一致', () => {
    expect(getItem('boots').stats.moveSpeed).toBe(45);
    expect(getItem('nova-core').stats.power).toBe(110);
  });
});

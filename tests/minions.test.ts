import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';

describe('小兵生成、移动、攻击与死亡', () => {
  it('定时生成双方小兵，包含三种类型且第三波出现重型小兵', () => {
    const match = createMatch();
    step(match, 3);
    const minions = match.units.filter((u) => u.kind === 'minion');
    expect(minions.length).toBe(10);
    expect(minions.some((m) => m.minionType === 'melee')).toBe(true);
    expect(minions.some((m) => m.minionType === 'ranged')).toBe(true);
    step(match, 46);
    expect(match.units.filter((u) => u.kind === 'minion' && u.minionType === 'siege').length).toBeGreaterThan(0);
  });

  it('小兵沿主战线推进', () => {
    const match = createMatch();
    step(match, 3);
    const blue = match.units.find((u) => u.kind === 'minion' && u.team === 'blue')!;
    const x0 = blue.pos.x;
    step(match, 2);
    expect(blue.pos.x).toBeGreaterThan(x0);
  });

  it('英雄最后一击获得金币与补刀数', () => {
    const match = createMatch();
    const minion = match.spawnMinion('red', 'melee', { x: 300, y: 600 }, false);
    minion.stats.hp = 5;
    const goldBefore = match.player.gold!;
    match.player.pos = { x: 280, y: 600 };
    match.killUnit(minion, match.player);
    expect(match.player.gold).toBe(goldBefore + minion.goldBounty!);
    expect(match.player.cs).toBe(1);
  });

  it('强化兵线事件生成更强小兵', () => {
    const match = createMatch();
    const normal = match.spawnMinion('blue', 'melee', { x: 100, y: 600 }, false);
    const mega = match.spawnMinion('blue', 'melee', { x: 100, y: 640 }, true);
    expect(mega.stats.hpMax).toBeGreaterThan(normal.stats.hpMax);
  });
});

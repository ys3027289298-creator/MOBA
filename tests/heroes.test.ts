import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';
import { XP_CURVE } from '../src/engine/game';

describe('英雄升级、死亡与复活', () => {
  it('经验足够时升级并获得技能点，最高 8 级', () => {
    const match = createMatch();
    match.grantXp(match.player, 20000);
    expect(match.player.level).toBe(8);
    expect(match.player.skillPoints).toBeGreaterThan(0);
    // 升级提升最大生命
    expect(match.player.stats.hpMax).toBeGreaterThan(580);
    void XP_CURVE;
  });

  it('技能点可以强化技能，未达到解锁等级不能升级大招', () => {
    const match = createMatch();
    expect(match.canUpgradeSkill(match.player, 3)).toBe(false);
    match.player.skillPoints = 2;
    expect(match.upgradeSkill(match.player, 0)).toBe(true);
    expect(match.player.skillLevels![0]).toBe(1);
  });

  it('英雄死亡后进入复活倒计时，复活回到己方基地', () => {
    const match = createMatch();
    match.player.pos = { x: 1500, y: 600 };
    match.killUnit(match.player, match.ai);
    expect(match.player.alive).toBe(false);
    expect(match.player.respawnTimer).toBeGreaterThan(0);
    expect(match.player.deaths).toBe(1);
    step(match, 20);
    expect(match.player.alive).toBe(true);
    expect(match.player.stats.hp).toBe(match.player.stats.hpMax);
    expect(match.player.pos.x).toBeLessThan(400);
  });

  it('击杀英雄获得金币、经验与击杀数', () => {
    const match = createMatch();
    const goldBefore = match.player.gold!;
    match.killUnit(match.ai, match.player);
    expect(match.player.gold).toBe(goldBefore + 300);
    expect(match.player.kills).toBe(1);
    expect(match.kills.blue).toBe(1);
  });
});

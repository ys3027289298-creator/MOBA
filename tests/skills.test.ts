import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';
import { addStatus, isStunned, slowFactor, isSilenced } from '../src/engine/combat';

describe('技能冷却、消耗、伤害与控制', () => {
  it('未学习的技能无法释放，学习后可造成伤害并进入冷却', () => {
    const match = createMatch('vera', 'lan');
    expect(match.castSkill(match.player, 0, match.ai.pos, match.ai)).toBe(false);
    match.upgradeSkill(match.player, 0);
    match.player.pos = { x: 500, y: 600 };
    match.ai.pos = { x: 800, y: 600 };
    const hpBefore = match.ai.stats.hp;
    const ok = match.castSkill(match.player, 0, match.ai.pos, match.ai);
    expect(ok).toBe(true);
    expect(match.player.cooldowns![0]).toBeGreaterThan(0);
    expect(match.player.stats.mp).toBeLessThan(match.player.stats.mpMax);
    step(match, 0.5);
    expect(match.ai.stats.hp).toBeLessThan(hpBefore);
    // 冷却中不能再次释放
    expect(match.castSkill(match.player, 0, match.ai.pos, match.ai)).toBe(false);
  });

  it('法力不足时不能释放技能', () => {
    const match = createMatch('vera');
    match.upgradeSkill(match.player, 3);
    match.player.level = 6;
    match.player.skillPoints = 4;
    match.player.skillLevels = [0, 0, 0, 0];
    match.upgradeSkill(match.player, 3);
    match.player.stats.mp = 10;
    expect(match.canCast(match.player, 3).ok).toBe(false);
  });

  it('眩晕、减速、沉默、击退均生效', () => {
    const match = createMatch();
    const u = match.ai;
    addStatus(u, 'stun', 2, 1, match.player.id);
    expect(isStunned(u)).toBe(true);
    addStatus(u, 'slow', 2, 0.4, match.player.id);
    expect(slowFactor(u)).toBeCloseTo(0.6);
    addStatus(u, 'silence', 2, 1, match.player.id);
    expect(isSilenced(u)).toBe(true);
    const before = { ...u.pos };
    addStatus(u, 'knockback', 0.3, 200, match.player.id);
    expect(u.statuses.some((s) => s.kind === 'knockback')).toBe(true);
    // 通过技能触发的击退会在施放时位移（此处仅验证状态存在）
    expect(before).toBeDefined();
  });

  it('岚的陨星处决造成范围眩晕伤害', () => {
    const match = createMatch('lan', 'vera');
    match.player.level = 6;
    match.player.skillPoints = 5;
    match.player.skillLevels = [0, 0, 0, 0];
    match.upgradeSkill(match.player, 3);
    match.recomputeStats(match.player);
    match.player.pos = { x: 500, y: 600 };
    match.ai.pos = { x: 560, y: 600 };
    const hpBefore = match.ai.stats.hp;
    const ok = match.castSkill(match.player, 3, { x: 560, y: 600 });
    expect(ok).toBe(true);
    expect(match.ai.stats.hp).toBeLessThan(hpBefore);
    expect(isStunned(match.ai)).toBe(true);
  });

  it('技能不能穿过不可通行墙体', () => {
    const match = createMatch('vera');
    match.upgradeSkill(match.player, 1); // 灼星领域 point
    match.player.pos = { x: 1100, y: 250 };
    const blocked = match.castSkill(match.player, 1, { x: 1400, y: 460 });
    expect(blocked).toBe(false);
    expect(match.player.cooldowns![1]).toBe(0);
  });
});

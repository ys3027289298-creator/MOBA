import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';
import { segmentBlocked, resolveWalls, WALLS, pointInBush, BUSHES } from '../src/engine/map';

describe('移动、攻击距离与碰撞', () => {
  it('英雄可以向地面指令移动', () => {
    const match = createMatch();
    const start = { ...match.player.pos };
    match.commandMove(match.player, { x: start.x + 200, y: start.y });
    step(match, 0.5);
    expect(match.player.pos.x).toBeGreaterThan(start.x);
  });

  it('单位无法穿过墙体障碍', () => {
    const wall = WALLS[0];
    const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
    const resolved = resolveWalls(mid, 22);
    expect(segmentBlocked({ x: wall.a.x - 60, y: wall.a.y }, { x: wall.b.x + 60, y: wall.b.y })).toBe(true);
    expect(Math.hypot(resolved.x - mid.x, resolved.y - mid.y)).toBeGreaterThan(0);
  });

  it('近战攻击受距离限制，远程攻击有弹道', () => {
    const match = createMatch('lan', 'vera');
    let projectiles = 0;
    match.onProjectile = () => { projectiles++; };
    // 岚近战，目标超出攻击距离时无法出手
    const dummy = match.spawnMinion('red', 'melee', { x: 900, y: 600 }, false);
    match.player.pos = { x: 100, y: 600 };
    match.commandAttack(match.player, dummy);
    step(match, 0.2);
    expect(dummy.stats.hp).toBe(dummy.stats.hpMax);
    expect(projectiles).toBe(0);
    // 薇拉远程：在射程内攻击产生弹道
    match.ai.pos = { x: 2600, y: 900 };
    const dummy2 = match.spawnMinion('blue', 'melee', { x: 2200, y: 900 }, false);
    match.ai.pos = { x: dummy2.pos.x + 400, y: 900 };
    match.commandAttack(match.ai, dummy2);
    step(match, 0.3);
    expect(projectiles).toBeGreaterThan(0);
  });

  it('草丛区域判定正确', () => {
    expect(pointInBush({ x: BUSHES[0].x + 10, y: BUSHES[0].y + 10 })).toBe(true);
    expect(pointInBush({ x: 50, y: 50 })).toBe(false);
  });
});

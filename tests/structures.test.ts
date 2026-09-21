import { describe, it, expect } from 'vitest';
import { createMatch, step } from './helpers';
import { TOWER_STATS } from '../src/engine/map';

describe('防御塔与基地核心', () => {
  it('每方拥有两座防御塔和一个基地核心', () => {
    const match = createMatch();
    expect(match.towers.blue).toHaveLength(2);
    expect(match.towers.red).toHaveLength(2);
    expect(match.cores.blue.alive).toBe(true);
    expect(match.cores.red.alive).toBe(true);
  });

  it('防御塔优先攻击进入范围的敌方小兵', () => {
    const match = createMatch();
    let shots = 0;
    match.onProjectile = (e) => { if (e.kind === 'attack') shots++; };
    const tower = match.towers.red[0];
    const minion = match.spawnMinion('blue', 'melee', { x: tower.pos.x - 60, y: 600 }, false);
    step(match, 1.5);
    expect(shots).toBeGreaterThan(0);
    expect(minion.stats.hp).toBeLessThan(minion.stats.hpMax);
  });

  it('英雄在塔下攻击敌方英雄会转移防御塔仇恨', () => {
    const match = createMatch();
    const tower = match.towers.blue[0];
    // 蓝方外塔位于 x=820；玩家（蓝英雄）攻击塔范围内的红英雄应引发蓝塔对红英雄的仇恨
    // 注：塔不会攻击己方英雄；此处红英雄攻击塔范围内的蓝英雄，红塔才会转移仇恨
    const redTower = match.towers.red[0];
    match.ai.pos = { x: redTower.pos.x - 80, y: 600 };
    match.player.pos = { x: redTower.pos.x - 120, y: 600 };
    // 玩家在蓝塔范围内攻击红英雄
    match.commandAttack(match.ai, match.player);
    step(match, 0.2);
    expect(redTower.aggroTargetId).toBe(match.player.id);
  });

  it('防御塔被摧毁后不再攻击且不恢复', () => {
    const match = createMatch();
    const tower = match.towers.red[0];
    match.killUnit(tower, match.player);
    expect(match.towers.red).toHaveLength(1);
    step(match, 5);
    expect(match.units.some((u) => u.kind === 'tower' && u.towerIndex === 0 && u.team === 'red')).toBe(false);
    expect(match.player.gold).toBeGreaterThan(500 + TOWER_STATS.goldBounty - 1);
  });

  it('摧毁基地核心立即判定胜利', () => {
    const match = createMatch();
    match.killUnit(match.cores.red, match.player);
    expect(match.result).toBe('victory');
  });

  it('己方核心被摧毁判定失败', () => {
    const match = createMatch();
    match.killUnit(match.cores.blue, match.ai);
    expect(match.result).toBe('defeat');
  });
});

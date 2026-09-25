import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { MAP_H, MAP_W } from '../src/engine/map';
import {
  PING_COOLDOWN, PING_DEFS, PING_MAX_PER_TEAM, PING_TTL, PingManager,
  clampToMap, isInsideMap, isInsideMinimap, minimapToWorld, pingTypeFromEvent, worldToMinimap,
  type MinimapRect, type PingType
} from '../src/engine/pings';

function makeGame(player = 'emberfang', enemy = 'veilora') {
  return new Game({ mode: 'full', playerHero: player, enemyHero: enemy });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

function request(type: PingType, x: number, y: number, overrides: Partial<Parameters<PingManager['tryPing']>[0]> = {}) {
  return { type, team: 0 as const, pos: { x, y }, now: 1, canOperate: true, paused: false, running: true, ...overrides };
}

const RECT: MinimapRect = { x: 1145, y: 553, w: 220, h: 136 };

describe('标记类型与输入解析', () => {
  it('四种标记类型都可创建且带有可展示文本', () => {
    const types: PingType[] = ['attention', 'danger', 'gather', 'missing'];
    for (const type of types) {
      const manager = new PingManager();
      const result = manager.tryPing(request(type, 400, 400));
      expect(result.ok).toBe(true);
      expect(result.ping?.type).toBe(type);
      expect(result.ping?.text).toBe(PING_DEFS[type].text);
      expect(result.ping?.ttl).toBe(PING_TTL);
      expect(result.ping?.team).toBe(0);
      expect(typeof result.ping?.id).toBe('number');
    }
  });

  it('缺少 Alt 或修饰键无效时不解析为标记', () => {
    expect(pingTypeFromEvent({ altKey: false, shiftKey: false, ctrlKey: false }, 0)).toBeNull();
    expect(pingTypeFromEvent({ altKey: false, shiftKey: true, ctrlKey: false }, 0)).toBeNull();
    expect(pingTypeFromEvent({ altKey: false, shiftKey: false, ctrlKey: true }, 2)).toBeNull();
    expect(pingTypeFromEvent({ altKey: true, shiftKey: false, ctrlKey: false }, 0)).toBe('attention');
    expect(pingTypeFromEvent({ altKey: true, shiftKey: false, ctrlKey: false }, 2)).toBe('danger');
    expect(pingTypeFromEvent({ altKey: true, shiftKey: true, ctrlKey: false }, 0)).toBe('gather');
    expect(pingTypeFromEvent({ altKey: true, shiftKey: false, ctrlKey: true }, 0)).toBe('missing');
  });
});

describe('坐标换算', () => {
  it('世界点击在地图内生成对应坐标的标记', () => {
    const game = makeGame();
    const result = game.tryPing('attention', { x: 500, y: 300 });
    expect(result.ok).toBe(true);
    expect(game.pings.pings).toHaveLength(1);
    expect(game.pings.pings[0].pos).toEqual({ x: 500, y: 300 });
  });

  it('小地图点击换算到世界坐标', () => {
    expect(minimapToWorld({ x: RECT.x, y: RECT.y }, RECT)).toEqual({ x: 0, y: 0 });
    expect(minimapToWorld({ x: RECT.x + RECT.w, y: RECT.y + RECT.h }, RECT)).toEqual({ x: MAP_W, y: MAP_H });
    const center = minimapToWorld({ x: RECT.x + RECT.w / 2, y: RECT.y + RECT.h / 2 }, RECT);
    expect(center.x).toBeCloseTo(MAP_W / 2);
    expect(center.y).toBeCloseTo(MAP_H / 2);
  });

  it('窗口尺寸变化与边缘点击不会把标记放到地图外', () => {
    const rects: MinimapRect[] = [
      { x: 565, y: 415, w: 220, h: 136 },
      { x: 1685, y: 865, w: 220, h: 136 },
      { x: 100, y: 50, w: 110, h: 68 }
    ];
    for (const rect of rects) {
      const world = minimapToWorld({ x: rect.x + rect.w + 40, y: rect.y - 25 }, rect);
      expect(isInsideMap(world)).toBe(true);
      expect(world).toEqual({ x: MAP_W, y: 0 });
      const roundTrip = worldToMinimap(minimapToWorld({ x: rect.x + 30, y: rect.y + 20 }, rect), rect);
      expect(roundTrip.x).toBeCloseTo(rect.x + 30);
      expect(roundTrip.y).toBeCloseTo(rect.y + 20);
    }
    expect(clampToMap({ x: -10, y: MAP_H + 10 })).toEqual({ x: 0, y: MAP_H });
    expect(isInsideMinimap({ x: RECT.x - 1, y: RECT.y + 10 }, RECT)).toBe(false);
  });

  it('地图外输入被拒绝且不改变标记数组', () => {
    const game = makeGame();
    expect(game.tryPing('attention', { x: -50, y: 300 }).ok).toBe(false);
    expect(game.tryPing('attention', { x: 300, y: MAP_H + 1 }).ok).toBe(false);
    expect(game.pings.pings).toHaveLength(0);
  });
});

describe('冷却、上限与去重', () => {
  it('0.75 秒冷却内的再次触发失败且数组不变', () => {
    const game = makeGame();
    expect(game.tryPing('attention', { x: 400, y: 400 }).ok).toBe(true);
    const before = game.pings.pings.length;
    const blocked = game.tryPing('danger', { x: 900, y: 500 });
    expect(blocked.ok).toBe(false);
    expect(game.pings.pings).toHaveLength(before);
    expect(game.pings.cooldown).toBeGreaterThan(0);
    expect(game.pings.cooldown).toBeLessThanOrEqual(PING_COOLDOWN);
    tick(game, 0.8);
    expect(game.tryPing('danger', { x: 900, y: 500 }).ok).toBe(true);
    expect(game.pings.pings).toHaveLength(2);
  });

  it('每队最多保留 3 个标记，新增第 4 个淘汰最旧', () => {
    const game = makeGame();
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) {
      const result = game.tryPing('attention', { x: 200 + i * 200, y: 300 });
      expect(result.ok).toBe(true);
      ids.push(result.ping!.id);
      tick(game, 0.8);
    }
    expect(game.pings.pings).toHaveLength(PING_MAX_PER_TEAM);
    expect(game.pings.pings.map((p) => p.id)).not.toContain(ids[0]);
    expect(game.pings.pings.map((p) => p.id)).toEqual(ids.slice(1));
  });

  it('相同位置重复点击合并刷新而不是新增', () => {
    const game = makeGame();
    expect(game.tryPing('danger', { x: 600, y: 500 }).ok).toBe(true);
    tick(game, 1);
    expect(game.pings.pings[0].ttl).toBeLessThan(PING_TTL);
    const merged = game.tryPing('danger', { x: 610, y: 505 });
    expect(merged.ok).toBe(true);
    expect(merged.merged).toBe(true);
    expect(game.pings.pings).toHaveLength(1);
    expect(game.pings.pings[0].ttl).toBe(PING_TTL);
    tick(game, 0.8);
    expect(game.tryPing('attention', { x: 610, y: 505 }).ok).toBe(true);
    expect(game.pings.pings).toHaveLength(2);
  });
});

describe('生命周期与对局状态', () => {
  it('暂停时倒计时冻结且无法新增标记', () => {
    const game = makeGame();
    expect(game.tryPing('gather', { x: 700, y: 500 }).ok).toBe(true);
    tick(game, 1);
    const ttl = game.pings.pings[0].ttl;
    game.paused = true;
    tick(game, 2);
    expect(game.pings.pings[0].ttl).toBe(ttl);
    expect(game.tryPing('attention', { x: 300, y: 300 }).ok).toBe(false);
    expect(game.pings.pings).toHaveLength(1);
  });

  it('标记 6 秒后由 Game.update 统一过期清理', () => {
    const game = makeGame();
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(true);
    tick(game, 5);
    expect(game.pings.pings).toHaveLength(1);
    tick(game, 1.2);
    expect(game.pings.pings).toHaveLength(0);
  });

  it('速度倍率不会改变标记存活时长', () => {
    const game = makeGame();
    game.speed = 2;
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(true);
    tick(game, 3);
    expect(game.pings.pings[0].ttl).toBeCloseTo(PING_TTL - 6, 1);
  });

  it('比赛结束后一次性清理全部标记', () => {
    const game = makeGame();
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(true);
    tick(game, 0.8);
    expect(game.tryPing('danger', { x: 800, y: 500 }).ok).toBe(true);
    game.result = 'victory';
    tick(game, 0.2);
    expect(game.pings.pings).toHaveLength(0);
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(false);
  });

  it('玩家死亡或受控时无法标记，clear 后重新开始无残留', () => {
    const game = makeGame();
    game.player.alive = false;
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(false);
    game.player.alive = true;
    game.player.statuses.push({ type: 'stun', duration: 1, value: 1 });
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(false);
    game.player.statuses = [];
    expect(game.tryPing('missing', { x: 500, y: 500 }).ok).toBe(true);
    game.pings.clear();
    expect(game.pings.pings).toHaveLength(0);
    expect(game.pings.cooldown).toBe(0);
    const fresh = makeGame();
    expect(fresh.pings.pings).toHaveLength(0);
  });
});

describe('原有操作回归', () => {
  it('无 Alt 的右键仍是移动/攻击，左键不生成标记', () => {
    const game = makeGame();
    expect(pingTypeFromEvent({ altKey: false, shiftKey: false, ctrlKey: false }, 2)).toBeNull();
    game.commandMove(game.player, { x: game.player.pos.x + 150, y: game.player.pos.y });
    expect(game.player.moveTarget).toBeDefined();
    expect(game.pings.pings).toHaveLength(0);
    game.commandAttack(game.player, game.enemy);
    expect(game.player.attackTargetId).toBe(game.enemy.id);
    expect(game.pings.pings).toHaveLength(0);
  });

  it('标记不影响技能瞄准与释放', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    hero.skillLevels[0] = 1;
    expect(game.tryPing('attention', { x: hero.pos.x + 100, y: hero.pos.y }).ok).toBe(true);
    const cast = game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } });
    expect(cast).toBe(true);
    expect(hero.cooldowns.Q).toBeGreaterThan(0);
    expect(game.pings.pings).toHaveLength(1);
  });
});

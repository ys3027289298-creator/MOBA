import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { MAP_H, MAP_W } from '../src/engine/map';
import {
  PING_COOLDOWN, PING_DEFS, PING_MAX_PER_TEAM, PING_TTL, PingSystem,
  inMapBounds, minimapLayout, minimapToWorld, pingTypeFromInput, pointInMinimap, screenToWorld,
  type PingType
} from '../src/engine/pings';

function makeGame() {
  return new Game({ mode: 'full', playerHero: 'emberfang', enemyHero: 'veilora' });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

describe('Ping 输入解析', () => {
  it('Alt 组合映射四种标记类型', () => {
    expect(pingTypeFromInput({ alt: true, shift: false, button: 0 })).toBe('attention');
    expect(pingTypeFromInput({ alt: true, shift: false, button: 2 })).toBe('danger');
    expect(pingTypeFromInput({ alt: true, shift: true, button: 0 })).toBe('gather');
    expect(pingTypeFromInput({ alt: true, shift: true, button: 2 })).toBe('missing');
  });

  it('缺少 Alt 或无效按键不触发标记', () => {
    expect(pingTypeFromInput({ alt: false, shift: false, button: 0 })).toBeNull();
    expect(pingTypeFromInput({ alt: false, shift: true, button: 2 })).toBeNull();
    expect(pingTypeFromInput({ alt: true, shift: false, button: 1 })).toBeNull();
  });
});

describe('Ping 坐标换算', () => {
  it('小地图点击换算到世界坐标且边缘被钳制在地图内', () => {
    const layout = minimapLayout(1280, 720);
    const center = minimapToWorld({ x: layout.x + layout.w / 2, y: layout.y + layout.h / 2 }, layout);
    expect(center.x).toBeCloseTo(MAP_W / 2, 5);
    expect(center.y).toBeCloseTo(MAP_H / 2, 5);
    const beyond = minimapToWorld({ x: layout.x + layout.w + 40, y: layout.y - 25 }, layout);
    expect(beyond.x).toBe(MAP_W);
    expect(beyond.y).toBe(0);
    expect(inMapBounds(beyond)).toBe(true);
  });

  it('小地图命中区域随窗口尺寸变化', () => {
    const small = minimapLayout(800, 600);
    const large = minimapLayout(1920, 1080);
    expect(pointInMinimap({ x: 1920 - 100, y: 1080 - 100 }, large)).toBe(true);
    expect(pointInMinimap({ x: 1920 - 100, y: 1080 - 100 }, small)).toBe(false);
    const world = minimapToWorld({ x: small.x, y: small.y }, small);
    expect(world).toEqual({ x: 0, y: 0 });
  });

  it('相机缩放后屏幕坐标仍正确换算为世界坐标', () => {
    const cam = { scrollX: 200, scrollY: 100, zoom: 1, width: 1280, height: 720 };
    expect(screenToWorld(cam, { x: 640, y: 360 })).toEqual({ x: 840, y: 460 });
    const zoomed = { ...cam, zoom: 1.6 };
    const world = screenToWorld(zoomed, { x: 640, y: 360 });
    expect(world.x).toBeCloseTo(840, 5);
    expect(world.y).toBeCloseTo(460, 5);
    const offCenter = screenToWorld(zoomed, { x: 800, y: 360 });
    expect(offCenter.x).toBeCloseTo(840 + 160 / 1.6, 5);
    const zoomedOut = screenToWorld({ ...cam, zoom: 0.55 }, { x: 0, y: 0 });
    expect(zoomedOut.x).toBeCloseTo(840 - 640 / 0.55, 5);
  });
});

describe('Ping 创建规则', () => {
  it('四种类型都能在世界坐标创建并带有文本与剩余时间', () => {
    const types: PingType[] = ['attention', 'danger', 'gather', 'missing'];
    const game = makeGame();
    for (const type of types) {
      game.pingSystem.cooldown = 0;
      const result = game.tryPing(type, { x: 500, y: 500 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ping.type).toBe(type);
        expect(result.ping.text).toBe(PING_DEFS[type].text);
        expect(result.ping.ttl).toBe(PING_TTL);
        expect(result.ping.team).toBe(0);
      }
    }
  });

  it('一次输入事件只生成一个标记', () => {
    const game = makeGame();
    const type = pingTypeFromInput({ alt: true, shift: false, button: 0 });
    expect(type).toBe('attention');
    const result = game.tryPing(type!, { x: 600, y: 520 });
    expect(result.ok).toBe(true);
    expect(game.pingSystem.pings.length).toBe(1);
  });

  it('超出地图边界的输入被拒绝且不改变数组', () => {
    const game = makeGame();
    expect(game.tryPing('attention', { x: -10, y: 500 }).ok).toBe(false);
    expect(game.tryPing('danger', { x: 500, y: MAP_H + 5 }).ok).toBe(false);
    expect(game.pingSystem.pings.length).toBe(0);
  });

  it('0.75 秒冷却期间拒绝新标记', () => {
    const game = makeGame();
    expect(game.tryPing('attention', { x: 400, y: 400 }).ok).toBe(true);
    const denied = game.tryPing('danger', { x: 900, y: 400 });
    expect(denied.ok).toBe(false);
    expect(game.pingSystem.pings.length).toBe(1);
    tick(game, PING_COOLDOWN + 0.1);
    expect(game.tryPing('danger', { x: 900, y: 400 }).ok).toBe(true);
    expect(game.pingSystem.pings.length).toBe(2);
  });

  it('同队最多保留 3 个标记，第 4 个淘汰最旧', () => {
    const game = makeGame();
    const spots = [{ x: 300, y: 300 }, { x: 600, y: 300 }, { x: 900, y: 300 }, { x: 1200, y: 300 }];
    for (const spot of spots) {
      game.pingSystem.cooldown = 0;
      expect(game.tryPing('attention', spot).ok).toBe(true);
    }
    expect(game.pingSystem.pings.length).toBe(PING_MAX_PER_TEAM);
    expect(game.pingSystem.pings.some((p) => p.pos.x === 300)).toBe(false);
    expect(game.pingSystem.pings.some((p) => p.pos.x === 1200)).toBe(true);
  });

  it('相同位置连续点击合并而不是新增', () => {
    const game = makeGame();
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(true);
    game.pingSystem.cooldown = 0;
    tick(game, 2);
    const merged = game.tryPing('danger', { x: 510, y: 505 });
    expect(merged.ok).toBe(true);
    if (merged.ok) expect(merged.merged).toBe(true);
    expect(game.pingSystem.pings.length).toBe(1);
    expect(game.pingSystem.pings[0].type).toBe('danger');
    expect(game.pingSystem.pings[0].ttl).toBe(PING_TTL);
  });

  it('暂停、结算或玩家不可操作时拒绝标记', () => {
    const game = makeGame();
    game.paused = true;
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(false);
    game.paused = false;
    game.result = 'victory';
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(false);
    game.result = 'running';
    game.player.alive = false;
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(false);
    game.player.alive = true;
    game.player.statuses.push({ type: 'stun', duration: 1, value: 1 });
    expect(game.tryPing('attention', { x: 500, y: 500 }).ok).toBe(false);
    expect(game.pingSystem.pings.length).toBe(0);
  });
});

describe('Ping 生命周期', () => {
  it('标记默认存活 6 秒并由 Game.update 统一过期', () => {
    const game = makeGame();
    game.tryPing('attention', { x: 500, y: 500 });
    tick(game, PING_TTL - 0.5);
    expect(game.pingSystem.pings.length).toBe(1);
    tick(game, 0.6);
    expect(game.pingSystem.pings.length).toBe(0);
  });

  it('暂停时冻结倒计时，恢复后继续', () => {
    const game = makeGame();
    game.tryPing('attention', { x: 500, y: 500 });
    game.paused = true;
    tick(game, 5);
    expect(game.pingSystem.pings.length).toBe(1);
    expect(game.pingSystem.pings[0].ttl).toBeGreaterThan(PING_TTL - 0.2);
    game.paused = false;
    tick(game, PING_TTL + 0.1);
    expect(game.pingSystem.pings.length).toBe(0);
  });

  it('比赛结束后一次性清理所有标记', () => {
    const game = makeGame();
    game.tryPing('attention', { x: 500, y: 500 });
    game.pingSystem.cooldown = 0;
    game.tryPing('danger', { x: 900, y: 500 });
    expect(game.pingSystem.pings.length).toBe(2);
    game.result = 'defeat';
    game.update(0.05);
    expect(game.pingSystem.pings.length).toBe(0);
    expect(game.pingSystem.cooldown).toBe(0);
  });

  it('重新开始的对局没有残留标记', () => {
    const first = makeGame();
    first.tryPing('attention', { x: 500, y: 500 });
    expect(first.pingSystem.pings.length).toBe(1);
    const second = makeGame();
    expect(second.pingSystem.pings.length).toBe(0);
    expect(second.pingSystem.cooldown).toBe(0);
    first.pingSystem.clear();
    expect(first.pingSystem.pings.length).toBe(0);
  });

  it('PingSystem 独立逻辑：上限、去重、冷却与 TTL', () => {
    const system = new PingSystem();
    expect(system.add('gather', 0, { x: 100, y: 100 }, 0).ok).toBe(true);
    expect(system.add('gather', 0, { x: 200, y: 200 }, 0).ok).toBe(false);
    system.update(1);
    const merged = system.add('gather', 0, { x: 105, y: 105 }, 1);
    expect(merged.ok && merged.merged).toBe(true);
    expect(system.pings.length).toBe(1);
    system.update(PING_TTL + 1);
    expect(system.pings.length).toBe(0);
  });
});

describe('原有操作回归', () => {
  it('无 Alt 的右键移动与技能瞄准不受影响', () => {
    expect(pingTypeFromInput({ alt: false, shift: false, button: 2 })).toBeNull();
    const game = makeGame();
    const start = { ...game.player.pos };
    game.commandMove(game.player, { x: start.x + 200, y: start.y });
    tick(game, 1);
    expect(game.player.pos.x).toBeGreaterThan(start.x);
    const caster = new Game({ mode: 'full', playerHero: 'veilora', enemyHero: 'emberfang' });
    caster.player.skillLevels[0] = 1;
    const point = { x: caster.player.pos.x + 120, y: caster.player.pos.y };
    expect(caster.castSkill(caster.player, 0, { point })).toBe(true);
    expect(caster.pingSystem.pings.length).toBe(0);
  });
});

import { MAP_H, MAP_W, clamp, dist } from './map';
import type { Team, Vec2 } from './types';

export type PingType = 'attention' | 'danger' | 'gather' | 'missing';

export interface Ping {
  id: number;
  type: PingType;
  team: Team;
  pos: Vec2;
  createdAt: number;
  ttl: number;
  text: string;
}

export const PING_TTL = 6;
export const PING_COOLDOWN = 0.75;
export const PING_MAX_PER_TEAM = 3;
export const PING_MERGE_RADIUS = 48;

export const PING_DEFS: Record<PingType, { text: string; color: number; minimap: 'circle' | 'triangle' | 'square' | 'diamond' }> = {
  attention: { text: '注意', color: 0xffd166, minimap: 'circle' },
  danger: { text: '危险', color: 0xff5a5a, minimap: 'triangle' },
  gather: { text: '集合', color: 0x51cf66, minimap: 'square' },
  missing: { text: '敌人消失', color: 0xc77dff, minimap: 'diamond' }
};

export interface MinimapRect { x: number; y: number; w: number; h: number }

export function isInsideMap(p: Vec2): boolean {
  return p.x >= 0 && p.x <= MAP_W && p.y >= 0 && p.y <= MAP_H;
}

export function clampToMap(p: Vec2): Vec2 {
  return { x: clamp(p.x, 0, MAP_W), y: clamp(p.y, 0, MAP_H) };
}

export function isInsideMinimap(point: Vec2, rect: MinimapRect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function minimapToWorld(point: Vec2, rect: MinimapRect): Vec2 {
  return clampToMap({
    x: ((point.x - rect.x) / rect.w) * MAP_W,
    y: ((point.y - rect.y) / rect.h) * MAP_H
  });
}

export function worldToMinimap(pos: Vec2, rect: MinimapRect): Vec2 {
  const clamped = clampToMap(pos);
  return {
    x: rect.x + (clamped.x / MAP_W) * rect.w,
    y: rect.y + (clamped.y / MAP_H) * rect.h
  };
}

export interface PingModifiers { altKey: boolean; shiftKey: boolean; ctrlKey: boolean }

export function pingTypeFromEvent(modifiers: PingModifiers, button: 0 | 2): PingType | null {
  if (!modifiers.altKey) return null;
  if (modifiers.shiftKey) return 'gather';
  if (modifiers.ctrlKey) return 'missing';
  if (button === 2) return 'danger';
  return 'attention';
}

export interface PingRequest {
  type: PingType;
  team: Team;
  pos: Vec2;
  now: number;
  canOperate: boolean;
  paused: boolean;
  running: boolean;
}

export interface PingResult {
  ok: boolean;
  reason?: string;
  ping?: Ping;
  merged?: boolean;
}

function fail(reason: string): PingResult {
  return { ok: false, reason };
}

export class PingManager {
  pings: Ping[] = [];
  cooldown = 0;
  private nextId = 1;

  tryPing(request: PingRequest): PingResult {
    if (request.paused) return fail('已暂停');
    if (!request.running) return fail('比赛已结束');
    if (!request.canOperate) return fail('当前无法操作');
    if (this.cooldown > 0) return fail('标记冷却中');
    if (!isInsideMap(request.pos)) return fail('位置不在地图内');
    const pos = clampToMap(request.pos);
    const existing = this.pings.find(
      (ping) => ping.team === request.team && ping.type === request.type && dist(ping.pos, pos) <= PING_MERGE_RADIUS
    );
    if (existing) {
      existing.pos = pos;
      existing.createdAt = request.now;
      existing.ttl = PING_TTL;
      this.cooldown = PING_COOLDOWN;
      return { ok: true, ping: existing, merged: true };
    }
    const ping: Ping = {
      id: this.nextId++,
      type: request.type,
      team: request.team,
      pos,
      createdAt: request.now,
      ttl: PING_TTL,
      text: PING_DEFS[request.type].text
    };
    this.pings.push(ping);
    const teamPings = this.pings.filter((p) => p.team === request.team);
    if (teamPings.length > PING_MAX_PER_TEAM) {
      const oldest = teamPings.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
      this.pings.splice(this.pings.indexOf(oldest), 1);
    }
    this.cooldown = PING_COOLDOWN;
    return { ok: true, ping };
  }

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const ping of this.pings) ping.ttl -= dt;
    this.pings = this.pings.filter((ping) => ping.ttl > 0);
  }

  clear() {
    this.pings = [];
    this.cooldown = 0;
  }
}

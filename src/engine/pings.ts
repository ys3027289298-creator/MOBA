import { MAP_H, MAP_W, clamp } from './map';
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

export const PING_DEFS: Record<PingType, { text: string; color: number; css: string }> = {
  attention: { text: '注意', color: 0xffd166, css: '#ffd166' },
  danger: { text: '危险', color: 0xff5a5a, css: '#ff5a5a' },
  gather: { text: '集合', color: 0x51cf66, css: '#51cf66' },
  missing: { text: '敌人消失', color: 0xc77dff, css: '#c77dff' }
};

export interface PingInputModifiers {
  alt: boolean;
  shift: boolean;
  button: number;
}

export function pingTypeFromInput(input: PingInputModifiers): PingType | null {
  if (!input.alt) return null;
  if (input.button === 0) return input.shift ? 'gather' : 'attention';
  if (input.button === 2) return input.shift ? 'missing' : 'danger';
  return null;
}

export interface MinimapLayout { x: number; y: number; w: number; h: number }

export function minimapLayout(viewW: number, viewH: number): MinimapLayout {
  return { x: viewW - 235, y: viewH - 185, w: 220, h: 136 };
}

export function pointInMinimap(p: Vec2, layout: MinimapLayout, pad = 0): boolean {
  return p.x >= layout.x - pad && p.x <= layout.x + layout.w + pad
    && p.y >= layout.y - pad && p.y <= layout.y + layout.h + pad;
}

export function minimapToWorld(p: Vec2, layout: MinimapLayout): Vec2 {
  return {
    x: clamp((p.x - layout.x) / layout.w, 0, 1) * MAP_W,
    y: clamp((p.y - layout.y) / layout.h, 0, 1) * MAP_H
  };
}

export interface CameraView {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

export function screenToWorld(camera: CameraView, screen: Vec2): Vec2 {
  return {
    x: camera.scrollX + camera.width / 2 + (screen.x - camera.width / 2) / camera.zoom,
    y: camera.scrollY + camera.height / 2 + (screen.y - camera.height / 2) / camera.zoom
  };
}

export function inMapBounds(p: Vec2): boolean {
  return p.x >= 0 && p.x <= MAP_W && p.y >= 0 && p.y <= MAP_H;
}

export type PingResult =
  | { ok: true; ping: Ping; merged: boolean }
  | { ok: false; reason: string };

export class PingSystem {
  pings: Ping[] = [];
  cooldown = 0;
  lastText = '';
  lastTextT = 0;
  private nextId = 1;

  add(type: PingType, team: Team, pos: Vec2, now: number): PingResult {
    if (this.cooldown > 0) return { ok: false, reason: '标记冷却中' };
    if (!inMapBounds(pos)) return { ok: false, reason: '位置超出地图' };
    const point = { x: pos.x, y: pos.y };
    const existing = this.pings.find(
      (p) => p.team === team && Math.hypot(p.pos.x - point.x, p.pos.y - point.y) <= PING_MERGE_RADIUS
    );
    this.cooldown = PING_COOLDOWN;
    if (existing) {
      existing.type = type;
      existing.text = PING_DEFS[type].text;
      existing.createdAt = now;
      existing.ttl = PING_TTL;
      this.remember(existing);
      return { ok: true, ping: existing, merged: true };
    }
    const teamPings = this.pings.filter((p) => p.team === team);
    if (teamPings.length >= PING_MAX_PER_TEAM) {
      const oldest = teamPings.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
      this.pings.splice(this.pings.indexOf(oldest), 1);
    }
    const ping: Ping = {
      id: this.nextId++, type, team, pos: point,
      createdAt: now, ttl: PING_TTL, text: PING_DEFS[type].text
    };
    this.pings.push(ping);
    this.remember(ping);
    return { ok: true, ping, merged: false };
  }

  private remember(ping: Ping) {
    this.lastText = `${ping.text} (${Math.round(ping.pos.x)}, ${Math.round(ping.pos.y)})`;
    this.lastTextT = 4;
  }

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.lastTextT = Math.max(0, this.lastTextT - dt);
    for (const ping of this.pings) ping.ttl -= dt;
    this.pings = this.pings.filter((p) => p.ttl > 0);
  }

  clear() {
    this.pings = [];
    this.cooldown = 0;
    this.lastText = '';
    this.lastTextT = 0;
  }
}

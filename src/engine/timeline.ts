import type { Team } from './types';

export type TimelineEventType =
  | 'hero-kill'
  | 'hero-death'
  | 'hero-respawn'
  | 'building-destroyed'
  | 'event-start'
  | 'event-end'
  | 'wave-spawn'
  | 'item-purchase'
  | 'item-use'
  | 'skill-cast'
  | 'recall-complete'
  | 'match-end';

export type TimelineCategory = 'combat' | 'objective' | 'economy' | 'system';
export type TimelineFilter = 'all' | TimelineCategory;

export const TIMELINE_LIMIT = 300;

export const TIMELINE_CATEGORY: Record<TimelineEventType, TimelineCategory> = {
  'hero-kill': 'combat',
  'hero-death': 'combat',
  'hero-respawn': 'combat',
  'skill-cast': 'combat',
  'building-destroyed': 'objective',
  'item-purchase': 'economy',
  'item-use': 'economy',
  'event-start': 'system',
  'event-end': 'system',
  'wave-spawn': 'system',
  'recall-complete': 'system',
  'match-end': 'system'
};

export const TIMELINE_CATEGORY_LABEL: Record<TimelineCategory, string> = {
  combat: '战斗',
  objective: '目标',
  economy: '经济',
  system: '系统'
};

export interface TimelineEvent {
  t: number;
  type: TimelineEventType;
  category: TimelineCategory;
  team: Team | null;
  actor: string;
  actorId: number | null;
  text: string;
  terminal?: boolean;
}

interface StoredEvent extends TimelineEvent {
  seq: number;
}

export interface TimelineEventInput {
  t: number;
  type: TimelineEventType;
  team: Team | null;
  actor: string;
  actorId?: number | null;
  text: string;
  terminal?: boolean;
}

function isTerminal(type: TimelineEventType, terminal?: boolean): boolean {
  return terminal === true || type === 'match-end';
}

export class TimelineRecorder {
  private events: StoredEvent[] = [];
  private keys = new Set<string>();
  private seq = 0;

  add(input: TimelineEventInput, dedupeKey?: string): boolean {
    if (dedupeKey !== undefined) {
      if (this.keys.has(dedupeKey)) return false;
      this.keys.add(dedupeKey);
    }
    const terminal = isTerminal(input.type, input.terminal);
    if (this.events.length >= TIMELINE_LIMIT) {
      const index = this.events.findIndex((event) => !event.terminal);
      if (index === -1 && !terminal) return false;
      if (index !== -1) this.events.splice(index, 1);
    }
    this.events.push({
      t: Math.max(0, input.t),
      type: input.type,
      category: TIMELINE_CATEGORY[input.type],
      team: input.team,
      actor: input.actor,
      actorId: input.actorId ?? null,
      text: input.text,
      terminal: terminal || undefined,
      seq: this.seq++
    });
    return true;
  }

  get size(): number {
    return this.events.length;
  }

  list(): TimelineEvent[] {
    return [...this.events]
      .sort((a, b) => a.t - b.t || a.seq - b.seq)
      .map(({ seq, ...event }) => {
        void seq;
        return event.terminal ? event : { ...event, terminal: undefined };
      });
  }
}

export function sanitizeTimeline(raw: unknown): TimelineEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: TimelineEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const type = entry.type;
    if (typeof type !== 'string' || !(type in TIMELINE_CATEGORY)) continue;
    if (typeof entry.t !== 'number' || !Number.isFinite(entry.t)) continue;
    if (typeof entry.text !== 'string' || entry.text.length === 0) continue;
    const team = entry.team === 0 || entry.team === 1 ? entry.team : null;
    events.push({
      t: Math.max(0, entry.t),
      type: type as TimelineEventType,
      category: TIMELINE_CATEGORY[type as TimelineEventType],
      team,
      actor: typeof entry.actor === 'string' && entry.actor ? entry.actor : '未知',
      actorId: typeof entry.actorId === 'number' ? entry.actorId : null,
      text: entry.text,
      terminal: entry.terminal === true || isTerminal(type as TimelineEventType) ? true : undefined
    });
  }
  return events.sort((a, b) => a.t - b.t);
}

export function filterTimeline(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  if (filter === 'all') return events;
  return events.filter((event) => event.category === filter);
}

export function formatMatchTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function teamLabel(team: Team | null): string {
  if (team === 0) return '蓝方';
  if (team === 1) return '红方';
  return '双方';
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function timelineToCsv(events: TimelineEvent[]): string {
  const header = 'time,type,category,team,actor,text';
  const rows = events.map((event) =>
    [formatMatchTime(event.t), event.type, event.category, teamLabel(event.team), event.actor, event.text]
      .map(csvCell)
      .join(',')
  );
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

export function timelineToJson(events: TimelineEvent[]): string {
  return JSON.stringify({ version: 1, events }, null, 2);
}

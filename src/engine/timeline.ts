import type { Team } from './types';

export type TimelineCategory = 'combat' | 'objective' | 'economy' | 'system';

export type TimelineEventType =
  | 'hero_kill'
  | 'hero_death'
  | 'hero_respawn'
  | 'building_destroyed'
  | 'event_start'
  | 'event_end'
  | 'wave_spawn'
  | 'item_purchase'
  | 'item_use'
  | 'skill_cast'
  | 'recall_complete'
  | 'match_end';

export const TIMELINE_CATEGORY: Record<TimelineEventType, TimelineCategory> = {
  hero_kill: 'combat',
  hero_death: 'combat',
  hero_respawn: 'combat',
  skill_cast: 'combat',
  building_destroyed: 'objective',
  event_start: 'objective',
  event_end: 'objective',
  wave_spawn: 'objective',
  item_purchase: 'economy',
  item_use: 'economy',
  recall_complete: 'system',
  match_end: 'system'
};

export const TIMELINE_EVENT_TYPES = Object.keys(TIMELINE_CATEGORY) as TimelineEventType[];

export const TIMELINE_LIMIT = 300;

export interface TimelineEvent {
  seq: number;
  time: number;
  type: TimelineEventType;
  category: TimelineCategory;
  team: Team | null;
  actor: string;
  text: string;
  pinned?: boolean;
}

export interface TimelineLogInput {
  time: number;
  type: TimelineEventType;
  team?: Team | null;
  actor?: string;
  text: string;
  pinned?: boolean;
  dedupeKey?: string;
}

export class TimelineRecorder {
  private events: TimelineEvent[] = [];
  private keys = new Set<string>();
  private seq = 0;

  constructor(readonly limit: number = TIMELINE_LIMIT) {}

  log(input: TimelineLogInput): TimelineEvent | null {
    if (input.dedupeKey !== undefined) {
      if (this.keys.has(input.dedupeKey)) return null;
      this.keys.add(input.dedupeKey);
    }
    const event: TimelineEvent = {
      seq: this.seq++,
      time: Math.max(0, Math.round(input.time * 100) / 100),
      type: input.type,
      category: TIMELINE_CATEGORY[input.type],
      team: input.team ?? null,
      actor: input.actor ?? '',
      text: input.text
    };
    if (input.pinned) event.pinned = true;
    this.events.push(event);
    this.trim();
    return event;
  }

  private trim() {
    while (this.events.length > this.limit) {
      const index = this.events.findIndex((event) => !event.pinned);
      if (index < 0) break;
      this.events.splice(index, 1);
    }
  }

  getEvents(): TimelineEvent[] {
    return sortTimeline(this.events);
  }

  get size(): number {
    return this.events.length;
  }
}

export function sortTimeline(events: readonly TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.time - b.time || a.seq - b.seq);
}

export type TimelineFilter = 'all' | TimelineCategory;

const KNOWN_TYPES = new Set<string>(TIMELINE_EVENT_TYPES);

export function normalizeTimeline(raw: unknown): TimelineEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: TimelineEvent[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    if (typeof record.type !== 'string' || !KNOWN_TYPES.has(record.type)) return;
    const type = record.type as TimelineEventType;
    const event: TimelineEvent = {
      seq: typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index,
      time: typeof record.time === 'number' && Number.isFinite(record.time) ? Math.max(0, record.time) : 0,
      type,
      category: TIMELINE_CATEGORY[type],
      team: record.team === 0 || record.team === 1 ? record.team : null,
      actor: typeof record.actor === 'string' ? record.actor : '',
      text: typeof record.text === 'string' ? record.text : ''
    };
    if (record.pinned === true) event.pinned = true;
    events.push(event);
  });
  return sortTimeline(events);
}

export function filterTimeline(events: readonly TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  const sorted = sortTimeline(events);
  if (filter === 'all') return sorted;
  return sorted.filter((event) => event.category === filter);
}

export function timelineToJSON(events: readonly TimelineEvent[]): string {
  return JSON.stringify(sortTimeline(events), null, 2);
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function timelineToCSV(events: readonly TimelineEvent[]): string {
  const header = 'time,type,category,team,actor,text';
  const rows = sortTimeline(events).map((event) =>
    [
      event.time,
      event.type,
      event.category,
      event.team === null ? '' : event.team,
      event.actor,
      event.text
    ]
      .map(csvCell)
      .join(',')
  );
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

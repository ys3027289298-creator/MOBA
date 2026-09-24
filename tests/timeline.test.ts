import { describe, expect, it, beforeEach } from 'vitest';
import { Game } from '../src/engine/game';
import { applyDamage } from '../src/engine/combat';
import {
  TIMELINE_CATEGORY,
  TIMELINE_EVENT_TYPES,
  TIMELINE_LIMIT,
  TimelineRecorder,
  filterTimeline,
  normalizeTimeline,
  timelineToCSV,
  timelineToJSON,
  type TimelineEvent
} from '../src/engine/timeline';
import { createTimelinePanel } from '../src/ui/timeline';
import { loadRecords, saveRecord, type MatchRecord } from '../src/storage';

const RECORDS_KEY = 'star-ring-arena-records';

function makeGame(player = 'emberfang', enemy = 'veilora') {
  return new Game({ mode: 'full', playerHero: player, enemyHero: enemy });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

function makeRecord(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    result: 'victory',
    duration: 600,
    playerHero: 'emberfang',
    enemyHero: 'veilora',
    kills: 3,
    deaths: 1,
    lastHits: 40,
    gold: 800,
    damage: 5000,
    date: new Date('2026-09-24T10:00:00Z').toISOString(),
    ...overrides
  };
}

describe('事件类型映射', () => {
  it('每种事件类型都有稳定的类别映射', () => {
    expect(TIMELINE_EVENT_TYPES.length).toBeGreaterThanOrEqual(12);
    for (const type of TIMELINE_EVENT_TYPES) {
      expect(['combat', 'objective', 'economy', 'system']).toContain(TIMELINE_CATEGORY[type]);
    }
    expect(TIMELINE_CATEGORY.hero_kill).toBe('combat');
    expect(TIMELINE_CATEGORY.building_destroyed).toBe('objective');
    expect(TIMELINE_CATEGORY.item_purchase).toBe('economy');
    expect(TIMELINE_CATEGORY.recall_complete).toBe('system');
    expect(TIMELINE_CATEGORY.match_end).toBe('system');
  });
});

describe('时间线记录器', () => {
  it('事件按比赛时间从早到晚排序', () => {
    const recorder = new TimelineRecorder();
    recorder.log({ time: 30, type: 'wave_spawn', text: 'b' });
    recorder.log({ time: 10, type: 'wave_spawn', text: 'a' });
    recorder.log({ time: 20, type: 'wave_spawn', text: 'c' });
    expect(recorder.getEvents().map((e) => e.text)).toEqual(['a', 'c', 'b']);
  });

  it('相同时间的事件保持写入顺序（稳定排序）', () => {
    const recorder = new TimelineRecorder();
    recorder.log({ time: 5, type: 'hero_kill', text: '先' });
    recorder.log({ time: 5, type: 'hero_death', text: '后' });
    recorder.log({ time: 5, type: 'skill_cast', text: '最后' });
    expect(recorder.getEvents().map((e) => e.text)).toEqual(['先', '后', '最后']);
  });

  it('同一去重键不会重复写入', () => {
    const recorder = new TimelineRecorder();
    recorder.log({ time: 1, type: 'wave_spawn', text: '第 1 波', dedupeKey: 'wave:1' });
    recorder.log({ time: 1, type: 'wave_spawn', text: '第 1 波', dedupeKey: 'wave:1' });
    expect(recorder.size).toBe(1);
  });

  it('时间线最多保留 300 条，超出丢弃最旧事件', () => {
    const recorder = new TimelineRecorder();
    for (let i = 0; i < TIMELINE_LIMIT + 50; i++) {
      recorder.log({ time: i, type: 'skill_cast', text: `事件 ${i}` });
    }
    const events = recorder.getEvents();
    expect(events.length).toBe(TIMELINE_LIMIT);
    expect(events[0].text).toBe('事件 50');
    expect(events[events.length - 1].text).toBe(`事件 ${TIMELINE_LIMIT + 49}`);
  });

  it('达到上限时保留终局事件（比赛结束、核心摧毁）', () => {
    const recorder = new TimelineRecorder();
    recorder.log({ time: 1, type: 'building_destroyed', text: '红方核心 被摧毁', pinned: true });
    recorder.log({ time: 2, type: 'match_end', text: '比赛结束（胜利）', pinned: true });
    for (let i = 0; i < TIMELINE_LIMIT + 20; i++) {
      recorder.log({ time: 10 + i, type: 'skill_cast', text: `普通 ${i}` });
    }
    const events = recorder.getEvents();
    expect(events.length).toBe(TIMELINE_LIMIT);
    expect(events.some((e) => e.type === 'match_end')).toBe(true);
    expect(events.some((e) => e.text.includes('核心'))).toBe(true);
    expect(events.some((e) => e.text === '普通 0')).toBe(false);
  });
});

describe('Game 关键事件记录', () => {
  it('击杀、死亡与复活都会写入时间线', () => {
    const game = makeGame();
    applyDamage(game, game.enemy, { amount: 999999, type: 'energy', source: game.player });
    let events = game.timeline.getEvents();
    const kill = events.find((e) => e.type === 'hero_kill');
    const death = events.find((e) => e.type === 'hero_death');
    expect(kill?.actor).toBe(game.player.name);
    expect(kill?.team).toBe(0);
    expect(kill?.text).toContain('击杀');
    expect(death?.actor).toBe(game.enemy.name);
    expect(death?.team).toBe(1);
    game.enemy.deadTimer = 0.01;
    tick(game, 0.2);
    events = game.timeline.getEvents();
    expect(events.some((e) => e.type === 'hero_respawn' && e.actor === game.enemy.name)).toBe(true);
  });

  it('炮塔与核心摧毁写入目标事件，核心事件被标记保留', () => {
    const game = makeGame();
    const turret = game.buildings.find((b) => b.kind === 'turret' && b.team === 1)!;
    const core = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    applyDamage(game, turret, { amount: 999999, type: 'energy', source: game.player });
    applyDamage(game, core, { amount: 999999, type: 'energy', source: game.player });
    const events = game.timeline.getEvents();
    const destroyed = events.filter((e) => e.type === 'building_destroyed');
    expect(destroyed.length).toBe(2);
    expect(destroyed[0].team).toBe(1);
    const coreEvent = destroyed.find((e) => e.text.includes('核心'));
    expect(coreEvent?.pinned).toBe(true);
  });

  it('动态事件开始与结束都会记录', () => {
    const game = makeGame();
    tick(game, 91);
    let events = game.timeline.getEvents();
    expect(events.some((e) => e.type === 'event_start' && e.text.includes('中央能量点'))).toBe(true);
    tick(game, 26);
    events = game.timeline.getEvents();
    expect(events.some((e) => e.type === 'event_end' && e.text.includes('中央能量点'))).toBe(true);
  });

  it('兵线生成按波次记录且不重复', () => {
    const game = makeGame();
    tick(game, 65);
    const waves = game.timeline.getEvents().filter((e) => e.type === 'wave_spawn');
    expect(waves.length).toBeGreaterThanOrEqual(2);
    const texts = waves.map((e) => e.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('购买装备与使用主动道具都会记录', () => {
    const game = makeGame();
    game.player.gold = 5000;
    expect(game.buyItem(game.player, 'blade')).toBe(true);
    expect(game.buyItem(game.player, 'potion')).toBe(true);
    expect(game.useItem(game.player, 'potion')).toBe(true);
    const events = game.timeline.getEvents();
    expect(events.some((e) => e.type === 'item_purchase' && e.text.includes('微晶短剑'))).toBe(true);
    expect(events.some((e) => e.type === 'item_use' && e.text.includes('星露补给'))).toBe(true);
    expect(events.find((e) => e.type === 'item_purchase')?.category).toBe('economy');
  });

  it('技能释放与回城完成都会记录', () => {
    const game = makeGame();
    game.player.skillLevels[1] = 1;
    expect(game.castSkill(game.player, 1, {})).toBe(true);
    game.recall(game.player);
    tick(game, 7);
    const events = game.timeline.getEvents();
    expect(events.some((e) => e.type === 'skill_cast' && e.actor === game.player.name)).toBe(true);
    expect(events.some((e) => e.type === 'recall_complete' && e.actor === game.player.name)).toBe(true);
  });

  it('比赛结束写入置顶的终局事件', () => {
    const game = makeGame();
    const core = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    applyDamage(game, core, { amount: 999999, type: 'energy', source: game.player });
    tick(game, 0.2);
    expect(game.result).toBe('victory');
    const end = game.timeline.getEvents().find((e) => e.type === 'match_end');
    expect(end).toBeDefined();
    expect(end?.pinned).toBe(true);
  });
});

describe('旧记录兼容与筛选', () => {
  beforeEach(() => localStorage.clear());

  it('读取没有 timeline 的旧记录时不补写、不破坏原数据', () => {
    const old = makeRecord();
    localStorage.setItem(RECORDS_KEY, JSON.stringify([old]));
    const loaded = loadRecords();
    expect(loaded.length).toBe(1);
    expect(loaded[0].timeline).toBeUndefined();
    expect(loaded[0]).toEqual(old);
    expect(normalizeTimeline(loaded[0].timeline)).toEqual([]);
  });

  it('保存新记录只增加可选 timeline 字段，20 条上限不变', () => {
    const oldRecords = Array.from({ length: 20 }, (_, i) => makeRecord({ kills: i }));
    localStorage.setItem(RECORDS_KEY, JSON.stringify(oldRecords));
    saveRecord(makeRecord({ kills: 999, timeline: normalizeTimeline([]) }));
    const loaded = loadRecords();
    expect(loaded.length).toBe(20);
    expect(loaded[0].kills).toBe(999);
    expect(loaded[0].timeline).toEqual([]);
    expect(loaded[1].kills).toBe(0);
    expect(loaded[1].timeline).toBeUndefined();
  });

  it('四类筛选只返回对应类别，全部筛选按时间排序', () => {
    const recorder = new TimelineRecorder();
    recorder.log({ time: 4, type: 'item_purchase', text: '买' });
    recorder.log({ time: 1, type: 'hero_kill', text: '杀' });
    recorder.log({ time: 3, type: 'building_destroyed', text: '塔' });
    recorder.log({ time: 2, type: 'recall_complete', text: '回城' });
    const events = recorder.getEvents();
    expect(filterTimeline(events, 'all').map((e) => e.text)).toEqual(['杀', '回城', '塔', '买']);
    expect(filterTimeline(events, 'combat').map((e) => e.text)).toEqual(['杀']);
    expect(filterTimeline(events, 'objective').map((e) => e.text)).toEqual(['塔']);
    expect(filterTimeline(events, 'economy').map((e) => e.text)).toEqual(['买']);
    expect(filterTimeline(events, 'system').map((e) => e.text)).toEqual(['回城']);
  });

  it('未知事件类型与缺失字段被安全处理', () => {
    const raw = [
      { type: 'mystery_event', time: 1, text: '未知' },
      null,
      'garbage',
      { type: 'hero_kill', time: 5 },
      { type: 'wave_spawn', time: 'bad', team: 7, actor: 42, text: '波次' }
    ];
    const events = normalizeTimeline(raw);
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('wave_spawn');
    expect(events[0].time).toBe(0);
    expect(events[0].team).toBeNull();
    expect(events[0].actor).toBe('');
    expect(events[1].type).toBe('hero_kill');
    expect(events[1].text).toBe('');
  });
});

describe('导出 JSON / CSV', () => {
  const sample: TimelineEvent[] = normalizeTimeline([
    { seq: 0, time: 12.5, type: 'hero_kill', team: 0, actor: '烬牙', text: '烬牙 击杀了 "薇洛菈", 完成首杀' },
    { seq: 1, time: 20, type: 'match_end', team: null, actor: '', text: '比赛结束（胜利）\n核心被摧毁' }
  ]);

  it('JSON 导出可完整解析且顺序稳定', () => {
    const parsed = JSON.parse(timelineToJSON(sample)) as TimelineEvent[];
    expect(parsed.length).toBe(2);
    expect(parsed[0].text).toContain('烬牙');
    expect(parsed[1].type).toBe('match_end');
  });

  it('CSV 对逗号、换行、引号与中文安全转义', () => {
    const csv = timelineToCSV(sample);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('time,type,category,team,actor,text');
    expect(lines[1]).toContain('"烬牙 击杀了 ""薇洛菈"", 完成首杀"');
    expect(lines[2]).toContain('"比赛结束（胜利）\n核心被摧毁"');
    expect(lines[2]).toContain('match_end');
  });
});

describe('时间线面板空状态与导出行为', () => {
  it('没有事件时显示安全空状态，导出给出提示且不下载', () => {
    const downloads: string[] = [];
    const panel = createTimelinePanel(undefined, { download: (name) => downloads.push(name) });
    expect(panel.textContent).toContain('暂无时间线事件');
    const buttons = panel.querySelectorAll('button');
    const exportJSON = [...buttons].find((b) => b.textContent?.includes('JSON'))!;
    exportJSON.click();
    expect(downloads.length).toBe(0);
    expect(panel.textContent).toContain('没有事件可导出');
  });

  it('导出内容与当前筛选结果一致', () => {
    const recorder = new TimelineRecorder();
    recorder.log({ time: 1, type: 'hero_kill', actor: '烬牙', text: '击杀' });
    recorder.log({ time: 2, type: 'item_purchase', actor: '烬牙', text: '购买' });
    const downloads: { name: string; content: string }[] = [];
    const panel = createTimelinePanel(recorder.getEvents(), {
      download: (name, content) => downloads.push({ name, content })
    });
    const filterButtons = [...panel.querySelectorAll<HTMLButtonElement>('.timeline-filters button')];
    filterButtons.find((b) => b.textContent === '战斗')!.click();
    [...panel.querySelectorAll<HTMLButtonElement>('.timeline-exports button')].find((b) => b.textContent?.includes('JSON'))!.click();
    expect(downloads.length).toBe(1);
    const exported = JSON.parse(downloads[0].content) as TimelineEvent[];
    expect(exported.length).toBe(1);
    expect(exported[0].type).toBe('hero_kill');
    filterButtons.find((b) => b.textContent === '全部')!.click();
    [...panel.querySelectorAll<HTMLButtonElement>('.timeline-exports button')].find((b) => b.textContent?.includes('CSV'))!.click();
    expect(downloads[1].content).toContain('hero_kill');
    expect(downloads[1].content).toContain('item_purchase');
  });
});

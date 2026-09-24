import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import {
  filterTimeline,
  formatMatchTime,
  sanitizeTimeline,
  teamLabel,
  TimelineRecorder,
  timelineToCsv,
  timelineToJson,
  TIMELINE_CATEGORY,
  TIMELINE_LIMIT,
  type TimelineEvent,
  type TimelineEventType
} from '../src/engine/timeline';
import { buildMatchRecord } from '../src/game/record';
import { createTimelinePanel } from '../src/ui/timelinePanel';
import { loadRecords, saveRecord, type MatchRecord } from '../src/storage';
import { BLUE_BASE } from '../src/engine/map';

function makeGame(player = 'emberfang', enemy = 'veilora') {
  return new Game({ mode: 'full', playerHero: player, enemyHero: enemy });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

function makeEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    t: 10,
    type: 'hero-kill',
    category: 'combat',
    team: 0,
    actor: '烬牙',
    actorId: 1,
    text: '烬牙 击杀了 薇洛菈',
    ...overrides
  };
}

describe('时间线记录器', () => {
  it('每种事件类型都映射到合法类别', () => {
    const types: TimelineEventType[] = [
      'hero-kill', 'hero-death', 'hero-respawn', 'building-destroyed', 'event-start', 'event-end',
      'wave-spawn', 'item-purchase', 'item-use', 'skill-cast', 'recall-complete', 'match-end'
    ];
    for (const type of types) expect(['combat', 'objective', 'economy', 'system']).toContain(TIMELINE_CATEGORY[type]);
    expect(TIMELINE_CATEGORY['item-purchase']).toBe('economy');
    expect(TIMELINE_CATEGORY['building-destroyed']).toBe('objective');
    expect(TIMELINE_CATEGORY['hero-kill']).toBe('combat');
    expect(TIMELINE_CATEGORY['match-end']).toBe('system');
  });

  it('事件按比赛时间从早到晚排序', () => {
    const recorder = new TimelineRecorder();
    recorder.add({ t: 30, type: 'wave-spawn', team: null, actor: '兵线', text: '第 2 波' });
    recorder.add({ t: 5, type: 'wave-spawn', team: null, actor: '兵线', text: '第 1 波' });
    recorder.add({ t: 60, type: 'wave-spawn', team: null, actor: '兵线', text: '第 3 波' });
    expect(recorder.list().map((e) => e.t)).toEqual([5, 30, 60]);
  });

  it('相同时间的事件保持写入顺序（稳定排序）', () => {
    const recorder = new TimelineRecorder();
    recorder.add({ t: 10, type: 'hero-kill', team: 0, actor: 'A', text: '先发生' });
    recorder.add({ t: 10, type: 'hero-death', team: 1, actor: 'B', text: '后发生' });
    recorder.add({ t: 10, type: 'wave-spawn', team: null, actor: '兵线', text: '最后' });
    expect(recorder.list().map((e) => e.text)).toEqual(['先发生', '后发生', '最后']);
  });

  it('同一去重键只写入一条事件', () => {
    const recorder = new TimelineRecorder();
    recorder.add({ t: 1, type: 'wave-spawn', team: null, actor: '兵线', text: '第 1 波兵线生成' }, 'wave:1');
    recorder.add({ t: 1, type: 'wave-spawn', team: null, actor: '兵线', text: '第 1 波兵线生成' }, 'wave:1');
    expect(recorder.size).toBe(1);
  });

  it('时间线最多保留 300 条，超出丢弃最旧事件', () => {
    const recorder = new TimelineRecorder();
    for (let i = 0; i < TIMELINE_LIMIT + 50; i++) {
      recorder.add({ t: i, type: 'wave-spawn', team: null, actor: '兵线', text: `事件 ${i}` });
    }
    const list = recorder.list();
    expect(list.length).toBe(TIMELINE_LIMIT);
    expect(list[0].text).toBe('事件 50');
    expect(list[list.length - 1].text).toBe(`事件 ${TIMELINE_LIMIT + 49}`);
  });

  it('超出上限时保留终局事件', () => {
    const recorder = new TimelineRecorder();
    recorder.add({ t: 0, type: 'building-destroyed', team: 1, actor: '核心', text: '赤曜基地核心 被摧毁', terminal: true });
    for (let i = 1; i <= TIMELINE_LIMIT + 20; i++) {
      recorder.add({ t: i, type: 'wave-spawn', team: null, actor: '兵线', text: `事件 ${i}` });
    }
    recorder.add({ t: 9999, type: 'match-end', team: null, actor: '比赛', text: '比赛结束：胜利', terminal: true });
    const list = recorder.list();
    expect(list.length).toBe(TIMELINE_LIMIT);
    expect(list.some((e) => e.type === 'match-end')).toBe(true);
    expect(list.some((e) => e.text.includes('核心 被摧毁'))).toBe(true);
  });
});

describe('Game 时间线事件接入', () => {
  it('击杀、死亡与复活都会记录', () => {
    const game = makeGame();
    game.enemy.pos = { ...game.player.pos };
    game.onDeath(game.enemy, game.player);
    tick(game, 45);
    const types = game.timeline.list().map((e) => e.type);
    expect(types).toContain('hero-kill');
    expect(types).toContain('hero-death');
    expect(types).toContain('hero-respawn');
    const kill = game.timeline.list().find((e) => e.type === 'hero-kill')!;
    expect(kill.team).toBe(0);
    expect(kill.text).toContain('击杀');
  });

  it('炮塔与核心摧毁会记录，核心为终局事件', () => {
    const game = makeGame();
    const turret = game.buildings.find((b) => b.kind === 'turret' && b.team === 1)!;
    const core = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    game.onDeath(turret, game.player);
    game.onDeath(core, game.player);
    game.update(0.05);
    const events = game.timeline.list().filter((e) => e.type === 'building-destroyed');
    expect(events.length).toBe(2);
    expect(events.find((e) => e.actorId === core.id)?.terminal).toBe(true);
    expect(events.find((e) => e.actorId === turret.id)?.terminal).toBeUndefined();
    expect(game.timeline.list().some((e) => e.type === 'match-end')).toBe(true);
  });

  it('动态事件开始与结束会记录', () => {
    const game = makeGame();
    const event = game.events.find((e) => e.id === 'storm')!;
    event.startsIn = 0.01;
    tick(game, 0.2);
    expect(game.timeline.list().some((e) => e.type === 'event-start' && e.text.includes('离子风暴'))).toBe(true);
    event.startsIn = 0.01;
    tick(game, 0.2);
    expect(game.timeline.list().some((e) => e.type === 'event-end' && e.text.includes('离子风暴'))).toBe(true);
  });

  it('兵线生成、购买装备与主动道具使用会记录', () => {
    const game = makeGame();
    tick(game, 4);
    expect(game.timeline.list().some((e) => e.type === 'wave-spawn')).toBe(true);
    game.player.pos = { ...BLUE_BASE };
    game.player.gold = 5000;
    expect(game.buyItem(game.player, 'potion')).toBe(true);
    expect(game.useItem(game.player, 'potion')).toBe(true);
    const types = game.timeline.list().map((e) => e.type);
    expect(types).toContain('item-purchase');
    expect(types).toContain('item-use');
    expect(game.timeline.list().find((e) => e.type === 'item-purchase')?.category).toBe('economy');
  });

  it('技能释放与回城完成会记录', () => {
    const game = makeGame('veilora', 'emberfang');
    const hero = game.player;
    hero.skillLevels[0] = 1;
    expect(game.castSkill(hero, 0, { point: { x: hero.pos.x + 100, y: hero.pos.y } })).toBe(true);
    expect(game.timeline.list().some((e) => e.type === 'skill-cast' && e.text.includes('星辉弹'))).toBe(true);
    game.recall(hero);
    tick(game, 7);
    expect(game.timeline.list().some((e) => e.type === 'recall-complete')).toBe(true);
  });
});

describe('旧记录兼容与筛选', () => {
  it('没有 timeline 字段的旧记录清洗为空数组', () => {
    const legacy = { result: 'victory', duration: 100 } as unknown as MatchRecord;
    expect(sanitizeTimeline(legacy.timeline)).toEqual([]);
  });

  it('20 条旧记录读取不破坏原数据，保存只增加可选字段', () => {
    localStorage.clear();
    const legacyRecords = Array.from({ length: 20 }, (_, i) => ({
      result: 'victory', duration: 100 + i, playerHero: 'emberfang', enemyHero: 'veilora',
      kills: i, deaths: 0, lastHits: 10, gold: 500, damage: 1000, date: `2026-01-${String(i + 1).padStart(2, '0')}`
    }));
    localStorage.setItem('star-ring-arena-records', JSON.stringify(legacyRecords));
    const loaded = loadRecords();
    expect(loaded.length).toBe(20);
    expect(loaded.every((r) => r.timeline === undefined)).toBe(true);
    const game = makeGame();
    saveRecord(buildMatchRecord(game));
    const after = loadRecords();
    expect(after.length).toBe(20);
    expect(after[0].timeline).toBeDefined();
    expect(after[1].timeline).toBeUndefined();
    expect(after[1].kills).toBe(0);
  });

  it('四类筛选只保留对应类别', () => {
    const events = [
      makeEvent({ type: 'hero-kill', category: 'combat' }),
      makeEvent({ type: 'building-destroyed', category: 'objective' }),
      makeEvent({ type: 'item-purchase', category: 'economy' }),
      makeEvent({ type: 'wave-spawn', category: 'system' })
    ];
    expect(filterTimeline(events, 'all').length).toBe(4);
    expect(filterTimeline(events, 'combat').map((e) => e.type)).toEqual(['hero-kill']);
    expect(filterTimeline(events, 'objective').map((e) => e.type)).toEqual(['building-destroyed']);
    expect(filterTimeline(events, 'economy').map((e) => e.type)).toEqual(['item-purchase']);
    expect(filterTimeline(events, 'system').map((e) => e.type)).toEqual(['wave-spawn']);
  });

  it('未知事件类型与缺失字段被安全丢弃', () => {
    const raw = [
      { t: 1, type: 'hero-kill', team: 0, actor: 'A', text: '正常事件' },
      { t: 2, type: 'teleport-glitch', team: 0, actor: 'A', text: '未知类型' },
      { t: 'abc', type: 'hero-kill', team: 0, actor: 'A', text: '坏时间' },
      { t: 3, type: 'hero-kill', team: 0 },
      null,
      'garbage'
    ];
    const cleaned = sanitizeTimeline(raw);
    expect(cleaned.length).toBe(1);
    expect(cleaned[0].text).toBe('正常事件');
  });
});

describe('导出与时间线工具', () => {
  it('CSV 对逗号、换行、引号和中文安全转义', () => {
    const events = [makeEvent({ text: '击杀 "王者",\n随后撤退，漂亮' })];
    const csv = timelineToCsv(events);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('time,type,category,team,actor,text');
    expect(lines[1]).toContain('"击杀 ""王者"",\n随后撤退，漂亮"');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('蓝方');
  });

  it('JSON 导出可完整解析且只包含给定事件', () => {
    const events = [makeEvent(), makeEvent({ t: 20, type: 'match-end', category: 'system', terminal: true })];
    const parsed = JSON.parse(timelineToJson(events));
    expect(parsed.version).toBe(1);
    expect(parsed.events.length).toBe(2);
    expect(parsed.events[1].type).toBe('match-end');
  });

  it('时间格式与队伍标签正确', () => {
    expect(formatMatchTime(0)).toBe('0:00');
    expect(formatMatchTime(754)).toBe('12:34');
    expect(teamLabel(0)).toBe('蓝方');
    expect(teamLabel(1)).toBe('红方');
    expect(teamLabel(null)).toBe('双方');
  });
});

describe('结果页时间线面板（页面级）', () => {
  it('从比赛结束到结果页展示时间线，支持筛选与安全空状态', () => {
    localStorage.clear();
    const game = makeGame();
    tick(game, 4);
    game.onDeath(game.enemy, game.player);
    const core = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    game.onDeath(core, game.player);
    tick(game, 0.2);
    expect(game.result).toBe('victory');
    const record = buildMatchRecord(game);
    saveRecord(record);
    const stored = loadRecords()[0];
    expect(stored.timeline!.some((e) => e.type === 'match-end')).toBe(true);

    document.body.innerHTML = '';
    const panel = createTimelinePanel(stored);
    document.body.append(panel);
    const rows = panel.querySelectorAll('.timeline-row');
    expect(rows.length).toBe(stored.timeline!.length);
    expect(panel.textContent).toContain('战况时间线');
    expect(panel.textContent).toContain('比赛结束');

    const combatButton = panel.querySelector<HTMLButtonElement>('button[data-filter="combat"]')!;
    combatButton.click();
    const combatRows = panel.querySelectorAll('.timeline-row');
    expect(combatRows.length).toBeGreaterThan(0);
    expect(combatRows.length).toBeLessThan(rows.length);

    const legacyPanel = createTimelinePanel({ ...stored, timeline: undefined });
    expect(legacyPanel.querySelector('.timeline-empty')?.textContent).toContain('没有可显示的时间线事件');

    const brokenPanel = createTimelinePanel({ ...stored, timeline: [{ t: 1, type: 'mystery', text: '?' }] as never });
    expect(brokenPanel.querySelector('.timeline-empty')).not.toBeNull();
  });
});

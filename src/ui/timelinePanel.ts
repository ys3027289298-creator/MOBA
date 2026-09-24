import {
  filterTimeline,
 formatMatchTime,
 sanitizeTimeline,
 teamLabel,
 timelineToCsv,
 timelineToJson,
 TIMELINE_CATEGORY_LABEL,
 type TimelineEvent,
 type TimelineFilter
} from '../engine/timeline';
import type { MatchRecord } from '../storage';

const FILTERS: Array<{ key: TimelineFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'combat', label: '战斗' },
  { key: 'objective', label: '目标' },
  { key: 'economy', label: '经济' },
  { key: 'system', label: '系统' }
];

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderRow(event: TimelineEvent): HTMLElement {
  const row = document.createElement('div');
  row.className = `timeline-row cat-${event.category}`;
  const time = document.createElement('span');
  time.className = 'timeline-time';
  time.textContent = formatMatchTime(event.t);
  const team = document.createElement('span');
  team.className = `timeline-team team-${event.team ?? 'all'}`;
  team.textContent = teamLabel(event.team);
  const text = document.createElement('span');
  text.className = 'timeline-text';
  text.textContent = event.text;
  const category = document.createElement('span');
  category.className = 'timeline-category';
  category.textContent = TIMELINE_CATEGORY_LABEL[event.category] ?? '系统';
  row.append(time, team, text, category);
  return row;
}

export function createTimelinePanel(record: MatchRecord): HTMLElement {
  const events = sanitizeTimeline(record.timeline);
  let currentFilter: TimelineFilter = 'all';

  const panel = document.createElement('div');
  panel.className = 'timeline-panel';

  const title = document.createElement('h2');
  title.textContent = '战况时间线';
  panel.append(title);

  const filters = document.createElement('div');
  filters.className = 'timeline-filters';
  panel.append(filters);

  const list = document.createElement('div');
  list.className = 'timeline-list';
  panel.append(list);

  const hint = document.createElement('div');
  hint.className = 'timeline-hint';
  panel.append(hint);

  const actions = document.createElement('div');
  actions.className = 'timeline-actions';
  const exportJson = document.createElement('button');
  exportJson.textContent = '导出本场时间线 JSON';
  const exportCsv = document.createElement('button');
  exportCsv.textContent = '导出本场时间线 CSV';
  actions.append(exportJson, exportCsv);
  panel.append(actions);

  const currentEvents = () => filterTimeline(events, currentFilter);

  const showHint = (text: string) => {
    hint.textContent = text;
    window.setTimeout(() => {
      if (hint.textContent === text) hint.textContent = '';
    }, 3000);
  };

  const renderList = () => {
    list.innerHTML = '';
    const visible = currentEvents();
    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'timeline-empty';
      empty.textContent = events.length === 0 ? '本场比赛没有可显示的时间线事件' : '当前筛选下没有时间线事件';
      list.append(empty);
      return;
    }
    for (const event of visible) list.append(renderRow(event));
  };

  for (const { key, label } of FILTERS) {
    const button = document.createElement('button');
    button.textContent = label;
    button.dataset.filter = key;
    if (key === currentFilter) button.classList.add('active');
    button.onclick = () => {
      currentFilter = key;
      filters.querySelectorAll('button').forEach((node) => node.classList.toggle('active', (node as HTMLElement).dataset.filter === key));
      renderList();
    };
    filters.append(button);
  }

  exportJson.onclick = () => {
    const visible = currentEvents();
    if (visible.length === 0) {
      showHint('当前筛选下没有事件，未生成导出文件');
      return;
    }
    download(`timeline-${record.date}.json`, timelineToJson(visible), 'application/json');
  };
  exportCsv.onclick = () => {
    const visible = currentEvents();
    if (visible.length === 0) {
      showHint('当前筛选下没有事件，未生成导出文件');
      return;
    }
    download(`timeline-${record.date}.csv`, timelineToCsv(visible), 'text/csv;charset=utf-8');
  };

  renderList();
  return panel;
}

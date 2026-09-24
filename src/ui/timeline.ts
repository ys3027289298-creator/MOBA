import {
  filterTimeline,
  normalizeTimeline,
  timelineToCSV,
  timelineToJSON,
  type TimelineCategory,
  type TimelineEvent,
  type TimelineFilter
} from '../engine/timeline';

export interface TimelinePanelDeps {
  download?: (filename: string, content: string, mime: string) => void;
}

const FILTERS: { id: TimelineFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'combat', label: '战斗' },
  { id: 'objective', label: '目标' },
  { id: 'economy', label: '经济' },
  { id: 'system', label: '系统' }
];

const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  combat: '战斗',
  objective: '目标',
  economy: '经济',
  system: '系统'
};

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function teamLabel(team: TimelineEvent['team']): string {
  if (team === 0) return '蓝方';
  if (team === 1) return '红方';
  return '—';
}

function defaultDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function createTimelinePanel(rawTimeline: unknown, deps: TimelinePanelDeps = {}): HTMLElement {
  const events = normalizeTimeline(rawTimeline);
  const download = deps.download ?? defaultDownload;
  let filter: TimelineFilter = 'all';

  const panel = document.createElement('div');
  panel.className = 'timeline-panel';

  const title = document.createElement('h3');
  title.className = 'timeline-title';
  title.textContent = '战况时间线';

  const filterBar = document.createElement('div');
  filterBar.className = 'timeline-filters';
  const filterButtons = new Map<TimelineFilter, HTMLButtonElement>();
  for (const item of FILTERS) {
    const button = document.createElement('button');
    button.textContent = item.label;
    button.dataset.filter = item.id;
    button.onclick = () => {
      filter = item.id;
      filterButtons.forEach((b, id) => b.classList.toggle('active', id === filter));
      renderList();
    };
    filterButtons.set(item.id, button);
    filterBar.append(button);
  }
  filterButtons.get('all')!.classList.add('active');

  const exportBar = document.createElement('div');
  exportBar.className = 'timeline-exports';
  const exportJSON = document.createElement('button');
  exportJSON.textContent = '导出本场时间线 JSON';
  const exportCSV = document.createElement('button');
  exportCSV.textContent = '导出本场时间线 CSV';
  exportBar.append(exportJSON, exportCSV);

  const hint = document.createElement('div');
  hint.className = 'timeline-hint';

  const list = document.createElement('div');
  list.className = 'timeline-list';

  function currentEvents(): TimelineEvent[] {
    return filterTimeline(events, filter);
  }

  function renderList() {
    const shown = currentEvents();
    list.innerHTML = '';
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'timeline-empty';
      empty.textContent = events.length ? '当前筛选下暂无事件' : '暂无时间线事件（旧记录或未记录到关键事件）';
      list.append(empty);
      return;
    }
    for (const event of shown) {
      const row = document.createElement('div');
      row.className = 'timeline-item';
      row.dataset.type = event.type;
      const time = document.createElement('span');
      time.className = 'timeline-time';
      time.textContent = fmtTime(event.time);
      const team = document.createElement('span');
      team.className = `timeline-team team-${event.team ?? 'none'}`;
      team.textContent = teamLabel(event.team);
      const text = document.createElement('span');
      text.className = 'timeline-text';
      text.textContent = event.text || '（未知事件）';
      const category = document.createElement('span');
      category.className = 'timeline-category';
      category.textContent = CATEGORY_LABEL[event.category] ?? '系统';
      row.append(time, team, text, category);
      list.append(row);
    }
  }

  function exportFile(kind: 'json' | 'csv') {
    const shown = currentEvents();
    if (!shown.length) {
      hint.textContent = '当前筛选下没有事件可导出';
      return;
    }
    hint.textContent = '';
    if (kind === 'json') download('match-timeline.json', timelineToJSON(shown), 'application/json');
    else download('match-timeline.csv', timelineToCSV(shown), 'text/csv;charset=utf-8');
  }

  exportJSON.onclick = () => exportFile('json');
  exportCSV.onclick = () => exportFile('csv');

  panel.append(title, filterBar, exportBar, hint, list);
  renderList();
  return panel;
}

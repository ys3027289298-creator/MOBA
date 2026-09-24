import Phaser from 'phaser';
import './styles.css';
import { HEROES, getHeroDef } from './data/heroes';
import { ITEMS } from './data/items';
import { MAP_H, MAP_W } from './engine/map';
import { ArenaScene, type SceneCallbacks } from './game/ArenaScene';
import { Game, type GameConfig } from './engine/game';
import { DEFAULT_TRAINING_CONFIG, TRAINING_LIMITS, normalizeTrainingConfig, type TrainingConfig } from './engine/training';
import { ShopPanel } from './ui/shop';
import { TrainingPanel } from './ui/trainingPanel';
import { loadRecords, loadSettings, saveSettings, type MatchRecord } from './storage';

const app = document.querySelector<HTMLDivElement>('#app')!;
let phaser: Phaser.Game | null = null;
let model: Game | null = null;
let shop: ShopPanel | null = null;
let trainingPanel: TrainingPanel | null = null;
let shopTimer: number | undefined;
let keyHandler: ((event: KeyboardEvent) => void) | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.innerHTML = html;
  return node;
}

function fmtTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderMenu() {
  app.innerHTML = '';
  const settings = loadSettings();
  const screen = el('div', 'screen');
  screen.append(
    el('div', 'logo', '星环决斗场'),
    el('div', 'subtitle', '原创 1v1 俯视角 MOBA｜单线推进 · 双塔核心 · 草丛视野 · 动态事件'),
    (() => {
      const actions = el('div', 'menu-actions');
      actions.append(
    Object.assign(el('button', '', '完整对战（推荐：烬牙）'), { onclick: () => renderHeroSelect('full') }),
    Object.assign(el('button', '', '练习模式（推荐：薇洛菈）'), { onclick: () => renderHeroSelect('practice') }),
    Object.assign(el('button', '', '设置'), { onclick: renderSettings }),
    Object.assign(el('button', '', '对战记录'), { onclick: renderRecords })
      );
      return actions;
    })(),
    el('div', 'subtitle', `提示：练习模式可快速熟悉技能；完整对战约 10–15 分钟。音效音量 ${Math.round(settings.sfxVolume * 100)}%`)
  );
  app.append(screen);
}

function renderHeroSelect(mode: GameConfig['mode']) {
  app.innerHTML = '';
  let selected = mode === 'practice' ? 'veilora' : 'emberfang';
  const trainingInput: Partial<TrainingConfig> = { ...DEFAULT_TRAINING_CONFIG };
  const screen = el('div', 'screen');
  screen.append(el('div', 'logo', mode === 'practice' ? '选择练习英雄' : '选择决斗英雄'));
  const grid = el('div', 'hero-grid');
  const cards = new Map<string, HTMLDivElement>();
  for (const hero of HEROES) {
    const card = el('div', 'hero-card') as HTMLDivElement;
    card.style.setProperty('--hero', `#${hero.color.toString(16).padStart(6, '0')}`);
    card.innerHTML = `
      <div class="hero-portrait" style="background:radial-gradient(circle,#${hero.color.toString(16).padStart(6, '0')},#111827)">${hero.name[0]}</div>
      <h2>${hero.name}</h2><div class="role">${hero.role}</div><p>${hero.blurb}</p>
      <ul>${hero.skills.map((s) => `<li><b>${s.key}</b> ${s.name}：${s.description}</li>`).join('')}</ul>
      <p>推荐：${hero.recommended.map((id) => ITEMS.find((i) => i.id === id)?.name).join('、')}</p>`;
    card.onclick = () => {
      selected = hero.id;
      cards.forEach((c, id) => c.classList.toggle('selected', id === selected));
    };
    cards.set(hero.id, card);
    grid.append(card);
  }
  cards.get(selected)?.classList.add('selected');
  const actions = el('div', 'menu-actions');
  actions.append(
    Object.assign(el('button', 'primary', '进入对战'), {
      onclick: () => startGame(mode, selected, mode === 'practice' ? normalizeTrainingConfig(trainingInput) : undefined)
    }),
    Object.assign(el('button', '', '返回主菜单'), { onclick: renderMenu })
  );
  screen.append(grid);
  if (mode === 'practice') screen.append(renderTrainingConfig(trainingInput));
  screen.append(actions);
  app.append(screen);
}

function renderTrainingConfig(state: Partial<TrainingConfig>) {
  const panel = el('div', 'training-config');
  panel.append(el('div', 'training-config-title', '训练配置'));
  const numberRow = (label: string, key: 'startLevel' | 'startGold', min: number, max: number, step: number, id: string) => {
    const row = el('label', 'training-row', `<span>${label}</span>`);
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(state[key]);
    input.onchange = () => { state[key] = Number(input.value); };
    row.append(input);
    return row;
  };
  const checkRow = (label: string, key: 'fullMana' | 'enemyEnabled' | 'autoWaves', id: string) => {
    const row = el('label', 'training-row', `<span>${label}</span>`);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = Boolean(state[key]);
    input.onchange = () => { state[key] = input.checked; };
    row.append(input);
    return row;
  };
  panel.append(
    numberRow(`初始等级（${TRAINING_LIMITS.minLevel}–${TRAINING_LIMITS.maxLevel}）`, 'startLevel', TRAINING_LIMITS.minLevel, TRAINING_LIMITS.maxLevel, 1, 'train-level'),
    numberRow(`初始金币（${TRAINING_LIMITS.minGold}–${TRAINING_LIMITS.maxGold}）`, 'startGold', TRAINING_LIMITS.minGold, TRAINING_LIMITS.maxGold, 100, 'train-gold'),
    checkRow('初始满法力', 'fullMana', 'train-fullmana'),
    checkRow('开启电脑对手', 'enemyEnabled', 'train-enemy'),
    checkRow('自动生成兵线', 'autoWaves', 'train-waves')
  );
  return panel;
}

function startGame(mode: GameConfig['mode'], heroId: string, training?: TrainingConfig) {
  app.innerHTML = '';
  model = new Game({ mode, playerHero: heroId, training: mode === 'practice' ? training : undefined });
  const screen = el('div', 'screen', '') as HTMLDivElement;
  screen.classList.remove('screen');
  screen.id = 'game-screen';
  const container = el('div', '', '');
  container.id = 'phaser-container';
  const topButtons = el('div', 'top-buttons');
  const pauseButton = el('button', '', '暂停 (P)');
  const restartButton = el('button', '', '重新开始');
  const exitButton = el('button', '', '返回主菜单');
  topButtons.append(pauseButton, restartButton, exitButton);
  shop = new ShopPanel(model, undefined);
  screen.append(container, shop.element, topButtons);
  trainingPanel = null;
  if (mode === 'practice') {
    trainingPanel = new TrainingPanel(model);
    screen.append(trainingPanel.element);
  }
  app.append(screen);
  const callbacks: SceneCallbacks = { onEnd: showResult, onExit: renderMenu };
  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#050b16',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: ArenaScene
  });
  (window as unknown as { __starRingGame?: Game }).__starRingGame = model;
  phaser.scene.start('arena', { model, callbacks });
  const refreshShop = () => shop?.render();
  shopTimer = window.setInterval(() => {
    if (model?.result === 'running') shop?.render();
    trainingPanel?.refresh();
  }, 1000);
  pauseButton.onclick = () => togglePause(true);
  restartButton.onclick = () => { destroyPhaser(); startGame(mode, heroId, training); };
  exitButton.onclick = () => { destroyPhaser(); renderMenu(); };
  keyHandler = onKey;
  window.addEventListener('keydown', onKey);
  function onKey(event: KeyboardEvent) {
    if (!model) return;
    if (event.key.toLowerCase() === 'p') togglePause(model.paused ? false : true);
    if (event.key === 'Escape') togglePause(model.paused ? false : true);
  }
  function togglePause(paused: boolean) {
    model!.paused = paused;
    trainingPanel?.refresh();
    let overlay = document.querySelector('.pause-overlay');
    if (paused && !overlay) {
      overlay = el('div', 'pause-overlay');
      overlay.innerHTML = '<h1>已暂停</h1>';
      const resume = el('button', '', '继续游戏');
      const restart = el('button', '', '重新开始');
      const exit = el('button', '', '返回主菜单');
      resume.onclick = () => togglePause(false);
      restart.onclick = () => { destroyPhaser(); startGame(mode, heroId, training); };
      exit.onclick = () => { destroyPhaser(); renderMenu(); };
      overlay.append(resume, restart, exit);
      screen.append(overlay);
    } else if (!paused && overlay) {
      overlay.remove();
    }
  }
  void refreshShop;
}

function destroyPhaser() {
  if (shopTimer !== undefined) window.clearInterval(shopTimer);
  shopTimer = undefined;
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = undefined;
  phaser?.destroy(true);
  phaser = null;
  model = null;
  trainingPanel = null;
}

function showResult(record: MatchRecord) {
  if (!model) return;
  const finalModel = model;
  const hero = finalModel.player;
  const title = record.result === 'victory' ? '胜利' : record.result === 'defeat' ? '失败' : '超时';
  const color = record.result === 'victory' ? '#80ed99' : record.result === 'timeout' ? '#ffd166' : '#ff7b7b';
  app.innerHTML = '';
  const screen = el('div', 'screen');
  const card = el('div', 'result-card');
  card.innerHTML = `
    <h1 style="color:${color}">${title}</h1>
    <p style="text-align:center">${getHeroDef(record.playerHero).name} 对战 ${getHeroDef(record.enemyHero).name}｜比赛时间 ${fmtTime(record.duration)}</p>
    <div class="result-grid">
      <div class="stat"><b>${record.kills}</b>击杀</div>
      <div class="stat"><b>${record.deaths}</b>死亡</div>
      <div class="stat"><b>${record.lastHits}</b>补刀</div>
      <div class="stat"><b>${Math.floor(record.gold)}</b>剩余金币</div>
      <div class="stat"><b>${record.damage}</b>英雄伤害</div>
      <div class="stat"><b>${hero.level}</b>最终等级</div>
    </div>
    <p><b>最终装备：</b>${hero.items.map((id) => ITEMS.find((i) => i.id === id)?.name).join('、') || '无'}</p>
    <p><b>基地状态：</b>蓝方核心 ${Math.ceil(finalModel.buildings.find((b) => b.kind === 'core' && b.team === 0)!.hp)} / 红方核心 ${Math.ceil(finalModel.buildings.find((b) => b.kind === 'core' && b.team === 1)!.hp)}</p>`;
  const actions = el('div', 'menu-actions');
  actions.append(
    Object.assign(el('button', 'primary', '再来一局'), { onclick: () => startGame(finalModel.config.mode, record.playerHero, finalModel.training) }),
    Object.assign(el('button', '', '返回主菜单'), { onclick: renderMenu })
  );
  card.append(actions);
  screen.append(card);
  app.append(screen);
  phaser?.destroy(true);
  phaser = null;
}

function renderSettings() {
  app.innerHTML = '';
  const settings = loadSettings();
  const screen = el('div', 'screen');
  screen.innerHTML = '<div class="logo" style="font-size:38px">设置</div>';
  const rows = el('div');
  const makeRange = (label: string, key: keyof typeof settings) => {
    const row = el('div', 'settings-row', `<span>${label}</span>`);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0'; input.max = '1'; input.step = '0.05';
    input.value = String(settings[key]);
    input.oninput = () => { (settings[key] as number) = Number(input.value); saveSettings(settings); };
    row.append(input);
    return row;
  };
  rows.append(makeRange('音乐音量', 'musicVolume'), makeRange('音效音量', 'sfxVolume'));
  const actions = el('div', 'menu-actions');
  actions.append(Object.assign(el('button', 'primary', '返回'), { onclick: renderMenu }));
  screen.append(rows, actions);
  app.append(screen);
}

function renderRecords() {
  app.innerHTML = '';
  const records = loadRecords();
  const screen = el('div', 'screen');
  screen.innerHTML = '<div class="logo" style="font-size:38px">对战记录</div>';
  const table = el('div', 'records');
  table.innerHTML = `<table><thead><tr><th>时间</th><th>英雄</th><th>结果</th><th>时长</th><th>K/D</th><th>补刀</th><th>伤害</th></tr></thead><tbody>
    ${records.map((r) => `<tr><td>${new Date(r.date).toLocaleString()}</td><td>${getHeroDef(r.playerHero).name}</td><td>${r.result}</td><td>${fmtTime(r.duration)}</td><td>${r.kills}/${r.deaths}</td><td>${r.lastHits}</td><td>${r.damage}</td></tr>`).join('') || '<tr><td colspan="7">暂无记录</td></tr>'}
  </tbody></table>`;
  const actions = el('div', 'menu-actions');
  actions.append(Object.assign(el('button', 'primary', '返回'), { onclick: renderMenu }));
  screen.append(table, actions);
  app.append(screen);
}

renderMenu();

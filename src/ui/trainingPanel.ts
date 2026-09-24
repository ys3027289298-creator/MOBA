import type { Game } from '../engine/game';

interface PanelAction {
  id: string;
  label: string;
  run: (game: Game) => boolean;
}

const ACTIONS: PanelAction[] = [
  { id: 'reset', label: '重置场景', run: (game) => game.resetTrainingScene() },
  { id: 'restore', label: '恢复玩家状态', run: (game) => game.restorePlayerState() },
  { id: 'clear', label: '清除单位', run: (game) => game.clearUnits() },
  { id: 'wave', label: '立即生成一波兵', run: (game) => game.spawnWaveNow() },
  { id: 'target', label: '生成/刷新测试目标', run: (game) => game.spawnOrRefreshTrainingTargets() }
];

export class TrainingPanel {
  readonly element: HTMLElement;
  private model: Game;
  private buttons: HTMLButtonElement[] = [];
  private feedback: HTMLElement;
  private feedbackTimer: number | undefined;

  constructor(model: Game) {
    this.model = model;
    this.element = document.createElement('div');
    this.element.className = 'training-panel';
    const title = document.createElement('div');
    title.className = 'training-title';
    title.textContent = '训练控制台';
    this.feedback = document.createElement('div');
    this.feedback.className = 'training-feedback';
    this.element.append(title, this.feedback);
    for (const action of ACTIONS) {
      const button = document.createElement('button');
      button.textContent = action.label;
      button.dataset.action = action.id;
      button.onclick = () => {
        if (!this.model.canTrainModify()) {
          this.flash('当前不可用（已暂停或已结算）');
          this.update();
          return;
        }
        if (action.run(this.model)) this.flash(`已执行：${action.label}`);
        this.update();
      };
      this.buttons.push(button);
      this.element.append(button);
    }
    this.update();
  }

  private flash(text: string) {
    this.feedback.textContent = text;
    this.feedback.classList.add('visible');
    window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => this.feedback.classList.remove('visible'), 1600);
  }

  update() {
    const enabled = this.model.canTrainModify();
    for (const button of this.buttons) button.disabled = !enabled;
  }
}

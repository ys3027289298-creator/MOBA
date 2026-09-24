import type { Game } from '../engine/game';

interface PanelAction {
  label: string;
  run: (model: Game) => boolean;
}

const ACTIONS: PanelAction[] = [
  { label: '重置场景', run: (model) => model.resetTrainingScenario() },
  { label: '恢复玩家状态', run: (model) => model.restorePlayerState() },
  { label: '清除单位', run: (model) => model.clearUnits() },
  { label: '立即生成一波兵', run: (model) => model.spawnWaveNow() },
  { label: '生成/刷新测试目标', run: (model) => model.refreshTrainingTargets() }
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
    title.textContent = '训练控制';
    this.element.append(title);
    for (const action of ACTIONS) {
      const button = document.createElement('button');
      button.textContent = action.label;
      button.onclick = () => this.execute(action);
      this.buttons.push(button);
      this.element.append(button);
    }
    this.feedback = document.createElement('div');
    this.feedback.className = 'training-feedback';
    this.element.append(this.feedback);
    this.refresh();
  }

  setModel(model: Game) {
    this.model = model;
    this.refresh();
  }

  refresh() {
    const enabled = this.model.canUseTrainingControls();
    for (const button of this.buttons) button.disabled = !enabled;
  }

  private execute(action: PanelAction) {
    if (!this.model.canUseTrainingControls()) {
      this.flash('暂停或结算中不可用');
      this.refresh();
      return;
    }
    if (action.run(this.model)) this.flash(`${action.label} ✓`);
    this.refresh();
  }

  private flash(text: string) {
    this.feedback.textContent = text;
    if (this.feedbackTimer !== undefined) window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => { this.feedback.textContent = ''; }, 1200);
  }
}

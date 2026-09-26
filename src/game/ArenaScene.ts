import Phaser from 'phaser';
import { Game } from '../engine/game';
import { BUSHES, FLANK_ZONES, LANE_POINTS, MAP_H, MAP_W, NEUTRAL_AREA, WALLS } from '../engine/map';
import { getHeroDef, TACTICAL_SKILLS } from '../data/heroes';
import type { GameEntity, Hero, Vec2 } from '../engine/types';
import type { MatchRecord } from '../storage';
import { saveRecord } from '../storage';
import { HUD } from '../ui/HUD';

interface RenderObject {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  bar: Phaser.GameObjects.Rectangle;
  level?: Phaser.GameObjects.Text;
}

export interface SceneCallbacks {
  onEnd: (record: MatchRecord) => void;
  onExit: () => void;
}

export class ArenaScene extends Phaser.Scene {
  gameModel!: Game;
  callbacks!: SceneCallbacks;
  private renderers = new Map<number, RenderObject>();
  private projectileViews = new Map<number, Phaser.GameObjects.Arc>();
  private skillPreview!: Phaser.GameObjects.Graphics;
  private hud!: HUD;
  private castingSlot: number | null = null;
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private eventGraphics!: Phaser.GameObjects.Graphics;
  private savedRecord = false;

  constructor() { super('arena'); }

  init(data: { model: Game; callbacks: SceneCallbacks }) {
    this.gameModel = data.model;
    this.callbacks = data.callbacks;
    this.renderers.clear();
    this.projectileViews.clear();
    this.savedRecord = false;
  }

  create() {
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H).setZoom(1);
    this.cameras.main.centerOn(this.gameModel.player.pos.x, this.gameModel.player.pos.y);
    this.drawMap();
    this.skillPreview = this.add.graphics().setDepth(900);
    this.eventGraphics = this.add.graphics().setDepth(30);
    this.hud = new HUD(this);
    this.setupInput();
  }

  setPaused(paused: boolean) { this.gameModel.paused = paused; }

  restartModel(model: Game) {
    this.scene.restart({ model, callbacks: this.callbacks });
  }

  private drawMap() {
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x10182c).setDepth(-20);
    const lane = this.add.graphics();
    lane.fillStyle(0x27324f, 1).fillRoundedRect(110, 455, 1460, 130, 45).setDepth(-10);
    lane.lineStyle(5, 0x465a8c, 0.7).strokeRoundedRect(110, 455, 1460, 130, 45);
    for (const p of LANE_POINTS) this.add.circle(p.x, p.y, 8, 0x52669b, 0.25).setDepth(-9);
    this.add.rectangle(130, 520, 190, 190, 0x173f5f, 0.75).setStrokeStyle(4, 0x4cc9f0).setDepth(-11);
    this.add.rectangle(1550, 520, 190, 190, 0x5f1730, 0.75).setStrokeStyle(4, 0xff5a5a).setDepth(-11);
    for (const wall of WALLS) {
      this.add.rectangle(wall.x + wall.w / 2, wall.y + wall.h / 2, wall.w, wall.h, 0x3a4565)
        .setStrokeStyle(3, 0x7180ac).setDepth(-4);
    }
    for (const bush of BUSHES) {
      this.add.rectangle(bush.x, bush.y, bush.w, bush.h, 0x1b4332, 0.72)
        .setOrigin(0, 0).setStrokeStyle(2, 0x52b788, 0.7).setDepth(-6);
      for (let i = 0; i < 6; i++) {
        this.add.circle(bush.x + 18 + i * 28, bush.y + 18 + (i % 2) * 42, 10, 0x2d6a4f, 0.65).setDepth(-5);
      }
    }
    for (const zone of FLANK_ZONES) {
      this.add.rectangle(zone.x, zone.y, zone.w, zone.h, 0x3c1e5f, 0.22)
        .setOrigin(0, 0).setStrokeStyle(2, 0xc77dff, 0.35).setDepth(-12);
    }
    this.add.rectangle(NEUTRAL_AREA.x, NEUTRAL_AREA.y, NEUTRAL_AREA.w, NEUTRAL_AREA.h, 0xffd166, 0.08)
      .setOrigin(0, 0).setStrokeStyle(2, 0xffd166, 0.55).setDepth(-8);
    this.add.text(840, 430, '中央能量点', { color: '#ffd166', fontSize: '14px' }).setOrigin(0.5);
  }

  private setupInput() {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) this.handleRightClick(pointer);
      if (pointer.leftButtonDown()) this.handleLeftClick(pointer);
      if (pointer.leftButtonDown() && this.isOverMinimap(pointer)) this.handleMinimap(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && this.isOverMinimap(pointer)) this.handleMinimap(pointer);
    });
    const keys: Array<[string, number]> = [['Q', 0], ['W', 1], ['E', 2], ['R', 3], ['D', 4], ['F', 5]];
    for (const [key, slot] of keys) {
      this.input.keyboard?.on(`keydown-${key}`, () => this.beginCast(slot));
    }
    this.input.keyboard?.on('keydown-SPACE', () => this.focusHero());
    this.input.keyboard?.on('keydown-B', () => this.gameModel.recall(this.gameModel.player));
    this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
      this.hud.setScoreboard(true);
    });
    this.input.keyboard?.on('keyup-TAB', () => this.hud.setScoreboard(false));
    for (let i = 1; i <= 6; i++) {
      this.input.keyboard?.on(`keydown-${i}`, () => {
        const item = this.gameModel.player.items[i - 1];
        if (item) this.gameModel.useItem(this.gameModel.player, item);
      });
    }
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown[], _dx: number, dy: number) => {
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.55, 1.6));
    });
    window.addEventListener('blur', () => { this.gameModel.paused = true; });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) this.gameModel.paused = true;
    });
  }

  focusHero() {
    this.cameras.main.centerOn(this.gameModel.player.pos.x, this.gameModel.player.pos.y);
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer) {
    if (this.isOverMinimap(pointer)) return;
    const world = pointer.positionToCamera(this.cameras.main) as Vec2;
    const entity = this.pickEntity(world);
    this.hud.setSelected(entity ?? null);
  }

  private isOverMinimap(pointer: Phaser.Input.Pointer): boolean {
    return pointer.x > this.scale.width - 250 && pointer.y > this.scale.height - 230;
  }

  private handleMinimap(pointer: Phaser.Input.Pointer) {
    const x = this.scale.width - 235;
    const y = this.scale.height - 215;
    const tx = Phaser.Math.Clamp((pointer.x - x) / 220, 0, 1) * MAP_W;
    const ty = Phaser.Math.Clamp((pointer.y - y) / 136, 0, 1) * MAP_H;
    this.cameras.main.centerOn(tx, ty);
  }

  private handleRightClick(pointer: Phaser.Input.Pointer) {
    if (this.castingSlot !== null) {
      this.castingSlot = null;
      this.skillPreview.clear();
      return;
    }
    const world = pointer.positionToCamera(this.cameras.main) as Vec2;
    const clicked = this.pickEntity(world);
    if (clicked && clicked.team !== this.gameModel.player.team) this.gameModel.commandAttack(this.gameModel.player, clicked);
    else this.gameModel.commandMove(this.gameModel.player, world);
  }

  private pickEntity(world: Vec2): GameEntity | undefined {
    return this.gameModel.allEntities()
      .filter((e) => e.alive)
      .find((e) => Math.hypot(e.pos.x - world.x, e.pos.y - world.y) <= e.radius + 8);
  }

  private beginCast(slot: number) {
    const hero = this.gameModel.player;
    if (slot < 4) {
      const availablePoints = hero.level - 1 - hero.skillLevels.reduce((a, b) => a + b, 0);
      const current = hero.skillLevels[slot];
      const maxLevel = slot === 3 ? 3 : 4;
      if (current < maxLevel && availablePoints > 0 && this.gameModel.learnSkill(hero, slot)) return;
    }
    const check = this.gameModel.canCast(hero, slot);
    if (!check.ok) {
      this.gameModel.floatText(check.reason ?? '无法释放', hero.pos, '#ff7b7b');
      return;
    }
    const def = slot >= 4 ? TACTICAL_SKILLS[slot - 4] : getHeroDef(hero.heroId).skills[slot];
    if (def.targetMode === 'none') this.gameModel.castSkill(hero, slot, {});
    else this.castingSlot = slot;
  }

  update(_time: number, deltaMs: number) {
    this.gameModel.update(deltaMs / 1000);
    this.handlePendingCastClick();
    this.syncEntities();
    this.syncProjectiles();
    this.drawSkillPreview();
    this.drawEvents();
    this.hud.update();
    this.drawMinimap();
    if (this.gameModel.result !== 'running' && !this.savedRecord) this.finishMatch();
  }

  private handlePendingCastClick() {
    if (this.castingSlot === null) return;
    const pointer = this.input.activePointer;
    if (pointer.leftButtonDown()) {
      const world = pointer.positionToCamera(this.cameras.main) as Vec2;
      const clicked = this.pickEntity(world);
      const cast = this.gameModel.castSkill(this.gameModel.player, this.castingSlot, { point: world, entityId: clicked?.id });
      if (cast) {
        this.castingSlot = null;
        this.skillPreview.clear();
      }
    }
  }

  private entityColor(entity: GameEntity): number {
    if (entity.kind === 'hero') return getHeroDef((entity as Hero).heroId).color;
    if (entity.kind === 'minion') return entity.team === 0 ? 0x4cc9f0 : 0xff6b6b;
    return entity.team === 0 ? 0x90e0ef : 0xff8fa3;
  }

  private ensureEntity(entity: GameEntity): RenderObject {
    const existing = this.renderers.get(entity.id);
    if (existing) return existing;
    const container = this.add.container(entity.pos.x, entity.pos.y).setDepth(10);
    const body = this.add.circle(0, 0, entity.radius, this.entityColor(entity), 0.93)
      .setStrokeStyle(3, entity.team === 0 ? 0xcaf0f8 : 0xffd6de);
    const barBg = this.add.rectangle(0, -entity.radius - 14, entity.radius * 2.2, 6, 0x000000, 0.65);
    const bar = this.add.rectangle(-entity.radius * 1.1, -entity.radius - 14, entity.radius * 2.2, 4,
      entity.team === 0 ? 0x51cf66 : 0xff5252).setOrigin(0, 0.5);
    container.add([body, barBg, bar]);
    let level: Phaser.GameObjects.Text | undefined;
    if (entity.kind === 'hero') {
      level = this.add.text(-4, -7, '1', { color: '#fff', fontSize: '12px', fontStyle: 'bold' });
      container.add(level);
    }
    const renderer = { container, body, bar, level };
    this.renderers.set(entity.id, renderer);
    return renderer;
  }

  private syncEntities() {
    for (const entity of this.gameModel.allEntities()) {
      const renderer = this.ensureEntity(entity);
      const fogHidden = entity.kind === 'hero' && entity.team === 1 && !this.gameModel.canSee(0, entity.pos);
      renderer.container.setVisible(entity.alive && !fogHidden);
      renderer.container.setPosition(entity.pos.x, entity.pos.y);
      const ratio = Phaser.Math.Clamp(entity.hp / entity.maxHp, 0, 1);
      renderer.bar.width = entity.radius * 2.2 * ratio;
      if (renderer.level && entity.kind === 'hero') renderer.level.setText(String((entity as Hero).level));
      if (entity.kind === 'hero') {
        const hero = entity as Hero;
        renderer.body.setScale(hero.statuses.some((s) => s.type === 'haste' && s.duration > 0) ? 1.12 : 1);
        if (hero.recall > 0) renderer.body.setStrokeStyle(4, 0x80ffdb);
      }
    }
    for (const [id, renderer] of this.renderers) {
      const entity = this.gameModel.entityById(id);
      if (!entity || !entity.alive) renderer.container.setVisible(false);
    }
  }

  private syncProjectiles() {
    const active = new Set<number>();
    for (const projectile of this.gameModel.projectiles) {
      active.add(projectile.id);
      let view = this.projectileViews.get(projectile.id);
      if (!view) {
        view = this.add.circle(0, 0, projectile.kind === 'turret' ? 8 : 6,
          projectile.info.type === 'energy' ? 0x7bdff2 : 0xffd166).setDepth(20);
        this.projectileViews.set(projectile.id, view);
      }
      view.setPosition(projectile.pos.x, projectile.pos.y);
    }
    for (const [id, view] of this.projectileViews) {
      if (!active.has(id)) { view.destroy(); this.projectileViews.delete(id); }
    }
  }

  private drawSkillPreview() {
    this.skillPreview.clear();
    if (this.castingSlot === null) return;
    const hero = this.gameModel.player;
    const def = this.castingSlot >= 4 ? TACTICAL_SKILLS[this.castingSlot - 4] : getHeroDef(hero.heroId).skills[this.castingSlot];
    const pointer = this.input.activePointer.positionToCamera(this.cameras.main) as Vec2;
    this.skillPreview.lineStyle(2, def.color, 0.9);
    this.skillPreview.fillStyle(def.color, 0.12);
    if (def.radius > 0) {
      const center = def.targetMode === 'direction' ? hero.pos : pointer;
      this.skillPreview.strokeCircle(center.x, center.y, def.range);
      this.skillPreview.fillCircle(center.x, center.y, def.range);
    }
    if (def.radius > 0 && def.targetMode === 'direction') {
      this.skillPreview.lineBetween(hero.pos.x, hero.pos.y, pointer.x, pointer.y);
    }
    if (def.radius > 0) {
      this.skillPreview.lineStyle(2, 0xffffff, 0.55);
      this.skillPreview.strokeCircle(pointer.x, pointer.y, def.radius || 60);
    }
  }

  private drawEvents() {
    this.eventGraphics.clear();
    if (this.gameModel.blockade) {
      const b = this.gameModel.blockade;
      this.eventGraphics.fillStyle(0xff5a5a, 0.28).fillRect(b.x, b.y, b.w, b.h);
      this.eventGraphics.lineStyle(3, 0xff5a5a, 0.9).strokeRect(b.x, b.y, b.w, b.h);
    }
    if (this.gameModel.energyNode.active) {
      const p = this.gameModel.energyNode.pos;
      this.eventGraphics.lineStyle(3, 0xffd166, 0.8).strokeCircle(p.x, p.y, 48 + Math.sin(this.game.loop.time * 0.006) * 6);
    }
    for (const ward of this.gameModel.wards) {
      this.eventGraphics.fillStyle(ward.team === 0 ? 0x4cc9f0 : 0xff5a5a, 0.25)
        .fillCircle(ward.pos.x, ward.pos.y, 360);
      this.eventGraphics.lineStyle(2, 0xffffff, 0.75).strokeCircle(ward.pos.x, ward.pos.y, 12);
    }
  }

  private drawMinimap() {
    const g: Phaser.GameObjects.Graphics = this.mapGraphics ?? this.add.graphics().setDepth(1000).setScrollFactor(0);
    if (!this.mapGraphics) {
      this.mapGraphics = g;
    }
    g.clear();
    g.scrollFactorX = 0;
    g.scrollFactorY = 0;
    const ox = this.scale.width - 235;
    const oy = this.scale.height - 185;
    const w = 220;
    const h = 136;
    g.fillStyle(0x07111f, 0.82).fillRoundedRect(ox - 6, oy - 6, w + 12, h + 12, 8);
    g.lineStyle(2, 0x6c8cce, 0.8).strokeRoundedRect(ox - 6, oy - 6, w + 12, h + 12, 8);
    g.lineStyle(3, 0x465a8c, 0.8);
    g.lineBetween(ox + 8, oy + h / 2, ox + w - 8, oy + h / 2);
    const sx = w / MAP_W;
    const sy = h / MAP_H;
    for (const b of this.gameModel.buildings) {
      if (!b.alive) continue;
      g.fillStyle(b.team === 0 ? 0x4cc9f0 : 0xff5a5a, 1);
      g.fillRect(ox + b.pos.x * sx - 3, oy + b.pos.y * sy - 3, 6, 6);
    }
    for (const hero of this.gameModel.heroes) {
      if (!hero.alive || (hero.team === 1 && !this.gameModel.canSee(0, hero.pos))) continue;
      g.fillStyle(hero.team === 0 ? 0x80ffdb : 0xff7b7b, 1);
      g.fillCircle(ox + hero.pos.x * sx, oy + hero.pos.y * sy, 5);
    }
    for (const minion of this.gameModel.minions) {
      if (!minion.alive) continue;
      g.fillStyle(minion.team === 0 ? 0x4cc9f0 : 0xff5a5a, 0.75);
      g.fillRect(ox + minion.pos.x * sx - 1, oy + minion.pos.y * sy - 1, 2, 2);
    }
  }

  private finishMatch() {
    this.savedRecord = true;
    const model = this.gameModel;
    const player = model.player;
    const record: MatchRecord = {
      result: model.result === 'running' ? 'timeout' : model.result,
      duration: model.time,
      playerHero: player.heroId,
      enemyHero: model.enemy.heroId,
      kills: player.kills,
      deaths: player.deaths,
      lastHits: player.lastHits,
      gold: player.gold,
      damage: Math.round(player.damageToHeroes),
      date: new Date().toISOString()
    };
    saveRecord(record);
    setTimeout(() => this.callbacks.onEnd(record), 600);
  }
}

import Phaser from 'phaser';
import type { ArenaScene } from '../game/ArenaScene';
import { getHeroDef, TACTICAL_SKILLS } from '../data/heroes';
import { getItem } from '../data/items';
import { MATCH_DURATION, xpForLevel } from '../engine/progression';
import type { GameEntity, Hero } from '../engine/types';

function fmtTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export class HUD {
  private scene: ArenaScene;
  private text = new Map<string, Phaser.GameObjects.Text>();
  private bars = new Map<string, Phaser.GameObjects.Rectangle>();
  private scoreboard!: Phaser.GameObjects.Container;

  constructor(scene: ArenaScene) {
    this.scene = scene;
    this.create();
  }

  private bottom(offset: number): number {
    return this.scene.scale.height - 158 + offset;
  }

  private label(name: string, x: number, y: number, value: string, size = 14, color = '#fff') {
    const text = this.scene.add.text(x, y, value, {
      color,
      fontSize: `${size}px`,
      fontFamily: 'Microsoft YaHei, sans-serif',
      backgroundColor: 'rgba(5,10,20,0.58)',
      padding: { x: 6, y: 4 }
    }).setScrollFactor(0).setDepth(1200);
    this.text.set(name, text);
  }

  private bar(name: string, x: number, offsetY: number, width: number, color: number) {
    const y = this.bottom(offsetY);
    const bg = this.scene.add.rectangle(x, y, width, 12, 0x111827, 0.85)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1200);
    const fg = this.scene.add.rectangle(x + 1, y + 1, width - 2, 10, color)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1201);
    this.bars.set(`${name}_bg`, bg);
    this.bars.set(name, fg);
  }

  private create() {
    const width = this.scene.scale.width;
    this.scene.add.rectangle(0, this.scene.scale.height - 158, width, 158, 0x050b16, 0.94)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1150);
    this.scene.add.rectangle(0, 0, width, 42, 0x050b16, 0.86)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1150);
    this.label('top', 16, 9, '', 15, '#e0f2fe');
    this.label('objective', width / 2 - 120, 9, '目标：摧毁赤曜基地核心', 14, '#ffd166');
    this.label('hero', 16, this.bottom(18), '', 14);
    this.bar('hp', 145, 14, 300, 0x22c55e);
    this.bar('mana', 145, 34, 245, 0x38bdf8);
    this.bar('xp', 145, 54, 245, 0xc77dff);
    this.label('hpText', 455, this.bottom(12), '', 11);
    this.label('manaText', 610, this.bottom(32), '', 11);
    this.label('gold', 720, this.bottom(14), '', 15, '#ffd166');
    this.label('recall', 720, this.bottom(39), '', 13, '#80ffdb');
    this.label('skills', 145, this.bottom(78), '', 13);
    this.label('items', 500, this.bottom(100), '', 12);
    this.label('events', 16, this.bottom(124), '', 13, '#8ecae6');
    this.label('controls', width - 500, this.bottom(130),
      '右键移动/攻击｜左键选择｜QWER技能｜DF战术｜1-6道具｜B回城｜空格｜Tab｜滚轮缩放', 12, '#cbd5e1');
    this.label('notifications', width / 2 - 180, 55, '', 16, '#ffe066');
    this.label('selected', width / 2 - 120, this.bottom(20), '', 12, '#caf0f8');

    this.scoreboard = this.scene.add.container(0, 0).setDepth(1300).setScrollFactor(0);
    const panel = this.scene.add.rectangle(width / 2, 220, 720, 300, 0x07111f, 0.96)
      .setStrokeStyle(2, 0x6c8cce).setScrollFactor(0);
    const content = this.scene.add.text(width / 2 - 330, 88, '', {
      color: '#fff', fontSize: '16px', fontFamily: 'Microsoft YaHei', lineSpacing: 8
    }).setScrollFactor(0);
    this.text.set('scoreboard', content);
    this.scoreboard.add([panel, content]);
    this.scoreboard.setVisible(false);
  }

  setScoreboard(visible: boolean) {
    this.scoreboard.setVisible(visible);
    if (!visible) return;
    const model = this.scene.gameModel;
    const lines = ['英雄 / 等级 / K-D / 补刀 / 金币 / 装备 / 对英雄伤害'];
    for (const hero of model.heroes) {
      const side = hero.team === 0 ? '玩家' : '电脑';
      lines.push(
        `${side} ${hero.name} Lv${hero.level} ${hero.kills}-${hero.deaths} 补刀${hero.lastHits} 金币${Math.floor(hero.gold)} 伤害${Math.round(hero.damageToHeroes)}`,
        `装备: ${hero.items.map((id) => getItem(id).name).join('、') || '无'}`
      );
    }
    const blueCore = model.buildings.find((b) => b.kind === 'core' && b.team === 0)!;
    const redCore = model.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    lines.push('', `蓝方核心 ${Math.ceil(blueCore.hp)}  红方核心 ${Math.ceil(redCore.hp)}`);
    this.text.get('scoreboard')!.setText(lines.join('\n'));
  }

  setSelected(entity: GameEntity | null) {
    const target = this.text.get('selected');
    if (!target) return;
    if (!entity) {
      target.setText('');
      return;
    }
    let extra = '';
    if (entity.kind === 'hero') {
      const hero = entity as Hero;
      const def = getHeroDef(hero.heroId);
      extra = `｜${def.role}｜攻击${Math.round(hero.stats.attack)} 防御${Math.round(hero.stats.defense)} 法强${Math.round(hero.stats.abilityPower)}`;
    }
    target.setText(`已选择：${entity.team === 0 ? '蓝方' : '红方'} ${entity.name} ${Math.ceil(entity.hp)}/${Math.ceil(entity.maxHp)}${extra}`);
  }

  update() {
    const model = this.scene.gameModel;
    const player = model.player;
    const heroDef = getHeroDef(player.heroId);
    this.text.get('top')!.setText(
      `${fmtTime(model.time)} / ${fmtTime(MATCH_DURATION)}  击杀 ${model.score[0]} : ${model.score[1]}  模式 ${model.config.mode === 'practice' ? '练习' : '完整对战'}${model.paused ? '｜已暂停' : ''}`
    );
    this.text.get('hero')!.setText(`${heroDef.name}\nLv ${player.level}`);
    this.setBar('hp', player.hp / player.maxHp);
    this.setBar('mana', player.mana / player.maxMana);
    this.setBar('xp', player.level >= 8 ? 1 : player.xp / xpForLevel(player.level));
    const hpText = this.text.get('hpText')!;
    hpText.setText(`${Math.ceil(player.hp)}/${Math.ceil(player.maxHp)}${player.hp / player.maxHp < 0.25 ? '  ⚠ 低生命值' : ''}`);
    hpText.setColor(player.hp / player.maxHp < 0.25 ? '#ff5252' : '#ffffff');
    this.text.get('manaText')!.setText(`${Math.ceil(player.mana)}/${Math.ceil(player.maxMana)}`);
    this.text.get('gold')!.setText(`金币 ${Math.floor(player.gold)}${model.isAtBase(player) ? '｜商店已开放' : ''}`);
    this.text.get('recall')!.setText(player.alive
      ? player.recall > 0 ? `回城中 ${player.recall.toFixed(1)}s` : 'B 回城'
      : `复活倒计时 ${Math.ceil(player.deadTimer)}s｜击杀者: ${this.lastKiller(player) ?? '战场'}`);

    const skillLines = heroDef.skills.map((skill, index) => {
      const learned = player.skillLevels[index];
      const cooldown = player.cooldowns[skill.key];
      const state = learned === 0 ? '未学习' : cooldown > 0 ? `${cooldown.toFixed(1)}s` : `${skill.cost(learned)}蓝`;
      return `${skill.key} ${skill.name}${learned ? ` Lv${learned}` : ''} [${state}]`;
    });
    for (const tactical of TACTICAL_SKILLS) {
      const cooldown = player.cooldowns[tactical.key];
      skillLines.push(`${tactical.key} ${tactical.name} [${cooldown > 0 ? `${cooldown.toFixed(0)}s` : '就绪'}]`);
    }
    this.text.get('skills')!.setText(skillLines.join('   '));
    this.text.get('items')!.setText(`装备: ${player.items.map((id, index) => `${index + 1}.${getItem(id).name}`).join('  ') || '无'}`);
    const towerText = model.buildings
      .filter((b) => b.kind === 'turret')
      .map((t) => `${t.team === 0 ? '蓝' : '红'}${t.slot === 0 ? '外' : '内'}:${t.alive ? Math.ceil(t.hp) : '毁'}`)
      .join(' / ');
    const nextEvent = model.events.find((event) => !event.active && event.startsIn < 20);
    const activeEvent = model.events.find((event) => event.active);
    this.text.get('events')!.setText(`${towerText}  下波兵 ${Math.max(0, model.waveTimer).toFixed(0)}s  ${activeEvent ? `事件: ${activeEvent.name}` : nextEvent ? `${nextEvent.name} ${Math.ceil(nextEvent.startsIn)}s` : ''}`);
    this.text.get('notifications')!.setText(model.notifications.slice(-3).map((n) => n.text).join('\n'));
  }

  private lastKiller(hero: Hero): string | undefined {
    const record = this.scene.gameModel.kills.filter((kill) => kill.victim.id === hero.id).pop();
    return record?.killer?.kind === 'hero' ? (record.killer as Hero).name : undefined;
  }

  private setBar(name: string, ratio: number) {
    const bar = this.bars.get(name)!;
    const bg = this.bars.get(`${name}_bg`)!;
    bar.width = Math.max(0, (bg.width - 2) * Phaser.Math.Clamp(ratio, 0, 1));
  }
}

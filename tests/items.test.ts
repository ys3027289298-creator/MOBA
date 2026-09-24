import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { makeStats } from '../src/engine/factory';
import { applyDamage } from '../src/engine/combat';
import { itemCooldownKey } from '../src/engine/itemUse';

function makeGame() {
  return new Game({ mode: 'full', playerHero: 'emberfang', enemyHero: 'veilora' });
}

function tick(game: Game, seconds: number, step = 0.05) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step);
}

function wound(game: Game, hp = 400, mana = 50) {
  game.player.hp = game.player.maxHp - hp;
  game.player.mana = mana;
}

describe('主动道具统一校验', () => {
  it('被动装备不能被当作主动道具使用', () => {
    const game = makeGame();
    game.player.items.push('blade');
    wound(game);
    const hp = game.player.hp;
    expect(game.useItem(game.player, 'blade')).toBe(false);
    expect(game.player.hp).toBe(hp);
    expect(game.player.items).toContain('blade');
    expect(game.notifications.length).toBe(0);
  });

  it('未拥有的装备与未知装备 ID 都安全失败', () => {
    const game = makeGame();
    wound(game);
    expect(game.useItem(game.player, 'potion')).toBe(false);
    expect(game.useItem(game.player, 'mystery-box')).toBe(false);
    game.player.items.push('mystery-box');
    expect(game.useItem(game.player, 'mystery-box')).toBe(false);
    expect(game.player.items).toEqual(['mystery-box']);
    expect(game.notifications.length).toBe(0);
  });

  it('死亡英雄无法使用主动道具', () => {
    const game = makeGame();
    game.player.items.push('potion');
    applyDamage(game, game.player, { amount: 99999, type: 'energy', source: game.enemy });
    expect(game.player.alive).toBe(false);
    expect(game.useItem(game.player, 'potion')).toBe(false);
    expect(game.player.hp).toBe(0);
    expect(game.player.items).toContain('potion');
  });

  it('比赛结束后主动道具被拒绝', () => {
    const game = makeGame();
    game.player.items.push('potion');
    wound(game);
    game.result = 'victory';
    expect(game.useItem(game.player, 'potion')).toBe(false);
    expect(game.player.items).toContain('potion');
  });

  it('空装备栏快捷键安全失败', () => {
    const game = makeGame();
    expect(game.useItemSlot(game.player, 5)).toBe(false);
    expect(game.useItemSlot(game.player, 0)).toBe(false);
    expect(game.notifications.length).toBe(0);
  });
});

describe('恢复类主动效果的原子性', () => {
  it('满血满蓝时使用失败且不产生任何状态变化', () => {
    const game = makeGame();
    game.player.items.push('potion', 'chalice');
    game.player.hp = game.player.maxHp;
    game.player.mana = game.player.maxMana;
    const gold = game.player.gold;
    expect(game.useItem(game.player, 'potion')).toBe(false);
    expect(game.useItem(game.player, 'chalice')).toBe(false);
    expect(game.player.items).toEqual(['potion', 'chalice']);
    expect(game.player.gold).toBe(gold);
    expect(game.player.cooldowns[itemCooldownKey('chalice')] ?? 0).toBe(0);
    expect(game.notifications.length).toBe(0);
    expect(game.texts.length).toBe(0);
  });

  it('部分恢复成功且通知只产生一份', () => {
    const game = makeGame();
    game.player.items.push('potion');
    wound(game);
    const hp = game.player.hp;
    const mana = game.player.mana;
    expect(game.useItem(game.player, 'potion')).toBe(true);
    expect(game.player.hp).toBe(hp + 150);
    expect(game.player.mana).toBe(mana + 80);
    expect(game.notifications.length).toBe(1);
  });

  it('星露补给一次性消耗，第二次使用失败', () => {
    const game = makeGame();
    game.player.items.push('potion');
    wound(game);
    expect(game.useItem(game.player, 'potion')).toBe(true);
    expect(game.player.items).not.toContain('potion');
    wound(game);
    expect(game.useItem(game.player, 'potion')).toBe(false);
  });

  it('回涌圣杯保留装备本体并有短冷却', () => {
    const game = makeGame();
    game.player.items.push('chalice');
    wound(game);
    const hp = game.player.hp;
    expect(game.useItem(game.player, 'chalice')).toBe(true);
    expect(game.player.hp).toBe(hp + 260);
    expect(game.player.items).toContain('chalice');
    expect(game.player.cooldowns[itemCooldownKey('chalice')]).toBeGreaterThan(0);
  });

  it('冷却内重复点击返回 false 且没有第二次治疗', () => {
    const game = makeGame();
    game.player.items.push('chalice');
    wound(game);
    expect(game.useItem(game.player, 'chalice')).toBe(true);
    wound(game);
    const hp = game.player.hp;
    const mana = game.player.mana;
    expect(game.useItem(game.player, 'chalice')).toBe(false);
    expect(game.player.hp).toBe(hp);
    expect(game.player.mana).toBe(mana);
    expect(game.notifications.length).toBe(1);
  });

  it('冷却结束后可以再次使用', () => {
    const game = makeGame();
    game.player.items.push('chalice');
    wound(game);
    expect(game.useItem(game.player, 'chalice')).toBe(true);
    tick(game, 21);
    expect(game.player.cooldowns[itemCooldownKey('chalice')] ?? 0).toBe(0);
    wound(game);
    expect(game.useItem(game.player, 'chalice')).toBe(true);
  });

  it('不死鸟羽保留装备并提供治疗与护盾', () => {
    const game = makeGame();
    game.player.items.push('phoenix');
    wound(game);
    const hp = game.player.hp;
    expect(game.useItem(game.player, 'phoenix')).toBe(true);
    expect(game.player.hp).toBe(hp + 320);
    expect(game.player.statuses.some((s) => s.type === 'shield' && s.value >= 260)).toBe(true);
    expect(game.player.items).toContain('phoenix');
    expect(game.useItem(game.player, 'phoenix')).toBe(false);
  });
});

describe('侦幕晶石守卫生命周期', () => {
  it('同一队伍最多一个守卫，重新放置原子替换旧守卫', () => {
    const game = makeGame();
    game.player.items.push('wardstone');
    expect(game.useItem(game.player, 'wardstone')).toBe(true);
    expect(game.wards.filter((w) => w.team === 0).length).toBe(1);
    game.player.pos = { x: game.player.pos.x + 120, y: game.player.pos.y };
    expect(game.useItem(game.player, 'wardstone')).toBe(true);
    const wards = game.wards.filter((w) => w.team === 0);
    expect(wards.length).toBe(1);
    expect(wards[0].pos.x).toBe(game.player.pos.x);
    expect(game.player.items).toContain('wardstone');
  });
});

describe('冷却与比赛边界', () => {
  it('暂停时冷却不会偷偷消耗', () => {
    const game = makeGame();
    game.player.items.push('chalice');
    wound(game);
    expect(game.useItem(game.player, 'chalice')).toBe(true);
    const cooldown = game.player.cooldowns[itemCooldownKey('chalice')];
    game.paused = true;
    tick(game, 5);
    expect(game.player.cooldowns[itemCooldownKey('chalice')]).toBe(cooldown);
    game.paused = false;
    tick(game, 1);
    expect(game.player.cooldowns[itemCooldownKey('chalice')]).toBeLessThan(cooldown);
  });

  it('复活后装备保留且旧冷却不为负数', () => {
    const game = makeGame();
    game.player.items.push('chalice');
    wound(game);
    expect(game.useItem(game.player, 'chalice')).toBe(true);
    applyDamage(game, game.player, { amount: 99999, type: 'energy', source: game.enemy });
    expect(game.player.alive).toBe(false);
    tick(game, 30);
    expect(game.player.alive).toBe(true);
    expect(game.player.items).toContain('chalice');
    expect(game.player.cooldowns[itemCooldownKey('chalice')] ?? 0).toBeGreaterThanOrEqual(0);
    wound(game);
    expect(game.useItem(game.player, 'chalice')).toBe(true);
  });

  it('回城不会重置正在运行的道具冷却', () => {
    const game = makeGame();
    game.player.items.push('chalice');
    wound(game);
    expect(game.useItem(game.player, 'chalice')).toBe(true);
    game.recall(game.player);
    tick(game, 1);
    expect(game.player.recall).toBeGreaterThan(0);
    expect(game.player.cooldowns[itemCooldownKey('chalice')]).toBeGreaterThan(15);
  });
});

describe('商店与装备属性回归', () => {
  it('基地购买星露补给扣费并进入装备栏', () => {
    const game = makeGame();
    const gold = game.player.gold;
    expect(game.buyItem(game.player, 'potion')).toBe(true);
    expect(game.player.gold).toBe(gold - 180);
    expect(game.player.items).toContain('potion');
  });

  it('回涌圣杯提供既有属性加成', () => {
    const base = makeStats('emberfang', 1, []);
    const withChalice = makeStats('emberfang', 1, ['chalice']);
    expect(withChalice.maxMana).toBe(base.maxMana + 180);
    expect(withChalice.manaRegen).toBeCloseTo(base.manaRegen + 12);
    expect(withChalice.hpRegen).toBeCloseTo(base.hpRegen + 8);
  });
});

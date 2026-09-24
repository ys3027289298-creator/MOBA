import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      constructor(public key?: string) {}
    },
    Game: class {},
    AUTO: 0,
    Math: { Clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)) }
  }
}));

async function setup() {
  if (!document.querySelector('#app')) document.body.innerHTML = '<div id="app"></div>';
  const { Game } = await import('../src/engine/game');
  const { applyDamage } = await import('../src/engine/combat');
  const main = await import('../src/main');
  const storage = await import('../src/storage');
  return { Game, applyDamage, main, storage };
}

describe('结果页时间线（页面级）', () => {
  it('从比赛结束到结果页展示时间线，可筛选', async () => {
    const { Game, applyDamage, main, storage } = await setup();
    const game = new Game({ mode: 'full', playerHero: 'emberfang', enemyHero: 'veilora' });
    applyDamage(game, game.enemy, { amount: 999999, type: 'energy', source: game.player });
    const redCore = game.buildings.find((b) => b.kind === 'core' && b.team === 1)!;
    applyDamage(game, redCore, { amount: 999999, type: 'energy', source: game.player });
    game.update(0.05);
    expect(game.result).toBe('victory');

    const record: import('../src/storage').MatchRecord = {
      result: 'victory',
      duration: game.time,
      playerHero: game.player.heroId,
      enemyHero: game.enemy.heroId,
      kills: game.player.kills,
      deaths: game.player.deaths,
      lastHits: game.player.lastHits,
      gold: game.player.gold,
      damage: Math.round(game.player.damageToHeroes),
      date: new Date().toISOString(),
      timeline: game.timeline.getEvents()
    };
    storage.saveRecord(record);
    main.showResult(record, game);

    const panel = document.querySelector('.timeline-panel');
    expect(panel).toBeTruthy();
    expect(panel!.textContent).toContain('击杀');
    expect(panel!.textContent).toContain('比赛结束');
    expect(document.querySelectorAll('.timeline-item').length).toBeGreaterThan(0);

    const combatButton = [...document.querySelectorAll<HTMLButtonElement>('.timeline-filters button')]
      .find((b) => b.textContent === '战斗')!;
    combatButton.click();
    const items = [...document.querySelectorAll<HTMLElement>('.timeline-item')];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.querySelector('.timeline-category')!.textContent === '战斗')).toBe(true);

    const stored = storage.loadRecords();
    expect(stored[0].timeline?.some((e) => e.type === 'match_end')).toBe(true);
  });

  it('旧记录没有 timeline 时结果页显示安全空状态', async () => {
    const { Game, main } = await setup();
    const game = new Game({ mode: 'full', playerHero: 'emberfang', enemyHero: 'veilora' });
    const record: import('../src/storage').MatchRecord = {
      result: 'defeat',
      duration: 700,
      playerHero: 'emberfang',
      enemyHero: 'veilora',
      kills: 1,
      deaths: 4,
      lastHits: 30,
      gold: 200,
      damage: 3000,
      date: new Date().toISOString()
    };
    main.showResult(record, game);
    const panel = document.querySelector('.timeline-panel');
    expect(panel).toBeTruthy();
    expect(panel!.textContent).toContain('暂无时间线事件');
    expect(document.querySelectorAll('.timeline-item').length).toBe(0);
  });
});

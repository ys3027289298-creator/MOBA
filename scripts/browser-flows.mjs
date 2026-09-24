import puppeteer from 'puppeteer-core';

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openGame(hero = 'emberfang', mode = 'full') {
  const browser = await puppeteer.launch({ executablePath: edge, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate((targetMode) => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes(targetMode ? '练习模式' : '完整对战')).click();
  }, mode === 'practice');
  await page.waitForSelector('.hero-card');
  await page.evaluate((targetHero) => {
    [...document.querySelectorAll('.hero-card')].find((c) => c.textContent.includes(targetHero))?.click();
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('进入对战')).click();
  }, hero === 'emberfang' ? '烬牙' : hero === 'veilora' ? '薇洛菈' : hero);
  await page.waitForSelector('#phaser-container canvas');
  await wait(1000);
  return { browser, page, errors };
}

async function basicFlow() {
  const { browser, page, errors } = await openGame('emberfang', 'practice');
  const data = await page.evaluate(async () => {
    const game = window.__starRingGame;
    const hero = game.player;
    const start = { ...hero.pos };
    game.commandMove(hero, { x: start.x + 180, y: start.y });
    for (let i = 0; i < 40; i++) game.update(0.05);
    const moved = hero.pos.x > start.x + 80;
    hero.level = 3;
    hero.skillLevels[2] = 1;
    hero.mana = hero.maxMana;
    game.enemy.pos = { x: hero.pos.x + 90, y: hero.pos.y };
    const cast = game.castSkill(hero, 2, {});
    const skillHurt = game.enemy.hp < game.enemy.maxHp;
    while (game.waveNumber === 0) game.update(1);
    for (let i = 0; i < 20 && !game.minions.some((m) => m.team === 1); i++) game.update(1);
    const minion = game.minions.find((m) => m.team === 1);
    minion.hp = 1;
    minion.pos = { ...hero.pos };
    const goldBefore = hero.gold;
    game.basicAttack(hero, minion);
    for (let i = 0; i < 10; i++) game.update(0.05);
    const lastHit = hero.lastHits > 0 && hero.gold > goldBefore;
    hero.pos = { x: 130, y: 520 };
    game.buyItem(hero, 'blade');
    return { moved, cast, skillHurt, lastHit, item: hero.items.includes('blade'), gold: hero.gold };
  });
  await page.screenshot({ path: 'screenshot-flow.png' });
  await browser.close();
  if (!data.moved || !data.cast || !data.skillHurt || !data.lastHit || !data.item) throw new Error(`基础流程失败 ${JSON.stringify(data)}`);
  return { name: '移动/技能/补刀/购买', data, errors };
}

async function killFlow() {
  const { browser, page } = await openGame('veilora', 'practice');
  const data = await page.evaluate(() => {
    const game = window.__starRingGame;
    const player = game.player;
    const enemy = game.enemy;
    player.pos = { x: 800, y: 520 };
    enemy.pos = { x: 900, y: 520 };
    player.level = 8;
    player.skillLevels = [4, 4, 4, 3];
    player.mana = player.maxMana;
    enemy.hp = 100;
    enemy.mana = 0;
    const cast = game.castSkill(player, 0, { point: { ...enemy.pos } });
    for (let i = 0; i < 30; i++) game.update(0.05);
    return { cast, kills: player.kills, enemyAlive: enemy.alive };
  });
  await browser.close();
  if (!data.cast || data.kills !== 1 || data.enemyAlive) throw new Error(`击杀流程失败 ${JSON.stringify(data)}`);
  return { name: '击杀电脑英雄', data };
}

async function victoryFlow() {
  const { browser, page } = await openGame('thorvall', 'practice');
  const data = await page.evaluate(() => {
    const game = window.__starRingGame;
    const core = game.buildings.find((b) => b.kind === 'core' && b.team === 1);
    game.player.pos = { ...core.pos };
    core.hp = 1;
    game.basicAttack(game.player, core);
    for (let i = 0; i < 20; i++) game.update(0.05);
    return { result: game.result };
  });
  await wait(1000);
  await page.screenshot({ path: 'screenshot-victory.png' });
  const shown = await page.evaluate(() => document.body.innerText.includes('胜利'));
  await browser.close();
  if (data.result !== 'victory' || !shown) throw new Error(`胜利流程失败 ${JSON.stringify(data)} shown=${shown}`);
  return { name: '摧毁敌方基地核心并显示结算', data, shown };
}

async function defeatFlow() {
  const { browser, page } = await openGame('lumi', 'practice');
  const data = await page.evaluate(() => {
    const game = window.__starRingGame;
    const core = game.buildings.find((b) => b.kind === 'core' && b.team === 0);
    core.hp = 1;
    game.enemy.pos = { ...core.pos };
    game.basicAttack(game.enemy, core);
    for (let i = 0; i < 20; i++) game.update(0.05);
    return { result: game.result };
  });
  await wait(1000);
  const shown = await page.evaluate(() => document.body.innerText.includes('失败'));
  await browser.close();
  if (data.result !== 'defeat' || !shown) throw new Error(`失败流程失败 ${JSON.stringify(data)} shown=${shown}`);
  return { name: '玩家基地核心被摧毁并显示失败', data, shown };
}

async function trainingFlow() {
  const browser = await puppeteer.launch({ executablePath: edge, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('练习模式')).click());
  await page.waitForSelector('.hero-card');
  const configVisible = await page.evaluate(() => {
    const level = document.querySelector('#train-level');
    const gold = document.querySelector('#train-gold');
    if (!level || !gold) return false;
    level.value = '8';
    level.dispatchEvent(new Event('change'));
    gold.value = '6000';
    gold.dispatchEvent(new Event('change'));
    return true;
  });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('进入对战')).click());
  await page.waitForSelector('#phaser-container canvas');
  await page.waitForSelector('.training-panel');
  await wait(800);
  const data = await page.evaluate(async () => {
    const game = window.__starRingGame;
    const hero = game.player;
    const init = { level: hero.level, gold: hero.gold, targets: game.trainingTargets.length };
    hero.skillLevels[0] = 1;
    hero.mana = hero.maxMana;
    const cast = game.castSkill(hero, 0, { point: { x: hero.pos.x + 120, y: hero.pos.y } });
    game.spawnWaveNow();
    const minionsBefore = game.minions.length;
    const click = (text) => [...document.querySelectorAll('.training-panel button')].find((b) => b.textContent.includes(text))?.click();
    click('重置场景');
    const afterReset = {
      minions: game.minions.length,
      cooldown: game.player.cooldowns.Q,
      gold: game.player.gold,
      level: game.player.level,
      pending: game.pendingEffects.length
    };
    click('生成/刷新测试目标');
    const targetsAfter = game.trainingTargets.length;
    const target = game.trainingTargets[0];
    target.hp = 100;
    click('生成/刷新测试目标');
    const refreshed = target.hp === target.maxHp;
    game.paused = true;
    await new Promise((resolve) => setTimeout(resolve, 1300));
    const disabledWhenPaused = [...document.querySelectorAll('.training-panel button')].every((b) => b.disabled);
    game.paused = false;
    return { init, cast, minionsBefore, afterReset, targetsAfter, refreshed, disabledWhenPaused };
  });
  await page.screenshot({ path: 'screenshot-training.png' });
  await browser.close();
  const ok = configVisible
    && data.init.level === 8 && data.init.gold === 6000 && data.init.targets === 3
    && data.cast && data.minionsBefore >= 8
    && data.afterReset.minions === 0 && data.afterReset.cooldown === 0
    && data.afterReset.gold === 6000 && data.afterReset.level === 8 && data.afterReset.pending === 0
    && data.targetsAfter === 3 && data.refreshed && data.disabledWhenPaused;
  if (!ok) throw new Error(`训练沙盒流程失败 ${JSON.stringify(data)} config=${configVisible}`);
  return { name: '练习入口/配置/重置/目标刷新', data, errors };
}

const results = [];
results.push(await basicFlow());
results.push(await killFlow());
results.push(await victoryFlow());
results.push(await defeatFlow());
results.push(await trainingFlow());
console.log(JSON.stringify(results, null, 2));

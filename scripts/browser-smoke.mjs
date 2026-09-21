import puppeteer from 'puppeteer-core';

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1365,768']
});
const page = await browser.newPage();
await page.setViewport({ width: 1365, height: 768 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
await page.waitForSelector('.logo');
await page.screenshot({ path: 'screenshot-menu.png' });
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('完整对战'))?.click());
await page.waitForSelector('.hero-card');
await page.screenshot({ path: 'screenshot-heroes.png' });
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('进入对战'))?.click());
await page.waitForSelector('#phaser-container canvas', { timeout: 10000 });
await new Promise((resolve) => setTimeout(resolve, 2000));
await page.screenshot({ path: 'screenshot-game.png' });

const result = await page.evaluate(async () => {
  const scene = window.Phaser && null;
  return {
    title: document.querySelector('.logo')?.textContent,
    canvas: !!document.querySelector('#phaser-container canvas'),
    shop: document.querySelector('.shop-title')?.textContent,
    notifications: document.body.innerText
  };
});

const simulation = await page.evaluate(async () => {
  return await new Promise((resolve) => {
    const interval = setInterval(() => {
      const text = document.body.innerText;
      if (text.includes('金币') || text.includes('目标')) {
        clearInterval(interval);
        resolve({ hud: text.slice(0, 500) });
      }
    }, 100);
    setTimeout(() => { clearInterval(interval); resolve({ hud: document.body.innerText.slice(0, 500) }); }, 2000);
  });
});

await page.mouse.click(650, 500, { button: 'right' });
await wait(500);
await page.keyboard.press('KeyB');
await wait(100);
await page.keyboard.press('KeyW');
await wait(500);
await page.evaluate(() => {
  const button = [...document.querySelectorAll('.item')].find((b) => b.textContent.includes('微晶短剑'));
  button?.click();
});
await page.screenshot({ path: 'screenshot-input.png' });

console.log(JSON.stringify({ result, simulation, errors }, null, 2));
await browser.close();
if (errors.some((e) => !e.includes('Phaser') && !e.includes('WebGL'))) process.exitCode = 1;

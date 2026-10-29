const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function portNumber() {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r)); return port;
}
test('navegador usa frontend, APIs e SQLite reais', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'e2e-lotofacil-'));
  const db = new Database(path.join(dir, 'lotofacil.db'));
  db.exec('CREATE TABLE concursos (numero INTEGER PRIMARY KEY, data_sorteio TEXT NOT NULL, dezenas TEXT NOT NULL, dezenas_mask INTEGER NOT NULL)');
  const stmt = db.prepare('INSERT INTO concursos VALUES (?, ?, ?, ?)');
  stmt.run(100, '01/10/2026', JSON.stringify(Array.from({length:15}, (_, i) => i + 1)), 32767);
  stmt.run(101, '02/10/2026', JSON.stringify(Array.from({length:15}, (_, i) => i + 2)), 65534);
  db.close();
  const port = await portNumber();
  const child = spawn(process.execPath, ['dist/index.js'], { env: { ...process.env, DATA_DIR: dir, PORT: String(port) }, stdio: 'ignore' });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; }
    rmSync(dir, { recursive: true, force: true });
  });
  let ready = false; const base = `http://127.0.0.1:${port}`;
  for (let i=0; i<100; i++) { try { ready = (await fetch(base+'/api/health')).ok; if (ready) break; } catch {} await new Promise(r=>setTimeout(r,50)); }
  assert.ok(ready);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: {width: 390, height: 844}, isMobile:true, hasTouch:true });
  await page.goto(base);
  await page.locator('#draw-count').fill('2'); await page.locator('#frequency-submit').click();
  await page.locator('#frequency-results').waitFor({state:'visible'});
  assert.match(await page.locator('#frequency-summary').innerText(), /2 concursos analisados.*101/);
  const card = page.locator('.frequency-item').filter({has: page.locator('.frequency-number', {hasText:'01'})});
  assert.equal(await card.locator('.frequency-percent').innerText(), '50,00%');
  await page.locator('#fixed-grid button').nth(0).click();
  await page.locator('#excluded-grid button').nth(24).click();
  await page.locator('#ticket-count').fill('10'); await page.locator('#tickets-submit').click();
  await page.locator('#tickets-results').waitFor({state:'visible'});
  const tickets = await page.locator('.ticket').all(); assert.equal(tickets.length, 10);
  const keys = new Set();
  for (const ticket of tickets) {
    const numbers = (await ticket.locator('.ticket-number').allTextContents()).map(Number);
    assert.equal(numbers.length,15); assert.ok(numbers.includes(1)); assert.ok(!numbers.includes(25)); keys.add(numbers.join(','));
  }
  assert.equal(keys.size,10);
  await page.locator('#finals-mode').click();
  assert.equal(await page.locator('#classic-options').isHidden(), true);
  await page.locator('#final-patterns input[value="none"]').check();
  assert.match(await page.locator('#finals-summary').innerText(), /1 de 5/);
  await page.locator('#tickets-submit').click();
  await page.waitForFunction(() => document.querySelector('#page-indicator').textContent === 'Grupo 2 de 2');
  for (const ticket of await page.locator('.ticket').all()) {
    const values=(await ticket.locator('.ticket-number').allTextContents()).map(Number);
    assert.ok([1,11,21].some(n=>values.includes(n)));
  }
  assert.match(await page.locator('#ticket-combinations').innerText(), /Combinações possíveis/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

});

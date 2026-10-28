const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { chromium } = require('playwright');

const numbers = Array.from({ length: 25 }, (_, i) => ({ dezena: i + 1, aparicoes: i % 3, frequenciaPercentual: (i % 3) * 50 }));
let requests = [];
let mode = 'normal';
let calls = 0;
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/api/statistics')) {
    if (mode === 'empty') return res.end(JSON.stringify({ quantidadeAnalisada: 0, aviso: 'Nenhum concurso disponível.' }));
    return res.end(JSON.stringify({ quantidadeAnalisada: 2, concursoMaisRecente: { numero: 100, dataSorteio: '01/10/2026' }, aviso: 'Histórico incompleto.', dezenas: numbers }));
  }
  if (req.url === '/api/tickets') {
    let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw); requests.push(body);
    if (mode === 'failure') { res.statusCode = 422; return res.end(JSON.stringify({ error: 'Não há combinações suficientes.' })); }
    calls++;
    return res.end(JSON.stringify({ cartelas: Array.from({length:body.quantidade}, () => Array.from({length:15}, (_,i) => i + 1)) }));
  }
  const files = { '/': ['public/index.html', 'text/html'], '/css/styles.css': ['public/css/styles.css', 'text/css'], '/js/app.js': ['public/js/app.js', 'text/javascript'] };
  const file = files[req.url];
  if (!file) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', file[1]); res.end(await readFile(file[0]));
});

test('interface móvel valida entradas, chama APIs e navega entre grupos', async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(await page.locator('h1').innerText(), 'Sistema\nCombinatório.');
  assert.equal(await page.locator('#excluded-grid button').count(), 25);
  assert.equal(await page.locator('#fixed-grid button').count(), 25);
  await page.locator('#draw-count').fill('201'); await page.locator('#frequency-submit').click();
  assert.match(await page.locator('#frequency-message').innerText(), /1 a 200/);
  await page.locator('#draw-count').fill('10'); await page.locator('#frequency-submit').click();
  await page.locator('#frequency-results').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.frequency-item').count(), 25);
  assert.match(await page.locator('#frequency-summary').innerText(), /2 concursos analisados/);
  assert.match(await page.locator('#frequency-warning').innerText(), /Histórico incompleto/);
  mode = 'empty'; await page.locator('#frequency-submit').click();
  await page.waitForFunction(() => document.querySelector('#frequency-message').textContent.includes('Nenhum concurso'));
  assert.equal(await page.locator('#frequency-results').isHidden(), true); mode = 'normal';
  await page.locator('#excluded-grid button').nth(0).click();
  assert.equal(await page.locator('#fixed-grid button').nth(0).isDisabled(), true);
  await page.locator('#fixed-grid button').nth(1).click();
  assert.equal(await page.locator('#excluded-grid button').nth(1).isDisabled(), true);
  assert.equal(await page.locator('#excluded-count').innerText(), '1 / 10');
  await page.locator('#ticket-count').fill('11'); await page.locator('#tickets-submit').click();
  assert.match(await page.locator('#tickets-message').innerText(), /1 a 10/); assert.equal(requests.length, 0);
  await page.locator('#ticket-count').fill('2'); await page.locator('#tickets-submit').click();
  await page.locator('#tickets-results').waitFor({ state: 'visible' });
  assert.deepEqual(requests[0], { quantidade:2, excluidas:[1], fixas:[2] });
  assert.equal(await page.locator('.ticket').count(), 2);
  assert.equal(await page.locator('#page-indicator').innerText(), 'Grupo 1 de 1');
  await page.locator('#ticket-count').fill('1'); await page.locator('#tickets-submit').click();
  await page.waitForFunction(() => document.querySelector('#page-indicator').textContent === 'Grupo 2 de 2');
  assert.equal(await page.locator('.ticket').count(), 1);
  await page.locator('#previous-page').click(); assert.equal(await page.locator('.ticket').count(), 2);
  await page.locator('#next-page').click(); assert.equal(await page.locator('.ticket').count(), 1);
  mode = 'failure'; await page.locator('#tickets-submit').click();
  await page.waitForFunction(() => document.querySelector('#tickets-message').textContent.includes('Não há combinações'));
  assert.equal(await page.locator('#page-indicator').innerText(), 'Grupo 2 de 2');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(jsErrors, []);
});

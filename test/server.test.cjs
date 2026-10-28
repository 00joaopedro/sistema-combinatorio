const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');

async function freePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test('servidor usa PORT, entrega a página, arquivos e API de saúde', async t => {
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/index.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  let health;
  for (let i = 0; i < 50; i++) {
    try { health = await fetch(`${base}/api/health`); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.ok(health, 'servidor não iniciou');
  assert.deepEqual(await health.json(), { status: 'ok' });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Sistema Combinatório/);
  for (const asset of ['/css/styles.css', '/js/app.js']) assert.equal((await fetch(base + asset)).status, 200);
  assert.equal((await fetch(base + '/api/inexistente')).status, 404);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
});

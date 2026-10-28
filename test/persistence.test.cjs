const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { syncLotofacil } = require('../dist/database/sync.js');

async function freePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
}
async function startServer(dir) {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dir };
  delete env.DATA_DIR;
  const child = spawn(process.execPath, ['dist/index.js'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return { child, base }; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill(); throw new Error('Servidor não iniciou.');
}
async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done;
  }
}

test('SQLite persiste em diretório de volume após sincronização e reinício do servidor', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'persistencia-lotofacil-'));
  let server;
  t.after(async () => { if (server) await stop(server.child); rmSync(dir, { recursive: true, force: true }); });
  server = await startServer(dir);
  const empty = await (await fetch(`${server.base}/api/statistics?limit=2`)).json();
  assert.equal(empty.quantidadeAnalisada, 0);
  const db = new Database(path.join(dir, 'lotofacil.db'));
  const fetcher = async url => {
    const n = String(url).endsWith('/lotofacil') ? 2 : Number(String(url).split('/').at(-1));
    return Response.json({ numero: n, dataApuracao: '01/10/2026', listaDezenas: Array.from({ length: 15 }, (_, i) => String(i + 1)) });
  };
  try { assert.equal((await syncLotofacil(db, fetcher, () => {})).inserted, 2); } finally { db.close(); }
  const first = await (await fetch(`${server.base}/api/statistics?limit=2`)).json();
  assert.equal(first.quantidadeAnalisada, 2);
  assert.equal(first.dezenas.find(item => item.dezena === 1).frequenciaPercentual, 100);
  await stop(server.child); server = await startServer(dir);
  const after = await (await fetch(`${server.base}/api/statistics?limit=2`)).json();
  assert.deepEqual(after, first);
});

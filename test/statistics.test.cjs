const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { getFrequencyAnalysis } = require('../dist/services/statistics.service.js');

function prepare(db, number, dozens) {
  db.prepare('INSERT INTO concursos (numero, data_sorteio, dezenas, dezenas_mask) VALUES (?, ?, ?, ?)')
    .run(number, '01/10/2026', JSON.stringify(dozens), 0);
}
function createMemory() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE concursos (numero INTEGER PRIMARY KEY, data_sorteio TEXT NOT NULL, dezenas TEXT NOT NULL, dezenas_mask INTEGER NOT NULL)');
  return db;
}
const from = (start) => Array.from({ length: 15 }, (_, i) => i + start);

test('calcula as frequências com os concursos mais recentes e ordena empates pela dezena', t => {
  const db = createMemory(); t.after(() => db.close());
  prepare(db, 1, from(1)); prepare(db, 2, from(2)); prepare(db, 3, from(3)); prepare(db, 4, from(4));
  const analysis = getFrequencyAnalysis(db, 3);
  assert.equal(analysis.quantidadeAnalisada, 3);
  assert.equal(analysis.quantidadeSolicitada, 3);
  assert.deepEqual(analysis.concursoMaisRecente, { numero: 4, dataSorteio: '01/10/2026' });
  assert.equal(analysis.dadosIncompletos, false);
  assert.equal(analysis.dezenas.length, 25);
  assert.deepEqual(analysis.dezenas.find(x => x.dezena === 2), { dezena: 2, aparicoes: 1, frequenciaPercentual: 33.33 });
  assert.deepEqual(analysis.dezenas.find(x => x.dezena === 3), { dezena: 3, aparicoes: 2, frequenciaPercentual: 66.67 });
  assert.deepEqual(analysis.dezenas.find(x => x.dezena === 25), { dezena: 25, aparicoes: 0, frequenciaPercentual: 0 });
  assert.equal(analysis.dezenas[0].dezena, 4);
});

test('avisa quando o banco está vazio, tem menos concursos ou possui lacunas', t => {
  const db = createMemory(); t.after(() => db.close());
  const empty = getFrequencyAnalysis(db, 10);
  assert.deepEqual(empty.dezenas, []);
  assert.equal(empty.concursoMaisRecente, null);
  assert.equal(empty.dadosIncompletos, true);
  assert.match(empty.aviso, /Nenhum concurso/);
  prepare(db, 5, from(1)); prepare(db, 3, from(1));
  const gap = getFrequencyAnalysis(db, 2);
  assert.equal(gap.possuiLacunas, true);
  assert.equal(gap.dadosIncompletos, true);
  assert.match(gap.aviso, /lacunas/);
  assert.match(getFrequencyAnalysis(db, 3).aviso, /menos concursos.*lacunas/);
  db.prepare('DELETE FROM concursos WHERE numero = 3').run();
  const short = getFrequencyAnalysis(db, 2);
  assert.equal(short.possuiLacunas, false);
  assert.match(short.aviso, /menos concursos/);
});

test('rejeita limites inválidos e dados corrompidos', t => {
  const db = createMemory(); t.after(() => db.close());
  for (const n of [0, 201, 1.5, NaN]) assert.throws(() => getFrequencyAnalysis(db, n), /entre 1 e 200/);
  prepare(db, 1, Array(15).fill(1));
  assert.throws(() => getFrequencyAnalysis(db, 1), /Dados inválidos/);
});

async function getPort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('API valida parâmetros e retorna resposta coerente com os dados persistidos', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'frequency-api-'));
  const db = new Database(path.join(dir, 'lotofacil.db'));
  db.exec('CREATE TABLE concursos (numero INTEGER PRIMARY KEY, data_sorteio TEXT NOT NULL, dezenas TEXT NOT NULL, dezenas_mask INTEGER NOT NULL)');
  prepare(db, 2, from(1)); prepare(db, 3, from(2)); db.close();
  const port = await getPort();
  const child = spawn(process.execPath, ['dist/index.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: 'ignore' });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(`${base}/api/health`)).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, 'servidor não iniciou');
  for (const query of ['', '?limit=0', '?limit=201', '?limit=1.5', '?limit=-1', '?limit=1&limit=2', '?limit=abc']) {
    assert.equal((await fetch(`${base}/api/statistics${query}`)).status, 400, query);
  }
  const response = await fetch(`${base}/api/statistics?limit=2`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const result = await response.json();
  assert.equal(result.quantidadeAnalisada, 2);
  assert.equal(result.dezenas.find(x => x.dezena === 1).frequenciaPercentual, 50);
  assert.equal((await fetch(`${base}/api/statistics?limit=1`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${base}/api/statistics?limit=1`, { method: 'POST' })).status, 405);
});

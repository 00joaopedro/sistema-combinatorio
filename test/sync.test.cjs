const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase, toBitmask } = require('../dist/database/db.js');
const { syncLotofacil } = require('../dist/database/sync.js');

function makeDb(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lotofacil-'));
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const db = openDatabase();
  if (original === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = original;
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
function payload(number, changes = {}) {
  return { numero: number, dataApuracao: '01/10/2026', listaDezenas: Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, '0')), ...changes };
}
function fetchStub(latest, handler) {
  return async url => {
    const last = String(url).split('/').at(-1);
    if (last === 'lotofacil') return Response.json(payload(latest));
    return handler(Number(last));
  };
}
const silent = () => {};

test('sincroniza, valida dados, calcula máscara e recupera lacuna em nova execução', async t => {
  const db = makeDb(t);
  const first = await syncLotofacil(db, fetchStub(4, n => n === 2 ? new Response('', { status: 503 }) : Response.json(payload(n))), silent);
  assert.deepEqual(first.failed, [2]);
  assert.equal(first.inserted, 3);
  assert.equal(first.remaining, 0);
  const row = db.prepare('SELECT * FROM concursos WHERE numero = 4').get();
  assert.deepEqual(JSON.parse(row.dezenas), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.equal(row.dezenas_mask, toBitmask(JSON.parse(row.dezenas)));
  const requested = [];
  const second = await syncLotofacil(db, fetchStub(4, n => { requested.push(n); return Response.json(payload(n)); }), silent);
  assert.deepEqual(requested, [2]);
  assert.equal(second.inserted, 1);
  assert.deepEqual(second.failed, []);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM concursos').get().total, 4);
  const third = await syncLotofacil(db, fetchStub(4, () => { throw new Error('não deveria buscar concurso existente'); }), silent);
  assert.equal(third.inserted, 0);
});

test('não salva respostas inválidas ou concursos com número divergente', async t => {
  const db = makeDb(t);
  const result = await syncLotofacil(db, fetchStub(4, n => {
    if (n === 3) return Response.json(payload(2));
    if (n === 2) return Response.json(payload(2, { listaDezenas: Array(15).fill('01') }));
    return Response.json(payload(1, { dataApuracao: '31/02/2026' }));
  }), silent);
  assert.deepEqual(result.failed, [3, 2, 1]);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM concursos').get().total, 1);
});

test('interrompe após falhas consecutivas e informa os concursos não tentados', async t => {
  const db = makeDb(t);
  const result = await syncLotofacil(db, fetchStub(8, () => { throw new Error('rede indisponível'); }), silent);
  assert.equal(result.inserted, 1);
  assert.deepEqual(result.failed, [7, 6, 5]);
  assert.equal(result.remaining, 4);
  assert.equal(result.interrupted, true);
});

test('indisponibilidade do último concurso não grava dados e retorna erro claro', async t => {
  const db = makeDb(t);
  await assert.rejects(syncLotofacil(db, async () => { throw new Error('offline'); }, silent), /Não foi possível conectar à Caixa/);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM concursos').get().total, 0);
});

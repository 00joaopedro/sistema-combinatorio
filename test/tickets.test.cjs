const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { generateTickets } = require('../dist/services/tickets.service.js');

function check(result, fixed, excluded) {
  assert.equal(new Set(result.cartelas.map(a => a.join(','))).size, result.cartelas.length);
  for (const ticket of result.cartelas) {
    assert.equal(ticket.length, 15);
    assert.equal(new Set(ticket).size, 15);
    assert.deepEqual(ticket, [...ticket].sort((a,b) => a-b));
    assert.ok(ticket.every(n => Number.isInteger(n) && n >= 1 && n <= 25 && !excluded.includes(n)));
    assert.ok(fixed.every(n => ticket.includes(n)));
  }
}

test('gera todas as combinações possíveis sem repetir e respeita as dezenas fixas e excluídas', () => {
  const fixed = Array.from({length:12}, (_,i) => i+1);
  const excluded = [18,19,20,21,22,23,24,25];
  const result = generateTickets({ fixas: fixed, excluidas: excluded, quantidade: 10 });
  assert.equal(result.totalCombinacoesPossiveis, 10);
  assert.equal(result.cartelas.length, 10);
  check(result, fixed, excluded);
});

test('aceita extremos dos filtros e calcula o número exato de combinações', () => {
  const result = generateTickets({ fixas: Array.from({length:12}, (_,i) => i+1), excluidas: [25], quantidade: 10 });
  assert.equal(result.totalCombinacoesPossiveis, 220);
  check(result, Array.from({length:12}, (_,i) => i+1), [25]);
  const only = generateTickets({ excluidas: [16,17,18,19,20,21,22,23,24,25], quantidade: 1 });
  assert.equal(only.totalCombinacoesPossiveis, 1);
  assert.deepEqual(only.cartelas[0], Array.from({length:15}, (_,i) => i+1));
  const unrestricted = generateTickets({ quantidade: 10 });
  assert.equal(unrestricted.totalCombinacoesPossiveis, 3268760);
  check(unrestricted, [], []);
});

test('gera o limite permitido sem duplicar cartelas', () => {
  const result = generateTickets({ quantidade: 10 });
  assert.equal(result.cartelas.length, 10);
  check(result, [], []);
});

test('rejeita parâmetros inválidos, sobreposição e quantidade impossível', () => {
  for (const x of [null, [], {}, { quantidade: 0 }, { quantidade: 1.5 }, { quantidade: '1' },
    { quantidade: 1, fixas: null }, { quantidade: 1, fixas: [1, 1] },
    { quantidade: 1, excluidas: [0] }, { quantidade: 1, fixas: [26] },
    { quantidade: 1, fixas: [1], excluidas: [1] },
    { quantidade: 1, excluidas: Array(11).fill(1) }, { quantidade: 1, fixas: Array(13).fill(1) }]) {
    assert.throws(() => generateTickets(x));
  }
  assert.throws(() => generateTickets({ quantidade: 2, excluidas: [16,17,18,19,20,21,22,23,24,25] }), /1 combinações possíveis/);
  assert.throws(() => generateTickets({ quantidade: 11 }), /limite/i);
});

async function getPort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

test('API valida método, formato, limites e entrega as cartelas solicitadas', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tickets-api-'));
  const port = await getPort();
  const child = spawn(process.execPath, ['dist/index.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: 'ignore' });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; }
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 60; i++) { try { ready = (await fetch(base + '/api/health')).ok; if (ready) break; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(ready);
  const send = body => fetch(base + '/api/tickets', { method:'POST', headers:{'Content-Type':'application/json'}, body });
  assert.equal((await fetch(base + '/api/tickets')).status, 405);
  assert.equal((await fetch(base + '/api/tickets', { method:'POST', body:'{}' })).status, 415);
  assert.equal((await send('{')).status, 400);
  assert.equal((await send(' '.repeat(9000))).status, 413);
  const invalid = await send(JSON.stringify({ quantidade: 2, excluidas: [16,17,18,19,20,21,22,23,24,25] }));
  assert.equal(invalid.status, 422); assert.match((await invalid.json()).error, /1 combinações possíveis/);
  const overLimit = await send(JSON.stringify({ quantidade: 11 }));
  assert.equal(overLimit.status, 400); assert.match((await overLimit.json()).error, /10 cartelas/);
  const response = await send(JSON.stringify({ fixas:[1,2], excluidas:[25], quantidade:10 }));
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.cartelas.length, 10); check(result, [1,2], [25]);
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

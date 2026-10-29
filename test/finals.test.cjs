const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateFinalsTickets } = require('../dist/services/finals.service.js');
const patterns = ['none','only_first','only_second','pair_1_2','only_third','pair_1_3','pair_2_3','all_three'];
const choose = (n,k) => { if (k < 0 || k > n) return 0; let v=1; for (let i=1;i<=k;i++) v=v*(n-i+1)/i; return Math.round(v); };
const count = mask => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
const maskOf = (ticket,col) => [col,col+10,col+20].reduce((m,n,i) => m | (ticket.includes(n) ? 1 << i : 0), 0);

test('cada um dos oito padrões funciona para todos os cinco finais', () => {
  for (let col=1;col<=5;col++) for (let mask=0;mask<8;mask++) {
    const result=generateFinalsTickets({quantidade:10,columnRules:[{column:col,excludePatterns:patterns.filter((_,i)=>i!==mask)}]});
    assert.equal(result.totalCombinacoesPossiveis,choose(22,15-count(mask)));
    assert.equal(new Set(result.cartelas.map(t=>t.join(','))).size,10);
    for(const ticket of result.cartelas) { assert.equal(ticket.length,15); assert.equal(new Set(ticket).size,15); assert.equal(maskOf(ticket,col),mask); assert.ok(ticket.every(n=>n>=1&&n<=25)); }
  }
});

test('conta combinações, respeita regras combinadas e lida com ausência de resultados', () => {
  assert.equal(generateFinalsTickets({quantidade:1}).totalCombinacoesPossiveis,3268760);
  const rules=Array.from({length:5},(_,i)=>({column:i+1,excludePatterns:patterns.filter((_,j)=>j!==7)}));
  const only=generateFinalsTickets({quantidade:1,columnRules:rules});
  assert.equal(only.totalCombinacoesPossiveis,1); assert.deepEqual(only.cartelas[0],[1,2,3,4,5,11,12,13,14,15,21,22,23,24,25]);
  assert.throws(()=>generateFinalsTickets({quantidade:2,columnRules:rules}),/apenas 1 combinações/);
  assert.throws(()=>generateFinalsTickets({quantidade:1,columnRules:[{column:1,excludePatterns:patterns}]}),/apenas 0 combinações/);
});

test('rejeita dados inválidos sem afetar o modo clássico', () => {
  for (const input of [null,{}, {quantidade:11}, {quantidade:0}, {quantidade:'1'}, {quantidade:1,columnRules:null},
    {quantidade:1,columnRules:[{column:6,excludePatterns:[]}]}, {quantidade:1,columnRules:[{column:1,excludePatterns:['invalido']}]},
    {quantidade:1,columnRules:[{column:1,excludePatterns:['none','none']}]}, {quantidade:1,columnRules:[{column:1,excludePatterns:[]},{column:1,excludePatterns:[]}]}]) assert.throws(()=>generateFinalsTickets(input));
  const classic=require('../dist/services/tickets.service.js').generateTickets({quantidade:2,fixas:[1],excluidas:[25]});
  assert.ok(classic.cartelas.every(t=>t.includes(1)&&!t.includes(25)));
});


test('bloqueia o par 11 + 21 isolado, permite o trio e combina regras de finais diferentes', () => {
  const rules = [
    { column: 1, excludePatterns: ['pair_2_3'] },
    { column: 2, excludePatterns: ['only_second', 'pair_1_3'] },
  ];
  for (let i = 0; i < 200; i++) {
    const result = generateFinalsTickets({ quantidade: 10, columnRules: rules });
    for (const ticket of result.cartelas) {
      const group1 = [1,11,21].filter(n => ticket.includes(n)).join(',');
      const group2 = [2,12,22].filter(n => ticket.includes(n)).join(',');
      assert.notEqual(group1, '11,21');
      assert.notEqual(group2, '12');
      assert.notEqual(group2, '2,22');
    }
  }
  const onlyTriple = patterns.filter(p => p !== 'all_three');
  const result = generateFinalsTickets({ quantidade: 10, columnRules: [{ column: 1, excludePatterns: onlyTriple }] });
  assert.ok(result.cartelas.every(ticket => [1,11,21].every(n => ticket.includes(n))));
});

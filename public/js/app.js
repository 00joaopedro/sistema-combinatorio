'use strict';

const byId = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const state = { excluded: new Set(), fixed: new Set(), batches: [], totals: [], page: 0, mode: 'classic' };
const selectors = [
  { key: 'excluded', other: 'fixed', grid: byId('excluded-grid'), count: byId('excluded-count'), max: 10, label: 'excluída' },
  { key: 'fixed', other: 'excluded', grid: byId('fixed-grid'), count: byId('fixed-count'), max: 12, label: 'fixa' },
];

function updateSelectors() {
  for (const selector of selectors) {
    selector.count.textContent = `${state[selector.key].size} / ${selector.max}`;
    for (const button of selector.grid.children) {
      const number = Number(button.dataset.number);
      const selected = state[selector.key].has(number);
      button.setAttribute('aria-pressed', String(selected));
      const blockedByOther = state[selector.other].has(number);
      button.disabled = blockedByOther || (!selected && state[selector.key].size >= selector.max);
      button.title = blockedByOther ? 'Esta dezena já está selecionada na outra lista.' : '';
    }
  }
}
for (const selector of selectors) {
  for (let number = 1; number <= 25; number++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'number-button';
    button.dataset.number = String(number);
    button.textContent = pad(number);
    button.setAttribute('aria-label', `Dezena ${pad(number)} ${selector.label}`);
    button.addEventListener('click', () => {
      if (state[selector.key].has(number)) state[selector.key].delete(number);
      else if (state[selector.key].size < selector.max && !state[selector.other].has(number)) state[selector.key].add(number);
      updateSelectors();
    });
    selector.grid.append(button);
  }
}
updateSelectors();

const finalLabels = ['Nenhum', 'Apenas {0}', 'Apenas {1}', 'Apenas {2}', '{0} + {1}', '{0} + {2}', '{1} + {2}', 'Todas: {0} + {1} + {2}'];
const finalValues = ['none', 'only_first', 'only_second', 'only_third', 'pair_1_2', 'pair_1_3', 'pair_2_3', 'all_three'];
const finalRules = Array.from({ length: 5 }, () => new Set());
let activeFinal = 0;
function renderFinals() {
  const tabs = byId('final-tabs'); const options = byId('final-patterns');
  tabs.replaceChildren(); options.replaceChildren();
  for (let i = 0; i < 5; i++) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'final-tab';
    tab.textContent = `Final ${i + 1}`; tab.setAttribute('aria-pressed', String(i === activeFinal));
    tab.addEventListener('click', () => { activeFinal = i; renderFinals(); }); tabs.append(tab);
  }
  const group = [activeFinal + 1, activeFinal + 11, activeFinal + 21].map(pad);
  const title = document.createElement('p'); title.className = 'field-help'; title.textContent = `Final ${activeFinal + 1}: ${group.join(', ')} — marque os padrões para excluir.`; options.append(title);
  finalLabels.forEach((text, index) => {
    const label = document.createElement('label'); label.className = 'pattern-option';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = finalValues[index]; checkbox.checked = finalRules[activeFinal].has(checkbox.value);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) finalRules[activeFinal].add(checkbox.value); else finalRules[activeFinal].delete(checkbox.value);
      byId('finals-summary').textContent = `Finais configurados: ${finalRules.filter(x => x.size).length} de 5`;
    });
    const description = document.createElement('span'); description.textContent = text.replace(/\{(\d)\}/g, (_, n) => group[Number(n)]);
    label.append(checkbox, description); options.append(label);
  });
  byId('finals-summary').textContent = `Finais configurados: ${finalRules.filter(x => x.size).length} de 5`;
}
renderFinals();
function setMode(mode) {
  state.mode = mode;
  byId('classic-mode').setAttribute('aria-pressed', String(mode === 'classic'));
  byId('finals-mode').setAttribute('aria-pressed', String(mode === 'finals'));
  byId('classic-options').hidden = mode !== 'classic'; byId('finals-options').hidden = mode !== 'finals';
  message(byId('tickets-message'), '');
}
byId('classic-mode').addEventListener('click', () => setMode('classic'));
byId('finals-mode').addEventListener('click', () => setMode('finals'));

function message(element, text, kind = '') {
  element.textContent = text;
  element.className = `message ${kind}`.trim();
}
function getInteger(input, min, max) {
  if (!input.value || !input.validity.valid || !Number.isInteger(input.valueAsNumber) || input.valueAsNumber < min || input.valueAsNumber > max) return null;
  return input.valueAsNumber;
}
async function getJson(url, options) {
  let response;
  try { response = await fetch(url, options); }
  catch { throw new Error('Não foi possível conectar ao servidor. Tente novamente.'); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('O servidor retornou uma resposta inválida. Tente novamente.'); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Não foi possível concluir a solicitação. Tente novamente.');
  return data;
}

byId('frequency-form').addEventListener('submit', async event => {
  event.preventDefault();
  const status = byId('frequency-message');
  const limit = getInteger(byId('draw-count'), 1, 200);
  if (limit === null) { message(status, 'Informe uma quantidade inteira de 1 a 200 concursos.', 'error'); return; }
  const button = byId('frequency-submit');
  button.disabled = true;
  byId('frequency-results').hidden = true;
  message(status, 'Carregando informações...', 'loading');
  try {
    const data = await getJson(`/api/statistics?limit=${limit}`);
    if (!data.quantidadeAnalisada) { message(status, data.aviso || 'Nenhum concurso disponível.', 'error'); return; }
    const grid = byId('frequency-grid');
    grid.replaceChildren();
    for (const item of data.dezenas) {
      const card = document.createElement('div'); card.className = 'frequency-item';
      const number = document.createElement('span'); number.className = 'frequency-number'; number.textContent = pad(item.dezena);
      const percent = document.createElement('span'); percent.className = 'frequency-percent'; percent.textContent = `${Number(item.frequenciaPercentual).toFixed(2).replace('.', ',')}%`;
      const count = document.createElement('span'); count.className = 'frequency-count'; count.textContent = `${item.aparicoes} ${item.aparicoes === 1 ? 'vez' : 'vezes'}`;
      card.append(number, percent, count); grid.append(card);
    }
    const latest = data.concursoMaisRecente;
    byId('frequency-summary').textContent = `${data.quantidadeAnalisada} ${data.quantidadeAnalisada === 1 ? 'concurso analisado' : 'concursos analisados'} · Mais recente: ${latest.numero} (${latest.dataSorteio})`;
    const warning = byId('frequency-warning'); warning.textContent = data.aviso || ''; warning.hidden = !data.aviso;
    byId('frequency-results').hidden = false;
    message(status, '');
  } catch (error) { message(status, error.message, 'error'); }
  finally { button.disabled = false; }
});

function renderBatch() {
  const batch = state.batches[state.page];
  const list = byId('tickets-list'); list.replaceChildren();
  const start = state.batches.slice(0, state.page).reduce((count, group) => count + group.length, 0);
  batch.forEach((ticket, index) => {
    const card = document.createElement('article'); card.className = 'ticket';
    const heading = document.createElement('div'); heading.className = 'ticket-header';
    const title = document.createElement('span'); title.textContent = `JOGO ${pad(start + index + 1)}`;
    const caption = document.createElement('span'); caption.textContent = '15 DEZENAS'; heading.append(title, caption);
    const numbers = document.createElement('div'); numbers.className = 'ticket-numbers';
    for (const number of ticket) { const square = document.createElement('span'); square.className = 'ticket-number'; square.textContent = pad(number); numbers.append(square); }
    card.append(heading, numbers); list.append(card);
  });
  byId('ticket-combinations').textContent = `Combinações possíveis com as regras deste grupo: ${state.totals[state.page].toLocaleString('pt-BR')}.`;
  byId('page-indicator').textContent = `Grupo ${state.page + 1} de ${state.batches.length}`;
  byId('previous-page').disabled = state.page === 0;
  byId('next-page').disabled = state.page === state.batches.length - 1;
  byId('tickets-results').hidden = false;
}

byId('tickets-form').addEventListener('submit', async event => {
  event.preventDefault();
  const status = byId('tickets-message');
  const quantity = getInteger(byId('ticket-count'), 1, 10);
  if (quantity === null) { message(status, 'Informe uma quantidade inteira de 1 a 10 jogos.', 'error'); return; }
  const mode = state.mode;
  const payload = mode === 'classic' ? { quantidade: quantity, excluidas: [...state.excluded], fixas: [...state.fixed] } : { quantidade: quantity, columnRules: finalRules.map((rules, i) => ({ column: i + 1, excludePatterns: [...rules] })).filter(rule => rule.excludePatterns.length) };
  const button = byId('tickets-submit'); button.disabled = true;
  message(status, 'Criando cartelas...', 'loading');
  try {
    const data = await getJson(mode === 'classic' ? '/api/tickets' : '/api/tickets/finais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    state.batches.push(data.cartelas); state.totals.push(data.totalCombinacoesPossiveis); state.page = state.batches.length - 1; renderBatch();
    message(status, `${data.cartelas.length} ${data.cartelas.length === 1 ? 'cartela criada' : 'cartelas criadas'}.`);
  } catch (error) { message(status, error.message, 'error'); }
  finally { button.disabled = false; }
});
byId('previous-page').addEventListener('click', () => { if (state.page > 0) { state.page--; renderBatch(); } });
byId('next-page').addEventListener('click', () => { if (state.page < state.batches.length - 1) { state.page++; renderBatch(); } });

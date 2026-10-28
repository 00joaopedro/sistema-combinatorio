'use strict';

const byId = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const state = { excluded: new Set(), fixed: new Set(), batches: [], page: 0 };
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
  const payload = { quantidade: quantity, excluidas: [...state.excluded], fixas: [...state.fixed] };
  const button = byId('tickets-submit'); button.disabled = true;
  message(status, 'Criando cartelas...', 'loading');
  try {
    const data = await getJson('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    state.batches.push(data.cartelas); state.page = state.batches.length - 1; renderBatch();
    message(status, `${data.cartelas.length} ${data.cartelas.length === 1 ? 'cartela criada' : 'cartelas criadas'}.`);
  } catch (error) { message(status, error.message, 'error'); }
  finally { button.disabled = false; }
});
byId('previous-page').addEventListener('click', () => { if (state.page > 0) { state.page--; renderBatch(); } });
byId('next-page').addEventListener('click', () => { if (state.page < state.batches.length - 1) { state.page++; renderBatch(); } });

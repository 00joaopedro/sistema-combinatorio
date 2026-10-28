import type Database from 'better-sqlite3';
import { toBitmask } from './db.js';

const CAIXA_API = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil';
const TIMEOUT_MS = 15_000;
const MAX_CONSECUTIVE_FAILURES = 3;

type Concurso = { numero: number; data_sorteio: string; dezenas: number[] };
export type SyncResult = { latest: number; inserted: number; failed: number[]; remaining: number; interrupted: boolean };

function validateConcurso(input: unknown, expected?: number): Concurso {
  if (!input || typeof input !== 'object') throw new Error('Resposta inválida da Caixa.');
  const data = input as Record<string, unknown>;
  if (!Number.isSafeInteger(data.numero) || (data.numero as number) < 1 || (expected !== undefined && data.numero !== expected)) {
    throw new Error('Número do concurso inválido ou divergente.');
  }
  if (typeof data.dataApuracao !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(data.dataApuracao)) throw new Error('Data de sorteio inválida.');
  const [day, month, year] = data.dataApuracao.split('/').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Data de sorteio inválida.');
  if (!Array.isArray(data.listaDezenas) || data.listaDezenas.length !== 15) throw new Error('O concurso deve conter 15 dezenas.');
  const dozens = data.listaDezenas.map((d: unknown) => {
    if (typeof d !== 'string' || !/^\d{1,2}$/.test(d)) throw new Error('Dezena inválida.');
    const n = Number(d);
    if (n < 1 || n > 25) throw new Error('Dezena fora do intervalo de 1 a 25.');
    return n;
  });
  if (new Set(dozens).size !== 15) throw new Error('Dezenas repetidas.');
  return { numero: data.numero as number, data_sorteio: data.dataApuracao, dezenas: dozens.sort((a, b) => a - b) };
}

async function fetchConcurso(url: string, fetcher: typeof fetch, expected?: number): Promise<Concurso> {
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Não foi possível conectar à Caixa ou a solicitação expirou.');
  }
  if (!response.ok) throw new Error(`Caixa indisponível para esta solicitação (HTTP ${response.status}).`);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error('A Caixa retornou uma resposta que não é JSON válido.'); }
  return validateConcurso(payload, expected);
}

/** Sincronização manual e incremental; lacunas são detectadas em todas as execuções. */
export async function syncLotofacil(db: Database.Database, fetcher: typeof fetch = fetch, log: (message: string) => void = console.log): Promise<SyncResult> {
  const latest = await fetchConcurso(CAIXA_API, fetcher);
  const existing = new Set((db.prepare('SELECT numero FROM concursos WHERE numero <= ?').all(latest.numero) as { numero: number }[]).map(row => row.numero));
  const missing: number[] = [];
  // Prioriza concursos recentes, sem esquecer as lacunas mais antigas.
  for (let n = latest.numero; n >= 1; n--) if (!existing.has(n)) missing.push(n);
  const insert = db.prepare('INSERT INTO concursos (numero, data_sorteio, dezenas, dezenas_mask) VALUES (?, ?, ?, ?) ON CONFLICT(numero) DO NOTHING');
  let inserted = 0;
  let consecutiveFailures = 0;
  const failed: number[] = [];
  let processed = 0;
  log(`Último concurso: ${latest.numero}. Pendentes: ${missing.length}.`);
  for (const number of missing) {
    let concurso: Concurso;
    try {
      concurso = number === latest.numero ? latest : await fetchConcurso(`${CAIXA_API}/${number}`, fetcher, number);
    } catch (error) {
      failed.push(number);
      processed++;
      consecutiveFailures++;
      log(`Falha no concurso ${number}: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
      continue;
    }
    // Erros de banco são fatais e não são confundidos com falhas de rede.
    const result = insert.run(concurso.numero, concurso.data_sorteio, JSON.stringify(concurso.dezenas), toBitmask(concurso.dezenas));
    inserted += result.changes;
    processed++;
    consecutiveFailures = 0;
    if (processed % 50 === 0) log(`Processados ${processed} de ${missing.length} concursos pendentes.`);
  }
  return { latest: latest.numero, inserted, failed, remaining: missing.length - processed, interrupted: processed < missing.length };
}

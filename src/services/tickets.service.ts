import { randomInt } from 'node:crypto';

export const MAX_TICKETS = 10_000;
export class TicketInputError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - k + i) / i;
  return Math.round(result);
}

function validateNumbers(value: unknown, name: string, max: number): number[] {
  if (!Array.isArray(value) || value.length > max || value.some(n => !Number.isInteger(n) || n < 1 || n > 25)) {
    throw new TicketInputError(`${name} deve ser uma lista de até ${max} dezenas inteiras entre 1 e 25.`);
  }
  if (new Set(value).size !== value.length) throw new TicketInputError(`${name} contém dezenas repetidas.`);
  return value as number[];
}

/** Reconstrói a combinação na posição rank, sem enumerar todas as combinações. */
function unrank(pool: number[], size: number, rank: number): number[] {
  const result: number[] = [];
  let start = 0;
  for (let remaining = size; remaining > 0; remaining--) {
    for (let i = start; i <= pool.length - remaining; i++) {
      const count = combinations(pool.length - i - 1, remaining - 1);
      if (rank < count) { result.push(pool[i]); start = i + 1; break; }
      rank -= count;
    }
  }
  return result;
}

export interface TicketResult {
  quantidadeSolicitada: number;
  totalCombinacoesPossiveis: number;
  cartelas: number[][];
}

/** Gera jogos únicos em ordem aleatória, sem garantia de prêmio ou fechamento. */
export function generateTickets(input: unknown): TicketResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TicketInputError('Envie um objeto JSON com as opções das cartelas.');
  const options = input as Record<string, unknown>;
  const excluded = validateNumbers(options.excluidas === undefined ? [] : options.excluidas, 'excluidas', 10);
  const fixed = validateNumbers(options.fixas === undefined ? [] : options.fixas, 'fixas', 12);
  const quantity = options.quantidade;
  if (!Number.isSafeInteger(quantity) || (quantity as number) < 1) throw new TicketInputError('quantidade deve ser um número inteiro positivo.');
  const excludedSet = new Set(excluded);
  if (fixed.some(n => excludedSet.has(n))) throw new TicketInputError('Uma dezena não pode ser fixa e excluída ao mesmo tempo.');
  const fixedSet = new Set(fixed);
  const pool = Array.from({ length: 25 }, (_, i) => i + 1).filter(n => !excludedSet.has(n) && !fixedSet.has(n));
  const size = 15 - fixed.length;
  const total = combinations(pool.length, size);
  if ((quantity as number) > total) throw new TicketInputError(`A quantidade solicitada supera as ${total} combinações possíveis.`, 422);
  if ((quantity as number) > MAX_TICKETS) throw new TicketInputError(`O limite é de ${MAX_TICKETS} cartelas por solicitação.`);

  // Fisher-Yates parcial: escolhe ranks sem repetição usando memória proporcional à quantidade pedida.
  const swaps = new Map<number, number>();
  const tickets: number[][] = [];
  for (let i = 0; i < (quantity as number); i++) {
    const chosen = randomInt(i, total);
    const rank = swaps.get(chosen) ?? chosen;
    swaps.set(chosen, swaps.get(i) ?? i);
    tickets.push([...fixed, ...unrank(pool, size, rank)].sort((a, b) => a - b));
  }
  return { quantidadeSolicitada: quantity as number, totalCombinacoesPossiveis: total, cartelas: tickets };
}

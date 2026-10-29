import { randomInt } from 'node:crypto';
import { MAX_TICKETS, TicketInputError, type TicketResult } from './tickets.service.js';

const patterns = ['none', 'only_first', 'only_second', 'pair_1_2', 'only_third', 'pair_1_3', 'pair_2_3', 'all_three'] as const;
const free = [6, 7, 8, 9, 10, 16, 17, 18, 19, 20];

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) result = result * (n - i + 1) / i;
  return Math.round(result);
}
function bitCount(mask: number): number { return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1); }

export function generateFinalsTickets(input: unknown): TicketResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TicketInputError('Envie um objeto JSON válido.');
  const options = input as Record<string, unknown>;
  const quantity = options.quantidade;
  if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_TICKETS) {
    throw new TicketInputError('Informe uma quantidade inteira de 1 a 10 jogos.');
  }
  const rules = options.columnRules === undefined ? [] : options.columnRules;
  if (!Array.isArray(rules) || rules.length > 5) throw new TicketInputError('Informe até cinco regras de finais.');
  const blocked = Array.from({ length: 5 }, () => new Set<number>());
  const seen = new Set<number>();
  for (const item of rules) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TicketInputError('Regra de final inválida.');
    const rule = item as Record<string, unknown>;
    if (!Number.isInteger(rule.column) || (rule.column as number) < 1 || (rule.column as number) > 5 || seen.has(rule.column as number)) throw new TicketInputError('Cada final de 1 a 5 deve aparecer apenas uma vez.');
    seen.add(rule.column as number);
    if (!Array.isArray(rule.excludePatterns) || rule.excludePatterns.length > 8) throw new TicketInputError('Padrões de exclusão inválidos.');
    const set = blocked[(rule.column as number) - 1];
    for (const pattern of rule.excludePatterns) {
      const index = patterns.findIndex(p => p === pattern);
      if (index < 0 || set.has(index)) throw new TicketInputError('Padrão de exclusão desconhecido ou repetido.');
      set.add(index);
    }
  }
  // Conta os completamentos possíveis para cada grupo e quantidade de dezenas ainda necessárias.
  const dp = Array.from({ length: 6 }, () => Array<number>(16).fill(0));
  for (let left = 0; left <= 15; left++) dp[5][left] = choose(free.length, left);
  for (let group = 4; group >= 0; group--) {
    for (let left = 0; left <= 15; left++) {
      for (let mask = 0; mask < 8; mask++) if (!blocked[group].has(mask) && bitCount(mask) <= left) dp[group][left] += dp[group + 1][left - bitCount(mask)];
    }
  }
  const total = dp[0][15];
  if ((quantity as number) > total) throw new TicketInputError(`As regras permitem apenas ${total} combinações. Ajuste os filtros ou a quantidade.`, 422);
  const swaps = new Map<number, number>();
  const cartelas: number[][] = [];
  for (let i = 0; i < (quantity as number); i++) {
    const picked = randomInt(i, total);
    let rank = swaps.get(picked) ?? picked;
    swaps.set(picked, swaps.get(i) ?? i);
    const ticket: number[] = [];
    let left = 15;
    for (let group = 0; group < 5; group++) {
      for (let mask = 0; mask < 8; mask++) {
        const count = bitCount(mask);
        if (blocked[group].has(mask) || count > left) continue;
        const ways = dp[group + 1][left - count];
        if (rank >= ways) { rank -= ways; continue; }
        for (let bit = 0; bit < 3; bit++) if (mask & (1 << bit)) ticket.push(group + 1 + bit * 10);
        left -= count;
        break;
      }
    }
    let start = 0;
    for (let remaining = left; remaining > 0; remaining--) {
      for (let j = start; j <= free.length - remaining; j++) {
        const ways = choose(free.length - j - 1, remaining - 1);
        if (rank >= ways) { rank -= ways; continue; }
        ticket.push(free[j]); start = j + 1; break;
      }
    }
    cartelas.push(ticket.sort((a, b) => a - b));
  }
  return { quantidadeSolicitada: quantity as number, totalCombinacoesPossiveis: total, cartelas };
}

import type Database from 'better-sqlite3';

export interface FrequencyStat {
  dezena: number;
  aparicoes: number;
  frequenciaPercentual: number;
}

export interface FrequencyAnalysis {
  quantidadeSolicitada: number;
  quantidadeAnalisada: number;
  concursoMaisRecente: { numero: number; dataSorteio: string } | null;
  dadosIncompletos: boolean;
  possuiLacunas: boolean;
  aviso: string | null;
  dezenas: FrequencyStat[];
}

/** Analisa concursos já armazenados, sem sincronizar com a Caixa. */
export function getFrequencyAnalysis(db: Database.Database, limit: number): FrequencyAnalysis {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new RangeError('A quantidade deve ser um número inteiro entre 1 e 200.');
  }
  const rows = db.prepare('SELECT numero, data_sorteio, dezenas FROM concursos ORDER BY numero DESC LIMIT ?')
    .all(limit) as { numero: number; data_sorteio: string; dezenas: string }[];
  const possuiLacunas = rows.some((row, index) => index > 0 && rows[index - 1].numero - row.numero !== 1);
  const dadosIncompletos = rows.length < limit || possuiLacunas;
  let aviso: string | null = null;
  if (!rows.length) {
    aviso = 'Nenhum concurso disponível. Execute a sincronização antes de consultar as frequências.';
  } else if (possuiLacunas && rows.length < limit) {
    aviso = 'Há menos concursos disponíveis do que o solicitado e existem lacunas no período analisado. Execute a sincronização.';
  } else if (possuiLacunas) {
    aviso = 'Existem lacunas no período analisado. Execute a sincronização para completar o histórico.';
  } else if (rows.length < limit) {
    aviso = 'Há menos concursos disponíveis do que o solicitado. Execute a sincronização para atualizar o histórico.';
  }

  const counts = Array<number>(26).fill(0);
  for (const row of rows) {
    const dezenas: unknown = JSON.parse(row.dezenas);
    if (!Array.isArray(dezenas) || dezenas.length !== 15 || new Set(dezenas).size !== 15 ||
      dezenas.some(n => !Number.isInteger(n) || n < 1 || n > 25)) {
      throw new Error(`Dados inválidos no concurso ${row.numero}.`);
    }
    for (const dezena of dezenas as number[]) counts[dezena]++;
  }

  return {
    quantidadeSolicitada: limit,
    quantidadeAnalisada: rows.length,
    concursoMaisRecente: rows.length ? { numero: rows[0].numero, dataSorteio: rows[0].data_sorteio } : null,
    dadosIncompletos,
    possuiLacunas,
    aviso,
    dezenas: rows.length ? Array.from({ length: 25 }, (_, index) => {
      const dezena = index + 1;
      return { dezena, aparicoes: counts[dezena], frequenciaPercentual: Number((counts[dezena] * 100 / rows.length).toFixed(2)) };
    }).sort((a, b) => b.aparicoes - a.aparicoes || a.dezena - b.dezena) : [],
  };
}

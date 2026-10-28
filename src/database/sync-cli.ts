import { openDatabase } from './db.js';
import { syncLotofacil } from './sync.js';

async function main(): Promise<void> {
  const db = openDatabase();
  try {
    const result = await syncLotofacil(db);
    console.log(`Salvos: ${result.inserted}. Falhas: ${result.failed.length}. Ainda não tentados: ${result.remaining}.`);
    if (result.failed.length || result.interrupted) {
      console.error('Sincronização incompleta. Execute novamente para tentar os concursos pendentes.');
      process.exitCode = 1;
    } else {
      console.log('Sincronização concluída.');
    }
  } finally {
    db.close();
  }
}
main().catch((error: unknown) => {
  console.error(`Não foi possível sincronizar: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
  process.exitCode = 1;
});

# Sistema Combinatório

Base do sistema para Lotofácil. A página inicial e o banco de concursos estão disponíveis; as estatísticas e o gerador de cartelas serão implementados nos próximos PRs.

## Requisitos e execução

Node.js 20.18 ou superior (até a versão 24), npm e, quando não houver binário do better-sqlite3 disponível para a plataforma, ferramentas de compilação nativa.

```sh
npm ci
npm run build
npm start
```

Acesse http://localhost:3000. Para desenvolvimento, use `npm run dev`; para compilar e testar, `npm test`. O servidor usa `PORT` ou 3000 e oferece `GET /api/health`.

## SQLite e sincronização

O servidor cria automaticamente `lotofacil.db` no diretório `data/`, fora do Git. A variável `DATA_DIR`, se definida, escolhe outro diretório; caso contrário, `RAILWAY_VOLUME_MOUNT_PATH` é usada quando disponível. O processo precisa ter permissão de leitura e escrita nesse diretório.

Para buscar ou atualizar os concursos, execute **manualmente**, depois do build, no ambiente que contém o mesmo banco:

```sh
npm run sync
```

O comando consulta a Caixa e salva os concursos ausentes, priorizando os mais recentes. Em toda execução, identifica lacunas inclusive abaixo do maior concurso já salvo. Registros válidos são preservados após uma interrupção. Falhas são exibidas e o comando termina com código diferente de zero; execute novamente para tentar os pendentes. Após três falhas consecutivas a execução é interrompida. A primeira sincronização pode demorar, pois busca todo o histórico. Não há sincronização automática por visita ou em segundo plano. Execute apenas uma sincronização por vez.

## Railway

Para manter o SQLite entre deploys, adicione um volume persistente ao serviço, por exemplo montado em `/data`, e configure `DATA_DIR=/data` no mesmo serviço. O diretório configurado e o ponto de montagem do volume devem coincidir. O banco é criado quando o servidor inicia; o volume não está disponível durante o build. Execute `npm run sync` no ambiente do serviço em execução, por exemplo pelo terminal do serviço, após o deploy; isso não é feito automaticamente. Verifique nos logs se a Caixa está acessível e se a sincronização terminou sem erros. O volume requer backup separado e o serviço deve usar uma única instância com esse banco local.

# Sistema Combinatório

Base do sistema para Lotofácil. A página inicial e o banco de concursos estão disponíveis; as estatísticas e o gerador de cartelas serão implementados nos próximos PRs.

## Requisitos e execução

Node.js 22 ou 24, npm e, quando não houver binário do better-sqlite3 disponível para a plataforma, ferramentas de compilação nativa.

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

## API de frequência

`GET /api/statistics?limit=100` calcula as frequências dos últimos concursos **presentes no banco**. `limit` é obrigatório e deve ser um inteiro de 1 a 200. A resposta contém `quantidadeSolicitada`, `quantidadeAnalisada`, `concursoMaisRecente`, `dadosIncompletos`, `possuiLacunas`, `aviso` e `dezenas`. Cada dezena contém `dezena`, `aparicoes` e `frequenciaPercentual`, calculada sobre a quantidade efetivamente analisada e arredondada a duas casas decimais. Os resultados são ordenados por maior frequência e, em caso de empate, pela dezena.

Se não houver concursos, `dezenas` é uma lista vazia e a resposta contém um aviso. Um intervalo com lacunas ou quantidade menor do que a pedida também recebe aviso; as frequências continuam calculadas apenas com os concursos disponíveis. A API não verifica se a Caixa possui um concurso mais recente que o banco: execute a sincronização antes de consultar para atualizá-lo. Frequências passadas não preveem resultados futuros.

## API de cartelas

`POST /api/tickets` recebe `Content-Type: application/json`. Exemplo:

```json
{"excluidas":[24,25],"fixas":[1,2,3],"quantidade":20}
```

As listas são opcionais e aceitam até 10 dezenas excluídas e 12 fixas, como inteiros de 1 a 25 sem repetição nem sobreposição. `quantidade` é obrigatória, inteira e positiva. A resposta informa `quantidadeSolicitada`, `totalCombinacoesPossiveis` e `cartelas`: cada jogo tem 15 dezenas, em ordem crescente, e não há duplicados na mesma resposta. A sequência de jogos pode ser exibida no frontend em blocos de 10. Cada solicitação gera uma nova seleção; os resultados não são salvos no servidor.

Se a quantidade ultrapassar as combinações possíveis, a API retorna erro 422 com o total disponível. Para controlar o uso de recursos, há um limite de 10.000 cartelas por solicitação, um ajuste desta versão. Os jogos são escolhidos aleatoriamente entre as combinações válidas; o gerador não utiliza matriz de fechamento e não garante premiação.

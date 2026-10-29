# Sistema Combinatório

Sistema para Lotofácil com análise de frequência e gerador de cartelas. A interface permite criar até 10 jogos por vez e navegar entre os grupos criados durante a sessão.

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

Para manter o SQLite entre deploys, adicione um volume persistente ao serviço, por exemplo montado em `/data`, e configure `DATA_DIR=/data` no mesmo serviço. O diretório configurado e o ponto de montagem do volume devem coincidir. O banco é criado quando o servidor inicia; o volume não está disponível durante o build. Execute `npm run sync` dentro do contêiner do serviço em execução, por exemplo conectando-se com `railway ssh` e depois executando o comando; isso não é feito automaticamente. `railway run` executa comandos na máquina local e não acessa o arquivo do volume remoto. Verifique nos logs se a Caixa está acessível e se a sincronização terminou sem erros. O volume requer backup separado e o serviço deve usar uma única instância com esse banco local.

## API de frequência

`GET /api/statistics?limit=100` calcula as frequências dos últimos concursos **presentes no banco**. `limit` é obrigatório e deve ser um inteiro de 1 a 200. A resposta contém `quantidadeSolicitada`, `quantidadeAnalisada`, `concursoMaisRecente`, `dadosIncompletos`, `possuiLacunas`, `aviso` e `dezenas`. Cada dezena contém `dezena`, `aparicoes` e `frequenciaPercentual`, calculada sobre a quantidade efetivamente analisada e arredondada a duas casas decimais. Os resultados são ordenados por maior frequência e, em caso de empate, pela dezena.

Se não houver concursos, `dezenas` é uma lista vazia e a resposta contém um aviso. Um intervalo com lacunas ou quantidade menor do que a pedida também recebe aviso; as frequências continuam calculadas apenas com os concursos disponíveis. A API não verifica se a Caixa possui um concurso mais recente que o banco: execute a sincronização antes de consultar para atualizá-lo. Frequências passadas não preveem resultados futuros.

## API de cartelas

`POST /api/tickets` recebe `Content-Type: application/json`. Exemplo:

```json
{"excluidas":[24,25],"fixas":[1,2,3],"quantidade":10}
```

As listas são opcionais e aceitam até 10 dezenas excluídas e 12 fixas, como inteiros de 1 a 25 sem repetição nem sobreposição. `quantidade` é obrigatória, inteira e positiva. A resposta informa `quantidadeSolicitada`, `totalCombinacoesPossiveis` e `cartelas`: cada jogo tem 15 dezenas, em ordem crescente, e não há duplicados na mesma resposta. Cada solicitação gera de 1 a 10 jogos. Uma nova solicitação gera outra seleção; os resultados não são salvos no servidor e podem se repetir entre solicitações.

Se a quantidade ultrapassar as combinações possíveis, a API retorna erro 422 com o total disponível. Para controlar o uso de recursos, há um limite de 10 cartelas por solicitação, um ajuste desta versão. Os jogos são escolhidos aleatoriamente entre as combinações válidas; o gerador não utiliza matriz de fechamento e não garante premiação.

## Interface

Na página inicial, informe de 1 a 200 concursos e clique em **Carregar informações** para consultar a frequência dos dados salvos. No gerador, as dezenas fixas e excluídas são opcionais; selecione até 12 fixas e 10 excluídas, escolha de 1 a 10 jogos e clique em **Criar cartelas**. Cada novo clique cria outro grupo, acessível pelos controles de navegação. Os grupos permanecem apenas enquanto a página estiver aberta e os jogos podem se repetir entre grupos.

## Verificação após o deploy

1. Confirme no serviço Railway que o volume está montado em `/data` e que `DATA_DIR=/data` aponta para ele. Configure também o healthcheck em `/api/health`.
2. Após o deploy, acesse o terminal **remoto** do serviço e execute `npm run sync`. A primeira execução busca todo o histórico e pode demorar. Se falhar, tente novamente e confira os logs. Não há atualização automática: repita esse comando para atualizar os concursos.
3. Na página, teste a frequência e a geração de até 10 cartelas. Confira a data e o número do concurso mais recente exibido.
4. Com o volume configurado, reinicie o serviço e confira se a mesma análise continua disponível. Após uma atualização de código, repita a conferência. O teste automatizado simula reinício local com diretório persistente; não substitui essa verificação no Railway.
5. Configure backups para o volume e teste a restauração conforme a necessidade. O volume e os arquivos do SQLite não estão no Git.

Para testar o navegador localmente, instale Playwright e Chromium separadamente; o GitHub Actions executa `node --test test-browser/*.test.cjs` com os navegadores e dependências necessários.

## Modo finais

`POST /api/tickets/finais` recebe `quantidade` (1 a 10) e `columnRules`, por exemplo `{ "quantidade": 10, "columnRules": [{ "column": 1, "excludePatterns": ["none", "only_first"] }] }`. Cada grupo (1 a 5) contém as dezenas N, N+10 e N+20. Os padrões permitidos são `none`, `only_first`, `only_second`, `only_third`, `pair_1_2`, `pair_1_3`, `pair_2_3` e `all_three`; cada item escolhido exclui o padrão exato. Dezenas com finais de 6 a 0 são livres. A resposta inclui o número de combinações possíveis e jogos únicos por solicitação. Se as regras não comportarem a quantidade solicitada, o servidor retorna 422. O modo clássico permanece independente.

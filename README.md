# Sistema Combinatório

Base inicial do sistema para Lotofácil. Esta versão apresenta uma página inicial e um endpoint de saúde; as estatísticas e o gerador de cartelas serão implementados em PRs posteriores.

## Requisitos

Node.js 20.18 ou superior (até a versão 24), npm e ferramentas de compilação nativa caso não exista um binário do better-sqlite3 para a plataforma.

## Desenvolvimento

```sh
npm ci
npm run dev
```

Acesse http://localhost:3000. Para executar os testes: `npm test`.

## Produção

```sh
npm ci
npm run build
npm start
```

O servidor escuta em `0.0.0.0` e usa a variável `PORT` quando definida; caso contrário, usa a porta 3000. O endpoint `GET /api/health` retorna o estado do servidor. O SQLite foi incluído como dependência, mas a criação e sincronização do banco serão feitas no próximo PR. Em produção, instale também as dependências de desenvolvimento durante o build, pois elas incluem o TypeScript.

O arquivo `package-lock.json` fixa as versões instaladas. A verificação automática instala os pacotes e testa o SQLite nos Nodes 20, 22 e 24. Se um binário nativo não estiver disponível, o npm pode precisar das ferramentas de compilação da plataforma.

# la-dolce-api

Backend da **La Dolce Experience**: schema do banco, regras de segurança (RLS), bucket de imagens e configuração de login, sobre o [Supabase](https://supabase.com).

Não existe servidor próprio. O Supabase expõe automaticamente uma API REST sobre as tabelas, e quem decide o que cada pessoa pode ler ou alterar são as políticas RLS deste repositório.

## Repositórios do projeto

| Repositório | Conteúdo |
|---|---|
| `la-dolce-app` | Site público e painel administrativo (React) |
| **la-dolce-api** | Schema, RLS, Storage e configuração do Supabase |
| `la-dolce-data` | Conteúdo inicial (seed) e imagens originais |
| `la-dolce-docs` | Documentação, manual do cliente e pendências |

Clone os quatro **lado a lado** na mesma pasta: o `supabase/config.toml` carrega o seed de `../la-dolce-data/seed/seed.sql`. Sem o `la-dolce-data` ao lado, o banco sobe vazio, só com o schema.

## Tecnologias

| Tecnologia | Uso |
|---|---|
| Supabase — Postgres 17 | Tabelas, check constraints, função `is_admin()` e políticas RLS |
| Supabase — Auth | Login por e-mail e senha; cadastro público desabilitado |
| Supabase — Storage | Bucket `media` (WebP/JPEG até 5 MB), escrita só para administradores |
| [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | Banco local no Docker, migrations e geração de tipos |
| [supabase-js](https://supabase.com/docs/reference/javascript) + Node.js | Scripts de criação de administrador e de restauração da cópia de segurança |
| [Vitest](https://vitest.dev) | Testes de integração de segurança contra o banco local |
| TypeScript, Prettier | Tipagem dos testes e formatação |

## Estrutura

```
supabase/
  config.toml           Configuração do Supabase local (Auth, Storage, caminho do seed)
  migrations/           Schema versionado: seções ordenáveis e itens, RLS, bucket de imagens, métricas, lixeira
  functions/
    republicar-site/    Edge Function que republica o site na Vercel (botão "Atualizar prévia do link")
types/database.ts       Tipos TypeScript gerados a partir do schema (copiados para o la-dolce-app)
scripts/
  create-admin.mjs      Cria ou promove um administrador do painel
  restore-backup.mjs    Volta o conteúdo para uma cópia baixada no painel
  check-secrets.mjs     Procura chaves e arquivos .env versionados por engano
tests/integration/      Testes de RLS, permissões e Storage
bruno/                  Coleção do Bruno: endpoints do site e do painel, segurança e gestão de usuários
```

## Rodando localmente

Pré-requisitos: Node.js 20+ e Docker Desktop.

```bash
npm install
npm run db:start      # sobe Postgres, Auth e Storage locais e aplica migrations + seed
npm run db:status     # mostra API_URL, ANON_KEY e SERVICE_ROLE_KEY
```

Crie o `.env.local` a partir do [`.env.example`](.env.example) com os valores do `db:status`. Ele está no `.gitignore` e **nunca** deve ser versionado.

Serviços locais:
- API: http://127.0.0.1:54321
- Studio (tabelas e usuários): http://127.0.0.1:54323
- Mailpit (e-mails de redefinição de senha): http://127.0.0.1:54324

## Scripts

| Comando | O que faz |
|---|---|
| `npm run db:start` / `db:stop` | Sobe ou para o Supabase local |
| `npm run db:reset` | Recria o banco local com migrations + seed |
| `npm run db:status` | Mostra URLs e chaves do ambiente local |
| `npm run db:types` | Regera `types/database.ts` a partir do banco local |
| `npm run admin:create -- --email x@y.com` | Cria ou promove um administrador (mostra uma senha temporária) |
| `npm run backup:restore -- --file x.json` | Confere uma cópia baixada no painel e mostra o que muda; com `--confirm`, restaura |
| `npm test` | Testes da lógica das Edge Functions (sem banco) |
| `npm run test:integration` | Testes de segurança contra o banco local |
| `npm run functions:deploy` | Publica a Edge Function `republicar-site` no projeto vinculado |
| `npm run check` | Formatação, tipos, testes das funções e verificação de segredos |

## Testar a API no Bruno

A pasta [`bruno/`](bruno) é uma coleção do [Bruno](https://www.usebruno.com) com os endpoints usados pelo site e pelo painel, verificações de segurança e a **criação de usuários administradores**. Ambientes **Local** e **Homologacao**; as chaves ficam em variáveis secretas, fora do Git. Instruções em [bruno/README.md](bruno/README.md).

## Republicação do site

A página inicial é pré-renderizada no build do `la-dolce-app`: o HTML publicado só traz o que foi salvo até a última publicação. Por isso o site é republicado na Vercel (Deploy Hook) de dois jeitos, com no máximo uma publicação a cada 5 minutos, todas registradas em `deploy_requests`:

- **Automático:** toda alteração nas tabelas de conteúdo marca `site_publish_state.content_changed_at`. O `pg_cron` roda `publish_site_if_needed()` a cada minuto e publica depois de **2 minutos sem novas alterações**, juntando várias edições em uma publicação. As visitas (`site_events`) não contam.
- **Manual:** o botão **Atualizar prévia do link** do painel chama a Edge Function `republicar-site`, só para administradores.

O Deploy Hook (Vercel → Settings → Git → Deploy Hooks, branch `main`) fica no **Vault** do banco e é lido pelas duas formas. Ele dispara deploys: **não versionar nem colar em conversas**.

```bash
npm run deploy-hook:set -- --url <deploy-hook>   # usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local
npm run functions:deploy
npx supabase secrets set SITE_ORIGINS=<origens>   # CORS da Edge Function. Ex.: https://la-dolce-app.vercel.app
```

Sem o Deploy Hook, nada é publicado: a função responde "não configurado" e o `pg_cron` não faz nada.

Localmente, a função roda com `npm run db:start` e lê os secrets de `supabase/functions/.env` (no `.gitignore`).

## Restaurar uma cópia de segurança

Só para o arquivo baixado no painel em **Lixeira e backup → Baixar cópia do conteúdo** (`la-dolce-conteudo-AAAA-MM-DD.json`, formato `la-dolce-backup`, versão 1). Qualquer outro arquivo é recusado.

```bash
npm run backup:restore -- --file ~/Downloads/la-dolce-conteudo-2026-10-17.json            # só confere e compara
npm run backup:restore -- --file ~/Downloads/la-dolce-conteudo-2026-10-17.json --confirm  # restaura
```

- O projeto restaurado é o do `SUPABASE_URL` no `.env.local`, que o script mostra antes. Para produção, use a URL e a secret key de produção.
- Antes de restaurar, o conteúdo atual é salvo ao lado do arquivo (`la-dolce-conteudo-antes-da-restauracao-*.json`). Para desfazer, restaure esse arquivo.
- A restauração roda numa transação (função `restore_backup`, só com a service_role): se algo falhar, nada muda.
- Configurações, seções (com a ordem), itens e referências das imagens voltam com os mesmos ids. Seções e itens que não estavam na cópia vão para a Lixeira do painel (30 dias). Imagens enviadas depois da cópia continuam na biblioteca.
- Só aceita cópias da **versão 2** (baixadas a partir de 23/10/2026, com as seções ordenáveis). Cópias anteriores (versão 1) eram do modelo com uma tabela por lista e não podem ser restauradas.
- Os arquivos de imagem não fazem parte da cópia. Se algum foi apagado do Storage, o script avisa antes, e a foto precisa ser trocada no painel.
- Depois, peça no painel **Atualizar prévia do link**.

Como funciona e passo a passo completo: `la-dolce-docs/restaurar-copia-de-seguranca.md`.

## Nova migration

```bash
npx supabase migration new nome_da_mudanca   # escreva o SQL no arquivo gerado
npm run db:reset                             # recria o banco local
npm run db:types                             # atualiza os tipos
```

Depois, copie os tipos para o app (`npm run types:sync` no `la-dolce-app`). A CI do app falha se os tipos dos dois repositórios estiverem diferentes.

## Produção

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push                 # aplica as migrations
```

O seed de produção e as configurações do painel do Supabase estão no guia `la-dolce-docs/04-implantacao-e-custos.md`. Aplique sempre a migration **antes** de publicar o código do app que depende dela.

## CI (GitHub Actions)

| Job | Verifica |
|---|---|
| **Migrations, seed, RLS e tipos** | Formatação, tipos e testes das funções; sobe o Supabase com o seed do `la-dolce-data`; confere se `types/database.ts` bate com as migrations; roda os testes de segurança |
| **Segredos e dependências** | Gitleaks em todo o histórico, arquivos `.env` e chaves versionados, `npm audit` |

O primeiro job baixa o `la-dolce-data` e precisa do secret **`LA_DOLCE_REPOS_TOKEN`** (veja abaixo). Nenhuma chave do Supabase de produção vai para o GitHub.

### Secret `LA_DOLCE_REPOS_TOKEN`

Necessário porque um repositório privado não consegue ler outro com o token padrão do GitHub Actions. Crie uma vez para a organização:

1. Crie um **fine-grained personal access token** (GitHub → Settings → Developer settings → Fine-grained tokens):
   - **Resource owner:** a organização.
   - **Repository access:** só os repositórios `la-dolce-*`.
   - **Permissions:** `Contents: Read-only`. Nenhuma outra.
2. Na organização, em **Settings → Secrets and variables → Actions → New organization secret**, salve-o como `LA_DOLCE_REPOS_TOKEN`, liberado para os repositórios `la-dolce-*`.
3. Para os pull requests do Dependabot, cadastre o mesmo valor em **Settings → Secrets and variables → Dependabot**.

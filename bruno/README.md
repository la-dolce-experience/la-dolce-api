# Coleção do Bruno: La Dolce API

Requisições para testar a API do Supabase usada pelo site e pelo painel, e para **gerenciar usuários**, no [Bruno](https://www.usebruno.com).

## Abrir no Bruno

1. No Bruno, use **Open Collection** e escolha esta pasta (`la-dolce-api/bruno`).
2. No canto superior direito, escolha o ambiente: **Local** ou **Homologacao**.
3. Em **Configure** (ícone de engrenagem do ambiente), preencha as variáveis **secretas**. Elas ficam guardadas só no seu computador e **não** vão para o Git.

| Variável | Onde obter | Usada em |
|---|---|---|
| `anonKey` | Local: `npm run db:status` (`ANON_KEY`). Homologação: Supabase → Project Settings → API Keys → `anon` | Todas |
| `adminEmail` / `adminPassword` | Um administrador do painel | 02, 03 e 04 |
| `serviceRoleKey` | Local: `npm run db:status` (`SERVICE_ROLE_KEY`). Homologação: Supabase → API Keys → `service_role` | 05 |
| `newUserEmail` / `newUserPassword` | O usuário que você quer criar | 05 |
| `confirmarRepublicacao` (não secreta) | Já vem `nao`. Troque para `sim` só quando quiser acionar um deploy | 06 |

`baseUrl` e `siteUrl` já vêm preenchidas em cada ambiente.

> A **`service_role`** ignora todas as regras de segurança do banco. Preencha só quando for usar a pasta 05, nunca a compartilhe e nunca a coloque em um arquivo do repositório.

## Pastas

| Pasta | O que faz | Precisa de |
|---|---|---|
| **01 Público** | Lê o conteúdo como um visitante (o que o site faz) | `anonKey` |
| **02 Autenticação** | Entrar, usuário logado, verificar se é administrador, renovar sessão | `adminEmail`, `adminPassword` |
| **03 Painel (admin)** | Grava como o painel: regrava o título do hero com o mesmo valor; cria, edita e apaga uma **pergunta de teste oculta** (e a tira da lixeira); lista imagens enviadas, resultados do site, lixeira e o último pedido de republicação | Login (02) |
| **04 Segurança** | Confirma que o banco **recusa** escrita de visitantes e dados inválidos, e que visitantes não leem estatísticas nem a lixeira | Login (02) para o item do WhatsApp inválido |
| **05 Usuários** | Listar, criar usuário, tornar ou remover administrador, redefinir senha, excluir | `serviceRoleKey` |
| **06 Republicar site** | Chama a função `republicar-site` (novo deploy na Vercel para atualizar a prévia do link). **Pulada** a menos que `confirmarRepublicacao` seja `sim` | Login (02) |
| **07 Encerrar sessão** | Sai (invalida a sessão aberta em 02) | Login (02) |

As pastas 03 e 04 **não alteram o conteúdo real**: a pergunta de teste é criada oculta, apagada e retirada da lixeira em seguida.

> **Atenção:** a pasta 06, com `confirmarRepublicacao = sim`, aciona um deploy real na Vercel (no máximo um a cada 5 minutos).

## Criar um usuário administrador

Na pasta **05 Usuários**, com `newUserEmail` e `newUserPassword` preenchidos:

1. **Criar usuário**: cria o usuário já confirmado e guarda o id em `newUserId`.
2. **Tornar administrador**: libera o acesso ao painel.
3. Teste o login em `<siteUrl>/admin`.

Para remover: **Remover administrador** (tira o acesso e mantém o usuário) ou **Excluir usuário**.

Para o administrador definitivo do cliente, prefira `npm run admin:create -- --email <email>`, que gera uma senha forte e a mostra uma única vez.

## Rodar pela linha de comando

Com o [Bruno CLI](https://docs.usebruno.com/bru-cli/overview), passando as variáveis secretas na hora:

```bash
cd bruno
npx @usebruno/cli@2 run --env Local \
  --env-var anonKey=<ANON_KEY> \
  --env-var adminEmail=<email> --env-var adminPassword=<senha> \
  --env-var serviceRoleKey=<SERVICE_ROLE_KEY> \
  --env-var newUserEmail=<email-de-teste> --env-var newUserPassword=<senha-de-teste>
```

Para rodar só algumas pastas, liste-as depois de `run`, por exemplo `run 01-publico 04-seguranca`.

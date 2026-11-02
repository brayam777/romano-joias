# Romano Joias

Vitrine online de joias artesanais em ouro, feitas sob encomenda — pedido pelo WhatsApp.

- Site: https://romano-joias.vercel.app
- Painel do lojista: https://romano-joias.vercel.app/admin.html (senha única, não fica no repositório)

HTML/CSS/JS puro, banco e login no Supabase, fotos e vídeos numa S3 própria (vídeos convertidos no servidor com ffmpeg), hospedado na Vercel. Detalhes técnicos, contas e regras de negócio estão em [CLAUDE.md](CLAUDE.md).

## Rodar local

```bash
npm run serve
```

Abre em http://localhost:8083. Esse servidor simples não roda as funções `/api` (upload e conversão de vídeo); pra testar o painel completo use `npx vercel dev` (ver abaixo). O site local usa o banco de **produção**.

## Testes

```bash
npm test
```

Smoke test do site publicado. Pra conferir também a S3: `npm install`, `npx vercel env pull .env.local` e `npm run test:s3`.

## Publicar

Commit + `git push` na branch `main` → a Vercel publica sozinha em alguns segundos.

Mudanças no **banco** não vão com o push: crie um `.sql` em `supabase/migrations/` e aplique com a CLI do Supabase (conta barayamgamer@gmail.com) ou no SQL Editor — passo a passo em [CLAUDE.md](CLAUDE.md#banco-de-dados).

## Continuar em outro computador

**Instalar:** [Git](https://git-scm.com/downloads), [Node.js LTS](https://nodejs.org) (vem com `npm`/`npx`) e o [GitHub CLI](https://cli.github.com).

**Comandos:**

```bash
gh auth login --web
gh repo clone brayam777/romano-joias
cd romano-joias
npm install
npm test
```

**Só se for testar o painel com upload/vídeo ou rodar `npm run test:s3`:**

```bash
npx vercel login
npx vercel link --yes --project romano-joias --scope brayam-s-projects
npx vercel env pull .env.local
npx vercel dev
```

**Só se for mexer no banco** (entre com a conta **barayamgamer@gmail.com**):

```bash
npx supabase login
npx supabase link --project-ref yjegibnteupkskgeqdum
npx supabase migration list
```

A senha do painel não está no repositório — leve-a à parte (ela fica no `SUPABASE_CREDENTIALS.local` da máquina antiga).

**Publicar:** `git add`, `git commit` e `git push` — a Vercel faz o resto.

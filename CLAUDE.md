# Romano Joias — contexto do projeto

Vitrine online da **Romano Joias** (ourivesaria artesanal em ouro — Instagram `@romanojoiass`, WhatsApp (62) 9 8286-0279). Cliente do Brayam. As peças são **sob encomenda**: o site não mostra preço nem tem carrinho — a cliente vê fotos/vídeos e chama no WhatsApp. Painel `admin.html` pra lojista cadastrar peças, fotos, vídeos e a peça em destaque.

## Onde está cada coisa (produção)

| O quê | Onde | Conta |
|---|---|---|
| Site | https://romano-joias.vercel.app (admin em `/admin.html`) | — |
| Hospedagem | Vercel, projeto `brayam-s-projects/romano-joias` | Vercel `brayam777` |
| Código | GitHub `brayam777/romano-joias` — push na `main` publica sozinho | GitHub `brayam777` |
| Banco + login | Supabase ref **`yjegibnteupkskgeqdum`** (sa-east-1, nome "romano-joias") | Supabase **barayamgamer@gmail.com** |
| Fotos/vídeos | S3 (MinIO) `https://s3.inovai.dev.br`, bucket `catalogo-brayam`, prefixo `romano-joias/` | chaves só nas env vars da Vercel (`S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`) |
| Senha do painel e dados do projeto | `SUPABASE_CREDENTIALS.local` — **só na máquina do Brayam, nunca no git** | — |

**NÃO usar:**
- Outros projetos Supabase: a conta barayamgamer (e a outra conta do Brayam) têm projetos de **outros clientes**. O deste site é **só** o `yjegibnteupkskgeqdum` — confira o ref antes de qualquer `link`, `db push` ou SQL.
- O bucket `catalogo-brayam` é compartilhado com outros sites — só mexa no prefixo `romano-joias/`.
- O bucket Supabase Storage `romano-media` é **legado** (antes da S3), mas ainda guarda 3 vídeos e os posters de 5 vídeos (ver pendências). Não apague sem migrar antes.

## Stack e convenções

- Site estático: HTML + CSS + JS puro (ES modules), **sem build**. `supabase-js` vem do esm.sh (`js/supabase-config.js`). Se o site inteiro parar de carregar sem mudança no código, suspeite do esm.sh e fixe uma versão exata (ex.: `@2.111.0`).
- Duas funções serverless da Vercel (Node, CommonJS), ambas validam a sessão do admin no Supabase:
  - `api/presign-upload.js` — devolve URL assinada pra subir arquivo direto na S3 (a chave secreta nunca vai pro navegador).
  - `api/convert-video.js` — baixa o vídeo da S3, converte com `ffmpeg-static` pra MP4 H.264/yuv420p/30fps/≤1080px/sem áudio/faststart, sobe o convertido e apaga o original. Configurada em `vercel.json` (60 s, 2048 MB, inclui o binário do ffmpeg). Se mudar dependências, mantenha o `includeFiles`. O `allowScripts` do `package.json` autoriza o script de instalação do `ffmpeg-static` (é ele que baixa o binário); se atualizar o pacote, rode `npm approve-scripts ffmpeg-static` de novo.
- Português nos textos e comentários; comentário só quando o "porquê" não é óbvio.
- Links de WhatsApp/Instagram abrem **na mesma aba** (`wireExternalLinks()` em `js/main.js` intercepta o clique e usa `window.location.href`) — mais confiável pra abrir o app no celular.

## Regras de negócio (e onde mudar junto)

- **Categoria padronizada em Iniciais Maiúsculas**, comparada sem diferenciar maiúscula/minúscula — `catLabel()` existe em `js/admin.js` (ao salvar) e em `js/main.js` (ao agrupar/filtrar). Mude os dois juntos.
- **Só uma peça em destaque** — garantido em dois lugares que precisam concordar: índice único `romano_products_one_featured` no banco (migração `20260804180000_featured_product.sql`) **e** `handleSubmitProduct` em `js/admin.js`, que desmarca a atual **antes** de salvar (senão o banco recusa).
- **Quem pode editar**: login por **senha única** numa conta fixa `brayamfelipe02@gmail.com`. Esse e-mail precisa bater em: `SHARED_LOGIN_EMAIL` (`js/admin.js`), `ADMIN_EMAIL` (`api/presign-upload.js` e `api/convert-video.js`) e as políticas RLS da migração `20260804000000_init.sql` (que têm o e-mail fixo no SQL).
- **URL e chave pública do Supabase** estão em `js/supabase-config.js`, nas duas funções de `api/` e em `tests/smoke.mjs` (é a chave *publishable*, pode ficar no código).
- **WhatsApp/Instagram**: `WHATSAPP_NUMBER` e `INSTAGRAM_HANDLE` em `js/main.js`; o número também aparece escrito em `index.html`.
- **Mídia**: `romano_products.media` (jsonb `[{url, type:'image'|'video', poster?}]`), várias por peça (carrossel arrastável).
  - **Foto**: `watermarkPhoto()` em `js/admin.js` reduz pra no máx. 1600px, carimba o brasão branco (`img/logo-icon.svg`) no canto e salva em JPEG 0.9.
  - **Vídeo**: `captureVideoPoster()` tira o 1º quadro (JPEG 800px) → sobe vídeo original e poster pela URL assinada → chama `/api/convert-video` → salva a URL convertida. **Todo vídeo precisa de poster** (sem ele o iPhone em Modo de Baixo Consumo mostra tela preta).
  - **iPhone/Safari**: não toca WebM, recusa container QuickTime (`.mov`) e 120 fps, e bloqueia autoplay em economia de bateria. No `<video>`: `muted` como **propriedade** (não só atributo), `playsinline`/`webkit-playsinline`, `poster`. Por isso a conversão é no servidor.
  - Vídeos só tocam quando estão visíveis (`wireVideoVisibility()` em `js/main.js`) — economiza banda.

## Banco de dados

Tabela `romano_products` (name, category, media, is_featured, created_at). RLS: leitura pública; escrita só pelo e-mail admin.

**Migrações NÃO vão com o push.** O push só publica o site. Mudança de banco:
1. Crie um arquivo novo em `supabase/migrations/` (`AAAAMMDDHHMMSS_descricao.sql`).
2. Aplique pela CLI, com a conta **barayamgamer@gmail.com** logada (`npx supabase login`):
   ```bash
   npx supabase link --project-ref yjegibnteupkskgeqdum
   npx supabase migration list      # confira o histórico antes
   npx supabase db push
   ```
   As migrações atuais foram aplicadas assim (`db push`), então o histórico remoto deve estar em dia — mas confira com `migration list` antes do primeiro push numa máquina nova. Alternativa: colar o SQL no SQL Editor do painel do Supabase.
3. O `supabase login` é global: trocar pra barayamgamer tira o acesso aos projetos da outra conta do Brayam (e vice-versa).

## Rodar local

- `npm run serve` → http://localhost:8083 (servidor estático `serve.cjs`; **não** roda `/api`, então upload e conversão de vídeo não funcionam assim).
- Pra testar o admin completo: `npx vercel link` (projeto `romano-joias`), `npx vercel env pull .env.local` e `npx vercel dev`.
- Atenção: local ou não, o site usa o **banco de produção** (não há banco de teste).

## Testes

- `npm test` — smoke test do site publicado: home e admin no ar, as duas APIs recusam sem login, arquivos internos (inclusive `SUPABASE_CREDENTIALS.local`) dão 404, no máx. 1 destaque, todo vídeo com poster. Sem dependências. Outro endereço: `BASE_URL=http://localhost:3000 npm test`.
- `npm run test:s3` — confere a S3 (credenciais, política só-leitura, escrita anônima bloqueada). Precisa de `npm install` e do `.env.local` (`npx vercel env pull .env.local`).

## Deploy

Push na `main` do GitHub → a Vercel publica em produção sozinha. Confira com `npx vercel ls romano-joias`. Em emergência, `npx vercel deploy --prod` (às vezes falha uma vez com "Not authorized" — é só repetir, ou passar `--scope brayam-s-projects`). O `.vercelignore` impede que `SUPABASE_CREDENTIALS.local`, `tests/`, `supabase/`, `CLAUDE.md`, `README.md`, `serve.cjs` e `.claude/` vão pro site.

## Pendências

- 3 vídeos ("Aliança prata 925 4mm chanfrada", "anel personalizado fg", "Corrente português 10 grama pingente 4") e os posters de todos os 5 vídeos ainda estão no Supabase Storage (`romano-media`) — mover pra S3 e esvaziar o bucket antigo pra zerar a banda do Supabase.
- 2 vídeos na S3 ("Pulseira grume dupla", "pulseira 18k") têm extensão `.webm`, mas são MP4 de verdade (`Content-Type: video/mp4`) — tocam normal; só o nome está errado (erro do script de migração de 2026-08).
- Uploads na S3 não definem `Cache-Control`; um cache longo (as chaves são UUID, nunca sobrescritas) economizaria banda.
- Sem banco de teste: tudo roda contra produção.

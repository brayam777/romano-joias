// Smoke test do site publicado (sem dependências — só Node 18+).
// Uso: npm test            (testa produção)
//      BASE_URL=http://localhost:3000 npm test   (testa outro endereço, ex.: `vercel dev`)

const BASE_URL = (process.env.BASE_URL || 'https://romano-joias.vercel.app').replace(/\/$/, '');

// Mesma URL/chave pública de js/supabase-config.js (não é segredo).
const SUPABASE_URL = 'https://yjegibnteupkskgeqdum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z_BI_xjty_SCqVi5MjiWiA_Y3mXmBwy';

// Arquivos internos que NUNCA podem ser servidos pelo site (ver .vercelignore).
const MUST_BE_PRIVATE = [
  '/SUPABASE_CREDENTIALS.local',
  '/CLAUDE.md',
  '/README.md',
  '/serve.cjs',
  '/vercel.json',
  '/tests/smoke.mjs',
  '/supabase/migrations/20260804000000_init.sql',
  '/.vercel/project.json',
  '/.claude/launch.json',
];

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name} — ${err.message}`);
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

await check('home responde 200 e tem a marca', async () => {
  const r = await fetch(`${BASE_URL}/`);
  expect(r.status === 200, `status ${r.status}`);
  expect((await r.text()).includes('Romano Joias'), 'texto "Romano Joias" não encontrado');
});

await check('painel admin responde 200', async () => {
  const r = await fetch(`${BASE_URL}/admin.html`);
  expect(r.status === 200, `status ${r.status}`);
});

for (const api of ['presign-upload', 'convert-video']) {
  await check(`/api/${api} sem login é recusado (401)`, async () => {
    const r = await fetch(`${BASE_URL}/api/${api}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(r.status === 401, `status ${r.status} (esperado 401)`);
  });
  await check(`/api/${api} com token falso é recusado (401)`, async () => {
    const r = await fetch(`${BASE_URL}/api/${api}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-falso' },
      body: '{}',
    });
    expect(r.status === 401, `status ${r.status} (esperado 401)`);
  });
}

for (const path of MUST_BE_PRIVATE) {
  await check(`arquivo interno não é público: ${path}`, async () => {
    const r = await fetch(`${BASE_URL}${path}`);
    expect(r.status === 404, `status ${r.status} (esperado 404)`);
  });
}

await check('catálogo carrega do Supabase com no máximo 1 peça em destaque', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/romano_products?select=name,is_featured,media`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  expect(r.status === 200, `status ${r.status}`);
  const products = await r.json();
  expect(products.length > 0, 'nenhuma peça cadastrada');
  const featured = products.filter((p) => p.is_featured);
  expect(featured.length <= 1, `${featured.length} peças em destaque (o máximo é 1)`);
});

await check('todo vídeo tem poster (senão fica tela preta no iPhone)', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/romano_products?select=name,media`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  const videos = (await r.json()).flatMap((p) => (p.media || []).filter((m) => m.type === 'video').map((m) => ({ ...m, name: p.name })));
  const noPoster = videos.filter((v) => !v.poster).map((v) => v.name);
  expect(noPoster.length === 0, `sem poster: ${noPoster.join(', ')}`);
});

console.log(failures ? `\n${failures} falha(s).` : '\nTudo certo.');
process.exit(failures ? 1 : 0);

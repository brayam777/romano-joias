// Verifica a S3 (MinIO em s3.inovai.dev.br) usada pras fotos e vídeos.
// As chaves NÃO ficam no repositório: rode `npx vercel env pull .env.local`
// uma vez (puxa as variáveis S3_* da Vercel) e depois `npm run test:s3`.

import { S3Client, ListObjectsV2Command, GetBucketPolicyCommand } from '@aws-sdk/client-s3';

const { S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET } = process.env;
if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
  console.error('Faltam variáveis S3_*. Rode `npx vercel env pull .env.local` antes.');
  process.exit(1);
}

const PREFIX = 'romano-joias/';
const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  forcePathStyle: true,
});

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

await check('credenciais funcionam e o bucket tem arquivos do site', async () => {
  const out = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: PREFIX, MaxKeys: 1000 }));
  expect((out.KeyCount ?? 0) > 0, `nenhum arquivo em ${S3_BUCKET}/${PREFIX}`);
});

await check('política do bucket é só leitura pública (sem escrita anônima)', async () => {
  const { Policy } = await s3.send(new GetBucketPolicyCommand({ Bucket: S3_BUCKET }));
  const actions = JSON.parse(Policy).Statement.flatMap((s) => [].concat(s.Action));
  const dangerous = actions.filter((a) => /PutObject|DeleteObject|\*/.test(a));
  expect(dangerous.length === 0, `política libera pra qualquer um: ${dangerous.join(', ')}`);
});

await check('upload anônimo (sem chave) é bloqueado', async () => {
  const r = await fetch(`${S3_ENDPOINT}/${S3_BUCKET}/${PREFIX}_anon-write-test.txt`, { method: 'PUT', body: 'x' });
  expect(r.status === 403, `status ${r.status} (esperado 403)`);
});

console.log(failures ? `\n${failures} falha(s).` : '\nTudo certo.');
process.exit(failures ? 1 : 0);

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');

// Converte, no servidor, todo vídeo enviado pra um MP4/H.264 padrão que toca em
// qualquer aparelho — inclusive iPhone/Safari, que recusa webm, container
// QuickTime (.mov "qt") e frame rates altos (120fps). Assim não depende do
// navegador de quem sobe (o Safari do iPhone não consegue converter sozinho).
const SUPABASE_URL = 'https://yjegibnteupkskgeqdum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z_BI_xjty_SCqVi5MjiWiA_Y3mXmBwy';
const ADMIN_EMAIL = 'brayamfelipe02@gmail.com';
const SITE_PREFIX = 'romano-joias';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  let user;
  try {
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userResp.ok) throw new Error('invalid session');
    user = await userResp.json();
  } catch {
    res.status(401).json({ error: 'Sessão inválida' });
    return;
  }

  if (user.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Não autorizado' });
    return;
  }

  const { url } = req.body || {};
  const prefix = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/`;
  if (!url || typeof url !== 'string' || !url.startsWith(prefix)) {
    res.status(400).json({ error: 'url inválida' });
    return;
  }
  const srcKey = url.slice(prefix.length);

  const inPath = path.join(os.tmpdir(), `in-${randomUUID()}`);
  const outPath = path.join(os.tmpdir(), `out-${randomUUID()}.mp4`);

  try {
    // 1) baixa o arquivo original do S3
    const vresp = await fetch(url);
    if (!vresp.ok) throw new Error('download falhou');
    fs.writeFileSync(inPath, Buffer.from(await vresp.arrayBuffer()));

    // 2) transcodifica pra MP4 iOS-friendly (H.264, yuv420p, 30fps, ≤1080, faststart, sem áudio)
    const args = [
      '-y', '-i', inPath,
      '-vf', "scale='min(1080,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      '-r', '30',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-crf', '27', '-preset', 'veryfast', '-movflags', '+faststart', '-an',
      outPath,
    ];
    const ff = spawnSync(ffmpegPath, args, { maxBuffer: 64 * 1024 * 1024 });
    if (ff.status !== 0 || !fs.existsSync(outPath)) {
      console.error('ffmpeg fail', ff.stderr ? ff.stderr.toString().slice(-800) : ff.error);
      throw new Error('conversão falhou');
    }
    const outBuf = fs.readFileSync(outPath);

    // 3) sobe o convertido pro S3
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
    const newKey = `${SITE_PREFIX}/${randomUUID()}.mp4`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: newKey,
        Body: outBuf,
        ContentType: 'video/mp4',
      })
    );
    const publicUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${newKey}`;

    // 4) apaga o arquivo original (best effort — não trava se falhar)
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: srcKey }));
    } catch (delErr) {
      console.error('delete src falhou (ignorado)', delErr);
    }

    res.status(200).json({ url: publicUrl, bytes: outBuf.length });
  } catch (err) {
    console.error('convert error', err);
    res.status(500).json({ error: 'Não foi possível converter o vídeo' });
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }
};

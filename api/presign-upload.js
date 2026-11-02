const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');

// Endereço público do Supabase Auth deste site (não é segredo — é a mesma
// URL/anon key já embutida em js/supabase-config.js) só pra validar, no
// servidor, que quem está pedindo a URL de upload é mesmo o admin logado.
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

  const { ext, contentType } = req.body || {};
  if (!ext) {
    res.status(400).json({ error: 'Extensão obrigatória' });
    return;
  }

  const key = `${SITE_PREFIX}/${randomUUID()}.${ext}`;
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const publicUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`;
    res.status(200).json({ uploadUrl, publicUrl });
  } catch (err) {
    console.error('presign error', err);
    res.status(500).json({ error: 'Não foi possível preparar o upload' });
  }
};

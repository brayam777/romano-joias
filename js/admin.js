import { supabase, isConfigured } from './supabase-config.js';

// Sobe o arquivo pra S3 (não pro Supabase) — pede uma URL de upload assinada
// pra function serverless (que confere a sessão de admin no servidor e nunca
// entrega a chave secreta da S3 pro navegador), depois envia o arquivo direto
// pra S3 usando essa URL.
async function uploadToS3(blob, ext, contentType) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada, entre novamente.');

  const presignResp = await fetch('/api/presign-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ext, contentType }),
  });
  if (!presignResp.ok) {
    const body = await presignResp.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível preparar o upload.');
  }
  const { uploadUrl, publicUrl } = await presignResp.json();

  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResp.ok) throw new Error('Falha ao enviar o arquivo.');

  return publicUrl;
}

const loginView = document.getElementById('loginView');
const panelView = document.getElementById('panelView');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const sessionInfo = document.getElementById('sessionInfo');
const panelMessage = document.getElementById('panelMessage');
const logoutBtn = document.getElementById('logoutBtn');
const productForm = document.getElementById('productForm');
const productList = document.getElementById('productList');
const categoryOptions = document.getElementById('categoryOptions');
const productFormTitle = document.getElementById('productFormTitle');
const productFormSubmit = document.getElementById('productFormSubmit');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editingProductId = document.getElementById('editingProductId');
const mediaPreview = document.getElementById('mediaPreview');
const addMediaBtn = document.getElementById('addMediaBtn');
const productNameInput = document.getElementById('productName');
const productCategoryInput = document.getElementById('productCategory');
const productMediaInput = document.getElementById('productMedia');
const productFeaturedInput = document.getElementById('productFeatured');

// Mídia da peça em edição: itens já salvos que sobrevivem + arquivos novos
// ainda não enviados. A ordem das duas listas juntas vira a ordem do carrossel.
let existingMedia = []; // [{ url, type }]
let pendingFiles = []; // [{ file, type, previewUrl }]
let products = [];

function showMessage(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function gemIcon() {
  return `<svg class="icon-gem" viewBox="0 0 64 64"><path d="M8 22 L32 6 L56 22 L32 58 Z" /><path d="M8 22 L56 22 M20 22 L32 58 M44 22 L32 58 M32 6 L20 22 M32 6 L44 22" /></svg>`;
}

// Padroniza a categoria (inicial maiúscula em cada palavra) pra "pulseiras",
// "PULSEIRAS" e "Pulseiras" virarem sempre a mesma coisa no catálogo.
function catLabel(cat) {
  return (cat || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Carrega o brasão da Romano em BRANCO (a partir do SVG original, só trocando
// a cor), com tamanho explícito — assim ele desenha certo no canvas em qualquer
// navegador e a marca d'água fica legível tanto em foto clara quanto escura.
let watermarkLogoPromise = null;
function getWatermarkLogo() {
  if (!watermarkLogoPromise) {
    watermarkLogoPromise = (async () => {
      const resp = await fetch('img/logo-icon.svg');
      let svg = await resp.text();
      svg = svg.replace(/fill="rgb\([^)]*\)"/g, 'fill="#ffffff"');
      // garante dimensões intrínsecas (proporção do viewBox 452.22 x 635.94)
      if (!/<svg[^>]*\bwidth=/.test(svg)) {
        svg = svg.replace('<svg', '<svg width="600" height="844"');
      }
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      return loadImage(url);
    })();
  }
  return watermarkLogoPromise;
}

// Carimba o brasão (branco, com um leve brilho escuro atrás) no canto inferior
// direito de toda foto nova — visível em fundo claro ou escuro, sem caixa dura.
async function watermarkPhoto(file) {
  const objectUrl = URL.createObjectURL(file);
  let photo;
  try {
    photo = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(photo.naturalWidth, photo.naturalHeight));
  const w = Math.round(photo.naturalWidth * scale);
  const h = Math.round(photo.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, w, h);

  const logo = await getWatermarkLogo();
  const ratio = logo.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 452.22 / 635.94;
  const logoH = h * 0.14;
  const logoW = logoH * ratio;
  const margin = h * 0.04;
  const x = w - logoW - margin;
  const y = h - logoH - margin;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = Math.round(logoH * 0.18);
  ctx.shadowOffsetY = Math.round(logoH * 0.03);
  ctx.globalAlpha = 0.62;
  ctx.drawImage(logo, x, y, logoW, logoH);
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

// Também geramos um "poster" (primeiro quadro): uma imagem que aparece na hora,
// mesmo se o navegador segurar o autoplay do vídeo (iPhone em Modo de Baixo
// Consumo, p.ex.) — assim nunca fica tela preta.
async function captureVideoPoster(file) {
  const objectUrl = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = objectUrl;
  try {
    await new Promise((resolve, reject) => {
      v.onloadeddata = resolve;
      v.onerror = () => reject(new Error('Não foi possível ler o vídeo.'));
    });
    await new Promise((resolve) => {
      v.onseeked = resolve;
      try {
        v.currentTime = Math.min(0.12, (v.duration || 1) / 2);
      } catch (e) {
        resolve();
      }
    });
    const maxW = 800;
    const vw = v.videoWidth || maxW;
    const vh = v.videoHeight || maxW;
    const scale = Math.min(1, maxW / vw);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(v, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Lista unificada pra tela: primeiro as mídias já salvas, depois as novas.
function currentMediaItems() {
  return [
    ...existingMedia.map((m, i) => ({ ...m, group: 'existing', index: i })),
    ...pendingFiles.map((p, i) => ({ url: p.previewUrl, type: p.type, group: 'pending', index: i })),
  ];
}

function renderMediaPreview() {
  const items = currentMediaItems();
  if (items.length === 0) {
    mediaPreview.hidden = true;
    mediaPreview.innerHTML = '';
    return;
  }
  mediaPreview.hidden = false;
  mediaPreview.innerHTML = items
    .map(
      (m, order) => `
      <div class="admin-media-thumb">
        ${m.type === 'video' ? `<video src="${m.url}" muted></video>` : `<img src="${m.url}" alt="" />`}
        ${m.type === 'video' ? '<span class="admin-media-badge">vídeo</span>' : ''}
        <span class="admin-media-order">${order + 1}</span>
        <button type="button" class="admin-media-thumb-remove" data-group="${m.group}" data-index="${m.index}" title="Remover">×</button>
      </div>`
    )
    .join('');
}

function clearPendingPreviews() {
  pendingFiles.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  pendingFiles = [];
}

function enterEditMode(product) {
  editingProductId.value = product.id;
  existingMedia = [...(product.media || [])];
  clearPendingPreviews();
  productNameInput.value = product.name;
  productCategoryInput.value = product.category;
  productMediaInput.value = '';
  productFeaturedInput.checked = !!product.is_featured;
  productFormTitle.textContent = 'Editar peça';
  productFormSubmit.textContent = 'Salvar alterações';
  cancelEditBtn.hidden = false;
  renderMediaPreview();
  productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exitEditMode() {
  editingProductId.value = '';
  existingMedia = [];
  clearPendingPreviews();
  productForm.reset();
  productFormTitle.textContent = 'Adicionar peça';
  productFormSubmit.textContent = 'Adicionar';
  cancelEditBtn.hidden = true;
  renderMediaPreview();
}

async function loadProductList() {
  const { data, error } = await supabase
    .from('romano_products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    showMessage(panelMessage, 'Não foi possível carregar as peças agora.', true);
    return;
  }

  products = data;

  categoryOptions.innerHTML = [...new Set(data.map((p) => catLabel(p.category)))]
    .map((c) => `<option value="${c}"></option>`)
    .join('');

  if (data.length === 0) {
    productList.innerHTML = '<p class="admin-list-empty">Nenhuma peça cadastrada ainda.</p>';
    return;
  }

  productList.innerHTML = data
    .map((p) => {
      const media = p.media || [];
      const first = media[0];
      const thumb = !first
        ? `<span class="admin-list-thumb">${gemIcon()}</span>`
        : first.type === 'video'
        ? `<video class="admin-list-thumb" src="${first.url}" muted></video>`
        : `<img class="admin-list-thumb" src="${first.url}" alt="${p.name}" />`;
      const mediaLabel =
        media.length === 0
          ? 'sem mídia'
          : media.length === 1
          ? media[0].type === 'video'
            ? 'vídeo'
            : 'foto'
          : `${media.length} mídias`;
      return `
      <div class="admin-list-item" data-id="${p.id}">
        ${thumb}
        <div class="admin-list-info">
          <div class="admin-list-name">${p.name}${p.is_featured ? '<span class="admin-list-featured-tag">★ em destaque</span>' : ''}</div>
          <div class="admin-list-meta">${catLabel(p.category)} · ${mediaLabel}</div>
        </div>
        <button class="admin-list-delete" data-delete="${p.id}">Remover</button>
      </div>`;
    })
    .join('');
}

// Login é por senha única compartilhada — por trás dos panos ainda é uma
// conta normal do Supabase Auth, só que com e-mail fixo (não pedimos e-mail
// na tela). O e-mail continua sendo o que está autorizado em romano_admins.
const SHARED_LOGIN_EMAIL = 'brayamfelipe02@gmail.com';

async function handleLogin(e) {
  e.preventDefault();
  const password = document.getElementById('loginPassword').value;
  showMessage(loginMessage, 'Entrando...');
  const { error } = await supabase.auth.signInWithPassword({
    email: SHARED_LOGIN_EMAIL,
    password,
  });
  if (error) {
    showMessage(loginMessage, 'Senha incorreta. Tente novamente.', true);
    return;
  }
  loginForm.reset();
}

async function handleLogout() {
  await supabase.auth.signOut();
}

function handleAddMedia() {
  const files = Array.from(productMediaInput.files);
  files.forEach((file) => {
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    pendingFiles.push({ file, type, previewUrl: URL.createObjectURL(file) });
  });
  productMediaInput.value = ''; // permite re-selecionar o mesmo arquivo depois
  renderMediaPreview();
}

async function handleSubmitProduct(e) {
  e.preventDefault();
  const id = editingProductId.value;
  const name = productNameInput.value.trim();
  const category = catLabel(productCategoryInput.value);
  const is_featured = productFeaturedInput.checked;

  if (existingMedia.length === 0 && pendingFiles.length === 0) {
    showMessage(panelMessage, 'Adicione pelo menos uma foto ou vídeo.', true);
    return;
  }

  showMessage(panelMessage, 'Salvando...');

  if (is_featured) {
    // Só uma peça pode estar em destaque — libera a vaga antes de salvar esta,
    // senão a constraint única do banco (romano_products_one_featured) rejeita o insert/update.
    const { error: clearError } = await supabase
      .from('romano_products')
      .update({ is_featured: false })
      .eq('is_featured', true);
    if (clearError) {
      console.error('clear featured error', clearError);
      showMessage(panelMessage, 'Não foi possível atualizar o destaque atual.', true);
      return;
    }
  }

  const newMedia = [];
  for (let i = 0; i < pendingFiles.length; i++) {
    const { file, type } = pendingFiles[i];
    let uploadBody = file;
    let ext = file.name.split('.').pop();
    let contentType = file.type;

    // Pra vídeo, geramos o poster ANTES do upload (a partir do arquivo local).
    let posterBlob = null;
    if (type === 'image') {
      showMessage(panelMessage, `Aplicando marca d’água (${i + 1}/${pendingFiles.length})...`);
      try {
        uploadBody = await watermarkPhoto(file);
        ext = 'jpg';
        contentType = 'image/jpeg';
      } catch (wmError) {
        console.error('watermark error', wmError);
        // Se a marca d'água falhar por qualquer motivo, sobe a foto original em vez de travar o cadastro.
        uploadBody = file;
      }
    } else if (type === 'video') {
      showMessage(panelMessage, `Preparando vídeo (${i + 1}/${pendingFiles.length})...`);
      try {
        posterBlob = await captureVideoPoster(file);
      } catch (posterError) {
        console.error('poster error', posterError);
        // Segue sem poster se falhar — o vídeo ainda funciona.
      }
    }

    let url;
    try {
      url = await uploadToS3(uploadBody, ext, contentType);
    } catch (uploadError) {
      console.error('upload error', uploadError);
      showMessage(panelMessage, `Não foi possível enviar um dos arquivos: ${uploadError.message}`, true);
      return;
    }

    let poster;
    if (posterBlob) {
      try {
        poster = await uploadToS3(posterBlob, 'jpg', 'image/jpeg');
      } catch (posterUpErr) {
        console.error('poster upload error', posterUpErr);
      }
    }

    // Converte o vídeo no servidor pra um MP4 padrão (H.264) que toca em
    // qualquer aparelho, inclusive iPhone. É o que garante que TODO vídeo
    // enviado fique no formato certo — não importa o navegador/celular de quem
    // cadastrou (o Safari do iPhone não consegue converter sozinho).
    if (type === 'video') {
      showMessage(panelMessage, `Otimizando vídeo (${i + 1}/${pendingFiles.length}) — pode levar um tempinho...`);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const cvResp = await fetch('/api/convert-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ url }),
        });
        if (cvResp.ok) {
          const data = await cvResp.json();
          if (data.url) url = data.url;
        } else {
          console.error('convert-video status', cvResp.status);
        }
      } catch (cvErr) {
        console.error('convert-video error', cvErr);
        // Se a conversão falhar, mantém o vídeo original (o poster garante a miniatura).
      }
    }

    newMedia.push(poster ? { url, type, poster } : { url, type });
  }

  showMessage(panelMessage, 'Salvando...');
  const media = [...existingMedia, ...newMedia];

  const { error } = id
    ? await supabase.from('romano_products').update({ name, category, media, is_featured }).eq('id', id)
    : await supabase.from('romano_products').insert({ name, category, media, is_featured });

  if (error) {
    console.error('save error', error);
    showMessage(panelMessage, `Não foi possível salvar a peça: ${error.message}`, true);
    return;
  }

  exitEditMode();
  showMessage(panelMessage, id ? 'Peça atualizada!' : 'Peça adicionada!');
  loadProductList();
}

async function handleProductListClick(e) {
  const deleteBtn = e.target.closest('[data-delete]');
  if (deleteBtn) {
    if (!confirm('Remover esta peça do catálogo?')) return;
    const { error } = await supabase.from('romano_products').delete().eq('id', deleteBtn.dataset.delete);
    if (error) {
      showMessage(panelMessage, 'Não foi possível remover a peça.', true);
      return;
    }
    if (editingProductId.value === deleteBtn.dataset.delete) exitEditMode();
    loadProductList();
    return;
  }

  const item = e.target.closest('.admin-list-item');
  if (!item) return;
  const product = products.find((p) => p.id === item.dataset.id);
  if (product) enterEditMode(product);
}

function handleMediaPreviewClick(e) {
  const removeBtn = e.target.closest('[data-group]');
  if (!removeBtn) return;
  const index = Number(removeBtn.dataset.index);
  if (removeBtn.dataset.group === 'existing') {
    existingMedia.splice(index, 1);
  } else {
    URL.revokeObjectURL(pendingFiles[index].previewUrl);
    pendingFiles.splice(index, 1);
  }
  renderMediaPreview();
}

async function renderForSession(session) {
  if (session) {
    loginView.hidden = true;
    panelView.hidden = false;
    sessionInfo.textContent = 'Logado';
    await loadProductList();
  } else {
    loginView.hidden = false;
    panelView.hidden = true;
  }
}

loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
productForm.addEventListener('submit', handleSubmitProduct);
productList.addEventListener('click', handleProductListClick);
mediaPreview.addEventListener('click', handleMediaPreviewClick);
addMediaBtn.addEventListener('click', () => productMediaInput.click());
productMediaInput.addEventListener('change', handleAddMedia);
cancelEditBtn.addEventListener('click', exitEditMode);

if (isConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    renderForSession(session);
  });
  supabase.auth.getSession().then(({ data }) => renderForSession(data.session));
} else {
  loginView.hidden = false;
  panelView.hidden = true;
  showMessage(loginMessage, 'O backend (Supabase) ainda não foi configurado pra esse site.', true);
}

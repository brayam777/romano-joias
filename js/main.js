import { supabase, isConfigured } from './supabase-config.js';

// ---- Config ----
const WHATSAPP_NUMBER = '5562982860279'; // (62) 9 8286-0279
const INSTAGRAM_HANDLE = 'romanojoiass';

let PRODUCTS = [];
let FEATURED = null;

async function loadProducts() {
  if (!isConfigured) {
    document.getElementById('catalogGrid').innerHTML =
      '<p class="catalog-error">Catálogo em configuração — chama a gente no WhatsApp que já te passamos as peças disponíveis!</p>';
    return false;
  }
  const { data, error } = await supabase
    .from('romano_products')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Erro ao carregar produtos:', error);
    document.getElementById('catalogGrid').innerHTML =
      '<p class="catalog-error">Não foi possível carregar o catálogo agora. Tente novamente em instantes.</p>';
    return false;
  }
  const all = data || [];
  FEATURED = all.find((p) => p.is_featured) || null;
  PRODUCTS = all.filter((p) => !p.is_featured);
  return true;
}

function waLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function gemIcon() {
  return `<svg class="icon-gem" viewBox="0 0 64 64"><path d="M8 22 L32 6 L56 22 L32 58 Z" /><path d="M8 22 L56 22 M20 22 L32 58 M44 22 L32 58 M32 6 L20 22 M32 6 L44 22" /></svg>`;
}

function crownIcon() {
  return `<svg class="crown" viewBox="0 0 24 24"><path d="M2 19h20l-1.5-9-5 4-3.5-7-3.5 7-5-4L2 19z"/></svg>`;
}

// Padroniza a categoria: tira espaços sobrando e deixa cada palavra com inicial
// maiúscula. Assim "PULSEIRAS", "pulseiras" e "Pulseiras" viram a mesma coisa.
function catLabel(cat) {
  return (cat || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

// Uma foto/vídeo dentro de uma moldura: a mídia inteira (contain) sobre um
// fundo borrado — sem bordas duras, tipo Instagram. O vídeo tem um "poster"
// (primeiro quadro) que aparece na hora, mesmo se o navegador do celular
// bloquear o autoplay (iPhone em Modo de Baixo Consumo, p.ex.) — nunca fica
// tela preta. O fundo borrado do vídeo usa esse mesmo poster.
function mediaFrame(m, name) {
  if (m.type === 'video') {
    const poster = m.poster ? String(m.poster) : '';
    return `<div class="media-frame media-frame-video">
      ${poster ? `<img class="media-backdrop" src="${poster}" alt="" aria-hidden="true" />` : ''}
      <video class="media-fill" src="${m.url}"${poster ? ` poster="${poster}"` : ''} muted loop playsinline webkit-playsinline autoplay preload="auto"></video>
      <img class="media-mark" src="img/logo-icon.svg" alt="" aria-hidden="true" />
    </div>`;
  }
  return `<div class="media-frame">
    <img class="media-backdrop" src="${m.url}" alt="" aria-hidden="true" />
    <img class="media-fill" src="${m.url}" alt="${name}" loading="lazy" />
  </div>`;
}

// Monta o carrossel (arrasta pro lado como no Instagram). Se só tiver 1 item,
// ou nenhum, mostra estático — sem trilho/bolinhas à toa.
function mediaHtml(media, name, videoTagLabel) {
  const items = media || [];
  if (items.length === 0) {
    return `${gemIcon()}<span class="placeholder-tag">foto em breve</span>`;
  }
  if (items.length === 1) {
    const m = items[0];
    const tag = m.type === 'video' && videoTagLabel ? `<span class="video-tag">${videoTagLabel}</span>` : '';
    return `${mediaFrame(m, name)}${tag}`;
  }
  const slides = items.map((m) => `<div class="media-slide">${mediaFrame(m, name)}</div>`).join('');
  const dots = items.map((_, i) => `<span class="media-dot${i === 0 ? ' active' : ''}"></span>`).join('');
  return `
    <div class="media-carousel">
      <div class="media-track">${slides}</div>
      <div class="media-dots">${dots}</div>
    </div>`;
}

// Ativa arrastar (mouse e touch) + sincroniza as bolinhas. Os vídeos de todos
// os slides ficam rodando o tempo todo (não pausamos os que estão fora de vista).
function wireCarousels(root) {
  root.querySelectorAll('.media-carousel').forEach((carousel) => {
    const track = carousel.querySelector('.media-track');
    const dots = [...carousel.querySelectorAll('.media-dot')];

    function syncActiveSlide() {
      const index = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((d, i) => d.classList.toggle('active', i === index));
    }

    let scrollTimeout;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(syncActiveSlide, 80);
    });

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
      });
    });

    // No toque (celular/tablet) o próprio navegador arrasta na horizontal
    // (overflow + scroll-snap). O arrasto manual abaixo é só pro MOUSE, senão
    // ele briga com o scroll nativo do toque e trava o deslize no celular.
    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    let dragged = false;

    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      isDown = true;
      dragged = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      const delta = e.clientX - startX;
      if (Math.abs(delta) > 4) dragged = true;
      track.scrollLeft = startScroll - delta;
    });
    function endDrag() {
      if (!isDown) return;
      isDown = false;
      const index = Math.round(track.scrollLeft / track.clientWidth);
      track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointerleave', endDrag);
    // Evita que o "arrastar" vire clique no botão de WhatsApp por baixo do carrossel.
    track.addEventListener(
      'click',
      (e) => {
        if (dragged) e.preventDefault();
      },
      true
    );

    syncActiveSlide();
  });
}

function renderShowcase() {
  const slot = document.getElementById('showcaseSlot');
  if (!FEATURED) {
    slot.innerHTML = '';
    return;
  }
  const p = FEATURED;
  const message = `Olá! Tenho interesse na peça em destaque "${p.name}" que vi no site da Romano Joias. Gostaria de fazer uma encomenda.`;
  slot.innerHTML = `
    <article class="showcase">
      <div class="showcase-media">
        ${mediaHtml(p.media, p.name)}
        <span class="showcase-badge">${crownIcon()} Peça em destaque</span>
      </div>
      <div class="showcase-body">
        <span class="showcase-category">${catLabel(p.category)}</span>
        <h3 class="showcase-name">${p.name}</h3>
        <p class="showcase-note">Peça sob encomenda — a estrela da vitrine dessa semana.</p>
        <a class="btn btn-whatsapp btn-lg showcase-cta" href="${waLink(message)}" target="_blank" rel="noopener">
          Fazer encomenda
        </a>
      </div>
    </article>`;
  wireCarousels(slot);
  wireVideoVisibility(slot);
}

function orderedCategories() {
  const seen = new Map(); // chave em minúsculo -> rótulo padronizado
  for (const p of PRODUCTS) {
    const label = catLabel(p.category);
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()];
}

function renderFilters() {
  const filters = document.getElementById('categoryFilters');
  const categories = ['all', ...orderedCategories()];
  filters.innerHTML = categories
    .map(
      (c) =>
        `<button class="filter-btn${c === 'all' ? ' active' : ''}" data-filter="${c}">${
          c === 'all' ? 'Todas' : c
        }</button>`
    )
    .join('');

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderGrid(btn.dataset.filter);
  });
}

function cardHtml(p) {
  const message = `Olá! Tenho interesse na peça "${p.name}" que vi no site da Romano Joias. Gostaria de fazer uma encomenda.`;
  return `
    <article class="card">
      <div class="card-media">
        ${mediaHtml(p.media, p.name, 'Vídeo')}
      </div>
      <div class="card-body">
        <span class="card-category">${catLabel(p.category)}</span>
        <h3 class="card-name">${p.name}</h3>
        <span class="card-note">Peça sob encomenda</span>
        <a class="btn btn-whatsapp btn-sm card-cta" href="${waLink(message)}" target="_blank" rel="noopener">
          Fazer encomenda
        </a>
      </div>
    </article>`;
}

function renderGrid(filter = 'all') {
  const grid = document.getElementById('catalogGrid');

  if (PRODUCTS.length === 0) {
    grid.innerHTML = '<p class="catalog-empty">Nenhuma peça por aqui ainda — volte em breve!</p>';
    return;
  }

  if (filter !== 'all') {
    const items = PRODUCTS.filter((p) => catLabel(p.category) === filter);
    grid.innerHTML = `<div class="catalog-grid">${items.map(cardHtml).join('')}</div>`;
    wireCarousels(grid);
    wireVideoVisibility(grid);
    return;
  }

  const categories = orderedCategories();
  grid.innerHTML = categories
    .map((category) => {
      const items = PRODUCTS.filter((p) => catLabel(p.category) === category);
      return `
        <div class="category-group">
          <h3 class="category-heading">${category}</h3>
          <div class="catalog-grid">${items.map(cardHtml).join('')}</div>
        </div>`;
    })
    .join('');
  wireCarousels(grid);
  wireVideoVisibility(grid);
}

function wireGenericWhatsappLinks() {
  const generic = waLink('Olá! Vi o site da Romano Joias e gostaria de fazer uma encomenda.');
  document.querySelectorAll('[data-wa-generic]').forEach((el) => (el.href = generic));
}

function wireInstagramLink() {
  const link = document.getElementById('instagramLink');
  if (link) link.href = `https://instagram.com/${INSTAGRAM_HANDLE}`;
}

function wireMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mobileNav');
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

function wireExternalLinks() {
  // Abre WhatsApp/Instagram navegando na MESMA aba via location.href, em vez de
  // nova aba (target=_blank) ou window.open — mais confiável pra abrir o app
  // nativo no celular (evita o "abre aba em branco e depois navega", que falha
  // em alguns navegadores mobile).
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a.btn-whatsapp, #instagramLink');
    if (!link || !link.href) return;
    e.preventDefault();
    window.location.href = link.href;
  });
}

// Só toca vídeo enquanto ele está realmente visível na tela — inclusive
// dentro de um carrossel, um slide arrastado pra fora da vista já conta como
// "não visível" (o navegador considera o corte pelo overflow do carrossel).
// Isso evita gastar banda com vídeo tocando escondido/fora de vista.
let videoObserver = null;
function wireVideoVisibility(root) {
  if (!videoObserver) {
    videoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (entry.isIntersecting) {
            const p = video.play();
            if (p && p.catch) p.catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.25 }
    );
  }
  root.querySelectorAll('video').forEach((v) => {
    // O iOS/Safari só deixa o vídeo tocar sozinho se a PROPRIEDADE muted estiver
    // ligada (não basta o atributo no HTML) — garante aqui antes de observar.
    v.muted = true;
    v.setAttribute('muted', '');
    videoObserver.observe(v);
  });
}

// Lightbox: toca na foto/vídeo da peça e abre em tela cheia pra ver melhor.
function openLightbox(mediaEl) {
  const box = document.getElementById('lightbox');
  const content = document.getElementById('lightboxContent');
  if (!box || !content || !mediaEl) return;
  const src = mediaEl.currentSrc || mediaEl.getAttribute('src');
  if (!src) return;
  if (mediaEl.tagName === 'VIDEO') {
    const poster = mediaEl.getAttribute('poster') || '';
    content.innerHTML = `<video src="${src}"${poster ? ` poster="${poster}"` : ''} controls autoplay loop playsinline muted></video>`;
  } else {
    content.innerHTML = `<img src="${src}" alt="" />`;
  }
  box.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const box = document.getElementById('lightbox');
  const content = document.getElementById('lightboxContent');
  if (!box || box.hidden) return;
  box.hidden = true;
  content.innerHTML = ''; // para o vídeo e libera memória
  document.body.style.overflow = '';
}

function wireLightbox() {
  const box = document.getElementById('lightbox');
  if (!box) return;
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  box.addEventListener('click', (e) => {
    if (e.target === box) closeLightbox(); // clicou no fundo escuro
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
  // Abre ao tocar na mídia de um card ou da peça em destaque.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return; // ignora quando foi um arraste do carrossel
    const frame = e.target.closest('.card-media .media-frame, .showcase-media .media-frame');
    if (!frame) return;
    const media = frame.querySelector('.media-fill');
    if (media) openLightbox(media);
  });
}

async function init() {
  document.getElementById('year').textContent = new Date().getFullYear();
  wireGenericWhatsappLinks();
  wireInstagramLink();
  wireMobileMenu();
  wireExternalLinks();
  wireLightbox();
  const loaded = await loadProducts();
  if (loaded) {
    renderShowcase();
    renderFilters();
    renderGrid();
  }
}

init();

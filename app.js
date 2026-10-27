const API = '/api';
const STORE = { favorites: 'ngomikgeng_favorites_v1', history: 'ngomikgeng_history_v1', theme: 'ngomikgeng_theme_v1' };
const app = document.querySelector('#app');
const toastNode = document.querySelector('#toast');
let currentRoute = null;
let searchTimer = null;
let toastTimer = null;
let overlayTimer = null;
let currentChapter = null;
let currentDetail = null;
let searchValue = '';
let searchPage = 1;
let activeListPage = 1;
let currentListAction = 'latest';
let activeGenre = '';
let activeType = 'manhwa';
let scrollProgressTimer = null;

function readStore(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function safeUrl(value = '') {
  try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function icon(name, cls = '') {
  const className = cls ? ` class="${cls}"` : '';
  return '<i data-lucide="' + name + '"' + className + '></i>';
}
function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 2 } }); }
function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2300);
}
async function api(action, params = {}) {
  const query = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')) });
  const response = await fetch(`${API}?${query}`, { headers: { Accept: 'application/json' } });
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Respons server tidak valid. Coba lagi sebentar.'); }
  if (!response.ok || !payload.success) throw new Error(payload.error || `Permintaan gagal (${response.status})`);
  return payload.data;
}
function setLoading(message = 'Memuat komik...') {
  app.innerHTML = `<section class="state-screen">
        <span class="loader">
        </span>
        <p>${escapeHtml(message)}</p>
        </section>`;
}
function renderError(error, retry) {
  app.innerHTML = `<section class="state-screen">
        <div class="error-box">
        <strong>${icon('cloud-off')} Data belum bisa dimuat</strong>
        <p>${escapeHtml(error?.message || 'Terjadi kesalahan saat mengambil data.')}</p>
        <button class="primary-btn" id="retryBtn">${icon('refresh-cw')} Coba lagi</button>
        </div>
        </section>`;
  app.querySelector('#retryBtn')?.addEventListener('click', retry);
  refreshIcons();
}
function favoriteItems() { return readStore(STORE.favorites, []); }
function historyItems() { return readStore(STORE.history, []); }
function isFavorite(slug) { return favoriteItems().some(item => item.slug === slug); }
function updateFavoriteCount() {
  const node = document.querySelector('#favoriteCount');
  if (node) node.textContent = favoriteItems().length > 99 ? '99+' : String(favoriteItems().length);
}
function toggleFavorite(item) {
  if (!item?.slug) return;
  const list = favoriteItems();
  const index = list.findIndex(entry => entry.slug === item.slug);
  if (index >= 0) {
    list.splice(index, 1);
    showToast('Dihapus dari favorite');
  } else {
    list.unshift({
      title: item.title || 'Komik',
      slug: item.slug,
      url: item.url || '',
      thumbnail: item.thumbnail || '',
      genre: item.genre || '',
      total_chapters: item.total_chapters || ''
    });
    showToast('Ditambahkan ke favorite');
  }
  writeStore(STORE.favorites, list.slice(0, 500));
  updateFavoriteCount();
  const button = app.querySelector(`[data-favorite="${CSS.escape(item.slug)}"]`);
  if (button) {
    const saved = isFavorite(item.slug);
    button.classList.toggle('saved', saved);
    button.innerHTML = icon('heart');
    refreshIcons();
  }
  if (currentRoute?.page === 'favorites') renderFavorites();
}
function saveHistory(item, chapter = null, progress = 0) {
  if (!item?.slug) return;
  const list = historyItems().filter(entry => entry.slug !== item.slug);
  list.unshift({
    title: item.title || 'Komik',
    slug: item.slug,
    url: item.url || '',
    thumbnail: item.thumbnail || '',
    genre: item.genre || '',
    total_chapters: item.total_chapters || '',
    chapter_title: chapter?.title || '',
    chapter_slug: chapter?.slug || '',
    chapter_url: chapter?.url || '',
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    updated_at: Date.now()
  });
  writeStore(STORE.history, list.slice(0, 100));
}
function coverMarkup(item, index = 0) {
  const src = safeUrl(item.thumbnail || '');
  const saved = isFavorite(item.slug);
  const title = escapeHtml(item.title || 'Tanpa judul');
  const genre = escapeHtml(item.genre || item.type || 'Komik');
  const chapter = escapeHtml(item.total_chapters || item.latest_chapter?.title || 'Lihat detail');
  return `<article class="comic-card">
        <a href="#/detail/${encodeURIComponent(item.slug || '')}" aria-label="Buka ${title}">
        <div class="cover-wrap">
        <div class="cover-fallback">${icon('book-open')}</div>
        ${src ? `<img src="${escapeHtml(src)}" alt="Cover ${title}" loading="${index < 6 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        <span class="cover-tag">${genre || 'Komik'}</span>
        <span class="cover-shade">
        </span>
        </div>
        <h3 class="comic-title">${title}</h3>
        </a>
        <div class="comic-meta">
        <span>${chapter}</span>
        <span class="meta-dot">
        </span>
        <span>Komik</span>
        </div>
        <button class="fav-toggle ${saved ? 'saved' : ''}" data-favorite="${escapeHtml(item.slug || '')}" aria-label="${saved ? 'Hapus favorite' : 'Tambah favorite'}">${icon('heart')}</button>
        </article>`;
}
function bindFavoriteButtons(items) {
  app.querySelectorAll('[data-favorite]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    const slug = button.getAttribute('data-favorite');
    const item = items.find(entry => entry.slug === slug) || { slug, title: button.closest('.comic-card')?.querySelector('.comic-title')?.textContent };
    toggleFavorite(item);
  }));
}
function gridMarkup(items) {
  if (!items?.length) return emptyMarkup('Komiknya belum ketemu', 'Coba kata kunci atau filter lain.', 'search');
  return `<div class="comic-grid">${items.map(coverMarkup).join('')}</div>`;
}
function emptyMarkup(title, text, iconName = 'book-open', action = '') {
  return `<div class="empty-state">${icon(iconName)}<h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p>${action}</div>`;
}
function sectionHead(title, subtitle = '', link = '', href = '') {
  return `<div class="section-head">
        <div>
        <h2 class="section-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="section-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        ${link ? `<a class="text-link" href="${href}">${escapeHtml(link)} ${icon('arrow-up-right')}</a>` : ''}
        </div>`;
}
function shelfMarkup(items) {
  if (!items.length) return '';
  return `<div class="shelf">${items.map(item => {
    const target = item.chapter_slug
      ? `#/reader/${encodeURIComponent(item.chapter_slug)}?m=${encodeURIComponent(item.slug)}`
      : `#/detail/${encodeURIComponent(item.slug)}`;
    const action = item.chapter_slug ? 'Lanjut baca' : 'Lihat komik';
    return `<article class="shelf-item">
        <a href="#/detail/${encodeURIComponent(item.slug)}">
          <img src="${escapeHtml(safeUrl(item.thumbnail))}" loading="lazy" alt="" onerror="this.style.opacity='.15'">
        </a>
        <div class="shelf-info">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.chapter_title || item.total_chapters || 'Lanjut membaca')}</small>
          <a href="${target}">${action} ${icon('arrow-right')}</a>
          ${item.progress ? `<div class="history-progress"><span style="width:${item.progress}%"></span></div>` : ''}
        </div>
      </article>`;
  }).join('')}</div>`;
}
async function renderHome() {
  setLoading('Mengambil update komik terbaru...');
  try {
    const data = await api('home');
    const latest = data.latest || data.items?.slice(0, 20) || [];
    const popular = data.popular?.length ? data.popular.slice(0, 12) : latest.slice(6, 18);
    const history = historyItems().slice(0, 4);
    app.innerHTML = `<section class="hero">
        <div class="hero-copy">
        <span class="eyebrow">
        <span class="dot">
        </span> Ruang baca favoritmu</span>
        <h1>Temukan cerita.<br>
        <em>Masuk ke dunia lain.</em>
        </h1>
        <p>Update komik, cerita seru, dan petualangan baru. Baca dengan nyaman di mana saja.</p>
        <a href="#/search" class="primary-btn">${icon('search')} Cari komik</a>
        </div>
        </section>
        <section class="section">${sectionHead('Jelajahi komik', 'Pilih jenis bacaan favoritmu')}<div class="filter-row">
        <a class="chip active" href="#/list/latest">Semua komik</a>
        <a class="chip" href="#/list/type/manhwa">Manhwa</a>
        <a class="chip" href="#/list/type/manga">Manga</a>
        <a class="chip" href="#/list/type/manhua">Manhua</a>
        <a class="chip" href="#/list/popular">Populer</a>
        <a class="chip" href="#/list/latest">Terbaru</a>
        </div>
        </section>
        ${history.length ? `<section class="section">${sectionHead('Lanjutkan membaca', 'Lanjut dari chapter terakhirmu', 'Riwayat', '#/history')}${shelfMarkup(history)}</section>` : ''}
        <section class="section">${sectionHead('Update terbaru', 'Komik yang baru diperbarui', 'Lihat semua', '#/list/latest')}${gridMarkup(latest)}</section>
        <section class="section">${sectionHead('Pilihan populer', 'Cari bacaan yang lagi ramai', 'Lihat semua', '#/list/popular')}${gridMarkup(popular)}</section>
        <section class="section">${sectionHead('Cari berdasarkan genre', 'Temukan cerita sesuai mood')}</section>
        <div class="filter-row genre-home">
        ${['aksi', 'romantis', 'komedi', 'fantasi', 'petualangan', 'drama', 'horor', 'supernatural', 'school-life', 'misteri', 'reinkarnasi', 'psikologis']
          .map(g => `<a class="chip" href="#/list/genre/${encodeURIComponent(g)}">${escapeHtml(g.replaceAll('-', ' '))}</a>`)
          .join('')}
        </div>`;
    bindFavoriteButtons([...latest, ...popular]); refreshIcons();
  } catch (error) { renderError(error, renderHome); }
}
function renderSearch() {
  app.innerHTML = `<section class="search-panel">
        <span class="eyebrow">${icon('search')} Temukan bacaan baru</span>
        <h1 class="detail-title" style="margin-top:12px">Cari komik <span style="color:var(--teal)">favoritmu.</span>
        </h1>
        <p class="section-subtitle" style="margin-bottom:18px">Cari judul manga, manhwa, atau manhua.</p>
        <form class="search-box" id="searchForm">
        ${icon('search')}
        <input id="searchInput" type="search" value="${escapeHtml(searchValue)}" placeholder="Contoh: Naruto, Solo Leveling..." autocomplete="off" enterkeyhint="search">
        <button type="button" id="clearSearch" aria-label="Hapus pencarian">${icon('x')}</button>
        </form>
        <div class="filter-row" style="margin-top:12px">
        <a class="chip" href="#/list/type/manhwa">Manhwa</a>
        <a class="chip" href="#/list/type/manga">Manga</a>
        <a class="chip" href="#/list/type/manhua">Manhua</a>
        <a class="chip" href="#/list/popular">Populer</a>
        </div>
        <div id="searchResults">
        <p class="search-results-label">${searchValue ? `Hasil pencarian untuk “${escapeHtml(searchValue)}”` : 'Mulai ketik untuk mencari komik.'}</p>
        ${searchValue ? '<div class="state-screen"><span class="loader"></span></div>' : emptyMarkup('Lagi cari apa?', 'Hasil komik akan muncul otomatis saat kamu mengetik.', 'search')}
        </div>
        </section>`;
  const input = app.querySelector('#searchInput');
  input.focus({ preventScroll: true });
  app.querySelector('#searchForm').addEventListener('submit', event => { event.preventDefault(); searchValue = input.value.trim(); searchPage = 1; runSearch(); });
  app.querySelector('#clearSearch').addEventListener('click', () => {
    input.value = '';
    searchValue = '';
    app.querySelector('#searchResults').innerHTML = emptyMarkup('Lagi cari apa?', 'Mulai ketik untuk melihat hasil komik.', 'search');
    input.focus();
  });
  input.addEventListener('input', () => {
    searchValue = input.value.trim(); searchPage = 1; clearTimeout(searchTimer);
    if (!searchValue) { app.querySelector('#searchResults').innerHTML = emptyMarkup('Lagi cari apa?', 'Mulai ketik untuk melihat hasil komik.', 'search'); return; }
    app.querySelector('#searchResults').innerHTML = '<div class="state-screen"><span class="loader"></span><p>Mencari komik...</p></div>';
    searchTimer = setTimeout(runSearch, 350);
  });
  if (searchValue) runSearch();
  refreshIcons();
}
async function runSearch() {
  const target = app.querySelector('#searchResults');
  if (!target || !searchValue) return;
  const query = searchValue;
  target.innerHTML = '<div class="state-screen"><span class="loader"></span><p>Mencari komik...</p></div>';
  try {
    const data = await api('search', { q: query, page: searchPage });
    if (!app.querySelector('#searchResults') || query !== searchValue) return;
    const items = data.results || [];
    target.innerHTML = `<p class="search-results-label">${items.length} hasil untuk “${escapeHtml(query)}”</p>${gridMarkup(items)}${items.length ? `<div class="pagination">
        <button class="outline-btn" id="searchPrev" ${searchPage <= 1 ? 'disabled' : ''}>${icon('chevron-left')} Sebelumnya</button>
        <span>Halaman ${searchPage}</span>
        <button class="outline-btn" id="searchNext">Berikutnya ${icon('chevron-right')}</button>
        </div>` : ''}`;
    bindFavoriteButtons(items); refreshIcons();
    target.querySelector('#searchPrev')?.addEventListener('click', () => { if (searchPage > 1) { searchPage--; runSearch(); } });
    target.querySelector('#searchNext')?.addEventListener('click', () => { searchPage++; runSearch(); });
  } catch (error) { if (target.isConnected) target.innerHTML = `<div class="error-box">
        <strong>Pencarian gagal</strong>
        <p>${escapeHtml(error.message)}</p>
        <button class="outline-btn" id="retrySearch">${icon('refresh-cw')} Coba lagi</button>
        </div>`; target.querySelector('#retrySearch')?.addEventListener('click', runSearch); refreshIcons(); }
}
async function renderList(action = 'latest', value = '') {
  currentListAction = action; activeListPage = 1; activeGenre = action === 'genre' ? value : ''; activeType = action === 'type' ? value : 'manhwa';
  await loadListPage();
}
async function loadListPage() {
  setLoading('Memuat daftar komik...');
  const action = currentListAction, page = activeListPage;
  try {
    const params = action === 'type' ? { type: activeType, page } : action === 'genre' ? { genre: activeGenre, page } : { page };
    const data = await api(action, params);
    const items = data.items || [];
    const title = action === 'popular' ? 'Komik populer' : action === 'type' ? `Daftar ${activeType}` : action === 'genre' ? `Genre ${activeGenre.replaceAll('-', ' ')}` : 'Update terbaru';
    const types = `<div class="filter-row">
        <a class="chip ${action === 'latest' ? 'active' : ''}" href="#/list/latest">Semua</a>
        <a class="chip ${activeType === 'manhwa' && action === 'type' ? 'active' : ''}" href="#/list/type/manhwa">Manhwa</a>
        <a class="chip ${activeType === 'manga' && action === 'type' ? 'active' : ''}" href="#/list/type/manga">Manga</a>
        <a class="chip ${activeType === 'manhua' && action === 'type' ? 'active' : ''}" href="#/list/type/manhua">Manhua</a>
        <a class="chip ${action === 'popular' ? 'active' : ''}" href="#/list/popular">Populer</a>
        </div>`;
    const genreFilters = action === 'genre'
      ? `<div class="filter-row">${[
        'aksi', 'komedi', 'romantis', 'drama', 'petualangan', 'school-life',
        'slice-of-life', 'seinen', 'supernatural', 'misteri', 'sejarah', 'sihir',
        'fiksi-ilmiah', 'psikologis', 'horor', 'reinkarnasi'
      ]
        .map(g => `<a class="chip ${g === activeGenre ? 'active' : ''}" href="#/list/genre/${g}">${g.replaceAll('-', ' ')}</a>`)
        .join('')}</div>`
      : '';
    app.innerHTML = `<section class="section" style="margin-top:24px">
        ${sectionHead(title, `${data.total ?? items.length} komik ditampilkan`)}
        ${types}
        ${genreFilters}
        ${gridMarkup(items)}
        <div class="pagination">
        <button class="outline-btn" id="listPrev" ${page <= 1 ? 'disabled' : ''}>${icon('chevron-left')} Sebelumnya</button>
        <span>Halaman ${page}</span>
        <button class="outline-btn" id="listNext">Berikutnya ${icon('chevron-right')}</button>
        </div>
        </section>`;
    bindFavoriteButtons(items); refreshIcons();
    app.querySelector('#listPrev')?.addEventListener('click', () => { if (activeListPage > 1) { activeListPage--; loadListPage(); window.scrollTo(0, 0); } });
    app.querySelector('#listNext')?.addEventListener('click', () => { activeListPage++; loadListPage(); window.scrollTo(0, 0); });
  } catch (error) { renderError(error, loadListPage); }
}
function renderFavorites() {
  const items = favoriteItems();
  app.innerHTML = `<section class="section" style="margin-top:24px">${sectionHead('Favorite kamu', 'Komik tersimpan di perangkat ini')}<div class="filter-row">
        <span class="chip active">${items.length} komik tersimpan</span>
        <button class="chip" id="clearFavorites">Hapus semua</button>
        </div>
        ${items.length ? gridMarkup(items) : emptyMarkup('Belum ada favorite', 'Tekan ikon hati pada cover komik untuk menyimpannya.', 'heart', '<a class="primary-btn" href="#/home">Jelajahi komik</a>')}
        </section>`;
  bindFavoriteButtons(items);
  app.querySelector('#clearFavorites')?.addEventListener('click', () => {
    if (!favoriteItems().length) return;
    if (confirm('Hapus semua komik dari favorite?')) {
      writeStore(STORE.favorites, []);
      updateFavoriteCount();
      renderFavorites();
      showToast('Favorite dibersihkan');
    }
  });
  refreshIcons();
}
function renderHistory() {
  const items = historyItems();
  app.innerHTML = `<section class="section" style="margin-top:24px">${sectionHead('Riwayat membaca', 'Progres baca tersimpan di perangkat ini')}<div class="filter-row">
        <span class="chip active">${items.length} komik</span>
        <button class="chip" id="clearHistory">Bersihkan riwayat</button>
        </div>${items.length ? shelfMarkup(items) : emptyMarkup('Riwayat masih kosong', 'Komik yang kamu baca akan muncul di sini.', 'history', '<a class="primary-btn" href="#/home">Cari komik</a>')}</section>`;
  app.querySelector('#clearHistory')?.addEventListener('click', () => { if (confirm('Bersihkan semua riwayat membaca?')) { writeStore(STORE.history, []); renderHistory(); showToast('Riwayat dibersihkan'); } });
  refreshIcons();
}
async function renderDetail(slug) {
  setLoading('Memuat detail komik...');
  try {
    const detail = await api('detail', { slug });
    currentDetail = detail;
    const genres = (detail.genres || []).map(g => `<a class="chip" href="#/list/genre/${encodeURIComponent(g.slug || g.name.toLowerCase())}">${escapeHtml(g.name)}</a>`).join('');
    const chapterRows = (detail.chapters || []).map((chapter, index) => `<a class="chapter-row"
        data-chapter-title="${escapeHtml(chapter.title.toLowerCase())}"
        href="#/reader/${encodeURIComponent(chapter.slug)}?m=${encodeURIComponent(detail.slug)}">
        <div>
        <strong>${escapeHtml(chapter.title || `Chapter ${detail.chapters.length - index}`)}</strong>
        <small>Ketuk untuk membaca</small>
        </div>${icon('chevron-right')}</a>`).join('');
    app.innerHTML = `<section class="detail-hero">
        <img class="detail-cover" src="${escapeHtml(safeUrl(detail.thumbnail))}" alt="Cover ${escapeHtml(detail.title)}" referrerpolicy="no-referrer" onerror="this.style.opacity='.2'">
        <div>
        <div class="eyebrow">${escapeHtml(detail.type || 'Komik')} <span class="dot">
        </span> ${escapeHtml(detail.status || 'Ongoing')}</div>
        <h1 class="detail-title">${escapeHtml(detail.title || 'Detail komik')}</h1>
        <div class="detail-badges">
        <span class="pill teal">${escapeHtml(detail.status || 'Ongoing')}</span>
        <span class="pill">${escapeHtml(detail.type || 'Komik')}</span>
        <span class="pill">${detail.total_chapters || detail.chapters?.length || 0} chapter</span>
        </div>
        <p class="detail-description">${escapeHtml(detail.synopsis || 'Sinopsis belum tersedia dari sumber.')}</p>
        <div class="genre-list">${genres || '<span class="pill">Genre belum tersedia</span>'}</div>
        <div class="detail-actions">
        ${detail.latest_chapter ? `<a class="primary-btn" href="#/reader/${encodeURIComponent(detail.latest_chapter.slug)}?m=${encodeURIComponent(detail.slug)}">${icon('book-open')} Baca terbaru</a>` : ''}
        ${detail.first_chapter ? `<a class="secondary-btn" href="#/reader/${encodeURIComponent(detail.first_chapter.slug)}?m=${encodeURIComponent(detail.slug)}">${icon('play')} Mulai baca</a>` : ''}
        <button class="outline-btn" id="detailFavorite">${icon('heart')} ${isFavorite(detail.slug) ? 'Tersimpan' : 'Favorite'}</button>
        </div>
        </div>
        </section>
        <section class="section">${sectionHead('Daftar chapter', `${detail.total_chapters || detail.chapters?.length || 0} chapter tersedia`)}<div class="chapter-tools">
        <input id="chapterFilter" type="search" placeholder="Cari nomor atau judul chapter...">
        <select id="chapterSort" aria-label="Urutkan chapter">
        <option value="desc">Terbaru dahulu</option>
        <option value="asc">Terlama dahulu</option>
        </select>
        </div>
        <div class="chapter-list" id="chapterList">${chapterRows || emptyMarkup('Chapter belum tersedia', 'Sumber belum memberikan daftar chapter.', 'book-open')}</div>
        </section>
        <section class="section">${sectionHead('Jelajahi lagi', 'Temukan komik lainnya')}<div class="filter-row">
        <a class="chip" href="#/home">Beranda</a>
        <a class="chip" href="#/search">Cari komik</a>
        <a class="chip" href="#/list/popular">Komik populer</a>
        </div>
        </section>`;
    app.querySelector('#detailFavorite').addEventListener('click', () => {
      toggleFavorite(detail);
      app.querySelector('#detailFavorite').innerHTML = `${icon('heart')} ${isFavorite(detail.slug) ? 'Tersimpan' : 'Favorite'}`;
      refreshIcons();
    });
    const filter = app.querySelector('#chapterFilter'), sort = app.querySelector('#chapterSort'), list = app.querySelector('#chapterList');
    const updateChapters = () => {
      const rows = [...list.querySelectorAll('.chapter-row')];
      rows.sort((a, b) => {
        const left = a.dataset.chapterTitle;
        const right = b.dataset.chapterTitle;
        return sort.value === 'asc'
          ? left.localeCompare(right, undefined, { numeric: true })
          : right.localeCompare(left, undefined, { numeric: true });
      });
      rows.forEach(row => { row.hidden = !row.dataset.chapterTitle.includes(filter.value.trim().toLowerCase()); list.appendChild(row); });
    };
    filter.addEventListener('input', updateChapters); sort.addEventListener('change', updateChapters); updateChapters(); refreshIcons();
  } catch (error) { renderError(error, () => renderDetail(slug)); }
}
function routeQuery() { const raw = location.hash.split('?')[1] || ''; return new URLSearchParams(raw); }
function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map(part => decodeURIComponent(part));
  if (!parts.length || parts[0] === 'home') return { page: 'home' };
  if (parts[0] === 'search') return { page: 'search' };
  if (parts[0] === 'favorites') return { page: 'favorites' };
  if (parts[0] === 'history') return { page: 'history' };
  if (parts[0] === 'detail') return { page: 'detail', slug: parts.slice(1).join('/') };
  if (parts[0] === 'reader') return { page: 'reader', slug: parts.slice(1).join('/'), manga: routeQuery().get('m') || '' };
  if (parts[0] === 'list') {
    if (parts[1] === 'type') return { page: 'list', action: 'type', value: parts[2] || 'manhwa' };
    if (parts[1] === 'genre') return { page: 'list', action: 'genre', value: parts[2] || '' };
    return { page: 'list', action: parts[1] === 'popular' ? 'popular' : 'latest' };
  }
  return { page: 'home' };
}
function updateNavigation(page) {
  document.querySelectorAll('[data-nav]').forEach(node => {
    const isActive = node.dataset.nav === page ||
      (['list', 'detail', 'reader'].includes(page) && node.dataset.nav === 'home');
    node.classList.toggle('active', isActive);
  });
  document.querySelector('#bottomNav').style.display = page === 'reader' ? 'none' : 'flex';
  document.querySelector('#topbar').style.display = page === 'reader' ? 'none' : 'flex';
}
function onRoute() {
  clearTimeout(overlayTimer);
  if (!location.hash.includes('#/reader/')) window.removeEventListener('scroll', onReaderScroll);
  currentRoute = parseRoute();
  updateNavigation(currentRoute.page);
  window.scrollTo(0, 0);
  switch (currentRoute.page) {
    case 'home': renderHome(); break;
    case 'search': renderSearch(); break;
    case 'favorites': renderFavorites(); break;
    case 'history': renderHistory(); break;
    case 'detail': renderDetail(currentRoute.slug); break;
    case 'reader': renderReader(currentRoute.slug, currentRoute.manga); break;
    case 'list': renderList(currentRoute.action, currentRoute.value); break;
    default: renderHome();
  }
}
function setReaderOverlay(show) {
  const overlay = document.querySelector('#readerOverlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
  if (show) {
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => setReaderOverlay(false), 4200);
  }
}
function updateReaderProgress() {
  if (!currentChapter || currentRoute?.page !== 'reader') return;
  const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.round((window.scrollY / total) * 100);
  const node = document.querySelector('#readerProgress');
  if (node) node.textContent = `${progress}% dibaca`;
  const stored = historyItems().find(item => item.slug === (currentDetail?.slug || currentRoute.manga));
  const manga = currentDetail || stored || { slug: currentRoute.manga, title: document.querySelector('#readerMangaTitle')?.textContent || 'Komik' };
  saveHistory(manga, currentChapter, progress);
}
async function renderReader(slug, mangaSlug = '') {
  setLoading('Menyiapkan halaman chapter...');
  try {
    const chapter = await api('chapter', { slug });
    currentChapter = chapter;
    let detail = null;
    if (mangaSlug) {
      try { detail = await api('detail', { slug: mangaSlug }); currentDetail = detail; } catch { detail = null; }
    }
    const historyItem = historyItems().find(item => item.slug === mangaSlug);
    const imageTags = (chapter.images || []).map((url, index) => `<img
        class="reader-image"
        src="${escapeHtml(safeUrl(url))}"
        alt="${escapeHtml(chapter.title)} — halaman ${index + 1}"
        loading="${index < 2 ? 'eager' : 'lazy'}"
        decoding="async"
        referrerpolicy="no-referrer"
        data-reader-image="${index + 1}"
        onerror="this.dataset.failed='1';this.alt='Halaman gagal dimuat';this.style.minHeight='80px'
      >`).join('');
    app.innerHTML = `<div class="reader-page">
        <div class="reader-top">
        <div class="reader-top-main">
        <strong id="readerMangaTitle">${escapeHtml(detail?.title || historyItem?.title || chapter.title || 'Ngomikgeng')}</strong>
        <small>${escapeHtml(chapter.title || 'Chapter')} · ${chapter.total_images || chapter.images?.length || 0} halaman</small>
        </div>
        <div class="reader-controls">
        <button id="readerBack" aria-label="Kembali ke detail">${icon('arrow-left')}</button>
        <button id="readerSettingsBtn" aria-label="Pengaturan reader">${icon('settings-2')}</button>
        <button id="readerFullscreen" aria-label="Layar penuh">${icon('maximize')}</button>
        </div>
        </div>
        <div class="reader-settings" id="readerSettings" hidden style="padding:10px 0">
        <label class="section-subtitle" for="readerGap">Jarak gambar</label>
        <select id="readerGap">
        <option value="0">Rapat</option>
        <option value="6">Normal</option>
        <option value="14">Lebar</option>
        </select>
        <label class="section-subtitle" for="readerBg">Latar</label>
        <select id="readerBg">
        <option value="#030706">Gelap</option>
        <option value="#111816">Abu-abu</option>
        <option value="#ffffff">Putih</option>
        </select>
        </div>
        <div class="reader-status">
        <span id="readerProgress">0% dibaca</span>
        <span>Ketuk gambar untuk kontrol</span>
        </div>
        <div class="reader-images" id="readerImages">${imageTags || emptyMarkup('Gambar chapter tidak ditemukan', 'Sumber tidak mengembalikan gambar untuk chapter ini.', 'image-off')}</div>
        <div class="reader-end">
        <h3>Chapter selesai?</h3>
        <p class="section-subtitle">Lanjutkan ke chapter berikutnya atau kembali ke daftar.</p>
        <div class="reader-bottom-actions">
        <button class="outline-btn" id="readerPrevBottom" ${chapter.prev_chapter_url ? '' : 'disabled'}>${icon('chevron-left')} Sebelumnya</button>
        <button class="primary-btn" id="readerNextBottom" ${chapter.next_chapter_url ? '' : 'disabled'}>Selanjutnya ${icon('chevron-right')}</button>
        </div>
        <p style="margin-top:17px">
        <a class="text-link" href="#/detail/${encodeURIComponent(mangaSlug || detail?.slug || '')}">Lihat semua chapter ${icon('arrow-up-right')}</a>
        </p>
        </div>
        </div>
        <div class="reader-overlay hidden" id="readerOverlay" role="dialog" aria-label="Navigasi chapter">
        <div class="overlay-card">
        <span class="overlay-icon">${icon('book-open')}</span>
        <h3>Kontrol membaca</h3>
        <p>${escapeHtml(chapter.title || 'Chapter')} · ketuk di luar atau tunggu untuk menyembunyikan.</p>
        <div class="overlay-actions">
        <button class="outline-btn" id="overlayPrev" ${chapter.prev_chapter_url ? '' : 'disabled'}>${icon('chevron-left')} Sebelumnya</button>
        <button class="primary-btn" id="overlayNext" ${chapter.next_chapter_url ? '' : 'disabled'}>Selanjutnya ${icon('chevron-right')}</button>
        </div>
        <button class="outline-btn" id="overlayClose" style="width:100%;margin-top:9px">Lanjut membaca</button>
        </div>
        </div>`;
    const readerImages = app.querySelector('#readerImages');
    readerImages.addEventListener('click', event => { if (event.target.closest('img')) setReaderOverlay(true); });
    app.querySelector('#overlayClose').addEventListener('click', () => setReaderOverlay(false));
    app.querySelector('#readerBack').addEventListener('click', () => location.hash = `#/detail/${encodeURIComponent(mangaSlug || detail?.slug || '')}`);
    const navigateChapter = value => { if (value) location.hash = `#/reader/${encodeURIComponent(value)}?m=${encodeURIComponent(mangaSlug || detail?.slug || '')}`; };
    const nextSlug = extractSlugFromUrl(chapter.next_chapter_url), prevSlug = extractSlugFromUrl(chapter.prev_chapter_url);
    app.querySelector('#overlayNext').addEventListener('click', () => navigateChapter(nextSlug));
    app.querySelector('#readerNextBottom').addEventListener('click', () => navigateChapter(nextSlug));
    app.querySelector('#overlayPrev').addEventListener('click', () => navigateChapter(prevSlug));
    app.querySelector('#readerPrevBottom').addEventListener('click', () => navigateChapter(prevSlug));
    app.querySelector('#readerSettingsBtn').addEventListener('click', () => { const settings = app.querySelector('#readerSettings'); settings.hidden = !settings.hidden; });
    app.querySelector('#readerGap').addEventListener('change', event => { readerImages.style.display = 'flex'; readerImages.style.flexDirection = 'column'; readerImages.style.gap = `${event.target.value}px`; });
    app.querySelector('#readerBg').addEventListener('change', event => {
      readerImages.style.background = event.target.value;
      readerImages.querySelectorAll('img').forEach(img => {
        img.style.background = event.target.value;
      });
    });
    app.querySelector('#readerFullscreen').addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await app.querySelector('.reader-page').requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch {
        showToast('Mode layar penuh tidak didukung browser ini');
      }
    });
    const overlay = app.querySelector('#readerOverlay');
    overlay.addEventListener('click', event => { if (event.target === overlay) setReaderOverlay(false); });
    saveHistory(detail || historyItem || { slug: mangaSlug, title: chapter.title, thumbnail: '' }, chapter, 0);
    window.addEventListener('scroll', onReaderScroll, { passive: true });
    refreshIcons();
  } catch (error) { renderError(error, () => renderReader(slug, mangaSlug)); }
}
function extractSlugFromUrl(url) {
  if (!url) return '';
  try { return decodeURIComponent(new URL(url).pathname).replace(/^\/(?:baca\/)?/, '').replace(/\/$/, ''); } catch { return String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/(?:baca\/)?/, '').replace(/\/$/, ''); }
}
function onReaderScroll() {
  if (scrollProgressTimer) return;
  scrollProgressTimer = setTimeout(() => { scrollProgressTimer = null; updateReaderProgress(); }, 180);
}
document.querySelector('#topSearch').addEventListener('click', () => { location.hash = '#/search'; });
const THEMES = {
  dark: {
    '--bg': '#071311',
    '--surface': '#0d1b18',
    '--surface-2': '#11231f',
    '--surface-3': '#18312b',
    '--text': '#effaf6',
    '--muted': '#91aaa1',
    '--line': 'rgba(181,231,214,.1)',
    color: '#071311'
  },
  light: {
    '--bg': '#f3faf7',
    '--surface': '#ffffff',
    '--surface-2': '#eaf5f0',
    '--surface-3': '#d9eee6',
    '--text': '#10251e',
    '--muted': '#60796f',
    '--line': 'rgba(18,70,52,.13)',
    color: '#f3faf7'
  }
};
function setTheme(theme) {
  const values = THEMES[theme] || THEMES.dark;
  document.documentElement.dataset.theme = theme;
  Object.entries(values).forEach(([key, value]) => {
    if (key !== 'color') document.documentElement.style.setProperty(key, value);
  });
  document.querySelector('meta[name="theme-color"]').content = values.color;
  writeStore(STORE.theme, theme);
}
document.querySelector('#themeToggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  showToast(`Tema ${next === 'light' ? 'terang' : 'gelap'}`);
});
function applySavedTheme() {
  const saved = readStore(STORE.theme, 'dark');
  if (saved === 'light') setTheme('light');
}
window.addEventListener('hashchange', onRoute);
window.addEventListener('beforeunload', () => window.removeEventListener('scroll', onReaderScroll));
updateFavoriteCount();
if (!location.hash) location.hash = '#/home'; else onRoute();
applySavedTheme();

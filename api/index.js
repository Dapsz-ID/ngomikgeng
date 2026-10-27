import * as cheerio from 'cheerio';
const BASE_URL = 'https://komiku.online';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': `${BASE_URL}/`
};
const GENRES = [
  'aksi', 'komedi', 'romantis', 'drama', 'shounen', 'petualangan',
  'school-life', 'slice-of-life', 'seinen', 'supernatural', 'bela-diri',
  'ecchi', 'harem', 'shoujo', 'misteri', 'sejarah', 'ngewe', 'sihir',
  'fiksi-ilmiah', 'psikologis', 'horor', 'reinkarnasi', 'dewasa', 'tragedi'
];
const cache = new Map();
const CACHE_TTL = 60000;
function formatUrl(path) {
  if (!path)
    return '';
  try {
    return new URL(path, BASE_URL).href;
  }
  catch {
    return '';
  }
}
function sourceUrl(value, fallbackPath) {
  const candidate = /^https?:\/\//i.test(String(value || ''))
    ? new URL(value)
    : new URL(fallbackPath, BASE_URL);
  if (candidate.protocol !== 'https:' || !['komiku.online', 'www.komiku.online'].includes(candidate.hostname)) {
    throw new Error('URL sumber komik tidak valid');
  }
  return candidate.href;
}
function extractSlug(value) {
  if (!value)
    return '';
  try {
    const parsed = new URL(value, BASE_URL);
    return decodeURIComponent(parsed.pathname).replace(/^\/(?:baca\/)?/, '').replace(/\/$/, '');
  }
  catch {
    return String(value).replace(/^https?:\/\/[^/]+/, '').replace(/^\/(?:baca\/)?/, '').replace(/^\//, '').replace(/\/$/, '');
  }
}
function parseCard($, el) {
  const node = $(el);
  const link = node.find('a').first();
  const rawUrl = link.attr('href') || node.attr('href') || '';
  const meta = node.find('.kmk-kartu-meta').text().replace(/\s+/g, ' ').trim();
  const pieces = meta.split('·');
  return {
    title: node.find('.kmk-kartu-judul').text().trim() || link.attr('title') || '',
    slug: extractSlug(rawUrl),
    url: formatUrl(rawUrl),
    thumbnail: formatUrl(node.find('img').attr('data-src') || node.find('img').attr('src') || ''),
    genre: pieces[0]?.trim() || meta,
    total_chapters: pieces[1]?.trim() || node.find('.kmk-kartu-ch').text().trim(),
    meta
  };
}
async function fetchHtml(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL)
    return cached.html;
  const response = await fetch(url, { headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!response.ok)
    throw new Error(`Sumber komik merespons HTTP ${response.status}`);
  const html = await response.text();
  cache.set(url, { html, time: Date.now() });
  if (cache.size > 100)
    cache.delete(cache.keys().next().value);
  return html;
}
function parseCards(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('.kmk-kartu').each((_, el) => {
    const item = parseCard($, el);
    if (item.title && item.url)
      items.push(item);
  });
  return items;
}
async function getHome() {
  const items = parseCards(await fetchHtml(BASE_URL));
  return { total: items.length, latest: items.slice(0, 20), popular: items.slice(20), items };
}
async function getPopular(page = 1) {
  const n = Math.max(1, Math.min(100, Number(page) || 1));
  const items = parseCards(await fetchHtml(`${BASE_URL}/populer/${n > 1 ? `page/${n}/` : ''}`));
  return { page: n, total: items.length, items };
}
async function getLatest(page = 1) {
  const n = Math.max(1, Math.min(100, Number(page) || 1));
  const items = parseCards(await fetchHtml(`${BASE_URL}/terbaru/${n > 1 ? `page/${n}/` : ''}`));
  return { page: n, total: items.length, items };
}
async function search(keyword, page = 1) {
  const q = String(keyword || '').trim().slice(0, 100);
  if (!q)
    return { keyword: '', page: 1, total: 0, results: [] };
  const n = Math.max(1, Math.min(100, Number(page) || 1));
  const params = new URLSearchParams({ s: q });
  if (n > 1)
    params.set('paged', String(n));
  const results = parseCards(await fetchHtml(`${BASE_URL}/?${params}`));
  return { keyword: q, page: n, total: results.length, results };
}
async function getByType(type = 'manhwa', page = 1) {
  const valid = ['manga', 'manhwa', 'manhua'];
  const selected = valid.includes(String(type).toLowerCase()) ? String(type).toLowerCase() : 'manhwa';
  const n = Math.max(1, Math.min(100, Number(page) || 1));
  const items = parseCards(await fetchHtml(`${BASE_URL}/${selected}/${n > 1 ? `page/${n}/` : ''}`));
  return { type: selected, page: n, total: items.length, items };
}
async function getByGenre(genre, page = 1) {
  const slug = String(genre || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug)
    throw new Error('Genre tidak valid');
  const n = Math.max(1, Math.min(100, Number(page) || 1));
  const items = parseCards(await fetchHtml(`${BASE_URL}/genre/${slug}/${n > 1 ? `page/${n}/` : ''}`));
  return { genre: slug, page: n, total: items.length, items };
}
async function getDetail(slugOrUrl) {
  if (!slugOrUrl)
    throw new Error('Slug komik wajib diisi');
  const targetUrl = sourceUrl(slugOrUrl, `/${extractSlug(slugOrUrl)}/`);
  const $ = cheerio.load(await fetchHtml(targetUrl));
  const rawTitle = $('h1').first().text().trim();
  const title = rawTitle.replace(/^Komik\s+/i, '').trim();
  const slug = extractSlug(targetUrl);
  const thumbnail = formatUrl($('img[src*="poster"]').first().attr('src') || $('img[data-src*="poster"]').first().attr('data-src') || $('img').first().attr('data-src') || $('img').first().attr('src') || '');
  const metaText = $('p').filter((_, el) => /adalah|bergenre/i.test($(el).text())).first().text().replace(/\s+/g, ' ').trim();
  const type = /manhwa/i.test(metaText) ? 'Manhwa' : /manhua/i.test(metaText) ? 'Manhua' : 'Manga';
  const status = /tamat|completed/i.test(metaText) ? 'Completed' : 'Ongoing';
  const genres = [];
  $('a[href*="/genre/"]').each((_, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (name && !genres.some(item => item.name === name))
      genres.push({ name, slug: extractSlug(href).replace(/^genre\//, ''), url: formatUrl(href) });
  });
  const synopsis = $('p').filter((_, el) => /adalah|bergenre/i.test($(el).text())).first().text().trim() || $('p').eq(1).text().trim();
  const chapters = [];
  $('a[href*="/baca/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const chapterSlug = extractSlug(href);
    if (!chapterSlug || !chapterSlug.includes('chapter-'))
      return;
    const chapterTitle = $(el).text().replace(/\s+/g, ' ').trim();
    if (chapterTitle && !chapters.some(ch => ch.url === formatUrl(href)))
      chapters.push({ title: chapterTitle, slug: chapterSlug, url: formatUrl(href) });
  });
  return { title, slug, url: targetUrl, thumbnail, type, status, genres, synopsis, first_chapter: chapters.at(-1) || null, latest_chapter: chapters[0] || null, total_chapters: chapters.length, chapters };
}
async function getChapter(slugOrUrl) {
  if (!slugOrUrl)
    throw new Error('Slug chapter wajib diisi');
  let targetUrl = sourceUrl(slugOrUrl, `/baca/${extractSlug(slugOrUrl)}/`);
  let html;
  try {
    html = await fetchHtml(targetUrl);
  }
  catch (error) {
    if (!String(error.message).includes('404'))
      throw error;
    const detail = await getDetail(extractSlug(slugOrUrl));
    if (!detail.first_chapter?.url)
      throw error;
    targetUrl = detail.first_chapter.url;
    html = await fetchHtml(targetUrl);
  }
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim();
  let prev = null, next = null, manga = null;
  $('a').each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const href = formatUrl($(el).attr('href') || '');
    if (text.includes('sebelumnya') || text === '‹' || text === '«')
      prev = href;
    if (text.includes('selanjutnya') || text === '›' || text === '»')
      next = href;
    if (text.includes('semua chapter'))
      manga = href.replace(/#chapter$/, '');
  });
  const images = [];
  $('img').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
    if (!src || !/^https?:\/\//i.test(src))
      return;
    if (/logo|favicon|assets|theme|banner|iklan|avatar/i.test(src))
      return;
    const imageUrl = formatUrl(src.trim());
    if (imageUrl && !images.includes(imageUrl))
      images.push(imageUrl);
  });
  return { title, slug: extractSlug(targetUrl), url: targetUrl, manga_url: manga, prev_chapter_url: prev, next_chapter_url: next, total_images: images.length, images };
}
async function getRandom(detail = true) {
  const home = await getHome();
  if (!home.items.length)
    throw new Error('Belum ada komik yang tersedia');
  const item = home.items[Math.floor(Math.random() * home.items.length)];
  return detail ? getDetail(item.slug) : item;
}
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET')
    return send(res, 405, { success: false, error: 'Method tidak didukung' });
  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const action = (params.get('action') || 'home').toLowerCase();
    const page = params.get('page') || 1;
    let data;
    switch (action) {
      case 'home':
        data = await getHome();
        break;
      case 'latest':
        data = await getLatest(page);
        break;
      case 'popular':
        data = await getPopular(page);
        break;
      case 'search':
        data = await search(params.get('q') || '', page);
        break;
      case 'type':
        data = await getByType(params.get('type'), page);
        break;
      case 'genre':
        data = await getByGenre(params.get('genre'), page);
        break;
      case 'detail':
        data = await getDetail(params.get('slug') || params.get('url'));
        break;
      case 'chapter':
        data = await getChapter(params.get('slug') || params.get('url'));
        break;
      case 'random':
        data = await getRandom(params.get('detail') !== 'false');
        break;
      case 'genres':
        data = GENRES;
        break;
      default: return send(res, 400, { success: false, error: 'Action API tidak dikenal' });
    }
    return send(res, 200, { success: true, data });
  }
  catch (error) {
    return send(res, 502, { success: false, error: error?.message || 'Gagal mengambil data sumber komik' });
  }
}

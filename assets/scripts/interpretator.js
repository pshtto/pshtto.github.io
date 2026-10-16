// ============ КОНФИГ ============
const CONFIG = {
  info:           'contents/info/info.md',
  infoBase:       'contents/info/',
  portfolioBase:  'contents/portfolio/',
  noteFilenames:  ['project.md', 'index.md', 'Project.md', 'INDEX.md'],
  flowers: ['𓆸', '𓇚', '𓋇', '𓇗', '𓇣'],
  flowerBlankLines: 2,
  hardBreakSpaces: 2,
  infoKeys: ['photo', 'name', 'about', 'contacts', 'portfolio'],
  useBook: true,
  debug: true,

  longListMin: 5,
  gridMin: 6,
  gridPerPage: 24,
};

window.CONFIG = CONFIG;

const FOOTER = {
  designer: { label: 'дизайнер и разработчик', name: 'юра своев', url: 'https://ysvoev.ru/' },
  copyright: '© 2026',
};

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
function log(...a)  { if (CONFIG.debug) console.log(...a); }
function warn(...a) { if (CONFIG.debug) console.warn(...a); }

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============ ЗАГРУЗЧИК ============
function looksLikeHtml(t) { return /^\s*<(?:!doctype|html)/i.test(t); }
async function fetchViaFetch(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const t = await res.text();
  if (looksLikeHtml(t)) throw new Error('HTML вместо файла');
  return t;
}
function fetchViaXHR(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        const t = xhr.responseText;
        if (looksLikeHtml(t)) return reject(new Error('HTML вместо файла'));
        resolve(t);
      } else { reject(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.send();
  });
}
async function fetchText(url) {
  try { return await fetchViaFetch(url); }
  catch (e1) {
    try { return await fetchViaXHR(url); }
    catch (e2) { warn('[fetch ✗]', url); return null; }
  }
}
async function fetchProjectFile(base) {
  for (const fname of CONFIG.noteFilenames) {
    const url = base + fname;
    const md = await fetchText(url);
    if (md != null) return { url, md };
  }
  return null;
}

// ============ ЛЕНИВАЯ ЗАГРУЗКА ============
function setupLazyFor(root) {
  const scope = root || document;
  const els = scope.querySelectorAll('img[data-src], video[data-src]');
  els.forEach(el => {
    if (el.dataset.lazyInit === '1') return;
    el.dataset.lazyInit = '1';
    const src = el.getAttribute('data-src');
    if (!src) return;
    const load = () => { el.src = src; el.removeAttribute('data-src'); el.classList.add('loaded'); };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { load(); io.unobserve(entry.target); } });
      }, { rootMargin: '200px' });
      io.observe(el);
    } else { load(); }
  });
}

// ============ MARKDOWN → АТОМЫ ============
function mdToAtoms(md) {
  if (!md) return [];

  // --- 0. нормализуем переносы ---
  md = md.replace(/\r\n?/g, '\n');

  // --- 1. блоки кода: от 1 до 3 бэктиков в начале и столько же в конце.
  //     Может быть многострочный текст между ними.
  //     Регулярка с m: открытие — начало строки, закрытие — конец строки.
  //     Плейсхолдер ставим БЕЗ \n — чтобы не портить пустые строки вокруг.
  const codeBlocks = [];
  const ph = '@@__CB_' + Math.random().toString(36).slice(2, 8) + '_';
  let src = md.replace(/^(`{1,3})([\s\S]*?)\1[ \t]*$/gm, (m, ticks, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code.replace(/^\n+/, '').replace(/\n+$/, ''));
    return ph + idx + '@@';
  });

  if (CONFIG.debug) log('[code] найдено блоков:', codeBlocks.length);

  // --- 2. инлайн-замены (для текста; код уже спрятан) ---
  let html = src;
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img data-src="$2" alt="$1">');
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    if (/^(javascript|data):/i.test(u)) return t;
    return `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // --- 3. построчный парсинг ---
  const lines = html.split('\n');
  const atoms = [];
  let buf = [], blankCount = 0, listType = null, listItems = [], quoteBuf = [], imageBuf = [];
  const brRe = new RegExp(' {' + CONFIG.hardBreakSpaces + '}$');
  const phRe = new RegExp('^' + ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)@@$');

  let nextAtomGap = 0;
  const pushAtom = (atom) => {
    if (!atom.meta) atom.meta = {};
    atom.meta._gap = nextAtomGap;
    nextAtomGap = 0;
    atoms.push(atom);
  };

  const flushText = () => {
    if (!buf.length) return;
    const text = buf.map(x => x.text + (x.br ? '<br>' : '')).join(' ').trim();
    if (text) pushAtom({ type: 'paragraph', html: `<p>${text}</p>` });
    buf = [];
  };

  const closeList = () => {
    if (!listType) return;
    const cls = listType === 'checklist' ? ' class="checklist"' : '';
    const tag = listType === 'ol' ? 'ol' : 'ul';
    pushAtom({
      type: listType,
      html: `<${tag}${cls}>${listItems.join('')}</${tag}>`,
      meta: { count: listItems.length },
    });
    listItems = []; listType = null;
  };

  const flushQuote = () => {
    if (!quoteBuf.length) return;
    const joined = quoteBuf.join(' ');
    pushAtom({ type: 'quote', html: `<blockquote>${quoteBuf.join('<br>')}</blockquote>`, meta: { length: joined.length } });
    quoteBuf = [];
  };

  const flushImages = () => {
    if (!imageBuf.length) return;
    const n = imageBuf.length;
    if (n === 1) {
      pushAtom({ type: 'image', html: imageBuf[0], meta: { count: 1 } });
    } else {
      pushAtom({
        type: 'images',
        html: `<div class="images" data-count="${n}">${imageBuf.join('')}</div>`,
        meta: { count: n },
      });
    }
    imageBuf = [];
  };

  const emitFlower = () => {
    const ch = CONFIG.flowers[Math.floor(Math.random() * CONFIG.flowers.length)];
    pushAtom({ type: 'flower', html: `<p class="flower">${ch}</p>` });
  };

  const reset = () => { flushText(); flushQuote(); closeList(); flushImages(); };

  for (const rawLine of lines) {
    const br = brRe.test(rawLine);
    const line = rawLine.trim();

    if (!line) {
      blankCount++;
      if (blankCount >= CONFIG.flowerBlankLines) { reset(); emitFlower(); blankCount = 0; }
      continue;
    }

    if (blankCount >= 1) {
      reset();
      nextAtomGap = blankCount;
      blankCount = 0;
    }

    // --- блок кода (плейсхолдер) ---
    let m;
    if ((m = line.match(phRe))) {
      reset();
      const idx = parseInt(m[1], 10);
      const code = codeBlocks[idx] || '';
      pushAtom({
        type: 'code',
        html: `<pre class="code">${escapeHtml(code)}</pre>`,
      });
      continue;
    }

    if ((m = line.match(/^######\s+(.+)$/))) { reset(); pushAtom({ type: 'heading', html: `<h6>${m[1]}</h6>`, meta: { level: 6, text: m[1] } }); continue; }
    if ((m = line.match(/^#####\s+(.+)$/)))  { reset(); pushAtom({ type: 'heading', html: `<h5>${m[1]}</h5>`, meta: { level: 5, text: m[1] } }); continue; }
    if ((m = line.match(/^####\s+(.+)$/)))   { reset(); pushAtom({ type: 'heading', html: `<h4>${m[1]}</h4>`, meta: { level: 4, text: m[1] } }); continue; }
    if ((m = line.match(/^###\s+(.+)$/)))    { reset(); pushAtom({ type: 'heading', html: `<h3>${m[1]}</h3>`, meta: { level: 3, text: m[1] } }); continue; }
    if ((m = line.match(/^##\s+(.+)$/)))     { reset(); pushAtom({ type: 'heading', html: `<h2>${m[1]}</h2>`, meta: { level: 2, text: m[1] } }); continue; }
    if ((m = line.match(/^#\s+(.+)$/)))      { reset(); pushAtom({ type: 'heading', html: `<h1>${m[1]}</h1>`, meta: { level: 1, text: m[1] } }); continue; }

    if ((m = line.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/))) {
      flushText(); flushQuote(); flushImages();
      if (listType !== 'checklist') { closeList(); listType = 'checklist'; }
      const checked = m[1].toLowerCase() === 'x';
      const cls = checked ? 'check checked' : 'check';
      const textCls = checked ? 'text done' : 'text';
      listItems.push(`<li><span class="${cls}"></span><span class="${textCls}">${m[2]}</span></li>`);
      continue;
    }
    if ((m = line.match(/^[-*+]\s+(.+)$/))) {
      flushText(); flushQuote(); flushImages();
      if (listType !== 'ul') { closeList(); listType = 'ul'; }
      listItems.push(`<li>${m[1]}</li>`); continue;
    }
    if ((m = line.match(/^\d+\.\s+(.+)$/))) {
      flushText(); flushQuote(); flushImages();
      if (listType !== 'ol') { closeList(); listType = 'ol'; }
      listItems.push(`<li>${m[1]}</li>`); continue;
    }
    if (line.startsWith('&gt;')) {
      flushText(); closeList(); flushImages();
      quoteBuf.push(line.replace(/^&gt;\s?/, '')); continue;
    }
    if (/^(---|\*\*\*|___)$/.test(line)) {
      reset(); pushAtom({ type: 'hr', html: '<hr>' }); continue;
    }
    if (/^<img\s[^>]*>$/.test(line)) {
      flushText(); flushQuote(); closeList();
      imageBuf.push(line); continue;
    }
    if (/^<(hr|pre|blockquote|ul|ol)\b/i.test(line)) {
      reset(); pushAtom({ type: 'block', html: line }); continue;
    }
    flushQuote(); closeList(); flushImages();
    buf.push({ text: line, br });
  }
  reset();
  return atoms;
}
function atomsToHtml(atoms) { return atoms.map(a => a.html).join('\n'); }
function mdToHtml(md) { return atomsToHtml(mdToAtoms(md)); }

function firstImage(md) { const m = md && md.match(/!\[[^\]]*\]\(([^)\s]+)\)/); return m ? m[1] : null; }
function firstTitle(md) { const m = md && md.match(/^#\s+(.+)$/m); return m ? m[1].trim() : null; }
function resolveUrl(base, url) {
  if (!url) return '';
  if (/^(https?:)?\/\//.test(url)) return url;
  return base + url;
}

// ============ INFO ============
function parseInfo(md) {
  const sections = {};
  let current = null, buffer = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    const t = line.replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim().toLowerCase();
    if (CONFIG.infoKeys.includes(t)) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = t; buffer = [];
    } else if (current) { buffer.push(line); }
  }
  if (current) sections[current] = buffer.join('\n').trim();
  return sections;
}
function getProjects(info) {
  if (!info.portfolio) return [];
  return info.portfolio.replace(/\r\n?/g, '\n').split('\n')
    .map(l => l.replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim())
    .filter(l => l && !l.startsWith('#'));
}

// ============ ПРОЕКТЫ ============
async function loadProject(name) {
  const cleanName = name.replace(/[\u00A0\u200B\uFEFF]/g, '').trim();
  const base = `${CONFIG.portfolioBase}${cleanName}/`;
  const result = await fetchProjectFile(base);
  if (!result) return null;
  if (!result.md.trim()) return null;
  return { name: cleanName, base, raw: result.md, title: firstTitle(result.md) || cleanName, image: firstImage(result.md) };
}

// ============ ХЕДЕР/ФУТЕР ============
function renderChrome(info) {
  document.querySelectorAll('body > .header, body > .footer').forEach(el => el.remove());

  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = `
    <p class="description"><a href="#1-2">${info.name || ''}</a></p>
    <p class="description">${info.about || ''}</p>
  `;

  const footer = document.createElement('div');
  footer.className = 'footer';
  footer.innerHTML = `
    <p class="description">${FOOTER.designer.label} <a href="${FOOTER.designer.url}">${FOOTER.designer.name}</a></p>
    <p class="description">${FOOTER.copyright}</p>
  `;

  document.body.appendChild(header);
  document.body.appendChild(footer);
}

// ============ СБОРКА КНИГИ ============
async function renderWholeBook(startPage) {
  const block = document.querySelector('.block');
  if (!block) return;

  const infoMd = await fetchText(CONFIG.info);
  if (infoMd == null) { warn('[info] ❌'); return; }
  const info = parseInfo(infoMd);

  renderChrome(info);

  const photoImg = firstImage(info.photo || '');
  const photoHtml = photoImg ? `<img class="photo" data-src="${resolveUrl(CONFIG.infoBase, photoImg)}" alt="">` : '';
  const heroHtml =
    (photoHtml ? `<div class="photo-wrap">${photoHtml}</div>` : '') +
    (info.name ? `<h1 class="name">${info.name}</h1>` : '') +
    (info.about ? `<p class="about">${info.about}</p>` : '') +
    (info.contacts ? `<div class="contacts">${mdToHtml(info.contacts)}</div>` : '');

  const items = [];
  items.push({ kind: 'home-cover', html: `<div class="hero">${heroHtml}</div>`, footNote: 'описание' });
  items.push({ kind: 'home-toc', html: '' });

  const list = getProjects(info);
  for (const name of list) {
    const p = await loadProject(name);
    if (!p) continue;
    const md = p.raw.replace(
      /(!\[[^\]]*\]\()([^)\s]+)(\))/g,
      (m, a, url, c) => /^(https?:)?\/\//.test(url) ? m : a + p.base + url + c
    );
    const atoms = mdToAtoms(md);
    const heights = await window.Book.measureAtoms(atoms);
    items.push({
      kind: 'note',
      atoms, heights,
      title: p.title,
      footNote: p.title,
      thumb: p.image ? resolveUrl(p.base, p.image) : '',
    });
  }

  const old = block.querySelector('.book-host');
  if (old) old.remove();

  const host = document.createElement('div');
  host.className = 'book-host';
  block.appendChild(host);

  window.__bookLazy = setupLazyFor;

  await window.Book.render(items, host, {
    globalHash: true,
    startPage: startPage || 1,
  });
}

// ============ РОУТИНГ ============
async function route() {
  const hash = location.hash.replace(/^#/, '');
  let startPage = 1;
  if (hash) {
    const nums = hash.split('-').map(Number).filter(n => n > 0);
    if (nums.length) startPage = nums[0];
  }
  await renderWholeBook(startPage);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  const book = document.querySelector('.book');
  if (!book) return;
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return;
  const nums = hash.split('-').map(Number).filter(n => n > 0);
  if (!nums.length) return;
  if (window.Book && window.Book.scrollToPage) {
    window.Book.scrollToPage(nums[0], true);
  }
});

document.addEventListener('DOMContentLoaded', route);

window.mdToAtoms = mdToAtoms;
window.atomsToHtml = atomsToHtml;
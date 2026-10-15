// ============ КОНФИГ ============
const PATHS = {
    info: 'contents/info/info.md',
    infoBase: 'contents/info/',
    portfolioBase: 'contents/portfolio/',
  };
  
  const NOTE_FILENAMES = ['project.md', 'index.md', 'Project.md', 'INDEX.md'];
  
  // ============ ЗАГРУЗЧИК ============
  function looksLikeHtml(t) {
    return /^\s*<(?:!doctype|html)/i.test(t);
  }
  
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
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.send();
    });
  }
  
  async function fetchText(url) {
    try {
      const t = await fetchViaFetch(url);
      console.log('[fetch ✓]', url);
      return t;
    } catch (e1) {
      try {
        const t = await fetchViaXHR(url);
        console.log('[xhr ✓]', url);
        return t;
      } catch (e2) {
        console.warn('[fetch ✗]', url, e1.message, '|', e2.message);
        return null;
      }
    }
  }
  
  async function fetchProjectFile(base) {
    for (const fname of NOTE_FILENAMES) {
      const url = base + fname;
      const md = await fetchText(url);
      if (md != null) return { url, md };
    }
    return null;
  }
  
  // ============ ЛЕНИВАЯ ЗАГРУЗКА (встроенная) ============
  // Никакой дедупликации, никакого .remove(). Просто подгружаем
  // картинки по мере их появления в viewport.
  function setupLazyFor(root) {
    const scope = root || document;
    const els = scope.querySelectorAll('img[data-src], video[data-src]');
    els.forEach(el => {
      if (el.dataset.lazyInit === '1') return;
      el.dataset.lazyInit = '1';
  
      const src = el.getAttribute('data-src');
      if (!src) return;
  
      const load = () => {
        el.src = src;
        el.removeAttribute('data-src');
        el.classList.add('loaded');
      };
  
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              load();
              io.unobserve(entry.target);
            }
          });
        }, { rootMargin: '200px' });
        io.observe(el);
      } else {
        load();
      }
    });
  }
  
  // ============ MARKDOWN → HTML ============
  function mdToHtml(md) {
    if (!md) return '';
    let html = md;
  
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img data-src="$2" alt="$1">');
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      if (/^(javascript|data):/i.test(u)) return t;
      return `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
    });
  
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm,  '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm,   '<h1>$1</h1>');
  
    return html
      .split(/\n\s*\n/)
      .map(b => b.trim())
      .filter(Boolean)
      .map(b => /^<(h[123]|img|ul|ol|blockquote|a)/.test(b)
        ? b
        : `<p>${b.replace(/\n/g, '<br>')}</p>`)
      .join('\n');
  }
  
  function firstImage(md) {
    const m = md && md.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
    return m ? m[1] : null;
  }
  
  function firstTitle(md) {
    const m = md && md.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : null;
  }
  
  function resolveUrl(base, url) {
    if (!url) return '';
    if (/^(https?:)?\/\//.test(url)) return url;
    return base + url;
  }
  
  // ============ INFO ============
  const INFO_KEYS = ['photo', 'name', 'about', 'contacts', 'portfolio'];
  
  function parseInfo(md) {
    const sections = {};
    let current = null;
    let buffer = [];
  
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    for (const line of lines) {
      const t = line.replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim().toLowerCase();
      if (INFO_KEYS.includes(t)) {
        if (current) sections[current] = buffer.join('\n').trim();
        current = t;
        buffer = [];
      } else if (current) {
        buffer.push(line);
      }
    }
    if (current) sections[current] = buffer.join('\n').trim();
    return sections;
  }
  
  function getProjects(info) {
    if (!info.portfolio) {
      console.warn('[portfolio] нет секции portfolio');
      return [];
    }
    const list = info.portfolio
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(l => l.replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim())
      .filter(l => l && !l.startsWith('#'));
  
    console.log('[portfolio] список:', JSON.stringify(list));
    return list;
  }
  
  async function renderInfo(info) {
    const root = document.getElementById('info');
    if (!root) return;
  
    let html = '';
    if (info.photo) {
      const img = firstImage(info.photo);
      if (img) {
        html += `<img class="photo" data-src="${resolveUrl(PATHS.infoBase, img)}" alt="">`;
      }
    }
    if (info.name)     html += `<h2 class="name">${info.name}</h2>`;
    if (info.about)    html += `<div class="about">${mdToHtml(info.about)}</div>`;
    if (info.contacts) html += `<div class="contacts">${mdToHtml(info.contacts)}</div>`;
  
    root.innerHTML = html;
    setupLazyFor(root);
  }
  
  // ============ ПОРТФОЛИО ============
  async function loadProject(name) {
    const cleanName = name.replace(/[\u00A0\u200B\uFEFF]/g, '').trim();
    const base = `${PATHS.portfolioBase}${cleanName}/`;
  
    console.log(`[portfolio] грузлю "${cleanName}" → ${base}`);
  
    const result = await fetchProjectFile(base);
    if (!result) {
      console.warn(`[portfolio] ❌ не найден файл в ${base}`);
      return null;
    }
    if (!result.md.trim()) {
      console.warn(`[portfolio] ⚠️ пусто: ${result.url}`);
      return null;
    }
  
    console.log(`[portfolio] ✓ ${cleanName}: ${result.url}`);
    return {
      name: cleanName,
      base,
      raw: result.md,
      title: firstTitle(result.md) || cleanName,
      image: firstImage(result.md),
    };
  }
  
  async function renderPortfolio(info) {
    const root = document.getElementById('portfolio');
    if (!root) return;
    root.innerHTML = '';
  
    const list = getProjects(info);
    if (!list.length) return;
  
    const projects = [];
    for (const name of list) {
      try {
        const p = await loadProject(name);
        projects.push(p);
      } catch (e) {
        console.warn(`[portfolio] ошибка на "${name}":`, e);
        projects.push(null);
      }
    }
  
    const ok = projects.filter(Boolean);
    console.log(`[portfolio] ИТОГО: ${ok.length} из ${list.length}`);
  
    for (const p of ok) {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = `#/${p.name}`;
  
      const img = p.image
        ? `<img class="card-image" data-src="${resolveUrl(p.base, p.image)}" alt="">`
        : '<div class="card-image"></div>';
  
      card.innerHTML = `${img}<h3 class="card-title">${p.title}</h3>`;
      root.appendChild(card);
    }
  
    setupLazyFor(root);
  }
  
  // ============ ЗАМЕТКА ============
  async function renderNote(name) {
    const content = document.querySelector('.content');
    if (!content) return;
  
    const p = await loadProject(name);
    if (!p) {
      content.innerHTML = `<p>Заметка не найдена</p>`;
      return;
    }
  
    const md = p.raw.replace(
      /(!\[[^\]]*\]\()([^)\s]+)(\))/g,
      (m, a, url, c) => /^(https?:)?\/\//.test(url) ? m : a + p.base + url + c
    );
  
    content.innerHTML = `
      <div class="note">
        <a class="back" href="#/">← назад</a>
        ${mdToHtml(md)}
      </div>
    `;
  
    setupLazyFor(content);
  }
  
  // ============ РОУТИНГ ============
  async function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const content = document.querySelector('.content');
    if (!content) return;
  
    console.log('[route]', hash || '(главная)');
  
    if (hash) {
      await renderNote(hash);
      return;
    }
  
    content.innerHTML = `
      <div class="info" id="info"></div>
      <div class="portfolio" id="portfolio"></div>
    `;
  
    const infoMd = await fetchText(PATHS.info);
    if (infoMd == null) {
      console.warn('[info] ❌ info.md не загрузился');
      return;
    }
    const info = parseInfo(infoMd);
    console.log('[info] секции:', Object.keys(info));
  
    await renderInfo(info);
    await renderPortfolio(info);
  }
  
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', route);
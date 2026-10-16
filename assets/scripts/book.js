(function () {
    'use strict';
  
    const SPREAD_W = 1000;
    const SPREAD_H = 618;
    const PAGE_W = 500;
    const PAGE_H = 618;
    const MOBILE_BREAK = 1000;
    const SAFETY = 8;
    const FOOT_H = 40;
  
    // full-страницы — стиль page.full (padding:0, футер абсолютный)
    const FULL_TEMPLATES = ['image-full', 'image-pair', 'image-cover'];
    // инверсия футера — только cover (там фон — изображение)
    const INVERT_TEMPLATES = ['image-cover'];
  
    let measureEl = null;
    let bookEl = null;
    let pages = [];
    let spreads = [];
    let currentPage = 1;
    let scrollScheduled = false;
  
    function galleryOpen() {
      return !!document.querySelector('.gallery:not([hidden])');
    }
  
    function getMeasureEl() {
      if (measureEl) return measureEl;
      const block = document.createElement('div');
      block.className = 'block';
      block.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
      const book = document.createElement('div');
      book.className = 'book';
      book.style.cssText = 'position:static;display:block;overflow:visible;padding:0;--book-k:1;';
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.style.cssText = 'position:static;display:block;width:auto;height:auto;';
      const spread = document.createElement('div');
      spread.className = 'spread';
      spread.style.cssText = 'position:static;display:block;transform:none;width:500px;height:auto;';
      const page = document.createElement('div');
      page.className = 'page bg-white t-black';
      page.style.cssText = 'display:block;overflow:visible;height:auto;width:500px;';
      spread.appendChild(page);
      slot.appendChild(spread);
      book.appendChild(slot);
      block.appendChild(book);
      document.body.appendChild(block);
      measureEl = page;
      return measureEl;
    }
  
    function prepareForMeasure(html) { return html.replace(/data-src="/g, 'src="'); }
  
    async function waitImgs(root) {
      const imgs = root.querySelectorAll('img');
      await Promise.all([...imgs].map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => { img.onload = img.onerror = () => res(); });
      }));
    }
  
    function pagePadding() {
      const el = getMeasureEl();
      const cs = getComputedStyle(el);
      return {
        top: parseFloat(cs.paddingTop) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        gap: parseFloat(cs.rowGap || cs.gap) || 0,
      };
    }
  
    function getContentHeight() {
      const p = pagePadding();
      return PAGE_H - p.top - p.bottom - FOOT_H - SAFETY;
    }
  
    async function measureAtoms(atoms) {
      const el = getMeasureEl();
      el.innerHTML = '';
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
  
      const nodes = [];
      for (const atom of atoms) {
        const content = document.createElement('div');
        content.className = 'content';
        content.style.cssText =
          'overflow:visible;flex:0 0 auto;min-height:auto;height:auto;' +
          'display:block;padding:0;margin:0;gap:0;';
        content.innerHTML = prepareForMeasure(atom.html);
        el.appendChild(content);
        nodes.push(content);
      }
      await waitImgs(el);
      const heights = nodes.map(n => n.offsetHeight);
      el.innerHTML = '';
      return heights;
    }
  
    // ============ НОРМАЛИЗАЦИЯ ============
    function normalizeImages(atoms) {
      const out = [];
      for (let i = 0; i < atoms.length; i++) {
        const atom = atoms[i];
        if (atom.type === 'image') {
          const group = [atom.html];
          let j = i + 1;
          while (j < atoms.length && atoms[j].type === 'image') {
            group.push(atoms[j].html);
            j++;
          }
          if (group.length === 1) {
            out.push({
              type: 'image',
              html: group[0],
              meta: Object.assign({}, atom.meta || {}, { count: 1 }),
            });
          } else {
            out.push({
              type: 'images',
              html: `<div class="images" data-count="${group.length}">${group.join('')}</div>`,
              meta: Object.assign({}, atom.meta || {}, { count: group.length }),
            });
          }
          i = j - 1;
        } else {
          out.push(atom);
        }
      }
      return out;
    }
  
    // ============ ПРАВИЛА ============
    function preprocess(atoms) {
      const cfg = window.CONFIG || {};
      const gridMin = cfg.gridMin ?? 6;
      const listMin = cfg.longListMin ?? 5;
  
      const normalized = normalizeImages(atoms);
      const out = [];
      let standaloneImgSeen = 0;
  
      for (let i = 0; i < normalized.length; i++) {
        const atom = normalized[i];
        const copy = Object.assign({}, atom);
        let special = null;
  
        if (
          i === 0 &&
          atom.type === 'image' &&
          normalized[1] &&
          normalized[1].type === 'heading' &&
          normalized[1].meta && normalized[1].meta.level === 1
        ) {
          const h1 = normalized[1];
          copy.type = 'block';
          copy.html = `<div class="cover-stack">${atom.html}<h1>${h1.meta.text || ''}</h1></div>`;
          copy._special = 'image-cover';
          copy.meta = Object.assign({}, copy.meta, { count: 1, hasTitle: true });
          out.push(copy);
          i++;
          continue;
        }
  
        if (i === 0 && atom.type === 'image') {
          copy._special = 'image-cover';
          copy.meta = Object.assign({}, copy.meta, { count: 1, hasTitle: false });
          out.push(copy);
          continue;
        }
  
        if (atom.type === 'image') {
          standaloneImgSeen++;
          special = (standaloneImgSeen === 1) ? 'image-full' : 'image-cover';
          if (special === 'image-cover') {
            copy.meta = Object.assign({}, copy.meta, { count: 1, hasTitle: false });
          }
        } else if (atom.type === 'images') {
          const ic = (atom.meta && atom.meta.count) || 0;
          if (ic === 2) special = 'image-pair';
          else if (ic >= 3 && ic <= 5) special = null;
          else if (ic >= gridMin) special = 'image-grid';
        } else if (atom.type === 'quote') {
          special = 'quote-centered';
        } else if (atom.type === 'code') {
          special = 'code-single';
        } else if (atom.type === 'heading' && atom.meta && atom.meta.level === 1) {
          special = 'heading-single';
        } else if (
          (atom.type === 'ul' || atom.type === 'ol' || atom.type === 'checklist') &&
          atom.meta && atom.meta.count > listMin
        ) {
          special = 'list-top';
        }
  
        // Захват предыдущего абзаца/заголовка (кроме h1) к list-top,
        // если перед списком НЕ было пустой строки.
        if (special === 'list-top') {
          const gap = (atom.meta && atom.meta._gap) || 0;
          const prev = out[out.length - 1];
          const prevOk =
            prev &&
            !prev._special &&
            (prev.type === 'paragraph' ||
             (prev.type === 'heading' && prev.meta && prev.meta.level > 1));
          if (prevOk && gap === 0) {
            out.pop();
            copy.html = prev.html + copy.html;
          }
        }
  
        copy._special = special;
        out.push(copy);
      }
      return out;
    }
  
    async function packAtoms(atoms, heights) {
      const cfg = window.CONFIG || {};
      const perPage = cfg.gridPerPage ?? 24;
  
      const preprocessed = preprocess(atoms);
  
      // перемер после preprocess (склейка абзац+список)
      const newHeights = await measureAtoms(preprocessed);
  
      const remaining = preprocessed.map((a, i) => Object.assign({}, a, { _h: newHeights[i] }));
      const result = [];
      const p = pagePadding();
      const gap = p.gap;
      const maxH = getContentHeight();
  
      while (remaining.length) {
        const atom = remaining[0];
  
        if (atom._special === 'image-grid') {
          const imgs = atom.html.match(/<img\s[^>]*>/g) || [];
          let i = 0;
          while (i < imgs.length) {
            const chunk = imgs.slice(i, i + perPage);
            result.push({
              template: 'image-grid',
              atoms: [{
                type: 'images',
                html: `<div class="images" data-count="${chunk.length}">${chunk.join('')}</div>`,
                meta: { count: chunk.length },
              }],
            });
            i += perPage;
          }
          remaining.shift();
          continue;
        }
  
        if (atom._special) {
          result.push({ template: atom._special, atoms: [atom] });
          remaining.shift();
          continue;
        }
  
        const page = [];
        let h = 0;
        for (let i = 0; i < remaining.length; i++) {
          const a = remaining[i];
          if (i > 0 && a._special) break;
          const extra = page.length ? gap + a._h : a._h;
          if (h + extra > maxH && page.length) break;
          page.push(a);
          h += extra;
        }
        result.push({ template: 'text', atoms: page });
        remaining.splice(0, page.length);
      }
      return result;
    }
  
    async function build(noteItems) {
      const allPages = [];
      let tocEntry = null;
      const noteRanges = [];
  
      for (const item of noteItems) {
        if (item.kind === 'home-cover') {
          allPages.push({
            template: 'cover',
            atoms: [{ type: 'block', html: item.html }],
            bg: 'bg-main', fg: 't-white',
            footNote: '',
            noteStartPage: 1,
          });
        } else if (item.kind === 'home-toc') {
          tocEntry = { index: allPages.length };
          allPages.push({
            template: 'toc',
            atoms: [{ type: 'block', html: '' }],
            bg: 'bg-white', fg: 't-black',
            footNote: '',
            noteStartPage: 2,
          });
        } else if (item.kind === 'note') {
          const notePages = await packAtoms(item.atoms, item.heights);
          const startIdx = allPages.length;
          for (let i = 0; i < notePages.length; i++) {
            allPages.push({
              template: notePages[i].template,
              atoms: notePages[i].atoms,
              bg: 'bg-white', fg: 't-black',
              footNote: item.footNote || '',
              noteStartPage: startIdx + 1,
            });
          }
  
          if (allPages.length % 2 === 1) {
            const flowers = (window.CONFIG && window.CONFIG.flowers) || ['✿'];
            const ch = flowers[Math.floor(Math.random() * flowers.length)];
            allPages.push({
              template: 'quote-centered',
              atoms: [{ type: 'block', html: `<p class="flower">${ch}</p>` }],
              bg: 'bg-white', fg: 't-black',
              footNote: '',
              noteStartPage: 0,
            });
          }
  
          noteRanges.push({
            title: item.title,
            thumb: item.thumb || '',
            startPage: startIdx + 1,
          });
        }
      }
  
      if (tocEntry) {
        const rows = noteRanges.map(r => {
          const thumb = r.thumb
            ? `<img class="thumb" data-src="${r.thumb}" alt="">`
            : '<div class="thumb"></div>';
          return `<a class="row" href="#${r.startPage}-${r.startPage + 1}">` +
            `<span class="thumb-wrap">${thumb}</span>` +
            `<span class="row-text"><span class="row-name">${r.title}</span><span class="row-page">(${r.startPage})</span></span>` +
          `</a>`;
        }).join('');
        const tocHtml = `<h2 class="toc-title">проекты</h2><div class="list">${rows}</div>`;
        allPages[tocEntry.index].atoms = [{ type: 'block', html: tocHtml }];
      }
  
      pages = allPages;
      spreads = [];
      for (let i = 0; i < pages.length; i += 2) {
        spreads.push({ left: pages[i], right: pages[i + 1] || null });
      }
      return spreads;
    }
  
    function buildDom() {
      bookEl = document.createElement('div');
      bookEl.className = 'book';
  
      for (let sIdx = 0; sIdx < spreads.length; sIdx++) {
        const spread = spreads[sIdx];
        const slot = document.createElement('div');
        slot.className = 'slot';
  
        const spreadEl = document.createElement('div');
        spreadEl.className = 'spread';
  
        [spread.left, spread.right].forEach((page, pIdx) => {
          const pageEl = document.createElement('div');
          if (page) {
            const isFull = FULL_TEMPLATES.includes(page.template);
            const hasTitle = page.atoms && page.atoms[0] && page.atoms[0].meta && page.atoms[0].meta.hasTitle;
            let cls = 'page ' + (page.bg || 'bg-white') + ' ' + (page.fg || 't-black') + ' ' + (page.template || 'text');
            if (isFull) cls += ' full';
            if (page.template === 'image-cover') cls += hasTitle ? ' has-title' : ' no-title';
            pageEl.className = cls;
            const foot = renderBottom(page, sIdx * 2 + pIdx + 1, pIdx === 0 ? 'left' : 'right');
            pageEl.innerHTML = `<div class="content">${page.atoms.map(a => a.html).join('')}</div>${foot}`;
          } else {
            pageEl.className = 'page bg-white t-black empty';
            pageEl.innerHTML = '<div class="content"></div><div class="bottom"></div>';
          }
          spreadEl.appendChild(pageEl);
        });
  
        slot.appendChild(spreadEl);
        bookEl.appendChild(slot);
      }
  
      return bookEl;
    }
  
    function renderBottom(page, pageNum, side) {
      const showNum = pages.length > 2;
      const num = showNum ? `<span class="navigation num">${pageNum}</span>` : '';
      // инвертируем футер ТОЛЬКО у cover
      const invert = INVERT_TEMPLATES.includes(page.template);
      const invertCls = invert ? ' invert' : '';
  
      if (side === 'left') {
        const foot = page.footNote;
        const startP = page.noteStartPage;
        if (foot && startP) {
          return `<div class="bottom${invertCls}">${num}<a class="navigation title" href="#${startP}-${startP + 1}">${foot}</a></div>`;
        }
        return `<div class="bottom${invertCls}">${num}</div>`;
      }
      return `<div class="bottom${invertCls}"><span></span>${num}</div>`;
    }
  
    function updateScale() {
      const rootStyle = getComputedStyle(document.documentElement);
      const isMobile = window.innerWidth < MOBILE_BREAK;
  
      const scaleVar = isMobile
        ? rootStyle.getPropertyValue('--book-page-scale-mobile')
        : rootStyle.getPropertyValue('--book-page-scale-desktop');
      const scale = parseFloat(scaleVar) || 0.8;
  
      let k;
      if (isMobile) {
        k = Math.min(
          (window.innerWidth * scale) / PAGE_W,
          (window.innerHeight * scale) / PAGE_H
        );
      } else {
        k = Math.min(
          (window.innerWidth * scale) / SPREAD_W,
          (window.innerHeight * scale) / SPREAD_H
        );
      }
      document.documentElement.style.setProperty('--book-k', k);
    }
  
    function scrollToPage(pageNum, smooth) {
      if (pageNum < 1 || pageNum > pages.length) return;
      currentPage = pageNum;
      const isMobile = window.innerWidth < MOBILE_BREAK;
  
      if (isMobile) {
        const allPages = bookEl.querySelectorAll('.page');
        const target = allPages[pageNum - 1];
        if (!target) return;
        const targetRect = target.getBoundingClientRect();
        const bookRect = bookEl.getBoundingClientRect();
        const delta = (targetRect.left + targetRect.width / 2) - (bookRect.left + bookRect.width / 2);
        bookEl.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
      } else {
        const slotIdx = Math.floor((pageNum - 1) / 2);
        const slot = bookEl.children[slotIdx];
        if (!slot) return;
        const offset = slot.offsetLeft - (bookEl.clientWidth - slot.offsetWidth) / 2;
        bookEl.scrollTo({ left: offset, behavior: smooth ? 'smooth' : 'auto' });
      }
      updateHash();
    }
  
    function updateHash() {
      if (!window.__bookGlobalHash) return;
      const pageL = currentPage % 2 === 0 ? currentPage - 1 : currentPage;
      const h = '#' + pageL + '-' + (pageL + 1);
      if (location.hash !== h) history.replaceState(null, '', h);
    }
  
    function computeNearest() {
      const isMobile = window.innerWidth < MOBILE_BREAK;
      const bookRect = bookEl.getBoundingClientRect();
      const centerX = bookRect.left + bookRect.width / 2;
      let nearest = 1, minDist = Infinity;
  
      if (isMobile) {
        const allPages = bookEl.querySelectorAll('.page');
        allPages.forEach((page, i) => {
          const r = page.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - centerX);
          if (d < minDist) { minDist = d; nearest = i + 1; }
        });
      } else {
        const slots = bookEl.querySelectorAll('.slot');
        slots.forEach((slot, i) => {
          const r = slot.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - centerX);
          if (d < minDist) { minDist = d; nearest = i * 2 + 1; }
        });
      }
      return nearest;
    }
  
    function onScroll() {
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(() => {
        scrollScheduled = false;
        const nearest = computeNearest();
        if (nearest !== currentPage) {
          currentPage = nearest;
          updateHash();
        }
      });
    }
  
    function next() {
      if (galleryOpen()) return;
      const isMobile = window.innerWidth < MOBILE_BREAK;
      if (isMobile) {
        if (currentPage >= pages.length) return;
        scrollToPage(currentPage + 1, true);
      } else {
        const curSpread = Math.floor((currentPage - 1) / 2);
        const nextStart = (curSpread + 1) * 2 + 1;
        if (nextStart > pages.length) return;
        scrollToPage(nextStart, true);
      }
    }
  
    function prev() {
      if (galleryOpen()) return;
      const isMobile = window.innerWidth < MOBILE_BREAK;
      if (isMobile) {
        if (currentPage <= 1) return;
        scrollToPage(currentPage - 1, true);
      } else {
        const curSpread = Math.floor((currentPage - 1) / 2);
        const prevStart = (curSpread - 1) * 2 + 1;
        if (prevStart < 1) return;
        scrollToPage(prevStart, true);
      }
    }
  
    function onZoneClick(e) {
      if (galleryOpen()) return;
      if (spreads.length <= 1) return;
      if (e.target.closest('a')) return;
      if (e.target.closest('img')) return;
      const r = bookEl.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x > 0.88) next();
      else if (x < 0.12) prev();
    }
  
    let wheelLock = false;
    function onWheel(e) {
      if (galleryOpen()) return;
      if (wheelLock) return;
      const absY = Math.abs(e.deltaY);
      const absX = Math.abs(e.deltaX);
      if (absY < 20 && absX < 20) return;
      const dir = absY > absX ? (e.deltaY > 0 ? 1 : -1) : (e.deltaX > 0 ? 1 : -1);
      if (dir > 0) next(); else prev();
      wheelLock = true;
      setTimeout(() => { wheelLock = false; }, 500);
    }
  
    function onKey(e) {
      if (galleryOpen()) return;
      if (!document.querySelector('.book')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
    }
  
    async function render(noteItems, container, opts) {
      opts = opts || {};
      window.__bookGlobalHash = opts.globalHash !== false;
  
      await build(noteItems);
      const dom = buildDom();
      container.innerHTML = '';
      container.appendChild(dom);
  
      let startPage = opts.startPage || 1;
      if (startPage < 1) startPage = 1;
      if (startPage > pages.length) startPage = pages.length;
      if (window.innerWidth >= MOBILE_BREAK) {
        startPage = Math.floor((startPage - 1) / 2) * 2 + 1;
      }
      currentPage = startPage;
  
      updateScale();
      requestAnimationFrame(() => scrollToPage(currentPage, false));
  
      bookEl.addEventListener('scroll', onScroll, { passive: true });
      bookEl.addEventListener('click', onZoneClick);
      bookEl.addEventListener('wheel', onWheel, { passive: false });
  
      if (!render._bound) {
        render._bound = true;
        window.addEventListener('resize', () => {
          updateScale();
          setTimeout(() => scrollToPage(currentPage, false), 100);
        });
        document.addEventListener('keydown', onKey);
      }
  
      if (window.__bookLazy) window.__bookLazy(container);
    }
  
    window.Book = {
      render: render,
      measureAtoms: measureAtoms,
      build: build,
      updateScale: updateScale,
      scrollToPage: function (n, smooth) { if (bookEl) scrollToPage(n, smooth); },
      getCurrentPage: function () { return currentPage; },
      getBookEl: function () { return bookEl; },
    };
  })();
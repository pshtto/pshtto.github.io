(function () {
    'use strict';
  
    const SWIPE_THRESHOLD = 40;
  
    let galleryEl = null;
    let trackEl = null;
    let imgs = [];
    let slides = [];
    let currentReal = 0;
    let isOpen = false;
    let suppressClick = false;
    let animating = false;
  
    function getSrc(img) {
      return img.getAttribute('data-src') || img.currentSrc || img.src || '';
    }
  
    function collectImgs() {
      const out = [];
      for (const img of document.querySelectorAll('img')) {
        if (img.closest('.gallery')) continue;
        if (img.classList.contains('photo')) continue;
        out.push(img);
      }
      return out;
    }
  
    function build() {
      galleryEl = document.createElement('div');
      galleryEl.className = 'gallery';
      galleryEl.hidden = true;
  
      trackEl = document.createElement('div');
      trackEl.className = 'track';
      galleryEl.appendChild(trackEl);
  
      ['prev', 'current', 'next'].forEach(pos => {
        const z = document.createElement('div');
        z.className = 'zone ' + pos;
        z.dataset.zone = pos;
        galleryEl.appendChild(z);
      });
  
      document.body.appendChild(galleryEl);
    }
  
    function buildSlides() {
      trackEl.innerHTML = '';
      slides = [];
      const n = imgs.length;
      const order = [];
      if (n > 1) order.push(n - 1);
      for (let i = 0; i < n; i++) order.push(i);
      if (n > 1) order.push(0);
  
      order.forEach(realIdx => {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.index = realIdx;
        const img = document.createElement('img');
        img.alt = '';
        img.src = getSrc(imgs[realIdx]);
        slot.appendChild(img);
        trackEl.appendChild(slot);
        slides.push(slot);
      });
    }
  
    function slotIndexFromReal(realIdx) {
      if (imgs.length <= 1) return 0;
      return realIdx + 1;
    }
  
    function realFromSlotIndex(idx) {
      return parseInt(slides[idx].dataset.index, 10);
    }
  
    function scrollToSlot(idx, smooth) {
      const slot = slides[idx];
      if (!slot) return;
      const left = slot.offsetLeft - (trackEl.clientWidth - slot.offsetWidth) / 2;
      trackEl.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    }
  
    function currentSlotIndex() {
      const r = trackEl.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      let nearest = 0, minD = Infinity;
      slides.forEach((s, i) => {
        const sr = s.getBoundingClientRect();
        const d = Math.abs(sr.left + sr.width / 2 - centerX);
        if (d < minD) { minD = d; nearest = i; }
      });
      return nearest;
    }
  
    function open(idx) {
      imgs = collectImgs();
      if (imgs.length === 0) return;
      if (idx < 0 || idx >= imgs.length) idx = 0;
  
      currentReal = idx;
      buildSlides();
  
      galleryEl.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      isOpen = true;
  
      requestAnimationFrame(() => {
        const slideIdx = slotIndexFromReal(idx);
        scrollToSlot(slideIdx, false);
      });
    }
  
    function close() {
      if (!isOpen) return;
      isOpen = false;
      galleryEl.hidden = true;
      trackEl.innerHTML = '';
      slides = [];
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
  
    function navigate(dir) {
      if (imgs.length <= 1) return;
      if (animating) return;
      animating = true;
  
      const cur = currentSlotIndex();
      const target = cur + dir;
      if (target < 0 || target >= slides.length) {
        animating = false;
        return;
      }
  
      scrollToSlot(target, true);
      currentReal = realFromSlotIndex(target);
  
      clearTimeout(navigate._t);
      navigate._t = setTimeout(() => {
        animating = false;
        const ci = currentSlotIndex();
        const n = imgs.length;
        if (ci === 0) {
          scrollToSlot(n, false);
          currentReal = realFromSlotIndex(n);
        } else if (ci === slides.length - 1) {
          scrollToSlot(1, false);
          currentReal = realFromSlotIndex(1);
        }
      }, 450);
    }
  
    // ---- обработчики ----
  
    let tX = 0, tY = 0, touchStarted = false;
  
    function onTouchStart(e) {
      if (!isOpen) return;
      if (e.touches.length !== 1) return;
      tX = e.touches[0].clientX;
      tY = e.touches[0].clientY;
      touchStarted = true;
    }
  
    function onTouchEnd(e) {
      if (!touchStarted) return;
      touchStarted = false;
      const dx = e.changedTouches[0].clientX - tX;
      const dy = e.changedTouches[0].clientY - tY;
      const adx = Math.abs(dx), ady = Math.abs(dy);
  
      if (ady > SWIPE_THRESHOLD && ady > adx) {
        suppressClick = true;
        navigate(dy < 0 ? 1 : -1);
        return;
      }
      if (adx > SWIPE_THRESHOLD && adx > ady) {
        suppressClick = true;
        navigate(dx < 0 ? 1 : -1);
        return;
      }
      if (adx > 8 || ady > 8) suppressClick = true;
    }
  
    function onClick(e) {
      if (suppressClick) { suppressClick = false; return; }
  
      if (galleryEl && galleryEl.contains(e.target)) {
        const zone = e.target.closest('.zone');
        if (zone) {
          const pos = zone.dataset.zone;
          if (pos === 'current') close();
          else if (pos === 'next') navigate(1);
          else if (pos === 'prev') navigate(-1);
        }
        return;
      }
  
      const img = e.target.closest('img');
      if (!img) return;
      if (img.classList.contains('photo')) return;
      if (img.closest('a')) return;
  
      const all = collectImgs();
      const idx = all.indexOf(img);
      if (idx === -1) return;
  
      open(idx);
    }
  
    function onKey(e) {
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); navigate(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); navigate(-1); }
    }
  
    let wheelLock = false;
    function onWheel(e) {
      if (!isOpen) return;
      if (wheelLock) return;
      const absY = Math.abs(e.deltaY);
      const absX = Math.abs(e.deltaX);
      if (absY < 20 && absX < 20) return;
      e.preventDefault();
      const dir = absY > absX ? (e.deltaY > 0 ? 1 : -1) : (e.deltaX > 0 ? 1 : -1);
      navigate(dir);
      wheelLock = true;
      setTimeout(() => { wheelLock = false; }, 500);
    }
  
    function init() {
      build();
      document.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchend', onTouchEnd);
      document.addEventListener('wheel', onWheel, { passive: false });
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
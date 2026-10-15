(function() {
  const STORAGE_KEY = 'progressiveImagesLoaded';
  let loadedUrls = new Set();

  try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
          const arr = JSON.parse(stored);
          arr.forEach(url => loadedUrls.add(url));
      }
  } catch (e) {}

  function saveLoadedUrl(url) {
      if (!url) return;
      loadedUrls.add(url);
      try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...loadedUrls]));
      } catch (e) {}
  }

  function isImagePreloaded(url) {
      return loadedUrls.has(url);
  }

  function loadMedia(el) {
      const src = el.getAttribute('data-src');
      if (!src) return;

      if (el.src && el.src.includes(src)) {
          el.classList.add('preloaded');
          el.removeAttribute('data-src');
          return;
      }

      if (isImagePreloaded(src)) {
          el.src = src;
          el.classList.add('preloaded');
          el.classList.remove('loading');
          el.removeAttribute('data-src');
          return;
      }

      el.classList.add('loading');

      if (el.tagName === 'VIDEO') {
          el.src = src;
          
          const onReady = function() {
              el.classList.remove('loading');
              el.classList.add('loaded', 'preloaded');
              el.removeAttribute('data-src');
              saveLoadedUrl(src);
              el.removeEventListener('canplaythrough', onReady);
              el.removeEventListener('loadeddata', onReady);
              el.onerror = null;
          };
          
          el.addEventListener('canplaythrough', onReady);
          el.addEventListener('loadeddata', onReady);
          
          if (el.readyState >= 3) {
              onReady();
          }
          
          el.onerror = function() {
              el.classList.remove('loading');
              el.classList.add('loaded');
              el.removeAttribute('data-src');
              el.onerror = null;
          };
      } else {
          el.src = src;
          
          if (el.complete) {
              el.classList.remove('loading');
              el.classList.add('loaded', 'preloaded');
              el.removeAttribute('data-src');
              saveLoadedUrl(src);
              return;
          }
          
          el.onload = function() {
              el.classList.remove('loading');
              el.classList.add('loaded', 'preloaded');
              el.removeAttribute('data-src');
              saveLoadedUrl(src);
              el.onload = null;
              el.onerror = null;
          };
          
          el.onerror = function() {
              el.classList.remove('loading');
              el.classList.add('loaded');
              el.removeAttribute('data-src');
              el.onload = null;
              el.onerror = null;
          };
      }
  }

  const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
          if (entry.isIntersecting) {
              const el = entry.target;
              if (el.getAttribute('data-src')) {
                  loadMedia(el);
              }
              observer.unobserve(el);
          }
      });
  }, {
      rootMargin: '100px 0px',
      threshold: 0.01
  });

  function init() {
      const elements = document.querySelectorAll('img[data-src], video[data-src]');
      
      elements.forEach(el => {
          const src = el.getAttribute('data-src');
          if (src && isImagePreloaded(src)) {
              loadMedia(el);
          } else {
              observer.observe(el);
          }
      });
  }

  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
  } else {
      init();
  }

  if (window.MutationObserver) {
      const mutationObserver = new MutationObserver((mutations) => {
          mutations.forEach(mutation => {
              mutation.addedNodes.forEach(node => {
                  if (node.nodeType === 1 && node.matches && node.matches('img[data-src], video[data-src]')) {
                      const src = node.getAttribute('data-src');
                      if (src && isImagePreloaded(src)) {
                          loadMedia(node);
                      } else {
                          observer.observe(node);
                      }
                  }
                  if (node.nodeType === 1 && node.querySelectorAll) {
                      node.querySelectorAll('img[data-src], video[data-src]').forEach(el => {
                          const src = el.getAttribute('data-src');
                          if (src && isImagePreloaded(src)) {
                              loadMedia(el);
                          } else {
                              observer.observe(el);
                          }
                      });
                  }
              });
          });
      });
      
      if (document.body) {
          mutationObserver.observe(document.body, {
              childList: true,
              subtree: true
          });
      } else {
          document.addEventListener('DOMContentLoaded', () => {
              mutationObserver.observe(document.body, {
                  childList: true,
                  subtree: true
              });
          });
      }
  }
})();
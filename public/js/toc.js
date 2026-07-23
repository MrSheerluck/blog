(() => {
  function init() {
    var postContent = document.querySelector('.post-content');
    if (!postContent) {
      removeToc();
      return;
    }

    var headings = Array.from(postContent.querySelectorAll('h2, h3'));
    if (headings.length < 2) {
      removeToc();
      return;
    }

    headings.forEach(function (h, i) {
      if (!h.id) {
        h.id = 'heading-' + i + '-' + h.textContent.trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      }
    });

    var toc = document.querySelector('.toc');
    if (!toc) {
      toc = document.createElement('div');
      toc.className = 'toc';
      toc.innerHTML =
        '<div class="toc__bars"></div>' +
        '<div class="toc__panel"><div class="toc__panel-inner"></div></div>';
      document.body.appendChild(toc);
    }

    var barsContainer = toc.querySelector('.toc__bars');
    var panelInner = toc.querySelector('.toc__panel-inner');
    barsContainer.innerHTML = '';
    panelInner.innerHTML = '';

    headings.forEach(function (h, i) {
      var bar = document.createElement('span');
      bar.className = 'toc__bar';
      bar.title = h.textContent;
      bar.addEventListener('click', function () {
        h.scrollIntoView({ behavior: 'smooth' });
      });
      barsContainer.appendChild(bar);

      var item = document.createElement('a');
      item.className = 'toc__item';
      item.href = '#' + h.id;
      item.textContent = h.textContent;
      if (h.tagName === 'H3') {
        item.classList.add('toc__item--sub');
      }
      item.addEventListener('click', function (e) {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth' });
      });
      panelInner.appendChild(item);
    });

    var scrollPending = false;
    function updateActive() {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(function () {
        scrollPending = false;
        var bars = barsContainer.querySelectorAll('.toc__bar');
        var items = panelInner.querySelectorAll('.toc__item');
        var activeIndex = 0;

        headings.forEach(function (h, i) {
          if (h.getBoundingClientRect().top <= 150) {
            activeIndex = i;
          }
        });

        bars.forEach(function (b, i) {
          b.classList.toggle('toc__bar--active', i === activeIndex);
        });

        items.forEach(function (item, i) {
          item.classList.toggle('toc__item--active', i === activeIndex);
        });
      });
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  function removeToc() {
    var toc = document.querySelector('.toc');
    if (toc) toc.remove();
  }

  window.__initToc = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

(function () {
  const cfg = window.__TCG_CATALOG__;
  if (!cfg) return;

  const qs = (sel, el) => (el || document).querySelector(sel);
  const qsa = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  const state = {
    q: '',
    rarities: new Set(),
    elements: new Set(),
    region: '',
    boss: '',
    source: '',
    class: '',
    sort: 'rarity_desc',
    page: 1,
    pageSize: cfg.defaultPageSize || 24,
    total: 0,
    totalPages: 1,
    loading: false,
  };

  let searchTimer = null;

  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function buildQuery() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    state.rarities.forEach((r) => p.append('rarity', r));
    state.elements.forEach((e) => p.append('element', e));
    if (state.region !== '') p.set('region', state.region);
    if (state.boss !== '') p.set('boss', state.boss);
    if (state.source !== '') p.set('source', state.source);
    if (state.class.trim()) p.set('class', state.class.trim());
    p.set('sort', state.sort);
    p.set('page', String(state.page));
    p.set('pageSize', String(state.pageSize));
    return p.toString();
  }

  async function fetchList() {
    state.loading = true;
    qs('#tcgGrid').innerHTML = `<div class="tcg-loading" role="status"><div class="tcg-loading__spinner"></div>Loading catalog…</div>`;

    try {
      const res = await fetch(`/api/tcg/cards?${buildQuery()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.total = data.total;
      state.totalPages = data.totalPages;
      state.page = data.page;

      qs('#tcgTotal').textContent = String(state.total);

      qs('#tcgResultsLine').textContent =
        state.total === 0
          ? 'No cards match.'
          : `Showing ${(state.page - 1) * state.pageSize + 1}–${Math.min(state.page * state.pageSize, state.total)} of ${state.total}`;

      if (!data.items || !data.items.length) {
        qs('#tcgGrid').innerHTML =
          '<div class="tcg-empty"><p>No cards match these filters.</p><p>Try clearing filters or a broader search.</p></div>';
        renderPagination();
        return;
      }

      window.__tcgCardsByUuid = {};
      data.items.forEach((c) => {
        window.__tcgCardsByUuid[c.uuid] = c;
      });

      qs('#tcgGrid').innerHTML = data.items.map((card) => cardThumbHtml(card)).join('');
      qsa('.tcg-card', qs('#tcgGrid')).forEach((el) => {
        el.addEventListener('click', () => openModal(cardByUuid(el.dataset.uuid)));
      });

      renderPagination();
    } catch (e) {
      qs('#tcgGrid').innerHTML = `<div class="tcg-empty"><p>Could not load cards.</p><p>${esc(e.message || 'Error')}</p></div>`;
    } finally {
      state.loading = false;
    }
  }

  function cardByUuid(uuid) {
    return (window.__tcgCardsByUuid && window.__tcgCardsByUuid[uuid]) || null;
  }

  function cardThumbHtml(card) {
    const boss = card.is_boss_card
      ? '<span class="tcg-pill tcg-pill--boss">Boss</span>'
      : '';
    const pillStyle = `background:${esc(card.rarity_color)}`;
    const elIcon = card.element
      ? `<img src="/public/tcg-elements/${esc(card.element)}.png" width="22" height="22" alt="">`
      : '';
    return `
      <article class="tcg-card" data-uuid="${esc(card.uuid)}">
        <img class="tcg-card__img" src="${esc(card.image_url)}" alt="" loading="lazy" width="200" height="300">
        <div class="tcg-card__body">
          <h2 class="tcg-card__name">${esc(card.name)}</h2>
          <div class="tcg-card__meta">
            <span class="tcg-pill" style="${pillStyle}">${esc(card.rarity_label)}</span>
            ${boss}
            <span>${elIcon}</span>
          </div>
        </div>
      </article>`;
  }

  function renderPagination() {
    const el = qs('#tcgPagination');
    if (!el || state.totalPages <= 1) {
      if (el) el.innerHTML = '';
      return;
    }

    const parts = [];
    const maxBtns = 7;
    let start = Math.max(1, state.page - 3);
    let end = Math.min(state.totalPages, start + maxBtns - 1);
    if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);

    parts.push(
      `<button type="button" class="tcg-page-btn" ${state.page <= 1 ? 'disabled' : ''} data-page="${state.page - 1}" aria-label="Previous page">←</button>`,
    );
    for (let i = start; i <= end; i++) {
      parts.push(
        `<button type="button" class="tcg-page-btn${i === state.page ? ' is-current' : ''}" data-page="${i}">${i}</button>`,
      );
    }
    parts.push(
      `<button type="button" class="tcg-page-btn" ${state.page >= state.totalPages ? 'disabled' : ''} data-page="${state.page + 1}" aria-label="Next page">→</button>`,
    );
    el.innerHTML = parts.join('');

    qsa('[data-page]', el).forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const np = Number(btn.dataset.page);
        if (Number.isFinite(np) && np >= 1 && np <= state.totalPages) {
          state.page = np;
          syncUrlUuid(null);
          fetchList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  function openModal(card) {
    if (!card) return;
    const overlay = qs('#tcgModal');
    const img = qs('#tcgModalImg');
    const title = qs('#tcgModalTitle');
    const badges = qs('#tcgModalBadges');
    const desc = qs('#tcgModalDesc');
    const stats = qs('#tcgModalStats');

    img.src = card.image_url;
    img.alt = card.name || 'Card';
    title.textContent = card.name || '—';

    const badgeParts = [];
    badgeParts.push(
      `<span class="tcg-badge" style="color:#0a0e14;background:${esc(card.rarity_color)}">${esc(card.rarity_label)}</span>`,
    );
    if (card.class) badgeParts.push(`<span class="tcg-badge">${esc(card.class)}</span>`);
    if (card.element_label) badgeParts.push(`<span class="tcg-badge">${esc(card.element_label)}</span>`);
    if (card.region_name) badgeParts.push(`<span class="tcg-badge">${esc(card.region_name)}</span>`);
    if (card.is_boss_card) badgeParts.push('<span class="tcg-badge tcg-pill--boss">Boss pool</span>');
    if (card.source) badgeParts.push(`<span class="tcg-badge">Source: ${esc(card.source)}</span>`);
    badges.innerHTML = badgeParts.join('');

    desc.innerHTML = card.description
      ? esc(card.description).replace(/\n/g, '<br>')
      : '<span>(No flavor text)</span>';

    const s = [];
    [['ATK', 'base_atk'], ['DEF', 'base_def'], ['SPD', 'base_spd'], ['HP', 'base_hp'], ['PWR', 'base_power']]
      .forEach(([lbl, key]) => {
        const v = card[key];
        if (v == null) return;
        s.push(`<div class="tcg-stat-cell"><span>${esc(lbl)}</span><strong>${esc(v)}</strong></div>`);
      });
    stats.innerHTML = s.length ? `<div class="tcg-stat-grid">${s.join('')}</div>` : '';

    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    syncUrlUuid(card.uuid);
  }

  function closeModal() {
    qs('#tcgModal').classList.remove('is-open');
    document.body.style.overflow = '';
    syncUrlUuid(null);
  }

  function syncUrlUuid(uuid) {
    const url = new URL(window.location.href);
    if (uuid) url.searchParams.set('uuid', uuid);
    else url.searchParams.delete('uuid');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  function wireFilters() {
    const search = qs('#tcgSearch');
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.q = search.value.trim();
        state.page = 1;
        fetchList();
      }, 320);
    });

    qs('#tcgSort').addEventListener('change', (e) => {
      state.sort = e.target.value;
      state.page = 1;
      fetchList();
    });

    qs('#tcgRegion').addEventListener('change', (e) => {
      state.region = e.target.value;
      state.page = 1;
      fetchList();
    });

    qs('#tcgBoss').addEventListener('change', (e) => {
      state.boss = e.target.value;
      state.page = 1;
      fetchList();
    });

    qs('#tcgSource').addEventListener('change', (e) => {
      state.source = e.target.value;
      state.page = 1;
      fetchList();
    });

    const classIn = qs('#tcgClass');
    let classTimer = null;
    classIn.addEventListener('input', () => {
      clearTimeout(classTimer);
      classTimer = setTimeout(() => {
        state.class = classIn.value;
        state.page = 1;
        fetchList();
      }, 400);
    });

    qsa('.tcg-chip--rarity').forEach((chip) => {
      chip.addEventListener('click', () => {
        const r = chip.dataset.rarity;
        if (state.rarities.has(r)) {
          state.rarities.delete(r);
          chip.classList.remove('is-active');
        } else {
          state.rarities.add(r);
          chip.classList.add('is-active');
        }
        state.page = 1;
        fetchList();
      });
    });

    qsa('.tcg-chip--element').forEach((chip) => {
      chip.addEventListener('click', () => {
        const el = chip.dataset.element;
        if (state.elements.has(el)) {
          state.elements.delete(el);
          chip.classList.remove('is-active');
        } else {
          state.elements.add(el);
          chip.classList.add('is-active');
        }
        state.page = 1;
        fetchList();
      });
    });

    qs('#tcgModalClose').addEventListener('click', closeModal);
    qs('#tcgModal').addEventListener('click', (e) => {
      if (e.target === qs('#tcgModal')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  async function bootstrap() {
    wireFilters();

    const url = new URL(window.location.href);
    const uuid = url.searchParams.get('uuid');

    await fetchList();

    if (uuid) {
      let card = cardByUuid(uuid);
      if (!card) {
        try {
          const res = await fetch(`/api/tcg/cards/${encodeURIComponent(uuid)}`, {
            headers: { Accept: 'application/json' },
          });
          if (res.ok) {
            card = await res.json();
            window.__tcgCardsByUuid = window.__tcgCardsByUuid || {};
            window.__tcgCardsByUuid[card.uuid] = card;
          }
        } catch {
          card = null;
        }
      }
      if (card) openModal(card);
    }
  }

  bootstrap();
})();

/* ─────────────────────────────────────────────
   Discovery — paper search & selection screen
───────────────────────────────────────────── */

const Discovery = (() => {

  let _papers = [];
  let _selected = new Set();
  let _offset = 0;
  let _query = '';

  async function load(topic) {
    _query = topic;
    _papers = [];
    _selected = new Set();
    _offset = 0;
    renderHeader(topic);
    await fetchAndRender(false);
  }

  async function fetchMore() {
    _offset += 20;
    await fetchAndRender(true);
  }

  async function fetchAndRender(append) {
    const list = document.getElementById('discovery-list');

    // Always create a fresh loading indicator (avoids null ref on re-use)
    const loading = document.createElement('div');
    loading.className = 'empty-state';
    loading.style.display = 'flex';
    loading.innerHTML = `<div class="loading-spinner"></div><p>Searching Semantic Scholar…</p>`;

    if (!append) list.innerHTML = '';
    list.appendChild(loading);

    try {
      const results = await API.searchPapers(_query, { limit: 20, offset: _offset });
      loading.remove();

      if (!results.length && !append) {
        list.innerHTML = `
          <div class="empty-state">
            <span class="icon">search_off</span>
            <p>No papers found for "${escHtml(_query)}". Try rephrasing your topic.</p>
          </div>`;
        return;
      }

      results.forEach(paper => {
        if (!_papers.find(p => p.id === paper.id)) {
          _papers.push(paper);
          list.appendChild(buildCard(paper));
        }
      });

      updateImportButton();
    } catch(err) {
      loading.remove();
      console.error('Semantic Scholar error:', err);
      list.innerHTML = `
        <div class="empty-state">
          <span class="icon">wifi_off</span>
          <p>Could not reach Semantic Scholar.<br><span style="font-size:11px;color:var(--color-text-tertiary)">${escHtml(err.message)}</span></p>
        </div>`;
    }
  }

  function buildCard(paper) {
    const card = document.createElement('div');
    card.className = 'paper-card';
    card.dataset.id = paper.id;

    const authors = paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '');
    const year    = paper.year || '—';
    const cites   = paper.citations?.toLocaleString() ?? '—';
    const hasOA   = !!paper.openAccessUrl;

    card.innerHTML = `
      <div class="paper-card__check">
        <input type="checkbox" data-id="${paper.id}" aria-label="Select paper" />
      </div>
      <div class="paper-card__body">
        <div class="paper-card__title">${escHtml(paper.title)}</div>
        <div class="paper-card__meta">
          <span class="paper-card__meta-item">
            <span class="icon">person</span>${escHtml(authors || 'Unknown authors')}
          </span>
          <span class="paper-card__meta-item">
            <span class="icon">calendar_today</span>${year}
          </span>
          <span class="paper-card__meta-item">
            <span class="icon">format_quote</span>${cites} citations
          </span>
          ${hasOA ? `<span class="badge badge--primary" style="margin-left:auto">Open Access</span>` : ''}
        </div>
        <div class="paper-card__abstract">${escHtml(paper.abstract || 'No abstract available.')}</div>
        ${paper.abstract && paper.abstract.length > 200 ? `
          <button class="paper-card__expand" data-expanded="false">Show more</button>
        ` : ''}
        ${hasOA ? `
          <div class="paper-card__oa">
            <a href="${escHtml(paper.openAccessUrl)}" target="_blank" class="btn btn--ghost btn--sm" style="font-size:11px">
              <span class="icon icon--sm">open_in_new</span>View PDF
            </a>
          </div>` : ''}
      </div>
    `;

    // Checkbox
    const checkbox = card.querySelector('input[type=checkbox]');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        _selected.add(paper.id);
        card.classList.add('selected');
      } else {
        _selected.delete(paper.id);
        card.classList.remove('selected');
      }
      updateImportButton();
    });

    // Expand abstract
    const expandBtn = card.querySelector('.paper-card__expand');
    if (expandBtn) {
      expandBtn.addEventListener('click', e => {
        e.stopPropagation();
        const abstract = card.querySelector('.paper-card__abstract');
        const expanded = expandBtn.dataset.expanded === 'true';
        abstract.classList.toggle('expanded', !expanded);
        expandBtn.textContent = expanded ? 'Show more' : 'Show less';
        expandBtn.dataset.expanded = !expanded;
      });
    }

    return card;
  }

  function updateImportButton() {
    const btn   = document.getElementById('discovery-import');
    const badge = document.getElementById('selected-count');
    badge.textContent = _selected.size;
    btn.disabled = _selected.size === 0;
  }

  function renderHeader(topic) {
    document.getElementById('discovery-topic-label').textContent = topic.slice(0, 80);
    document.getElementById('discovery-heading').textContent = 'Papers found';
  }

  async function importSelected() {
    const toImport = _papers.filter(p => _selected.has(p.id));
    if (!toImport.length) return;

    // Try to enrich with Unpaywall if no OA URL
    const enriched = await Promise.all(toImport.map(async p => {
      if (!p.openAccessUrl && p.doi) {
        const url = await API.findOpenAccessPDF(p.doi);
        return { ...p, openAccessUrl: url };
      }
      return p;
    }));

    State.addPapers(enriched);
    App.showScreen('workspace');
    Workspace.init();
  }

  function init() {
    document.getElementById('discovery-back').addEventListener('click', () => {
      App.showScreen('onboarding');
    });

    document.getElementById('discovery-import').addEventListener('click', importSelected);

    document.getElementById('discovery-more').addEventListener('click', fetchMore);
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { init, load };
})();

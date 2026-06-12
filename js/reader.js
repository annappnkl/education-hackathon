/* ─────────────────────────────────────────────
   Reader — PDF viewer + annotation layer
───────────────────────────────────────────── */

const Reader = (() => {

  // PDF.js setup
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let _currentPaperId = null;
  let _pdfDoc         = null;
  let _pageWrappers   = {}; // pageNum → DOM element
  let _scale          = 1.5;
  let _areaSelectMode = false;
  let _areaSelectState = null; // { startX, startY, rect, pageWrapper, pageNum }
  let _annotationCard = null;

  // ── Sidebar ──────────────────────────────────
  function renderSidebar() {
    const list   = document.getElementById('sidebar-paper-list');
    const papers = State.getPapers();
    list.innerHTML = '';

    if (!papers.length) {
      list.innerHTML = `<div class="empty-state" style="padding:var(--space-6)">
        <span class="icon">inbox</span><p>No papers yet</p>
      </div>`;
      return;
    }

    // Split into "has full PDF" vs "abstract / unexplored"
    const withPDF    = papers.filter(p => !!p.pdfStorageKey);
    const withoutPDF = papers.filter(p => !p.pdfStorageKey);

    const byYear = arr => arr.slice().sort((a, b) => (b.year || 0) - (a.year || 0));

    if (withPDF.length) {
      const section = document.createElement('div');
      section.className = 'sidebar-section';
      section.innerHTML = `<div class="sidebar-section__label">
        <span class="icon icon--sm" style="font-size:13px">menu_book</span>Full Reading Material
      </div>`;
      byYear(withPDF).forEach(p => section.appendChild(buildSidebarItem(p)));
      list.appendChild(section);
    }

    if (withoutPDF.length) {
      const section = document.createElement('div');
      section.className = 'sidebar-section';
      section.innerHTML = `<div class="sidebar-section__label sidebar-section__label--muted">
        <span class="icon icon--sm" style="font-size:13px">explore</span>Unexplored
      </div>`;
      byYear(withoutPDF).forEach(p => section.appendChild(buildSidebarItem(p)));
      list.appendChild(section);
    }
  }

  function buildSidebarItem(paper) {
    const item = document.createElement('div');
    item.className = 'sidebar-paper';
    item.dataset.id = paper.id;
    if (paper.id === _currentPaperId) item.classList.add('active');

    const annotCount = (paper.annotations || []).length;
    item.innerHTML = `
      <div class="sidebar-paper__dot"></div>
      <div>
        <div class="sidebar-paper__title">${escHtml(paper.title)}</div>
        <div class="sidebar-paper__year">${paper.year || '—'}${annotCount ? ` · ${annotCount} annotation${annotCount > 1 ? 's' : ''}` : ''}</div>
      </div>
    `;
    item.addEventListener('click', () => openPaper(paper.id));
    return item;
  }

  // ── Open paper ───────────────────────────────
  async function openPaper(paperId) {
    _currentPaperId = paperId;
    const paper = State.getPapers().find(p => p.id === paperId);
    if (!paper) return;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-paper').forEach(el => {
      el.classList.toggle('active', el.dataset.id === paperId);
    });

    // Show loaded panel
    document.getElementById('reader-empty').style.display   = 'none';
    const loaded = document.getElementById('reader-loaded');
    loaded.style.display = 'flex';
    document.getElementById('reader-paper-title').textContent = paper.title;

    // Clear viewport
    const viewport = document.getElementById('pdf-viewport');
    viewport.innerHTML = '';
    _pageWrappers = {};

    // Load PDF — try stored, then via local proxy server (handles CORS + redirects)
    let pdfData = await State.getPDF(paper.pdfStorageKey || paper.id);
    if (!pdfData && paper.openAccessUrl) {
      pdfData = await fetchPDFBuffer(paper.openAccessUrl);
      if (pdfData) {
        await State.storePDF(paper.id, pdfData);
        // Mark paper as having a stored PDF so it moves to "Full Reading Material"
        if (!paper.pdfStorageKey) {
          State.updatePaper(paper.id, { pdfStorageKey: paper.id });
          renderSidebar();
        }
      }
    }

    if (!pdfData) {
      // Render abstract view — always readable and annotatable
      renderAbstractView(paper, viewport);
      return;
    }

    // Render PDF
    try {
      _pdfDoc = await pdfjsLib.getDocument({ data: pdfData.slice ? pdfData.slice(0) : pdfData }).promise;
      for (let pageNum = 1; pageNum <= _pdfDoc.numPages; pageNum++) {
        await renderPage(pageNum, viewport);
      }
      // Overlay saved annotations
      renderAllAnnotations(paper.id);
    } catch(err) {
      viewport.innerHTML = `<div class="empty-state"><span class="icon">error</span><p>Could not render PDF.</p></div>`;
      console.error('PDF render error', err);
    }
  }

  async function fetchPDFBuffer(targetUrl) {
    // Route through local proxy server — server-side fetch has no CORS restriction
    try {
      const proxyUrl = `/proxy-pdf?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) return await res.arrayBuffer();
      // 422 = server confirmed it's not a PDF (landing page, etc.)
      return null;
    } catch { return null; }
  }

  // ── Abstract / metadata view (when no PDF) ───
  function renderAbstractView(paper, container) {
    const authors  = (paper.authors || []).join(', ') || 'Unknown authors';
    const doiLink  = paper.doi ? `<a href="https://doi.org/${paper.doi}" target="_blank" class="btn btn--ghost btn--sm" style="font-size:11px"><span class="icon icon--sm">open_in_new</span>DOI</a>` : '';
    const oaLink   = paper.openAccessUrl ? `<a href="${escHtml(paper.openAccessUrl)}" target="_blank" class="btn btn--ghost btn--sm" style="font-size:11px"><span class="icon icon--sm">open_in_new</span>Open Access page</a>` : '';
    const uploadBtn = `<label class="btn btn--secondary btn--sm" style="cursor:pointer;font-size:11px"><span class="icon icon--primary icon--sm">upload_file</span>Upload PDF<input type="file" accept=".pdf" style="display:none" id="inline-upload" /></label>`;

    // Wrapper acts like a single "page" for annotation purposes
    const pageNum = 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper abstract-page';
    wrapper.dataset.page = pageNum;
    wrapper.style.cssText = 'width:680px;background:#fff;padding:48px 56px;font-family:var(--font-family);box-sizing:border-box;';

    wrapper.innerHTML = `
      <div style="margin-bottom:32px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-tertiary);margin-bottom:8px">${escHtml(paper.source?.toUpperCase() || 'PAPER')}</div>
        <h1 style="font-size:22px;font-weight:700;line-height:1.3;color:var(--color-text-primary);margin-bottom:12px">${escHtml(paper.title)}</h1>
        <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:6px">${escHtml(authors)}</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          ${paper.year ? `<span style="font-size:12px;color:var(--color-text-tertiary)">${paper.year}</span>` : ''}
          ${paper.citations ? `<span style="font-size:12px;color:var(--color-text-tertiary)">${paper.citations.toLocaleString()} citations</span>` : ''}
          ${doiLink}${oaLink}
        </div>
      </div>
      ${paper.abstract ? `
        <div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-tertiary);margin-bottom:10px">Abstract</div>
          <div id="abstract-text" style="font-size:14px;line-height:1.8;color:var(--color-text-primary)">${escHtml(paper.abstract)}</div>
        </div>
      ` : '<div style="color:var(--color-text-tertiary);font-size:13px;font-style:italic">No abstract available.</div>'}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid var(--color-border-subtle);display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;color:var(--color-text-tertiary)">Have the full PDF?</span>
        ${uploadBtn}
      </div>
    `;

    // Annotation overlay
    const annotOverlay = document.createElement('div');
    annotOverlay.className = 'annotation-overlay';
    annotOverlay.dataset.page = pageNum;
    wrapper.appendChild(annotOverlay);

    container.appendChild(wrapper);
    _pageWrappers[pageNum] = wrapper;

    // Text selection → annotation card (same as PDF flow)
    wrapper.addEventListener('mouseup', e => handleTextSelection(e, pageNum, wrapper));

    // Render any saved annotations
    renderAllAnnotations(paper.id);

    // Upload handler
    const inlineUpload = document.getElementById('inline-upload');
    if (inlineUpload) {
      inlineUpload.addEventListener('change', async () => {
        const f = inlineUpload.files[0];
        if (!f) return;
        const buf = await f.arrayBuffer();
        await State.storePDF(paper.id, buf);
        State.updatePaper(paper.id, { pdfStorageKey: paper.id });
        container.innerHTML = '';
        _pageWrappers = {};
        openPaper(paper.id);
      });
    }
  }

  async function renderPage(pageNum, container) {
    const page        = await _pdfDoc.getPage(pageNum);
    const viewport    = page.getViewport({ scale: _scale });

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.page = pageNum;
    wrapper.style.width  = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';

    // Canvas
    const canvas  = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    wrapper.appendChild(canvas);

    // Text layer
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    wrapper.appendChild(textLayerDiv);

    // Annotation overlay
    const annotOverlay = document.createElement('div');
    annotOverlay.className = 'annotation-overlay';
    annotOverlay.dataset.page = pageNum;
    wrapper.appendChild(annotOverlay);

    container.appendChild(wrapper);
    _pageWrappers[pageNum] = wrapper;

    // Render canvas
    await page.render({ canvasContext: context, viewport }).promise;

    // Render text layer
    const textContent = await page.getTextContent();
    pdfjsLib.renderTextLayer({
      textContent,
      container: textLayerDiv,
      viewport,
      textDivs: [],
    });

    // Text selection → annotation card
    wrapper.addEventListener('mouseup', e => handleTextSelection(e, pageNum, wrapper));

    // Area select support
    wrapper.addEventListener('mousedown', e => onAreaMousedown(e, pageNum, wrapper));
    wrapper.addEventListener('mousemove', e => onAreaMousemove(e, wrapper));
    wrapper.addEventListener('mouseup',   e => onAreaMouseup(e, pageNum, wrapper));
  }

  // ── Text selection ───────────────────────────
  function handleTextSelection(e, pageNum, wrapper) {
    if (_areaSelectMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const selectedText = sel.toString().trim();
    const range  = sel.getRangeAt(0);
    const rect   = range.getBoundingClientRect();
    const wRect  = wrapper.getBoundingClientRect();

    const normRect = {
      x:      (rect.left - wRect.left) / wRect.width,
      y:      (rect.top  - wRect.top)  / wRect.height,
      width:  rect.width  / wRect.width,
      height: rect.height / wRect.height,
    };

    sel.removeAllRanges();

    // Show mini action menu — Annotate or Explain
    showSelectionMenu({ pageNum, normRect, selectedText, rect });
  }

  // ── Selection action menu ─────────────────────
  let _selectionMenu = null;

  function showSelectionMenu({ pageNum, normRect, selectedText, rect }) {
    closeSelectionMenu();

    const menu = document.createElement('div');
    menu.className = 'selection-menu';
    _selectionMenu = menu;

    // Position just above / to the right of the selection
    const menuW = 168;
    let left = rect.left + rect.width / 2 - menuW / 2;
    let top  = rect.top - 48;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (left < 8) left = 8;
    if (top < 8) top = rect.bottom + 8;
    menu.style.cssText = `left:${left}px;top:${top}px`;

    menu.innerHTML = `
      <button class="selection-menu__btn" id="sm-annotate">
        <span class="icon icon--sm">bookmark</span>Annotate
      </button>
      <div class="selection-menu__divider"></div>
      <button class="selection-menu__btn selection-menu__btn--explain" id="sm-explain">
        <span class="icon icon--sm">auto_awesome</span>Explain
      </button>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#sm-annotate').addEventListener('click', e => {
      e.stopPropagation();
      closeSelectionMenu();
      showAnnotationCard({
        type: 'text', pageNum, normRect, selectedText,
        screenX: rect.right + 12, screenY: rect.top,
      });
    });

    menu.querySelector('#sm-explain').addEventListener('click', e => {
      e.stopPropagation();
      closeSelectionMenu();
      showExplanationBubble(selectedText, rect);
    });
  }

  function closeSelectionMenu() {
    if (_selectionMenu) { _selectionMenu.remove(); _selectionMenu = null; }
  }

  // ── LLM explanation bubble ───────────────────
  async function showExplanationBubble(selectedText, rect) {
    // Remove any existing bubble
    document.getElementById('explanation-bubble')?.remove();

    const bubble = document.createElement('div');
    bubble.id = 'explanation-bubble';
    bubble.className = 'explanation-bubble';

    const bubbleW = 320;
    let left = rect.right + 14;
    let top  = rect.top;
    if (left + bubbleW > window.innerWidth - 8) left = rect.left - bubbleW - 14;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    bubble.style.cssText = `left:${left}px;top:${top}px`;

    bubble.innerHTML = `
      <div class="explanation-bubble__header">
        <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--color-text-primary)">
          <span class="icon icon--sm" style="color:var(--color-primary)">auto_awesome</span>Explanation
        </span>
        <button class="btn btn--icon btn--ghost btn--sm" id="exp-close">
          <span class="icon icon--sm">close</span>
        </button>
      </div>
      <div class="explanation-bubble__preview">"${escHtml(selectedText.slice(0, 100))}${selectedText.length > 100 ? '…' : ''}"</div>
      <div id="exp-body" class="explanation-bubble__body">
        <div style="display:flex;align-items:center;gap:8px;color:var(--color-text-tertiary);font-size:12px">
          <div class="loading-spinner"></div>Analysing…
        </div>
      </div>
    `;

    document.body.appendChild(bubble);
    document.getElementById('exp-close').addEventListener('click', () => bubble.remove());

    try {
      const paper = State.getPapers().find(p => p.id === _currentPaperId);
      const explanation = await API.explainText(selectedText, paper?.title);
      const body = document.getElementById('exp-body');
      if (body) body.innerHTML = `<p style="font-size:13px;line-height:1.7;color:var(--color-text-primary);margin:0">${escHtml(explanation)}</p>`;
    } catch {
      const body = document.getElementById('exp-body');
      if (body) body.innerHTML = `<p style="color:var(--color-text-tertiary);font-size:12px">Could not get explanation.</p>`;
    }
  }

  // ── Area select (images) ─────────────────────
  function toggleAreaSelect() {
    _areaSelectMode = !_areaSelectMode;
    const btn = document.getElementById('area-select-btn');
    btn.classList.toggle('active', _areaSelectMode);
    document.getElementById('pdf-viewport').classList.toggle('area-select-active', _areaSelectMode);
    if (!_areaSelectMode && _areaSelectState?.rect) {
      _areaSelectState.rect.remove();
    }
    _areaSelectState = null;
  }

  function onAreaMousedown(e, pageNum, wrapper) {
    if (!_areaSelectMode) return;
    e.preventDefault();
    const wRect = wrapper.getBoundingClientRect();
    _areaSelectState = {
      startX: e.clientX - wRect.left,
      startY: e.clientY - wRect.top,
      pageNum,
      wrapper,
      wRect,
      rect: null,
    };
    const rectEl = document.createElement('div');
    rectEl.className = 'area-select-rect';
    wrapper.appendChild(rectEl);
    _areaSelectState.rect = rectEl;
  }

  function onAreaMousemove(e, wrapper) {
    if (!_areaSelectMode || !_areaSelectState?.rect) return;
    const wRect  = _areaSelectState.wRect;
    const x      = e.clientX - wRect.left;
    const y      = e.clientY - wRect.top;
    const left   = Math.min(x, _areaSelectState.startX);
    const top    = Math.min(y, _areaSelectState.startY);
    const width  = Math.abs(x - _areaSelectState.startX);
    const height = Math.abs(y - _areaSelectState.startY);
    Object.assign(_areaSelectState.rect.style, {
      left: left + 'px', top: top + 'px',
      width: width + 'px', height: height + 'px',
    });
  }

  function onAreaMouseup(e, pageNum, wrapper) {
    if (!_areaSelectMode || !_areaSelectState?.rect) return;
    const wRect  = _areaSelectState.wRect;
    const x      = e.clientX - wRect.left;
    const y      = e.clientY - wRect.top;
    const left   = Math.min(x, _areaSelectState.startX);
    const top    = Math.min(y, _areaSelectState.startY);
    const width  = Math.abs(x - _areaSelectState.startX);
    const height = Math.abs(y - _areaSelectState.startY);

    if (width < 10 || height < 10) {
      _areaSelectState.rect.remove();
      _areaSelectState = null;
      return;
    }

    const normRect = {
      x:      left   / wRect.width,
      y:      top    / wRect.height,
      width:  width  / wRect.width,
      height: height / wRect.height,
    };

    showAnnotationCard({
      type: 'image',
      pageNum,
      normRect,
      selectedText: '[Image area]',
      screenX: e.clientX + 12,
      screenY: e.clientY - 60,
      keepRect: _areaSelectState.rect,
    });

    _areaSelectState = null;
    _areaSelectMode = false;
    document.getElementById('area-select-btn').classList.remove('active');
    document.getElementById('pdf-viewport').classList.remove('area-select-active');
  }

  // ── Annotation card ───────────────────────────
  function showAnnotationCard({ type, pageNum, normRect, selectedText, screenX, screenY, keepRect }) {
    closeAnnotationCard();

    const tags = State.getAllTags();
    const card = document.createElement('div');
    card.className = 'annotation-card';
    card.id = 'annotation-card';

    // Keep card in viewport
    const cardW = 300;
    const cardH = 360;
    let left = screenX;
    let top  = screenY;
    if (left + cardW > window.innerWidth - 16)  left = screenX - cardW - 24;
    if (top  + cardH > window.innerHeight - 16) top  = window.innerHeight - cardH - 16;
    if (top < 8) top = 8;
    card.style.left = left + 'px';
    card.style.top  = top  + 'px';

    card.innerHTML = `
      <div class="annotation-card__header">
        <span class="annotation-card__label">${type === 'image' ? 'Image annotation' : 'Text annotation'}</span>
        <button class="btn btn--icon btn--ghost btn--sm" id="ac-close">
          <span class="icon icon--sm">close</span>
        </button>
      </div>
      ${selectedText && type === 'text' ? `
        <div class="annotation-card__preview">${escHtml(selectedText.slice(0, 120))}${selectedText.length > 120 ? '…' : ''}</div>
      ` : ''}
      <div>
        <div class="label" style="margin-bottom:var(--space-2)">Tag as</div>
        <div class="tag-grid" id="ac-tags">
          ${tags.map(t => `
            <button class="tag-chip" data-tag-id="${t.id}" style="--tag-color:${t.color}">
              <span style="width:6px;height:6px;border-radius:50%;background:${t.color};flex-shrink:0"></span>
              ${escHtml(t.name)}
            </button>
          `).join('')}
        </div>
        <div class="new-tag-row" style="margin-top:var(--space-2)">
          <input class="new-tag-input" id="ac-new-tag" placeholder="+ New tag…" />
          <button class="btn btn--secondary btn--sm" id="ac-add-tag">Add</button>
        </div>
      </div>
      <div>
        <textarea class="annotation-comment" id="ac-comment" placeholder="Add a comment…"></textarea>
      </div>
      <div class="annotation-card__actions">
        <button class="btn btn--ghost btn--sm" id="ac-cancel">Cancel</button>
        <button class="btn btn--primary btn--sm" id="ac-save">Save</button>
      </div>
    `;

    document.body.appendChild(card);
    _annotationCard = card;

    let selectedTagId = null;

    // Tag selection
    card.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        card.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedTagId = chip.dataset.tagId;
      });
    });

    // Add custom tag
    document.getElementById('ac-add-tag').addEventListener('click', () => {
      const name = document.getElementById('ac-new-tag').value.trim();
      if (!name) return;
      const tag = State.addCustomTag(name);
      selectedTagId = tag.id;

      const chip = document.createElement('button');
      chip.className = 'tag-chip selected';
      chip.dataset.tagId = tag.id;
      chip.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${tag.color};flex-shrink:0"></span>${escHtml(name)}`;
      chip.addEventListener('click', () => {
        card.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedTagId = tag.id;
      });
      card.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('selected'));
      document.getElementById('ac-tags').appendChild(chip);
      document.getElementById('ac-new-tag').value = '';
    });

    // Save
    document.getElementById('ac-save').addEventListener('click', () => {
      const comment = document.getElementById('ac-comment').value.trim();
      if (!selectedTagId) {
        document.getElementById('ac-tags').style.outline = '2px solid var(--color-danger)';
        setTimeout(() => document.getElementById('ac-tags').style.outline = '', 1200);
        return;
      }
      const annotation = {
        paperId: _currentPaperId,
        type,
        pageNumber: pageNum,
        selectedText,
        rect: normRect,
        tagId: selectedTagId,
        comment,
      };
      State.addAnnotation(annotation);
      closeAnnotationCard();
      if (keepRect) keepRect.remove();
      renderAllAnnotations(_currentPaperId);
      renderSidebar(); // refresh annotation count
    });

    document.getElementById('ac-close').addEventListener('click', () => {
      closeAnnotationCard();
      if (keepRect) keepRect.remove();
    });
    document.getElementById('ac-cancel').addEventListener('click', () => {
      closeAnnotationCard();
      if (keepRect) keepRect.remove();
    });

    // Explain
    document.getElementById('explain-selection-btn')?.addEventListener('click', async () => {
      if (!selectedText || type !== 'text') return;
      const paper = State.getPapers().find(p => p.id === _currentPaperId);
      const btn = document.getElementById('explain-selection-btn');
      btn.disabled = true;
      try {
        const explanation = await API.explainText(selectedText, paper?.title);
        // Show explanation in a simple alert-style bubble
        const bubble = document.createElement('div');
        bubble.style.cssText = `position:fixed;bottom:80px;right:var(--space-5);max-width:320px;background:var(--color-surface);border-radius:var(--radius-lg);padding:var(--space-4);box-shadow:var(--shadow-md);z-index:600;font-size:var(--font-size-sm);line-height:var(--line-height-normal);border:1px solid var(--color-border)`;
        bubble.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2)"><span class="label">Explanation</span><button onclick="this.parentElement.parentElement.remove()" class="btn btn--icon btn--ghost btn--sm"><span class="icon icon--sm">close</span></button></div>${escHtml(explanation)}`;
        document.body.appendChild(bubble);
        setTimeout(() => bubble.remove(), 15000);
      } catch {}
      btn.disabled = false;
    });
  }

  function closeAnnotationCard() {
    if (_annotationCard) { _annotationCard.remove(); _annotationCard = null; }
  }

  // ── Render saved annotations ──────────────────
  function renderAllAnnotations(paperId) {
    const annotations = State.getAnnotations(paperId);
    // Clear existing overlays
    document.querySelectorAll('.annotation-overlay').forEach(el => el.innerHTML = '');

    annotations.forEach(ann => {
      const overlay = document.querySelector(`.annotation-overlay[data-page="${ann.pageNumber}"]`);
      if (!overlay) return;
      const wrapper = _pageWrappers[ann.pageNumber];
      if (!wrapper) return;

      const w = wrapper.offsetWidth;
      const h = wrapper.offsetHeight;
      const tag = State.getTagById(ann.tagId);
      const color = tag?.color || '#2A5C45';

      if (ann.type === 'text') {
        const el = document.createElement('div');
        el.className = 'annotation-highlight';
        el.style.cssText = `
          left:   ${ann.rect.x      * w}px;
          top:    ${ann.rect.y      * h}px;
          width:  ${ann.rect.width  * w}px;
          height: ${ann.rect.height * h}px;
          background: ${color};
        `;
        el.title = `${tag?.name || ''}: ${ann.comment || ann.selectedText}`;
        overlay.appendChild(el);
      } else {
        const el = document.createElement('div');
        el.className = 'annotation-image-box';
        el.style.cssText = `
          left:         ${ann.rect.x      * w}px;
          top:          ${ann.rect.y      * h}px;
          width:        ${ann.rect.width  * w}px;
          height:       ${ann.rect.height * h}px;
          border-color: ${color};
          color:        ${color};
        `;
        el.title = `${tag?.name || ''}: ${ann.comment}`;
        overlay.appendChild(el);
      }
    });
  }

  // ── Takeaway modal ────────────────────────────
  function initTakeawayModal() {
    const modal  = document.getElementById('takeaway-modal');
    const btn    = document.getElementById('takeaway-btn');
    const close  = document.getElementById('takeaway-close');
    const cancel = document.getElementById('takeaway-cancel');
    const save   = document.getElementById('takeaway-save');
    const stars  = document.querySelectorAll('.star-rating__star');
    const text   = document.getElementById('takeaway-text');

    let _rating = 0;

    btn.addEventListener('click', () => {
      const paper = State.getPapers().find(p => p.id === _currentPaperId);
      if (!paper) return;
      _rating = paper.rating || 0;
      text.value = paper.takeaway || '';
      renderStars(_rating);
      modal.style.display = 'flex';
    });

    stars.forEach(star => {
      star.addEventListener('click', () => {
        _rating = parseInt(star.dataset.value);
        renderStars(_rating);
      });
      star.addEventListener('mouseover', () => renderStars(parseInt(star.dataset.value)));
      star.addEventListener('mouseout',  () => renderStars(_rating));
    });

    function renderStars(val) {
      stars.forEach(s => s.classList.toggle('filled', parseInt(s.dataset.value) <= val));
    }

    const closeModal = () => { modal.style.display = 'none'; };
    close.addEventListener('click',  closeModal);
    cancel.addEventListener('click', closeModal);
    modal.addEventListener('click',  e => { if (e.target === modal) closeModal(); });

    save.addEventListener('click', () => {
      if (_currentPaperId) {
        State.updatePaper(_currentPaperId, { rating: _rating, takeaway: text.value });
      }
      closeModal();
    });
  }

  // ── PDF upload ────────────────────────────────
  function initUploadBtn() {
    const btn   = document.getElementById('upload-pdf-btn');
    const input = document.getElementById('pdf-upload-input');

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const files = Array.from(input.files);
      for (const f of files) {
        const paperId = 'upload_' + State.uid();
        const buf = await f.arrayBuffer();
        await State.storePDF(paperId, buf);
        State.addPapers([{
          id: paperId,
          title: f.name.replace('.pdf', ''),
          authors: [],
          year: null,
          citations: 0,
          abstract: '',
          doi: null,
          openAccessUrl: null,
          source: 'upload',
          annotations: [],
          rating: null,
          takeaway: '',
          pdfStorageKey: paperId,
        }]);
      }
      input.value = '';
      renderSidebar();
    });
  }

  function init() {
    document.getElementById('reader-close').addEventListener('click', () => {
      document.getElementById('reader-empty').style.display  = 'flex';
      document.getElementById('reader-loaded').style.display = 'none';
      _currentPaperId = null;
      document.querySelectorAll('.sidebar-paper').forEach(el => el.classList.remove('active'));
    });

    document.getElementById('area-select-btn').addEventListener('click', toggleAreaSelect);

    // Close floating UI on outside click
    document.addEventListener('mousedown', e => {
      if (_annotationCard && !_annotationCard.contains(e.target)) closeAnnotationCard();
      if (_selectionMenu  && !_selectionMenu.contains(e.target))  closeSelectionMenu();
      const expBubble = document.getElementById('explanation-bubble');
      if (expBubble && !expBubble.contains(e.target)) expBubble.remove();
    });

    initTakeawayModal();
    initUploadBtn();
    renderSidebar();
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  return { init, renderSidebar, openPaper };
})();

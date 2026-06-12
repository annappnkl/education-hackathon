/* ─────────────────────────────────────────────
   Writing mode
   Left: tagged excerpts grouped by theme (LLM) then chronological
   Right: contenteditable text editor
───────────────────────────────────────────── */

const Writer = (() => {

  function init() {
    initEditor();
    initToolbar();
    renderRefs();
  }

  // ── Editor ────────────────────────────────────
  function initEditor() {
    const doc = document.getElementById('editor-doc');

    // Restore saved content
    const saved = State.getWritingContent();
    if (saved) doc.innerHTML = saved;

    // Auto-save
    doc.addEventListener('input', () => {
      State.saveWritingContent(doc.innerHTML);
      updateWordCount();
    });

    updateWordCount();
  }

  function updateWordCount() {
    const doc  = document.getElementById('editor-doc');
    const text = doc.innerText.trim();
    const count = text ? text.split(/\s+/).length : 0;
    document.getElementById('word-count').textContent = `${count.toLocaleString()} word${count !== 1 ? 's' : ''}`;
  }

  function initToolbar() {
    document.getElementById('cluster-btn').addEventListener('click', recluster);
  }

  // ── Refs panel ────────────────────────────────
  function renderRefs() {
    const list        = document.getElementById('refs-list');
    const annotations = State.getAllAnnotations();
    const tags        = State.getAllTags();
    list.innerHTML    = '';

    if (!annotations.length) {
      list.innerHTML = `
        <div class="empty-state" style="padding:var(--space-6)">
          <span class="icon">bookmark</span>
          <p>Annotate papers in Reading mode to see excerpts here</p>
        </div>`;
      return;
    }

    // Group annotations by tag
    const byTag = {};
    annotations.forEach(ann => {
      if (!byTag[ann.tagId]) byTag[ann.tagId] = [];
      byTag[ann.tagId].push(ann);
    });

    // Sort tags: preset order first, then custom
    const tagOrder = tags.map(t => t.id);
    const sortedTagIds = Object.keys(byTag).sort((a, b) => {
      const ia = tagOrder.indexOf(a);
      const ib = tagOrder.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    sortedTagIds.forEach(tagId => {
      const tag   = State.getTagById(tagId);
      if (!tag) return;
      const items = byTag[tagId];

      // Sort: group by theme (paper), then chronological within theme
      const sorted = items.slice().sort((a, b) => {
        if (a.paperId !== b.paperId) {
          const yearA = a.paperYear || 0;
          const yearB = b.paperYear || 0;
          return yearB - yearA; // newest paper first
        }
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      const group = document.createElement('div');
      group.className = 'ref-group';

      group.innerHTML = `
        <div class="ref-group__header">
          <span class="ref-group__name">
            <span style="width:8px;height:8px;border-radius:50%;background:${tag.color};flex-shrink:0"></span>
            ${escHtml(tag.name)}
          </span>
          <span class="ref-group__count">${sorted.length}</span>
        </div>
        <div class="ref-group__items" id="ref-items-${tagId}"></div>
      `;

      // Toggle expand/collapse
      let collapsed = false;
      const header   = group.querySelector('.ref-group__header');
      const itemsDiv = group.querySelector('.ref-group__items');

      header.addEventListener('click', () => {
        collapsed = !collapsed;
        itemsDiv.style.display = collapsed ? 'none' : '';
      });

      // Build items
      sorted.forEach(ann => {
        const item = document.createElement('div');
        item.className = 'ref-item';

        const isImage = ann.type === 'image';
        item.innerHTML = `
          <div class="ref-item__source">
            <span class="icon" style="font-size:11px">${isImage ? 'image' : 'format_quote'}</span>
            ${escHtml(truncate(ann.paperTitle, 36))} · ${ann.paperYear || '—'}
          </div>
          <div class="ref-item__text">${isImage ? '[Image area]' : escHtml(truncate(ann.selectedText, 160))}</div>
          ${ann.comment ? `<div class="ref-item__comment">${escHtml(ann.comment)}</div>` : ''}
        `;

        // Click → insert citation into editor
        item.addEventListener('click', () => insertIntoEditor(ann));
        item.title = 'Click to insert into editor';

        itemsDiv.appendChild(item);
      });

      list.appendChild(group);
    });
  }

  // ── Insert excerpt into editor ────────────────
  function insertIntoEditor(ann) {
    const doc = document.getElementById('editor-doc');
    const tag = State.getTagById(ann.tagId);
    doc.focus();

    const citationText = ann.type === 'image'
      ? `[Image from ${ann.paperTitle} (${ann.paperYear || '?'})]`
      : `"${ann.selectedText}" (${ann.paperTitle}, ${ann.paperYear || '?'})`;

    // Insert at cursor position or end
    const sel = window.getSelection();
    if (sel && sel.rangeCount && doc.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      const node = document.createTextNode(citationText + ' ');
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // Append to end
      doc.innerHTML += `<p>${escHtml(citationText)}</p>`;
    }

    State.saveWritingContent(doc.innerHTML);
    updateWordCount();
  }

  // ── Re-cluster (LLM) ─────────────────────────
  async function recluster() {
    const btn = document.getElementById('cluster-btn');
    btn.disabled = true;
    btn.querySelector('.icon').textContent = 'hourglass_empty';

    try {
      // Build a summary of all annotations for the LLM
      const annotations = State.getAllAnnotations();
      const tags = State.getAllTags();

      const summary = annotations.map(a => {
        const tag = tags.find(t => t.id === a.tagId);
        return `[${tag?.name || 'Unknown'}] "${a.selectedText}" — ${a.paperTitle} (${a.paperYear}). Comment: ${a.comment || 'none'}`;
      }).join('\n');

      const messages = [
        {
          role: 'system',
          content: `You are a research assistant helping organise annotated excerpts from academic papers.
Given a list of annotations, group them by thematic similarity within each tag category.
Return a JSON object: { "tagId": ["annotationIndex1", "annotationIndex2", ...], ... }
where annotationIndex is the 0-based index of the annotation in the input list.
Group by theme first, then chronologically within each theme. Keep the same tag groupings.`,
        },
        {
          role: 'user',
          content: `Annotations:\n${summary}`,
        }
      ];

      const reply = await API.chatLLM(messages);

      // Try to parse JSON from reply
      const jsonMatch = reply.match(/\{[\s\S]+\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const ordering = JSON.parse(jsonMatch[0]);
      // TODO: reorder the refs panel based on LLM ordering
      // For now, just re-render (LLM API not connected yet)
      renderRefs();
    } catch(err) {
      console.warn('Recluster failed', err);
    }

    btn.disabled = false;
    btn.querySelector('.icon').textContent = 'auto_awesome';
  }

  function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : str;
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  return { init, renderRefs };
})();

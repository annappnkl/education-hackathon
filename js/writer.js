/* ─────────────────────────────────────────────
   Writing mode
   Left:  tagged excerpts (refs panel)
   Right: contenteditable editor, pre-populated
          by LLM outline from tagged annotations
───────────────────────────────────────────── */

const Writer = (() => {

  let _outlineGenerated = false;

  function init() {
    initEditor();
    initToolbar();
    renderRefs();

    // Auto-generate outline if editor is empty and annotations exist
    const doc         = document.getElementById('editor-doc');
    const annotations = State.getAllAnnotations();
    const isEmpty     = !doc.innerText.trim();

    if (isEmpty && annotations.length > 0) {
      generateOutline({ silent: true });
    }
  }

  // ── Editor ────────────────────────────────────
  function initEditor() {
    const doc   = document.getElementById('editor-doc');
    const saved = State.getWritingContent();
    if (saved) doc.innerHTML = saved;

    doc.addEventListener('input', () => {
      State.saveWritingContent(doc.innerHTML);
      updateWordCount();
    });

    updateWordCount();
  }

  function updateWordCount() {
    const doc   = document.getElementById('editor-doc');
    const text  = doc.innerText.trim();
    const count = text ? text.split(/\s+/).length : 0;
    document.getElementById('word-count').textContent =
      `${count.toLocaleString()} word${count !== 1 ? 's' : ''}`;
  }

  function initToolbar() {
    document.getElementById('cluster-btn').addEventListener('click', () => {
      const doc     = document.getElementById('editor-doc');
      const hasText = doc.innerText.trim().length > 0;

      if (hasText && _outlineGenerated) {
        if (!confirm('This will replace your current outline with a freshly generated one. Your written paragraphs will be cleared. Continue?')) return;
      }
      generateOutline({ silent: false });
    });
  }

  // ── LLM outline generation ────────────────────
  async function generateOutline({ silent = false } = {}) {
    const btn         = document.getElementById('cluster-btn');
    const annotations = State.getAllAnnotations();
    const tags        = State.getAllTags();

    if (!annotations.length) return;

    btn.disabled = true;
    btn.querySelector('.icon').textContent = 'hourglass_empty';

    // Show generating indicator in editor
    const doc = document.getElementById('editor-doc');
    const placeholder = document.createElement('div');
    placeholder.id = 'outline-generating';
    placeholder.style.cssText = 'display:flex;align-items:center;gap:12px;color:var(--color-text-tertiary);font-size:13px;padding:8px 0';
    placeholder.innerHTML = `<div class="loading-spinner"></div> Analysing your annotations and building an outline…`;
    doc.innerHTML = '';
    doc.appendChild(placeholder);

    // Build annotation list for LLM
    const annotList = annotations.map((a, i) => {
      const tag = tags.find(t => t.id === a.tagId);
      return {
        index: i,
        tag: tag?.name || 'Unknown',
        tagId: a.tagId,
        text: a.type === 'image' ? '[Image area]' : a.selectedText,
        comment: a.comment || '',
        paper: a.paperTitle,
        year: a.paperYear || '?',
      };
    });

    const project = State.getProject();
    const allTags = State.getAllTags();

    const sectionList = allTags.map(t => `  - tagId="${t.id}", name="${t.name}"`).join('\n');

    const systemPrompt = `You are a research writing assistant helping a student write a ${project?.type || 'research paper'}.
The student has annotated excerpts from academic papers. Each annotation has a tag the student assigned, but you should use your judgement to place it in the best section.

The full section structure for this ${project?.type || 'paper'} is:
${sectionList}

Your task:
1. Evaluate EACH annotation and assign it to the section where it best fits academically (use the student's tag as a strong hint, but override if clearly wrong).
2. Within each section, cluster annotations by thematic similarity and give each cluster a SHORT descriptive sub-heading (3-6 words).
3. Only include sections that have at least one annotation.
4. Return ONLY valid JSON in this exact structure — no prose, no markdown, no code fences:

{
  "sections": [
    {
      "tagId": "the_tag_id",
      "tagName": "Tag Name",
      "clusters": [
        {
          "title": "Short Cluster Title",
          "annotationIndices": [0, 2, 4]
        }
      ]
    }
  ]
}

Rules:
- Use ONLY tagId values from the section list above.
- Order sections in the same order as the section list.
- Cluster by THEME first, then chronologically within each cluster.
- If a section has only 1-2 annotations, put them in a single cluster with an appropriate title.
- Never invent annotations — only use the indices provided.
- Each annotation index must appear exactly once.`;

    const userMsg = `Project topic: ${project?.topic || 'unknown'}
Project type: ${project?.type || 'paper'}

Annotations (${annotList.length} total):
${annotList.map(a => `[${a.index}] TAG="${a.tag}" (tagId="${a.tagId}") PAPER="${a.paper}" (${a.year})\n  Text: "${a.text.slice(0, 200)}"\n  Comment: "${a.comment}"`).join('\n\n')}`;

    try {
      const reply   = await API.chatLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMsg },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]+\}/);
      if (!jsonMatch) throw new Error('No JSON returned');

      const result = JSON.parse(jsonMatch[0]);
      renderOutlineIntoEditor(result.sections, annotList);
      _outlineGenerated = true;

    } catch (err) {
      console.error('Outline generation failed:', err);
      // Fall back to simple structured dump without LLM clustering
      renderFallbackOutline(annotList, tags);
    }

    btn.disabled = false;
    btn.querySelector('.icon').textContent = 'auto_awesome';
  }

  // ── Render LLM-structured outline into editor ─
  function renderOutlineIntoEditor(sections, annotList) {
    const doc  = document.getElementById('editor-doc');
    const tags = State.getAllTags();
    let html   = '';

    // Render LLM-populated sections
    const renderedTagIds = new Set();
    sections.forEach(section => {
      const tag = State.getTagById(section.tagId);
      const color = tag?.color || '#2A5C45';
      renderedTagIds.add(section.tagId);

      html += `<h2 style="color:${color};margin-top:2em;margin-bottom:0.4em;font-size:20px">${escHtml(section.tagName)}</h2>`;

      (section.clusters || []).forEach(cluster => {
        html += `<h3 style="margin-top:1.2em;margin-bottom:0.5em;font-size:15px;font-weight:600;color:var(--color-text-primary)">${escHtml(cluster.title)}</h3>`;

        (cluster.annotationIndices || []).forEach(idx => {
          const ann = annotList[idx];
          if (!ann) return;

          if (ann.text === '[Image area]') {
            html += `<p style="background:var(--color-bg);border-left:3px solid ${color};padding:8px 12px;margin:6px 0;font-size:13px;color:var(--color-text-secondary)">[Image from ${escHtml(ann.paper)}, ${ann.year}]</p>`;
          } else {
            html += `<blockquote style="border-left:3px solid ${color};padding:8px 14px;margin:8px 0;font-style:italic;font-size:13px;color:var(--color-text-primary);background:var(--color-bg)">"${escHtml(ann.text)}"<br><span style="font-size:11px;color:var(--color-text-tertiary);font-style:normal">— ${escHtml(ann.paper)}, ${ann.year}</span></blockquote>`;
          }

          if (ann.comment) {
            html += `<p style="font-size:13px;color:var(--color-text-secondary);margin:2px 0 10px 17px;font-style:italic">${escHtml(ann.comment)}</p>`;
          }
        });

        // Writing prompt placeholder after each cluster
        html += `<p style="min-height:1.5em;color:var(--color-text-tertiary);font-size:13px" data-placeholder="Write your synthesis here…"><br></p>`;
      });
    });

    // Append empty sections for tags not yet annotated (preserve thesis structure)
    tags.forEach(tag => {
      if (renderedTagIds.has(tag.id)) return;
      html += `<h2 style="color:${tag.color};margin-top:2em;margin-bottom:0.4em;font-size:20px">${escHtml(tag.name)}</h2>`;
      html += `<p style="min-height:1.5em;color:var(--color-text-tertiary);font-size:13px" data-placeholder="No excerpts tagged yet — write here or tag annotations in Reading mode"><br></p>`;
    });

    doc.innerHTML = html || '<p><br></p>';
    State.saveWritingContent(doc.innerHTML);
    updateWordCount();
  }

  // ── Fallback: simple dump when LLM unavailable ─
  function renderFallbackOutline(annotList, tags) {
    const doc   = document.getElementById('editor-doc');
    const byTag = {};
    annotList.forEach(a => {
      if (!byTag[a.tagId]) byTag[a.tagId] = [];
      byTag[a.tagId].push(a);
    });

    let html = '';
    // Render all tags in preset order — populated or empty
    tags.forEach(tag => {
      const color = tag?.color || '#2A5C45';
      const items = byTag[tag.id] || [];

      html += `<h2 style="color:${color};margin-top:2em;margin-bottom:0.8em;font-size:20px">${escHtml(tag.name)}</h2>`;

      if (items.length) {
        items.sort((a, b) => (b.year || 0) - (a.year || 0)).forEach(ann => {
          if (ann.text !== '[Image area]') {
            html += `<blockquote style="border-left:3px solid ${color};padding:8px 14px;margin:8px 0;font-style:italic;font-size:13px;background:var(--color-bg)">"${escHtml(ann.text)}"<br><span style="font-size:11px;color:var(--color-text-tertiary);font-style:normal">— ${escHtml(ann.paper)}, ${ann.year}</span></blockquote>`;
          }
          if (ann.comment) {
            html += `<p style="font-size:13px;color:var(--color-text-secondary);margin:2px 0 10px 17px;font-style:italic">${escHtml(ann.comment)}</p>`;
          }
        });
      }

      html += `<p style="min-height:1.5em;color:var(--color-text-tertiary);font-size:13px"><br></p>`;
    });

    doc.innerHTML = html || '<p><br></p>';
    State.saveWritingContent(doc.innerHTML);
    updateWordCount();
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

    const byTag = {};
    annotations.forEach(ann => {
      if (!byTag[ann.tagId]) byTag[ann.tagId] = [];
      byTag[ann.tagId].push(ann);
    });

    const tagOrder    = tags.map(t => t.id);
    const sortedTagIds = Object.keys(byTag).sort((a, b) => {
      const ia = tagOrder.indexOf(a), ib = tagOrder.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    sortedTagIds.forEach(tagId => {
      const tag   = State.getTagById(tagId);
      if (!tag) return;
      const items = byTag[tagId].slice().sort((a, b) => (b.paperYear || 0) - (a.paperYear || 0));

      const group    = document.createElement('div');
      group.className = 'ref-group';
      group.innerHTML = `
        <div class="ref-group__header">
          <span class="ref-group__name">
            <span style="width:8px;height:8px;border-radius:50%;background:${tag.color};flex-shrink:0"></span>
            ${escHtml(tag.name)}
          </span>
          <span class="ref-group__count">${items.length}</span>
        </div>
        <div class="ref-group__items" id="ref-items-${tagId}"></div>
      `;

      let collapsed = false;
      const header   = group.querySelector('.ref-group__header');
      const itemsDiv = group.querySelector('.ref-group__items');
      header.addEventListener('click', () => {
        collapsed = !collapsed;
        itemsDiv.style.display = collapsed ? 'none' : '';
      });

      items.forEach(ann => {
        const item     = document.createElement('div');
        item.className = 'ref-item';
        const isImage  = ann.type === 'image';
        item.innerHTML = `
          <div class="ref-item__source">
            <span class="icon" style="font-size:11px">${isImage ? 'image' : 'format_quote'}</span>
            ${escHtml(truncate(ann.paperTitle, 36))} · ${ann.paperYear || '—'}
          </div>
          <div class="ref-item__text">${isImage ? '[Image area]' : escHtml(truncate(ann.selectedText, 160))}</div>
          ${ann.comment ? `<div class="ref-item__comment">${escHtml(ann.comment)}</div>` : ''}
        `;
        item.addEventListener('click', () => scrollEditorToAnnotation(ann));
        item.title = 'Click to jump to this excerpt in the editor';
        itemsDiv.appendChild(item);
      });

      list.appendChild(group);
    });
  }

  // ── Click ref → scroll editor to matching blockquote ──
  function scrollEditorToAnnotation(ann) {
    const doc   = document.getElementById('editor-doc');
    const bqs   = doc.querySelectorAll('blockquote');
    const short = ann.selectedText?.slice(0, 40).toLowerCase();
    for (const bq of bqs) {
      if (bq.textContent.toLowerCase().includes(short)) {
        bq.scrollIntoView({ behavior: 'smooth', block: 'center' });
        bq.style.outline = '2px solid var(--color-primary)';
        setTimeout(() => bq.style.outline = '', 1500);
        return;
      }
    }
    // Fallback: insert at cursor
    insertIntoEditor(ann);
  }

  // ── Insert excerpt into editor (manual) ───────
  function insertIntoEditor(ann) {
    const doc  = document.getElementById('editor-doc');
    const tag  = State.getTagById(ann.tagId);
    const color = tag?.color || '#2A5C45';
    doc.focus();

    const html = ann.type === 'image'
      ? `<p style="background:var(--color-bg);border-left:3px solid ${color};padding:8px 12px;margin:6px 0;font-size:13px">[Image from ${escHtml(ann.paperTitle)} (${ann.paperYear || '?'})]</p>`
      : `<blockquote style="border-left:3px solid ${color};padding:8px 14px;margin:8px 0;font-style:italic;font-size:13px;background:var(--color-bg)">"${escHtml(ann.selectedText)}"<br><span style="font-size:11px;color:var(--color-text-tertiary);font-style:normal">— ${escHtml(ann.paperTitle)}, ${ann.paperYear || '?'}</span></blockquote>${ann.comment ? `<p style="font-size:13px;color:var(--color-text-secondary);margin:2px 0 10px 17px;font-style:italic">${escHtml(ann.comment)}</p>` : ''}`;

    const sel = window.getSelection();
    if (sel && sel.rangeCount && doc.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const frag = document.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      range.insertNode(frag);
    } else {
      doc.innerHTML += html;
    }

    State.saveWritingContent(doc.innerHTML);
    updateWordCount();
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

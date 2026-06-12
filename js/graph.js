/* ─────────────────────────────────────────────
   Graph — knowledge graph (Cytoscape.js)
   Nodes = papers
   Edges = shared tags (weight = count)
───────────────────────────────────────────── */

const Graph = (() => {

  let _cy = null;

  function init() {
    // Will be called each time graph mode is activated
  }

  function render() {
    const papers = State.getPapers();
    const tags   = State.getAllTags();

    // Build elements
    const nodes = papers.map(p => ({
      data: {
        id: p.id,
        label: truncate(p.title, 40),
        year: p.year || '?',
        rating: p.rating || 0,
        takeaway: p.takeaway || '',
        annotations: p.annotations || [],
        tagIds: [...new Set((p.annotations || []).map(a => a.tagId))],
      }
    }));

    // Edges: connect papers sharing ≥1 tag
    const edges = [];
    for (let i = 0; i < papers.length; i++) {
      for (let j = i + 1; j < papers.length; j++) {
        const tagsA = new Set((papers[i].annotations || []).map(a => a.tagId));
        const tagsB = new Set((papers[j].annotations || []).map(a => a.tagId));
        const shared = [...tagsA].filter(t => tagsB.has(t));
        if (shared.length) {
          edges.push({
            data: {
              id: `e_${papers[i].id}_${papers[j].id}`,
              source: papers[i].id,
              target: papers[j].id,
              weight: shared.length,
              sharedTagIds: shared,
            }
          });
        }
      }
    }

    // Destroy old instance
    if (_cy) { _cy.destroy(); _cy = null; }

    const container = document.getElementById('cy');
    if (!container) return;

    _cy = cytoscape({
      container,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'font-size': '11px',
            'font-family': 'Inter, sans-serif',
            'color': '#3A5248',
            'background-color': '#FFFFFF',
            'border-width': 2,
            'border-color': '#2A5C45',
            'width': 36,
            'height': 36,
            'text-wrap': 'wrap',
            'text-max-width': '100px',
          }
        },
        {
          selector: 'node[rating > 3]',
          style: {
            'background-color': '#2A5C45',
            'border-color': '#224D3A',
            'color': '#1A2E25',
            'width': 44,
            'height': 44,
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#E8A022',
            'border-width': 3,
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 'mapData(weight, 1, 5, 1.5, 4)',
            'line-color': '#D6EAE0',
            'curve-style': 'bezier',
            'opacity': 0.7,
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#2A5C45',
            'opacity': 1,
          }
        },
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 120,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 40,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      },
    });

    // Hover tooltip
    const tooltip = document.getElementById('graph-tooltip');

    _cy.on('mouseover', 'node', e => {
      const node = e.target;
      const d    = node.data();
      const paper = State.getPapers().find(p => p.id === d.id);
      if (!paper) return;

      const tagNames = d.tagIds
        .map(id => State.getTagById(id))
        .filter(Boolean)
        .map(t => `<span class="tag-chip" style="background:${t.color}20;border-color:${t.color};color:${t.color}">${escHtml(t.name)}</span>`)
        .join('');

      const stars = d.rating ? '★'.repeat(d.rating) + '☆'.repeat(5 - d.rating) : '';

      tooltip.innerHTML = `
        <div class="graph-tooltip__title">${escHtml(paper.title)}</div>
        <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:4px">${paper.year || ''} · ${(paper.authors || []).slice(0, 2).join(', ')}</div>
        ${stars ? `<div style="color:var(--color-warning);font-size:13px;margin-bottom:4px">${stars}</div>` : ''}
        ${d.takeaway ? `<div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:6px;font-style:italic">${escHtml(d.takeaway.slice(0, 100))}${d.takeaway.length > 100 ? '…' : ''}</div>` : ''}
        ${tagNames ? `<div class="graph-tooltip__tags">${tagNames}</div>` : ''}
        <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:6px">${d.annotations.length} annotation${d.annotations.length !== 1 ? 's' : ''} · click to open</div>
      `;
      tooltip.style.display = 'block';
    });

    _cy.on('mousemove', e => {
      tooltip.style.left = (e.originalEvent.clientX + 16) + 'px';
      tooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';
    });

    _cy.on('mouseout', 'node', () => {
      tooltip.style.display = 'none';
    });

    // Click node → open in reader
    _cy.on('tap', 'node', e => {
      const paperId = e.target.data('id');
      Workspace.switchMode('reading');
      setTimeout(() => Reader.openPaper(paperId), 100);
    });

    // Build legend
    renderLegend(tags);
  }

  function renderLegend(tags) {
    const legend = document.getElementById('graph-legend');
    legend.innerHTML = `<div class="graph-legend__title">Tags</div>`;

    const usedTagIds = new Set(
      State.getAllAnnotations().map(a => a.tagId)
    );

    tags.filter(t => usedTagIds.has(t.id)).forEach(tag => {
      const item = document.createElement('div');
      item.className = 'graph-legend__item';
      item.innerHTML = `
        <div class="graph-legend__swatch" style="background:${tag.color}"></div>
        <span>${escHtml(tag.name)}</span>
      `;
      legend.appendChild(item);
    });

    if (!usedTagIds.size) {
      legend.innerHTML += `<div style="font-size:11px;color:var(--color-text-tertiary)">Annotate papers to see connections</div>`;
    }

    // Node size note
    const noteEl = document.createElement('div');
    noteEl.style.cssText = 'font-size:10px;color:var(--color-text-tertiary);margin-top:4px;border-top:1px solid var(--color-border-subtle);padding-top:6px';
    noteEl.textContent = 'Larger nodes = rated ★★★★+';
    legend.appendChild(noteEl);
  }

  function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : str;
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  return { init, render };
})();

/* ─────────────────────────────────────────────
   Graph — Obsidian-inspired knowledge graph
   Nodes = papers, sized by annotation count
   Edges = shared tags, opacity by weight
   Dark canvas, small dots, minimal labels
───────────────────────────────────────────── */

const Graph = (() => {

  let _cy = null;

  function init() {}

  function render() {
    const papers = State.getPapers();
    const tags   = State.getAllTags();
    const allAnnotations = State.getAllAnnotations();

    // Map paperId → annotations
    const annotByPaper = {};
    allAnnotations.forEach(a => {
      if (!annotByPaper[a.paperId]) annotByPaper[a.paperId] = [];
      annotByPaper[a.paperId].push(a);
    });

    // Build nodes — size by annotation count, color by dominant tag
    const nodes = papers.map(p => {
      const anns    = annotByPaper[p.id] || [];
      const tagIds  = [...new Set(anns.map(a => a.tagId))];

      // Dominant tag = most annotated tag
      const tagCounts = {};
      anns.forEach(a => { tagCounts[a.tagId] = (tagCounts[a.tagId] || 0) + 1; });
      const dominantTagId = tagIds.sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0))[0];
      const dominantTag   = dominantTagId ? State.getTagById(dominantTagId) : null;
      const nodeColor     = dominantTag?.color || '#4a7c6f';

      return {
        data: {
          id:           p.id,
          label:        truncate(p.title, 32),
          year:         p.year || '?',
          rating:       p.rating || 0,
          takeaway:     p.takeaway || '',
          annotCount:   anns.length,
          tagIds,
          dominantColor: nodeColor,
        }
      };
    });

    // Edges: papers sharing ≥1 tag
    const edges = [];
    for (let i = 0; i < papers.length; i++) {
      for (let j = i + 1; j < papers.length; j++) {
        const tagsA = new Set((annotByPaper[papers[i].id] || []).map(a => a.tagId));
        const tagsB = new Set((annotByPaper[papers[j].id] || []).map(a => a.tagId));
        const shared = [...tagsA].filter(t => tagsB.has(t));
        if (shared.length) {
          edges.push({
            data: {
              id:           `e_${papers[i].id}_${papers[j].id}`,
              source:       papers[i].id,
              target:       papers[j].id,
              weight:       shared.length,
              sharedTagIds: shared,
            }
          });
        }
      }
    }

    if (_cy) { _cy.destroy(); _cy = null; }

    const container = document.getElementById('cy');
    if (!container) return;

    _cy = cytoscape({
      container,
      elements: [...nodes, ...edges],
      style: [
        // ── Base node ────────────────────────────
        {
          selector: 'node',
          style: {
            'label':           'data(label)',
            'text-valign':     'bottom',
            'text-halign':     'center',
            'text-margin-y':   5,
            'font-size':       '9px',
            'font-family':     'Inter, sans-serif',
            'font-weight':     '400',
            'color':           'rgba(255,255,255,0.45)',
            'text-wrap':       'none',
            'background-color': 'data(dominantColor)',
            'border-width':    0,
            'width':           10,
            'height':          10,
            'min-zoomed-font-size': 8,
          }
        },
        // Larger dot for annotated papers
        {
          selector: 'node[annotCount > 0]',
          style: {
            'width':  'mapData(annotCount, 1, 10, 10, 20)',
            'height': 'mapData(annotCount, 1, 10, 10, 20)',
          }
        },
        // Highly rated papers glow
        {
          selector: 'node[rating > 3]',
          style: {
            'border-width': 1.5,
            'border-color': 'rgba(255,210,100,0.7)',
            'border-opacity': 0.8,
          }
        },
        // Hover state
        {
          selector: 'node.hover',
          style: {
            'color':        'rgba(255,255,255,0.9)',
            'font-size':    '10px',
            'font-weight':  '500',
            'border-width': 1.5,
            'border-color': 'rgba(255,255,255,0.5)',
          }
        },
        // Selected state
        {
          selector: 'node:selected',
          style: {
            'border-width': 2,
            'border-color': 'rgba(255,255,255,0.85)',
            'color':        'rgba(255,255,255,0.95)',
          }
        },
        // ── Base edge ────────────────────────────
        {
          selector: 'edge',
          style: {
            'width':       'mapData(weight, 1, 5, 0.5, 1.5)',
            'line-color':  'rgba(255,255,255,0.08)',
            'curve-style': 'haystack',
            'opacity':     1,
          }
        },
        // Edge highlight when node hovered
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': 'rgba(255,255,255,0.3)',
            'width':      'mapData(weight, 1, 5, 1, 2.5)',
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': 'rgba(255,255,255,0.5)',
          }
        },
      ],
      layout: {
        name:             'cose',
        idealEdgeLength:  80,
        nodeOverlap:      10,
        refresh:          20,
        fit:              true,
        padding:          48,
        randomize:        false,
        componentSpacing: 60,
        nodeRepulsion:    600000,
        edgeElasticity:   80,
        nestingFactor:    5,
        gravity:          60,
        numIter:          1000,
        initialTemp:      200,
        coolingFactor:    0.95,
        minTemp:          1.0,
      },
      // Disable default box selection outline
      boxSelectionEnabled: false,
      selectionType: 'single',
    });

    // ── Hover interactions ────────────────────
    const tooltip = document.getElementById('graph-tooltip');

    _cy.on('mouseover', 'node', e => {
      const node = e.target;
      node.addClass('hover');
      // Highlight connected edges
      node.connectedEdges().addClass('highlighted');
      node.neighborhood('node').addClass('hover');

      // Show tooltip
      const d     = node.data();
      const paper = State.getPapers().find(p => p.id === d.id);
      if (!paper) return;

      const tagChips = d.tagIds
        .map(id => State.getTagById(id))
        .filter(Boolean)
        .map(t => `<span style="display:inline-block;padding:1px 6px;border-radius:10px;background:${t.color}22;border:1px solid ${t.color}66;color:${t.color};font-size:10px;margin:1px">${escHtml(t.name)}</span>`)
        .join('');

      const stars = d.rating
        ? `<span style="color:#f5c542;letter-spacing:1px;font-size:11px">${'★'.repeat(d.rating)}${'☆'.repeat(5 - d.rating)}</span>`
        : '';

      tooltip.innerHTML = `
        <div style="font-weight:500;font-size:12px;color:rgba(255,255,255,0.9);margin-bottom:3px;line-height:1.4">${escHtml(paper.title)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px">${paper.year || ''} · ${(paper.authors || []).slice(0, 2).join(', ') || 'Unknown'}</div>
        ${stars ? `<div style="margin-bottom:4px">${stars}</div>` : ''}
        ${d.takeaway ? `<div style="font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:5px;font-style:italic">${escHtml(d.takeaway.slice(0, 90))}${d.takeaway.length > 90 ? '…' : ''}</div>` : ''}
        ${tagChips ? `<div style="margin-bottom:4px">${tagChips}</div>` : ''}
        <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">${d.annotCount} annotation${d.annotCount !== 1 ? 's' : ''} · click to open</div>
      `;
      tooltip.style.display = 'block';
    });

    _cy.on('mousemove', e => {
      if (tooltip.style.display === 'none') return;
      tooltip.style.left = (e.originalEvent.clientX + 16) + 'px';
      tooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';
    });

    _cy.on('mouseout', 'node', e => {
      const node = e.target;
      node.removeClass('hover');
      node.connectedEdges().removeClass('highlighted');
      node.neighborhood('node').removeClass('hover');
      tooltip.style.display = 'none';
    });

    // ── Click → open in reader ────────────────
    _cy.on('tap', 'node', e => {
      const paperId = e.target.data('id');
      Workspace.switchMode('reading');
      setTimeout(() => Reader.openPaper(paperId), 100);
    });

    // ── Legend ───────────────────────────────
    renderLegend(tags);

    // ── Zoom controls ────────────────────────
    bindZoomControls();
  }

  function renderLegend(tags) {
    const legend = document.getElementById('graph-legend');
    legend.innerHTML = '';

    const usedTagIds = new Set(State.getAllAnnotations().map(a => a.tagId));
    const usedTags   = tags.filter(t => usedTagIds.has(t.id));

    if (!usedTags.length) {
      legend.innerHTML = `<div style="font-size:10px;color:rgba(255,255,255,0.25)">Annotate papers to see connections</div>`;
      return;
    }

    usedTags.forEach(tag => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:5px;cursor:default';
      item.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${tag.color};flex-shrink:0;display:inline-block"></span>
        ${escHtml(tag.name)}
      `;
      legend.appendChild(item);
    });

    // Node size note
    const note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.2);margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px';
    note.textContent   = 'Node size = annotation count';
    legend.appendChild(note);
  }

  function bindZoomControls() {
    const zoomIn  = document.getElementById('graph-zoom-in');
    const zoomOut = document.getElementById('graph-zoom-out');
    const zoomFit = document.getElementById('graph-zoom-fit');
    if (!_cy) return;
    if (zoomIn)  zoomIn.onclick  = () => _cy.zoom({ level: _cy.zoom() * 1.3, renderedPosition: centrePos() });
    if (zoomOut) zoomOut.onclick = () => _cy.zoom({ level: _cy.zoom() * 0.77, renderedPosition: centrePos() });
    if (zoomFit) zoomFit.onclick = () => _cy.fit(undefined, 48);
  }

  function centrePos() {
    const container = document.getElementById('cy');
    return { x: container.clientWidth / 2, y: container.clientHeight / 2 };
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

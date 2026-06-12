/* ─────────────────────────────────────────────
   Graph — Obsidian-inspired knowledge graph
   Nodes  = papers, sized by annotation count
   Edges  = two types:
     • "cited"      — paper A references paper B (from OpenAlex metadata)
     • "contextual" — LLM clusters papers by topic similarity
───────────────────────────────────────────── */

const Graph = (() => {

  let _cy = null;

  // Layout options reused for initial render + optional re-run
  const LAYOUT = {
    name:             'cose',
    idealEdgeLength:  110,
    nodeOverlap:      8,
    refresh:          20,
    fit:              true,
    padding:          60,
    randomize:        false,
    componentSpacing: 80,
    nodeRepulsion:    1200000,
    edgeElasticity:   80,
    nestingFactor:    5,
    gravity:          40,
    numIter:          1000,
    initialTemp:      200,
    coolingFactor:    0.95,
    minTemp:          1.0,
  };

  function init() {}

  function render() {
    const papers         = State.getPapers();
    const tags           = State.getAllTags();
    const allAnnotations = State.getAllAnnotations();

    // ── Node data ────────────────────────────
    const annotByPaper = {};
    allAnnotations.forEach(a => {
      if (!annotByPaper[a.paperId]) annotByPaper[a.paperId] = [];
      annotByPaper[a.paperId].push(a);
    });

    const nodes = papers.map(p => {
      const anns    = annotByPaper[p.id] || [];
      const tagIds  = [...new Set(anns.map(a => a.tagId))];
      const tagCounts = {};
      anns.forEach(a => { tagCounts[a.tagId] = (tagCounts[a.tagId] || 0) + 1; });
      const dominantTagId = tagIds.sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0))[0];
      const dominantTag   = dominantTagId ? State.getTagById(dominantTagId) : null;

      return {
        data: {
          id:           p.id,
          label:        truncate(p.title, 26),
          year:         p.year || '?',
          rating:       p.rating || 0,
          takeaway:     p.takeaway || '',
          annotCount:   anns.length,
          tagIds,
          dominantColor: dominantTag?.color || '#4a7c6f',
        }
      };
    });

    // ── Cited edges (from stored OpenAlex referenced_works) ──
    const paperIds = new Set(papers.map(p => p.id));
    const citedEdges = [];
    papers.forEach(paper => {
      (paper.referencedWorks || []).forEach(refId => {
        if (paperIds.has(refId) && paper.id !== refId) {
          citedEdges.push({
            data: {
              id:       `cited_${paper.id}_${refId}`,
              source:   paper.id,
              target:   refId,
              edgeType: 'cited',
            }
          });
        }
      });
    });

    // ── Build graph ──────────────────────────
    if (_cy) { _cy.destroy(); _cy = null; }
    const container = document.getElementById('cy');
    if (!container) return;

    _cy = cytoscape({
      container,
      elements: [...nodes, ...citedEdges],
      style: buildStyle(),
      layout: LAYOUT,
      boxSelectionEnabled: false,
      selectionType: 'single',
    });

    // ── Hover interactions ────────────────────
    bindHoverEvents();

    // ── Click → open in reader ────────────────
    _cy.on('tap', 'node', e => {
      Workspace.switchMode('reading');
      setTimeout(() => Reader.openPaper(e.target.data('id')), 100);
    });

    // ── Legend & controls ─────────────────────
    renderLegend(tags, citedEdges.length > 0);
    bindZoomControls();

    // ── Async: LLM contextual edges ───────────
    if (papers.length >= 2) {
      addContextualEdges(papers);
    }
  }

  // ── LLM contextual edge layer ─────────────
  async function addContextualEdges(papers) {
    const badge = document.getElementById('graph-context-loading');
    if (badge) badge.style.display = 'flex';

    try {
      const connections = await API.analyzeGraphConnections(papers);
      if (!_cy) return;

      const toAdd = [];
      connections.forEach(conn => {
        if (!conn.from || !conn.to || conn.from === conn.to) return;
        const src = _cy.$id(conn.from);
        const tgt = _cy.$id(conn.to);
        if (!src.length || !tgt.length) return;

        // Canonical ID (alphabetical so we don't double-add)
        const edgeId = 'ctx_' + [conn.from, conn.to].sort().join('__');
        if (_cy.$id(edgeId).length) return;

        toAdd.push({
          group: 'edges',
          data: {
            id:       edgeId,
            source:   conn.from,
            target:   conn.to,
            edgeType: 'contextual',
            reason:   conn.reason || '',
          }
        });
      });

      if (toAdd.length) {
        _cy.add(toAdd);
        // Update legend to show contextual edge type
        renderLegend(State.getAllTags(), true, true);
      }

    } catch (err) {
      console.error('Contextual edges failed:', err);
    } finally {
      if (badge) badge.style.display = 'none';
    }
  }

  // ── Cytoscape style ───────────────────────
  function buildStyle() {
    return [
      // ── Nodes ─────────────────────────────
      {
        selector: 'node',
        style: {
          'background-color': 'data(dominantColor)',
          'border-width':     0,
          'width':            10,
          'height':           10,
          // Labels hidden by default; appear on hover
          'label':            'data(label)',
          'color':            'rgba(255,255,255,0)',
          'font-size':        '10px',
          'font-family':      'Inter, sans-serif',
          'font-weight':      '400',
          'text-valign':      'bottom',
          'text-halign':      'center',
          'text-margin-y':    6,
          'text-wrap':        'none',
        }
      },
      // Scale dot with annotation count
      {
        selector: 'node[annotCount > 0]',
        style: {
          'width':  'mapData(annotCount, 1, 10, 10, 22)',
          'height': 'mapData(annotCount, 1, 10, 10, 22)',
        }
      },
      // Highly-rated = gold ring
      {
        selector: 'node[rating > 3]',
        style: {
          'border-width': 1.5,
          'border-color': 'rgba(245,197,66,0.75)',
        }
      },
      // Hover: label appears + glow ring
      {
        selector: 'node.hovered',
        style: {
          'color':        'rgba(255,255,255,0.9)',
          'border-width': 2,
          'border-color': 'rgba(255,255,255,0.5)',
        }
      },
      // Dimmed neighbors when something is hovered
      {
        selector: 'node.dimmed',
        style: {
          'opacity': 0.25,
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 2,
          'border-color': 'rgba(255,255,255,0.9)',
          'color':        'rgba(255,255,255,0.95)',
        }
      },

      // ── Cited edges ───────────────────────
      {
        selector: 'edge[edgeType = "cited"]',
        style: {
          'width':               1.2,
          'line-color':          'rgba(74,200,150,0.55)',
          'target-arrow-shape':  'triangle',
          'target-arrow-color':  'rgba(74,200,150,0.55)',
          'arrow-scale':         0.65,
          'curve-style':         'bezier',
          'line-style':          'solid',
          'opacity':             1,
        }
      },
      {
        selector: 'edge[edgeType = "cited"].highlighted',
        style: {
          'line-color':         'rgba(74,220,160,0.9)',
          'target-arrow-color': 'rgba(74,220,160,0.9)',
          'width':              1.8,
        }
      },

      // ── Contextual edges ──────────────────
      {
        selector: 'edge[edgeType = "contextual"]',
        style: {
          'width':         0.8,
          'line-color':    'rgba(255,255,255,0.14)',
          'curve-style':   'haystack',
          'line-style':    'dashed',
          'line-dash-pattern': [5, 5],
          'opacity':       1,
        }
      },
      {
        selector: 'edge[edgeType = "contextual"].highlighted',
        style: {
          'line-color': 'rgba(255,255,255,0.55)',
          'width':      1.2,
        }
      },

      // Dimmed edges
      {
        selector: 'edge.dimmed',
        style: { 'opacity': 0.04 }
      },
    ];
  }

  // ── Hover events ──────────────────────────
  function bindHoverEvents() {
    const tooltip = document.getElementById('graph-tooltip');

    _cy.on('mouseover', 'node', e => {
      const node = e.target;
      node.addClass('hovered');

      const connectedEdges = node.connectedEdges();
      const connectedNodes = node.neighborhood('node');

      connectedEdges.addClass('highlighted');
      // Dim everything not directly connected (but don't class neighbors as hovered — that makes all labels appear)
      _cy.elements()
        .not(node)
        .not(connectedEdges)
        .not(connectedNodes)
        .addClass('dimmed');

      // ── Build tooltip ──
      const d     = node.data();
      const paper = State.getPapers().find(p => p.id === d.id);
      if (!paper) return;

      const tagChips = d.tagIds
        .map(id => State.getTagById(id)).filter(Boolean)
        .map(t => `<span style="display:inline-block;padding:1px 6px;border-radius:10px;background:${t.color}22;border:1px solid ${t.color}66;color:${t.color};font-size:10px;margin:1px">${escHtml(t.name)}</span>`)
        .join('');

      const stars = d.rating
        ? `<span style="color:#f5c542;letter-spacing:1px;font-size:11px">${'★'.repeat(d.rating)}${'☆'.repeat(5 - d.rating)}</span>`
        : '';

      // Collect contextual reasons from connected edges
      const ctxReasons = connectedEdges
        .filter('[edgeType = "contextual"]')
        .map(edge => {
          const otherId = edge.source().id() === d.id ? edge.target().id() : edge.source().id();
          const other   = State.getPapers().find(p => p.id === otherId);
          const reason  = edge.data('reason');
          return other && reason ? `<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:3px">↔ <em>${escHtml(truncate(other.title, 28))}</em>: ${escHtml(reason)}</div>` : null;
        })
        .filter(Boolean);

      const citedCount = connectedEdges.filter('[edgeType = "cited"]').length;
      const footerParts = [
        `${d.annotCount} annotation${d.annotCount !== 1 ? 's' : ''}`,
        citedCount ? `${citedCount} citation link${citedCount > 1 ? 's' : ''}` : '',
        'click to open',
      ].filter(Boolean);

      tooltip.innerHTML = `
        <div style="font-weight:500;font-size:12px;color:rgba(255,255,255,0.9);margin-bottom:3px;line-height:1.4">${escHtml(paper.title)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px">${paper.year || ''}${paper.authors?.length ? ' · ' + paper.authors.slice(0, 2).join(', ') : ''}</div>
        ${stars ? `<div style="margin-bottom:4px">${stars}</div>` : ''}
        ${d.takeaway ? `<div style="font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:5px;font-style:italic">"${escHtml(d.takeaway.slice(0, 90))}${d.takeaway.length > 90 ? '…' : ''}"</div>` : ''}
        ${tagChips ? `<div style="margin-bottom:5px">${tagChips}</div>` : ''}
        ${ctxReasons.join('')}
        <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:5px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">${footerParts.join(' · ')}</div>
      `;
      tooltip.style.display = 'block';
    });

    _cy.on('mousemove', e => {
      if (tooltip.style.display === 'none') return;
      tooltip.style.left = (e.originalEvent.clientX + 16) + 'px';
      tooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';
    });

    _cy.on('mouseout', 'node', () => {
      _cy.elements().removeClass('hovered dimmed highlighted');
      tooltip.style.display = 'none';
    });
    // No edge hover events — reasons are shown in node tooltip to avoid flicker
  }

  // ── Legend ────────────────────────────────
  function renderLegend(tags, hasCited = false, hasContextual = false) {
    const legend = document.getElementById('graph-legend');
    legend.innerHTML = '';

    // Edge type legend
    if (hasCited) {
      legend.innerHTML += `
        <div style="display:flex;align-items:center;gap:7px;font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:5px">
          <span style="display:inline-block;width:18px;height:1.5px;background:rgba(74,200,150,0.7);border-radius:1px;flex-shrink:0"></span>
          Cites
        </div>`;
    }
    if (hasContextual) {
      legend.innerHTML += `
        <div style="display:flex;align-items:center;gap:7px;font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:5px">
          <span style="display:inline-block;width:18px;height:0;border-top:1.5px dashed rgba(255,255,255,0.4);flex-shrink:0"></span>
          Related
        </div>`;
    }

    // Tag dots
    const usedTagIds = new Set(State.getAllAnnotations().map(a => a.tagId));
    const usedTags   = tags.filter(t => usedTagIds.has(t.id));

    if (usedTags.length) {
      if (hasCited || hasContextual) {
        legend.innerHTML += `<div style="height:1px;background:rgba(255,255,255,0.06);margin:6px 0"></div>`;
      }
      usedTags.forEach(tag => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:4px';
        item.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${tag.color};flex-shrink:0;display:inline-block"></span>${escHtml(tag.name)}`;
        legend.appendChild(item);
      });
    }

    if (!usedTags.length && !hasCited && !hasContextual) {
      legend.innerHTML = `<div style="font-size:10px;color:rgba(255,255,255,0.25)">Annotate papers to see connections</div>`;
    }

    // Node size note
    legend.innerHTML += `<div style="font-size:10px;color:rgba(255,255,255,0.18);margin-top:6px;border-top:1px solid rgba(255,255,255,0.05);padding-top:5px">Node size = annotations</div>`;
  }

  // ── Zoom controls ─────────────────────────
  function bindZoomControls() {
    const centre = () => {
      const c = document.getElementById('cy');
      return { x: c.clientWidth / 2, y: c.clientHeight / 2 };
    };
    const zoomIn  = document.getElementById('graph-zoom-in');
    const zoomOut = document.getElementById('graph-zoom-out');
    const zoomFit = document.getElementById('graph-zoom-fit');
    if (!_cy) return;
    if (zoomIn)  zoomIn.onclick  = () => _cy.zoom({ level: _cy.zoom() * 1.3, renderedPosition: centre() });
    if (zoomOut) zoomOut.onclick = () => _cy.zoom({ level: _cy.zoom() * 0.77, renderedPosition: centre() });
    if (zoomFit) zoomFit.onclick = () => _cy.fit(undefined, 60);
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

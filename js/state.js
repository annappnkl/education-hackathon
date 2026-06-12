/* ─────────────────────────────────────────────
   State — single source of truth
   Persisted to localStorage (metadata)
   PDFs stored in IndexedDB
───────────────────────────────────────────── */

const State = (() => {

  const TAG_PRESETS = {
    thesis: [
      { id: 'gap',        name: 'Gap',         color: '#E05050' },
      { id: 'abstract',   name: 'Abstract',    color: '#4A7FA5' },
      { id: 'method',     name: 'Methodology', color: '#8B5CF6' },
      { id: 'results',    name: 'Results',     color: '#2A5C45' },
      { id: 'discussion', name: 'Discussion',  color: '#E8A022' },
      { id: 'citation',   name: 'Citation',    color: '#6B7280' },
      { id: 'limitation', name: 'Limitation',  color: '#EC4899' },
    ],
    paper: [
      { id: 'gap',        name: 'Gap',          color: '#E05050' },
      { id: 'abstract',   name: 'Abstract',     color: '#4A7FA5' },
      { id: 'related',    name: 'Related Work', color: '#8B5CF6' },
      { id: 'method',     name: 'Methodology',  color: '#2A5C45' },
      { id: 'citation',   name: 'Citation',     color: '#6B7280' },
      { id: 'limitation', name: 'Limitation',   color: '#EC4899' },
    ],
    poster: [
      { id: 'finding',    name: 'Key Finding',      color: '#E05050' },
      { id: 'visual',     name: 'Visual Candidate', color: '#4A7FA5' },
      { id: 'method',     name: 'Methodology',      color: '#8B5CF6' },
      { id: 'citation',   name: 'Citation',         color: '#6B7280' },
    ],
    other: [
      { id: 'key',        name: 'Key Point',   color: '#E05050' },
      { id: 'method',     name: 'Methodology', color: '#8B5CF6' },
      { id: 'citation',   name: 'Citation',    color: '#6B7280' },
    ],
  };

  const DEFAULTS = {
    currentScreen: 'onboarding',
    workspaceMode: 'reading',
    project: null,
  };

  let _state = loadFromStorage();

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem('rs_state');
      return raw ? JSON.parse(raw) : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save() {
    try {
      localStorage.setItem('rs_state', JSON.stringify(_state));
    } catch(e) {
      console.warn('State save failed', e);
    }
  }

  function get() { return _state; }

  function setScreen(screen) {
    _state.currentScreen = screen;
    save();
  }

  function setWorkspaceMode(mode) {
    _state.workspaceMode = mode;
    save();
  }

  function createProject({ type, topic }) {
    const presetTags = TAG_PRESETS[type] || TAG_PRESETS.other;
    _state.project = {
      id: uid(),
      type,
      topic,
      createdAt: new Date().toISOString(),
      chatHistory: [],
      papers: [],
      customTags: [],
      writingContent: '',
      discoveryBatchCount: 0,
    };
    _state.project.allTags = [...presetTags];
    save();
    return _state.project;
  }

  function getProject() { return _state.project; }

  function addChatMessage(role, content) {
    if (!_state.project) return;
    _state.project.chatHistory.push({ role, content, ts: Date.now() });
    save();
  }

  // Papers
  function addPapers(papers) {
    if (!_state.project) return;
    _state.project.discoveryBatchCount++;
    const batch = _state.project.discoveryBatchCount;
    papers.forEach(p => {
      if (!_state.project.papers.find(x => x.id === p.id)) {
        _state.project.papers.push({ ...p, discoveryBatch: batch });
      }
    });
    save();
  }

  function getPapers() {
    return _state.project ? _state.project.papers : [];
  }

  function updatePaper(id, updates) {
    if (!_state.project) return;
    const idx = _state.project.papers.findIndex(p => p.id === id);
    if (idx !== -1) {
      _state.project.papers[idx] = { ..._state.project.papers[idx], ...updates };
      save();
    }
  }

  // Tags
  function getAllTags() {
    if (!_state.project) return [];
    return _state.project.allTags || [];
  }

  function addCustomTag(name) {
    if (!_state.project) return null;
    const colors = ['#E05050','#4A7FA5','#8B5CF6','#2A5C45','#E8A022','#EC4899','#14B8A6'];
    const tag = {
      id: uid(),
      name,
      color: colors[_state.project.allTags.length % colors.length],
      isCustom: true,
    };
    _state.project.allTags.push(tag);
    save();
    return tag;
  }

  function getTagById(id) {
    return getAllTags().find(t => t.id === id) || null;
  }

  // Annotations
  function addAnnotation(annotation) {
    if (!_state.project) return;
    const paper = _state.project.papers.find(p => p.id === annotation.paperId);
    if (!paper) return;
    if (!paper.annotations) paper.annotations = [];
    paper.annotations.push({ ...annotation, id: uid(), createdAt: new Date().toISOString() });
    save();
  }

  function getAnnotations(paperId) {
    const paper = getPapers().find(p => p.id === paperId);
    return paper?.annotations || [];
  }

  function getAllAnnotations() {
    return getPapers().flatMap(p => (p.annotations || []).map(a => ({
      ...a,
      paperTitle: p.title,
      paperYear: p.year,
      paperAuthors: p.authors,
    })));
  }

  function removeAnnotation(paperId, annotationId) {
    if (!_state.project) return;
    const paper = _state.project.papers.find(p => p.id === paperId);
    if (!paper?.annotations) return;
    paper.annotations = paper.annotations.filter(a => a.id !== annotationId);
    save();
  }

  // Writing content
  function saveWritingContent(html) {
    if (!_state.project) return;
    _state.project.writingContent = html;
    save();
  }

  function getWritingContent() {
    return _state.project?.writingContent || '';
  }

  function getTagPresets() { return TAG_PRESETS; }

  // ── IndexedDB for PDF binaries ──
  let _db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open('research_studio_pdfs', 1);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore('pdfs');
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror = e => reject(e);
    });
  }

  async function storePDF(id, arrayBuffer) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite');
      tx.objectStore('pdfs').put(arrayBuffer, id);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  }

  async function getPDF(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const req = tx.objectStore('pdfs').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = reject;
    });
  }

  // ── Helpers ──
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function reset() {
    _state = { ...DEFAULTS };
    save();
  }

  return {
    get, setScreen, setWorkspaceMode,
    createProject, getProject,
    addChatMessage,
    addPapers, getPapers, updatePaper,
    getAllTags, addCustomTag, getTagById,
    addAnnotation, getAnnotations, getAllAnnotations, removeAnnotation,
    saveWritingContent, getWritingContent,
    getTagPresets,
    storePDF, getPDF,
    uid, reset,
  };
})();

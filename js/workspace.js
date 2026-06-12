/* ─────────────────────────────────────────────
   Workspace shell — mode switching, top bar
───────────────────────────────────────────── */

const Workspace = (() => {

  let _currentMode = 'reading';

  function init() {
    const project = State.getProject();
    if (!project) return;

    // Project name in top bar
    document.getElementById('workspace-project-name').textContent =
      truncate(project.topic, 48) || 'Research Project';

    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // Back → project overview (onboarding with projects sidebar)
    document.getElementById('workspace-back').addEventListener('click', () => {
      App.showScreen('onboarding');
      Onboarding.renderProjectsSidebar();
    });

    // Add papers (re-trigger discovery)
    document.getElementById('add-papers-btn').addEventListener('click', async () => {
      const topic = project.topic || '';
      await Discovery.load(topic);
      App.showScreen('discovery');
    });

    // Restore mode
    const savedMode = State.get().workspaceMode || 'reading';
    switchMode(savedMode);

    // Init sub-modules
    Reader.init();
    Graph.init();
  }

  function switchMode(mode) {
    _currentMode = mode;
    State.setWorkspaceMode(mode);

    // Update tab UI
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Show/hide mode panels
    document.getElementById('mode-reading').style.display = mode === 'reading' ? 'flex' : 'none';
    document.getElementById('mode-graph').style.display   = mode === 'graph'   ? 'flex' : 'none';
    document.getElementById('mode-writing').style.display = mode === 'writing' ? 'flex' : 'none';

    if (mode === 'graph') {
      Graph.render();
    }

    if (mode === 'writing') {
      Writer.init();
    }

    if (mode === 'reading') {
      Reader.renderSidebar();
    }
  }

  function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : str;
  }

  return { init, switchMode };
})();

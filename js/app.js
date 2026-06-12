/* ─────────────────────────────────────────────
   App — bootstrap & screen router
───────────────────────────────────────────── */

const App = (() => {

  const SCREENS = ['onboarding', 'discovery', 'workspace'];

  function showScreen(name) {
    SCREENS.forEach(id => {
      const el = document.getElementById(`screen-${id}`);
      if (el) el.classList.toggle('active', id === name);
    });
    State.setScreen(name);
  }

  function init() {
    // Init each screen's event listeners
    Onboarding.init();
    Discovery.init();

    // Restore session if a project existed
    const state = State.get();
    if (state.project && state.currentScreen === 'workspace') {
      showScreen('workspace');
      Workspace.init();
    } else if (state.project && state.currentScreen === 'discovery') {
      // Re-show discovery with existing papers
      showScreen('discovery');
      Discovery.init();
    } else {
      showScreen('onboarding');
    }
  }

  // Kick off
  document.addEventListener('DOMContentLoaded', init);

  return { showScreen };
})();

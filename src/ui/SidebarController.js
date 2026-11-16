/**
 * Manages the collapsible sidebar drawer, segmented tabs, mobile backdrop, and Escape key.
 */
export function initSidebarController(store) {
  const appSidebar = document.getElementById('app-sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarNavTabs = document.querySelectorAll('.sidebar-nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  function render({ sidebarOpen, activeTab }) {
    appSidebar?.classList.toggle('open', sidebarOpen);
    sidebarBackdrop?.classList.toggle('open', sidebarOpen);
    btnToggleSidebar?.classList.toggle('active', sidebarOpen);

    sidebarNavTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === activeTab);
    });
    tabPanes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === `tab-pane-${activeTab}`);
    });
  }

  btnToggleSidebar?.addEventListener('click', () => {
    store.setState((s) => ({ sidebarOpen: !s.sidebarOpen }));
  });

  btnCloseSidebar?.addEventListener('click', () => {
    store.setState({ sidebarOpen: false });
  });

  sidebarBackdrop?.addEventListener('click', () => {
    store.setState({ sidebarOpen: false });
  });

  sidebarNavTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      store.setState({ activeTab: tab.dataset.tab });
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.getState().sidebarOpen) {
      store.setState({ sidebarOpen: false });
    }
  });

  store.subscribe(['sidebarOpen', 'activeTab'], (state) => render(state));
  render(store.getState());
}

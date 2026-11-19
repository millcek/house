/**
 * Manages the collapsible sidebar drawer, segmented tabs, mobile swipe-down-to-close,
 * backdrop dismissal, and Escape key handling.
 */
export function initSidebarController(store) {
  const appSidebar = document.getElementById('app-sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarNavTabs = document.querySelectorAll('.sidebar-nav-tab');
  const sidebarTabBim = document.getElementById('sidebar-tab-bim');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const dragHandle = appSidebar?.querySelector('.sidebar-drag-handle');
  const sidebarHeader = appSidebar?.querySelector('.sidebar-header');

  function render({ sidebarOpen, activeTab, selectedElement, sunBarOpen }) {
    appSidebar?.classList.toggle('open', Boolean(sidebarOpen));
    appSidebar?.classList.toggle('wide', activeTab === 'budget');
    sidebarBackdrop?.classList.toggle('open', Boolean(sidebarOpen));
    btnToggleSidebar?.classList.toggle('active', Boolean(sidebarOpen));

    document.body.classList.toggle('sidebar-open', Boolean(sidebarOpen));
    document.body.classList.toggle('sun-bar-open', Boolean(sunBarOpen));

    if (sidebarTabBim) {
      const showBimTab = Boolean(selectedElement) || activeTab === 'bim';
      sidebarTabBim.style.display = showBimTab ? '' : 'none';
    }

    sidebarNavTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === activeTab);
    });
    tabPanes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === `tab-pane-${activeTab}`);
    });
  }

  btnToggleSidebar?.addEventListener('click', () => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    store.setState((s) => {
      const nextOpen = !s.sidebarOpen;
      return {
        sidebarOpen: nextOpen,
        layersMenuOpen: nextOpen ? false : s.layersMenuOpen,
        sunBarOpen: nextOpen && isMobile ? false : s.sunBarOpen,
      };
    });
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

  // Mobile bottom-sheet swipe-down-to-close gesture
  if (appSidebar) {
    let swipePointerId = null;
    let swipeStartY = 0;
    let swipeStartTime = 0;
    let swipeDeltaY = 0;

    const onSwipeStart = (e) => {
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      if (!store.getState().sidebarOpen) return;
      if (e.target.closest('button')) return;

      swipePointerId = e.pointerId;
      swipeStartY = e.clientY;
      swipeStartTime = performance.now();
      swipeDeltaY = 0;
      appSidebar.style.transition = 'none';
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    const onSwipeMove = (e) => {
      if (swipePointerId !== e.pointerId) return;
      const dy = Math.max(0, e.clientY - swipeStartY);
      swipeDeltaY = dy;
      if (dy > 0) {
        appSidebar.style.transform = `translateY(${dy}px)`;
      }
    };

    const onSwipeEnd = (e) => {
      if (swipePointerId !== e.pointerId) return;
      const elapsed = Math.max(1, performance.now() - swipeStartTime);
      const velocity = swipeDeltaY / elapsed;
      const shouldClose = swipeDeltaY > 85 || velocity > 0.45;

      swipePointerId = null;
      appSidebar.style.transition = '';
      appSidebar.style.transform = '';

      if (shouldClose) {
        store.setState({ sidebarOpen: false });
      }
    };

    [dragHandle, sidebarHeader].forEach((el) => {
      if (!el) return;
      el.addEventListener('pointerdown', onSwipeStart);
      el.addEventListener('pointermove', onSwipeMove);
      el.addEventListener('pointerup', onSwipeEnd);
      el.addEventListener('pointercancel', onSwipeEnd);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const drawingsModal = document.getElementById('drawings-modal');
    if (drawingsModal?.classList.contains('open')) return;

    const state = store.getState();
    if (state.layersMenuOpen) {
      store.setState({ layersMenuOpen: false });
    } else if (state.sunBarOpen) {
      store.setState({ sunBarOpen: false });
    } else if (state.sidebarOpen) {
      store.setState({ sidebarOpen: false });
    }
  });

  store.subscribe(['sidebarOpen', 'activeTab', 'selectedElement', 'sunBarOpen'], (state) =>
    render(state)
  );
  render(store.getState());
}

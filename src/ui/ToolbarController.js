/**
 * Manages the floating floor & mode toolbar, right-edge camera/layers rail,
 * layers popover, North compass HUD, brand badge shortcut, and mobile bottom nav.
 */
export function initToolbarController(store, sceneManager) {
  const brandBadge = document.getElementById("brand-badge");
  const btnFit = document.getElementById("btn-fit");
  const btnFloorAll = document.getElementById("btn-floor-all");
  const btnFloor1np = document.getElementById("btn-floor-1np");
  const btnFloor2np = document.getElementById("btn-floor-2np");
  const btnFloorTopdown = document.getElementById("btn-floor-topdown");
  const btnQuickBudget = document.getElementById("btn-quick-budget");
  const btnQuickSun = document.getElementById("btn-quick-sun");
  const compassBadge = document.getElementById("compass-badge");
  const compassDial = document.getElementById("compass-dial");

  const btnLayers = document.getElementById("btn-layers");
  const layersPopover = document.getElementById("layers-popover");
  const btnCloseLayers = document.getElementById("btn-close-layers");
  const layersActiveDot = document.getElementById("layers-active-dot");
  const btnLayerLabels = document.getElementById("btn-layer-labels");
  const btnLayerFurniture = document.getElementById("btn-layer-furniture");
  const btnLayerFootprint = document.getElementById("btn-layer-footprint");
  const btnLayerGrid = document.getElementById("btn-layer-grid");
  const btnLayerPlot = document.getElementById("btn-layer-plot");

  const navMobile3d = document.getElementById("nav-mobile-3d");
  const navMobileDrawings = document.getElementById("nav-mobile-drawings");
  const navMobileSun = document.getElementById("nav-mobile-sun");
  const navMobileBudget = document.getElementById("nav-mobile-budget");
  const navMobileMore = document.getElementById("nav-mobile-more");
  const mobileMoreBadgeDot = document.getElementById("mobile-more-badge-dot");

  let lastPanelTab = "floors";

  const openSiteTab = () => {
    store.setState((s) => ({
      activeTab: "site",
      sidebarOpen: true,
      sunBarOpen: false,
      layersMenuOpen: false,
      drawings: { ...(s.drawings || {}), isOpen: false },
    }));
  };

  brandBadge?.addEventListener("click", openSiteTab);
  brandBadge?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openSiteTab();
    }
  });

  btnFit?.addEventListener("click", () => {
    sceneManager.fitCameraToObject(sceneManager.siteContainer);
    store.setState({ activeRoomId: null, isTopDown: false });
  });

  const selectFloorMode = (mode) => {
    store.setState((s) => ({
      floorMode: mode,
      activeScheduleFloor: mode === "2np" ? "2np" : "1np",
      sliceHeight: null,
      activeRoomId: null,
      drawings: { ...(s.drawings || {}), isOpen: false, sheet: mode === "2np" ? "2np" : "1np" },
    }));
  };

  btnFloorAll?.addEventListener("click", () => {
    const wasTopDown = store.getState().isTopDown;
    if (wasTopDown) sceneManager.exitTopDownView();
    store.setState((s) => ({
      floorMode: "all",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
      drawings: { ...(s.drawings || {}), isOpen: false, sheet: s.drawings?.sheet || "1np" },
    }));
  });

  btnFloor1np?.addEventListener("click", () => selectFloorMode("1np"));
  btnFloor2np?.addEventListener("click", () => selectFloorMode("2np"));

  btnFloorTopdown?.addEventListener("click", () => {
    const state = store.getState();
    if (!state.isTopDown) {
      sceneManager.savePreTopDownCamera();
      sceneManager.setTopDownView(sceneManager.houseContainer);
      store.setState((s) => ({
        floorMode: s.floorMode === "all" ? "1np" : s.floorMode,
        activeScheduleFloor:
          s.floorMode === "all" ? "1np" : s.activeScheduleFloor,
        sliceHeight: null,
        activeRoomId: null,
        isTopDown: true,
        layersMenuOpen: false,
        drawings: { ...(s.drawings || {}), isOpen: false, sheet: s.drawings?.sheet || "1np" },
      }));
    } else {
      sceneManager.exitTopDownView();
      store.setState({ isTopDown: false });
    }
  });

  const toggleBudgetTab = () => {
    store.setState((s) => {
      const closing = s.sidebarOpen && s.activeTab === "budget";
      if (closing) {
        return { sidebarOpen: false };
      }
      return {
        activeTab: "budget",
        sidebarOpen: true,
        sunBarOpen: false,
        layersMenuOpen: false,
        drawings: { ...(s.drawings || {}), isOpen: false },
      };
    });
  };

  const toggleSunBar = () => {
    store.setState((s) => {
      const nextOpen = !s.sunBarOpen;
      return {
        sunBarOpen: nextOpen,
        layersMenuOpen: false,
        sidebarOpen: nextOpen ? false : s.sidebarOpen,
        drawings: { ...(s.drawings || {}), isOpen: false },
      };
    });
  };

  btnQuickBudget?.addEventListener("click", toggleBudgetTab);
  btnQuickSun?.addEventListener("click", toggleSunBar);

  btnLayers?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    store.setState((s) => {
      const nextOpen = !s.layersMenuOpen;
      return {
        layersMenuOpen: nextOpen,
        sunBarOpen: nextOpen ? false : s.sunBarOpen,
        sidebarOpen: nextOpen && isMobile ? false : s.sidebarOpen,
      };
    });
  });

  btnCloseLayers?.addEventListener("click", () => {
    store.setState({ layersMenuOpen: false });
  });

  document.addEventListener("pointerdown", (e) => {
    if (!store.getState().layersMenuOpen) return;
    if (layersPopover?.contains(e.target) || btnLayers?.contains(e.target)) return;
    store.setState({ layersMenuOpen: false });
  });

  btnLayerLabels?.addEventListener("click", () => {
    store.setState((s) => ({ labelsVisible: !s.labelsVisible }));
  });

  btnLayerFurniture?.addEventListener("click", () => {
    store.setState((s) => ({ furnitureVisible: !s.furnitureVisible }));
  });

  btnLayerFootprint?.addEventListener("click", () => {
    store.setState((s) => ({
      site: {
        ...s.site,
        footprintVisible: !s.site?.footprintVisible,
      },
    }));
  });

  btnLayerGrid?.addEventListener("click", () => {
    store.setState((s) => ({
      site: {
        ...s.site,
        gridVisible: !s.site?.gridVisible,
      },
    }));
  });

  btnLayerPlot?.addEventListener("click", () => {
    store.setState((s) => ({
      site: {
        ...s.site,
        plotVisible: !s.site?.plotVisible,
      },
    }));
  });

  // Mobile Bottom Navigation Bar
  navMobile3d?.addEventListener("click", () => {
    store.setState((s) => ({
      sidebarOpen: false,
      sunBarOpen: false,
      layersMenuOpen: false,
      drawings: { ...(s.drawings || {}), isOpen: false },
    }));
  });

  navMobileDrawings?.addEventListener("click", () => {
    store.setState((s) => {
      const targetSheet =
        s.floorMode === "2np" || (s.floorMode === "all" && s.activeScheduleFloor === "2np")
          ? "2np"
          : s.drawings?.sheet || "1np";
      return {
        sidebarOpen: false,
        sunBarOpen: false,
        layersMenuOpen: false,
        drawings: {
          ...(s.drawings || {}),
          isOpen: true,
          sheet: targetSheet,
        },
      };
    });
  });

  navMobileSun?.addEventListener("click", toggleSunBar);
  navMobileBudget?.addEventListener("click", toggleBudgetTab);

  navMobileMore?.addEventListener("click", () => {
    store.setState((s) => {
      if (s.sidebarOpen && s.activeTab !== "budget") {
        return { sidebarOpen: false };
      }
      const nextTab = lastPanelTab && lastPanelTab !== "budget" ? lastPanelTab : "floors";
      return {
        sidebarOpen: true,
        activeTab: nextTab,
        sunBarOpen: false,
        layersMenuOpen: false,
        drawings: { ...(s.drawings || {}), isOpen: false },
      };
    });
  });

  compassBadge?.addEventListener("click", () => {
    sceneManager.alignCameraNorth();
    store.setState({ activeRoomId: null, isTopDown: false });
  });

  sceneManager.onTick(() => {
    if (compassDial) {
      const deg = sceneManager.getCameraAzimuthDeg();
      compassDial.style.transform = `rotate(${deg}deg)`;
    }
  });

  function setToggleRowState(el, active) {
    if (!el) return;
    el.classList.toggle("active", Boolean(active));
    el.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function render(state) {
    const {
      floorMode,
      sliceHeight,
      site,
      labelsVisible,
      furnitureVisible,
      drawings,
      isTopDown,
      sidebarOpen,
      activeTab,
      sunBarOpen,
      layersMenuOpen,
      selectedElement,
    } = state;

    if (activeTab && activeTab !== "budget" && (activeTab !== "bim" || selectedElement)) {
      lastPanelTab = activeTab;
    }

    const drawingsOpen = Boolean(drawings?.isOpen);

    // Always highlight the active floorMode cleanly; Shora highlights independently
    [btnFloorAll, btnFloor1np, btnFloor2np].forEach((b) =>
      b?.classList.remove("btn-primary"),
    );
    if (!drawingsOpen) {
      if (floorMode === "all") btnFloorAll?.classList.add("btn-primary");
      if (floorMode === "1np") btnFloor1np?.classList.add("btn-primary");
      if (floorMode === "2np") btnFloor2np?.classList.add("btn-primary");
    }

    btnFloorTopdown?.classList.toggle("active", Boolean(isTopDown) && !drawingsOpen);
    btnQuickSun?.classList.toggle(
      "btn-primary",
      Boolean(sunBarOpen) || (Boolean(sidebarOpen) && activeTab === "sun"),
    );
    btnQuickBudget?.classList.toggle(
      "btn-primary",
      Boolean(sidebarOpen) && activeTab === "budget",
    );

    // Layers Popover & Rail Button
    btnLayers?.classList.toggle("active", Boolean(layersMenuOpen));
    btnLayers?.setAttribute("aria-expanded", layersMenuOpen ? "true" : "false");
    layersPopover?.classList.toggle("open", Boolean(layersMenuOpen));
    layersPopover?.setAttribute("aria-hidden", layersMenuOpen ? "false" : "true");

    setToggleRowState(btnLayerLabels, labelsVisible);
    setToggleRowState(btnLayerFurniture, furnitureVisible);
    setToggleRowState(btnLayerFootprint, site?.footprintVisible);
    setToggleRowState(btnLayerGrid, site?.gridVisible);
    setToggleRowState(btnLayerPlot, site?.plotVisible);

    const hasCustomLayerState =
      !labelsVisible ||
      !furnitureVisible ||
      Boolean(site?.footprintVisible) ||
      !site?.gridVisible ||
      !site?.plotVisible ||
      typeof sliceHeight === "number";
    if (layersActiveDot) {
      layersActiveDot.style.display = hasCustomLayerState ? "block" : "none";
    }

    // Mobile Bottom Navigation Active States
    const isBudgetActive = Boolean(sidebarOpen) && activeTab === "budget";
    const isSunActive = Boolean(sunBarOpen) || (Boolean(sidebarOpen) && activeTab === "sun");
    const isMoreActive = Boolean(sidebarOpen) && activeTab !== "budget" && activeTab !== "sun";
    const is3dActive = !drawingsOpen && !isSunActive && !sidebarOpen;

    navMobile3d?.classList.toggle("active", is3dActive);
    navMobileDrawings?.classList.toggle("active", drawingsOpen);
    navMobileSun?.classList.toggle("active", isSunActive && !drawingsOpen);
    navMobileBudget?.classList.toggle("active", isBudgetActive && !drawingsOpen);
    navMobileMore?.classList.toggle("active", isMoreActive && !drawingsOpen);

    if (mobileMoreBadgeDot) {
      mobileMoreBadgeDot.style.display = selectedElement ? "block" : "none";
    }
  }

  store.subscribe(
    [
      "floorMode",
      "sliceHeight",
      "site",
      "labelsVisible",
      "furnitureVisible",
      "drawings",
      "isTopDown",
      "sidebarOpen",
      "activeTab",
      "sunBarOpen",
      "layersMenuOpen",
      "selectedElement",
    ],
    (state) => render(state),
  );
  render(store.getState());
}

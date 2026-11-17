/**
 * Manages the top quick-action toolbar and live North compass HUD.
 */
export function initToolbarController(store, sceneManager) {
  const btnFit = document.getElementById("btn-fit");
  const btnFloorAll = document.getElementById("btn-floor-all");
  const btnFloor1np = document.getElementById("btn-floor-1np");
  const btnFloor2np = document.getElementById("btn-floor-2np");
  const btnFloorTopdown = document.getElementById("btn-floor-topdown");
  const btnQuickLabels = document.getElementById("btn-quick-labels");
  const btnQuickFurniture = document.getElementById("btn-quick-furniture");
  const btnQuickFootprint = document.getElementById("btn-quick-footprint");
  const btnQuickBudget = document.getElementById("btn-quick-budget");
  const btnQuickSun = document.getElementById("btn-quick-sun");
  const compassBadge = document.getElementById("compass-badge");
  const compassDial = document.getElementById("compass-dial");

  btnFit?.addEventListener("click", () => {
    sceneManager.fitCameraToObject(sceneManager.siteContainer);
    store.setState({ activeRoomId: null });
  });

  btnFloorAll?.addEventListener("click", () =>
    store.setState((s) => ({
      floorMode: "all",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
      drawings: { isOpen: false, sheet: s.drawings?.sheet || "1np" },
    })),
  );
  btnFloor1np?.addEventListener("click", () =>
    store.setState({
      floorMode: "1np",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
      drawings: { isOpen: false, sheet: "1np" },
    }),
  );
  btnFloor2np?.addEventListener("click", () =>
    store.setState({
      floorMode: "2np",
      activeScheduleFloor: "2np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
      drawings: { isOpen: false, sheet: "2np" },
    }),
  );

  btnFloorTopdown?.addEventListener("click", () => {
    sceneManager.setTopDownView(sceneManager.houseContainer);
    store.setState((s) => ({
      floorMode: s.floorMode === "all" ? "1np" : s.floorMode,
      activeScheduleFloor:
        s.floorMode === "all" ? "1np" : s.activeScheduleFloor,
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: true,
      drawings: { isOpen: false, sheet: s.drawings?.sheet || "1np" },
    }));
  });

  btnQuickLabels?.addEventListener("click", () => {
    store.setState((s) => ({ labelsVisible: !s.labelsVisible }));
  });

  btnQuickFurniture?.addEventListener("click", () => {
    store.setState((s) => ({ furnitureVisible: !s.furnitureVisible }));
  });

  btnQuickFootprint?.addEventListener("click", () => {
    const { site, drawings } = store.getState();
    store.setState({
      activeTab: "site",
      sidebarOpen: true,
      drawings: { isOpen: false, sheet: drawings?.sheet || "1np" },
      site: {
        ...site,
        footprintVisible: true,
      },
    });
  });

  btnQuickBudget?.addEventListener("click", () => {
    store.setState((s) => ({
      activeTab: "budget",
      sidebarOpen: true,
      drawings: { isOpen: false, sheet: s.drawings?.sheet || "1np" },
    }));
  });

  btnQuickSun?.addEventListener("click", () => {
    store.setState((s) => ({
      activeTab: "sun",
      sidebarOpen: true,
      drawings: { isOpen: false, sheet: s.drawings?.sheet || "1np" },
    }));
  });

  compassBadge?.addEventListener("click", () => {
    sceneManager.alignCameraNorth();
    store.setState({ activeRoomId: null });
  });

  sceneManager.onTick(() => {
    if (compassDial) {
      const deg = sceneManager.getCameraAzimuthDeg();
      compassDial.style.transform = `rotate(${deg}deg)`;
    }
  });

  function render({
    floorMode,
    site,
    labelsVisible,
    furnitureVisible,
    drawings,
    isTopDown,
  }) {
    [btnFloorAll, btnFloor1np, btnFloor2np, btnFloorTopdown].forEach((b) =>
      b?.classList.remove("btn-primary"),
    );
    if (!drawings?.isOpen) {
      if (isTopDown) {
        btnFloorTopdown?.classList.add("btn-primary");
      } else {
        if (floorMode === "all") btnFloorAll?.classList.add("btn-primary");
        if (floorMode === "1np") btnFloor1np?.classList.add("btn-primary");
        if (floorMode === "2np") btnFloor2np?.classList.add("btn-primary");
      }
    }

    btnQuickLabels?.classList.toggle("btn-primary", Boolean(labelsVisible));
    btnQuickFurniture?.classList.toggle("btn-primary", Boolean(furnitureVisible));
    btnQuickFootprint?.classList.toggle(
      "btn-primary",
      Boolean(site?.footprintVisible),
    );
  }

  store.subscribe(
    [
      "floorMode",
      "site",
      "labelsVisible",
      "furnitureVisible",
      "drawings",
      "isTopDown",
    ],
    (state) => render(state),
  );
  render(store.getState());
}

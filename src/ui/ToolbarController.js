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
  const btnQuickFootprint = document.getElementById("btn-quick-footprint");
  const btnQuickSun = document.getElementById("btn-quick-sun");
  const compassBadge = document.getElementById("compass-badge");
  const compassDial = document.getElementById("compass-dial");

  btnFit?.addEventListener("click", () => {
    sceneManager.fitCameraToObject(sceneManager.siteContainer);
    store.setState({ activeRoomId: null });
  });

  btnFloorAll?.addEventListener("click", () =>
    store.setState({
      floorMode: "all",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
    }),
  );
  btnFloor1np?.addEventListener("click", () =>
    store.setState({
      floorMode: "1np",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
    }),
  );
  btnFloor2np?.addEventListener("click", () =>
    store.setState({
      floorMode: "2np",
      activeScheduleFloor: "2np",
      sliceHeight: null,
      activeRoomId: null,
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
    }));
  });

  btnQuickLabels?.addEventListener("click", () => {
    store.setState((s) => ({ labelsVisible: !s.labelsVisible }));
  });

  btnQuickFootprint?.addEventListener("click", () => {
    const { site } = store.getState();
    store.setState({
      activeTab: "site",
      sidebarOpen: true,
      site: {
        ...site,
        footprintVisible: true,
      },
    });
  });

  btnQuickSun?.addEventListener("click", () => {
    store.setState({ activeTab: "sun", sidebarOpen: true });
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

  function render({ floorMode, site, labelsVisible }) {
    [btnFloorAll, btnFloor1np, btnFloor2np].forEach((b) =>
      b?.classList.remove("btn-primary"),
    );
    if (floorMode === "all") btnFloorAll?.classList.add("btn-primary");
    if (floorMode === "1np") btnFloor1np?.classList.add("btn-primary");
    if (floorMode === "2np") btnFloor2np?.classList.add("btn-primary");

    btnQuickLabels?.classList.toggle("btn-primary", Boolean(labelsVisible));
    btnQuickFootprint?.classList.toggle(
      "btn-primary",
      Boolean(site?.footprintVisible),
    );
  }

  store.subscribe(["floorMode", "site", "labelsVisible"], (state) => render(state));
  render(store.getState());
}

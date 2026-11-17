import { computeRoomSchedule } from "../builders/RoomBuilder.js";
import { getDesignVariant } from "../designs/index.js";

/**
 * Manages floor view presets, dynamic Y-clipping slider, room labels toggle,
 * and interactive room schedule list with auto-calculated floor totals.
 */
export function initFloorPlanController(
  store,
  sceneManager,
  getActiveConceptModel,
) {
  const btnSidebarAll = document.getElementById("btn-sidebar-all");
  const btnSidebar1np = document.getElementById("btn-sidebar-1np");
  const btnSidebar2np = document.getElementById("btn-sidebar-2np");
  const btnSidebarTopdown = document.getElementById("btn-sidebar-topdown");
  const btnToggleLabels = document.getElementById("btn-toggle-labels");

  const tabFloor1np = document.getElementById("tab-floor-1np");
  const tabFloor2np = document.getElementById("tab-floor-2np");
  const activeFloorBadge = document.getElementById("active-floor-badge");
  const sliceSlider = document.getElementById("slice-slider");
  const sliceVal = document.getElementById("slice-val");
  const roomScheduleContainer = document.getElementById(
    "room-schedule-container",
  );

  function getSchedules() {
    const { activeModelId } = store.getState();
    const design = getDesignVariant(activeModelId);
    return {
      f1: computeRoomSchedule(design.floor1?.rooms || []),
      f2: computeRoomSchedule(design.floor2?.rooms || []),
    };
  }

  function applyVisibilityAndClip(floorMode, labelsVisible, sliceHeight) {
    const model = getActiveConceptModel();

    if (typeof sliceHeight === "number") {
      sceneManager.setClipHeight(sliceHeight);
      if (sliceSlider) sliceSlider.value = String(sliceHeight);
      if (sliceVal) sliceVal.textContent = `${sliceHeight.toFixed(2)} m`;

      if (sliceHeight < 2.8) {
        if (model && model.floor1Group) {
          model.floor1Group.visible = true;
          model.ceiling1Group.visible = false;
          model.floor2Group.visible = false;
          model.roofGroup.visible = false;
          model.labels1np.visible = labelsVisible;
          model.labels2np.visible = false;
        }
        if (activeFloorBadge) activeFloorBadge.textContent = "Řez 1.NP";
      } else if (sliceHeight < 5.6) {
        if (model && model.floor1Group) {
          model.floor1Group.visible = true;
          model.ceiling1Group.visible = true;
          model.floor2Group.visible = true;
          model.roofGroup.visible = false;
          model.labels1np.visible = false;
          model.labels2np.visible = labelsVisible;
        }
        if (activeFloorBadge) activeFloorBadge.textContent = "Řez 2.NP";
      } else {
        if (model && model.floor1Group) {
          model.floor1Group.visible = true;
          model.ceiling1Group.visible = true;
          model.floor2Group.visible = true;
          model.roofGroup.visible = true;
          model.labels1np.visible = floorMode !== "2np" && labelsVisible;
          model.labels2np.visible = floorMode === "2np" && labelsVisible;
        }
        if (activeFloorBadge) activeFloorBadge.textContent = "Řez střechou";
      }
      return;
    }

    let clipHeight = 100.0;
    let sliderValue = 8.5;
    let sliceLabel = "Vše (bez řezu)";

    if (floorMode === "1np") {
      clipHeight = 2.75;
      sliderValue = 2.75;
      sliceLabel = "2.75 m";
    } else if (floorMode === "2np") {
      clipHeight = 5.55;
      sliderValue = 5.55;
      sliceLabel = "5.55 m";
    }

    sceneManager.setClipHeight(clipHeight);
    if (sliceSlider) sliceSlider.value = String(sliderValue);
    if (sliceVal) sliceVal.textContent = sliceLabel;

    if (model && model.floor1Group) {
      if (floorMode === "all") {
        model.floor1Group.visible = true;
        model.ceiling1Group.visible = true;
        model.floor2Group.visible = true;
        model.roofGroup.visible = true;
        model.labels1np.visible = labelsVisible;
        model.labels2np.visible = false;
      } else if (floorMode === "1np") {
        model.floor1Group.visible = true;
        model.ceiling1Group.visible = false;
        model.floor2Group.visible = false;
        model.roofGroup.visible = false;
        model.labels1np.visible = labelsVisible;
        model.labels2np.visible = false;
      } else if (floorMode === "2np") {
        model.floor1Group.visible = true;
        model.ceiling1Group.visible = true;
        model.floor2Group.visible = true;
        model.roofGroup.visible = false;
        model.labels1np.visible = false;
        model.labels2np.visible = labelsVisible;
      }
    }
  }

  function renderSchedule(activeScheduleFloor, activeRoomId) {
    const { f1, f2 } = getSchedules();
    if (tabFloor1np)
      tabFloor1np.textContent = `1.NP (${f1.interiorTotalSqm.toFixed(1)} m²)`;
    if (tabFloor2np)
      tabFloor2np.textContent = `2.NP (${f2.interiorTotalSqm.toFixed(1)} m²)`;

    [tabFloor1np, tabFloor2np].forEach((t) =>
      t?.classList.remove("btn-primary"),
    );
    if (activeScheduleFloor === "2np") {
      tabFloor2np?.classList.add("btn-primary");
    } else {
      tabFloor1np?.classList.add("btn-primary");
    }

    const rooms = activeScheduleFloor === "2np" ? f2.rooms : f1.rooms;
    if (!roomScheduleContainer) return;

    roomScheduleContainer.innerHTML = rooms
      .map(
        (r) => `
        <div class="room-item${r.id === activeRoomId ? " active" : ""}" data-id="${r.id}" data-floor="${activeScheduleFloor}" title="${r.desc}">
          <span class="room-item-name">
            <span class="room-item-id">${r.id}</span>
            ${r.name}
          </span>
          <span class="room-item-area">${r.area}</span>
        </div>`,
      )
      .join("");
  }

  function render(state) {
    const {
      floorMode,
      sliceHeight,
      labelsVisible,
      activeScheduleFloor,
      activeRoomId,
    } = state;
    const { f1, f2 } = getSchedules();

    [btnSidebarAll, btnSidebar1np, btnSidebar2np].forEach((b) =>
      b?.classList.remove("btn-primary"),
    );
    if (floorMode === "all") btnSidebarAll?.classList.add("btn-primary");
    if (floorMode === "1np") btnSidebar1np?.classList.add("btn-primary");
    if (floorMode === "2np") btnSidebar2np?.classList.add("btn-primary");

    if (activeFloorBadge) {
      if (floorMode === "all") activeFloorBadge.textContent = "Celý dům";
      if (floorMode === "1np")
        activeFloorBadge.textContent = `1.NP Přízemí (${f1.interiorTotalSqm.toFixed(1)} m²)`;
      if (floorMode === "2np")
        activeFloorBadge.textContent = `2.NP Patro (${f2.interiorTotalSqm.toFixed(1)} m²)`;
    }

    if (btnToggleLabels) {
      btnToggleLabels.textContent = `🏷️ Popisky místností: ${labelsVisible ? "ON" : "OFF"}`;
      btnToggleLabels.classList.toggle("btn-primary", labelsVisible);
    }

    applyVisibilityAndClip(floorMode, labelsVisible, sliceHeight);
    renderSchedule(activeScheduleFloor, activeRoomId);
  }

  // Event bindings
  btnSidebarAll?.addEventListener("click", () =>
    store.setState({
      floorMode: "all",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
    }),
  );
  btnSidebar1np?.addEventListener("click", () =>
    store.setState({
      floorMode: "1np",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
    }),
  );
  btnSidebar2np?.addEventListener("click", () =>
    store.setState({
      floorMode: "2np",
      activeScheduleFloor: "2np",
      sliceHeight: null,
      activeRoomId: null,
    }),
  );
  btnSidebarTopdown?.addEventListener("click", () => {
    sceneManager.setTopDownView(sceneManager.houseContainer);
    store.setState((s) => ({
      floorMode: s.floorMode === "all" ? "1np" : s.floorMode,
      activeScheduleFloor:
        s.floorMode === "all" ? "1np" : s.activeScheduleFloor,
      sliceHeight: null,
      activeRoomId: null,
    }));
  });

  tabFloor1np?.addEventListener("click", () =>
    store.setState({
      floorMode: "1np",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
    }),
  );
  tabFloor2np?.addEventListener("click", () =>
    store.setState({
      floorMode: "2np",
      activeScheduleFloor: "2np",
      sliceHeight: null,
      activeRoomId: null,
    }),
  );

  btnToggleLabels?.addEventListener("click", () => {
    store.setState((s) => ({ labelsVisible: !s.labelsVisible }));
  });

  // Click room item -> switch to that floor and focus camera on room
  roomScheduleContainer?.addEventListener("click", (e) => {
    const itemEl = e.target.closest(".room-item");
    if (!itemEl) return;

    const roomId = itemEl.dataset.id;
    const floorKey = itemEl.dataset.floor;
    const { f1, f2 } = getSchedules();
    const list = floorKey === "2np" ? f2.rooms : f1.rooms;
    const room = list.find((r) => r.id === roomId);
    if (!room) return;

    sceneManager.focusHousePoint(room.pos, 9);
    store.setState({
      floorMode: floorKey,
      activeScheduleFloor: floorKey,
      sliceHeight: null,
      activeRoomId: roomId,
    });
  });

  sliceSlider?.addEventListener("input", (e) => {
    const h = parseFloat(e.target.value);
    store.setState({ sliceHeight: h });
  });

  store.subscribe(
    [
      "floorMode",
      "sliceHeight",
      "labelsVisible",
      "activeScheduleFloor",
      "activeRoomId",
      "activeModelId",
    ],
    (state) => render(state),
  );
  render(store.getState());
}

import { computeRoomSchedule } from "../builders/RoomBuilder.js";
import { defaultDesign } from "../designs/index.js";

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
  const btnToggleFurniture = document.getElementById("btn-toggle-furniture");

  const tabFloor1np = document.getElementById("tab-floor-1np");
  const tabFloor2np = document.getElementById("tab-floor-2np");
  const activeFloorBadge = document.getElementById("active-floor-badge");
  const sliceSlider = document.getElementById("slice-slider");
  const sliceVal = document.getElementById("slice-val");
  const quickSliceSlider = document.getElementById("quick-slice-slider");
  const quickSliceVal = document.getElementById("quick-slice-val");
  const btnQuickSliceReset = document.getElementById("btn-quick-slice-reset");
  const roomScheduleContainer = document.getElementById(
    "room-schedule-container",
  );

  function getSchedules() {
    const design = store.getState().activeDesign || defaultDesign;
    return {
      f1: computeRoomSchedule(design.floor1?.rooms || [], design.floor1),
      f2: computeRoomSchedule(design.floor2?.rooms || [], design.floor2),
    };
  }

  function applyVisibilityAndClip(floorMode, labelsVisible, furnitureVisible, sliceHeight) {
    const model = getActiveConceptModel();
    const design = store.getState().activeDesign || defaultDesign;
    const c1Y = design.ceilingSlab?.y ?? 2.95;
    const c2Y = design.roof?.y ?? design.ceiling2Slab?.y ?? 6.12;
    const maxH = Number((c2Y + (design.roof?.height ?? 2.0)).toFixed(1));

    if (model) {
      if (model.furniture1np) model.furniture1np.visible = Boolean(furnitureVisible);
      if (model.furniture2np) model.furniture2np.visible = Boolean(furnitureVisible);
    }

    if (typeof sliceHeight === "number") {
      sceneManager.setClipHeight(sliceHeight);
      if (sliceSlider) sliceSlider.value = String(sliceHeight);
      if (sliceVal) sliceVal.textContent = `${sliceHeight.toFixed(2)} m`;
      if (quickSliceSlider) quickSliceSlider.value = String(sliceHeight);
      if (quickSliceVal) quickSliceVal.textContent = `${sliceHeight.toFixed(2)} m`;
      if (btnQuickSliceReset) btnQuickSliceReset.style.display = "inline-flex";

      if (sliceHeight < c1Y) {
        if (model && model.floor1Group) {
          model.floor1Group.visible = true;
          model.ceiling1Group.visible = false;
          model.floor2Group.visible = false;
          model.roofGroup.visible = false;
          model.labels1np.visible = labelsVisible;
          model.labels2np.visible = false;
        }
        if (activeFloorBadge) activeFloorBadge.textContent = "Řez 1.NP";
      } else if (sliceHeight < c2Y) {
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
    let sliderValue = maxH;
    let sliceLabel = "Vše (bez řezu)";

    if (floorMode === "1np") {
      clipHeight = c1Y;
      sliderValue = c1Y;
      sliceLabel = `${c1Y.toFixed(2)} m`;
    } else if (floorMode === "2np") {
      clipHeight = c2Y;
      sliderValue = c2Y;
      sliceLabel = `${c2Y.toFixed(2)} m`;
    }

    sceneManager.setClipHeight(clipHeight);
    if (sliceSlider) sliceSlider.value = String(sliderValue);
    if (sliceVal) sliceVal.textContent = sliceLabel;
    if (quickSliceSlider) quickSliceSlider.value = String(sliderValue);
    if (quickSliceVal) quickSliceVal.textContent = floorMode === "all" ? "Vše" : sliceLabel;
    if (btnQuickSliceReset) btnQuickSliceReset.style.display = "none";

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
    const design = store.getState().activeDesign || defaultDesign;
    const hasFloor2 = Boolean(design.floor2);
    const { f1, f2 } = getSchedules();
    if (tabFloor1np)
      tabFloor1np.textContent = hasFloor2
        ? `1.NP (${f1.interiorTotalSqm.toFixed(1)} m²)`
        : `1.NP Bungalov (${f1.interiorTotalSqm.toFixed(1)} m²)`;
    if (tabFloor2np) {
      tabFloor2np.style.display = hasFloor2 ? "" : "none";
      if (hasFloor2) {
        tabFloor2np.textContent = `2.NP (${f2.interiorTotalSqm.toFixed(1)} m²)`;
      }
    }

    [tabFloor1np, tabFloor2np].forEach((t) =>
      t?.classList.remove("btn-primary"),
    );
    if (hasFloor2 && activeScheduleFloor === "2np") {
      tabFloor2np?.classList.add("btn-primary");
    } else {
      tabFloor1np?.classList.add("btn-primary");
    }

    const rooms = (hasFloor2 && activeScheduleFloor === "2np") ? f2.rooms : f1.rooms;
    if (!roomScheduleContainer) return;

    roomScheduleContainer.innerHTML = rooms
      .map(
        (r) => `
        <div class="room-item${r.id === activeRoomId ? " active" : ""}" data-id="${r.id}" data-floor="${hasFloor2 ? activeScheduleFloor : '1np'}" title="${r.desc}">
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
      furnitureVisible,
      activeScheduleFloor,
      activeRoomId,
    } = state;
    const design = store.getState().activeDesign || defaultDesign;
    const hasFloor2 = Boolean(design.floor2);

    if (btnSidebar2np) {
      btnSidebar2np.style.display = hasFloor2 ? "" : "none";
    }

    if (!hasFloor2 && (floorMode === "2np" || activeScheduleFloor === "2np")) {
      store.setState({ floorMode: "1np", activeScheduleFloor: "1np" });
      return;
    }

    const { f1, f2 } = getSchedules();

    [btnSidebarAll, btnSidebar1np, btnSidebar2np].forEach((b) =>
      b?.classList.remove("btn-primary"),
    );
    if (floorMode === "all") btnSidebarAll?.classList.add("btn-primary");
    if (floorMode === "1np") btnSidebar1np?.classList.add("btn-primary");
    if (hasFloor2 && floorMode === "2np") btnSidebar2np?.classList.add("btn-primary");

    if (activeFloorBadge) {
      if (floorMode === "all") activeFloorBadge.textContent = "Celý dům";
      if (floorMode === "1np")
        activeFloorBadge.textContent = hasFloor2
          ? `1.NP Přízemí (${f1.interiorTotalSqm.toFixed(1)} m²)`
          : `Přízemní bungalov (${f1.interiorTotalSqm.toFixed(1)} m²)`;
      if (hasFloor2 && floorMode === "2np")
        activeFloorBadge.textContent = `2.NP Patro (${f2.interiorTotalSqm.toFixed(1)} m²)`;
    }

    if (btnToggleLabels) {
      btnToggleLabels.textContent = `🏷️ Popisky místností: ${labelsVisible ? "ON" : "OFF"}`;
      btnToggleLabels.classList.toggle("btn-primary", labelsVisible);
    }

    if (btnToggleFurniture) {
      btnToggleFurniture.textContent = `🛋️ Nábytek a vybavení: ${furnitureVisible ? "ON" : "OFF"}`;
      btnToggleFurniture.classList.toggle("btn-primary", furnitureVisible);
    }

    applyVisibilityAndClip(floorMode, labelsVisible, furnitureVisible, sliceHeight);
    renderSchedule(activeScheduleFloor, activeRoomId);
  }

  // Event bindings
  btnSidebarAll?.addEventListener("click", () =>
    store.setState({
      floorMode: "all",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
    }),
  );
  btnSidebar1np?.addEventListener("click", () =>
    store.setState({
      floorMode: "1np",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
    }),
  );
  btnSidebar2np?.addEventListener("click", () =>
    store.setState({
      floorMode: "2np",
      activeScheduleFloor: "2np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
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
      isTopDown: true,
    }));
  });

  tabFloor1np?.addEventListener("click", () =>
    store.setState({
      floorMode: "1np",
      activeScheduleFloor: "1np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
    }),
  );
  tabFloor2np?.addEventListener("click", () =>
    store.setState({
      floorMode: "2np",
      activeScheduleFloor: "2np",
      sliceHeight: null,
      activeRoomId: null,
      isTopDown: false,
    }),
  );

  btnToggleLabels?.addEventListener("click", () => {
    store.setState((s) => ({ labelsVisible: !s.labelsVisible }));
  });

  btnToggleFurniture?.addEventListener("click", () => {
    store.setState((s) => ({ furnitureVisible: !s.furnitureVisible }));
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
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    store.setState({
      floorMode: floorKey,
      activeScheduleFloor: floorKey,
      sliceHeight: null,
      activeRoomId: roomId,
      ...(isMobile ? { sidebarOpen: false } : {}),
    });
  });

  sliceSlider?.addEventListener("input", (e) => {
    const h = parseFloat(e.target.value);
    store.setState({ sliceHeight: h });
  });

  quickSliceSlider?.addEventListener("input", (e) => {
    const h = parseFloat(e.target.value);
    store.setState({ sliceHeight: h });
  });

  btnQuickSliceReset?.addEventListener("click", () => {
    store.setState({ sliceHeight: null });
  });

  store.subscribe(
    [
      "floorMode",
      "sliceHeight",
      "labelsVisible",
      "furnitureVisible",
      "activeScheduleFloor",
      "activeRoomId",
      "activeModelId",
    ],
    (state) => render(state),
  );
  render(store.getState());
}

import { computeRoomSchedule } from "../builders/RoomBuilder.js";
import { updateSetbackDimensions } from "../builders/SiteBuilder.js";
import { DESIGN_VARIANTS, getDesignVariant } from "../designs/index.js";

const VALID_TABS = new Set(["floors", "sun", "site", "model", "bim", "budget"]);
const DISCRETE_KEYS = [
  "floorMode",
  "activeRoomId",
  "sidebarOpen",
  "activeTab",
  "activeModelId",
];
const CONTINUOUS_KEYS = ["sliceHeight", "sun", "site", "labelsVisible"];

const FLOOR_MODE_TO_VIEW = {
  all: "dum",
  "1np": "1np",
  "2np": "2np",
};

const fmtCoord = (n) => Number(n.toFixed(1)) || 0;
const fmtDecimal = (n) => Number(n.toFixed(2)) || 0;

function parseVec3(str) {
  if (!str) return null;
  const raw = str.split(",");
  if (raw.length !== 3) return null;
  const parts = raw.map((s) => {
    const trimmed = s.trim();
    return trimmed === "" ? NaN : Number(trimmed);
  });
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts;
}

function parseViewParam(rawView) {
  const normalized = (rawView || "").trim().toLowerCase();
  if (
    normalized === "1np" ||
    normalized === "1.np" ||
    normalized === "floor1"
  ) {
    return {
      floorMode: "1np",
      activeScheduleFloor: "1np",
      isTopDownPreset: false,
    };
  }
  if (
    normalized === "2np" ||
    normalized === "2.np" ||
    normalized === "floor2"
  ) {
    return {
      floorMode: "2np",
      activeScheduleFloor: "2np",
      isTopDownPreset: false,
    };
  }
  if (normalized === "topdown" || normalized === "pudorys") {
    return {
      floorMode: "1np",
      activeScheduleFloor: "1np",
      isTopDownPreset: true,
    };
  }
  return {
    floorMode: "all",
    activeScheduleFloor: "1np",
    isTopDownPreset: false,
  };
}

function findRoomById(modelId, roomId) {
  if (!roomId) return null;
  const design = getDesignVariant(modelId);
  const f1 = computeRoomSchedule(
    design.floor1?.rooms || [],
    design.floor1,
  ).rooms;
  const match1 = f1.find((r) => r.id === roomId);
  if (match1) return { floorKey: "1np", room: match1 };

  const f2 = computeRoomSchedule(
    design.floor2?.rooms || [],
    design.floor2,
  ).rooms;
  const match2 = f2.find((r) => r.id === roomId);
  if (match2) return { floorKey: "2np", room: match2 };

  return null;
}

/**
 * Builds the canonical URL query string (e.g. `?view=dum&cam=25,25,35&target=0,2,0`)
 * from the current application store state and Three.js camera/controls.
 */
export function buildSearchString(state, sceneManager, siteConfig) {
  const params = new URLSearchParams();

  params.set("view", FLOOR_MODE_TO_VIEW[state.floorMode] || "dum");

  if (state.activeRoomId) {
    params.set("room", state.activeRoomId);
  }

  if (typeof state.sliceHeight === "number") {
    params.set("slice", String(fmtDecimal(state.sliceHeight)));
  }

  const cam = sceneManager.camera.position;
  const target = sceneManager.controls.target;
  params.set("cam", `${fmtCoord(cam.x)},${fmtCoord(cam.y)},${fmtCoord(cam.z)}`);
  params.set(
    "target",
    `${fmtCoord(target.x)},${fmtCoord(target.y)},${fmtCoord(target.z)}`,
  );

  if (state.sidebarOpen && VALID_TABS.has(state.activeTab)) {
    params.set("tab", state.activeTab);
  }

  if (state.sun.dayOfYear !== 172 || state.sun.hour !== 14) {
    params.set("day", String(Math.round(state.sun.dayOfYear)));
    params.set("hour", String(fmtDecimal(state.sun.hour)));
  }

  const defaultPos = siteConfig?.defaultHousePos || { x: 4.5, z: 1.0, rotY: 0 };
  const { x, z, rotY } = state.site.housePos;
  if (x !== defaultPos.x || z !== defaultPos.z || rotY !== defaultPos.rotY) {
    params.set("pos", `${fmtCoord(x)},${fmtCoord(z)},${fmtCoord(rotY)}`);
  }

  if (!state.labelsVisible) params.set("labels", "0");
  if (!state.site.gridVisible) params.set("grid", "0");
  if (!state.site.plotVisible) params.set("plot", "0");

  if (
    state.activeModelId !== "concept" &&
    DESIGN_VARIANTS[state.activeModelId]
  ) {
    params.set("model", state.activeModelId);
  }

  return `?${params.toString().replace(/%2C/gi, ",")}`;
}

/**
 * Synchronizes viewer navigation & scene state with URL query parameters
 * and supports browser Back/Forward history navigation.
 */
export function initUrlController({
  store,
  sceneManager,
  sunSystem,
  ifcController,
  gridHelper,
  siteConfig,
  auxiliaryBuildingConfig,
}) {
  let isApplyingFromUrl = false;
  let replaceTimer = null;

  function clearReplaceTimer() {
    if (replaceTimer !== null) {
      clearTimeout(replaceTimer);
      replaceTimer = null;
    }
  }

  function syncUrl(mode = "replace") {
    if (isApplyingFromUrl) return;
    if (mode === "push") {
      clearReplaceTimer();
    }

    const nextSearch = buildSearchString(
      store.getState(),
      sceneManager,
      siteConfig,
    );
    if (nextSearch === window.location.search) return;

    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history[mode === "push" ? "pushState" : "replaceState"](
      null,
      "",
      nextUrl,
    );
  }

  function scheduleReplaceSync(delayMs = 150) {
    if (isApplyingFromUrl) return;
    clearReplaceTimer();
    replaceTimer = setTimeout(() => {
      replaceTimer = null;
      syncUrl("replace");
    }, delayMs);
  }

  function applyUrlToState() {
    clearReplaceTimer();
    isApplyingFromUrl = true;

    try {
      const params = new URLSearchParams(window.location.search);
      const currentState = store.getState();

      // 1. Built-in design variant (`model`)
      const modelParam = params.get("model");
      if (modelParam && DESIGN_VARIANTS[modelParam]) {
        if (currentState.activeModelId !== modelParam) {
          ifcController.loadConceptVariant(modelParam);
        }
      } else if (
        !modelParam &&
        currentState.activeModelId !== "concept" &&
        DESIGN_VARIANTS[currentState.activeModelId]
      ) {
        ifcController.loadConceptVariant("concept");
      }

      const activeModelId = store.getState().activeModelId;

      // 2. View (`view`) & Room (`room`)
      let { floorMode, activeScheduleFloor, isTopDownPreset } = parseViewParam(
        params.get("view"),
      );

      let activeRoomId = null;
      let matchedRoom = null;
      const roomParam = params.get("room");
      const roomMatch = findRoomById(activeModelId, roomParam);
      if (roomMatch) {
        activeRoomId = roomMatch.room.id;
        matchedRoom = roomMatch.room;
        floorMode = roomMatch.floorKey;
        activeScheduleFloor = roomMatch.floorKey;
      }

      // 3. Custom cut height (`slice`)
      const rawSlice = params.get("slice");
      let sliceHeight = null;
      if (rawSlice !== null && rawSlice.trim() !== "") {
        const parsedSlice = Number(rawSlice);
        if (
          Number.isFinite(parsedSlice) &&
          parsedSlice >= 0.2 &&
          parsedSlice <= 8.5
        ) {
          sliceHeight = fmtDecimal(parsedSlice);
        }
      }

      // 4. Sidebar tab (`tab`)
      const tabParam = params.get("tab");
      const hasValidTab = VALID_TABS.has(tabParam);
      const sidebarOpen = hasValidTab;
      const activeTab = hasValidTab ? tabParam : store.getState().activeTab;

      // 5. Visibility flags (`labels`, `grid`, `plot`)
      const labelsVisible = params.get("labels") !== "0";
      const gridVisible = params.get("grid") !== "0";
      const plotVisible = params.get("plot") !== "0";
      gridHelper.visible = gridVisible;
      sceneManager.plotGroup.visible = plotVisible;

      // 6. House placement (`pos`)
      const defaultPos = siteConfig.defaultHousePos || {
        x: 4.5,
        z: 1.0,
        rotY: 0,
      };
      const posVec = parseVec3(params.get("pos"));
      const housePos = posVec
        ? {
            x: Math.min(12, Math.max(-12, posVec[0])),
            z: Math.min(18, Math.max(-18, posVec[1])),
            rotY: Math.min(360, Math.max(0, posVec[2])),
          }
        : { ...defaultPos };

      sceneManager.setHouseTransform(housePos);
      const setbacks = updateSetbackDimensions(
        sceneManager.setbackGroup,
        siteConfig,
        housePos,
        auxiliaryBuildingConfig,
      );

      // 7. Solar position (`day`, `hour`)
      const rawDay = params.get("day");
      const rawHour = params.get("hour");
      let dayOfYear = 172;
      if (rawDay !== null && rawDay.trim() !== "") {
        const parsedDay = Math.round(Number(rawDay));
        if (Number.isFinite(parsedDay)) {
          dayOfYear = Math.min(365, Math.max(1, parsedDay));
        }
      }
      let hour = 14;
      if (rawHour !== null && rawHour.trim() !== "") {
        const parsedHour = Number(rawHour);
        if (Number.isFinite(parsedHour)) {
          hour = Math.min(21, Math.max(5, parsedHour));
        }
      }

      const prevSun = store.getState().sun;
      if (prevSun.dayOfYear !== dayOfYear || prevSun.hour !== hour) {
        sunSystem.update(dayOfYear, hour, prevSun.latitude);
      }

      // 8. Commit updated state to store
      const prevSite = store.getState().site;
      store.setState({
        floorMode,
        activeScheduleFloor,
        activeRoomId,
        sliceHeight,
        labelsVisible,
        sidebarOpen,
        activeTab,
        site: {
          ...prevSite,
          gridVisible,
          plotVisible,
          housePos,
          setbacks,
        },
      });

      // 9. Camera & OrbitControls target (`cam`, `target`, or room/topdown fallback)
      const camVec = parseVec3(params.get("cam"));
      const targetVec = parseVec3(params.get("target"));

      if (camVec) {
        sceneManager.camera.position.set(camVec[0], camVec[1], camVec[2]);
      }
      if (targetVec) {
        sceneManager.controls.target.set(
          targetVec[0],
          targetVec[1],
          targetVec[2],
        );
      }

      if (camVec) {
        sceneManager.controls.update();
      } else if (matchedRoom) {
        sceneManager.focusHousePoint(matchedRoom.pos, 9);
      } else if (isTopDownPreset) {
        sceneManager.setTopDownView(sceneManager.houseContainer);
      } else if (targetVec) {
        sceneManager.controls.update();
      }
    } finally {
      isApplyingFromUrl = false;
    }
  }

  // Subscribe to store state changes
  store.subscribe(
    [...DISCRETE_KEYS, ...CONTINUOUS_KEYS],
    (_state, _prevState, changedKeys) => {
      if (isApplyingFromUrl) return;
      if (DISCRETE_KEYS.some((k) => changedKeys.has(k))) {
        syncUrl("push");
      } else if (CONTINUOUS_KEYS.some((k) => changedKeys.has(k))) {
        scheduleReplaceSync(150);
      }
    },
  );

  // Debounced camera / orbit target sync
  sceneManager.controls.addEventListener("change", () => {
    if (isApplyingFromUrl) return;
    scheduleReplaceSync(200);
  });

  // Browser Back / Forward navigation
  window.addEventListener("popstate", () => {
    applyUrlToState();
  });

  // Initial URL parse + canonical URL hydration
  applyUrlToState();
  syncUrl("replace");
}

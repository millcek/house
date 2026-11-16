/**
 * Lightweight reactive state store with key-level subscriptions.
 * Decouples 3D scene systems from DOM UI controllers.
 */
export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(partialOrUpdater) {
    const patch =
      typeof partialOrUpdater === 'function'
        ? partialOrUpdater(state)
        : partialOrUpdater;

    if (!patch || typeof patch !== 'object') return;

    const changedKeys = new Set();
    const nextState = { ...state };

    for (const key of Object.keys(patch)) {
      if (patch[key] !== state[key]) {
        nextState[key] = patch[key];
        changedKeys.add(key);
      }
    }

    if (changedKeys.size === 0) return;

    const prevState = state;
    state = nextState;

    for (const listener of listeners) {
      if (!listener.keys || listener.keys.some((k) => changedKeys.has(k))) {
        listener.callback(state, prevState, changedKeys);
      }
    }
  }

  /**
   * Subscribe to all state updates or a specific list of top-level keys.
   * @param {string[]|Function} keysOrCallback
   * @param {Function} [maybeCallback]
   * @returns {Function} unsubscribe function
   */
  function subscribe(keysOrCallback, maybeCallback) {
    const keys = Array.isArray(keysOrCallback) ? keysOrCallback : null;
    const callback = keys ? maybeCallback : keysOrCallback;
    const entry = { keys, callback };
    listeners.add(entry);
    return () => listeners.delete(entry);
  }

  return { getState, setState, subscribe };
}

export const INITIAL_STATE = {
  activeModelId: 'concept',
  uploadedModels: [],
  floorMode: 'all', // 'all' | '1np' | '2np'
  sliceHeight: 8.5,
  labelsVisible: true,
  activeScheduleFloor: '1np', // '1np' | '2np'
  sun: {
    dayOfYear: 172,
    hour: 14.0,
    latitude: 50.0,
    elevationDeg: 57.0,
    azimuthDeg: 218,
    directionName: 'JZ',
    isDay: true,
    summaryText: 'Odpolední slunce z JZ přímo na zahradní terasu',
    summaryColor: '#34d399',
  },
  site: {
    gridVisible: true,
    plotVisible: true,
    housePos: { x: 4.5, z: 1.0, rotY: 0 },
    setbacks: {
      streetRight: 5.0,
      houseWorkshopGap: 4.0,
      houseTop: 15.0,
      workshopTop: 4.0,
      houseFront: 13.0,
    },
  },
  selectedElement: null,
  sidebarOpen: false,
  activeTab: 'floors',
  loading: { active: false, text: '' },
};

export const store = createStore(INITIAL_STATE);

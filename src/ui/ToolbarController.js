/**
 * Manages the top quick-action toolbar and live North compass HUD.
 */
export function initToolbarController(store, sceneManager) {
  const btnFit = document.getElementById('btn-fit');
  const btnFloorAll = document.getElementById('btn-floor-all');
  const btnFloor1np = document.getElementById('btn-floor-1np');
  const btnFloor2np = document.getElementById('btn-floor-2np');
  const btnFloorTopdown = document.getElementById('btn-floor-topdown');
  const btnQuickSun = document.getElementById('btn-quick-sun');
  const compassBadge = document.getElementById('compass-badge');
  const compassDial = document.getElementById('compass-dial');

  btnFit?.addEventListener('click', () => {
    sceneManager.fitCameraToObject(sceneManager.siteContainer);
  });

  btnFloorAll?.addEventListener('click', () => store.setState({ floorMode: 'all', activeScheduleFloor: '1np' }));
  btnFloor1np?.addEventListener('click', () => store.setState({ floorMode: '1np', activeScheduleFloor: '1np' }));
  btnFloor2np?.addEventListener('click', () => store.setState({ floorMode: '2np', activeScheduleFloor: '2np' }));

  btnFloorTopdown?.addEventListener('click', () => {
    if (store.getState().floorMode === 'all') {
      store.setState({ floorMode: '1np', activeScheduleFloor: '1np' });
    }
    sceneManager.setTopDownView(sceneManager.houseContainer);
  });

  btnQuickSun?.addEventListener('click', () => {
    store.setState({ activeTab: 'sun', sidebarOpen: true });
  });

  compassBadge?.addEventListener('click', () => {
    sceneManager.alignCameraNorth();
  });

  sceneManager.onTick(() => {
    if (compassDial) {
      const deg = sceneManager.getCameraAzimuthDeg();
      compassDial.style.transform = `rotate(${deg}deg)`;
    }
  });

  function render({ floorMode }) {
    [btnFloorAll, btnFloor1np, btnFloor2np].forEach((b) => b?.classList.remove('btn-primary'));
    if (floorMode === 'all') btnFloorAll?.classList.add('btn-primary');
    if (floorMode === '1np') btnFloor1np?.classList.add('btn-primary');
    if (floorMode === '2np') btnFloor2np?.classList.add('btn-primary');
  }

  store.subscribe(['floorMode'], (state) => render(state));
  render(store.getState());
}

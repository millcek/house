import { updateSetbackDimensions } from '../builders/SiteBuilder.js';

/**
 * Manages house placement sliders (X, Z, RotY) and dynamically updates
 * 3D setback lines and live distance readouts in the Pozemek tab.
 */
export function initSiteController(store, sceneManager, siteConfig, auxConfig) {
  const posXInput = document.getElementById('pos-x');
  const posZInput = document.getElementById('pos-z');
  const rotYInput = document.getElementById('rot-y');

  const valPosX = document.getElementById('val-pos-x');
  const valPosZ = document.getElementById('val-pos-z');
  const valRotY = document.getElementById('val-rot-y');

  const setbackStreetRight = document.getElementById('setback-street-right');
  const setbackHouseWorkshop = document.getElementById('setback-house-workshop');
  const setbackHouseTop = document.getElementById('setback-house-top');
  const setbackWorkshopTop = document.getElementById('setback-workshop-top');
  const setbackHouseFront = document.getElementById('setback-house-front');

  function applyHouseTransform(partial) {
    const prevSite = store.getState().site;
    const nextHousePos = { ...prevSite.housePos, ...partial };

    sceneManager.setHouseTransform(nextHousePos);
    const setbacks = updateSetbackDimensions(
      sceneManager.setbackGroup,
      siteConfig,
      nextHousePos,
      auxConfig
    );

    store.setState({
      site: {
        ...prevSite,
        housePos: nextHousePos,
        setbacks,
      },
    });
  }

  posXInput?.addEventListener('input', (e) => {
    applyHouseTransform({ x: parseFloat(e.target.value) });
  });

  posZInput?.addEventListener('input', (e) => {
    applyHouseTransform({ z: parseFloat(e.target.value) });
  });

  rotYInput?.addEventListener('input', (e) => {
    applyHouseTransform({ rotY: parseFloat(e.target.value) });
  });

  function render({ site }) {
    const { housePos, setbacks } = site;
    if (valPosX) valPosX.textContent = `${housePos.x}m`;
    if (valPosZ) valPosZ.textContent = `${housePos.z}m`;
    if (valRotY) valRotY.textContent = `${housePos.rotY}°`;

    if (posXInput) posXInput.value = String(housePos.x);
    if (posZInput) posZInput.value = String(housePos.z);
    if (rotYInput) rotYInput.value = String(housePos.rotY);

    if (setbackStreetRight) setbackStreetRight.textContent = `${setbacks.streetRight.toFixed(1)} m`;
    if (setbackHouseWorkshop) setbackHouseWorkshop.textContent = `${setbacks.houseWorkshopGap.toFixed(1)} m`;
    if (setbackHouseTop) setbackHouseTop.textContent = `${setbacks.houseTop.toFixed(1)} m`;
    if (setbackWorkshopTop) setbackWorkshopTop.textContent = `${setbacks.workshopTop.toFixed(1)} m`;
    if (setbackHouseFront) setbackHouseFront.textContent = `${setbacks.houseFront.toFixed(1)} m`;
  }

  store.subscribe(['site'], (state) => render(state));
  // Compute initial setbacks
  applyHouseTransform({});
}

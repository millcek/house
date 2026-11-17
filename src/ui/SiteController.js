import {
  computeBuiltUpArea,
  updateFootprintOverlay,
  updateSetbackDimensions,
} from '../builders/SiteBuilder.js';
import { getDesignVariant } from '../designs/index.js';

function formatArea(val, decimals = 1) {
  const fixed = decimals === 0 ? String(Math.round(val)) : val.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const spacedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decPart !== undefined ? `${spacedInt}.${decPart}` : spacedInt;
}

/**
 * Manages house placement sliders (X, Z, RotY) and dynamically updates
 * 3D setback lines, built-up area overlay/metrics, and live distance readouts in the Pozemek tab.
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

  const btnToggleFootprint = document.getElementById('btn-toggle-footprint');
  const builtupRatioBadge = document.getElementById('builtup-ratio-badge');
  const barSegBuildings = document.getElementById('bar-seg-buildings');
  const barSegAccessories = document.getElementById('bar-seg-accessories');
  const barSegFree = document.getElementById('bar-seg-free');
  const legendBuildingsPct = document.getElementById('legend-buildings-pct');
  const legendAccessoriesPct = document.getElementById('legend-accessories-pct');
  const legendFreePct = document.getElementById('legend-free-pct');
  const areaPlotTotal = document.getElementById('area-plot-total');
  const areaHouse = document.getElementById('area-house');
  const areaWorkshop = document.getElementById('area-workshop');
  const areaParking = document.getElementById('area-parking');
  const areaBuildingsSubtotal = document.getElementById('area-buildings-subtotal');
  const areaTerrace = document.getElementById('area-terrace');
  const areaCanopy = document.getElementById('area-canopy');
  const areaBuiltupTotal = document.getElementById('area-builtup-total');
  const areaFreeGarden = document.getElementById('area-free-garden');

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

  btnToggleFootprint?.addEventListener('click', () => {
    const { site } = store.getState();
    store.setState({
      site: {
        ...site,
        footprintVisible: !site.footprintVisible,
      },
    });
  });

  function render({ site, activeModelId }) {
    const { housePos, setbacks, footprintVisible } = site;
    const houseDesign = getDesignVariant(activeModelId);
    const metrics = computeBuiltUpArea(siteConfig, auxConfig, houseDesign);

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

    const showFootprint = Boolean(footprintVisible);
    sceneManager.footprintGroup.visible = showFootprint;
    updateFootprintOverlay(
      sceneManager.footprintGroup,
      siteConfig,
      housePos,
      auxConfig,
      houseDesign
    );

    if (btnToggleFootprint) {
      btnToggleFootprint.textContent = `📐 Zvýraznit zastavěnou plochu v 3D: ${showFootprint ? 'ON' : 'OFF'}`;
      btnToggleFootprint.classList.toggle('btn-primary', showFootprint);
    }

    if (builtupRatioBadge) {
      builtupRatioBadge.textContent = `${metrics.totalRatioPct.toFixed(1)} % (${metrics.totalBuiltUpSqm.toFixed(1)} m²)`;
    }
    if (barSegBuildings) {
      barSegBuildings.style.width = `${metrics.buildingsRatioPct}%`;
      barSegBuildings.title = `Stavby pod střechou: ${metrics.buildingsSqm.toFixed(1)} m² (${metrics.buildingsRatioPct.toFixed(1)} %)`;
    }
    if (barSegAccessories) {
      barSegAccessories.style.width = `${metrics.accessoriesRatioPct}%`;
      barSegAccessories.title = `Terasa & loubí: ${metrics.accessoriesSqm.toFixed(1)} m² (${metrics.accessoriesRatioPct.toFixed(1)} %)`;
    }
    if (barSegFree) {
      barSegFree.style.width = `${metrics.freeRatioPct}%`;
      barSegFree.title = `Volná zahrada: ${metrics.freeGardenSqm.toFixed(1)} m² (${metrics.freeRatioPct.toFixed(1)} %)`;
    }
    if (legendBuildingsPct) legendBuildingsPct.textContent = `${metrics.buildingsRatioPct.toFixed(1)} %`;
    if (legendAccessoriesPct) legendAccessoriesPct.textContent = `${metrics.accessoriesRatioPct.toFixed(1)} %`;
    if (legendFreePct) legendFreePct.textContent = `${metrics.freeRatioPct.toFixed(1)} %`;

    if (areaPlotTotal) {
      areaPlotTotal.textContent = `${formatArea(metrics.plotGrossSqm, 0)} m² (čistá ${formatArea(metrics.plotNetSqm, 1)} m²)`;
    }
    if (areaHouse) areaHouse.textContent = `${metrics.houseSqm.toFixed(1)} m² (${metrics.houseRatioPct.toFixed(1)} %)`;
    if (areaWorkshop) areaWorkshop.textContent = `${metrics.workshopSqm.toFixed(1)} m² (${metrics.workshopRatioPct.toFixed(1)} %)`;
    if (areaParking) areaParking.textContent = `${metrics.parkingSqm.toFixed(1)} m² (${metrics.parkingRatioPct.toFixed(1)} %)`;
    if (areaBuildingsSubtotal) {
      areaBuildingsSubtotal.textContent = `${metrics.buildingsSqm.toFixed(1)} m² (${metrics.buildingsRatioPct.toFixed(1)} %)`;
    }
    if (areaTerrace) areaTerrace.textContent = `${metrics.terraceSqm.toFixed(1)} m² (${metrics.terraceRatioPct.toFixed(1)} %)`;
    if (areaCanopy) areaCanopy.textContent = `${metrics.canopySqm.toFixed(1)} m² (${metrics.canopyRatioPct.toFixed(1)} %)`;
    if (areaBuiltupTotal) {
      areaBuiltupTotal.textContent = `${metrics.totalBuiltUpSqm.toFixed(1)} m² (${metrics.totalRatioPct.toFixed(1)} %)`;
    }
    if (areaFreeGarden) {
      areaFreeGarden.textContent = `${metrics.freeGardenSqm.toFixed(1)} m² (${metrics.freeRatioPct.toFixed(1)} %)`;
    }
  }

  store.subscribe(['site', 'activeModelId'], (state) => render(state));
  // Compute initial setbacks & built-up area metrics
  applyHouseTransform({});
}

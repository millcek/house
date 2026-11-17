import { store } from "./state/store.js";
import { createMaterials } from "./core/Materials.js";
import { SceneManager } from "./core/SceneManager.js";
import { SunSystem } from "./core/SunSystem.js";
import { buildPlot, buildAuxiliaryBuilding } from "./builders/SiteBuilder.js";
import { buildHouseModel } from "./builders/HouseBuilder.js";
import { siteConfig } from "./designs/siteConfig.js";
import { auxiliaryBuildingConfig } from "./designs/auxiliaryBuilding.js";
import { getDesignVariant } from "./designs/index.js";
import { IfcController } from "./bim/IfcController.js";
import { initSidebarController } from "./ui/SidebarController.js";
import { initToolbarController } from "./ui/ToolbarController.js";
import { initFloorPlanController } from "./ui/FloorPlanController.js";
import { initSunController } from "./ui/SunController.js";
import { initSiteController } from "./ui/SiteController.js";
import { initModelAndBimController } from "./ui/ModelAndBimController.js";
import { initUrlController } from "./ui/UrlController.js";

// 1. Core 3D Scene, Materials & Solar Lighting
const canvas = document.getElementById("three-canvas");
const sceneManager = new SceneManager(canvas, {
  parcelRotationDeg: siteConfig.parcelRotationDeg,
  defaultHousePos: siteConfig.defaultHousePos,
});
const materials = createMaterials(sceneManager.clipPlane);
const sunSystem = new SunSystem(sceneManager.scene, store);

// 2. Site Context (Plot, Roads, Auxiliary Carport/Workshop)
const { gridHelper } = buildPlot(sceneManager.plotGroup, siteConfig, materials);

const auxBuilding = buildAuxiliaryBuilding(auxiliaryBuildingConfig, materials);
sceneManager.siteContainer.add(auxBuilding);

// 3. Model & BIM Inspection Controller
const ifcController = new IfcController({
  sceneManager,
  materials,
  store,
  auxBuilding,
  buildConceptFn: (variantId) =>
    buildHouseModel(getDesignVariant(variantId), materials),
});

// Load initial Concept House model
ifcController.loadConceptVariant("concept");

// 4. UI Controllers (all decoupled via reactive store)
initSidebarController(store);
initToolbarController(store, sceneManager);
initFloorPlanController(store, sceneManager, () => ifcController.currentModel);
initSunController(store, sunSystem);
initSiteController(store, sceneManager, siteConfig, auxiliaryBuildingConfig);
initModelAndBimController(store, sceneManager, ifcController, gridHelper);
initUrlController({
  store,
  sceneManager,
  sunSystem,
  ifcController,
  gridHelper,
  siteConfig,
  auxiliaryBuildingConfig,
});

// 5. Start Render Loop
sceneManager.start();

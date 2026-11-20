/**
 * Standardized Project Assembly Architecture
 * Encapsulates full project metadata, site coordinates, auxiliary building,
 * house BIM design, budget estimation, and execution specifications into a single portable package.
 */
import { dreamHouseV1 } from './dreamHouseV1.js';
import { compactHouse5kk } from './compactHouse5kk.js';
import { bungalowHouse5kk } from './bungalowHouse5kk.js';
import { siteConfig } from './siteConfig.js';
import { auxiliaryBuildingConfig } from './auxiliaryBuilding.js';

export class ProjectAssembly {
  constructor(config = {}) {
    this.schema = 'house.project.assembly.v1';
    this.id = config.id || 'unnamed-assembly';
    this.label = config.label || 'Nepojmenovaná sestava';
    this.code = config.code || 'RD-PROJECT';
    this.version = config.version || '1.0.0';
    this.createdAt = config.createdAt || new Date().toISOString();
    this.projectInfo = config.projectInfo || {};
    this.site = config.site || {};
    this.aux = config.aux || {};
    this.house = config.house || {};
    this.costSummary = config.costSummary || {};
    this.specifications = config.specifications || {};
  }

  toJSON() {
    return {
      schema: this.schema,
      id: this.id,
      label: this.label,
      code: this.code,
      version: this.version,
      createdAt: this.createdAt,
      projectInfo: this.projectInfo,
      site: this.site,
      aux: this.aux,
      house: this.house,
      costSummary: this.costSummary,
      specifications: this.specifications,
    };
  }

  toPrettyJson() {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

// 1. Baseline Design: Rodinný dům 6+kk · Vojáčkovi Troubelice (147 m²)
export const ASSEMBLY_6KK = new ProjectAssembly({
  id: 'concept',
  label: 'Rodinný dům 6+kk · Vojáčkovi Troubelice (147 m²)',
  code: 'RD-6KK-TROUBELICE',
  version: '1.1.0',
  projectInfo: {
    name: 'Rodinný dům Vojáčkovi',
    subtitle: 'Dvoupodlažní nízkoenergetický dům 6+kk se sedlovou střechou a krytým stáním',
    locality: 'Troubelice, Olomoucký kraj',
    cadastralArea: 'Troubelice [768541]',
    parcelNumber: '123/4',
    parcelAreaSqm: 1076,
    investors: ['Milan Vojáček', 'Partnerka'],
    designer: 'Generative BIM Antigravity & ARCH CAD',
    phase: 'Etapa 1 (optimalizovaný standard – Spiroll, SPC vinyl, obklady mokrých zón, FVE 7.2 kWp)',
    energyClass: 'A – Mimořádně úsporná (PENB < 50 kWh/m²a)',
    disposition: '6+kk (obytný prostor, pracovna / ložnice hostů v 1.NP, master ložnice, 3× dětský pokoj ve 2.NP, 2× koupelna, technická m., komora)',
    dimensions: {
      widthM: 8.5,
      lengthM: 12.0,
      builtUpAreaSqm: 102.0,
      usableAreaSqm: 147.2,
      enclosedVolumeM3: 618.0,
      roofPitchDeg: 35,
    },
  },
  site: {
    ...siteConfig,
  },
  aux: {
    ...auxiliaryBuildingConfig,
  },
  house: dreamHouseV1,
  costSummary: {
    stage: 'Etapa 1 (optimalizovaná realizace)',
    baselineEstimateCzk: 7650000,
    optimizedPhase1Czk: 6867000,
    savingsPhase1Czk: 783000,
    savingsPercent: 10.2,
    pricePerM2Czk: 46650,
  },
  specifications: {
    masonry: 'Broušená keramická cihla 380 mm (P+D) + minerální zateplení 140 mm',
    ceiling: 'Předpjaté železobetonové panely Spiroll 200 mm (z výroby hladký podhled, eliminace SDK podhledu)',
    roof: 'Dřevěný vazníkový krov se sklonem 35°, falcovaná plechová krytina antracit, foukaná minerální izolace 360 mm',
    flooring: 'Kvalitní rigidní SPC vinyl s integrovanou akustickou podložkou v obytných místnostech, velkoformátová keramická dlažba v zádveří, chodbě a koupelnách',
    pvSystem: 'Střešní FVE 7,2 kWp (16× 450 Wp panel) s hybridním střídačem 10 kW a LiFePO4 bateriovým úložištěm 10,6 kWh',
    heating: 'Tepelné čerpadlo vzduch-voda 7 kW s integrovaným nerezovým zásobníkem TUV 190 l a podlahovým vytápěním',
    rainwater: 'Podzemní akumulační nádrž na dešťovou vodu 7,0 m³ s automatickým dopouštěním a čerpadlem pro splachování toalet a zálivku',
    doors: 'Obložkové interiérové dveře se skrytými omezovači otevření v horních pantech (ochrana nábytku a zdí)',
  },
});

// 2. Compact Economical Alternative: Rodinný dům 5+kk (-30 % nákladů · 111 m²)
export const ASSEMBLY_5KK = new ProjectAssembly({
  id: 'compact-5kk',
  label: 'Rodinný dům 5+kk · Úsporná kompaktní varianta -30 % (111 m²)',
  code: 'RD-5KK-COMPACT',
  version: '1.0.0',
  projectInfo: {
    name: 'Rodinný dům Vojáčkovi – Kompaktní úsporná varianta',
    subtitle: 'Optimalizovaný dvoupodlažní dům 5+kk s minimální chodbou a maximální prostorovou efektivitou',
    locality: 'Troubelice, Olomoucký kraj',
    cadastralArea: 'Troubelice [768541]',
    parcelNumber: '123/4',
    parcelAreaSqm: 1076,
    investors: ['Milan Vojáček', 'Partnerka'],
    designer: 'Generative BIM Antigravity & ARCH CAD',
    phase: 'Etapa 1 (maximálně úsporný standard, -30 % investičních nákladů)',
    energyClass: 'A – Mimořádně úsporná (PENB < 48 kWh/m²a)',
    disposition: '5+kk (obytný prostor s kuchyní a jídelnou, pracovna/hostinský pokoj v 1.NP, ložnice rodičů, 2× dětský pokoj ve 2.NP, 2× koupelna s WC, šatní komora)',
    dimensions: {
      widthM: 7.5,
      lengthM: 9.0,
      builtUpAreaSqm: 67.5,
      usableAreaSqm: 111.2,
      enclosedVolumeM3: 412.0,
      roofPitchDeg: 35,
    },
  },
  site: {
    ...siteConfig,
    defaultHousePos: {
      x: 5.0,
      z: 2.0,
      rotY: 0,
    },
  },
  aux: {
    id: 'auxiliary-compact-carport',
    layout: 'carport-shed',
    width: 6.0,
    parkWidth: 6.0,
    workshopWidth: 6.0,
    parkDepth: 5.5,
    workshopDepth: 2.5,
    depth: 8.0,
    wallHeight: 2.70,
    roofType: 'flat',
    roofHeight: 0.20,
    position: [5.25, 0, -9.0],
    workshopOpenings: [
      { id: 'D1', kind: 'door', wall: 'S', offset: 0, width: 1.0, height: 2.1, sill: 0, name: 'Dveře do zahradního skladu' },
    ],
    canopy: null,
  },
  house: compactHouse5kk,
  costSummary: {
    stage: 'Kompletní realizace kompaktní varianty',
    baselineEstimateCzk: 7650000,
    optimizedPhase1Czk: 5350000,
    savingsPhase1Czk: 2300000,
    savingsPercent: 30.1,
    pricePerM2Czk: 48110,
  },
  specifications: {
    masonry: 'Broušená keramická tvárnice 300 mm + fasádní EPS šedý 180 mm (U = 0,14 W/m²K)',
    ceiling: 'Předpjaté panely Spiroll 160 mm s přímo stěrkovaným podhledem',
    roof: 'Úsporný sedlový krov 35° z dřevěných lisovaných vazníků, antracitový falcovaný plech, foukaná celulóza/izolace 340 mm',
    flooring: 'Odolný SPC rigidní vinyl v celém domě, v koupelnách zátěžová protiskluzová dlažba',
    pvSystem: 'Kompaktní střešní FVE 5,4 kWp (12× 450 Wp) s hybridním střídačem 8 kW a baterií 7,1 kWh',
    heating: 'Tepelné čerpadlo vzduch-voda 5 kW s integrovaným bojlerem 180 l a nízkoteplotním podlahovým vytápěním',
    rainwater: 'Akumulační nádrž 5,0 m³ s přepadem do štěrkového vsaku na pozemku',
    doors: 'Interiérové dveře CPL laminát se skrytými omezovači otevření v horních pantech (95–100°)',
  },
});

// 3. Single-Story Bungalow Alternative: Přízemní bungalov 5+kk (Bezbariérový dům bez schodů · 103 m²)
export const ASSEMBLY_BUNGALOW_5KK = new ProjectAssembly({
  id: 'bungalow-5kk',
  label: 'Přízemní bungalov 5+kk · Bezbariérový dům bez schodů (103 m²)',
  code: 'RD-5KK-BUNGALOW',
  version: '1.1.0',
  projectInfo: {
    name: 'Přízemní bungalov Vojáčkovi Troubelice',
    subtitle: 'Bezbariérový přízemní rodinný dům 5+kk bez schodů a patra s valbovou střechou',
    locality: 'Troubelice, Olomoucký kraj',
    cadastralArea: 'Troubelice [768541]',
    parcelNumber: '123/4',
    parcelAreaSqm: 1076,
    investors: ['Milan Vojáček', 'Partnerka'],
    designer: 'Generative BIM Antigravity & ARCH CAD',
    phase: 'Etapa 1 (bezbariérový přízemní dům, kompletní eliminace schodiště a stropních panelů)',
    energyClass: 'A – Mimořádně úsporná (PENB < 45 kWh/m²a)',
    disposition: '5+kk (prosluněný obývací pokoj s kuchyní a jídelnou 28,2 m² a velkým HS portálem na terasu, ložnice rodičů 12,4 m² s francouzským oknem do zahrady, 2× dětský pokoj 10,9 m² a 10,6 m², samostatná pracovna / pokoj pro hosty 10,7 m², rodinná koupelna s vanou, samostatné WC hosté, technická místnost & prádelna 6,1 m², zádveří, centrální chodba se světlíkem)',
    dimensions: {
      widthM: 9.2,
      lengthM: 13.2,
      builtUpAreaSqm: 121.4,
      usableAreaSqm: 103.3,
      enclosedVolumeM3: 412.0,
      roofPitchDeg: 25,
    },
  },
  site: {
    ...siteConfig,
  },
  aux: {
    id: 'auxiliary-compact-carport',
    layout: 'carport-shed',
    width: 6.0,
    parkWidth: 6.0,
    workshopWidth: 6.0,
    parkDepth: 5.5,
    workshopDepth: 2.5,
    depth: 8.0,
    wallHeight: 2.70,
    roofType: 'flat',
    roofHeight: 0.20,
    position: [5.25, 0, -9.0],
    workshopOpenings: [
      { id: 'D1', kind: 'door', wall: 'S', offset: 0, width: 1.0, height: 2.1, sill: 0, name: 'Dveře do zahradního skladu' },
    ],
    canopy: null,
  },
  house: bungalowHouse5kk,
  costSummary: {
    stage: 'Kompletní realizace přízemního bungalovu na klíč',
    baselineEstimateCzk: 7650000,
    optimizedPhase1Czk: 5050000,
    savingsPhase1Czk: 2600000,
    savingsPercent: 34.0,
    pricePerM2Czk: 48900,
  },
  specifications: {
    masonry: 'Broušená keramická tvárnice 300 mm + fasádní minerální vata 180 mm (U = 0,13 W/m²K)',
    ceiling: 'Lehký sádrokartonový podhled zavěšený na vaznících s foukanou minerální izolací 380 mm (žádný drahý těžký strop Spiroll/monolit)',
    roof: 'Valbová dřevěná vazníková střecha 25°, lehká falcovaná plechová krytina antracit, příprava pro pochozí lávku a FVE',
    flooring: 'Kvalitní rigidní SPC vinyl v celém domě pro jednotný bezbariérový povrch bez přechodových lišt, velkoformátová protiskluzová dlažba v zádveří a koupelně',
    pvSystem: 'Střešní FVE 6,3 kWp (14× 450 Wp) orientovaná na jih/jihozápad s hybridním střídačem 10 kW a LiFePO4 baterií 10,6 kWh',
    heating: 'Tepelné čerpadlo vzduch-voda 6 kW s integrovaným nerezovým zásobníkem TV 190 l a podlahovým vytápěním v celém přízemí',
    rainwater: 'Podzemní akumulační nádrž na dešťovou vodu 6,0 m³ pro automatickou zálivku zahrady a splachování toalet',
    doors: 'Interiérové dveře bezprahové se skrytými integrovanými omezovači otevření v horních pantech (95–100°)',
  },
});

export const ASSEMBLIES = {
  [ASSEMBLY_6KK.id]: ASSEMBLY_6KK,
  [ASSEMBLY_5KK.id]: ASSEMBLY_5KK,
  [ASSEMBLY_BUNGALOW_5KK.id]: ASSEMBLY_BUNGALOW_5KK,
};

export function getAssembly(id = 'concept') {
  return ASSEMBLIES[id] || ASSEMBLY_6KK;
}

export function listAssemblies() {
  return Object.values(ASSEMBLIES).map((a) => ({
    id: a.id,
    label: a.label,
    code: a.code,
    version: a.version,
    usableAreaSqm: a.projectInfo.dimensions.usableAreaSqm,
    builtUpAreaSqm: a.projectInfo.dimensions.builtUpAreaSqm,
    estimatedCostCzk: a.costSummary.optimizedPhase1Czk,
    savingsPercent: a.costSummary.savingsPercent,
  }));
}

export function exportAssemblyAsJson(id = 'concept') {
  const assembly = getAssembly(id);
  return assembly.toPrettyJson();
}

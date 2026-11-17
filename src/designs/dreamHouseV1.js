// Shared parametric house dimensions & wall axes (single source of truth for 3D + 2D)
const W = 8.0;
const L = 12.0;
const T_EXT = 0.38;
const T_SPINE = 0.24;
const T_PART = 0.16;

const X_WEST_WALL = -W / 2 + T_EXT / 2; // -3.81
const X_EAST_WALL = W / 2 - T_EXT / 2;  //  3.81
const Z_NORTH_WALL = -L / 2 + T_EXT / 2; // -5.81
const Z_SOUTH_WALL = L / 2 - T_EXT / 2;  //  5.81

const X_WEST_IN = -W / 2 + T_EXT;  // -3.62
const X_EAST_IN = W / 2 - T_EXT;   //  3.62
const Z_NORTH_IN = -L / 2 + T_EXT; // -5.62
const Z_SOUTH_IN = L / 2 - T_EXT;  //  5.62

// 1.NP interior wall axes & zone dividers
const X_STAIR_HALL = -0.50;
const X_TECH_WALL = 1.40;
const Z_STUDY_STAIR = -1.86;
const Z_TECH_SOUTH = -3.76;
const Z_BATH_VEST = -1.90;
const Z_SPINE = 0.30;
const X_KITCHEN_SPLIT = 1.00;

// 2.NP interior wall axes — Varianta A (6+kk: pracovna/šatna + velká koupelna + centrální komora)
const Z_NORTH_ROOMS = -1.86;
const Z_STAIR_SOUTH = 0.26;
const Z_SOUTH_ROOMS = 1.92;
const X_HALL2_EAST_A = 1.44;
const X_NORTH_SEP_A = 0.46;
const X_LAUNDRY_HALL_A = -0.82;
const X_KIDS_SEP_A = 0.26;
const Z_BATH_WC_A = 0.80;

// 2.NP interior wall axes — Varianta B (5+kk: 3 pokoje + šatna + velká koupelna)
const Z_CLOSET_BATH_B = -2.88;
const X_HALL2_EAST_B = 1.08;
const X_LAUNDRY_HALL_B = -0.92;
const X_KIDS_SEP_B = 0.08;
const Z_BATH_WC_B = 0.54;

// 2.NP interior wall axes — Původní koncept (pro srovnání)
const Z_ROOM4 = -3.00;
const Z_STAIR_KIDS2 = 0.26;
const X_HALL2_EAST = 1.05;
const Z_BATH2_LAUNDRY = -0.72;
const Z_LAUNDRY_WC = 0.64;
const Z_KIDS3 = 1.80;
const X_KIDS_SEP = -0.30;

// Derived floor finish & stairwell bounds
const STAIR_HOLE = {
  x1: X_WEST_IN,
  z1: Z_STUDY_STAIR + T_PART / 2,
  x2: X_STAIR_HALL,
  z2: Z_SPINE - T_SPINE / 2,
};

// Svislá instalační šachta pro VZT (rekuperaci) a TZB stoupačky
const SHAFT_HOLE = {
  x1: 0.98,
  z1: -4.20,
  x2: 1.44,
  z2: -3.76,
};

const F1_LEFT_X_START = -W / 2 + 0.2;
const F1_RIGHT_X_END = W / 2 - 0.2;
const F1_NORTH_Z_MID = -2.8;

export const dreamHouseV1 = {
  id: 'concept',
  label: 'Varianta A: 6+kk (pracovna/šatna + velká koupelna + komora)',
  footprint: {
    width: W,
    length: L,
  },
  floorHeight: 2.95,
  wallThickness: T_EXT,
  partThickness: T_PART,

  floor1: {
    elevation: 0,
    finishes: [
      { name: 'Podlaha obývací pokoj & kuchyň', material: 'woodFloor', size: [W - 0.4, L / 2 - 0.4], thickness: 0.22, pos: [0, L / 4] },
      {
        name: 'Podlaha pracovna / ložnice & schodiště (1.NP)',
        material: 'woodFloor',
        size: [Number((X_STAIR_HALL - F1_LEFT_X_START).toFixed(2)), L / 2],
        thickness: 0.22,
        pos: [Number(((F1_LEFT_X_START + X_STAIR_HALL) / 2).toFixed(2)), F1_NORTH_Z_MID],
      },
      {
        name: 'Dlažba zádveří, chodba, technická m., koupelna',
        material: 'tileFloor',
        size: [Number((F1_RIGHT_X_END - X_STAIR_HALL).toFixed(2)), L / 2],
        thickness: 0.22,
        pos: [Number(((X_STAIR_HALL + F1_RIGHT_X_END) / 2).toFixed(2)), F1_NORTH_Z_MID],
      },
      { name: 'Zahradní terasa (thermodřevo)', material: 'terrace', size: [4.0, 6.0], thickness: 0.14, pos: [-W / 2 - 2.0, L / 4] },
    ],
    walls: [
      // Exterior perimeter walls (1.NP, height 2.95 m)
      {
        id: 'ext-1np-north',
        name: 'Obvodová stěna sever (1.NP)',
        from: [-W / 2, Z_NORTH_WALL],
        to: [W / 2, Z_NORTH_WALL],
        height: 2.95,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'door', name: 'Venkovní dveře technická m.', at: 6.55, width: 0.95, height: 2.2, sill: 0.22, swing: { hinge: 'end', dir: 'north' } },
        ],
      },
      {
        id: 'ext-1np-south',
        name: 'Obvodová stěna jih (1.NP)',
        from: [-W / 2, Z_SOUTH_WALL],
        to: [W / 2, Z_SOUTH_WALL],
        height: 2.95,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Francouzské okno obývák (jih)', at: 2.28, width: 2.6, height: 2.2, sill: 0.22, sliding: true },
          { type: 'window', name: 'Francouzské okno jídelna (jih)', at: 5.98, width: 2.2, height: 2.2, sill: 0.22, sliding: true },
        ],
      },
      {
        id: 'ext-1np-east',
        name: 'Obvodová stěna východ (1.NP)',
        from: [X_EAST_WALL, Z_NORTH_IN],
        to: [X_EAST_WALL, Z_SOUTH_IN],
        height: 2.95,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno technická m. 1.NP (východ)', at: 0.93, width: 0.7, height: 0.75, sill: 1.67 },
          { type: 'window', name: 'Okno koupelna 1.NP (východ)', at: 3.37, width: 0.6, height: 0.75, sill: 1.67 },
          { type: 'door', name: 'Hlavní vchodové dveře', at: 4.56, width: 1.05, height: 2.2, sill: 0.22, swing: { hinge: 'start', dir: 'west' } },
          { type: 'window', name: 'Pásové okno kuchyň (východ)', at: 7.60, width: 2.20, height: 1.15, sill: 1.27 },
        ],
      },
      {
        id: 'ext-1np-west',
        name: 'Obvodová stěna západ (1.NP)',
        from: [X_WEST_WALL, Z_NORTH_IN],
        to: [X_WEST_WALL, Z_SOUTH_IN],
        height: 2.95,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno pracovna (západ)', at: 1.92, width: 1.6, height: 1.4, sill: 1.02 },
          { type: 'window', name: 'Okno schodiště (západ)', at: 4.82, width: 1.2, height: 0.8, sill: 1.95 },
          { type: 'window', name: 'HS portál na terasu', at: 8.60, width: 4.2, height: 2.2, sill: 0.22, sliding: true },
        ],
      },
      // Interior walls & load-bearing spine (1.NP, height 2.88 m)
      {
        id: 'part-1np-study-stair',
        name: 'Akustická příčka pracovna / schodiště',
        from: [X_WEST_IN, Z_STUDY_STAIR],
        to: [X_STAIR_HALL - T_PART / 2, Z_STUDY_STAIR],
        height: 2.88,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-1np-study-hall',
        name: 'Nosná stěna pracovna / chodba',
        from: [X_STAIR_HALL, Z_NORTH_IN],
        to: [X_STAIR_HALL, Z_STUDY_STAIR + T_PART / 2],
        height: 2.88,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře do pracovny (1.04)', at: 3.19, width: 0.85, height: 2.10, sill: 0.22, swing: { hinge: 'end', dir: 'west' } },
        ],
      },
      {
        id: 'part-1np-stair-living',
        name: 'Středová nosná stěna schodiště & chodba / obývák',
        from: [X_WEST_IN, Z_SPINE],
        to: [X_TECH_WALL, Z_SPINE],
        height: 2.88,
        thickness: T_SPINE,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Průchod chodba / obývací pokoj', at: 4.07, width: 1.25, height: 2.25, sill: 0.22 },
        ],
      },
      {
        id: 'part-1np-tech-south',
        name: 'Příčka technická m. / chodba & koupelna',
        from: [X_STAIR_HALL + T_PART / 2, Z_TECH_SOUTH],
        to: [X_EAST_IN, Z_TECH_SOUTH],
        height: 2.88,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře technická m. (1.02)', at: 0.87, width: 0.85, height: 2.10, sill: 0.22, swing: { hinge: 'start', dir: 'north' } },
        ],
      },
      {
        id: 'part-1np-bath-vestibule',
        name: 'Příčka koupelna / zádveří',
        from: [X_TECH_WALL + T_PART / 2, Z_BATH_VEST],
        to: [X_EAST_IN, Z_BATH_VEST],
        height: 2.88,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-1np-bath-hall',
        name: 'Nosná stěna koupelna / chodba',
        from: [X_TECH_WALL, Z_TECH_SOUTH + T_PART / 2],
        to: [X_TECH_WALL, Z_BATH_VEST],
        height: 2.88,
        thickness: T_PART,
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře koupelna 1.NP (1.03)', at: 0.91, width: 0.80, height: 2.10, sill: 0.22, swing: { hinge: 'start', dir: 'west' } },
        ],
      },
      {
        id: 'part-1np-vestibule-hall',
        name: 'Nosná stěna zádveří / chodba',
        from: [X_TECH_WALL, Z_BATH_VEST],
        to: [X_TECH_WALL, Z_SPINE - T_SPINE / 2],
        height: 2.88,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře zádveří / chodba', at: 0.84, width: 0.95, height: 2.10, sill: 0.22, swing: { hinge: 'start', dir: 'west' } },
        ],
      },
      {
        id: 'part-1np-vestibule-kitchen',
        name: 'Středová nosná stěna zádveří / kuchyň',
        from: [X_TECH_WALL, Z_SPINE],
        to: [X_EAST_IN, Z_SPINE],
        height: 2.88,
        thickness: T_SPINE,
        material: 'partition',
        structural: true,
      },
    ],
    furniture: [
      {
        type: 'pergola',
        name: 'Krytá pergola terasy',
        desc: 'Konstrukce pergoly se zastřešením zarovnaná se západní a jižní fasádou domu',
        pos: [0, 0],
        size: [4.0, 3.17, 6.0],
        height: 2.95,
        postSize: 0.14,
        rafterCount: 7,
        roofMaterial: 'roof',
        posts: [
          [-7.93, 5.93],
          [-7.93, 0.07],
          [-4.07, 5.93],
          [-4.07, 0.07],
        ],
      },
      {
        type: 'canopy',
        name: 'Přístřešek hlavního vchodu (1.01)',
        desc: 'Konzolový skleněný přístřešek nad hlavními vchodovými dveřmi',
        pos: [4.55, -1.06],
        yOffset: 2.55,
        size: [1.1, 0.08, 1.8],
      },
      {
        type: 'stairs',
        layout: 'u-turn',
        name: 'Dvouramenné schodiště do 2.NP',
        desc: 'Dvouramenné vratné schodiště s mezipodestou propojující chodbu 1.NP a halu 2.NP',
        pos: [0, 0],
        yBase: 0.22,
        xStart: X_STAIR_HALL,
        xLanding: -2.58,
        xEnd: X_WEST_IN,
        zFlight1: [STAIR_HOLE.z1, -0.84],
        zFlight2: [-0.76, STAIR_HOLE.z2],
        stepsPerFlight: 8,
        totalRise: 3.07,
      },
      // 1.01 Zádveří
      { type: 'wardrobe', name: 'Šatní skříň zádveří', desc: 'Vestavěná šatní sestava na jižní stěně s věšákovou stěnou a botníkem', pos: [2.50, -0.12], size: [1.90, 2.20, 0.60] },
      // 1.02 Technická místnost & Prádelna
      { type: 'hvac', name: 'Tepelné čerpadlo & bojler', desc: 'Vnitřní jednotka TČ s integrovaným zásobníkem TUV', pos: [0.10, -5.20], size: [0.80, 1.85, 0.80] },
      { type: 'recup', name: 'Centrální rekuperační jednotka VZT', desc: 'Nástěnná větrací jednotka s entalpickým výměníkem, bypass klapkou a tlumiči hluku', pos: [1.85, -5.30], size: [0.70, 0.85, 0.42] },
      { type: 'shaft', name: 'Instalační šachta VZT + TZB (1.NP)', desc: 'Svislá šachta pro vzduchotechnické stoupačky, kanalizaci DN 110 a topení', pos: [1.21, -3.98], size: [0.46, 2.73, 0.44] },
      { type: 'laundryStack', name: 'Pračka a sušička (P+S)', desc: 'Sestava pračky se sušičkou v technické místnosti', pos: [3.05, -4.80], size: [0.65, 1.70, 0.65] },
      // 1.03 Koupelna s WC 1.NP
      { type: 'wc', name: 'WC 1.NP', desc: 'Závěsné WC na severní stěně s přímým napojením na instalace technické místnosti', pos: [2.15, -3.40], size: [0.45, 0.45, 0.55] },
      { type: 'shower', name: 'Walk-in sprchový kout', desc: 'Velkorysý walk-in sprchový kout podél východní stěny (90 × 120 cm) se zcela volným nástupem', pos: [3.17, -3.08], size: [0.90, 2.0, 1.20] },
      { type: 'vanity', name: 'Umyvadlo se skříňkou', desc: 'Umyvadlová skříňka se zrcadlem na jižní stěně s volným koridorem do sprchy', pos: [2.15, -2.21], size: [0.75, 0.85, 0.46] },
      // 1.04 Budoucí ložnice / Pracovna
      { type: 'bed', name: 'Dvoulůžko ložnice/pracovna', desc: 'Manželská postel u severní stěny', pos: [-2.10, -4.60], size: [1.80, 0.52, 2.00] },
      { type: 'wardrobe', name: 'Šatní skříň pracovna', desc: 'Vestavěná šatní skříň odsazená od dveří na severovýchodní stěně', pos: [-0.80, -4.70], size: [0.60, 2.1, 1.80] },
      { type: 'desk', name: 'Pracovní stůl', desc: 'Psací stůl u západního okna do zahrady', pos: [-3.15, -2.80], size: [0.70, 0.75, 1.30] },
      // 1.05 Chodba pod schody
      { type: 'wardrobe', name: 'Úložný prostor pod schodištěm', desc: 'Vestavěná skříň pod schody na úklidové potřeby a vysavač', pos: [-1.80, -0.35], size: [0.80, 1.6, 1.0] },
      // 1.06 Kuchyňský kout + Jídelna
      { type: 'kitchenCounter', name: 'Kuchyňská linka (východ)', desc: 'Pracovní linka s dřezem a myčkou pod pásovým oknem', pos: [3.30, 2.00], size: [0.65, 0.90, 2.60] },
      { type: 'kitchenIsland', name: 'Kuchyňský ostrůvek', desc: 'Ostrůvek s varnou deskou s ergonomickou uličkou 115 cm k lince', pos: [1.35, 2.00], size: [0.95, 0.90, 2.00] },
      { type: 'diningTable', name: 'Jídelní stůl pro 6 osob', desc: 'Masivní jídelní stůl s 1,3 m volným průchodem k jižnímu zahradnímu portálu', pos: [2.35, 3.85], size: [1.80, 0.76, 0.95] },
      // 1.07 Obývací pokoj
      {
        type: 'lSofa',
        name: 'Rohová sedací souprava',
        desc: 'Prostorná rohová pohovka s výhledem na terasu i TV stěnu',
        pos: [-1.80, 3.40],
        parts: [
          { size: [2.8, 0.45, 1.0], offset: [0, 0] },
          { size: [1.0, 0.45, 1.8], offset: [-0.9, -1.4] },
        ],
      },
      { type: 'coffeeTable', name: 'Konferenční stolek', desc: 'Konferenční stolek', pos: [-1.80, 2.40], size: [0.70, 0.35, 1.20] },
      { type: 'tvStand', name: 'TV nábytková stěna', desc: 'Nízká TV komoda a stěna bez oslnění ze západu', pos: [-1.80, 0.55], size: [2.00, 0.45, 0.45] },
      { type: 'fireplace', name: 'Krbové těleso', desc: 'Krbová vložka s prosklením do obývací části', pos: [-3.30, 0.65], size: [0.65, 1.4, 0.65] },
    ],
    rooms: [
      { id: '1.01', name: 'Zádveří / Vstup', areaSqm: 4.3, pos: [2.55, 1.1, -0.82], desc: 'Vstupní hala s 60cm nikou na vestavěnou skříň a venkovním přístřeškem' },
      { id: '1.02', fixtures: ['hvac', 'pracka', 'susicka', 'vylevka'], name: 'Technická m. & Prádelna', areaSqm: 7.2, pos: [1.60, 1.1, -4.73], desc: 'Prostorná technická místnost (7,2 m²): TČ, rekuperace, pračka, sušička, výlevka, přímé dveře k parkování a shoz prádla z patra' },
      { id: '1.03', fixtures: ['wc', 'umyvadlo', 'sprcha'], name: 'Koupelna s WC', areaSqm: 3.6, pos: [2.55, 1.1, -2.83], desc: 'Koupelna (2,14 × 1,70 m) se vstupem z chodby, walk-in sprchovým koutem, WC, umyvadlem a východním oknem' },
      { id: '1.04', name: 'Budoucí ložnice / Pracovna', areaSqm: 11.2, pos: [-2.10, 1.1, -3.78], desc: 'Pracovna / budoucí bezbariérová ložnice s plnou severní stěnou pro manželskou postel' },
      { id: '1.05', name: 'Chodba & schodiště', areaSqm: 13.0, pos: [0.45, 1.4, -1.45], desc: 'Centrální chodba s přímými vstupy do všech místností, dvouramenným schodištěm a úložným prostorem' },
      {
        id: '1.06',
        name: 'Kuchyňský kout + Jídelna',
        fixtures: ['drez', 'mycka'],
        areaSqm: 13.6,
        pos: [2.30, 1.1, 3.00],
        zoneBounds: { xMin: X_KITCHEN_SPLIT },
        desc: 'Kuchyň s vysokou sestavou, ostrůvkem, posunutým pásovým oknem a stolem pro 6 osob',
      },
      {
        id: '1.07',
        name: 'Obývací pokoj',
        areaSqm: 24.0,
        pos: [-1.50, 1.1, 3.00],
        zoneBounds: { xMax: X_KITCHEN_SPLIT },
        desc: 'Obývací část s krbem, TV stěnou bez oslnění a výhledem přes HS portál na terasu',
      },
      { id: '1.08', name: 'Zahradní terasa (JZ)', areaSqm: 24.0, interior: false, pos: [-6.0, 0.35, 3.0], desc: 'Krytá venkovní terasa s jihozápadním sluncem a zastřešenou pergolou' },
    ],
  },

  ceilingSlab: {
    name: 'Stropní deska nad 1.NP',
    width: W,
    length: L,
    thickness: 0.22,
    y: 2.95,
    holes: [{ ...STAIR_HOLE }, { ...SHAFT_HOLE }],
  },

  ceiling2Slab: {
    name: 'Zateplený strop podkroví nad 2.NP (350 mm minerální izolace)',
    width: W,
    length: L,
    thickness: 0.35,
    y: 5.82,
  },

  floor2: {
    elevation: 3.17,
    finishes: [
      {
        name: 'Podlaha 2.NP (dub)',
        material: 'woodFloor',
        size: [W - 0.4, L - 0.4],
        thickness: 0.12,
        pos: [0, 0],
        holes: [
          { ...STAIR_HOLE },
          { x1: X_HALL2_EAST_A, z1: Z_NORTH_ROOMS, x2: X_EAST_IN, z2: Z_SOUTH_ROOMS },
          { x1: X_WEST_IN, z1: Z_STAIR_SOUTH, x2: X_LAUNDRY_HALL_A, z2: Z_SOUTH_ROOMS },
        ],
      },
      {
        name: 'Dlažba koupelna a WC (2.NP)',
        material: 'tileFloor',
        size: [Number((X_EAST_IN - X_HALL2_EAST_A).toFixed(2)), Number((Z_SOUTH_ROOMS - Z_NORTH_ROOMS).toFixed(2))],
        thickness: 0.12,
        pos: [Number(((X_HALL2_EAST_A + X_EAST_IN) / 2).toFixed(3)), Number(((Z_NORTH_ROOMS + Z_SOUTH_ROOMS) / 2).toFixed(3))],
      },
      {
        name: 'Dlažba komora za schodištěm (2.NP)',
        material: 'tileFloor',
        size: [Number((X_LAUNDRY_HALL_A - X_WEST_IN).toFixed(2)), Number((Z_SOUTH_ROOMS - Z_STAIR_SOUTH).toFixed(2))],
        thickness: 0.12,
        pos: [Number(((X_WEST_IN + X_LAUNDRY_HALL_A) / 2).toFixed(3)), Number(((Z_STAIR_SOUTH + Z_SOUTH_ROOMS) / 2).toFixed(3))],
      },
    ],
    walls: [
      // Exterior walls (2.NP, height 2.65 m)
      {
        id: 'ext-2np-north',
        name: 'Obvodová stěna sever (2.NP)',
        from: [-W / 2, Z_NORTH_WALL],
        to: [W / 2, Z_NORTH_WALL],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [],
      },
      {
        id: 'ext-2np-south',
        name: 'Obvodová stěna jih (2.NP)',
        from: [-W / 2, Z_SOUTH_WALL],
        to: [W / 2, Z_SOUTH_WALL],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Dětský pokoj 2 (JZ)', at: 2.28, width: 1.8, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno Dětský pokoj 3 (JV)', at: 5.98, width: 1.8, height: 1.4, sill: 0.92 },
        ],
      },
      {
        id: 'ext-2np-east',
        name: 'Obvodová stěna východ (2.NP)',
        from: [X_EAST_WALL, Z_NORTH_IN],
        to: [X_EAST_WALL, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Pokoj 4 (východ)', at: 1.84, width: 1.6, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno koupelna (2.NP)', at: 5.05, width: 1.1, height: 1.1, sill: 1.22 },
          { type: 'window', name: 'Okno WC (2.NP)', at: 6.98, width: 0.6, height: 0.9, sill: 1.42 },
          { type: 'window', name: 'Okno Dětský pokoj 3 (východ)', at: 9.43, width: 1.6, height: 1.4, sill: 0.92 },
        ],
      },
      {
        id: 'ext-2np-west',
        name: 'Obvodová stěna západ (2.NP)',
        from: [X_WEST_WALL, Z_NORTH_IN],
        to: [X_WEST_WALL, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Ložnice (západ)', at: 1.84, width: 1.8, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno schodiště (2.NP západ)', at: 4.82, width: 1.2, height: 1.6, sill: 0.35 },
          { type: 'window', name: 'Okno komora (2.NP západ)', at: 6.71, width: 0.7, height: 0.9, sill: 1.42 },
          { type: 'window', name: 'Okno Dětský pokoj 2 (západ)', at: 9.43, width: 1.6, height: 1.4, sill: 0.92 },
        ],
      },
      // Interior partition walls (2.NP, height 2.65 m)
      {
        id: 'part-2np-north-band',
        name: 'Nosná stěna severních pokojů / hala & koupelna',
        from: [X_WEST_IN, Z_NORTH_ROOMS],
        to: [X_EAST_IN, Z_NORTH_ROOMS],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře Ložnice (2.02)', at: 3.58, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'north' } },
          { type: 'opening', name: 'Dveře Pokoj 4 (2.03)', at: 4.57, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'north' } },
        ],
      },
      {
        id: 'part-2np-north-sep',
        name: 'Příčka mezi Ložnicí a Pokojem 4',
        from: [X_NORTH_SEP_A, Z_NORTH_IN],
        to: [X_NORTH_SEP_A, Z_NORTH_ROOMS - T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-stair-south',
        name: 'Příčka schodiště / komora',
        from: [X_WEST_IN, Z_STAIR_SOUTH],
        to: [X_STAIR_HALL + T_PART / 2, Z_STAIR_SOUTH],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-laundry-hall',
        name: 'Příčka komora / hala',
        from: [X_LAUNDRY_HALL_A, Z_STAIR_SOUTH + T_PART / 2],
        to: [X_LAUNDRY_HALL_A, Z_SOUTH_ROOMS - T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře komora (2.06)', at: 0.75, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'west' } },
        ],
      },
      {
        id: 'part-2np-hall-east',
        name: 'Nosná chodbová stěna (východní strana)',
        from: [X_HALL2_EAST_A, Z_NORTH_ROOMS + T_PART / 2],
        to: [X_HALL2_EAST_A, Z_SOUTH_ROOMS - T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře koupelna 2.NP (2.04)', at: 1.25, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'east' } },
          { type: 'opening', name: 'Dveře samostatné WC (2.05)', at: 3.14, width: 0.75, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'west' } },
        ],
      },
      {
        id: 'part-2np-bath-wc',
        name: 'Příčka koupelna / samostatné WC',
        from: [X_HALL2_EAST_A + T_PART / 2, Z_BATH_WC_A],
        to: [X_EAST_IN, Z_BATH_WC_A],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-south-band',
        name: 'Příčka hala, prádelna & WC / dětské pokoje',
        from: [X_WEST_IN, Z_SOUTH_ROOMS],
        to: [X_EAST_IN, Z_SOUTH_ROOMS],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře Dětský pokoj 2 (2.07)', at: 3.34, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'south' } },
          { type: 'opening', name: 'Dveře Dětský pokoj 3 (2.08)', at: 4.42, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'south' } },
        ],
      },
      {
        id: 'part-2np-kids-sep',
        name: 'Příčka mezi dětskými pokoji',
        from: [X_KIDS_SEP_A, Z_SOUTH_ROOMS + T_PART / 2],
        to: [X_KIDS_SEP_A, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
    ],
    furniture: [
      {
        type: 'railing',
        name: 'Zábradlí schodišťové haly (2.01)',
        desc: 'Ochranné zábradlí galerie u výstupu ze schodiště v 2.NP',
        pos: [X_STAIR_HALL, -1.27],
        yOffset: 0.12,
        size: [0.08, 1.0, 1.04],
      },
      {
        type: 'shaft',
        name: 'Instalační šachta VZT + TZB (2.NP)',
        desc: 'Prostup šachty do podkroví k rozdělovači rekuperace',
        pos: [1.21, -3.98],
        size: [0.46, 2.53, 0.44],
      },
      // 2.02 Ložnice rodičů (SZ)
      { type: 'bed', name: 'Manželská postel rodiče', desc: 'Dvoulůžko s nočními stolky u plné severní stěny', pos: [-1.60, -4.60], size: [1.80, 0.52, 2.00] },
      { type: 'wardrobe', name: 'Šatní skříň ložnice', desc: 'Vestavěná skříň na východní příčce s volným průchodem od dveří', pos: [0.16, -4.40], size: [0.60, 2.2, 2.40] },
      { type: 'desk', name: 'Toaletní stolek ložnice', desc: 'Toaletní stolek se zrcadlem u západního okna', pos: [-3.15, -2.80], size: [0.60, 0.75, 1.20] },
      // 2.03 Šatna & Pracovna manželky (SV)
      { type: 'wardrobe', name: 'Velká šatní sestava dámská', desc: 'Velkorysá vestavěná šatní stěna po celé severní stěně (délka 2,8 m)', pos: [2.05, -5.32], size: [2.80, 2.2, 0.60] },
      { type: 'desk', name: 'Pracovní & toaletní stůl', desc: 'Pracovní stůl s ranním východním světlem', pos: [3.20, -3.20], size: [0.70, 0.75, 1.40] },
      // 2.04 Rodinná koupelna
      { type: 'bathtub', name: 'Relaxační vana', desc: 'Pohodlná rodinná vana pod oknem', pos: [2.60, -1.45], size: [1.70, 0.60, 0.80] },
      { type: 'shower', name: 'Walk-in sprchový kout', desc: 'Velký sprchový kout', pos: [1.95, 0.30], size: [0.90, 2.0, 0.90] },
      { type: 'vanity', name: 'Dvojumyvadlo se skříňkou', desc: 'Dvojumyvadlo se zrcadlem a úložným prostorem', pos: [3.20, 0.15], size: [0.55, 0.85, 1.20] },
      // 2.05 Samostatné WC
      { type: 'wc', name: 'Závěsné WC', desc: 'WC mísa se splachovacím modulem na východní stěně', pos: [2.80, 1.36], size: [0.65, 0.45, 0.45] },
      { type: 'vanity', name: 'Umývátko WC', desc: 'Kompaktní umývátko u vstupu', pos: [1.80, 1.36], size: [0.45, 0.80, 0.35] },
      // 2.06 Centrální komora / šatna za schodištěm
      { type: 'wardrobe', name: 'Úložné regály a skříně komory', desc: 'Policový systém a skříně na kufry, sezónní prádlo a úklid', pos: [-2.20, 0.60], size: [0.60, 2.1, 2.40] },
      // 2.07 Dětský pokoj 2 (JZ)
      { type: 'bed', name: 'Postel dětský pokoj JZ', desc: 'Dětská postel 100×200 cm', pos: [-0.60, 4.30], size: [1.00, 0.52, 2.00] },
      { type: 'desk', name: 'Psací stůl JZ', desc: 'Pracovní stůl pod jižním oknem', pos: [-2.40, 5.25], size: [1.40, 0.75, 0.70] },
      { type: 'wardrobe', name: 'Šatní skříň JZ', desc: 'Šatní skříň na západní stěně s volným vstupem do pokoje', pos: [-3.30, 2.70], size: [0.60, 2.1, 1.40] },
      // 2.08 Dětský pokoj 3 (JV)
      { type: 'bed', name: 'Postel dětský pokoj JV', desc: 'Dětská postel 120×200 cm', pos: [1.80, 5.00], size: [1.20, 0.52, 2.00] },
      { type: 'desk', name: 'Psací stůl JV', desc: 'Pracovní stůl se židlí u východního okna', pos: [3.25, 3.80], size: [0.70, 0.75, 1.30] },
      { type: 'wardrobe', name: 'Šatní skříň JV', desc: 'Šatní skříň na severní stěně mimo dosah dveří', pos: [2.40, 2.25], size: [1.60, 2.1, 0.60] },
    ],
    rooms: [
      { id: '2.01', name: 'Schodišťová hala', areaSqm: 6.9, pos: [0.35, 4.05, -0.10], desc: 'Kompaktní čtvercová hala (šířka 1,78 m) s přímými vstupy do všech místností bez dlouhých chodeb' },
      { id: '2.02', name: 'Ložnice / Pokoj 1 (SZ)', areaSqm: 14.7, pos: [-1.62, 4.05, -3.78], desc: 'Prostorná ložnice (4,00 × 3,68 m) s plnou severní stěnou pro manželskou postel a oknem do zahrady' },
      { id: '2.03', name: 'Šatna & Pracovna (SV)', areaSqm: 11.3, pos: [2.08, 4.05, -3.78], desc: 'Multifunkční dámský pokoj a pracovna (3,08 × 3,68 m) s velkorysou sestavou vestavěných šatních skříní, pracovním stolem u okna a ranním východním sluncem' },
      { id: '2.04', fixtures: ['vana', 'sprcha', 'dvojumyvadlo'], name: 'Rodinná koupelna', areaSqm: 5.5, pos: [2.57, 4.05, -0.53], desc: 'Zvětšená rodinná koupelna (2,18 × 2,66 m) pro vanu, velký sprchový kout, dvojumyvadlo a úložné skříňky' },
      { id: '2.05', fixtures: ['wc', 'umyvatko'], name: 'Samostatné WC', areaSqm: 2.0, pos: [2.57, 4.05, 1.36], desc: 'Samostatné WC s umývátkem a východním oknem přímo nad instalační šachtou' },
      { id: '2.06', fixtures: ['satna', 'regal'], name: 'Centrální šatna / Komora', areaSqm: 4.1, pos: [-2.26, 4.05, 1.09], desc: 'Centrální šatna a úložná komora (2,72 × 1,50 m) za schodištěm s vlastním oknem na západ: kufry, sezónní věci, úklid a shoz prádla do technické místnosti' },
      { id: '2.07', name: 'Dětský pokoj 2 (JZ)', areaSqm: 13.8, pos: [-1.72, 4.05, 3.81], desc: 'Slunný čtvercový jihozápadní dětský pokoj (3,80 × 3,62 m) bez úzkých výklenků' },
      { id: '2.08', name: 'Dětský pokoj 3 (JV)', areaSqm: 11.9, pos: [1.98, 4.05, 3.81], desc: 'Světlý čtvercový jihovýchodní dětský pokoj (3,28 × 3,62 m) s okny na jih a východ' },
    ],
  },

  roof: {
    name: 'Sedlová střecha hlavního domu',
    width: W,
    length: L,
    height: 2.8,
    y: 5.82,
    ridgeAxis: 'z',
    eaveOverhang: 0.45,
    gableOverhang: 0.35,
    thickness: 0.22,
  },
};

const SHARED_BASE = {
  footprint: dreamHouseV1.footprint,
  floorHeight: dreamHouseV1.floorHeight,
  wallThickness: dreamHouseV1.wallThickness,
  partThickness: dreamHouseV1.partThickness,
  floor1: dreamHouseV1.floor1,
  ceilingSlab: dreamHouseV1.ceilingSlab,
  ceiling2Slab: dreamHouseV1.ceiling2Slab,
  roof: dreamHouseV1.roof,
};

export const dreamHouse5kk = {
  ...SHARED_BASE,
  id: 'v5kk',
  label: 'Varianta B: 5+kk (3 pokoje + šatna + velká koupelna)',
  floor2: {
    elevation: 3.17,
    finishes: [
      {
        name: 'Podlaha 2.NP (dub)',
        material: 'woodFloor',
        size: [W - 0.4, L - 0.4],
        thickness: 0.12,
        pos: [0, 0],
        holes: [
          { ...STAIR_HOLE },
          { x1: X_HALL2_EAST_B, z1: Z_CLOSET_BATH_B, x2: X_EAST_IN, z2: Z_SOUTH_ROOMS },
          { x1: X_WEST_IN, z1: Z_STAIR_SOUTH, x2: X_LAUNDRY_HALL_B, z2: Z_SOUTH_ROOMS },
        ],
      },
      {
        name: 'Dlažba velká koupelna a WC (2.NP)',
        material: 'tileFloor',
        size: [Number((X_EAST_IN - X_HALL2_EAST_B).toFixed(2)), Number((Z_SOUTH_ROOMS - Z_CLOSET_BATH_B).toFixed(2))],
        thickness: 0.12,
        pos: [Number(((X_HALL2_EAST_B + X_EAST_IN) / 2).toFixed(3)), Number(((Z_CLOSET_BATH_B + Z_SOUTH_ROOMS) / 2).toFixed(3))],
      },
      {
        name: 'Dlažba prádelna za schodištěm (2.NP)',
        material: 'tileFloor',
        size: [Number((X_LAUNDRY_HALL_B - X_WEST_IN).toFixed(2)), Number((Z_SOUTH_ROOMS - Z_STAIR_SOUTH).toFixed(2))],
        thickness: 0.12,
        pos: [Number(((X_WEST_IN + X_LAUNDRY_HALL_B) / 2).toFixed(3)), Number(((Z_STAIR_SOUTH + Z_SOUTH_ROOMS) / 2).toFixed(3))],
      },
    ],
    walls: [
      // Exterior walls (2.NP, height 2.65 m)
      {
        id: 'ext-2np-north',
        name: 'Obvodová stěna sever (2.NP)',
        from: [-W / 2, Z_NORTH_WALL],
        to: [W / 2, Z_NORTH_WALL],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [],
      },
      {
        id: 'ext-2np-south',
        name: 'Obvodová stěna jih (2.NP)',
        from: [-W / 2, Z_SOUTH_WALL],
        to: [W / 2, Z_SOUTH_WALL],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Dětský pokoj 1 (JZ)', at: 2.19, width: 1.8, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno Dětský pokoj 2 (JV)', at: 5.89, width: 1.8, height: 1.4, sill: 0.92 },
        ],
      },
      {
        id: 'ext-2np-east',
        name: 'Obvodová stěna východ (2.NP)',
        from: [X_EAST_WALL, Z_NORTH_IN],
        to: [X_EAST_WALL, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno koupelna (2.NP)', at: 4.45, width: 1.4, height: 1.2, sill: 1.12 },
          { type: 'window', name: 'Okno WC (2.NP)', at: 6.85, width: 0.6, height: 0.9, sill: 1.42 },
          { type: 'window', name: 'Okno Dětský pokoj 2 (východ)', at: 9.43, width: 1.6, height: 1.4, sill: 0.92 },
        ],
      },
      {
        id: 'ext-2np-west',
        name: 'Obvodová stěna západ (2.NP)',
        from: [X_WEST_WALL, Z_NORTH_IN],
        to: [X_WEST_WALL, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Rodičovská ložnice (západ)', at: 1.84, width: 1.8, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno schodiště (2.NP západ)', at: 4.82, width: 1.2, height: 1.6, sill: 0.35 },
          { type: 'window', name: 'Okno komora (2.NP západ)', at: 6.71, width: 0.7, height: 0.9, sill: 1.42 },
          { type: 'window', name: 'Okno Dětský pokoj 1 (západ)', at: 9.43, width: 1.6, height: 1.4, sill: 0.92 },
        ],
      },
      // Interior partition walls (2.NP, height 2.65 m)
      {
        id: 'part-2np-master-south',
        name: 'Nosná stěna Rodičovská ložnice / hala',
        from: [X_WEST_IN, Z_NORTH_ROOMS],
        to: [X_HALL2_EAST_B - T_PART / 2, Z_NORTH_ROOMS],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře Rodičovská ložnice (2.02)', at: 3.92, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'north' } },
        ],
      },
      {
        id: 'part-2np-master-closet',
        name: 'Nosná stěna Rodičovská ložnice / šatna',
        from: [X_HALL2_EAST_B, Z_NORTH_IN],
        to: [X_HALL2_EAST_B, Z_NORTH_ROOMS],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře do šatny (2.03)', at: 1.38, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'east' } },
        ],
      },
      {
        id: 'part-2np-closet-bath',
        name: 'Příčka šatna / velká koupelna',
        from: [X_HALL2_EAST_B + T_PART / 2, Z_CLOSET_BATH_B],
        to: [X_EAST_IN, Z_CLOSET_BATH_B],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-stair-south',
        name: 'Příčka schodiště / komora',
        from: [X_WEST_IN, Z_STAIR_SOUTH],
        to: [X_STAIR_HALL + T_PART / 2, Z_STAIR_SOUTH],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-laundry-hall',
        name: 'Příčka komora / hala',
        from: [X_LAUNDRY_HALL_B, Z_STAIR_SOUTH + T_PART / 2],
        to: [X_LAUNDRY_HALL_B, Z_SOUTH_ROOMS - T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře komora (2.06)', at: 0.75, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'west' } },
        ],
      },
      {
        id: 'part-2np-hall-east',
        name: 'Nosná chodbová stěna (východní strana)',
        from: [X_HALL2_EAST_B, Z_NORTH_ROOMS],
        to: [X_HALL2_EAST_B, Z_SOUTH_ROOMS - T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře koupelna 2.NP (2.04)', at: 1.10, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'east' } },
          { type: 'opening', name: 'Dveře samostatné WC (2.05)', at: 3.09, width: 0.75, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'east' } },
        ],
      },
      {
        id: 'part-2np-bath-wc',
        name: 'Příčka velká koupelna / samostatné WC',
        from: [X_HALL2_EAST_B + T_PART / 2, Z_BATH_WC_B],
        to: [X_EAST_IN, Z_BATH_WC_B],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-south-band',
        name: 'Příčka hala, prádelna & WC / dětské pokoje',
        from: [X_WEST_IN, Z_SOUTH_ROOMS],
        to: [X_EAST_IN, Z_SOUTH_ROOMS],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře Dětský pokoj 1 (2.07)', at: 3.20, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'south' } },
          { type: 'opening', name: 'Dveře Dětský pokoj 2 (2.08)', at: 4.20, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'south' } },
        ],
      },
      {
        id: 'part-2np-kids-sep',
        name: 'Příčka mezi dětskými pokoji',
        from: [X_KIDS_SEP_B, Z_SOUTH_ROOMS + T_PART / 2],
        to: [X_KIDS_SEP_B, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
    ],
    furniture: [
      {
        type: 'railing',
        name: 'Zábradlí schodišťové haly (2.01)',
        desc: 'Ochranné zábradlí galerie u výstupu ze schodiště v 2.NP',
        pos: [X_STAIR_HALL, -1.27],
        yOffset: 0.12,
        size: [0.08, 1.0, 1.04],
      },
      {
        type: 'shaft',
        name: 'Instalační šachta VZT + TZB (2.NP)',
        desc: 'Prostup šachty do podkroví k rozdělovači rekuperace',
        pos: [1.21, -3.98],
        size: [0.46, 2.53, 0.44],
      },
      // 2.02 Ložnice rodičů (SZ)
      { type: 'bed', name: 'Manželská postel rodiče', desc: 'Dvoulůžko s nočními stolky u plné severní stěny', pos: [-1.60, -4.60], size: [1.80, 0.52, 2.00] },
      { type: 'wardrobe', name: 'Šatní skříň ložnice', desc: 'Vestavěná skříň na východní příčce s volným průchodem od dveří', pos: [0.16, -4.40], size: [0.60, 2.2, 2.40] },
      { type: 'desk', name: 'Toaletní stolek ložnice', desc: 'Toaletní stolek se zrcadlem u západního okna', pos: [-3.15, -2.80], size: [0.60, 0.75, 1.20] },
      // 2.03 Šatna & Pracovna manželky (SV)
      { type: 'wardrobe', name: 'Velká šatní sestava dámská', desc: 'Velkorysá vestavěná šatní stěna po celé severní stěně (délka 2,8 m)', pos: [2.05, -5.32], size: [2.80, 2.2, 0.60] },
      { type: 'desk', name: 'Pracovní & toaletní stůl', desc: 'Pracovní stůl s ranním východním světlem', pos: [3.20, -3.20], size: [0.70, 0.75, 1.40] },
      // 2.04 Rodinná koupelna
      { type: 'bathtub', name: 'Relaxační vana', desc: 'Pohodlná rodinná vana pod oknem', pos: [2.60, -1.45], size: [1.70, 0.60, 0.80] },
      { type: 'shower', name: 'Walk-in sprchový kout', desc: 'Velký sprchový kout', pos: [1.95, 0.30], size: [0.90, 2.0, 0.90] },
      { type: 'vanity', name: 'Dvojumyvadlo se skříňkou', desc: 'Dvojumyvadlo se zrcadlem a úložným prostorem', pos: [3.20, 0.15], size: [0.55, 0.85, 1.20] },
      // 2.05 Samostatné WC
      { type: 'wc', name: 'Závěsné WC', desc: 'WC mísa se splachovacím modulem na východní stěně', pos: [2.80, 1.36], size: [0.65, 0.45, 0.45] },
      { type: 'vanity', name: 'Umývátko WC', desc: 'Kompaktní umývátko u vstupu', pos: [1.80, 1.36], size: [0.45, 0.80, 0.35] },
      // 2.06 Centrální komora / šatna za schodištěm
      { type: 'wardrobe', name: 'Úložné regály a skříně komory', desc: 'Policový systém a skříně na kufry, sezónní prádlo a úklid', pos: [-2.20, 0.60], size: [0.60, 2.1, 2.40] },
      // 2.07 Dětský pokoj 2 (JZ)
      { type: 'bed', name: 'Postel dětský pokoj JZ', desc: 'Dětská postel 100×200 cm', pos: [-0.60, 4.30], size: [1.00, 0.52, 2.00] },
      { type: 'desk', name: 'Psací stůl JZ', desc: 'Pracovní stůl pod jižním oknem', pos: [-2.40, 5.25], size: [1.40, 0.75, 0.70] },
      { type: 'wardrobe', name: 'Šatní skříň JZ', desc: 'Šatní skříň na západní stěně s volným vstupem do pokoje', pos: [-3.30, 2.70], size: [0.60, 2.1, 1.40] },
      // 2.08 Dětský pokoj 3 (JV)
      { type: 'bed', name: 'Postel dětský pokoj JV', desc: 'Dětská postel 120×200 cm', pos: [1.80, 5.00], size: [1.20, 0.52, 2.00] },
      { type: 'desk', name: 'Psací stůl JV', desc: 'Pracovní stůl se židlí u východního okna', pos: [3.25, 3.80], size: [0.70, 0.75, 1.30] },
      { type: 'wardrobe', name: 'Šatní skříň JV', desc: 'Šatní skříň na severní stěně mimo dosah dveří', pos: [2.40, 2.25], size: [1.60, 2.1, 0.60] },
    ],
    rooms: [
      { id: '2.01', name: 'Schodišťová hala', areaSqm: 6.2, pos: [0.15, 4.05, -0.10], desc: 'Kompaktní schodišťová hala s přímými vstupy do rodičovské ložnice, koupelny, WC, prádelny a dětských pokojů' },
      { id: '2.02', name: 'Rodičovská ložnice (SZ)', areaSqm: 17.0, pos: [-1.31, 4.05, -3.78], desc: 'Velkorysá rodičovská ložnice (4,62 × 3,68 m) s přímým vstupem do vlastní šatny a oknem do zahrady' },
      { id: '2.03', name: 'Rodičovská šatna (SV)', areaSqm: 6.5, pos: [2.39, 4.05, -4.29], desc: 'Samostatná čtvercová walk-in šatna (2,46 × 2,66 m) přístupná přímo z rodičovské ložnice' },
      { id: '2.04', fixtures: ['vana', 'sprcha', 'dvojumyvadlo'], name: 'Velká rodinná koupelna', areaSqm: 8.0, pos: [2.39, 4.05, -1.17], desc: 'Velkorysá rodinná koupelna (2,46 × 3,26 m) pro volně stojící vanu, velký walk-in sprchový kout a dvojumyvadlo' },
      { id: '2.05', fixtures: ['wc', 'umyvatko'], name: 'Samostatné WC', areaSqm: 3.0, pos: [2.39, 4.05, 1.23], desc: 'Prostorné samostatné WC s umývátkem a oknem na východ' },
      { id: '2.06', fixtures: ['satna', 'regal'], name: 'Centrální komora / Sklad', areaSqm: 3.9, pos: [-2.31, 4.05, 1.09], desc: 'Centrální úložná komora a sklad (2,62 × 1,50 m) za schodištěm s vlastním západním oknem a shozem prádla' },
      { id: '2.07', name: 'Dětský pokoj 1 (JZ)', areaSqm: 13.1, pos: [-1.81, 4.05, 3.81], desc: 'Čtvercový jihozápadní dětský pokoj (3,62 × 3,62 m) s okny na jih a západ' },
      { id: '2.08', name: 'Dětský pokoj 2 (JV)', areaSqm: 12.5, pos: [1.89, 4.05, 3.81], desc: 'Čtvercový jihovýchodní dětský pokoj (3,46 × 3,62 m) s okny na jih a východ' },
    ],
  },
};

export const dreamHouseOriginal = {
  ...SHARED_BASE,
  id: 'original',
  label: 'Původní 2.NP (s nudlemi – pro srovnání)',
  floor2: {
    elevation: 3.17,
    finishes: [
      {
        name: 'Podlaha 2.NP (dub)',
        material: 'woodFloor',
        size: [W - 0.4, L - 0.4],
        thickness: 0.12,
        pos: [0, 0],
        holes: [
          { ...STAIR_HOLE },
          { x1: X_HALL2_EAST, z1: Z_ROOM4, x2: X_EAST_IN, z2: Z_KIDS3 },
        ],
      },
      {
        name: 'Dlažba koupelna, WC a prádelna (2.NP)',
        material: 'tileFloor',
        size: [Number((X_EAST_IN - X_HALL2_EAST).toFixed(2)), Number((Z_KIDS3 - Z_ROOM4).toFixed(2))],
        thickness: 0.12,
        pos: [Number(((X_HALL2_EAST + X_EAST_IN) / 2).toFixed(3)), Number(((Z_ROOM4 + Z_KIDS3) / 2).toFixed(2))],
      },
    ],
    walls: [
      // Exterior walls (2.NP, height 2.65 m)
      {
        id: 'ext-2np-north',
        name: 'Obvodová stěna sever (2.NP)',
        from: [-W / 2, Z_NORTH_WALL],
        to: [W / 2, Z_NORTH_WALL],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Pokoj 4 (SV)', at: 5.6, width: 1.4, height: 1.3, sill: 1.02 },
        ],
      },
      {
        id: 'ext-2np-south',
        name: 'Obvodová stěna jih (2.NP)',
        from: [-W / 2, Z_SOUTH_WALL],
        to: [W / 2, Z_SOUTH_WALL],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Dětský pokoj 2 (JZ)', at: 2.0, width: 1.8, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno Dětský pokoj 3 (JV)', at: 5.7, width: 1.8, height: 1.4, sill: 0.92 },
        ],
      },
      {
        id: 'ext-2np-east',
        name: 'Obvodová stěna východ (2.NP)',
        from: [X_EAST_WALL, Z_NORTH_IN],
        to: [X_EAST_WALL, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Pokoj 4 (východ)', at: 1.32, width: 1.5, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno koupelna (2.NP)', at: 3.75, width: 1.2, height: 1.2, sill: 1.12 },
          { type: 'window', name: 'Okno prádelna (2.NP)', at: 5.58, width: 0.7, height: 0.9, sill: 1.42 },
          { type: 'window', name: 'Okno WC (2.NP)', at: 6.84, width: 0.6, height: 0.9, sill: 1.42 },
          { type: 'window', name: 'Okno Dětský pokoj 3 (východ)', at: 9.35, width: 1.6, height: 1.4, sill: 0.92 },
        ],
      },
      {
        id: 'ext-2np-west',
        name: 'Obvodová stěna západ (2.NP)',
        from: [X_WEST_WALL, Z_NORTH_IN],
        to: [X_WEST_WALL, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno Pokoj 1 (západ)', at: 1.92, width: 1.8, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno schodiště (2.NP západ)', at: 4.82, width: 1.2, height: 1.6, sill: 0.35 },
          { type: 'window', name: 'Okno Dětský pokoj 2 (západ)', at: 8.60, width: 1.6, height: 1.4, sill: 0.92 },
        ],
      },
      // Interior partition walls (2.NP, height 2.65 m)
      {
        id: 'part-2np-room1-stair',
        name: 'Příčka Pokoj 1 / schodiště',
        from: [X_WEST_IN, Z_STUDY_STAIR],
        to: [X_STAIR_HALL - T_PART / 2, Z_STUDY_STAIR],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-room1-east',
        name: 'Nosná stěna Pokoj 1 / hala',
        from: [X_STAIR_HALL, Z_NORTH_IN],
        to: [X_STAIR_HALL, Z_STUDY_STAIR + T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře Pokoj 1 (2.02)', at: 3.22, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'west' } },
        ],
      },
      {
        id: 'part-2np-room4-south',
        name: 'Příčka Pokoj 4 / hala & koupelna',
        from: [X_STAIR_HALL + T_PART / 2, Z_ROOM4],
        to: [X_EAST_IN, Z_ROOM4],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře Pokoj 4 (2.03)', at: 0.82, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'north' } },
        ],
      },
      {
        id: 'part-2np-stair-kids2',
        name: 'Příčka schodiště / Dětský pokoj 2',
        from: [X_WEST_IN, Z_STAIR_KIDS2],
        to: [X_STAIR_HALL - T_PART / 2, Z_STAIR_KIDS2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-hall-west-south',
        name: 'Příčka hala / Dětský pokoj 2',
        from: [X_STAIR_HALL, Z_STAIR_KIDS2 - T_PART / 2],
        to: [X_STAIR_HALL, Z_KIDS3 - T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře Dětský pokoj 2 (2.07)', at: 1.12, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'west' } },
        ],
      },
      {
        id: 'part-2np-hall-east',
        name: 'Nosná chodbová stěna (východní strana)',
        from: [X_HALL2_EAST, Z_ROOM4 + T_PART / 2],
        to: [X_HALL2_EAST, Z_KIDS3 - T_PART / 2],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře koupelna 2.NP (2.04)', at: 1.05, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'east' } },
          { type: 'opening', name: 'Dveře prádelna (2.06)', at: 2.88, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'east' } },
          { type: 'opening', name: 'Dveře samostatné WC (2.05)', at: 4.14, width: 0.75, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'west' } },
        ],
      },
      {
        id: 'part-2np-bath-wc',
        name: 'Příčka koupelna / prádelna',
        from: [X_HALL2_EAST + T_PART / 2, Z_BATH2_LAUNDRY],
        to: [X_EAST_IN, Z_BATH2_LAUNDRY],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-wc-laundry',
        name: 'Příčka prádelna / samostatné WC',
        from: [X_HALL2_EAST + T_PART / 2, Z_LAUNDRY_WC],
        to: [X_EAST_IN, Z_LAUNDRY_WC],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-2np-south-east',
        name: 'Příčka hala & WC / Dětský pokoj 3',
        from: [X_STAIR_HALL - T_PART / 2, Z_KIDS3],
        to: [X_EAST_IN, Z_KIDS3],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře Dětský pokoj 3 (2.08)', at: 0.95, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'south' } },
        ],
      },
      {
        id: 'part-2np-kids-sep',
        name: 'Příčka mezi dětskými pokoji',
        from: [X_KIDS_SEP, Z_KIDS3 + T_PART / 2],
        to: [X_KIDS_SEP, Z_SOUTH_IN],
        height: 2.65,
        thickness: T_PART,
        material: 'partition',
      },
    ],
    furniture: [
      {
        type: 'railing',
        name: 'Zábradlí schodišťové haly (2.01)',
        desc: 'Ochranné zábradlí galerie u výstupu ze schodiště v 2.NP',
        pos: [X_STAIR_HALL, -1.27],
        yOffset: 0.12,
        size: [0.08, 1.0, 1.04],
      },
      {
        type: 'shaft',
        name: 'Instalační šachta VZT + TZB (2.NP)',
        desc: 'Prostup šachty do podkroví k rozdělovači rekuperace',
        pos: [1.21, -3.98],
        size: [0.46, 2.53, 0.44],
      },
      // 2.02 Ložnice rodičů (SZ)
      { type: 'bed', name: 'Manželská postel rodiče', desc: 'Dvoulůžko s nočními stolky u plné severní stěny', pos: [-1.60, -4.60], size: [1.80, 0.52, 2.00] },
      { type: 'wardrobe', name: 'Šatní skříň ložnice', desc: 'Vestavěná skříň na východní příčce s volným průchodem od dveří', pos: [0.16, -4.40], size: [0.60, 2.2, 2.40] },
      { type: 'desk', name: 'Toaletní stolek ložnice', desc: 'Toaletní stolek se zrcadlem u západního okna', pos: [-3.15, -2.80], size: [0.60, 0.75, 1.20] },
      // 2.03 Šatna & Pracovna manželky (SV)
      { type: 'wardrobe', name: 'Velká šatní sestava dámská', desc: 'Velkorysá vestavěná šatní stěna po celé severní stěně (délka 2,8 m)', pos: [2.05, -5.32], size: [2.80, 2.2, 0.60] },
      { type: 'desk', name: 'Pracovní & toaletní stůl', desc: 'Pracovní stůl s ranním východním světlem', pos: [3.20, -3.20], size: [0.70, 0.75, 1.40] },
      // 2.04 Rodinná koupelna
      { type: 'bathtub', name: 'Relaxační vana', desc: 'Pohodlná rodinná vana pod oknem', pos: [2.60, -1.45], size: [1.70, 0.60, 0.80] },
      { type: 'shower', name: 'Walk-in sprchový kout', desc: 'Velký sprchový kout', pos: [1.95, 0.30], size: [0.90, 2.0, 0.90] },
      { type: 'vanity', name: 'Dvojumyvadlo se skříňkou', desc: 'Dvojumyvadlo se zrcadlem a úložným prostorem', pos: [3.20, 0.15], size: [0.55, 0.85, 1.20] },
      // 2.05 Samostatné WC
      { type: 'wc', name: 'Závěsné WC', desc: 'WC mísa se splachovacím modulem na východní stěně', pos: [2.80, 1.36], size: [0.65, 0.45, 0.45] },
      { type: 'vanity', name: 'Umývátko WC', desc: 'Kompaktní umývátko u vstupu', pos: [1.80, 1.36], size: [0.45, 0.80, 0.35] },
      // 2.06 Centrální komora / šatna za schodištěm
      { type: 'wardrobe', name: 'Úložné regály a skříně komory', desc: 'Policový systém a skříně na kufry, sezónní prádlo a úklid', pos: [-2.20, 0.60], size: [0.60, 2.1, 2.40] },
      // 2.07 Dětský pokoj 2 (JZ)
      { type: 'bed', name: 'Postel dětský pokoj JZ', desc: 'Dětská postel 100×200 cm', pos: [-0.60, 4.30], size: [1.00, 0.52, 2.00] },
      { type: 'desk', name: 'Psací stůl JZ', desc: 'Pracovní stůl pod jižním oknem', pos: [-2.40, 5.25], size: [1.40, 0.75, 0.70] },
      { type: 'wardrobe', name: 'Šatní skříň JZ', desc: 'Šatní skříň na západní stěně s volným vstupem do pokoje', pos: [-3.30, 2.70], size: [0.60, 2.1, 1.40] },
      // 2.08 Dětský pokoj 3 (JV)
      { type: 'bed', name: 'Postel dětský pokoj JV', desc: 'Dětská postel 120×200 cm', pos: [1.80, 5.00], size: [1.20, 0.52, 2.00] },
      { type: 'desk', name: 'Psací stůl JV', desc: 'Pracovní stůl se židlí u východního okna', pos: [3.25, 3.80], size: [0.70, 0.75, 1.30] },
      { type: 'wardrobe', name: 'Šatní skříň JV', desc: 'Šatní skříň na severní stěně mimo dosah dveří', pos: [2.40, 2.25], size: [1.60, 2.1, 0.60] },
    ],
    rooms: [
      { id: '2.01', name: 'Schodišťová hala', areaSqm: 6.5, pos: [0.28, 4.05, -0.60], desc: 'Rozšířená centrální hala v 2.NP (šířka 1,39 m) se vstupy do všech místností mimo osu schodiště' },
      { id: '2.02', name: 'Pokoj 1 / Ložnice (SZ)', areaSqm: 11.2, pos: [-2.10, 4.05, -3.78], desc: 'Ložnice s plnou severní stěnou pro postel a velkým západním oknem do zahrady' },
      { id: '2.03', name: 'Pokoj 4 / Pracovna (SV)', areaSqm: 10.3, pos: [1.60, 4.05, -4.35], desc: '4. samostatná místnost v patře s bezkolizně odsazeným vstupem od rohu haly' },
      { id: '2.04', fixtures: ['vana', 'sprcha', 'dvojumyvadlo'], name: 'Rodinná koupelna', areaSqm: 5.3, pos: [2.38, 4.05, -1.86], desc: 'Vana, walk-in sprchový kout, dvojumyvadlo, okno na východ' },
      { id: '2.06', fixtures: ['pracka', 'vylevka'], name: 'Prádelna / Úklid', areaSqm: 3.0, pos: [2.38, 4.05, -0.04], desc: 'Průchodná prádelna (šířka 1,20 m) pro pračku, sušičku a úklidovou skříň' },
      { id: '2.05', fixtures: ['wc', 'umyvatko'], name: 'Samostatné WC', areaSqm: 2.5, pos: [2.38, 4.05, 1.22], desc: 'Samostatné WC s umývátkem a oknem, bezpečně posunuté mimo osu schodiště' },
      { id: '2.07', name: 'Dětský pokoj 2 (JZ)', areaSqm: 16.3, pos: [-2.00, 4.05, 3.60], desc: 'Slunný jihozápadní dětský pokoj s bezkolizní šatní nikou a průchodem komínu' },
      { id: '2.08', name: 'Dětský pokoj 3 (JV)', areaSqm: 14.4, pos: [1.70, 4.05, 3.75], desc: 'Světlý jihovýchodní dětský pokoj s prostorem pro postel, psací stůl i velkou skříň' },
    ],
  },
};

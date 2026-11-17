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
const Z_BATH1 = -3.00;
const Z_TECH_VEST = -2.14;
const Z_SPINE = 0.30;
const X_KITCHEN_SPLIT = 1.00;

// 2.NP interior wall axes
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

const F1_LEFT_X_START = -W / 2 + 0.2;
const F1_RIGHT_X_END = W / 2 - 0.2;
const F1_NORTH_Z_MID = -2.8;

export const dreamHouseV1 = {
  id: 'concept',
  label: 'Concept Massing (Built-in)',
  footprint: {
    width: W,
    length: L,
  },
  floorHeight: 2.80,
  wallThickness: T_EXT,
  partThickness: T_PART,

  floor1: {
    elevation: 0,
    finishes: [
      { name: 'Podlaha obývací pokoj & kuchyň', material: 'woodFloor', size: [W - 0.4, L / 2 - 0.4], thickness: 0.12, pos: [0, L / 4] },
      {
        name: 'Podlaha pracovna / ložnice & schodiště (1.NP)',
        material: 'woodFloor',
        size: [Number((X_STAIR_HALL - F1_LEFT_X_START).toFixed(2)), L / 2],
        thickness: 0.12,
        pos: [Number(((F1_LEFT_X_START + X_STAIR_HALL) / 2).toFixed(2)), F1_NORTH_Z_MID],
      },
      {
        name: 'Dlažba zádveří, chodba, technická m., koupelna',
        material: 'tileFloor',
        size: [Number((F1_RIGHT_X_END - X_STAIR_HALL).toFixed(2)), L / 2],
        thickness: 0.12,
        pos: [Number(((X_STAIR_HALL + F1_RIGHT_X_END) / 2).toFixed(2)), F1_NORTH_Z_MID],
      },
      { name: 'Zahradní terasa (thermodřevo)', material: 'terrace', size: [4.0, 6.0], thickness: 0.14, pos: [-W / 2 - 2.0, L / 4] },
    ],
    walls: [
      // Exterior perimeter walls (1.NP, height 2.75 m)
      {
        id: 'ext-1np-north',
        name: 'Obvodová stěna sever (1.NP)',
        from: [-W / 2, Z_NORTH_WALL],
        to: [W / 2, Z_NORTH_WALL],
        height: 2.75,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno koupelna 1.NP (sever)', at: 4.45, width: 0.7, height: 0.75, sill: 1.57 },
          { type: 'door', name: 'Venkovní dveře technická m.', at: 6.55, width: 0.95, height: 2.2, sill: 0.12, swing: { hinge: 'end', dir: 'north' } },
        ],
      },
      {
        id: 'ext-1np-south',
        name: 'Obvodová stěna jih (1.NP)',
        from: [-W / 2, Z_SOUTH_WALL],
        to: [W / 2, Z_SOUTH_WALL],
        height: 2.75,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Francouzské okno obývák (jih)', at: 4.30, width: 3.0, height: 2.2, sill: 0.12, sliding: true },
        ],
      },
      {
        id: 'ext-1np-east',
        name: 'Obvodová stěna východ (1.NP)',
        from: [X_EAST_WALL, Z_NORTH_IN],
        to: [X_EAST_WALL, Z_SOUTH_IN],
        height: 2.75,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'door', name: 'Hlavní vchodové dveře', at: 4.56, width: 1.05, height: 2.2, sill: 0.12, swing: { hinge: 'start', dir: 'west' } },
          { type: 'window', name: 'Pásové okno kuchyň (východ)', at: 7.62, width: 1.90, height: 1.15, sill: 1.17 },
          { type: 'window', name: 'Okno jídelna (východ)', at: 10.12, width: 1.4, height: 1.4, sill: 0.92 },
        ],
      },
      {
        id: 'ext-1np-west',
        name: 'Obvodová stěna západ (1.NP)',
        from: [X_WEST_WALL, Z_NORTH_IN],
        to: [X_WEST_WALL, Z_SOUTH_IN],
        height: 2.75,
        thickness: T_EXT,
        material: 'wall',
        openings: [
          { type: 'window', name: 'Okno pracovna (západ)', at: 1.92, width: 1.6, height: 1.4, sill: 0.92 },
          { type: 'window', name: 'Okno schodiště (západ)', at: 4.82, width: 1.2, height: 0.8, sill: 1.85 },
          { type: 'window', name: 'HS portál na terasu', at: 8.60, width: 4.2, height: 2.2, sill: 0.12, sliding: true },
        ],
      },
      // Interior walls & load-bearing spine (1.NP, height 2.68 m)
      {
        id: 'part-1np-study-stair',
        name: 'Akustická příčka pracovna / schodiště',
        from: [X_WEST_IN, Z_STUDY_STAIR],
        to: [X_STAIR_HALL - T_PART / 2, Z_STUDY_STAIR],
        height: 2.68,
        thickness: T_PART,
        material: 'partition',
      },
      {
        id: 'part-1np-study-hall',
        name: 'Nosná stěna pracovna / chodba',
        from: [X_STAIR_HALL, Z_NORTH_IN],
        to: [X_STAIR_HALL, Z_STUDY_STAIR + T_PART / 2],
        height: 2.68,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře do pracovny (1.04)', at: 3.19, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'west' } },
        ],
      },
      {
        id: 'part-1np-stair-living',
        name: 'Středová nosná stěna schodiště & chodba / obývák',
        from: [X_WEST_IN, Z_SPINE],
        to: [X_TECH_WALL, Z_SPINE],
        height: 2.68,
        thickness: T_SPINE,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Průchod chodba / obývací pokoj', at: 4.07, width: 1.25, height: 2.15, sill: 0.12 },
        ],
      },
      {
        id: 'part-1np-bath-south',
        name: 'Příčka koupelna / chodba',
        from: [X_STAIR_HALL + T_PART / 2, Z_BATH1],
        to: [X_TECH_WALL - T_PART / 2, Z_BATH1],
        height: 2.68,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře koupelna 1.NP (1.03)', at: 0.87, width: 0.8, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'north' } },
        ],
      },
      {
        id: 'part-1np-tech-vestibule',
        name: 'Příčka technická m. / zádveří',
        from: [X_TECH_WALL + T_PART / 2, Z_TECH_VEST],
        to: [X_EAST_IN, Z_TECH_VEST],
        height: 2.68,
        thickness: T_PART,
        material: 'partition',
        openings: [
          { type: 'opening', name: 'Dveře technická m. (1.02)', at: 0.87, width: 0.85, height: 2.10, sill: 0.12, swing: { hinge: 'end', dir: 'north' } },
        ],
      },
      {
        id: 'part-1np-bath-tech-div',
        name: 'Nosná stěna koupelna & chodba / technická m.',
        from: [X_TECH_WALL, Z_NORTH_IN],
        to: [X_TECH_WALL, Z_TECH_VEST],
        height: 2.68,
        thickness: T_PART,
        material: 'partition',
        structural: true,
      },
      {
        id: 'part-1np-vestibule-hall',
        name: 'Nosná stěna zádveří / chodba',
        from: [X_TECH_WALL, Z_TECH_VEST],
        to: [X_TECH_WALL, Z_SPINE - T_SPINE / 2],
        height: 2.68,
        thickness: T_PART,
        material: 'partition',
        structural: true,
        openings: [
          { type: 'opening', name: 'Dveře zádveří / chodba', at: 1.08, width: 0.95, height: 2.10, sill: 0.12, swing: { hinge: 'start', dir: 'west' } },
        ],
      },
      {
        id: 'part-1np-vestibule-kitchen',
        name: 'Středová nosná stěna zádveří / kuchyň',
        from: [X_TECH_WALL, Z_SPINE],
        to: [X_EAST_IN, Z_SPINE],
        height: 2.68,
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
        size: [4.0, 3.02, 6.0],
        height: 2.8,
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
        yOffset: 2.45,
        size: [1.1, 0.08, 1.8],
      },
      {
        type: 'stairs',
        layout: 'u-turn',
        name: 'Dvouramenné schodiště do 2.NP',
        desc: 'Dvouramenné vratné schodiště s mezipodestou propojující chodbu 1.NP a halu 2.NP',
        pos: [0, 0],
        yBase: 0.12,
        xStart: X_STAIR_HALL,
        xLanding: -2.58,
        xEnd: X_WEST_IN,
        zFlight1: [STAIR_HOLE.z1, -0.84],
        zFlight2: [-0.76, STAIR_HOLE.z2],
        stepsPerFlight: 8,
        totalRise: 2.98,
      },
    ],
    rooms: [
      { id: '1.01', name: 'Zádveří / Vstup', areaSqm: 4.8, pos: [2.55, 1.1, -0.94], desc: 'Vstupní hala s 60cm nikou na vestavěnou skříň a venkovním přístřeškem' },
      { id: '1.02', name: 'Technická m. / TČ', areaSqm: 7.3, pos: [2.55, 1.1, -3.92], desc: 'TČ, rekuperace + přímé venkovní dveře k dílně a krytému stání' },
      { id: '1.03', name: 'Koupelna s WC', areaSqm: 4.4, pos: [0.45, 1.1, -4.35], desc: 'Rozšířená koupelna se sprchovým koutem a WC na společné instalační stěně s TČ' },
      { id: '1.04', name: 'Budoucí ložnice / Pracovna', areaSqm: 11.2, pos: [-2.10, 1.1, -3.78], desc: 'Pracovna / budoucí bezbariérová ložnice s plnou severní stěnou pro manželskou postel' },
      { id: '1.05', name: 'Chodba & schodiště', areaSqm: 11.5, pos: [0.45, 1.4, -1.35], desc: 'Centrální chodba s pohodlným dvouramenným schodištěm a úložným prostorem pod ramenem' },
      {
        id: '1.06',
        name: 'Kuchyňský kout + Jídelna',
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
    y: 2.80,
    holes: [{ ...STAIR_HOLE }],
  },

  floor2: {
    elevation: 3.02,
    finishes: [
      {
        name: 'Podlaha 2.NP (dub)',
        material: 'woodFloor',
        size: [W - 0.4, L - 0.4],
        thickness: 0.08,
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
        thickness: 0.08,
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
          { type: 'window', name: 'Okno Pokoj 4 (SV)', at: 5.6, width: 1.4, height: 1.3, sill: 0.98 },
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
          { type: 'window', name: 'Okno Dětský pokoj 2 (JZ)', at: 2.0, width: 1.8, height: 1.4, sill: 0.88 },
          { type: 'window', name: 'Okno Dětský pokoj 3 (JV)', at: 5.7, width: 1.8, height: 1.4, sill: 0.88 },
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
          { type: 'window', name: 'Okno Pokoj 4 (východ)', at: 1.32, width: 1.5, height: 1.4, sill: 0.88 },
          { type: 'window', name: 'Okno koupelna (2.NP)', at: 3.75, width: 1.2, height: 1.2, sill: 1.08 },
          { type: 'window', name: 'Okno prádelna (2.NP)', at: 5.58, width: 0.7, height: 0.9, sill: 1.38 },
          { type: 'window', name: 'Okno WC (2.NP)', at: 6.84, width: 0.6, height: 0.9, sill: 1.38 },
          { type: 'window', name: 'Okno Dětský pokoj 3 (východ)', at: 9.35, width: 1.6, height: 1.4, sill: 0.88 },
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
          { type: 'window', name: 'Okno Pokoj 1 (západ)', at: 1.92, width: 1.8, height: 1.4, sill: 0.88 },
          { type: 'window', name: 'Okno schodiště (2.NP západ)', at: 4.82, width: 1.2, height: 1.6, sill: 0.35 },
          { type: 'window', name: 'Okno Dětský pokoj 2 (západ)', at: 8.60, width: 1.6, height: 1.4, sill: 0.88 },
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
          { type: 'opening', name: 'Dveře Pokoj 1 (2.02)', at: 3.22, width: 0.85, height: 2.10, sill: 0.08, swing: { hinge: 'end', dir: 'west' } },
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
          { type: 'opening', name: 'Dveře Pokoj 4 (2.03)', at: 0.82, width: 0.85, height: 2.10, sill: 0.08, swing: { hinge: 'start', dir: 'north' } },
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
          { type: 'opening', name: 'Dveře Dětský pokoj 2 (2.07)', at: 1.12, width: 0.85, height: 2.10, sill: 0.08, swing: { hinge: 'start', dir: 'west' } },
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
          { type: 'opening', name: 'Dveře koupelna 2.NP (2.04)', at: 1.05, width: 0.85, height: 2.10, sill: 0.08, swing: { hinge: 'end', dir: 'east' } },
          { type: 'opening', name: 'Dveře prádelna (2.06)', at: 2.88, width: 0.80, height: 2.10, sill: 0.08, swing: { hinge: 'start', dir: 'east' } },
          { type: 'opening', name: 'Dveře samostatné WC (2.05)', at: 4.14, width: 0.75, height: 2.10, sill: 0.08, swing: { hinge: 'end', dir: 'west' } },
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
          { type: 'opening', name: 'Dveře Dětský pokoj 3 (2.08)', at: 0.95, width: 0.85, height: 2.10, sill: 0.08, swing: { hinge: 'start', dir: 'south' } },
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
        yOffset: 0.08,
        size: [0.08, 1.0, 1.04],
      },
    ],
    rooms: [
      { id: '2.01', name: 'Schodišťová hala', areaSqm: 6.5, pos: [0.28, 3.9, -0.60], desc: 'Rozšířená centrální hala v 2.NP (šířka 1,39 m) se vstupy do všech místností mimo osu schodiště' },
      { id: '2.02', name: 'Pokoj 1 / Ložnice (SZ)', areaSqm: 11.2, pos: [-2.10, 3.9, -3.78], desc: 'Ložnice s plnou severní stěnou pro postel a velkým západním oknem do zahrady' },
      { id: '2.03', name: 'Pokoj 4 / Pracovna (SV)', areaSqm: 10.3, pos: [1.60, 3.9, -4.35], desc: '4. samostatná místnost v patře s bezkolizně odsazeným vstupem od rohu haly' },
      { id: '2.04', name: 'Rodinná koupelna', areaSqm: 5.3, pos: [2.38, 3.9, -1.86], desc: 'Vana, walk-in sprchový kout, dvojumyvadlo, okno na východ' },
      { id: '2.06', name: 'Prádelna / Úklid', areaSqm: 3.0, pos: [2.38, 3.9, -0.04], desc: 'Průchodná prádelna (šířka 1,20 m) pro pračku, sušičku a úklidovou skříň' },
      { id: '2.05', name: 'Samostatné WC', areaSqm: 2.5, pos: [2.38, 3.9, 1.22], desc: 'Samostatné WC s umývátkem a oknem, bezpečně posunuté mimo osu schodiště' },
      { id: '2.07', name: 'Dětský pokoj 2 (JZ)', areaSqm: 16.3, pos: [-2.00, 3.9, 3.60], desc: 'Slunný jihozápadní dětský pokoj s bezkolizní šatní nikou a průchodem komínu' },
      { id: '2.08', name: 'Dětský pokoj 3 (JV)', areaSqm: 14.4, pos: [1.70, 3.9, 3.75], desc: 'Světlý jihovýchodní dětský pokoj s prostorem pro postel, psací stůl i velkou skříň' },
    ],
  },

  roof: {
    name: 'Sedlová střecha hlavního domu',
    width: W,
    length: L,
    height: 2.8,
    y: 5.67,
    ridgeAxis: 'z',
    eaveOverhang: 0.45,
    gableOverhang: 0.35,
    thickness: 0.22,
  },
};

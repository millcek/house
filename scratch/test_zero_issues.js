import { analyzeDesignLayout, formatAnalysisReport } from '../src/analysis/LayoutAnalyzer.js';

function getZeroIssueCompact() {
  const W = 7.5;
  const L = 9.0;
  const T_EXT = 0.38;
  const T_LOAD = 0.20;
  const T_PART = 0.14;
  const T_SDK = 0.125;

  const X_WEST_WALL = -W / 2 + T_EXT / 2; // -3.56
  const X_EAST_WALL = W / 2 - T_EXT / 2; //  3.56
  const Z_NORTH_WALL = -L / 2 + T_EXT / 2; // -4.31
  const Z_SOUTH_WALL = L / 2 - T_EXT / 2; //  4.31

  const X_WEST_IN = -W / 2 + T_EXT; // -3.37
  const X_EAST_IN = W / 2 - T_EXT; //  3.37
  const Z_NORTH_IN = -L / 2 + T_EXT; // -4.12
  const Z_SOUTH_IN = L / 2 - T_EXT; //  4.12

  const Z_SPINE = 0.00;
  const Z_STUDY_STAIR = -2.15;
  const X_STAIR_HALL = -0.20;
  const X_EAST_ZONE = 1.10;
  const Z_BATH_VEST = -1.95;

  const STAIR_HOLE = {
    x1: X_WEST_IN,
    z1: Z_STUDY_STAIR + T_PART / 2, // -2.08
    x2: X_STAIR_HALL,
    z2: Z_SPINE - T_LOAD / 2 - 0.20, // -0.30
  };

  const SHAFT_HOLE = {
    x1: 2.85,
    z1: -4.10,
    x2: 3.30,
    z2: -3.65,
  };

  return {
    id: "compact-5kk",
    label: "Rodinný dům 5+kk (Úsporná kompaktní varianta -30 % · 111 m²)",
    code: "RD-5KK-COMPACT",
    footprint: { width: W, length: L },
    floorHeight: 2.95,
    wallThickness: T_EXT,
    partThickness: T_PART,
    ceiling1Sdk: true,

    floor1: {
      elevation: 0,
      finishes: [
        { name: "Podlaha obytná část", material: "woodFloor", size: [6.74, 4.12], thickness: 0.20, pos: [0, 2.06] },
        { name: "Podlaha pracovna", material: "woodFloor", size: [3.17, 1.97], thickness: 0.20, pos: [-1.78, -3.13] },
        { name: "Dlažba zádveří, hala, koupelna", material: "tileFloor", size: [3.57, 4.12], thickness: 0.20, pos: [1.58, -2.06] },
        { name: "Zahradní terasa", material: "terrace", size: [3.0, 4.0], thickness: 0.14, pos: [-5.25, 2.0] },
      ],
      walls: [
        {
          id: "ext-1np-n",
          name: "Severní stěna 1.NP",
          from: [-W / 2, Z_NORTH_WALL],
          to: [W / 2, Z_NORTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            { type: "window", name: "Okno pracovna (sever)", at: 1.65, width: 1.2, height: 1.3, sill: 1.02 },
            { type: "window", name: "Okno koupelna 1.NP (sever)", at: 6.00, width: 0.8, height: 0.9, sill: 1.42 },
          ],
        },
        {
          id: "ext-1np-s",
          name: "Jižní stěna 1.NP",
          from: [-W / 2, Z_SOUTH_WALL],
          to: [W / 2, Z_SOUTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            { type: "window", name: "Terasové francouzské okno", at: 1.30, width: 2.0, height: 2.2, sill: 0.20, sliding: true, shaded: true },
            { type: "window", name: "Okno obývací pokoj (jih)", at: 3.80, width: 1.6, height: 1.3, sill: 1.02, shaded: true },
            { type: "window", name: "Okno jídelna (jih)", at: 5.80, width: 1.6, height: 1.3, sill: 1.02, shaded: true },
          ],
        },
        {
          id: "ext-1np-e",
          name: "Východní stěna 1.NP",
          from: [X_EAST_WALL, Z_NORTH_IN],
          to: [X_EAST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            { type: "door", name: "Vchodové dveře", at: 2.70, width: 1.00, height: 2.20, sill: 0.20, swing: { hinge: "end", dir: "west" } },
            { type: "window", name: "Pásové okno kuchyně", at: 5.90, width: 1.50, height: 1.10, sill: 1.22 },
          ],
        },
        {
          id: "ext-1np-w",
          name: "Západní stěna 1.NP",
          from: [X_WEST_WALL, Z_NORTH_IN],
          to: [X_WEST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            { type: "window", name: "Okno obývák západ", at: 5.80, width: 1.40, height: 1.30, sill: 1.02, shaded: true },
          ],
        },
        // Vnitřní
        {
          id: "part-1np-spine",
          name: "Středová nosná stěna (1.NP)",
          from: [X_WEST_IN, Z_SPINE],
          to: [X_EAST_IN, Z_SPINE],
          height: 2.95,
          thickness: T_LOAD,
          material: "partition",
          structural: true,
          openings: [
            { type: "door", name: "Dveře do obýváku", at: 3.80, width: 0.90, height: 2.10, sill: 0.20, glazed: true, swing: { hinge: "start", dir: "south" } },
          ],
        },
        {
          id: "part-1np-study-stair",
          name: "Příčka pracovna / schodiště",
          from: [X_WEST_IN, Z_STUDY_STAIR],
          to: [X_STAIR_HALL, Z_STUDY_STAIR],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
        },
        {
          id: "part-1np-study-hall",
          name: "Příčka pracovna & schodiště / hala",
          from: [X_STAIR_HALL, Z_NORTH_IN],
          to: [X_STAIR_HALL, Z_SPINE - T_LOAD / 2],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
          openings: [
            { type: "opening", name: "Dveře do pracovny", at: 0.65, width: 0.80, height: 2.10, sill: 0.20, swing: { hinge: "start", dir: "west" } },
          ],
        },
        {
          id: "part-1np-hall-east",
          name: "Příčka hala / zádveří & koupelna",
          from: [X_EAST_ZONE, Z_NORTH_IN],
          to: [X_EAST_ZONE, Z_SPINE - T_LOAD / 2],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
          openings: [
            { type: "opening", name: "Dveře zádveří / hala", at: 3.10, width: 0.90, height: 2.10, sill: 0.20, swing: { hinge: "end", dir: "west" } },
            { type: "opening", name: "Dveře do koupelny 1.NP", at: 1.50, width: 0.80, height: 2.10, sill: 0.20, swing: { hinge: "start", dir: "east" } },
          ],
        },
        {
          id: "part-1np-bath-vest",
          name: "Příčka koupelna / zádveří",
          from: [X_EAST_ZONE + T_PART / 2, Z_BATH_VEST],
          to: [X_EAST_IN, Z_BATH_VEST],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
        },
      ],
      furniture: [
        {
          type: "stairs",
          layout: "u-turn",
          name: "Schodiště do 2.NP",
          pos: [0, 0],
          yBase: 0.20,
          xStart: X_STAIR_HALL,
          xLanding: -2.44,
          xEnd: X_WEST_IN,
          zFlight1: [-2.05, -1.20],
          zFlight2: [-1.10, -0.25],
          stepsPerFlight: 8,
          totalRise: 3.07,
        },
        // 1.01 Zádveří
        { type: "wardrobe", name: "Šatní skříň zádveří", pos: [2.35, -0.35], size: [1.80, 2.20, 0.50] },
        // 1.02 Koupelna
        { type: "shower", name: "Sprchový kout 1.NP", pos: [1.60, -3.62], size: [0.90, 0.10, 0.90] },
        { type: "wc", name: "WC 1.NP", pos: [2.50, -3.82], size: [0.40, 0.42, 0.55] },
        { type: "vanity", name: "Umyvadlo 1.NP", pos: [1.65, -2.40], size: [0.70, 0.85, 0.45] },
        { type: "laundryStack", name: "Pračka", pos: [3.00, -2.60], size: [0.60, 1.70, 0.60] },
        { type: "shaft", name: "Šachta", pos: [3.05, -3.88], size: [0.45, 2.75, 0.45] },
        // 1.03 Pracovna
        { type: "desk", name: "Pracovní stůl", pos: [-1.70, -3.75], size: [1.30, 0.75, 0.65] },
        { type: "bed", name: "Rozkládací lůžko", pos: [-2.75, -2.60], size: [0.90, 0.55, 1.90] },
        // 1.05 Obývák
        { type: "kitchen", name: "Kuchyňská linka", pos: [2.95, 1.65], size: [0.60, 0.90, 2.60] },
        { type: "diningTable", name: "Jídelní stůl", pos: [1.20, 2.20], size: [1.40, 0.76, 0.85] },
        { type: "sofa", name: "Sedačka", pos: [-1.65, 1.40], size: [2.20, 0.85, 1.60] },
        { type: "tvUnit", name: "TV skříňka", pos: [-3.10, 1.40], size: [0.38, 0.50, 1.60] },
      ],
      rooms: [
        { id: "1.01", name: "Zádveří", areaSqm: 4.2, pos: [2.20, 0.3, -1.20] },
        { id: "1.02", name: "Koupelna s WC a technickým koutem", areaSqm: 5.2, pos: [2.30, 0.3, -3.10] },
        { id: "1.03", name: "Pracovna / pokoj pro hosty", areaSqm: 6.4, pos: [-1.60, 0.3, -2.90] },
        { id: "1.04", name: "Schodišťová hala", areaSqm: 5.6, pos: [0.45, 0.3, -1.10] },
        { id: "1.05", name: "Obývací pokoj + kuchyňský kout", areaSqm: 28.4, pos: [0.00, 0.3, 2.50] },
        { id: "1.06", name: "Zahradní terasa", areaSqm: 12.0, interior: false, pos: [-5.25, 0.2, 2.00] },
      ],
    },

    ceilingSlab: {
      name: "Stropní deska nad 1.NP (Spiroll tl. 200 mm)",
      width: W,
      length: L,
      thickness: 0.20,
      y: 2.95,
      holes: [{ ...STAIR_HOLE }, { ...SHAFT_HOLE }],
    },

    ceiling2Slab: {
      name: "Zateplený strop podkroví nad 2.NP",
      width: W,
      length: L,
      thickness: 0.35,
      y: 6.12,
    },

    floor2: {
      elevation: 3.17,
      finishes: [
        {
          name: "Podlahy 2.NP",
          material: "woodFloor",
          size: [6.74, 8.24],
          thickness: 0.12,
          pos: [0, 0],
          holes: [
            { ...STAIR_HOLE },
            { x1: X_EAST_ZONE, z1: Z_NORTH_IN, x2: X_EAST_IN, z2: Z_BATH_VEST },
          ],
        },
        {
          name: "Dlažba koupelna 2.NP",
          material: "tileFloor",
          size: [2.27, 2.12],
          thickness: 0.12,
          pos: [2.23, -3.06],
        },
      ],
      walls: [
        {
          id: "ext-2np-n",
          name: "Severní stěna 2.NP",
          from: [-W / 2, Z_NORTH_WALL],
          to: [W / 2, Z_NORTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            { type: "window", name: "Okno ložnice (sever)", at: 1.65, width: 1.2, height: 1.3, sill: 1.02 },
            { type: "window", name: "Okno koupelna 2.NP (sever)", at: 6.00, width: 0.8, height: 0.9, sill: 1.42 },
          ],
        },
        {
          id: "ext-2np-s",
          name: "Jižní stěna 2.NP",
          from: [-W / 2, Z_SOUTH_WALL],
          to: [W / 2, Z_SOUTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            { type: "window", name: "Okno Dětský pokoj 1 (jih)", at: 1.85, width: 1.5, height: 1.3, sill: 1.02, shaded: true },
            { type: "window", name: "Okno Dětský pokoj 2 (jih)", at: 5.65, width: 1.5, height: 1.3, sill: 1.02, shaded: true },
          ],
        },
        {
          id: "ext-2np-e",
          name: "Východní stěna 2.NP",
          from: [X_EAST_WALL, Z_NORTH_IN],
          to: [X_EAST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [],
        },
        {
          id: "ext-2np-w",
          name: "Západní stěna 2.NP",
          from: [X_WEST_WALL, Z_NORTH_IN],
          to: [X_WEST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [],
        },
        // Vnitřní SDK příčky 2.NP
        {
          id: "part-2np-spine",
          name: "Příčka chodba / dětské pokoje",
          from: [X_WEST_IN, Z_SPINE],
          to: [X_EAST_IN, Z_SPINE],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
          openings: [
            { type: "opening", name: "Dveře do dětského pokoje 1", at: 2.65, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: "start", dir: "south" } },
            { type: "opening", name: "Dveře do dětského pokoje 2", at: 4.10, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: "end", dir: "south" } },
          ],
        },
        {
          id: "part-2np-kids-div",
          name: "Akustická příčka mezi dětskými pokoji",
          from: [0, Z_SPINE + T_SDK / 2],
          to: [0, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
        },
        {
          id: "part-2np-bed-stair",
          name: "Příčka ložnice / schodiště",
          from: [X_WEST_IN, Z_STUDY_STAIR],
          to: [X_STAIR_HALL, Z_STUDY_STAIR],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
        },
        {
          id: "part-2np-bed-hall",
          name: "Příčka ložnice / chodba 2.NP",
          from: [X_STAIR_HALL, Z_NORTH_IN],
          to: [X_STAIR_HALL, Z_STUDY_STAIR + T_SDK / 2],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
          openings: [
            { type: "opening", name: "Dveře do ložnice rodičů", at: 0.65, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: "start", dir: "west" } },
          ],
        },
        {
          id: "part-2np-hall-east",
          name: "Příčka hala / koupelna & komora",
          from: [X_EAST_ZONE, Z_NORTH_IN],
          to: [X_EAST_ZONE, Z_SPINE - T_SDK / 2],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
          openings: [
            { type: "opening", name: "Dveře do koupelny 2.NP", at: 1.50, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: "start", dir: "east" } },
            { type: "opening", name: "Dveře do komory", at: 3.10, width: 0.80, height: 2.10, sill: 0.12, swing: { hinge: "end", dir: "east" } },
          ],
        },
        {
          id: "part-2np-bath-closet",
          name: "Příčka koupelna / komora",
          from: [X_EAST_ZONE + T_SDK / 2, Z_BATH_VEST],
          to: [X_EAST_IN, Z_BATH_VEST],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
        },
      ],
      furniture: [
        {
          type: "railing",
          name: "Zábradlí schodiště",
          pos: [X_STAIR_HALL, -1.15],
          yOffset: 0.12,
          size: [0.05, 1.00, 1.60],
        },
        // 2.02 Ložnice rodičů
        { type: "bed", name: "Dvoulůžko", pos: [-1.80, -3.05], size: [1.80, 0.60, 2.00] },
        { type: "wardrobe", name: "Šatní skříň ložnice", pos: [-3.05, -3.10], size: [0.55, 2.20, 1.80] },
        // 2.03 Dětský pokoj 1
        { type: "bed", name: "Lůžko pokoj 1", pos: [-2.85, 2.50], size: [0.90, 0.50, 2.00] },
        { type: "desk", name: "Stůl pokoj 1", pos: [-1.85, 3.70], size: [1.40, 0.75, 0.65] },
        { type: "wardrobe", name: "Skříň pokoj 1", pos: [-0.35, 2.20], size: [0.60, 2.00, 1.20] },
        // 2.04 Dětský pokoj 2
        { type: "bed", name: "Lůžko pokoj 2", pos: [2.85, 2.50], size: [0.90, 0.50, 2.00] },
        { type: "desk", name: "Stůl pokoj 2", pos: [1.85, 3.70], size: [1.40, 0.75, 0.65] },
        { type: "wardrobe", name: "Skříň pokoj 2", pos: [0.35, 2.20], size: [0.60, 2.00, 1.20] },
        // 2.05 Koupelna 2.NP
        { type: "bathtub", name: "Vana 160×70", pos: [2.25, -3.70], size: [1.60, 0.55, 0.70] },
        { type: "wc", name: "WC 2.NP", pos: [3.05, -2.60], size: [0.40, 0.42, 0.55] },
        { type: "vanity", name: "Umyvadlo 2.NP", pos: [1.65, -2.40], size: [0.70, 0.85, 0.45] },
        // 2.06 Komora
        { type: "shelving", name: "Regály komory", pos: [2.25, -0.28], size: [1.80, 2.00, 0.45] },
      ],
      rooms: [
        { id: "2.01", name: "Schodišťová hala 2.NP", areaSqm: 5.6, pos: [0.45, 3.47, -1.10] },
        { id: "2.02", name: "Ložnice rodičů", areaSqm: 6.4, pos: [-1.60, 3.47, -2.90] },
        { id: "2.03", name: "Dětský pokoj 1 (JZ)", areaSqm: 13.9, pos: [-1.65, 3.47, 2.10] },
        { id: "2.04", name: "Dětský pokoj 2 (JV)", areaSqm: 13.9, pos: [1.65, 3.47, 2.10] },
        { id: "2.05", name: "Rodinná koupelna s WC", areaSqm: 5.2, pos: [2.30, 3.47, -3.10] },
        { id: "2.06", name: "Úložná komora / šatna", areaSqm: 4.2, pos: [2.20, 3.47, -1.20] },
      ],
    },

    roof: {
      name: "Sedlová vazníková střecha",
      width: W,
      length: L,
      height: 1.80,
      y: 6.12,
      ridgeAxis: "z",
      eaveOverhang: 0.40,
      gableOverhang: 0.35,
      thickness: 0.20,
      truss: true,
      gableThickness: 0.24,
    },
  };
}

const res = analyzeDesignLayout(getZeroIssueCompact());
console.log('Result summary:', res.summary);

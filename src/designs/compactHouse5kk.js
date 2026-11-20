// Parametric house dimensions & wall axes for compact 5+kk variant
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

// Interior axes
const Z_SPINE = -0.10; // Spine wall center
const Z_SPINE_NORTH = -0.20;
const Z_SPINE_SOUTH = 0.00;

const X_STAIR_HALL = -0.37; // dividing stairs from central hall
const X_TECH_WALL = 0.85; // dividing central hall from bathroom / vestibule
const Z_STUDY_STAIR = -1.95; // dividing north study/room from stairs
const Z_BATH_VEST = -1.95; // dividing bathroom from vestibule/closet
const X_KIDS_DIV = 0.50; // dividing southern bedrooms in 2.NP

const STAIR_HOLE = {
  x1: X_WEST_IN, // -3.37
  z1: Z_STUDY_STAIR + T_PART / 2, // -1.88
  x2: X_STAIR_HALL, // -0.37
  z2: Z_SPINE_NORTH, // -0.20
};

const SHAFT_HOLE = {
  x1: 2.85,
  z1: -4.10,
  x2: 3.30,
  z2: -3.65,
};

export function createDesign() {
  return {
    id: "compact-5kk",
    label: "Rodinný dům 5+kk (Úsporná kompaktní varianta -30 % · 111 m²)",
    code: "RD-5KK-COMPACT",
    projectTitle: "RODINNÝ DŮM 5+KK · VOJÁČKOVI TROUBELICE",
    footprint: { width: W, length: L },
    floorHeight: 2.95,
    wallThickness: T_EXT,
    partThickness: T_PART,
    ceiling1Sdk: true,

    floor1: {
      elevation: 0,
      finishes: [
        {
          name: "Podlaha obytný prostor (SPC vinyl)",
          material: "woodFloor",
          size: [6.74, 4.12],
          thickness: 0.20,
          pos: [0, 2.06],
        },
        {
          name: "Podlaha pracovna (SPC vinyl)",
          material: "woodFloor",
          size: [2.97, 2.10],
          thickness: 0.20,
          pos: [-1.88, -3.07],
        },
        {
          name: "Dlažba hala, zádveří, schodiště a koupelna",
          material: "tileFloor",
          size: [3.77, 3.92],
          thickness: 0.20,
          pos: [1.48, -2.16],
        },
      ],
      walls: [
        // Obvodové stěny 1.NP
        {
          id: "ext-1np-north",
          name: "Obvodová stěna sever (1.NP)",
          from: [-W / 2, Z_NORTH_WALL],
          to: [W / 2, Z_NORTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            {
              type: "window",
              name: "Okno pracovna (sever)",
              at: 1.80,
              width: 1.40,
              height: 1.30,
              sill: 1.02,
            },
            {
              type: "window",
              name: "Okno koupelna 1.NP (sever)",
              at: 5.60,
              width: 0.80,
              height: 0.90,
              sill: 1.42,
            },
          ],
        },
        {
          id: "ext-1np-south",
          name: "Obvodová stěna jih (1.NP)",
          from: [-W / 2, Z_SOUTH_WALL],
          to: [W / 2, Z_SOUTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            {
              type: "window",
              name: "Okno obývací pokoj (jih)",
              at: 2.10,
              width: 1.80,
              height: 1.30,
              sill: 1.02,
              shaded: true,
            },
            {
              type: "window",
              name: "Okno jídelna (jih)",
              at: 5.40,
              width: 1.80,
              height: 1.30,
              sill: 1.02,
              shaded: true,
            },
          ],
        },
        {
          id: "ext-1np-east",
          name: "Obvodová stěna východ (1.NP)",
          from: [X_EAST_WALL, Z_NORTH_IN],
          to: [X_EAST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            {
              type: "door",
              name: "Hlavní vchodové dveře",
              at: 3.40,
              width: 1.00,
              height: 2.20,
              sill: 0.20,
              swing: { hinge: "start", dir: "west" },
            },
            {
              type: "window",
              name: "Pásové okno kuchyně (východ)",
              at: 6.00,
              width: 1.50,
              height: 1.10,
              sill: 1.22,
            },
          ],
        },
        {
          id: "ext-1np-west",
          name: "Obvodová stěna západ (1.NP)",
          from: [X_WEST_WALL, Z_NORTH_IN],
          to: [X_WEST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            {
              type: "window",
              name: "Terasové francouzské okno",
              at: 7.20,
              width: 2.00,
              height: 2.20,
              sill: 0.20,
              sliding: true,
              shaded: true,
            },
          ],
        },

        // Vnitřní nosná stěna
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
            {
              type: "door",
              name: "Dveře do obytného prostoru",
              at: 3.50,
              width: 0.90,
              height: 2.10,
              sill: 0.20,
              glazed: true,
              swing: { hinge: "start", dir: "south" },
            },
          ],
        },

        // Příčka pracovna / schodiště
        {
          id: "part-1np-study-stair",
          name: "Příčka pracovna / schodiště",
          from: [X_WEST_IN, Z_STUDY_STAIR],
          to: [X_STAIR_HALL + T_PART / 2, Z_STUDY_STAIR],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
        },

        // Příčka schodiště & pracovna / chodba
        {
          id: "part-1np-stair-hall",
          name: "Příčka schodiště / chodba",
          from: [X_STAIR_HALL, Z_NORTH_IN],
          to: [X_STAIR_HALL, Z_SPINE],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
          openings: [
            {
              type: "opening",
              name: "Dveře do pracovny (1.03)",
              at: 1.15,
              width: 0.80,
              height: 2.10,
              sill: 0.20,
              swing: { hinge: "end", dir: "west" },
            },
          ],
        },

        // Příčka koupelna & zádveří / chodba
        {
          id: "part-1np-tech-wall",
          name: "Příčka zádveří & koupelna / chodba",
          from: [X_TECH_WALL, Z_NORTH_IN],
          to: [X_TECH_WALL, Z_SPINE],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
          openings: [
            {
              type: "opening",
              name: "Dveře do koupelny 1.NP (1.02)",
              at: 1.05,
              width: 0.80,
              height: 2.10,
              sill: 0.20,
              swing: { hinge: "start", dir: "east" },
            },
            {
              type: "opening",
              name: "Dveře zádveří / chodba",
              at: 3.35,
              width: 0.90,
              height: 2.10,
              sill: 0.20,
              swing: { hinge: "start", dir: "west" },
            },
          ],
        },

        // Příčka koupelna / zádveří
        {
          id: "part-1np-bath-vest",
          name: "Příčka koupelna / zádveří",
          from: [X_TECH_WALL + T_PART / 2, Z_BATH_VEST],
          to: [X_EAST_IN, Z_BATH_VEST],
          height: 2.95,
          thickness: T_PART,
          material: "partition",
        },
      ],

      dimensionSlices: {
        x: [-3.00, 2.00],
        z: [-2.00, 1.50],
      },

      furniture: [
        {
          type: "canopy",
          name: "Přístřešek hlavního vchodu",
          desc: "Konzolový přístřešek nad vchodem",
          pos: [4.20, -0.72],
          yOffset: 2.50,
          size: [1.0, 0.08, 1.6],
        },
        {
          type: "stairs",
          layout: "u-turn",
          name: "Schodiště do 2.NP",
          desc: "Kompaktní dvouramenné schodiště (18× 171/263 mm)",
          pos: [0, 0],
          yBase: 0.20,
          xStart: X_STAIR_HALL, // -0.37
          xLanding: -2.47,
          xEnd: X_WEST_IN, // -3.37
          zFlight1: [-1.92, -1.01],
          zFlight2: [-0.99, -0.08],
          stepsPerFlight: 8,
          totalRise: 3.078,
        },
        // 1.01 Zádveří
        {
          type: "wardrobe",
          name: "Šatní skříň zádveří",
          desc: "Vestavěná šatní sestava v zádveří",
          pos: [2.10, -1.55],
          size: [1.80, 2.20, 0.45],
        },

        // 1.02 Koupelna s WC & technický kout
        {
          type: "shower",
          name: "Sprchový kout 1.NP",
          desc: "Sprchový kout 90×90 cm",
          pos: [2.85, -2.55],
          size: [0.90, 0.10, 0.90],
        },
        {
          type: "wc",
          name: "Závěsné WC 1.NP",
          desc: "Závěsné WC",
          pos: [2.10, -3.80],
          size: [0.40, 0.42, 0.55],
        },
        {
          type: "vanity",
          name: "Umyvadlo se skříňkou 1.NP",
          desc: "Umyvadlo se skříňkou",
          pos: [1.40, -3.85],
          size: [0.55, 0.85, 0.45],
        },
        {
          type: "laundryStack",
          name: "Pračka a TČ",
          desc: "Kompaktní sestava TČ a pračky",
          pos: [1.30, -2.33],
          size: [0.60, 1.70, 0.60],
        },
        {
          type: "shaft",
          name: "Instalační šachta ZTI+VZT",
          desc: "Svislá šachta pro rozvody",
          pos: [3.05, -3.85],
          size: [0.40, 2.75, 0.40],
        },

        // 1.03 Pracovna / pokoj pro hosty
        {
          type: "desk",
          name: "Pracovní stůl",
          desc: "Pracovní stůl pod oknem",
          pos: [-1.20, -3.75],
          size: [0.85, 0.75, 0.55],
        },
        {
          type: "bed",
          name: "Lůžko / pohovka pro hosty",
          desc: "Samostatné lůžko pro hosty",
          pos: [-2.85, -3.075],
          size: [0.90, 0.55, 1.95],
        },
        {
          type: "wardrobe",
          name: "Skříň pracovna",
          desc: "Vestavěná šatní a úložná skříň",
          pos: [-1.05, -2.23],
          size: [0.80, 2.10, 0.40],
        },

        // 1.04 Pod schodištěm
        {
          type: "wardrobe",
          name: "Spíž pod schody",
          desc: "Úložný prostor / spíž vestavěná pod schodištěm",
          pos: [-1.45, -0.55],
          size: [1.10, 1.55, 0.55],
        },

        // 1.05 Obývací pokoj + kuchyň + jídelna
        {
          type: "kitchenTall",
          name: "Vysoké skříně (lednice, trouba, spíž)",
          desc: "Vysoká vestavná sestava skříní u vstupu do kuchyně",
          pos: [3.05, 0.55],
          size: [0.60, 2.20, 1.00],
        },
        {
          type: "kitchenCounter",
          name: "Pracovní linka s dřezem a varnou deskou",
          desc: "Kuchyňská pracovní linka podél východní stěny pod oknem",
          pos: [3.05, 2.15],
          size: [0.60, 0.90, 2.20],
        },
        {
          type: "diningTable",
          name: "Jídelní stůl pro 5-6 osob",
          desc: "Jídelní stůl se židlemi pro celou rodinu",
          pos: [1.15, 2.30],
          size: [1.20, 0.76, 0.80],
        },
        {
          type: "lSofa",
          name: "Rohová sedací souprava",
          desc: "Komfortní rohová pohovka orientovaná k TV",
          pos: [-1.65, 1.25],
          parts: [
            { size: [2.20, 0.45, 0.85], offset: [0, 0] },
            { size: [0.85, 0.45, 1.25], offset: [0.65, 0.85] },
          ],
        },
        {
          type: "coffeeTable",
          name: "Konferenční stolek",
          desc: "Nízký odkládací stolek u pohovky",
          pos: [-2.05, 2.25],
          size: [0.60, 0.35, 0.45],
        },
        {
          type: "tvStand",
          name: "TV skříňka a sestava",
          desc: "Nízká TV stěna na západní stěně s televizí",
          pos: [-3.05, 1.30],
          size: [0.45, 1.10, 1.40],
        },
      ],

      rooms: [
        {
          id: "1.01",
          name: "Zádveří",
          areaSqm: 4.8,
          pos: [2.10, 0.3, -0.90],
          desc: "Vstupní zádveří se šatní skříní",
        },
        {
          id: "1.02",
          name: "Koupelna s WC a TZB",
          areaSqm: 5.6,
          pos: [1.80, 0.3, -2.80],
          desc: "Přízemní koupelna se sprchovým koutem, WC, umyvadlem a TČ",
        },
        {
          id: "1.03",
          name: "Pracovna / pokoj pro hosty",
          areaSqm: 6.2,
          pos: [-1.80, 0.3, -2.60],
          desc: "Multifunkční pokoj s lůžkem pro návštěvy a pracovním stolem",
        },
        {
          id: "1.04",
          name: "Chodba a schodiště",
          areaSqm: 8.4,
          pos: [0.22, 0.3, -1.00],
          desc: "Centrální chodba propojující zádveří, schodiště a obývací pokoj",
        },
        {
          id: "1.05",
          name: "Obývací pokoj + kuchyňský kout",
          areaSqm: 28.4,
          pos: [0.00, 0.3, 2.10],
          desc: "Slunný obytný prostor s kuchyní, jídelnou a terasou",
        },
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
      name: "Zateplený vazníkový strop podkroví nad 2.NP (350 mm minerální vata)",
      width: W,
      length: L,
      thickness: 0.35,
      y: 6.12,
    },

    floor2: {
      elevation: 3.17,
      finishes: [
        {
          name: "Podlahy 2.NP (SPC vinyl)",
          material: "woodFloor",
          size: [6.74, 8.24],
          thickness: 0.12,
          pos: [0, 0],
          holes: [{ ...STAIR_HOLE }],
        },
      ],
      walls: [
        // Obvodové zdi 2.NP
        {
          id: "ext-2np-north",
          name: "Obvodová stěna sever (2.NP)",
          from: [-W / 2, Z_NORTH_WALL],
          to: [W / 2, Z_NORTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            {
              type: "window",
              name: "Okno pokoj 3 (sever)",
              at: 1.80,
              width: 1.40,
              height: 1.30,
              sill: 1.02,
            },
            {
              type: "window",
              name: "Okno koupelna 2.NP (sever)",
              at: 5.60,
              width: 0.80,
              height: 0.90,
              sill: 1.42,
            },
          ],
        },
        {
          id: "ext-2np-south",
          name: "Obvodová stěna jih (2.NP)",
          from: [-W / 2, Z_SOUTH_WALL],
          to: [W / 2, Z_SOUTH_WALL],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [
            {
              type: "window",
              name: "Okno Ložnice rodičů (jih)",
              at: 1.85,
              width: 1.50,
              height: 1.30,
              sill: 1.02,
              shaded: true,
            },
            {
              type: "window",
              name: "Okno Dětský pokoj (jih)",
              at: 5.65,
              width: 1.50,
              height: 1.30,
              sill: 1.02,
              shaded: true,
            },
          ],
        },
        {
          id: "ext-2np-east",
          name: "Obvodová stěna východ (2.NP)",
          from: [X_EAST_WALL, Z_NORTH_IN],
          to: [X_EAST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [],
        },
        {
          id: "ext-2np-west",
          name: "Obvodová stěna západ (2.NP)",
          from: [X_WEST_WALL, Z_NORTH_IN],
          to: [X_WEST_WALL, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_EXT,
          material: "wall",
          openings: [],
        },

        // Vnitřní příčky 2.NP
        {
          id: "part-2np-spine",
          name: "Příčka chodba / jižní pokoje (2.NP)",
          from: [X_WEST_IN, Z_SPINE],
          to: [X_EAST_IN, Z_SPINE],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
          openings: [
            {
              type: "opening",
              name: "Dveře do ložnice rodičů (2.02)",
              at: 3.42,
              width: 0.80,
              height: 2.10,
              sill: 0.12,
              swing: { hinge: "start", dir: "south" },
            },
            {
              type: "opening",
              name: "Dveře do dětského pokoje (2.03)",
              at: 4.77,
              width: 0.80,
              height: 2.10,
              sill: 0.12,
              swing: { hinge: "start", dir: "south" },
            },
          ],
        },
        {
          id: "part-2np-kids-div",
          name: "Akustická příčka mezi jižními pokoji",
          from: [X_KIDS_DIV, Z_SPINE + T_SDK / 2],
          to: [X_KIDS_DIV, Z_SOUTH_IN],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
        },
        {
          id: "part-2np-study-stair",
          name: "Příčka pokoj 3 / schodiště",
          from: [X_WEST_IN, Z_STUDY_STAIR],
          to: [X_STAIR_HALL + T_SDK / 2, Z_STUDY_STAIR],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
        },
        {
          id: "part-2np-stair-hall",
          name: "Příčka pokoj 3 / schodišťová hala",
          from: [X_STAIR_HALL, Z_NORTH_IN],
          to: [X_STAIR_HALL, Z_STUDY_STAIR],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
          openings: [
            {
              type: "opening",
              name: "Dveře do pokoje 3 (2.04)",
              at: 1.15,
              width: 0.80,
              height: 2.10,
              sill: 0.12,
              swing: { hinge: "end", dir: "west" },
            },
          ],
        },
        {
          id: "part-2np-tech-wall",
          name: "Příčka koupelna & komora / hala",
          from: [X_TECH_WALL, Z_NORTH_IN],
          to: [X_TECH_WALL, Z_SPINE],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
          openings: [
            {
              type: "opening",
              name: "Dveře do koupelny 2.NP (2.05)",
              at: 1.15,
              width: 0.80,
              height: 2.10,
              sill: 0.12,
              swing: { hinge: "start", dir: "east" },
            },
            {
              type: "opening",
              name: "Dveře do komory (2.06)",
              at: 3.35,
              width: 0.80,
              height: 2.10,
              sill: 0.12,
              swing: { hinge: "start", dir: "east" },
            },
          ],
        },
        {
          id: "part-2np-bath-vest",
          name: "Příčka koupelna / komora 2.NP",
          from: [X_TECH_WALL + T_SDK / 2, Z_BATH_VEST],
          to: [X_EAST_IN, Z_BATH_VEST],
          height: 2.95,
          thickness: T_SDK,
          material: "partition",
        },
      ],

      dimensionSlices: {
        x: [-3.00, 2.00],
        z: [-2.00, 1.80],
      },

      furniture: [
        {
          type: "railing",
          name: "Zábradlí schodiště ve 2.NP",
          desc: "Ochranné zábradlí galerie u schodiště",
          pos: [-0.37, -1.46],
          yOffset: 0.12,
          size: [0.05, 1.00, 0.90],
        },

        // 2.02 Ložnice rodičů (JZ)
        {
          type: "bed",
          name: "Manželské dvoulůžko",
          desc: "Dvoulůžko 180×200 cm",
          pos: [-1.45, 3.07],
          size: [1.80, 0.60, 2.00],
        },
        {
          type: "wardrobe",
          name: "Šatní sestava ložnice",
          desc: "Vestavěná šatní skříň v ložnici",
          pos: [-2.45, 0.40],
          size: [1.60, 2.20, 0.55],
        },

        // 2.03 Dětský pokoj (JV)
        {
          type: "bed",
          name: "Lůžko dětský pokoj",
          desc: "Postel v dětském pokoji",
          pos: [2.85, 3.075],
          size: [0.90, 0.50, 1.95],
        },
        {
          type: "desk",
          name: "Psací stůl dětský pokoj",
          desc: "Psací stůl u jižního okna",
          pos: [1.15, 3.75],
          size: [0.90, 0.75, 0.55],
        },
        {
          type: "wardrobe",
          name: "Šatní skříň dětský pokoj",
          desc: "Šatní skříň",
          pos: [2.60, 0.40],
          size: [1.00, 2.00, 0.55],
        },

        // 2.04 Pokoj 3 / hostinský pokoj (SZ)
        {
          type: "bed",
          name: "Lůžko pokoj 3",
          desc: "Samostatné lůžko",
          pos: [-2.85, -3.075],
          size: [0.90, 0.55, 1.95],
        },
        {
          type: "desk",
          name: "Psací stůl pokoj 3",
          desc: "Pracovní stůl pod oknem",
          pos: [-1.20, -3.75],
          size: [0.85, 0.75, 0.55],
        },
        {
          type: "wardrobe",
          name: "Šatní skříň pokoj 3",
          desc: "Vestavěná šatní skříň",
          pos: [-1.05, -2.23],
          size: [0.80, 2.00, 0.40],
        },

        // 2.05 Koupelna 2.NP
        {
          type: "bathtub",
          name: "Vana 160×70",
          desc: "Koupací vana",
          pos: [2.45, -2.40],
          size: [1.60, 0.55, 0.70],
        },
        {
          type: "wc",
          name: "Závěsné WC 2.NP",
          desc: "Závěsné WC v koupelně 2.NP",
          pos: [2.25, -3.80],
          size: [0.40, 0.42, 0.55],
        },
        {
          type: "vanity",
          name: "Umyvadlo se skříňkou 2.NP",
          desc: "Umyvadlo se zrcadlem",
          pos: [1.45, -3.85],
          size: [0.60, 0.85, 0.45],
        },
        {
          type: "shaft",
          name: "Instalační šachta 2.NP",
          desc: "Svislá šachta pro rozvody ZTI a VZT",
          pos: [3.05, -3.85],
          size: [0.40, 2.75, 0.40],
        },

        // 2.06 Komora / šatna
        {
          type: "shelving",
          name: "Skladové regály komory",
          desc: "Úložný regálový systém",
          pos: [3.10, -1.025],
          size: [0.45, 2.00, 1.60],
        },
      ],

      rooms: [
        {
          id: "2.01",
          name: "Schodišťová hala 2.NP",
          areaSqm: 6.4,
          pos: [0.22, 0.3, -0.60],
          desc: "Centrální chodba propojující všechny pokoje 2.NP",
        },
        {
          id: "2.02",
          name: "Ložnice rodičů",
          areaSqm: 15.7,
          pos: [-1.45, 0.3, 1.80],
          desc: "Prostorná ložnice s dvoulůžkem a šatní sestavou",
        },
        {
          id: "2.03",
          name: "Dětský pokoj 1",
          areaSqm: 11.6,
          pos: [1.90, 0.3, 2.10],
          desc: "Světlý dětský pokoj na jih",
        },
        {
          id: "2.04",
          name: "Pokoj 3 / pracovna",
          areaSqm: 6.2,
          pos: [-1.80, 0.3, -2.60],
          desc: "Samostatný pokoj pro hosty nebo druhé dítě",
        },
        {
          id: "2.05",
          name: "Rodinná koupelna 2.NP",
          areaSqm: 5.6,
          pos: [1.80, 0.3, -3.10],
          desc: "Koupelna s vanou, WC a umyvadlem",
        },
        {
          id: "2.06",
          name: "Komora / šatna",
          areaSqm: 4.8,
          pos: [2.10, 0.3, -0.90],
          desc: "Šatna a úložná komora na lůžkoviny a sezónní věci",
        },
      ],
    },

    roof: {
      name: "Sedlová střecha kompaktního domu (35°)",
      width: W,
      length: L,
      height: 2.2,
      y: 6.12,
      ridgeAxis: "z",
      eaveOverhang: 0.45,
      gableOverhang: 0.35,
      thickness: 0.22,
      hasSolar: true,
    },
  };
}

export const compactHouse5kk = createDesign();
export default compactHouse5kk;

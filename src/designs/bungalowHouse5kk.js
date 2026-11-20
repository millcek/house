// Parametric house dimensions & wall axes for single-story Bungalow 5+kk variant (Portrait orientation matching Troubelice site)
const W = 9.20;
const L = 13.20;
const T_EXT = 0.38;
const T_LOAD = 0.20;
const T_PART = 0.14;
const T_SDK = 0.125;

const X_WEST_WALL = -W / 2 + T_EXT / 2; // -4.41
const X_EAST_WALL = W / 2 - T_EXT / 2;  //  4.41
const Z_NORTH_WALL = -L / 2 + T_EXT / 2; // -6.41
const Z_SOUTH_WALL = L / 2 - T_EXT / 2;  //  6.41

const X_WEST_IN = -W / 2 + T_EXT; // -4.22
const X_EAST_IN = W / 2 - T_EXT;  //  4.22
const Z_NORTH_IN = -L / 2 + T_EXT; // -6.22
const Z_SOUTH_IN = L / 2 - T_EXT;  //  6.22

// Main partition coordinates:
const X_SPINE_W = -1.10;
const X_SPINE_E = 0.85;
const X_SERVICE_W = 1.80;

const Z_WORK_DIV = -2.50; // divides Pracovna from Dětský 2
const Z_BATH_S = -3.80;   // divides Koupelna from Corridor
const Z_TM_S = -3.70;     // divides TM from WC hosté
const Z_WC_S = -2.30;     // divides WC hosté from Zádveří
const Z_VEST_S = -0.60;   // divides Zádveří from Dětský 1
const Z_LIVING_N = 0.60;  // divides Dětský 2 & Corridor from Living room
const Z_BED1_S = 2.60;    // divides Dětský 1 from Ložnice

export function createDesign() {
  const walls = [
    // 1. Obvodové stěny (tl. 380 mm Porotherm 38 T Profi plněné vatou)
    {
      id: "wall-ext-north",
      name: "Obvodová stěna severní",
      from: [X_WEST_WALL, Z_NORTH_WALL],
      to: [X_EAST_WALL, Z_NORTH_WALL],
      height: 2.95,
      thickness: T_EXT,
      material: "wall",
      openings: [
        { type: "window", name: "Okno pracovna (sever)", at: 1.80, width: 1.40, height: 1.30, sill: 1.02 },
        { type: "window", name: "Okno koupelna (sever)", at: 4.25, width: 0.90, height: 0.90, sill: 1.35 },
        { type: "window", name: "Světlík chodba (sever)", at: 5.70, width: 0.60, height: 0.90, sill: 1.35 },
        { type: "window", name: "Okno technická místnost (sever)", at: 7.40, width: 0.90, height: 0.90, sill: 1.35 },
      ],
    },
    {
      id: "wall-ext-south",
      name: "Obvodová stěna jižní",
      from: [X_WEST_WALL, Z_SOUTH_WALL],
      to: [X_EAST_WALL, Z_SOUTH_WALL],
      height: 2.95,
      thickness: T_EXT,
      material: "wall",
      openings: [
        { type: "portal", name: "HS portál obývací pokoj (jih)", at: 2.40, width: 3.00, height: 2.35, sill: 0.20, portalType: "hs" },
        { type: "portal", name: "Francouzské okno ložnice (jih)", at: 7.10, width: 1.60, height: 2.25, sill: 0.20 },
      ],
    },
    {
      id: "wall-ext-west",
      name: "Obvodová stěna západní",
      from: [X_WEST_WALL, Z_NORTH_WALL],
      to: [X_WEST_WALL, Z_SOUTH_WALL],
      height: 2.95,
      thickness: T_EXT,
      material: "wall",
      openings: [
        { type: "window", name: "Okno pracovna (západ)", at: 1.80, width: 1.20, height: 1.30, sill: 1.02 },
        { type: "window", name: "Okno dětský pokoj 2 (západ)", at: 5.20, width: 1.40, height: 1.30, sill: 1.02 },
        { type: "window", name: "Okno obývací pokoj (západ)", at: 9.80, width: 1.80, height: 1.30, sill: 1.02 },
      ],
    },
    {
      id: "wall-ext-east",
      name: "Obvodová stěna východní",
      from: [X_EAST_WALL, Z_NORTH_WALL],
      to: [X_EAST_WALL, Z_SOUTH_WALL],
      height: 2.95,
      thickness: T_EXT,
      material: "wall",
      openings: [
        { type: "window", name: "Okno WC hosté (východ)", at: 3.45, width: 0.60, height: 0.60, sill: 1.60 },
        {
          type: "door",
          name: "Hlavní vchodové dveře",
          desc: "Bezpečnostní hliníkové vstupní dveře 1000/2100 s omezovačem úhlu otevření 95–100°",
          at: 5.15,
          width: 1.00,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "start", dir: "west" },
        },
        { type: "window", name: "Okno dětský pokoj 1 (východ)", at: 7.80, width: 1.40, height: 1.30, sill: 1.02 },
        { type: "window", name: "Okno ložnice (východ)", at: 10.80, width: 1.20, height: 1.30, sill: 1.02 },
      ],
    },

    // 2. Vnitřní nosné stěny a příčky
    {
      id: "part-west-spine",
      name: "Příčka západní křídlo / chodba a koupelna",
      from: [X_SPINE_W, Z_NORTH_IN],
      to: [X_SPINE_W, Z_LIVING_N],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
      openings: [
        {
          type: "door",
          name: "Dveře do pracovny",
          desc: "Interiérové dveře 800/2100 s integrovaným omezovačem 95–100°",
          at: 3.10,
          width: 0.80,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "start", dir: "west" },
        },
        {
          type: "door",
          name: "Dveře do dětského pokoje 2",
          desc: "Interiérové dveře 800/2100 s integrovaným omezovačem 95–100°",
          at: 5.80,
          width: 0.80,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "start", dir: "west" },
        },
      ],
    },
    {
      id: "part-work-kids2",
      name: "Akustická příčka pracovna / pokoj 2",
      from: [X_WEST_IN, Z_WORK_DIV],
      to: [X_SPINE_W, Z_WORK_DIV],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
    },
    {
      id: "part-bath-south",
      name: "Příčka koupelna / chodba",
      from: [X_SPINE_W, Z_BATH_S],
      to: [X_SPINE_E, Z_BATH_S],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
      openings: [
        {
          type: "door",
          name: "Dveře do koupelny",
          desc: "Bezbariérové dveře 800/2100 otevírané ven s omezovačem 95–100°",
          at: 0.95,
          width: 0.80,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "end", dir: "south" },
        },
      ],
    },
    {
      id: "part-bath-east",
      name: "Příčka koupelna / severní chodba",
      from: [X_SPINE_E, Z_NORTH_IN],
      to: [X_SPINE_E, Z_BATH_S],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
    },
    {
      id: "part-service-spine",
      name: "Příčka servisní zóna / chodba",
      from: [X_SERVICE_W, Z_NORTH_IN],
      to: [X_SERVICE_W, Z_VEST_S],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
      openings: [
        {
          type: "door",
          name: "Dveře technická místnost",
          desc: "Technické dveře 700/2100 s integrovaným omezovačem 95–100°",
          at: 1.25,
          width: 0.70,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "start", dir: "east" },
        },
        {
          type: "door",
          name: "Dveře WC hosté",
          desc: "Dveře na toaletu 700/2100 s otevíráním ven a omezovačem 95–100°",
          at: 3.22,
          width: 0.70,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "start", dir: "west" },
        },
        {
          type: "door",
          name: "Dveře zádveří / chodba",
          desc: "Prosklené interiérové dveře 900/2100 s omezovačem 95–100°",
          at: 5.00,
          width: 0.90,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "start", dir: "west" },
        },
      ],
    },
    {
      id: "part-tm-wc",
      name: "Příčka TM / WC hosté",
      from: [X_SERVICE_W, Z_TM_S],
      to: [X_EAST_IN, Z_TM_S],
      height: 2.95,
      thickness: T_SDK,
      material: "partition",
    },
    {
      id: "part-wc-vest",
      name: "Příčka WC hosté / zádveří",
      from: [X_SERVICE_W, Z_WC_S],
      to: [X_EAST_IN, Z_WC_S],
      height: 2.95,
      thickness: T_SDK,
      material: "partition",
    },
    {
      id: "part-vest-kids1",
      name: "Příčka zádveří / pokoj 1",
      from: [X_SERVICE_W, Z_VEST_S],
      to: [X_EAST_IN, Z_VEST_S],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
    },
    {
      id: "part-corr-kids1",
      name: "Příčka chodba / dětský pokoj 1 (sever)",
      from: [X_SPINE_E, Z_VEST_S],
      to: [X_SERVICE_W, Z_VEST_S],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
    },
    {
      id: "part-living-east",
      name: "Nosná stěna obývací pokoj / ložnice a pokoj 1",
      from: [X_SPINE_E, Z_VEST_S],
      to: [X_SPINE_E, Z_SOUTH_IN],
      height: 2.95,
      thickness: T_LOAD,
      material: "partition",
      openings: [
        {
          type: "door",
          name: "Dveře do dětského pokoje 1",
          desc: "Interiérové dveře 800/2100 s integrovaným omezovačem 95–100°",
          at: 0.585,
          width: 0.80,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "start", dir: "east" },
        },
        {
          type: "door",
          name: "Dveře do ložnice",
          desc: "Akustické dveře 800/2100 s integrovaným omezovačem 95–100°",
          at: 3.75,
          width: 0.80,
          height: 2.10,
          sill: 0.20,
          swing: { hinge: "end", dir: "east" },
        },
      ],
    },
    {
      id: "part-kids1-bed",
      name: "Akustická příčka pokoj 1 / ložnice",
      from: [X_SPINE_E, Z_BED1_S],
      to: [X_EAST_IN, Z_BED1_S],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
    },
    {
      id: "part-kids2-living",
      name: "Příčka dětský pokoj 2 / obývací pokoj",
      from: [X_WEST_IN, Z_LIVING_N],
      to: [X_SPINE_W, Z_LIVING_N],
      height: 2.95,
      thickness: T_PART,
      material: "partition",
    },
    {
      id: "part-hall-living",
      name: "Dělicí stěna chodba / obývací pokoj",
      from: [X_SPINE_W, Z_LIVING_N],
      to: [X_SPINE_E, Z_LIVING_N],
      height: 2.95,
      thickness: T_LOAD,
      material: "partition",
      openings: [
        { type: "portal", name: "Průchod do obývacího pokoje", at: 0.95, width: 1.20, height: 2.35, sill: 0.20 },
      ],
    },
  ];

  const furniture = [
    // Přístřešek nad vstupem (východní fasáda směrem k přístřešku pro auto)
    {
      type: "canopy",
      name: "Přístřešek hlavního vchodu",
      desc: "Konzolový přístřešek nad vstupem chránící před deštěm z krytého stání",
      pos: [4.80, -1.26],
      yOffset: 2.50,
      size: [1.00, 0.08, 1.60],
    },

    // 1.01 Zádveří (X: 1.87 to 4.22, Z: -2.24 to -0.67)
    {
      type: "wardrobe",
      name: "Šatní skříň v zádveří",
      desc: "Vestavěná šatní skříň na kabáty, boty a sezónní doplňky",
      pos: [3.05, -2.00],
      size: [1.80, 2.20, 0.45],
    },

    // 1.02 Technická místnost & prádelna (X: 1.87 to 4.22, Z: -6.22 to -3.76)
    {
      type: "laundryStack",
      name: "Tepelné čerpadlo a pračka",
      desc: "Vnitřní jednotka TČ s integrovaným zásobníkem TUV, pračka a sušička",
      pos: [3.85, -4.60],
      size: [0.65, 1.80, 1.40],
    },
    {
      type: "shaft",
      name: "FVE střídač a baterie",
      desc: "Hybridní střídač 10 kW a bateriové úložiště 10,6 kWh pro střešní FVE",
      pos: [3.85, -5.60],
      size: [0.55, 1.80, 0.60],
    },

    // 1.03 WC pro hosty (X: 1.87 to 4.22, Z: -3.64 to -2.36)
    {
      type: "wc",
      name: "Závěsné WC hosté",
      desc: "Podomítkový modul WC se splachováním dešťovou vodou z podzemní nádrže",
      pos: [2.70, -2.66],
      size: [0.40, 0.42, 0.55],
    },
    {
      type: "vanity",
      name: "Umývátko pro hosty",
      desc: "Kompaktní umývátko se skříňkou na severní instalační stěně",
      pos: [3.95, -3.42],
      size: [0.38, 0.85, 0.40],
    },

    // 1.10 Rodinná koupelna (X: -1.03 to 0.78, Z: -6.22 to -3.87)
    {
      type: "bathtub",
      name: "Vana se sprchovou zástěnou 160×70",
      desc: "Akrylátová vana se zástěnou pod severním oknem",
      pos: [-0.10, -5.85],
      size: [1.60, 0.55, 0.70],
    },
    {
      type: "vanity",
      name: "Umyvadlo se skříňkou koupelna",
      desc: "Koupelnová umyvadlová sestava 70 cm se zrcadlovou skříňkou",
      pos: [-0.80, -4.40],
      size: [0.45, 0.85, 0.70],
    },
    {
      type: "wc",
      name: "Závěsné WC koupelna",
      desc: "Podomítkový modul WC s napojením na filtraci dešťové vody",
      pos: [0.53, -4.60],
      size: [0.50, 0.42, 0.40],
    },

    // 1.09 Pracovna / pokoj pro hosty (X: -4.22 to -1.17, Z: -6.22 to -2.57)
    {
      type: "desk",
      name: "Pracovní stůl",
      desc: "Prostorný pracovní stůl pod severním oknem s přirozeným denním světlem",
      pos: [-2.60, -5.85],
      size: [1.40, 0.75, 0.65],
    },
    {
      type: "bed",
      name: "Pohovka / lůžko pro hosty",
      desc: "Rozkládací pohovka pro návštěvy u západní stěny",
      pos: [-3.17, -3.02],
      size: [2.00, 0.55, 0.90],
    },
    {
      type: "wardrobe",
      name: "Knihovna a skříň",
      desc: "Knihovna a úložná skříň na dokumenty a šatstvo",
      pos: [-1.45, -4.80],
      size: [0.45, 2.00, 1.40],
    },

    // 1.08 Dětský pokoj 2 (X: -4.22 to -1.17, Z: -2.43 to 0.53)
    {
      type: "bed",
      name: "Lůžko dětský pokoj 2",
      desc: "Dětská postel 90×200 cm podél západní stěny",
      pos: [-3.70, -1.40],
      size: [0.90, 0.55, 2.00],
    },
    {
      type: "desk",
      name: "Psací stůl pokoj 2",
      desc: "Dětský psací stůl s dostatkem úložného prostoru",
      pos: [-2.45, 0.23],
      size: [1.20, 0.75, 0.60],
    },
    {
      type: "wardrobe",
      name: "Šatní skříň dětský pokoj 2",
      desc: "Šatní skříň v severovýchodním rohu pokoje",
      pos: [-1.65, -2.15],
      size: [0.90, 2.00, 0.50],
    },

    // 1.07 Dětský pokoj 1 (X: 0.95 to 4.22, Z: -0.53 to 2.53)
    {
      type: "bed",
      name: "Lůžko dětský pokoj 1",
      desc: "Postel 90×200 cm podél východní stěny",
      pos: [3.70, 0.50],
      size: [0.90, 0.55, 2.00],
    },
    {
      type: "desk",
      name: "Psací stůl pokoj 1",
      desc: "Pracovní stůl u jižní stěny",
      pos: [2.30, 2.23],
      size: [1.20, 0.75, 0.60],
    },
    {
      type: "wardrobe",
      name: "Šatní skříň dětský pokoj 1",
      desc: "Šatní skříň podél západní příčky s volným manipulačním prostorem",
      pos: [1.30, 1.15],
      size: [0.55, 2.00, 1.20],
    },

    // 1.06 Ložnice rodičů (X: 0.95 to 4.22, Z: 2.67 to 6.22)
    {
      type: "bed",
      name: "Manželské dvoulůžko",
      desc: "Dvoulůžko 180×200 cm s čelem u jižní stěny a přímým výstupem na zahradu",
      pos: [2.50, 5.15],
      size: [1.80, 0.60, 2.00],
    },
    {
      type: "wardrobe",
      name: "Šatní skříň ložnice",
      desc: "Velká vestavěná šatní sestava 180 cm",
      pos: [3.20, 2.98],
      size: [1.80, 2.20, 0.60],
    },

    // 1.05 Obývací pokoj + kuchyňský kout (X: -4.22 to 0.75, Z: 0.67 to 6.22)
    {
      type: "kitchenCounter",
      name: "Kuchyňská linka",
      desc: "Pracovní plocha s dřezem, myčkou a indukční varnou deskou",
      pos: [-2.70, 0.97],
      size: [3.00, 0.90, 0.60],
    },
    {
      type: "kitchenTall",
      name: "Vysoké skříně kuchyně",
      desc: "Vestavná chladnička, pečicí a mikrovlnná trouba, spížová skříň",
      pos: [-3.87, 2.10],
      size: [0.60, 2.20, 1.20],
    },
    {
      type: "diningTable",
      name: "Jídelní stůl pro 6 osob",
      desc: "Masivní jídelní stůl pro 6 osob s pohodlnými židlemi a odstupem 85 cm od linky",
      pos: [-1.40, 2.60],
      size: [1.60, 0.76, 0.90],
    },
    {
      type: "lSofa",
      name: "Rohová sedací souprava",
      desc: "Komfortní rohová sedací souprava orientovaná k HS portálu na terasu a TV sestavě",
      pos: [-2.30, 4.40],
      parts: [
        { size: [2.40, 0.45, 0.90], offset: [0, 0] },
        { size: [0.90, 0.45, 1.20], offset: [-0.75, -0.90] },
      ],
    },
    {
      type: "coffeeTable",
      name: "Konferenční stolek",
      desc: "Konferenční stolek u sedací soupravy",
      pos: [-2.30, 5.40],
      size: [0.80, 0.40, 0.50],
    },
    {
      type: "tvStand",
      name: "TV sestava",
      desc: "Nízká TV komoda s audio-video technikou na nosné zdi",
      pos: [0.52, 4.80],
      size: [0.40, 0.60, 1.60],
    },
  ];

  const rooms = [
    {
      id: "1.01",
      name: "Zádveří",
      areaSqm: 4.3,
      pos: [3.00, 0.3, -1.30],
      desc: "Vstupní zádveří z krytého stání a příjezdové komunikace s vestavěnou šatní skříní",
    },
    {
      id: "1.02",
      name: "Technická místnost & prádelna",
      areaSqm: 6.1,
      pos: [3.00, 0.3, -4.95],
      desc: "Tepelné čerpadlo, pračka, sušička, hybridní FVE střídač 10 kW + baterie 10,6 kWh a vodárna dešťové vody",
    },
    {
      id: "1.03",
      name: "WC pro hosty",
      areaSqm: 3.4,
      pos: [3.40, 0.3, -3.00],
      desc: "Samostatné WC pro návštěvy s umývátkem a splachováním dešťovou vodou",
    },
    {
      id: "1.04",
      name: "Centrální chodba",
      areaSqm: 11.5,
      pos: [0.00, 0.3, -1.50],
      desc: "Centrální spojovací chodba se severním světlíkem pro přirozené denní světlo",
    },
    {
      id: "1.05",
      name: "Obývací pokoj + kuchyňský kout",
      areaSqm: 28.2,
      pos: [-1.80, 0.3, 3.40],
      desc: "Prosluněný obytný prostor s kuchyňskou linkou, jídelnou a HS portálem na západní/jižní terasu",
    },
    {
      id: "1.06",
      name: "Ložnice rodičů",
      areaSqm: 12.4,
      pos: [2.50, 0.3, 3.80],
      desc: "Ložnice rodičů s francouzským oknem do zahrady a velkou šatní skříní",
    },
    {
      id: "1.07",
      name: "Dětský pokoj 1",
      areaSqm: 10.9,
      pos: [2.50, 0.3, 1.00],
      desc: "Samostatný dětský pokoj orientovaný na východní ranní slunce",
    },
    {
      id: "1.08",
      name: "Dětský pokoj 2",
      areaSqm: 10.6,
      pos: [-2.60, 0.3, -1.00],
      desc: "Samostatný dětský pokoj s oknem orientovaným do západní zahrady",
    },
    {
      id: "1.09",
      name: "Pracovna / pokoj pro hosty",
      areaSqm: 10.7,
      pos: [-2.60, 0.3, -4.40],
      desc: "Klidná pracovna pro home office nebo pokoj pro hosty s rohovým prosvětlením (sever a západ)",
    },
    {
      id: "1.10",
      name: "Rodinná koupelna",
      areaSqm: 5.4,
      pos: [-0.15, 0.3, -4.80],
      desc: "Kompletní koupelna s vanou, sprchovou zástěnou, WC, 70cm umyvadlem a oknem na sever",
    },
  ];

  return {
    id: "bungalow-5kk",
    label: "Přízemní bungalov 5+kk (Bezbariérový dům bez schodů · 103 m²)",
    code: "RD-5KK-BUNGALOW",
    projectTitle: "PŘÍZEMNÍ BUNGALOV 5+KK · VOJÁČKOVI TROUBELICE",
    footprint: { width: W, length: L },
    floorHeight: 2.95,
    wallThickness: T_EXT,
    partThickness: T_PART,
    ceiling1Sdk: true,
    floor1: {
      elevation: 0,
      finishes: [
        {
          name: "Podlaha celého domu (SPC Rigidní vinyl)",
          material: "woodFloor",
          size: [W - 2 * T_EXT, L - 2 * T_EXT],
          thickness: 0.18,
          pos: [0, 0],
        },
      ],
      walls,
      furniture,
      dimensionSlices: {
        x: [-2.50, 0.00, 2.50],
        z: [-4.00, 0.00, 4.00],
      },
      rooms,
    },
    floor2: null,
    ceilingSlab: {
      name: "Lehký sádrokartonový strop (zavěšený na vaznících)",
      width: W,
      length: L,
      thickness: 0.15,
      y: 2.95,
    },
    roof: {
      name: "Valbová střecha bungalovu (25°)",
      width: W,
      length: L,
      height: 2.2,
      y: 2.95,
      ridgeAxis: "z",
      eaveOverhang: 0.50,
      gableOverhang: 0.40,
      thickness: 0.22,
      hasSolar: true,
    },
  };
}

export const bungalowHouse5kk = createDesign();
export default bungalowHouse5kk;

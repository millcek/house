/**
 * Technical specification ("skladby" + conversion factors) for the bill of materials.
 *
 * This is the ONLY place with material assumptions. All quantities are derived from
 * the geometry in `src/designs/*` – change a wall, window or roof there and the
 * výkaz výměr updates automatically. Change a layer / product assumption here.
 *
 * Units: metres, m², m³, kg, ks. `waste` = prořez / ztratné (0.05 = 5 %).
 */
export const BOM_SPEC = {
  // ------------------------------------------------------------------ ZÁKLADY
  foundations: {
    stripWidth: 0.60, // šířka základového pasu
    stripDepth: 0.80, // hloubka pasu (nezámrzná hloubka)
    plinthHeight: 0.50, // ztracené bednění nad pasem (sokl)
    plinthBlockFormat: [0.50, 0.25], // ZB tvárnice d × v
    baseSlabThickness: 0.15, // podkladní betonová deska
    gravelThickness: 0.15, // hutněný štěrkový podsyp pod deskou
    topsoilDepth: 0.30, // sejmutí ornice
    topsoilMargin: 1.0, // přesah výkopu kolem stavby
    meshOverlap: 1.15, // přesahy KARI sítí
    waterproofUpturn: 0.30, // vytažení hydroizolace na sokl
    perimeterInsulationHeight: 1.0, // XPS perimetr (sokl + pod terén)
    padFootingSize: 0.80, // patka pod sloupek (krychle a × a × a)
    smallPadSize: 0.40, // patka pod sloupek pergoly / loubí
  },

  // ------------------------------------------------------------- SVISLÉ KONSTRUKCE
  /**
   * Zdivo podle tloušťky stěny z modelu. První pravidlo, kterému tloušťka vyhoví, vyhrává.
   * `format` = [délka, výška] tvárnice v m → ks/m² se dopočítá.
   */
  masonry: [
    {
      minT: 0.30,
      label: 'Keramická broušená tvárnice obvodová (tl. 240 mm + ETICS 140 mm, U ≤ 0,18 W/m²K)',
      format: [0.375, 0.249],
      coreThickness: 0.24,
      eticsThickness: 0.14,
      mortar: 'Tenkovrstvá malta / zdicí pěna dle systému',
      waste: 0.05,
    },
    {
      minT: 0.20,
      label: 'Keramická broušená tvárnice nosná akustická (tl. 240 mm)',
      format: [0.375, 0.249],
      mortar: 'Tenkovrstvá malta dle systému',
      waste: 0.05,
    },
    {
      minT: 0.16,
      label: 'Keramická broušená tvárnice vnitřní nosná (tl. 175 mm)',
      labelStructural: 'Keramická broušená tvárnice vnitřní nosná (tl. 175 mm)',
      format: [0.375, 0.249],
      mortar: 'Tenkovrstvá malta dle systému',
      waste: 0.05,
    },
    {
      minT: 0.0,
      label: 'Keramická broušená příčkovka (tl. 140 mm)',
      labelStructural: 'Keramická broušená tvárnice vnitřní nosná',
      format: [0.50, 0.249],
      mortar: 'Tenkovrstvá malta dle systému',
      waste: 0.05,
    },
  ],
  sdk: {
    wallType: 'Akustická SDK příčka W112 tl. 125 mm (2× Knauf Diamant + 75 mm minerální vlna)',
    waste: 0.08,
  },
  etics: {
    thickness: 0.14,
    label: 'Kontaktní zateplení ETICS – EPS 70F tl. 140 mm vč. lepidla, kotev a armovací vrstvy',
    waste: 0.06,
  },
  lintel: {
    module: 0.25, // délky překladů po 250 mm
    bearing: 0.125, // uložení na každé straně min. 125 mm
    beamWidth: 0.07, // šířka jednoho keramického nosného překladu
  },
  ringBeam: {
    height: 0.25, // ztužující věnec pod pozednicí
    insulationGap: 0.10, // věncovka + izolace na vnější straně
    rebarKgPerM3: 120,
  },

  // --------------------------------------------------------- VODOROVNÉ KONSTRUKCE
  slab: {
    concrete: 'Beton C25/30 XC1',
    rebarKgPerM3: 110,
  },

  // ------------------------------------------------------------------- STŘECHA
  roof: {
    rafterSpacing: 0.90,
    rafterSection: [0.08, 0.18],
    wallPlateSection: [0.16, 0.14], // pozednice
    collarSection: [0.05, 0.16], // kleštiny (pár na každou dvojici krokví)
    battenSpacing: 0.33, // střešní latě 40/60
    tilesPerM2: 10.5,
    ridgeTilesPerM: 3.0,
    membraneOverlap: 1.10,
    gutterHookSpacing: 0.75,
    covering: 'Skládaná střešní krytina (betonová / keramická taška)',
    // Nevytápěné podkroví: izolace a podhled na úrovni stropu 2.NP (pasivní/nZEB standard)
    ceilingInsulationThickness: 0.35,
    ceilingProfileMPerM2: 3.2, // CD profily na m² podhledu
  },

  // -------------------------------------------------------------- VÝPLNĚ OTVORŮ
  windows: {
    label: 'Okno dřevohliníkové / plastové, izolační trojsklo, Uw ≤ 0,8 W/m²K',
    slidingLabel: 'Zdvižně-posuvné (HS) okno / portál, izolační trojsklo',
    pskLabel: 'Terasový portál PSK (posuvně-sklopný), izolační trojsklo, Uw ≤ 0,8 W/m²K',
    blindsLabel: 'Venkovní žaluzie Z90 s motorickým pohonem + podomítkový kastlík',
    extDoorLabel: 'Vchodové dveře, Ud ≤ 0,9 W/m²K, bezpečnostní kování',
    intDoorLabel: 'Vnitřní dveře otočné plné + obložková zárubeň',
    glazedDoorLabel: 'Vnitřní dveře otočné prosklené (bezpečnostní / akustické sklo) + obložková zárubeň',
    pocketDoorLabel: 'Vnitřní dveře posuvné do stavebního pouzdra + stavební pouzdro',
    sillOverhang: 0.05, // přesah parapetu za ostění
    minSillForParapet: 0.30, // okna s parapetem nad 30 cm dostanou vnitřní parapet
  },

  // ---------------------------------------------------------- PODLAHY & POVRCHY
  floors: {
    screedThickness: 0.05, // anhydritový potěr s podlahovým topením
    finishThickness: { woodFloor: 0.015, vinylFloor: 0.005, tileFloor: 0.012 },
    groundFloorInsulation: 'EPS 150 S (tl. 155 mm v systémové skladbě na terénu)',
    upperFloorInsulation: 'Kročejová izolace EPS T / akustická minerální vlna tl. 55 mm',
    minGroundInsulation: 0.14, // kontrola – varování pod touto tloušťkou
    woodWaste: 0.08,
    vinylWaste: 0.07,
    vinylLabel: 'Lepený vinyl (LVT/Rigid) vč. samonivelační stěrky a lepidla',
    tileWaste: 0.10,
    tileAdhesiveKgPerM2: 4.5,
    groutKgPerM2: 0.5,
    perimeterStripPerRoom: true,
  },
  wetRooms: {
    // výška obkladu podle vybavení místnosti (room.fixtures)
    tileHeightShower: 2.10,
    tileHeightOther: 1.50,
    showerZoneWallSqm: 4.8, // hydroizolační stěrka na stěny sprchy / vany
    tileWaste: 0.12,
  },
  plaster: {
    interior: 'Vápenocementová / sádrová omítka jádrová + štuk',
    exterior: 'Fasádní tepelněizolační omítka + silikonová probarvená omítka',
    plinth: 'Soklová mozaiková omítka na XPS',
    revealDepthOffset: 0.10, // hloubka ostění = tl. stěny − rámeček okna
  },
  paint: {
    label: 'Malba disperzní, 2 nátěry + penetrace',
  },

  // ------------------------------------------------------------------- TZB
  tzb: {
    heatLossWPerM2: 35, // orientační tepelná ztráta pro dimenzi TČ
    floorHeatingPipeMPerM2: 6.7, // rozteč 150 mm
    ventilationAirChange: 0.3, // 1/h
    ventDuctPerOutlet: 6.0, // m potrubí na vyústku (odhad)
    hotWaterBase: 200, // l
    hotWaterPerBathroom: 50, // l
    socketsPerM2: 1 / 5, // zásuvky – odhad 1 ks / 5 m², min. 2
    socketsMin: 2,
    extraSockets: { drez: 5, pracka: 2, umyvadlo: 1, dvojumyvadlo: 2, umyvatko: 1 },
    exteriorLights: 4, // vstup, terasa, loubí, dílna
    fixtures: {
      wc: { label: 'WC závěsné + předstěnový modul + tlačítko', unit: 'ks' },
      umyvadlo: { label: 'Umyvadlo + baterie + sifon', unit: 'ks' },
      dvojumyvadlo: { label: 'Dvojumyvadlo + 2× baterie + sifon', unit: 'ks' },
      umyvatko: { label: 'Umývátko + baterie', unit: 'ks' },
      sprcha: { label: 'Walk-in sprcha: odtokový žlab, zástěna, termostatická baterie', unit: 'kpl' },
      vana: { label: 'Vana + vanová baterie + sifon', unit: 'ks' },
      drez: { label: 'Kuchyňský dřez + baterie (připojení)', unit: 'ks' },
      mycka: { label: 'Připojení myčky (ventil, odpad)', unit: 'ks' },
      pracka: { label: 'Připojení pračky / sušičky (ventil, sifon)', unit: 'ks' },
      vylevka: { label: 'Výlevka / úklidový dřez', unit: 'ks' },
    },
  },

  // --------------------------------------------------------- VNĚJŠÍ ÚPRAVY
  exterior: {
    terracePaverLabel: 'Velkoformátová betonová dlažba 60×60×4 cm (mrazuvzdorná, R11)',
    terracePaverWaste: 0.08,
    deckJoistSpacing: 0.40, // rošt terasy
    deckPadsPerM2: 3,
    deckWaste: 0.10,
    pergolaRoofing: 'Střešní plášť pergoly (polykarbonát / bezpečnostní sklo / plech)',
    canopyGlass: 'Bezpečnostní vrstvené sklo VSG 2×8 mm',
  },
  aux: {
    wallThickness: 0.24, // zdivo dílny a zadní stěny stání (není v modelu)
    pillarSection: 0.25,
    floorSlabThickness: 0.15,
    roofThickness: 0.22,
    eaveOverhang: 0.35,
    gableOverhang: 0.35,
  },
  site: {
    utilityExtra: 2.0, // přídavek k délce přípojek (napojení v domě)
    drivewayWidth: 5.0, // šířka vjezdu ke stání
    rainwaterRetentionM3PerM2: 0.03, // vsakovací objekt na m² střech
    gates: { vjezdova: 1, branka: 1 },
  },
};

/** Lidsky čitelný seznam předpokladů – exportuje se do CSV i zobrazuje v UI. */
export const BOM_ASSUMPTIONS = [
  'Množství jsou odvozena z parametrického modelu (stěny, otvory, podlahy, strop, střecha, schodiště, pergola, vedlejší stavba).',
  'Skladby a přepočtové koeficienty jsou předpoklady (src/budget/specifications.js) – konkrétní výrobky a dimenze upřesní statik a projektant TZB.',
  'Obvodové zdivo uvažováno jako 240 mm keramická cihla + 140 mm kontaktní zateplení ETICS (EPS 70F); příčky 2.NP jako akustické SDK W112 tl. 125 mm.',
  'Střecha hlavního domu: příhradové vazníky tvořící nosný strop 2.NP i krov, nevytápěné podkroví s 350 mm minerální vaty a SDK podhledem (v 1.NP podhled 100 mm pro VZT).',
  'Podlahy: potěr i nášlapné vrstvy (dub v obýváku s kuchyní, lepený vinyl v pokojích a 1.04, keramická dlažba v zázemí) vycházejí ze skutečné vnitřní užitné plochy místností.',
  'TZB a elektro jsou orientační počty (podlahové topení systémem Tacker, ekvitermní regulace, shoz prádla 2.04→1.02) – nenahrazují prováděcí projekt.',
  'Vedlejší stavba (zdivo 240 mm, nízká pultová střecha): otvory dílny nejsou v modelu; u samostatně stojící dílny mimo příslušenství RD může finanční úřad posoudit DPH 21 % namísto 12 % (§ 48 ZDPH).',
  'Sloupce „Jedn. cena“ a „Cena celkem“ vyplní dodavatel; „Množství k objednání“ zahrnuje prořez.',
];

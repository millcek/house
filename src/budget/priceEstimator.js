/**
 * Orientační ceník a odhad nákladů (benchmark 2026 v ČR).
 *
 * Podporuje dva režimy:
 * 1. 'turnkey' (Na klíč / dodavatelsky) – kompletní dodávka generálním dodavatelem,
 *    zahrnuje práci, mechanizaci, lešení, režii, záruku a zisk zhotovitele.
 * 2. 'self' (Svépomocí) – nákup materiálu svépomocí za velkoobchodní/stavební ceny
 *    + subdodávky odborných profesí (krov, okna, stříkaný potěr, instalace TČ, revize elektro/plyn),
 *    vlastní práce na hrubé stavbě, zateplení, obkladech a pomocných pracích.
 */

export function priceItem(item) {
  const n = item.name;

  // 1. Výplně otvorů (okna, HS portály, dveře): dynamická interpolace dle rozměru
  let m = n.match(/^(HS portál|Okno|Vstupní dveře|Vnitřní dveře)\s+(\d+)\s*×\s*(\d+)\s*mm/);
  if (m) {
    const [, kind, wStr, hStr] = m;
    const area = (Number(wStr) / 1000) * (Number(hStr) / 1000);
    if (kind === 'HS portál') {
      return { self: Math.round(42000 + 10500 * area), turnkey: Math.round(54000 + 13500 * area) };
    }
    if (kind === 'Okno') {
      return { self: Math.round(3400 + 5800 * area), turnkey: Math.round(4600 + 7800 * area) };
    }
    if (kind === 'Vstupní dveře') {
      const wide = Number(wStr) >= 1000;
      return { self: wide ? 46000 : 29000, turnkey: wide ? 62000 : 39000 };
    }
    if (kind === 'Vnitřní dveře') {
      return { self: 7800, turnkey: 12200 };
    }
  }

  // 2. Překlady dle délky
  m = n.match(/^Keramický překlad délky (\d+) mm/);
  if (m) {
    const lenM = Number(m[1]) / 1000;
    return { self: Math.round(380 * lenM), turnkey: Math.round(620 * lenM) };
  }

  // 3. Tepelné izolace dle tloušťky v mm
  m = n.match(/izolace (podlahy|stropu).*tl\. (\d+) mm/);
  if (m) {
    const isFloor = m[1] === 'podlahy';
    const tMm = Number(m[2]);
    return isFloor
      ? { self: Math.round(3.8 * tMm + 30), turnkey: Math.round(6.2 * tMm + 90) }
      : { self: Math.round(1.9 * tMm), turnkey: Math.round(3.2 * tMm) };
  }

  // 4. Tabulka jednotkových cen dle klíčových slov (Kč / MJ)
  const table = [
    // 01 Zemní práce
    [/Sejmutí ornice/, 140, 310],
    [/Výkop rýh/, 380, 890],

    // 02 Základy
    [/Beton základových pasů/, 3400, 4900],
    [/Ztracené bednění – betonové tvárnice/, 82, 155],
    [/Beton výplně ztraceného bednění/, 3500, 5100],
    [/Štěrkový podsyp/, 980, 1750],
    [/Podkladní betonová deska/, 3600, 5300],
    [/Svařovaná výztužná síť KARI/, 175, 290],
    [/Hydroizolace spodní stavby/, 260, 540],
    [/Perimetrická izolace soklu XPS/, 450, 820],

    // 03 Svislé konstrukce
    [/^Zdivo obvodové/, 160, 1050],
    [/^Tvárnice obvodové/, 142, 142],
    [/^Zdivo příčky/, 110, 650],
    [/^Tvárnice příčky/, 76, 76],
    [/^Zdivo vnitřní nosné tl\. 160/, 120, 740],
    [/^Tvárnice vnitřní nosné tl\. 160/, 82, 82],
    [/^Zdivo vnitřní nosné tl\. 240/, 140, 880],
    [/^Tvárnice vnitřní nosné tl\. 240/, 104, 104],
    [/^Štítové zdivo/, 180, 1180],
    [/^Tvárnice štítové/, 142, 142],

    // 04 Vodorovné konstrukce
    [/Stropní deska.*beton/, 3800, 5600],
    [/Stropní deska.*výztuž/, 38, 64],
    [/Stropní deska.*bednění/, 250, 780],
    [/Věncovka \+ izolace věnce/, 350, 690],
    [/Ztužující věnec pod pozednicí – beton/, 3800, 5800],
    [/Ztužující věnec – výztuž/, 38, 64],
    [/Dvouramenné schodiště.*ŽB/, 7500, 18500],
    [/Obklad stupňů schodiště/, 2400, 4200],
    [/Obklad mezipodesty/, 2800, 4600],

    // 05 Střecha
    [/krokve$/i, 150, 420],
    [/řezivo krovu celkem/i, 10200, 16800],
    [/pojistná hydroizolace/i, 98, 230],
    [/kontralatě/i, 40, 85],
    [/střešní latě/i, 45, 92],
    [/střešní krytina – plocha/i, 160, 740],
    [/střešní tašky základní/i, 42, 42],
    [/krajové \(štítové\) tašky/i, 175, 240],
    [/hřebenáče/i, 210, 310],
    [/sněhové zachytávače/i, 350, 640],
    [/podbití přesahů/i, 680, 1380],

    // 06 Klempířské
    [/podokapní žlab/i, 410, 820],
    [/háky žlabu/i, 98, 175],
    [/kotlík/i, 520, 860],
    [/svodové potrubí/i, 390, 750],
    [/okapnice/i, 230, 460],
    [/závětrné lišty/i, 310, 590],
    [/lemování \/ úžlabí/i, 4800, 9500],
    [/Venkovní parapet/, 520, 890],

    // 07 Otvory doplňky
    [/Připojovací spára oken/, 95, 250],
    [/Vnitřní parapet/, 460, 820],

    // 08 Podlahy
    [/Dřevěná podlaha – dub/, 1450, 2350],
    [/Lepidlo na dřevěné podlahy/, 175, 210],
    [/Dlažba keramická/, 740, 1720],
    [/Flexibilní lepidlo C2TE/, 24, 32],
    [/Spárovací hmota/, 98, 130],
    [/Anhydritový lité potěr/, 4500, 6900],
    [/Separační PE fólie/, 20, 42],
    [/Dilatační obvodový pásek/, 24, 52],
    [/Soklové lišty k dřevěné podlaze/, 175, 340],
    [/Sokl z dlažby/, 110, 320],

    // 09 Úpravy povrchů
    [/Vnitřní omítka stěn/, 175, 540],
    [/Vnitřní omítka stropu/, 195, 590],
    [/Rohové a APU lišty/, 52, 120],
    [/Vnější omítka fasády/, 420, 1120],
    [/Vnější omítka ostění/, 310, 790],
    [/Fasádní rohové lišty/, 70, 155],
    [/Soklová omítka/, 460, 1050],
    [/Obklad stěn – koupelny/, 750, 1850],
    [/Hydroizolační stěrka/, 290, 640],
    [/Ukončovací lišty obkladů/, 195, 380],
    [/Malba stěn a stropů/, 38, 125],

    // 10 Podhledy a izolace stropu
    [/SDK podhled stropu 2\.NP – desky/, 260, 860],
    [/SDK podhled – CD profily/, 72, 130],
    [/SDK podhled – UD obvodové profily/, 56, 105],
    [/Parotěsná fólie pod izolací/, 70, 160],
    [/Půdní výlez zateplený/, 6200, 9800],

    // 11 Zdravotechnika
    [/WC závěsné/, 10500, 17200],
    [/^Umyvadlo \+ baterie/, 5800, 9600],
    [/Walk-in sprcha/, 18000, 29000],
    [/Kuchyňský dřez/, 7200, 10800],
    [/Připojení myčky/, 1100, 2500],
    [/Vana \+ vanová baterie/, 16000, 26000],
    [/Dvojumyvadlo/, 12500, 20500],
    [/Umývátko/, 3800, 6400],
    [/Připojení pračky/, 1200, 2600],
    [/Výlevka/, 3100, 5400],
    [/Vnitřní vodovod/, 42000, 92000],
    [/Vnitřní kanalizace/, 35000, 76000],
    [/Venkovní zahradní ventil/, 1950, 3800],

    // 12 Vytápění a větrání
    [/Tepelné čerpadlo vzduch–voda/, 195000, 275000],
    [/Zásobník teplé vody/, 31000, 44000],
    [/Podlahové topení – systémová deska/, 260, 460],
    [/Podlahové topení – trubka/, 35, 74],
    [/Rozdělovač podlahového topení/, 10500, 18000],
    [/Prostorové termostaty/, 2400, 4200],
    [/Rekuperační jednotka/, 89000, 134000],
    [/Tlumiče hluku VZT/, 2400, 4800],
    [/Rozdělovací distribuční boxy VZT/, 4500, 8200],
    [/Fasádní sací a výfuková mřížka/, 2100, 4200],
    [/Instalační šachta pro VZT/, 14000, 26000],
    [/Rekuperace – přívodní vyústky/, 1050, 2100],
    [/Rekuperace – odvodní vyústky/, 1050, 2100],
    [/Rekuperace – rozvodné potrubí/, 310, 680],
    [/Těsnicí manžety/, 260, 490],

    // 13 Elektroinstalace
    [/Zásuvkové vývody/, 460, 1280],
    [/Světelné vývody/, 520, 1380],
    [/Venkovní svítidla/, 1950, 3500],
    [/Datové zásuvky/, 590, 1480],
    [/Rozvaděč RD/, 31000, 58000],
    [/Elektroinstalace – kabeláž/, 62000, 148000],
    [/Hromosvod – jímací vedení/, 195, 460],
    [/Hromosvod – svody/, 260, 590],
    [/Zemnící páska/, 155, 340],

    // 14 Zámečnické
    [/Madlo schodiště/, 1950, 3800],
    [/Přístřešek hlavního vchodu.*sklo/, 6200, 9600],
    [/Přístřešek hlavního vchodu.*nosná/, 15500, 26500],
    [/Zábradlí schodišťové haly/, 7400, 12800],

    // 15 Terasa a pergola
    [/Zahradní terasa.*terasová prkna/, 1550, 2550],
    [/Terasa – nosný rošt/, 155, 310],
    [/Terasa – rektifikační terče/, 72, 125],
    [/Terasa – skryté spony/, 240, 420],
    [/Terasa – geotextilie \+ štěrkové lože/, 1200, 2150],
    [/Krytá pergola terasy – sloupky/, 2600, 4200],
    [/Krytá pergola terasy – vaznice/, 740, 1250],
    [/Krytá pergola terasy – krokve/, 2100, 3500],
    [/Krytá pergola terasy – střešní plášť/, 920, 1680],
    [/Krytá pergola terasy – patky/, 1550, 3100],
    [/Krytá pergola terasy – žlab/, 410, 780],

    // 16 Vedlejší stavba
    [/Základové pasy dílny/, 3800, 5600],
    [/Patky pod sloupy stání/, 3800, 5600],
    [/^Zdivo dílny/, 140, 920],
    [/^Tvárnice dílny/, 118, 118],
    [/Sloupy krytého stání/, 3500, 7400],
    [/Ztužující věnec dílny/, 4500, 7200],
    [/Podlahová deska dílny/, 4100, 6200],
    [/Podsyp štěrk \+ geotextilie – dílna/, 1050, 1880],
    [/Zpevněná plocha krytého stání/, 640, 1480],
    [/Vnější omítka dílny/, 380, 960],
    [/Vrata do dílny/, 31000, 46000],
    [/Dveře \+ okno dílny/, 17500, 26500],
    [/Kryté loubí – střešní plášť/, 920, 1680],
    [/Kryté loubí – sloupky/, 3500, 6200],
    [/Kryté loubí – patky/, 1350, 2650],

    // 17 Venkovní úpravy
    [/Chodník/, 640, 1480],
    [/Oplocení pozemku/, 740, 1580],
    [/Sloupky oplocení/, 520, 1050],
    [/Vjezdová brána/, 46000, 74000],
    [/Branka/, 10500, 18000],
    [/Vodovodní přípojka/, 720, 1980],
    [/Vodoměrná šachta/, 15500, 26000],
    [/Kanalizační přípojka/, 920, 2400],
    [/Elektropřípojka/, 1050, 2600],
    [/Datová přípojka/, 380, 1050],
    [/Vjezd ke krytému stání/, 740, 1680],
    [/Vsakovací objekt/, 7200, 12800],
    [/Dešťová kanalizace/, 460, 1250],
  ];

  const matched = table.find(([regex]) => regex.test(n));
  if (matched) {
    return { self: matched[1], turnkey: matched[2] };
  }
  return { self: 0, turnkey: 0 };
}

/**
 * Spočítá geometrický obestavěný prostor hlavního domu dle ČSN 73 4055.
 */
export function computeHouseVolume(design) {
  const w = design.footprint?.width ?? 8.0;
  const l = design.footprint?.length ?? 12.0;
  const footprint = w * l; // 96.0 m²
  const wallH = (design.roof?.y ?? 5.67) - (design.floor1?.elevation ?? 0); // 5.67 m
  const roofH = design.roof?.height ?? 2.8; // 2.8 m
  const plinthH = 0.70; // sokl a základová deska pod terénem

  const aboveGroundBody = footprint * wallH; // 544.32 m³
  const roofGableVolume = 0.5 * w * roofH * l; // 134.40 m³
  const foundationVolume = footprint * plinthH; // 67.20 m³

  const aboveGroundVolume = Number((aboveGroundBody + roofGableVolume).toFixed(1)); // 678.7 m³
  const totalVolume = Number((aboveGroundVolume + foundationVolume).toFixed(1)); // 745.9 m³

  return {
    footprint,
    aboveGroundVolume,
    totalVolume,
    wallHeight: wallH,
    roofHeight: roofH,
  };
}

/**
 * Provede kompletní ocenění výkazu výměr ve variantách Svépomocí a Na klíč.
 */
export function estimateBomPrices(bomResult, design) {
  const volumeInfo = computeHouseVolume(design);
  const interiorArea = bomResult.summary.interiorArea || 147.0;

  const scopes = {
    house: { self: 0, turnkey: 0 },
    aux: { self: 0, turnkey: 0 },
    exterior: { self: 0, turnkey: 0 },
  };

  const sections = bomResult.sections.map((sec) => {
    let secSelf = 0;
    let secTurnkey = 0;

    const items = sec.items.map((it) => {
      const p = priceItem(it);
      const costSelf = Math.round(it.orderQty * p.self);
      const costTurnkey = Math.round(it.orderQty * p.turnkey);

      secSelf += costSelf;
      secTurnkey += costTurnkey;

      if (scopes[it.scope]) {
        scopes[it.scope].self += costSelf;
        scopes[it.scope].turnkey += costTurnkey;
      }

      return {
        ...it,
        unitPriceSelf: p.self,
        unitPriceTurnkey: p.turnkey,
        costSelf,
        costTurnkey,
      };
    });

    return {
      ...sec,
      items,
      subtotalSelf: secSelf,
      subtotalTurnkey: secTurnkey,
    };
  });

  const totalSelf = scopes.house.self + scopes.aux.self + scopes.exterior.self;
  const totalTurnkey = scopes.house.turnkey + scopes.aux.turnkey + scopes.exterior.turnkey;

  // DPH 12 % pro stavbu pro sociální bydlení (obytná plocha do 350 m²)
  const VAT_RATE = 0.12;

  return {
    volumeInfo,
    interiorArea,
    scopes,
    totals: {
      selfNet: totalSelf,
      selfVat: Math.round(totalSelf * VAT_RATE),
      selfGross: Math.round(totalSelf * (1 + VAT_RATE)),
      turnkeyNet: totalTurnkey,
      turnkeyVat: Math.round(totalTurnkey * VAT_RATE),
      turnkeyGross: Math.round(totalTurnkey * (1 + VAT_RATE)),
    },
    houseMetrics: {
      selfPerM3: Math.round(scopes.house.self / volumeInfo.totalVolume),
      turnkeyPerM3: Math.round(scopes.house.turnkey / volumeInfo.totalVolume),
      selfPerM2: Math.round(scopes.house.self / interiorArea),
      turnkeyPerM2: Math.round(scopes.house.turnkey / interiorArea),
    },
    sections,
  };
}

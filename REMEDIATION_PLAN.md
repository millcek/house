# Plán nápravy a optimalizace projektu Rodinný dům 6+kk

Tento dokument zachycuje kompletní akční plán nápravy technických, dispozičních, ergonomických, TZB i rozpočtových nedostatků identifikovaných v hloubkové analýze modelu (`dreamHouseV1`, `auxiliaryBuildingConfig`, `BillOfMaterials`, `priceEstimator`).

---

## Přehled postupu

- [x] **Bod 1:** Sjednocení mokrých jader (ZTI) nad sebou & přepracování 2.NP
- [x] **Bod 2:** Konstrukční výška 2.NP, statika, standardní tloušťky zdiva a vazníková střecha + strop 2.NP
- [x] **Bod 3:** Zrušení krbu/komína, redukce přehřívání ZJZ, optimalizace oken a venkovní stínění
- [x] **Bod 4:** Pročištění 1.NP, komfortnější schodiště a oprava parkování / exteriéru
- [x] **Bod 5:** Zlevnění vedlejší stavby & kompletní narovnání rozpočtu, BOM, UI a testů
- [x] **Bod 6:** Zapracování FVE, hospodaření s dešťovou vodou a dveřních omezovačů

---

## Bod 1: Sjednocení mokrých jader (ZTI) nad sebou & přepracování 2.NP
**Stav:** ✅ Hotovo

**Cíl:** Přesunout koupelnu `2.04` a samostatné WC `2.05` do SV kvadrantu 2.NP přímo nad `1.02 Technická m.` a `1.03 Koupelna`, zprovoznit fyzikálně možný svislý shoz prádla z `2.04` do `1.02`, odstranit hluchou vstupní niku v `2.01`, přesunout pracovnu/šatnu `2.03` na východ a vložit vestavěné skříně jako akustický nárazník mezi dětské pokoje `2.07` a `2.08`.

**Dílčí úkoly:**
- [x] Přepracovat osy 2.NP (`Z_NORTH_ROOMS = -1.94`, `Z_BATH_WC = -3.18`, `Z_BATH_NICHE = -4.40`, `X_NORTH_BED_EAST = -0.28`, `X_HALL2_EAST = 1.06`, `Z_STAIR_SOUTH = 0.24`, `X_KOMORA_EAST = -1.44`, `Z_SOUTH_ROOMS = 2.00`, `X_KIDS_SEP = -0.18`).
- [x] Sjednotit svislou instalační šachtu `SHAFT_HOLE` (`x1: 1.35, z1: -5.61, x2: 1.81, z2: -5.17`) v 1.NP i 2.NP a vyčistit kolizi venkovních dveří `1.02` s rekuperací.
- [x] Aktualizovat podlahové zóny `floor2.finishes` pro L-tvar koupelny `2.04` + WC `2.05` a komory `2.06`.
- [x] Přepracovat vnitřní příčky 2.NP (všechny z lehkého akustického SDK 125 mm, bez nosných stěn nad 5,2m rozponem 1.NP).
- [x] Přizpůsobit okna východní fasády 2.NP (`2.04`, `2.05`, `2.03`) a rozložení zařizovacích předmětů a nábytku v `2.02–2.08` (včetně skříní na dělící stěně `2.07`/`2.08`).
- [x] Opravit popisy místností (svislý shoz prádla z `2.04` do `1.02`), pozice štítků a `dimensionSlices` 2.NP.
- [x] Ověřit pomocí `npm run analyze` (`0 chyb | 0 varování`).

**Provedené změny a ověření:**
- V `src/designs/dreamHouseV1.js` přesunuty místnosti `2.04 Rodinná koupelna` (7,5 m²) a `2.05 Samostatné WC` (2,8 m²) do SV kvadrantu přímo nad `1.02` a `1.03` (`bounds.maxZ = -2,0025 m`), `2.03 Šatna & Pracovna (V)` (9,5 m²) přesunuta do východní části středu patra.
- Sjednocena svislá šachta `SHAFT_HOLE` v ose `[1,58; -5,39]` pro 1.NP i 2.NP, do popisu `2.04` a `1.02` zapsán reálně proveditelný svislý shoz prádla.
- Všechny vnitřní příčky 2.NP převedeny na lehké akustické SDK tl. 125 mm (`structural: false`, `construction: 'sdk'`) bez vstupní niky v `2.01`; šatní skříně v `2.07` a `2.08` vloženy zády k sobě na dělicí příčku `X = -0,18`.
- `npm run analyze` po úpravě: **0 chyb (error) | 0 varování (warning) | 9 info**. (Severní regál v komoře `2.06` dočasně osazen šířky 0,94 m vedle stávajícího komína; na plnou šířku 1,50 m se rozšíří v Bodu 3 po odstranění krbu/komína.)

---

## Bod 2: Konstrukční výška 2.NP, statika, standardní tloušťky zdiva a vazníková střecha + strop 2.NP
**Stav:** ✅ Hotovo

**Cíl:** Zvýšit konstrukční výšku 2.NP o +30 cm (`y = 6,12 m`, nadpraží oken `63 cm` pro překlad + věnec + podomítkový kastlík žaluzií, světlá výška pod SDK/VZT podhledem `≥ 2,63 m`), sjednotit výšku vnitřních stěn 1.NP na `2,95 m`, zavést reálné české formáty zdiva (`240+140 ETICS`, `240`, `175`, `140` + `125 mm` SDK v 2.NP), příhradové vazníky řešící krov i nosný strop 2.NP a SDK podhled 1.NP pro rozvody VZT v teplé zóně.

**Dílčí úkoly:**
- [x] Zavést standardní tloušťky zdiva v `dreamHouseV1.js` (`T_EXT = 0.38`, `T_SPINE = 0.24`, `T_LOAD = 0.175`, `T_PART = 0.14`, `T_SDK = 0.125`) a sjednotit výšku vnitřních stěn 1.NP na `2,95 m`.
- [x] Zvýšit stěny 2.NP na `2,95 m`, nastavit `ceiling2Slab.y = 6.12`, `roof.y = 6.12`, `roof.height = 1.90`, `truss: true`, `gableThickness: 0.24`, `ceiling1Sdk: true`.
- [x] Odstranit hardcoded řezné výšky `2.95` / `5.82` v `FloorPlanController.js` a aktualizovat rozsah sliderů v `index.html`.
- [x] Aktualizovat výpočet světlých výšek a popis konstrukcí `assemblies` v `ProjectSchedules.js`.
- [x] Aktualizovat popisy tlouštěk zdiva v legendě `FloorPlanSvgGenerator.js`.
- [x] Ověřit `npm run analyze` a nadpraží/světlé výšky v Node.

**Provedené změny a ověření:**
- V `src/designs/dreamHouseV1.js` sjednoceny standardní tloušťky stěn (`T_EXT = 0.38` = 240 mm cihla + 140 mm ETICS, `T_SPINE = 0.24`, `T_LOAD = 0.175`, `T_PART = 0.14`, `T_SDK = 0.125`), sjednocena výška stěn 1.NP i 2.NP na `2.95 m`, doplněn příznak `ceiling1Sdk: true` pro podhled 1.NP a strop 2.NP + vazníková střecha přeneseny na `y = 6.12 m`, `height = 1.90 m`, `truss: true`, `gableThickness: 0.24` (dočasně upraveno posunutí postele a šatní skříně v `1.04` po změně tloušťky příčky před kompletním přepracováním 1.NP v Bodu 4).
- V `src/ui/FloorPlanController.js` odstraněny pevné řezné výšky `2.95`/`5.82`/`8.5` ve prospěch hodnot z `defaultDesign`; v `index.html` zvýšen limit sliderů `#quick-slice-slider` a `#slice-slider` na `9.0 m`.
- V `src/exports/ProjectSchedules.js` započítány SDK/VZT podhledy (`f1SdkDrop = 0.10`, `f2SdkDrop = 0.15`) a aktualizovány skladby `K02–K07`; v `src/builders/FloorPlanSvgGenerator.js` upravena legenda stěn na `(380 / 240 / 175 mm)` a `(140 mm zdivo / 125 mm SDK)`.
- Ověření v Node (`buildAreaAndTechnicalSummary` + `analyzeDesignLayout`): světlá výška **1.NP = 2,63 m**, **2.NP = 2,68 m**, minimální nadpraží oken ve 2.NP **0,63 m**, sklon vazníkové střechy **25,4°**, úroveň pozednice **+6,12 m**, hřeben **+8,02 m**, audit dispozice **0 chyb | 0 varování**.

---

## Bod 3: Zrušení krbu/komína, redukce přehřívání ZJZ, optimalizace oken a venkovní stínění
**Stav:** ✅ Hotovo

**Cíl:** Zrušit kolizní krb a komín u okapu, výrazně snížit přehřívání ZJZ fasády a sjednotit formáty oken (`17 → 15` otvorů, zachování bočních oken `2.07`/`2.08` 1200×1300 pro denní světlo u psacích stolů), nahradit 4m HS portál ekonomičtějším 3,2m PSK portálem, zmenšit pergolu na `3,5 × 4,5 m` a připravit příznak `shaded: true` pro venkovní žaluzie Z90.

**Dílčí úkoly:**
- [x] Odstranit `fireplace` z `1.07` (čímž zmizí i komín ve 2.NP) a aktualizovat popisy `1.07` a `2.06`.
- [x] Optimalizovat okna 1.NP a 2.NP (odstranit okna v technické m. `1.02` a komoře `2.06`, zachovat boční okna do dětských pokojů `2.07` a `2.08` na západní a východní fasádě formátu 1200×1300 se stíněním, zvětšit parapet kuchyňského okna na `1,15 m` nad čistou podlahou, zmenšit schodišťové okno na fixní `1000×1500`, nahradit HS portál 4 m PSK portálem 3,2 m, doplnit `shaded: true`).
- [x] Upravit terasu a pergolu `1.08` na `3,5 × 4,5 m` (`15,8 m²`).
- [x] Ověřit `npm run analyze` a pokles ZJZ prosklení pod `15 m²` se stíněním všech obytných oken.

**Provedené změny a ověření:**
- V `src/designs/dreamHouseV1.js` odstraněn objekt `fireplace` (tím zanikl i odvozený komín v `2.NP`), rozšířen severní regál v komoře `2.06` na plných `1,50 m` (`pos: [-2.85, 0.54]`).
- Optimalizovány okenní otvory (`17 → 15` prosklených otvorů): odstraněna okna `1.02` a `2.06`, zachována boční okna do dětských pokojů `2.07` a `2.08` na západní a východní fasádě formátu `1200×1300` (parapet 1,02 m, venkovní žaluzie Z90 se `shaded: true`), 4m HS portál nahrazen 3,2m PSK portálem (`portalType: "psk"`), kuchyňské pásové okno zvýšeno na `sill: 1.37` (čistý parapet `1,15 m`, `1800×1050`), okno schodiště změněno na fixní `1000×1500` (`sill: 0.82, fixed: true`), sjednocena okna západní a jižní fasády a u všech obytných oken i PSK doplněno `shaded: true` pro venkovní žaluzie Z90.
- Terasa a pergola `1.08` zmenšeny z `24,0 m²` na kompaktních `3,5 × 4,5 m` (`15,8 m²`) před PSK portálem s velkoformátovou betonovou dlažbou.
- Ověření: `npm run analyze` -> **0 chyb (error) | 0 varování (warning) | 9 info**; `buildOpeningSchedule` -> celkem **15 prosklených otvorů** (**31,33 m²**), prosklení západní fasády (ZJZ) kleslo z `18,02 m²` na **14,26 m²** (`-20,9 %`, pod `15 m²`) se stíněním Z90 na všech západních obytných oknech.

---

## Bod 4: Pročištění 1.NP, komfortnější schodiště a oprava parkování / exteriéru
**Stav:** ✅ Hotovo

**Cíl:** Zlepšit ergonomii schodiště (`18× 171/275 mm`, ramena 98 cm), zvětšit zádveří `1.01` (`4,8 m²`) a bezbariérovou koupelnu `1.03` (`4,7 m²`), odsunout dveře `D2` od kuchyně, zvětšit kuchyňský ostrůvek (`155 cm`) a odstup ke stolu, oddálit TČ od ložnice `1.04`, rozšířit kryté dvojstání na `6,0 m`, zmenšit dílnu na `4,0 × 6,5 m` a odstranit kolize `canopy` a `eastWalkway` s hlavním domem.

**Dílčí úkoly:**
- [x] Upravit osy 1.NP (`X_STAIR_HALL = -0.40`, `X_TECH_WALL = 1.10`, `Z_STUDY_STAIR = -1.94`, `Z_TECH_SOUTH = -3.94`, `Z_BATH_VEST = -1.86`, `X_KITCHEN_SPLIT = 0.85`) a zvětšit schodiště (`18× 171/275 mm`).
- [x] Oříznout `floor1.finishes` na čisté vnitřní plochy místností.
- [x] Přeskládat otvory 1.NP (bez kolize `D2` s kuchyní, bezbariérové otevírání `1.03` ven, okno koupelny mimo sprchu, dveře do `1.02` šířky `900 mm`).
- [x] Aktualizovat nábytek 1.NP, popisy místností, `fixtures` (čistá sanita) a `dimensionSlices`.
- [x] Upravit `auxiliaryBuilding.js`: `parkWidth: 6`, `workshopWidth: 4`, `depth: 6.5`, `wallHeight: 2.7`, `roofType: 'mono'`, `roofHeight: 0.45`, srovnané `canopy` a `eastWalkway` bez kolizí s domem.
- [x] Ověřit `npm run analyze` (`0 chyb | 0 varování`) a provést vizuální kontrolu půdorysů 1.NP a 2.NP.

**Provedené změny a ověření:**
- V `src/designs/dreamHouseV1.js` upraveny osy 1.NP (`X_STAIR_HALL = -0.40`, `X_TECH_WALL = 1.10`, `Z_STUDY_STAIR = -1.94`, `Z_TECH_SOUTH = -3.94`, `Z_BATH_VEST = -1.86`, `Z_SPINE = 0.30`, `X_KITCHEN_SPLIT = 0.85`) a oříznuty zóny `floor1.finishes` přesně na vnitřní líce obvodových stěn.
- Schodiště zvětšeno na **18× 171/275 mm** (`2h + b = 616 mm`, šířka ramen **98 cm**, podesta **102 cm**); zádveří `1.01` zvětšeno na **4,8 m²** se skříní `2,40 m`; koupelna `1.03` zvětšena na **4,7 m²** s bezbariérovým otevíráním dveří `900 mm` ven, sprchovým koutem `120 × 90 cm` a východním oknem nad WC mimo sprchu; `D2` posunuty od kuchyně (`at: 3.92`, vůle `55 cm` od TV stěny); ostrůvek rozšířen na `155 cm` (ulička k lince `106,5 cm`, ke stolu `92 cm`, za stolem `88 cm`); TČ v `1.02` umístěno vedle šachty (`82,5 cm` od ložnice `1.04` s `90 cm` servisním prostorem); vyčištěny `fixtures` (`1.02`: `["pracka", "vylevka"]`).
- V `src/designs/auxiliaryBuilding.js` kryté dvojstání rozšířeno na **6,0 m**, dílna zmenšena na **4,0 × 6,5 m** (26 m²), výška stěn `2,7 m` a nízká pultová střecha (`roofType: 'mono'`, `roofHeight: 0.45`); `canopy` (`[6.6..8.5, -9.0..-5.04]`) i `eastWalkway` (`[8.6..9.8, -7.2..0.4]`) mají nulový přesah s hlavním domem `[0.5..8.5, -5.0..7.0]`.
- Ověření: `npm run analyze` -> **0 chyb (error) | 0 varování (warning) | 9 info**; `computeBuiltUpArea` -> zastavěná plocha celkem **184,3 m² (17,1 %)**, odstupy `streetRight = 5,0 m`, `houseWorkshopGap = 4,0 m`, `neighborWest = 14,0 m`; vizuální kontrolou vyrenderovaných PNG (`pudorys-1np.png`, `pudorys-2np.png`) potvrzena čitelnost štítků, kót i čisté ergonomie bez kolizí.

---

## Bod 5: Zlevnění vedlejší stavby & kompletní narovnání rozpočtu, BOM, UI a testů
**Stav:** ✅ Hotovo

**Cíl:** Podpořit nízkou pultovou střechu dílny/stání v 3D i DXF, opravit chyby v `BillOfMaterials.js` a `priceEstimator.js` (0 Kč položky, nadhodnocené podlahy, ZTI fixtures), zapracovat realistické skladby a opomenuté položky (ETICS, SDK, vazníky, podhled 1.NP, žaluzie, vinyl, Tacker, ekvitermní regulace, shoz prádla, zemní práce, projekt a TDI) a synchronizovat UI i testy.

**Dílčí úkoly:**
- [x] `SiteBuilder.js` (a `DxfGenerator.js` dle potřeby): podpora `auxConfig.roofType === 'mono'`.
- [x] `specifications.js`: skladby `240+140 ETICS`, `175`/`140` zdivo, `SDK W112`, `aux 240 mm`, PSK portál, betonová dlažba terasy, `BOM_ASSUMPTIONS`.
- [x] `BillOfMaterials.js`: kompletní oprava oddílů 01–18 (čisté podlahové plochy, oddělený SDK, vazníky, ETICS, žaluzie, vinyl, shoz prádla, Tacker, ekvitermní regulace, pultová střecha + omítka + elektro dílny, projekt + TDI).
- [x] `priceEstimator.js`: oprava regexu na prosklené dveře a PSK, ceník všech nových položek, dynamický `computeHouseVolume`.
- [x] `BudgetController.js` & `index.html`: synchronizace popisků výměr a ploch.
- [x] Aktualizace a rozšíření testů v `test/drawings.test.js`, `test/exports.test.js`, `test/layout.test.js`.
- [x] Finální ověření: `npm test`, `npm run analyze`, `npm run lint`, `npm run build`, vizuální kontrola PNG (`pudorys-1np.png`, `pudorys-2np.png`, `pudorys-both.png`) a doplnění srovnávací tabulky Před vs. Po.

**Provedené změny a ověření:**
- `src/builders/SiteBuilder.js` & `src/exports/DxfGenerator.js`: implementována nízká pultová střecha (`roofType: 'mono'`) se spádem k severu, zděný klín nad dílnou, výška sloupků stání pod pult a dynamická bilance dílny/stání bez středového hřebene v situaci DXF; v `ProjectSchedules.js` a `ElevationSvgGenerator.js` doplněno rozlišení PSK/FIX a sjednocen fallback výšky na `6,12 m`.
- `src/budget/specifications.js`, `src/budget/BillOfMaterials.js` & `src/budget/priceEstimator.js`: rozčleněno 18 oddílů (doplněna sekce `18` DSP/DPS/PENB/TDI/Blower-Door), opravena cena 0 Kč pro prosklené interiérové dveře a PSK portál (`0` položek za 0 Kč z `202` položek BOM), plocha potěru i krytin srovnána přesně na vnitřní užitnou plochu `147,1 m²` (dub `1.06`/`1.07`, lepený vinyl `1.04` a 2.NP, keramická dlažba zázemí), odděleny SDK příčky `W112` (2.NP) od mokrých omítek a zděných překladů, doplněn ETICS `140 mm`, příhradové vazníky, podhled `1.NP`, venkovní žaluzie Z90, podlahové topení Tacker, ekvitermní regulace, svislý shoz prádla `2.04 → 1.02`, odvoz zeminy + zařízení staveniště, betonová dlažba terasy a pultová střecha/elektro/omítka dílny včetně upozornění na možnou 21 % DPH u samostatné vedlejší stavby.
- `src/ui/BudgetController.js` & `index.html`: výměra vedlejší stavby dynamicky dle `auxiliaryBuildingConfig` (`26 m² + 39 m²`) a statická bilance pozemku sjednocena na `184,3 m² (17,1 %)`.
- `test/drawings.test.js` & `test/exports.test.js`: aktualizovány kóty 2.NP, ověření absence komína v pohledech (`!svg.includes('class="cad-chimney"')`), bilance `184,3 / 17,1` a přidáno 5 regresních testů (0 Kč položky, přesnost ploch potěru `147,1 m²`, SV poloha `2.04`/`2.05`, světlosti/nadpraží/ZJZ stínění, bezkolizní vedlejší stavba s `6,0 m` stáním).
- Finální ověření: `npm test` -> **43 / 43 testů prošlo (0 fail)**; `npm run analyze` -> **0 chyb | 0 varování | 9 info**; `npm run lint` -> **0 chyb**; `npm run build` -> čistý produkční build (`dist/`); vizuální kontrola PNG (`pudorys-1np.png`, `pudorys-2np.png`, `pudorys-both.png`) bez kolizí a s čitelnými štítky i kótami.

---

## Srovnání stavu Před vs. Po realizaci plánu

| Oblast / Parametr | Před úpravou | Po realizaci všech 5 bodů |
|---|---|---|
| **Mokrá jádra (ZTI) & shoz prádla** | `2.04`/`2.05` nad kuchyní a zádveřím; shoz z `2.04` do `1.02` neproveditelný (překřížení přes dům) | `2.04` (**8,9 m²** net / **9,1 m²** hrubá, čistý obdélník **`3,84 × 2,38 m`**) i `2.05` (2,8 m²) v SV kvadrantu přímo nad `1.02`/`1.03`; sjednocená šachta `[1,58; -5,39]`, funkční svislý shoz `2.04 → 1.02`, hala `2.01` zkrácena na přehledných **8,5 m²** bez hluché niky |
| **Světlá výška podlah / podhledů** | `2.NP` po snížení pro VZT jen ~`2,38 m` | **`1.NP = 2,63 m`** (pod SDK `100 mm`), **`2.NP = 2,68 m`** (pod SDK `150 mm`) |
| **Nadpraží oken 2.NP** | `33 cm` (kolize překlad + věnec + box žaluzií) | **`63 cm`** (`minLintel = 0,63 m` pro překlad, věnec i podomítkový box Z90) |
| **Konstrukce stěn, strop 2.NP & krov** | Nestandardní `380 / 240 / 160 / 120`, chybějící nosný strop nad 2.NP (jen vazba na dřevěnou/SDK příčku nad 5,2m rozponem) | **`240+140 ETICS`** obvod, **`240 / 175 / 140`** 1.NP, **`125 mm` SDK W112** 2.NP; **příhradové vazníky** (`25,4°`, pozednice `+6,12 m`, hřeben `+8,02 m`) |
| **Krb / komín & komora `2.06`** | Kolizní krb a komín v rohu u okapu, úzký regál `0,94 m` | Krb i komín odstraněny; v `2.06` plný severní regál `1,50 m` |
| **Otvory & přehřívání ZJZ** | `17` prosklených otvorů bez definovaného stínění, 4m HS portál, ZJZ `18,02 m²` | **`15` prosklených otvorů (`31,33 m²`)**, **3,2m PSK portál**, ZJZ **`14,26 m²` (`-20,9 %`)** + venkovní žaluzie **Z90 (`shaded: true`)** na všech obytných oknech |
| **Ergonomie 1.NP & schodiště** | Schodiště `18× 171/260 mm` (`2h+b = 601 mm`, 94–95 cm), zádveří `4,3 m²`, koupelna `3,6 m²` (dveře dovnitř, okno u sprchy), `D2` u ostrůvku, TČ za ložnicí | Schodiště **`18× 171/275 mm`** (`2h+b = 616 mm`, **98 cm** ramena); zádveří **`4,8 m²`**; bezbariérová koupelna **`4,7 m²`** (`120×90` walk-in, dveře ven); ostrůvek **`155 cm`** (uličky `106,5 cm` / `92 cm`); TČ oddáleno `82,5 cm` od `1.04` |
| **Terasa `1.08` & vedlejší stavba** | Terasa thermodřevo `24,0 m²`; dílna `42 m²` + úzké stání `5 m`, sedlová střecha, kolize `canopy`/`eastWalkway` s domem; KZP `205,0 m² (19,1 %)` | Terasa betonová dlažba **`15,8 m²`** (`3,5 × 4,5 m`); dílna **`26 m²` (`4 × 6,5 m`)** + plné dvojstání **`6,0 m` (`39 m²`)**, nízká pultová střecha; nulové kolize; KZP **`184,3 m² (17,1 %)`** |
| **BOM & orientační rozpočet (2026)** | Položky za `0 Kč` (prosklené dveře), nadhodnocení podlah/potěru `+23 m²` (`170,2 m²`), chybějící ETICS/žaluzie/zemní práce/TDI | **`202` položek, `0` položek za `0 Kč`**, potěr i krytiny srovnány na **`147,1 m²`**, kompletní výměry vč. ETICS, žaluzií, vazníků, SDK, zemních prací i DSP/TDI (**5 050 329 Kč** bez DPH / **5 656 368 Kč** s 12 % DPH svépomocí; **8 914 537 Kč** bez DPH / **9 984 281 Kč** s 12 % DPH na klíč) |

---

## Dodatečná optimalizace 2.NP: Narovnání koupelny 2.04 na čistý obdélník (Varianta A)
**Stav:** ✅ Hotovo

**Popis a přínosy úpravy:**
1. **Odstranění hluchého koutu v hale 2.01:**
   - Původní zbytečná vstupní nika chodby v rozmezí `Z = -3,18` až `Z = -4,40` byla plně začleněna do koupelny `2.04`.
   - Schodišťová hala `2.01` se zmenšila z `9,9 m²` na přirozených, čistých **`8,5 m²`**, přičemž všechny vstupy do místností zůstávají přímo přístupné.
2. **Čistý obdélníkový půdorys koupelny 2.04:**
   - Koupelna `2.04` má nyní rozměry **`3,84 × 2,38 m`** (užitná plocha **`8,9 m²`** net, resp. **`9,1 m²`** hrubá bez odečtu šachty).
   - Zrušena lomená příčka `part-2np-bath-niche` na `Z = -4,40`.
   - Jižní stěna koupelny probíhá souvisle v ose `Z_BATH_WC = -3,18` od `X = -0,28` až po východní obvodovou stěnu `X = 3,62`.
3. **Ergonomie vstupů a eliminace kolizí:**
   - Dveře do koupelny `2.04` (šířka 80 cm) jsou umístěny na čele chodby na jižní stěně (`Z = -3,18`) a otevírají se dovnitř na sever podél západní SDK příčky.
   - Dveře samostatného WC `2.05` jsou na východní stěně haly zavěšeny na jižním ostění (`hinge: "end", dir: "west"`), takže se otevírají směrem ke koutu chodby a **zcela eliminují jakoukoliv kolizi či zastiňování vstupu do koupelny**.
4. **Prémiové zařizovací předměty v koupelně 2.04:**
   - **Walk-in sprchový kout:** velkorysých `120 × 90 cm` v SZ rohu s volným nástupem `1,49 m`.
   - **Relaxační vana:** `170 × 75 cm` v SV rohu pod východním oknem.
   - **Dvojumyvadlo se skříňkou:** `140 cm` na jižní stěně s volným prostorem `1,15 m`.
   - **Instalační šachta:** `46 × 44 cm` na severní stěně se svislým shozem prádla přímo do technické místnosti / prádelny `1.02`.
5. **Výsledné bilance a kontroly:**
   - Celková užitná plocha domu zůstává přesně **`147,1 m²`** (2.NP = `70,4 m²`, resp. `70,6 m²`).
   - `npm run analyze`: **0 chyb (error) | 0 varování (warning)**.
   - `npm test`: **43/43 testů prošlo (100 % pass)**.
   - `npm run lint` i `npm run build`: **bez chyb**.

---

## Bod 6: Zapracování FVE, hospodaření s dešťovou vodou a dveřních omezovačů
**Stav:** ✅ Hotovo

**Popis a přínosy úpravy:**
1. **Fotovoltaická elektrárna (FVE 7,2 kWp) na střeše:**
   - 16 ks celočerných monokrystalických panelů (450 Wp) osazených na západní střešní rovině (JZ expozice po započtení pootočení parcely +26,5°).
   - 3D model i BIM prvky (`IfcEnergyConversionDevice`) s detailními parametry výkonu, střídače a baterie.
   - Hybridní třífázový střídač 10 kW a bateriové úložiště LiFePO4 10,6 kWh umístěny v technické místnosti `1.02`.
   - Položka zapracována do výkazu výměr BOM (oddíl 13 Elektroinstalace) i ceníku.
2. **Podzemní akumulační nádrž na dešťovou vodu (7,0 m³):**
   - Samonosná monolitická nádrž osazena na pozemku v severní zahradě (`x = 1,5 m`, `z = -7,5 m`) v těsné blízkosti svodů střechy domu i dílny.
   - Vybavena automatickou domácí vodárnou / ponorným tlakovým čerpadlem s plovoucím sáním a jemným filtrem.
   - Napojení na splachování toalety v 1.NP (`1.03`) a fasádní nezámrzný ventil pro zálivku zahrady.
   - Bezpečnostní přepad sveden do vsakovacích boxů; objekt zakreslen do 3D modelu i situace v DXF (`A-SITE-BUILD`).
   - Položka zapracována do BOM (oddíl 17 Venkovní úpravy a oddíl 11 Zdravotechnika) i ceníku.
3. **Trvalý záznam požadavku na dveřní omezovače (95–100°):**
   - Zaznamenáno do architektonických směrnic projektu `AGENTS.md` (Pravidlo 4), specifikace kování `src/budget/specifications.js` i technického listu `src/exports/ProjectSchedules.js`.
   - Všech 7 kolizních dveří (vchodové `1.01`, koupelna `1.03`, zádveří `1.05`, obývák `1.07`, pokoj `2.03`, dětské pokoje `2.07` a `2.08`) má v kování specifikovány skryté integrované omezovače úhlu otevření (95–100°) v horním pantu či zárubni.
   - Zabraňuje nárazu křídla do nábytku, sanity či sousedních dveří při průvanu nebo prudkém otevření.

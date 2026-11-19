import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { dreamHouseV1 } from "../src/designs/dreamHouseV1.js";
import { siteConfig } from "../src/designs/siteConfig.js";
import { auxiliaryBuildingConfig } from "../src/designs/auxiliaryBuilding.js";
import { computeBillOfMaterials } from "../src/budget/BillOfMaterials.js";
import {
  computeHouseVolume,
  estimateBomPrices,
} from "../src/budget/priceEstimator.js";
import { computeSiteSetbacks } from "../src/builders/SiteBuilder.js";
import { computeRoomSchedule } from "../src/builders/RoomBuilder.js";
import { analyzeDesignLayout } from "../src/analysis/LayoutAnalyzer.js";
import {
  DXF_LAYERS,
  DxfWriter,
  encodeDxfText,
} from "../src/exports/dxfWriter.js";
import { generateFloorPlanDxf } from "../src/exports/DxfGenerator.js";
import {
  buildAreaAndTechnicalSummary,
  buildOpeningSchedule,
} from "../src/exports/ProjectSchedules.js";
import {
  generateOpeningsCsv,
  generateTechnicalReportHtml,
  generateTechnicalSummaryCsv,
} from "../src/exports/ScheduleExporters.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "output");

function parseDxfPairs(dxfText) {
  assert.ok(dxfText.includes("\r\n"), "DXF musí používat CRLF konce řádků");
  assert.ok(!dxfText.includes("NaN"), "DXF nesmí obsahovat NaN");
  assert.ok(!dxfText.includes("Infinity"), "DXF nesmí obsahovat Infinity");
  assert.ok(!dxfText.includes("undefined"), "DXF nesmí obsahovat undefined");

  for (let i = 0; i < dxfText.length; i++) {
    assert.ok(
      dxfText.charCodeAt(i) < 128,
      `DXF musí být čistě 7bit ASCII (nalezen znak '${dxfText[i]}' s kódem ${dxfText.charCodeAt(i)})`,
    );
  }

  const lines = dxfText.slice(0, -2).split("\r\n");
  assert.equal(
    lines.length % 2,
    0,
    "DXF musí mít sudý počet řádků (páry kód/hodnota)",
  );

  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    const codeStr = lines[i].trim();
    assert.match(
      codeStr,
      /^\d+$/,
      `Neplatný skupinový kód DXF na řádku ${i + 1}: "${lines[i]}"`,
    );
    pairs.push([Number(codeStr), lines[i + 1]]);
  }
  return pairs;
}

function getHeaderVar(pairs, varName) {
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === varName) {
      const out = {};
      for (
        let j = i + 1;
        j < pairs.length && pairs[j][0] !== 9 && pairs[j][0] !== 0;
        j++
      ) {
        out[pairs[j][0]] = pairs[j][1];
      }
      return out;
    }
  }
  return null;
}

function extractEntities(pairs) {
  let inEntities = false;
  const entities = [];
  let current = null;

  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (
      code === 2 &&
      val === "ENTITIES" &&
      i > 0 &&
      pairs[i - 1][1] === "SECTION"
    ) {
      inEntities = true;
      continue;
    }
    if (!inEntities) continue;
    if (code === 0 && val === "ENDSEC") {
      if (current) entities.push(current);
      break;
    }
    if (code === 0) {
      if (current) entities.push(current);
      current = { type: val, props: {} };
    } else if (current) {
      if (!current.props[code]) current.props[code] = [];
      current.props[code].push(val);
    }
  }
  return entities;
}

describe("Exporty pro projektanty a architekty (DXF, Výpisy, Bilance TZ)", () => {
  before(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  describe("1. AutoCAD R12 DXF Writer & Generátor výkresů", () => {
    it("správně kóduje českou diakritiku do ASCII \\U+XXXX a validuje strukturu R12", () => {
      const encoded = encodeDxfText("Přízemí 1.NP · 8×12 m² ±0,000 Ø200");
      assert.ok(
        encoded.includes("\\U+0159"),
        "ř musí být zakódováno jako \\U+0159",
      );
      assert.ok(
        encoded.includes("\\U+00B2"),
        "² musí být zakódováno jako \\U+00B2",
      );
      assert.ok(
        encoded.includes("\\U+00D7"),
        "× musí být zakódováno jako \\U+00D7",
      );
      assert.ok(
        encoded.includes("\\U+00B1"),
        "± musí být zakódováno jako \\U+00B1",
      );
      assert.ok(
        encoded.includes("\\U+00D8"),
        "Ø musí být zakódováno jako \\U+00D8",
      );

      const w = new DxfWriter();
      w.addLine("A-WALL-LOAD", 0, 0, 8000, 0);
      w.addText("A-TITLE", 1000, 1000, "Český text ²", {
        hAlign: 1,
        vAlign: 2,
      });
      const text = w.toString();
      const pairs = parseDxfPairs(text);

      assert.equal(getHeaderVar(pairs, "$ACADVER")?.[1], "AC1009");
      assert.equal(pairs[pairs.length - 1][1], "EOF");
    });

    it("vygeneruje platný 1:1 mm DXF pro 1.NP se všemi standardními CAD hladinami a oblouky dveří", () => {
      const dxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "1np",
        siteConfig,
        housePos: siteConfig.defaultHousePos,
      });
      const pairs = parseDxfPairs(dxf);

      // Vyváženost SECTION/ENDSEC, TABLE/ENDTAB, POLYLINE/SEQEND
      const countPair = (c, v) =>
        pairs.filter(([code, val]) => code === c && val === v).length;
      assert.equal(countPair(2, "HEADER"), 1);
      assert.equal(countPair(2, "TABLES"), 1);
      assert.equal(countPair(2, "BLOCKS"), 1);
      assert.equal(countPair(2, "ENTITIES"), 1);
      assert.equal(countPair(0, "SECTION"), 4);
      assert.equal(countPair(0, "ENDSEC"), 4);
      assert.equal(countPair(0, "TABLE"), 3);
      assert.equal(countPair(0, "ENDTAB"), 3);
      assert.equal(
        countPair(0, "POLYLINE"),
        countPair(0, "SEQEND"),
        "Každá POLYLINE musí končit SEQEND",
      );
      assert.equal(
        countPair(0, "LWPOLYLINE"),
        0,
        "R12 nesmí obsahovat LWPOLYLINE",
      );

      // Ověření přítomnosti všech CAD hladin v tabulce LAYER
      const definedLayers = new Set(
        pairs
          .map((p, idx) =>
            p[0] === 0 && p[1] === "LAYER" && pairs[idx + 1]?.[0] === 2
              ? pairs[idx + 1][1]
              : null,
          )
          .filter(Boolean),
      );
      for (const lay of DXF_LAYERS) {
        assert.ok(
          definedLayers.has(lay.name),
          `Chybí definice hladiny ${lay.name}`,
        );
      }

      // Měřítko 1:1 v mm (dům 8×12 m + terasa + kóty)
      const extMin = getHeaderVar(pairs, "$EXTMIN");
      const extMax = getHeaderVar(pairs, "$EXTMAX");
      const spanX = Number(extMax[10]) - Number(extMin[10]);
      const spanY = Number(extMax[20]) - Number(extMin[20]);
      assert.ok(spanX >= 8000, `Šířka v DXF musí být >= 8000 mm, je ${spanX}`);
      assert.ok(
        spanY >= 12000,
        `Délka v DXF musí být >= 12000 mm, je ${spanY}`,
      );

      // Ověření entit a ~90° oblouků dveří
      const entities = extractEntities(pairs);
      const usedLayers = new Set(
        entities.map((e) => e.props[8]?.[0]).filter(Boolean),
      );
      for (const expectedLayer of [
        "A-WALL-LOAD",
        "A-WALL-PART",
        "A-WALL-HATCH",
        "A-WIND",
        "A-DOOR",
        "A-DOOR-SWING",
        "A-STAIR",
        "A-FURN",
        "A-DIM",
        "A-SEC-CUT",
        "A-ANNO-ROOM",
        "A-ANNO-OPEN",
        "A-TITLE",
      ]) {
        assert.ok(
          usedLayers.has(expectedLayer),
          `V entitách musí být použita hladina ${expectedLayer}`,
        );
      }

      const arcs = entities.filter((e) => e.type === "ARC");
      assert.ok(arcs.length >= 6, "Musí obsahovat oblouky otevírání dveří");
      for (const arc of arcs) {
        const s = Number(arc.props[50][0]);
        const e = Number(arc.props[51][0]);
        const sweep = (((e - s) % 360) + 360) % 360;
        assert.ok(
          Math.abs(sweep - 90) < 0.1,
          `Oblouk dveří musí mít CCW úhel ~90°, naměřeno ${sweep}° (start=${s}, end=${e})`,
        );
      }

      fs.writeFileSync(path.join(OUTPUT_DIR, "pudorys-1np.dxf"), dxf, "ascii");
    });

    it("respektuje přepínače vrstev v DXF", () => {
      const minimalDxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "1np",
        showDimensions: false,
        showInteriorDims: false,
        showFurniture: false,
        showHatches: false,
        showOpeningTags: false,
      });
      const pairs = parseDxfPairs(minimalDxf);
      const entities = extractEntities(pairs);
      const usedLayers = new Set(entities.map((e) => e.props[8]?.[0]));

      assert.ok(!usedLayers.has("A-DIM"), "Kóty musí být skryty");
      assert.ok(!usedLayers.has("A-FURN"), "Nábytek musí být skryt");
      assert.ok(!usedLayers.has("A-WALL-HATCH"), "Šrafy musí být skryty");
      assert.ok(
        !usedLayers.has("A-ANNO-OPEN"),
        "Popisy otvorů musí být skryty",
      );
    });

    it("vygeneruje situační výkres (site) včetně vlastního posunu/natočení domu, odstupů a severky", () => {
      const customHousePos = { x: 2.5, z: -0.5, rotY: 15 };
      const siteDxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "site",
        siteConfig,
        auxConfig: auxiliaryBuildingConfig,
        housePos: customHousePos,
      });
      const pairs = parseDxfPairs(siteDxf);
      const extMin = getHeaderVar(pairs, "$EXTMIN");
      const extMax = getHeaderVar(pairs, "$EXTMAX");
      assert.ok(
        Number(extMax[10]) - Number(extMin[10]) >= 27000,
        "Situace musí mít šířku >= 27000 mm",
      );
      assert.ok(
        Number(extMax[20]) - Number(extMin[20]) >= 40000,
        "Situace musí mít délku >= 40000 mm",
      );

      const entities = extractEntities(pairs);
      const usedLayers = new Set(entities.map((e) => e.props[8]?.[0]));
      assert.ok(usedLayers.has("A-SITE-BOUNDARY"));
      assert.ok(usedLayers.has("A-SITE-BUILD"));
      assert.ok(usedLayers.has("A-SITE-DIM"));

      assert.ok(
        siteDxf.includes("SKUTE\\U+010CN\\U+00DD SEVER (+26,5"),
        "Musí obsahovat popis skutečného severu",
      );
      const sb = computeSiteSetbacks(
        siteConfig,
        customHousePos,
        auxiliaryBuildingConfig,
        dreamHouseV1.footprint,
        dreamHouseV1,
      );
      assert.ok(
        siteDxf.includes(String(Math.round(sb.streetRight * 1000))),
        "Musí obsahovat aktuální odstup od ulice v mm",
      );

      const defaultSiteDxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "site",
        siteConfig,
        auxConfig: auxiliaryBuildingConfig,
        housePos: siteConfig.defaultHousePos,
      });
      fs.writeFileSync(
        path.join(OUTPUT_DIR, "situace.dxf"),
        defaultSiteDxf,
        "ascii",
      );
    });

    it("vygeneruje sdružený DXF (both) a kompletní DXF (1.NP + 2.NP + Situace)", () => {
      const bothDxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "both",
        siteConfig,
        housePos: siteConfig.defaultHousePos,
      });
      parseDxfPairs(bothDxf);
      assert.ok(bothDxf.includes("P\\U+016EDORYS 1.NP"));
      assert.ok(bothDxf.includes("P\\U+016EDORYS 2.NP"));
      fs.writeFileSync(
        path.join(OUTPUT_DIR, "pudorys-both.dxf"),
        bothDxf,
        "ascii",
      );

      const completeDxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "complete",
        siteConfig,
        auxConfig: auxiliaryBuildingConfig,
        housePos: siteConfig.defaultHousePos,
      });
      const pairs = parseDxfPairs(completeDxf);
      const extMax = getHeaderVar(pairs, "$EXTMAX");
      assert.ok(
        Number(extMax[10]) > 55000,
        "Kompletní DXF musí obsahovat situaci na pozici X > 55000 mm",
      );
      assert.ok(completeDxf.includes("SITUA\\U+010CN\\U+00CD V\\U+00DDKRES"));
      assert.ok(completeDxf.includes("POHLED V\\U+00DDCHODN\\U+00CD"));
      assert.ok(completeDxf.includes("POHLED JI\\U+017DN\\U+00CD"));
      assert.ok(completeDxf.includes("POHLED Z\\U+00C1PADN\\U+00CD"));
      assert.ok(completeDxf.includes("POHLED SEVERN\\U+00CD"));
      assert.ok(completeDxf.includes("\\U+0158EZ A-A'"));
      assert.ok(completeDxf.includes("\\U+0158EZ B-B'"));
      fs.writeFileSync(
        path.join(OUTPUT_DIR, "komplet.dxf"),
        completeDxf,
        "ascii",
      );
    });

    it("vygeneruje 1:1 mm DXF všech 4 pohledů (elevations)", () => {
      const elevDxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "elevations",
        siteConfig,
        housePos: siteConfig.defaultHousePos,
      });
      const pairs = parseDxfPairs(elevDxf);
      const extMin = getHeaderVar(pairs, "$EXTMIN");
      const extMax = getHeaderVar(pairs, "$EXTMAX");
      const spanX = Number(extMax[10]) - Number(extMin[10]);
      const spanY = Number(extMax[20]) - Number(extMin[20]);
      assert.ok(
        spanX >= 25000,
        `Šířka DXF pohledů musí být >= 25000 mm, je ${spanX}`,
      );
      assert.ok(
        spanY >= 20000,
        `Výška DXF pohledů musí být >= 20000 mm, je ${spanY}`,
      );

      assert.ok(elevDxf.includes("POHLED V\\U+00DDCHODN\\U+00CD"));
      assert.ok(elevDxf.includes("POHLED JI\\U+017DN\\U+00CD"));
      assert.ok(elevDxf.includes("POHLED Z\\U+00C1PADN\\U+00CD"));
      assert.ok(elevDxf.includes("POHLED SEVERN\\U+00CD"));

      const entities = extractEntities(pairs);
      const usedLayers = new Set(
        entities.map((e) => e.props[8]?.[0]).filter(Boolean),
      );
      assert.ok(
        usedLayers.has("A-ELEV-ROOF"),
        "Musí obsahovat hladinu A-ELEV-ROOF",
      );
      assert.ok(
        usedLayers.has("A-ELEV-TERRAIN"),
        "Musí obsahovat hladinu A-ELEV-TERRAIN",
      );
      assert.ok(
        usedLayers.has("A-WALL-LOAD"),
        "Musí obsahovat hladinu A-WALL-LOAD",
      );
      assert.ok(usedLayers.has("A-WIND"), "Musí obsahovat hladinu A-WIND");
      assert.ok(usedLayers.has("A-DOOR"), "Musí obsahovat hladinu A-DOOR");
      assert.ok(usedLayers.has("A-DIM"), "Musí obsahovat hladinu A-DIM");

      fs.writeFileSync(path.join(OUTPUT_DIR, "pohledy.dxf"), elevDxf, "ascii");
    });

    it("vygeneruje 1:1 mm DXF svislých řezů A-A' a B-B' (sections)", () => {
      const secDxf = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "sections",
        siteConfig,
        housePos: siteConfig.defaultHousePos,
      });
      const pairs = parseDxfPairs(secDxf);
      const extMin = getHeaderVar(pairs, "$EXTMIN");
      const extMax = getHeaderVar(pairs, "$EXTMAX");
      const spanX = Number(extMax[10]) - Number(extMin[10]);
      const spanY = Number(extMax[20]) - Number(extMin[20]);
      assert.ok(
        spanX >= 22000,
        `Šířka DXF řezů musí být >= 22000 mm, je ${spanX}`,
      );
      assert.ok(
        spanY >= 9000,
        `Výška DXF řezů musí být >= 9000 mm, je ${spanY}`,
      );

      assert.ok(secDxf.includes("\\U+0158EZ A-A'"));
      assert.ok(secDxf.includes("\\U+0158EZ B-B'"));

      const entities = extractEntities(pairs);
      const usedLayers = new Set(
        entities.map((e) => e.props[8]?.[0]).filter(Boolean),
      );
      for (const expectedLayer of [
        "A-SEC-STRUCT",
        "A-SEC-INSUL",
        "A-WALL-LOAD",
        "A-WALL-PART",
        "A-STAIR",
        "A-ELEV-ROOF",
        "A-ELEV-TERRAIN",
        "A-DIM",
        "A-TITLE",
      ]) {
        assert.ok(
          usedLayers.has(expectedLayer),
          `V entitách řezů musí být hladina ${expectedLayer}`,
        );
      }

      fs.writeFileSync(path.join(OUTPUT_DIR, "rezy.dxf"), secDxf, "ascii");
    });
  });

  describe("2. Výpis výplní otvorů (ProjectSchedules)", () => {
    it("počty oken a dveří souhlasí s BOM a všechny otvory mají značky i sousední místnosti", () => {
      const bom = computeBillOfMaterials({
        design: dreamHouseV1,
        auxConfig: auxiliaryBuildingConfig,
        siteConfig,
      });
      const schedule = buildOpeningSchedule(dreamHouseV1, {
        siteConfig,
        housePos: siteConfig.defaultHousePos,
      });

      assert.equal(schedule.summary.totalGlazingCount, bom.summary.windowCount);
      assert.equal(schedule.summary.totalDoorCount, bom.summary.doorCount);
      assert.ok(
        Math.abs(schedule.summary.windowAreaSqm - bom.summary.windowArea) <
          0.05,
      );

      for (const item of schedule.items) {
        assert.match(
          item.mark,
          /^(O|DV|D|P)\d+$/,
          `Neplatná značka otvoru: ${item.mark}`,
        );
        assert.ok(
          item.roomsText && item.roomsText !== "—",
          `Otvor ${item.mark} (${item.name}) musí mít určenou sousední místnost`,
        );
      }

      // Ověření ČSN otevírání Levé (L) / Pravé (P) na známých dveřích
      const mainDoor = schedule.items.find(
        (i) => i.name === "Hlavní vchodové dveře",
      );
      assert.ok(mainDoor);
      assert.equal(mainDoor.handing, "Levé (L)");

      const techExtDoor = schedule.items.find(
        (i) => i.name === "Venkovní dveře technická m.",
      );
      assert.ok(techExtDoor);
      assert.equal(techExtDoor.handing, "Pravé (P)");

      // Značky ve výpisu musí souhlasit s tagy v DXF
      const dxf1 = generateFloorPlanDxf(dreamHouseV1, {
        sheet: "1np",
        siteConfig,
      });
      assert.ok(
        dxf1.includes(
          `${mainDoor.mark} ${mainDoor.widthMm}\\U+00D7${mainDoor.heightMm}`,
        ),
      );

      // Součet ploch prosklení podle světových stran = celková plocha prosklení
      const orientAreaSum = schedule.glazingByOrientation.reduce(
        (s, o) => s + o.areaSqm,
        0,
      );
      assert.ok(
        Math.abs(orientAreaSum - schedule.summary.windowAreaSqm) < 0.05,
        `Součet ploch po stranách (${orientAreaSum}) musí odpovídat celku (${schedule.summary.windowAreaSqm})`,
      );
      for (const o of schedule.glazingByOrientation) {
        assert.ok(o.trueAzimuthDeg >= 0 && o.trueAzimuthDeg < 360);
      }
    });
  });

  describe("3. Bilance ploch a technický list + Exporty CSV / HTML", () => {
    it("spočítá urbanistickou bilanci, odstupy, objemy, místnosti a skladby v souladu s modelem", () => {
      const summary = buildAreaAndTechnicalSummary({
        design: dreamHouseV1,
        siteConfig,
        auxConfig: auxiliaryBuildingConfig,
        housePos: siteConfig.defaultHousePos,
      });

      assert.equal(summary.site.plotAreaSqm, 1076);
      assert.equal(summary.site.totalBuiltUpSqm, 184.3);
      assert.equal(summary.site.totalRatioPct, 17.1);
      assert.equal(summary.setbacks.streetRight, 5.0);
      assert.equal(summary.setbacks.houseWorkshopGap, 4.0);
      assert.equal(summary.setbacks.neighborWest, 14.0);

      const expectedVol = computeHouseVolume(dreamHouseV1);
      assert.equal(summary.geometry.totalVolumeM3, expectedVol.totalVolume);
      assert.ok(summary.roomTotals.totalInteriorSqm > 140);
      assert.ok(summary.assemblies.length >= 8);
      assert.equal(summary.layoutAudit.errors, 0);
    });

    it("vygeneruje validní CZ Excel CSV (výpis otvorů + bilance TZ) a tiskový A4 HTML list", () => {
      const openingSchedule = buildOpeningSchedule(dreamHouseV1, {
        siteConfig,
        housePos: siteConfig.defaultHousePos,
      });
      const techSummary = buildAreaAndTechnicalSummary({
        design: dreamHouseV1,
        siteConfig,
        auxConfig: auxiliaryBuildingConfig,
        housePos: siteConfig.defaultHousePos,
      });

      const openingsCsv = generateOpeningsCsv(openingSchedule, dreamHouseV1);
      assert.ok(openingsCsv.startsWith("\uFEFF"), "CSV musí mít UTF-8 BOM");
      assert.ok(openingsCsv.includes(";"), "CSV musí používat středník");
      assert.ok(
        openingsCsv.includes("=SUM(G"),
        "CSV musí obsahovat Excel vzorec =SUM(...)",
      );
      assert.ok(openingsCsv.includes("VÝPIS VÝPLNÍ OTVORŮ"));
      assert.ok(openingsCsv.includes("O1"));
      assert.ok(openingsCsv.includes("DV1"));

      const techCsv = generateTechnicalSummaryCsv(techSummary);
      assert.ok(techCsv.startsWith("\uFEFF"), "Bilance CSV musí mít UTF-8 BOM");
      assert.ok(
        techCsv.includes("=SUM(D"),
        "Bilance CSV musí obsahovat Excel vzorce pro součty ploch",
      );
      assert.ok(techCsv.includes("URBANISTICKÁ BILANCE POZEMKU"));
      assert.ok(techCsv.includes("184,3"));
      assert.ok(techCsv.includes("17,1"));

      const html = generateTechnicalReportHtml(techSummary, openingSchedule);
      assert.ok(html.includes("<!DOCTYPE html>"));
      assert.ok(html.includes("@media print"));
      assert.ok(html.includes("Tabulka místností — 1.NP"));
      assert.ok(html.includes("Výpis výplní otvorů"));
      assert.ok(html.includes("DV1"));

      fs.writeFileSync(
        path.join(OUTPUT_DIR, "vypis-otvoru.csv"),
        openingsCsv,
        "utf8",
      );
      fs.writeFileSync(
        path.join(OUTPUT_DIR, "bilance-tz.csv"),
        techCsv,
        "utf8",
      );
      fs.writeFileSync(
        path.join(OUTPUT_DIR, "technicky-list.html"),
        html,
        "utf8",
      );
    });
  });

  describe("4. Regresní testy nápravy a optimalizace návrhu", () => {
    it("žádná položka výkazu výměr nemá nulovou jednotkovou cenu ani v režimu svépomocí ani na klíč", () => {
      const bom = computeBillOfMaterials({
        design: dreamHouseV1,
        auxConfig: auxiliaryBuildingConfig,
        siteConfig,
      });
      const pricing = estimateBomPrices(bom, dreamHouseV1);
      const unpriced = pricing.sections
        .flatMap((s) => s.items)
        .filter((it) => it.unitPriceSelf <= 0 || it.unitPriceTurnkey <= 0);
      assert.equal(
        unpriced.length,
        0,
        `Položky s nulovou cenou: ${unpriced.map((u) => u.name).join(", ")}`,
      );
    });

    it("plocha podlah a potěru v BOM odpovídá reálné užitné ploše místností bez nadhodnocení", () => {
      const bom = computeBillOfMaterials({
        design: dreamHouseV1,
        auxConfig: auxiliaryBuildingConfig,
        siteConfig,
      });
      assert.ok(
        Math.abs(bom.summary.floorArea - bom.summary.interiorArea) < 0.5,
        `Plocha potěru (${bom.summary.floorArea}) musí odpovídat vnitřní ploše (${bom.summary.interiorArea})`,
      );
    });

    it("mokrá jádra 2.NP (2.04 koupelna a 2.05 WC) jsou sjednocena v SV kvadrantu nad 1.02 a 1.03", () => {
      const sched2 = computeRoomSchedule(dreamHouseV1.floor2);
      const r204 = sched2.rooms.find((r) => r.id === "2.04");
      const r205 = sched2.rooms.find((r) => r.id === "2.05");
      assert.ok(r204 && r205);
      assert.ok(
        r204.bounds.maxZ <= -1.95,
        `Koupelna 2.04 musí ležet na severu (maxZ=${r204.bounds.maxZ})`,
      );
      assert.ok(
        r205.bounds.maxZ <= -1.95,
        `Samostatné WC 2.05 musí ležet na severu (maxZ=${r205.bounds.maxZ})`,
      );
      assert.ok(
        r204.bounds.maxX > 2.5 && r205.bounds.maxX > 2.5,
        "Mokré jádro 2.NP musí ležet ve východní/SV části",
      );
    });

    it("konstrukční výšky 2.NP zaručují světlost ≥ 2,60 m, nadpraží ≥ 55 cm a prosklení ZJZ < 15 m² se stíněním", () => {
      const summary = buildAreaAndTechnicalSummary({
        design: dreamHouseV1,
        siteConfig,
        auxConfig: auxiliaryBuildingConfig,
        housePos: siteConfig.defaultHousePos,
      });
      assert.ok(summary.geometry.f1ClearHeightM >= 2.6);
      assert.ok(summary.geometry.f2ClearHeightM >= 2.6);

      for (const wall of dreamHouseV1.floor2.walls) {
        for (const op of wall.openings || []) {
          if (op.type !== "window") continue;
          const lintel = wall.height - (op.sill + op.height);
          assert.ok(
            lintel >= 0.55 - 1e-6,
            `Okno ${op.name} má nadpraží jen ${lintel.toFixed(3)} m (< 0,55 m)`,
          );
        }
      }

      const openingSchedule = buildOpeningSchedule(dreamHouseV1, {
        siteConfig,
        housePos: siteConfig.defaultHousePos,
      });
      assert.equal(openingSchedule.summary.totalGlazingCount, 15);
      const westOrient = openingSchedule.glazingByOrientation.find(
        (o) => o.side === "Z",
      );
      assert.ok(
        westOrient && westOrient.areaSqm < 15.0,
        `ZJZ prosklení ${westOrient?.areaSqm} m² musí být < 15 m²`,
      );

      const westWalls = [dreamHouseV1.floor1, dreamHouseV1.floor2]
        .flatMap((fl) => fl.walls)
        .filter((w) => w.id === "ext-1np-west" || w.id === "ext-2np-west");
      for (const wall of westWalls) {
        for (const op of wall.openings || []) {
          if (op.type !== "window" || op.fixed) continue;
          assert.equal(
            op.shaded,
            true,
            `Západní okno ${op.name} musí mít venkovní stínění (shaded: true)`,
          );
        }
      }

      const audit = analyzeDesignLayout(dreamHouseV1);
      assert.equal(audit.summary.errors, 0);
      assert.equal(audit.summary.warnings, 0);
    });

    it("vedlejší stavba má plné dvojstání ≥ 6 m a loubí s chodníkem nekolidují s půdorysem domu", () => {
      assert.ok(auxiliaryBuildingConfig.parkWidth >= 6.0);
      const [ax, , az] = auxiliaryBuildingConfig.position;
      const hx1 = 0.5;
      const hx2 = 8.5;
      const hz1 = -5.0;
      const hz2 = 7.0;

      const overlapsHouse = (bx1, bx2, bz1, bz2) =>
        bx1 < hx2 - 1e-4 &&
        bx2 > hx1 + 1e-4 &&
        bz1 < hz2 - 1e-4 &&
        bz2 > hz1 + 1e-4;

      const { canopy, eastWalkway } = auxiliaryBuildingConfig;
      assert.ok(canopy);
      const cx1 = ax + canopy.pos[0] - canopy.size[0] / 2;
      const cx2 = ax + canopy.pos[0] + canopy.size[0] / 2;
      const cz1 = az + canopy.pos[2] - canopy.size[2] / 2;
      const cz2 = az + canopy.pos[2] + canopy.size[2] / 2;
      assert.equal(
        overlapsHouse(cx1, cx2, cz1, cz2),
        false,
        "Kryté loubí nesmí zasahovat do půdorysu domu",
      );

      assert.ok(eastWalkway);
      const ex1 = ax + eastWalkway.pos[0] - eastWalkway.size[0] / 2;
      const ex2 = ax + eastWalkway.pos[0] + eastWalkway.size[0] / 2;
      const ez1 = az + eastWalkway.pos[2] - eastWalkway.size[2] / 2;
      const ez2 = az + eastWalkway.pos[2] + eastWalkway.size[2] / 2;
      assert.equal(
        overlapsHouse(ex1, ex2, ez1, ez2),
        false,
        "Východní chodník nesmí zasahovat do půdorysu domu",
      );
    });
  });
});

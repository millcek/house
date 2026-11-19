import { BOM_SPEC, BOM_ASSUMPTIONS } from "./specifications.js";
import { computeRoomSchedule } from "../builders/RoomBuilder.js";

/**
 * Výkaz výměr / soupis materiálu odvozený čistě z geometrie návrhu.
 *
 * computeBillOfMaterials({ design, auxConfig, siteConfig, housePos, spec })
 *   → { sections: [{ code, title, items: [...] }], summary, warnings, assumptions }
 *
 * Každá položka: { code, name, spec, unit, qty, waste, orderQty, calc, scope }
 *   scope: 'house' | 'aux' | 'exterior'
 */

// ------------------------------------------------------------------ helpers
const EPS = 1e-6;
const fmt = (v, d = 2) => Number(v).toFixed(d).replace(".", ",");
const mm = (m) => Math.round(m * 1000);
const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + fn(x), 0);
const wallLength = (w) => Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
const openingArea = (o) => o.width * o.height;
const rectArea = (h) => Math.abs((h.x2 - h.x1) * (h.z2 - h.z1));
const ceilTo = (v, step) => Math.ceil(v / step - EPS) * step;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const COUNT_UNITS = new Set(["ks", "kpl", "pár", "kg", "bm"]);

function orderQuantity(qty, waste, unit) {
  const raw = qty * (1 + (waste || 0));
  if (COUNT_UNITS.has(unit)) return Math.ceil(raw - EPS);
  if (unit === "m³") return Number(ceilTo(raw, 0.01).toFixed(2));
  return Number(ceilTo(raw, 0.1).toFixed(1));
}

class BomBuilder {
  constructor() {
    this.sections = new Map();
    this.warnings = [];
  }

  section(code, title) {
    if (!this.sections.has(code))
      this.sections.set(code, { code, title, items: [] });
    return code;
  }

  add(sectionCode, item) {
    const sec = this.sections.get(sectionCode);
    if (!sec) throw new Error(`Unknown BOM section ${sectionCode}`);
    if (!(item.qty > EPS)) return; // skip empty lines
    const unit = item.unit;
    const qty =
      COUNT_UNITS.has(unit) && unit !== "kg"
        ? Math.round(item.qty * 100) / 100
        : Number(item.qty.toFixed(unit === "m³" ? 3 : 2));
    sec.items.push({
      code: `${sectionCode}.${String(sec.items.length + 1).padStart(2, "0")}`,
      name: item.name,
      spec: item.spec || "",
      unit,
      qty,
      waste: item.waste || 0,
      orderQty: orderQuantity(qty, item.waste, unit),
      calc: item.calc || "",
      scope: item.scope || "house",
    });
  }

  warn(text) {
    this.warnings.push(text);
  }

  result() {
    return [...this.sections.values()].filter((s) => s.items.length > 0);
  }
}

/** Groups entries by key and accumulates numeric fields + calc fragments. */
function groupBy(entries, keyFn) {
  const map = new Map();
  for (const e of entries) {
    const k = keyFn(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return map;
}

function masonryRule(spec, thickness) {
  return (
    spec.masonry.find((r) => thickness + EPS >= r.minT) ||
    spec.masonry[spec.masonry.length - 1]
  );
}

// ------------------------------------------------------------ geometry
/** Collects walls & openings of both floors with derived dimensions. */
function collectWalls(design) {
  const W = design.footprint.width;
  const L = design.footprint.length;
  const floors = [
    { key: "1.NP", cfg: design.floor1 },
    { key: "2.NP", cfg: design.floor2 },
  ].filter((f) => f.cfg);

  const walls = [];
  const openings = [];

  for (const { key, cfg } of floors) {
    for (const w of cfg.walls || []) {
      const len = wallLength(w);
      const t = w.thickness ?? design.partThickness ?? 0.16;
      const isExt = w.material === "wall";
      const ops = (w.openings || []).map((o) => ({
        ...o,
        floor: key,
        wallId: w.id,
        wallName: w.name,
        wallT: t,
        wallConstruction: w.construction || "masonry",
        isExt,
        portalType: o.portalType || null,
        shaded: !!o.shaded,
        fixed: !!o.fixed,
        kind:
          o.type === "window"
            ? o.sliding
              ? "hs"
              : "window"
            : o.type === "door" && isExt
              ? "extDoor"
              : o.type === "door" || o.swing
                ? "intDoor"
                : "passage",
      }));
      openings.push(...ops);

      // inner face length of exterior walls (subtract corner overlap at outer boundary)
      let innerLen = len;
      if (isExt) {
        for (const [x, z] of [w.from, w.to]) {
          if (
            Math.abs(Math.abs(x) - W / 2) < 1e-3 ||
            Math.abs(Math.abs(z) - L / 2) < 1e-3
          ) {
            innerLen -= t;
          }
        }
      }

      const openA = sum(ops, openingArea);
      walls.push({
        floor: key,
        id: w.id,
        name: w.name,
        len,
        innerLen,
        h: w.height,
        t,
        isExt,
        structural: !!w.structural,
        construction: w.construction || "masonry",
        gross: len * w.height,
        openA,
        net: len * w.height - openA,
      });
    }
  }
  return { walls, openings, floors };
}

/** Gable roof geometry (same formulas as SlabAndRoofBuilder.buildGableRoof). */
export function gableRoofGeometry(roofDef) {
  const {
    width,
    length,
    height,
    ridgeAxis = "z",
    eaveOverhang = 0.45,
    gableOverhang = 0.35,
  } = roofDef;
  const span = ridgeAxis === "z" ? width : length;
  const run = ridgeAxis === "z" ? length : width;
  const halfSpan = span / 2;
  const slope = Math.atan2(height, halfSpan);
  const cos = Math.cos(slope);
  const slopeLen = (halfSpan + eaveOverhang) / cos; // hřeben → okap vč. přesahu
  const shellDepth = run + 2 * gableOverhang; // délka hřebene vč. přesahů štítů
  const area = 2 * slopeLen * shellDepth;
  return {
    span,
    run,
    halfSpan,
    height,
    pitchDeg: (slope * 180) / Math.PI,
    slopeLen,
    shellDepth,
    area,
    planArea: (span + 2 * eaveOverhang) * shellDepth,
    gableArea: span * height, // oba štíty dohromady (2 × trojúhelník)
    eaveSoffit: 2 * run * (eaveOverhang / cos),
    gableSoffit: 2 * 2 * slopeLen * gableOverhang,
  };
}

/** Low mono-pitch roof geometry sloping North (auxiliary building). */
export function monoRoofGeometry(roofDef) {
  const {
    width,
    length,
    height,
    eaveOverhang = 0.35,
    gableOverhang = 0.35,
  } = roofDef;
  const span = width + 2 * gableOverhang;
  const run = length;
  const slope = Math.atan2(height, run);
  const cos = Math.cos(slope);
  const slopeLen = (run + 2 * eaveOverhang) / cos;
  const area = span * slopeLen;
  return {
    type: "mono",
    span,
    run,
    height,
    pitchDeg: (slope * 180) / Math.PI,
    slopeLen,
    shellDepth: span,
    area,
    planArea: span * (run + 2 * eaveOverhang),
    gableArea: length * height,
  };
}

function finishArea(f) {
  return f.size[0] * f.size[1] - sum(f.holes || [], rectArea);
}

function pointInFinish(f, x, z) {
  const [cx, cz] = f.pos || [0, 0];
  const [w, d] = f.size;
  if (Math.abs(x - cx) > w / 2 + EPS || Math.abs(z - cz) > d / 2 + EPS)
    return false;
  return !(f.holes || []).some(
    (h) =>
      x >= Math.min(h.x1, h.x2) &&
      x <= Math.max(h.x1, h.x2) &&
      z >= Math.min(h.z1, h.z2) &&
      z <= Math.max(h.z1, h.z2),
  );
}

function roomPerimeter(room) {
  const b = room.bounds;
  if (!b || !Number.isFinite(b.minX)) {
    const side = Math.sqrt(room.areaSqm || 0);
    return 4 * side;
  }
  return 2 * (b.maxX - b.minX + (b.maxZ - b.minZ));
}

const WET_FIXTURES = [
  "wc",
  "sprcha",
  "vana",
  "pracka",
  "umyvatko",
  "umyvadlo",
  "dvojumyvadlo",
  "vylevka",
];
const NON_HABITABLE = /chodba|hala|zádveří|vstup|technick|schod|šatna|terasa/i;

// ---------------------------------------------------------------- main
export function computeBillOfMaterials({
  design,
  auxConfig = null,
  siteConfig = null,
  housePos = null,
  spec = BOM_SPEC,
} = {}) {
  const bom = new BomBuilder();
  const S = {
    earth: bom.section("01", "Zemní práce"),
    found: bom.section("02", "Základy a spodní stavba"),
    walls: bom.section("03", "Svislé konstrukce"),
    horiz: bom.section("04", "Vodorovné konstrukce a schodiště"),
    roof: bom.section("05", "Střecha – tesařské konstrukce a krytina"),
    tin: bom.section("06", "Klempířské konstrukce"),
    openings: bom.section("07", "Výplně otvorů – okna a dveře"),
    floors: bom.section("08", "Podlahy"),
    surfaces: bom.section("09", "Úpravy povrchů – omítky, obklady, malby"),
    ceiling: bom.section("10", "Podhledy a tepelná izolace stropu"),
    zti: bom.section("11", "Zdravotechnika"),
    heat: bom.section("12", "Vytápění a větrání"),
    elec: bom.section("13", "Elektroinstalace a hromosvod"),
    metal: bom.section("14", "Zámečnické a doplňkové konstrukce"),
    terrace: bom.section("15", "Terasa a pergola"),
    aux: bom.section("16", "Vedlejší stavba – dílna a kryté stání"),
    site: bom.section("17", "Venkovní úpravy a přípojky"),
    eng: bom.section("18", "Projektová dokumentace, inženýring a technický dozor"),
  };

  const W = design.footprint.width;
  const L = design.footprint.length;
  const T = design.wallThickness ?? 0.38;
  const outerPerimeter = 2 * (W + L);
  const axisPerimeter = 2 * (W - T + (L - T));
  const footprintArea = W * L;

  const { walls, openings, floors } = collectWalls(design);
  const schedules = floors.map(({ key, cfg }) => ({
    key,
    cfg,
    ...computeRoomSchedule(cfg),
  }));
  const interiorRooms = schedules.flatMap((s) =>
    s.rooms.filter((r) => r.interior).map((r) => ({ ...r, floor: s.key })),
  );
  const interiorArea = sum(interiorRooms, (r) => r.areaSqm);

  const F = spec.foundations;

  // ============================================================ 01 + 02 ZÁKLADY (DŮM)
  const floor1Walls = walls.filter((w) => w.floor === "1.NP");
  const stripWalls = floor1Walls.filter((w) => w.isExt || w.structural);
  const stripLen = sum(stripWalls, (w) => w.len);
  const stripVol = stripLen * F.stripWidth * F.stripDepth;

  const topsoilArea = (W + 2 * F.topsoilMargin) * (L + 2 * F.topsoilMargin);
  bom.add(S.earth, {
    name: "Sejmutí ornice – hlavní dům",
    spec: `tl. ${fmt(F.topsoilDepth)} m, přesah ${fmt(F.topsoilMargin, 1)} m kolem stavby`,
    unit: "m³",
    qty: topsoilArea * F.topsoilDepth,
    calc: `(${fmt(W)} + 2×${fmt(F.topsoilMargin, 1)}) × (${fmt(L)} + 2×${fmt(F.topsoilMargin, 1)}) × ${fmt(F.topsoilDepth)}`,
  });
  bom.add(S.earth, {
    name: "Výkop rýh pro základové pasy – hlavní dům",
    spec: `${fmt(F.stripWidth)} × ${fmt(F.stripDepth)} m`,
    unit: "m³",
    qty: stripVol,
    calc: `pasy pod obvodovými a nosnými stěnami Σ ${fmt(stripLen)} m × ${fmt(F.stripWidth)} × ${fmt(F.stripDepth)}`,
  });
  bom.add(S.earth, {
    name: "Odvoz přebytečné zeminy + uložení na skládku (vč. naložení)",
    spec: "Zemina z výkopu pasů po odečtení zásypu a rozprostření na pozemku (~70 %)",
    unit: "m³",
    qty: stripVol * 0.7,
    calc: `${fmt(stripVol)} m³ × 0,7`,
  });
  bom.add(S.earth, {
    name: "Zařízení staveniště, lešení a přesun hmot",
    spec: "Oplocení staveniště, mobilní WC, staveništní přípojky, fasádní lešení a přesuny",
    unit: "kpl",
    qty: 1,
    calc: "paušál stavby",
  });

  bom.add(S.found, {
    name: "Beton základových pasů – hlavní dům",
    spec: "Beton C16/20 XC2 (prostý)",
    unit: "m³",
    qty: stripVol,
    waste: 0.03,
    calc: `${stripWalls.length} stěn 1.NP, Σ ${fmt(stripLen)} m × ${fmt(F.stripWidth)} × ${fmt(F.stripDepth)}`,
  });
  const plinthArea = stripLen * F.plinthHeight;
  bom.add(S.found, {
    name: "Ztracené bednění – betonové tvárnice ZB",
    spec: `tl. dle stěny, ${fmt(F.plinthBlockFormat[0] * 1000, 0)}×${fmt(F.plinthBlockFormat[1] * 1000, 0)} mm, výplň betonem C16/20`,
    unit: "ks",
    qty: plinthArea / (F.plinthBlockFormat[0] * F.plinthBlockFormat[1]),
    waste: 0.03,
    calc: `${fmt(stripLen)} m × ${fmt(F.plinthHeight)} m = ${fmt(plinthArea)} m²`,
  });
  bom.add(S.found, {
    name: "Beton výplně ztraceného bednění",
    spec: "Beton C16/20",
    unit: "m³",
    qty: plinthArea * (T - 0.1),
    waste: 0.05,
    calc: `${fmt(plinthArea)} m² × ${fmt(T - 0.1)} m (průměrná výplň)`,
  });
  bom.add(S.found, {
    name: "Štěrkový podsyp pod podkladní desku",
    spec: `frakce 16/32, hutněný, tl. ${fmt(F.gravelThickness)} m`,
    unit: "m³",
    qty: footprintArea * F.gravelThickness,
    waste: 0.1,
    calc: `${fmt(W)} × ${fmt(L)} × ${fmt(F.gravelThickness)}`,
  });
  bom.add(S.found, {
    name: "Podkladní betonová deska",
    spec: `Beton C20/25 XC2, tl. ${fmt(F.baseSlabThickness)} m`,
    unit: "m³",
    qty: footprintArea * F.baseSlabThickness,
    waste: 0.03,
    calc: `${fmt(W)} × ${fmt(L)} × ${fmt(F.baseSlabThickness)}`,
  });
  bom.add(S.found, {
    name: "Svařovaná výztužná síť KARI",
    spec: "150/150/6 mm",
    unit: "m²",
    qty: footprintArea * F.meshOverlap,
    calc: `${fmt(footprintArea)} m² × ${fmt(F.meshOverlap)} (přesahy)`,
  });
  const hiArea = footprintArea + outerPerimeter * F.waterproofUpturn;
  bom.add(S.found, {
    name: "Hydroizolace spodní stavby – asfaltový pás SBS (protiradonová)",
    spec: "2 vrstvy, vytažení na sokl",
    unit: "m²",
    qty: hiArea * 2,
    waste: 0.15,
    calc: `(${fmt(footprintArea)} + obvod ${fmt(outerPerimeter)} × ${fmt(F.waterproofUpturn)}) × 2 vrstvy`,
  });
  bom.add(S.found, {
    name: "Perimetrická izolace soklu XPS",
    spec: "XPS tl. 100 mm",
    unit: "m²",
    qty: outerPerimeter * F.perimeterInsulationHeight,
    waste: 0.05,
    calc: `obvod ${fmt(outerPerimeter)} m × ${fmt(F.perimeterInsulationHeight)} m`,
  });

  // ============================================================ 03 ZDIVO & SDK (DŮM)
  const masonryWalls = walls.filter((w) => w.construction !== "sdk");
  const sdkWalls = walls.filter((w) => w.construction === "sdk");
  const masonryGroups = groupBy(masonryWalls, (w) => {
    const rule = masonryRule(spec, w.t);
    return `${spec.masonry.indexOf(rule)}|${w.t.toFixed(3)}|${w.isExt ? "ext" : w.structural ? "str" : "part"}`;
  });

  for (const group of masonryGroups.values()) {
    const w0 = group[0];
    const rule = masonryRule(spec, w0.t);
    const label =
      !w0.isExt && w0.structural && rule.labelStructural
        ? rule.labelStructural
        : rule.label;
    const brickT = w0.isExt && rule.coreThickness ? rule.coreThickness : w0.t;
    const net = sum(group, (w) => w.net);
    const pcsPerM2 = 1 / (rule.format[0] * rule.format[1]);
    const byFloor = groupBy(group, (w) => w.floor);
    const calc = [...byFloor.entries()]
      .map(
        ([fl, ws]) =>
          `${fl}: ${ws.length}× Σ ${fmt(sum(ws, (w) => w.len))} m, plocha ${fmt(sum(ws, (w) => w.gross))} − otvory ${fmt(sum(ws, (w) => w.openA))} m²`,
      )
      .join("; ");
    const role = w0.isExt
      ? "obvodové"
      : w0.structural
        ? "vnitřní nosné"
        : "příčky";
    bom.add(S.walls, {
      name: `Zdivo ${role} tl. ${mm(brickT)} mm`,
      spec: `${label}; ${rule.mortar}`,
      unit: "m²",
      qty: net,
      calc,
    });
    bom.add(S.walls, {
      name: `Tvárnice ${role} tl. ${mm(brickT)} mm`,
      spec: `formát ${mm(rule.format[0])}×${mm(brickT)}×${mm(rule.format[1])} mm, ${fmt(pcsPerM2, 1)} ks/m²`,
      unit: "ks",
      qty: net * pcsPerM2,
      waste: rule.waste,
      calc: `${fmt(net)} m² × ${fmt(pcsPerM2, 2)} ks/m²`,
    });
  }

  if (sdkWalls.length > 0) {
    const sdkNet = sum(sdkWalls, (w) => w.net);
    bom.add(S.walls, {
      name: "Akustické SDK příčky W112 tl. 125 mm (2.NP)",
      spec: spec.sdk.wallType,
      unit: "m²",
      qty: sdkNet,
      waste: spec.sdk.waste,
      calc: `${sdkWalls.length} příček Σ ${fmt(sum(sdkWalls, (w) => w.len))} m, plocha ${fmt(sum(sdkWalls, (w) => w.gross))} − otvory ${fmt(sum(sdkWalls, (w) => w.openA))} m²`,
    });
  }

  // Štítové zdivo
  const roofGeo = design.roof ? gableRoofGeometry(design.roof) : null;
  if (roofGeo) {
    const gableT = design.roof.gableThickness ?? 0.24;
    const rule = masonryRule(spec, gableT);
    const pcsPerM2 = 1 / (rule.format[0] * rule.format[1]);
    bom.add(S.walls, {
      name: `Štítové zdivo tl. ${mm(gableT)} mm`,
      spec: `${rule.label} (štíty sedlové střechy)`,
      unit: "m²",
      qty: roofGeo.gableArea,
      calc: `2 štíty × ${fmt(roofGeo.span)} × ${fmt(roofGeo.height)} / 2`,
    });
    bom.add(S.walls, {
      name: `Tvárnice štítové tl. ${mm(gableT)} mm`,
      spec: `${fmt(pcsPerM2, 1)} ks/m², vč. dořezů do sklonu ${fmt(roofGeo.pitchDeg, 1)}°`,
      unit: "ks",
      qty: roofGeo.gableArea * pcsPerM2,
      waste: 0.12,
      calc: `${fmt(roofGeo.gableArea)} m² × ${fmt(pcsPerM2, 2)} ks/m²`,
    });
  }

  // Překlady (pouze zděné stěny)
  const LT = spec.lintel;
  const masonryOpenings = openings.filter((o) => o.wallConstruction !== "sdk");
  const lintelGroups = groupBy(masonryOpenings, (o) => {
    const len = ceilTo(o.width + 2 * LT.bearing, LT.module);
    const rule = masonryRule(spec, o.wallT);
    const brickT = o.isExt && rule.coreThickness ? rule.coreThickness : o.wallT;
    return `${len.toFixed(3)}|${brickT.toFixed(3)}`;
  });
  for (const [key, ops] of [...lintelGroups.entries()].sort()) {
    const [len, t] = key.split("|").map(Number);
    const beams = Math.max(1, Math.floor((t - 0.02) / LT.beamWidth));
    bom.add(S.walls, {
      name: `Keramický překlad délky ${mm(len)} mm (stěna tl. ${mm(t)} mm)`,
      spec: `${beams} ks na otvor, uložení min. ${mm(LT.bearing)} mm – ověří statik`,
      unit: "ks",
      qty: ops.length * beams,
      calc: `${ops.length} otvorů × ${beams} ks: ${ops.map((o) => `${o.name} (${mm(o.width)})`).join(", ")}`,
    });
  }

  // ============================================================ 04 VODOROVNÉ KONSTRUKCE
  const slab = design.ceilingSlab;
  if (slab) {
    const holesA = sum(slab.holes || [], rectArea);
    const slabArea = slab.width * slab.length - holesA;
    const vol = slabArea * slab.thickness;
    bom.add(S.horiz, {
      name: `${slab.name} – beton`,
      spec: `${spec.slab.concrete}, tl. ${mm(slab.thickness)} mm, monolitická ŽB deska`,
      unit: "m³",
      qty: vol,
      waste: 0.03,
      calc: `(${fmt(slab.width)} × ${fmt(slab.length)} − otvor schodiště ${fmt(holesA)} m²) × ${fmt(slab.thickness)}`,
    });
    bom.add(S.horiz, {
      name: `${slab.name} – výztuž`,
      spec: `B500B, orient. ${spec.slab.rebarKgPerM3} kg/m³ – dle statika`,
      unit: "kg",
      qty: vol * spec.slab.rebarKgPerM3,
      waste: 0.05,
      calc: `${fmt(vol, 3)} m³ × ${spec.slab.rebarKgPerM3} kg/m³`,
    });
    const formwork = (slab.width - 2 * T) * (slab.length - 2 * T) - holesA;
    bom.add(S.horiz, {
      name: `${slab.name} – bednění`,
      spec: "Systémové stropní bednění vč. podpěr (pronájem)",
      unit: "m²",
      qty:
        formwork +
        2 *
          (slab.holes || []).reduce(
            (s, h) => s + Math.abs(h.x2 - h.x1) + Math.abs(h.z2 - h.z1),
            0,
          ) *
          slab.thickness,
      calc: `vnitřní plocha (${fmt(slab.width - 2 * T)} × ${fmt(slab.length - 2 * T)}) − otvor + čela otvoru`,
    });
    bom.add(S.horiz, {
      name: "Věncovka + izolace věnce stropní desky",
      spec: "Keramická věncovka + EPS/minerální izolace tl. 80–100 mm",
      unit: "m",
      qty: outerPerimeter,
      waste: 0.05,
      calc: `obvod ${fmt(outerPerimeter)} m`,
    });
  }

  if (design.roof) {
    const RB = spec.ringBeam;
    const vol = axisPerimeter * (T - RB.insulationGap) * RB.height;
    bom.add(S.horiz, {
      name: "Ztužující věnec pod pozednicí – beton",
      spec: `${spec.slab.concrete}, ${mm(T - RB.insulationGap)}×${mm(RB.height)} mm`,
      unit: "m³",
      qty: vol,
      waste: 0.05,
      calc: `obvod v ose ${fmt(axisPerimeter)} m × ${fmt(T - RB.insulationGap)} × ${fmt(RB.height)}`,
    });
    bom.add(S.horiz, {
      name: "Ztužující věnec – výztuž",
      spec: `B500B, orient. ${RB.rebarKgPerM3} kg/m³`,
      unit: "kg",
      qty: vol * RB.rebarKgPerM3,
      waste: 0.05,
      calc: `${fmt(vol, 3)} m³ × ${RB.rebarKgPerM3} kg/m³`,
    });
    bom.add(S.horiz, {
      name: "Věncovka + izolace věnce pod pozednicí",
      spec: "Keramická věncovka + izolace",
      unit: "m",
      qty: outerPerimeter,
      waste: 0.05,
      calc: `obvod ${fmt(outerPerimeter)} m`,
    });
  }

  // Schodiště
  const allFurniture = floors.flatMap(({ key, cfg }) =>
    (cfg.furniture || []).map((f) => ({ ...f, floor: key })),
  );
  for (const st of allFurniture.filter((f) => f.type === "stairs")) {
    const steps = st.stepsPerFlight ?? 8;
    const risers = steps * 2 + 2;
    const rise = (st.totalRise ?? 3.02) / risers;
    const runLen = Math.abs((st.xStart ?? 0) - (st.xLanding ?? 0));
    const tread = runLen / steps;
    const w1 = Math.abs(st.zFlight1[1] - st.zFlight1[0]);
    const w2 = Math.abs(st.zFlight2[1] - st.zFlight2[0]);
    const landingDepth = Math.abs((st.xLanding ?? 0) - (st.xEnd ?? 0));
    const landingWidth = Math.abs(st.zFlight2[1] - st.zFlight1[0]);
    const flightSlope = Math.hypot(runLen, steps * rise);
    const concrete =
      flightSlope * (w1 + w2) * 0.15 +
      ((steps * (tread * rise)) / 2) * (w1 + w2) +
      landingDepth * landingWidth * 0.18;
    bom.add(S.horiz, {
      name: `${st.name} – ŽB monolitické`,
      spec: `${risers} stupňů ${mm(rise)}/${mm(tread)} mm, šířka ramen ${mm(w1)}/${mm(w2)} mm, podesta ${fmt(landingDepth)} × ${fmt(landingWidth)} m`,
      unit: "m³",
      qty: concrete,
      waste: 0.05,
      calc: `desky ramen ${fmt(flightSlope)} m × 0,15 + stupně + podesta × 0,18`,
    });
    bom.add(S.horiz, {
      name: "Obklad stupňů schodiště – dřevo (stupnice + podstupnice)",
      spec: "Dub masiv / spárovka tl. 40 mm",
      unit: "ks",
      qty: steps * 2,
      waste: 0.05,
      calc: `2 ramena × ${steps} stupňů`,
    });
    bom.add(S.horiz, {
      name: "Obklad mezipodesty – dřevo",
      spec: "Dub, shodně se stupni",
      unit: "m²",
      qty: landingDepth * landingWidth,
      waste: 0.08,
      calc: `${fmt(landingDepth)} × ${fmt(landingWidth)}`,
    });
    bom.add(S.metal, {
      name: "Madlo schodiště (ke stěně)",
      spec: "Dřevěné / nerezové madlo vč. konzol",
      unit: "m",
      qty: 2 * flightSlope,
      calc: `2 ramena × ${fmt(flightSlope)} m`,
    });
  }

  // ============================================================ 05 + 06 STŘECHA
  function emitRoof({
    roofDef,
    geo,
    label,
    scope,
    eaveHeight,
    sectionRoof,
    sectionTin,
    withSoffit = true,
  }) {
    const R = spec.roof;
    const raftersPerSide =
      Math.ceil(geo.shellDepth / R.rafterSpacing - EPS) + 1;
    const rafters = 2 * raftersPerSide;
    const rafterLen = geo.slopeLen + 0.1;
    const rafterVol =
      rafters * rafterLen * R.rafterSection[0] * R.rafterSection[1];
    const plateVol =
      2 * geo.run * R.wallPlateSection[0] * R.wallPlateSection[1];
    const collarLen = geo.span * 0.6;
    const collarVol =
      raftersPerSide * 2 * collarLen * R.collarSection[0] * R.collarSection[1];
    const ridgeLen = geo.shellDepth;
    const pre = label ? `${label} – ` : "";

    if (roofDef?.truss) {
      bom.add(sectionRoof, {
        name: cap(`${pre}příhradové vazníky (nosný strop 2.NP + krov)`),
        spec: `Impregnované vazníky C24 s ocelovými styčníkovými deskami, vč. zavětrování a montáže jeřábem (sklon ${fmt(geo.pitchDeg, 1)}°)`,
        unit: "m²",
        qty: geo.planArea,
        scope,
        calc: `půdorys vč. přesahů ${fmt(geo.planArea, 1)} m²`,
      });
    } else {
      bom.add(sectionRoof, {
        name: cap(`${pre}krokve`),
        spec: `řezivo C24 ${mm(R.rafterSection[0])}×${mm(R.rafterSection[1])} mm, á ${mm(R.rafterSpacing)} mm, délka ${fmt(rafterLen)} m, sklon ${fmt(geo.pitchDeg, 1)}°`,
        unit: "ks",
        qty: rafters,
        scope,
        calc: `2 × (${fmt(geo.shellDepth)} / ${fmt(R.rafterSpacing)} + 1) = ${rafters} ks (${fmt(rafterVol, 3)} m³)`,
      });
      bom.add(sectionRoof, {
        name: cap(`${pre}řezivo krovu celkem (krokve, pozednice, kleštiny)`),
        spec: "Řezivo C24, hoblované, impregnované",
        unit: "m³",
        qty: rafterVol + plateVol + collarVol,
        waste: 0.1,
        scope,
        calc: `krokve ${fmt(rafterVol, 3)} + pozednice 2×${fmt(geo.run)} m ${fmt(plateVol, 3)} + kleštiny ${raftersPerSide}× ${fmt(collarVol, 3)} m³`,
      });
    }
    bom.add(sectionRoof, {
      name: cap(`${pre}pojistná hydroizolace (difuzní fólie)`),
      spec: "Difuzně otevřená fólie, Sd ≤ 0,02 m",
      unit: "m²",
      qty: geo.area * R.membraneOverlap,
      scope,
      calc: `${fmt(geo.area)} m² × ${fmt(R.membraneOverlap)} (přesahy)`,
    });
    bom.add(sectionRoof, {
      name: cap(`${pre}kontralatě 40/60`),
      spec: "Řezivo impregnované",
      unit: "m",
      qty: rafters * geo.slopeLen,
      waste: 0.05,
      scope,
      calc: `${rafters} krokví × ${fmt(geo.slopeLen)} m`,
    });
    bom.add(sectionRoof, {
      name: cap(`${pre}střešní latě 40/60`),
      spec: `Řezivo impregnované, rozteč ~${mm(R.battenSpacing)} mm`,
      unit: "m",
      qty: geo.area / R.battenSpacing,
      waste: 0.05,
      scope,
      calc: `${fmt(geo.area)} m² / ${fmt(R.battenSpacing)} m`,
    });
    bom.add(sectionRoof, {
      name: cap(`${pre}střešní krytina – plocha`),
      spec: `${R.covering}, sklon ${fmt(geo.pitchDeg, 1)}°`,
      unit: "m²",
      qty: geo.area,
      scope,
      calc: `2 roviny × ${fmt(geo.slopeLen)} m × ${fmt(geo.shellDepth)} m`,
    });
    bom.add(sectionRoof, {
      name: cap(`${pre}střešní tašky základní`),
      spec: `${fmt(R.tilesPerM2, 1)} ks/m²`,
      unit: "ks",
      qty: geo.area * R.tilesPerM2,
      waste: 0.03,
      scope,
      calc: `${fmt(geo.area)} m² × ${fmt(R.tilesPerM2, 1)}`,
    });
    const vergeRows = Math.ceil(geo.slopeLen / R.battenSpacing);
    bom.add(sectionRoof, {
      name: cap(`${pre}krajové (štítové) tašky L + P`),
      spec: "Systémové doplňky krytiny",
      unit: "ks",
      qty: 4 * vergeRows,
      scope,
      calc: `4 okraje × ${vergeRows} řad`,
    });
    bom.add(sectionRoof, {
      name: cap(`${pre}hřebenáče + větrací pás hřebene`),
      spec: `${fmt(R.ridgeTilesPerM, 1)} ks/m`,
      unit: "ks",
      qty: ridgeLen * R.ridgeTilesPerM,
      waste: 0.05,
      scope,
      calc: `hřeben ${fmt(ridgeLen)} m × ${fmt(R.ridgeTilesPerM, 1)}`,
    });
    bom.add(sectionRoof, {
      name: cap(`${pre}sněhové zachytávače (mřížka)`),
      spec: "Podél okapů",
      unit: "m",
      qty: 2 * geo.shellDepth,
      scope,
      calc: `2 × ${fmt(geo.shellDepth)} m`,
    });
    if (withSoffit) {
      bom.add(sectionRoof, {
        name: cap(`${pre}podbití přesahů střechy`),
        spec: "Palubky smrk / modřín tl. 19 mm, vč. roštu a nátěru",
        unit: "m²",
        qty: geo.eaveSoffit + geo.gableSoffit,
        waste: 0.1,
        scope,
        calc: `okapy ${fmt(geo.eaveSoffit)} + štíty ${fmt(geo.gableSoffit)} m²`,
      });
    }

    // Klempířské
    const gutter = 2 * geo.shellDepth;
    const downpipes = 2 * (geo.shellDepth > 10 ? 2 : 1);
    bom.add(sectionTin, {
      name: cap(`${pre}podokapní žlab půlkulatý R150`),
      spec: "Titanzinek / poplastovaný plech",
      unit: "m",
      qty: gutter,
      waste: 0.05,
      scope,
      calc: `2 okapy × ${fmt(geo.shellDepth)} m`,
    });
    bom.add(sectionTin, {
      name: cap(`${pre}háky žlabu`),
      spec: `á ${mm(R.gutterHookSpacing)} mm`,
      unit: "ks",
      qty: Math.ceil(gutter / R.gutterHookSpacing) + 2,
      scope,
      calc: `${fmt(gutter)} m / ${fmt(R.gutterHookSpacing)}`,
    });
    bom.add(sectionTin, {
      name: cap(`${pre}kotlík + lapač splavenin`),
      spec: "R150/100",
      unit: "ks",
      qty: downpipes,
      scope,
      calc: `${downpipes} svody`,
    });
    bom.add(sectionTin, {
      name: cap(`${pre}svodové potrubí Ø100`),
      spec: "vč. objímek a kolen",
      unit: "m",
      qty: downpipes * eaveHeight,
      waste: 0.05,
      scope,
      calc: `${downpipes} × ${fmt(eaveHeight)} m`,
    });
    bom.add(sectionTin, {
      name: cap(`${pre}okapnice`),
      spec: "rš 250 mm",
      unit: "m",
      qty: gutter,
      waste: 0.05,
      scope,
      calc: `2 × ${fmt(geo.shellDepth)} m`,
    });
    bom.add(sectionTin, {
      name: cap(`${pre}závětrné lišty (oplechování štítů)`),
      spec: "rš 330 mm",
      unit: "m",
      qty: 4 * geo.slopeLen,
      waste: 0.05,
      scope,
      calc: `4 × ${fmt(geo.slopeLen)} m`,
    });
    bom.add(sectionTin, {
      name: cap(`${pre}lemování / úžlabí – rezerva`),
      spec: "Prostupy střechou (odvětrání kanalizace, rekuperace)",
      unit: "kpl",
      qty: 1,
      scope,
      calc: "paušál",
    });
    return { geo, downpipes };
  }

  let houseRoof = null;
  if (design.roof) {
    houseRoof = emitRoof({
      roofDef: design.roof,
      geo: roofGeo,
      label: "",
      scope: "house",
      eaveHeight: design.roof.y,
      sectionRoof: S.roof,
      sectionTin: S.tin,
    });
  }

  // ============================================================ 07 VÝPLNĚ OTVORŮ
  const WS = spec.windows;
  const windowGroups = groupBy(
    openings.filter((o) => o.kind === "window" || o.kind === "hs"),
    (o) => `${o.kind}|${o.portalType || ""}|${mm(o.width)}|${mm(o.height)}`,
  );
  for (const [key, ops] of [...windowGroups.entries()].sort()) {
    const [kind, pType, w, h] = key.split("|");
    const isPsk = kind === "hs" && pType === "psk";
    bom.add(S.openings, {
      name: `${isPsk ? "Terasový portál PSK" : kind === "hs" ? "HS portál" : "Okno"} ${w} × ${h} mm`,
      spec: isPsk ? WS.pskLabel : kind === "hs" ? WS.slidingLabel : WS.label,
      unit: "ks",
      qty: ops.length,
      calc: ops.map((o) => `${o.floor}: ${o.name}`).join("; "),
    });
  }
  const shadedWindows = openings.filter((o) => o.shaded);
  if (shadedWindows.length > 0) {
    bom.add(S.openings, {
      name: "Venkovní žaluzie Z90 s motorickým pohonem + podomítkový kastlík",
      spec: WS.blindsLabel,
      unit: "m²",
      qty: sum(shadedWindows, openingArea),
      calc: shadedWindows.map((o) => `${o.floor}: ${o.name} (${fmt(openingArea(o))} m²)`).join("; "),
    });
  }
  const extDoors = groupBy(
    openings.filter((o) => o.kind === "extDoor"),
    (o) => `${mm(o.width)}|${mm(o.height)}`,
  );
  for (const [key, ops] of extDoors.entries()) {
    const [w, h] = key.split("|");
    bom.add(S.openings, {
      name: `Vstupní dveře ${w} × ${h} mm`,
      spec: WS.extDoorLabel,
      unit: "ks",
      qty: ops.length,
      calc: ops.map((o) => `${o.floor}: ${o.name}`).join("; "),
    });
  }
  const intDoors = groupBy(
    openings.filter((o) => o.kind === "intDoor"),
    (o) => `${o.sliding ? "pocket" : "hinged"}|${mm(o.width)}|${mm(o.height)}|${mm(o.wallT)}|${o.glazed ? "glazed" : "solid"}`,
  );
  for (const [key, ops] of [...intDoors.entries()].sort()) {
    const [mode, w, h, t, glass] = key.split("|");
    const isPocket = mode === "pocket";
    const isGlazed = glass === "glazed";
    bom.add(S.openings, {
      name: `Vnitřní dveře${isGlazed ? " prosklené" : ""} ${w} × ${h} mm (${isPocket ? "stavební pouzdro" : "zárubeň"} pro stěnu ${t} mm)`,
      spec: isPocket
        ? "Akustické prosklené posuvné křídlo + stavební pouzdro do zdiva, mušle/madlo"
        : isGlazed
          ? `${WS.glazedDoorLabel}; kování klika-klika, strana otevírání dle výkresu`
          : `${WS.intDoorLabel}; kování klika-klika, strana otevírání dle výkresu`,
      unit: "ks",
      qty: ops.length,
      calc: ops.map((o) => `${o.floor}: ${o.name}`).join("; "),
    });
  }

  const extGlazed = openings.filter(
    (o) =>
      o.isExt &&
      (o.kind === "window" || o.kind === "hs" || o.kind === "extDoor"),
  );
  bom.add(S.openings, {
    name: "Připojovací spára oken a dveří – vnitřní a vnější páska + PUR pěna",
    spec: "Systémové montážní pásky (parotěsná / paropropustná)",
    unit: "m",
    qty: sum(extGlazed, (o) => 2 * (o.width + o.height)),
    waste: 0.1,
    calc: `obvody ${extGlazed.length} výplní`,
  });

  const sillWindows = openings.filter(
    (o) => o.kind === "window" && o.sill >= WS.minSillForParapet,
  );
  const sillGroups = groupBy(sillWindows, (o) => mm(o.wallT));
  for (const [t, ops] of sillGroups.entries()) {
    const depthIn = Number(t) / 1000 - spec.plaster.revealDepthOffset - 0.05;
    bom.add(S.openings, {
      name: `Vnitřní parapet hl. ${mm(depthIn + 0.03)} mm`,
      spec: "Dřevotřískový / kompaktní laminát, vč. koncovek",
      unit: "m",
      qty: sum(ops, (o) => o.width + WS.sillOverhang),
      waste: 0.05,
      calc: `${ops.length} oken: Σ šířek + ${fmt(WS.sillOverhang)} m`,
    });
    bom.add(S.tin, {
      name: `Venkovní parapet (oplechování) rš ${mm(depthIn + 0.1)} mm`,
      spec: "Hliníkový tažený parapet + koncovky",
      unit: "m",
      qty: sum(ops, (o) => o.width + WS.sillOverhang),
      waste: 0.05,
      calc: `${ops.length} oken: Σ šířek + ${fmt(WS.sillOverhang)} m`,
    });
  }

  // ============================================================ 08 PODLAHY
  const FL = spec.floors;
  const allFinishes = floors.flatMap(({ key, cfg }) =>
    (cfg.finishes || []).map((f) => ({ ...f, floor: key })),
  );
  const interiorFinishes = allFinishes.filter(
    (f) => f.material === "woodFloor" || f.material === "tileFloor",
  );

  // Skutečné přiřazení krytin po místnostech (čistá plocha místností bez zbytečného přídavku pod příčkami)
  const WOOD_LIVING_IDS = new Set(["1.06", "1.07"]);
  const roomsWithFinish = interiorRooms.map((r) => {
    const fin = interiorFinishes.find(
      (f) =>
        f.floor === r.floor &&
        Array.isArray(r.pos) &&
        pointInFinish(f, r.pos[0], r.pos[2]),
    );
    const rawMat = fin?.material || "woodFloor";
    const finishMaterial =
      rawMat === "woodFloor" && !WOOD_LIVING_IDS.has(r.id) ? "vinylFloor" : rawMat;
    return {
      ...r,
      finishMaterial,
      floorThickness: fin?.thickness ?? (r.floor === "1.NP" ? 0.22 : 0.12),
      perimeter: roomPerimeter(r),
    };
  });

  const woodRoomsOnly = roomsWithFinish.filter((r) => r.finishMaterial === "woodFloor");
  const vinylRoomsOnly = roomsWithFinish.filter((r) => r.finishMaterial === "vinylFloor");
  const tileRoomsOnly = roomsWithFinish.filter((r) => r.finishMaterial === "tileFloor");

  const woodArea = sum(woodRoomsOnly, (r) => r.areaSqm);
  if (woodArea > EPS) {
    bom.add(S.floors, {
      name: "Dřevěná podlaha – dub (vícevrstvá, lepená na potěr)",
      spec: "tl. 14–15 mm, vhodná pro podlahové topení (obývací část)",
      unit: "m²",
      qty: woodArea,
      waste: FL.woodWaste,
      calc: woodRoomsOnly.map((r) => `${r.id} ${fmt(r.areaSqm, 1)} m²`).join(", "),
    });
    bom.add(S.floors, {
      name: "Lepidlo na dřevěné podlahy",
      spec: "Elastické MS lepidlo, ~1,1 kg/m²",
      unit: "kg",
      qty: woodArea * 1.1,
      waste: 0.05,
      calc: `${fmt(woodArea)} m² × 1,1`,
    });
  }

  const vinylArea = sum(vinylRoomsOnly, (r) => r.areaSqm);
  if (vinylArea > EPS) {
    bom.add(S.floors, {
      name: "Lepený vinyl (LVT/Rigid) vč. samonivelační stěrky a lepidla",
      spec: FL.vinylLabel || "Lepený vinyl, vhodný na podlahové topení",
      unit: "m²",
      qty: vinylArea,
      waste: FL.vinylWaste ?? 0.07,
      calc: vinylRoomsOnly.map((r) => `${r.id} ${fmt(r.areaSqm, 1)} m²`).join(", "),
    });
  }

  const tileArea = sum(tileRoomsOnly, (r) => r.areaSqm);
  if (tileArea > EPS) {
    bom.add(S.floors, {
      name: "Dlažba keramická / slinutá",
      spec: "Rektifikovaná, R10 v mokrých provozech",
      unit: "m²",
      qty: tileArea,
      waste: FL.tileWaste,
      calc: tileRoomsOnly.map((r) => `${r.id} ${fmt(r.areaSqm, 1)} m²`).join(", "),
    });
    bom.add(S.floors, {
      name: "Flexibilní lepidlo C2TE S1 – dlažba",
      spec: `${fmt(FL.tileAdhesiveKgPerM2, 1)} kg/m²`,
      unit: "kg",
      qty: tileArea * FL.tileAdhesiveKgPerM2,
      waste: 0.05,
      calc: `${fmt(tileArea)} m² × ${fmt(FL.tileAdhesiveKgPerM2, 1)}`,
    });
    bom.add(S.floors, {
      name: "Spárovací hmota – dlažba",
      spec: "CG2WA",
      unit: "kg",
      qty: tileArea * FL.groutKgPerM2,
      waste: 0.1,
      calc: `${fmt(tileArea)} m² × ${fmt(FL.groutKgPerM2, 1)}`,
    });
  }

  const screedArea = interiorArea;
  bom.add(S.floors, {
    name: "Anhydritový lité potěr",
    spec: `CA-C25-F5, tl. ${mm(FL.screedThickness)} mm (s podlahovým topením)`,
    unit: "m³",
    qty: screedArea * FL.screedThickness,
    waste: 0.05,
    calc: `Σ ploch místností ${fmt(screedArea)} m² × ${fmt(FL.screedThickness)}`,
  });
  bom.add(S.floors, {
    name: "Separační PE fólie pod potěr",
    spec: "0,2 mm",
    unit: "m²",
    qty: screedArea,
    waste: 0.15,
    calc: `${fmt(screedArea)} m²`,
  });

  const insulationGroups = groupBy(roomsWithFinish, (r) => {
    const ins = Math.max(
      0,
      Math.round((r.floorThickness - FL.screedThickness - 0.015) * 200) / 200,
    );
    return `${r.floor}|${ins.toFixed(3)}|${r.floorThickness.toFixed(3)}`;
  });
  for (const [key, rs] of insulationGroups.entries()) {
    const [floor, insStr, thickStr] = key.split("|");
    const ins = Number(insStr);
    const thickMm = mm(Number(thickStr));
    if (ins <= 0.005) {
      bom.warn(
        `${floor}: skladba podlahy (${thickMm} mm) nenechává místo pro izolaci.`,
      );
      continue;
    }
    const isGround = floor === "1.NP";
    if (isGround && ins < FL.minGroundInsulation) {
      bom.warn(
        `1.NP: izolace podlahy vychází jen ${mm(ins)} mm (skladba ${thickMm} mm v modelu) – doporučeno ≥ ${mm(FL.minGroundInsulation)} mm.`,
      );
    }
    const area = sum(rs, (r) => r.areaSqm);
    bom.add(S.floors, {
      name: `Tepelná / kročejová izolace podlahy ${floor} tl. ${mm(ins)} mm`,
      spec: isGround ? FL.groundFloorInsulation : FL.upperFloorInsulation,
      unit: "m²",
      qty: area,
      waste: 0.05,
      calc: `skladba ${thickMm} − potěr ${mm(FL.screedThickness)} − nášlap = ${mm(ins)} mm; ${fmt(area)} m²`,
    });
  }

  const totalRoomPerimeter = sum(roomsWithFinish, (r) => r.perimeter);
  bom.add(S.floors, {
    name: "Dilatační obvodový pásek",
    spec: "PE pásek 8×100 mm",
    unit: "m",
    qty: totalRoomPerimeter,
    waste: 0.05,
    calc: `Σ obvodů ${roomsWithFinish.length} místností`,
  });

  const skirtingRooms = roomsWithFinish.filter(
    (r) => r.finishMaterial === "woodFloor" || r.finishMaterial === "vinylFloor",
  );
  bom.add(S.floors, {
    name: "Soklové lišty k dřevěné podlaze",
    spec: "MDF / dub / PVC dle krytiny, výška 60 mm",
    unit: "m",
    qty: sum(skirtingRooms, (r) => r.perimeter),
    waste: 0.1,
    calc: skirtingRooms.map((r) => `${r.id} ${fmt(r.perimeter, 1)} m`).join(", "),
  });

  const WR = spec.wetRooms;
  const wetRooms = roomsWithFinish.filter((r) =>
    (r.fixtures || []).some((f) => WET_FIXTURES.includes(f)),
  );
  const tileSoklRooms = roomsWithFinish.filter(
    (r) => r.finishMaterial === "tileFloor" && !wetRooms.includes(r),
  );
  bom.add(S.floors, {
    name: "Sokl z dlažby",
    spec: "Řezaný z dlažby, výška 80 mm",
    unit: "m",
    qty: sum(tileSoklRooms, (r) => r.perimeter),
    waste: 0.1,
    calc: tileSoklRooms
      .map((r) => `${r.id} ${fmt(r.perimeter, 1)} m`)
      .join(", "),
  });

  // ============================================================ 09 POVRCHY
  const P = spec.plaster;
  const extWalls = walls.filter((w) => w.isExt);
  const intMasonryWalls = walls.filter((w) => !w.isExt && w.construction !== "sdk");
  const intSdkWalls = walls.filter((w) => !w.isExt && w.construction === "sdk");
  const extInner = sum(extWalls, (w) => w.innerLen * w.h - w.openA);
  const intFaces = sum(intMasonryWalls, (w) => 2 * (w.len * w.h - w.openA));
  const sdkFaces = sum(intSdkWalls, (w) => 2 * (w.len * w.h - w.openA));
  const revealsExt = sum(
    openings.filter((o) => o.isExt),
    (o) =>
      (2 * o.height + o.width) *
      Math.max(0.05, o.wallT - P.revealDepthOffset),
  );
  const revealsPassages = sum(
    openings.filter((o) => o.kind === "passage" && o.wallConstruction !== "sdk"),
    (o) => (2 * o.height + o.width) * o.wallT,
  );
  const ceilingSlabArea = sum(
    schedules.find((s) => s.key === "1.NP")?.rooms.filter((r) => r.interior) ||
      [],
    (r) => r.areaSqm,
  );
  const interiorPlaster = extInner + intFaces + revealsExt + revealsPassages;

  bom.add(S.surfaces, {
    name: "Vnitřní omítka stěn",
    spec: P.interior,
    unit: "m²",
    qty: interiorPlaster,
    waste: 0.05,
    calc: `obvodové zevnitř ${fmt(extInner)} + zděné stěny 2 strany ${fmt(intFaces)} + ostění ${fmt(revealsExt + revealsPassages)} m²`,
  });
  if (!design.ceiling1Sdk) {
    bom.add(S.surfaces, {
      name: "Vnitřní omítka stropu 1.NP (štuk na ŽB)",
      spec: "Sádrová stropní omítka",
      unit: "m²",
      qty: ceilingSlabArea,
      waste: 0.05,
      calc: "Σ ploch místností 1.NP",
    });
  }
  bom.add(S.surfaces, {
    name: "Rohové a APU lišty (vnitřní omítky)",
    spec: "Nerez / plast, APU lišty u oken",
    unit: "m",
    qty:
      sum(
        openings.filter((o) => o.isExt),
        (o) => 2 * o.height + 2 * o.width,
      ) +
      sum(
        openings.filter((o) => o.kind === "passage" && o.wallConstruction !== "sdk"),
        (o) => 2 * o.height + o.width,
      ),
    waste: 0.1,
    calc: "obvody oken a průchodů",
  });

  const facadeHeight =
    (design.roof?.y ?? 6.12) - (design.floor1?.elevation ?? 0);
  const extOpenA = sum(
    openings.filter((o) => o.isExt),
    openingArea,
  );
  const facade =
    outerPerimeter * facadeHeight + (roofGeo?.gableArea ?? 0) - extOpenA;
  bom.add(S.surfaces, {
    name: "Kontaktní zateplovací systém ETICS – EPS 70F tl. 140 mm",
    spec: spec.etics.label,
    unit: "m²",
    qty: facade,
    waste: spec.etics.waste,
    calc: `obvod ${fmt(outerPerimeter)} × ${fmt(facadeHeight)} + štíty ${fmt(roofGeo?.gableArea ?? 0)} − otvory ${fmt(extOpenA)} m²`,
  });
  bom.add(S.surfaces, {
    name: "Vnější omítka fasády",
    spec: "Silikonová probarvená omítka na ETICS (vč. penetrace)",
    unit: "m²",
    qty: facade,
    waste: 0.05,
    calc: `obvod ${fmt(outerPerimeter)} × ${fmt(facadeHeight)} + štíty ${fmt(roofGeo?.gableArea ?? 0)} − otvory ${fmt(extOpenA)} m²`,
  });
  const extReveals = sum(
    openings.filter((o) => o.isExt),
    (o) => (2 * o.height + o.width) * 0.12,
  );
  bom.add(S.surfaces, {
    name: "Vnější omítka ostění a nadpraží",
    spec: "hloubka ~120 mm",
    unit: "m²",
    qty: extReveals,
    waste: 0.1,
    calc: "obvody venkovních otvorů × 0,12 m",
  });
  bom.add(S.surfaces, {
    name: "Fasádní rohové lišty s tkaninou + okapnicové profily",
    spec: "Systémové profily",
    unit: "m",
    qty:
      4 * facadeHeight +
      sum(
        openings.filter((o) => o.isExt),
        (o) => 2 * o.height + 2 * o.width,
      ),
    waste: 0.1,
    calc: `4 nároží × ${fmt(facadeHeight)} m + obvody otvorů`,
  });
  bom.add(S.surfaces, {
    name: "Soklová omítka",
    spec: P.plinth,
    unit: "m²",
    qty: outerPerimeter * F.plinthHeight,
    waste: 0.05,
    calc: `obvod ${fmt(outerPerimeter)} × ${fmt(F.plinthHeight)}`,
  });

  // Obklady
  let wallTile = 0;
  let waterproof = 0;
  const tileCalc = [];
  for (const r of wetRooms) {
    if (r.id === "1.02") {
      // Technická místnost: obložena jen stěna za výlevkou a pračkou (~4,5 m²), zbytek omyvatelný nátěr
      const a = 4.5;
      wallTile += a;
      waterproof += r.areaSqm + r.perimeter * 0.15;
      tileCalc.push(`${r.id} ${r.name}: zástěna 4,5 m²`);
      continue;
    }
    const hasShower = (r.fixtures || []).some(
      (f) => f === "sprcha" || f === "vana",
    );
    const h = hasShower ? WR.tileHeightShower : WR.tileHeightOther;
    const a = r.perimeter * h;
    wallTile += a;
    const showers = (r.fixtures || []).filter(
      (f) => f === "sprcha" || f === "vana",
    ).length;
    waterproof +=
      r.areaSqm + r.perimeter * 0.15 + showers * WR.showerZoneWallSqm;
    tileCalc.push(`${r.id} ${r.name}: ${fmt(r.perimeter, 1)} m × ${fmt(h)} m`);
  }
  bom.add(S.surfaces, {
    name: "Obklad stěn – koupelny, WC, prádelna",
    spec: "Keramický obklad, rektifikovaný",
    unit: "m²",
    qty: wallTile,
    waste: WR.tileWaste,
    calc: tileCalc.join("; ") + " (bez odečtu otvorů)",
  });
  bom.add(S.surfaces, {
    name: "Flexibilní lepidlo C2TE – obklad",
    spec: "4 kg/m²",
    unit: "kg",
    qty: wallTile * 4,
    waste: 0.05,
    calc: `${fmt(wallTile)} m² × 4`,
  });
  bom.add(S.surfaces, {
    name: "Hydroizolační stěrka + těsnicí pásky",
    spec: "Dvousložková stěrka, pásky do rohů a prostupů",
    unit: "m²",
    qty: waterproof,
    waste: 0.1,
    calc: "podlahy mokrých místností + vytažení 150 mm + zóny sprch/van",
  });
  bom.add(S.surfaces, {
    name: "Ukončovací lišty obkladů",
    spec: "Hliník / nerez",
    unit: "m",
    qty: sum(wetRooms.filter((r) => r.id !== "1.02"), (r) => r.perimeter) + 3.0,
    waste: 0.1,
    calc: "obvody koupelen a WC + zástěna TM",
  });

  const ceiling2 = sum(
    schedules.find((s) => s.key === "2.NP")?.rooms.filter((r) => r.interior) ||
      [],
    (r) => r.areaSqm,
  );
  const paintArea = interiorPlaster + sdkFaces - wallTile + ceilingSlabArea + ceiling2;
  bom.add(S.surfaces, {
    name: "Malba stěn a stropů",
    spec: spec.paint.label,
    unit: "m²",
    qty: paintArea,
    waste: 0.05,
    calc: `omítky stěn ${fmt(interiorPlaster)} + SDK stěny ${fmt(sdkFaces)} − obklady ${fmt(wallTile)} + stropy ${fmt(ceilingSlabArea + ceiling2)} m²`,
  });

  // ============================================================ 10 PODHLED + IZOLACE
  const R = spec.roof;
  const innerPlan = (W - 2 * T) * (L - 2 * T);
  const p2Perimeter = sum(
    roomsWithFinish.filter((r) => r.floor === "2.NP"),
    (r) => r.perimeter,
  );
  if (design.ceiling1Sdk) {
    bom.add(S.ceiling, {
      name: "SDK podhled stropu 1.NP (pro rozvody VZT) – desky + rastr CD/UD",
      spec: "Sádrokarton 12,5 mm + dvojitý rošt CD/UD (100 mm pod ŽB stropem)",
      unit: "m²",
      qty: ceilingSlabArea,
      waste: 0.08,
      calc: "Σ ploch místností 1.NP",
    });
  }
  bom.add(S.ceiling, {
    name: "SDK podhled stropu 2.NP – desky",
    spec: "Sádrokarton 12,5 mm (v koupelnách impregnovaný H2)",
    unit: "m²",
    qty: ceiling2,
    waste: 0.08,
    calc: "Σ ploch místností 2.NP",
  });
  bom.add(S.ceiling, {
    name: "SDK podhled – CD profily",
    spec: "CD 60/27 + závěsy",
    unit: "m",
    qty: ceiling2 * R.ceilingProfileMPerM2,
    waste: 0.05,
    calc: `${fmt(ceiling2)} m² × ${fmt(R.ceilingProfileMPerM2, 1)} m/m²`,
  });
  bom.add(S.ceiling, {
    name: "SDK podhled – UD obvodové profily",
    spec: "UD 28/27",
    unit: "m",
    qty: p2Perimeter,
    waste: 0.05,
    calc: "Σ obvodů místností 2.NP",
  });
  bom.add(S.ceiling, {
    name: "Parotěsná fólie pod izolací",
    spec: "Sd ≥ 100 m + systémové pásky",
    unit: "m²",
    qty: innerPlan,
    waste: 0.15,
    calc: `${fmt(W - 2 * T)} × ${fmt(L - 2 * T)}`,
  });
  bom.add(S.ceiling, {
    name: `Tepelná izolace stropu pod nevytápěným podkrovím tl. ${mm(R.ceilingInsulationThickness)} mm`,
    spec: "Minerální vata λ ≤ 0,038, 2 vrstvy křížem",
    unit: "m²",
    qty: innerPlan,
    waste: 0.05,
    calc: `${fmt(W - 2 * T)} × ${fmt(L - 2 * T)}`,
  });
  bom.add(S.ceiling, {
    name: "Půdní výlez zateplený",
    spec: "600×1200 mm se skládacím schodištěm",
    unit: "ks",
    qty: 1,
    calc: "1 ks",
  });

  // ============================================================ 11 ZTI
  const TZ = spec.tzb;
  const fixtureCounts = new Map();
  for (const r of interiorRooms) {
    for (const f of r.fixtures || []) {
      if (!fixtureCounts.has(f)) fixtureCounts.set(f, []);
      fixtureCounts.get(f).push(r);
    }
  }
  let connectionPoints = 0;
  for (const [f, rooms] of fixtureCounts.entries()) {
    const def = TZ.fixtures[f] || { label: f, unit: "ks" };
    connectionPoints += rooms.length;
    bom.add(S.zti, {
      name: def.label,
      spec: "Dodávka + montáž",
      unit: def.unit,
      qty: rooms.length,
      calc: rooms.map((r) => `${r.id} ${r.name}`).join("; "),
    });
  }
  bom.add(S.zti, {
    name: "Vnitřní vodovod – rozvody PPR/PEX vč. izolace",
    spec: "Studená, teplá voda, cirkulace",
    unit: "kpl",
    qty: 1,
    calc: `${connectionPoints} připojovacích bodů`,
  });
  bom.add(S.zti, {
    name: "Vnitřní kanalizace – rozvody HT/KG",
    spec: "Vč. stoupaček a odvětrání nad střechu",
    unit: "kpl",
    qty: 1,
    calc: `${connectionPoints} připojovacích bodů`,
  });
  bom.add(S.zti, {
    name: "Venkovní zahradní ventil (nezámrzný)",
    spec: "Fasáda u terasy",
    unit: "ks",
    qty: 1,
    calc: "předpoklad",
  });
  bom.add(S.zti, {
    name: "Svislý shoz prádla z 2.NP (2.04) do prádelny (1.02)",
    spec: "Nerezové / PP hladké potrubí DN 300 vč. dvířek v 2.04 a sběrného koše",
    unit: "kpl",
    qty: 1,
    calc: "1 šachta 2.04 → 1.02",
  });

  // ============================================================ 12 VYTÁPĚNÍ & VZT
  const heatKw = (interiorArea * TZ.heatLossWPerM2) / 1000;
  const bathrooms = interiorRooms.filter((r) =>
    (r.fixtures || []).some((f) => f === "sprcha" || f === "vana"),
  ).length;
  const dhw = ceilTo(TZ.hotWaterBase + TZ.hotWaterPerBathroom * bathrooms, 50);
  bom.add(S.heat, {
    name: "Tepelné čerpadlo vzduch–voda",
    spec: `orient. výkon ${fmt(Math.max(4, heatKw), 1)} kW – dle PENB / výpočtu tepelných ztrát`,
    unit: "ks",
    qty: 1,
    calc: `${fmt(interiorArea, 1)} m² × ${TZ.heatLossWPerM2} W/m²`,
  });
  bom.add(S.heat, {
    name: "Zásobník teplé vody",
    spec: `objem ~${dhw} l`,
    unit: "ks",
    qty: 1,
    calc: `${TZ.hotWaterBase} l + ${bathrooms} koupelny × ${TZ.hotWaterPerBathroom} l`,
  });
  bom.add(S.heat, {
    name: "Podlahové topení – systém Tacker (fólie s rastrem + příchytky)",
    spec: "Systémová deska / reflexní fólie na EPS bez nopů",
    unit: "m²",
    qty: screedArea,
    waste: 0.05,
    calc: `plocha podlah ${fmt(screedArea)} m²`,
  });
  bom.add(S.heat, {
    name: "Podlahové topení – trubka PE-Xa 16×2",
    spec: `rozteč 150 mm (${fmt(TZ.floorHeatingPipeMPerM2, 1)} m/m²)`,
    unit: "m",
    qty: screedArea * TZ.floorHeatingPipeMPerM2,
    waste: 0.05,
    calc: `${fmt(screedArea)} m² × ${fmt(TZ.floorHeatingPipeMPerM2, 1)}`,
  });
  for (const s of schedules) {
    const n = s.rooms.filter((r) => r.interior).length;
    bom.add(S.heat, {
      name: `Rozdělovač podlahového topení ${s.key}`,
      spec: `${n} okruhů, vč. skříně a regulace`,
      unit: "ks",
      qty: 1,
      calc: `${n} místností`,
    });
  }
  bom.add(S.heat, {
    name: "Ekvitermní regulace TČ + 2× referenční prostorové čidlo (1.NP + 2.NP)",
    spec: "Samoregulační efekt potěru s ekvitermní křivkou bez zónových servopohonů",
    unit: "kpl",
    qty: 1,
    calc: "2 referenční zóny (1.NP + 2.NP)",
  });

  const avgClear = 2.65;
  const airflow = ceilTo(interiorArea * avgClear * TZ.ventilationAirChange, 10);
  const supplyRooms = interiorRooms.filter(
    (r) => !NON_HABITABLE.test(r.name) && !(r.fixtures || []).length,
  );
  const exhaustRooms = interiorRooms.filter((r) => (r.fixtures || []).length);
  const totalOutlets = supplyRooms.length + exhaustRooms.length;
  bom.add(S.heat, {
    name: "Rekuperační jednotka s entalpickým výměníkem",
    spec: `průtok min. ${airflow} m³/h, účinnost ≥ 88 %, letní bypass klapka`,
    unit: "ks",
    qty: 1,
    calc: `${fmt(interiorArea, 1)} m² × ${fmt(avgClear, 1)} m × ${fmt(TZ.ventilationAirChange, 1)}/h`,
  });
  bom.add(S.heat, {
    name: "Tlumiče hluku VZT (přívod + odvod)",
    spec: "Kruhové telefonní tlumiče L=1000 mm pro tichý chod rozvodů",
    unit: "ks",
    qty: 2,
    calc: "1× přívod, 1× odvod",
  });
  bom.add(S.heat, {
    name: "Rozdělovací distribuční boxy VZT",
    spec: "Akusticky izolované rozdělovače pro přívodní a odtahové trasy",
    unit: "ks",
    qty: 2,
    calc: "1× přívod, 1× odtah",
  });
  bom.add(S.heat, {
    name: "Fasádní sací a výfuková mřížka",
    spec: "Nerezové mřížky s protidešťovou žaluzií a odvodem kondenzátu na severní fasádě",
    unit: "ks",
    qty: 2,
    calc: "sání + výfuk",
  });
  bom.add(S.heat, {
    name: "Instalační šachta pro VZT a TZB rozvody",
    spec: "Akustická a protipožární kapotáž šachty z desek Knauf Diamant/Red",
    unit: "kpl",
    qty: 1,
    calc: "prostup 1.NP a 2.NP",
  });
  bom.add(S.heat, {
    name: "Rekuperace – přívodní vyústky",
    spec: "Talířové ventily / mřížky",
    unit: "ks",
    qty: supplyRooms.length,
    calc: supplyRooms.map((r) => r.id).join(", "),
  });
  bom.add(S.heat, {
    name: "Rekuperace – odvodní vyústky",
    spec: "Talířové ventily",
    unit: "ks",
    qty: exhaustRooms.length,
    calc: exhaustRooms.map((r) => r.id).join(", "),
  });
  bom.add(S.heat, {
    name: "Rekuperace – rozvodné potrubí",
    spec: "Flexibilní antibakteriální potrubí d90/75 mm + páteřní spiro potrubí",
    unit: "m",
    qty: totalOutlets * TZ.ventDuctPerOutlet,
    waste: 0.1,
    calc: `${totalOutlets} vyústek × ${fmt(TZ.ventDuctPerOutlet, 1)} m`,
  });
  bom.add(S.heat, {
    name: "Těsnicí manžety a vzduchotěsné prostupy",
    spec: "EPDM manžety pro neprůvzdušný prostup parotěsem (Blower-Door test)",
    unit: "ks",
    qty: totalOutlets + 4,
    calc: `${totalOutlets} vyústek + 4 páteřní prostupy`,
  });

  // ============================================================ 13 ELEKTRO
  let sockets = 0;
  let lights = 0;
  for (const r of interiorRooms) {
    sockets += Math.max(TZ.socketsMin, Math.ceil(r.areaSqm * TZ.socketsPerM2));
    for (const f of r.fixtures || []) sockets += TZ.extraSockets[f] || 0;
    lights += r.areaSqm > 15 ? 2 : 1;
  }
  bom.add(S.elec, {
    name: "Zásuvkové vývody",
    spec: "Odhad 1 ks / 5 m², min. 2 / místnost + spotřebiče",
    unit: "ks",
    qty: sockets,
    calc: `${interiorRooms.length} místností`,
  });
  bom.add(S.elec, {
    name: "Světelné vývody – interiér",
    spec: "1 / místnost, 2 nad 15 m²",
    unit: "ks",
    qty: lights,
    calc: `${interiorRooms.length} místností`,
  });
  bom.add(S.elec, {
    name: "Venkovní svítidla",
    spec: "Vstup, terasa, loubí, dílna",
    unit: "ks",
    qty: TZ.exteriorLights,
    scope: "exterior",
    calc: "předpoklad",
  });
  bom.add(S.elec, {
    name: "Datové zásuvky (CAT6)",
    spec: "Obytné místnosti",
    unit: "ks",
    qty: supplyRooms.length,
    calc: supplyRooms.map((r) => r.id).join(", "),
  });
  bom.add(S.elec, {
    name: "Rozvaděč RD vč. jističů a chráničů",
    spec: "Dle projektu elektro",
    unit: "ks",
    qty: 1,
    calc: "1 ks",
  });
  bom.add(S.elec, {
    name: "Elektroinstalace – kabeláž, krabice, montáž",
    spec: "Dle projektu elektro",
    unit: "kpl",
    qty: 1,
    calc: `${sockets} zásuvek, ${lights} světel`,
  });
  if (roofGeo) {
    const eave = design.roof.y;
    bom.add(S.elec, {
      name: "Hromosvod – jímací vedení na hřebeni",
      spec: "FeZn / AlMgSi drát Ø8",
      unit: "m",
      qty: roofGeo.shellDepth,
      waste: 0.1,
      calc: `hřeben ${fmt(roofGeo.shellDepth)} m`,
    });
    bom.add(S.elec, {
      name: "Hromosvod – svody + zkušební svorky",
      spec: "2 svody",
      unit: "m",
      qty: 2 * (eave + roofGeo.height + roofGeo.slopeLen),
      waste: 0.1,
      calc: `2 × (${fmt(eave)} + ${fmt(roofGeo.slopeLen)} po střeše)`,
    });
    bom.add(S.elec, {
      name: "Zemnící páska FeZn 30×4 v základech",
      spec: "Obvod základů",
      unit: "m",
      qty: axisPerimeter + 4,
      waste: 0.05,
      calc: `obvod ${fmt(axisPerimeter)} + vývody`,
    });
  }

  // ============================================================ 14 ZÁMEČNICKÉ
  for (const it of allFurniture) {
    if (it.type === "railing") {
      const [w = 0.08, h = 1.0, d = 1.0] = it.size || [];
      bom.add(S.metal, {
        name: it.name,
        spec: `Zábradlí výšky ${mm(h)} mm, ocel / sklo`,
        unit: "m",
        qty: Math.max(w, d),
        calc: `${it.floor}, délka ${fmt(Math.max(w, d))} m`,
      });
    }
    if (it.type === "canopy") {
      const [w, , d] = it.size;
      bom.add(S.metal, {
        name: `${it.name} – sklo`,
        spec: spec.exterior.canopyGlass,
        unit: "m²",
        qty: w * d,
        calc: `${fmt(w)} × ${fmt(d)}`,
      });
      bom.add(S.metal, {
        name: `${it.name} – nosná konstrukce`,
        spec: "Nerez / ocel žárově zinkovaná, konzoly a táhla",
        unit: "kpl",
        qty: 1,
        calc: "1 kpl",
      });
    }
  }

  // ============================================================ 15 TERASA & PERGOLA
  const EX = spec.exterior;
  for (const f of allFinishes.filter((x) => x.material === "terrace")) {
    const a = finishArea(f);
    if (/thermo|dřev/i.test(f.name)) {
      bom.add(S.terrace, {
        name: `${f.name} – terasová prkna`,
        spec: "Thermo borovice / jasan, tl. 26 mm",
        unit: "m²",
        qty: a,
        waste: EX.deckWaste,
        scope: "exterior",
        calc: `${fmt(f.size[0])} × ${fmt(f.size[1])}`,
      });
      bom.add(S.terrace, {
        name: "Terasa – nosný rošt (hranoly 45×70)",
        spec: `á ${mm(EX.deckJoistSpacing)} mm`,
        unit: "m",
        qty: a / EX.deckJoistSpacing,
        waste: 0.1,
        scope: "exterior",
        calc: `${fmt(a)} m² / ${fmt(EX.deckJoistSpacing)}`,
      });
      bom.add(S.terrace, {
        name: "Terasa – skryté spony a vruty (nerez)",
        spec: "Systémové",
        unit: "m²",
        qty: a,
        waste: 0.05,
        scope: "exterior",
        calc: `${fmt(a)} m²`,
      });
    } else {
      bom.add(S.terrace, {
        name: "Zahradní terasa – velkoformátová betonová dlažba 60×60×4 cm",
        spec: EX.terracePaverLabel,
        unit: "m²",
        qty: a,
        waste: EX.terracePaverWaste,
        scope: "exterior",
        calc: `${fmt(f.size[0])} × ${fmt(f.size[1])}`,
      });
    }
    bom.add(S.terrace, {
      name: "Terasa – rektifikační terče",
      spec: "Stavitelné podložky",
      unit: "ks",
      qty: a * EX.deckPadsPerM2,
      scope: "exterior",
      calc: `${fmt(a)} m² × ${EX.deckPadsPerM2}`,
    });
    bom.add(S.terrace, {
      name: "Terasa – geotextilie + štěrkové lože",
      spec: `geotextilie 300 g/m², štěrk 0,15 m`,
      unit: "m³",
      qty: a * 0.15,
      waste: 0.1,
      scope: "exterior",
      calc: `${fmt(a)} m² × 0,15`,
    });
  }
  for (const it of allFurniture.filter((x) => x.type === "pergola")) {
    const posts = it.posts || [];
    const post = it.postSize ?? 0.14;
    const [pw, , pd] = it.size;
    bom.add(S.terrace, {
      name: `${it.name} – sloupky`,
      spec: `Lepené lamelové dřevo ${mm(post)}×${mm(post)} mm, délka ${fmt(it.height ?? 2.8)} m`,
      unit: "ks",
      qty: posts.length,
      scope: "exterior",
      calc: `${posts.length} ks`,
    });
    bom.add(S.terrace, {
      name: `${it.name} – vaznice`,
      spec: "BSH 120×240 mm",
      unit: "m",
      qty: 2 * pd,
      waste: 0.05,
      scope: "exterior",
      calc: `2 × ${fmt(pd)} m`,
    });
    bom.add(S.terrace, {
      name: `${it.name} – krokve`,
      spec: `BSH 80×200 mm, délka ${fmt(pw)} m`,
      unit: "ks",
      qty: it.rafterCount ?? 7,
      scope: "exterior",
      calc: `${it.rafterCount ?? 7} ks`,
    });
    bom.add(S.terrace, {
      name: `${it.name} – střešní plášť`,
      spec: EX.pergolaRoofing,
      unit: "m²",
      qty: pw * pd,
      waste: 0.08,
      scope: "exterior",
      calc: `${fmt(pw)} × ${fmt(pd)}`,
    });
    bom.add(S.terrace, {
      name: `${it.name} – patky + kotevní botky`,
      spec: `Beton C20/25 ${mm(F.smallPadSize)}³ mm, ocelová kotva`,
      unit: "ks",
      qty: posts.length,
      scope: "exterior",
      calc: `${posts.length} ks, beton ${fmt(posts.length * F.smallPadSize ** 3, 3)} m³`,
    });
    bom.add(S.terrace, {
      name: `${it.name} – žlab + svod`,
      spec: "Shodně s domem",
      unit: "m",
      qty: pd + (it.height ?? 2.8),
      scope: "exterior",
      calc: `${fmt(pd)} + ${fmt(it.height ?? 2.8)} m`,
    });
  }

  // ============================================================ 16 VEDLEJŠÍ STAVBA
  if (auxConfig) {
    const A = spec.aux;
    const {
      parkWidth,
      workshopWidth,
      depth,
      wallHeight,
      roofType = "gable",
      roofHeight,
      canopy,
      eastWalkway,
    } = auxConfig;
    const totalWidth = parkWidth + workshopWidth;
    const workshopPerim = 2 * (workshopWidth + depth);
    const wallLen = workshopPerim + parkWidth;
    const rule = masonryRule(spec, A.wallThickness);
    const pcs = 1 / (rule.format[0] * rule.format[1]);
    const gableA = depth * roofHeight; // u pultu dva klíny nad dílnou; u sedlové dva štíty
    const masonryA = wallLen * wallHeight + gableA;
    const sc = "aux";

    bom.add(S.aux, {
      name: "Sejmutí ornice – vedlejší stavba",
      spec: `tl. ${fmt(F.topsoilDepth)} m`,
      unit: "m³",
      qty: (totalWidth + 2) * (depth + 2) * F.topsoilDepth,
      scope: sc,
      calc: `(${fmt(totalWidth)} + 2) × (${fmt(depth)} + 2) × ${fmt(F.topsoilDepth)}`,
    });
    const auxStrip = wallLen * F.stripWidth * F.stripDepth;
    bom.add(S.aux, {
      name: "Základové pasy dílny a zadní stěny stání – výkop + beton",
      spec: `C16/20, ${fmt(F.stripWidth)} × ${fmt(F.stripDepth)} m`,
      unit: "m³",
      qty: auxStrip,
      waste: 0.03,
      scope: sc,
      calc: `${fmt(wallLen)} m × ${fmt(F.stripWidth)} × ${fmt(F.stripDepth)}`,
    });
    bom.add(S.aux, {
      name: "Patky pod sloupy stání",
      spec: `C16/20, ${mm(F.padFootingSize)}³ mm`,
      unit: "m³",
      qty: 3 * F.padFootingSize ** 3,
      scope: sc,
      calc: `3 × ${fmt(F.padFootingSize)}³`,
    });
    bom.add(S.aux, {
      name: `Zdivo dílny tl. ${mm(A.wallThickness)} mm (vč. štítů)`,
      spec: `${rule.label}; tloušťka předpokládaná – v modelu není`,
      unit: "m²",
      qty: masonryA,
      scope: sc,
      calc: `(${fmt(workshopPerim)} + zadní stěna ${fmt(parkWidth)}) × ${fmt(wallHeight)} + štíty ${fmt(gableA)} m² (bez odečtu otvorů)`,
    });
    bom.add(S.aux, {
      name: `Tvárnice dílny tl. ${mm(A.wallThickness)} mm`,
      spec: `${fmt(pcs, 1)} ks/m²`,
      unit: "ks",
      qty: masonryA * pcs,
      waste: 0.08,
      scope: sc,
      calc: `${fmt(masonryA)} m² × ${fmt(pcs, 2)}`,
    });
    bom.add(S.aux, {
      name: "Sloupy krytého stání",
      spec: `ŽB / zděné ${mm(A.pillarSection)}×${mm(A.pillarSection)} mm, výška ${fmt(wallHeight)} m`,
      unit: "ks",
      qty: 3,
      scope: sc,
      calc: "3 ks dle modelu",
    });
    bom.add(S.aux, {
      name: "Ztužující věnec dílny – beton + výztuž",
      spec: `${spec.slab.concrete}`,
      unit: "m³",
      qty: wallLen * (A.wallThickness - 0.08) * 0.25,
      waste: 0.05,
      scope: sc,
      calc: `${fmt(wallLen)} m × ${fmt(A.wallThickness - 0.08)} × 0,25`,
    });
    bom.add(S.aux, {
      name: "Podlahová deska dílny – beton",
      spec: `C25/30 drátkobeton, tl. ${mm(A.floorSlabThickness)} mm, hlazený`,
      unit: "m³",
      qty: workshopWidth * depth * A.floorSlabThickness,
      waste: 0.03,
      scope: sc,
      calc: `${fmt(workshopWidth)} × ${fmt(depth)} × ${fmt(A.floorSlabThickness)}`,
    });
    bom.add(S.aux, {
      name: "Podsyp štěrk + geotextilie – dílna a stání",
      spec: "frakce 0/32, tl. 0,25 m",
      unit: "m³",
      qty: totalWidth * depth * 0.25,
      waste: 0.1,
      scope: sc,
      calc: `${fmt(totalWidth)} × ${fmt(depth)} × 0,25`,
    });
    bom.add(S.aux, {
      name: "Zpevněná plocha krytého stání",
      spec: "Betonová zámková dlažba tl. 80 mm",
      unit: "m²",
      qty: parkWidth * depth,
      waste: 0.05,
      scope: sc,
      calc: `${fmt(parkWidth)} × ${fmt(depth)}`,
    });
    bom.add(S.aux, {
      name: "Vnější omítka dílny",
      spec: P.exterior,
      unit: "m²",
      qty: masonryA,
      waste: 0.05,
      scope: sc,
      calc: "shodně se zdivem (1 strana)",
    });
    bom.add(S.aux, {
      name: "Vnitřní omítka / nátěr zdiva dílny",
      spec: "Jednovrstvá vápenocementová omítka + bílý omyvatelný nátěr",
      unit: "m²",
      qty: workshopPerim * wallHeight,
      waste: 0.05,
      scope: sc,
      calc: `obvod dílny ${fmt(workshopPerim)} × ${fmt(wallHeight)} m`,
    });
    bom.add(S.aux, {
      name: "Elektroinstalace dílny + příprava pro wallbox (3×400 V) ve stání",
      spec: "Podružný rozvaděč, zásuvky 230/400 V, světla a chránička CYKY 5×6 pro EV wallbox",
      unit: "kpl",
      qty: 1,
      scope: sc,
      calc: "1 kpl",
    });
    bom.add(S.aux, {
      name: "Vrata do dílny",
      spec: "Sekční / křídlová – rozměr k upřesnění (v modelu nejsou otvory)",
      unit: "ks",
      qty: 1,
      scope: sc,
      calc: "předpoklad",
    });
    bom.add(S.aux, {
      name: "Dveře + okno dílny",
      spec: "K upřesnění",
      unit: "kpl",
      qty: 1,
      scope: sc,
      calc: "předpoklad",
    });
    bom.warn(
      "Vedlejší stavba: otvory (vrata, dveře, okna) nejsou v modelu – zdivo je bez odečtu otvorů.",
    );
    bom.warn(
      "DPH u vedlejší stavby: samostatně stojící dílna může být posouzena v základní sazbě 21 % DPH namísto 12 % (§ 48 odst. 5 ZDPH).",
    );

    const auxRoofDef = {
      width: totalWidth,
      length: depth,
      height: roofHeight,
      ridgeAxis: "x",
      eaveOverhang: A.eaveOverhang,
      gableOverhang: A.gableOverhang,
    };
    if (roofType === "mono") {
      const auxGeo = monoRoofGeometry(auxRoofDef);
      const R = spec.roof;
      const rafters = Math.ceil(auxGeo.span / R.rafterSpacing - EPS) + 1;
      const rafterVol = rafters * auxGeo.slopeLen * 0.08 * 0.20;
      const purlinVol = 2 * auxGeo.span * 0.16 * 0.16;
      bom.add(S.aux, {
        name: "Střecha dílny a stání – krokve a vaznice pultové střechy (C24)",
        spec: `Řezivo C24, sklon ${fmt(auxGeo.pitchDeg, 1)}° ke severu (${rafters} krokví)`,
        unit: "m³",
        qty: rafterVol + purlinVol,
        waste: 0.1,
        scope: sc,
        calc: `${rafters} krokví × ${fmt(auxGeo.slopeLen)} m + 2 vaznice ${fmt(auxGeo.span)} m`,
      });
      bom.add(S.aux, {
        name: "Střecha dílny a stání – OSB záklop + pojistná hydroizolace",
        spec: "OSB3 22 mm / bednění + difuzní fólie",
        unit: "m²",
        qty: auxGeo.area * 1.08,
        scope: sc,
        calc: `${fmt(auxGeo.area)} m² × 1,08`,
      });
      bom.add(S.aux, {
        name: "Střecha dílny a stání – falcovaná plechová krytina (pultová)",
        spec: `Falcovaný/klik plech pro nízký sklon (${fmt(auxGeo.pitchDeg, 1)}°)`,
        unit: "m²",
        qty: auxGeo.area,
        waste: 0.08,
        scope: sc,
        calc: `${fmt(auxGeo.span)} × ${fmt(auxGeo.slopeLen)} m`,
      });
      bom.add(S.aux, {
        name: "Střecha dílny a stání – oplechování atiky a závětrné lišty",
        spec: "Poplastovaný / titanzinkový plech",
        unit: "m",
        qty: auxGeo.span + 2 * auxGeo.slopeLen,
        waste: 0.05,
        scope: sc,
        calc: `jižní hrana ${fmt(auxGeo.span)} + 2 boky ${fmt(auxGeo.slopeLen)} m`,
      });
      bom.add(S.aux, {
        name: "Střecha dílny a stání – podokapní žlab R125 + svod Ø90",
        spec: "Na severní okapové hraně vč. háků, kotlíku a kolen",
        unit: "m",
        qty: auxGeo.span + 2 * (wallHeight + 0.3),
        waste: 0.05,
        scope: sc,
        calc: `žlab ${fmt(auxGeo.span)} m + 2 svody ${fmt(wallHeight + 0.3)} m`,
      });
    } else {
      const auxGeo = gableRoofGeometry(auxRoofDef);
      emitRoof({
        roofDef: auxRoofDef,
        geo: auxGeo,
        label: "Střecha dílny a stání",
        scope: sc,
        eaveHeight: wallHeight,
        sectionRoof: S.aux,
        sectionTin: S.aux,
      });
    }

    if (canopy) {
      const [cw, , cd] = canopy.size;
      bom.add(S.aux, {
        name: "Kryté loubí – střešní plášť",
        spec: "Shodně se střechou stání / polykarbonát",
        unit: "m²",
        qty: cw * cd,
        waste: 0.08,
        scope: "exterior",
        calc: `${fmt(cw)} × ${fmt(cd)}`,
      });
      bom.add(S.aux, {
        name: "Kryté loubí – sloupky 140×140 + nosníky",
        spec: "Ocel žár. zinek / BSH, výška 2,5 m",
        unit: "ks",
        qty: canopy.pillars.length,
        scope: "exterior",
        calc: `${canopy.pillars.length} sloupků`,
      });
      bom.add(S.aux, {
        name: "Kryté loubí – patky",
        spec: `C20/25 ${mm(F.smallPadSize)}³ mm`,
        unit: "ks",
        qty: canopy.pillars.length,
        scope: "exterior",
        calc: `${canopy.pillars.length} ks`,
      });
      bom.add(S.site, {
        name: "Chodník pod loubím",
        spec: "Betonová dlažba 60 mm + lože + štěrk",
        unit: "m²",
        qty: canopy.walkWidth * cd,
        waste: 0.05,
        scope: "exterior",
        calc: `${fmt(canopy.walkWidth)} × ${fmt(cd)}`,
      });
    }
    if (eastWalkway) {
      const [ew, , ed] = eastWalkway.size;
      bom.add(S.site, {
        name: "Chodník k hlavnímu vchodu",
        spec: "Betonová dlažba 60 mm + lože + štěrk",
        unit: "m²",
        qty: ew * ed,
        waste: 0.05,
        scope: "exterior",
        calc: `${fmt(ew)} × ${fmt(ed)}`,
      });
    }
  }

  // ============================================================ 17 VENKOVNÍ ÚPRAVY
  if (siteConfig) {
    const SI = spec.site;
    const { width: sw, depth: sd, chamfer = 0 } = siteConfig;
    const perimeter = 2 * (sw + sd) - 2 * chamfer + chamfer * Math.SQRT2;
    bom.add(S.site, {
      name: "Oplocení pozemku – pletivo / panely",
      spec: "Výška 1,6 m vč. podhrabových desek",
      unit: "m",
      qty: perimeter,
      waste: 0.03,
      scope: "exterior",
      calc: `obvod parcely 2×(${fmt(sw, 1)} + ${fmt(sd, 1)}) − zkosení ${fmt(chamfer, 1)} m`,
    });
    bom.add(S.site, {
      name: "Sloupky oplocení",
      spec: "á 2,5 m, vč. patek",
      unit: "ks",
      qty: Math.ceil(perimeter / 2.5) + 1,
      scope: "exterior",
      calc: `${fmt(perimeter, 1)} m / 2,5`,
    });
    bom.add(S.site, {
      name: "Vjezdová brána",
      spec: "Posuvná / křídlová, š. ~4 m",
      unit: "ks",
      qty: SI.gates.vjezdova,
      scope: "exterior",
      calc: "předpoklad",
    });
    bom.add(S.site, {
      name: "Branka",
      spec: "š. 1 m, el. zámek",
      unit: "ks",
      qty: SI.gates.branka,
      scope: "exterior",
      calc: "předpoklad",
    });

    const pos = housePos ||
      siteConfig.defaultHousePos || { x: 0, z: 0, rotY: 0 };
    const rad = ((pos.rotY || 0) * Math.PI) / 180;
    const halfExtX =
      Math.abs((W / 2) * Math.cos(rad)) + Math.abs((L / 2) * Math.sin(rad));
    const toStreet = Math.max(1, sw / 2 - (pos.x + halfExtX));
    const utilLen = toStreet + SI.utilityExtra;
    bom.add(S.site, {
      name: "Vodovodní přípojka PE 32",
      spec: "vč. výkopu a obsypu",
      unit: "m",
      qty: utilLen,
      scope: "exterior",
      calc: `odstup domu od ulice ${fmt(toStreet, 1)} m + ${fmt(SI.utilityExtra, 1)} m`,
    });
    bom.add(S.site, {
      name: "Vodoměrná šachta / sestava",
      spec: "Dle správce sítě",
      unit: "ks",
      qty: 1,
      scope: "exterior",
      calc: "1 ks",
    });
    bom.add(S.site, {
      name: "Kanalizační přípojka KG 150",
      spec: "vč. revizní šachty",
      unit: "m",
      qty: utilLen,
      scope: "exterior",
      calc: `${fmt(utilLen, 1)} m`,
    });
    bom.add(S.site, {
      name: "Elektropřípojka – kabel + elektroměrový pilíř",
      spec: "Dle distributora",
      unit: "m",
      qty: utilLen,
      scope: "exterior",
      calc: `${fmt(utilLen, 1)} m`,
    });
    bom.add(S.site, {
      name: "Datová přípojka – chránička",
      spec: "HDPE 40",
      unit: "m",
      qty: utilLen,
      scope: "exterior",
      calc: `${fmt(utilLen, 1)} m`,
    });

    if (auxConfig) {
      const auxMaxX =
        auxConfig.position[0] +
        (auxConfig.parkWidth + auxConfig.workshopWidth) / 2;
      const driveLen = sw / 2 - auxMaxX;
      if (driveLen > 0.2) {
        bom.add(S.site, {
          name: "Vjezd ke krytému stání",
          spec: "Zámková dlažba 80 mm + lože + štěrk 0,3 m",
          unit: "m²",
          qty: driveLen * SI.drivewayWidth,
          waste: 0.05,
          scope: "exterior",
          calc: `${fmt(driveLen, 1)} m × ${fmt(SI.drivewayWidth, 1)} m`,
        });
      }
    }

    const roofsPlan =
      (roofGeo?.planArea ?? 0) +
      (auxConfig
        ? (auxConfig.roofType === "mono" ? monoRoofGeometry : gableRoofGeometry)({
            width: auxConfig.parkWidth + auxConfig.workshopWidth,
            length: auxConfig.depth,
            height: auxConfig.roofHeight,
            ridgeAxis: "x",
            eaveOverhang: spec.aux.eaveOverhang,
            gableOverhang: spec.aux.gableOverhang,
          }).planArea
        : 0);
    bom.add(S.site, {
      name: "Vsakovací objekt dešťové vody",
      spec: "Vsakovací boxy / akumulační nádrž – dle hydrogeologie",
      unit: "m³",
      qty: roofsPlan * SI.rainwaterRetentionM3PerM2,
      scope: "exterior",
      calc: `půdorys střech ${fmt(roofsPlan, 1)} m² × ${fmt(SI.rainwaterRetentionM3PerM2)} m³/m²`,
    });
    bom.add(S.site, {
      name: "Dešťová kanalizace KG 125",
      spec: "Od svodů ke vsaku",
      unit: "m",
      qty: (houseRoof?.downpipes ?? 4) * 6 + 10,
      scope: "exterior",
      calc: `${houseRoof?.downpipes ?? 4} svodů × 6 m + 10 m od dílny`,
    });
  }

  // ============================================================ 18 PROJEKT & TDI
  bom.add(S.eng, {
    name: "Projektová dokumentace (DSP/DPS), statika, PENB a radonový průzkum",
    spec: "Architektonická a stavební část, statický výpočet, TZB, PENB, radon + geologie",
    unit: "kpl",
    qty: 1,
    calc: "paušál přípravy stavby",
  });
  bom.add(S.eng, {
    name: "Technický dozor investora (TDI), geodetické zaměření a Blower-Door test",
    spec: "Vytyčení stavby, kontrola armování/stropů/střechy, test neprůvzdušnosti",
    unit: "kpl",
    qty: 1,
    calc: "paušál realizace",
  });

  // ============================================================ SUMMARY
  const sections = bom.result();
  const windowsList = openings.filter(
    (o) => o.kind === "window" || o.kind === "hs",
  );
  const summary = {
    designId: design.id,
    designLabel: design.label,
    itemCount: sum(sections, (s) => s.items.length),
    builtUpArea: footprintArea,
    interiorArea,
    masonryArea: sum(masonryWalls, (w) => w.net) + (roofGeo?.gableArea ?? 0),
    windowCount: windowsList.length,
    windowArea: sum(windowsList, openingArea),
    doorCount: openings.filter(
      (o) => o.kind === "intDoor" || o.kind === "extDoor",
    ).length,
    roofArea: roofGeo?.area ?? 0,
    floorArea: screedArea,
    concreteVolume: sum(
      sections
        .flatMap((s) => s.items)
        .filter(
          (i) =>
            i.unit === "m³" &&
            /beton|ŽB/i.test(i.name + i.spec) &&
            i.scope === "house",
        ),
      (i) => i.qty,
    ),
  };

  return {
    sections,
    summary,
    warnings: bom.warnings,
    assumptions: BOM_ASSUMPTIONS,
  };
}

/** Filters sections by scope ('house' | 'aux' | 'exterior'). */
export function filterBomByScope(bomResult, scopes) {
  const set = new Set(scopes);
  return {
    ...bomResult,
    sections: bomResult.sections
      .map((s) => ({ ...s, items: s.items.filter((i) => set.has(i.scope)) }))
      .filter((s) => s.items.length > 0),
  };
}

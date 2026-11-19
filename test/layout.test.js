import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
  analyzeFloorLayout,
  analyzeDesignLayout,
  formatAnalysisReport,
} from '../src/analysis/LayoutAnalyzer.js';
import { generateFloorPlanSvg } from '../src/builders/FloorPlanSvgGenerator.js';
import { dreamHouseV1 } from '../src/designs/dreamHouseV1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, 'output');

function makeSyntheticDesign({ walls = [], furniture = [], rooms = [], extraFloor1 = {} } = {}) {
  const baseWalls = [
    {
      id: 'ext-n',
      name: 'Sever',
      from: [-4, -2.81],
      to: [4, -2.81],
      height: 2.9,
      thickness: 0.38,
      material: 'wall',
      openings: [],
    },
    {
      id: 'ext-s',
      name: 'Jih',
      from: [-4, 2.81],
      to: [4, 2.81],
      height: 2.9,
      thickness: 0.38,
      material: 'wall',
      openings: [],
    },
    {
      id: 'ext-e',
      name: 'Východ',
      from: [3.81, -2.62],
      to: [3.81, 2.62],
      height: 2.9,
      thickness: 0.38,
      material: 'wall',
      openings: [
        {
          type: 'door',
          name: 'Hlavní vchodové dveře',
          at: 2.62,
          width: 1.0,
          height: 2.1,
          sill: 0.22,
          swing: { hinge: 'start', dir: 'west' },
        },
      ],
    },
    {
      id: 'ext-w',
      name: 'Západ',
      from: [-3.81, -2.62],
      to: [-3.81, 2.62],
      height: 2.9,
      thickness: 0.38,
      material: 'wall',
      openings: [],
    },
    {
      id: 'part-mid',
      name: 'Příčka střed',
      from: [0, -2.62],
      to: [0, 2.62],
      height: 2.8,
      thickness: 0.16,
      material: 'partition',
      openings: [
        {
          type: 'opening',
          name: 'Dveře pokoj',
          at: 2.62,
          width: 0.85,
          height: 2.1,
          sill: 0.12,
          swing: { hinge: 'start', dir: 'west' },
        },
      ],
    },
  ];

  const baseRooms = [
    { id: '1.01', name: 'Hala', pos: [1.8, 1.1, -1.2] },
    { id: '1.02', name: 'Pokoj', pos: [-2.0, 1.1, 1.2] },
  ];

  const floor1 = {
    elevation: 0,
    finishes: [{ name: 'Podlaha', material: 'woodFloor', size: [7.6, 5.6], thickness: 0.2, pos: [0, 0] }],
    walls: walls.length ? walls : baseWalls,
    furniture,
    rooms: rooms.length ? rooms : baseRooms,
    ...extraFloor1,
  };

  return {
    id: 'synthetic',
    label: 'Syntetický testovací dům',
    footprint: { width: 8, length: 6 },
    wallThickness: 0.38,
    floor1,
  };
}

describe('Analýza dispozice domu (LayoutAnalyzer)', () => {
  before(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  describe('Jednotkové testy geometrických a ergonomických kontrol', () => {
    it('1. čistá referenční dispozice projde bez chyb a všechny místnosti jsou přístupné', () => {
      const design = makeSyntheticDesign({
        furniture: [
          { type: 'bed', name: 'Dvoulůžko', pos: [-2.1, -1.6], size: [1.8, 0.52, 2.0] },
          { type: 'diningTable', name: 'Jídelní stůl', pos: [1.6, 1.3], size: [1.4, 0.76, 0.85] },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      assert.equal(res.counts.errors, 0, `Nečekané chyby: ${JSON.stringify(res.issues)}`);
      assert.equal(res.counts.warnings, 0, `Nečekaná varování: ${JSON.stringify(res.issues)}`);
      assert.ok(res.circulation.rooms.every((r) => r.reachable), 'Všechny místnosti musí být přístupné');
    });

    it('2. odhalí přesah nábytku za vnitřní líc obvodové zdi', () => {
      const design = makeSyntheticDesign({
        furniture: [
          // innerMaxZ = 2.62; bed reaches 2.85 -> protrusion 23 cm
          { type: 'bed', name: 'Postel přes zeď', pos: [-2.0, 1.85], size: [1.4, 0.52, 2.0] },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      const issue = res.issues.find((i) => i.code === 'FURN_EXTERIOR_PROTRUSION');
      assert.ok(issue, 'Musí detekovat FURN_EXTERIOR_PROTRUSION');
      assert.equal(issue.severity, 'error');
      assert.ok(issue.measuredM > 0.2, `Přesah musí být > 20 cm, naměřeno ${issue.measuredM}`);
    });

    it('3. nábytek přisazený těsně ke stěně (0–10 mm) nevyvolá falešnou kolizi', () => {
      const design = makeSyntheticDesign({
        furniture: [
          // Flush against north inner wall (-2.62) and west inner wall (-3.62 + 0.005 overlap)
          { type: 'wardrobe', name: 'Skříň u zdi', pos: [-2.1, -2.315], size: [2.0, 2.1, 0.61] },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      const wallHits = res.issues.filter((i) => i.category === 'collision-wall');
      assert.equal(wallHits.length, 0, 'Lícování se zdí do 15 mm nesmí hlásit kolizi');
    });

    it('4. odhalí překryv nábytku >= 3 cm a toleruje skříňku pod horním ramenem schodiště', () => {
      const design = makeSyntheticDesign({
        furniture: [
          { type: 'desk', name: 'Stůl', pos: [-2.0, 1.5], size: [1.2, 0.75, 0.7] },
          { type: 'wardrobe', name: 'Skříň v kolizi', pos: [-2.0, 1.1], size: [1.0, 2.0, 0.6] },
          {
            type: 'stairs',
            layout: 'u-turn',
            name: 'Schodiště',
            xStart: -0.5,
            xLanding: -2.58,
            xEnd: -3.62,
            zFlight1: [-2.5, -1.55],
            zFlight2: [-1.45, -0.5],
            stepsPerFlight: 8,
            totalRise: 3.07,
          },
          {
            type: 'wardrobe',
            name: 'Úložný prostor pod schodištěm',
            pos: [-1.8, -0.95],
            size: [0.8, 1.5, 0.85],
          },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      const furnHits = res.issues.filter((i) => i.code === 'FURN_FURN_OVERLAP');
      assert.equal(furnHits.length, 1, 'Musí nahlásit přesně jednu kolizi Stůl × Skříň');
      const stairHits = res.issues.filter((i) => i.code === 'FURN_STAIR_OVERLAP');
      assert.equal(stairHits.length, 0, 'Skříňka pod druhým ramenem schodiště nesmí kolidovat');
    });

    it('5. přesná kontrola kruhové výseče dveří: zachytí kolizi, ale ne falešně roh mimo oblouk', () => {
      // Door part-mid at x=0: swings West (-X) from x=-0.08, hinge z=-0.425, r=0.85 -> arc in x ∈ [-0.93, -0.08], z ∈ [-0.425, 0.425]
      const designHit = makeSyntheticDesign({
        furniture: [
          { type: 'coffeeTable', name: 'Stolek v oblouku', pos: [-0.55, 0.0], size: [0.5, 0.4, 0.5] },
        ],
      });
      const resHit = analyzeFloorLayout(designHit.floor1, designHit, '1np');
      assert.ok(
        resHit.issues.some((i) => i.code === 'DOOR_SWING_FURN'),
        'Musí detekovat nábytek v oblouku dveří'
      );

      // Corner of bounding box: hinge (-0.08, -0.425), r=0.85 -> point (-0.82, 0.30) is dist 1.03 > 0.85
      const designMiss = makeSyntheticDesign({
        furniture: [
          { type: 'coffeeTable', name: 'Stolek v rohu mimo oblouk', pos: [-0.98, 0.45], size: [0.32, 0.4, 0.32] },
        ],
      });
      const resMiss = analyzeFloorLayout(designMiss.floor1, designMiss, '1np');
      assert.ok(
        !resMiss.issues.some((i) => i.code === 'DOOR_SWING_FURN'),
        'Nábytek v rohu opsaného čtverce mimo čtvrtkruh nesmí hlásit kolizi'
      );
    });

    it('6. odhalí vzájemnou kolizi dvou dveřních křídel', () => {
      const design = makeSyntheticDesign({
        walls: [
          { id: 'ext-n', name: 'S', from: [-4, -2.81], to: [4, -2.81], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          { id: 'ext-s', name: 'J', from: [-4, 2.81], to: [4, 2.81], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          { id: 'ext-e', name: 'V', from: [3.81, -2.62], to: [3.81, 2.62], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          { id: 'ext-w', name: 'Z', from: [-3.81, -2.62], to: [-3.81, 2.62], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          {
            id: 'wall-a',
            name: 'Chodba A',
            from: [0, -2.62],
            to: [0, 2.62],
            height: 2.8,
            thickness: 0.16,
            material: 'partition',
            openings: [
              { type: 'opening', name: 'Dveře A', at: 2.62, width: 0.9, height: 2.1, swing: { hinge: 'start', dir: 'east' } },
            ],
          },
          {
            id: 'wall-b',
            name: 'Chodba B',
            from: [-0.08, -0.5],
            to: [2.0, -0.5],
            height: 2.8,
            thickness: 0.16,
            material: 'partition',
            openings: [
              { type: 'opening', name: 'Dveře B', at: 0.65, width: 0.9, height: 2.1, swing: { hinge: 'start', dir: 'south' } },
            ],
          },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      assert.ok(
        res.issues.some((i) => i.code === 'DOOR_SWING_DOOR'),
        'Musí detekovat srážku křídel dvou dveří'
      );
    });

    it('7. odhalí zablokovaný průchod za dveřmi a neprůchozí místnost v grafu průchodnosti', () => {
      // part-mid door swings West; East side is non-swing side -> place vanity right in doorway on East
      const design = makeSyntheticDesign({
        furniture: [
          { type: 'vanity', name: 'Blokující umývátko', pos: [0.35, 0.0], size: [0.45, 0.8, 0.55] },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      assert.ok(
        res.issues.some((i) => i.code === 'DOOR_PASSAGE_BLOCKED'),
        'Musí odhalit zablokovaný průchod dveřmi (DOOR_PASSAGE_BLOCKED)'
      );
      assert.ok(
        res.issues.some((i) => i.code === 'ROOM_UNREACHABLE' && i.roomId === '1.02'),
        'Musí označit místnost 1.02 jako neprůchozí (ROOM_UNREACHABLE)'
      );
    });

    it('8. odhalí ergonomické závady (kuchyň, dvoulůžko, stůl, krb, plovoucí sanita)', () => {
      const design = makeSyntheticDesign({
        furniture: [
          // Kitchen island vs dining table only 65 cm apart
          { type: 'kitchenIsland', name: 'Ostrůvek', pos: [1.6, -1.6], size: [1.6, 0.9, 0.9] },
          { type: 'diningTable', name: 'Jídelní stůl', pos: [1.6, -0.05], size: [1.6, 0.76, 0.9] },
          // Double bed with < 35 cm on east side against partition
          { type: 'bed', name: 'Dvoulůžko těsné', pos: [-1.2, -1.6], size: [1.8, 0.52, 2.0] },
          // Desk facing west wall with bed 45 cm behind chair side
          { type: 'desk', name: 'Stůl těsný', pos: [-3.25, 1.4], size: [0.7, 0.75, 1.3] },
          { type: 'wardrobe', name: 'Skříň za stolem', pos: [-2.15, 1.4], size: [0.6, 2.1, 1.4] },
          // Floating WC > 12 cm from wall
          { type: 'wc', name: 'Plovoucí WC', pos: [2.5, 1.6], size: [0.45, 0.45, 0.55] },
          // Single bed with headboard floating 35 cm from south wall
          { type: 'bed', name: 'Plovoucí postel', pos: [3.0, 1.25], size: [1.0, 0.52, 2.0] },
          // Fireplace < 40 cm from bed
          { type: 'fireplace', name: 'Krb', pos: [-2.3, -0.35], size: [0.5, 1.2, 0.4] },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      const codes = new Set(res.issues.map((i) => i.code));
      assert.ok(codes.has('ERGONOMICS_KITCHEN_GAP'), 'Musí hlásit úzký odstup ostrůvek–stůl');
      assert.ok(codes.has('ERGONOMICS_BED_SIDE'), 'Musí hlásit úzký průchod kolem dvoulůžka');
      assert.ok(codes.has('ERGONOMICS_DESK_CHAIR'), 'Musí hlásit málo místa za psacím stolem');
      assert.ok(codes.has('SANITARY_NOT_MOUNTED'), 'Musí hlásit WC odskočené od stěny');
      assert.ok(codes.has('BED_HEADBOARD_FLOATING'), 'Musí hlásit postel s čelem odskočeným od stěny');
      assert.ok(codes.has('FIREPLACE_SAFETY'), 'Musí hlásit malý požární odstup krbu');
    });

    it('9. ověří schodiště (Lehmannův vzorec 2h + b)', () => {
      const validDesign = makeSyntheticDesign({
        furniture: [
          {
            type: 'stairs',
            layout: 'u-turn',
            name: 'Schodiště OK',
            xStart: -0.5,
            xLanding: -2.58,
            xEnd: -3.62,
            zFlight1: [-2.4, -1.45],
            zFlight2: [-1.35, -0.4],
            stepsPerFlight: 8,
            totalRise: 3.07,
          },
        ],
      });
      const resValid = analyzeFloorLayout(validDesign.floor1, validDesign, '1np');
      assert.equal(resValid.issues.filter((i) => i.category === 'stairs').length, 0);

      const badDesign = makeSyntheticDesign({
        furniture: [
          {
            type: 'stairs',
            layout: 'u-turn',
            name: 'Příkré schodiště',
            xStart: -0.5,
            xLanding: -2.1,
            xEnd: -3.0,
            zFlight1: [-2.4, -1.65],
            zFlight2: [-1.55, -0.8],
            stepsPerFlight: 8,
            totalRise: 3.8,
          },
        ],
      });
      const resBad = analyzeFloorLayout(badDesign.floor1, badDesign, '1np');
      const stairCodes = new Set(resBad.issues.filter((i) => i.category === 'stairs').map((i) => i.code));
      assert.ok(stairCodes.has('STAIR_RISER_HIGH'), 'Musí hlásit vysoký stupeň');
      assert.ok(stairCodes.has('STAIR_RUN_SHORT'), 'Musí hlásit krátký nášlap');
      assert.ok(stairCodes.has('STAIR_WIDTH_NARROW'), 'Musí hlásit úzké rameno');
    });

    it('10. odhalí překryv štítku místnosti s nábytkem', () => {
      const design = makeSyntheticDesign({
        furniture: [
          { type: 'diningTable', name: 'Stůl pod štítkem', pos: [1.8, -1.2], size: [1.4, 0.76, 0.9] },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      assert.ok(
        res.issues.some((i) => i.code === 'ROOM_STAMP_OVERLAP' && i.roomId === '1.01'),
        'Musí detekovat překryv popisku místnosti 1.01 se stolem'
      );
    });

    it('11. sanita pod vysokým oknem (parapet >= 70 cm) je uznána jako přisazená ke stěně', () => {
      const design = makeSyntheticDesign({
        walls: [
          { id: 'ext-n', name: 'S', from: [-4, -2.81], to: [4, -2.81], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          { id: 'ext-s', name: 'J', from: [-4, 2.81], to: [4, 2.81], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          {
            id: 'ext-e',
            name: 'V',
            from: [3.81, -2.62],
            to: [3.81, 2.62],
            height: 2.9,
            thickness: 0.38,
            material: 'wall',
            openings: [
              { type: 'window', name: 'Vysoké okno WC', at: 1.2, width: 0.8, height: 0.8, sill: 1.42 },
            ],
          },
          { id: 'ext-w', name: 'Z', from: [-3.81, -2.62], to: [-3.81, 2.62], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
        ],
        furniture: [
          { type: 'wc', name: 'WC pod oknem', pos: [3.29, -1.42], size: [0.65, 0.45, 0.45] },
        ],
        rooms: [{ id: '1.01', name: 'Koupelna', pos: [0, 1.1, 0] }],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      assert.ok(
        !res.issues.some((i) => i.code === 'SANITARY_NOT_MOUNTED'),
        'WC pod vysokým oknem nesmí falešně hlásit SANITARY_NOT_MOUNTED'
      );
    });

    it('12. odhalí blokování vstupu otevřeným křídlem sousedních dveří, těsný doraz u nábytku a pouzdro v nosné zdi', () => {
      const design = makeSyntheticDesign({
        walls: [
          { id: 'ext-n', name: 'S', from: [-4, -2.81], to: [4, -2.81], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          { id: 'ext-s', name: 'J', from: [-4, 2.81], to: [4, 2.81], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          { id: 'ext-e', name: 'V', from: [3.81, -2.62], to: [3.81, 2.62], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          { id: 'ext-w', name: 'Z', from: [-3.81, -2.62], to: [-3.81, 2.62], height: 2.9, thickness: 0.38, material: 'wall', openings: [] },
          // Vertical wall with door A swinging West at south corner (hinge at end z=1.74 -> open leaf at z=1.74, x=-0.88..-0.08)
          {
            id: 'wall-vert',
            name: 'Východní stěna haly',
            from: [0, -2.62],
            to: [0, 1.82],
            height: 2.8,
            thickness: 0.16,
            material: 'partition',
            openings: [
              {
                type: 'opening',
                name: 'Dveře WC blokující',
                at: 3.96,
                width: 0.8,
                height: 2.1,
                swing: { hinge: 'end', dir: 'west' },
              },
              {
                type: 'opening',
                name: 'Dveře těsně u skříně',
                at: 1.0,
                width: 0.8,
                height: 2.1,
                swing: { hinge: 'start', dir: 'east' },
              },
            ],
          },
          // Horizontal wall right at z=1.90 with door B at x=-0.95..-0.05 (mouth zone overlaps door A open leaf at z=1.74!)
          {
            id: 'wall-horiz',
            name: 'Jižní stěna haly',
            from: [-3.62, 1.9],
            to: [3.62, 1.9],
            height: 2.8,
            thickness: 0.16,
            material: 'partition',
            structural: true,
            openings: [
              {
                type: 'opening',
                name: 'Dveře pokoj blokované',
                at: 3.12,
                width: 0.9,
                height: 2.1,
                swing: { hinge: 'start', dir: 'south' },
              },
              {
                type: 'door',
                name: 'Posuvné dveře v nosné zdi',
                at: 5.5,
                width: 1.0,
                height: 2.1,
                sliding: { dir: 'west', pocket: true },
              },
            ],
          },
        ],
        furniture: [
          // Wardrobe placed 5 cm North of 'Dveře těsně u skříně' open leaf (hinge z=-2.02, open leaf x=0.08..0.88, z=-2.02)
          { type: 'wardrobe', name: 'Skříň těsně u křídla', pos: [0.5, -2.39], size: [0.8, 2.1, 0.6] },
        ],
      });

      const res = analyzeFloorLayout(design.floor1, design, '1np');
      const codes = new Set(res.issues.map((i) => i.code));
      assert.ok(codes.has('DOOR_SWING_BLOCKS_DOORWAY'), 'Musí odhalit otevřené křídlo blokující vstup sousedních dveří');
      assert.ok(codes.has('DOOR_LEAF_CLEARANCE_TIGHT'), 'Musí odhalit křídlo otevřené < 10 cm od nábytku');
      assert.ok(codes.has('POCKET_IN_STRUCTURAL_WALL'), 'Musí upozornit na stavební pouzdro v nosné stěně');
    });
  });

  describe('Integrační testy nad reálným modelem domu a SVG/PNG výstupy', () => {
    it('zanalyzuje výchozí model domu (concept) a vytvoří čitelný report', () => {
      const report = analyzeDesignLayout(dreamHouseV1);
      assert.equal(report.designId, dreamHouseV1.id);
      assert.ok(report.floor1, 'Musí obsahovat analýzu 1.NP');
      assert.ok(report.floor2, 'Musí obsahovat analýzu 2.NP');
      assert.ok(report.floor1.stairsMetrics, '1.NP musí mít spočítané parametry schodiště');
      assert.equal(report.floor1.circulation.rooms.length, 7, '1.NP má 7 interiérových místností');
      assert.equal(report.floor2.circulation.rooms.length, 8, '2.NP má 8 interiérových místností');
      assert.equal(
        report.summary.errors,
        0,
        `Model ${dreamHouseV1.id} nesmí mít žádné chyby dispozice: ${JSON.stringify([
          ...(report.floor1?.issues || []).filter((i) => i.severity === 'error'),
          ...(report.floor2?.issues || []).filter((i) => i.severity === 'error'),
        ])}`
      );
      assert.equal(
        report.summary.warnings,
        0,
        `Model ${dreamHouseV1.id} nesmí mít žádná ergonomická varování dispozice: ${JSON.stringify([
          ...(report.floor1?.issues || []).filter((i) => i.severity === 'warning'),
          ...(report.floor2?.issues || []).filter((i) => i.severity === 'warning'),
        ])}`
      );
      assert.ok(
        report.floor1.circulation.rooms.every((r) => r.reachable),
        'Všechny místnosti 1.NP musí být přístupné'
      );
      assert.ok(
        report.floor2.circulation.rooms.every((r) => r.reachable),
        'Všechny místnosti 2.NP musí být přístupné'
      );

      const formatted = formatAnalysisReport(report);
      assert.match(formatted, /ANALÝZA DISPOZICE/);
      assert.match(formatted, /1\.NP/);
      assert.match(formatted, /2\.NP/);
    });

    it('SVG výkres respektuje volbu showAnalysis (výchozí false vs aktivní true)', () => {
      const cleanSvg = generateFloorPlanSvg(dreamHouseV1, { sheet: '1np' });
      assert.ok(!cleanSvg.includes('class="layer-analysis"'), 'Výchozí výkres nesmí obsahovat diagnostickou vrstvu');
      assert.ok(!cleanSvg.includes('KONTROLA DISPOZICE'), 'Výchozí výkres nesmí obsahovat panel kontroly');

      const auditSvg = generateFloorPlanSvg(dreamHouseV1, { sheet: '1np', showAnalysis: true });
      assert.ok(auditSvg.includes('class="layer-analysis"'), 'Auditní výkres musí obsahovat vrstvu layer-analysis');
      assert.ok(auditSvg.includes('KONTROLA DISPOZICE'), 'Auditní výkres musí obsahovat panel kontroly v bočním sloupci');
    });

    it('vyrenderuje auditní výkresy 1.NP, 2.NP a both do SVG a PNG pro vizuální kontrolu', () => {
      const specs = [
        { sheet: '1np', width: 2000, baseName: 'pudorys-1np-analysis' },
        { sheet: '2np', width: 2000, baseName: 'pudorys-2np-analysis' },
        { sheet: 'both', width: 3200, baseName: 'pudorys-both-analysis' },
      ];

      for (const spec of specs) {
        const svg = generateFloorPlanSvg(dreamHouseV1, { sheet: spec.sheet, showAnalysis: true });
        const resvg = new Resvg(svg, {
          fitTo: { mode: 'width', value: spec.width },
          font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
        });
        const png = resvg.render().asPng();

        assert.equal(png[0], 0x89);
        assert.equal(png[1], 0x50);
        assert.equal(png[2], 0x4e);
        assert.equal(png[3], 0x47);
        assert.ok(png.length > 100000);

        const pngPath = path.join(OUTPUT_DIR, `${spec.baseName}.png`);
        const svgPath = path.join(OUTPUT_DIR, `${spec.baseName}.svg`);
        fs.writeFileSync(pngPath, png);
        fs.writeFileSync(svgPath, svg, 'utf8');

        assert.ok(fs.existsSync(pngPath));
        assert.ok(fs.existsSync(svgPath));
      }
    });
  });
});

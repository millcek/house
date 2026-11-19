import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { generateFloorPlanSvg } from '../src/builders/FloorPlanSvgGenerator.js';
import { extractElevationData } from '../src/builders/ElevationSvgGenerator.js';
import { extractSectionData } from '../src/builders/SectionSvgGenerator.js';
import { dreamHouseV1 } from '../src/designs/dreamHouseV1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, 'output');

/**
 * Utility to render an SVG floor plan string to a PNG Buffer using Resvg.
 *
 * @param {string} svgContent
 * @param {number} [width=2000]
 * @returns {Buffer} PNG image buffer
 */
export function renderSvgToPng(svgContent, width = 2000) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: width },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Helvetica',
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}

/**
 * High-level helper: generates floor plan SVG and converts it to PNG.
 *
 * @param {object} designConfig
 * @param {object} options
 * @param {number} [width=2000]
 * @returns {{ svg: string, png: Buffer }}
 */
export function generateFloorPlanImage(designConfig, options = {}, width = 2000) {
  const svg = generateFloorPlanSvg(designConfig, options);
  const png = renderSvgToPng(svg, width);
  return { svg, png };
}

describe('Výkres půdorysu (Floor Plan CAD Drawings)', () => {
  before(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  describe('Generování SVG výkresů', () => {
    it('vygeneruje platný SVG výkres pro 1.NP s kompletními vrstvami', () => {
      const svg = generateFloorPlanSvg(dreamHouseV1, { sheet: '1np' });

      assert.ok(svg.startsWith('<svg'), 'Výkres musí začínat tagem <svg');
      assert.ok(svg.endsWith('</svg>'), 'Výkres musí končit tagem </svg>');
      assert.match(svg, /viewBox="0 0 \d+ \d+"/, 'Výkres musí obsahovat viewBox');
      assert.match(svg, /PŮDORYS 1\.NP/i, 'Výkres musí mít nadpis pro 1.NP');
      assert.match(svg, /TABULKA MÍSTNOSTÍ — 1\.NP/, 'Výkres musí obsahovat tabulku místností 1.NP');
      assert.match(svg, /class="layer-walls"/, 'Výkres musí obsahovat vrstvu zdí');
      assert.match(svg, /class="layer-rooms"/, 'Výkres musí obsahovat vrstvu místností');
      assert.match(svg, /class="layer-openings"/, 'Výkres musí obsahovat vrstvu otvorů (okna, dveře)');
      assert.match(svg, /class="layer-furniture"/, 'Výkres musí obsahovat vrstvu zařizovacích předmětů');
      assert.match(svg, /class="layer-ext-dims"/, 'Výkres musí obsahovat vnější kótovací řetězce');
      assert.match(svg, /class="layer-int-dims"/, 'Výkres musí obsahovat vnitřní kóty');
      assert.match(svg, /RODINNÝ DŮM 6\+KK/, 'Výkres musí mít vyplněné rohové razítko projektu');
      assert.match(svg, /OSA DOMU/, 'Výkres musí obsahovat osu domu v severce');
      assert.match(svg, /Skutečný sever \(S\)/, 'Výkres musí obsahovat popis skutečného severu v severce');
      assert.match(svg, /rotate\(26\.50/, 'Severka musí mít šipku natočenou o skutečný sever (+26,5°)');
    });

    it('vygeneruje platný SVG výkres pro 2.NP s patrovými místnostmi a kótami', () => {
      const svg = generateFloorPlanSvg(dreamHouseV1, { sheet: '2np' });

      assert.match(svg, /PŮDORYS 2\.NP/i, 'Výkres musí mít nadpis pro 2.NP');
      assert.match(svg, /TABULKA MÍSTNOSTÍ — 2\.NP/, 'Výkres musí obsahovat tabulku místností 2.NP');
      assert.match(svg, /Ložnice/i, 'Musí obsahovat ložnici v 2.NP');
      assert.match(svg, /Dětský pokoj/i, 'Musí obsahovat dětské pokoje v 2.NP');

      const intDimsMatch = svg.match(/<g class="layer-int-dims">[\s\S]*?<\/g>/);
      assert.ok(intDimsMatch, 'Výkres 2.NP musí obsahovat vrstvu vnitřních kót');
      const intDims = intDimsMatch[0];

      // Vodorovný kótovací řetězec přes ložnici (2.02) a koupelnu (2.04) na y = -490
      assert.match(intDims, /<line class="cad-dim-line"[^>]*y1="-490"[^>]*y2="-490"/, 'Chybí vodorovná kóta severních místností (y = -490)');
      assert.match(intDims, />3\u00A0278<\/text>/, 'Chybí šířková kóta ložnice 2.02 (3 278 mm)');
      assert.match(intDims, />3\u00A0838<\/text>/, 'Chybí šířková kóta koupelny 2.04 (3 838 mm)');
      assert.match(intDims, />2\u00A0498<\/text>/, 'Chybí šířková kóta pracovny 2.03 / WC 2.05 (2 498 mm)');

      // Svislé kóty hloubky ložnice 2.02 (3 618 mm) a dětských pokojů 2.07/2.08 (3 558 mm)
      assert.match(intDims, />3\u00A0618<\/text>/, 'Chybí hloubková kóta ložnice 2.02 (3 618 mm)');
      const depth3558Matches = intDims.match(/>3\u00A0558<\/text>/g) || [];
      assert.ok(depth3558Matches.length >= 2, `Očekávány alespoň 2 hloubkové kóty dětských pokojů 3 558 mm, nalezeno ${depth3558Matches.length}`);
      assert.match(intDims, />3\u00A0815<\/text>/, 'Chybí hloubková kóta pracovny 2.03 (3 815 mm)');
    });

    it('vygeneruje sdružený výkres obou podlaží (both)', () => {
      const svg = generateFloorPlanSvg(dreamHouseV1, { sheet: 'both' });

      assert.match(svg, /PŮDORYS 1\.NP/i, 'Musí obsahovat 1.NP');
      assert.match(svg, /PŮDORYS 2\.NP/i, 'Musí obsahovat 2.NP');
      assert.match(svg, /CELKOVÁ UŽITNÁ PLOCHA DOMU/i, 'Musí obsahovat celkový souhrn obou podlaží');
    });

    it('respektuje volby vrstev a jednotek', () => {
      const svgBezKót = generateFloorPlanSvg(dreamHouseV1, {
        sheet: '1np',
        showDimensions: false,
        showInteriorDims: false,
        showFurniture: false,
        units: 'm',
      });

      // Běžný nábytek (stoly, sedací souprava, postele) nesmí být vykreslen
      assert.ok(!svgBezKót.includes('class="cad-furn"'), 'Běžný nábytek musí být skryt');
      assert.ok(!svgBezKót.includes('class="layer-int-dims"'), 'Vnitřní kóty musí být skryty');
      assert.ok(!svgBezKót.includes('class="layer-ext-dims"'), 'Vnější kóty musí být skryty');
      assert.ok(!svgBezKót.includes('class="layer-section-lines"'), 'Čáry řezů musí být skryty při vypnutých kótách');
      assert.match(svgBezKót, /<text class="cad-title-val"[^>]*>m<\/text>/, 'Jednotky v razítku musí být metry');

      const svg1np = generateFloorPlanSvg(dreamHouseV1, { sheet: '1np' });
      assert.match(svg1np, /class="layer-section-lines"/, 'Půdorys 1.NP musí obsahovat čáry řezů');
      assert.match(svg1np, /class="cad-sec-label"[^>]*>A<\/text>/);
      assert.match(svg1np, /class="cad-sec-label"[^>]*>A'<\/text>/);
      assert.match(svg1np, /class="cad-sec-label"[^>]*>B<\/text>/);
      assert.match(svg1np, /class="cad-sec-label"[^>]*>B'<\/text>/);
    });

    it('vygeneruje platný SVG výkres všech 4 pohledů (elevations)', () => {
      const elevData = extractElevationData(dreamHouseV1);
      const fmtElev = (m) => `${m >= 0 ? '+' : '-'}${Math.abs(m).toFixed(3).replace('.', ',')}`;
      const pitchStr = `${elevData.roof.pitchDeg.toFixed(1).replace('.', ',')}°`;

      const svg = generateFloorPlanSvg(dreamHouseV1, { sheet: 'elevations' });

      assert.ok(svg.startsWith('<svg'), 'Výkres pohledů musí začínat tagem <svg');
      assert.ok(svg.endsWith('</svg>'), 'Výkres pohledů musí končit tagem </svg>');
      assert.match(svg, /viewBox="0 0 \d+ \d+"/, 'Výkres musí obsahovat viewBox');
      assert.match(svg, /POHLED VÝCHODNÍ \(V\)/);
      assert.match(svg, /POHLED JIŽNÍ \(J\)/);
      assert.match(svg, /POHLED ZÁPADNÍ \(Z\)/);
      assert.match(svg, /POHLED SEVERNÍ \(S\)/);
      assert.ok(svg.includes(fmtElev(elevData.levels.ridgeTopY)), 'Musí obsahovat kótu hřebene');
      assert.ok(svg.includes(fmtElev(elevData.levels.wallTopY)), 'Musí obsahovat kótu pozednice');
      assert.ok(svg.includes(fmtElev(elevData.levels.f2StructY)), 'Musí obsahovat kótu 2.NP');
      assert.ok(svg.includes(fmtElev(elevData.levels.f1FinishY)), 'Musí obsahovat kótu 1.NP');
      assert.ok(svg.includes(fmtElev(elevData.levels.gradeY)), 'Musí obsahovat kótu UT');
      assert.ok(svg.includes(pitchStr), `Musí obsahovat sklon střechy ${pitchStr}`);
      assert.match(svg, />O1<\/text>/);
      assert.match(svg, />DV1<\/text>/);
      assert.match(svg, />DV2<\/text>/);
      assert.match(svg, /class="layer-facade"/);
      assert.match(svg, /class="layer-roof"/);
      assert.match(svg, /class="layer-terrain"/);
      assert.match(svg, /cad-pergola-timber/);
      assert.match(svg, /cad-canopy-glass/);
      assert.ok(!svg.includes('class="cad-chimney"'), 'Pohledy nesmí obsahovat zrušený komín');
      assert.match(svg, /RODINNÝ DŮM 6\+KK/);
    });

    it('respektuje volby vrstev a jednotek na výkresu pohledů (elevations)', () => {
      const svgMin = generateFloorPlanSvg(dreamHouseV1, {
        sheet: 'elevations',
        showDimensions: false,
        showInteriorDims: false,
        showOpeningTags: false,
        showHatches: false,
        units: 'm',
      });

      assert.ok(!svgMin.includes('class="layer-ext-dims"'), 'Kóty a výškové značky musí být skryty');
      assert.ok(!svgMin.includes('class="layer-interior-refs"'), 'Vnitřní referenční hladiny musí být skryty');
      assert.ok(!svgMin.includes('class="layer-opening-tags"'), 'Značky otvorů musí být skryty');
      assert.ok(!svgMin.includes('url(#elev-roof-tiles)'), 'Šrafování střechy musí být vypnuto');
      assert.match(svgMin, /<text class="cad-title-val"[^>]*>m<\/text>/, 'Jednotky v razítku musí být metry');
    });

    it('vygeneruje platný SVG výkres svislých řezů A-A\' a B-B\' (sections)', () => {
      const secData = extractSectionData(dreamHouseV1);
      const fmtElev = (m) => `${m >= 0 ? '+' : '-'}${Math.abs(m).toFixed(3).replace('.', ',')}`;
      const pitchStr = `${secData.roof.pitchDeg.toFixed(1).replace('.', ',')}°`;

      const svg = generateFloorPlanSvg(dreamHouseV1, { sheet: 'sections' });

      assert.ok(svg.startsWith('<svg'), 'Výkres řezů musí začínat tagem <svg');
      assert.ok(svg.endsWith('</svg>'), 'Výkres řezů musí končit tagem </svg>');
      assert.match(svg, /viewBox="0 0 \d+ \d+"/, 'Výkres musí obsahovat viewBox');
      assert.match(svg, /ŘEZ A-A' — PŘÍČNÝ ŘEZ/);
      assert.match(svg, /ŘEZ B-B' — PODÉLNÝ ŘEZ/);
      assert.match(svg, /class="layer-earth-foundations"/);
      assert.match(svg, /class="layer-roof-structure"/);
      assert.match(svg, /class="layer-slabs-stairs"/);
      assert.match(svg, /class="layer-cut-walls"/);
      assert.match(svg, /class="layer-rooms"/);
      assert.match(svg, /class="layer-int-dims"/);
      assert.match(svg, /class="layer-ext-dims"/);
      assert.match(svg, /SKLADBY KONSTRUKCÍ V ŘEZU/);
      assert.match(svg, />Z1<\/text>/);
      assert.match(svg, />P1<\/text>/);
      assert.match(svg, />S1<\/text>/);
      assert.match(svg, />ST1<\/text>/);
      assert.match(svg, />ST2<\/text>/);
      assert.ok(svg.includes(fmtElev(secData.levels.ridgeTopY)));
      assert.ok(svg.includes(fmtElev(secData.levels.c2BottomY)));
      assert.ok(svg.includes(fmtElev(secData.levels.f2FinishY)));
      assert.ok(svg.includes(fmtElev(secData.levels.f1FinishY)));
      assert.ok(svg.includes(fmtElev(secData.levels.gradeY)));
      assert.ok(svg.includes(fmtElev(secData.levels.footingBottomY)));
      assert.ok(svg.includes(pitchStr));
      if (secData.stairs) {
        assert.ok(svg.includes(secData.stairs.formulaText), 'Řez A-A\' musí obsahovat vzorec schodiště');
      }
      assert.match(svg, /RODINNÝ DŮM 6\+KK/);
    });

    it('respektuje volby vrstev a jednotek na výkresu řezů (sections)', () => {
      const svgMin = generateFloorPlanSvg(dreamHouseV1, {
        sheet: 'sections',
        showDimensions: false,
        showInteriorDims: false,
        showOpeningTags: false,
        showHatches: false,
        units: 'm',
      });

      assert.ok(!svgMin.includes('class="layer-ext-dims"'), 'Vnější kóty musí být skryty');
      assert.ok(!svgMin.includes('class="layer-int-dims"'), 'Vnitřní kóty musí být skryty');
      assert.ok(!svgMin.includes('class="layer-opening-tags"'), 'Značky otvorů a skladeb musí být skryty');
      assert.ok(!svgMin.includes('url(#sec-hatch-masonry)'), 'Šrafování zdiva musí být vypnuto');
      assert.match(svgMin, /<text class="cad-title-val"[^>]*>m<\/text>/, 'Jednotky v razítku musí být metry');
    });
  });

  describe('Vykreslení výkresu do rastrového obrázku (PNG)', () => {
    it('vyrenderuje výkres 1.NP do PNG a uloží obrázek pro vizuální kontrolu', () => {
      const { svg, png } = generateFloorPlanImage(dreamHouseV1, { sheet: '1np' }, 2000);

      // Ověření PNG hlavičky (Magic bytes: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A)
      assert.equal(png[0], 0x89);
      assert.equal(png[1], 0x50); // P
      assert.equal(png[2], 0x4e); // N
      assert.equal(png[3], 0x47); // G
      assert.ok(png.length > 100000, `PNG obrázek 1.NP má ${png.length} bajtů (očekáváno > 100 kB)`);

      const pngPath = path.join(OUTPUT_DIR, 'pudorys-1np.png');
      const svgPath = path.join(OUTPUT_DIR, 'pudorys-1np.svg');
      fs.writeFileSync(pngPath, png);
      fs.writeFileSync(svgPath, svg, 'utf8');

      assert.ok(fs.existsSync(pngPath), 'Soubor pudorys-1np.png musí existovat');
      assert.ok(fs.existsSync(svgPath), 'Soubor pudorys-1np.svg musí existovat');
    });

    it('vyrenderuje výkres 2.NP do PNG', () => {
      const { svg, png } = generateFloorPlanImage(dreamHouseV1, { sheet: '2np' }, 2000);

      assert.equal(png[0], 0x89);
      assert.ok(png.length > 100000, `PNG obrázek 2.NP má ${png.length} bajtů`);

      const pngPath = path.join(OUTPUT_DIR, 'pudorys-2np.png');
      const svgPath = path.join(OUTPUT_DIR, 'pudorys-2np.svg');
      fs.writeFileSync(pngPath, png);
      fs.writeFileSync(svgPath, svg, 'utf8');

      assert.ok(fs.existsSync(pngPath));
      assert.ok(fs.existsSync(svgPath));
    });

    it('vyrenderuje sdružený výkres obou podlaží (both) do vysokého rozlišení', () => {
      const { svg, png } = generateFloorPlanImage(dreamHouseV1, { sheet: 'both' }, 3200);

      assert.equal(png[0], 0x89);
      assert.ok(png.length > 300000, `PNG obrázek both má ${png.length} bajtů`);

      const pngPath = path.join(OUTPUT_DIR, 'pudorys-both.png');
      const svgPath = path.join(OUTPUT_DIR, 'pudorys-both.svg');
      fs.writeFileSync(pngPath, png);
      fs.writeFileSync(svgPath, svg, 'utf8');

      assert.ok(fs.existsSync(pngPath));
      assert.ok(fs.existsSync(svgPath));
    });

    it('vyrenderuje všechny 4 pohledy (elevations) do PNG pro vizuální kontrolu', () => {
      const { svg, png } = generateFloorPlanImage(dreamHouseV1, { sheet: 'elevations' }, 3200);

      assert.equal(png[0], 0x89);
      assert.ok(png.length > 200000, `PNG obrázek pohledů má ${png.length} bajtů (očekáváno > 200 kB)`);

      const pngPath = path.join(OUTPUT_DIR, 'pohledy.png');
      const svgPath = path.join(OUTPUT_DIR, 'pohledy.svg');
      fs.writeFileSync(pngPath, png);
      fs.writeFileSync(svgPath, svg, 'utf8');

      assert.ok(fs.existsSync(pngPath));
      assert.ok(fs.existsSync(svgPath));
    });

    it('vyrenderuje svislé řezy A-A\' a B-B\' (sections) do PNG pro vizuální kontrolu', () => {
      const { svg, png } = generateFloorPlanImage(dreamHouseV1, { sheet: 'sections' }, 3200);

      assert.equal(png[0], 0x89);
      assert.ok(png.length > 200000, `PNG obrázek řezů má ${png.length} bajtů (očekáváno > 200 kB)`);

      const pngPath = path.join(OUTPUT_DIR, 'rezy.png');
      const svgPath = path.join(OUTPUT_DIR, 'rezy.svg');
      fs.writeFileSync(pngPath, png);
      fs.writeFileSync(svgPath, svg, 'utf8');

      assert.ok(fs.existsSync(pngPath));
      assert.ok(fs.existsSync(svgPath));
    });
  });
});

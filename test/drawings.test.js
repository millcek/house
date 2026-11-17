import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { generateFloorPlanSvg } from '../src/builders/FloorPlanSvgGenerator.js';
import { dreamHouseV1 } from '../src/designs/dreamHouseV1.js';
import { listDesignVariants } from '../src/designs/index.js';

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
    });

    it('vygeneruje platný SVG výkres pro 2.NP s patrovými místnostmi a kótami', () => {
      const svg = generateFloorPlanSvg(dreamHouseV1, { sheet: '2np' });

      assert.match(svg, /PŮDORYS 2\.NP/i, 'Výkres musí mít nadpis pro 2.NP');
      assert.match(svg, /TABULKA MÍSTNOSTÍ — 2\.NP/, 'Výkres musí obsahovat tabulku místností 2.NP');
      assert.match(svg, /Ložnice/i, 'Musí obsahovat ložnici v 2.NP');
      assert.match(svg, /Dětský pokoj/i, 'Musí obsahovat dětské pokoje v 2.NP');
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
      assert.match(svgBezKót, /<text class="cad-title-val"[^>]*>m<\/text>/, 'Jednotky v razítku musí být metry');
    });

    it('podporuje všechny designové varianty', () => {
      const variants = listDesignVariants();
      assert.ok(variants.length >= 3, 'Musí existovat alespoň 3 varianty');

      for (const variant of variants) {
        const svg = generateFloorPlanSvg(variant, { sheet: '1np' });
        assert.ok(svg.length > 10000, `Varianta ${variant.id || variant.label} musí vygenerovat SVG`);
      }
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
  });
});

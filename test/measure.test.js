import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNumberWithSpaces,
  calculateDistance,
  calculatePolygonAreaAndPerimeter,
  applyOrthoConstraint,
  findNearestSnapPoint,
} from '../src/ui/DrawingMeasureController.js';

describe('Nástroj na měření ve výkresech (Drawing Measure Tool)', () => {
  describe('Formátování čísel a mezer', () => {
    it('správně formátuje tisíce s pevnou mezerou', () => {
      assert.strictEqual(formatNumberWithSpaces(500), '500');
      assert.strictEqual(formatNumberWithSpaces(1000), '1\u00A0000');
      assert.strictEqual(formatNumberWithSpaces(3450), '3\u00A0450');
      assert.strictEqual(formatNumberWithSpaces(12500), '12\u00A0500');
    });
  });

  describe('Výpočet vzdálenosti (Distance, ΔX, ΔY)', () => {
    it('spočítá vodorovnou vzdálenost (100 SVG jednotek = 1.0 m = 1000 mm)', () => {
      const p1 = { x: 100, y: 200 };
      const p2 = { x: 500, y: 200 }; // 400 SVG jednotek = 4.0 m
      const resMm = calculateDistance(p1, p2, 'mm');

      assert.strictEqual(resMm.distSvg, 400);
      assert.strictEqual(resMm.distM, 4.0);
      assert.strictEqual(resMm.distMm, 4000);
      assert.strictEqual(resMm.dxMm, 4000);
      assert.strictEqual(resMm.dyMm, 0);
      assert.strictEqual(resMm.formattedDist, '4\u00A0000\u00A0mm');
      assert.strictEqual(resMm.formattedSecondary, '4.00\u00A0m');

      const resM = calculateDistance(p1, p2, 'm');
      assert.strictEqual(resM.formattedDist, '4.00\u00A0m');
      assert.strictEqual(resM.formattedSecondary, '4\u00A0000\u00A0mm');
    });

    it('spočítá svislou vzdálenost', () => {
      const p1 = { x: 300, y: 150 };
      const p2 = { x: 300, y: 475 }; // 325 SVG jednotek = 3.25 m
      const res = calculateDistance(p1, p2, 'mm');

      assert.strictEqual(res.distSvg, 325);
      assert.strictEqual(res.distM, 3.25);
      assert.strictEqual(res.distMm, 3250);
      assert.strictEqual(res.dxMm, 0);
      assert.strictEqual(res.dyMm, 3250);
      assert.strictEqual(res.formattedDist, '3\u00A0250\u00A0mm');
    });

    it('spočítá šikmou vzdálenost a delty (Pythagorova věta 3-4-5)', () => {
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 400, y: 500 }; // dx = 300, dy = 400 -> dist = 500 SVG jednotek = 5.0 m
      const res = calculateDistance(p1, p2, 'mm');

      assert.strictEqual(res.distSvg, 500);
      assert.strictEqual(res.distM, 5.0);
      assert.strictEqual(res.distMm, 5000);
      assert.strictEqual(res.dxMm, 3000);
      assert.strictEqual(res.dyMm, 4000);
      assert.strictEqual(res.formattedDist, '5\u00A0000\u00A0mm');
    });
  });

  describe('Výpočet plochy a obvodu mnohoúhelníku (Shoelace formula)', () => {
    it('vrátí nulu pro méně než 3 body', () => {
      const empty = calculatePolygonAreaAndPerimeter([]);
      assert.strictEqual(empty.areaM2, 0);
      assert.strictEqual(empty.perimeterM, 0);

      const twoPts = calculatePolygonAreaAndPerimeter([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]);
      assert.strictEqual(twoPts.areaM2, 0);
    });

    it('spočítá plochu a obvod pravoúhlého trojúhelníku 3m × 4m', () => {
      // 300 x 400 SVG jednotek
      const points = [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 0, y: 400 },
      ];
      const res = calculatePolygonAreaAndPerimeter(points, 'mm');

      // Plocha = (3 * 4) / 2 = 6.0 m²
      assert.strictEqual(res.areaM2, 6.0);
      assert.strictEqual(res.formattedArea, '6.00\u00A0m²');

      // Obvod = 3 + 4 + 5 = 12.0 m = 12 000 mm
      assert.strictEqual(res.perimeterM, 12.0);
      assert.strictEqual(res.perimeterMm, 12000);
      assert.strictEqual(res.formattedPerimeter, '12\u00A0000\u00A0mm');

      // Těžiště = (100, 133.3)
      assert.strictEqual(res.centroid.x, 100);
      assert.strictEqual(res.centroid.y, 133.3);
    });

    it('spočítá plochu a obvod obdélníkové místnosti 6m × 4.5m', () => {
      // 600 × 450 SVG jednotek
      const points = [
        { x: 100, y: 100 },
        { x: 700, y: 100 },
        { x: 700, y: 550 },
        { x: 100, y: 550 },
      ];
      const res = calculatePolygonAreaAndPerimeter(points, 'm');

      // Plocha = 6.0 * 4.5 = 27.0 m²
      assert.strictEqual(res.areaM2, 27.0);
      assert.strictEqual(res.formattedArea, '27.00\u00A0m²');

      // Obvod = 2 * (6 + 4.5) = 21.0 m
      assert.strictEqual(res.perimeterM, 21.0);
      assert.strictEqual(res.formattedPerimeter, '21.00\u00A0m');

      // Těžiště = (400, 325)
      assert.strictEqual(res.centroid.x, 400);
      assert.strictEqual(res.centroid.y, 325);
    });

    it('spočítá plochu nepravidelného půdorysu tvaru L', () => {
      // Místnost L: 4x4m s výřezem 2x2m -> Plocha = 16 - 4 = 12 m²
      const points = [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 200 },
        { x: 200, y: 200 },
        { x: 200, y: 400 },
        { x: 0, y: 400 },
      ];
      const res = calculatePolygonAreaAndPerimeter(points, 'mm');

      assert.strictEqual(res.areaM2, 12.0);
      assert.strictEqual(res.perimeterM, 16.0);
      assert.strictEqual(res.perimeterMm, 16000);
    });
  });

  describe('Pravoúhlé vedení (Ortho constraint 0° / 45° / 90°)', () => {
    const origin = { x: 200, y: 200 };

    it('přichytí k vodorovné ose (0°)', () => {
      const target = { x: 500, y: 215 }; // mírně šikmo
      const ortho = applyOrthoConstraint(origin, target);

      assert.strictEqual(ortho.angleDeg, 0);
      assert.strictEqual(ortho.y, 200);
      assert.ok(ortho.x > 490);
    });

    it('přichytí ke svislé ose (90°)', () => {
      const target = { x: 210, y: 600 };
      const ortho = applyOrthoConstraint(origin, target);

      assert.strictEqual(ortho.angleDeg, 90);
      assert.strictEqual(ortho.x, 200);
      assert.ok(ortho.y > 590);
    });

    it('přichytí k úhlu 45°', () => {
      const target = { x: 400, y: 390 }; // blízko 45°
      const ortho = applyOrthoConstraint(origin, target);

      assert.strictEqual(ortho.angleDeg, 45);
      // Při 45° musí platit dx == dy
      const dx = Math.round(ortho.x - origin.x);
      const dy = Math.round(ortho.y - origin.y);
      assert.strictEqual(dx, dy);
    });
  });

  describe('Přichytávání k bodům (Snap logic)', () => {
    const snapPoints = [
      { x: 100, y: 100, type: 'corner' },
      { x: 500, y: 100, type: 'corner' },
      { x: 300, y: 100, type: 'midpoint' },
    ];

    it('najde nejbližší bod v dosahu snap radiusu', () => {
      const cursor = { x: 105, y: 104 }; // vzdálenost ~6.4 SVG jednotek
      const hit = findNearestSnapPoint(cursor, snapPoints, 16);

      assert.ok(hit !== null);
      assert.strictEqual(hit.x, 100);
      assert.strictEqual(hit.y, 100);
      assert.strictEqual(hit.type, 'corner');
    });

    it('vrátí null, pokud je kurzor mimo snap radius', () => {
      const cursor = { x: 200, y: 200 }; // daleko od všech bodů
      const hit = findNearestSnapPoint(cursor, snapPoints, 16);

      assert.strictEqual(hit, null);
    });
  });
});

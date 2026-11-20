import { computeFloorBounds, computeRoomSchedule, getWallBox } from './RoomBuilder.js';
import { buildOpeningSchedule } from '../exports/ProjectSchedules.js';
import { BOM_SPEC } from '../budget/specifications.js';

const SCALE = 100; // 1 m = 100 SVG units (1:50 architectural sheet)

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function m2svg(val) {
  return Number((val * SCALE).toFixed(2));
}

function e2svgY(yMeters) {
  return Number((-yMeters * SCALE).toFixed(2));
}

function formatLength(meters, units = 'mm') {
  if (units === 'm') {
    return meters.toFixed(2).replace('.', ',');
  }
  const mm = Math.round(meters * 1000);
  return mm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

function formatElevation(meters) {
  if (Math.abs(meters) < 0.0005) return '±0,000';
  const sign = meters >= 0 ? '+' : '-';
  return `${sign}${Math.abs(meters).toFixed(3).replace('.', ',')}`;
}

function sortUnique(vals, tol = 0.005) {
  const sorted = [...vals].filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1] > tol) {
      out.push(Number(v.toFixed(4)));
    }
  }
  return out;
}

/**
 * Subtracts a list of 1D cutout intervals from `[minU, maxU]`.
 */
function subtractIntervals(minU, maxU, holes) {
  let segs = [[minU, maxU]];
  for (const [hMin, hMax] of holes) {
    const next = [];
    for (const [a, b] of segs) {
      if (hMax <= a + 0.005 || hMin >= b - 0.005) {
        next.push([a, b]);
      } else {
        if (hMin > a + 0.005) next.push([a, hMin]);
        if (hMax < b - 0.005) next.push([hMax, b]);
      }
    }
    segs = next;
  }
  return segs;
}

/**
 * Computes canonical section cut planes `A-A'` (transverse across staircase) and
 * `B-B'` (longitudinal through vertical shaft, central spine wall, and wet core).
 *
 * @param {Object} designConfig
 * @returns {{ AA: { axis: 'x', cutZ: number, lookDir: 'north', label: string }, BB: { axis: 'z', cutX: number, lookDir: 'west', label: string } }}
 */
export function computeSectionPlanes(designConfig = {}) {
  const stairs = (designConfig.floor1?.furniture || []).find((f) => f.type === 'stairs');
  const cutZ = stairs?.zFlight2
    ? Number(((stairs.zFlight2[0] + stairs.zFlight2[1]) / 2).toFixed(3))
    : -0.35;

  const holes = designConfig.ceilingSlab?.holes || [];
  const shaftHole = holes.find(
    (h) => Math.abs(h.x2 - h.x1) < 1.2 && Math.abs(h.z2 - h.z1) < 1.2
  );
  const cutX = shaftHole
    ? Number(((shaftHole.x1 + shaftHole.x2) / 2).toFixed(3))
    : Number(((designConfig.footprint?.width ?? 8.0) * 0.2).toFixed(3));

  return {
    AA: { axis: 'x', cutZ, lookDir: 'north', label: "A-A'" },
    BB: { axis: 'z', cutX, lookDir: 'west', label: "B-B'" },
  };
}

function resolveOpeningCenter(op) {
  if (typeof op.at === 'number') return op.at;
  if (typeof op.offset === 'number') return op.offset;
  return 0;
}

function classifyWallKind(wall) {
  if ((wall.material || 'wall') === 'wall') return 'exterior';
  if (wall.structural === true) return 'structural';
  if (wall.construction === 'sdk') return 'sdk';
  return 'partition';
}

function findCutOpeningOnWall(wall, floorKey, floorElev, cutCoord, cutAlongX, tagByKey) {
  const [x1, z1] = wall.from;
  const [x2, z2] = wall.to;
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len <= 0.001) return null;
  const ux = (x2 - x1) / len;
  const uz = (z2 - z1) / len;
  const wallId = wall.id || wall.name || 'wall';

  const openings = wall.openings || [];
  for (let i = 0; i < openings.length; i++) {
    const op = openings[i];
    const center = resolveOpeningCenter(op);
    const ox = x1 + ux * center;
    const oz = z1 + uz * center;
    // Along-wall coordinate is Z when AA slices vertical walls, X when BB slices horizontal walls
    const opCoord = cutAlongX ? oz : ox;
    if (Math.abs(cutCoord - opCoord) <= op.width / 2 - 0.01) {
      const yBottom = Number((floorElev + (op.sill ?? 0)).toFixed(4));
      const yTop = Number((yBottom + op.height).toFixed(4));
      const mark = tagByKey.get(`${floorKey}|${wallId}|${i}`) || '';
      return {
        mark,
        name: op.name || '',
        isDoor: op.type === 'door' || Boolean(op.swing),
        isSliding: Boolean(op.sliding),
        yBottom,
        yTop,
      };
    }
  }
  return null;
}

function projectRoomSpan(bounds, cutAlongX) {
  if (!bounds) return null;
  if (cutAlongX) {
    return {
      uMin: bounds.minX,
      uMax: bounds.maxX,
      uCenter: (bounds.minX + bounds.maxX) / 2,
    };
  }
  return {
    uMin: -bounds.maxZ,
    uMax: -bounds.minZ,
    uCenter: -(bounds.minZ + bounds.maxZ) / 2,
  };
}

/**
 * Extracts parametric 2D vertical section geometry for `AA` (transverse) and `BB` (longitudinal)
 * from `designConfig` and `BOM_SPEC`. Shared between SVG and DXF generators.
 *
 * @param {Object} designConfig
 * @param {Object} [options]
 * @returns {Object}
 */
export function extractSectionData(designConfig, options = {}) {
  const spec = options.spec || BOM_SPEC;
  const planes = computeSectionPlanes(designConfig);
  const bounds1 = computeFloorBounds(designConfig.floor1, designConfig);
  const W = Number((bounds1.wallMaxX - bounds1.wallMinX).toFixed(4));
  const L = Number((bounds1.wallMaxZ - bounds1.wallMinZ).toFixed(4));

  const gradeY = -0.15;
  const baseSlabY = designConfig.floor1?.elevation ?? 0;
  const baseSlabThick = spec.foundations?.baseSlabThickness ?? 0.15;
  const baseSlabBottomY = Number((baseSlabY - baseSlabThick).toFixed(4));
  const gravelThick = spec.foundations?.gravelThickness ?? 0.15;
  const gravelBottomY = Number((baseSlabBottomY - gravelThick).toFixed(4));
  const zbBottomY = Number((baseSlabY - (spec.foundations?.plinthHeight ?? 0.5)).toFixed(4));
  const stripDepth = spec.foundations?.stripDepth ?? 0.8;
  const stripWidth = spec.foundations?.stripWidth ?? 0.6;
  const footingBottomY = Number(Math.min(zbBottomY - 0.45, gradeY - stripDepth - 0.05).toFixed(3));

  const f1FinishThick =
    (designConfig.floor1?.finishes || []).find((f) => f.material !== 'terrace')?.thickness ?? 0.22;
  const f1FinishY = Number((baseSlabY + f1FinishThick).toFixed(4));
  const c1BottomY = designConfig.ceilingSlab?.y ?? designConfig.floorHeight ?? 2.95;
  const c1Thick = designConfig.ceilingSlab?.thickness ?? 0.22;
  const f1SdkDrop = designConfig.ceiling1Sdk ? 0.10 : 0;
  const f1CeilingY = Number((c1BottomY - f1SdkDrop).toFixed(4));
  const f1ClearH = Number((f1CeilingY - f1FinishY).toFixed(2));

  const f2StructY = designConfig.floor2?.elevation ?? Number((c1BottomY + c1Thick).toFixed(4));
  const f2FinishThick =
    (designConfig.floor2?.finishes || []).find((f) => f.material !== 'terrace')?.thickness ?? 0.12;
  const f2FinishY = Number((f2StructY + f2FinishThick).toFixed(4));

  const c2BottomY = designConfig.ceiling2Slab?.y ?? designConfig.roof?.y ?? 6.12;
  const c2InsulThick =
    designConfig.ceiling2Slab?.thickness ?? spec.roof?.ceilingInsulationThickness ?? 0.35;
  const c2TopY = Number((c2BottomY + c2InsulThick).toFixed(4));
  const f2SdkDrop = 0.15;
  const f2CeilingY = Number((c2BottomY - f2SdkDrop).toFixed(4));
  const f2ClearH = Number((f2CeilingY - f2FinishY).toFixed(2));

  const roofDef = designConfig.roof || {
    width: W,
    length: L,
    height: 1.9,
    y: c2BottomY,
    ridgeAxis: 'z',
    eaveOverhang: 0.45,
    gableOverhang: 0.35,
    thickness: 0.22,
    truss: true,
  };
  const ridgeAxis = roofDef.ridgeAxis || 'z';
  const roofWidth = roofDef.width ?? W;
  const roofLength = roofDef.length ?? L;
  const roofHeight = roofDef.height ?? 1.9;
  const roofY = roofDef.y ?? c2BottomY;
  const eaveOverhang = roofDef.eaveOverhang ?? 0.45;
  const gableOverhang = roofDef.gableOverhang ?? 0.35;
  const roofThickness = roofDef.thickness ?? 0.22;
  const isTruss = Boolean(roofDef.truss);

  const halfSpan = (ridgeAxis === 'z' ? roofWidth : roofLength) / 2;
  const run = ridgeAxis === 'z' ? roofLength : roofWidth;
  const halfRun = run / 2;
  const slopeAngle = Math.atan2(roofHeight, halfSpan);
  const pitchDeg = Number(((slopeAngle * 180) / Math.PI).toFixed(1));
  const dyEave = Number((eaveOverhang * (roofHeight / halfSpan)).toFixed(4));
  const dyThick = Number((roofThickness / Math.cos(slopeAngle)).toFixed(4));
  const eaveBottomY = Number((roofY - dyEave).toFixed(4));
  const eaveTopY = Number((eaveBottomY + dyThick).toFixed(4));
  const gablePeakY = Number((roofY + roofHeight).toFixed(4));
  const ridgeTopY = Number((gablePeakY + dyThick).toFixed(4));
  const outerHalfSpan = Number((halfSpan + eaveOverhang).toFixed(4));
  const outerHalfRun = Number((halfRun + gableOverhang).toFixed(4));

  const openingSchedule =
    options.openingSchedule ||
    buildOpeningSchedule(designConfig, {
      siteConfig: options.siteConfig || null,
      housePos: options.housePos || null,
      spec,
    });

  // Staircase geometry (from floor1.furniture)
  const stairsDef = (designConfig.floor1?.furniture || []).find((f) => f.type === 'stairs');
  let stairs = null;
  if (stairsDef?.layout === 'u-turn') {
    const xStart = stairsDef.xStart ?? -0.5;
    const xLanding = stairsDef.xLanding ?? -2.58;
    const xEnd = stairsDef.xEnd ?? -3.62;
    const stepsPerFlight = stairsDef.stepsPerFlight ?? 8;
    const totalRise = stairsDef.totalRise ?? Number((f2FinishY - f1FinishY).toFixed(3));
    const yBase = stairsDef.yBase ?? f1FinishY;
    const totalRisers = stepsPerFlight * 2 + 2;
    const riserH = totalRise / totalRisers;
    const stepRun = Math.abs(xStart - xLanding) / stepsPerFlight;
    const dir = xLanding <= xStart ? -1 : 1;
    const yLanding = Number((yBase + (stepsPerFlight + 1) * riserH).toFixed(4));

    const flight1Steps = [];
    for (let s = 0; s < stepsPerFlight; s++) {
      const xA = xStart + dir * s * stepRun;
      const xB = xStart + dir * (s + 1) * stepRun;
      flight1Steps.push({
        uMin: Math.min(xA, xB),
        uMax: Math.max(xA, xB),
        yBot: yBase + s * riserH,
        yTop: yBase + (s + 1) * riserH,
      });
    }

    const flight2Steps = [];
    for (let s = 0; s < stepsPerFlight; s++) {
      const xA = xLanding - dir * s * stepRun;
      const xB = xLanding - dir * (s + 1) * stepRun;
      flight2Steps.push({
        uMin: Math.min(xA, xB),
        uMax: Math.max(xA, xB),
        yBot: yBase + (stepsPerFlight + 1 + s) * riserH,
        yTop: yBase + (stepsPerFlight + 2 + s) * riserH,
      });
    }

    stairs = {
      xStart,
      xLanding,
      xEnd,
      yBase,
      yLanding,
      yTop: Number((yBase + totalRise).toFixed(4)),
      riserH,
      stepRun,
      totalRisers,
      landingThickness: 0.18,
      waistThickness: 0.18,
      flight1Steps,
      flight2Steps,
      formulaText: `${totalRisers}× ${Math.round(riserH * 1000)}/${Math.round(stepRun * 1000)}`,
    };
  }

  // Entrance canopy (slice on AA if cutZ hits canopy Z span)
  const canopyDef = (designConfig.floor1?.furniture || []).find((f) => f.type === 'canopy');
  let canopy = null;
  if (canopyDef) {
    const cMinZ = canopyDef.pos[1] - canopyDef.size[2] / 2;
    const cMaxZ = canopyDef.pos[1] + canopyDef.size[2] / 2;
    if (planes.AA.cutZ >= cMinZ - 0.15 && planes.AA.cutZ <= cMaxZ + 0.15) {
      canopy = {
        uMin: canopyDef.pos[0] - canopyDef.size[0] / 2,
        uMax: canopyDef.pos[0] + canopyDef.size[0] / 2,
        yBottom: baseSlabY + (canopyDef.yOffset ?? 2.55),
        yTop: baseSlabY + (canopyDef.yOffset ?? 2.55) + canopyDef.size[1],
      };
    }
  }

  // Precompute room schedules for both floors
  const f1Rooms = computeRoomSchedule(designConfig.floor1?.rooms || [], designConfig.floor1).rooms;
  const f2Rooms = computeRoomSchedule(designConfig.floor2?.rooms || [], designConfig.floor2).rooms;

  const extThick = designConfig.wallThickness ?? 0.38;
  const eticsThick = 0.14;
  const masonryCoreExt = Number(Math.max(0.18, extThick - eticsThick).toFixed(3));

  const buildSingleSection = (key) => {
    const isAA = key === 'AA';
    const cutCoord = isAA ? planes.AA.cutZ : planes.BB.cutX;
    const wallMinU = isAA ? bounds1.wallMinX : -bounds1.wallMaxZ;
    const wallMaxU = isAA ? bounds1.wallMaxX : -bounds1.wallMinZ;
    const innerMinU = isAA ? bounds1.innerMinX : -bounds1.innerMaxZ;
    const innerMaxU = isAA ? bounds1.innerMaxX : -bounds1.innerMinZ;

    const cutWalls = { '1np': [], '2np': [] };
    for (const [fKey, fCfg, fElev, fCeilingTop] of [
      ['1np', designConfig.floor1, baseSlabY, c1BottomY],
      ['2np', designConfig.floor2, f2StructY, c2BottomY],
    ]) {
      if (!fCfg) continue;
      for (const wall of fCfg.walls || []) {
        const box = getWallBox(wall);
        const hits = isAA
          ? !box.isHorizontal && box.minZ <= cutCoord + 0.001 && box.maxZ >= cutCoord - 0.001
          : box.isHorizontal && box.minX <= cutCoord + 0.001 && box.maxX >= cutCoord - 0.001;
        if (!hits) continue;

        const uMin = isAA ? box.minX : -box.maxZ;
        const uMax = isAA ? box.maxX : -box.minZ;
        const kind = classifyWallKind(wall);
        const cutOpening = findCutOpeningOnWall(
          wall,
          fKey,
          fElev,
          cutCoord,
          isAA,
          openingSchedule.tagByKey
        );

        const yBase = fKey === '1np' ? baseSlabY : f2StructY;
        const wallHeight = wall.height ?? (fCeilingTop - yBase);
        const yTop = Math.min(fCeilingTop, Number((yBase + wallHeight).toFixed(4)));

        // Determine exterior vs core split for ETICS walls
        let coreMinU = uMin;
        let coreMaxU = uMax;
        let insulMinU = null;
        let insulMaxU = null;
        if (kind === 'exterior') {
          const isLeft = (uMin + uMax) / 2 < 0;
          if (isLeft) {
            insulMinU = uMin;
            insulMaxU = Number((uMin + eticsThick).toFixed(4));
            coreMinU = insulMaxU;
            coreMaxU = uMax;
          } else {
            coreMinU = uMin;
            coreMaxU = Number((uMax - eticsThick).toFixed(4));
            insulMinU = coreMaxU;
            insulMaxU = uMax;
          }
        }

        cutWalls[fKey].push({
          id: wall.id || wall.name,
          kind,
          thickness: box.thickness,
          uMin: Number(uMin.toFixed(4)),
          uMax: Number(uMax.toFixed(4)),
          uCenter: Number(((uMin + uMax) / 2).toFixed(4)),
          coreMinU: Number(coreMinU.toFixed(4)),
          coreMaxU: Number(coreMaxU.toFixed(4)),
          insulMinU,
          insulMaxU,
          yBottom: yBase,
          yTop,
          cutOpening,
        });
      }
      cutWalls[fKey].sort((a, b) => a.uCenter - b.uCenter);
    }

    // Strip footings under 1.NP exterior & structural cut walls
    const footings = [];
    for (const w of cutWalls['1np']) {
      if (w.kind !== 'exterior' && w.kind !== 'structural') continue;
      const coreCenter = (w.coreMinU + w.coreMaxU) / 2;
      const stemWidth = w.kind === 'exterior' ? 0.30 : Math.max(0.24, w.thickness);
      footings.push({
        kind: w.kind,
        uCenter: coreCenter,
        footingMinU: Number((coreCenter - stripWidth / 2).toFixed(4)),
        footingMaxU: Number((coreCenter + stripWidth / 2).toFixed(4)),
        stemMinU: Number((coreCenter - stemWidth / 2).toFixed(4)),
        stemMaxU: Number((coreCenter + stemWidth / 2).toFixed(4)),
        xpsMinU: w.insulMinU,
        xpsMaxU: w.insulMaxU,
      });
    }

    // Cut ceiling slab segments (subtracting STAIR_HOLE or SHAFT_HOLE)
    const cutHoles = [];
    let hasShaftCut = false;
    let shaftSpan = null;
    for (const hole of designConfig.ceilingSlab?.holes || []) {
      const hitsHole = isAA
        ? hole.z1 <= cutCoord && hole.z2 >= cutCoord
        : hole.x1 <= cutCoord && hole.x2 >= cutCoord;
      if (!hitsHole) continue;
      const hMin = isAA ? hole.x1 : -hole.z2;
      const hMax = isAA ? hole.x2 : -hole.z1;
      cutHoles.push([hMin, hMax]);
      if (Math.abs(hole.x2 - hole.x1) < 1.2 && Math.abs(hole.z2 - hole.z1) < 1.2) {
        hasShaftCut = true;
        shaftSpan = [Number(hMin.toFixed(4)), Number(hMax.toFixed(4))];
      }
    }

    const slabSegments = subtractIntervals(wallMinU, wallMaxU, cutHoles);
    const floor2FinishSegs = subtractIntervals(innerMinU, innerMaxU, cutHoles);
    const c2InsulSegs = shaftSpan
      ? subtractIntervals(innerMinU, innerMaxU, [shaftSpan])
      : [[innerMinU, innerMaxU]];

    // Rooms sliced by this plane
    const slicedRooms = { '1np': [], '2np': [] };
    for (const [fKey, rooms] of [
      ['1np', f1Rooms],
      ['2np', f2Rooms],
    ]) {
      for (const r of rooms) {
        if (!r.interior || !r.bounds) continue;
        const hitsRoom = isAA
          ? r.bounds.minZ <= cutCoord && r.bounds.maxZ >= cutCoord
          : r.bounds.minX <= cutCoord && r.bounds.maxX >= cutCoord;
        if (!hitsRoom) continue;
        const span = projectRoomSpan(r.bounds, isAA);
        if (!span || span.uMax - span.uMin < 0.35) continue;
        slicedRooms[fKey].push({
          id: r.id,
          name: r.name,
          areaSqm: r.areaSqm,
          uMin: Number(span.uMin.toFixed(4)),
          uMax: Number(span.uMax.toFixed(4)),
          uCenter: Number(span.uCenter.toFixed(4)),
        });
      }
      slicedRooms[fKey].sort((a, b) => a.uCenter - b.uCenter);
    }

    // Roof limits & attachments
    const roofMinU = isAA ? -outerHalfSpan : -outerHalfRun;
    const roofMaxU = isAA ? outerHalfSpan : outerHalfRun;
    const attachMaxU = isAA && canopy ? Math.max(roofMaxU, canopy.uMax) : roofMaxU;
    const totalMinU = roofMinU;
    const totalMaxU = attachMaxU;

    return {
      key,
      label: planes[key].label,
      title: isAA ? "ŘEZ A-A' — PŘÍČNÝ ŘEZ" : "ŘEZ B-B' — PODÉLNÝ ŘEZ",
      subtitle: isAA
        ? `Vedený schodištěm (Z = ${cutCoord.toFixed(2).replace('.', ',')} m) · pohled k severu`
        : `Vedený svislou šachtou VZT a nosnou stěnou (X = +${cutCoord.toFixed(2).replace('.', ',')} m) · pohled k západu`,
      isTransverse: isAA,
      cutCoord,
      wallMinU,
      wallMaxU,
      innerMinU,
      innerMaxU,
      roofMinU,
      roofMaxU,
      totalMinU,
      totalMaxU,
      cutWalls,
      footings,
      slabSegments,
      floor2FinishSegs,
      c2InsulSegs,
      cutHoles,
      hasShaftCut,
      shaftSpan,
      stairs: isAA ? stairs : null,
      canopy: isAA ? canopy : null,
      slicedRooms,
    };
  };

  return {
    planes,
    bounds: bounds1,
    footprint: { width: W, length: L },
    materialsInfo: { extThick, eticsThick, masonryCoreExt },
    levels: {
      footingBottomY,
      zbBottomY,
      gravelBottomY,
      baseSlabBottomY,
      gradeY,
      baseSlabY,
      f1FinishY,
      f1CeilingY,
      c1BottomY,
      f2StructY,
      f2FinishY,
      f2CeilingY,
      c2BottomY,
      c2TopY,
      eaveBottomY,
      eaveTopY,
      gablePeakY,
      ridgeTopY,
      f1ClearH,
      f2ClearH,
    },
    roof: {
      ridgeAxis,
      width: roofWidth,
      length: roofLength,
      height: roofHeight,
      y: roofY,
      eaveOverhang,
      gableOverhang,
      thickness: roofThickness,
      halfSpan,
      halfRun,
      outerHalfSpan,
      outerHalfRun,
      slopeAngle,
      pitchDeg,
      dyEave,
      dyThick,
      isTruss,
    },
    stairs,
    openingSchedule,
    sections: {
      AA: buildSingleSection('AA'),
      BB: buildSingleSection('BB'),
    },
  };
}

function buildSectionDefsAndStyles() {
  return `
  <defs>
    <style type="text/css"><![CDATA[
      .cad-sheet-bg { fill: #ffffff; }
      .cad-border-outer { fill: none; stroke: #0f172a; stroke-width: 3; }
      .cad-border-inner { fill: none; stroke: #334155; stroke-width: 1; }
      .cad-divider { stroke: #cbd5e1; stroke-width: 1.2; stroke-dasharray: 10 6; }
      .cad-sec-heading { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 800; fill: #0f172a; letter-spacing: 0.04em; }
      .cad-sec-sub { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: #475569; }
      .cad-cut-concrete { stroke: #0f172a; stroke-width: 1.8; stroke-linejoin: miter; }
      .cad-cut-masonry { stroke: #0f172a; stroke-width: 2.0; stroke-linejoin: miter; }
      .cad-cut-part { stroke: #334155; stroke-width: 1.5; stroke-linejoin: miter; }
      .cad-cut-sdk { stroke: #334155; stroke-width: 1.3; stroke-linejoin: miter; }
      .cad-cut-insul { stroke: #475569; stroke-width: 1.0; stroke-linejoin: miter; }
      .cad-cut-timber { stroke: #78350f; stroke-width: 1.2; stroke-linejoin: miter; }
      .cad-elev-back { fill: #f8fafc; stroke: #64748b; stroke-width: 1.0; }
      .cad-win-frame { fill: #334155; stroke: #0f172a; stroke-width: 1.1; }
      .cad-win-glass { fill: #bae6fd; stroke: #0284c7; stroke-width: 1.2; }
      .cad-roof-cover { fill: #475569; stroke: #0f172a; stroke-width: 1.6; }
      .cad-waterproof { stroke: #0f172a; stroke-width: 2.2; stroke-dasharray: 10 3; }
      .cad-ground-line { stroke: #0f172a; stroke-width: 3.0; stroke-linecap: square; }
      .cad-dim-line { stroke: #334155; stroke-width: 0.85; fill: none; }
      .cad-dim-ext { stroke: #94a3b8; stroke-width: 0.65; fill: none; }
      .cad-dim-tick { stroke: #0f172a; stroke-width: 1.3; }
      .cad-dim-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: #0f172a; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px; stroke-linejoin: round; }
      .cad-elev-tri-fill { fill: #0f172a; stroke: #0f172a; stroke-width: 1; }
      .cad-elev-tri-empty { fill: #ffffff; stroke: #0f172a; stroke-width: 1; }
      .cad-elev-text { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 700; fill: #0f172a; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.2px; stroke-linejoin: round; }
      .cad-room-id-bg { fill: #0f172a; rx: 2.5; }
      .cad-room-id-txt { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; font-weight: 700; fill: #ffffff; text-anchor: middle; }
      .cad-room-name { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 10px; font-weight: 700; fill: #1e293b; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.2px; stroke-linejoin: round; }
      .cad-tag-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9.5px; font-weight: 700; fill: #1d4ed8; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px; stroke-linejoin: round; }
      .cad-callout-bg { fill: #eff6ff; stroke: #2563eb; stroke-width: 1; rx: 3; }
      .cad-callout-txt { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; font-weight: 700; fill: #1d4ed8; text-anchor: middle; }
      .cad-micro-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9px; font-weight: 600; fill: #475569; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round; }
      .cad-panel-box { fill: #f8fafc; stroke: #334155; stroke-width: 1.2; }
      .cad-panel-head { fill: #0f172a; }
      .cad-panel-head-txt { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11.5px; font-weight: 700; fill: #ffffff; letter-spacing: 0.05em; }
      .cad-table-txt { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: #0f172a; }
      .cad-table-num { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; fill: #0f172a; text-anchor: end; }
      .cad-table-row-line { stroke: #cbd5e1; stroke-width: 0.7; }
      .cad-title-main { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 18px; font-weight: 800; fill: #0f172a; }
      .cad-title-sub { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: #1d4ed8; }
      .cad-title-label { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9.5px; font-weight: 600; fill: #64748b; text-transform: uppercase; }
      .cad-title-val { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11.5px; font-weight: 700; fill: #0f172a; }
    ]]></style>
    <pattern id="sec-hatch-concrete" width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="#cbd5e1" />
      <line x1="0" y1="12" x2="12" y2="0" stroke="#475569" stroke-width="0.9" />
      <polygon points="3,3 5,4 4,6" fill="#334155" opacity="0.65" />
      <circle cx="9" cy="8.5" r="0.8" fill="#334155" opacity="0.7" />
    </pattern>
    <pattern id="sec-hatch-masonry" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#e2e8f0" />
      <line x1="0" y1="0" x2="0" y2="8" stroke="#334155" stroke-width="1.5" />
    </pattern>
    <pattern id="sec-hatch-part" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="7" height="7" fill="#f1f5f9" />
      <line x1="0" y1="0" x2="0" y2="7" stroke="#64748b" stroke-width="1.0" />
    </pattern>
    <pattern id="sec-hatch-sdk" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="#f8fafc" />
      <line x1="3" y1="0" x2="3" y2="6" stroke="#94a3b8" stroke-width="0.7" stroke-dasharray="2 2" />
    </pattern>
    <pattern id="sec-hatch-insul" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#fef3c7" />
      <path d="M 0 5 Q 2.5 1 5 5 T 10 5" fill="none" stroke="#b45309" stroke-width="0.9" stroke-opacity="0.75" />
    </pattern>
    <pattern id="sec-hatch-gravel" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#e2e8f0" />
      <circle cx="2.5" cy="3" r="1.2" fill="#64748b" />
      <circle cx="7.5" cy="2.5" r="0.9" fill="#475569" />
      <circle cx="5" cy="7.5" r="1.1" fill="#64748b" />
      <circle cx="9" cy="7" r="0.8" fill="#94a3b8" />
    </pattern>
    <pattern id="sec-hatch-earth" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="14" fill="#f1f5f9" />
      <line x1="0" y1="0" x2="0" y2="14" stroke="#94a3b8" stroke-width="1.2" />
      <line x1="7" y1="0" x2="7" y2="14" stroke="#cbd5e1" stroke-width="0.9" />
    </pattern>
    <pattern id="sec-hatch-timber" width="12" height="6" patternUnits="userSpaceOnUse">
      <rect width="12" height="6" fill="#fde68a" />
      <line x1="0" y1="3" x2="12" y2="3" stroke="#b45309" stroke-width="0.6" stroke-opacity="0.45" />
    </pattern>
  </defs>`;
}

function renderElevationMarkerSvg(tipX, tipY, elevM, align = 'left', pointUp = false) {
  const triW = 8;
  const triH = 11;
  const leader = 62;
  const dir = align === 'right' ? 1 : -1;
  const endX = tipX + dir * leader;
  const anchor = align === 'right' ? 'end' : 'start';
  const textX = endX - dir * 3;
  const baseDy = pointUp ? triH : -triH;
  const textY = pointUp ? tipY + triH + 11 : tipY - 4;
  const label = formatElevation(elevM);

  return `
    <g class="cad-elev-marker">
      <line x1="${tipX.toFixed(1)}" y1="${tipY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${tipY.toFixed(1)}" stroke="#0f172a" stroke-width="1.05" />
      <polygon class="cad-elev-tri-fill" points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${(tipX - triW).toFixed(1)},${(tipY + baseDy).toFixed(1)} ${tipX.toFixed(1)},${(tipY + baseDy).toFixed(1)}" />
      <polygon class="cad-elev-tri-empty" points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${(tipX + triW).toFixed(1)},${(tipY + baseDy).toFixed(1)} ${tipX.toFixed(1)},${(tipY + baseDy).toFixed(1)}" />
      <text class="cad-elev-text" x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text>
    </g>`;
}

function renderVerticalDimChainSvg(yNodesM, uLineM, uExtStartM, units = 'mm', textOffsetPx = -11) {
  if (!yNodesM || yNodesM.length < 2) return '';
  const xLine = m2svg(uLineM);
  const xExtStart = uExtStartM !== null ? m2svg(uExtStartM) : null;
  const overshoot = xExtStart !== null ? 14 * (Math.sign(xLine - xExtStart) || 1) : 0;
  const tick = 7;

  const parts = [];
  parts.push(
    `<line class="cad-dim-line" x1="${xLine}" y1="${e2svgY(yNodesM[0])}" x2="${xLine}" y2="${e2svgY(yNodesM[yNodesM.length - 1])}" />`
  );

  for (const ym of yNodesM) {
    const yp = e2svgY(ym);
    if (xExtStart !== null) {
      parts.push(`<line class="cad-dim-ext" x1="${xExtStart}" y1="${yp}" x2="${xLine + overshoot}" y2="${yp}" />`);
    }
    parts.push(`<line class="cad-dim-tick" x1="${xLine - tick}" y1="${yp + tick}" x2="${xLine + tick}" y2="${yp - tick}" />`);
  }

  for (let i = 0; i < yNodesM.length - 1; i++) {
    const span = yNodesM[i + 1] - yNodesM[i];
    if (span <= 0.01) continue;
    const midY = e2svgY((yNodesM[i] + yNodesM[i + 1]) / 2);
    const tx = xLine + textOffsetPx;
    parts.push(
      `<text class="cad-dim-text" x="${tx}" y="${midY}" transform="rotate(-90 ${tx} ${midY})">${esc(formatLength(span, units))}</text>`
    );
  }
  return parts.join('\n');
}

function renderHorizontalDimChainSvg(uNodesM, yLineM, yExtStartM, units = 'mm', textOffsetPx = 14) {
  if (!uNodesM || uNodesM.length < 2) return '';
  const yLine = e2svgY(yLineM);
  const yExtStart = yExtStartM !== null ? e2svgY(yExtStartM) : null;
  const overshoot = yExtStart !== null ? 14 * (Math.sign(yLine - yExtStart) || 1) : 0;
  const tick = 7;

  const parts = [];
  parts.push(
    `<line class="cad-dim-line" x1="${m2svg(uNodesM[0])}" y1="${yLine}" x2="${m2svg(uNodesM[uNodesM.length - 1])}" y2="${yLine}" />`
  );

  for (const um of uNodesM) {
    const xp = m2svg(um);
    if (yExtStart !== null) {
      parts.push(`<line class="cad-dim-ext" x1="${xp}" y1="${yExtStart}" x2="${xp}" y2="${yLine + overshoot}" />`);
    }
    parts.push(`<line class="cad-dim-tick" x1="${xp - tick}" y1="${yLine + tick}" x2="${xp + tick}" y2="${yLine - tick}" />`);
  }

  for (let i = 0; i < uNodesM.length - 1; i++) {
    const span = uNodesM[i + 1] - uNodesM[i];
    if (span <= 0.01) continue;
    const midX = m2svg((uNodesM[i] + uNodesM[i + 1]) / 2);
    parts.push(`<text class="cad-dim-text" x="${midX}" y="${yLine + textOffsetPx}">${esc(formatLength(span, units))}</text>`);
  }
  return parts.join('\n');
}

function fillFor(patternId, fallbackColor, showHatches) {
  return showHatches ? `url(#${patternId})` : fallbackColor;
}

function renderFoundationsAndFloor1Svg(data, sec, showHatches) {
  const L = data.levels;
  const parts = [];
  parts.push('<g class="layer-earth-foundations">');

  const concreteFill = fillFor('sec-hatch-concrete', '#e2e8f0', showHatches);
  const gravelFill = fillFor('sec-hatch-gravel', '#f1f5f9', showHatches);
  const insulFill = fillFor('sec-hatch-insul', '#fef9c3', showHatches);
  const earthFill = fillFor('sec-hatch-earth', '#ffffff', showHatches);

  const gLeftM = sec.totalMinU - 0.8;
  const gRightM = sec.totalMaxU + 0.8;
  const gLeft = m2svg(gLeftM);
  const gRight = m2svg(gRightM);
  const wMinX = m2svg(sec.wallMinU);
  const wMaxX = m2svg(sec.wallMaxU);

  // Earth strips outside house + undisturbed soil below gravel
  if (showHatches) {
    parts.push(
      `<rect fill="${earthFill}" x="${gLeft}" y="${e2svgY(L.gradeY)}" width="${wMinX - gLeft}" height="${e2svgY(L.footingBottomY - 0.15) - e2svgY(L.gradeY)}" />`
    );
    parts.push(
      `<rect fill="${earthFill}" x="${wMaxX}" y="${e2svgY(L.gradeY)}" width="${gRight - wMaxX}" height="${e2svgY(L.footingBottomY - 0.15) - e2svgY(L.gradeY)}" />`
    );
    parts.push(
      `<rect fill="${earthFill}" x="${wMinX}" y="${e2svgY(L.gravelBottomY)}" width="${wMaxX - wMinX}" height="${e2svgY(L.footingBottomY - 0.15) - e2svgY(L.gravelBottomY)}" />`
    );
  }

  // Compacted gravel bed under base slab
  parts.push(
    `<rect fill="${gravelFill}" stroke="#475569" stroke-width="0.9" x="${m2svg(sec.innerMinU)}" y="${e2svgY(L.baseSlabBottomY)}" width="${m2svg(sec.innerMaxU - sec.innerMinU)}" height="${m2svg(L.baseSlabBottomY - L.gravelBottomY)}" />`
  );

  // Strip footings & ZB stem walls under 1.NP exterior / structural walls
  for (const f of sec.footings) {
    // Strip footing
    parts.push(
      `<rect class="cad-cut-concrete" fill="${concreteFill}" x="${m2svg(f.footingMinU)}" y="${e2svgY(L.zbBottomY)}" width="${m2svg(f.footingMaxU - f.footingMinU)}" height="${m2svg(L.zbBottomY - L.footingBottomY)}" />`
    );
    // ZB stem wall (-0.500 .. -0.150)
    parts.push(
      `<rect class="cad-cut-concrete" fill="${concreteFill}" x="${m2svg(f.stemMinU)}" y="${e2svgY(L.baseSlabBottomY)}" width="${m2svg(f.stemMaxU - f.stemMinU)}" height="${m2svg(L.baseSlabBottomY - L.zbBottomY)}" />`
    );
    // Perimeter XPS insulation on exterior plinth (-0.500 .. +0.220)
    if (f.xpsMinU !== null && f.xpsMaxU !== null) {
      parts.push(
        `<rect class="cad-cut-insul" fill="${insulFill}" x="${m2svg(f.xpsMinU)}" y="${e2svgY(L.f1FinishY)}" width="${m2svg(f.xpsMaxU - f.xpsMinU)}" height="${m2svg(L.f1FinishY - L.zbBottomY)}" />`
      );
    }
  }

  // Concrete base slab (-0.150 .. ±0.000) across structural footprint
  const slabStartU = sec.wallMinU + data.materialsInfo.eticsThick;
  const slabEndU = sec.wallMaxU - data.materialsInfo.eticsThick;
  parts.push(
    `<rect class="cad-cut-concrete" fill="${concreteFill}" x="${m2svg(slabStartU)}" y="${e2svgY(L.baseSlabY)}" width="${m2svg(slabEndU - slabStartU)}" height="${m2svg(L.baseSlabY - L.baseSlabBottomY)}" />`
  );

  // 1.NP Floor buildup (EPS insulation + screed + finish, ±0.000 .. +0.220)
  const f1EpsTopY = Number((L.f1FinishY - 0.065).toFixed(4));
  const f1ScreedTopY = Number((L.f1FinishY - 0.015).toFixed(4));
  parts.push(
    `<rect class="cad-cut-insul" fill="${insulFill}" x="${m2svg(sec.innerMinU)}" y="${e2svgY(f1EpsTopY)}" width="${m2svg(sec.innerMaxU - sec.innerMinU)}" height="${m2svg(f1EpsTopY - L.baseSlabY)}" />`
  );
  parts.push(
    `<rect fill="#e2e8f0" stroke="#334155" stroke-width="0.8" x="${m2svg(sec.innerMinU)}" y="${e2svgY(f1ScreedTopY)}" width="${m2svg(sec.innerMaxU - sec.innerMinU)}" height="${m2svg(f1ScreedTopY - f1EpsTopY)}" />`
  );
  parts.push(
    `<rect fill="#fde68a" stroke="#0f172a" stroke-width="1.2" x="${m2svg(sec.innerMinU)}" y="${e2svgY(L.f1FinishY)}" width="${m2svg(sec.innerMaxU - sec.innerMinU)}" height="${m2svg(L.f1FinishY - f1ScreedTopY)}" />`
  );

  // Waterproofing line at ±0,000
  parts.push(`<line class="cad-waterproof" x1="${m2svg(slabStartU)}" y1="${e2svgY(L.baseSlabY)}" x2="${m2svg(slabEndU)}" y2="${e2svgY(L.baseSlabY)}" />`);

  parts.push('</g>');
  return parts.join('\n');
}

function renderRoofStructureSvg(data, sec, showHatches) {
  const L = data.levels;
  const R = data.roof;
  const parts = [];
  parts.push('<g class="layer-roof-structure">');

  const concreteFill = fillFor('sec-hatch-concrete', '#e2e8f0', showHatches);
  const insulFill = fillFor('sec-hatch-insul', '#fef9c3', showHatches);
  const timberFill = fillFor('sec-hatch-timber', '#fef3c7', showHatches);

  if (sec.isTransverse) {
    // 1. Background gable interior outline (from 2.NP wall top to gable peak)
    const gablePts = [
      [m2svg(sec.innerMinU), e2svgY(L.c2BottomY)],
      [0, e2svgY(L.gablePeakY)],
      [m2svg(sec.innerMaxU), e2svgY(L.c2BottomY)],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    parts.push(`<polygon fill="#f8fafc" stroke="#94a3b8" stroke-width="1" points="${gablePts}" />`);

    // 2. Attic 350 mm thermal insulation + 2.NP SDK suspended ceiling
    const insulX = m2svg(sec.innerMinU);
    const insulW = m2svg(sec.innerMaxU - sec.innerMinU);
    parts.push(
      `<rect class="cad-cut-insul" fill="${insulFill}" x="${insulX}" y="${e2svgY(L.c2TopY)}" width="${insulW}" height="${m2svg(L.c2TopY - L.c2BottomY)}" />`
    );
    if (L.c2BottomY - L.f2CeilingY > 0.02) {
      parts.push(
        `<rect fill="#f1f5f9" stroke="#334155" stroke-width="1" x="${insulX}" y="${e2svgY(L.c2BottomY)}" width="${insulW}" height="${m2svg(L.c2BottomY - L.f2CeilingY)}" />`
      );
      parts.push(
        `<line x1="${insulX}" y1="${e2svgY(L.f2CeilingY)}" x2="${insulX + insulW}" y2="${e2svgY(L.f2CeilingY)}" stroke="#0f172a" stroke-width="1.4" />`
      );
    }

    // 3. Ring beams (ŽB věnce) at top of exterior walls
    for (const w of sec.cutWalls['2np']) {
      if (w.kind !== 'exterior') continue;
      parts.push(
        `<rect class="cad-cut-concrete" fill="${concreteFill}" x="${m2svg(w.coreMinU)}" y="${e2svgY(L.c2BottomY)}" width="${m2svg(w.coreMaxU - w.coreMinU)}" height="${m2svg(0.25)}" />`
      );
    }

    // 4. Timber Truss (Fink W-truss) or Classic Rafters + Collar Beam
    if (R.isTruss) {
      const chordH = 0.14;
      const yBotChord = L.c2BottomY + 0.06;
      const yBotMid = yBotChord + chordH / 2;
      const yTopApex = L.gablePeakY - 0.10;
      const webNodes = [
        [-R.halfSpan + 0.19, yBotMid],
        [-R.halfSpan * 0.5, L.c2BottomY + R.height * 0.5 - 0.07],
        [-R.halfSpan * 0.33, yBotMid],
        [0, yTopApex],
        [R.halfSpan * 0.33, yBotMid],
        [R.halfSpan * 0.5, L.c2BottomY + R.height * 0.5 - 0.07],
        [R.halfSpan - 0.19, yBotMid],
      ];

      // Webbing diagonals
      for (let i = 0; i < webNodes.length - 1; i++) {
        const [u1, y1] = webNodes[i];
        const [u2, y2] = webNodes[i + 1];
        parts.push(
          `<line x1="${m2svg(u1)}" y1="${e2svgY(y1)}" x2="${m2svg(u2)}" y2="${e2svgY(y2)}" stroke="#78350f" stroke-width="8" stroke-linecap="round" />`
        );
        parts.push(
          `<line x1="${m2svg(u1)}" y1="${e2svgY(y1)}" x2="${m2svg(u2)}" y2="${e2svgY(y2)}" stroke="#fde68a" stroke-width="5.5" stroke-linecap="round" />`
        );
      }

      // Bottom chord
      parts.push(
        `<rect class="cad-cut-timber" fill="${timberFill}" x="${m2svg(-R.halfSpan + 0.14)}" y="${e2svgY(yBotChord + chordH)}" width="${m2svg(R.halfSpan * 2 - 0.28)}" height="${m2svg(chordH)}" />`
      );

      // Sloped top chords (rafters)
      for (const sign of [-1, 1]) {
        const uOuter = sign * R.outerHalfSpan;
        const yOuterBot = L.eaveBottomY;
        const yOuterTop = L.eaveTopY - 0.08;
        const pts = [
          [m2svg(uOuter), e2svgY(yOuterBot)],
          [0, e2svgY(L.gablePeakY - 0.16)],
          [0, e2svgY(L.gablePeakY)],
          [m2svg(uOuter), e2svgY(yOuterTop)],
        ]
          .map(([px, py]) => `${px},${py}`)
          .join(' ');
        parts.push(`<polygon class="cad-cut-timber" fill="${timberFill}" points="${pts}" />`);
      }

      // Nail-plate connectors at key truss nodes
      for (const [nu, ny] of webNodes.slice(1, -1)) {
        parts.push(
          `<rect fill="#64748b" stroke="#0f172a" stroke-width="0.8" x="${m2svg(nu) - 7}" y="${e2svgY(ny) - 5}" width="14" height="10" />`
        );
      }
    } else {
      // Classic rafters + wall plates + collar beam
      for (const sign of [-1, 1]) {
        const uOuter = sign * R.outerHalfSpan;
        const pts = [
          [m2svg(uOuter), e2svgY(L.eaveBottomY)],
          [0, e2svgY(L.gablePeakY - 0.18)],
          [0, e2svgY(L.gablePeakY)],
          [m2svg(uOuter), e2svgY(L.eaveTopY - 0.06)],
        ]
          .map(([px, py]) => `${px},${py}`)
          .join(' ');
        parts.push(`<polygon class="cad-cut-timber" fill="${timberFill}" points="${pts}" />`);
        parts.push(
          `<rect class="cad-cut-timber" fill="${timberFill}" x="${m2svg(sign * (R.halfSpan - 0.25) - 0.07)}" y="${e2svgY(L.c2BottomY + 0.14)}" width="14" height="14" />`
        );
      }
      const collarY = L.c2BottomY + R.height * 0.52;
      const collarSpan = R.halfSpan * 0.48;
      parts.push(
        `<rect class="cad-cut-timber" fill="${timberFill}" x="${m2svg(-collarSpan)}" y="${e2svgY(collarY + 0.14)}" width="${m2svg(collarSpan * 2)}" height="14" />`
      );
    }

    // 5. Outer Roof Shell (battens + tiles) + Eave Gutters
    const hs = R.outerHalfSpan;
    const shellPts = [
      [m2svg(-hs), e2svgY(L.eaveBottomY)],
      [0, e2svgY(L.gablePeakY)],
      [m2svg(hs), e2svgY(L.eaveBottomY)],
      [m2svg(hs), e2svgY(L.eaveTopY)],
      [0, e2svgY(L.ridgeTopY)],
      [m2svg(-hs), e2svgY(L.eaveTopY)],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    parts.push(`<polygon class="cad-roof-cover" style="${showHatches ? '' : 'fill:#cbd5e1;'}" points="${shellPts}" />`);

    for (const sign of [-1, 1]) {
      const gx = sign < 0 ? m2svg(-hs) - 10 : m2svg(hs);
      parts.push(
        `<rect fill="#64748b" stroke="#0f172a" stroke-width="1" x="${gx}" y="${e2svgY(L.eaveBottomY) - 4}" width="10" height="10" rx="2" />`
      );
    }

    // Attic space label
    parts.push(
      `<text class="cad-micro-text" x="0" y="${e2svgY(L.c2TopY + 0.48)}">NEVYTÁPĚNÉ PODKROVÍ</text>`
    );
  } else {
    // Longitudinal B-B' roof section at x = cutCoord looking West toward ridge
    const distFromRidge = Math.abs(sec.cutCoord);
    const yRoofAtCutBot = Number((R.y + R.height * Math.max(0, 1 - distFromRidge / R.halfSpan)).toFixed(4));
    const yRoofAtCutTop = Number((yRoofAtCutBot + R.dyThick).toFixed(4));

    const rx = m2svg(sec.roofMinU);
    const rw = m2svg(sec.roofMaxU - sec.roofMinU);

    // Attic wall/slope elevation behind cut up to ridge
    parts.push(
      `<rect fill="#f8fafc" stroke="#475569" stroke-width="1.2" x="${rx}" y="${e2svgY(L.ridgeTopY)}" width="${rw}" height="${e2svgY(yRoofAtCutTop) - e2svgY(L.ridgeTopY)}" />`
    );
    // Faint vertical truss/rafter rhythm behind cut (á 0.9 m)
    const spacing = BOM_SPEC.roof?.rafterSpacing ?? 0.9;
    for (let u = sec.roofMinU + spacing; u < sec.roofMaxU - 0.2; u += spacing) {
      parts.push(
        `<line x1="${m2svg(u)}" y1="${e2svgY(L.ridgeTopY)}" x2="${m2svg(u)}" y2="${e2svgY(yRoofAtCutTop)}" stroke="#cbd5e1" stroke-width="0.9" />`
      );
    }
    // Cut roof assembly strip at plane xCut
    parts.push(
      `<rect class="cad-cut-timber" fill="${timberFill}" x="${rx}" y="${e2svgY(yRoofAtCutBot)}" width="${rw}" height="14" />`
    );
    parts.push(
      `<rect class="cad-roof-cover" style="${showHatches ? '' : 'fill:#cbd5e1;'}" x="${rx}" y="${e2svgY(yRoofAtCutTop)}" width="${rw}" height="${e2svgY(yRoofAtCutBot) - e2svgY(yRoofAtCutTop)}" />`
    );

    // Ring beams on gable walls
    for (const w of sec.cutWalls['2np']) {
      if (w.kind !== 'exterior') continue;
      parts.push(
        `<rect class="cad-cut-concrete" fill="${concreteFill}" x="${m2svg(w.coreMinU)}" y="${e2svgY(L.c2BottomY)}" width="${m2svg(w.coreMaxU - w.coreMinU)}" height="${m2svg(0.25)}" />`
      );
    }

    // Cut ceiling2Slab insulation segments (split at SHAFT_HOLE if cut)
    for (const [segMin, segMax] of sec.c2InsulSegs) {
      const sx = m2svg(segMin);
      const sw = m2svg(segMax - segMin);
      parts.push(
        `<rect class="cad-cut-insul" fill="${insulFill}" x="${sx}" y="${e2svgY(L.c2TopY)}" width="${sw}" height="${m2svg(L.c2TopY - L.c2BottomY)}" />`
      );
      if (L.c2BottomY - L.f2CeilingY > 0.02) {
        parts.push(
          `<rect fill="#f1f5f9" stroke="#334155" stroke-width="1" x="${sx}" y="${e2svgY(L.c2BottomY)}" width="${sw}" height="${m2svg(L.c2BottomY - L.f2CeilingY)}" />`
        );
        parts.push(
          `<line x1="${sx}" y1="${e2svgY(L.f2CeilingY)}" x2="${sx + sw}" y2="${e2svgY(L.f2CeilingY)}" stroke="#0f172a" stroke-width="1.4" />`
        );
      }
    }

    parts.push(
      `<text class="cad-micro-text" x="0" y="${e2svgY((yRoofAtCutTop + L.ridgeTopY) / 2)}">NEVYTÁPĚNÉ PODKROVÍ · POHLED K HŘEBENI</text>`
    );
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderSlabsStairsAndShaftSvg(data, sec, showHatches) {
  const L = data.levels;
  const parts = [];
  parts.push('<g class="layer-slabs-stairs">');

  const concreteFill = fillFor('sec-hatch-concrete', '#e2e8f0', showHatches);
  const insulFill = fillFor('sec-hatch-insul', '#fef9c3', showHatches);

  // 1. Cut structural ceiling slab over 1.NP (2.95 .. 3.17)
  for (const [sMin, sMax] of sec.slabSegments) {
    const sx = m2svg(sMin);
    const sw = m2svg(sMax - sMin);
    parts.push(
      `<rect class="cad-cut-concrete" fill="${concreteFill}" x="${sx}" y="${e2svgY(L.f2StructY)}" width="${sw}" height="${m2svg(L.f2StructY - L.c1BottomY)}" />`
    );
  }

  // 1.NP SDK ceiling soffit (when ceiling1Sdk)
  if (L.c1BottomY - L.f1CeilingY > 0.02) {
    for (const [fMin, fMax] of sec.floor2FinishSegs) {
      const fx = m2svg(fMin);
      const fw = m2svg(fMax - fMin);
      parts.push(
        `<rect fill="#f8fafc" stroke="#334155" stroke-width="0.9" x="${fx}" y="${e2svgY(L.c1BottomY)}" width="${fw}" height="${m2svg(L.c1BottomY - L.f1CeilingY)}" />`
      );
      parts.push(
        `<line x1="${fx}" y1="${e2svgY(L.f1CeilingY)}" x2="${fx + fw}" y2="${e2svgY(L.f1CeilingY)}" stroke="#0f172a" stroke-width="1.3" />`
      );
    }
  }

  // 2. 2.NP floor buildup (3.17 .. 3.29)
  const f2EpsTop = Number((L.f2FinishY - 0.065).toFixed(4));
  for (const [fMin, fMax] of sec.floor2FinishSegs) {
    const fx = m2svg(fMin);
    const fw = m2svg(fMax - fMin);
    parts.push(
      `<rect class="cad-cut-insul" fill="${insulFill}" x="${fx}" y="${e2svgY(f2EpsTop)}" width="${fw}" height="${m2svg(f2EpsTop - L.f2StructY)}" />`
    );
    parts.push(
      `<rect fill="#fde68a" stroke="#0f172a" stroke-width="1.2" x="${fx}" y="${e2svgY(L.f2FinishY)}" width="${fw}" height="${m2svg(L.f2FinishY - f2EpsTop)}" />`
    );
  }

  // 3. Staircase in A-A'
  if (sec.stairs) {
    const st = sec.stairs;
    // Flight 1 in background elevation (looking North)
    const f1Poly = [
      [m2svg(st.xStart), e2svgY(st.yBase)],
      ...st.flight1Steps.flatMap((step) => [
        [m2svg(step.uMax), e2svgY(step.yTop)],
        [m2svg(step.uMin), e2svgY(step.yTop)],
      ]),
      [m2svg(st.xLanding), e2svgY(st.yLanding - st.landingThickness)],
      [m2svg(st.xStart), e2svgY(st.yBase)],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    parts.push(`<polygon class="cad-elev-back" points="${f1Poly}" />`);

    // Mid-landing & Flight 2 cut in concrete section
    const f2Start = st.flight2Steps[0];
    const f2End = st.flight2Steps[st.flight2Steps.length - 1];
    const f2StepsPts = st.flight2Steps.flatMap((step) => [
      [m2svg(step.uMin), e2svgY(step.yTop)],
      [m2svg(step.uMax), e2svgY(step.yTop)],
    ]);
    const waistDrop = 0.22;
    const cutStairPts = [
      [m2svg(st.xEnd), e2svgY(st.yLanding)],
      [m2svg(st.xLanding), e2svgY(st.yLanding)],
      ...f2StepsPts,
      [m2svg(f2End.uMax), e2svgY(st.yTop)],
      // Soffit parallel to the nosing line (constant waist thickness)
      [
        m2svg(f2End.uMax),
        e2svgY(st.yLanding - st.landingThickness + (st.stepRun ? ((f2End.uMax - f2Start.uMin) * st.riserH) / st.stepRun : 0)),
      ],
      [m2svg(f2Start.uMin), e2svgY(st.yLanding - st.landingThickness)],
      [m2svg(st.xEnd), e2svgY(st.yLanding - st.landingThickness)],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    parts.push(`<polygon class="cad-cut-concrete" fill="${concreteFill}" points="${cutStairPts}" />`);

    // Sloped handrail on Flight 2 + gallery guard rail on 2.NP
    const railH = 0.95;
    parts.push(
      `<line x1="${m2svg(st.xLanding)}" y1="${e2svgY(st.yLanding + railH)}" x2="${m2svg(st.xStart)}" y2="${e2svgY(st.yTop + railH)}" stroke="#334155" stroke-width="2" />`
    );
    parts.push(
      `<line x1="${m2svg(st.xStart)}" y1="${e2svgY(st.yTop)}" x2="${m2svg(st.xStart)}" y2="${e2svgY(st.yTop + 1.0)}" stroke="#334155" stroke-width="2.4" />`
    );
    parts.push(
      `<line x1="${m2svg(st.xLanding)}" y1="${e2svgY(st.yLanding)}" x2="${m2svg(st.xLanding)}" y2="${e2svgY(st.yLanding + railH)}" stroke="#334155" stroke-width="1.4" />`
    );

    // Stair formula callout cleanly below Flight 2 waist soffit
    const labelU = (st.xLanding + st.xStart) / 2;
    const labelY = (st.yLanding + st.yTop) / 2 - waistDrop - 0.34;
    parts.push(
      `<text class="cad-micro-text" x="${m2svg(labelU)}" y="${e2svgY(labelY)}">${esc(st.formulaText)}</text>`
    );
  }

  // 4. Vertical VZT / TZB Installation Shaft in B-B'
  if (sec.hasShaftCut && sec.shaftSpan) {
    const [shMin, shMax] = sec.shaftSpan;
    const sx = m2svg(shMin);
    const sw = m2svg(shMax - shMin);
    const shTop = e2svgY(L.c2TopY + 0.35);
    const shBot = e2svgY(L.f1FinishY);
    parts.push(
      `<rect fill="#f8fafc" stroke="#0f172a" stroke-width="1.4" x="${sx}" y="${shTop}" width="${sw}" height="${shBot - shTop}" />`
    );
    // Vertical spiro riser pipes inside shaft
    parts.push(
      `<line x1="${sx + sw * 0.35}" y1="${shTop + 6}" x2="${sx + sw * 0.35}" y2="${shBot - 6}" stroke="#0284c7" stroke-width="2" stroke-dasharray="6 3" />`
    );
    parts.push(
      `<line x1="${sx + sw * 0.65}" y1="${shTop + 6}" x2="${sx + sw * 0.65}" y2="${shBot - 6}" stroke="#64748b" stroke-width="2" />`
    );
    parts.push(
      `<text class="cad-micro-text" x="${sx + sw / 2}" y="${shTop - 7}">ŠACHTA VZT</text>`
    );
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderCutWallsAndOpeningsSvg(data, sec, showHatches) {
  const parts = [];
  parts.push('<g class="layer-cut-walls">');

  const masonryFill = fillFor('sec-hatch-masonry', '#cbd5e1', showHatches);
  const partFill = fillFor('sec-hatch-part', '#e2e8f0', showHatches);
  const sdkFill = fillFor('sec-hatch-sdk', '#f1f5f9', showHatches);
  const insulFill = fillFor('sec-hatch-insul', '#fef9c3', showHatches);
  const concreteFill = fillFor('sec-hatch-concrete', '#cbd5e1', showHatches);

  for (const floorKey of ['1np', '2np']) {
    for (const w of sec.cutWalls[floorKey]) {
      const op = w.cutOpening;
      const coreFill =
        w.kind === 'sdk' ? sdkFill : w.kind === 'partition' ? partFill : masonryFill;
      const wallCls =
        w.kind === 'sdk'
          ? 'cad-cut-sdk'
          : w.kind === 'partition'
            ? 'cad-cut-part'
            : 'cad-cut-masonry';

      const drawWallBand = (yBot, yTop, isLintel = false) => {
        if (yTop - yBot <= 0.01) return;
        const py = e2svgY(yTop);
        const ph = m2svg(yTop - yBot);
        parts.push(
          `<rect class="${wallCls}" fill="${isLintel ? concreteFill : coreFill}" x="${m2svg(w.coreMinU)}" y="${py}" width="${m2svg(w.coreMaxU - w.coreMinU)}" height="${ph}" />`
        );
        if (w.insulMinU !== null && w.insulMaxU !== null) {
          parts.push(
            `<rect class="cad-cut-insul" fill="${insulFill}" x="${m2svg(w.insulMinU)}" y="${py}" width="${m2svg(w.insulMaxU - w.insulMinU)}" height="${ph}" />`
          );
        }
      };

      if (!op) {
        drawWallBand(w.yBottom, w.yTop);
      } else {
        // Parapet below opening
        drawWallBand(w.yBottom, op.yBottom);
        // Lintel above opening
        drawWallBand(op.yTop, w.yTop, true);

        // Sliced opening frame + triple-glazing or door leaf section
        const ox = m2svg(w.uMin);
        const ow = m2svg(w.uMax - w.uMin);
        const oy = e2svgY(op.yTop);
        const oh = m2svg(op.yTop - op.yBottom);
        const cx = m2svg(w.uCenter);

        parts.push(`<rect fill="#ffffff" stroke="#334155" stroke-width="0.9" x="${ox}" y="${oy}" width="${ow}" height="${oh}" />`);
        if (op.isDoor) {
          parts.push(`<rect fill="#94a3b8" stroke="#0f172a" stroke-width="1" x="${cx - 2.5}" y="${oy + 3}" width="5" height="${oh - 6}" />`);
        } else {
          // Window frame + triple glass lines + exterior sill
          parts.push(`<rect class="cad-win-frame" x="${cx - 4}" y="${oy}" width="8" height="5" />`);
          parts.push(`<rect class="cad-win-frame" x="${cx - 4}" y="${oy + oh - 5}" width="8" height="5" />`);
          parts.push(`<rect class="cad-win-glass" x="${cx - 2.2}" y="${oy + 5}" width="4.4" height="${oh - 10}" />`);
          parts.push(`<line x1="${cx}" y1="${oy + 5}" x2="${cx}" y2="${oy + oh - 5}" stroke="#0369a1" stroke-width="0.8" />`);
          // Exterior sill projection
          const isLeft = w.uCenter < 0;
          const sillX = isLeft ? ox - 5 : ox + ow;
          parts.push(`<rect fill="#64748b" stroke="#0f172a" stroke-width="0.8" x="${sillX}" y="${oy + oh - 2}" width="5" height="4" />`);
        }
      }
    }
  }

  // Cut entrance canopy on A-A'
  if (sec.canopy) {
    const c = sec.canopy;
    const cx = m2svg(c.uMin);
    const cw = m2svg(c.uMax - c.uMin);
    const cy = e2svgY(c.yTop);
    const ch = m2svg(c.yTop - c.yBottom);
    parts.push(`<rect fill="#bae6fd" stroke="#0284c7" stroke-width="1.2" x="${cx}" y="${cy}" width="${cw}" height="${ch}" />`);
    parts.push(`<rect fill="#334155" stroke="#0f172a" stroke-width="1" x="${cx}" y="${cy}" width="6" height="${ch}" />`);
    parts.push(`<rect fill="#334155" stroke="#0f172a" stroke-width="1" x="${cx + cw - 6}" y="${cy}" width="6" height="${ch}" />`);
    parts.push(
      `<line x1="${cx + cw * 0.75}" y1="${cy}" x2="${cx}" y2="${cy - 45}" stroke="#334155" stroke-width="1.3" />`
    );
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderSectionRoomLabelsSvg(data, sec) {
  const L = data.levels;
  const parts = [];
  parts.push('<g class="layer-rooms">');

  const adjustForObstacles = (room) => {
    let adjusted = room;
    if (sec.isTransverse && (room.id === '1.05' || room.id === '2.01') && sec.stairs) {
      adjusted = { ...adjusted, uCenter: (sec.stairs.xStart + adjusted.uMax) / 2, uMin: sec.stairs.xStart };
    }
    if (sec.hasShaftCut && sec.shaftSpan) {
      const [shMin] = sec.shaftSpan;
      if (adjusted.uMax > shMin - 0.1 && adjusted.uMin < shMin) {
        const clearMax = shMin - 0.05;
        adjusted = { ...adjusted, uMax: clearMax, uCenter: (adjusted.uMin + clearMax) / 2 };
      }
    }
    return adjusted;
  };

  const drawLabel = (room, yMid) => {
    const cx = m2svg(room.uCenter);
    const cy = e2svgY(yMid);
    const spanPx = m2svg(room.uMax - room.uMin);
    const shortName =
      spanPx < 165 && room.name.length > 14
        ? room.name.split('/')[0].split('&')[0].split('(')[0].trim()
        : room.name.split('(')[0].trim();

    parts.push(`<rect class="cad-room-id-bg" x="${cx - 16}" y="${cy - 14}" width="32" height="13" />`);
    parts.push(`<text class="cad-room-id-txt" x="${cx}" y="${cy - 4.5}">${esc(room.id)}</text>`);
    parts.push(`<text class="cad-room-name" x="${cx}" y="${cy + 10}">${esc(shortName)}</text>`);
  };

  for (const r of sec.slicedRooms['1np']) {
    drawLabel(adjustForObstacles(r), (L.f1FinishY + L.f1CeilingY) / 2);
  }

  for (const r of sec.slicedRooms['2np']) {
    drawLabel(adjustForObstacles(r), (L.f2FinishY + L.f2CeilingY) / 2);
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderSingleSectionSvg(data, key, originX, originY, options) {
  const sec = data.sections[key];
  const L = data.levels;
  const R = data.roof;
  const {
    showDimensions = true,
    showInteriorDims = true,
    showOpeningTags = true,
    showHatches = true,
    units = 'mm',
  } = options;

  const headingX = m2svg(sec.totalMinU);
  const headingY = e2svgY(L.ridgeTopY) - 72;
  const parts = [];

  parts.push(`<g class="section-view" data-section="${key}" transform="translate(${originX}, ${originY})">`);
  parts.push(`<text class="cad-sec-heading" x="${headingX}" y="${headingY}">${esc(sec.title)}</text>`);
  parts.push(`<text class="cad-sec-sub" x="${headingX}" y="${headingY + 20}">${esc(sec.subtitle)}</text>`);

  // 1. Foundations & 1.NP Floor
  parts.push(renderFoundationsAndFloor1Svg(data, sec, showHatches));

  // 2. Roof Structure & Attic Ceiling
  parts.push(renderRoofStructureSvg(data, sec, showHatches));

  // 3. Ceiling Slab, 2.NP Floor, Staircase & Shaft
  parts.push(renderSlabsStairsAndShaftSvg(data, sec, showHatches));

  // 4. Cut Walls, Windows & Canopy
  parts.push(renderCutWallsAndOpeningsSvg(data, sec, showHatches));

  // 5. Exterior Terrain Lines (left & right of house)
  parts.push('<g class="layer-terrain">');
  const gLeft = m2svg(sec.totalMinU - 0.8);
  const gRight = m2svg(sec.totalMaxU + 0.8);
  const gY = e2svgY(L.gradeY);
  parts.push(`<line class="cad-ground-line" x1="${gLeft}" y1="${gY}" x2="${m2svg(sec.wallMinU)}" y2="${gY}" />`);
  parts.push(`<line class="cad-ground-line" x1="${m2svg(sec.wallMaxU)}" y1="${gY}" x2="${gRight}" y2="${gY}" />`);
  parts.push('</g>');

  // 6. Sliced Room Labels
  parts.push(renderSectionRoomLabelsSvg(data, sec));

  // 7. Interior Clear Heights & Interior Level Markers
  if (showInteriorDims) {
    parts.push('<g class="layer-int-dims">');
    // Pick widest room bay and anchor near its outer edge so clear-height chain never crosses room stamps
    const widest1 = [...sec.slicedRooms['1np']].sort((a, b) => (b.uMax - b.uMin) - (a.uMax - a.uMin))[0];
    const widest2 = [...sec.slicedRooms['2np']].sort((a, b) => (b.uMax - b.uMin) - (a.uMax - a.uMin))[0];
    const dimU1 = sec.isTransverse
      ? (sec.slicedRooms['1np'][sec.slicedRooms['1np'].length - 1]?.uMax ?? 3.6) - 0.22
      : (widest1 ? widest1.uMin + 0.35 : -4.8);
    const dimU2 = sec.isTransverse
      ? (sec.slicedRooms['2np'][sec.slicedRooms['2np'].length - 1]?.uMax ?? 3.6) - 0.22
      : (widest2 ? widest2.uMin + 0.35 : -4.8);

    parts.push(renderVerticalDimChainSvg([L.f1FinishY, L.f1CeilingY], dimU1, null, units, -11));
    parts.push(renderVerticalDimChainSvg([L.f2FinishY, L.f2CeilingY], dimU2, null, units, -11));

    // Interior ČSN level markers kept safely inside wide open circulation bays
    const markRightU = sec.isTransverse ? -0.18 : -1.0;
    const markLeftU = sec.isTransverse ? 0.55 : -1.0;
    parts.push(renderElevationMarkerSvg(m2svg(markRightU), e2svgY(L.f1FinishY), L.f1FinishY, 'right'));
    parts.push(renderElevationMarkerSvg(m2svg(markLeftU), e2svgY(L.f1CeilingY), L.f1CeilingY, 'left', true));
    parts.push(renderElevationMarkerSvg(m2svg(markRightU), e2svgY(L.f2FinishY), L.f2FinishY, 'right'));
    parts.push(renderElevationMarkerSvg(m2svg(markLeftU), e2svgY(L.f2CeilingY), L.f2CeilingY, 'left', true));

    if (sec.stairs) {
      parts.push(
        renderElevationMarkerSvg(m2svg(sec.stairs.xLanding - 0.15), e2svgY(sec.stairs.yLanding), sec.stairs.yLanding, 'left')
      );
    }
    parts.push('</g>');
  }

  // 8. Exterior Dimensions, Outer Level Markers & Pitch
  if (showDimensions) {
    parts.push('<g class="layer-ext-dims">');

    const markerU = sec.totalMinU - 0.50;
    const markerX = m2svg(markerU);
    parts.push(renderElevationMarkerSvg(markerX, e2svgY(L.footingBottomY), L.footingBottomY, 'left'));
    parts.push(renderElevationMarkerSvg(m2svg(sec.totalMinU - 0.72), e2svgY(L.gradeY), L.gradeY, 'left'));
    parts.push(renderElevationMarkerSvg(markerX, e2svgY(L.f2StructY), L.f2StructY, 'left'));
    parts.push(renderElevationMarkerSvg(markerX, e2svgY(L.c2BottomY), L.c2BottomY, 'left'));
    parts.push(renderElevationMarkerSvg(0, e2svgY(L.ridgeTopY), L.ridgeTopY, 'right'));

    // Right vertical dimension chains
    const dimBaseU = sec.totalMaxU;
    const vNodesInner = [L.footingBottomY, L.gradeY, L.f1FinishY, L.f2StructY, L.c2BottomY, L.ridgeTopY];
    parts.push(renderVerticalDimChainSvg(vNodesInner, dimBaseU + 0.52, dimBaseU + 0.05, units, -11));
    parts.push(
      renderVerticalDimChainSvg([L.footingBottomY, L.ridgeTopY], dimBaseU + 1.05, dimBaseU + 0.05, units, -11)
    );

    // Bottom horizontal dimension chains below strip footings
    const wallAxisNodes = sortUnique([
      sec.wallMinU,
      ...sec.cutWalls['1np'].filter((w) => w.kind === 'structural').map((w) => w.uCenter),
      sec.wallMaxU,
    ]);
    parts.push(renderHorizontalDimChainSvg(wallAxisNodes, L.footingBottomY - 0.50, L.footingBottomY, units, 14));
    parts.push(
      renderHorizontalDimChainSvg([sec.wallMinU, sec.wallMaxU], L.footingBottomY - 0.94, L.footingBottomY, units, 14)
    );

    // Roof pitch wedge on A-A'
    if (sec.isTransverse) {
      const pitchStr = `${R.pitchDeg.toFixed(1).replace('.', ',')}°`;
      const px = m2svg(R.halfSpan * 0.52);
      const py = e2svgY(L.c2BottomY + R.height * 0.48 + 0.56);
      parts.push(`<polyline fill="none" stroke="#334155" stroke-width="1" points="${px - 22},${py + 12} ${px + 12},${py + 12} ${px - 10},${py - 4}" />`);
      parts.push(`<text class="cad-dim-text" x="${px + 14}" y="${py - 4}">${esc(pitchStr)}</text>`);
    }

    parts.push('</g>');
  }

  // 9. Opening Marks & Assembly Callout Badges (Z1, P1, S1, ST1, ST2)
  if (showOpeningTags) {
    parts.push('<g class="layer-opening-tags">');

    for (const fKey of ['1np', '2np']) {
      for (const w of sec.cutWalls[fKey]) {
        const op = w.cutOpening;
        if (!op?.mark) continue;
        const dir = w.uCenter < 0 ? -1 : 1;
        const tx =
          w.kind === 'exterior'
            ? m2svg(w.uCenter + dir * 0.42)
            : m2svg(w.uCenter - 0.22);
        const ty = e2svgY((op.yBottom + op.yTop) / 2) + 3.5;
        parts.push(`<text class="cad-tag-text" x="${tx}" y="${ty}">${esc(op.mark)}</text>`);
      }
    }

    const drawCallout = (code, targetU, targetY, badgeU, badgeY) => {
      const tx = m2svg(targetU);
      const ty = e2svgY(targetY);
      const bx = m2svg(badgeU);
      const by = e2svgY(badgeY);
      parts.push(`<line x1="${tx}" y1="${ty}" x2="${bx}" y2="${by}" stroke="#2563eb" stroke-width="0.9" stroke-dasharray="3 2" />`);
      parts.push(`<circle cx="${tx}" cy="${ty}" r="2.2" fill="#2563eb" />`);
      parts.push(`<rect class="cad-callout-bg" x="${bx - 15}" y="${by - 8}" width="30" height="16" />`);
      parts.push(`<text class="cad-callout-txt" x="${bx}" y="${by + 3}">${esc(code)}</text>`);
    };

    if (sec.isTransverse) {
      drawCallout('Z1', sec.wallMinU + 0.19, 1.5, sec.wallMinU - 0.55, 1.5);
      drawCallout('P1', -1.8, L.f1FinishY - 0.1, -1.8, -0.58);
      drawCallout('S1', 2.4, L.f2StructY - 0.1, 2.4, 2.45);
      drawCallout('ST1', -0.65, L.c2TopY - 0.15, -0.65, L.c2TopY + 0.28);
      drawCallout('ST2', -2.4, L.eaveTopY + (L.ridgeTopY - L.eaveTopY) * 0.4, -3.2, L.ridgeTopY - 0.35);
    }

    parts.push('</g>');
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderSectionPlanDiagramAndScale(x, y, width, data) {
  const h = 176;
  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="24" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="16">SCHÉMA VEDENÍ ŘEZŮ &amp; MĚŘÍTKO (1:50)</text>`);

  // Mini house footprint showing exact AA and BB section planes
  const mapCx = 66;
  const mapCy = 100;
  const sc = 8.5; // 1 m = 8.5 px -> 8x12m = 68x102 px
  const hw = (data.footprint.width * sc) / 2;
  const hl = (data.footprint.length * sc) / 2;

  parts.push(`<rect fill="#ffffff" stroke="#0f172a" stroke-width="1.5" x="${mapCx - hw}" y="${mapCy - hl}" width="${hw * 2}" height="${hl * 2}" />`);
  // Ridge dashed line
  parts.push(`<line x1="${mapCx}" y1="${mapCy - hl}" x2="${mapCx}" y2="${mapCy + hl}" stroke="#94a3b8" stroke-width="0.9" stroke-dasharray="4 3" />`);

  // AA horizontal line + look up (North)
  const aaY = mapCy + data.planes.AA.cutZ * sc;
  parts.push(`<line x1="${mapCx - hw - 10}" y1="${aaY}" x2="${mapCx + hw + 10}" y2="${aaY}" stroke="#1d4ed8" stroke-width="1.4" stroke-dasharray="6 3" />`);
  parts.push(`<polygon points="${mapCx - hw - 10},${aaY - 7} ${mapCx - hw - 13},${aaY - 1} ${mapCx - hw - 7},${aaY - 1}" fill="#1d4ed8" />`);
  parts.push(`<polygon points="${mapCx + hw + 10},${aaY - 7} ${mapCx + hw + 7},${aaY - 1} ${mapCx + hw + 13},${aaY - 1}" fill="#1d4ed8" />`);
  parts.push(`<text class="cad-callout-txt" style="font-size:8.5px;" x="${mapCx - hw - 18}" y="${aaY + 3}">A</text>`);
  parts.push(`<text class="cad-callout-txt" style="font-size:8.5px;" x="${mapCx + hw + 18}" y="${aaY + 3}">A'</text>`);

  // BB vertical line + look left (West)
  const bbX = mapCx + data.planes.BB.cutX * sc;
  parts.push(`<line x1="${bbX}" y1="${mapCy - hl - 10}" x2="${bbX}" y2="${mapCy + hl + 10}" stroke="#1d4ed8" stroke-width="1.4" stroke-dasharray="6 3" />`);
  parts.push(`<polygon points="${bbX - 7},${mapCy - hl - 10} ${bbX - 1},${mapCy - hl - 13} ${bbX - 1},${mapCy - hl - 7}" fill="#1d4ed8" />`);
  parts.push(`<polygon points="${bbX - 7},${mapCy + hl + 10} ${bbX - 1},${mapCy + hl + 7} ${bbX - 1},${mapCy + hl + 13}" fill="#1d4ed8" />`);
  parts.push(`<text class="cad-callout-txt" style="font-size:8.5px;" x="${bbX}" y="${mapCy - hl - 14}">B</text>`);
  parts.push(`<text class="cad-callout-txt" style="font-size:8.5px;" x="${bbX}" y="${mapCy + hl + 21}">B'</text>`);

  // Scale bar 0-5 m
  const sx = 148;
  const sy = 62;
  const seg = 64;
  parts.push(`<text class="cad-title-label" x="${sx}" y="46">GRAFICKÉ MĚŘÍTKO (1:50)</text>`);
  for (let i = 0; i < 5; i++) {
    const fill = i % 2 === 0 ? '#0f172a' : '#ffffff';
    parts.push(`<rect x="${sx + i * seg}" y="${sy}" width="${seg}" height="9" fill="${fill}" stroke="#0f172a" stroke-width="1" />`);
    parts.push(`<text class="cad-micro-text" x="${sx + i * seg}" y="${sy + 22}">${i}</text>`);
  }
  parts.push(`<text class="cad-micro-text" x="${sx + 5 * seg}" y="${sy + 22}">5 m</text>`);
  parts.push(`<text class="cad-micro-text" style="text-anchor:start;" x="${sx}" y="114">A-A': Z = ${data.planes.AA.cutZ.toFixed(2).replace('.', ',')} m (pohled k S)</text>`);
  parts.push(`<text class="cad-micro-text" style="text-anchor:start;" x="${sx}" y="130">B-B': X = +${data.planes.BB.cutX.toFixed(2).replace('.', ',')} m (pohled k Z)</text>`);
  parts.push(`<text class="cad-micro-text" style="text-anchor:start;" x="${sx}" y="148">Výškový systém: ±0,000 = zákl. deska 1.NP</text>`);

  parts.push('</g>');
  return { svg: parts.join('\n'), height: h };
}

function renderSectionLevelsPanel(x, y, width, data) {
  const L = data.levels;
  const R = data.roof;
  const rows = [
    { label: 'Hřeben střechy (vrchol krytiny)', value: `${formatElevation(L.ridgeTopY)} m`, bold: true, accent: true },
    { label: 'Pozednice / strop 2.NP (horní líc vazníků)', value: `${formatElevation(L.c2BottomY)} m` },
    { label: `Podhled 2.NP (světlá výška ${L.f2ClearH.toFixed(2).replace('.', ',')} m)`, value: `${formatElevation(L.f2CeilingY)} m` },
    { label: 'Čistá podlaha 2.NP', value: `${formatElevation(L.f2FinishY)} m` },
    { label: 'Nosná ŽB stropní deska nad 1.NP', value: `${formatElevation(L.f2StructY)} m` },
    { label: `Podhled 1.NP (světlá výška ${L.f1ClearH.toFixed(2).replace('.', ',')} m)`, value: `${formatElevation(L.f1CeilingY)} m` },
    { label: 'Čistá podlaha 1.NP', value: `${formatElevation(L.f1FinishY)} m` },
    { label: 'Základová deska (hydroizolace ±0,000)', value: `${formatElevation(L.baseSlabY)} m` },
    { label: 'Upravený terén (UT)', value: `${formatElevation(L.gradeY)} m` },
    { label: 'Základová spára (pasy š. 600 mm)', value: `${formatElevation(L.footingBottomY)} m` },
    {
      label: `Střecha ${R.isTruss ? 'vazníková' : 'krov'} · sklon ${R.pitchDeg.toFixed(1).replace('.', ',')}° · celkem`,
      value: `${(L.ridgeTopY - L.gradeY).toFixed(2).replace('.', ',')} m`,
      bold: true,
      accent: true,
    },
  ];
  if (data.stairs) {
    rows.push({
      label: 'Schodiště 1.NP → 2.NP (dvouramenné)',
      value: data.stairs.formulaText,
    });
  }

  const headerH = 28;
  const rowH = 23;
  const totalH = headerH + rows.length * rowH + 10;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="18">VÝŠKOVÉ ÚROVNĚ A SVĚTLÉ VÝŠKY</text>`);

  let curY = headerH + 17;
  rows.forEach((row, idx) => {
    const weight = row.bold ? 'font-weight:700;' : '';
    const numColor = row.accent ? 'fill:#1d4ed8;' : '';
    parts.push(`<text class="cad-table-txt" style="${weight}font-size:10.5px;" x="12" y="${curY}">${esc(row.label)}</text>`);
    parts.push(`<text class="cad-table-num" style="${weight}${numColor}font-size:10.5px;" x="${width - 12}" y="${curY}">${esc(row.value)}</text>`);
    if (idx < rows.length - 1) {
      parts.push(`<line class="cad-table-row-line" x1="10" y1="${curY + 6}" x2="${width - 10}" y2="${curY + 6}" />`);
    }
    curY += rowH;
  });

  parts.push('</g>');
  return { svg: parts.join('\n'), height: totalH };
}

function renderSectionAssembliesPanel(x, y, width, data, spec) {
  const f1Mm = Math.round((data.levels.f1FinishY - data.levels.baseSlabY) * 1000);
  const f1InsulMm = Math.max(0, f1Mm - 65);
  const f2Mm = Math.round((data.levels.f2FinishY - data.levels.f2StructY) * 1000);
  const c1Mm = Math.round((data.levels.f2StructY - data.levels.c1BottomY) * 1000);
  const c2InsulMm = Math.round((data.levels.c2TopY - data.levels.c2BottomY) * 1000);
  const coreMm = Math.round(data.materialsInfo.masonryCoreExt * 1000);
  const eticsMm = Math.round(data.materialsInfo.eticsThick * 1000);

  const items = [
    ['Z1 · Obvodová stěna', `Keramická cihla ${coreMm} mm + ETICS ${eticsMm} mm + omítka`],
    ['P1 · Podlaha 1.NP na terénu', `Nášlap 15 + potěr 50 + EPS ${f1InsulMm} mm + ŽB deska ${Math.round((spec.foundations?.baseSlabThickness ?? 0.15) * 1000)} mm`],
    ['S1 · Strop nad 1.NP', `Monolitická ŽB deska ${c1Mm} mm + podlaha 2.NP (${f2Mm} mm)`],
    ['ST1 · Strop 2.NP (podkroví)', `SDK podhled + parozábrana + minerální izolace ${c2InsulMm} mm`],
    [
      `ST2 · Střešní konstrukce`,
      `${data.roof.isTruss ? 'Dřevěné příhradové vazníky' : 'Klasický krov C24'} (${data.roof.pitchDeg.toFixed(1).replace('.', ',')}°) + tašková krytina`,
    ],
  ];

  const headerH = 28;
  const rowH = 33;
  const totalH = headerH + items.length * rowH + 8;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="18">SKLADBY KONSTRUKCÍ V ŘEZU</text>`);

  let curY = headerH + 14;
  items.forEach(([k, v], idx) => {
    parts.push(`<text class="cad-table-txt" style="font-weight:700;font-size:10.5px;" x="12" y="${curY}">${esc(k)}</text>`);
    parts.push(`<text class="cad-table-txt" style="font-size:10px;fill:#475569;" x="12" y="${curY + 13}">${esc(v)}</text>`);
    if (idx < items.length - 1) {
      parts.push(`<line class="cad-table-row-line" x1="10" y1="${curY + 19}" x2="${width - 10}" y2="${curY + 19}" />`);
    }
    curY += rowH;
  });

  parts.push('</g>');
  return { svg: parts.join('\n'), height: totalH };
}

function renderSectionLegendPanel(x, y, width, units, showHatches) {
  const h = 148;
  const conc = fillFor('sec-hatch-concrete', '#e2e8f0', showHatches);
  const mas = fillFor('sec-hatch-masonry', '#cbd5e1', showHatches);
  const sdk = fillFor('sec-hatch-sdk', '#f1f5f9', showHatches);
  const ins = fillFor('sec-hatch-insul', '#fef9c3', showHatches);
  const grav = fillFor('sec-hatch-gravel', '#f1f5f9', showHatches);
  const timb = fillFor('sec-hatch-timber', '#fde68a', showHatches);

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="24" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="16">LEGENDA ŠRAFŮ ŘEZU · KÓTY V ${esc(units.toUpperCase())}</text>`);

  const swatches = [
    [conc, 'ŽB beton (pasy, desky, věnce, schodiště)', 14, 34],
    [mas, 'Nosné a obvodové keramické zdivo', 14, 56],
    [sdk, 'Lehká akustická příčka SDK (125 mm)', 14, 78],
    [ins, 'Tepelná izolace (EPS / ETICS / vata)', 14, 100],
    [grav, 'Hutněný štěrkový podsyp / zemina', 14, 122],
    [timb, 'Řezivo krovu / příhradových vazníků', 284, 122],
  ];

  // Compact 2-column for bottom row, 1-column for top 4 or split cleanly into 2 columns
  const colSwatches = [
    [conc, 'ŽB beton (pasy, desky, schody)', 14, 38],
    [mas, 'Nosné zdivo keramické', 14, 64],
    [sdk, 'Akustická příčka SDK', 14, 90],
    [ins, 'Tepelná izolace (EPS/ETICS/vata)', 276, 38],
    [grav, 'Štěrkový podsyp / zemina', 276, 64],
    [timb, 'Řezivo vazníků / krovu', 276, 90],
  ];

  for (const [fill, label, sx, sy] of colSwatches) {
    parts.push(`<rect fill="${fill}" stroke="#0f172a" stroke-width="1" x="${sx}" y="${sy}" width="26" height="14" />`);
    parts.push(`<text class="cad-table-txt" style="font-size:10px;" x="${sx + 34}" y="${sy + 11}">${esc(label)}</text>`);
  }

  parts.push(`<line class="cad-waterproof" x1="14" y1="126" x2="40" y2="126" />`);
  parts.push(`<text class="cad-table-txt" style="font-size:10px;" x="48" y="130">Hydroizolace podlahy na terénu</text>`);
  parts.push(`<line class="cad-ground-line" x1="276" y1="126" x2="302" y2="126" />`);
  parts.push(`<text class="cad-table-txt" style="font-size:10px;" x="310" y="130">Upravený terén (UT -0,150 m)</text>`);
  void swatches;

  parts.push('</g>');
  return { svg: parts.join('\n'), height: h };
}

function renderSectionTitleBlock(x, y, width, designConfig, units) {
  const h = 152;
  const parts = [];
  const wM = (designConfig.footprint?.width ?? 8).toFixed(1).replace('.', ',');
  const lM = (designConfig.footprint?.length ?? 12).toFixed(1).replace('.', ',');

  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" stroke-width="1.8" />`);
  parts.push(`<line x1="0" y1="54" x2="${width}" y2="54" stroke="#334155" stroke-width="1.1" />`);
  parts.push(`<line x1="0" y1="104" x2="${width}" y2="104" stroke="#334155" stroke-width="1.1" />`);
  parts.push(`<line x1="${width * 0.52}" y1="104" x2="${width * 0.52}" y2="${h}" stroke="#334155" stroke-width="1.1" />`);
  parts.push(`<line x1="${width * 0.78}" y1="104" x2="${width * 0.78}" y2="${h}" stroke="#334155" stroke-width="1.1" />`);

  parts.push(`<text class="cad-title-label" x="14" y="16">PROJEKT / OBJEKT</text>`);
  const projectTitle = String(
    designConfig.projectTitle ||
    designConfig.title ||
    (designConfig.id === "compact-5kk" ? "RODINNÝ DŮM 5+KK · VOJÁČKOVI TROUBELICE" : "RODINNÝ DŮM 6+KK · VOJÁČKOVI TROUBELICE")
  ).toUpperCase();
  parts.push(`<text class="cad-title-main" x="14" y="40">${esc(projectTitle)}</text>`);

  parts.push(`<text class="cad-title-label" x="14" y="71">OBSAH VÝKRESU</text>`);
  parts.push(`<text class="cad-title-sub" x="14" y="92">SVISLÉ ŘEZY A-A' (PŘÍČNÝ) A B-B' (PODÉLNÝ) · ${wM} × ${lM} m</text>`);

  parts.push(`<text class="cad-title-label" x="14" y="121">ZDROJ MODELU</text>`);
  const rawLabel = String(designConfig.label || designConfig.id || '');
  if (rawLabel.length > 28) {
    const parenIdx = rawLabel.indexOf('(');
    let line1 = rawLabel;
    let line2 = '';
    if (parenIdx > 0) {
      line1 = rawLabel.slice(0, parenIdx).trim();
      line2 = rawLabel.slice(parenIdx).trim();
    } else {
      line1 = rawLabel.slice(0, 26).trim();
      line2 = rawLabel.slice(26).trim();
    }
    parts.push(`<text class="cad-title-val" x="14" y="134" style="font-size:10px;">${esc(line1)}</text>`);
    parts.push(`<text class="cad-title-val" x="14" y="145" style="font-size:8.5px;fill:#475569;">${esc(line2)}</text>`);
  } else {
    parts.push(`<text class="cad-title-val" x="14" y="140">${esc(rawLabel)}</text>`);
  }

  parts.push(`<text class="cad-title-label" x="${width * 0.52 + 12}" y="121">MĚŘÍTKO</text>`);
  parts.push(`<text class="cad-title-val" x="${width * 0.52 + 12}" y="140">1 : 50</text>`);

  parts.push(`<text class="cad-title-label" x="${width * 0.78 + 12}" y="121">JEDNOTKY</text>`);
  parts.push(`<text class="cad-title-val" x="${width * 0.78 + 12}" y="140">${esc(units)}</text>`);

  parts.push('</g>');
  return parts.join('\n');
}

/**
 * Generates a side-by-side 2D architectural CAD vertical section sheet (`Řez A-A'` & `Řez B-B'`)
 * driven parametrically from `designConfig` and `BOM_SPEC`.
 *
 * @param {Object} designConfig
 * @param {Object} [options]
 * @returns {string}
 */
export function generateSectionsSvg(designConfig, options = {}) {
  const {
    showDimensions = true,
    showInteriorDims = true,
    showOpeningTags = true,
    showHatches = true,
    units = 'mm',
    spec = BOM_SPEC,
  } = options;

  const data = extractSectionData(designConfig, { ...options, spec });

  const sheetW = 3900;
  const sheetH = 1520;
  const sidebarX = 3320;
  const sidebarW = sheetW - sidebarX - 36;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="100%" height="100%" role="img" aria-label="Technické výkresy svislých řezů rodinného domu">`
  );
  parts.push(buildSectionDefsAndStyles());

  // Paper sheet & border frame
  parts.push(`<rect class="cad-sheet-bg" x="0" y="0" width="${sheetW}" height="${sheetH}" />`);
  parts.push(`<rect class="cad-border-outer" x="20" y="20" width="${sheetW - 40}" height="${sheetH - 40}" />`);
  parts.push(`<rect class="cad-border-inner" x="26" y="26" width="${sheetW - 52}" height="${sheetH - 52}" />`);

  // Vertical divider between AA and BB
  parts.push(`<line class="cad-divider" x1="1520" y1="42" x2="1520" y2="${sheetH - 42}" />`);

  const renderOpts = {
    showDimensions,
    showInteriorDims,
    showOpeningTags,
    showHatches,
    units,
  };
  parts.push(renderSingleSectionSvg(data, 'AA', 745, 1110, renderOpts));
  parts.push(renderSingleSectionSvg(data, 'BB', 2420, 1110, renderOpts));

  // Right Info Sidebar
  let curY = 42;
  const diag = renderSectionPlanDiagramAndScale(sidebarX, curY, sidebarW, data);
  parts.push(diag.svg);
  curY += diag.height + 14;

  const pLevels = renderSectionLevelsPanel(sidebarX, curY, sidebarW, data);
  parts.push(pLevels.svg);
  curY += pLevels.height + 14;

  const pAssem = renderSectionAssembliesPanel(sidebarX, curY, sidebarW, data, spec);
  parts.push(pAssem.svg);
  curY += pAssem.height + 14;

  const pLegend = renderSectionLegendPanel(sidebarX, curY, sidebarW, units, showHatches);
  parts.push(pLegend.svg);

  const titleBlockY = sheetH - 42 - 152;
  parts.push(renderSectionTitleBlock(sidebarX, titleBlockY, sidebarW, designConfig, units));

  parts.push('</svg>');
  return parts.join('\n');
}

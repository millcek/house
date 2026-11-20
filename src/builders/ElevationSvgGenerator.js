import { computeFloorBounds } from './RoomBuilder.js';
import { buildOpeningSchedule } from '../exports/ProjectSchedules.js';

const SCALE = 100; // 1 m = 100 SVG units (1:50 at sheet layout)

const SIDE_META = {
  east: {
    key: 'east',
    dir: 'V',
    title: 'POHLED VÝCHODNÍ (V)',
    subtitle: 'Čelní / vstupní fasáda (z ulice)',
    isGable: false,
  },
  south: {
    key: 'south',
    dir: 'J',
    title: 'POHLED JIŽNÍ (J)',
    subtitle: 'Uliční štítová fasáda',
    isGable: true,
  },
  west: {
    key: 'west',
    dir: 'Z',
    title: 'POHLED ZÁPADNÍ (Z)',
    subtitle: 'Zahradní fasáda s terasou a pergolou',
    isGable: false,
  },
  north: {
    key: 'north',
    dir: 'S',
    title: 'POHLED SEVERNÍ (S)',
    subtitle: 'Boční štítová fasáda (směr k dílně)',
    isGable: true,
  },
};

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

function formatArea(sqm) {
  return `${Number(sqm).toFixed(1).replace('.', ',')}\u00A0m²`;
}

/**
 * Orthographic horizontal coordinate `u` (m) when standing outside and looking
 * straight at the given facade:
 * - east (+X looking -X): left = South (+Z), right = North (-Z) => u = -z
 * - south (+Z looking -Z): left = West (-X), right = East (+X) => u = +x
 * - west (-X looking +X): left = North (-Z), right = South (+Z) => u = +z
 * - north (-Z looking +Z): left = East (+X), right = West (-X) => u = -x
 */
export function projectU(side, x, z) {
  switch (side) {
    case 'east':
      return -z;
    case 'south':
      return x;
    case 'west':
      return z;
    case 'north':
      return -x;
    default:
      return x;
  }
}

function classifyExteriorWallSide(wall, bounds) {
  const [x1, z1] = wall.from;
  const [x2, z2] = wall.to;
  const isHoriz = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  if (isHoriz) {
    const midZ = (z1 + z2) / 2;
    const centerZ = (bounds.wallMinZ + bounds.wallMaxZ) / 2;
    return midZ < centerZ ? 'north' : 'south';
  }
  const midX = (x1 + x2) / 2;
  const centerX = (bounds.wallMinX + bounds.wallMaxX) / 2;
  return midX >= centerX ? 'east' : 'west';
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
 * Extracts parametric 2D elevation geometry for all 4 facades (`east`, `south`,
 * `west`, `north`) from `designConfig`. Shared between SVG and DXF generators.
 *
 * @param {Object} designConfig
 * @param {Object} [options]
 * @returns {Object}
 */
export function extractElevationData(designConfig, options = {}) {
  const bounds1 = computeFloorBounds(designConfig.floor1, designConfig);
  const minX = bounds1.wallMinX;
  const maxX = bounds1.wallMaxX;
  const minZ = bounds1.wallMinZ;
  const maxZ = bounds1.wallMaxZ;
  const W = Number((maxX - minX).toFixed(4));
  const L = Number((maxZ - minZ).toFixed(4));

  const gradeY = -0.15;
  const baseSlabY = designConfig.floor1?.elevation ?? 0;
  const f1FinishThick =
    (designConfig.floor1?.finishes || []).find((f) => f.material !== 'terrace')?.thickness ?? 0.22;
  const f1FinishY = Number((baseSlabY + f1FinishThick).toFixed(4));
  const c1BottomY = designConfig.ceilingSlab?.y ?? designConfig.floorHeight ?? 2.95;
  const f2StructY = designConfig.floor2?.elevation ?? 3.17;
  const f2FinishThick =
    (designConfig.floor2?.finishes || []).find((f) => f.material !== 'terrace')?.thickness ?? 0.12;
  const f2FinishY = Number((f2StructY + f2FinishThick).toFixed(4));
  const wallTopY = designConfig.roof?.y ?? designConfig.ceiling2Slab?.y ?? 6.12;

  const roofDef = designConfig.roof || {
    width: W,
    length: L,
    height: 2.8,
    y: wallTopY,
    ridgeAxis: 'z',
    eaveOverhang: 0.45,
    gableOverhang: 0.35,
    thickness: 0.22,
  };
  const ridgeAxis = roofDef.ridgeAxis || 'z';
  const roofWidth = roofDef.width ?? W;
  const roofLength = roofDef.length ?? L;
  const roofHeight = roofDef.height ?? 2.8;
  const roofY = roofDef.y ?? wallTopY;
  const eaveOverhang = roofDef.eaveOverhang ?? 0.45;
  const gableOverhang = roofDef.gableOverhang ?? 0.35;
  const roofThickness = roofDef.thickness ?? 0.22;

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
    });

  // Collect exterior openings per facade
  const openingsBySide = {
    east: [],
    south: [],
    west: [],
    north: [],
  };

  const floors = [
    { key: '1np', elev: baseSlabY, cfg: designConfig.floor1 },
    { key: '2np', elev: f2StructY, cfg: designConfig.floor2 },
  ].filter((f) => f.cfg);

  for (const floor of floors) {
    const floorBounds = computeFloorBounds(floor.cfg, designConfig);
    for (const wall of floor.cfg.walls || []) {
      if ((wall.material || 'wall') !== 'wall') continue;
      const side = classifyExteriorWallSide(wall, floorBounds);
      const [x1, z1] = wall.from;
      const [x2, z2] = wall.to;
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len <= 0.001) continue;
      const ux = (x2 - x1) / len;
      const uz = (z2 - z1) / len;
      const wallId = wall.id || wall.name || 'wall';

      (wall.openings || []).forEach((op, origIndex) => {
        const at = typeof op.at === 'number' ? op.at : op.offset ?? 0;
        const wx = x1 + ux * at;
        const wz = z1 + uz * at;
        const uCenter = Number(projectU(side, wx, wz).toFixed(4));
        const uMin = Number((uCenter - op.width / 2).toFixed(4));
        const uMax = Number((uCenter + op.width / 2).toFixed(4));
        const sill = op.sill ?? 0;
        const yBottom = Number((floor.elev + sill).toFixed(4));
        const yTop = Number((yBottom + op.height).toFixed(4));

        let hingeSide = null;
        if (op.swing) {
          const hingeU = op.swing.hinge === 'start' ? at - op.width / 2 : at + op.width / 2;
          const hx = x1 + ux * hingeU;
          const hz = z1 + uz * hingeU;
          hingeSide = projectU(side, hx, hz) < uCenter ? 'left' : 'right';
        }

        const mark = openingSchedule.tagByKey.get(`${floor.key}|${wallId}|${origIndex}`) || '';
        const isDoor = op.type === 'door';
        const isSliding = Boolean(op.sliding);
        openingsBySide[side].push({
          mark,
          floorKey: floor.key,
          name: op.name || '',
          width: op.width,
          height: op.height,
          sill,
          uCenter,
          uMin,
          uMax,
          yBottom,
          yTop,
          isDoor,
          isSliding,
          hingeSide,
          hasParapetSill: !isDoor && !isSliding && sill > 0.3,
        });
      });
    }
  }

  for (const side of Object.keys(openingsBySide)) {
    openingsBySide[side].sort((a, b) => a.yBottom - b.yBottom || a.uCenter - b.uCenter);
  }

  // Attachments from floor1
  const terraceFinish = (designConfig.floor1?.finishes || []).find((f) => f.material === 'terrace');
  const terrace = terraceFinish
    ? {
        minX: terraceFinish.pos[0] - terraceFinish.size[0] / 2,
        maxX: terraceFinish.pos[0] + terraceFinish.size[0] / 2,
        minZ: terraceFinish.pos[1] - terraceFinish.size[1] / 2,
        maxZ: terraceFinish.pos[1] + terraceFinish.size[1] / 2,
        yBottom: gradeY,
        yTop: baseSlabY + (terraceFinish.thickness ?? 0.14),
      }
    : null;

  const pergolaDef = (designConfig.floor1?.furniture || []).find((f) => f.type === 'pergola');
  let pergola = null;
  if (pergolaDef?.posts?.length) {
    const postSize = pergolaDef.postSize ?? 0.14;
    const halfP = postSize / 2;
    const xs = pergolaDef.posts.map(([px]) => px);
    const zs = pergolaDef.posts.map(([, pz]) => pz);
    const pMinX = Math.min(...xs) - halfP;
    const pMaxX = Math.max(...xs) + halfP;
    const pMinZ = Math.min(...zs) - halfP;
    const pMaxZ = Math.max(...zs) + halfP;
    const postH = pergolaDef.height ?? 2.8;
    const beamH = pergolaDef.beamHeight ?? 0.16;
    const roofT = pergolaDef.roofThickness ?? 0.06;
    const rafterCount = pergolaDef.rafterCount ?? 7;
    const raftersZ = [];
    for (let i = 0; i < rafterCount; i++) {
      raftersZ.push(pMinZ + ((pMaxZ - pMinZ) * (i + 1)) / (rafterCount + 1));
    }
    pergola = {
      minX: pMinX,
      maxX: pMaxX,
      minZ: pMinZ,
      maxZ: pMaxZ,
      postSize,
      postBottomY: terrace ? terrace.yTop : baseSlabY,
      postTopY: baseSlabY + postH,
      beamTopY: baseSlabY + postH + beamH,
      roofTopY: baseSlabY + postH + beamH + roofT,
      posts: pergolaDef.posts.map(([px, pz]) => ({ x: px, z: pz })),
      raftersZ,
    };
  }

  const canopyDef = (designConfig.floor1?.furniture || []).find((f) => f.type === 'canopy');
  const canopy = canopyDef
    ? {
        minX: canopyDef.pos[0] - canopyDef.size[0] / 2,
        maxX: canopyDef.pos[0] + canopyDef.size[0] / 2,
        minZ: canopyDef.pos[1] - canopyDef.size[2] / 2,
        maxZ: canopyDef.pos[1] + canopyDef.size[2] / 2,
        yBottom: baseSlabY + (canopyDef.yOffset ?? 2.55),
        yTop: baseSlabY + (canopyDef.yOffset ?? 2.55) + canopyDef.size[1],
      }
    : null;

  const fireplace = (designConfig.floor1?.furniture || []).find((f) => f.type === 'fireplace');
  let chimney = null;
  if (fireplace) {
    const cx = fireplace.pos[0];
    const cz = 0.55; // Matches chimney flue position in FloorPlanSvgGenerator
    const size = 0.38;
    const distFromRidge = ridgeAxis === 'z' ? Math.abs(cx) : Math.abs(cz);
    const yRoofAtChimney = Number(
      (roofY + roofHeight * Math.max(0, 1 - distFromRidge / halfSpan) + dyThick).toFixed(4)
    );
    const yTop = Number(Math.max(yRoofAtChimney + 1.4, 8.0).toFixed(3));
    chimney = {
      x: cx,
      z: cz,
      size,
      halfSize: size / 2,
      yRoofBase: Number((yRoofAtChimney - dyThick).toFixed(4)),
      yRoofSurface: yRoofAtChimney,
      yTop,
      capHeight: 0.08,
      capOverhang: 0.06,
      occludedOnEast: ridgeAxis === 'z' && cx < 0 && yTop <= ridgeTopY,
    };
  }

  // Side-specific projected views
  const orientMap = new Map(
    (openingSchedule.glazingByOrientation || []).map((o) => [o.side, o])
  );

  const views = {};
  for (const side of ['east', 'south', 'west', 'north']) {
    const meta = SIDE_META[side];
    const isGable =
      (ridgeAxis === 'z' && (side === 'south' || side === 'north')) ||
      (ridgeAxis === 'x' && (side === 'east' || side === 'west'));

    const wallHalfW = (side === 'east' || side === 'west' ? L : W) / 2;
    const wallMinU = -wallHalfW;
    const wallMaxU = wallHalfW;

    const projBox = (box, foregroundSides) => {
      if (!box) return null;
      const u1 = projectU(side, box.minX, box.minZ);
      const u2 = projectU(side, box.maxX, box.maxZ);
      return {
        ...box,
        uMin: Number(Math.min(u1, u2).toFixed(4)),
        uMax: Number(Math.max(u1, u2).toFixed(4)),
        isForeground: foregroundSides.includes(side),
      };
    };

    const sideTerrace =
      side === 'east' ? null : projBox(terrace, ['west', 'south']);
    const sidePergola =
      side === 'east' || !pergola
        ? null
        : {
            ...projBox(pergola, ['west', 'south']),
            postUs: sortUnique(pergola.posts.map((p) => projectU(side, p.x, p.z)), 0.02),
            rafterUs: sortUnique(
              pergola.raftersZ.map((rz) => projectU(side, pergola.minX, rz)),
              0.02
            ),
          };
    const sideCanopy =
      side === 'west' ? null : projBox(canopy, ['east']);

    let sideChimney = null;
    if (chimney && !(side === 'east' && chimney.occludedOnEast)) {
      const cu = projectU(side, chimney.x, chimney.z);
      sideChimney = {
        ...chimney,
        uCenter: Number(cu.toFixed(4)),
        uMin: Number((cu - chimney.halfSize).toFixed(4)),
        uMax: Number((cu + chimney.halfSize).toFixed(4)),
        inFrontOfRoof: side === 'west',
      };
    }

    const roofMinU = isGable ? -outerHalfSpan : -outerHalfRun;
    const roofMaxU = isGable ? outerHalfSpan : outerHalfRun;

    // Outermost visual bounds for terrain extension & horizontal dimensions
    const allUMins = [wallMinU, roofMinU];
    const allUMaxs = [wallMaxU, roofMaxU];
    if (sideTerrace) {
      allUMins.push(sideTerrace.uMin);
      allUMaxs.push(sideTerrace.uMax);
    }
    if (sidePergola) {
      allUMins.push(sidePergola.uMin);
      allUMaxs.push(sidePergola.uMax);
    }
    if (sideCanopy) {
      allUMins.push(sideCanopy.uMin);
      allUMaxs.push(sideCanopy.uMax);
    }

    const totalMinU = Number(Math.min(...allUMins).toFixed(4));
    const totalMaxU = Number(Math.max(...allUMaxs).toFixed(4));

    const orientInfo = orientMap.get(meta.dir);
    const trueDirLabel = orientInfo
      ? `skutečná orientace ${orientInfo.trueDir} (${orientInfo.trueAzimuthDeg}°)`
      : '';

    views[side] = {
      ...meta,
      isGable,
      wallMinU,
      wallMaxU,
      roofMinU,
      roofMaxU,
      totalMinU,
      totalMaxU,
      trueDirLabel,
      orientInfo,
      openings: openingsBySide[side],
      terrace: sideTerrace,
      pergola: sidePergola,
      canopy: sideCanopy,
      chimney: sideChimney,
      // Downspout U positions placed cleanly near wall ends avoiding openings
      downspoutsU: isGable
        ? [-wallHalfW, wallHalfW]
        : side === 'west'
          ? [-wallHalfW + 0.15, wallHalfW - 0.45]
          : [-wallHalfW + 0.15, wallHalfW - 0.15],
    };
  }

  return {
    bounds: bounds1,
    footprint: { width: W, length: L, minX, maxX, minZ, maxZ },
    levels: {
      gradeY,
      baseSlabY,
      f1FinishY,
      c1BottomY,
      f2StructY,
      f2FinishY,
      wallTopY,
      eaveBottomY,
      eaveTopY,
      gablePeakY,
      ridgeTopY,
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
      outerHalfSpan,
      outerHalfRun,
      slopeAngle,
      pitchDeg,
      dyEave,
      dyThick,
    },
    chimney,
    terrace,
    pergola,
    canopy,
    openingSchedule,
    views,
  };
}

function buildElevDefsAndStyles() {
  return `
  <defs>
    <style type="text/css"><![CDATA[
      .cad-sheet-bg { fill: #ffffff; }
      .cad-border-outer { fill: none; stroke: #0f172a; stroke-width: 3; }
      .cad-border-inner { fill: none; stroke: #334155; stroke-width: 1; }
      .cad-divider { stroke: #cbd5e1; stroke-width: 1.2; stroke-dasharray: 10 6; }
      .cad-elev-heading { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 800; fill: #0f172a; letter-spacing: 0.04em; }
      .cad-elev-sub { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: #475569; }
      .cad-wall-facade { fill: #f8fafc; stroke: #0f172a; stroke-width: 2.2; stroke-linejoin: miter; }
      .cad-wall-facade-bw { fill: #ffffff; stroke: #0f172a; stroke-width: 2.2; stroke-linejoin: miter; }
      .cad-plinth { fill: #cbd5e1; stroke: #0f172a; stroke-width: 1.6; }
      .cad-plinth-bw { fill: #f1f5f9; stroke: #0f172a; stroke-width: 1.6; }
      .cad-roof-shell { stroke: #0f172a; stroke-width: 2.2; stroke-linejoin: round; }
      .cad-roof-fascia { fill: #334155; stroke: #0f172a; stroke-width: 1.4; }
      .cad-gutter { fill: #64748b; stroke: #0f172a; stroke-width: 1.2; }
      .cad-downspout { fill: #94a3b8; stroke: #0f172a; stroke-width: 1.1; }
      .cad-win-frame { fill: #334155; stroke: #0f172a; stroke-width: 1.2; }
      .cad-win-sash { fill: none; stroke: #0f172a; stroke-width: 0.9; }
      .cad-win-glass { stroke: #0284c7; stroke-width: 0.8; }
      .cad-win-sill { fill: #94a3b8; stroke: #0f172a; stroke-width: 1; }
      .cad-win-swing { fill: none; stroke: #475569; stroke-width: 0.75; stroke-dasharray: 4 3; }
      .cad-door-frame { fill: #334155; stroke: #0f172a; stroke-width: 1.3; }
      .cad-door-leaf { fill: #475569; stroke: #0f172a; stroke-width: 1.2; }
      .cad-door-leaf-bw { fill: #e2e8f0; stroke: #0f172a; stroke-width: 1.2; }
      .cad-door-detail { fill: none; stroke: #94a3b8; stroke-width: 0.9; }
      .cad-pergola-timber { fill: #92400e; stroke: #0f172a; stroke-width: 1.2; }
      .cad-pergola-timber-bg { fill: #e2e8f0; stroke: #64748b; stroke-width: 0.9; }
      .cad-terrace-deck { fill: #fde68a; stroke: #78350f; stroke-width: 1.4; }
      .cad-canopy-glass { fill: #bae6fd; fill-opacity: 0.65; stroke: #0284c7; stroke-width: 1.2; }
      .cad-canopy-frame { fill: #334155; stroke: #0f172a; stroke-width: 1.2; }
      .cad-chimney { fill: #e2e8f0; stroke: #0f172a; stroke-width: 1.6; }
      .cad-chimney-cap { fill: #64748b; stroke: #0f172a; stroke-width: 1.4; }
      .cad-floor-ref { stroke: #64748b; stroke-width: 0.8; stroke-dasharray: 8 4; opacity: 0.65; }
      .cad-ground-line { stroke: #0f172a; stroke-width: 3.2; stroke-linecap: square; }
      .cad-dim-line { stroke: #334155; stroke-width: 0.85; fill: none; }
      .cad-dim-ext { stroke: #94a3b8; stroke-width: 0.65; fill: none; }
      .cad-dim-tick { stroke: #0f172a; stroke-width: 1.3; }
      .cad-dim-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: #0f172a; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px; stroke-linejoin: round; }
      .cad-elev-tri-fill { fill: #0f172a; stroke: #0f172a; stroke-width: 1; }
      .cad-elev-tri-empty { fill: #ffffff; stroke: #0f172a; stroke-width: 1; }
      .cad-elev-text { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 700; fill: #0f172a; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.2px; stroke-linejoin: round; }
      .cad-tag-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9.5px; font-weight: 700; fill: #0f172a; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; }
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
    <pattern id="elev-roof-tiles" width="24" height="19" patternUnits="userSpaceOnUse">
      <rect width="24" height="19" fill="#64748b" />
      <line x1="0" y1="19" x2="24" y2="19" stroke="#334155" stroke-width="1" stroke-opacity="0.55" />
      <line x1="12" y1="0" x2="12" y2="19" stroke="#475569" stroke-width="0.6" stroke-opacity="0.35" />
    </pattern>
    <pattern id="elev-earth-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="14" fill="#f8fafc" />
      <line x1="0" y1="0" x2="0" y2="14" stroke="#94a3b8" stroke-width="1.2" />
      <line x1="7" y1="0" x2="7" y2="14" stroke="#cbd5e1" stroke-width="0.9" />
    </pattern>
    <linearGradient id="elev-glass-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="50%" stop-color="#e0f2fe" />
      <stop offset="100%" stop-color="#f0f9ff" />
    </linearGradient>
  </defs>`;
}

function renderElevationMarkerSvg(tipX, tipY, elevM, align = 'left') {
  const triW = 9;
  const triH = 12;
  const leader = 66;
  const dir = align === 'right' ? 1 : -1;
  const endX = tipX + dir * leader;
  const anchor = align === 'right' ? 'end' : 'start';
  const textX = endX - dir * 3;
  const label = formatElevation(elevM);

  return `
    <g class="cad-elev-marker">
      <line x1="${tipX.toFixed(1)}" y1="${tipY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${tipY.toFixed(1)}" stroke="#0f172a" stroke-width="1.1" />
      <polygon class="cad-elev-tri-fill" points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${(tipX - triW).toFixed(1)},${(tipY - triH).toFixed(1)} ${tipX.toFixed(1)},${(tipY - triH).toFixed(1)}" />
      <polygon class="cad-elev-tri-empty" points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${(tipX + triW).toFixed(1)},${(tipY - triH).toFixed(1)} ${tipX.toFixed(1)},${(tipY - triH).toFixed(1)}" />
      <text class="cad-elev-text" x="${textX.toFixed(1)}" y="${(tipY - 4).toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text>
    </g>`;
}

function renderVerticalDimChainSvg(yNodesM, uLineM, uExtStartM, units = 'mm', textOffsetPx = 14) {
  if (!yNodesM || yNodesM.length < 2) return '';
  const xLine = m2svg(uLineM);
  const xExtStart = uExtStartM !== null ? m2svg(uExtStartM) : null;
  const overshoot = xExtStart !== null ? 14 * (Math.sign(xLine - xExtStart) || 1) : 0;
  const tick = 7;

  const parts = [];
  const y0 = e2svgY(yNodesM[0]);
  const yN = e2svgY(yNodesM[yNodesM.length - 1]);
  parts.push(`<line class="cad-dim-line" x1="${xLine}" y1="${y0}" x2="${xLine}" y2="${yN}" />`);

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
    const label = formatLength(span, units);
    const tx = xLine + textOffsetPx;
    parts.push(
      `<text class="cad-dim-text" x="${tx}" y="${midY}" transform="rotate(-90 ${tx} ${midY})">${esc(label)}</text>`
    );
  }
  return parts.join('\n');
}

function renderHorizontalDimChainSvg(uNodesM, yLineM, yExtStartM, units = 'mm', textOffsetPx = 15) {
  if (!uNodesM || uNodesM.length < 2) return '';
  const yLine = e2svgY(yLineM);
  const yExtStart = yExtStartM !== null ? e2svgY(yExtStartM) : null;
  const overshoot = yExtStart !== null ? 14 * (Math.sign(yLine - yExtStart) || 1) : 0;
  const tick = 7;

  const parts = [];
  const x0 = m2svg(uNodesM[0]);
  const xN = m2svg(uNodesM[uNodesM.length - 1]);
  parts.push(`<line class="cad-dim-line" x1="${x0}" y1="${yLine}" x2="${xN}" y2="${yLine}" />`);

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
    const label = formatLength(span, units);
    const ty = yLine + textOffsetPx;
    parts.push(`<text class="cad-dim-text" x="${midX}" y="${ty}">${esc(label)}</text>`);
  }
  return parts.join('\n');
}

function renderOpeningSvg(op, showHatches, showOpeningSwing) {
  const x = m2svg(op.uMin);
  const y = e2svgY(op.yTop);
  const w = m2svg(op.width);
  const h = m2svg(op.height);
  const glassFill = showHatches ? 'url(#elev-glass-grad)' : '#f0f9ff';

  const parts = [];

  if (op.isDoor) {
    // Exterior door assembly
    const frameT = 6;
    const leafCls = showHatches ? 'cad-door-leaf' : 'cad-door-leaf-bw';
    parts.push(`<rect class="cad-door-frame" x="${x}" y="${y}" width="${w}" height="${h}" />`);
    const lx = x + frameT;
    const ly = y + frameT;
    const lw = Math.max(10, w - 2 * frameT);
    const lh = Math.max(20, h - frameT);
    parts.push(`<rect class="${leafCls}" x="${lx}" y="${ly}" width="${lw}" height="${lh}" />`);

    // Modern narrow vertical glass sidelight strip on hinge-opposite or center side
    const glW = Math.min(18, lw * 0.22);
    const glX = op.hingeSide === 'right' ? lx + lw * 0.24 : lx + lw * 0.76 - glW;
    const glY = ly + 18;
    const glH = Math.max(40, lh - 36);
    parts.push(`<rect fill="${glassFill}" stroke="#0f172a" stroke-width="0.9" x="${glX}" y="${glY}" width="${glW}" height="${glH}" />`);

    // Subtle horizontal grooves
    for (const frac of [0.28, 0.52, 0.76]) {
      const gy = ly + lh * frac;
      parts.push(`<line class="cad-door-detail" x1="${lx + 4}" y1="${gy}" x2="${lx + lw - 4}" y2="${gy}" />`);
    }

    // Handle on latch side
    const handleX = op.hingeSide === 'right' ? lx + 9 : lx + lw - 15;
    const handleY = ly + lh * 0.52;
    parts.push(`<rect x="${handleX}" y="${handleY}" width="8" height="3" fill="#e2e8f0" stroke="#0f172a" stroke-width="0.6" />`);

    // Dashed opening triangle (apex at latch edge, legs to hinges)
    if (showOpeningSwing && op.hingeSide) {
      const hingeX = op.hingeSide === 'left' ? lx : lx + lw;
      const latchX = op.hingeSide === 'left' ? lx + lw : lx;
      parts.push(
        `<polyline class="cad-win-swing" points="${hingeX},${ly} ${latchX},${ly + lh / 2} ${hingeX},${ly + lh}" />`
      );
    }
    return parts.join('\n');
  }

  // Window or HS Portal
  const frameT = op.isSliding ? 6 : 5;
  parts.push(`<rect class="cad-win-frame" x="${x}" y="${y}" width="${w}" height="${h}" />`);

  const ix = x + frameT;
  const iy = y + frameT;
  const iw = Math.max(10, w - 2 * frameT);
  const ih = Math.max(10, h - 2 * frameT);

  if (op.isSliding) {
    // 2-panel HS Portal
    const midX = ix + iw / 2;
    const sashT = 4;
    for (const px of [ix, midX]) {
      const pw = iw / 2;
      parts.push(`<rect fill="${glassFill}" class="cad-win-glass" x="${px + sashT}" y="${iy + sashT}" width="${pw - 2 * sashT}" height="${ih - 2 * sashT}" />`);
      parts.push(`<rect class="cad-win-sash" x="${px}" y="${iy}" width="${pw}" height="${ih}" />`);
    }
    // Central interlock mullion
    parts.push(`<rect class="cad-win-frame" x="${midX - 3}" y="${y}" width="6" height="${h}" />`);
    // Sliding arrow on left leaf + fixed mark on right leaf
    const arrowY = iy + ih / 2;
    const arrowX1 = ix + iw * 0.16;
    const arrowX2 = ix + iw * 0.34;
    parts.push(`<line x1="${arrowX1}" y1="${arrowY}" x2="${arrowX2}" y2="${arrowY}" stroke="#334155" stroke-width="1.4" />`);
    parts.push(`<polyline points="${arrowX2 - 7},${arrowY - 5} ${arrowX2},${arrowY} ${arrowX2 - 7},${arrowY + 5}" fill="none" stroke="#334155" stroke-width="1.4" />`);
    const fixX = midX + iw * 0.25;
    parts.push(`<circle cx="${fixX}" cy="${arrowY}" r="3.5" fill="none" stroke="#64748b" stroke-width="1.1" />`);
    return parts.join('\n');
  }

  // Standard 1-sash or 2-sash window
  const twoSashes = op.width >= 1.4;
  if (twoSashes) {
    const midX = ix + iw / 2;
    const pw = iw / 2 - 2;
    const sashT = 3.5;
    for (const [sx, dir] of [
      [ix, 1],
      [midX + 2, -1],
    ]) {
      parts.push(`<rect fill="${glassFill}" class="cad-win-glass" x="${sx + sashT}" y="${iy + sashT}" width="${pw - 2 * sashT}" height="${ih - 2 * sashT}" />`);
      parts.push(`<rect class="cad-win-sash" x="${sx}" y="${iy}" width="${pw}" height="${ih}" />`);
      if (showOpeningSwing) {
        const hingeX = dir > 0 ? sx : sx + pw;
        const latchX = dir > 0 ? sx + pw : sx;
        parts.push(
          `<polyline class="cad-win-swing" points="${hingeX},${iy} ${latchX},${iy + ih / 2} ${hingeX},${iy + ih}" />`
        );
        // Tilt triangle
        parts.push(
          `<polyline class="cad-win-swing" points="${sx},${iy + ih} ${sx + pw / 2},${iy} ${sx + pw},${iy + ih}" />`
        );
      }
    }
    // Central mullion
    parts.push(`<rect class="cad-win-frame" x="${midX - 2.5}" y="${y}" width="5" height="${h}" />`);
  } else {
    const sashT = 3.5;
    parts.push(`<rect fill="${glassFill}" class="cad-win-glass" x="${ix + sashT}" y="${iy + sashT}" width="${iw - 2 * sashT}" height="${ih - 2 * sashT}" />`);
    parts.push(`<rect class="cad-win-sash" x="${ix}" y="${iy}" width="${iw}" height="${ih}" />`);
    if (showOpeningSwing) {
      parts.push(`<polyline class="cad-win-swing" points="${ix},${iy} ${ix + iw},${iy + ih / 2} ${ix},${iy + ih}" />`);
      parts.push(`<polyline class="cad-win-swing" points="${ix},${iy + ih} ${ix + iw / 2},${iy} ${ix + iw},${iy + ih}" />`);
    }
  }

  // Exterior window sill
  if (op.hasParapetSill) {
    parts.push(`<rect class="cad-win-sill" x="${x - 4}" y="${y + h}" width="${w + 8}" height="5" />`);
  }

  return parts.join('\n');
}

function renderPergolaAndTerraceSvg(view, isBackground = false, showHatches = true) {
  const parts = [];
  const p = view.pergola;
  const t = view.terrace;

  if (t) {
    const x = m2svg(t.uMin);
    const y = e2svgY(t.yTop);
    const w = m2svg(t.uMax - t.uMin);
    const h = m2svg(t.yTop - t.yBottom);
    const cls = isBackground ? 'cad-pergola-timber-bg' : 'cad-terrace-deck';
    const opacity = isBackground ? 'opacity="0.55"' : '';
    parts.push(`<rect class="${cls}" ${opacity} x="${x}" y="${y}" width="${w}" height="${h}" />`);
  }

  if (p) {
    const postCls = isBackground ? 'cad-pergola-timber-bg' : 'cad-pergola-timber';
    const fillAttr = showHatches || isBackground ? '' : 'style="fill:#e2e8f0;"';
    const opacity = isBackground ? 'opacity="0.6"' : '';

    // Posts
    for (const pu of p.postUs) {
      const px = m2svg(pu - p.postSize / 2);
      const pw = m2svg(p.postSize);
      const py = e2svgY(p.postTopY);
      const ph = m2svg(p.postTopY - p.postBottomY);
      parts.push(`<rect class="${postCls}" ${fillAttr} ${opacity} x="${px}" y="${py}" width="${pw}" height="${ph}" />`);
    }

    // Perimeter beam
    const bx = m2svg(p.uMin);
    const bw = m2svg(p.uMax - p.uMin);
    const by = e2svgY(p.beamTopY);
    const bh = m2svg(p.beamTopY - p.postTopY);
    parts.push(`<rect class="${postCls}" ${fillAttr} ${opacity} x="${bx}" y="${by}" width="${bw}" height="${bh}" />`);

    // Pergola roof slab
    const ry = e2svgY(p.roofTopY);
    const rh = m2svg(p.roofTopY - p.beamTopY);
    const roofFill = isBackground ? '#cbd5e1' : showHatches ? '#475569' : '#f1f5f9';
    parts.push(
      `<rect fill="${roofFill}" stroke="#0f172a" stroke-width="${isBackground ? '0.9' : '1.3'}" ${opacity} x="${bx}" y="${ry}" width="${bw}" height="${rh}" />`
    );

    // Subtle rafter ends along West view
    if (!isBackground && p.rafterUs.length > 2) {
      for (const ru of p.rafterUs) {
        const rx = m2svg(ru - 0.04);
        parts.push(
          `<rect fill="#78350f" stroke="#0f172a" stroke-width="0.7" x="${rx}" y="${by + 2}" width="8" height="${Math.max(4, bh - 4)}" />`
        );
      }
    }
  }

  return parts.join('\n');
}

function renderCanopySvg(canopy, isBackground = false, showHatches = true) {
  if (!canopy) return '';
  const x = m2svg(canopy.uMin);
  const y = e2svgY(canopy.yTop);
  const w = m2svg(canopy.uMax - canopy.uMin);
  const h = m2svg(canopy.yTop - canopy.yBottom);
  const parts = [];

  if (isBackground) {
    parts.push(`<rect class="cad-canopy-frame" opacity="0.55" x="${x}" y="${y}" width="${w}" height="${h}" />`);
    return parts.join('\n');
  }

  if (showHatches) {
    parts.push(`<rect class="cad-canopy-glass" x="${x}" y="${y}" width="${w}" height="${h}" />`);
  } else {
    parts.push(`<rect class="cad-canopy-frame" x="${x}" y="${y}" width="${w}" height="${h}" />`);
  }
  // Frame end brackets + top trim
  parts.push(`<rect class="cad-canopy-frame" x="${x}" y="${y}" width="6" height="${h}" />`);
  parts.push(`<rect class="cad-canopy-frame" x="${x + w - 6}" y="${y}" width="6" height="${h}" />`);
  parts.push(`<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="#0f172a" stroke-width="1" />`);

  // Steel suspension tie-rod highlights on East view (2 vertical stays up to wall anchor)
  for (const frac of [0.15, 0.85]) {
    const sx = x + w * frac;
    parts.push(`<line x1="${sx}" y1="${y}" x2="${sx}" y2="${y - 45}" stroke="#334155" stroke-width="1.3" />`);
    parts.push(`<circle cx="${sx}" cy="${y - 45}" r="2.2" fill="#0f172a" />`);
  }

  return parts.join('\n');
}

function renderChimneySvg(chimney, showHatches = true) {
  if (!chimney) return '';
  const x = m2svg(chimney.uMin);
  const w = m2svg(chimney.size);
  const yTop = e2svgY(chimney.yTop);
  const yCapBot = e2svgY(chimney.yTop - chimney.capHeight);
  const yBase = e2svgY(chimney.yRoofBase - 0.12);
  const capOver = m2svg(chimney.capOverhang);

  const parts = [];
  parts.push(
    `<rect class="cad-chimney" style="${showHatches ? '' : 'fill:#ffffff;'}" x="${x}" y="${yCapBot}" width="${w}" height="${yBase - yCapBot}" />`
  );
  // Flashing collar at roof penetration (only visually distinct on front/west roof)
  if (chimney.inFrontOfRoof) {
    const flashY = e2svgY(chimney.yRoofSurface);
    parts.push(
      `<rect fill="#475569" stroke="#0f172a" stroke-width="1" x="${x - 4}" y="${flashY - 12}" width="${w + 8}" height="14" />`
    );
  }
  // Chimney cap + flue pipe
  parts.push(
    `<rect class="cad-chimney-cap" style="${showHatches ? '' : 'fill:#e2e8f0;'}" x="${x - capOver}" y="${yTop}" width="${w + 2 * capOver}" height="${yCapBot - yTop}" />`
  );
  const flueW = 14;
  parts.push(
    `<rect fill="#334155" stroke="#0f172a" stroke-width="0.9" x="${m2svg(chimney.uCenter) - flueW / 2}" y="${yTop - 10}" width="${flueW}" height="10" />`
  );

  return parts.join('\n');
}

function renderRoofSvg(data, view, showHatches = true) {
  const parts = [];
  const L = data.levels;
  const R = data.roof;
  const roofFill = showHatches ? 'url(#elev-roof-tiles)' : '#ffffff';

  parts.push('<g class="layer-roof">');

  if (view.isGable) {
    // Gable view: 6-vertex pitched roof shell polygon + bargeboard + gutter ends
    const hs = R.outerHalfSpan;
    const pts = [
      [m2svg(-hs), e2svgY(L.eaveBottomY)],
      [0, e2svgY(L.gablePeakY)],
      [m2svg(hs), e2svgY(L.eaveBottomY)],
      [m2svg(hs), e2svgY(L.eaveTopY)],
      [0, e2svgY(L.ridgeTopY)],
      [m2svg(-hs), e2svgY(L.eaveTopY)],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    parts.push(`<polygon class="cad-roof-shell" fill="${showHatches ? '#475569' : '#f1f5f9'}" points="${pts}" />`);

    // Inner ridge-tile cap silhouette
    parts.push(`<circle cx="0" cy="${e2svgY(L.ridgeTopY) + 4}" r="7" fill="#334155" stroke="#0f172a" stroke-width="1.2" />`);

    // Eave soffit triangles under overhangs + gutter end caps + downspout elbows
    for (const sign of [-1, 1]) {
      const wallEdgeX = m2svg(sign * R.halfSpan);
      const eaveEdgeX = m2svg(sign * hs);
      const eaveY = e2svgY(L.eaveBottomY);
      const wallPlateY = e2svgY(L.wallTopY);

      // Soffit underside return
      parts.push(
        `<polygon fill="#cbd5e1" stroke="#0f172a" stroke-width="1" points="${wallEdgeX},${wallPlateY} ${eaveEdgeX},${eaveY} ${wallEdgeX},${eaveY}" />`
      );

      // Gutter profile on eave tip
      const gx = sign < 0 ? eaveEdgeX - 10 : eaveEdgeX;
      parts.push(`<rect class="cad-gutter" x="${gx}" y="${eaveY - 4}" width="10" height="10" rx="2" />`);

      // Downspout pipe hugging wall corner from grade up with angled swan-neck to eave gutter
      const pipeW = 8;
      const pipeX = sign < 0 ? wallEdgeX - pipeW : wallEdgeX;
      const gutterMidX = sign < 0 ? eaveEdgeX - 5 : eaveEdgeX + 5;
      const pipeTopY = wallPlateY + 8;
      const gradePx = e2svgY(L.gradeY);
      parts.push(`<rect class="cad-downspout" x="${pipeX}" y="${pipeTopY}" width="${pipeW}" height="${gradePx - pipeTopY}" />`);
      parts.push(
        `<polyline fill="none" stroke="#0f172a" stroke-width="4.5" points="${gutterMidX},${eaveY + 6} ${pipeX + pipeW / 2},${pipeTopY}" />`
      );
      parts.push(
        `<polyline fill="none" stroke="#94a3b8" stroke-width="2.5" points="${gutterMidX},${eaveY + 6} ${pipeX + pipeW / 2},${pipeTopY}" />`
      );
    }
  } else {
    // Eave view (East / West): full pitched roof plane + fascia + gutter + vertical downspouts
    const rx = m2svg(view.roofMinU);
    const rw = m2svg(view.roofMaxU - view.roofMinU);
    const yTop = e2svgY(L.ridgeTopY);
    const yEaveTop = e2svgY(L.eaveTopY);
    const yEaveBot = e2svgY(L.eaveBottomY);

    // Main tiled slope
    parts.push(`<rect class="cad-roof-shell" fill="${roofFill}" x="${rx}" y="${yTop}" width="${rw}" height="${yEaveTop - yTop}" />`);
    // Ridge cap strip
    parts.push(`<rect fill="#334155" stroke="#0f172a" stroke-width="1.2" x="${rx}" y="${yTop}" width="${rw}" height="10" />`);
    // Eave fascia
    parts.push(`<rect class="cad-roof-fascia" x="${rx}" y="${yEaveTop}" width="${rw}" height="${yEaveBot - yEaveTop}" />`);
    // Horizontal gutter sitting right at eave bottom edge (never below 5.505 m)
    const gutterH = 8;
    parts.push(`<rect class="cad-gutter" x="${rx - 4}" y="${yEaveBot - gutterH}" width="${rw + 8}" height="${gutterH}" />`);

    // Downspouts near left/right facade corners
    const gradePx = e2svgY(L.gradeY);
    for (const du of view.downspoutsU) {
      const dx = m2svg(du) - 4;
      parts.push(`<rect class="cad-downspout" x="${dx}" y="${yEaveBot}" width="8" height="${gradePx - yEaveBot}" />`);
      // Pipe bracket straps
      for (const frac of [0.22, 0.55, 0.85]) {
        const sy = yEaveBot + (gradePx - yEaveBot) * frac;
        parts.push(`<line x1="${dx - 2}" y1="${sy}" x2="${dx + 10}" y2="${sy}" stroke="#0f172a" stroke-width="1.2" />`);
      }
    }
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderSingleElevationSvg(data, side, originX, originY, options) {
  const view = data.views[side];
  const L = data.levels;
  const R = data.roof;
  const {
    showDimensions = true,
    showInteriorDims = true,
    showOpeningTags = true,
    showHatches = true,
    units = 'mm',
  } = options;

  const headingX = m2svg(view.totalMinU);
  const headingY = e2svgY(L.ridgeTopY) - 66;
  const parts = [];

  parts.push(`<g class="elevation-view" data-side="${side}" transform="translate(${originX}, ${originY})">`);
  parts.push(`<text class="cad-elev-heading" x="${headingX}" y="${headingY}">${esc(view.title)}</text>`);
  parts.push(
    `<text class="cad-elev-sub" x="${headingX}" y="${headingY + 20}">${esc(view.subtitle)}${view.trueDirLabel ? ` · ${esc(view.trueDirLabel)}` : ''}</text>`
  );

  // 1. Interior structural level reference lines (dashed)
  if (showInteriorDims) {
    parts.push('<g class="layer-interior-refs">');
    const refLeft = m2svg(view.wallMinU - 0.15);
    const refRight = m2svg(view.wallMaxU + 0.15);
    for (const yLevel of [L.baseSlabY, L.f1FinishY, L.f2StructY, L.wallTopY]) {
      const yp = e2svgY(yLevel);
      parts.push(`<line class="cad-floor-ref" x1="${refLeft}" y1="${yp}" x2="${refRight}" y2="${yp}" />`);
    }
    parts.push('</g>');
  }

  // 2. Background attachments (before main wall)
  if (view.canopy && !view.canopy.isForeground) {
    parts.push(renderCanopySvg(view.canopy, true, showHatches));
  }
  if ((view.terrace && !view.terrace.isForeground) || (view.pergola && !view.pergola.isForeground)) {
    parts.push(renderPergolaAndTerraceSvg(view, true, showHatches));
  }

  // Chimney behind gable roof
  if (view.chimney && !view.chimney.inFrontOfRoof) {
    parts.push(renderChimneySvg(view.chimney, showHatches));
  }

  // 3. Main Facade Wall & Plinth Silhouette
  parts.push('<g class="layer-facade">');
  const wallX = m2svg(view.wallMinU);
  const wallW = m2svg(view.wallMaxU - view.wallMinU);
  const wallCls = showHatches ? 'cad-wall-facade' : 'cad-wall-facade-bw';
  const plinthCls = showHatches ? 'cad-plinth' : 'cad-plinth-bw';

  if (view.isGable) {
    const pts = [
      [m2svg(view.wallMinU), e2svgY(L.f1FinishY)],
      [m2svg(view.wallMinU), e2svgY(L.wallTopY)],
      [0, e2svgY(L.gablePeakY)],
      [m2svg(view.wallMaxU), e2svgY(L.wallTopY)],
      [m2svg(view.wallMaxU), e2svgY(L.f1FinishY)],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    parts.push(`<polygon class="${wallCls}" points="${pts}" />`);
  } else {
    const wy = e2svgY(L.wallTopY);
    const wh = m2svg(L.wallTopY - L.f1FinishY);
    parts.push(`<rect class="${wallCls}" x="${wallX}" y="${wy}" width="${wallW}" height="${wh}" />`);
  }

  // Plinth / sokl band (-0.150 .. +0.220)
  const py = e2svgY(L.f1FinishY);
  const ph = m2svg(L.f1FinishY - L.gradeY);
  parts.push(`<rect class="${plinthCls}" x="${wallX}" y="${py}" width="${wallW}" height="${ph}" />`);
  parts.push('</g>');

  // 4. Exterior Openings (windows, HS portal, exterior doors)
  parts.push('<g class="layer-openings">');
  for (const op of view.openings) {
    parts.push(renderOpeningSvg(op, showHatches, showOpeningTags));
  }
  parts.push('</g>');

  // 5. Roof Shell + Gutters + Downspouts
  parts.push(renderRoofSvg(data, view, showHatches));

  // Chimney in front of roof slope (West)
  if (view.chimney && view.chimney.inFrontOfRoof) {
    parts.push(renderChimneySvg(view.chimney, showHatches));
  }

  // 6. Foreground attachments (in front of main facade)
  if (view.canopy && view.canopy.isForeground) {
    parts.push(renderCanopySvg(view.canopy, false, showHatches));
  }
  if ((view.terrace && view.terrace.isForeground) || (view.pergola && view.pergola.isForeground)) {
    parts.push(renderPergolaAndTerraceSvg(view, false, showHatches));
  }

  // 7. Terrain / Ground Line (UT -0.150 m)
  parts.push('<g class="layer-terrain">');
  const gLeft = m2svg(view.totalMinU - 0.9);
  const gRight = m2svg(view.totalMaxU + 0.9);
  const gY = e2svgY(L.gradeY);
  if (showHatches) {
    parts.push(`<rect fill="url(#elev-earth-hatch)" x="${gLeft}" y="${gY}" width="${gRight - gLeft}" height="15" />`);
  }
  parts.push(`<line class="cad-ground-line" x1="${gLeft}" y1="${gY}" x2="${gRight}" y2="${gY}" />`);
  parts.push('</g>');

  // 8. Dimensions, Elevation Level Markers & Roof Pitch
  if (showDimensions) {
    parts.push('<g class="layer-ext-dims">');

    // Left ČSN elevation markers
    const markerU = view.totalMinU - 0.55;
    const markerX = m2svg(markerU);
    parts.push(renderElevationMarkerSvg(m2svg(view.totalMinU - 0.85), e2svgY(L.gradeY), L.gradeY, 'left'));
    parts.push(renderElevationMarkerSvg(markerX, e2svgY(L.f1FinishY), L.f1FinishY, 'left'));
    parts.push(renderElevationMarkerSvg(markerX, e2svgY(L.f2StructY), L.f2StructY, 'left'));
    if (view.isGable) {
      parts.push(renderElevationMarkerSvg(markerX, e2svgY(L.wallTopY), L.wallTopY, 'left'));
    } else {
      parts.push(renderElevationMarkerSvg(markerX, e2svgY(L.eaveBottomY), L.eaveBottomY, 'left'));
    }

    // Ridge peak marker at crest
    parts.push(renderElevationMarkerSvg(0, e2svgY(L.ridgeTopY), L.ridgeTopY, 'right'));

    // Chimney top marker
    if (view.chimney) {
      const chimAlign = view.chimney.uCenter > 0 ? 'right' : 'left';
      const chimTipX =
        chimAlign === 'right' ? m2svg(view.chimney.uMax) : m2svg(view.chimney.uMin);
      parts.push(renderElevationMarkerSvg(chimTipX, e2svgY(view.chimney.yTop), view.chimney.yTop, chimAlign));
    }

    // Right-side vertical dimension chains
    const dimBaseU = view.totalMaxU;
    const vNodesInner = [L.gradeY, L.f1FinishY, L.f2StructY, L.wallTopY, L.ridgeTopY];
    parts.push(renderVerticalDimChainSvg(vNodesInner, dimBaseU + 0.55, dimBaseU + 0.05, units, -11));
    parts.push(
      renderVerticalDimChainSvg([L.gradeY, L.ridgeTopY], dimBaseU + 1.08, dimBaseU + 0.05, units, -11)
    );

    // Bottom horizontal dimension chains
    const hNodesParts = sortUnique([
      view.totalMinU,
      view.wallMinU,
      view.wallMaxU,
      view.totalMaxU,
      ...(view.roofMinU < view.wallMinU ? [view.roofMinU] : []),
      ...(view.roofMaxU > view.wallMaxU ? [view.roofMaxU] : []),
    ]);
    parts.push(renderHorizontalDimChainSvg(hNodesParts, L.gradeY - 0.52, L.gradeY, units, 14));
    parts.push(
      renderHorizontalDimChainSvg([view.totalMinU, view.totalMaxU], L.gradeY - 0.96, L.gradeY, units, 14)
    );

    // Roof pitch angle label on gable elevations (placed on the slope clear of chimney)
    if (view.isGable) {
      const pitchStr = `${R.pitchDeg.toFixed(1).replace('.', ',')}°`;
      const onLeftSlope = view.chimney && view.chimney.uCenter >= 0;
      const slopeSign = onLeftSlope ? -1 : 1;
      const midSlopeU = slopeSign * R.halfSpan * 0.52;
      const midSlopeY = L.wallTopY + R.height * 0.48 + 0.62;
      const px = m2svg(midSlopeU);
      const py = e2svgY(midSlopeY);
      if (onLeftSlope) {
        parts.push(`<polyline fill="none" stroke="#334155" stroke-width="1" points="${px + 22},${py + 12} ${px - 12},${py + 12} ${px + 10},${py - 4}" />`);
        parts.push(`<text class="cad-dim-text" x="${px - 14}" y="${py - 4}">${esc(pitchStr)}</text>`);
      } else {
        parts.push(`<polyline fill="none" stroke="#334155" stroke-width="1" points="${px - 22},${py + 12} ${px + 12},${py + 12} ${px - 10},${py - 4}" />`);
        parts.push(`<text class="cad-dim-text" x="${px + 14}" y="${py - 4}">${esc(pitchStr)}</text>`);
      }
    }

    parts.push('</g>');
  }

  // 9. Opening Marks (rendered last with crisp white halo)
  if (showOpeningTags) {
    parts.push('<g class="layer-opening-tags">');
    for (const op of view.openings) {
      if (!op.mark) continue;
      const tx = m2svg(op.uCenter);
      const ty = e2svgY((op.yBottom + op.yTop) / 2) + 3.5;
      parts.push(`<text class="cad-tag-text" x="${tx}" y="${ty}">${esc(op.mark)}</text>`);
    }
    parts.push('</g>');
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderElevCompassAndScale(x, y, width, options = {}) {
  const h = 132;
  const parcelRot = options.siteConfig?.parcelRotationDeg ?? 26.5;
  const houseRot =
    options.housePos?.rotY ?? options.siteConfig?.defaultHousePos?.rotY ?? 0;
  const totalRotDeg = parcelRot + houseRot;
  const rotStr = totalRotDeg.toFixed(1).replace(".", ",");
  const rad = (totalRotDeg * Math.PI) / 180;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`);

  const cx = 60;
  const cy = 66;

  // Compass circle
  parts.push(`<circle cx="${cx}" cy="${cy}" r="32" fill="#ffffff" stroke="#334155" stroke-width="1.2" />`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="27" fill="none" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="2 3" />`);

  // Facade crosshairs (building axes)
  parts.push(`<line x1="${cx}" y1="${cy - 27}" x2="${cx}" y2="${cy + 25}" stroke="#94a3b8" stroke-width="0.9" stroke-dasharray="3 2" />`);
  parts.push(`<line x1="${cx - 25}" y1="${cy}" x2="${cx + 25}" y2="${cy}" stroke="#94a3b8" stroke-width="0.9" stroke-dasharray="3 2" />`);

  // Facade labels
  parts.push(`<text class="cad-micro-text" style="font-size:7px;fill:#64748b;font-weight:600;text-anchor:middle;" x="${cx}" y="21">S (fasáda)</text>`);
  parts.push(`<text class="cad-micro-text" style="font-size:7.5px;fill:#64748b;font-weight:600;text-anchor:middle;" x="${cx}" y="108">J</text>`);
  parts.push(`<text class="cad-micro-text" style="font-size:7.5px;fill:#64748b;font-weight:600;text-anchor:end;" x="${cx - 29}" y="${cy + 3}">Z</text>`);
  parts.push(`<text class="cad-micro-text" style="font-size:7.5px;fill:#64748b;font-weight:600;text-anchor:start;" x="${cx + 29}" y="${cy + 3}">V</text>`);

  // Rotation angle arc
  if (Math.abs(totalRotDeg) >= 1) {
    const arcR = 20;
    const arcX = cx + arcR * Math.sin(rad);
    const arcY = cy - arcR * Math.cos(rad);
    parts.push(
      `<path d="M ${cx} ${cy - arcR} A ${arcR} ${arcR} 0 0 ${totalRotDeg >= 0 ? 1 : 0} ${arcX.toFixed(2)} ${arcY.toFixed(2)}" fill="none" stroke="#2563eb" stroke-width="1.1" stroke-dasharray="2 2" />`,
    );
    const midRad = rad / 2;
    const txtR = arcR + 6;
    const txtX = cx + txtR * Math.sin(midRad);
    const txtY = cy - txtR * Math.cos(midRad);
    parts.push(
      `<text class="cad-micro-text" style="font-size:7.5px;fill:#2563eb;font-weight:700;text-anchor:middle;" x="${txtX.toFixed(1)}" y="${txtY.toFixed(1)}">+${rotStr}°</text>`,
    );
  }

  // True North Needle (rotated by totalRotDeg around cx, cy)
  parts.push(`<g transform="rotate(${totalRotDeg.toFixed(2)}, ${cx}, ${cy})">`);
  // Left half (dark filled)
  parts.push(`<polygon points="${cx},${cy - 29} ${cx - 7},${cy + 4} ${cx},${cy} ${cx},${cy - 29}" fill="#0f172a" />`);
  // Right half (white filled with stroke)
  parts.push(`<polygon points="${cx},${cy - 29} ${cx + 7},${cy + 4} ${cx},${cy} ${cx},${cy - 29}" fill="#ffffff" stroke="#0f172a" stroke-width="1" />`);
  // South needle tail
  parts.push(`<polygon points="${cx},${cy + 16} ${cx - 4},${cy + 4} ${cx},${cy}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8" />`);
  parts.push(`<polygon points="${cx},${cy + 16} ${cx + 4},${cy + 4} ${cx},${cy}" fill="#94a3b8" stroke="#94a3b8" stroke-width="0.8" />`);
  parts.push(`</g>`);

  // Center pivot pin
  parts.push(`<circle cx="${cx}" cy="${cy}" r="2.5" fill="#0f172a" stroke="#ffffff" stroke-width="1" />`);

  // Bold letter 'S' for True North placed outside needle tip
  const labelR = 41;
  const labelX = cx + labelR * Math.sin(rad);
  const labelY = cy - labelR * Math.cos(rad) + 4;
  parts.push(`<text class="cad-room-name" style="font-size:12px;font-weight:800;fill:#0f172a;text-anchor:middle;" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}">S</text>`);

  const sx = 128;
  const sy = 56;
  const seg = 66;
  parts.push(`<text class="cad-title-label" x="${sx}" y="24">GRAFICKÉ MĚŘÍTKO (1:50)</text>`);
  for (let i = 0; i < 5; i++) {
    const fill = i % 2 === 0 ? '#0f172a' : '#ffffff';
    parts.push(`<rect x="${sx + i * seg}" y="${sy}" width="${seg}" height="9" fill="${fill}" stroke="#0f172a" stroke-width="1" />`);
    parts.push(`<text class="cad-micro-text" x="${sx + i * seg}" y="${sy + 22}">${i}</text>`);
  }
  parts.push(`<text class="cad-micro-text" x="${sx + 5 * seg}" y="${sy + 22}">5 m</text>`);
  parts.push(`<text class="cad-micro-text" style="text-anchor:start;font-weight:600;" x="${sx}" y="100">Skutečný sever (S): +${rotStr}° od osy domu</text>`);
  parts.push(`<text class="cad-micro-text" style="text-anchor:start;" x="${sx}" y="116">Výškový systém: ±0,000 = základová deska 1.NP</text>`);

  parts.push('</g>');
  return { svg: parts.join('\n'), height: h };
}

function renderKeyValuePanel(x, y, width, title, rows) {
  const headerH = 28;
  const rowH = 24;
  const totalH = headerH + rows.length * rowH + 10;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="18">${esc(title)}</text>`);

  let curY = headerH + 17;
  rows.forEach((row, idx) => {
    const weight = row.bold ? 'font-weight:700;' : '';
    const numColor = row.accent ? 'fill:#1d4ed8;' : '';
    parts.push(`<text class="cad-table-txt" style="${weight}" x="12" y="${curY}">${esc(row.label)}</text>`);
    parts.push(`<text class="cad-table-num" style="${weight}${numColor}" x="${width - 12}" y="${curY}">${esc(row.value)}</text>`);
    if (idx < rows.length - 1) {
      parts.push(`<line class="cad-table-row-line" x1="10" y1="${curY + 6}" x2="${width - 10}" y2="${curY + 6}" />`);
    }
    curY += rowH;
  });

  parts.push('</g>');
  return { svg: parts.join('\n'), height: totalH };
}

function renderMaterialsPanel(x, y, width) {
  const items = [
    ['Fasáda', 'Tenkovrstvá silikonová omítka bílá / světle šedá'],
    ['Sokl (do +0,220 m)', 'Mozaiková omítka / XPS zateplení tl. 140 mm, šedá'],
    ['Střešní krytina', 'Skládaná betonová / keramická taška, antracit'],
    ['Klempířské prvky', 'Lakovaný pozink / hliník antracit (žlaby, svody, oplech.)'],
    ['Okna a HS portál', 'Dřevohliník / plast antracit, izolační trojsklo Uw ≤ 0,8'],
    ['Pergola & krytý chodník', 'KVH smrkové dřevo ošetřené lazurou / sklo VSG + ocel'],
  ];
  const headerH = 28;
  const rowH = 34;
  const totalH = headerH + items.length * rowH + 8;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="18">MATERIÁLOVÝ STANDARD FASÁD A STŘECHY</text>`);

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

function renderExteriorOpeningsPanel(x, y, width, sched, units) {
  const extCategories = new Set(['window', 'hs', 'extDoor']);
  const groups = (sched?.groupedTypes || []).filter((g) => extCategories.has(g.category));
  if (groups.length === 0) return { svg: '', height: 0 };

  const headerH = 28;
  const rowH = 23;
  const totalH = headerH + groups.length * rowH + 10;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="18">PŘEHLED VNĚJŠÍCH VÝPLNÍ OTVORŮ</text>`);

  let curY = headerH + 16;
  groups.forEach((g, idx) => {
    const dimW = units === 'm' ? (g.widthMm / 1000).toFixed(2).replace('.', ',') : String(g.widthMm);
    const dimH = units === 'm' ? (g.heightMm / 1000).toFixed(2).replace('.', ',') : String(g.heightMm);
    const sillStr =
      g.category === 'window' && g.sillMm > 0
        ? ` (par. ${units === 'm' ? (g.sillMm / 1000).toFixed(2).replace('.', ',') : g.sillMm})`
        : g.category === 'hs'
          ? ' (HS portál)'
          : ' (vchodové)';
    const leftText = `${g.mark}  ${dimW}×${dimH}${sillStr}`;
    const rightText = `${g.count} ks · ${g.floorsText}`;
    parts.push(`<text class="cad-table-txt" style="font-size:10.5px;" x="12" y="${curY}">${esc(leftText)}</text>`);
    parts.push(`<text class="cad-table-num" style="font-size:10.5px;" x="${width - 12}" y="${curY}">${esc(rightText)}</text>`);
    if (idx < groups.length - 1) {
      parts.push(`<line class="cad-table-row-line" x1="10" y1="${curY + 6}" x2="${width - 10}" y2="${curY + 6}" />`);
    }
    curY += rowH;
  });

  parts.push('</g>');
  return { svg: parts.join('\n'), height: totalH };
}

function renderElevLegend(x, y, width, units) {
  const h = 152;
  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="24" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="16">LEGENDA ZNAČEK POHLEDŮ</text>`);

  // Elevation marker swatch
  parts.push(`<line x1="14" y1="48" x2="48" y2="48" stroke="#0f172a" stroke-width="1.1" />`);
  parts.push(`<polygon class="cad-elev-tri-fill" points="28,48 21,38 28,38" />`);
  parts.push(`<polygon class="cad-elev-tri-empty" points="28,48 35,38 28,38" />`);
  parts.push(`<text class="cad-table-txt" x="56" y="49">Výšková kóta (v metrech od ±0,000)</text>`);

  // Window swatch
  parts.push(`<rect class="cad-win-frame" x="16" y="62" width="28" height="16" />`);
  parts.push(`<rect fill="#e0f2fe" x="19" y="65" width="22" height="10" />`);
  parts.push(`<text class="cad-table-txt" x="56" y="74">Výplň otvoru · značka O1 / HS / DV dle výpisu</text>`);

  // Floor reference swatch
  parts.push(`<line x1="16" y1="96" x2="44" y2="96" class="cad-floor-ref" />`);
  parts.push(`<text class="cad-table-txt" x="56" y="100">Vnitřní úroveň podlaží / nosné desky</text>`);

  // Terrain swatch
  parts.push(`<line x1="16" y1="120" x2="44" y2="120" stroke="#0f172a" stroke-width="3" />`);
  parts.push(`<text class="cad-table-txt" x="56" y="124">Upravený terén (UT ${formatElevation(-0.15)} m) · Kóty v ${esc(units)}</text>`);

  parts.push('</g>');
  return { svg: parts.join('\n'), height: h };
}

function renderElevTitleBlock(x, y, width, designConfig, units) {
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
  parts.push(`<text class="cad-title-main" x="14" y="40">RODINNÝ DŮM 6+KK · VOJÁČKOVI TROUBELICE</text>`);

  parts.push(`<text class="cad-title-label" x="14" y="71">OBSAH VÝKRESU</text>`);
  parts.push(`<text class="cad-title-sub" x="14" y="92">POHLEDY — VÝCHODNÍ, JIŽNÍ, ZÁPADNÍ, SEVERNÍ (${wM} × ${lM} m)</text>`);

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
 * Generates a self-contained 2×2 architectural CAD SVG sheet containing all 4 exterior
 * elevations (East, South, West, North) driven parametrically from `designConfig`.
 *
 * @param {Object} designConfig
 * @param {Object} [options]
 * @returns {string}
 */
export function generateElevationsSvg(designConfig, options = {}) {
  const {
    showDimensions = true,
    showInteriorDims = true,
    showOpeningTags = true,
    showHatches = true,
    units = 'mm',
  } = options;

  const data = extractElevationData(designConfig, options);
  const L = data.levels;
  const R = data.roof;

  const sheetW = 4200;
  const sheetH = 2480;
  const sidebarX = 3620;
  const sidebarW = sheetW - sidebarX - 36;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="100%" height="100%" role="img" aria-label="Technické výkresy pohledů rodinného domu">`
  );
  parts.push(buildElevDefsAndStyles());

  // Paper sheet & border frame
  parts.push(`<rect class="cad-sheet-bg" x="0" y="0" width="${sheetW}" height="${sheetH}" />`);
  parts.push(`<rect class="cad-border-outer" x="20" y="20" width="${sheetW - 40}" height="${sheetH - 40}" />`);
  parts.push(`<rect class="cad-border-inner" x="26" y="26" width="${sheetW - 52}" height="${sheetH - 52}" />`);

  // Quadrant dividers
  parts.push(`<line class="cad-divider" x1="1815" y1="42" x2="1815" y2="${sheetH - 42}" />`);
  parts.push(`<line class="cad-divider" x1="42" y1="1240" x2="${sidebarX - 24}" y2="1240" />`);

  // 4 Elevations in 2×2 grid
  const renderOpts = {
    showDimensions,
    showInteriorDims,
    showOpeningTags,
    showHatches,
    units,
  };
  parts.push(renderSingleElevationSvg(data, 'east', 915, 1070, renderOpts));
  parts.push(renderSingleElevationSvg(data, 'south', 2855, 1070, renderOpts));
  parts.push(renderSingleElevationSvg(data, 'west', 915, 2285, renderOpts));
  parts.push(renderSingleElevationSvg(data, 'north', 2565, 2285, renderOpts));

  // Right Info Column
  let curY = 42;
  const compass = renderElevCompassAndScale(sidebarX, curY, sidebarW, options);
  parts.push(compass.svg);
  curY += compass.height + 14;

  const elevRows = [
    { label: 'Hřeben střechy (vrchol krytiny)', value: `${formatElevation(L.ridgeTopY)} m`, bold: true, accent: true },
    { label: 'Vrchol štítového zdiva', value: `${formatElevation(L.gablePeakY)} m` },
    { label: 'Hlava komína (nad střechou)', value: `${formatElevation(data.chimney?.yTop ?? 8.0)} m` },
    { label: 'Pozednice / strop nad 2.NP', value: `${formatElevation(L.wallTopY)} m` },
    { label: 'Okapová hrana střechy', value: `${formatElevation(L.eaveBottomY)} m` },
    { label: 'Nosná konstrukce stropu 2.NP', value: `${formatElevation(L.f2StructY)} m` },
    { label: 'Čistá podlaha 1.NP (horní sokl)', value: `${formatElevation(L.f1FinishY)} m` },
    { label: 'Základová deska 1.NP (srovnávací)', value: `${formatElevation(L.baseSlabY)} m` },
    { label: 'Upravený terén (UT)', value: `${formatElevation(L.gradeY)} m` },
    {
      label: `Celková výška nad UT · sklon ${R.pitchDeg.toFixed(1).replace('.', ',')}°`,
      value: `${(L.ridgeTopY - L.gradeY).toFixed(2).replace('.', ',')} m`,
      bold: true,
      accent: true,
    },
  ];
  const pElev = renderKeyValuePanel(sidebarX, curY, sidebarW, 'VÝŠKOVÉ KÓTY A STŘECHA', elevRows);
  parts.push(pElev.svg);
  curY += pElev.height + 14;

  const sched = data.openingSchedule;
  const sideNameMap = {
    V: 'Východní (vstupní)',
    J: 'Jižní (uliční štít)',
    Z: 'Západní (zahradní)',
    S: 'Severní (k dílně)',
  };
  const facadeRows = (sched.glazingByOrientation || []).map((o) => ({
    label: `${sideNameMap[o.side] || o.sideLabel} · ${o.trueDir} (${o.count} oken)`,
    value: formatArea(o.areaSqm),
  }));
  facadeRows.push({
    label: `Prosklení celkem (${sched.summary.totalGlazingCount} ks oken/HS + ${sched.summary.extDoorCount} dv.)`,
    value: formatArea(sched.summary.windowAreaSqm),
    bold: true,
    accent: true,
  });
  const pFacade = renderKeyValuePanel(sidebarX, curY, sidebarW, 'PŘEHLED FASÁD A PROSKLENÍ', facadeRows);
  parts.push(pFacade.svg);
  curY += pFacade.height + 14;

  const pMat = renderMaterialsPanel(sidebarX, curY, sidebarW);
  parts.push(pMat.svg);
  curY += pMat.height + 14;

  const pOpenings = renderExteriorOpeningsPanel(sidebarX, curY, sidebarW, sched, units);
  if (pOpenings.height > 0 && curY + pOpenings.height + 14 + 152 <= sheetH - 42 - 152) {
    parts.push(pOpenings.svg);
    curY += pOpenings.height + 14;
  }

  const pLegend = renderElevLegend(sidebarX, curY, sidebarW, units);
  parts.push(pLegend.svg);

  const titleBlockY = sheetH - 42 - 152;
  parts.push(renderElevTitleBlock(sidebarX, titleBlockY, sidebarW, designConfig, units));

  parts.push('</svg>');
  return parts.join('\n');
}

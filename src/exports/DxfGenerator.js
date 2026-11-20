import {
  computeFloorBounds,
  computeRoomSchedule,
  getWallBox,
} from "../builders/RoomBuilder.js";
import { computeWallSliceNodes } from "../builders/FloorPlanSvgGenerator.js";
import { extractElevationData } from "../builders/ElevationSvgGenerator.js";
import {
  computeSectionPlanes,
  extractSectionData,
} from "../builders/SectionSvgGenerator.js";
import {
  computeBuiltUpArea,
  computeSiteSetbacks,
} from "../builders/SiteBuilder.js";
import { DxfWriter } from "./dxfWriter.js";
import { buildOpeningSchedule } from "./ProjectSchedules.js";

const DIR_VECTORS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

function resolveOpeningCenter(op) {
  if (typeof op.at === "number") return op.at;
  if (typeof op.offset === "number") return op.offset;
  return 0;
}

function normalizeVec(x, z) {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function formatLength(meters, units = "mm") {
  if (units === "m") {
    return meters.toFixed(2).replace(".", ",");
  }
  const mm = Math.round(meters * 1000);
  return mm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatTagDim(meters, units = "mm") {
  if (units === "m") {
    return meters.toFixed(2).replace(".", ",");
  }
  return String(Math.round(meters * 1000));
}

function formatArea(sqm) {
  return `${Number(sqm).toFixed(1).replace(".", ",")} m²`;
}

function formatElevation(meters) {
  if (Math.abs(meters) < 0.0005) return "±0,000";
  const sign = meters >= 0 ? "+" : "-";
  return `${sign}${Math.abs(meters).toFixed(3).replace(".", ",")}`;
}

function sortUniqueCoords(coords) {
  const sorted = [...coords].sort((a, b) => a - b);
  const out = [];
  for (const val of sorted) {
    if (out.length === 0 || val - out[out.length - 1] > 0.005) {
      out.push(Number(val.toFixed(4)));
    }
  }
  return out;
}

function makeTransform(oxMm = 0, oyMm = 0) {
  const toDxf = (xM, zM) => [oxMm + xM * 1000, oyMm - zM * 1000];
  const rectToDxf = (xM, zM, wM, dM) => [
    oxMm + xM * 1000,
    oyMm - (zM + dM) * 1000,
    wM * 1000,
    dM * 1000,
  ];
  return { oxMm, oyMm, toDxf, rectToDxf };
}

function splitWallSegments(wallDef) {
  const [x1, z1] = wallDef.from;
  const [x2, z2] = wallDef.to;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return null;

  const ux = dx / length;
  const uz = dz / length;
  const nx = -uz;
  const nz = ux;
  const halfT = (wallDef.thickness ?? 0.16) / 2;

  const openings = (wallDef.openings || [])
    .map((op, origIndex) => {
      const center = resolveOpeningCenter(op);
      const start = Math.max(0, center - op.width / 2);
      const end = Math.min(length, center + op.width / 2);
      return { ...op, origIndex, center, start, end };
    })
    .sort((a, b) => a.start - b.start);

  const solidSegments = [];
  let cursor = 0;
  for (const op of openings) {
    if (op.start > cursor + 0.005) {
      solidSegments.push([cursor, op.start]);
    }
    cursor = Math.max(cursor, op.end);
  }
  if (cursor < length - 0.005) {
    solidSegments.push([cursor, length]);
  }

  const ptAt = (u, nOffset = 0) => [
    x1 + ux * u + nx * nOffset,
    z1 + uz * u + nz * nOffset,
  ];

  const solidPolys = solidSegments.map(([uStart, uEnd]) => [
    ptAt(uStart, -halfT),
    ptAt(uEnd, -halfT),
    ptAt(uEnd, halfT),
    ptAt(uStart, halfT),
  ]);

  return {
    wallDef,
    length,
    ux,
    uz,
    nx,
    nz,
    halfT,
    openings,
    solidSegments,
    solidPolys,
    ptAt,
  };
}

/**
 * Emits clipped 45° or -45° diagonal hatch lines inside a convex DXF polygon.
 */
function addPolygonHatch(dxf, layer, dxfPts, slope = 1, spacing = 140) {
  // Parameterize line: y = slope * x + c  =>  c = y - slope * x
  let cMin = Infinity;
  let cMax = -Infinity;
  for (const [x, y] of dxfPts) {
    const c = y - slope * x;
    if (c < cMin) cMin = c;
    if (c > cMax) cMax = c;
  }

  const n = dxfPts.length;
  const startC = Math.ceil((cMin + 5) / spacing) * spacing;
  for (let c = startC; c <= cMax - 5; c += spacing) {
    // Line equation: -slope * x + y - c = 0
    const hits = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = dxfPts[i];
      const [x2, y2] = dxfPts[(i + 1) % n];
      const f1 = y1 - slope * x1 - c;
      const f2 = y2 - slope * x2 - c;
      if ((f1 <= 0 && f2 >= 0) || (f1 >= 0 && f2 <= 0)) {
        const denom = f1 - f2;
        if (Math.abs(denom) > 1e-9) {
          const t = f1 / denom;
          if (t >= -1e-6 && t <= 1 + 1e-6) {
            hits.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
          }
        }
      }
    }
    if (hits.length >= 2) {
      hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const pA = hits[0];
      const pB = hits[hits.length - 1];
      if (Math.hypot(pB[0] - pA[0], pB[1] - pA[1]) > 5) {
        dxf.addLine(layer, pA[0], pA[1], pB[0], pB[1]);
      }
    }
  }
}

function renderDoorOpeningToDxf(dxf, wallGeom, op, tf) {
  const { ptAt, ux, uz, halfT, length } = wallGeom;
  const thickness = wallGeom.wallDef.thickness ?? 0.16;

  if (op.sliding && !op.swing) {
    const slideDir = typeof op.sliding === "object" ? op.sliding?.dir : null;
    const dirVec = DIR_VECTORS[slideDir] || [-ux, -uz];
    const slideSign = dirVec[0] * ux + dirVec[1] * uz >= 0 ? 1 : -1;

    const p1A = tf.toDxf(...ptAt(op.start, -halfT));
    const p1B = tf.toDxf(...ptAt(op.start, halfT));
    const p2A = tf.toDxf(...ptAt(op.end, -halfT));
    const p2B = tf.toDxf(...ptAt(op.end, halfT));
    dxf.addLine("A-DOOR", p1A[0], p1A[1], p1B[0], p1B[1]);
    dxf.addLine("A-DOOR", p2A[0], p2A[1], p2B[0], p2B[1]);

    const actualW = Math.max(0.1, op.end - op.start);
    const pocketStart =
      slideSign < 0 ? Math.max(0.04, op.start - actualW) : op.end;
    const pocketEnd =
      slideSign < 0 ? op.start : Math.min(length - 0.04, op.end + actualW);
    if (pocketEnd - pocketStart > 0.05) {
      const pocketPts = [
        ptAt(pocketStart, -0.04),
        ptAt(pocketEnd, -0.04),
        ptAt(pocketEnd, 0.04),
        ptAt(pocketStart, 0.04),
      ].map(([x, z]) => tf.toDxf(x, z));
      dxf.addPolyline("A-DOOR-SWING", pocketPts, { closed: true });
    }

    const shift = slideSign * actualW * 0.15;
    const leafPts = [
      ptAt(op.start + shift, -0.0225),
      ptAt(op.end + shift, -0.0225),
      ptAt(op.end + shift, 0.0225),
      ptAt(op.start + shift, 0.0225),
    ].map(([x, z]) => tf.toDxf(x, z));
    dxf.addPolyline("A-DOOR", leafPts, { closed: true });

    const aBase = op.center - slideSign * 0.22;
    const aTip = op.center + slideSign * 0.22;
    const nArrow = 0.075;
    const pBase = tf.toDxf(...ptAt(aBase, nArrow));
    const pTip = tf.toDxf(...ptAt(aTip, nArrow));
    const pWing1 = tf.toDxf(...ptAt(aTip - slideSign * 0.09, nArrow - 0.045));
    const pWing2 = tf.toDxf(...ptAt(aTip - slideSign * 0.09, nArrow + 0.045));
    dxf.addLine("A-DOOR-SWING", pBase[0], pBase[1], pTip[0], pTip[1]);
    dxf.addLine("A-DOOR-SWING", pWing1[0], pWing1[1], pTip[0], pTip[1]);
    dxf.addLine("A-DOOR-SWING", pWing2[0], pWing2[1], pTip[0], pTip[1]);
    return;
  }

  const { hinge = "start", dir = "south" } = op.swing || {};
  const dirVec = DIR_VECTORS[dir] || [0, 1];

  const hingeU = hinge === "start" ? op.start : op.end;
  const latchU = hinge === "start" ? op.end : op.start;

  const [hcX, hcZ] = ptAt(hingeU, 0);
  const [lcX, lcZ] = ptAt(latchU, 0);

  const hx = hcX + dirVec[0] * halfT;
  const hz = hcZ + dirVec[1] * halfT;
  const cx = lcX + dirVec[0] * halfT;
  const cz = lcZ + dirVec[1] * halfT;

  // Threshold ticks
  const p1A = tf.toDxf(...ptAt(op.start, -halfT));
  const p1B = tf.toDxf(...ptAt(op.start, halfT));
  const p2A = tf.toDxf(...ptAt(op.end, -halfT));
  const p2B = tf.toDxf(...ptAt(op.end, halfT));
  dxf.addLine("A-DOOR", p1A[0], p1A[1], p1B[0], p1B[1]);
  dxf.addLine("A-DOOR", p2A[0], p2A[1], p2B[0], p2B[1]);

  // Open door tip
  const actualW = Math.hypot(cx - hx, cz - hz);
  const ox = hx + dirVec[0] * actualW;
  const oz = hz + dirVec[1] * actualW;

  // Door leaf rectangle (45 mm thick)
  const leafT = 0.045;
  const [uOx, uOz] = normalizeVec(ox - hx, oz - hz);
  const [uPx, uPz] = normalizeVec(cx - hx, cz - hz);
  const leafPts = [
    tf.toDxf(hx, hz),
    tf.toDxf(hx + uOx * actualW, hz + uOz * actualW),
    tf.toDxf(
      hx + uOx * actualW + uPx * leafT,
      hz + uOz * actualW + uPz * leafT,
    ),
    tf.toDxf(hx + uPx * leafT, hz + uPz * leafT),
  ];
  dxf.addPolyline("A-DOOR", leafPts, { closed: true });

  // 90-degree CCW swing arc in DXF XY plane
  const [hxD, hyD] = tf.toDxf(hx, hz);
  const [cxD, cyD] = tf.toDxf(cx, cz);
  const [oxD, oyD] = tf.toDxf(ox, oz);
  const rMm = actualW * 1000;
  const aClosed =
    ((Math.atan2(cyD - hyD, cxD - hxD) * 180) / Math.PI + 360) % 360;
  const aOpen =
    ((Math.atan2(oyD - hyD, oxD - hxD) * 180) / Math.PI + 360) % 360;
  const diff = (((aOpen - aClosed) % 360) + 360) % 360;
  const [startDeg, endDeg] =
    diff > 0 && diff <= 180 ? [aClosed, aOpen] : [aOpen, aClosed];
  dxf.addArc("A-DOOR-SWING", hxD, hyD, rMm, startDeg, endDeg);

  if (thickness > 0.25) {
    const oppA = tf.toDxf(hcX - dirVec[0] * halfT, hcZ - dirVec[1] * halfT);
    const oppB = tf.toDxf(lcX - dirVec[0] * halfT, lcZ - dirVec[1] * halfT);
    dxf.addLine("A-DOOR-SWING", oppA[0], oppA[1], oppB[0], oppB[1]);
  }
}

function renderWindowOpeningToDxf(dxf, wallGeom, op, tf) {
  const { ptAt, halfT } = wallGeom;

  const f1A = tf.toDxf(...ptAt(op.start, -halfT));
  const f1B = tf.toDxf(...ptAt(op.end, -halfT));
  const f2A = tf.toDxf(...ptAt(op.start, halfT));
  const f2B = tf.toDxf(...ptAt(op.end, halfT));
  dxf.addLine("A-WIND", f1A[0], f1A[1], f1B[0], f1B[1]);
  dxf.addLine("A-WIND", f2A[0], f2A[1], f2B[0], f2B[1]);

  if (op.sliding) {
    const mid = (op.start + op.end) / 2;
    const track1 = [
      ptAt(op.start, -0.055),
      ptAt(mid + 0.04, -0.055),
      ptAt(mid + 0.04, -0.005),
      ptAt(op.start, -0.005),
    ].map(([x, z]) => tf.toDxf(x, z));
    const track2 = [
      ptAt(mid - 0.04, 0.005),
      ptAt(op.end, 0.005),
      ptAt(op.end, 0.055),
      ptAt(mid - 0.04, 0.055),
    ].map(([x, z]) => tf.toDxf(x, z));
    dxf.addPolyline("A-WIND", track1, { closed: true });
    dxf.addPolyline("A-WIND", track2, { closed: true });

    const g1A = tf.toDxf(...ptAt(op.start + 0.05, -0.03));
    const g1B = tf.toDxf(...ptAt(mid, -0.03));
    const g2A = tf.toDxf(...ptAt(mid, 0.03));
    const g2B = tf.toDxf(...ptAt(op.end - 0.05, 0.03));
    dxf.addLine("A-WIND", g1A[0], g1A[1], g1B[0], g1B[1]);
    dxf.addLine("A-WIND", g2A[0], g2A[1], g2B[0], g2B[1]);
  } else {
    const framePts = [
      ptAt(op.start, -0.05),
      ptAt(op.end, -0.05),
      ptAt(op.end, 0.05),
      ptAt(op.start, 0.05),
    ].map(([x, z]) => tf.toDxf(x, z));
    dxf.addPolyline("A-WIND", framePts, { closed: true });

    const g1A = tf.toDxf(...ptAt(op.start + 0.04, -0.015));
    const g1B = tf.toDxf(...ptAt(op.end - 0.04, -0.015));
    const g2A = tf.toDxf(...ptAt(op.start + 0.04, 0.015));
    const g2B = tf.toDxf(...ptAt(op.end - 0.04, 0.015));
    dxf.addLine("A-WIND", g1A[0], g1A[1], g1B[0], g1B[1]);
    dxf.addLine("A-WIND", g2A[0], g2A[1], g2B[0], g2B[1]);
  }
}

function renderOpeningTagToDxf(dxf, wallGeom, op, mark, units, bounds, tf) {
  const { ptAt, ux, uz, halfT } = wallGeom;
  const isDoor = Boolean(op.swing || op.type === "door");
  const wStr = formatTagDim(op.width, units);
  const hStr = formatTagDim(op.height, units);
  const sillStr = op.sill > 0.2 ? ` (${formatTagDim(op.sill, units)})` : "";
  const dimText = isDoor ? `${wStr}×${hStr}` : `${wStr}×${hStr}${sillStr}`;
  const text = mark ? `${mark} ${dimText}` : dimText;

  const [cx, cz] = ptAt(op.center, 0);
  const isHorizontal = Math.abs(ux) >= Math.abs(uz);

  let tx = cx;
  let tz = cz;
  let rotation = 0;

  if (isHorizontal) {
    if (cz <= bounds.innerMinZ) {
      tz = cz - halfT - 0.16;
    } else if (cz >= bounds.innerMaxZ) {
      tz = cz + halfT + 0.24;
    } else {
      const dirY = op.swing?.dir === "north" ? 1 : -1;
      tz = cz + dirY * (halfT + 0.18);
    }
  } else {
    rotation = 90;
    if (cx <= bounds.innerMinX) {
      tx = cx - halfT - 0.18;
    } else if (cx >= bounds.innerMaxX) {
      tx = cx + halfT + 0.22;
    } else {
      const dirX = op.swing?.dir === "west" ? 1 : -1;
      tx = cx + dirX * (halfT + 0.18);
    }
  }

  const [dx, dy] = tf.toDxf(tx, tz);
  dxf.addText("A-ANNO-OPEN", dx, dy, text, {
    height: 90,
    rotation,
    hAlign: 1,
    vAlign: 2,
  });
}

function drawDxfDimensionChain(dxf, nodes, axis, linePos, tf, options = {}) {
  const {
    extStart = null,
    units = "mm",
    textSide = -1,
    layer = "A-DIM",
  } = options;
  if (!Array.isArray(nodes) || nodes.length < 2) return;

  const tickLen = 0.08;
  const extOvershoot =
    0.14 * (extStart !== null ? Math.sign(linePos - extStart) || 1 : 1);

  if (axis === "x") {
    const zLine = linePos;
    const pStart = tf.toDxf(nodes[0], zLine);
    const pEnd = tf.toDxf(nodes[nodes.length - 1], zLine);
    dxf.addLine(layer, pStart[0], pStart[1], pEnd[0], pEnd[1]);

    for (const xVal of nodes) {
      if (extStart !== null) {
        const e1 = tf.toDxf(xVal, extStart);
        const e2 = tf.toDxf(xVal, zLine + extOvershoot);
        dxf.addLine(layer, e1[0], e1[1], e2[0], e2[1]);
      }
      const t1 = tf.toDxf(xVal - tickLen, zLine + tickLen);
      const t2 = tf.toDxf(xVal + tickLen, zLine - tickLen);
      dxf.addLine(layer, t1[0], t1[1], t2[0], t2[1]);
    }

    for (let i = 0; i < nodes.length - 1; i++) {
      const span = nodes[i + 1] - nodes[i];
      if (span <= 0.01) continue;
      const midX = (nodes[i] + nodes[i + 1]) / 2;
      const label = formatLength(span, units);
      const [sx, sy] = tf.toDxf(midX, zLine);
      const yOffset = textSide < 0 ? 110 : -130;
      dxf.addText(layer, sx, sy + yOffset, label, {
        height: span < 0.35 ? 85 : 110,
        rotation: 0,
        hAlign: 1,
        vAlign: 2,
      });
    }
  } else {
    const xLine = linePos;
    const pStart = tf.toDxf(xLine, nodes[0]);
    const pEnd = tf.toDxf(xLine, nodes[nodes.length - 1]);
    dxf.addLine(layer, pStart[0], pStart[1], pEnd[0], pEnd[1]);

    for (const zVal of nodes) {
      if (extStart !== null) {
        const e1 = tf.toDxf(extStart, zVal);
        const e2 = tf.toDxf(xLine + extOvershoot, zVal);
        dxf.addLine(layer, e1[0], e1[1], e2[0], e2[1]);
      }
      const t1 = tf.toDxf(xLine - tickLen, zVal + tickLen);
      const t2 = tf.toDxf(xLine + tickLen, zVal - tickLen);
      dxf.addLine(layer, t1[0], t1[1], t2[0], t2[1]);
    }

    for (let i = 0; i < nodes.length - 1; i++) {
      const span = nodes[i + 1] - nodes[i];
      if (span <= 0.01) continue;
      const midZ = (nodes[i] + nodes[i + 1]) / 2;
      const label = formatLength(span, units);
      const [sx, sy] = tf.toDxf(xLine, midZ);
      const xOffset = textSide < 0 ? -110 : 120;
      dxf.addText(layer, sx + xOffset, sy, label, {
        height: span < 0.35 ? 85 : 110,
        rotation: 90,
        hAlign: 1,
        vAlign: 2,
      });
    }
  }
}

function collectWallOpeningNodes(wallDef, axis) {
  if (!wallDef) return [];
  const [x1, z1] = wallDef.from;
  const [x2, z2] = wallDef.to;
  const len = Math.hypot(x2 - x1, z2 - z1) || 1;
  const ux = (x2 - x1) / len;
  const uz = (z2 - z1) / len;
  const nodes = [];

  for (const op of wallDef.openings || []) {
    if (op.type === "opening" && !op.swing) continue;
    const center = resolveOpeningCenter(op);
    const start = Math.max(0, center - op.width / 2);
    const end = Math.min(len, center + op.width / 2);
    if (axis === "x") {
      nodes.push(x1 + ux * start, x1 + ux * end);
    } else {
      nodes.push(z1 + uz * start, z1 + uz * end);
    }
  }
  return nodes;
}

function pickClearSliceCoord(bandMin, bandMax, axis, floorConfig) {
  const span = bandMax - bandMin;
  if (span < 0.9) return Number(((bandMin + bandMax) / 2).toFixed(2));

  const fractions = [0.22, 0.35, 0.65, 0.78];
  const rooms = (floorConfig.rooms || []).filter(
    (r) => r.interior !== false && Array.isArray(r.pos),
  );
  let bestCoord = bandMin + span * 0.25;
  let bestScore = -Infinity;

  for (const frac of fractions) {
    const cand = bandMin + span * frac;
    let minDist = Infinity;
    for (const r of rooms) {
      const rCoord = axis === "x" ? r.pos[2] : r.pos[0];
      minDist = Math.min(minDist, Math.abs(cand - rCoord));
    }
    if (minDist > bestScore) {
      bestScore = minDist;
      bestCoord = cand;
    }
  }
  return Number(bestCoord.toFixed(2));
}

function discoverDistinctSlices(floorConfig, bounds, axis) {
  const walls = floorConfig.walls || [];
  const boxes = walls.map(getWallBox);
  const { innerMinX, innerMaxX, innerMinZ, innerMaxZ } = bounds;

  const stops =
    axis === "x"
      ? sortUniqueCoords([
          innerMinZ,
          innerMaxZ,
          ...boxes
            .filter((b) => b.isHorizontal)
            .flatMap((b) => [b.minZ, b.maxZ])
            .filter((z) => z > innerMinZ + 0.05 && z < innerMaxZ - 0.05),
        ])
      : sortUniqueCoords([
          innerMinX,
          innerMaxX,
          ...boxes
            .filter((b) => !b.isHorizontal)
            .flatMap((b) => [b.minX, b.maxX])
            .filter((x) => x > innerMinX + 0.05 && x < innerMaxX - 0.05),
        ]);

  const seenSignatures = new Set();
  const slices = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (b - a < 0.45) continue;

    const sliceCoord = pickClearSliceCoord(a, b, axis, floorConfig);
    const nodes = computeWallSliceNodes(walls, axis, sliceCoord);
    if (nodes.length < 4) continue;

    const sig = nodes.map((n) => n.toFixed(2)).join("|");
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);
    slices.push({ sliceCoord, nodes });
  }

  return slices;
}

function renderStairsAndChimneyToDxf(dxf, designConfig, floorKey, tf) {
  const stairs = (designConfig.floor1?.furniture || []).find(
    (f) => f.type === "stairs",
  );
  if (stairs && stairs.layout === "u-turn") {
    const xStart = stairs.xStart ?? -0.5;
    const xLanding = stairs.xLanding ?? -2.58;
    const xEnd = stairs.xEnd ?? -3.62;
    const zFlight1 = stairs.zFlight1 ?? [-1.78, -0.84];
    const zFlight2 = stairs.zFlight2 ?? [-0.76, 0.18];
    const stepsPerFlight = stairs.stepsPerFlight ?? 8;
    const totalRise = stairs.totalRise ?? 2.98;
    const totalRisers = stepsPerFlight * 2 + 2;
    const riserHeight = totalRise / totalRisers;
    const stepRun = Math.abs(xStart - xLanding) / stepsPerFlight;
    const dir = xLanding <= xStart ? -1 : 1;

    const w1 = Math.abs(zFlight1[1] - zFlight1[0]);
    const z1Min = Math.min(zFlight1[0], zFlight1[1]);
    const z1Center = (zFlight1[0] + zFlight1[1]) / 2;

    const w2 = Math.abs(zFlight2[1] - zFlight2[0]);
    const z2Min = Math.min(zFlight2[0], zFlight2[1]);
    const z2Center = (zFlight2[0] + zFlight2[1]) / 2;

    const landingMinX = Math.min(xEnd, xLanding);
    const landingW = Math.abs(xLanding - xEnd);
    const zMinAll = Math.min(
      zFlight1[0],
      zFlight1[1],
      zFlight2[0],
      zFlight2[1],
    );
    const zMaxAll = Math.max(
      zFlight1[0],
      zFlight1[1],
      zFlight2[0],
      zFlight2[1],
    );
    const landingCenterX = (xEnd + xLanding) / 2;

    if (floorKey === "2np") {
      dxf.addRect(
        "A-STAIR",
        ...tf.rectToDxf(
          Math.min(xEnd, xStart),
          zMinAll,
          Math.abs(xStart - xEnd),
          zMaxAll - zMinAll,
        ),
      );
    }

    dxf.addRect(
      "A-STAIR",
      ...tf.rectToDxf(landingMinX, zMinAll, landingW, zMaxAll - zMinAll),
    );

    for (let s = 0; s < stepsPerFlight; s++) {
      const sx1 = xStart + dir * s * stepRun;
      const sx2 = xStart + dir * (s + 1) * stepRun;
      dxf.addRect(
        "A-STAIR",
        ...tf.rectToDxf(Math.min(sx1, sx2), z1Min, stepRun, w1),
      );
    }

    const cutAfterStep = 2;
    for (let s = 0; s < stepsPerFlight; s++) {
      const sx1 = xLanding - dir * s * stepRun;
      const sx2 = xLanding - dir * (s + 1) * stepRun;
      const opts =
        floorKey === "1np" && s > cutAfterStep ? { linetype: "HIDDEN" } : {};
      dxf.addRect(
        "A-STAIR",
        ...tf.rectToDxf(Math.min(sx1, sx2), z2Min, stepRun, w2),
        opts,
      );
    }

    const gapMinZ = Math.min(zFlight1[1], zFlight2[0]);
    const gapH = Math.abs(zFlight2[0] - zFlight1[1]);
    dxf.addRect(
      "A-STAIR",
      ...tf.rectToDxf(
        Math.min(xLanding, xStart),
        gapMinZ,
        Math.abs(xStart - xLanding),
        gapH,
      ),
    );

    // Walking line
    const startX = xStart + dir * 0.14;
    const endWalkX = xStart - dir * 0.08;
    const walkPts = [
      tf.toDxf(startX, z1Center),
      tf.toDxf(landingCenterX, z1Center),
      tf.toDxf(landingCenterX, z2Center),
      tf.toDxf(endWalkX, z2Center),
    ];
    dxf.addPolyline("A-STAIR", walkPts);

    const [scX, scY] = tf.toDxf(startX, z1Center);
    dxf.addCircle("A-STAIR", scX, scY, 45);

    const arrowDir = -dir;
    const [tipX, tipY] = tf.toDxf(endWalkX, z2Center);
    dxf.addPolyline("A-STAIR", [
      [tipX - arrowDir * 120, tipY + 75],
      [tipX, tipY],
      [tipX - arrowDir * 120, tipY - 75],
    ]);

    if (floorKey === "1np") {
      const breakX = xLanding - dir * (cutAfterStep + 0.5) * stepRun;
      const b1A = tf.toDxf(breakX - 0.14, z2Min - 0.06);
      const b1B = tf.toDxf(breakX + 0.14, z2Min + w2 + 0.06);
      const b2A = tf.toDxf(breakX - 0.06, z2Min - 0.06);
      const b2B = tf.toDxf(breakX + 0.22, z2Min + w2 + 0.06);
      dxf.addLine("A-STAIR", b1A[0], b1A[1], b1B[0], b1B[1]);
      dxf.addLine("A-STAIR", b2A[0], b2A[1], b2B[0], b2B[1]);

      const riserMm = Math.round(riserHeight * 1000);
      const runMm = Math.round(stepRun * 1000);
      const [lblX, lblY] = tf.toDxf((xStart + xLanding) / 2, z1Center - 0.14);
      dxf.addText(
        "A-STAIR",
        lblX,
        lblY,
        `${totalRisers}× ${riserMm}/${runMm} (NAHORU)`,
        {
          height: 85,
          hAlign: 1,
          vAlign: 2,
        },
      );

      const landingElev = ((stepsPerFlight + 1) * riserHeight)
        .toFixed(2)
        .replace(".", ",");
      const [elX, elY] = tf.toDxf(landingCenterX, zMinAll + 0.22);
      dxf.addText("A-STAIR", elX, elY, `+${landingElev}`, {
        height: 85,
        hAlign: 1,
        vAlign: 2,
      });
    } else {
      const railing = (designConfig.floor2?.furniture || []).find(
        (f) => f.type === "railing",
      );
      if (railing) {
        const [rw, , rd] = railing.size;
        const [rx, rz] = railing.pos;
        dxf.addRect(
          "A-STAIR",
          ...tf.rectToDxf(rx - rw / 2, rz - rd / 2, rw, rd),
        );
      }
      const floor2Struct = designConfig.floor2?.elevation ?? 3.02;
      const floor2FinishThick =
        (designConfig.floor2?.finishes || []).find(
          (f) => f.material !== "terrace",
        )?.thickness ?? 0.08;
      const [exX, exY] = tf.toDxf((xStart + xLanding) / 2, z2Center - 0.14);
      dxf.addText(
        "A-STAIR",
        exX,
        exY,
        `VÝSTUP ${formatElevation(floor2Struct + floor2FinishThick)}`,
        {
          height: 85,
          hAlign: 1,
          vAlign: 2,
        },
      );
    }
  }

  // Chimney pass-through symbol
  const fireplace = (designConfig.floor1?.furniture || []).find(
    (f) => f.type === "fireplace",
  );
  if (fireplace) {
    const [fx] = fireplace.pos;
    const chimneySize = 0.38;
    const chimneyZ = 0.55;
    dxf.addRect(
      "A-STAIR",
      ...tf.rectToDxf(
        fx - chimneySize / 2,
        chimneyZ - chimneySize / 2,
        chimneySize,
        chimneySize,
      ),
    );
    const [chX, chY] = tf.toDxf(fx, chimneyZ);
    dxf.addCircle("A-STAIR", chX, chY, 100);
    if (floorKey === "2np") {
      const [tX, tY] = tf.toDxf(fx, chimneyZ + 0.32);
      dxf.addText("A-STAIR", tX, tY, "KOMÍN Ø200", {
        height: 85,
        hAlign: 1,
        vAlign: 2,
      });
    }
  }
}

function renderSingleFurnitureItemToDxf(dxf, item, floorKey, tf) {
  if (
    item.type === "stairs" ||
    item.type === "pergola" ||
    item.type === "canopy" ||
    item.type === "railing"
  ) {
    return;
  }

  const [cx, cz] = item.pos || [0, 0];
  const [w = 1, , d = 1] = item.size || [];
  const x = cx - w / 2;
  const z = cz - d / 2;
  const layer = item.type === "shaft" ? "A-WALL-PART" : "A-FURN";

  switch (item.type) {
    case "wc": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      if (w > d) {
        const cisternEast = cx > 2.5;
        const tankW = w * 0.28;
        const tankX = cisternEast ? x + w - tankW : x;
        const bowlCx = cisternEast
          ? x + (w - tankW) * 0.48
          : x + tankW + (w - tankW) * 0.52;
        dxf.addRect(layer, ...tf.rectToDxf(tankX, z + 0.02, tankW, d - 0.04));
        const [bX, bY] = tf.toDxf(bowlCx, cz);
        dxf.addEllipsePoly(
          layer,
          bX,
          bY,
          (w - tankW) * 0.42 * 1000,
          d * 0.36 * 1000,
          16,
        );
      } else {
        const cisternNorth = cz < 0;
        const tankD = d * 0.28;
        const tankZ = cisternNorth ? z : z + d - tankD;
        const bowlCz = cisternNorth
          ? z + tankD + (d - tankD) * 0.52
          : z + (d - tankD) * 0.48;
        dxf.addRect(layer, ...tf.rectToDxf(x + 0.02, tankZ, w - 0.04, tankD));
        const [bX, bY] = tf.toDxf(cx, bowlCz);
        dxf.addEllipsePoly(
          layer,
          bX,
          bY,
          w * 0.36 * 1000,
          (d - tankD) * 0.42 * 1000,
          16,
        );
      }
      break;
    }

    case "vanity": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const longLen = Math.max(w, d);
      const basins = longLen >= 1.15 ? 2 : 1;
      if (w >= d) {
        const bw = (w - 0.16) / basins - (basins > 1 ? 0.06 : 0);
        const bd = Math.max(0.18, d - 0.14);
        for (let i = 0; i < basins; i++) {
          const bx = basins === 1 ? cx - bw / 2 : x + 0.08 + i * (bw + 0.12);
          const bz = cz - bd / 2;
          dxf.addRect(layer, ...tf.rectToDxf(bx, bz, bw, bd));
          const [cX, cY] = tf.toDxf(bx + bw / 2, cz);
          dxf.addCircle(layer, cX, cY, 22);
        }
      } else {
        const bw = Math.max(0.18, w - 0.14);
        const bd = Math.min(0.55, d - 0.18);
        dxf.addRect(layer, ...tf.rectToDxf(cx - bw / 2, cz - bd / 2, bw, bd));
        const [cX, cY] = tf.toDxf(cx, cz);
        dxf.addCircle(layer, cX, cY, 22);
      }
      break;
    }

    case "bathtub": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      dxf.addRect(
        layer,
        ...tf.rectToDxf(x + 0.09, z + 0.09, w - 0.18, d - 0.18),
      );
      const [dX, dY] = tf.toDxf(x + 0.24, cz);
      dxf.addCircle(layer, dX, dY, 30);
      break;
    }

    case "shower": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const p1 = tf.toDxf(x, z);
      const p2 = tf.toDxf(x + w, z + d);
      const p3 = tf.toDxf(x + w, z);
      const p4 = tf.toDxf(x, z + d);
      dxf.addLine(layer, p1[0], p1[1], p2[0], p2[1]);
      dxf.addLine(layer, p3[0], p3[1], p4[0], p4[1]);
      const [cX, cY] = tf.toDxf(cx, cz);
      dxf.addCircle(layer, cX, cY, 35);
      if (/ps[ií]|pes/i.test(item.name || "")) {
        dxf.addText(layer, cX, cY - 200, "PS\\U+00CD MYC\\U+00CD Z\\U+00D3NA", {
          height: 70,
          hAlign: 1,
          vAlign: 2,
        });
      }
      break;
    }

    case "bed": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const horizontalSingle = w > d + 0.3;
      if (horizontalSingle) {
        const headEast = cx > 0;
        const headX = headEast ? x + w - 0.08 : x;
        const pilX = headEast ? x + w - 0.44 : x + 0.12;
        dxf.addRect(layer, ...tf.rectToDxf(headX, z, 0.08, d));
        dxf.addRect(layer, ...tf.rectToDxf(pilX, z + 0.12, 0.32, d - 0.24));
        const foldX = headEast ? x + w * 0.68 : x + w * 0.32;
        const f1 = tf.toDxf(foldX, z);
        const f2 = tf.toDxf(foldX, z + d);
        dxf.addLine(layer, f1[0], f1[1], f2[0], f2[1]);
      } else {
        const headSouth = cz > 0 ? cz >= 3.8 : cz >= -3.8;
        const headZ = headSouth ? z + d - 0.08 : z;
        const pilZ = headSouth ? z + d - 0.48 : z + 0.12;
        const foldZ = headSouth ? z + d - 0.65 : z + 0.65;
        dxf.addRect(layer, ...tf.rectToDxf(x, headZ, w, 0.08));
        const pillows = Math.min(w, d) >= 1.4 ? 2 : 1;
        const pw = (w - 0.24 - (pillows - 1) * 0.12) / pillows;
        for (let i = 0; i < pillows; i++) {
          const px = x + 0.12 + i * (pw + 0.12);
          dxf.addRect(layer, ...tf.rectToDxf(px, pilZ, pw, 0.36));
        }
        const f1 = tf.toDxf(x, foldZ);
        const f2 = tf.toDxf(x + w, foldZ);
        dxf.addLine(layer, f1[0], f1[1], f2[0], f2[1]);
      }
      break;
    }

    case "wardrobe": {
      const isUnderStairs =
        floorKey === "1np" && cx < -0.5 && cz > -1.0 && cz < 0.2;
      if (isUnderStairs) {
        dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d), { linetype: "DASHED" });
      } else {
        dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
        const p1 = tf.toDxf(x, z);
        const p2 = tf.toDxf(x + w, z + d);
        const p3 = tf.toDxf(x + w, z);
        const p4 = tf.toDxf(x, z + d);
        dxf.addLine(layer, p1[0], p1[1], p2[0], p2[1]);
        dxf.addLine(layer, p3[0], p3[1], p4[0], p4[1]);
      }
      break;
    }

    case "desk": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const chairR = 220;
      let chX = cx;
      let chZ = cz;
      if (w >= d) {
        const againstSouthWall = cz > 0 ? cz >= 3.8 : cz >= -3.8;
        chZ = againstSouthWall ? z - 0.18 : z + d + 0.18;
      } else {
        chX = cx < 0 ? x + w + 0.18 : x - 0.18;
      }
      const [cX, cY] = tf.toDxf(chX, chZ);
      dxf.addCircle(layer, cX, cY, chairR);
      break;
    }

    case "kitchenCounter": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      if (cx > 2.8 && d > 1.2) {
        dxf.addRect(
          layer,
          ...tf.rectToDxf(x + 0.08, cz - 0.42, w - 0.16, 0.84),
        );
        dxf.addRect(
          layer,
          ...tf.rectToDxf(x + 0.11, cz - 0.36, w - 0.22, 0.42),
        );
        const [sX, sY] = tf.toDxf(cx, cz - 0.15);
        dxf.addCircle(layer, sX, sY, 22);
      }
      break;
    }

    case "kitchenTall": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const numModules = Math.max(1, Math.round(w / 0.55));
      const modW = w / numModules;
      for (let i = 1; i < numModules; i++) {
        const mx = x + i * modW;
        const m1 = tf.toDxf(mx, z);
        const m2 = tf.toDxf(mx, z + d);
        dxf.addLine(layer, m1[0], m1[1], m2[0], m2[1]);
      }
      const d1 = tf.toDxf(x, z);
      const d2 = tf.toDxf(x + w, z + d);
      const d3 = tf.toDxf(x + w, z);
      const d4 = tf.toDxf(x, z + d);
      dxf.addLine(layer, d1[0], d1[1], d2[0], d2[1], { linetype: "DASHED" });
      dxf.addLine(layer, d3[0], d3[1], d4[0], d4[1], { linetype: "DASHED" });
      break;
    }

    case "kitchenIsland": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const hobW = 0.56;
      const hobD = 0.72;
      dxf.addRect(
        layer,
        ...tf.rectToDxf(cx - hobW / 2, cz - hobD / 2, hobW, hobD),
      );
      for (const ox of [-0.14, 0.14]) {
        for (const oz of [-0.18, 0.18]) {
          const [bX, bY] = tf.toDxf(cx + ox, cz + oz);
          dxf.addCircle(layer, bX, bY, 90);
        }
      }
      break;
    }

    case "diningTable": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const cols = 3;
      const cw = 0.4;
      const cd = 0.22;
      for (let i = 0; i < cols; i++) {
        const chx = x + ((i + 0.5) * w) / cols - cw / 2;
        dxf.addRect(layer, ...tf.rectToDxf(chx, z - cd - 0.05, cw, cd));
        dxf.addRect(layer, ...tf.rectToDxf(chx, z + d + 0.05, cw, cd));
      }
      break;
    }

    case "lSofa": {
      for (const part of item.parts || []) {
        const [pw, , pd] = part.size;
        const [ox, oz] = part.offset;
        dxf.addRect(
          layer,
          ...tf.rectToDxf(cx + ox - pw / 2, cz + oz - pd / 2, pw, pd),
        );
      }
      break;
    }

    case "tvStand": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      dxf.addRect(
        layer,
        ...tf.rectToDxf(cx - w * 0.4, cz + d * 0.15, w * 0.8, 0.04),
      );
      break;
    }

    case "fireplace": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      dxf.addRect(
        layer,
        ...tf.rectToDxf(x + 0.08, z + 0.08, w - 0.16, d - 0.16),
      );
      break;
    }

    case "shaft": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const p1 = tf.toDxf(x, z);
      const p2 = tf.toDxf(x + w, z + d);
      const p3 = tf.toDxf(x + w, z);
      const p4 = tf.toDxf(x, z + d);
      dxf.addLine(layer, p1[0], p1[1], p2[0], p2[1]);
      dxf.addLine(layer, p3[0], p3[1], p4[0], p4[1]);
      const [tX, tY] = tf.toDxf(cx, cz);
      dxf.addText("A-ANNO-ROOM", tX, tY, "ŠACHTA VZT", {
        height: 70,
        hAlign: 1,
        vAlign: 2,
      });
      break;
    }

    case "recup": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const h1 = tf.toDxf(x, cz);
      const h2 = tf.toDxf(x + w, cz);
      const v1 = tf.toDxf(cx, z);
      const v2 = tf.toDxf(cx, z + d);
      dxf.addLine(layer, h1[0], h1[1], h2[0], h2[1]);
      dxf.addLine(layer, v1[0], v1[1], v2[0], v2[1]);
      const [tX, tY] = tf.toDxf(cx, cz);
      dxf.addText(layer, tX, tY, "VZT / REKUP", {
        height: 70,
        hAlign: 1,
        vAlign: 2,
      });
      break;
    }

    case "hvac":
    case "laundryStack": {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
      const d1 = tf.toDxf(x, z);
      const d2 = tf.toDxf(x + w, z + d);
      dxf.addLine(layer, d1[0], d1[1], d2[0], d2[1]);
      const [tX, tY] = tf.toDxf(cx, cz);
      dxf.addText(layer, tX, tY, item.type === "hvac" ? "TČ" : "P+S", {
        height: 80,
        hAlign: 1,
        vAlign: 2,
      });
      break;
    }

    default: {
      dxf.addRect(layer, ...tf.rectToDxf(x, z, w, d));
    }
  }
}

function renderFloorPlanToDxf(
  dxf,
  designConfig,
  floorKey,
  oxMm,
  oyMm,
  options,
  openingSchedule,
) {
  const floorConfig =
    floorKey === "2np" ? designConfig.floor2 : designConfig.floor1;
  if (!floorConfig) return;

  const {
    showDimensions = true,
    showInteriorDims = true,
    showFurniture = true,
    showOpeningTags = true,
    showHatches = true,
    units = "mm",
    includeScheduleTable = true,
  } = options;

  const tf = makeTransform(oxMm, oyMm);
  const bounds = computeFloorBounds(floorConfig, designConfig);

  // 1. Floor finishes, pergola, canopy, roof overhang & ridge
  for (const fin of floorConfig.finishes || []) {
    const [w, d] = fin.size;
    const [cx, cz] = fin.pos;
    dxf.addRect("A-FLOOR", ...tf.rectToDxf(cx - w / 2, cz - d / 2, w, d));
  }

  if (floorKey === "1np") {
    const pergola = (floorConfig.furniture || []).find(
      (f) => f.type === "pergola",
    );
    if (pergola?.posts?.length) {
      const halfPost = (pergola.postSize ?? 0.14) / 2;
      const xs = pergola.posts.map(([px]) => px);
      const zs = pergola.posts.map(([, pz]) => pz);
      const minX = Math.min(...xs) - halfPost;
      const maxX = Math.max(...xs) + halfPost;
      const minZ = Math.min(...zs) - halfPost;
      const maxZ = Math.max(...zs) + halfPost;

      dxf.addRect(
        "A-ROOF",
        ...tf.rectToDxf(minX, minZ, maxX - minX, maxZ - minZ),
      );
      const rafterCount = pergola.rafterCount ?? 7;
      for (let i = 0; i < rafterCount; i++) {
        const rz = minZ + ((maxZ - minZ) * (i + 1)) / (rafterCount + 1);
        const r1 = tf.toDxf(minX, rz);
        const r2 = tf.toDxf(maxX, rz);
        dxf.addLine("A-ROOF", r1[0], r1[1], r2[0], r2[1]);
      }
      const postSize = pergola.postSize ?? 0.14;
      for (const [px, pz] of pergola.posts) {
        dxf.addRect(
          "A-ROOF",
          ...tf.rectToDxf(px - halfPost, pz - halfPost, postSize, postSize),
        );
      }
    }

    const canopy = (floorConfig.furniture || []).find(
      (f) => f.type === "canopy",
    );
    if (canopy) {
      const [cw, , cd] = canopy.size;
      const [cx, cz] = canopy.pos;
      dxf.addRect("A-ROOF", ...tf.rectToDxf(cx - cw / 2, cz - cd / 2, cw, cd));
      const [cX, cY] = tf.toDxf(cx, cz);
      dxf.addText("A-ROOF", cX, cY, "PŘÍSTŘEŠEK", {
        height: 85,
        rotation: 90,
        hAlign: 1,
        vAlign: 2,
      });
    }
  }

  const roof = designConfig.roof;
  if (roof) {
    const ridgeZ = (roof.ridgeAxis || "z") === "z";
    const overX = ridgeZ
      ? (roof.eaveOverhang ?? 0.45)
      : (roof.gableOverhang ?? 0.35);
    const overZ = ridgeZ
      ? (roof.gableOverhang ?? 0.35)
      : (roof.eaveOverhang ?? 0.45);
    const rx = roof.width / 2 + overX;
    const rz = roof.length / 2 + overZ;
    dxf.addRect("A-ROOF", ...tf.rectToDxf(-rx, -rz, rx * 2, rz * 2));
    if (floorKey === "2np") {
      if (ridgeZ) {
        const p1 = tf.toDxf(0, -rz);
        const p2 = tf.toDxf(0, rz);
        dxf.addLine("A-ROOF", p1[0], p1[1], p2[0], p2[1], {
          linetype: "CENTER",
        });
      } else {
        const p1 = tf.toDxf(-rx, 0);
        const p2 = tf.toDxf(rx, 0);
        dxf.addLine("A-ROOF", p1[0], p1[1], p2[0], p2[1], {
          linetype: "CENTER",
        });
      }
    }
  }

  // 2. Stairs & Chimney
  renderStairsAndChimneyToDxf(dxf, designConfig, floorKey, tf);

  // 3. Furniture (shaft always rendered)
  for (const item of floorConfig.furniture || []) {
    if (!showFurniture && item.type !== "shaft") continue;
    renderSingleFurnitureItemToDxf(dxf, item, floorKey, tf);
  }

  // 4. Walls, Hatches & Openings
  const wallGeoms = (floorConfig.walls || [])
    .map(splitWallSegments)
    .filter(Boolean);
  for (const g of wallGeoms) {
    const isStruct =
      g.wallDef.structural === true ||
      (g.wallDef.material || "wall") === "wall";
    const wallLayer = isStruct ? "A-WALL-LOAD" : "A-WALL-PART";

    for (const poly of g.solidPolys) {
      const dxfPts = poly.map(([x, z]) => tf.toDxf(x, z));
      dxf.addPolyline(wallLayer, dxfPts, { closed: true });
      if (showHatches) {
        addPolygonHatch(
          dxf,
          "A-WALL-HATCH",
          dxfPts,
          isStruct ? 1 : -1,
          isStruct ? 140 : 180,
        );
      }
    }

    const wallId = g.wallDef.id || g.wallDef.name || "wall";
    for (const op of g.openings) {
      if (op.type === "window") {
        renderWindowOpeningToDxf(dxf, g, op, tf);
      } else if (op.swing || op.type === "door") {
        renderDoorOpeningToDxf(dxf, g, op, tf);
      } else {
        const l1A = tf.toDxf(...g.ptAt(op.start, -g.halfT));
        const l1B = tf.toDxf(...g.ptAt(op.end, -g.halfT));
        const l2A = tf.toDxf(...g.ptAt(op.start, g.halfT));
        const l2B = tf.toDxf(...g.ptAt(op.end, g.halfT));
        dxf.addLine("A-DOOR-SWING", l1A[0], l1A[1], l1B[0], l1B[1]);
        dxf.addLine("A-DOOR-SWING", l2A[0], l2A[1], l2B[0], l2B[1]);
      }

      if (
        showOpeningTags &&
        (op.type === "window" || op.swing || op.type === "door")
      ) {
        const mark =
          openingSchedule?.tagByKey?.get(
            `${floorKey}|${wallId}|${op.origIndex}`,
          ) || "";
        renderOpeningTagToDxf(dxf, g, op, mark, units, bounds, tf);
      }
    }
  }

  // 5. Interior & Exterior Dimensions
  if (showInteriorDims) {
    const walls = floorConfig.walls || [];
    const customSlices = floorConfig.dimensionSlices;
    if (customSlices) {
      for (const zSlice of customSlices.x || []) {
        const nodes = computeWallSliceNodes(walls, "x", zSlice);
        if (nodes.length >= 4) {
          drawDxfDimensionChain(dxf, nodes, "x", zSlice, tf, {
            units,
            textSide: -1,
          });
        }
      }
      for (const xSlice of customSlices.z || []) {
        const nodes = computeWallSliceNodes(walls, "z", xSlice);
        if (nodes.length >= 4) {
          drawDxfDimensionChain(dxf, nodes, "z", xSlice, tf, {
            units,
            textSide: -1,
          });
        }
      }
    } else {
      for (const { sliceCoord, nodes } of discoverDistinctSlices(
        floorConfig,
        bounds,
        "x",
      )) {
        drawDxfDimensionChain(dxf, nodes, "x", sliceCoord, tf, {
          units,
          textSide: -1,
        });
      }
      for (const { sliceCoord, nodes } of discoverDistinctSlices(
        floorConfig,
        bounds,
        "z",
      )) {
        drawDxfDimensionChain(dxf, nodes, "z", sliceCoord, tf, {
          units,
          textSide: -1,
        });
      }
    }
  }

  if (showDimensions) {
    const {
      wallMinX,
      wallMaxX,
      wallMinZ,
      wallMaxZ,
      northWall,
      southWall,
      eastWall,
      westWall,
      terrace,
    } = bounds;

    const northNodes = sortUniqueCoords([
      wallMinX,
      ...collectWallOpeningNodes(northWall?.wallDef, "x"),
      wallMaxX,
    ]);
    const southNodes = sortUniqueCoords([
      wallMinX,
      ...collectWallOpeningNodes(southWall?.wallDef, "x"),
      wallMaxX,
    ]);
    const eastNodes = sortUniqueCoords([
      wallMinZ,
      ...collectWallOpeningNodes(eastWall?.wallDef, "z"),
      wallMaxZ,
    ]);
    const westNodes = sortUniqueCoords([
      wallMinZ,
      ...collectWallOpeningNodes(westWall?.wallDef, "z"),
      wallMaxZ,
    ]);

    drawDxfDimensionChain(dxf, northNodes, "x", wallMinZ - 0.65, tf, {
      extStart: wallMinZ,
      units,
      textSide: -1,
    });
    drawDxfDimensionChain(dxf, [wallMinX, wallMaxX], "x", wallMinZ - 1.2, tf, {
      extStart: wallMinZ,
      units,
      textSide: -1,
    });

    drawDxfDimensionChain(dxf, southNodes, "x", wallMaxZ + 0.65, tf, {
      extStart: wallMaxZ,
      units,
      textSide: 1,
    });
    if (terrace) {
      const southBandNodes = sortUniqueCoords([
        terrace.minX,
        terrace.maxX,
        wallMinX,
        wallMaxX,
      ]);
      drawDxfDimensionChain(dxf, southBandNodes, "x", wallMaxZ + 1.2, tf, {
        extStart: wallMaxZ,
        units,
        textSide: 1,
      });
      drawDxfDimensionChain(
        dxf,
        [Math.min(wallMinX, terrace.minX), Math.max(wallMaxX, terrace.maxX)],
        "x",
        wallMaxZ + 1.75,
        tf,
        { extStart: wallMaxZ, units, textSide: 1 },
      );
    } else {
      drawDxfDimensionChain(
        dxf,
        [wallMinX, wallMaxX],
        "x",
        wallMaxZ + 1.2,
        tf,
        {
          extStart: wallMaxZ,
          units,
          textSide: 1,
        },
      );
    }

    drawDxfDimensionChain(dxf, eastNodes, "z", wallMaxX + 0.65, tf, {
      extStart: wallMaxX,
      units,
      textSide: -1,
    });
    drawDxfDimensionChain(dxf, [wallMinZ, wallMaxZ], "z", wallMaxX + 1.2, tf, {
      extStart: wallMaxX,
      units,
      textSide: -1,
    });

    if (terrace) {
      const westEdge = Math.min(wallMinX, terrace.minX);
      const westBandNodes = sortUniqueCoords([
        wallMinZ,
        terrace.minZ,
        terrace.maxZ,
        wallMaxZ,
      ]);
      drawDxfDimensionChain(dxf, westNodes, "z", westEdge - 0.65, tf, {
        extStart: wallMinX,
        units,
        textSide: -1,
      });
      drawDxfDimensionChain(dxf, westBandNodes, "z", westEdge - 1.2, tf, {
        extStart: westEdge,
        units,
        textSide: -1,
      });
      drawDxfDimensionChain(
        dxf,
        [wallMinZ, wallMaxZ],
        "z",
        westEdge - 1.75,
        tf,
        {
          extStart: westEdge,
          units,
          textSide: -1,
        },
      );
    } else {
      drawDxfDimensionChain(dxf, westNodes, "z", wallMinX - 0.65, tf, {
        extStart: wallMinX,
        units,
        textSide: -1,
      });
      drawDxfDimensionChain(
        dxf,
        [wallMinZ, wallMaxZ],
        "z",
        wallMinX - 1.2,
        tf,
        {
          extStart: wallMinX,
          units,
          textSide: -1,
        },
      );
    }

    // Section cut lines A-A' and B-B' (ČSN 01 3420)
    const secPlanes = computeSectionPlanes(designConfig);
    const aaLeftM = terrace
      ? Math.min(wallMinX, terrace.minX) - 1.95
      : wallMinX - 1.5;
    const aaRightM = wallMaxX + 1.5;
    const [aaX1, aaY] = tf.toDxf(aaLeftM, secPlanes.AA.cutZ);
    const [aaX2] = tf.toDxf(aaRightM, secPlanes.AA.cutZ);
    dxf.addLine("A-SEC-CUT", aaX1, aaY, aaX2, aaY, { linetype: "CENTER" });
    for (const [ex, lbl] of [
      [aaX1, "A"],
      [aaX2, "A'"],
    ]) {
      dxf.addLine("A-SEC-CUT", ex - 140, aaY, ex + 140, aaY);
      dxf.addLine("A-SEC-CUT", ex, aaY, ex, aaY + 320);
      dxf.addPolyline(
        "A-SEC-CUT",
        [
          [ex, aaY + 440],
          [ex - 60, aaY + 300],
          [ex + 60, aaY + 300],
        ],
        { closed: true },
      );
      dxf.addText("A-SEC-CUT", ex, aaY + 580, lbl, {
        height: 180,
        hAlign: 1,
        vAlign: 2,
      });
    }

    const bbTopM = wallMinZ - 1.5;
    const bbBotM = terrace ? wallMaxZ + 1.95 : wallMaxZ + 1.5;
    const [bbX, bbY1] = tf.toDxf(secPlanes.BB.cutX, bbTopM);
    const [, bbY2] = tf.toDxf(secPlanes.BB.cutX, bbBotM);
    dxf.addLine("A-SEC-CUT", bbX, bbY1, bbX, bbY2, { linetype: "CENTER" });
    for (const [ey, lbl] of [
      [bbY1, "B"],
      [bbY2, "B'"],
    ]) {
      dxf.addLine("A-SEC-CUT", bbX, ey - 140, bbX, ey + 140);
      dxf.addLine("A-SEC-CUT", bbX, ey, bbX - 320, ey);
      dxf.addPolyline(
        "A-SEC-CUT",
        [
          [bbX - 440, ey],
          [bbX - 300, ey - 60],
          [bbX - 300, ey + 60],
        ],
        { closed: true },
      );
      dxf.addText("A-SEC-CUT", bbX - 580, ey, lbl, {
        height: 180,
        hAlign: 1,
        vAlign: 2,
      });
    }
  }

  // 6. Room Stamps
  const schedule = computeRoomSchedule(floorConfig.rooms || [], floorConfig);
  for (const room of schedule.rooms) {
    const [rx, , rz] = room.pos;
    const [cx, cy] = tf.toDxf(rx, rz);
    dxf.addText("A-ANNO-ROOM", cx, cy + 140, room.id, {
      height: 95,
      hAlign: 1,
      vAlign: 2,
    });
    dxf.addText("A-ANNO-ROOM", cx, cy, room.name, {
      height: 110,
      hAlign: 1,
      vAlign: 2,
    });
    dxf.addText("A-ANNO-ROOM", cx, cy - 140, formatArea(room.areaSqm), {
      height: 105,
      hAlign: 1,
      vAlign: 2,
    });
  }

  // 7. Heading & Room Schedule Table
  const structElev = floorConfig.elevation ?? 0;
  const finishThick =
    (floorConfig.finishes || []).find((f) => f.material !== "terrace")
      ?.thickness ?? 0;
  const finishElev = structElev + finishThick;
  const title =
    floorKey === "2np" ? "PŮDORYS 2.NP (PATRO)" : "PŮDORYS 1.NP (PŘÍZEMÍ)";
  const baseLabel = structElev === 0 ? "základová deska" : "nosná deska";
  const elevText = `Úroveň č. podlahy ${formatElevation(finishElev)} m (${baseLabel} ${formatElevation(structElev)} m) | Měřítko 1:1 (mm)`;

  const [headX, headY] = tf.toDxf(bounds.wallMinX, bounds.wallMinZ - 2.35);
  dxf.addText("A-TITLE", headX, headY + 220, title, { height: 240 });
  dxf.addText("A-TITLE", headX, headY, elevText, { height: 130 });

  if (includeScheduleTable) {
    const tableW = 5400;
    const rowH = 260;
    const headerH = 340;
    const tx = oxMm + (bounds.wallMaxX + 2.4) * 1000;
    let ty = oyMm - bounds.wallMinZ * 1000;

    dxf.addRect("A-TITLE", tx, ty - headerH, tableW, headerH);
    dxf.addText(
      "A-TITLE",
      tx + 140,
      ty - 220,
      `TABULKA MÍSTNOSTÍ — ${floorKey.toUpperCase().replace("NP", ".NP")}`,
      {
        height: 130,
      },
    );
    ty -= headerH;

    for (const r of schedule.rooms) {
      dxf.addRect("A-TITLE", tx, ty - rowH, tableW, rowH);
      dxf.addText("A-TITLE", tx + 140, ty - 175, `${r.id}  ${r.name}`, {
        height: 105,
      });
      dxf.addText(
        "A-TITLE",
        tx + tableW - 140,
        ty - 175,
        formatArea(r.areaSqm),
        {
          height: 105,
          hAlign: 2,
        },
      );
      ty -= rowH;
    }

    dxf.addRect("A-TITLE", tx, ty - rowH - 40, tableW, rowH + 40);
    dxf.addText("A-TITLE", tx + 140, ty - 195, "Užitná plocha podlaží celkem", {
      height: 115,
    });
    dxf.addText(
      "A-TITLE",
      tx + tableW - 140,
      ty - 195,
      formatArea(schedule.interiorTotalSqm),
      {
        height: 115,
        hAlign: 2,
      },
    );

    // North arrow (Severka) in floor plan DXF
    const fnaX = tx + 1400;
    const fnaY = ty - 1800;
    const fnaR = 900;
    dxf.addCircle("A-TITLE", fnaX, fnaY, fnaR);
    // House axis UP
    dxf.addLine("A-TITLE", fnaX, fnaY, fnaX, fnaY + 800, { linetype: "DASHED" });
    dxf.addText("A-TITLE", fnaX, fnaY + 1020, "OSA DOMU", {
      height: 110,
      hAlign: 1,
      vAlign: 2,
    });
    // True North (+totalRotDeg CW from UP)
    const siteCfg = options.siteConfig;
    const pRot = siteCfg?.parcelRotationDeg ?? 26.5;
    const hRot = options.housePos?.rotY ?? siteCfg?.defaultHousePos?.rotY ?? 0;
    const totRot = pRot + hRot;
    const nRad = ((90 - totRot) * Math.PI) / 180;
    const nLen = 850;
    const nTipX = fnaX + nLen * Math.cos(nRad);
    const nTipY = fnaY + nLen * Math.sin(nRad);
    const pX = -Math.sin(nRad);
    const pY = Math.cos(nRad);
    dxf.addLine("A-TITLE", fnaX, fnaY, nTipX, nTipY);
    dxf.addPolyline(
      "A-TITLE",
      [
        [nTipX, nTipY],
        [
          nTipX - 220 * Math.cos(nRad) + 90 * pX,
          nTipY - 220 * Math.sin(nRad) + 90 * pY,
        ],
        [
          nTipX - 220 * Math.cos(nRad) - 90 * pX,
          nTipY - 220 * Math.sin(nRad) - 90 * pY,
        ],
      ],
      { closed: true },
    );
    dxf.addText(
      "A-TITLE",
      nTipX + 180 * Math.cos(nRad),
      nTipY + 180 * Math.sin(nRad),
      "S",
      { height: 160, hAlign: 1, vAlign: 2 },
    );
    dxf.addText(
      "A-TITLE",
      fnaX + 1700,
      fnaY,
      `SKUTEČNÝ SEVER (+${String(totRot).replace(".", ",")}°)`,
      { height: 130, hAlign: 0, vAlign: 2 },
    );
  }
}

function drawSiteSetbackLine(
  dxf,
  tf,
  p1,
  p2,
  distM,
  labelPrefix,
  units = "mm",
  isVertical = false,
) {
  const [x1, y1] = tf.toDxf(p1[0], p1[1]);
  const [x2, y2] = tf.toDxf(p2[0], p2[1]);
  dxf.addLine("A-SITE-DIM", x1, y1, x2, y2);

  const tick = 220;
  if (isVertical) {
    dxf.addLine("A-SITE-DIM", x1 - tick, y1, x1 + tick, y1);
    dxf.addLine("A-SITE-DIM", x2 - tick, y2, x2 + tick, y2);
  } else {
    dxf.addLine("A-SITE-DIM", x1, y1 - tick, x1, y1 + tick);
    dxf.addLine("A-SITE-DIM", x2, y2 - tick, x2, y2 + tick);
  }

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const valStr =
    units === "m"
      ? `${distM.toFixed(1).replace(".", ",")} m`
      : `${Math.round(distM * 1000)}`;
  const text = labelPrefix ? `${labelPrefix}: ${valStr}` : valStr;

  dxf.addText(
    "A-SITE-DIM",
    mx + (isVertical ? -220 : 0),
    my + (isVertical ? 0 : 220),
    text,
    {
      height: 180,
      rotation: isVertical ? 90 : 0,
      hAlign: 1,
      vAlign: 2,
    },
  );
}

function renderSitePlanToDxf(
  dxf,
  designConfig,
  siteConfig,
  auxConfig,
  housePos,
  oxMm,
  oyMm,
  options = {},
) {
  if (!siteConfig || !auxConfig) return;
  const units = options.units || "mm";
  const tf = makeTransform(oxMm, oyMm);

  const hw = siteConfig.width / 2;
  const hd = siteConfig.depth / 2;
  const ch = siteConfig.chamfer || 0;
  const roadW = siteConfig.roadWidth || 4.5;
  const resolvedPos = housePos ||
    siteConfig.defaultHousePos || { x: 4.5, z: 1.0, rotY: 0 };

  // Heading
  const [hx, hy] = tf.toDxf(-hw, -hd - 3.6);
  dxf.addText(
    "A-TITLE",
    hx,
    hy + 420,
    "SITUAČNÍ VÝKRES — OSAZENÍ STAVEB NA POZEMKU",
    {
      height: 360,
    },
  );
  dxf.addText(
    "A-TITLE",
    hx,
    hy,
    `Parcela ${siteConfig.width} × ${siteConfig.depth} m (${siteConfig.areaSqm} m²) | Natočení parcely +${String(siteConfig.parcelRotationDeg).replace(".", ",")}° | Měřítko 1:1 (mm)`,
    { height: 200 },
  );

  // 1. Plot boundary chamfered pentagon (SE corner chamfer)
  const plotBoundary = [
    tf.toDxf(-hw, -hd),
    tf.toDxf(hw, -hd),
    tf.toDxf(hw, hd - ch),
    tf.toDxf(hw - ch, hd),
    tf.toDxf(-hw, hd),
  ];
  dxf.addPolyline("A-SITE-BOUNDARY", plotBoundary, { closed: true });

  // Adjacent roads
  dxf.addRect(
    "A-FLOOR",
    ...tf.rectToDxf(hw, -hd - roadW, roadW, siteConfig.depth + roadW * 2),
    {
      linetype: "DASHED",
    },
  );
  dxf.addRect(
    "A-FLOOR",
    ...tf.rectToDxf(-hw - roadW, hd, siteConfig.width + roadW * 2, roadW),
    {
      linetype: "DASHED",
    },
  );
  const [erX, erY] = tf.toDxf(hw + roadW / 2, 0);
  dxf.addText("A-TITLE", erX, erY, "PŘÍSTUPOVÁ KOMUNIKACE", {
    height: 240,
    rotation: 90,
    hAlign: 1,
    vAlign: 2,
  });
  const [frX, frY] = tf.toDxf(0, hd + roadW / 2);
  dxf.addText("A-TITLE", frX, frY, "PŘÍSTUPOVÁ KOMUNIKACE", {
    height: 240,
    hAlign: 1,
    vAlign: 2,
  });

  // Overall plot dimensions
  drawDxfDimensionChain(dxf, [-hw, hw], "x", -hd - 1.6, tf, {
    extStart: -hd,
    units,
    textSide: -1,
  });
  drawDxfDimensionChain(dxf, [-hd, hd], "z", -hw - 1.6, tf, {
    extStart: -hw,
    units,
    textSide: -1,
  });

  if (ch > 0) {
    const [chX, chY] = tf.toDxf(hw - ch / 2 + 1.2, hd - ch / 2 + 1.2);
    dxf.addText(
      "A-SITE-DIM",
      chX,
      chY,
      `ZKOSENÍ ${ch.toFixed(1).replace(".", ",")} m`,
      {
        height: 180,
        hAlign: 1,
        vAlign: 2,
      },
    );
  }

  // 2. Main house (transformed by housePos)
  const fpW = designConfig.footprint?.width ?? 8;
  const fpL = designConfig.footprint?.length ?? 12;
  const rad = ((resolvedPos.rotY || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xformHouse = (lx, lz) => [
    resolvedPos.x + lx * cos + lz * sin,
    resolvedPos.z - lx * sin + lz * cos,
  ];

  const housePts = [
    xformHouse(-fpW / 2, -fpL / 2),
    xformHouse(fpW / 2, -fpL / 2),
    xformHouse(fpW / 2, fpL / 2),
    xformHouse(-fpW / 2, fpL / 2),
  ].map(([x, z]) => tf.toDxf(x, z));
  dxf.addPolyline("A-SITE-BUILD", housePts, { closed: true });

  const [hcX, hcY] = tf.toDxf(resolvedPos.x, resolvedPos.z);
  dxf.addText("A-TITLE", hcX, hcY + 180, "HLAVNÍ DŮM", {
    height: 220,
    hAlign: 1,
    vAlign: 2,
  });
  dxf.addText(
    "A-TITLE",
    hcX,
    hcY - 180,
    `${fpW} × ${fpL} m (${(fpW * fpL).toFixed(1).replace(".", ",")} m²)`,
    {
      height: 170,
      hAlign: 1,
      vAlign: 2,
    },
  );

  if (designConfig.roof) {
    const r = designConfig.roof;
    const ridgeZ = (r.ridgeAxis || "z") === "z";
    const ox = ridgeZ ? (r.eaveOverhang ?? 0.45) : (r.gableOverhang ?? 0.35);
    const oz = ridgeZ ? (r.gableOverhang ?? 0.35) : (r.eaveOverhang ?? 0.45);
    const rx = r.width / 2 + ox;
    const rz = r.length / 2 + oz;
    const roofPts = [
      xformHouse(-rx, -rz),
      xformHouse(rx, -rz),
      xformHouse(rx, rz),
      xformHouse(-rx, rz),
    ].map(([x, z]) => tf.toDxf(x, z));
    dxf.addPolyline("A-ROOF", roofPts, { closed: true });

    const ridgeA = tf.toDxf(...xformHouse(ridgeZ ? 0 : -rx, ridgeZ ? -rz : 0));
    const ridgeB = tf.toDxf(...xformHouse(ridgeZ ? 0 : rx, ridgeZ ? rz : 0));
    dxf.addLine("A-ROOF", ridgeA[0], ridgeA[1], ridgeB[0], ridgeB[1], {
      linetype: "CENTER",
    });
  }

  const terraceFinish = designConfig.floor1?.finishes?.find(
    (f) => f.material === "terrace",
  );
  if (terraceFinish?.size && terraceFinish?.pos) {
    const [tw, td] = terraceFinish.size;
    const [tcx, tcz] = terraceFinish.pos;
    const terPts = [
      xformHouse(tcx - tw / 2, tcz - td / 2),
      xformHouse(tcx + tw / 2, tcz - td / 2),
      xformHouse(tcx + tw / 2, tcz + td / 2),
      xformHouse(tcx - tw / 2, tcz + td / 2),
    ].map(([x, z]) => tf.toDxf(x, z));
    dxf.addPolyline("A-FLOOR", terPts, { closed: true });

    const [tX, tY] = tf.toDxf(...xformHouse(tcx, tcz));
    dxf.addText(
      "A-TITLE",
      tX,
      tY,
      `TERASA (${(tw * td).toFixed(1).replace(".", ",")} m²)`,
      {
        height: 150,
        rotation: 90,
        hAlign: 1,
        vAlign: 2,
      },
    );
  }

  // 3. Auxiliary building (workshop, covered parking, canopy, east walkway)
  const [auxX, , auxZ] = auxConfig.position;
  const totalAuxW = auxConfig.parkWidth + auxConfig.workshopWidth;
  const auxD = auxConfig.depth;

  // Workshop (West part)
  const wsX = auxX - totalAuxW / 2;
  dxf.addRect(
    "A-SITE-BUILD",
    ...tf.rectToDxf(wsX, auxZ - auxD / 2, auxConfig.workshopWidth, auxD),
  );
  for (const o of auxConfig.workshopOpenings ?? []) {
    const wcx = wsX + auxConfig.workshopWidth / 2;
    const alongX = o.wall === "S" || o.wall === "N";
    const ow = alongX ? o.width : 0.12;
    const od = alongX ? 0.12 : o.width;
    let cx = wcx;
    let cz = auxZ;
    if (o.wall === "S") { cx += o.offset; cz += auxD / 2; }
    if (o.wall === "N") { cx += o.offset; cz -= auxD / 2; }
    if (o.wall === "E") { cx += auxConfig.workshopWidth / 2; cz += o.offset; }
    if (o.wall === "W") { cx -= auxConfig.workshopWidth / 2; cz += o.offset; }
    dxf.addRect(
      "A-SITE-BUILD",
      ...tf.rectToDxf(cx - ow / 2, cz - od / 2, ow, od),
    );
  }
  const [wsCX, wsCY] = tf.toDxf(wsX + auxConfig.workshopWidth / 2, auxZ);
  dxf.addText("A-TITLE", wsCX, wsCY + 140, "DÍLNA", {
    height: 200,
    hAlign: 1,
    vAlign: 2,
  });
  dxf.addText(
    "A-TITLE",
    wsCX,
    wsCY - 140,
    `${auxConfig.workshopWidth}×${auxD} m`,
    {
      height: 160,
      hAlign: 1,
      vAlign: 2,
    },
  );

  // Covered parking (East part)
  const pkX = auxX + totalAuxW / 2 - auxConfig.parkWidth;
  dxf.addRect(
    "A-SITE-BUILD",
    ...tf.rectToDxf(pkX, auxZ - auxD / 2, auxConfig.parkWidth, auxD),
  );
  const [pkCX, pkCY] = tf.toDxf(pkX + auxConfig.parkWidth / 2, auxZ);
  dxf.addText("A-TITLE", pkCX, pkCY + 140, "KRYTÉ STÁNÍ", {
    height: 190,
    hAlign: 1,
    vAlign: 2,
  });
  dxf.addText("A-TITLE", pkCX, pkCY - 140, `${auxConfig.parkWidth}×${auxD} m`, {
    height: 160,
    hAlign: 1,
    vAlign: 2,
  });

  // Common roof overhang (gable draws ridge line along X; mono omits center ridge)
  const isMono = auxConfig.roofType === "mono";
  const auxOverX = 0.35;
  const auxOverZ = isMono ? 0.35 : 0.45;
  dxf.addRect(
    "A-ROOF",
    ...tf.rectToDxf(
      auxX - totalAuxW / 2 - auxOverX,
      auxZ - auxD / 2 - auxOverZ,
      totalAuxW + auxOverX * 2,
      auxD + auxOverZ * 2,
    ),
  );
  if (!isMono) {
    const auxRidgeA = tf.toDxf(auxX - totalAuxW / 2 - auxOverX, auxZ);
    const auxRidgeB = tf.toDxf(auxX + totalAuxW / 2 + auxOverX, auxZ);
    dxf.addLine(
      "A-ROOF",
      auxRidgeA[0],
      auxRidgeA[1],
      auxRidgeB[0],
      auxRidgeB[1],
      {
        linetype: "CENTER",
      },
    );
  }

  if (auxConfig.canopy) {
    const [cw, , cd] = auxConfig.canopy.size;
    const [cx, , cz] = auxConfig.canopy.pos;
    dxf.addRect(
      "A-ROOF",
      ...tf.rectToDxf(auxX + cx - cw / 2, auxZ + cz - cd / 2, cw, cd),
    );
    const [canX, canY] = tf.toDxf(auxX + cx, auxZ + cz);
    dxf.addText("A-TITLE", canX, canY, "KRYTÝ CHODNÍK", {
      height: 140,
      rotation: 90,
      hAlign: 1,
      vAlign: 2,
    });
  }

  if (auxConfig.eastWalkway) {
    const [ew, , ed] = auxConfig.eastWalkway.size;
    const [ex, , ez] = auxConfig.eastWalkway.pos;
    dxf.addRect(
      "A-FLOOR",
      ...tf.rectToDxf(auxX + ex - ew / 2, auxZ + ez - ed / 2, ew, ed),
    );
  }

  // 3b. Podzemní akumulační nádrž na dešťovou vodu (7 m³)
  const tankX = 1.5;
  const tankZ = -7.5;
  const [tDxfX, tDxfY] = tf.toDxf(tankX, tankZ);
  dxf.addCircle("A-SITE-BUILD", tDxfX, tDxfY, 1200);
  dxf.addCircle("A-SITE-BUILD", tDxfX, tDxfY, 350);
  dxf.addText("A-TITLE", tDxfX, tDxfY + 160, "NÁDRŽ DEŠŤOVÉ VODY", {
    height: 150,
    hAlign: 1,
    vAlign: 2,
  });
  dxf.addText("A-TITLE", tDxfX, tDxfY - 160, "7 m³ (WC + ZÁLIVKA)", {
    height: 120,
    hAlign: 1,
    vAlign: 2,
  });

  // 4. Setback dimensions
  const sb = computeSiteSetbacks(
    siteConfig,
    resolvedPos,
    auxConfig,
    designConfig.footprint,
    designConfig,
  );

  drawSiteSetbackLine(
    dxf,
    tf,
    [sb.houseMaxX, resolvedPos.z],
    [hw, resolvedPos.z],
    sb.streetRight,
    "ULICE",
    units,
    false,
  );
  drawSiteSetbackLine(
    dxf,
    tf,
    [sb.auxMaxX, auxZ],
    [hw, auxZ],
    sb.workshopStreetRight,
    "ULICE",
    units,
    false,
  );
  drawSiteSetbackLine(
    dxf,
    tf,
    [-hw, resolvedPos.z],
    [sb.houseMinX, resolvedPos.z],
    sb.neighborWest,
    "ZAHRADA",
    units,
    false,
  );
  drawSiteSetbackLine(
    dxf,
    tf,
    [-hw, auxZ],
    [sb.auxMinX, auxZ],
    sb.workshopNeighborWest,
    "SOUSED",
    units,
    false,
  );
  drawSiteSetbackLine(
    dxf,
    tf,
    [sb.houseMaxX, -hd],
    [sb.houseMaxX, sb.houseMinZ],
    sb.houseTop,
    "ODSTUP S",
    units,
    true,
  );
  drawSiteSetbackLine(
    dxf,
    tf,
    [sb.auxMinX + 1.0, -hd],
    [sb.auxMinX + 1.0, sb.auxMinZ],
    sb.workshopTop,
    "ODSTUP S",
    units,
    true,
  );
  drawSiteSetbackLine(
    dxf,
    tf,
    [resolvedPos.x, sb.houseMaxZ],
    [resolvedPos.x, hd],
    sb.houseFront,
    "ULICE J",
    units,
    true,
  );
  drawSiteSetbackLine(
    dxf,
    tf,
    [resolvedPos.x, sb.auxMaxZ],
    [resolvedPos.x, sb.houseMinZ],
    sb.houseWorkshopGap,
    "MEZERA",
    units,
    true,
  );

  // 5. Site Balance Summary Block (East side of site sheet)
  const metrics = computeBuiltUpArea(siteConfig, auxConfig, designConfig);
  const [bx, by0] = tf.toDxf(hw + roadW + 2.5, -hd);
  const balW = 9200;
  const fmtDim = (v) => String(v).replace(".", ",");
  const balLines = [
    ["BILANCE ZASTAVĚNÍ POZEMKU", `${metrics.plotAreaSqm} m²`],
    [
      `Hlavní rodinný dům (${fmtDim(designConfig.footprint?.width ?? 8)} × ${fmtDim(designConfig.footprint?.length ?? 12)} m)`,
      `${metrics.houseSqm.toFixed(1).replace(".", ",")} m² (${metrics.houseRatioPct.toFixed(1).replace(".", ",")} %)`,
    ],
    [
      `Zahradní dílna (${fmtDim(auxConfig.workshopWidth)} × ${fmtDim(auxD)} m)`,
      `${metrics.workshopSqm.toFixed(1).replace(".", ",")} m² (${metrics.workshopRatioPct.toFixed(1).replace(".", ",")} %)`,
    ],
    [
      `Kryté parkovací stání (${fmtDim(auxConfig.parkWidth)} × ${fmtDim(auxD)} m)`,
      `${metrics.parkingSqm.toFixed(1).replace(".", ",")} m² (${metrics.parkingRatioPct.toFixed(1).replace(".", ",")} %)`,
    ],
    [
      "Zahradní terasa (JZ)",
      `${metrics.terraceSqm.toFixed(1).replace(".", ",")} m² (${metrics.terraceRatioPct.toFixed(1).replace(".", ",")} %)`,
    ],
    [
      "Krytý vstupní chodník",
      `${metrics.canopySqm.toFixed(1).replace(".", ",")} m² (${metrics.canopyRatioPct.toFixed(1).replace(".", ",")} %)`,
    ],
    [
      "Zastavěná plocha celkem (KZP)",
      `${metrics.totalBuiltUpSqm.toFixed(1).replace(".", ",")} m² (${metrics.totalRatioPct.toFixed(1).replace(".", ",")} %)`,
    ],
    [
      "Volná nezastavěná zahrada",
      `${metrics.freeGardenSqm.toFixed(1).replace(".", ",")} m² (${metrics.freeRatioPct.toFixed(1).replace(".", ",")} %)`,
    ],
  ];

  let curY = by0;
  const rowH = 420;
  for (let i = 0; i < balLines.length; i++) {
    const [k, v] = balLines[i];
    dxf.addRect("A-TITLE", bx, curY - rowH, balW, rowH);
    dxf.addText("A-TITLE", bx + 200, curY - 260, k, {
      height: i === 0 ? 180 : 155,
    });
    dxf.addText("A-TITLE", bx + balW - 200, curY - 260, v, {
      height: i === 0 ? 180 : 155,
      hAlign: 2,
    });
    curY -= rowH;
  }

  // 6. Dual North Arrow (Plot UP + True North rotated +26.5° CW -> 63.5° in DXF XY)
  const naX = bx + 2200;
  const naY = curY - 2400;
  dxf.addCircle("A-TITLE", naX, naY, 1300);
  // Plot axis UP
  dxf.addLine("A-TITLE", naX, naY, naX, naY + 1150, { linetype: "DASHED" });
  dxf.addText("A-TITLE", naX, naY + 1500, "OSA PARCELY", {
    height: 145,
    hAlign: 1,
    vAlign: 2,
  });

  // True North (+26.5° CW from UP)
  const northRad =
    ((90 - (siteConfig.parcelRotationDeg ?? 26.5)) * Math.PI) / 180;
  const nLen = 1250;
  const nTipX = naX + nLen * Math.cos(northRad);
  const nTipY = naY + nLen * Math.sin(northRad);
  const perpX = -Math.sin(northRad);
  const perpY = Math.cos(northRad);
  dxf.addLine("A-SITE-DIM", naX, naY, nTipX, nTipY);
  dxf.addPolyline(
    "A-SITE-DIM",
    [
      [nTipX, nTipY],
      [
        nTipX - 320 * Math.cos(northRad) + 140 * perpX,
        nTipY - 320 * Math.sin(northRad) + 140 * perpY,
      ],
      [
        nTipX - 320 * Math.cos(northRad) - 140 * perpX,
        nTipY - 320 * Math.sin(northRad) - 140 * perpY,
      ],
    ],
    { closed: true },
  );
  dxf.addText(
    "A-SITE-DIM",
    nTipX + 220 * Math.cos(northRad),
    nTipY + 220 * Math.sin(northRad),
    "S",
    { height: 220, hAlign: 1, vAlign: 2 },
  );
  dxf.addText(
    "A-SITE-DIM",
    naX + 2600,
    naY,
    `SKUTEČNÝ SEVER (+${String(siteConfig.parcelRotationDeg).replace(".", ",")}°)`,
    { height: 165, hAlign: 0, vAlign: 2 },
  );
}

function addElevationLevelMarkerDxf(dxf, xMm, yMm, elevM, side = "left") {
  const dir = side === "right" ? 1 : -1;
  const triW = 90;
  const triH = 120;
  const leader = 700;

  dxf.addLine("A-DIM", xMm, yMm, xMm + dir * leader, yMm);
  dxf.addPolyline(
    "A-DIM",
    [
      [xMm, yMm],
      [xMm - triW, yMm + triH],
      [xMm + triW, yMm + triH],
    ],
    { closed: true },
  );
  dxf.addLine("A-DIM", xMm, yMm, xMm, yMm + triH);

  const label = formatElevation(elevM);
  const textX = xMm + dir * 160;
  dxf.addText("A-DIM", textX, yMm + 45, label, {
    height: 115,
    hAlign: side === "right" ? 0 : 2,
    vAlign: 1,
  });
}

function drawDxfElevHDimChain(
  dxf,
  uNodesM,
  yLineM,
  yExtStartM,
  toElev,
  units = "mm",
) {
  const sorted = sortUniqueCoords(uNodesM);
  if (sorted.length < 2) return;
  const tick = 80;
  const [, yL] = toElev(0, yLineM);
  const [, yE] = toElev(0, yExtStartM);
  const overshoot = 140 * (Math.sign(yL - yE) || -1);

  const [x0] = toElev(sorted[0], yLineM);
  const [xN] = toElev(sorted[sorted.length - 1], yLineM);
  dxf.addLine("A-DIM", x0, yL, xN, yL);

  for (const um of sorted) {
    const [xp] = toElev(um, yLineM);
    dxf.addLine("A-DIM", xp, yE, xp, yL + overshoot);
    dxf.addLine("A-DIM", xp - tick, yL - tick, xp + tick, yL + tick);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const span = sorted[i + 1] - sorted[i];
    if (span <= 0.01) continue;
    const [mx] = toElev((sorted[i] + sorted[i + 1]) / 2, yLineM);
    dxf.addText("A-DIM", mx, yL - 140, formatLength(span, units), {
      height: span < 0.4 ? 90 : 110,
      hAlign: 1,
      vAlign: 2,
    });
  }
}

function drawDxfElevVDimChain(
  dxf,
  yNodesM,
  uLineM,
  uExtStartM,
  toElev,
  units = "mm",
) {
  const sorted = sortUniqueCoords(yNodesM);
  if (sorted.length < 2) return;
  const tick = 80;
  const [xL] = toElev(uLineM, 0);
  const [xE] = toElev(uExtStartM, 0);
  const overshoot = 140 * (Math.sign(xL - xE) || 1);

  const [, y0] = toElev(uLineM, sorted[0]);
  const [, yN] = toElev(uLineM, sorted[sorted.length - 1]);
  dxf.addLine("A-DIM", xL, y0, xL, yN);

  for (const ym of sorted) {
    const [, yp] = toElev(uLineM, ym);
    dxf.addLine("A-DIM", xE, yp, xL + overshoot, yp);
    dxf.addLine("A-DIM", xL - tick, yp - tick, xL + tick, yp + tick);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const span = sorted[i + 1] - sorted[i];
    if (span <= 0.01) continue;
    const [, my] = toElev(uLineM, (sorted[i] + sorted[i + 1]) / 2);
    dxf.addText("A-DIM", xL + 130, my, formatLength(span, units), {
      height: span < 0.4 ? 90 : 110,
      rotation: 90,
      hAlign: 1,
      vAlign: 2,
    });
  }
}

function renderElevationToDxf(dxf, elevData, side, oxMm, oyMm, options = {}) {
  const view = elevData.views[side];
  if (!view) return;

  const {
    showDimensions = true,
    showInteriorDims = true,
    showOpeningTags = true,
    showHatches = true,
    units = "mm",
  } = options;

  const L = elevData.levels;
  const R = elevData.roof;
  const toElev = (uM, yM) => [oxMm + uM * 1000, oyMm + yM * 1000];
  const rectElev = (uMin, yBottom, uMax, yTop) => [
    oxMm + uMin * 1000,
    oyMm + yBottom * 1000,
    (uMax - uMin) * 1000,
    (yTop - yBottom) * 1000,
  ];

  // Heading
  const [hx, hy] = toElev(view.totalMinU, L.ridgeTopY + 0.9);
  dxf.addText("A-TITLE", hx, hy + 240, view.title, { height: 240 });
  const sub = view.trueDirLabel
    ? `${view.subtitle} | ${view.trueDirLabel}`
    : view.subtitle;
  dxf.addText("A-TITLE", hx, hy, sub, { height: 130 });

  // Dashed floor level references
  if (showInteriorDims) {
    for (const yl of [L.baseSlabY, L.f1FinishY, L.f2StructY, L.wallTopY]) {
      const p1 = toElev(view.wallMinU - 0.15, yl);
      const p2 = toElev(view.wallMaxU + 0.15, yl);
      dxf.addLine("A-ROOF", p1[0], p1[1], p2[0], p2[1], { linetype: "DASHED" });
    }
  }

  // Facade wall silhouette & plinth
  if (view.isGable) {
    dxf.addPolyline(
      "A-WALL-LOAD",
      [
        toElev(view.wallMinU, L.f1FinishY),
        toElev(view.wallMinU, L.wallTopY),
        toElev(0, L.gablePeakY),
        toElev(view.wallMaxU, L.wallTopY),
        toElev(view.wallMaxU, L.f1FinishY),
      ],
      { closed: true },
    );
  } else {
    dxf.addRect(
      "A-WALL-LOAD",
      ...rectElev(view.wallMinU, L.f1FinishY, view.wallMaxU, L.wallTopY),
    );
  }
  dxf.addRect(
    "A-WALL-LOAD",
    ...rectElev(view.wallMinU, L.gradeY, view.wallMaxU, L.f1FinishY),
  );

  // Openings (windows, HS portal, doors)
  for (const op of view.openings) {
    const layer = op.isDoor ? "A-DOOR" : "A-WIND";
    dxf.addRect(layer, ...rectElev(op.uMin, op.yBottom, op.uMax, op.yTop));

    const inset = 0.05;
    if (op.uMax - op.uMin > 0.2 && op.yTop - op.yBottom > 0.2) {
      dxf.addRect(
        layer,
        ...rectElev(
          op.uMin + inset,
          op.yBottom + inset,
          op.uMax - inset,
          op.yTop - inset,
        ),
      );
    }

    if (op.isDoor) {
      if (showOpeningTags && op.hingeSide) {
        const hxM = op.hingeSide === "left" ? op.uMin + inset : op.uMax - inset;
        const lxM = op.hingeSide === "left" ? op.uMax - inset : op.uMin + inset;
        const yMid = (op.yBottom + op.yTop) / 2;
        dxf.addPolyline(
          "A-DOOR-SWING",
          [
            toElev(hxM, op.yTop - inset),
            toElev(lxM, yMid),
            toElev(hxM, op.yBottom + inset),
          ],
          { linetype: "DASHED" },
        );
      }
    } else if (op.isSliding) {
      const m1 = toElev(op.uCenter, op.yBottom);
      const m2 = toElev(op.uCenter, op.yTop);
      dxf.addLine("A-WIND", m1[0], m1[1], m2[0], m2[1]);
    } else {
      if (op.width >= 1.4) {
        const m1 = toElev(op.uCenter, op.yBottom);
        const m2 = toElev(op.uCenter, op.yTop);
        dxf.addLine("A-WIND", m1[0], m1[1], m2[0], m2[1]);
      }
      if (op.hasParapetSill) {
        dxf.addRect(
          "A-WIND",
          ...rectElev(
            op.uMin - 0.04,
            op.yBottom - 0.05,
            op.uMax + 0.04,
            op.yBottom,
          ),
        );
      }
      if (showOpeningTags) {
        const yMid = (op.yBottom + op.yTop) / 2;
        dxf.addPolyline(
          "A-DOOR-SWING",
          [
            toElev(op.uMin + inset, op.yBottom + inset),
            toElev(op.uCenter, op.yTop - inset),
            toElev(op.uMax - inset, op.yBottom + inset),
          ],
          { linetype: "DASHED" },
        );
        dxf.addPolyline(
          "A-DOOR-SWING",
          [
            toElev(op.uMin + inset, op.yTop - inset),
            toElev(op.uMax - inset, yMid),
            toElev(op.uMin + inset, op.yBottom + inset),
          ],
          { linetype: "DASHED" },
        );
      }
    }

    if (showOpeningTags && op.mark) {
      const [tx, ty] = toElev(op.uCenter, (op.yBottom + op.yTop) / 2);
      dxf.addText("A-ANNO-OPEN", tx, ty, op.mark, {
        height: 115,
        hAlign: 1,
        vAlign: 2,
      });
    }
  }

  // Roof + Gutters + Downspouts
  if (view.isGable) {
    const hs = R.outerHalfSpan;
    dxf.addPolyline(
      "A-ELEV-ROOF",
      [
        toElev(-hs, L.eaveBottomY),
        toElev(0, L.gablePeakY),
        toElev(hs, L.eaveBottomY),
        toElev(hs, L.eaveTopY),
        toElev(0, L.ridgeTopY),
        toElev(-hs, L.eaveTopY),
      ],
      { closed: true },
    );
    for (const sign of [-1, 1]) {
      const pWall = toElev(sign * R.halfSpan, L.wallTopY);
      const pTip = toElev(sign * hs, L.eaveBottomY);
      const pCorner = toElev(sign * R.halfSpan, L.eaveBottomY);
      dxf.addPolyline("A-ELEV-ROOF", [pWall, pTip, pCorner], { closed: true });
      const pipeU = sign < 0 ? -R.halfSpan - 0.08 : R.halfSpan;
      dxf.addRect(
        "A-ELEV-ROOF",
        ...rectElev(pipeU, L.gradeY, pipeU + 0.08, L.wallTopY),
      );
    }
  } else {
    dxf.addRect(
      "A-ELEV-ROOF",
      ...rectElev(view.roofMinU, L.eaveTopY, view.roofMaxU, L.ridgeTopY),
    );
    dxf.addRect(
      "A-ELEV-ROOF",
      ...rectElev(view.roofMinU, L.eaveBottomY, view.roofMaxU, L.eaveTopY),
    );
    if (showHatches) {
      for (
        let yTile = L.eaveTopY + 0.3;
        yTile < L.ridgeTopY - 0.15;
        yTile += 0.32
      ) {
        const p1 = toElev(view.roofMinU, yTile);
        const p2 = toElev(view.roofMaxU, yTile);
        dxf.addLine("A-WALL-HATCH", p1[0], p1[1], p2[0], p2[1]);
      }
    }
    for (const du of view.downspoutsU) {
      dxf.addRect(
        "A-ELEV-ROOF",
        ...rectElev(du - 0.04, L.gradeY, du + 0.04, L.eaveBottomY),
      );
    }
  }

  // Chimney
  if (view.chimney) {
    const c = view.chimney;
    dxf.addRect(
      "A-ELEV-ROOF",
      ...rectElev(c.uMin, c.yRoofBase, c.uMax, c.yTop - c.capHeight),
    );
    dxf.addRect(
      "A-ELEV-ROOF",
      ...rectElev(
        c.uMin - c.capOverhang,
        c.yTop - c.capHeight,
        c.uMax + c.capOverhang,
        c.yTop,
      ),
    );
  }

  // Terrace, Pergola & Entrance Canopy
  if (view.terrace) {
    const t = view.terrace;
    dxf.addRect("A-SITE-BUILD", ...rectElev(t.uMin, t.yBottom, t.uMax, t.yTop));
  }
  if (view.pergola) {
    const p = view.pergola;
    for (const pu of p.postUs) {
      dxf.addRect(
        "A-SITE-BUILD",
        ...rectElev(
          pu - p.postSize / 2,
          p.postBottomY,
          pu + p.postSize / 2,
          p.postTopY,
        ),
      );
    }
    dxf.addRect(
      "A-SITE-BUILD",
      ...rectElev(p.uMin, p.postTopY, p.uMax, p.beamTopY),
    );
    dxf.addRect(
      "A-SITE-BUILD",
      ...rectElev(p.uMin, p.beamTopY, p.uMax, p.roofTopY),
    );
  }
  if (view.canopy) {
    const cn = view.canopy;
    dxf.addRect(
      "A-SITE-BUILD",
      ...rectElev(cn.uMin, cn.yBottom, cn.uMax, cn.yTop),
    );
  }

  // Terrain ground line & earth hatch
  const gLeftM = view.totalMinU - 0.9;
  const gRightM = view.totalMaxU + 0.9;
  const g1 = toElev(gLeftM, L.gradeY);
  const g2 = toElev(gRightM, L.gradeY);
  dxf.addLine("A-ELEV-TERRAIN", g1[0], g1[1], g2[0], g2[1]);
  if (showHatches) {
    for (let u = gLeftM + 0.15; u < gRightM; u += 0.3) {
      const h1 = toElev(u, L.gradeY);
      const h2 = toElev(u - 0.16, L.gradeY - 0.16);
      dxf.addLine("A-ELEV-TERRAIN", h1[0], h1[1], h2[0], h2[1]);
    }
  }

  // Dimensions, ČSN Elevation Markers & Roof Pitch
  if (showDimensions) {
    const markerU = view.totalMinU - 0.55;
    const [gmx, gmy] = toElev(view.totalMinU - 0.85, L.gradeY);
    addElevationLevelMarkerDxf(dxf, gmx, gmy, L.gradeY, "left");
    for (const yl of [
      L.f1FinishY,
      L.f2StructY,
      view.isGable ? L.wallTopY : L.eaveBottomY,
    ]) {
      const [mx, my] = toElev(markerU, yl);
      addElevationLevelMarkerDxf(dxf, mx, my, yl, "left");
    }
    const [rx, ry] = toElev(0, L.ridgeTopY);
    addElevationLevelMarkerDxf(dxf, rx, ry, L.ridgeTopY, "right");
    if (view.chimney) {
      const align = view.chimney.uCenter > 0 ? "right" : "left";
      const [cx, cy] = toElev(
        align === "right" ? view.chimney.uMax : view.chimney.uMin,
        view.chimney.yTop,
      );
      addElevationLevelMarkerDxf(dxf, cx, cy, view.chimney.yTop, align);
    }

    const dimBaseU = view.totalMaxU;
    drawDxfElevVDimChain(
      dxf,
      [L.gradeY, L.f1FinishY, L.f2StructY, L.wallTopY, L.ridgeTopY],
      dimBaseU + 0.55,
      dimBaseU + 0.05,
      toElev,
      units,
    );
    drawDxfElevVDimChain(
      dxf,
      [L.gradeY, L.ridgeTopY],
      dimBaseU + 1.08,
      dimBaseU + 0.05,
      toElev,
      units,
    );

    const hNodes = [
      view.totalMinU,
      view.wallMinU,
      view.wallMaxU,
      view.totalMaxU,
      ...(view.roofMinU < view.wallMinU ? [view.roofMinU] : []),
      ...(view.roofMaxU > view.wallMaxU ? [view.roofMaxU] : []),
    ];
    drawDxfElevHDimChain(dxf, hNodes, L.gradeY - 0.52, L.gradeY, toElev, units);
    drawDxfElevHDimChain(
      dxf,
      [view.totalMinU, view.totalMaxU],
      L.gradeY - 0.96,
      L.gradeY,
      toElev,
      units,
    );

    if (view.isGable) {
      const slopeSign = view.chimney && view.chimney.uCenter >= 0 ? -1 : 1;
      const [px, py] = toElev(
        slopeSign * R.halfSpan * 0.52,
        L.wallTopY + R.height * 0.48 + 0.58,
      );
      dxf.addText(
        "A-DIM",
        px,
        py,
        `${R.pitchDeg.toFixed(1).replace(".", ",")}°`,
        {
          height: 120,
          hAlign: 1,
          vAlign: 2,
        },
      );
    }
  }
}

function renderAllElevationsToDxf(
  dxf,
  designConfig,
  baseOxMm,
  baseOyMm,
  options,
  openingSchedule,
) {
  const elevData = extractElevationData(designConfig, { openingSchedule });
  renderElevationToDxf(dxf, elevData, "east", baseOxMm, baseOyMm, options);
  renderElevationToDxf(
    dxf,
    elevData,
    "south",
    baseOxMm + 19500,
    baseOyMm,
    options,
  );
  renderElevationToDxf(
    dxf,
    elevData,
    "west",
    baseOxMm,
    baseOyMm - 14500,
    options,
  );
  renderElevationToDxf(
    dxf,
    elevData,
    "north",
    baseOxMm + 19500,
    baseOyMm - 14500,
    options,
  );
}

function renderSectionToDxf(
  dxf,
  secData,
  sectionKey,
  oxMm,
  oyMm,
  options = {},
) {
  const sec = secData.sections[sectionKey];
  if (!sec) return;

  const {
    showDimensions = true,
    showInteriorDims = true,
    showOpeningTags = true,
    showHatches = true,
    units = "mm",
  } = options;

  const L = secData.levels;
  const R = secData.roof;
  const toSec = (uM, yM) => [oxMm + uM * 1000, oyMm + yM * 1000];
  const rectSec = (uMin, yBottom, uMax, yTop) => [
    oxMm + uMin * 1000,
    oyMm + yBottom * 1000,
    (uMax - uMin) * 1000,
    (yTop - yBottom) * 1000,
  ];

  // Heading
  const [hx, hy] = toSec(sec.totalMinU, L.ridgeTopY + 0.9);
  dxf.addText("A-TITLE", hx, hy + 240, sec.title, { height: 240 });
  dxf.addText("A-TITLE", hx, hy, sec.subtitle, { height: 130 });

  // 1. Foundations, base slab & 1.NP floor buildup
  dxf.addRect(
    "A-SEC-STRUCT",
    ...rectSec(
      sec.innerMinU,
      L.gravelBottomY,
      sec.innerMaxU,
      L.baseSlabBottomY,
    ),
  );
  for (const f of sec.footings) {
    dxf.addRect(
      "A-SEC-STRUCT",
      ...rectSec(f.footingMinU, L.footingBottomY, f.footingMaxU, L.zbBottomY),
    );
    dxf.addRect(
      "A-SEC-STRUCT",
      ...rectSec(f.stemMinU, L.zbBottomY, f.stemMaxU, L.baseSlabBottomY),
    );
    if (f.xpsMinU !== null && f.xpsMaxU !== null) {
      dxf.addRect(
        "A-SEC-INSUL",
        ...rectSec(f.xpsMinU, L.zbBottomY, f.xpsMaxU, L.f1FinishY),
      );
    }
  }
  const slabStartU = sec.wallMinU + secData.materialsInfo.eticsThick;
  const slabEndU = sec.wallMaxU - secData.materialsInfo.eticsThick;
  dxf.addRect(
    "A-SEC-STRUCT",
    ...rectSec(slabStartU, L.baseSlabBottomY, slabEndU, L.baseSlabY),
  );

  const f1EpsTopY = Number((L.f1FinishY - 0.065).toFixed(4));
  dxf.addRect(
    "A-SEC-INSUL",
    ...rectSec(sec.innerMinU, L.baseSlabY, sec.innerMaxU, f1EpsTopY),
  );
  dxf.addRect(
    "A-SEC-STRUCT",
    ...rectSec(sec.innerMinU, f1EpsTopY, sec.innerMaxU, L.f1FinishY),
  );

  // 2. Ceiling slab & 2.NP floor buildup
  for (const [sMin, sMax] of sec.slabSegments) {
    dxf.addRect(
      "A-SEC-STRUCT",
      ...rectSec(sMin, L.c1BottomY, sMax, L.f2StructY),
    );
    if (showHatches) {
      const [x1, y1] = toSec(sMin, L.c1BottomY);
      const [x2, y2] = toSec(sMax, L.f2StructY);
      dxf.addLine("A-WALL-HATCH", x1, y1, x2, y2);
    }
  }
  if (L.c1BottomY - L.f1CeilingY > 0.02) {
    for (const [fMin, fMax] of sec.floor2FinishSegs) {
      dxf.addRect(
        "A-SEC-STRUCT",
        ...rectSec(fMin, L.f1CeilingY, fMax, L.c1BottomY),
      );
    }
  }
  const f2EpsTop = Number((L.f2FinishY - 0.065).toFixed(4));
  for (const [fMin, fMax] of sec.floor2FinishSegs) {
    dxf.addRect("A-SEC-INSUL", ...rectSec(fMin, L.f2StructY, fMax, f2EpsTop));
    dxf.addRect("A-SEC-STRUCT", ...rectSec(fMin, f2EpsTop, fMax, L.f2FinishY));
  }

  // 3. Cut walls & sliced openings
  for (const floorKey of ["1np", "2np"]) {
    for (const w of sec.cutWalls[floorKey]) {
      const layer =
        w.kind === "exterior" || w.kind === "structural"
          ? "A-WALL-LOAD"
          : "A-WALL-PART";
      const op = w.cutOpening;

      const addWallRect = (yB, yT) => {
        if (yT - yB <= 0.01) return;
        dxf.addRect(layer, ...rectSec(w.coreMinU, yB, w.coreMaxU, yT));
        if (showHatches) {
          addPolygonHatch(
            dxf,
            "A-WALL-HATCH",
            [
              toSec(w.coreMinU, yB),
              toSec(w.coreMaxU, yB),
              toSec(w.coreMaxU, yT),
              toSec(w.coreMinU, yT),
            ],
            1,
            150,
          );
        }
        if (w.insulMinU !== null && w.insulMaxU !== null) {
          dxf.addRect(
            "A-SEC-INSUL",
            ...rectSec(w.insulMinU, yB, w.insulMaxU, yT),
          );
        }
      };

      if (!op) {
        addWallRect(w.yBottom, w.yTop);
      } else {
        addWallRect(w.yBottom, op.yBottom);
        addWallRect(op.yTop, w.yTop);
        const opLayer = op.isDoor ? "A-DOOR" : "A-WIND";
        dxf.addRect(opLayer, ...rectSec(w.uMin, op.yBottom, w.uMax, op.yTop));
        const m1 = toSec(w.uCenter, op.yBottom);
        const m2 = toSec(w.uCenter, op.yTop);
        dxf.addLine(opLayer, m1[0], m1[1], m2[0], m2[1]);
        if (showOpeningTags && op.mark) {
          const [tx, ty] = toSec(w.uCenter, (op.yBottom + op.yTop) / 2);
          dxf.addText("A-ANNO-OPEN", tx, ty, op.mark, {
            height: 110,
            hAlign: 1,
            vAlign: 2,
          });
        }
      }
    }
  }

  // 4. Staircase (A-A')
  if (sec.stairs) {
    const st = sec.stairs;
    for (const s of st.flight1Steps) {
      dxf.addRect("A-STAIR", ...rectSec(s.uMin, s.yBot, s.uMax, s.yTop));
    }
    const f2End = st.flight2Steps[st.flight2Steps.length - 1];
    const stairPoly = [
      toSec(st.xEnd, st.yLanding),
      toSec(st.xLanding, st.yLanding),
      ...st.flight2Steps.flatMap((s) => [
        toSec(s.uMin, s.yTop),
        toSec(s.uMax, s.yTop),
      ]),
      toSec(f2End.uMax, st.yTop),
      toSec(f2End.uMax, L.f2StructY),
      toSec(st.flight2Steps[0].uMin, st.yLanding - st.landingThickness),
      toSec(st.xEnd, st.yLanding - st.landingThickness),
    ];
    dxf.addPolyline("A-STAIR", stairPoly, { closed: true });
    const h1 = toSec(st.xLanding, st.yLanding + 0.95);
    const h2 = toSec(st.xStart, st.yTop + 0.95);
    dxf.addLine("A-STAIR", h1[0], h1[1], h2[0], h2[1]);
  }

  // 5. Vertical shaft (B-B')
  if (sec.hasShaftCut && sec.shaftSpan) {
    const [shMin, shMax] = sec.shaftSpan;
    dxf.addRect(
      "A-SEC-STRUCT",
      ...rectSec(shMin, L.f1FinishY, shMax, L.c2TopY + 0.35),
    );
  }

  // 6. Roof structure & 350 mm attic insulation
  for (const [segMin, segMax] of sec.c2InsulSegs) {
    dxf.addRect(
      "A-SEC-INSUL",
      ...rectSec(segMin, L.c2BottomY, segMax, L.c2TopY),
    );
    if (L.c2BottomY - L.f2CeilingY > 0.02) {
      dxf.addRect(
        "A-SEC-STRUCT",
        ...rectSec(segMin, L.f2CeilingY, segMax, L.c2BottomY),
      );
    }
  }
  if (sec.isTransverse) {
    const hs = R.outerHalfSpan;
    dxf.addPolyline(
      "A-ELEV-ROOF",
      [
        toSec(-hs, L.eaveBottomY),
        toSec(0, L.gablePeakY),
        toSec(hs, L.eaveBottomY),
        toSec(hs, L.eaveTopY),
        toSec(0, L.ridgeTopY),
        toSec(-hs, L.eaveTopY),
      ],
      { closed: true },
    );
    if (R.isTruss) {
      const yBotMid = L.c2BottomY + 0.13;
      const webNodes = [
        [-R.halfSpan + 0.25, yBotMid],
        [-R.halfSpan * 0.5, L.c2BottomY + R.height * 0.5 - 0.07],
        [-R.halfSpan * 0.33, yBotMid],
        [0, L.gablePeakY - 0.1],
        [R.halfSpan * 0.33, yBotMid],
        [R.halfSpan * 0.5, L.c2BottomY + R.height * 0.5 - 0.07],
        [R.halfSpan - 0.25, yBotMid],
      ].map(([u, y]) => toSec(u, y));
      dxf.addPolyline("A-ELEV-ROOF", webNodes);
      dxf.addRect(
        "A-ELEV-ROOF",
        ...rectSec(
          -R.halfSpan + 0.05,
          L.c2BottomY + 0.06,
          R.halfSpan - 0.05,
          L.c2BottomY + 0.2,
        ),
      );
    }
  } else {
    const yRoofCutBot =
      R.y + R.height * Math.max(0, 1 - Math.abs(sec.cutCoord) / R.halfSpan);
    const yRoofCutTop = yRoofCutBot + R.dyThick;
    dxf.addRect(
      "A-ELEV-ROOF",
      ...rectSec(sec.roofMinU, yRoofCutTop, sec.roofMaxU, L.ridgeTopY),
    );
    dxf.addRect(
      "A-ELEV-ROOF",
      ...rectSec(sec.roofMinU, yRoofCutBot, sec.roofMaxU, yRoofCutTop),
    );
  }

  // 7. Canopy & Terrain
  if (sec.canopy) {
    dxf.addRect(
      "A-SITE-BUILD",
      ...rectSec(
        sec.canopy.uMin,
        sec.canopy.yBottom,
        sec.canopy.uMax,
        sec.canopy.yTop,
      ),
    );
  }
  const gLeft = toSec(sec.totalMinU - 0.8, L.gradeY);
  const gWallL = toSec(sec.wallMinU, L.gradeY);
  const gWallR = toSec(sec.wallMaxU, L.gradeY);
  const gRight = toSec(sec.totalMaxU + 0.8, L.gradeY);
  dxf.addLine("A-ELEV-TERRAIN", gLeft[0], gLeft[1], gWallL[0], gWallL[1]);
  dxf.addLine("A-ELEV-TERRAIN", gWallR[0], gWallR[1], gRight[0], gRight[1]);

  // 8. Room names
  for (const fKey of ["1np", "2np"]) {
    const yMid =
      fKey === "1np"
        ? (L.f1FinishY + L.f1CeilingY) / 2
        : (L.f2FinishY + L.f2CeilingY) / 2;
    for (const r of sec.slicedRooms[fKey]) {
      const [rx, ry] = toSec(r.uCenter, yMid);
      dxf.addText("A-ANNO-ROOM", rx, ry + 70, r.id, {
        height: 95,
        hAlign: 1,
        vAlign: 2,
      });
      dxf.addText("A-ANNO-ROOM", rx, ry - 70, r.name.split("(")[0].trim(), {
        height: 95,
        hAlign: 1,
        vAlign: 2,
      });
    }
  }

  // 9. Dimensions & Elevation markers
  if (showInteriorDims) {
    const refRoom1 = sec.slicedRooms["1np"][sec.slicedRooms["1np"].length - 1];
    const refRoom2 = sec.slicedRooms["2np"][sec.slicedRooms["2np"].length - 1];
    drawDxfElevVDimChain(
      dxf,
      [L.f1FinishY, L.f1CeilingY],
      refRoom1 ? refRoom1.uCenter + 0.42 : 2.5,
      refRoom1 ? refRoom1.uCenter + 0.42 : 2.5,
      toSec,
      units,
    );
    drawDxfElevVDimChain(
      dxf,
      [L.f2FinishY, L.f2CeilingY],
      refRoom2 ? refRoom2.uCenter + 0.42 : 2.5,
      refRoom2 ? refRoom2.uCenter + 0.42 : 2.5,
      toSec,
      units,
    );
  }

  if (showDimensions) {
    const markerU = sec.totalMinU - 0.5;
    for (const yl of [L.footingBottomY, L.f2StructY, L.c2BottomY]) {
      const [mx, my] = toSec(markerU, yl);
      addElevationLevelMarkerDxf(dxf, mx, my, yl, "left");
    }
    const [gmx, gmy] = toSec(sec.totalMinU - 0.72, L.gradeY);
    addElevationLevelMarkerDxf(dxf, gmx, gmy, L.gradeY, "left");
    const [rx, ry] = toSec(0, L.ridgeTopY);
    addElevationLevelMarkerDxf(dxf, rx, ry, L.ridgeTopY, "right");

    const dimBaseU = sec.totalMaxU;
    drawDxfElevVDimChain(
      dxf,
      [
        L.footingBottomY,
        L.gradeY,
        L.f1FinishY,
        L.f2StructY,
        L.c2BottomY,
        L.ridgeTopY,
      ],
      dimBaseU + 0.52,
      dimBaseU + 0.05,
      toSec,
      units,
    );
    drawDxfElevVDimChain(
      dxf,
      [L.footingBottomY, L.gradeY, L.ridgeTopY],
      dimBaseU + 1.05,
      dimBaseU + 0.05,
      toSec,
      units,
    );

    const wallAxisNodes = [
      sec.wallMinU,
      ...sec.cutWalls["1np"]
        .filter((w) => w.kind === "structural")
        .map((w) => w.uCenter),
      sec.wallMaxU,
    ];
    drawDxfElevHDimChain(
      dxf,
      wallAxisNodes,
      L.footingBottomY - 0.5,
      L.footingBottomY,
      toSec,
      units,
    );
    drawDxfElevHDimChain(
      dxf,
      [sec.wallMinU, sec.wallMaxU],
      L.footingBottomY - 0.94,
      L.footingBottomY,
      toSec,
      units,
    );
  }
}

function renderAllSectionsToDxf(
  dxf,
  designConfig,
  baseOxMm,
  baseOyMm,
  options,
  openingSchedule,
) {
  const secData = extractSectionData(designConfig, { openingSchedule });
  renderSectionToDxf(dxf, secData, "AA", baseOxMm, baseOyMm, options);
  renderSectionToDxf(dxf, secData, "BB", baseOxMm + 16500, baseOyMm, options);
}

/**
 * Generates an AutoCAD R12 (AC1009) ASCII DXF string in 1:1 millimeter scale
 * organized into standard architectural CAD layers.
 *
 * @param {Object} designConfig
 * @param {Object} [options]
 * @param {'1np'|'2np'|'both'|'elevations'|'sections'|'site'|'complete'} [options.sheet='1np']
 * @returns {string}
 */
export function generateFloorPlanDxf(designConfig, options = {}) {
  const {
    sheet = "1np",
    showDimensions = true,
    showInteriorDims = true,
    showFurniture = true,
    showOpeningTags = true,
    showHatches = true,
    units = "mm",
    siteConfig = null,
    auxConfig = null,
    housePos = null,
  } = options;

  const dxf = new DxfWriter();
  const openingSchedule = buildOpeningSchedule(designConfig, {
    siteConfig,
    housePos,
  });
  const baseOpts = {
    showDimensions,
    showInteriorDims,
    showFurniture,
    showOpeningTags,
    showHatches,
    units,
  };

  if (sheet === "site") {
    renderSitePlanToDxf(
      dxf,
      designConfig,
      siteConfig,
      auxConfig,
      housePos,
      0,
      0,
      baseOpts,
    );
  } else if (sheet === "elevations") {
    renderAllElevationsToDxf(
      dxf,
      designConfig,
      0,
      0,
      baseOpts,
      openingSchedule,
    );
  } else if (sheet === "sections") {
    renderAllSectionsToDxf(dxf, designConfig, 0, 0, baseOpts, openingSchedule);
  } else if (sheet === "complete") {
    renderFloorPlanToDxf(
      dxf,
      designConfig,
      "1np",
      0,
      0,
      { ...baseOpts, includeScheduleTable: true },
      openingSchedule,
    );
    renderFloorPlanToDxf(
      dxf,
      designConfig,
      "2np",
      18000,
      0,
      { ...baseOpts, includeScheduleTable: true },
      openingSchedule,
    );
    renderAllElevationsToDxf(
      dxf,
      designConfig,
      0,
      -23000,
      baseOpts,
      openingSchedule,
    );
    renderAllSectionsToDxf(
      dxf,
      designConfig,
      0,
      -52000,
      baseOpts,
      openingSchedule,
    );
    renderSitePlanToDxf(
      dxf,
      designConfig,
      siteConfig,
      auxConfig,
      housePos,
      48000,
      0,
      baseOpts,
    );
  } else if (sheet === "both") {
    renderFloorPlanToDxf(
      dxf,
      designConfig,
      "1np",
      0,
      0,
      { ...baseOpts, includeScheduleTable: true },
      openingSchedule,
    );
    renderFloorPlanToDxf(
      dxf,
      designConfig,
      "2np",
      18000,
      0,
      { ...baseOpts, includeScheduleTable: true },
      openingSchedule,
    );
  } else if (sheet === "2np") {
    renderFloorPlanToDxf(
      dxf,
      designConfig,
      "2np",
      0,
      0,
      { ...baseOpts, includeScheduleTable: true },
      openingSchedule,
    );
  } else {
    renderFloorPlanToDxf(
      dxf,
      designConfig,
      "1np",
      0,
      0,
      { ...baseOpts, includeScheduleTable: true },
      openingSchedule,
    );
  }

  return dxf.toString();
}

/**
 * Triggers a browser download of a 2D CAD DXF file.
 */
export function downloadFloorPlanDxf(
  designConfig,
  options = {},
  filename = null,
) {
  const dxfContent = generateFloorPlanDxf(designConfig, options);
  const sheet = options.sheet || "1np";
  const fileSlug =
    sheet === "elevations" ? "pohledy" : sheet === "sections" ? "rezy" : sheet;
  const dateStr = new Date().toISOString().slice(0, 10);
  const blob = new Blob([dxfContent], {
    type: "application/dxf;charset=us-ascii",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `vojackovi-troubelice-${fileSlug}-${dateStr}.dxf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

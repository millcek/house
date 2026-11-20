import { computeFloorBounds, computeRoomSchedule, getWallBox } from '../builders/RoomBuilder.js';

export const DEFAULT_STANDARDS = {
  wallTouchEps: 0.015,
  furnTouchEps: 0.015,
  furnErrorOverlap: 0.03,
  swingEps: 0.015,
  wallSwingEps: 0.03,
  doorPassageDepth: 0.60,
  doorPassageMinWidth: 0.65,
  doorMouthDepth: 0.30,
  doorLeafClearance: 0.08,
  doorJambMin: 0.08,
  portalAccessDepth: 0.80,
  portalMinClearSpan: 0.85,
  portalWarnClearance: 0.60,
  kitchenAisleMin: 1.05,
  kitchenAisleErr: 0.90,
  kitchenTallIslandMin: 0.90,
  kitchenTallIslandErr: 0.70,
  islandDiningMin: 0.90,
  islandDiningErr: 0.80,
  diningSeatMin: 0.85,
  diningSeatErr: 0.65,
  wcFrontMin: 0.65,
  wcFrontErr: 0.55,
  wcSideMin: 0.18,
  wcSideErr: 0.12,
  vanityFrontMin: 0.75,
  vanityFrontErr: 0.60,
  showerEntryMin: 0.65,
  showerEntryErr: 0.55,
  bathtubAccessMin: 0.65,
  bathtubAccessErr: 0.55,
  sanitaryWallMaxGap: 0.12,
  doubleBedSideMin: 0.60,
  doubleBedSideErr: 0.35,
  singleBedSideMin: 0.65,
  singleBedSideErr: 0.50,
  wardrobeFrontMin: 0.65,
  wardrobeFrontErr: 0.45,
  deskChairMin: 0.80,
  deskChairErr: 0.60,
  sofaCoffeeMin: 0.30,
  fireplaceSafetyWarn: 0.80,
  fireplaceSafetyErr: 0.40,
  techServiceMin: 0.70,
  roomReachableMinWidth: 0.50,
  corridorMinWidth: 0.80,
  gridCellSize: 0.04,
};

const DIR_VECTORS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

const SEVERITY_RANK = {
  error: 0,
  warning: 1,
  info: 2,
};

const COMBUSTIBLE_TYPES = new Set(['lSofa', 'bed', 'wardrobe', 'desk']);
const SANITARY_TYPES = new Set(['wc', 'vanity', 'shower', 'bathtub']);

function roundM(val) {
  return Number(val.toFixed(4));
}

function fmtCm(meters) {
  return `${Math.round(meters * 100)} cm`;
}

function belowLimit(measuredM, limitM) {
  return Math.round(measuredM * 100) < Math.round(limitM * 100);
}

function resolveOpeningCenter(op) {
  if (typeof op.at === 'number') return op.at;
  if (typeof op.offset === 'number') return op.offset;
  return 0;
}

function boxFromPoints(pts) {
  const xs = pts.map(([x]) => x);
  const zs = pts.map(([, z]) => z);
  return {
    minX: roundM(Math.min(...xs)),
    maxX: roundM(Math.max(...xs)),
    minZ: roundM(Math.min(...zs)),
    maxZ: roundM(Math.max(...zs)),
  };
}

function boxCenter(box) {
  return [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
}

function getOverlap(a, b) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (ox <= 0 || oz <= 0) return null;
  return {
    ox,
    oz,
    minOverlap: Math.min(ox, oz),
    box: {
      minX: roundM(Math.max(a.minX, b.minX)),
      maxX: roundM(Math.min(a.maxX, b.maxX)),
      minZ: roundM(Math.max(a.minZ, b.minZ)),
      maxZ: roundM(Math.min(a.maxZ, b.maxZ)),
    },
  };
}

function getBoxDistance(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dz);
}

function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function pointInBox(px, pz, box, eps = 0) {
  return (
    px >= box.minX - eps &&
    px <= box.maxX + eps &&
    pz >= box.minZ - eps &&
    pz <= box.maxZ + eps
  );
}

function uniqueSortedCoords(values, tol = 1e-4) {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const out = [];
  for (const val of sorted) {
    if (out.length === 0 || val - out[out.length - 1] > tol) {
      out.push(Number(val.toFixed(4)));
    }
  }
  return out;
}

/**
 * Extracts wall geometries, solid wall bounding boxes (excluding openings),
 * and normalized opening descriptors for a floor configuration.
 */
export function extractWallSegments(floorConfig = {}) {
  const wallGeoms = [];
  const solidBoxes = [];
  const mountingWallBoxes = [];
  const openings = [];

  for (const wallDef of floorConfig.walls || []) {
    const [x1, z1] = wallDef.from;
    const [x2, z2] = wallDef.to;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length <= 0.001) continue;

    const ux = dx / length;
    const uz = dz / length;
    const nx = -uz;
    const nz = ux;
    const thickness = wallDef.thickness ?? 0.16;
    const halfT = thickness / 2;
    const isHorizontal = Math.abs(dx) >= Math.abs(dz);
    const isExterior = (wallDef.material || 'wall') === 'wall';

    const ptAt = (u, nOffset = 0) => [
      x1 + ux * u + nx * nOffset,
      z1 + uz * u + nz * nOffset,
    ];

    const wallOpenings = [...(wallDef.openings || [])]
      .map((op, idx) => {
        const center = resolveOpeningCenter(op);
        const rawStart = center - op.width / 2;
        const rawEnd = center + op.width / 2;
        const start = Math.max(0, rawStart);
        const end = Math.min(length, rawEnd);
        const isDoor = Boolean(op.swing || op.type === 'door');
        const isWindow = op.type === 'window';
        const isPortal = isWindow && (Boolean(op.sliding) || (op.sill ?? 1) <= 0.30);
        const openingBox = boxFromPoints([
          ptAt(start, -halfT),
          ptAt(end, -halfT),
          ptAt(end, halfT),
          ptAt(start, halfT),
        ]);

        return {
          ...op,
          id: `${wallDef.id || 'wall'}-op-${idx}`,
          wallId: wallDef.id || `wall-${wallGeoms.length}`,
          wallName: wallDef.name || wallDef.id || 'Stěna',
          wallMaterial: wallDef.material || 'wall',
          wallLength: length,
          halfT,
          ux,
          uz,
          nx,
          nz,
          isHorizontal,
          center,
          rawStart,
          rawEnd,
          start,
          end,
          pStart: ptAt(start, 0),
          pEnd: ptAt(end, 0),
          centerPt: ptAt((start + end) / 2, 0),
          openingBox,
          isDoor,
          isWindow,
          isPortal,
          ptAt,
        };
      })
      .sort((a, b) => a.start - b.start);

    const buildSegments = (skipOpeningFn) => {
      const segs = [];
      let cursor = 0;
      for (const op of wallOpenings) {
        if (!skipOpeningFn(op)) continue;
        if (op.start > cursor + 0.005) {
          segs.push([cursor, op.start]);
        }
        cursor = Math.max(cursor, op.end);
      }
      if (cursor < length - 0.005) {
        segs.push([cursor, length]);
      }
      return segs.map(([uStart, uEnd]) => {
        const box = boxFromPoints([
          ptAt(uStart, -halfT),
          ptAt(uEnd, -halfT),
          ptAt(uEnd, halfT),
          ptAt(uStart, halfT),
        ]);
        return {
          ...box,
          uStart,
          uEnd,
          wallId: wallDef.id || `wall-${wallGeoms.length}`,
          wallName: wallDef.name || wallDef.id || 'Stěna',
          isExterior,
          structural: Boolean(wallDef.structural),
          isHorizontal,
          thickness,
        };
      });
    };

    const wallSolidBoxes = buildSegments(() => true);
    const wallMountBoxes = buildSegments((op) => !op.isWindow || (op.sill ?? 1) < 0.70);

    solidBoxes.push(...wallSolidBoxes);
    mountingWallBoxes.push(...wallMountBoxes);
    openings.push(...wallOpenings);
    wallGeoms.push({
      wallDef,
      wallId: wallDef.id || `wall-${wallGeoms.length}`,
      wallName: wallDef.name || wallDef.id || 'Stěna',
      length,
      ux,
      uz,
      nx,
      nz,
      halfT,
      thickness,
      isHorizontal,
      isExterior,
      openings: wallOpenings,
      solidBoxes: wallSolidBoxes,
      ptAt,
    });
  }

  return { wallGeoms, solidBoxes, mountingWallBoxes, openings };
}

/**
 * Extracts exact 90-degree door swing sectors matching `FloorPlanSvgGenerator.renderDoorOpening`.
 */
export function extractDoorSwings(wallGeomsOrExtracted, bounds = null) {
  const wallGeoms = Array.isArray(wallGeomsOrExtracted)
    ? wallGeomsOrExtracted
    : wallGeomsOrExtracted?.wallGeoms || [];
  const swings = [];

  for (const wg of wallGeoms) {
    for (const op of wg.openings || []) {
      if (!op.swing) continue;
      const { hinge = 'start', dir = 'south' } = op.swing;
      const dirVec = DIR_VECTORS[dir] || [0, 1];
      const hingeU = hinge === 'start' ? op.start : op.end;
      const latchU = hinge === 'start' ? op.end : op.start;

      const [hcX, hcZ] = wg.ptAt(hingeU, 0);
      const [lcX, lcZ] = wg.ptAt(latchU, 0);

      const hx = hcX + dirVec[0] * wg.halfT;
      const hz = hcZ + dirVec[1] * wg.halfT;
      const cx = lcX + dirVec[0] * wg.halfT;
      const cz = lcZ + dirVec[1] * wg.halfT;

      const r = Math.hypot(cx - hx, cz - hz);
      if (r <= 0.01) continue;

      const ox = hx + dirVec[0] * r;
      const oz = hz + dirVec[1] * r;

      const u1 = [(ox - hx) / r, (oz - hz) / r];
      const u2 = [(cx - hx) / r, (cz - hz) / r];

      // Quarter-circle bounding box including extreme cardinal points if inside sector
      const pts = [
        [hx, hz],
        [ox, oz],
        [cx, cz],
      ];
      for (const [ex, ez] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (ex * u1[0] + ez * u1[1] >= -1e-6 && ex * u2[0] + ez * u2[1] >= -1e-6) {
          pts.push([hx + ex * r, hz + ez * r]);
        }
      }
      const bbox = boxFromPoints(pts);

      const startAngle = Math.atan2(oz - hz, ox - hx);
      const endAngle = Math.atan2(cz - hz, cx - hx);
      const cross = (ox - hx) * (cz - hz) - (oz - hz) * (cx - hx);
      const sweepFlag = cross > 0 ? 1 : 0;

      const midX = hx + (u1[0] + u2[0]) * r * 0.5;
      const midZ = hz + (u1[1] + u2[1]) * r * 0.5;
      const swingsExterior = Boolean(
        bounds &&
          (midX < bounds.innerMinX - 0.02 ||
            midX > bounds.innerMaxX + 0.02 ||
            midZ < bounds.innerMinZ - 0.02 ||
            midZ > bounds.innerMaxZ + 0.02)
      );

      swings.push({
        id: `${op.id}-swing`,
        wallId: wg.wallId,
        wallName: wg.wallName,
        opening: op,
        name: op.name || 'Dveře',
        hx: roundM(hx),
        hz: roundM(hz),
        cx: roundM(cx),
        cz: roundM(cz),
        ox: roundM(ox),
        oz: roundM(oz),
        r: roundM(r),
        u1,
        u2,
        bbox,
        startAngle,
        endAngle,
        sweepFlag,
        dirVec,
        dir,
        hinge,
        swingsExterior,
      });
    }
  }

  return swings;
}

function getStairsInfo(floorConfig, designConfig) {
  const stairs =
    (designConfig?.floor1?.furniture || []).find((f) => f.type === 'stairs') ||
    (floorConfig?.furniture || []).find((f) => f.type === 'stairs');

  if (!stairs || stairs.layout !== 'u-turn') return null;

  const xStart = stairs.xStart ?? -0.5;
  const xLanding = stairs.xLanding ?? -2.58;
  const xEnd = stairs.xEnd ?? -3.62;
  const zFlight1 = stairs.zFlight1 ?? [-1.78, -0.84];
  const zFlight2 = stairs.zFlight2 ?? [-0.76, 0.18];
  const stepsPerFlight = stairs.stepsPerFlight ?? 8;
  const totalRise = stairs.totalRise ?? 2.98;
  const dir = xLanding <= xStart ? -1 : 1;

  const zMinAll = Math.min(zFlight1[0], zFlight1[1], zFlight2[0], zFlight2[1]);
  const zMaxAll = Math.max(zFlight1[0], zFlight1[1], zFlight2[0], zFlight2[1]);

  return {
    name: stairs.name || 'Schodiště',
    xStart,
    xLanding,
    xEnd,
    zFlight1,
    zFlight2,
    stepsPerFlight,
    totalRise,
    dir,
    w1: Math.abs(zFlight1[1] - zFlight1[0]),
    w2: Math.abs(zFlight2[1] - zFlight2[0]),
    landingDepth: Math.abs(xLanding - xEnd),
    flight1Box: {
      minX: roundM(Math.min(xStart, xLanding)),
      maxX: roundM(Math.max(xStart, xLanding)),
      minZ: roundM(Math.min(zFlight1[0], zFlight1[1])),
      maxZ: roundM(Math.max(zFlight1[0], zFlight1[1])),
    },
    flight2Box: {
      minX: roundM(Math.min(xStart, xLanding)),
      maxX: roundM(Math.max(xStart, xLanding)),
      minZ: roundM(Math.min(zFlight2[0], zFlight2[1])),
      maxZ: roundM(Math.max(zFlight2[0], zFlight2[1])),
    },
    landingBox: {
      minX: roundM(Math.min(xEnd, xLanding)),
      maxX: roundM(Math.max(xEnd, xLanding)),
      minZ: roundM(zMinAll),
      maxZ: roundM(zMaxAll),
    },
    stairwellBox: {
      minX: roundM(Math.min(xEnd, xStart)),
      maxX: roundM(Math.max(xEnd, xStart)),
      minZ: roundM(zMinAll),
      maxZ: roundM(zMaxAll),
    },
  };
}

/**
 * Extracts axis-aligned 2D bounding boxes for interior furniture, sanitary fixtures,
 * railing, derived chimney (2.NP), and u-turn stair geometry.
 */
export function extractFurnitureBoxes(floorConfig = {}, floorKey = '1np', designConfig = {}) {
  const stairsInfo = getStairsInfo(floorConfig, designConfig);
  const boxes = [];

  const items = floorConfig.furniture || [];
  items.forEach((item, itemIndex) => {
    if (item.type === 'pergola' || item.type === 'canopy' || item.type === 'stairs') {
      return;
    }

    const itemId = `furn-${floorKey}-${itemIndex}`;
    const [cx = 0, cz = 0] = item.pos || [0, 0];
    const rad = item.rotY ? (item.rotY * Math.PI) / 180 : 0;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    if (item.type === 'lSofa') {
      const parts = item.parts || [
        { size: [2.6, 0.45, 1.0], offset: [0, 0] },
        { size: [1.0, 0.45, 1.8], offset: [-0.8, -1.4] },
      ];
      parts.forEach((part, partIdx) => {
        const [pw = 1, ph = 0.45, pd = 1] = part.size || [];
        const [ox = 0, oz = 0] = part.offset || [0, 0];
        const rx = ox * cosR + oz * sinR;
        const rz = -ox * sinR + oz * cosR;
        const effW = Math.abs(pw * cosR) + Math.abs(pd * sinR);
        const effD = Math.abs(pw * sinR) + Math.abs(pd * cosR);
        const px = cx + rx;
        const pz = cz + rz;
        boxes.push({
          id: `${itemId}-part-${partIdx}`,
          itemId,
          itemIndex,
          type: item.type,
          name: item.name || item.type,
          desc: item.desc || '',
          minX: roundM(px - effW / 2),
          maxX: roundM(px + effW / 2),
          minZ: roundM(pz - effD / 2),
          maxZ: roundM(pz + effD / 2),
          w: roundM(effW),
          d: roundM(effD),
          height: ph,
          cx: roundM(px),
          cz: roundM(pz),
          isRailing: false,
          isUnderStairs: false,
          derived: false,
          roomId: null,
          roomName: null,
        });
      });
      return;
    }

    const [rawW = 1, rawH = 1, rawD = 1] = item.size || [1, 1, 1];
    const effW = rad ? Math.abs(rawW * cosR) + Math.abs(rawD * sinR) : rawW;
    const effD = rad ? Math.abs(rawW * sinR) + Math.abs(rawD * cosR) : rawD;

    const minX = roundM(cx - effW / 2);
    const maxX = roundM(cx + effW / 2);
    const minZ = roundM(cz - effD / 2);
    const maxZ = roundM(cz + effD / 2);

    const isUnderStairs = Boolean(
      floorKey === '1np' &&
        item.type === 'wardrobe' &&
        rawH <= 1.75 &&
        stairsInfo &&
        pointInBox(cx, cz, stairsInfo.flight2Box, 0.10)
    );

    boxes.push({
      id: itemId,
      itemId,
      itemIndex,
      type: item.type,
      name: item.name || item.type,
      desc: item.desc || '',
      minX,
      maxX,
      minZ,
      maxZ,
      w: roundM(effW),
      d: roundM(effD),
      height: rawH,
      cx: roundM(cx),
      cz: roundM(cz),
      isRailing: item.type === 'railing',
      isUnderStairs,
      derived: false,
      roomId: null,
      roomName: null,
    });
  });

  if (floorKey === '2np') {
    const fireplace = (designConfig?.floor1?.furniture || []).find((f) => f.type === 'fireplace');
    if (fireplace?.pos) {
      const fx = fireplace.pos[0];
      const fz = 0.55;
      const size = 0.38;
      boxes.push({
        id: 'derived-chimney-2np',
        itemId: 'derived-chimney-2np',
        itemIndex: -1,
        type: 'chimney',
        name: 'Komín Ø200',
        desc: 'Průchod komínového tělesa z 1.NP',
        minX: roundM(fx - size / 2),
        maxX: roundM(fx + size / 2),
        minZ: roundM(fz - size / 2),
        maxZ: roundM(fz + size / 2),
        w: size,
        d: size,
        height: 2.65,
        cx: roundM(fx),
        cz: roundM(fz),
        isRailing: false,
        isUnderStairs: false,
        derived: true,
        roomId: null,
        roomName: null,
      });
    }
  }

  return { boxes, stairsInfo };
}

function inZoneBounds(cx, cz, zoneBounds) {
  if (!zoneBounds) return true;
  if (typeof zoneBounds.xMin === 'number' && cx < zoneBounds.xMin) return false;
  if (typeof zoneBounds.xMax === 'number' && cx > zoneBounds.xMax) return false;
  if (typeof zoneBounds.zMin === 'number' && cz < zoneBounds.zMin) return false;
  if (typeof zoneBounds.zMax === 'number' && cz > zoneBounds.zMax) return false;
  return true;
}

function getUncoveredFinishHoles(finishes = []) {
  const uncovered = [];
  for (const finish of finishes) {
    for (const hole of finish.holes || []) {
      const cx = (hole.x1 + hole.x2) / 2;
      const cz = (hole.z1 + hole.z2) / 2;
      const covered = finishes.some((other) => {
        if (other === finish) return false;
        const [ox, oz] = other.pos;
        const [ow, od] = other.size;
        const inBounds =
          cx >= ox - ow / 2 && cx <= ox + ow / 2 && cz >= oz - od / 2 && cz <= oz + od / 2;
        if (!inBounds) return false;
        const inOtherHole = (other.holes || []).some(
          (oh) => cx >= oh.x1 && cx <= oh.x2 && cz >= oh.z1 && cz <= oh.z2
        );
        return !inOtherHole;
      });
      if (!covered) {
        uncovered.push({
          x1: Math.min(hole.x1, hole.x2),
          x2: Math.max(hole.x1, hole.x2),
          z1: Math.min(hole.z1, hole.z2),
          z2: Math.max(hole.z1, hole.z2),
        });
      }
    }
  }
  return uncovered;
}

export function buildRoomLookup(floorConfig = {}, designConfig = {}) {
  const schedule = computeRoomSchedule(floorConfig.rooms || [], floorConfig);
  const interiorRooms = schedule.rooms.filter((r) => r.interior);
  const walls = floorConfig.walls || [];
  if (walls.length === 0 || interiorRooms.length === 0) {
    return {
      rooms: interiorRooms,
      findRoomAt: () => null,
      findRoomForBox: () => null,
    };
  }

  const wallBoxes = walls.map(getWallBox);
  const uncoveredHoles = getUncoveredFinishHoles(floorConfig.finishes || []);
  const bounds = computeFloorBounds(floorConfig, designConfig);

  const rawXs = [bounds.innerMinX, bounds.innerMaxX];
  const rawZs = [bounds.innerMinZ, bounds.innerMaxZ];
  for (const b of wallBoxes) {
    rawXs.push(b.minX, b.maxX);
    rawZs.push(b.minZ, b.maxZ);
  }
  for (const h of uncoveredHoles) {
    rawXs.push(h.x1, h.x2);
    rawZs.push(h.z1, h.z2);
  }
  for (const r of interiorRooms) {
    if (r.zoneBounds) {
      if (typeof r.zoneBounds.xMin === 'number') rawXs.push(r.zoneBounds.xMin);
      if (typeof r.zoneBounds.xMax === 'number') rawXs.push(r.zoneBounds.xMax);
      if (typeof r.zoneBounds.zMin === 'number') rawZs.push(r.zoneBounds.zMin);
      if (typeof r.zoneBounds.zMax === 'number') rawZs.push(r.zoneBounds.zMax);
    }
  }

  const xs = uniqueSortedCoords(rawXs);
  const zs = uniqueSortedCoords(rawZs);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  if (nx <= 0 || nz <= 0) {
    return {
      rooms: interiorRooms,
      findRoomAt: () => null,
      findRoomForBox: () => null,
    };
  }

  const blocked = Array.from({ length: nx }, () => new Uint8Array(nz));
  for (let i = 0; i < nx; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j < nz; j++) {
      const cz = (zs[j] + zs[j + 1]) / 2;
      const inWall = wallBoxes.some(
        (b) => cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ
      );
      const inHole = uncoveredHoles.some(
        (h) => cx >= h.x1 && cx <= h.x2 && cz >= h.z1 && cz <= h.z2
      );
      if (inWall || inHole) blocked[i][j] = 1;
    }
  }

  const cellRoom = Array.from({ length: nx }, () => new Int16Array(nz).fill(-1));
  const findIdx = (arr, val) => {
    for (let i = 0; i < arr.length - 1; i++) {
      if (val >= arr[i] && val <= arr[i + 1]) return i;
    }
    return -1;
  };

  interiorRooms.forEach((room, rIdx) => {
    if (!Array.isArray(room.pos) || room.pos.length < 3) return;
    const si = findIdx(xs, room.pos[0]);
    const sj = findIdx(zs, room.pos[2]);
    if (si < 0 || sj < 0 || blocked[si][sj]) return;

    const visited = Array.from({ length: nx }, () => new Uint8Array(nz));
    const stack = [[si, sj]];
    visited[si][sj] = 1;

    while (stack.length > 0) {
      const [ci, cj] = stack.pop();
      const cellCx = (xs[ci] + xs[ci + 1]) / 2;
      const cellCz = (zs[cj] + zs[cj + 1]) / 2;
      if (!inZoneBounds(cellCx, cellCz, room.zoneBounds)) continue;

      cellRoom[ci][cj] = rIdx;
      for (const [ni, nj] of [
        [ci - 1, cj],
        [ci + 1, cj],
        [ci, cj - 1],
        [ci, cj + 1],
      ]) {
        if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
        if (visited[ni][nj] || blocked[ni][nj]) continue;
        const nCx = (xs[ni] + xs[ni + 1]) / 2;
        const nCz = (zs[nj] + zs[nj + 1]) / 2;
        if (!inZoneBounds(nCx, nCz, room.zoneBounds)) continue;
        visited[ni][nj] = 1;
        stack.push([ni, nj]);
      }
    }
  });

  function findRoomAt(x, z) {
    const i = findIdx(xs, x);
    const j = findIdx(zs, z);
    if (i < 0 || j < 0) return null;
    const rIdx = cellRoom[i][j];
    if (rIdx >= 0) return interiorRooms[rIdx];
    return null;
  }

  function findRoomForBox(box) {
    const [cx, cz] = boxCenter(box);
    const direct = findRoomAt(cx, cz);
    if (direct) return direct;

    const dx = (box.maxX - box.minX) * 0.25;
    const dz = (box.maxZ - box.minZ) * 0.25;
    for (const [sx, sz] of [
      [cx - dx, cz - dz],
      [cx + dx, cz - dz],
      [cx - dx, cz + dz],
      [cx + dx, cz + dz],
      [cx + 0.12, cz],
      [cx - 0.12, cz],
      [cx, cz + 0.12],
      [cx, cz - 0.12],
    ]) {
      const match = findRoomAt(sx, sz);
      if (match) return match;
    }
    return null;
  }

  return { rooms: interiorRooms, findRoomAt, findRoomForBox };
}

function testBoxVsQuarterCircle(box, swing, eps = 0.015) {
  const corners = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.minX, box.maxZ],
    [box.maxX, box.maxZ],
  ];
  let aMin = Infinity;
  let aMax = -Infinity;
  let bMin = Infinity;
  let bMax = -Infinity;

  for (const [px, pz] of corners) {
    const dx = px - swing.hx;
    const dz = pz - swing.hz;
    const a = dx * swing.u1[0] + dz * swing.u1[1];
    const b = dx * swing.u2[0] + dz * swing.u2[1];
    aMin = Math.min(aMin, a);
    aMax = Math.max(aMax, a);
    bMin = Math.min(bMin, b);
    bMax = Math.max(bMax, b);
  }

  const caMin = Math.max(0, aMin);
  const cbMin = Math.max(0, bMin);
  if (aMax <= caMin + 1e-6 || bMax <= cbMin + 1e-6) {
    return null;
  }
  if (aMax <= 0.001 || bMax <= 0.001) {
    return null;
  }

  const dist = Math.hypot(caMin, cbMin);
  const penetration = swing.r - dist;
  if (penetration <= eps) {
    return null;
  }

  const overlapBox = getOverlap(box, swing.bbox)?.box || box;
  return {
    penetration: roundM(penetration),
    conflictBox: overlapBox,
    point: boxCenter(overlapBox),
  };
}

function testDoorVsDoor(swingA, swingB, eps = 0.02) {
  const overlap = getOverlap(swingA.bbox, swingB.bbox);
  if (!overlap || overlap.minOverlap <= eps) return null;

  const { box } = overlap;
  const step = 0.02;
  let sumX = 0;
  let sumZ = 0;
  let hits = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let x = box.minX + step / 2; x <= box.maxX; x += step) {
    for (let z = box.minZ + step / 2; z <= box.maxZ; z += step) {
      const a1 = (x - swingA.hx) * swingA.u1[0] + (z - swingA.hz) * swingA.u1[1];
      const b1 = (x - swingA.hx) * swingA.u2[0] + (z - swingA.hz) * swingA.u2[1];
      if (a1 < 0 || b1 < 0 || Math.hypot(a1, b1) >= swingA.r - eps) continue;

      const a2 = (x - swingB.hx) * swingB.u1[0] + (z - swingB.hz) * swingB.u1[1];
      const b2 = (x - swingB.hx) * swingB.u2[0] + (z - swingB.hz) * swingB.u2[1];
      if (a2 < 0 || b2 < 0 || Math.hypot(a2, b2) >= swingB.r - eps) continue;

      hits++;
      sumX += x;
      sumZ += z;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  if (hits === 0) return null;
  return {
    point: [roundM(sumX / hits), roundM(sumZ / hits)],
    conflictBox: {
      minX: roundM(minX),
      maxX: roundM(maxX),
      minZ: roundM(minZ),
      maxZ: roundM(maxZ),
    },
  };
}

function getObstacleBoxesForClearance(furnitureBoxes, stairsInfo, floorKey) {
  const out = [];
  for (const b of furnitureBoxes) {
    if (b.isRailing || b.isUnderStairs) continue;
    out.push(b);
  }
  if (stairsInfo) {
    if (floorKey === '1np') {
      out.push({
        id: 'stairs-flight1',
        itemId: 'stairs',
        type: 'stairs',
        name: stairsInfo.name,
        ...stairsInfo.flight1Box,
      });
      out.push({
        id: 'stairs-landing',
        itemId: 'stairs',
        type: 'stairs',
        name: stairsInfo.name,
        ...stairsInfo.landingBox,
      });
    } else {
      out.push({
        id: 'stairs-well',
        itemId: 'stairs',
        type: 'stairs',
        name: stairsInfo.name,
        ...stairsInfo.stairwellBox,
      });
    }
  }
  return out;
}

function computeLargestFreeSpan(spanStart, spanEnd, blockedIntervals) {
  if (blockedIntervals.length === 0) return spanEnd - spanStart;
  const sorted = blockedIntervals
    .map(([a, b]) => [Math.max(spanStart, a), Math.min(spanEnd, b)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  if (sorted.length === 0) return spanEnd - spanStart;

  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    if (sorted[i][0] <= prev[1]) {
      prev[1] = Math.max(prev[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }

  let maxFree = merged[0][0] - spanStart;
  for (let i = 0; i < merged.length - 1; i++) {
    maxFree = Math.max(maxFree, merged[i + 1][0] - merged[i][1]);
  }
  maxFree = Math.max(maxFree, spanEnd - merged[merged.length - 1][1]);
  return Math.max(0, roundM(maxFree));
}

function getWallGap(itemBox, side, solidBoxes) {
  const insetX = Math.min(0.04, itemBox.w * 0.15);
  const insetZ = Math.min(0.04, itemBox.d * 0.15);
  let best = Infinity;

  for (const wall of solidBoxes) {
    if (side === 'north' || side === 'south') {
      const overlapX =
        Math.min(itemBox.maxX - insetX, wall.maxX) - Math.max(itemBox.minX + insetX, wall.minX);
      if (overlapX <= 0.03) continue;
      if (side === 'north' && wall.maxZ <= itemBox.minZ + 0.02) {
        best = Math.min(best, Math.max(0, itemBox.minZ - wall.maxZ));
      } else if (side === 'south' && wall.minZ >= itemBox.maxZ - 0.02) {
        best = Math.min(best, Math.max(0, wall.minZ - itemBox.maxZ));
      }
    } else {
      const overlapZ =
        Math.min(itemBox.maxZ - insetZ, wall.maxZ) - Math.max(itemBox.minZ + insetZ, wall.minZ);
      if (overlapZ <= 0.03) continue;
      if (side === 'west' && wall.maxX <= itemBox.minX + 0.02) {
        best = Math.min(best, Math.max(0, itemBox.minX - wall.maxX));
      } else if (side === 'east' && wall.minX >= itemBox.maxX - 0.02) {
        best = Math.min(best, Math.max(0, wall.minX - itemBox.maxX));
      }
    }
  }
  return best;
}

function measureSideClearance(itemBox, side, maxDepth, obstacles, collidingPairs, sideInset = 0.04) {
  const span = side === 'north' || side === 'south' ? itemBox.w : itemBox.d;
  const inset = Math.min(sideInset, span * 0.15);
  let probe;
  if (side === 'north') {
    probe = {
      minX: itemBox.minX + inset,
      maxX: itemBox.maxX - inset,
      minZ: itemBox.minZ - maxDepth,
      maxZ: itemBox.minZ,
    };
  } else if (side === 'south') {
    probe = {
      minX: itemBox.minX + inset,
      maxX: itemBox.maxX - inset,
      minZ: itemBox.maxZ,
      maxZ: itemBox.maxZ + maxDepth,
    };
  } else if (side === 'west') {
    probe = {
      minX: itemBox.minX - maxDepth,
      maxX: itemBox.minX,
      minZ: itemBox.minZ + inset,
      maxZ: itemBox.maxZ - inset,
    };
  } else {
    probe = {
      minX: itemBox.maxX,
      maxX: itemBox.maxX + maxDepth,
      minZ: itemBox.minZ + inset,
      maxZ: itemBox.maxZ - inset,
    };
  }

  let bestGap = maxDepth;
  let blocker = null;

  for (const obs of obstacles) {
    if (obs.itemId && itemBox.itemId && obs.itemId === itemBox.itemId) continue;
    if (obs.itemId && itemBox.itemId && collidingPairs.has(pairKey(obs.itemId, itemBox.itemId))) {
      continue;
    }

    if (side === 'north') {
      if (obs.maxX <= probe.minX || obs.minX >= probe.maxX) continue;
      if (obs.maxZ > itemBox.minZ + 0.015 || obs.maxZ < probe.minZ) continue;
      const gap = Math.max(0, itemBox.minZ - obs.maxZ);
      if (gap < bestGap) {
        bestGap = gap;
        blocker = obs;
      }
    } else if (side === 'south') {
      if (obs.maxX <= probe.minX || obs.minX >= probe.maxX) continue;
      if (obs.minZ < itemBox.maxZ - 0.015 || obs.minZ > probe.maxZ) continue;
      const gap = Math.max(0, obs.minZ - itemBox.maxZ);
      if (gap < bestGap) {
        bestGap = gap;
        blocker = obs;
      }
    } else if (side === 'west') {
      if (obs.maxZ <= probe.minZ || obs.minZ >= probe.maxZ) continue;
      if (obs.maxX > itemBox.minX + 0.015 || obs.maxX < probe.minX) continue;
      const gap = Math.max(0, itemBox.minX - obs.maxX);
      if (gap < bestGap) {
        bestGap = gap;
        blocker = obs;
      }
    } else {
      if (obs.maxZ <= probe.minZ || obs.minZ >= probe.maxZ) continue;
      if (obs.minX < itemBox.maxX - 0.015 || obs.minX > probe.maxX) continue;
      const gap = Math.max(0, obs.minX - itemBox.maxX);
      if (gap < bestGap) {
        bestGap = gap;
        blocker = obs;
      }
    }
  }

  let segment;
  if (side === 'north' || side === 'south') {
    const xLine = blocker
      ? (Math.max(probe.minX, blocker.minX) + Math.min(probe.maxX, blocker.maxX)) / 2
      : itemBox.cx;
    const z1 = side === 'north' ? itemBox.minZ : itemBox.maxZ;
    const z2 = side === 'north' ? z1 - bestGap : z1 + bestGap;
    segment = { x1: roundM(xLine), z1: roundM(z1), x2: roundM(xLine), z2: roundM(z2) };
  } else {
    const zLine = blocker
      ? (Math.max(probe.minZ, blocker.minZ) + Math.min(probe.maxZ, blocker.maxZ)) / 2
      : itemBox.cz;
    const x1 = side === 'west' ? itemBox.minX : itemBox.maxX;
    const x2 = side === 'west' ? x1 - bestGap : x1 + bestGap;
    segment = { x1: roundM(x1), z1: roundM(zLine), x2: roundM(x2), z2: roundM(zLine) };
  }

  return {
    gap: roundM(bestGap),
    blocker,
    segment,
  };
}

function measurePairAxisGap(boxA, boxB) {
  const overlapX = Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX);
  const overlapZ = Math.min(boxA.maxZ, boxB.maxZ) - Math.max(boxA.minZ, boxB.minZ);
  const gapX = Math.max(0, boxA.minX - boxB.maxX, boxB.minX - boxA.maxX);
  const gapZ = Math.max(0, boxA.minZ - boxB.maxZ, boxB.minZ - boxA.maxZ);

  if (overlapX >= overlapZ && overlapX > 0.05) {
    const xMid = (Math.max(boxA.minX, boxB.minX) + Math.min(boxA.maxX, boxB.maxX)) / 2;
    const z1 = boxA.maxZ <= boxB.minZ ? boxA.maxZ : boxB.maxZ;
    const z2 = boxA.maxZ <= boxB.minZ ? boxB.minZ : boxA.minZ;
    return {
      dist: roundM(gapZ),
      segment: { x1: roundM(xMid), z1: roundM(z1), x2: roundM(xMid), z2: roundM(z2) },
    };
  }
  if (overlapZ > 0.05) {
    const zMid = (Math.max(boxA.minZ, boxB.minZ) + Math.min(boxA.maxZ, boxB.maxZ)) / 2;
    const x1 = boxA.maxX <= boxB.minX ? boxA.maxX : boxB.maxX;
    const x2 = boxA.maxX <= boxB.minX ? boxB.minX : boxA.minX;
    return {
      dist: roundM(gapX),
      segment: { x1: roundM(x1), z1: roundM(zMid), x2: roundM(x2), z2: roundM(zMid) },
    };
  }
  const dist = getBoxDistance(boxA, boxB);
  const [ax, az] = boxCenter(boxA);
  const [bx, bz] = boxCenter(boxB);
  return {
    dist: roundM(dist),
    segment: { x1: roundM(ax), z1: roundM(az), x2: roundM(bx), z2: roundM(bz) },
  };
}

function edt1d(f, n) {
  const INF = 1e12;
  const d = new Float32Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const diff = q - v[k];
    d[q] = diff * diff + f[v[k]];
  }
  return d;
}

class MaxHeap {
  constructor() {
    this.items = [];
  }

  push(entry) {
    this.items.push(entry);
    let idx = this.items.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.items[parent].w >= this.items[idx].w) break;
      const tmp = this.items[parent];
      this.items[parent] = this.items[idx];
      this.items[idx] = tmp;
      idx = parent;
    }
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let idx = 0;
      const len = this.items.length;
      while (true) {
        const left = 2 * idx + 1;
        const right = 2 * idx + 2;
        let largest = idx;
        if (left < len && this.items[left].w > this.items[largest].w) largest = left;
        if (right < len && this.items[right].w > this.items[largest].w) largest = right;
        if (largest === idx) break;
        const tmp = this.items[idx];
        this.items[idx] = this.items[largest];
        this.items[largest] = tmp;
        idx = largest;
      }
    }
    return top;
  }

  get size() {
    return this.items.length;
  }
}

function analyzeCirculation(
  floorConfig,
  floorKey,
  bounds,
  solidBoxes,
  furnitureBoxes,
  openings,
  stairsInfo,
  roomLookup,
  std
) {
  const cell = std.gridCellSize;
  const widthM = bounds.innerMaxX - bounds.innerMinX;
  const depthM = bounds.innerMaxZ - bounds.innerMinZ;
  const nx = Math.max(1, Math.round(widthM / cell));
  const nz = Math.max(1, Math.round(depthM / cell));
  const px = nx + 2;
  const pz = nz + 2;

  const blockers = [...solidBoxes, ...getObstacleBoxesForClearance(furnitureBoxes, stairsInfo, floorKey)];
  if (floorKey === '2np') {
    for (const b of furnitureBoxes) {
      if (b.isRailing) blockers.push(b);
    }
  }

  const INF = 1e12;
  const grid = new Float64Array(px * pz);
  const blocked = new Uint8Array(nx * nz);

  for (let pi = 0; pi < px; pi++) {
    for (let pj = 0; pj < pz; pj++) {
      if (pi === 0 || pi === px - 1 || pj === 0 || pj === pz - 1) {
        grid[pi * pz + pj] = 0;
        continue;
      }
      const i = pi - 1;
      const j = pj - 1;
      const cx = bounds.innerMinX + (i + 0.5) * cell;
      const cz = bounds.innerMinZ + (j + 0.5) * cell;
      const isHit = blockers.some(
        (b) => cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ
      );
      if (isHit) {
        blocked[i * nz + j] = 1;
        grid[pi * pz + pj] = 0;
      } else {
        grid[pi * pz + pj] = INF;
      }
    }
  }

  // 2D Euclidean Distance Transform
  const temp = new Float64Array(px * pz);
  const colIn = new Float64Array(pz);
  for (let pi = 0; pi < px; pi++) {
    for (let pj = 0; pj < pz; pj++) colIn[pj] = grid[pi * pz + pj];
    const colOut = edt1d(colIn, pz);
    for (let pj = 0; pj < pz; pj++) temp[pi * pz + pj] = colOut[pj];
  }

  const rowIn = new Float64Array(px);
  const clearWidth = new Float32Array(nx * nz);
  for (let pj = 1; pj < pz - 1; pj++) {
    for (let pi = 0; pi < px; pi++) rowIn[pi] = temp[pi * pz + pj];
    const rowOut = edt1d(rowIn, px);
    const j = pj - 1;
    for (let i = 0; i < nx; i++) {
      const distM = Math.sqrt(rowOut[i + 1]) * cell;
      clearWidth[i * nz + j] = Math.max(0, 2 * (distM - 0.5 * cell));
    }
  }

  const toCell = (x, z) => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - bounds.innerMinX) / cell)));
    const j = Math.min(nz - 1, Math.max(0, Math.floor((z - bounds.innerMinZ) / cell)));
    return [i, j];
  };

  let startPt = null;
  if (floorKey === '1np') {
    const entrance =
      openings.find((o) => o.isDoor && o.wallMaterial === 'wall' && /vchod/i.test(o.name || '')) ||
      openings.find((o) => o.isDoor && o.wallMaterial === 'wall');
    if (entrance) {
      const [cx, cz] = entrance.centerPt;
      const candA = [cx + entrance.nx * (entrance.halfT + 0.35), cz + entrance.nz * (entrance.halfT + 0.35)];
      const candB = [cx - entrance.nx * (entrance.halfT + 0.35), cz - entrance.nz * (entrance.halfT + 0.35)];
      const inA =
        candA[0] > bounds.innerMinX &&
        candA[0] < bounds.innerMaxX &&
        candA[1] > bounds.innerMinZ &&
        candA[1] < bounds.innerMaxZ;
      startPt = inA ? candA : candB;
    }
  } else if (stairsInfo) {
    const sx = stairsInfo.xStart - stairsInfo.dir * 0.35;
    const sz = (stairsInfo.flight2Box.minZ + stairsInfo.flight2Box.maxZ) / 2;
    startPt = [sx, sz];
  }

  if (!startPt) {
    const fallbackRoom = roomLookup.rooms[0];
    startPt = fallbackRoom?.pos ? [fallbackRoom.pos[0], fallbackRoom.pos[2]] : [0, 0];
  }

  let [si, sj] = toCell(startPt[0], startPt[1]);
  const startRoom = roomLookup.findRoomAt(startPt[0], startPt[1]);
  const searchR = Math.round(1.3 / cell);
  let bestSeed = null;
  let bestSeedScore = -1;
  for (let di = -searchR; di <= searchR; di++) {
    for (let dj = -searchR; dj <= searchR; dj++) {
      if (di * di + dj * dj > searchR * searchR) continue;
      const ni = si + di;
      const nj = sj + dj;
      if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
      if (blocked[ni * nz + nj]) continue;
      if (startRoom) {
        const cx = bounds.innerMinX + (ni + 0.5) * cell;
        const cz = bounds.innerMinZ + (nj + 0.5) * cell;
        const rm = roomLookup.findRoomAt(cx, cz);
        if (!rm || rm.id !== startRoom.id) continue;
      }
      const wCell = clearWidth[ni * nz + nj];
      if (wCell > bestSeedScore) {
        bestSeedScore = wCell;
        bestSeed = [ni, nj];
      }
    }
  }
  if (bestSeed) [si, sj] = bestSeed;

  // Widest-Path Dijkstra
  const bestWidth = new Float32Array(nx * nz).fill(-1);
  if (!blocked[si * nz + sj]) {
    const startIdx = si * nz + sj;
    bestWidth[startIdx] = clearWidth[startIdx];
    const heap = new MaxHeap();
    heap.push({ idx: startIdx, w: bestWidth[startIdx] });

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    while (heap.size > 0) {
      const { idx, w } = heap.pop();
      if (w < bestWidth[idx] - 1e-6) continue;
      const ci = Math.floor(idx / nz);
      const cj = idx % nz;

      for (const [di, dj] of dirs) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
        const nIdx = ni * nz + nj;
        if (blocked[nIdx]) continue;
        if (di !== 0 && dj !== 0) {
          if (blocked[(ci + di) * nz + cj] || blocked[ci * nz + (cj + dj)]) continue;
        }
        const edgeCap = Math.min(w, clearWidth[nIdx]);
        if (edgeCap > bestWidth[nIdx] + 1e-6) {
          bestWidth[nIdx] = edgeCap;
          heap.push({ idx: nIdx, w: edgeCap });
        }
      }
    }
  }

  // Map narrowest door per room
  const roomDoorWidths = new Map();
  for (const op of openings) {
    if (!op.isDoor) continue;
    const [cx, cz] = op.centerPt;
    for (const sign of [-1, 1]) {
      const pxTest = cx + sign * op.nx * (op.halfT + 0.30);
      const pzTest = cz + sign * op.nz * (op.halfT + 0.30);
      const rm = roomLookup.findRoomAt(pxTest, pzTest);
      if (rm) {
        const cur = roomDoorWidths.get(rm.id) ?? Infinity;
        roomDoorWidths.set(rm.id, Math.min(cur, op.width));
      }
    }
  }

  const roomBest = new Map();
  for (const room of roomLookup.rooms) {
    roomBest.set(room.id, {
      roomId: room.id,
      roomName: room.name,
      bottleneckM: 0,
      reachable: false,
      doorWidthM: roomDoorWidths.get(room.id) ?? 0.80,
      pos: room.pos ? [room.pos[0], room.pos[2]] : [0, 0],
    });
  }

  for (let i = 0; i < nx; i++) {
    const x = bounds.innerMinX + (i + 0.5) * cell;
    for (let j = 0; j < nz; j++) {
      const idx = i * nz + j;
      if (blocked[idx] || bestWidth[idx] <= 0) continue;
      const z = bounds.innerMinZ + (j + 0.5) * cell;
      const rm = roomLookup.findRoomAt(x, z);
      if (!rm) continue;
      const entry = roomBest.get(rm.id);
      if (entry && bestWidth[idx] > entry.bottleneckM) {
        entry.bottleneckM = roundM(bestWidth[idx]);
      }
    }
  }

  const results = [];
  for (const entry of roomBest.values()) {
    entry.reachable = entry.bottleneckM >= std.roomReachableMinWidth;
    results.push(entry);
  }

  return {
    cellSize: cell,
    startPoint: [roundM(startPt[0]), roundM(startPt[1])],
    rooms: results,
  };
}

/**
 * Runs all 8 layout check categories on a single floor (`1np` or `2np`).
 */
export function analyzeFloorLayout(floorConfig = {}, designConfig = {}, floorKey = '1np', options = {}) {
  const std = { ...DEFAULT_STANDARDS, ...(options.standards || {}) };
  const bounds = computeFloorBounds(floorConfig, designConfig);
  const { wallGeoms, solidBoxes, mountingWallBoxes, openings } = extractWallSegments(floorConfig);
  const doorSwings = extractDoorSwings(wallGeoms, bounds);
  const { boxes: furnitureBoxes, stairsInfo } = extractFurnitureBoxes(floorConfig, floorKey, designConfig);
  const roomLookup = buildRoomLookup(floorConfig, designConfig);

  // Annotate boxes with room assignment
  for (const box of furnitureBoxes) {
    const rm = roomLookup.findRoomForBox(box);
    if (rm) {
      box.roomId = rm.id;
      box.roomName = rm.name;
    }
  }

  const issues = [];
  let seq = 0;
  const addIssue = (issue) => {
    seq++;
    issues.push({
      id: `${floorKey}-${issue.code}-${seq}`,
      floor: floorKey,
      roomId: null,
      roomName: null,
      measuredM: null,
      requiredM: null,
      items: [],
      geometry: {},
      ...issue,
    });
  };

  const findRoomLabel = (x, z, fallbackBox = null) => {
    const rm = roomLookup.findRoomAt(x, z) || (fallbackBox ? roomLookup.findRoomForBox(fallbackBox) : null);
    return rm ? { roomId: rm.id, roomName: rm.name } : { roomId: null, roomName: null };
  };

  // =========================================================================
  // 1. Hard Wall Collisions
  // =========================================================================
  for (const box of furnitureBoxes) {
    if (box.isRailing) continue;

    // Exterior wall protrusion check
    const protWest = Math.max(0, bounds.innerMinX - box.minX);
    const protEast = Math.max(0, box.maxX - bounds.innerMaxX);
    const protNorth = Math.max(0, bounds.innerMinZ - box.minZ);
    const protSouth = Math.max(0, box.maxZ - bounds.innerMaxZ);
    const maxProt = Math.max(protWest, protEast, protNorth, protSouth);
    if (maxProt > std.wallTouchEps) {
      const conflictBox = {
        minX: roundM(Math.max(box.minX, protWest > std.wallTouchEps ? box.minX : bounds.innerMaxX)),
        maxX: roundM(Math.min(box.maxX, protEast > std.wallTouchEps ? box.maxX : bounds.innerMinX)),
        minZ: roundM(Math.max(box.minZ, protNorth > std.wallTouchEps ? box.minZ : bounds.innerMaxZ)),
        maxZ: roundM(Math.min(box.maxZ, protSouth > std.wallTouchEps ? box.maxZ : bounds.innerMinZ)),
      };
      // Build accurate outer protruding band
      const pBox = {
        minX: protWest > std.wallTouchEps ? box.minX : protEast > std.wallTouchEps ? bounds.innerMaxX : box.minX,
        maxX: protWest > std.wallTouchEps ? bounds.innerMinX : protEast > std.wallTouchEps ? box.maxX : box.maxX,
        minZ: protNorth > std.wallTouchEps ? box.minZ : protSouth > std.wallTouchEps ? bounds.innerMaxZ : box.minZ,
        maxZ: protNorth > std.wallTouchEps ? bounds.innerMinZ : protSouth > std.wallTouchEps ? box.maxZ : box.maxZ,
      };
      addIssue({
        severity: 'error',
        category: 'collision-wall',
        code: 'FURN_EXTERIOR_PROTRUSION',
        roomId: box.roomId,
        roomName: box.roomName,
        title: `${box.name} přesahuje do obvodové zdi`,
        detail: `Prvek „${box.name}“ zasahuje o ${fmtCm(maxProt)} za vnitřní líc obvodového zdiva.`,
        measuredM: roundM(maxProt),
        requiredM: 0,
        items: [box.name],
        geometry: {
          highlightBoxes: [box],
          conflictBox: pBox.maxX > pBox.minX && pBox.maxZ > pBox.minZ ? pBox : conflictBox,
          point: boxCenter(pBox.maxX > pBox.minX && pBox.maxZ > pBox.minZ ? pBox : box),
        },
      });
    }

    // Interior solid wall overlap check
    for (const wall of solidBoxes) {
      const ov = getOverlap(box, wall);
      if (!ov || ov.minOverlap <= std.wallTouchEps) continue;

      if (box.type === 'shaft') {
        const crossesCenter = ov.minOverlap > wall.thickness / 2 + std.wallTouchEps;
        addIssue({
          severity: crossesCenter ? 'error' : 'warning',
          category: 'collision-wall',
          code: crossesCenter ? 'SHAFT_WALL_CONFLICT' : 'SHAFT_WALL_EMBED',
          roomId: box.roomId,
          roomName: box.roomName,
          title: `${box.name} zasahuje do stěny`,
          detail: `Šachta „${box.name}“ se překrývá se stěnou „${wall.wallName}“ o ${fmtCm(ov.minOverlap)}.`,
          measuredM: roundM(ov.minOverlap),
          requiredM: 0,
          items: [box.name, wall.wallName],
          geometry: {
            highlightBoxes: [box],
            conflictBox: ov.box,
            point: boxCenter(ov.box),
          },
        });
        continue;
      }

      addIssue({
        severity: 'error',
        category: 'collision-wall',
        code: 'FURN_WALL_OVERLAP',
        roomId: box.roomId,
        roomName: box.roomName,
        title: `${box.name} koliduje se stěnou`,
        detail: `Prvek „${box.name}“ zasahuje do stěny „${wall.wallName}“ o ${fmtCm(ov.minOverlap)}.`,
        measuredM: roundM(ov.minOverlap),
        requiredM: 0,
        items: [box.name, wall.wallName],
        geometry: {
          highlightBoxes: [box],
          conflictBox: ov.box,
          point: boxCenter(ov.box),
        },
      });
    }
  }

  // =========================================================================
  // 2. Furniture-to-Furniture & Stairs Collisions
  // =========================================================================
  const collidingPairs = new Set();
  for (let i = 0; i < furnitureBoxes.length; i++) {
    const a = furnitureBoxes[i];
    for (let j = i + 1; j < furnitureBoxes.length; j++) {
      const b = furnitureBoxes[j];
      if (a.itemId === b.itemId) continue;
      if ((a.isRailing || b.isRailing) && floorKey === '2np') continue;

      const ov = getOverlap(a, b);
      if (!ov || ov.minOverlap <= std.furnTouchEps) continue;

      collidingPairs.add(pairKey(a.itemId, b.itemId));
      const isErr = ov.minOverlap >= std.furnErrorOverlap;
      addIssue({
        severity: isErr ? 'error' : 'warning',
        category: 'collision-furniture',
        code: isErr ? 'FURN_FURN_OVERLAP' : 'FURN_FURN_TOUCH_OVERLAP',
        roomId: a.roomId || b.roomId,
        roomName: a.roomName || b.roomName,
        title: `Kolize: ${a.name} × ${b.name}`,
        detail: `Prvky „${a.name}“ a „${b.name}“ se v půdorysu překrývají o ${fmtCm(ov.minOverlap)}.`,
        measuredM: roundM(ov.minOverlap),
        requiredM: 0,
        items: [a.name, b.name],
        geometry: {
          highlightBoxes: [a, b],
          conflictBox: ov.box,
          point: boxCenter(ov.box),
        },
      });
    }

    // Check furniture against stairs
    if (stairsInfo && !a.isRailing) {
      if (floorKey === '1np') {
        const stairChecks = [stairsInfo.landingBox, stairsInfo.flight1Box];
        if (!a.isUnderStairs) stairChecks.push(stairsInfo.flight2Box);
        for (const sBox of stairChecks) {
          const ov = getOverlap(a, sBox);
          if (!ov || ov.minOverlap <= std.furnErrorOverlap) continue;
          addIssue({
            severity: 'error',
            category: 'collision-furniture',
            code: 'FURN_STAIR_OVERLAP',
            roomId: a.roomId,
            roomName: a.roomName,
            title: `Kolize se schodištěm: ${a.name}`,
            detail: `Prvek „${a.name}“ zasahuje do průchodu schodiště o ${fmtCm(ov.minOverlap)}.`,
            measuredM: roundM(ov.minOverlap),
            requiredM: 0,
            items: [a.name, stairsInfo.name],
            geometry: {
              highlightBoxes: [a, sBox],
              conflictBox: ov.box,
              point: boxCenter(ov.box),
            },
          });
          break;
        }
      } else {
        const ov = getOverlap(a, stairsInfo.stairwellBox);
        if (ov && ov.minOverlap > std.furnErrorOverlap) {
          addIssue({
            severity: 'error',
            category: 'collision-furniture',
            code: 'FURN_STAIRWELL_OVERLAP',
            roomId: a.roomId,
            roomName: a.roomName,
            title: `${a.name} zasahuje do otvoru schodiště`,
            detail: `Prvek „${a.name}“ v 2.NP přesahuje do schodišťového zrcadla o ${fmtCm(ov.minOverlap)}.`,
            measuredM: roundM(ov.minOverlap),
            requiredM: 0,
            items: [a.name, stairsInfo.name],
            geometry: {
              highlightBoxes: [a, stairsInfo.stairwellBox],
              conflictBox: ov.box,
              point: boxCenter(ov.box),
            },
          });
        }
      }
    }
  }

  // =========================================================================
  // 3. Door Swing Collisions (Furniture, Walls, Door-vs-Door)
  // =========================================================================
  const interiorSwings = doorSwings.filter((s) => !s.swingsExterior);

  for (const swing of interiorSwings) {
    const midPt = [
      swing.hx + (swing.u1[0] + swing.u2[0]) * swing.r * 0.45,
      swing.hz + (swing.u1[1] + swing.u2[1]) * swing.r * 0.45,
    ];
    const roomMeta = findRoomLabel(midPt[0], midPt[1]);

    // Against furniture
    for (const box of furnitureBoxes) {
      if (box.isUnderStairs) continue;
      const hit = testBoxVsQuarterCircle(box, swing, std.swingEps);
      if (!hit) continue;
      addIssue({
        severity: 'error',
        category: 'collision-door-swing',
        code: 'DOOR_SWING_FURN',
        roomId: box.roomId || roomMeta.roomId,
        roomName: box.roomName || roomMeta.roomName,
        title: `Křídlo dveří koliduje: ${swing.name}`,
        detail: `Otevírané křídlo „${swing.name}“ naráží do prvku „${box.name}“ (průnik ${fmtCm(hit.penetration)}).`,
        measuredM: hit.penetration,
        requiredM: 0,
        items: [swing.name, box.name],
        geometry: {
          arc: swing,
          highlightBoxes: [box],
          conflictBox: hit.conflictBox,
          point: hit.point,
        },
      });
    }

    // Against stairs
    if (stairsInfo) {
      const stairBoxes =
        floorKey === '1np'
          ? [stairsInfo.flight1Box, stairsInfo.landingBox]
          : [stairsInfo.stairwellBox];
      for (const sBox of stairBoxes) {
        const hit = testBoxVsQuarterCircle(sBox, swing, std.swingEps);
        if (!hit) continue;
        addIssue({
          severity: 'error',
          category: 'collision-door-swing',
          code: 'DOOR_SWING_STAIR',
          ...roomMeta,
          title: `Dveře naráží do schodiště: ${swing.name}`,
          detail: `Otevírané křídlo „${swing.name}“ zasahuje do schodiště o ${fmtCm(hit.penetration)}.`,
          measuredM: hit.penetration,
          requiredM: 0,
          items: [swing.name, stairsInfo.name],
          geometry: {
            arc: swing,
            conflictBox: hit.conflictBox,
            point: hit.point,
          },
        });
        break;
      }
    }

    // Against other walls
    for (const wall of solidBoxes) {
      if (wall.wallId === swing.wallId) continue;
      const hit = testBoxVsQuarterCircle(wall, swing, std.wallSwingEps);
      if (!hit) continue;
      addIssue({
        severity: 'error',
        category: 'collision-door-swing',
        code: 'DOOR_SWING_WALL',
        ...roomMeta,
        title: `Křídlo dveří naráží do zdi: ${swing.name}`,
        detail: `Otevírané křídlo „${swing.name}“ naráží do stěny „${wall.wallName}“ (průnik ${fmtCm(hit.penetration)}).`,
        measuredM: hit.penetration,
        requiredM: 0,
        items: [swing.name, wall.wallName],
        geometry: {
          arc: swing,
          conflictBox: hit.conflictBox,
          point: hit.point,
        },
      });
    }
  }

  // Door-vs-Door
  for (let i = 0; i < interiorSwings.length; i++) {
    for (let j = i + 1; j < interiorSwings.length; j++) {
      const a = interiorSwings[i];
      const b = interiorSwings[j];
      const hit = testDoorVsDoor(a, b, 0.02);
      if (!hit) continue;
      const roomMeta = findRoomLabel(hit.point[0], hit.point[1]);
      addIssue({
        severity: 'error',
        category: 'collision-door-door',
        code: 'DOOR_SWING_DOOR',
        ...roomMeta,
        title: `Kolize křídel dveří`,
        detail: `Křídla dveří „${a.name}“ a „${b.name}“ se při otevření srážejí.`,
        measuredM: 0,
        requiredM: 0,
        items: [a.name, b.name],
        geometry: {
          arc: a,
          arc2: b,
          conflictBox: hit.conflictBox,
          point: hit.point,
        },
      });
    }
  }

  // =========================================================================
  // 4. Doorway Passage & HS Portal Clearance
  // =========================================================================
  const furnAndStairObstacles = getObstacleBoxesForClearance(furnitureBoxes, stairsInfo, floorKey);

  for (const op of openings) {
    if (op.isDoor) {
      const [cx, cz] = op.centerPt;
      for (const sign of [-1, 1]) {
        const vx = sign * op.nx;
        const vz = sign * op.nz;
        const testX = cx + vx * (op.halfT + 0.15);
        const testZ = cz + vz * (op.halfT + 0.15);
        const isInside =
          testX >= bounds.innerMinX - 0.01 &&
          testX <= bounds.innerMaxX + 0.01 &&
          testZ >= bounds.innerMinZ - 0.01 &&
          testZ <= bounds.innerMaxZ + 0.01;
        if (!isInside) continue;

        // Skip swing side on interior doors (covered by swing arc), check non-swing side
        if (op.swing) {
          const dVec = DIR_VECTORS[op.swing.dir] || [0, 1];
          const sameSide = vx * dVec[0] + vz * dVec[1] > 0.5;
          if (sameSide) continue;
        }

        const p1 = op.ptAt(op.start + 0.02, sign * op.halfT);
        const p2 = op.ptAt(op.end - 0.02, sign * (op.halfT + std.doorPassageDepth));
        const zoneBox = boxFromPoints([p1, p2]);

        const blockingItems = [];
        const blockedIntervals = [];
        let minFrontGap = std.doorPassageDepth;
        let closestBlocker = null;

        for (const obs of furnAndStairObstacles) {
          const ov = getOverlap(zoneBox, obs);
          if (!ov || ov.minOverlap <= 0.01) continue;
          blockingItems.push(obs);

          // Project obstacle onto opening tangent coordinate u
          const uVals = [
            (obs.minX - op.pStart[0]) * op.ux + (obs.minZ - op.pStart[1]) * op.uz,
            (obs.maxX - op.pStart[0]) * op.ux + (obs.minZ - op.pStart[1]) * op.uz,
            (obs.minX - op.pStart[0]) * op.ux + (obs.maxZ - op.pStart[1]) * op.uz,
            (obs.maxX - op.pStart[0]) * op.ux + (obs.maxZ - op.pStart[1]) * op.uz,
          ];
          const uMin = Math.min(...uVals);
          const uMax = Math.max(...uVals);
          blockedIntervals.push([op.start + uMin, op.start + uMax]);

          const wallFacePt = op.ptAt(op.center, sign * op.halfT);
          const distFromDoor =
            Math.abs(vx) > 0.5
              ? Math.max(0, vx > 0 ? obs.minX - wallFacePt[0] : wallFacePt[0] - obs.maxX)
              : Math.max(0, vz > 0 ? obs.minZ - wallFacePt[1] : wallFacePt[1] - obs.maxZ);
          if (distFromDoor < minFrontGap || !closestBlocker) {
            minFrontGap = distFromDoor;
            closestBlocker = obs;
          }
        }

        if (blockingItems.length > 0) {
          const maxFreeSpan = computeLargestFreeSpan(op.start, op.end, blockedIntervals);
          const primaryBlocker = closestBlocker || blockingItems[0];
          const roomMeta = findRoomLabel(testX, testZ, primaryBlocker);

          if (maxFreeSpan < std.doorPassageMinWidth) {
            addIssue({
              severity: 'error',
              category: 'door-clearance',
              code: 'DOOR_PASSAGE_BLOCKED',
              ...roomMeta,
              title: `Zablokovaný průchod dveřmi: ${op.name || 'Dveře'}`,
              detail: `Za dveřmi „${op.name || 'Dveře'}“ zbývá volný průchod jen ${fmtCm(maxFreeSpan)} (překáží ${blockingItems.map((b) => `„${b.name}“`).join(', ')}, min. ${fmtCm(std.doorPassageMinWidth)}).`,
              measuredM: roundM(maxFreeSpan),
              requiredM: std.doorPassageMinWidth,
              items: [op.name || 'Dveře', ...blockingItems.map((b) => b.name)],
              geometry: {
                zoneBox,
                highlightBoxes: blockingItems,
                point: boxCenter(zoneBox),
              },
            });
          } else {
            addIssue({
              severity: 'warning',
              category: 'door-clearance',
              code: 'DOOR_APPROACH_TIGHT',
              ...roomMeta,
              title: `Těsný nástup u dveří: ${op.name || 'Dveře'}`,
              detail: `Prvek „${primaryBlocker.name}“ zasahuje do manipulační zóny před dveřmi „${op.name || 'Dveře'}“ (odstup ${fmtCm(minFrontGap)}, doporučeno ${fmtCm(std.doorPassageDepth)}).`,
              measuredM: roundM(minFrontGap),
              requiredM: std.doorPassageDepth,
              items: [op.name || 'Dveře', ...blockingItems.map((b) => b.name)],
              geometry: {
                zoneBox,
                highlightBoxes: blockingItems,
                point: boxCenter(zoneBox),
              },
            });
          }
        }
      }
    }

    // HS portal / French window clearance
    if (op.isPortal) {
      const [cx, cz] = op.centerPt;
      for (const sign of [-1, 1]) {
        const vx = sign * op.nx;
        const vz = sign * op.nz;
        const testX = cx + vx * (op.halfT + 0.20);
        const testZ = cz + vz * (op.halfT + 0.20);
        const isInside =
          testX >= bounds.innerMinX - 0.01 &&
          testX <= bounds.innerMaxX + 0.01 &&
          testZ >= bounds.innerMinZ - 0.01 &&
          testZ <= bounds.innerMaxZ + 0.01;
        if (!isInside) continue;

        const p1 = op.ptAt(op.start + 0.02, sign * op.halfT);
        const p2 = op.ptAt(op.end - 0.02, sign * (op.halfT + std.portalAccessDepth));
        const zoneBox = boxFromPoints([p1, p2]);

        const blockingItems = [];
        const blockedIntervals = [];
        let minFrontGap = std.portalAccessDepth;
        let closestBlocker = null;

        for (const obs of furnAndStairObstacles) {
          const ov = getOverlap(zoneBox, obs);
          if (!ov || ov.minOverlap <= 0.01) continue;
          blockingItems.push(obs);
          const uVals = [
            (obs.minX - op.pStart[0]) * op.ux + (obs.minZ - op.pStart[1]) * op.uz,
            (obs.maxX - op.pStart[0]) * op.ux + (obs.minZ - op.pStart[1]) * op.uz,
            (obs.minX - op.pStart[0]) * op.ux + (obs.maxZ - op.pStart[1]) * op.uz,
            (obs.maxX - op.pStart[0]) * op.ux + (obs.maxZ - op.pStart[1]) * op.uz,
          ];
          blockedIntervals.push([op.start + Math.min(...uVals), op.start + Math.max(...uVals)]);

          const wallFacePt = op.ptAt(op.center, sign * op.halfT);
          const dist =
            Math.abs(vx) > 0.5
              ? Math.max(0, vx > 0 ? obs.minX - wallFacePt[0] : wallFacePt[0] - obs.maxX)
              : Math.max(0, vz > 0 ? obs.minZ - wallFacePt[1] : wallFacePt[1] - obs.maxZ);
          if (dist < minFrontGap || !closestBlocker) {
            minFrontGap = dist;
            closestBlocker = obs;
          }
        }

        if (blockingItems.length > 0) {
          const maxFreeSpan = computeLargestFreeSpan(op.start, op.end, blockedIntervals);
          const primaryBlocker = closestBlocker || blockingItems[0];
          const roomMeta = findRoomLabel(testX, testZ, primaryBlocker);

          if (maxFreeSpan < std.portalMinClearSpan) {
            addIssue({
              severity: 'error',
              category: 'door-clearance',
              code: 'PORTAL_BLOCKED',
              ...roomMeta,
              title: `Zablokovaný výstup portálem: ${op.name || 'Portál'}`,
              detail: `Před „${op.name || 'Portál'}“ zbývá volný průchod jen ${fmtCm(maxFreeSpan)} (min. ${fmtCm(std.portalMinClearSpan)}).`,
              measuredM: roundM(maxFreeSpan),
              requiredM: std.portalMinClearSpan,
              items: [op.name || 'Portál', ...blockingItems.map((b) => b.name)],
              geometry: {
                zoneBox,
                highlightBoxes: blockingItems,
                point: boxCenter(zoneBox),
              },
            });
          } else if (minFrontGap < std.portalWarnClearance) {
            addIssue({
              severity: 'warning',
              category: 'door-clearance',
              code: 'PORTAL_ACCESS_TIGHT',
              ...roomMeta,
              title: `Těsný prostor před portálem: ${op.name || 'Portál'}`,
              detail: `Prvek „${primaryBlocker.name}“ je jen ${fmtCm(minFrontGap)} od „${op.name}“ (volný průchod bokem ${fmtCm(maxFreeSpan)}).`,
              measuredM: roundM(minFrontGap),
              requiredM: std.portalWarnClearance,
              items: [op.name || 'Portál', ...blockingItems.map((b) => b.name)],
              geometry: {
                zoneBox,
                highlightBoxes: blockingItems,
                point: boxCenter(primaryBlocker),
              },
            });
          }
        }
      }
    }
  }

  // =========================================================================
  // 5. Opening vs Walls & Jambs
  // =========================================================================
  for (const wg of wallGeoms) {
    const ops = wg.openings;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (op.rawStart < -0.005 || op.rawEnd > wg.length + 0.005) {
        addIssue({
          severity: 'error',
          category: 'opening-wall-conflict',
          code: 'OPENING_OUT_OF_BOUNDS',
          title: `Otvor mimo hranice stěny: ${op.name || op.id}`,
          detail: `Otvor „${op.name || op.id}“ přesahuje délku stěny „${wg.wallName}“.`,
          measuredM: roundM(Math.max(-op.rawStart, op.rawEnd - wg.length)),
          requiredM: 0,
          items: [op.name || op.id, wg.wallName],
          geometry: {
            conflictBox: op.openingBox,
            point: op.centerPt,
          },
        });
      }

      if (i + 1 < ops.length && ops[i + 1].rawStart < op.rawEnd - 0.005) {
        addIssue({
          severity: 'error',
          category: 'opening-wall-conflict',
          code: 'OPENING_OVERLAP',
          title: `Překryv otvorů ve stěně`,
          detail: `Otvory „${op.name || op.id}“ a „${ops[i + 1].name || ops[i + 1].id}“ se ve stěně překrývají.`,
          measuredM: roundM(op.rawEnd - ops[i + 1].rawStart),
          requiredM: 0,
          items: [op.name || op.id, ops[i + 1].name || ops[i + 1].id],
          geometry: {
            conflictBox: op.openingBox,
            point: op.centerPt,
          },
        });
      }

      // Perpendicular wall hitting opening interior
      const shrunk = {
        minX: op.openingBox.minX + (wg.isHorizontal ? 0.02 : 0),
        maxX: op.openingBox.maxX - (wg.isHorizontal ? 0.02 : 0),
        minZ: op.openingBox.minZ + (wg.isHorizontal ? 0 : 0.02),
        maxZ: op.openingBox.maxZ - (wg.isHorizontal ? 0 : 0.02),
      };
      for (const wall of solidBoxes) {
        if (wall.wallId === wg.wallId) continue;
        const ov = getOverlap(shrunk, wall);
        if (!ov || ov.minOverlap <= 0.01) continue;
        addIssue({
          severity: 'error',
          category: 'opening-wall-conflict',
          code: 'OPENING_WALL_INTERSECTION',
          title: `Příčka zasahuje do otvoru: ${op.name || op.id}`,
          detail: `Stěna „${wall.wallName}“ kříží otvor „${op.name || op.id}“.`,
          measuredM: roundM(ov.minOverlap),
          requiredM: 0,
          items: [op.name || op.id, wall.wallName],
          geometry: {
            conflictBox: ov.box,
            point: boxCenter(ov.box),
          },
        });
      }

      // Jamb / pier width check next to perpendicular walls for interior doors
      if (op.isDoor && !wg.isExterior) {
        const [x0, z0] = wg.wallDef.from;
        let minJambLeft = Infinity;
        let minJambRight = Infinity;

        for (const wall of solidBoxes) {
          if (wall.wallId === wg.wallId) continue;
          // Distance along wall normal from wall center to candidate wall box
          const corners = [
            [wall.minX, wall.minZ],
            [wall.maxX, wall.minZ],
            [wall.minX, wall.maxZ],
            [wall.maxX, wall.maxZ],
          ];
          let uMin = Infinity;
          let uMax = -Infinity;
          let nMin = Infinity;
          let nMax = -Infinity;
          for (const [px, pz] of corners) {
            const dx = px - x0;
            const dz = pz - z0;
            const u = dx * wg.ux + dz * wg.uz;
            const n = dx * wg.nx + dz * wg.nz;
            uMin = Math.min(uMin, u);
            uMax = Math.max(uMax, u);
            nMin = Math.min(nMin, n);
            nMax = Math.max(nMax, n);
          }

          // Candidate wall must touch or cross the door wall's thickness band
          if (nMax < -wg.halfT - 0.02 || nMin > wg.halfT + 0.02) continue;

          if (uMax <= op.start + 0.01 && uMax >= -0.05) {
            minJambLeft = Math.min(minJambLeft, op.start - uMax);
          }
          if (uMin >= op.end - 0.01 && uMin <= wg.length + 0.05) {
            minJambRight = Math.min(minJambRight, uMin - op.end);
          }
        }

        const tightJamb = Math.min(minJambLeft, minJambRight);
        if (tightJamb >= 0 && tightJamb < std.doorJambMin) {
          const isLeft = minJambLeft <= minJambRight;
          const pt = wg.ptAt(isLeft ? op.start : op.end, 0);
          const roomMeta = findRoomLabel(
            op.centerPt[0] + op.nx * (op.halfT + 0.25),
            op.centerPt[1] + op.nz * (op.halfT + 0.25)
          );
          addIssue({
            severity: 'warning',
            category: 'opening-wall-conflict',
            code: 'DOOR_JAMB_TIGHT',
            ...roomMeta,
            title: `Minimální ostění u dveří: ${op.name || 'Dveře'}`,
            detail: `U dveří „${op.name || 'Dveře'}“ zbývá ke kolmé stěně pilířek jen ${fmtCm(tightJamb)} (doporučeno min. ${fmtCm(std.doorJambMin)} pro zárubeň).`,
            measuredM: roundM(tightJamb),
            requiredM: std.doorJambMin,
            items: [op.name || 'Dveře'],
            geometry: {
              point: [roundM(pt[0]), roundM(pt[1])],
            },
          });
        }
      }
    }
  }

  // =========================================================================
  // 6. Ergonomic Clearances
  // =========================================================================
  const allObstacles = [...solidBoxes, ...furnAndStairObstacles];
  const reportedErgoPairs = new Set();

  const registerErgoPair = (idA, idB) => {
    const k = pairKey(idA, idB);
    if (reportedErgoPairs.has(k)) return false;
    reportedErgoPairs.add(k);
    return true;
  };

  const byType = (type) => furnitureBoxes.filter((b) => b.type === type);

  // 6a. Kitchen & Dining pairwise clearances
  const checkKitchenPair = (listA, listB, minWarn, minErr, label, maxCheckDist = 1.6) => {
    for (const a of listA) {
      for (const b of listB) {
        if (collidingPairs.has(pairKey(a.itemId, b.itemId))) continue;
        const { dist, segment } = measurePairAxisGap(a, b);
        if (dist > maxCheckDist) continue;
        if (dist < minWarn) {
          if (!registerErgoPair(a.itemId, b.itemId)) continue;
          const isErr = dist < minErr;
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_KITCHEN_GAP',
            roomId: a.roomId || b.roomId,
            roomName: a.roomName || b.roomName,
            title: `${label}: ${fmtCm(dist)}`,
            detail: `Odstup mezi „${a.name}“ a „${b.name}“ je ${fmtCm(dist)} (doporučeno min. ${fmtCm(minWarn)}).`,
            measuredM: dist,
            requiredM: minWarn,
            items: [a.name, b.name],
            geometry: {
              measureSegment: segment,
              highlightBoxes: [a, b],
              point: [(segment.x1 + segment.x2) / 2, (segment.z1 + segment.z2) / 2],
            },
          });
        }
      }
    }
  };

  const counters = byType('kitchenCounter');
  const islands = byType('kitchenIsland');
  const talls = byType('kitchenTall');
  const tables = byType('diningTable');

  checkKitchenPair(counters, islands, std.kitchenAisleMin, std.kitchenAisleErr, 'Úzká ulička linka – ostrůvek');
  checkKitchenPair(talls, islands, std.kitchenTallIslandMin, std.kitchenTallIslandErr, 'Úzký průchod spíž – ostrůvek');
  checkKitchenPair(islands, tables, std.islandDiningMin, std.islandDiningErr, 'Úzký průchod ostrůvek – stůl');
  checkKitchenPair(counters, tables, 0.80, 0.60, 'Těsný odstup linka – jídelní stůl', 1.2);

  // 6b. Dining table seating clearances (both long sides)
  for (const table of tables) {
    const sides = table.w >= table.d ? ['north', 'south'] : ['west', 'east'];
    for (const side of sides) {
      const res = measureSideClearance(table, side, std.diningSeatMin + 0.1, allObstacles, collidingPairs);
      if (belowLimit(res.gap, std.diningSeatMin)) {
        if (res.blocker?.itemId && !registerErgoPair(table.itemId, res.blocker.itemId)) continue;
        const isErr = belowLimit(res.gap, std.diningSeatErr);
        const blockerName = res.blocker?.name || res.blocker?.wallName || 'překážka';
        addIssue({
          severity: isErr ? 'error' : 'warning',
          category: 'ergonomics-clearance',
          code: 'ERGONOMICS_DINING_SEATING',
          roomId: table.roomId,
          roomName: table.roomName,
          title: `Těsný prostor pro židle u stolu (${fmtCm(res.gap)})`,
          detail: `Za jídelním stolem „${table.name}“ (${side}) je k „${blockerName}“ jen ${fmtCm(res.gap)} (doporučeno ${fmtCm(std.diningSeatMin)}).`,
          measuredM: res.gap,
          requiredM: std.diningSeatMin,
          items: [table.name, blockerName],
          geometry: {
            measureSegment: res.segment,
            highlightBoxes: [table],
            point: [(res.segment.x1 + res.segment.x2) / 2, (res.segment.z1 + res.segment.z2) / 2],
          },
        });
      }
    }
  }

  // 6c. Sanitary wall mounting + front/side clearances
  for (const box of furnitureBoxes) {
    if (!SANITARY_TYPES.has(box.type)) continue;

    const wallGaps = {
      north: getWallGap(box, 'north', mountingWallBoxes),
      south: getWallGap(box, 'south', mountingWallBoxes),
      west: getWallGap(box, 'west', mountingWallBoxes),
      east: getWallGap(box, 'east', mountingWallBoxes),
    };
    const minWallGap = Math.min(wallGaps.north, wallGaps.south, wallGaps.west, wallGaps.east);

    if (minWallGap > std.sanitaryWallMaxGap) {
      addIssue({
        severity: 'warning',
        category: 'ergonomics-clearance',
        code: 'SANITARY_NOT_MOUNTED',
        roomId: box.roomId,
        roomName: box.roomName,
        title: `Sanita nepřiléhá ke stěně: ${box.name}`,
        detail: `Zařizovací předmět „${box.name}“ je odsazen ${fmtCm(minWallGap)} od nejbližší stěny (max. ${fmtCm(std.sanitaryWallMaxGap)}).`,
        measuredM: roundM(minWallGap),
        requiredM: std.sanitaryWallMaxGap,
        items: [box.name],
        geometry: {
          highlightBoxes: [box],
          point: [box.cx, box.cz],
        },
      });
    }

    if (box.type === 'wc') {
      const vertical = box.d >= box.w;
      const frontSide = vertical
        ? wallGaps.north <= wallGaps.south
          ? 'south'
          : 'north'
        : wallGaps.west <= wallGaps.east
          ? 'east'
          : 'west';
      const sidePair = vertical ? ['west', 'east'] : ['north', 'south'];

      const front = measureSideClearance(box, frontSide, std.wcFrontMin + 0.1, allObstacles, collidingPairs);
      if (front.gap < std.wcFrontMin) {
        if (!front.blocker?.itemId || registerErgoPair(box.itemId, front.blocker.itemId)) {
          const isErr = front.gap < std.wcFrontErr;
          const blockerName = front.blocker?.name || front.blocker?.wallName || 'překážka';
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_WC_FRONT',
            roomId: box.roomId,
            roomName: box.roomName,
            title: `Malý prostor před WC (${fmtCm(front.gap)})`,
            detail: `Před „${box.name}“ zbývá jen ${fmtCm(front.gap)} k „${blockerName}“ (min. ${fmtCm(std.wcFrontMin)}).`,
            measuredM: front.gap,
            requiredM: std.wcFrontMin,
            items: [box.name, blockerName],
            geometry: {
              measureSegment: front.segment,
              highlightBoxes: [box],
              point: [(front.segment.x1 + front.segment.x2) / 2, (front.segment.z1 + front.segment.z2) / 2],
            },
          });
        }
      }

      for (const s of sidePair) {
        const lat = measureSideClearance(box, s, std.wcSideMin + 0.05, allObstacles, collidingPairs);
        if (lat.gap < std.wcSideMin) {
          if (lat.blocker?.itemId && !registerErgoPair(box.itemId, lat.blocker.itemId)) continue;
          const isErr = lat.gap < std.wcSideErr;
          const blockerName = lat.blocker?.name || lat.blocker?.wallName || 'překážka';
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_WC_SIDE',
            roomId: box.roomId,
            roomName: box.roomName,
            title: `Úzký boční odstup WC (${fmtCm(lat.gap)})`,
            detail: `Po boku „${box.name}“ je k „${blockerName}“ jen ${fmtCm(lat.gap)} (min. ${fmtCm(std.wcSideMin)}).`,
            measuredM: lat.gap,
            requiredM: std.wcSideMin,
            items: [box.name, blockerName],
            geometry: {
              measureSegment: lat.segment,
              highlightBoxes: [box],
              point: [(lat.segment.x1 + lat.segment.x2) / 2, (lat.segment.z1 + lat.segment.z2) / 2],
            },
          });
        }
      }
    } else if (box.type === 'vanity') {
      const horiz = box.w >= box.d;
      const frontSide = horiz
        ? wallGaps.north <= wallGaps.south
          ? 'south'
          : 'north'
        : wallGaps.west <= wallGaps.east
          ? 'east'
          : 'west';
      const front = measureSideClearance(box, frontSide, std.vanityFrontMin + 0.1, allObstacles, collidingPairs);
      if (front.gap < std.vanityFrontMin) {
        if (!front.blocker?.itemId || registerErgoPair(box.itemId, front.blocker.itemId)) {
          const isErr = front.gap < std.vanityFrontErr;
          const blockerName = front.blocker?.name || front.blocker?.wallName || 'překážka';
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_VANITY_FRONT',
            roomId: box.roomId,
            roomName: box.roomName,
            title: `Těsný odstup před umyvadlem (${fmtCm(front.gap)})`,
            detail: `Před „${box.name}“ je k „${blockerName}“ jen ${fmtCm(front.gap)} (doporučeno ${fmtCm(std.vanityFrontMin)}).`,
            measuredM: front.gap,
            requiredM: std.vanityFrontMin,
            items: [box.name, blockerName],
            geometry: {
              measureSegment: front.segment,
              highlightBoxes: [box],
              point: [(front.segment.x1 + front.segment.x2) / 2, (front.segment.z1 + front.segment.z2) / 2],
            },
          });
        }
      }
    } else if (box.type === 'shower') {
      const openSides = ['north', 'south', 'west', 'east'].filter(
        (s) => wallGaps[s] > std.sanitaryWallMaxGap
      );
      if (openSides.length > 0) {
        let best = null;
        for (const s of openSides) {
          const res = measureSideClearance(box, s, std.showerEntryMin + 0.1, allObstacles, collidingPairs);
          if (!best || res.gap > best.gap) best = res;
        }
        if (best && best.gap < std.showerEntryMin) {
          const isErr = best.gap < std.showerEntryErr;
          const blockerName = best.blocker?.name || best.blocker?.wallName || 'překážka';
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_SHOWER_ENTRY',
            roomId: box.roomId,
            roomName: box.roomName,
            title: `Těsný vstup do sprchy (${fmtCm(best.gap)})`,
            detail: `Nejširší nástup do „${box.name}“ má jen ${fmtCm(best.gap)} k „${blockerName}“ (doporučeno ${fmtCm(std.showerEntryMin)}).`,
            measuredM: best.gap,
            requiredM: std.showerEntryMin,
            items: [box.name, blockerName],
            geometry: {
              measureSegment: best.segment,
              highlightBoxes: [box],
              point: [(best.segment.x1 + best.segment.x2) / 2, (best.segment.z1 + best.segment.z2) / 2],
            },
          });
        }
      }
    } else if (box.type === 'bathtub') {
      const longSides = box.w >= box.d ? ['north', 'south'] : ['west', 'east'];
      const openLong = longSides.filter((s) => wallGaps[s] > std.sanitaryWallMaxGap);
      if (openLong.length > 0) {
        let best = null;
        for (const s of openLong) {
          const res = measureSideClearance(box, s, std.bathtubAccessMin + 0.1, allObstacles, collidingPairs);
          if (!best || res.gap > best.gap) best = res;
        }
        if (best && best.gap < std.bathtubAccessMin) {
          const isErr = best.gap < std.bathtubAccessErr;
          const blockerName = best.blocker?.name || best.blocker?.wallName || 'překážka';
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_BATHTUB_ACCESS',
            roomId: box.roomId,
            roomName: box.roomName,
            title: `Těsný přístup k vaně (${fmtCm(best.gap)})`,
            detail: `Před „${box.name}“ je k „${blockerName}“ jen ${fmtCm(best.gap)} (doporučeno ${fmtCm(std.bathtubAccessMin)}).`,
            measuredM: best.gap,
            requiredM: std.bathtubAccessMin,
            items: [box.name, blockerName],
            geometry: {
              measureSegment: best.segment,
              highlightBoxes: [box],
              point: [(best.segment.x1 + best.segment.x2) / 2, (best.segment.z1 + best.segment.z2) / 2],
            },
          });
        }
      }
    }
  }

  // 6d. Beds, Wardrobes, Desks
  for (const box of furnitureBoxes) {
    if (box.type === 'bed') {
      const isDouble = Math.min(box.w, box.d) >= 1.40;
      const longSides = box.d >= box.w ? ['west', 'east'] : ['north', 'south'];
      const shortSides = box.d >= box.w ? ['north', 'south'] : ['west', 'east'];
      const headGap0 = getWallGap(box, shortSides[0], solidBoxes);
      const headGap1 = getWallGap(box, shortSides[1], solidBoxes);
      const minHeadGap = Math.min(headGap0, headGap1);

      if (minHeadGap > std.sanitaryWallMaxGap && minHeadGap < Infinity) {
        addIssue({
          severity: 'warning',
          category: 'ergonomics-clearance',
          code: 'BED_HEADBOARD_FLOATING',
          roomId: box.roomId,
          roomName: box.roomName,
          title: `Čelo postele nepřiléhá ke stěně (${fmtCm(minHeadGap)})`,
          detail: `Postel „${box.name}“ je čelem odsazena ${fmtCm(minHeadGap)} od stěny (max. ${fmtCm(std.sanitaryWallMaxGap)}).`,
          measuredM: roundM(minHeadGap),
          requiredM: std.sanitaryWallMaxGap,
          items: [box.name],
          geometry: {
            highlightBoxes: [box],
            point: [box.cx, box.cz],
          },
        });
      }

      if (isDouble) {
        const footSide = headGap0 <= headGap1 ? shortSides[1] : shortSides[0];
        for (const s of longSides) {
          const res = measureSideClearance(box, s, std.doubleBedSideMin + 0.1, allObstacles, collidingPairs);
          if (res.gap < std.doubleBedSideMin) {
            if (res.blocker?.itemId && !registerErgoPair(box.itemId, res.blocker.itemId)) continue;
            const isErr = res.gap < std.doubleBedSideErr;
            const blockerName = res.blocker?.name || res.blocker?.wallName || 'překážka';
            addIssue({
              severity: isErr ? 'error' : 'warning',
              category: 'ergonomics-clearance',
              code: 'ERGONOMICS_BED_SIDE',
              roomId: box.roomId,
              roomName: box.roomName,
              title: `Úzký přístup k dvoulůžku (${fmtCm(res.gap)})`,
              detail: `Vedle „${box.name}“ je k „${blockerName}“ jen ${fmtCm(res.gap)} (doporučeno ${fmtCm(std.doubleBedSideMin)}).`,
              measuredM: res.gap,
              requiredM: std.doubleBedSideMin,
              items: [box.name, blockerName],
              geometry: {
                measureSegment: res.segment,
                highlightBoxes: [box],
                point: [(res.segment.x1 + res.segment.x2) / 2, (res.segment.z1 + res.segment.z2) / 2],
              },
            });
          } else {
            // Check that the entrance into the bedside aisle at the foot of the bed is not blocked
            const aisleW = Math.min(res.gap, std.doubleBedSideMin);
            const aisleBox =
              s === 'west'
                ? { minX: box.minX - aisleW + 0.04, maxX: box.minX + 0.04, minZ: box.minZ, maxZ: box.maxZ }
                : s === 'east'
                  ? { minX: box.maxX - 0.04, maxX: box.maxX + aisleW - 0.04, minZ: box.minZ, maxZ: box.maxZ }
                  : s === 'north'
                    ? { minX: box.minX, maxX: box.maxX, minZ: box.minZ - aisleW + 0.04, maxZ: box.minZ + 0.04 }
                    : { minX: box.minX, maxX: box.maxX, minZ: box.maxZ - 0.04, maxZ: box.maxZ + aisleW - 0.04 };
            const entryObstacles = furnAndStairObstacles.filter((o) => o.type !== 'fireplace');
            const entryRes = measureSideClearance(
              { ...aisleBox, w: aisleBox.maxX - aisleBox.minX, d: aisleBox.maxZ - aisleBox.minZ, cx: (aisleBox.minX + aisleBox.maxX) / 2, cz: (aisleBox.minZ + aisleBox.maxZ) / 2, itemId: box.itemId },
              footSide,
              0.55,
              entryObstacles,
              collidingPairs,
              0.02
            );
            if (entryRes.gap < 0.45 && entryRes.blocker) {
              if (entryRes.blocker.itemId && !registerErgoPair(box.itemId, entryRes.blocker.itemId)) continue;
              const isErr = entryRes.gap < 0.25;
              addIssue({
                severity: isErr ? 'error' : 'warning',
                category: 'ergonomics-clearance',
                code: 'ERGONOMICS_BED_SIDE',
                roomId: box.roomId,
                roomName: box.roomName,
                title: `Zablokovaný vstup k boku dvoulůžka (${fmtCm(entryRes.gap)})`,
                detail: `Vstup do boční uličky u „${box.name}“ (${s}) blokuje „${entryRes.blocker.name}“ (mezera jen ${fmtCm(entryRes.gap)}).`,
                measuredM: entryRes.gap,
                requiredM: 0.50,
                items: [box.name, entryRes.blocker.name],
                geometry: {
                  measureSegment: entryRes.segment,
                  highlightBoxes: [box, entryRes.blocker],
                  point: [(entryRes.segment.x1 + entryRes.segment.x2) / 2, (entryRes.segment.z1 + entryRes.segment.z2) / 2],
                },
              });
            }
          }
        }
      } else {
        const resA = measureSideClearance(box, longSides[0], std.singleBedSideMin + 0.1, allObstacles, collidingPairs);
        const resB = measureSideClearance(box, longSides[1], std.singleBedSideMin + 0.1, allObstacles, collidingPairs);
        const best = resA.gap >= resB.gap ? resA : resB;
        if (best.gap < std.singleBedSideMin) {
          if (!best.blocker?.itemId || registerErgoPair(box.itemId, best.blocker.itemId)) {
            const isErr = best.gap < std.singleBedSideErr;
            const blockerName = best.blocker?.name || best.blocker?.wallName || 'překážka';
            addIssue({
              severity: isErr ? 'error' : 'warning',
              category: 'ergonomics-clearance',
              code: 'ERGONOMICS_BED_SIDE',
              roomId: box.roomId,
              roomName: box.roomName,
              title: `Úzký přístup k posteli (${fmtCm(best.gap)})`,
              detail: `Podél „${box.name}“ je volný odstup k „${blockerName}“ jen ${fmtCm(best.gap)} (min. ${fmtCm(std.singleBedSideMin)}).`,
              measuredM: best.gap,
              requiredM: std.singleBedSideMin,
              items: [box.name, blockerName],
              geometry: {
                measureSegment: best.segment,
                highlightBoxes: [box],
                point: [(best.segment.x1 + best.segment.x2) / 2, (best.segment.z1 + best.segment.z2) / 2],
              },
            });
          }
        }
      }
    } else if ((box.type === 'wardrobe' || box.type === 'kitchenTall') && !box.isUnderStairs) {
      const longSides = box.w >= box.d ? ['north', 'south'] : ['west', 'east'];
      const g0 = getWallGap(box, longSides[0], mountingWallBoxes);
      const g1 = getWallGap(box, longSides[1], mountingWallBoxes);
      const frontSide = g0 <= g1 ? longSides[1] : longSides[0];
      const front = measureSideClearance(box, frontSide, std.wardrobeFrontMin + 0.1, allObstacles, collidingPairs);
      if (belowLimit(front.gap, std.wardrobeFrontMin)) {
        if (!front.blocker?.itemId || registerErgoPair(box.itemId, front.blocker.itemId)) {
          const isErr = belowLimit(front.gap, std.wardrobeFrontErr);
          const blockerName = front.blocker?.name || front.blocker?.wallName || 'překážka';
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_WARDROBE_FRONT',
            roomId: box.roomId,
            roomName: box.roomName,
            title: `Těsný prostor před skříní (${fmtCm(front.gap)})`,
            detail: `Před „${box.name}“ je k „${blockerName}“ jen ${fmtCm(front.gap)} (min. ${fmtCm(std.wardrobeFrontMin)} pro otevření dveří).`,
            measuredM: front.gap,
            requiredM: std.wardrobeFrontMin,
            items: [box.name, blockerName],
            geometry: {
              measureSegment: front.segment,
              highlightBoxes: [box],
              point: [(front.segment.x1 + front.segment.x2) / 2, (front.segment.z1 + front.segment.z2) / 2],
            },
          });
        }
      }
    } else if (box.type === 'desk') {
      const longSides = box.w >= box.d ? ['north', 'south'] : ['west', 'east'];
      const g0 = getWallGap(box, longSides[0], mountingWallBoxes);
      const g1 = getWallGap(box, longSides[1], mountingWallBoxes);
      const chairSide = g0 <= g1 ? longSides[1] : longSides[0];
      const res = measureSideClearance(box, chairSide, std.deskChairMin + 0.1, allObstacles, collidingPairs);
      if (belowLimit(res.gap, std.deskChairMin)) {
        if (!res.blocker?.itemId || registerErgoPair(box.itemId, res.blocker.itemId)) {
          const isErr = belowLimit(res.gap, std.deskChairErr);
          const blockerName = res.blocker?.name || res.blocker?.wallName || 'překážka';
          addIssue({
            severity: isErr ? 'error' : 'warning',
            category: 'ergonomics-clearance',
            code: 'ERGONOMICS_DESK_CHAIR',
            roomId: box.roomId,
            roomName: box.roomName,
            title: `Málo místa pro židli u stolu (${fmtCm(res.gap)})`,
            detail: `Za „${box.name}“ je k „${blockerName}“ jen ${fmtCm(res.gap)} (doporučeno ${fmtCm(std.deskChairMin)}).`,
            measuredM: res.gap,
            requiredM: std.deskChairMin,
            items: [box.name, blockerName],
            geometry: {
              measureSegment: res.segment,
              highlightBoxes: [box],
              point: [(res.segment.x1 + res.segment.x2) / 2, (res.segment.z1 + res.segment.z2) / 2],
            },
          });
        }
      }
    }
  }

  // 6e. Sofa <-> Coffee table
  const sofas = byType('lSofa');
  const coffeeTables = byType('coffeeTable');
  for (const ct of coffeeTables) {
    for (const sf of sofas) {
      if (collidingPairs.has(pairKey(ct.itemId, sf.itemId))) continue;
      const { dist, segment } = measurePairAxisGap(sf, ct);
      if (dist < std.sofaCoffeeMin) {
        if (!registerErgoPair(sf.itemId, ct.itemId)) continue;
        addIssue({
          severity: 'warning',
          category: 'ergonomics-clearance',
          code: 'ERGONOMICS_SOFA_COFFEE',
          roomId: ct.roomId || sf.roomId,
          roomName: ct.roomName || sf.roomName,
          title: `Těsný odstup sedačka – stolek (${fmtCm(dist)})`,
          detail: `Mezera mezi „${sf.name}“ a „${ct.name}“ je jen ${fmtCm(dist)} (doporučeno ${fmtCm(std.sofaCoffeeMin)}).`,
          measuredM: dist,
          requiredM: std.sofaCoffeeMin,
          items: [sf.name, ct.name],
          geometry: {
            measureSegment: segment,
            highlightBoxes: [sf, ct],
            point: [(segment.x1 + segment.x2) / 2, (segment.z1 + segment.z2) / 2],
          },
        });
      }
    }
  }

  // 6f. Fireplace fire-safety clearance
  const fireplaces = byType('fireplace');
  for (const fp of fireplaces) {
    for (const box of furnitureBoxes) {
      if (!COMBUSTIBLE_TYPES.has(box.type)) continue;
      if (collidingPairs.has(pairKey(fp.itemId, box.itemId))) continue;
      const { dist, segment } = measurePairAxisGap(fp, box);
      if (dist < std.fireplaceSafetyWarn) {
        if (!registerErgoPair(fp.itemId, box.itemId)) continue;
        const isErr = dist < std.fireplaceSafetyErr;
        addIssue({
          severity: isErr ? 'error' : 'warning',
          category: 'ergonomics-clearance',
          code: 'FIREPLACE_SAFETY',
          roomId: fp.roomId || box.roomId,
          roomName: fp.roomName || box.roomName,
          title: `Požární odstup krbu (${fmtCm(dist)})`,
          detail: `Hořlavý nábytek „${box.name}“ je jen ${fmtCm(dist)} od „${fp.name}“ (bezpečná vzdálenost min. ${fmtCm(std.fireplaceSafetyWarn)}).`,
          measuredM: dist,
          requiredM: std.fireplaceSafetyWarn,
          items: [fp.name, box.name],
          geometry: {
            measureSegment: segment,
            highlightBoxes: [fp, box],
            point: [(segment.x1 + segment.x2) / 2, (segment.z1 + segment.z2) / 2],
          },
        });
      }
    }
  }

  // 6g. Technical appliances service clearance
  for (const box of furnitureBoxes) {
    if (box.type !== 'hvac' && box.type !== 'laundryStack') continue;
    const wallGaps = {
      north: getWallGap(box, 'north', solidBoxes),
      south: getWallGap(box, 'south', solidBoxes),
      west: getWallGap(box, 'west', solidBoxes),
      east: getWallGap(box, 'east', solidBoxes),
    };
    const minSide = Object.entries(wallGaps).sort((a, b) => a[1] - b[1])[0];
    const opp = { north: 'south', south: 'north', west: 'east', east: 'west' };

    if (minSide[1] <= 0.15) {
      const front = measureSideClearance(box, opp[minSide[0]], std.techServiceMin + 0.1, allObstacles, collidingPairs);
      if (front.gap < std.techServiceMin) {
        const blockerName = front.blocker?.name || front.blocker?.wallName || 'překážka';
        addIssue({
          severity: 'warning',
          category: 'ergonomics-clearance',
          code: 'ERGONOMICS_TECH_SERVICE',
          roomId: box.roomId,
          roomName: box.roomName,
          title: `Malý servisní prostor u ${box.name} (${fmtCm(front.gap)})`,
          detail: `Před „${box.name}“ je k „${blockerName}“ jen ${fmtCm(front.gap)} (doporučeno ${fmtCm(std.techServiceMin)}).`,
          measuredM: front.gap,
          requiredM: std.techServiceMin,
          items: [box.name, blockerName],
          geometry: {
            measureSegment: front.segment,
            highlightBoxes: [box],
            point: [(front.segment.x1 + front.segment.x2) / 2, (front.segment.z1 + front.segment.z2) / 2],
          },
        });
      }
    } else {
      let best = null;
      for (const s of ['north', 'south', 'west', 'east']) {
        const res = measureSideClearance(box, s, std.techServiceMin + 0.1, allObstacles, collidingPairs);
        if (!best || res.gap > best.gap) best = res;
      }
      if (best && best.gap < std.techServiceMin) {
        const blockerName = best.blocker?.name || best.blocker?.wallName || 'překážka';
        addIssue({
          severity: 'warning',
          category: 'ergonomics-clearance',
          code: 'ERGONOMICS_TECH_SERVICE',
          roomId: box.roomId,
          roomName: box.roomName,
          title: `Malý servisní prostor u ${box.name} (${fmtCm(best.gap)})`,
          detail: `Nejširší přístup k „${box.name}“ je jen ${fmtCm(best.gap)} (doporučeno ${fmtCm(std.techServiceMin)}).`,
          measuredM: best.gap,
          requiredM: std.techServiceMin,
          items: [box.name, blockerName],
          geometry: {
            measureSegment: best.segment,
            highlightBoxes: [box],
            point: [(best.segment.x1 + best.segment.x2) / 2, (best.segment.z1 + best.segment.z2) / 2],
          },
        });
      }
    }
  }

  // =========================================================================
  // 7. Circulation & Reachability
  // =========================================================================
  const circulation = analyzeCirculation(
    floorConfig,
    floorKey,
    bounds,
    solidBoxes,
    furnitureBoxes,
    openings,
    stairsInfo,
    roomLookup,
    std
  );

  for (const rm of circulation.rooms) {
    if (rm.bottleneckM < std.roomReachableMinWidth) {
      addIssue({
        severity: 'error',
        category: 'circulation',
        code: 'ROOM_UNREACHABLE',
        roomId: rm.roomId,
        roomName: rm.roomName,
        title: `Neprůchozí místnost: ${rm.roomId} ${rm.roomName}`,
        detail: `Do místnosti „${rm.roomId} ${rm.roomName}“ nevede průchod o min. šířce ${fmtCm(std.roomReachableMinWidth)} (nejširší hrdlo ${fmtCm(rm.bottleneckM)}).`,
        measuredM: rm.bottleneckM,
        requiredM: std.roomReachableMinWidth,
        items: [rm.roomName],
        geometry: {
          point: rm.pos,
        },
      });
    } else {
      const warnLimit = Math.min(0.68, rm.doorWidthM - 0.12);
      if (rm.bottleneckM < warnLimit) {
        addIssue({
          severity: 'warning',
          category: 'circulation',
          code: 'ROOM_BOTTLENECK_TIGHT',
          roomId: rm.roomId,
          roomName: rm.roomName,
          title: `Úzké hrdlo do ${rm.roomId} (${fmtCm(rm.bottleneckM)})`,
          detail: `Nejužší místo cesty do „${rm.roomId} ${rm.roomName}“ má šířku ${fmtCm(rm.bottleneckM)} (cíl min. ${fmtCm(warnLimit)}).`,
          measuredM: rm.bottleneckM,
          requiredM: roundM(warnLimit),
          items: [rm.roomName],
          geometry: {
            point: rm.pos,
          },
        });
      }
    }
  }

  // =========================================================================
  // 8. Stairs & Room Stamp Overlap
  // =========================================================================
  let stairsMetrics = null;
  if (floorKey === '1np' && stairsInfo) {
    const totalRisers = stairsInfo.stepsPerFlight * 2 + 2;
    const riserH = stairsInfo.totalRise / totalRisers;
    const stepRun = Math.abs(stairsInfo.xStart - stairsInfo.xLanding) / stairsInfo.stepsPerFlight;
    const lehmann = 2 * riserH + stepRun;
    const minFlightW = Math.min(stairsInfo.w1, stairsInfo.w2);
    const maxFlightW = Math.max(stairsInfo.w1, stairsInfo.w2);

    stairsMetrics = {
      totalRisers,
      riserMm: Math.round(riserH * 1000),
      runMm: Math.round(stepRun * 1000),
      lehmannMm: Math.round(lehmann * 1000),
      flight1WidthM: roundM(stairsInfo.w1),
      flight2WidthM: roundM(stairsInfo.w2),
      landingDepthM: roundM(stairsInfo.landingDepth),
    };

    const stairPos = boxCenter(stairsInfo.flight1Box);
    if (lehmann < 0.58 || lehmann > 0.67) {
      addIssue({
        severity: 'error',
        category: 'stairs',
        code: 'STAIR_LEHMANN',
        roomId: '1.05',
        roomName: 'Chodba & schodiště',
        title: `Nevyhovující výstupní čára schodiště (${stairsMetrics.lehmannMm} mm)`,
        detail: `Lehmannův vzorec 2h + b = ${stairsMetrics.lehmannMm} mm (norma 600–650 mm).`,
        measuredM: roundM(lehmann),
        requiredM: 0.63,
        items: [stairsInfo.name],
        geometry: { point: stairPos },
      });
    } else if (lehmann < 0.60 || lehmann > 0.65) {
      addIssue({
        severity: 'warning',
        category: 'stairs',
        code: 'STAIR_LEHMANN',
        roomId: '1.05',
        roomName: 'Chodba & schodiště',
        title: `Hraniční poměr schodiště (${stairsMetrics.lehmannMm} mm)`,
        detail: `Lehmannův vzorec 2h + b = ${stairsMetrics.lehmannMm} mm (ideál 600–650 mm).`,
        measuredM: roundM(lehmann),
        requiredM: 0.63,
        items: [stairsInfo.name],
        geometry: { point: stairPos },
      });
    }

    if (riserH > 0.20 || riserH > 0.185) {
      addIssue({
        severity: riserH > 0.20 ? 'error' : 'warning',
        category: 'stairs',
        code: 'STAIR_RISER_HIGH',
        roomId: '1.05',
        roomName: 'Chodba & schodiště',
        title: `Vysoký stupeň schodiště (${stairsMetrics.riserMm} mm)`,
        detail: `Výška stupně ${stairsMetrics.riserMm} mm překračuje doporučených 185 mm.`,
        measuredM: roundM(riserH),
        requiredM: 0.185,
        items: [stairsInfo.name],
        geometry: { point: stairPos },
      });
    }

    if (stepRun < 0.24 || stepRun < 0.26) {
      addIssue({
        severity: stepRun < 0.24 ? 'error' : 'warning',
        category: 'stairs',
        code: 'STAIR_RUN_SHORT',
        roomId: '1.05',
        roomName: 'Chodba & schodiště',
        title: `Úzký nášlap schodiště (${stairsMetrics.runMm} mm)`,
        detail: `Šířka stupně ${stairsMetrics.runMm} mm je menší než doporučených 260 mm.`,
        measuredM: roundM(stepRun),
        requiredM: 0.26,
        items: [stairsInfo.name],
        geometry: { point: stairPos },
      });
    }

    if (minFlightW < 0.80 || minFlightW < 0.90) {
      addIssue({
        severity: minFlightW < 0.80 ? 'error' : 'warning',
        category: 'stairs',
        code: 'STAIR_WIDTH_NARROW',
        roomId: '1.05',
        roomName: 'Chodba & schodiště',
        title: `Úzké rameno schodiště (${fmtCm(minFlightW)})`,
        detail: `Průchodná šířka ramene ${fmtCm(minFlightW)} je pod doporučenými 90 cm.`,
        measuredM: roundM(minFlightW),
        requiredM: 0.90,
        items: [stairsInfo.name],
        geometry: { point: stairPos },
      });
    }

    if (stairsInfo.landingDepth < maxFlightW - 0.02) {
      addIssue({
        severity: 'warning',
        category: 'stairs',
        code: 'STAIR_LANDING_NARROW',
        roomId: '1.05',
        roomName: 'Chodba & schodiště',
        title: `Úzká mezipodesta (${fmtCm(stairsInfo.landingDepth)})`,
        detail: `Hloubka mezipodesty ${fmtCm(stairsInfo.landingDepth)} je menší než šířka ramene (${fmtCm(maxFlightW)}).`,
        measuredM: roundM(stairsInfo.landingDepth),
        requiredM: roundM(maxFlightW),
        items: [stairsInfo.name],
        geometry: { point: boxCenter(stairsInfo.landingBox) },
      });
    }
  }

  // Room stamp overlap checks
  const stampObstructions = [
    ...solidBoxes.map((w) => ({ ...w, name: w.wallName })),
    ...furnAndStairObstacles,
  ];
  for (const room of roomLookup.rooms) {
    if (!Array.isArray(room.pos) || room.pos.length < 3) continue;
    const rx = room.pos[0];
    const rz = room.pos[2];
    const stampBox = {
      minX: roundM(rx - 0.18),
      maxX: roundM(rx + 0.18),
      minZ: roundM(rz - 0.10),
      maxZ: roundM(rz + 0.10),
    };
    const hit = stampObstructions.find((obs) => {
      const ov = getOverlap(stampBox, obs);
      return ov && ov.minOverlap > 0.02;
    });
    if (hit) {
      addIssue({
        severity: 'warning',
        category: 'room-stamp',
        code: 'ROOM_STAMP_OVERLAP',
        roomId: room.id,
        roomName: room.name,
        title: `Popisek místnosti ${room.id} přes objekt`,
        detail: `Štítek místnosti „${room.id} ${room.name}“ leží přes „${hit.name}“.`,
        measuredM: null,
        requiredM: null,
        items: [room.name, hit.name],
        geometry: {
          highlightBoxes: [stampBox],
          point: [rx, rz],
        },
      });
    }
  }

  // =========================================================================
  // 8. Doors: leaf vs. neighbouring doorways, handle clearance, opening stops, pockets
  // =========================================================================
  const doorOps = openings.filter((o) => o.isDoor);
  const leafBoxOf = (s) => {
    const t = 0.0225;
    return {
      minX: roundM(Math.min(s.hx, s.ox) - t),
      maxX: roundM(Math.max(s.hx, s.ox) + t),
      minZ: roundM(Math.min(s.hz, s.oz) - t),
      maxZ: roundM(Math.max(s.hz, s.oz) + t),
    };
  };
  const mouthZoneOf = (op, sign) =>
    boxFromPoints([
      op.ptAt(op.start, sign * op.halfT),
      op.ptAt(op.end, sign * (op.halfT + std.doorMouthDepth)),
    ]);
  const projectOnOpening = (op, box) => {
    const us = [
      [box.minX, box.minZ],
      [box.maxX, box.minZ],
      [box.minX, box.maxZ],
      [box.maxX, box.maxZ],
    ].map(([px, pz]) => (px - op.pStart[0]) * op.ux + (pz - op.pStart[1]) * op.uz);
    return [op.start + Math.min(...us), op.start + Math.max(...us)];
  };

  // 8a. Fully opened leaf of door A covering the doorway of door B
  for (const a of interiorSwings) {
    const leaf = leafBoxOf(a);
    for (const b of doorOps) {
      if (b.id === a.opening.id) continue;
      for (const sign of [-1, 1]) {
        const zone = mouthZoneOf(b, sign);
        const ov = getOverlap(leaf, zone);
        if (!ov || ov.minOverlap <= 0.01) continue;
        const [u0, u1] = projectOnOpening(b, leaf);
        const free = computeLargestFreeSpan(b.start, b.end, [[u0, u1]]);
        const isErr = free < std.doorPassageMinWidth;
        if (!isErr && free >= (b.end - b.start) * 0.85) continue;
        const roomMeta = findRoomLabel(...boxCenter(zone));
        addIssue({
          severity: isErr ? 'error' : 'warning',
          category: 'door-door-clearance',
          code: 'DOOR_SWING_BLOCKS_DOORWAY',
          ...roomMeta,
          title: `Otevřené dveře „${a.name}“ zastiňují vstup „${b.name || 'Dveře'}“`,
          detail: `Při otevření o 90° křídlo „${a.name}“ zakrývá průchod dveřmi „${b.name || 'Dveře'}“ – zbývá volných jen ${fmtCm(free)} (min. ${fmtCm(std.doorPassageMinWidth)}).`,
          measuredM: roundM(free),
          requiredM: std.doorPassageMinWidth,
          items: [a.name, b.name || 'Dveře'],
          geometry: {
            arc: a,
            zoneBox: zone,
            conflictBox: ov.box,
            point: boxCenter(ov.box),
          },
        });
      }
    }
  }

  // 8b. Handle clearance: open leaf (90°) too close to furniture / equipment
  const swingFurnHits = new Set(
    issues.filter((i) => i.code === 'DOOR_SWING_FURN').map((i) => `${i.items[0]}|${i.items[1]}`)
  );
  for (const s of doorSwings) {
    const leaf = leafBoxOf(s);
    for (const box of furnitureBoxes) {
      if (box.isRailing || box.isUnderStairs) continue;
      if (swingFurnHits.has(`${s.name}|${box.name}`)) continue;
      const dist = getBoxDistance(leaf, box);
      if (getOverlap(leaf, box) || dist >= std.doorLeafClearance) continue;
      addIssue({
        severity: 'warning',
        category: 'door-clearance',
        code: 'DOOR_LEAF_CLEARANCE_TIGHT',
        roomId: box.roomId,
        roomName: box.roomName,
        title: `Otevřené dveře těsně u „${box.name}“`,
        detail: `Otevřené křídlo „${s.name}“ (90°) je jen ${fmtCm(dist)} od „${box.name}“ – klika a běžný dokmit zasáhnou prvek (doporučeno min. ${fmtCm(std.doorLeafClearance)}).`,
        measuredM: roundM(dist),
        requiredM: std.doorLeafClearance,
        items: [s.name, box.name],
        geometry: {
          arc: s,
          highlightBoxes: [box],
          point: boxCenter(box),
        },
      });
    }
  }

  // 8c. Opening beyond 90°: recommend a stop when furniture / a doorway sits behind the leaf
  for (const s of interiorSwings) {
    const own = s.opening;
    const mouths = doorOps
      .filter((o) => o.id !== own.id)
      .flatMap((o) => [mouthZoneOf(o, -1), mouthZoneOf(o, 1)].map((z) => ({ zone: z, name: o.name })));
    let hitAngle = null;
    let hitName = null;
    for (let phi = 5; phi <= 90 && hitAngle === null; phi += 5) {
      const rad = (phi * Math.PI) / 180;
      const dx = s.u1[0] * Math.cos(rad) - s.u2[0] * Math.sin(rad);
      const dz = s.u1[1] * Math.cos(rad) - s.u2[1] * Math.sin(rad);
      for (let k = 1; k <= 8 && hitAngle === null; k++) {
        const px = s.hx + dx * s.r * (k / 8);
        const pz = s.hz + dz * s.r * (k / 8);
        const f = furnitureBoxes.find(
          (b) => !b.isRailing && !b.isUnderStairs && pointInBox(px, pz, b, -0.01)
        );
        if (f) {
          hitAngle = 90 + phi;
          hitName = f.name;
          break;
        }
        const m = mouths.find((mm) => pointInBox(px, pz, mm.zone, -0.01));
        if (m) {
          hitAngle = 90 + phi;
          hitName = `vstup „${m.name || 'Dveře'}“`;
        }
      }
    }
    if (hitAngle !== null) {
      const roomMeta = findRoomLabel(s.hx + s.u1[0] * s.r * 0.5, s.hz + s.u1[1] * s.r * 0.5);
      addIssue({
        severity: 'info',
        category: 'door-stop',
        code: 'DOOR_STOP_RECOMMENDED',
        ...roomMeta,
        title: `Doporučen omezovač otevření: ${s.name}`,
        detail: `Křídlo „${s.name}“ by se při otevření přes 90° zastavilo až o ${hitName} (cca ${hitAngle}°) – doplňte skrytý omezovač v zárubni (95–100°).`,
        measuredM: null,
        requiredM: null,
        items: [s.name, hitName],
        geometry: { arc: s, point: [s.ox, s.oz] },
      });
    }
  }

  // 8d. Pocket (sliding into wall) doors
  for (const op of doorOps) {
    if (!(op.sliding && typeof op.sliding === 'object' && op.sliding.pocket)) continue;
    const wg = wallGeoms.find((g) => g.wallId === op.wallId);
    const w = op.end - op.start;
    const dirVec = DIR_VECTORS[op.sliding.dir] || [-op.ux, -op.uz];
    const sign = dirVec[0] * op.ux + dirVec[1] * op.uz >= 0 ? 1 : -1;
    const pStart = sign < 0 ? Math.max(0, op.start - w) : op.end;
    const pEnd = sign < 0 ? op.start : Math.min(op.wallLength, op.end + w);
    const pocketLen = pEnd - pStart;
    const pocketBox = boxFromPoints([
      op.ptAt(pStart, -op.halfT - 0.10),
      op.ptAt(pEnd, op.halfT + 0.10),
    ]);
    const roomMeta = findRoomLabel(...boxCenter(pocketBox));

    if (pocketLen < w - 0.05) {
      addIssue({
        severity: 'error',
        category: 'pocket-door',
        code: 'POCKET_DOOR_NO_SPACE',
        ...roomMeta,
        title: `Pouzdro nevejde do stěny: ${op.name}`,
        detail: `Pouzdro je dlouhé jen ${fmtCm(pocketLen)} pro křídlo šířky ${fmtCm(w)}.`,
        measuredM: roundM(pocketLen),
        requiredM: roundM(w),
        items: [op.name],
        geometry: { conflictBox: pocketBox, point: boxCenter(pocketBox) },
      });
    }
    if (wg?.wallDef?.structural) {
      addIssue({
        severity: 'warning',
        category: 'pocket-door',
        code: 'POCKET_IN_STRUCTURAL_WALL',
        ...roomMeta,
        title: `Pouzdro v nosné stěně: ${op.name}`,
        detail: `Pouzdro „${op.name}“ je ve stěně „${op.wallName}“, která je nosná – nutný statický překlad přes otvor i pouzdro (≈ ${fmtCm(w + pocketLen + 0.5)}).`,
        measuredM: roundM(w + pocketLen + 0.5),
        requiredM: null,
        items: [op.name, op.wallName],
        geometry: { conflictBox: pocketBox, point: boxCenter(pocketBox) },
      });
    }
    const pocketObstacles = [
      ...furnAndStairObstacles,
      ...solidBoxes.filter((b) => b.wallId !== op.wallId),
    ];
    for (const obs of pocketObstacles) {
      const ov = getOverlap(pocketBox, obs);
      if (!ov || ov.minOverlap <= 0.02) continue;
      addIssue({
        severity: 'warning',
        category: 'pocket-door',
        code: 'POCKET_DOOR_CONFLICT',
        ...roomMeta,
        title: `Pouzdro koliduje: ${obs.name || obs.wallName}`,
        detail: `U pouzdra „${op.name}“ stojí „${obs.name || obs.wallName}“ v pásu ${fmtCm(0.10)} od stěny – nelze kotvit ani vést instalace.`,
        measuredM: roundM(ov.minOverlap),
        requiredM: 0,
        items: [op.name, obs.name || obs.wallName],
        geometry: { conflictBox: ov.box, point: boxCenter(ov.box) },
      });
    }
  }

  issues.sort((a, b) => {
    const sDiff = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sDiff !== 0) return sDiff;
    const ra = a.roomId || 'zzz';
    const rb = b.roomId || 'zzz';
    if (ra !== rb) return ra.localeCompare(rb, 'cs');
    return a.id.localeCompare(b.id);
  });

  let badgeNum = 1;
  for (const iss of issues) {
    if (iss.severity === 'error' || iss.severity === 'warning') {
      iss.badgeNum = badgeNum++;
    } else {
      iss.badgeNum = null;
    }
  }

  const counts = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };

  return {
    floorKey,
    bounds,
    counts,
    issues,
    circulation,
    stairsMetrics,
    stats: {
      walls: wallGeoms.length,
      openings: openings.length,
      doors: doorSwings.length,
      furnitureItems: furnitureBoxes.length,
      rooms: roomLookup.rooms.length,
    },
  };
}

/**
 * Analyzes both `1np` and `2np` floors of a complete house design variant.
 */
export function analyzeDesignLayout(designConfig = {}, options = {}) {
  const floor1 = designConfig.floor1
    ? analyzeFloorLayout(designConfig.floor1, designConfig, '1np', options)
    : null;
  const floor2 = designConfig.floor2
    ? analyzeFloorLayout(designConfig.floor2, designConfig, '2np', options)
    : null;

  const summary = {
    errors: (floor1?.counts.errors || 0) + (floor2?.counts.errors || 0),
    warnings: (floor1?.counts.warnings || 0) + (floor2?.counts.warnings || 0),
    info: (floor1?.counts.info || 0) + (floor2?.counts.info || 0),
  };

  return {
    designId: designConfig.id || 'unknown',
    designLabel: designConfig.label || designConfig.id || 'Dům',
    summary,
    floor1,
    floor2,
  };
}

/**
 * Formats an analysis report into a human-readable Czech CLI summary.
 */
export function formatAnalysisReport(report) {
  const lines = [];
  lines.push('========================================================================');
  lines.push(`ANALÝZA DISPOZICE: ${report.designLabel} [${report.designId}]`);
  lines.push(
    `Celkem: ${report.summary.errors} chyb (error) | ${report.summary.warnings} varování (warning) | ${report.summary.info} info`
  );
  lines.push('========================================================================');

  for (const [label, floor] of [
    ['1.NP (Přízemí)', report.floor1],
    ['2.NP (Patro)', report.floor2],
  ]) {
    if (!floor) continue;
    lines.push('');
    lines.push(
      `--- ${label}: ${floor.counts.errors} chyb, ${floor.counts.warnings} varování (${floor.stats.rooms} místností, ${floor.stats.furnitureItems} prvků) ---`
    );

    if (floor.stairsMetrics) {
      const m = floor.stairsMetrics;
      lines.push(
        `  Schodiště: ${m.totalRisers}× ${m.riserMm}/${m.runMm} mm | 2h+b = ${m.lehmannMm} mm | ramena ${fmtCm(m.flight1WidthM)}/${fmtCm(m.flight2WidthM)} | podesta ${fmtCm(m.landingDepthM)}`
      );
    }

    const circStr = floor.circulation.rooms
      .map((r) => `${r.roomId}:${r.reachable ? fmtCm(r.bottleneckM) : `BLOK(${fmtCm(r.bottleneckM)})`}`)
      .join(', ');
    lines.push(`  Průchodnost (nejširší hrdlo): ${circStr}`);

    if (floor.issues.length === 0) {
      lines.push('  ✓ Bez zjištěných kolizí či ergonomických problémů.');
    } else {
      for (const iss of floor.issues) {
        const tag = iss.severity === 'error' ? 'CHYBA' : iss.severity === 'warning' ? 'VAROV' : 'INFO';
        const num = iss.badgeNum ? `#${iss.badgeNum}` : '--';
        const room = iss.roomId ? `[${iss.roomId}] ` : '';
        const meas = iss.measuredM !== null ? ` (${fmtCm(iss.measuredM)})` : '';
        lines.push(`  ${num.padEnd(3)} [${tag}] ${room}${iss.title}${meas}`);
        lines.push(`      -> ${iss.detail}`);
      }
    }
  }

  return lines.join('\n');
}

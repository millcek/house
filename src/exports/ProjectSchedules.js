import {
  computeFloorBounds,
  computeRoomSchedule,
  getWallBox,
} from '../builders/RoomBuilder.js';
import {
  computeBuiltUpArea,
  computeSiteSetbacks,
} from '../builders/SiteBuilder.js';
import {
  computeBillOfMaterials,
  gableRoofGeometry,
} from '../budget/BillOfMaterials.js';
import { computeHouseVolume } from '../budget/priceEstimator.js';
import { BOM_SPEC } from '../budget/specifications.js';
import { analyzeDesignLayout } from '../analysis/LayoutAnalyzer.js';

const DIR_VECTORS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

const COMPASS_16 = [
  'S', 'SSV', 'SV', 'VSV',
  'V', 'VJV', 'JV', 'JJV',
  'J', 'JJZ', 'JZ', 'ZJZ',
  'Z', 'ZSZ', 'SZ', 'SSZ',
];

const SIDE_LABELS = {
  S: 'Sever (S)',
  J: 'Jih (J)',
  V: 'Východ (V)',
  Z: 'Západ (Z)',
};

const FIXTURE_LABELS = {
  wc: 'WC závěsné',
  umyvadlo: 'Umyvadlo',
  dvojumyvadlo: 'Dvojumyvadlo',
  umyvatko: 'Umývátko',
  sprcha: 'Sprchový kout',
  vana: 'Vana',
  drez: 'Kuchyňský dřez',
  mycka: 'Myčka nádobí',
  pracka: 'Pračka',
  susicka: 'Sušička',
  vylevka: 'Výlevka',
  hvac: 'Tepelné čerpadlo',
  satna: 'Šatní systém',
  regal: 'Úložné regály',
};

const NON_HABITABLE_REGEX =
  /chodba|hala|zádveří|vstup|technick|schod|šatna|terasa|koupelna|wc|prádelna|komora/i;

function resolveOpeningCenter(op) {
  if (typeof op.at === 'number') return op.at;
  if (typeof op.offset === 'number') return op.offset;
  return 0;
}

function uniqueSorted(values, tol = 1e-4) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (const val of sorted) {
    if (out.length === 0 || val - out[out.length - 1] > tol) {
      out.push(Number(val.toFixed(4)));
    }
  }
  return out;
}

function inZoneBounds(cx, cz, zoneBounds) {
  if (!zoneBounds) return true;
  if (typeof zoneBounds.xMin === 'number' && cx < zoneBounds.xMin) return false;
  if (typeof zoneBounds.xMax === 'number' && cx > zoneBounds.xMax) return false;
  if (typeof zoneBounds.zMin === 'number' && cz < zoneBounds.zMin) return false;
  if (typeof zoneBounds.zMax === 'number' && cz > zoneBounds.zMax) return false;
  return true;
}

/**
 * Builds an exact wall-bounded room lookup grid (ignoring floor slab cutouts so
 * stairwell windows map directly to the adjacent staircase/hall room).
 */
function createRoomLookup(floorConfig, scheduleRooms) {
  const walls = floorConfig?.walls || [];
  const wallBoxes = walls.map(getWallBox);
  const interiorRooms = scheduleRooms.filter((r) => r.interior && Array.isArray(r.pos));
  const terraceRoom = scheduleRooms.find((r) => !r.interior);
  const terraceFinish = (floorConfig?.finishes || []).find((f) => f.material === 'terrace');

  const rawXs = [];
  const rawZs = [];
  for (const b of wallBoxes) {
    rawXs.push(b.minX, b.maxX);
    rawZs.push(b.minZ, b.maxZ);
  }
  for (const r of interiorRooms) {
    if (r.zoneBounds) {
      if (typeof r.zoneBounds.xMin === 'number') rawXs.push(r.zoneBounds.xMin);
      if (typeof r.zoneBounds.xMax === 'number') rawXs.push(r.zoneBounds.xMax);
      if (typeof r.zoneBounds.zMin === 'number') rawZs.push(r.zoneBounds.zMin);
      if (typeof r.zoneBounds.zMax === 'number') rawZs.push(r.zoneBounds.zMax);
    }
  }

  const xs = uniqueSorted(rawXs);
  const zs = uniqueSorted(rawZs);
  const nx = xs.length - 1;
  const nz = zs.length - 1;

  const findIndex = (arr, val) => {
    for (let i = 0; i < arr.length - 1; i++) {
      if (val >= arr[i] && val <= arr[i + 1]) return i;
    }
    return -1;
  };

  const blocked = Array.from({ length: nx }, () => new Uint8Array(nz));
  const owner = Array.from({ length: nx }, () => new Array(nz).fill(null));

  if (nx > 0 && nz > 0) {
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      for (let j = 0; j < nz; j++) {
        const cz = (zs[j] + zs[j + 1]) / 2;
        if (wallBoxes.some((b) => cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ)) {
          blocked[i][j] = 1;
        }
      }
    }

    for (const room of interiorRooms) {
      const si = findIndex(xs, room.pos[0]);
      const sj = findIndex(zs, room.pos[2]);
      if (si < 0 || sj < 0 || blocked[si][sj]) continue;

      const visited = Array.from({ length: nx }, () => new Uint8Array(nz));
      const stack = [[si, sj]];
      visited[si][sj] = 1;

      while (stack.length > 0) {
        const [ci, cj] = stack.pop();
        const cellCx = (xs[ci] + xs[ci + 1]) / 2;
        const cellCz = (zs[cj] + zs[cj + 1]) / 2;
        if (!inZoneBounds(cellCx, cellCz, room.zoneBounds)) continue;
        if (!owner[ci][cj]) owner[ci][cj] = room;

        const neighbors = [
          [ci - 1, cj],
          [ci + 1, cj],
          [ci, cj - 1],
          [ci, cj + 1],
        ];
        for (const [ni, nj] of neighbors) {
          if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
          if (visited[ni][nj] || blocked[ni][nj]) continue;
          const nCx = (xs[ni] + xs[ni + 1]) / 2;
          const nCz = (zs[nj] + zs[nj + 1]) / 2;
          if (!inZoneBounds(nCx, nCz, room.zoneBounds)) continue;
          visited[ni][nj] = 1;
          stack.push([ni, nj]);
        }
      }
    }
  }

  return function findRoomAt(x, z) {
    if (nx > 0 && nz > 0) {
      const i = findIndex(xs, x);
      const j = findIndex(zs, z);
      if (i >= 0 && j >= 0 && owner[i][j]) {
        return owner[i][j];
      }
    }

    if (terraceRoom && terraceFinish?.pos && terraceFinish?.size) {
      const [tcx, tcz] = terraceFinish.pos;
      const [tw, td] = terraceFinish.size;
      if (Math.abs(x - tcx) <= tw / 2 + 0.05 && Math.abs(z - tcz) <= td / 2 + 0.05) {
        return terraceRoom;
      }
    }

    // Fallback: nearest interior room whose bounds lie within 0.45 m
    let best = null;
    let bestDist = 0.45;
    for (const room of interiorRooms) {
      const b = room.bounds;
      if (!b || !Number.isFinite(b.minX)) continue;
      if (!inZoneBounds(x, z, room.zoneBounds)) continue;
      const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
      const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = room;
      }
    }
    return best;
  };
}

function classifyOpening(op, isExt) {
  if (op.type === 'window' && op.sliding) {
    const isPsk = op.portalType === 'psk';
    return {
      category: 'hs',
      categoryLabel: isPsk ? 'Terasový portál PSK' : 'HS portál',
      prefix: 'O',
    };
  }
  if (op.type === 'window') {
    return {
      category: 'window',
      categoryLabel: 'Okno',
      prefix: 'O',
    };
  }
  if (op.type === 'door' && isExt) {
    return {
      category: 'extDoor',
      categoryLabel: 'Vchodové dveře',
      prefix: 'DV',
    };
  }
  if (op.type === 'door' || op.swing) {
    return {
      category: 'intDoor',
      categoryLabel: 'Vnitřní dveře',
      prefix: 'D',
    };
  }
  return {
    category: 'passage',
    categoryLabel: 'Stavební průchod',
    prefix: 'P',
  };
}

function computeHanding(op, category, wall, center, len) {
  if (op.swing) {
    const [x1, z1] = wall.from;
    const [x2, z2] = wall.to;
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    const start = Math.max(0, center - op.width / 2);
    const end = Math.min(len, center + op.width / 2);
    const hingeU = op.swing.hinge === 'start' ? start : end;

    const hx = x1 + ux * hingeU;
    const hz = z1 + uz * hingeU;
    const cx = x1 + ux * center;
    const cz = z1 + uz * center;

    const dirVec = DIR_VECTORS[op.swing.dir] || [0, 1];
    // Observer stands on swing side looking at wall: look = (-dirVec[0], -dirVec[1])
    // In (X=East, Z=South), right hand of look is (-lookZ, lookX) = (dirVec[1], -dirVec[0])
    const rightX = dirVec[1];
    const rightZ = -dirVec[0];
    const dot = (hx - cx) * rightX + (hz - cz) * rightZ;
    return dot >= 0 ? 'Pravé (P)' : 'Levé (L)';
  }
  if (op.sliding) {
    if (category === 'hs') return op.portalType === 'psk' ? 'Posuvně-sklopné (PSK)' : 'Posuvné (HS)';
    return 'Posuvné do pouzdra';
  }
  if (op.fixed) return 'Pevné (FIX)';
  if (category === 'window') return 'Otvíravé/sklopné';
  return 'Bez křídla';
}

function getExteriorOrientation(wall, bounds, totalRotDeg) {
  const [x1, z1] = wall.from;
  const [x2, z2] = wall.to;
  const midX = (x1 + x2) / 2;
  const midZ = (z1 + z2) / 2;
  const isHoriz = Math.abs(x2 - x1) >= Math.abs(z2 - z1);

  let side = 'S';
  let localAzimuth = 0;
  if (isHoriz) {
    const midAllZ = (bounds.wallMinZ + bounds.wallMaxZ) / 2;
    if (midZ < midAllZ) {
      side = 'S';
      localAzimuth = 0;
    } else {
      side = 'J';
      localAzimuth = 180;
    }
  } else {
    const midAllX = (bounds.wallMinX + bounds.wallMaxX) / 2;
    if (midX >= midAllX) {
      side = 'V';
      localAzimuth = 90;
    } else {
      side = 'Z';
      localAzimuth = 270;
    }
  }

  const trueAzimuthDeg = Math.round(((localAzimuth - totalRotDeg) % 360 + 360) % 360) % 360;
  const trueDir = COMPASS_16[Math.round(trueAzimuthDeg / 22.5) % 16];

  return {
    side,
    sideLabel: SIDE_LABELS[side],
    trueAzimuthDeg,
    trueDir,
  };
}

function resolveOpeningRooms(findRoomAt, cx, cz, nx, nz, halfT, isExt, swing) {
  const probes = [halfT + 0.22, halfT + 0.42, halfT + 0.7];
  let roomPlus = null;
  let roomMinus = null;

  for (const d of probes) {
    if (!roomPlus) roomPlus = findRoomAt(cx + nx * d, cz + nz * d);
    if (!roomMinus) roomMinus = findRoomAt(cx - nx * d, cz - nz * d);
    if (roomPlus && roomMinus) break;
  }

  const unique = [];
  for (const r of [roomPlus, roomMinus]) {
    if (r && !unique.some((u) => u.id === r.id)) unique.push(r);
  }

  if (unique.length === 0) {
    return { roomIds: [], roomsText: '—' };
  }

  if (isExt) {
    const interiorRoom = unique.find((r) => r.interior);
    const exteriorRoom = unique.find((r) => !r.interior);
    if (interiorRoom && exteriorRoom) {
      return {
        roomIds: [interiorRoom.id, exteriorRoom.id],
        roomsText: `${interiorRoom.id} ${interiorRoom.name} → ${exteriorRoom.id} ${exteriorRoom.name}`,
      };
    }
    const primary = interiorRoom || unique[0];
    return {
      roomIds: [primary.id],
      roomsText: `${primary.id} ${primary.name}`,
    };
  }

  if (unique.length === 1) {
    const only = unique[0];
    return {
      roomIds: [only.id],
      roomsText: `${only.id} ${only.name}`,
    };
  }

  let first = unique[0];
  let second = unique[1];
  if (swing?.dir) {
    const dv = DIR_VECTORS[swing.dir] || [0, 1];
    const swingSideRoom = findRoomAt(cx + dv[0] * (halfT + 0.35), cz + dv[1] * (halfT + 0.35));
    if (swingSideRoom && unique.some((u) => u.id === swingSideRoom.id)) {
      second = swingSideRoom;
      first = unique.find((u) => u.id !== swingSideRoom.id) || unique[0];
    }
  } else {
    [first, second] = [...unique].sort((a, b) => a.id.localeCompare(b.id));
  }

  return {
    roomIds: [first.id, second.id],
    roomsText: `${first.id} ${first.name} → ${second.id} ${second.name}`,
  };
}

function getStandardText(category, spec, op = {}) {
  if (category === 'hs') return spec.windows.slidingLabel;
  if (category === 'window') return spec.windows.label;
  if (category === 'extDoor') return spec.windows.extDoorLabel;
  if (category === 'intDoor') {
    if (op.sliding) return spec.windows.pocketDoorLabel;
    if (op.glazed) return spec.windows.glazedDoorLabel;
    return spec.windows.intDoorLabel;
  }
  return 'Čistý stavební otvor s překladem bez výplně';
}

/**
 * Generates a full window, door, and passage schedule with canonical architectural marks
 * (O1, O2..., DV1..., D1..., P1...), ČSN L/P door handing, adjacent room resolution,
 * cardinal/true orientation, and glazing area statistics.
 */
export function buildOpeningSchedule(
  designConfig,
  { siteConfig = null, housePos = null, spec = BOM_SPEC } = {}
) {
  const parcelRot = siteConfig?.parcelRotationDeg ?? 26.5;
  const houseRot = housePos?.rotY ?? siteConfig?.defaultHousePos?.rotY ?? 0;
  const totalRotDeg = parcelRot + houseRot;

  const floors = [
    { key: '1np', label: '1.NP', cfg: designConfig.floor1 },
    { key: '2np', label: '2.NP', cfg: designConfig.floor2 },
  ].filter((f) => f.cfg);

  const items = [];
  const tagByKey = new Map();
  const specToMark = new Map();
  const prefixCounts = { O: 0, DV: 0, D: 0, P: 0 };

  for (const { key: floorKey, label: floorLabel, cfg } of floors) {
    const bounds = computeFloorBounds(cfg, designConfig);
    const finishThickM =
      (cfg.finishes || []).find((f) => f.material !== 'terrace')?.thickness ?? 0;
    const { rooms: scheduleRooms } = computeRoomSchedule(cfg.rooms || [], cfg);
    const findRoomAt = createRoomLookup(cfg, scheduleRooms);

    for (const wall of cfg.walls || []) {
      const [x1, z1] = wall.from;
      const [x2, z2] = wall.to;
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len <= 0.001) continue;

      const ux = (x2 - x1) / len;
      const uz = (z2 - z1) / len;
      const nx = -uz;
      const nz = ux;
      const wallThickness = wall.thickness ?? designConfig.partThickness ?? 0.16;
      const halfT = wallThickness / 2;
      const isExt = wall.material === 'wall';
      const wallId = wall.id || wall.name || 'wall';

      const extOrient = isExt ? getExteriorOrientation(wall, bounds, totalRotDeg) : null;

      (wall.openings || []).forEach((op, openingIndex) => {
        const cls = classifyOpening(op, isExt);
        const widthMm = Math.round((op.width || 0) * 1000);
        const heightMm = Math.round((op.height || 0) * 1000);
        // Doors / portals / passages: measure from the finished floor (threshold level),
        // windows keep the parapet measured from the structural slab as in the model.
        const floorRelative = cls.category !== 'window';
        const sillM = floorRelative
          ? Number(Math.max(0, (op.sill ?? 0) - finishThickM).toFixed(3))
          : (op.sill ?? 0);
        const sillMm = Math.round(sillM * 1000);
        const lintelHeightMm = sillMm + heightMm;
        const areaSqm = Number(((op.width || 0) * (op.height || 0)).toFixed(2));

        const doorLike = cls.category === 'extDoor' || cls.category === 'intDoor';
        const specKey = [
          cls.category,
          widthMm,
          heightMm,
          sillMm,
          doorLike ? Math.round(wallThickness * 1000) : '',
          op.glazed ? 'glazed' : '',
          op.sliding ? 'sliding' : '',
        ].join('|');
        let mark = specToMark.get(specKey);
        if (!mark) {
          prefixCounts[cls.prefix] = (prefixCounts[cls.prefix] || 0) + 1;
          mark = `${cls.prefix}${prefixCounts[cls.prefix]}`;
          specToMark.set(specKey, mark);
        }

        tagByKey.set(`${floorKey}|${wallId}|${openingIndex}`, mark);

        const center = resolveOpeningCenter(op);
        const cx = x1 + ux * center;
        const cz = z1 + uz * center;

        const { roomIds, roomsText } = resolveOpeningRooms(
          findRoomAt,
          cx,
          cz,
          nx,
          nz,
          halfT,
          isExt,
          op.swing
        );

        const handing = computeHanding(op, cls.category, wall, center, len);
        const lintelLengthMm = Math.round(
          Math.ceil((op.width + 2 * spec.lintel.bearing) / spec.lintel.module - 1e-6) *
            spec.lintel.module *
            1000
        );

        items.push({
          mark,
          floor: floorLabel,
          floorKey,
          wallId,
          wallName: wall.name || wallId,
          wallThicknessMm: Math.round(wallThickness * 1000),
          isExterior: isExt,
          category: cls.category,
          categoryLabel: cls.categoryLabel,
          name: op.name || cls.categoryLabel,
          widthM: op.width,
          heightM: op.height,
          sillM,
          widthMm,
          heightMm,
          sillMm,
          lintelHeightMm,
          areaSqm,
          rawAreaSqm: (op.width || 0) * (op.height || 0),
          handing,
          orientationSide: extOrient ? extOrient.side : 'Interiér',
          orientationLabel: extOrient ? extOrient.sideLabel : 'Interiér',
          trueDir: extOrient ? extOrient.trueDir : '—',
          trueAzimuthDeg: extOrient ? extOrient.trueAzimuthDeg : null,
          roomIds,
          roomsText,
          lintelLengthMm,
          standard: getStandardText(cls.category, spec, op),
        });
      });
    }
  }

  // Group identical types for supplier quotation table
  const groupedMap = new Map();
  for (const item of items) {
    if (!groupedMap.has(item.mark)) {
      groupedMap.set(item.mark, {
        mark: item.mark,
        category: item.category,
        categoryLabel: item.categoryLabel,
        description: item.name,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        sillMm: item.sillMm,
        count: 0,
        unitAreaSqm: item.areaSqm,
        totalAreaSqm: 0,
        floors: new Set(),
        rooms: [],
        handings: new Set(),
        orientations: new Set(),
        standard: item.standard,
      });
    }
    const g = groupedMap.get(item.mark);
    g.count += 1;
    g.totalAreaSqm += item.rawAreaSqm;
    g.floors.add(item.floor);
    if (item.roomsText && item.roomsText !== '—' && !g.rooms.includes(item.roomsText)) {
      g.rooms.push(item.roomsText);
    }
    g.handings.add(item.handing);
    if (item.orientationSide !== 'Interiér') {
      g.orientations.add(`${item.orientationSide} (${item.trueDir})`);
    }
  }

  const groupedTypes = [...groupedMap.values()].map((g) => ({
    mark: g.mark,
    category: g.category,
    categoryLabel: g.categoryLabel,
    description: g.description,
    widthMm: g.widthMm,
    heightMm: g.heightMm,
    sillMm: g.sillMm,
    count: g.count,
    unitAreaSqm: g.unitAreaSqm,
    totalAreaSqm: Number(g.totalAreaSqm.toFixed(2)),
    floorsText: [...g.floors].join(', '),
    roomsText: g.rooms.join('; '),
    handingText: [...g.handings].join(' / '),
    orientationsText: g.orientations.size > 0 ? [...g.orientations].join(', ') : 'Interiér',
    standard: g.standard,
  }));

  const glazingItems = items.filter((i) => i.category === 'window' || i.category === 'hs');
  const windowCount = items.filter((i) => i.category === 'window').length;
  const hsCount = items.filter((i) => i.category === 'hs').length;
  const extDoorCount = items.filter((i) => i.category === 'extDoor').length;
  const intDoorCount = items.filter((i) => i.category === 'intDoor').length;
  const passageCount = items.filter((i) => i.category === 'passage').length;
  const rawWindowArea = glazingItems.reduce((s, i) => s + i.rawAreaSqm, 0);

  const glazingByOrientation = ['S', 'J', 'V', 'Z'].map((side) => {
    const matching = glazingItems.filter((i) => i.orientationSide === side);
    const rawArea = matching.reduce((s, i) => s + i.rawAreaSqm, 0);
    const localAzimuth = side === 'S' ? 0 : side === 'V' ? 90 : side === 'J' ? 180 : 270;
    const trueAzimuthDeg = Math.round(((localAzimuth - totalRotDeg) % 360 + 360) % 360) % 360;
    const trueDir = COMPASS_16[Math.round(trueAzimuthDeg / 22.5) % 16];
    return {
      side,
      sideLabel: SIDE_LABELS[side],
      trueDir,
      trueAzimuthDeg,
      count: matching.length,
      areaSqm: Number(rawArea.toFixed(2)),
      sharePct: rawWindowArea > 0 ? Number(((rawArea / rawWindowArea) * 100).toFixed(1)) : 0,
    };
  });

  return {
    items,
    groupedTypes,
    tagByKey,
    glazingByOrientation,
    summary: {
      windowCount,
      hsCount,
      totalGlazingCount: glazingItems.length,
      windowAreaSqm: Number(rawWindowArea.toFixed(2)),
      extDoorCount,
      intDoorCount,
      totalDoorCount: extDoorCount + intDoorCount,
      passageCount,
      totalOpenings: items.length,
    },
  };
}

function pointInFinishZone(f, x, z) {
  const [cx, cz] = f.pos || [0, 0];
  const [w, d] = f.size || [0, 0];
  if (Math.abs(x - cx) > w / 2 + 1e-4 || Math.abs(z - cz) > d / 2 + 1e-4) {
    return false;
  }
  return !(f.holes || []).some(
    (h) =>
      x >= Math.min(h.x1, h.x2) &&
      x <= Math.max(h.x1, h.x2) &&
      z >= Math.min(h.z1, h.z2) &&
      z <= Math.max(h.z1, h.z2)
  );
}

function detectFloorFinishLabel(room, floorConfig) {
  if (!room.interior) return 'Thermodřevo (terasa)';
  const finishes = floorConfig?.finishes || [];
  const [rx, , rz] = room.pos || [0, 0, 0];

  for (const fin of finishes) {
    if (fin.material === 'terrace') continue;
    if (pointInFinishZone(fin, rx, rz)) {
      return fin.material === 'tileFloor' ? 'Keramická dlažba' : 'Dřevěná podlaha (dub)';
    }
  }
  return /koupelna|wc|zádveří|technick|prádelna|komora/i.test(room.name)
    ? 'Keramická dlažba'
    : 'Dřevěná podlaha (dub)';
}

function formatFixturesList(fixtures = []) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return '—';
  return fixtures.map((f) => FIXTURE_LABELS[f] || f).join(', ');
}

function enrichFloorRooms(floorLabel, floorConfig, clearHeightM) {
  const schedule = computeRoomSchedule(floorConfig?.rooms || [], floorConfig);
  const rooms = schedule.rooms.map((r) => {
    const b = r.bounds;
    const perimeterM =
      b && Number.isFinite(b.minX)
        ? Number((2 * (b.maxX - b.minX + (b.maxZ - b.minZ))).toFixed(2))
        : Number((4 * Math.sqrt(r.areaSqm || 0)).toFixed(2));
    const volumeM3 = r.interior ? Number((r.areaSqm * clearHeightM).toFixed(1)) : 0;
    const habitable = r.interior && !NON_HABITABLE_REGEX.test(r.name);
    const classification = !r.interior
      ? 'Venkovní plocha'
      : habitable
        ? 'Obytná místnost'
        : 'Příslušenství / komunikace';

    return {
      floor: floorLabel,
      id: r.id,
      name: r.name,
      areaSqm: r.areaSqm,
      interior: r.interior,
      perimeterM,
      clearHeightM: r.interior ? clearHeightM : 0,
      volumeM3,
      floorFinish: detectFloorFinishLabel(r, floorConfig),
      habitable,
      classification,
      fixtures: formatFixturesList(r.fixtures),
      desc: r.desc || '',
    };
  });

  return {
    rooms,
    interiorTotalSqm: schedule.interiorTotalSqm,
    exteriorTotalSqm: Number(
      rooms
        .filter((r) => !r.interior)
        .reduce((s, r) => s + r.areaSqm, 0)
        .toFixed(1)
    ),
    totalVolumeM3: Number(rooms.reduce((s, r) => s + r.volumeM3, 0).toFixed(1)),
  };
}

/**
 * Generates a comprehensive area, volume, urbanism (KZP/setbacks), elevation,
 * construction assembly, and layout-audit summary for architectural documentation.
 */
export function buildAreaAndTechnicalSummary({
  design,
  siteConfig = null,
  auxConfig = null,
  housePos = null,
  spec = BOM_SPEC,
} = {}) {
  const resolvedHousePos = housePos || siteConfig?.defaultHousePos || { x: 0, z: 0, rotY: 0 };

  const f1StructElev = design.floor1?.elevation ?? 0;
  const f1FinishThick =
    (design.floor1?.finishes || []).find((f) => f.material !== 'terrace')?.thickness ?? 0.22;
  const f1FinishElev = Number((f1StructElev + f1FinishThick).toFixed(3));
  const c1Bottom = design.ceilingSlab?.y ?? design.floorHeight ?? 2.95;
  const f1SdkDrop = design.ceiling1Sdk ? 0.10 : 0;
  const f1ClearHeight = Number((c1Bottom - f1FinishElev - f1SdkDrop).toFixed(2));

  const f2StructElev = design.floor2?.elevation ?? 3.17;
  const f2FinishThick =
    (design.floor2?.finishes || []).find((f) => f.material !== 'terrace')?.thickness ?? 0.12;
  const f2FinishElev = Number((f2StructElev + f2FinishThick).toFixed(3));
  const c2Bottom = design.ceiling2Slab?.y ?? f2StructElev + 2.95;
  const f2SdkDrop = 0.15; // SDK podhled + instalační mezera pro VZT pod vazníky
  const f2ClearHeight = Number((c2Bottom - f2FinishElev - f2SdkDrop).toFixed(2));

  const eaveLevel = Number((design.roof?.y ?? 6.12).toFixed(3));
  const ridgeLevel = Number((eaveLevel + (design.roof?.height ?? 2.8)).toFixed(3));

  const floor1Rooms = enrichFloorRooms('1.NP', design.floor1, f1ClearHeight);
  const floor2Rooms = enrichFloorRooms('2.NP', design.floor2, f2ClearHeight);
  const allRooms = [...floor1Rooms.rooms, ...floor2Rooms.rooms];

  const interiorRooms = allRooms.filter((r) => r.interior);
  const totalInteriorSqm = Number(
    (floor1Rooms.interiorTotalSqm + floor2Rooms.interiorTotalSqm).toFixed(1)
  );
  const totalHabitableSqm = Number(
    interiorRooms
      .filter((r) => r.habitable)
      .reduce((s, r) => s + r.areaSqm, 0)
      .toFixed(1)
  );
  const totalAccessorySqm = Number((totalInteriorSqm - totalHabitableSqm).toFixed(1));
  const totalExteriorSqm = Number(
    (floor1Rooms.exteriorTotalSqm + floor2Rooms.exteriorTotalSqm).toFixed(1)
  );
  const totalRoomVolumeM3 = Number(
    (floor1Rooms.totalVolumeM3 + floor2Rooms.totalVolumeM3).toFixed(1)
  );

  const volumeInfo = computeHouseVolume(design);
  const roofGeo = design.roof ? gableRoofGeometry(design.roof) : null;
  const siteMetrics =
    siteConfig && auxConfig ? computeBuiltUpArea(siteConfig, auxConfig, design) : null;
  const setbacks =
    siteConfig && auxConfig
      ? computeSiteSetbacks(siteConfig, resolvedHousePos, auxConfig, design.footprint, design)
      : null;

  const bomResult = computeBillOfMaterials({
    design,
    auxConfig,
    siteConfig,
    housePos: resolvedHousePos,
    spec,
  });
  const openingSchedule = buildOpeningSchedule(design, {
    siteConfig,
    housePos: resolvedHousePos,
    spec,
  });
  const layoutAudit = analyzeDesignLayout(design);

  const glazingRatioPct =
    totalInteriorSqm > 0
      ? Number(((openingSchedule.summary.windowAreaSqm / totalInteriorSqm) * 100).toFixed(1))
      : 0;

  const groundInsulMm = Math.round(
    (f1FinishThick - spec.floors.screedThickness - spec.floors.finishThickness.woodFloor) * 1000
  );
  const upperInsulMm = Math.round(
    (f2FinishThick - spec.floors.screedThickness - spec.floors.finishThickness.woodFloor) * 1000
  );

  const assemblies = [
    {
      code: 'K01',
      element: 'Základy a spodní stavba',
      description: `ŽB základové pasy š. ${Math.round(spec.foundations.stripWidth * 1000)} mm do nezámrzné hl. ${Math.round(spec.foundations.stripDepth * 1000)} mm, ztracené bednění, podkladní deska C25/30 tl. ${Math.round(spec.foundations.baseSlabThickness * 1000)} mm, hydroizolace, sokl XPS`,
    },
    {
      code: 'K02',
      element: 'Obvodové nosné stěny',
      description: `Keramická broušená tvárnice nosná tl. 240 mm + kontaktní zateplení ETICS tl. 140 mm (celkem ${Math.round((design.wallThickness ?? 0.38) * 1000)} mm, U ≤ 0,18 W/m²K)`,
    },
    {
      code: 'K03',
      element: 'Vnitřní nosné zdivo a příčky',
      description: `1.NP: nosné stěny tl. 240 / 175 mm, příčky tl. ${Math.round((design.partThickness ?? 0.14) * 1000)} mm; 2.NP: akustické SDK příčky W112 tl. 125 mm (2× Knauf Diamant + 75 mm vata)`,
    },
    {
      code: 'K04',
      element: 'Stropní konstrukce nad 1.NP',
      description: `${spec.slab.concrete}, monolitická ŽB deska tl. ${Math.round((design.ceilingSlab?.thickness ?? 0.22) * 1000)} mm s otvorem pro schodiště a šachtu${design.ceiling1Sdk ? ' + SDK podhled (100 mm pro VZT)' : ''}`,
    },
    {
      code: 'K05',
      element: 'Podlaha 1.NP na terénu',
      description: `Skladba celkem ${Math.round(f1FinishThick * 1000)} mm: tepelná izolace EPS 150 S tl. ${groundInsulMm} mm, anhydritový potěr ${Math.round(spec.floors.screedThickness * 1000)} mm (podlahové vytápění), dub / lepený vinyl / dlažba`,
    },
    {
      code: 'K06',
      element: 'Podlaha 2.NP',
      description: `Skladba celkem ${Math.round(f2FinishThick * 1000)} mm: kročejová izolace tl. ${upperInsulMm} mm, anhydritový potěr ${Math.round(spec.floors.screedThickness * 1000)} mm (podlahové vytápění), dub / lepený vinyl / dlažba`,
    },
    {
      code: 'K07',
      element: 'Strop nad 2.NP a krov',
      description: `Příhradové vazníky (nosný strop 2.NP + krov, sklon ${roofGeo ? roofGeo.pitchDeg.toFixed(1).replace('.', ',') : '25,4'}°), zateplení stropu ${Math.round(spec.roof.ceilingInsulationThickness * 1000)} mm minerální vlnou + SDK podhled (150 mm pro VZT), ${spec.roof.covering}`,
    },
    {
      code: 'K08',
      element: 'Výplně otvorů',
      description: `${spec.windows.label}; ${openingSchedule.items.some((i) => i.handing === 'Posuvně-sklopné (PSK)') ? (spec.windows.pskLabel || spec.windows.slidingLabel) : spec.windows.slidingLabel}; ${spec.windows.extDoorLabel}`,
    },
    {
      code: 'K09',
      element: 'TZB, vytápění a FVE',
      description: `Teplovodní podlahové vytápění s tepelným čerpadlem, řízené větrání s rekuperací tepla, střešní FVE 7,2 kWp (16 panelů) s hybridním střídačem 10 kW a baterií 10,6 kWh, zásobník TV ${spec.tzb.hotWaterBase + 2 * spec.tzb.hotWaterPerBathroom} l`,
    },
    {
      code: 'K10',
      element: 'Hospodaření s dešťovou vodou',
      description: `Podzemní akumulační nádrž 7,0 m³ s automatickou vodárnou pro zálivku zahrady a splachování toalet v 1.NP, bezpečnostní přepad do vsakovacích boxů`,
    },
    {
      code: 'K11',
      element: 'Dveřní kování a ochrana proti kolizím',
      description: `Skryté integrované omezovače úhlu otevření (95–100°) v zárubních interiérových i vchodových dveří zamezující poškození nábytku a sanity`,
    },
  ];

  return {
    meta: {
      projectTitle: 'Rodinný dům 6+kk · Vojáčkovi Troubelice',
      designId: design.id,
      designLabel: design.label,
      generatedAt: new Date().toISOString().slice(0, 10),
    },
    geometry: {
      footprintWidthM: design.footprint?.width ?? 8,
      footprintLengthM: design.footprint?.length ?? 12,
      footprintAreaSqm: volumeInfo.footprint,
      aboveGroundVolumeM3: volumeInfo.aboveGroundVolume,
      totalVolumeM3: volumeInfo.totalVolume,
      roofPitchDeg: roofGeo ? Number(roofGeo.pitchDeg.toFixed(1)) : 0,
      roofAreaSqm: roofGeo ? Number(roofGeo.area.toFixed(1)) : 0,
      roofPlanAreaSqm: roofGeo ? Number(roofGeo.planArea.toFixed(1)) : 0,
      roofOverhangEaveM: design.roof?.eaveOverhang ?? 0.45,
      roofOverhangGableM: design.roof?.gableOverhang ?? 0.35,
      f1ClearHeightM: f1ClearHeight,
      f2ClearHeightM: f2ClearHeight,
    },
    elevations: {
      groundBaseM: f1StructElev,
      floor1FinishM: f1FinishElev,
      floor2StructM: f2StructElev,
      floor2FinishM: f2FinishElev,
      eaveWallPlateM: eaveLevel,
      ridgeM: ridgeLevel,
    },
    site: siteMetrics
      ? {
          ...siteMetrics,
          widthM: siteConfig.width,
          depthM: siteConfig.depth,
          chamferM: siteConfig.chamfer,
          parcelRotationDeg: siteConfig.parcelRotationDeg,
          housePos: resolvedHousePos,
        }
      : null,
    setbacks,
    rooms: {
      floor1: floor1Rooms.rooms,
      floor2: floor2Rooms.rooms,
      all: allRooms,
    },
    roomTotals: {
      floor1InteriorSqm: floor1Rooms.interiorTotalSqm,
      floor2InteriorSqm: floor2Rooms.interiorTotalSqm,
      totalInteriorSqm,
      totalHabitableSqm,
      totalAccessorySqm,
      totalExteriorSqm,
      totalRoomVolumeM3,
    },
    glazing: {
      ...openingSchedule.summary,
      glazingRatioPct,
      byOrientation: openingSchedule.glazingByOrientation,
    },
    assemblies,
    bomSummary: bomResult.summary,
    layoutAudit: {
      errors: layoutAudit.summary.errors,
      warnings: layoutAudit.summary.warnings,
      infos: layoutAudit.summary.infos,
    },
    openingSchedule,
  };
}

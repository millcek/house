import * as THREE from 'three';

/**
 * Computes the axis-aligned 2D bounding box of a wall segment including its thickness.
 */
export function getWallBox(wallDef) {
  const [x1, z1] = wallDef.from;
  const [x2, z2] = wallDef.to;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const halfT = (wallDef.thickness ?? 0.16) / 2;
  const isHorizontal = Math.abs(dx) >= Math.abs(dz);
  const minX = Math.min(x1, x2) - (isHorizontal ? 0 : halfT);
  const maxX = Math.max(x1, x2) + (isHorizontal ? 0 : halfT);
  const minZ = Math.min(z1, z2) - (isHorizontal ? halfT : 0);
  const maxZ = Math.max(z1, z2) + (isHorizontal ? halfT : 0);

  return {
    minX: Number(minX.toFixed(4)),
    maxX: Number(maxX.toFixed(4)),
    minZ: Number(minZ.toFixed(4)),
    maxZ: Number(maxZ.toFixed(4)),
    isHorizontal,
    length: Math.hypot(dx, dz),
    thickness: wallDef.thickness ?? 0.16,
    wallDef,
  };
}

/**
 * Computes exterior, interior, and terrace bounding coordinates for a floor level
 * directly from its `walls` and `finishes` definitions.
 */
export function computeFloorBounds(floorConfig = {}, designConfig = {}) {
  const walls = floorConfig.walls || [];
  const boxes = walls.map(getWallBox);

  const fallbackHalfW = (designConfig.footprint?.width ?? 8.0) / 2;
  const fallbackHalfL = (designConfig.footprint?.length ?? 12.0) / 2;
  const extThick = designConfig.wallThickness ?? 0.38;

  let wallMinX = -fallbackHalfW;
  let wallMaxX = fallbackHalfW;
  let wallMinZ = -fallbackHalfL;
  let wallMaxZ = fallbackHalfL;

  if (boxes.length > 0) {
    wallMinX = Math.min(...boxes.map((b) => b.minX));
    wallMaxX = Math.max(...boxes.map((b) => b.maxX));
    wallMinZ = Math.min(...boxes.map((b) => b.minZ));
    wallMaxZ = Math.max(...boxes.map((b) => b.maxZ));
  }

  const eps = 0.05;
  const westWall = boxes.find((b) => !b.isHorizontal && Math.abs(b.minX - wallMinX) <= eps);
  const eastWall = boxes.find((b) => !b.isHorizontal && Math.abs(b.maxX - wallMaxX) <= eps);
  const northWall = boxes.find((b) => b.isHorizontal && Math.abs(b.minZ - wallMinZ) <= eps);
  const southWall = boxes.find((b) => b.isHorizontal && Math.abs(b.maxZ - wallMaxZ) <= eps);

  const innerMinX = westWall ? westWall.maxX : wallMinX + extThick;
  const innerMaxX = eastWall ? eastWall.minX : wallMaxX - extThick;
  const innerMinZ = northWall ? northWall.maxZ : wallMinZ + extThick;
  const innerMaxZ = southWall ? southWall.minZ : wallMaxZ - extThick;

  const terraceFinish = (floorConfig.finishes || []).find((f) => f.material === 'terrace');
  const terrace = terraceFinish
    ? {
        minX: Number((terraceFinish.pos[0] - terraceFinish.size[0] / 2).toFixed(4)),
        maxX: Number((terraceFinish.pos[0] + terraceFinish.size[0] / 2).toFixed(4)),
        minZ: Number((terraceFinish.pos[1] - terraceFinish.size[1] / 2).toFixed(4)),
        maxZ: Number((terraceFinish.pos[1] + terraceFinish.size[1] / 2).toFixed(4)),
        width: terraceFinish.size[0],
        depth: terraceFinish.size[1],
      }
    : null;

  return {
    wallMinX,
    wallMaxX,
    wallMinZ,
    wallMaxZ,
    innerMinX,
    innerMaxX,
    innerMinZ,
    innerMaxZ,
    westWall,
    eastWall,
    northWall,
    southWall,
    terrace,
  };
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

function getUncoveredFinishHoles(finishes = []) {
  const uncovered = [];
  for (const finish of finishes) {
    for (const hole of finish.holes || []) {
      const cx = (hole.x1 + hole.x2) / 2;
      const cz = (hole.z1 + hole.z2) / 2;
      const coveredByOther = finishes.some((other) => {
        if (other === finish) return false;
        const [ox, oz] = other.pos;
        const [ow, od] = other.size;
        const inBounds =
          cx >= ox - ow / 2 &&
          cx <= ox + ow / 2 &&
          cz >= oz - od / 2 &&
          cz <= oz + od / 2;
        if (!inBounds) return false;
        const inOtherHole = (other.holes || []).some(
          (oh) => cx >= oh.x1 && cx <= oh.x2 && cz >= oh.z1 && cz <= oh.z2
        );
        return !inOtherHole;
      });
      if (!coveredByOther) {
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

function inZoneBounds(cx, cz, zoneBounds) {
  if (!zoneBounds) return true;
  if (typeof zoneBounds.xMin === 'number' && cx < zoneBounds.xMin) return false;
  if (typeof zoneBounds.xMax === 'number' && cx > zoneBounds.xMax) return false;
  if (typeof zoneBounds.zMin === 'number' && cz < zoneBounds.zMin) return false;
  if (typeof zoneBounds.zMax === 'number' && cz > zoneBounds.zMax) return false;
  return true;
}

/**
 * Computes exact net floor areas (`areaSqm`) for every room from the 2D wall boxes,
 * uncovered stairwell openings, `zoneBounds` dividers, and exterior finishes.
 */
export function computeRoomAreasFromWalls(rooms = [], floorConfig = {}) {
  const walls = floorConfig.walls || [];
  if (walls.length === 0) return rooms;

  const wallBoxes = walls.map(getWallBox);
  const uncoveredHoles = getUncoveredFinishHoles(floorConfig.finishes || []);
  const terraceFinish = (floorConfig.finishes || []).find((f) => f.material === 'terrace');

  const rawXs = [];
  const rawZs = [];
  for (const b of wallBoxes) {
    rawXs.push(b.minX, b.maxX);
    rawZs.push(b.minZ, b.maxZ);
  }
  for (const h of uncoveredHoles) {
    rawXs.push(h.x1, h.x2);
    rawZs.push(h.z1, h.z2);
  }
  for (const r of rooms) {
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
  if (nx <= 0 || nz <= 0) return rooms;

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
      if (inWall || inHole) {
        blocked[i][j] = 1;
      }
    }
  }

  const findIndex = (arr, val) => {
    for (let i = 0; i < arr.length - 1; i++) {
      if (val >= arr[i] && val <= arr[i + 1]) return i;
    }
    return -1;
  };

  return rooms.map((room) => {
    if (room.interior === false) {
      if (terraceFinish?.size) {
        const areaSqm = Number((terraceFinish.size[0] * terraceFinish.size[1]).toFixed(1));
        return { ...room, areaSqm, area: `${areaSqm.toFixed(1)} m²` };
      }
      return room;
    }

    if (!Array.isArray(room.pos) || room.pos.length < 3) return room;
    const si = findIndex(xs, room.pos[0]);
    const sj = findIndex(zs, room.pos[2]);
    if (si < 0 || sj < 0 || blocked[si][sj]) return room;

    const visited = Array.from({ length: nx }, () => new Uint8Array(nz));
    const stack = [[si, sj]];
    visited[si][sj] = 1;
    let totalSqm = 0;

    while (stack.length > 0) {
      const [ci, cj] = stack.pop();
      const cellCx = (xs[ci] + xs[ci + 1]) / 2;
      const cellCz = (zs[cj] + zs[cj + 1]) / 2;
      if (!inZoneBounds(cellCx, cellCz, room.zoneBounds)) continue;

      totalSqm += (xs[ci + 1] - xs[ci]) * (zs[cj + 1] - zs[cj]);

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

    if (totalSqm <= 0.01) return room;
    const areaSqm = Number(totalSqm.toFixed(1));
    return {
      ...room,
      areaSqm,
      area: `${areaSqm.toFixed(1)} m²`,
    };
  });
}

/**
 * Renders a 3D floating canvas-texture badge for a room.
 */
export function createRoomBadge(name, areaText, color = '#ffffff') {
  const cvs = document.createElement('canvas');
  cvs.width = 256;
  cvs.height = 110;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 3;

  const r = 14;
  const x = 4;
  const y = 4;
  const w = 248;
  const h = 102;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = 'bold 23px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 40);

  ctx.fillStyle = '#60a5fa';
  ctx.font = '600 21px monospace';
  ctx.fillText(areaText, 128, 76);

  const tex = new THREE.CanvasTexture(cvs);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 1.05, 1);
  return sprite;
}

/**
 * Builds floor finish slabs (`woodFloor`, `tileFloor`, `terrace`) for a floor level.
 */
export function buildFloorFinishes(zones = [], materials, floorY = 0, floorName = '1.NP') {
  const group = new THREE.Group();
  group.name = `floor-finishes-${floorName}`;

  for (const zone of zones) {
    const [w, d] = zone.size;
    const thickness = zone.thickness ?? 0.12;
    const [x, z] = zone.pos;
    const mat = materials[zone.material] || materials.woodFloor;

    let mesh;
    if (Array.isArray(zone.holes) && zone.holes.length > 0) {
      const hw = w / 2;
      const hd = d / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-hw, -hd);
      shape.lineTo(hw, -hd);
      shape.lineTo(hw, hd);
      shape.lineTo(-hw, hd);
      shape.closePath();

      // In Shape plane rotated by -PI/2 around X: Shape Y maps to -Z in 3D
      for (const hole of zone.holes) {
        const hx1 = hole.x1 - x;
        const hx2 = hole.x2 - x;
        const hz1 = hole.z1 - z;
        const hz2 = hole.z2 - z;
        const path = new THREE.Path();
        path.moveTo(hx1, -hz1);
        path.lineTo(hx2, -hz1);
        path.lineTo(hx2, -hz2);
        path.lineTo(hx1, -hz2);
        path.closePath();
        shape.holes.push(path);
      }

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: false,
      });
      geo.rotateX(-Math.PI / 2);

      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, floorY, z);
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), mat);
      mesh.position.set(x, floorY + thickness / 2, z);
    }
    mesh.receiveShadow = true;
    mesh.userData.bim = {
      type: 'IfcCovering (Podlaha)',
      name: zone.name || 'Podlahová vrstva',
      floor: floorName,
      description: zone.material === 'terrace' ? 'Venkovní terasa' : 'Interiérová podlaha',
      parameters: {
        Rozměr: `${w.toFixed(1)} × ${d.toFixed(1)} m`,
        Plocha: `${(w * d).toFixed(1)} m²`,
        Tloušťka: `${thickness.toFixed(2)} m`,
      },
    };
    group.add(mesh);
  }

  return group;
}

/**
 * Computes normalized room schedule entries with auto-calculated areas
 * (from `floorConfig.walls` geometry when present, `dims: [w, d]`, or `areaSqm` / `area`)
 * and floor total.
 */
export function computeRoomSchedule(roomsOrFloorConfig = [], maybeFloorConfig = null) {
  const isFloorObj =
    !Array.isArray(roomsOrFloorConfig) &&
    roomsOrFloorConfig &&
    typeof roomsOrFloorConfig === 'object';
  const rawRooms = isFloorObj ? roomsOrFloorConfig.rooms || [] : roomsOrFloorConfig || [];
  const floorConfig = isFloorObj ? roomsOrFloorConfig : maybeFloorConfig;

  const roomsWithWallAreas = floorConfig?.walls?.length
    ? computeRoomAreasFromWalls(rawRooms, floorConfig)
    : rawRooms;

  const normalized = roomsWithWallAreas.map((room) => {
    let areaSqm = room.areaSqm;
    if (typeof areaSqm !== 'number' && Array.isArray(room.dims)) {
      areaSqm = Number((room.dims[0] * room.dims[1]).toFixed(1));
    }
    if (typeof areaSqm !== 'number' && typeof room.area === 'string') {
      areaSqm = parseFloat(room.area) || 0;
    }

    const areaText = `${areaSqm.toFixed(1)} m²`;
    return {
      ...room,
      areaSqm,
      area: areaText,
      interior: room.interior !== false,
    };
  });

  const interiorTotalSqm = normalized
    .filter((r) => r.interior)
    .reduce((sum, r) => sum + r.areaSqm, 0);

  return {
    rooms: normalized,
    interiorTotalSqm: Number(interiorTotalSqm.toFixed(1)),
  };
}

/**
 * Builds the 3D sprite labels group for a list of rooms.
 */
export function buildRoomLabels(rooms = [], floorConfig = null) {
  const group = new THREE.Group();
  const { rooms: normalized } = computeRoomSchedule(rooms, floorConfig);

  for (const room of normalized) {
    const badge = createRoomBadge(room.name, room.area, room.badgeColor);
    badge.position.set(room.pos[0], room.pos[1], room.pos[2]);
    group.add(badge);
  }

  return group;
}

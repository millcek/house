import * as THREE from 'three';

function resolveOpeningCenter(opening) {
  if (typeof opening.at === 'number') return opening.at;
  if (typeof opening.offset === 'number') return opening.offset;
  return 0;
}

/**
 * Creates a framed glass window or glazed door assembly in local wall coordinates.
 */
function buildAperture(opening, wallThickness, materials, floorName, wallName) {
  const group = new THREE.Group();
  const width = opening.width;
  const height = opening.height;
  const sill = opening.sill ?? 0;
  const at = resolveOpeningCenter(opening);
  const centerY = sill + height / 2;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, wallThickness + 0.02),
    materials.frame
  );
  frame.position.set(at, centerY, 0);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.05, width - 0.12), Math.max(0.05, height - 0.12), 0.04),
    materials.glass
  );
  glass.position.set(at, centerY, 0);

  const ifcType = opening.type === 'door' ? 'IfcDoor' : 'IfcWindow';
  const bimData = {
    type: ifcType,
    name: opening.name || (opening.type === 'door' ? 'Dveře' : 'Okno'),
    floor: floorName,
    description: `${ifcType} ve stěně "${wallName}"`,
    parameters: {
      Šířka: `${width.toFixed(2)} m`,
      Výška: `${height.toFixed(2)} m`,
      Parapet: `${sill.toFixed(2)} m`,
    },
  };

  frame.userData.bim = bimData;
  glass.userData.bim = bimData;

  group.add(frame, glass);
  return group;
}

/**
 * Builds a single parametric wall segment from `from: [x1, z1]` to `to: [x2, z2]`
 * and automatically slices openings (windows, doors, open passages) with sills and lintels.
 *
 * @param {Object} wallDef
 * @param {Object} materials
 * @param {number} [floorY=0]
 * @param {string} [floorName='1.NP']
 * @returns {THREE.Group}
 */
export function buildWall(wallDef, materials, floorY = 0, floorName = '1.NP') {
  const [x1, z1] = wallDef.from;
  const [x2, z2] = wallDef.to;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);

  const wallGroup = new THREE.Group();
  wallGroup.name = wallDef.id || 'wall';
  wallGroup.position.set(x1, floorY, z1);
  wallGroup.rotation.y = -Math.atan2(dz, dx);

  if (length <= 0.001) return wallGroup;

  const height = wallDef.height;
  const thickness = wallDef.thickness;
  const matKey = wallDef.material || 'wall';
  const wallMat = materials[matKey] || materials.wall;
  const wallName = wallDef.name || wallDef.id || 'Stěna';

  const wallBim = {
    type: matKey === 'partition' ? 'IfcWall (Příčka)' : 'IfcWallStandardCase',
    name: wallName,
    floor: floorName,
    description: matKey === 'partition' ? 'Vnitřní dělicí příčka' : 'Obvodová nosná stěna',
    parameters: {
      Délka: `${length.toFixed(2)} m`,
      Výška: `${height.toFixed(2)} m`,
      Tloušťka: `${thickness.toFixed(2)} m`,
    },
  };

  const addSolidBox = (uStart, uEnd, yBottom, yTop) => {
    const segLen = uEnd - uStart;
    const segH = yTop - yBottom;
    if (segLen <= 0.005 || segH <= 0.005) return;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, segH, thickness), wallMat);
    mesh.position.set((uStart + uEnd) / 2, (yBottom + yTop) / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.bim = wallBim;
    wallGroup.add(mesh);
  };

  const openings = [...(wallDef.openings || [])]
    .map((op) => {
      const center = resolveOpeningCenter(op);
      const start = Math.max(0, center - op.width / 2);
      const end = Math.min(length, center + op.width / 2);
      return { ...op, center, start, end };
    })
    .sort((a, b) => a.start - b.start);

  let cursor = 0;

  for (const op of openings) {
    // Solid full-height wall before this opening
    if (op.start > cursor + 0.005) {
      addSolidBox(cursor, op.start, 0, height);
    }

    const sill = op.sill ?? 0;
    const opTop = sill + op.height;

    // Sill below opening
    if (sill > 0.005) {
      addSolidBox(op.start, op.end, 0, Math.min(sill, height));
    }

    // Lintel above opening
    if (opTop < height - 0.005) {
      addSolidBox(op.start, op.end, opTop, height);
    }

    // Glazed/framed aperture unless it's a pure open passage
    if (op.type !== 'opening') {
      wallGroup.add(buildAperture(op, thickness, materials, floorName, wallName));
    }

    cursor = Math.max(cursor, op.end);
  }

  // Remaining solid wall after the last opening
  if (cursor < length - 0.005) {
    addSolidBox(cursor, length, 0, height);
  }

  return wallGroup;
}

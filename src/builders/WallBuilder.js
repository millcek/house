import * as THREE from 'three';

function resolveOpeningCenter(opening) {
  if (typeof opening.at === 'number') return opening.at;
  if (typeof opening.offset === 'number') return opening.offset;
  return 0;
}

/**
 * Creates a framed glass window or glazed door assembly in local wall coordinates.
 */
function buildAperture(opening, wallThickness, materials, floorName, wallName, floorY = 0) {
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
  frame.userData.wallSlice = {
    worldYBottom: floorY + sill,
    worldYTop: floorY + sill + height,
    yBottom: sill,
    yTop: sill + height,
  };

  const glassH = Math.max(0.05, height - 0.12);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.05, width - 0.12), glassH, 0.04),
    materials.glass
  );
  glass.position.set(at, centerY, 0);
  glass.userData.wallSlice = {
    worldYBottom: floorY + centerY - glassH / 2,
    worldYTop: floorY + centerY + glassH / 2,
    yBottom: centerY - glassH / 2,
    yTop: centerY + glassH / 2,
  };

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
 * Creates a 3D door assembly (obložková zárubeň, plné/prosklené křídlo, klika)
 * with IfcDoor BIM metadata in local wall coordinates.
 */
function buildDoorAssembly(opening, wallDef, materials, floorName, wallName, floorY = 0) {
  const group = new THREE.Group();
  const width = opening.width;
  const height = opening.height;
  const sill = opening.sill ?? 0;
  const at = resolveOpeningCenter(opening);
  const wallThickness = wallDef.thickness ?? 0.16;
  const isExterior = (wallDef.material || 'wall') === 'wall';
  const isGlazed = Boolean(opening.glazed);
  const isSliding = Boolean(opening.sliding);

  const frameThick = 0.045;
  const frameDepth = wallThickness + 0.03;
  const frameMat = isExterior ? materials.frame : materials.doorLeaf || materials.frame;
  const leafMat = isExterior
    ? materials.doorLeafExt || materials.frame
    : materials.doorLeaf || materials.stair || materials.frame;
  const handleMat = materials.doorHandle || materials.frame;

  const swingInfo = opening.swing
    ? `${opening.swing.hinge === 'end' ? 'panty u konce' : 'panty u začátku'} → ${opening.swing.dir}`
    : isSliding
      ? 'Posuvné'
      : 'Otočné';
  const variantLabel = isExterior
    ? 'Vchodové tepelněizolační dveře'
    : isGlazed
      ? 'Vnitřní prosklené dveře'
      : 'Vnitřní plné dveře';

  const bimData = {
    type: 'IfcDoor',
    name: opening.name || 'Dveře',
    floor: floorName,
    description: `${variantLabel} ve stěně "${wallName}"`,
    parameters: {
      Šířka: `${width.toFixed(2)} m`,
      Výška: `${height.toFixed(2)} m`,
      Práh: `${sill.toFixed(2)} m`,
      Provedení: variantLabel,
      Otevírání: swingInfo,
    },
  };

  const addPart = (w, h, d, x, y, z, mat) => {
    if (w <= 0.005 || h <= 0.005 || d <= 0.005) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.bim = bimData;
    mesh.userData.wallSlice = {
      worldYBottom: floorY + y - h / 2,
      worldYTop: floorY + y + h / 2,
      yBottom: y - h / 2,
      yTop: y + h / 2,
    };
    group.add(mesh);
  };

  // 1. Casing frame (boční stojky + nadpraží obložkové zárubně)
  addPart(frameThick, height, frameDepth, at - width / 2 + frameThick / 2, sill + height / 2, 0, frameMat);
  addPart(frameThick, height, frameDepth, at + width / 2 - frameThick / 2, sill + height / 2, 0, frameMat);
  addPart(
    Math.max(0.05, width - 2 * frameThick),
    frameThick,
    frameDepth,
    at,
    sill + height - frameThick / 2,
    0,
    frameMat
  );

  // 2. Door leaf (křídlo tl. 45 mm)
  const leafW = Math.max(0.1, width - 2 * frameThick);
  const leafH = Math.max(0.1, height - frameThick);
  const leafT = 0.045;
  const leafCenterY = sill + leafH / 2;

  if (isGlazed) {
    const stile = Math.min(0.11, leafW * 0.2);
    const railTop = 0.11;
    const railBottom = 0.16;
    const glassW = Math.max(0.08, leafW - 2 * stile);
    const glassH = Math.max(0.1, leafH - railTop - railBottom);
    const glassCenterY = sill + railBottom + glassH / 2;

    addPart(stile, leafH, leafT, at - leafW / 2 + stile / 2, leafCenterY, 0, leafMat);
    addPart(stile, leafH, leafT, at + leafW / 2 - stile / 2, leafCenterY, 0, leafMat);
    addPart(glassW, railTop, leafT, at, sill + leafH - railTop / 2, 0, leafMat);
    addPart(glassW, railBottom, leafT, at, sill + railBottom / 2, 0, leafMat);
    addPart(glassW, glassH, 0.02, at, glassCenterY, 0, materials.glass);
  } else if (isExterior && width >= 1.05) {
    // Main entrance door with vertical glazed strip on latch side
    const latchSign = opening.swing?.hinge === 'end' ? -1 : 1;
    const stripW = 0.14;
    const stripH = Math.max(0.2, leafH - 0.36);
    const stripX = at + latchSign * (leafW * 0.22);
    const leftEdge = at - leafW / 2;
    const rightEdge = at + leafW / 2;
    const sLeft = stripX - stripW / 2;
    const sRight = stripX + stripW / 2;

    addPart(Math.max(0.05, sLeft - leftEdge), leafH, leafT, (leftEdge + sLeft) / 2, leafCenterY, 0, leafMat);
    addPart(Math.max(0.05, rightEdge - sRight), leafH, leafT, (sRight + rightEdge) / 2, leafCenterY, 0, leafMat);
    addPart(stripW, 0.18, leafT, stripX, sill + leafH - 0.09, 0, leafMat);
    addPart(stripW, 0.18, leafT, stripX, sill + 0.09, 0, leafMat);
    addPart(stripW, stripH, 0.025, stripX, leafCenterY, 0, materials.glass);
  } else {
    addPart(leafW, leafH, leafT, at, leafCenterY, 0, leafMat);
  }

  // 3. Door handle on latch side (klika ve výšce 1050 mm nad prahem)
  const latchSign = opening.swing?.hinge === 'end' ? -1 : 1;
  const handleX = at + latchSign * (leafW / 2 - 0.075);
  const handleY = sill + Math.min(1.05, leafH * 0.52);
  addPart(0.11, 0.028, leafT + 0.07, handleX - latchSign * 0.035, handleY, 0, handleMat);

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

  const isStructural = wallDef.structural === true || matKey === 'wall';
  const wallBim = {
    type:
      matKey === 'partition'
        ? isStructural
          ? 'IfcWallStandardCase (Vnitřní nosná stěna)'
          : 'IfcWall (Příčka)'
        : 'IfcWallStandardCase',
    name: wallName,
    floor: floorName,
    description:
      matKey === 'partition'
        ? isStructural
          ? 'Vnitřní nosná stěna'
          : 'Vnitřní dělicí příčka'
        : 'Obvodová nosná stěna',
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
    mesh.userData.wallSlice = {
      worldYBottom: floorY + yBottom,
      worldYTop: floorY + yTop,
      yBottom,
      yTop,
    };
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

    // Glazed/framed window or 3D door assembly
    const isDoor =
      op.type === 'door' || Boolean(op.swing) || (op.type !== 'window' && Boolean(op.sliding));
    if (isDoor) {
      wallGroup.add(buildDoorAssembly(op, wallDef, materials, floorName, wallName, floorY));
    } else if (op.type !== 'opening') {
      wallGroup.add(buildAperture(op, thickness, materials, floorName, wallName, floorY));
    }

    cursor = Math.max(cursor, op.end);
  }

  // Remaining solid wall after the last opening
  if (cursor < length - 0.005) {
    addSolidBox(cursor, length, 0, height);
  }

  return wallGroup;
}

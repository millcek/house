import * as THREE from 'three';
import { buildGableRoof } from './SlabAndRoofBuilder.js';

/**
 * Builds the 40×27m chamfered plot, coordinate grid, boundary polygon, and adjacent roads.
 */
export function buildPlot(plotGroup, siteConfig, materials) {
  const { width, depth, chamfer, roadWidth } = siteConfig;
  const hw = width / 2;
  const hd = depth / 2;

  // Plot ground with chamfered SE corner
  const plotShape = new THREE.Shape();
  plotShape.moveTo(-hw, hd);
  plotShape.lineTo(hw, hd);
  plotShape.lineTo(hw, -hd + chamfer);
  plotShape.lineTo(hw - chamfer, -hd);
  plotShape.lineTo(-hw, -hd);
  plotShape.closePath();

  const groundMesh = new THREE.Mesh(new THREE.ShapeGeometry(plotShape), materials.ground);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  plotGroup.add(groundMesh);

  // 1m coordinate grid
  const gridHelper = new THREE.GridHelper(depth, depth, 0x1f2937, 0x3d5c31);
  gridHelper.position.y = 0.02;
  plotGroup.add(gridHelper);

  // White boundary line matching chamfered pentagon
  const boundaryPts = [
    new THREE.Vector3(-hw, 0.03, -hd),
    new THREE.Vector3(hw, 0.03, -hd),
    new THREE.Vector3(hw, 0.03, hd - chamfer),
    new THREE.Vector3(hw - chamfer, 0.03, hd),
    new THREE.Vector3(-hw, 0.03, hd),
    new THREE.Vector3(-hw, 0.03, -hd),
  ];
  const boundaryLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(boundaryPts),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
  );
  plotGroup.add(boundaryLine);

  // Right road (+X)
  const rightRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, depth + roadWidth * 2),
    materials.road
  );
  rightRoad.rotation.x = -Math.PI / 2;
  rightRoad.position.set(hw + roadWidth / 2, -0.01, 0);
  rightRoad.receiveShadow = true;
  plotGroup.add(rightRoad);

  // Front road (+Z)
  const frontRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(width + roadWidth * 2, roadWidth),
    materials.road
  );
  frontRoad.rotation.x = -Math.PI / 2;
  frontRoad.position.set(0, -0.01, hd + roadWidth / 2);
  frontRoad.receiveShadow = true;
  plotGroup.add(frontRoad);

  return { gridHelper, groundMesh };
}

/**
 * Builds the 3D Compass Rose indicator in world coordinates next to the northern boundary.
 */
export function buildCompassRose() {
  const compassGroup = new THREE.Group();
  compassGroup.position.set(-20, 0.05, -24);

  const disc = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 3.8, 32),
    new THREE.MeshBasicMaterial({
      color: 0x18191c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    })
  );
  disc.rotation.x = -Math.PI / 2;
  compassGroup.add(disc);

  const outerCurve = new THREE.EllipseCurve(0, 0, 3.8, 3.8, 0, 2 * Math.PI, false, 0);
  const outerGeo = new THREE.BufferGeometry().setFromPoints(
    outerCurve.getPoints(64).map((p) => new THREE.Vector3(p.x, 0.02, p.y))
  );
  compassGroup.add(
    new THREE.Line(
      outerGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
    )
  );

  // Red North Arrow (-Z)
  const northArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 3.0, 4),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  northArrow.rotation.x = -Math.PI / 2;
  northArrow.position.set(0, 0.06, -1.6);
  compassGroup.add(northArrow);

  // Grey South Arrow (+Z)
  const southArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.2, 4),
    new THREE.MeshBasicMaterial({ color: 0x9ca3af })
  );
  southArrow.rotation.x = Math.PI / 2;
  southArrow.position.set(0, 0.06, 1.3);
  compassGroup.add(southArrow);

  // East-West line
  const ewGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.8, 0.05, 0),
    new THREE.Vector3(2.8, 0.05, 0),
  ]);
  compassGroup.add(
    new THREE.Line(
      ewGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    )
  );

  function makeLabel(text, color = '#ffffff', fontSize = 38) {
    const cvs = document.createElement('canvas');
    cvs.width = 128;
    cvs.height = 128;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    const tex = new THREE.CanvasTexture(cvs);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(1.8, 1.8, 1);
    return sprite;
  }

  const lblN = makeLabel('S (Sever)', '#ef4444', 32);
  lblN.position.set(0, 0.4, -4.2);
  const lblS = makeLabel('J (Jih)', '#9ca3af', 34);
  lblS.position.set(0, 0.4, 4.0);
  const lblE = makeLabel('V', '#ffffff', 38);
  lblE.position.set(4.0, 0.4, 0);
  const lblW = makeLabel('Z', '#ffffff', 38);
  lblW.position.set(-4.0, 0.4, 0);

  compassGroup.add(lblN, lblS, lblE, lblW);
  return compassGroup;
}

/**
 * Builds the auxiliary building: Workshop (6×7m) + Covered Parking (5×7m) + Connecting Canopy.
 */
export function buildAuxiliaryBuilding(auxConfig, materials) {
  const group = new THREE.Group();
  group.name = 'auxiliary-building';

  const {
    parkWidth,
    workshopWidth,
    depth,
    wallHeight,
    roofHeight,
    position,
    canopy,
  } = auxConfig;
  const totalWidth = parkWidth + workshopWidth;

  // 1. Workshop (West section)
  const workshopRelX = -totalWidth / 2 + workshopWidth / 2;
  const workshop = new THREE.Mesh(
    new THREE.BoxGeometry(workshopWidth, wallHeight, depth),
    materials.auxWall
  );
  workshop.position.set(workshopRelX, wallHeight / 2, 0);
  workshop.castShadow = true;
  workshop.receiveShadow = true;
  workshop.userData.bim = {
    type: 'IfcBuilding (Dílna)',
    name: 'Zahradní dílna',
    floor: 'Pozemek',
    description: 'Zděná dílna navazující na kryté stání',
    parameters: {
      Rozměry: `${workshopWidth} × ${depth} m (${workshopWidth * depth} m²)`,
      Výška: `${wallHeight} m`,
    },
  };
  group.add(workshop);

  // 2. Covered Parking (East section)
  const parkRelX = totalWidth / 2 - parkWidth / 2;

  const parkFloor = new THREE.Mesh(
    new THREE.BoxGeometry(parkWidth, 0.08, depth),
    materials.auxFloor
  );
  parkFloor.position.set(parkRelX, 0.04, 0);
  parkFloor.receiveShadow = true;
  parkFloor.userData.bim = {
    type: 'IfcSlab (Parkování)',
    name: 'Kryté parkovací stání',
    floor: 'Pozemek',
    description: 'Zastřešené parkování pro 2 vozy',
    parameters: {
      Rozměry: `${parkWidth} × ${depth} m (${parkWidth * depth} m²)`,
    },
  };
  group.add(parkFloor);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(parkWidth, wallHeight, 0.25),
    materials.auxWall
  );
  backWall.position.set(parkRelX, wallHeight / 2, -depth / 2 + 0.125);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  const pillarGeo = new THREE.BoxGeometry(0.25, wallHeight, 0.25);
  const pillars = [
    [parkRelX + parkWidth / 2 - 0.15, depth / 2 - 0.15],
    [parkRelX + parkWidth / 2 - 0.15, -depth / 2 + 0.15],
    [parkRelX - parkWidth / 2 + 0.15, depth / 2 - 0.15],
  ];
  for (const [px, pz] of pillars) {
    const col = new THREE.Mesh(pillarGeo, materials.auxPillar);
    col.position.set(px, wallHeight / 2, pz);
    col.castShadow = true;
    group.add(col);
  }

  // 3. Common gable roof (perpendicular ridge along X)
  const roof = buildGableRoof(
    {
      width: totalWidth,
      length: depth,
      height: roofHeight,
      y: wallHeight,
      ridgeAxis: 'x',
      name: 'Střecha dílny a stání',
    },
    materials.auxRoof
  );
  group.add(roof);

  // 4. Covered walkway / canopy connecting parking to house
  if (canopy) {
    const [cw, ch, cd] = canopy.size;
    const [cx, cy, cz] = canopy.pos;
    const canopyMesh = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), materials.auxRoof);
    canopyMesh.position.set(cx, cy, cz);
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    group.add(canopyMesh);

    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(canopy.walkWidth, 0.04, cd),
      materials.auxFloor
    );
    walkway.position.set(cx, 0.02, cz);
    walkway.receiveShadow = true;
    group.add(walkway);

    const canopyPillarGeo = new THREE.BoxGeometry(0.14, 2.5, 0.14);
    for (const [px, pz] of canopy.pillars) {
      const pMesh = new THREE.Mesh(canopyPillarGeo, materials.auxPillar);
      pMesh.position.set(px, 1.25, pz);
      pMesh.castShadow = true;
      group.add(pMesh);
    }
  }

  group.position.set(position[0], position[1], position[2]);
  return group;
}

/**
 * Dynamically updates the dashed setback dimension lines in `setbackGroup`
 * based on the current house position/rotation and returns live distance metrics.
 */
export function updateSetbackDimensions(setbackGroup, siteConfig, housePos, auxConfig, houseFootprint = { width: 8, length: 12 }) {
  setbackGroup.clear();

  const hw = siteConfig.width / 2; // 13.5
  const hd = siteConfig.depth / 2; // 20.0

  const rad = THREE.MathUtils.degToRad(housePos.rotY || 0);
  const halfExtX =
    Math.abs((houseFootprint.width / 2) * Math.cos(rad)) +
    Math.abs((houseFootprint.length / 2) * Math.sin(rad));
  const halfExtZ =
    Math.abs((houseFootprint.width / 2) * Math.sin(rad)) +
    Math.abs((houseFootprint.length / 2) * Math.cos(rad));

  const houseMaxX = housePos.x + halfExtX;
  const houseMinZ = housePos.z - halfExtZ;
  const houseMaxZ = housePos.z + halfExtZ;

  const auxTotalWidth = auxConfig.parkWidth + auxConfig.workshopWidth;
  const auxMaxX = auxConfig.position[0] + auxTotalWidth / 2;
  const auxMinZ = auxConfig.position[2] - auxConfig.depth / 2;
  const auxMaxZ = auxConfig.position[2] + auxConfig.depth / 2;

  const lineMatRed = new THREE.LineDashedMaterial({
    color: 0xef4444,
    dashSize: 0.6,
    gapSize: 0.4,
  });
  const lineMatBlue = new THREE.LineDashedMaterial({
    color: 0x3b82f6,
    dashSize: 0.6,
    gapSize: 0.4,
  });

  const addDashedLine = (p1, p2, mat) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(p1[0], 0.08, p1[1]),
      new THREE.Vector3(p2[0], 0.08, p2[1]),
    ]);
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    setbackGroup.add(line);
  };

  // 1. House top setback (Z = -hd to houseMinZ)
  addDashedLine([houseMaxX, -hd], [houseMaxX, houseMinZ], lineMatRed);

  // 2. House right street setback (houseMaxX to hw)
  addDashedLine([houseMaxX, housePos.z], [hw, housePos.z], lineMatRed);

  // 3. Auxiliary building right street setback (auxMaxX to hw)
  addDashedLine([auxMaxX, auxConfig.position[2]], [hw, auxConfig.position[2]], lineMatRed);

  // 4. Gap between auxiliary building and house (auxMaxZ to houseMinZ)
  addDashedLine([housePos.x, auxMaxZ], [housePos.x, houseMinZ], lineMatBlue);

  return {
    streetRight: Number((hw - houseMaxX).toFixed(1)),
    houseWorkshopGap: Number((houseMinZ - auxMaxZ).toFixed(1)),
    houseTop: Number((houseMinZ - -hd).toFixed(1)),
    workshopTop: Number((auxMinZ - -hd).toFixed(1)),
    houseFront: Number((hd - houseMaxZ).toFixed(1)),
  };
}

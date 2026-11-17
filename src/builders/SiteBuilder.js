import * as THREE from 'three';
import { buildGableRoof } from './SlabAndRoofBuilder.js';
import { createRoomBadge } from './RoomBuilder.js';

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

/**
 * Computes built-up area breakdown (m² and % of gross plot area) for the plot,
 * main house, workshop, covered parking, terrace, and connecting canopy.
 */
export function computeBuiltUpArea(siteConfig, auxConfig, houseDesign) {
  const plotGrossSqm = Number((siteConfig.width * siteConfig.depth).toFixed(1));
  const chamfer = siteConfig.chamfer || 0;
  const chamferSqm = 0.5 * chamfer * chamfer;
  const plotNetSqm = Number((plotGrossSqm - chamferSqm).toFixed(1));

  const houseWidth = houseDesign?.footprint?.width ?? 8;
  const houseLength = houseDesign?.footprint?.length ?? 12;
  const houseSqm = Number((houseWidth * houseLength).toFixed(1));

  const workshopSqm = Number((auxConfig.workshopWidth * auxConfig.depth).toFixed(1));
  const parkingSqm = Number((auxConfig.parkWidth * auxConfig.depth).toFixed(1));

  const terraceRoom = houseDesign?.floor1?.rooms?.find(
    (r) => r.id === '1.08' || r.interior === false
  );
  const terraceSqm = Number((terraceRoom?.areaSqm ?? 28.0).toFixed(1));

  const canopySqm = auxConfig.canopy
    ? Number((auxConfig.canopy.size[0] * auxConfig.canopy.size[2]).toFixed(1))
    : 0;

  const buildingsSqm = Number((houseSqm + workshopSqm + parkingSqm).toFixed(1));
  const accessoriesSqm = Number((terraceSqm + canopySqm).toFixed(1));
  const totalBuiltUpSqm = Number((buildingsSqm + accessoriesSqm).toFixed(1));
  const freeGardenSqm = Number((plotGrossSqm - totalBuiltUpSqm).toFixed(1));

  const pct = (sqm) => (plotGrossSqm > 0 ? Number(((sqm / plotGrossSqm) * 100).toFixed(1)) : 0);

  const houseRatioPct = pct(houseSqm);
  const workshopRatioPct = pct(workshopSqm);
  const parkingRatioPct = pct(parkingSqm);
  const terraceRatioPct = pct(terraceSqm);
  const canopyRatioPct = pct(canopySqm);
  const buildingsRatioPct = pct(buildingsSqm);
  const accessoriesRatioPct = pct(accessoriesSqm);
  const totalRatioPct = pct(totalBuiltUpSqm);
  const freeRatioPct = Number((100 - totalRatioPct).toFixed(1));

  return {
    plotGrossSqm,
    chamferSqm,
    plotNetSqm,
    houseSqm,
    workshopSqm,
    parkingSqm,
    terraceSqm,
    canopySqm,
    buildingsSqm,
    accessoriesSqm,
    totalBuiltUpSqm,
    freeGardenSqm,
    houseRatioPct,
    workshopRatioPct,
    parkingRatioPct,
    terraceRatioPct,
    canopyRatioPct,
    buildingsRatioPct,
    accessoriesRatioPct,
    totalRatioPct,
    freeRatioPct,
  };
}

function disposeGroupResources(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
  group.clear();
}

function createFootprintZone({ width, depth, color, label, areaText, x = 0, z = 0, y = 0.06 }) {
  const zoneGroup = new THREE.Group();
  zoneGroup.position.set(x, 0, z);

  const fillGeo = new THREE.PlaneGeometry(width, depth);
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.rotation.x = -Math.PI / 2;
  fillMesh.position.y = y;
  fillMesh.renderOrder = 4;
  zoneGroup.add(fillMesh);

  const hw = width / 2;
  const hd = depth / 2;
  const outlineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, y, -hd),
    new THREE.Vector3(hw, y, -hd),
    new THREE.Vector3(hw, y, hd),
    new THREE.Vector3(-hw, y, hd),
  ]);
  const outlineMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const outlineLoop = new THREE.LineLoop(outlineGeo, outlineMat);
  outlineLoop.renderOrder = 5;
  zoneGroup.add(outlineLoop);

  const badge = createRoomBadge(label, areaText, '#ffffff');
  badge.position.set(0, 0.4, 0);
  badge.renderOrder = 10;
  zoneGroup.add(badge);

  return zoneGroup;
}

/**
 * Updates 3D translucent built-up area footprints, outlines, and badges in `footprintGroup`.
 */
export function updateFootprintOverlay(
  footprintGroup,
  siteConfig,
  housePos,
  auxConfig,
  houseDesign
) {
  disposeGroupResources(footprintGroup);

  const metrics = computeBuiltUpArea(siteConfig, auxConfig, houseDesign);
  const houseWidth = houseDesign?.footprint?.width ?? 8;
  const houseLength = houseDesign?.footprint?.length ?? 12;

  const terraceFinish = houseDesign?.floor1?.finishes?.find((f) => f.material === 'terrace');
  const [terraceW, terraceD] = terraceFinish?.size || [4.0, 6.8];
  const [terraceX, terraceZ] = terraceFinish?.pos || [-6.0, 3.2];

  // House & Terrace group (follows housePos X, Z, RotY)
  const houseOverlayGroup = new THREE.Group();
  houseOverlayGroup.position.set(housePos.x, 0, housePos.z);
  houseOverlayGroup.rotation.y = THREE.MathUtils.degToRad(housePos.rotY || 0);

  houseOverlayGroup.add(
    createFootprintZone({
      width: houseWidth,
      depth: houseLength,
      color: 0x3b82f6,
      label: 'Hlavní dům',
      areaText: `${metrics.houseSqm.toFixed(1)} m² (${metrics.houseRatioPct.toFixed(1)} %)`,
    })
  );

  houseOverlayGroup.add(
    createFootprintZone({
      width: terraceW,
      depth: terraceD,
      color: 0xf59e0b,
      label: 'Terasa (JZ)',
      areaText: `${metrics.terraceSqm.toFixed(1)} m² (${metrics.terraceRatioPct.toFixed(1)} %)`,
      x: terraceX,
      z: terraceZ,
    })
  );

  footprintGroup.add(houseOverlayGroup);

  // Auxiliary building parts (Workshop, Covered Parking, Canopy)
  const totalAuxWidth = auxConfig.parkWidth + auxConfig.workshopWidth;
  const workshopRelX = -totalAuxWidth / 2 + auxConfig.workshopWidth / 2;
  const parkRelX = totalAuxWidth / 2 - auxConfig.parkWidth / 2;
  const [auxX, , auxZ] = auxConfig.position;

  footprintGroup.add(
    createFootprintZone({
      width: auxConfig.workshopWidth,
      depth: auxConfig.depth,
      color: 0x10b981,
      label: 'Zahradní dílna',
      areaText: `${metrics.workshopSqm.toFixed(1)} m² (${metrics.workshopRatioPct.toFixed(1)} %)`,
      x: auxX + workshopRelX,
      z: auxZ,
    })
  );

  footprintGroup.add(
    createFootprintZone({
      width: auxConfig.parkWidth,
      depth: auxConfig.depth,
      color: 0x06b6d4,
      label: 'Kryté parkování',
      areaText: `${metrics.parkingSqm.toFixed(1)} m² (${metrics.parkingRatioPct.toFixed(1)} %)`,
      x: auxX + parkRelX,
      z: auxZ,
    })
  );

  if (auxConfig.canopy) {
    footprintGroup.add(
      createFootprintZone({
        width: auxConfig.canopy.size[0],
        depth: auxConfig.canopy.size[2],
        color: 0xa855f7,
        label: 'Kryté loubí',
        areaText: `${metrics.canopySqm.toFixed(1)} m² (${metrics.canopyRatioPct.toFixed(1)} %)`,
        x: auxX + auxConfig.canopy.pos[0],
        z: auxZ + auxConfig.canopy.pos[2],
      })
    );
  }

  return metrics;
}

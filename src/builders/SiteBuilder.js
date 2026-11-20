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

  // Podzemní akumulační nádrž na dešťovou vodu (7 m³)
  const tankX = 1.5;
  const tankZ = -7.5;
  const tankGroup = new THREE.Group();
  tankGroup.name = 'rainwater-retention-tank';
  tankGroup.position.set(tankX, 0, tankZ);

  // Podzemní těleso nádrže (průměr 2,4 m, výška 2,0 m, uložené pod terénem)
  const tankBodyGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.0, 24);
  const tankBodyMat = materials.rainwaterTank || materials.auxWall;
  const tankBodyMesh = new THREE.Mesh(tankBodyGeo, tankBodyMat);
  tankBodyMesh.position.y = -1.1;
  tankGroup.add(tankBodyMesh);

  // Pochozí revizní poklop nádrže (průměr 0,70 m, výška 0,05 m na úrovni terénu)
  const coverGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.05, 24);
  const coverMat = materials.rainwaterTank || materials.auxPillar;
  const coverMesh = new THREE.Mesh(coverGeo, coverMat);
  coverMesh.position.y = 0.035;
  coverMesh.castShadow = true;
  coverMesh.receiveShadow = true;

  coverMesh.userData.bim = {
    type: 'IfcDistributionChamberElement (Dešťová nádrž)',
    name: 'Podzemní akumulační nádrž na dešťovou vodu (7 m³)',
    floor: 'Pozemek',
    description: 'Samonosná podzemní nádrž pro zálivku zahrady a splachování toalet v 1.NP',
    parameters: {
      'Užitný objem': '7 000 l (7,0 m³)',
      'Průměr a hloubka': 'Ø 2,4 m, hloubka 2,0 m (poklop Ø 0,70 m)',
      'Využití vody': 'Zálivka zahrady + splachování WC 1.03 v 1.NP',
      'Vybavení': 'Ponorné automatické tlakové čerpadlo, filtrační koš, bezpečnostní přepad',
      'Přepad': 'Bezpečnostní přepad do vsakovacích boxů',
    },
  };
  tankGroup.add(coverMesh);
  plotGroup.add(tankGroup);

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
    roofType = 'gable',
    roofHeight,
    position,
    canopy,
    eastWalkway,
    workshopGap = 0,
    layout = 'east-west',
  } = auxConfig;

  const isStacked = layout === 'stacked-north-south';

  if (isStacked) {
    const width = auxConfig.width ?? 6.5;
    const parkDepth = auxConfig.parkDepth ?? 6.0;
    const wsDepth = auxConfig.workshopDepth ?? 4.0;
    const totalDepth = parkDepth + wsDepth; // 10.0m

    const wsRelZ = -totalDepth / 2 + wsDepth / 2; // -3.0
    const parkRelZ = totalDepth / 2 - parkDepth / 2; // +2.0

    // 1. Workshop (North section: 6.5 x 4.0 m)
    const workshop = new THREE.Mesh(
      new THREE.BoxGeometry(width, wallHeight, wsDepth),
      materials.auxWall
    );
    workshop.position.set(0, wallHeight / 2, wsRelZ);
    workshop.castShadow = true;
    workshop.receiveShadow = true;
    workshop.userData.bim = {
      type: 'IfcBuilding (Dílna)',
      name: 'Zahradní dílna',
      floor: 'Pozemek',
      description: 'Zděná dílna na severní straně krytého stání',
      parameters: {
        Rozměry: `${width} × ${wsDepth} m (${width * wsDepth} m²)`,
        Výška: `${wallHeight} m`,
      },
    };
    group.add(workshop);

    // Otvory dílny
    const openingMats = {
      gate: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5 }),
      door: new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5 }),
      window: materials.glass,
    };
    for (const o of auxConfig.workshopOpenings ?? []) {
      const t = 0.06;
      const alongX = o.wall === 'S' || o.wall === 'N';
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? o.width : t, o.height, alongX ? t : o.width),
        openingMats[o.kind] ?? openingMats.door
      );
      const y = o.sill + o.height / 2;
      const half = (alongX ? wsDepth : width) / 2 + t / 2 - 0.01;
      if (o.wall === 'S') mesh.position.set(o.offset, y, wsRelZ + half);
      if (o.wall === 'N') mesh.position.set(o.offset, y, wsRelZ - half);
      if (o.wall === 'E') mesh.position.set(half, y, wsRelZ + o.offset);
      if (o.wall === 'W') mesh.position.set(-half, y, wsRelZ + o.offset);
      mesh.userData.bim = {
        type: o.kind === 'window' ? 'IfcWindow' : 'IfcDoor',
        name: o.name,
        floor: 'Pozemek',
        description: `Otvor dílny ${o.id}`,
        parameters: {
          Rozměr: `${Math.round(o.width * 1000)} × ${Math.round(o.height * 1000)} mm`,
          Parapet: `${Math.round(o.sill * 1000)} mm`,
        },
      };
      group.add(mesh);
    }

    // 2. Covered Parking (South section: 6.5 x 6.0 m)
    const parkFloor = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, parkDepth),
      materials.auxFloor
    );
    parkFloor.position.set(0, 0.04, parkRelZ);
    parkFloor.receiveShadow = true;
    parkFloor.userData.bim = {
      type: 'IfcSlab (Parkování)',
      name: 'Kryté parkovací stání',
      floor: 'Pozemek',
      description: 'Zastřešené parkování pro 2 vozy navazující na dům',
      parameters: {
        Rozměry: `${width} × ${parkDepth} m (${width * parkDepth} m²)`,
      },
    };
    group.add(parkFloor);

    // Sloupky krytého stání (oboustranně otevřené – průchozí z předního dvora přímo do zahrady)
    const pillars = [
      // Východní strana (vjezd pro auta)
      [width / 2 - 0.15, parkRelZ + parkDepth / 2 - 0.15],
      [width / 2 - 0.15, parkRelZ],
      [width / 2 - 0.15, parkRelZ - parkDepth / 2 + 0.15],
      // Západní strana (volný průchod do zahrady)
      [-width / 2 + 0.15, parkRelZ + parkDepth / 2 - 0.15],
      [-width / 2 + 0.15, parkRelZ],
      [-width / 2 + 0.15, parkRelZ - parkDepth / 2 + 0.15],
    ];
    for (const [px, pz] of pillars) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, wallHeight, 0.22), materials.auxPillar);
      col.position.set(px, wallHeight / 2, pz);
      col.castShadow = true;
      group.add(col);
    }

    // 3. Plochá střecha s atikou a hydroizolací (2× SBS pás s břidličným posypem / fólie)
    const roofGroup = new THREE.Group();
    roofGroup.name = 'Plochá střecha s atikou (hydroizolace SBS / lepenka)';

    const roofSlab = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.22, totalDepth),
      materials.auxRoof
    );
    roofSlab.position.set(0, wallHeight + 0.11, 0);
    roofSlab.castShadow = true;
    roofSlab.receiveShadow = true;
    roofGroup.add(roofSlab);

    // Povrch hydroizolace ploché střechy (antracitový břidličný posyp / UV ochrana)
    const membraneMat = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      roughness: 0.88,
    });
    const membraneRoof = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.24, 0.05, totalDepth - 0.24),
      membraneMat
    );
    membraneRoof.position.set(0, wallHeight + 0.22 + 0.025, 0);
    membraneRoof.receiveShadow = true;
    roofGroup.add(membraneRoof);

    // Obvodová atika v antracitu
    const atikaMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
    });
    const atikaH = 0.22;
    const atikaT = 0.12;
    const atikaY = wallHeight + 0.22 + atikaH / 2;

    const atikaN = new THREE.Mesh(new THREE.BoxGeometry(width, atikaH, atikaT), atikaMat);
    atikaN.position.set(0, atikaY, -totalDepth / 2 + atikaT / 2);
    roofGroup.add(atikaN);

    const atikaW = new THREE.Mesh(new THREE.BoxGeometry(atikaT, atikaH, totalDepth), atikaMat);
    atikaW.position.set(-width / 2 + atikaT / 2, atikaY, 0);
    roofGroup.add(atikaW);

    const atikaE = new THREE.Mesh(new THREE.BoxGeometry(atikaT, atikaH, totalDepth), atikaMat);
    atikaE.position.set(width / 2 - atikaT / 2, atikaY, 0);
    roofGroup.add(atikaE);

    // Stěnové dilatační oplechování na styku se severní fasádou domu (ČSN 73 1901)
    const wallFlashingMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Antracitový poplastovaný plech
      roughness: 0.35,
      metalness: 0.3,
    });
    const wallFlashingH = 0.20;
    const wallFlashingT = 0.06;
    const wallFlashing = new THREE.Mesh(
      new THREE.BoxGeometry(width, wallFlashingH, wallFlashingT),
      wallFlashingMat
    );
    wallFlashing.position.set(0, wallHeight + 0.22 + wallFlashingH / 2, totalDepth / 2 - wallFlashingT / 2);
    wallFlashing.castShadow = true;
    roofGroup.add(wallFlashing);

    roofGroup.userData.bim = {
      type: 'IfcRoof',
      name: 'Plochá střecha s atikou (hydroizolace 2× SBS pás)',
      floor: 'Pozemek',
      description: 'Plochá střecha s atikou nad dílnou a krytým stáním',
      parameters: {
        Rozměry: `${width.toFixed(1)} × ${totalDepth.toFixed(1)} m (${(width * totalDepth).toFixed(1)} m²)`,
        Skladba: 'Trámový strop C24 + OSB záklop 22 mm + 2× SBS modifikovaný asfaltový pás s ochranným břidličným posypem + oplechování atiky 220 mm v antracitu',
      },
    };
    group.add(roofGroup);

    // 2b. Částečná dřevěná lamelová zástěna do zahrady (střední pole 3,6 m mezi západními sloupy)
    const screenGroup = new THREE.Group();
    screenGroup.name = 'carport-garden-screen';
    const screenW = 0.08;
    const screenH = wallHeight;
    const screenLen = 3.6;
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x92400e, // Sibiřský modřín / thermowood
      roughness: 0.75,
    });
    const screenBase = new THREE.Mesh(new THREE.BoxGeometry(screenW, screenH, screenLen), screenMat);
    screenBase.position.set(-width / 2 + 0.15, screenH / 2, parkRelZ);
    screenBase.castShadow = true;
    screenBase.receiveShadow = true;
    screenGroup.add(screenBase);

    screenGroup.userData.bim = {
      type: 'IfcCovering (Zástěna)',
      name: 'Dřevěná lamelová zástěna do zahrady',
      floor: 'Pozemek',
      description: 'Pohledová clona ze sibiřského modřínu oddělující parkování od zahrady, nesoucí Wallbox v ose stání',
      parameters: {
        Rozměry: `Délka 3,6 m, výška ${wallHeight} m`,
        Materiál: 'Vertikální dřevěné lamely 40×60 mm (sibiřský modřín / thermowood) na ocelovém rámu',
        Funkce: 'Pohledová clona ze zahrady, ochrana před západním větrem a nosná stěna pro Wallbox v ose středové uličky',
        Průchody: '2× volný průchod do zahrady šířky 1,2 m (severní u dílny a jižní u domu)',
      },
    };
    group.add(screenGroup);

    // 4. Wallbox pro nabíjení elektromobilu – osazen v ose stání na vnitřním líci západní zástěny
    const wallboxGroup = new THREE.Group();
    wallboxGroup.name = 'wallbox-ev-charger';
    const wallboxGeo = new THREE.BoxGeometry(0.26, 0.38, 0.13);
    const wallboxMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.4 });
    const wallboxBody = new THREE.Mesh(wallboxGeo, wallboxMat);
    wallboxBody.castShadow = true;
    wallboxGroup.add(wallboxBody);

    // Stavový LED indikátor nabíjení
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.01), ledMat);
    ledMesh.position.set(0, 0.08, 0.07);
    wallboxGroup.add(ledMesh);

    // Zásuvka / konektor Typ 2
    const plugMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const plugMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16), plugMat);
    plugMesh.rotation.x = Math.PI / 2;
    plugMesh.position.set(0, -0.08, 0.07);
    wallboxGroup.add(plugMesh);

    // Umístění: na vnitřním líci západní zástěny přímo v čele středové uličky mezi oběma vozy
    wallboxGroup.rotation.y = Math.PI / 2; // natočeno čelem na východ do středové uličky
    wallboxGroup.position.set(-width / 2 + 0.15 + screenW / 2 + 0.07, 1.35, parkRelZ);
    wallboxGroup.userData.bim = {
      type: 'IfcElectricAppliance (Wallbox)',
      name: 'Nástěnný Wallbox 11/22 kW na západní zástěně stání',
      floor: 'Pozemek',
      description: 'Chytrá nástěnná nabíjecí stanice osazená v čele středové uličky mezi auty na dřevěné zástěně do zahrady',
      parameters: {
        Umístění: 'Vnitřní líc západní lamelové zástěny (přesně v ose mezi oběma stáními)',
        Výkon: '11 kW (3×16A) až 22 kW (3×32A)',
        Konektor: 'Integrovaný kabel Typ 2 délky 6,5 m (obslouží obě auta středovou uličkou)',
        Napájení: 'Vedení stropem přístřešku z TM 1.02 přímo na západní střední sloup/zástěnu',
        Integrace: 'Dynamické řízení přebytků ze střešní FVE 7,2 kWp a baterie 10,6 kWh',
      },
    };
    group.add(wallboxGroup);

    // 5. Zaparkované elektromobily (prostorová zkouška: Peugeot e-208 + VW ID. Buzz)
    const carsGroup = new THREE.Group();
    carsGroup.name = 'parked-electric-cars';

    // A) Peugeot e-208 (Jižní stání u zdi domu)
    const e208Group = new THREE.Group();
    e208Group.name = 'car-peugeot-e208';
    const e208Z = parkRelZ + 1.45; // Jižní stání u domu
    const e208X = 0.25;
    const e208BodyMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3, metalness: 0.7 });
    const e208GlassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });

    const e208Lower = new THREE.Mesh(new THREE.BoxGeometry(4.06, 0.70, 1.75), e208BodyMat);
    e208Lower.position.y = 0.14 + 0.35;
    e208Lower.castShadow = true;
    e208Group.add(e208Lower);

    const e208Cabin = new THREE.Mesh(new THREE.BoxGeometry(2.30, 0.59, 1.50), e208GlassMat);
    e208Cabin.position.set(-0.25, 0.14 + 0.70 + 0.295, 0);
    e208Cabin.castShadow = true;
    e208Group.add(e208Cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 16);
    wheelGeo.rotateX(Math.PI / 2);
    [[-1.25, 0.78], [-1.25, -0.78], [1.25, 0.78], [1.25, -0.78]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, 0.31, wz);
      e208Group.add(w);
    });

    e208Group.position.set(e208X, 0, e208Z);
    e208Group.userData.bim = {
      type: 'IfcTransportElement (Automobil)',
      name: 'Peugeot e-208 GT (50 kWh)',
      floor: 'Pozemek',
      description: 'Městský elektromobil zaparkovaný na jižním stání u domu',
      parameters: {
        Rozměry: '4 055 × 1 745 × 1 430 mm',
        'Nabíjecí port': 'Typ 2 / CCS vlevo vzadu (u řidiče)',
        'Vzdálenost k Wallboxu': '1,4 m (pohodlný přímý dosah kabelu)',
        'Kapacita baterie': '50 kWh (dojezd cca 350 km WLTP)',
        'Palubní nabíječka': '11 kW 3-fázová (doba nabíjení 20–80 % cca 2,5 h)',
      },
    };
    carsGroup.add(e208Group);

    // B) Volkswagen ID. Buzz (Severní stání u dílny)
    const buzzGroup = new THREE.Group();
    buzzGroup.name = 'car-vw-id-buzz';
    const buzzZ = parkRelZ - 1.45; // Severní stání u dílny
    const buzzX = 0.05;
    const buzzLowerMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.6 });
    const buzzUpperMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.1 });

    const buzzLower = new THREE.Mesh(new THREE.BoxGeometry(4.71, 0.95, 1.99), buzzLowerMat);
    buzzLower.position.y = 0.18 + 0.475;
    buzzLower.castShadow = true;
    buzzGroup.add(buzzLower);

    const buzzUpper = new THREE.Mesh(new THREE.BoxGeometry(4.40, 0.81, 1.88), buzzUpperMat);
    buzzUpper.position.set(-0.08, 0.18 + 0.95 + 0.405, 0);
    buzzUpper.castShadow = true;
    buzzGroup.add(buzzUpper);

    const buzzGlass = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.48, 1.90), e208GlassMat);
    buzzGlass.position.set(-0.05, 0.18 + 0.95 + 0.30, 0);
    buzzGroup.add(buzzGlass);

    const buzzWheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16);
    buzzWheelGeo.rotateX(Math.PI / 2);
    [[-1.48, 0.89], [-1.48, -0.89], [1.48, 0.89], [1.48, -0.89]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(buzzWheelGeo, wheelMat);
      w.position.set(wx, 0.38, wz);
      buzzGroup.add(w);
    });

    buzzGroup.position.set(buzzX, 0, buzzZ);
    buzzGroup.userData.bim = {
      type: 'IfcTransportElement (Automobil)',
      name: 'Volkswagen ID. Buzz Pro (77 kWh)',
      floor: 'Pozemek',
      description: 'Rodinný MPV van zaparkovaný na severním stání u dílny',
      parameters: {
        Rozměry: '4 712 × 1 985 × 1 937 mm',
        'Nabíjecí port': 'Typ 2 / CCS vpravo vzadu (u spolujezdce)',
        'Vzdálenost k Wallboxu': 'Cca 4,5 m při couvání / 5,2 m popředu (kabel 6,5 m dosáhne)',
        'Kapacita baterie': '77 kWh (dojezd cca 420 km WLTP)',
        'Palubní nabíječka': '11 kW 3-fázová (doba nabíjení 20–80 % cca 4,5 h)',
      },
    };
    carsGroup.add(buzzGroup);
    group.add(carsGroup);
  } else {
    const totalWidth = parkWidth + workshopGap + workshopWidth;
    const workshopRelX = -totalWidth / 2 + workshopWidth / 2;
    const workshop = new THREE.Mesh(
      new THREE.BoxGeometry(workshopWidth, wallHeight, depth),
      materials.auxWall
    );
    workshop.position.set(workshopRelX, wallHeight / 2, 0);
    workshop.castShadow = true;
    workshop.receiveShadow = true;
    group.add(workshop);

    const parkRelX = totalWidth / 2 - parkWidth / 2;
    const parkFloor = new THREE.Mesh(
      new THREE.BoxGeometry(parkWidth, 0.08, depth),
      materials.auxFloor
    );
    parkFloor.position.set(parkRelX, 0.04, 0);
    group.add(parkFloor);
  }

  // Paved walkway connecting carport canopy to main East entrance (1.01)
  if (eastWalkway) {
    const [ew, eh, ed] = eastWalkway.size;
    const [ex, ey, ez] = eastWalkway.pos;
    const eastWalkMesh = new THREE.Mesh(new THREE.BoxGeometry(ew, eh, ed), materials.auxFloor);
    eastWalkMesh.position.set(ex, ey, ez);
    eastWalkMesh.receiveShadow = true;
    eastWalkMesh.userData.bim = {
      type: 'IfcSlab (Chodník)',
      name: 'Chodník k hlavnímu vchodu (1.01)',
      floor: 'Pozemek',
      description: 'Zpevněný přístupový chodník od krytého parkování k hlavnímu vstupu do zádveří',
      parameters: {
        Rozměry: `${ew.toFixed(1)} × ${ed.toFixed(1)} m`,
      },
    };
    group.add(eastWalkMesh);
  }

  group.position.set(position[0], position[1], position[2]);
  return group;
}

/**
 * Pure computation of site bounding coordinates and setback distances (in meters)
 * between the house (with optional terrace), auxiliary building, and plot boundaries.
 */
export function computeSiteSetbacks(
  siteConfig,
  housePos = { x: 0, z: 0, rotY: 0 },
  auxConfig,
  houseFootprint = { width: 8, length: 12 },
  houseDesign = null
) {
  const hw = siteConfig.width / 2; // 13.5
  const hd = siteConfig.depth / 2; // 20.0

  const fpW = houseDesign?.footprint?.width ?? houseFootprint.width ?? 8;
  const fpL = houseDesign?.footprint?.length ?? houseFootprint.length ?? 12;

  const rad = ((housePos.rotY || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const halfExtX = Math.abs((fpW / 2) * cos) + Math.abs((fpL / 2) * sin);
  const halfExtZ = Math.abs((fpW / 2) * sin) + Math.abs((fpL / 2) * cos);

  const houseMinX = housePos.x - halfExtX;
  const houseMaxX = housePos.x + halfExtX;
  const houseMinZ = housePos.z - halfExtZ;
  const houseMaxZ = housePos.z + halfExtZ;

  const isStacked = auxConfig.layout === 'stacked-north-south';
  const auxTotalWidth = isStacked
    ? (auxConfig.width ?? 6.5)
    : auxConfig.parkWidth + (auxConfig.workshopGap ?? 0) + auxConfig.workshopWidth;
  const auxTotalDepth = isStacked
    ? (auxConfig.depth ?? (auxConfig.parkDepth + auxConfig.workshopDepth))
    : auxConfig.depth;
  const auxMinX = auxConfig.position[0] - auxTotalWidth / 2;
  const auxMaxX = auxConfig.position[0] + auxTotalWidth / 2;
  const auxMinZ = auxConfig.position[2] - auxTotalDepth / 2;
  const auxMaxZ = auxConfig.position[2] + auxTotalDepth / 2;

  let terraceNeighborWest = null;
  const terraceFinish = houseDesign?.floor1?.finishes?.find((f) => f.material === 'terrace');
  if (terraceFinish?.size && terraceFinish?.pos) {
    const [tw, td] = terraceFinish.size;
    const [tcx, tcz] = terraceFinish.pos;
    const corners = [
      [tcx - tw / 2, tcz - td / 2],
      [tcx + tw / 2, tcz - td / 2],
      [tcx + tw / 2, tcz + td / 2],
      [tcx - tw / 2, tcz + td / 2],
    ];
    const terraceMinX = Math.min(...corners.map(([lx, lz]) => housePos.x + lx * cos + lz * sin));
    terraceNeighborWest = Number((terraceMinX - -hw).toFixed(1));
  }

  return {
    streetRight: Number((hw - houseMaxX).toFixed(1)),
    houseWorkshopGap: Number(
      (isStacked
        ? (auxConfig.parkDepth ?? 6.0)
        : Math.hypot(
            Math.max(0, houseMinX - (auxMinX + auxConfig.workshopWidth), auxMinX - houseMaxX),
            Math.max(0, houseMinZ - auxMaxZ, auxMinZ - houseMaxZ)
          )
      ).toFixed(1)
    ),
    houseTop: Number((houseMinZ - -hd).toFixed(1)),
    workshopTop: Number((auxMinZ - -hd).toFixed(1)),
    houseFront: Number((hd - houseMaxZ).toFixed(1)),
    neighborWest: Number((houseMinX - -hw).toFixed(1)),
    workshopStreetRight: Number((hw - auxMaxX).toFixed(1)),
    workshopNeighborWest: Number((auxMinX - -hw).toFixed(1)),
    terraceNeighborWest,
    houseMinX: Number(houseMinX.toFixed(3)),
    houseMaxX: Number(houseMaxX.toFixed(3)),
    houseMinZ: Number(houseMinZ.toFixed(3)),
    houseMaxZ: Number(houseMaxZ.toFixed(3)),
    auxMinX: Number(auxMinX.toFixed(3)),
    auxMaxX: Number(auxMaxX.toFixed(3)),
    auxMinZ: Number(auxMinZ.toFixed(3)),
    auxMaxZ: Number(auxMaxZ.toFixed(3)),
  };
}

/**
 * Dynamically updates the dashed setback dimension lines in `setbackGroup`
 * based on the current house position/rotation and returns live distance metrics.
 */
export function updateSetbackDimensions(setbackGroup, siteConfig, housePos, auxConfig, houseFootprint = { width: 8, length: 12 }) {
  setbackGroup.clear();

  const hw = siteConfig.width / 2; // 13.5
  const hd = siteConfig.depth / 2; // 20.0
  const sb = computeSiteSetbacks(siteConfig, housePos, auxConfig, houseFootprint);

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
  addDashedLine([sb.houseMaxX, -hd], [sb.houseMaxX, sb.houseMinZ], lineMatRed);

  // 2. House right street setback (houseMaxX to hw)
  addDashedLine([sb.houseMaxX, housePos.z], [hw, housePos.z], lineMatRed);

  // 3. Auxiliary building right street setback (auxMaxX to hw)
  addDashedLine([sb.auxMaxX, auxConfig.position[2]], [hw, auxConfig.position[2]], lineMatRed);

  // 4. Gap between auxiliary building and house (auxMaxZ to houseMinZ)
  addDashedLine([housePos.x, sb.auxMaxZ], [housePos.x, sb.houseMinZ], lineMatBlue);

  return {
    streetRight: sb.streetRight,
    houseWorkshopGap: sb.houseWorkshopGap,
    houseTop: sb.houseTop,
    workshopTop: sb.workshopTop,
    houseFront: sb.houseFront,
  };
}

/**
 * Computes built-up area breakdown (m² and % of plot area) for the plot,
 * main house, workshop, covered parking, terrace, and connecting canopy.
 */
export function computeBuiltUpArea(siteConfig, auxConfig, houseDesign) {
  const plotGrossSqm = Number((siteConfig.width * siteConfig.depth).toFixed(1));
  const chamfer = siteConfig.chamfer || 0;
  const chamferSqm = 0.5 * chamfer * chamfer;
  const plotNetSqm = Number((plotGrossSqm - chamferSqm).toFixed(1));
  const plotAreaSqm = siteConfig.areaSqm ?? plotNetSqm;

  const houseWidth = houseDesign?.footprint?.width ?? 8;
  const houseLength = houseDesign?.footprint?.length ?? 12;
  const houseSqm = Number((houseWidth * houseLength).toFixed(1));

  const isStackedMet = auxConfig.layout === 'stacked-north-south';
  const workshopSqm = isStackedMet
    ? Number(((auxConfig.width ?? 6.5) * (auxConfig.workshopDepth ?? 4.0)).toFixed(1))
    : Number((auxConfig.workshopWidth * auxConfig.depth).toFixed(1));
  const parkingSqm = isStackedMet
    ? Number(((auxConfig.width ?? 6.5) * (auxConfig.parkDepth ?? 6.0)).toFixed(1))
    : Number((auxConfig.parkWidth * auxConfig.depth).toFixed(1));

  const terraceRoom = houseDesign?.floor1?.rooms?.find(
    (r) => r.id === '1.08' || r.interior === false
  );
  const terraceSqm = Number((terraceRoom?.areaSqm ?? 24.0).toFixed(1));

  const canopySqm = auxConfig.canopy
    ? Number((auxConfig.canopy.size[0] * auxConfig.canopy.size[2]).toFixed(1))
    : 0;

  const buildingsSqm = Number((houseSqm + workshopSqm + parkingSqm).toFixed(1));
  const accessoriesSqm = Number((terraceSqm + canopySqm).toFixed(1));
  const totalBuiltUpSqm = Number((buildingsSqm + accessoriesSqm).toFixed(1));
  const freeGardenSqm = Number((plotAreaSqm - totalBuiltUpSqm).toFixed(1));

  const pct = (sqm) => (plotAreaSqm > 0 ? Number(((sqm / plotAreaSqm) * 100).toFixed(1)) : 0);

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
    plotAreaSqm,
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
  const [terraceW, terraceD] = terraceFinish?.size || [4.0, 6.0];
  const [terraceX, terraceZ] = terraceFinish?.pos || [-6.0, 3.0];

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
  const totalAuxWidth =
    auxConfig.parkWidth + (auxConfig.workshopGap ?? 0) + auxConfig.workshopWidth;
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
        label: 'Krytý chodník',
        areaText: `${metrics.canopySqm.toFixed(1)} m² (${metrics.canopyRatioPct.toFixed(1)} %)`,
        x: auxX + auxConfig.canopy.pos[0],
        z: auxZ + auxConfig.canopy.pos[2],
      })
    );
  }

  return metrics;
}

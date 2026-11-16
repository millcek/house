import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

// ==========================================
// 1. Scene, Camera & Renderer Setup
// ==========================================
const canvas = document.getElementById('three-canvas');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb0c8e0);
scene.fog = new THREE.Fog(0xb0c8e0, 50, 160);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.5,
  1000
);
camera.position.set(25, 25, 35);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground
controls.target.set(0, 2, 0);
controls.update();

// ==========================================
// 2. Lighting & Sunlight Simulation
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfffbf0, 1.3);
sunLight.position.set(30, 45, 25);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 240;

// Widen shadow camera frustum so long winter shadows (up to 30m) aren't clipped
const d = 55;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0003;
scene.add(sunLight);

// Hemisphere light for soft sky/ground bounce
const hemiLight = new THREE.HemisphereLight(0xebf2fa, 0x5a6351, 0.45);
scene.add(hemiLight);

// ==========================================
// 2b. Astronomical Solar Position Engine (50° N)
// ==========================================
let currentDayOfYear = 172; // Default 21. června (Léto)
let currentHour = 14.0;      // Default 14:00

const LATITUDE_RAD = 50.0 * (Math.PI / 180); // 50° s.š. (ČR)

function updateSun(dayOfYear, hour) {
  currentDayOfYear = dayOfYear;
  currentHour = hour;

  const rad = Math.PI / 180;
  // 1. Solární deklinace delta (-23.44° v zimě až +23.44° v létě)
  const delta = 23.44 * rad * Math.sin(((360 / 365) * (dayOfYear - 81)) * rad);

  // 2. Hodinový úhel H (15° za hodinu, 0 v solární poledne 12:00)
  const H = (hour - 12.0) * 15.0 * rad;

  // 3. Složky vektoru slunce v horizontální soustavě
  const x_north = -Math.cos(delta) * Math.cos(H) * Math.sin(LATITUDE_RAD) + Math.sin(delta) * Math.cos(LATITUDE_RAD);
  const y_east = -Math.cos(delta) * Math.sin(H);
  const z_up = Math.cos(delta) * Math.cos(H) * Math.cos(LATITUDE_RAD) + Math.sin(delta) * Math.sin(LATITUDE_RAD);

  // Výška slunce (elevation) ve stupních
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, z_up))) / rad;

  // Azimut ve stupních (0° = Sever, 90° = Východ, 180° = Jih, 270° = Západ)
  let azimuthDeg = Math.atan2(y_east, x_north) / rad;
  if (azimuthDeg < 0) azimuthDeg += 360;

  // Umístění ve 3D souřadnicích scény:
  // -Z je Sever, +Z je Jih, +X je Východ, -X je Západ
  const R = 90.0;
  const sunX = R * y_east;
  const sunZ = -R * x_north;
  const sunY = R * Math.max(0.01, z_up);

  sunLight.position.set(sunX, sunY, sunZ);

  // Přizpůsobení světla a oblohy podle výšky slunce
  const isDay = elevationDeg > 0;
  const isTwilight = elevationDeg > -5 && elevationDeg <= 0;

  if (isDay) {
    if (elevationDeg < 8) {
      // Východ / západ slunce: teplé nízkoúhlové světlo
      sunLight.color.setHex(0xff8c42);
      sunLight.intensity = Math.max(0.4, (elevationDeg / 8) * 0.95);
      scene.background.setHex(0x9ca9ba);
      scene.fog.color.setHex(0x9ca9ba);
    } else if (elevationDeg < 22) {
      // Nízké zimní nebo ranní/pozdně odpolední slunce
      sunLight.color.setHex(0xffecd0);
      sunLight.intensity = 1.15;
      scene.background.setHex(0xaec8e2);
      scene.fog.color.setHex(0xaec8e2);
    } else {
      // Jasné vysoké polední slunce
      sunLight.color.setHex(0xfffef7);
      sunLight.intensity = 1.4;
      scene.background.setHex(0xb8d7f5);
      scene.fog.color.setHex(0xb8d7f5);
    }
    ambientLight.intensity = 0.45 + Math.min(0.3, (elevationDeg / 65) * 0.3);
  } else if (isTwilight) {
    sunLight.intensity = 0;
    ambientLight.intensity = 0.22;
    scene.background.setHex(0x3d4f63);
    scene.fog.color.setHex(0x3d4f63);
  } else {
    // Noc
    sunLight.intensity = 0;
    ambientLight.intensity = 0.12;
    scene.background.setHex(0x131a24);
    scene.fog.color.setHex(0x131a24);
  }

  // Směrová zkratka
  const directions = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
  const dirIndex = Math.round(azimuthDeg / 22.5) % 16;
  const dirName = directions[dirIndex];

  // Aktualizace textů v UI
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const sunValEl = document.getElementById('sun-time-val');
  if (sunValEl) sunValEl.textContent = timeStr;

  const elevEl = document.getElementById('sun-elevation-badge');
  if (elevEl) {
    if (isDay) {
      elevEl.textContent = `Výška: ${elevationDeg.toFixed(1)}°`;
      elevEl.style.color = elevationDeg > 45 ? '#fbbf24' : '#60a5fa';
    } else {
      elevEl.textContent = `Výška: < 0° (Noc)`;
      elevEl.style.color = '#9ca3af';
    }
  }

  const azimEl = document.getElementById('sun-azimuth-badge');
  if (azimEl) {
    azimEl.textContent = `Azimut: ${Math.round(azimuthDeg)}° (${dirName})`;
  }

  const statusEl = document.getElementById('solar-analysis-text');
  if (statusEl) {
    if (!isDay) {
      statusEl.textContent = 'Noc (slunce pod obzorem)';
      statusEl.style.color = '#9ca3af';
    } else if (dayOfYear > 330 || dayOfYear < 30) {
      // Zima
      const shadowRatio = (1 / Math.tan(Math.max(0.08, elevationDeg * rad))).toFixed(1);
      statusEl.textContent = `Zima: nízké slunce (${elevationDeg.toFixed(0)}°), stíny ${shadowRatio}× výšky domu!`;
      statusEl.style.color = '#60a5fa';
    } else if (hour >= 13 && hour <= 18) {
      statusEl.textContent = `Odpolední slunce z ${dirName} přímo na zahradní terasu`;
      statusEl.style.color = '#34d399';
    } else if (hour < 12) {
      statusEl.textContent = `Dopolední slunce z ${dirName} prosvětluje vjezd`;
      statusEl.style.color = '#fbbf24';
    } else {
      statusEl.textContent = `Západní podvečerní slunce`;
      statusEl.style.color = '#f97316';
    }
  }
}

// ==========================================
// 3. Site Container & Cadastral Rotation (+26.5°)
// ==========================================
const siteContainer = new THREE.Group();
// Pozemek je dle katastrální mapy natočen cca o 26.5° po směru hodinových ručiček vůči Severu
const PARCEL_ROTATION_DEG = 26.5;
siteContainer.rotation.y = THREE.MathUtils.degToRad(PARCEL_ROTATION_DEG);
scene.add(siteContainer);

// ==========================================
// 3b. Plot (40x27m) with Chamfered Corner (3.5m)
// ==========================================
const PLOT_WIDTH = 27; // X axis
const PLOT_DEPTH = 40; // Z axis
const CHAMFER = 3.5;   // 3.5m zkosení na rohu u křižovatky (vpravo dole)
const ROAD_WIDTH = 4.5;

const plotGroup = new THREE.Group();
siteContainer.add(plotGroup);

// Tvar pozemku s 3.5m zkoseným jihovýchodním nárožím
const plotShape = new THREE.Shape();
const hw = PLOT_WIDTH / 2; // 13.5m
const hd = PLOT_DEPTH / 2; // 20.0m

// V rovině Shape: Y odpovídá -Z v 3D (Y=+20 je sever Z=-20; Y=-20 je jih Z=+20)
plotShape.moveTo(-hw, hd);              // Severozápadní roh (Z = -20)
plotShape.lineTo(hw, hd);               // Severovýchodní roh (Z = -20)
plotShape.lineTo(hw, -hd + CHAMFER);    // Jihovýchod před zkosením (Z = +16.5)
plotShape.lineTo(hw - CHAMFER, -hd);    // Jihovýchod po zkosení (X = +10.0, Z = +20)
plotShape.lineTo(-hw, -hd);             // Jihozápadní roh (X = -13.5, Z = +20)
plotShape.closePath();

const groundGeo = new THREE.ShapeGeometry(plotShape);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x567d46,
  roughness: 0.85,
  metalness: 0.05,
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
plotGroup.add(groundMesh);

// 1m Coordinate Grid
const gridHelper = new THREE.GridHelper(PLOT_DEPTH, PLOT_DEPTH, 0x1f2937, 0x3d5c31);
gridHelper.position.y = 0.02;
plotGroup.add(gridHelper);

// Bílá hranice pozemku přesně kopírující zkosený 5-úhelník
const boundaryPts = [
  new THREE.Vector3(-hw, 0.03, -hd),
  new THREE.Vector3(hw, 0.03, -hd),
  new THREE.Vector3(hw, 0.03, hd - CHAMFER),
  new THREE.Vector3(hw - CHAMFER, 0.03, hd),
  new THREE.Vector3(-hw, 0.03, hd),
  new THREE.Vector3(-hw, 0.03, -hd),
];
const boundaryGeo = new THREE.BufferGeometry().setFromPoints(boundaryPts);
const boundaryLine = new THREE.Line(
  boundaryGeo,
  new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
);
plotGroup.add(boundaryLine);

// Road System (Right +X and Front +Z)
const roadMat = new THREE.MeshStandardMaterial({
  color: 0x2d3139,
  roughness: 0.9,
});

// Pravá cesta (podél hloubky)
const rightRoad = new THREE.Mesh(
  new THREE.PlaneGeometry(ROAD_WIDTH, PLOT_DEPTH + ROAD_WIDTH * 2),
  roadMat
);
rightRoad.rotation.x = -Math.PI / 2;
rightRoad.position.set(PLOT_WIDTH / 2 + ROAD_WIDTH / 2, -0.01, 0);
rightRoad.receiveShadow = true;
plotGroup.add(rightRoad);

// Spodní/přední cesta
const frontRoad = new THREE.Mesh(
  new THREE.PlaneGeometry(PLOT_WIDTH + ROAD_WIDTH * 2, ROAD_WIDTH),
  roadMat
);
frontRoad.rotation.x = -Math.PI / 2;
frontRoad.position.set(0, -0.01, PLOT_DEPTH / 2 + ROAD_WIDTH / 2);
frontRoad.receiveShadow = true;
plotGroup.add(frontRoad);

// ==========================================
// 3c. 3D Compass Rose (Směrová růžice v terénu)
// ==========================================
function createCompassRose() {
  const compassGroup = new THREE.Group();
  // Umístění v terénu vedle severní strany pozemku (ve světových souřadnicích)
  compassGroup.position.set(-20, 0.05, -24);

  // 1. Základní terč
  const discGeo = new THREE.RingGeometry(0.3, 3.8, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x18191c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.75,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  compassGroup.add(disc);

  // Vnější kružnice
  const outerCurve = new THREE.EllipseCurve(0, 0, 3.8, 3.8, 0, 2 * Math.PI, false, 0);
  const outerGeo = new THREE.BufferGeometry().setFromPoints(
    outerCurve.getPoints(64).map((p) => new THREE.Vector3(p.x, 0.02, p.y))
  );
  const outerLine = new THREE.Line(outerGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
  compassGroup.add(outerLine);

  // 2. Červená šipka SEVER (směřuje na -Z)
  const northGeo = new THREE.ConeGeometry(0.6, 3.0, 4);
  const northMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const northArrow = new THREE.Mesh(northGeo, northMat);
  northArrow.rotation.x = -Math.PI / 2;
  northArrow.position.set(0, 0.06, -1.6);
  compassGroup.add(northArrow);

  // 3. Šedá šipka JIH (směřuje na +Z)
  const southGeo = new THREE.ConeGeometry(0.45, 2.2, 4);
  const southMat = new THREE.MeshBasicMaterial({ color: 0x9ca3af });
  const southArrow = new THREE.Mesh(southGeo, southMat);
  southArrow.rotation.x = Math.PI / 2;
  southArrow.position.set(0, 0.06, 1.3);
  compassGroup.add(southArrow);

  // 4. Rameno Východ - Západ
  const ewGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.8, 0.05, 0),
    new THREE.Vector3(2.8, 0.05, 0),
  ]);
  compassGroup.add(new THREE.Line(ewGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })));

  // 5. Popisky S, J, V, Z
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
  compassGroup.add(lblN);

  const lblS = makeLabel('J (Jih)', '#9ca3af', 34);
  lblS.position.set(0, 0.4, 4.0);
  compassGroup.add(lblS);

  const lblE = makeLabel('V', '#ffffff', 38);
  lblE.position.set(4.0, 0.4, 0);
  compassGroup.add(lblE);

  const lblW = makeLabel('Z', '#ffffff', 38);
  lblW.position.set(-4.0, 0.4, 0);
  compassGroup.add(lblW);

  scene.add(compassGroup);
}
createCompassRose();

// ==========================================
// 4. House Anchor Container & Auxiliary Building
// ==========================================
const houseContainer = new THREE.Group();
// Default position: 5m from right road (X=4.5), 15m from top of plot (Z=1.0)
houseContainer.position.set(4.5, 0, 1.0);
siteContainer.add(houseContainer);

let currentModel = null;
let currentIfcModel = null;

// ==========================================
// 5. Main House (8x12m, 2 Full Floors, Gable Roof)
// ==========================================
function createConceptModel() {
  const group = new THREE.Group();

  const HOUSE_WIDTH = 8;   // X axis
  const HOUSE_LENGTH = 12; // Z axis
  const FLOOR_HEIGHT = 2.8;
  const ROOF_HEIGHT = 2.8;

  // Materials: Simple, clean architectural volumes
  const wallMat1 = new THREE.MeshStandardMaterial({
    color: 0xf0f2f5,
    roughness: 0.6,
  });
  const wallMat2 = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.6,
  });
  const floorJointMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    roughness: 0.8,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f38, // Anthracite roof
    roughness: 0.45,
    metalness: 0.1,
  });

  // 1.NP - Přízemí (8 x 2.8 x 12 m)
  const floor1Geo = new THREE.BoxGeometry(HOUSE_WIDTH, FLOOR_HEIGHT, HOUSE_LENGTH);
  const floor1 = new THREE.Mesh(floor1Geo, wallMat1);
  floor1.position.y = FLOOR_HEIGHT / 2;
  floor1.castShadow = true;
  floor1.receiveShadow = true;
  group.add(floor1);

  // Subtle floor dividing joint / line (spára mezi podlažími)
  const jointGeo = new THREE.BoxGeometry(HOUSE_WIDTH + 0.05, 0.06, HOUSE_LENGTH + 0.05);
  const joint = new THREE.Mesh(jointGeo, floorJointMat);
  joint.position.y = FLOOR_HEIGHT;
  group.add(joint);

  // 2.NP - Plnohodnotné patro (8 x 2.8 x 12 m)
  const floor2Geo = new THREE.BoxGeometry(HOUSE_WIDTH, FLOOR_HEIGHT, HOUSE_LENGTH);
  const floor2 = new THREE.Mesh(floor2Geo, wallMat2);
  floor2.position.y = FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
  floor2.castShadow = true;
  floor2.receiveShadow = true;
  group.add(floor2);

  // Sedlová střecha (Gable roof along 12m length - Z axis)
  const roofShape = new THREE.Shape();
  const halfW = HOUSE_WIDTH / 2;
  roofShape.moveTo(-halfW, 0);
  roofShape.lineTo(halfW, 0);
  roofShape.lineTo(0, ROOF_HEIGHT);
  roofShape.closePath();

  const extrudeSettings = {
    depth: HOUSE_LENGTH,
    bevelEnabled: false,
  };
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
  // Center extrusion along Z axis
  roofGeo.translate(0, 0, -HOUSE_LENGTH / 2);

  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = FLOOR_HEIGHT * 2; // Sits on top of 2nd floor
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  return group;
}

// ==========================================
// 5b. Auxiliary Building: Parking (5x7m) + Workshop (6x7m)
// Ridge is perpendicular to house (along X axis)
// ==========================================
function createAuxiliaryBuilding() {
  const group = new THREE.Group();

  const PARK_WIDTH = 5;       // X dimension of parking
  const WORKSHOP_WIDTH = 6;   // X dimension of workshop
  const TOTAL_WIDTH = PARK_WIDTH + WORKSHOP_WIDTH; // 11m
  const DEPTH = 7;            // Z dimension
  const WALL_HEIGHT = 2.8;
  const ROOF_HEIGHT = 2.4;

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xebedf0,
    roughness: 0.6,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f38, // Matching anthracite roof
    roughness: 0.45,
    metalness: 0.1,
  });
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x374151,
    roughness: 0.5,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.8,
  });

  // 1. Dílna (6 x 7 m) - západní část (dále od ulice)
  // Centrováno v rámci celkové šířky 11m:
  const workshopRelX = -TOTAL_WIDTH / 2 + WORKSHOP_WIDTH / 2; // -5.5 + 3.0 = -2.5
  const workshopGeo = new THREE.BoxGeometry(WORKSHOP_WIDTH, WALL_HEIGHT, DEPTH);
  const workshop = new THREE.Mesh(workshopGeo, wallMat);
  workshop.position.set(workshopRelX, WALL_HEIGHT / 2, 0);
  workshop.castShadow = true;
  workshop.receiveShadow = true;
  group.add(workshop);

  // 2. Parkování (5 x 7 m) - navazuje směrem k ulici (východní část)
  const parkRelX = TOTAL_WIDTH / 2 - PARK_WIDTH / 2; // 5.5 - 2.5 = +3.0

  // Podlaha parkovacího stání
  const parkFloor = new THREE.Mesh(
    new THREE.BoxGeometry(PARK_WIDTH, 0.08, DEPTH),
    floorMat
  );
  parkFloor.position.set(parkRelX, 0.04, 0);
  parkFloor.receiveShadow = true;
  group.add(parkFloor);

  // Zadní stěna parkování (severní)
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(PARK_WIDTH, WALL_HEIGHT, 0.25),
    wallMat
  );
  backWall.position.set(parkRelX, WALL_HEIGHT / 2, -DEPTH / 2 + 0.125);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  // Nosné sloupy parkování (vjezd zepředu a zprava od ulice)
  const pillarGeo = new THREE.BoxGeometry(0.25, WALL_HEIGHT, 0.25);
  const pillars = [
    [parkRelX + PARK_WIDTH / 2 - 0.15, DEPTH / 2 - 0.15],
    [parkRelX + PARK_WIDTH / 2 - 0.15, -DEPTH / 2 + 0.15],
    [parkRelX - PARK_WIDTH / 2 + 0.15, DEPTH / 2 - 0.15],
  ];
  pillars.forEach(([px, pz]) => {
    const col = new THREE.Mesh(pillarGeo, pillarMat);
    col.position.set(px, WALL_HEIGHT / 2, pz);
    col.castShadow = true;
    group.add(col);
  });

  // 3. Společná sedlová střecha (11 x 7 m) s hřebenem běžícím podél X (KOLMO K DOMU)
  const roofShape = new THREE.Shape();
  const halfDepth = DEPTH / 2; // 3.5m
  roofShape.moveTo(-halfDepth, 0);
  roofShape.lineTo(halfDepth, 0);
  roofShape.lineTo(0, ROOF_HEIGHT);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: TOTAL_WIDTH, // 11m délka podél hřebene
    bevelEnabled: false,
  });
  // Otočení o 90° kolem Y: trojúhelník je v Z-Y rovině a hřeben podél X osy!
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.translate(-TOTAL_WIDTH / 2, 0, 0);

  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = WALL_HEIGHT;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Pozice na pozemku:
  // X = 3.0 (pravá hrana je v 3.0 + 5.5 = 8.5m, tedy přesně 5m od pravé ulice 13.5m, stejně jako dům)
  // Z = -12.5 (přední hrana je v -12.5 + 3.5 = -9.0m, tedy přesně 4m od domu v -5.0m;
  //            zadní hrana je v -12.5 - 3.5 = -16.0m, tedy 4m od horní hranice pozemku v -20.0m)
  group.position.set(3.0, 0, -12.5);

  return group;
}

const auxBuilding = createAuxiliaryBuilding();
siteContainer.add(auxBuilding);

// Setback / Dimension Visual Lines
const setbackGroup = new THREE.Group();
plotGroup.add(setbackGroup);

function createSetbackDimensions() {
  setbackGroup.clear();

  const lineMatRed = new THREE.LineDashedMaterial({
    color: 0xef4444, // Red
    dashSize: 0.6,
    gapSize: 0.4,
  });
  const lineMatBlue = new THREE.LineDashedMaterial({
    color: 0x3b82f6, // Blue
    dashSize: 0.6,
    gapSize: 0.4,
  });

  // 1. Odstup domu 15m od vrchu pozemku (Z = -20 do Z = -5)
  const topGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(8.5, 0.08, -20),
    new THREE.Vector3(8.5, 0.08, -5),
  ]);
  const topLine = new THREE.Line(topGeo, lineMatRed);
  topLine.computeLineDistances();
  setbackGroup.add(topLine);

  // 2. Odstup 5m od pravé cesty k domu (X = 8.5 do X = 13.5)
  const sideGeo1 = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(8.5, 0.08, 1.0),
    new THREE.Vector3(13.5, 0.08, 1.0),
  ]);
  const sideLine1 = new THREE.Line(sideGeo1, lineMatRed);
  sideLine1.computeLineDistances();
  setbackGroup.add(sideLine1);

  // 3. Odstup 5m od pravé cesty k parkování (X = 8.5 do X = 13.5)
  const sideGeo2 = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(8.5, 0.08, -12.5),
    new THREE.Vector3(13.5, 0.08, -12.5),
  ]);
  const sideLine2 = new THREE.Line(sideGeo2, lineMatRed);
  sideLine2.computeLineDistances();
  setbackGroup.add(sideLine2);

  // 4. Mezeru 4m mezi domem a objektem dílny/parkování (Z = -9 do Z = -5)
  const gapGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(4.5, 0.08, -9),
    new THREE.Vector3(4.5, 0.08, -5),
  ]);
  const gapLine = new THREE.Line(gapGeo, lineMatBlue);
  gapLine.computeLineDistances();
  setbackGroup.add(gapLine);
}
createSetbackDimensions();

// Load default concept model
currentModel = createConceptModel();
houseContainer.add(currentModel);

// ==========================================
// 6. IFC Loader & BIM Setup
// ==========================================
const ifcLoader = new IFCLoader();
ifcLoader.ifcManager.setWasmPath('/wasm/');

// Highlight material for picked BIM elements
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xff3b30,
  depthTest: false,
  transparent: true,
  opacity: 0.5,
});

let isHighlighting = false;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

async function pickBimElement(event) {
  if (!currentIfcModel) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(currentIfcModel, false);

  if (intersects.length > 0) {
    const item = intersects[0];
    const expressID = ifcLoader.ifcManager.getExpressId(item.object.geometry, item.faceIndex);

    if (expressID !== undefined) {
      try {
        // Highlight subset
        ifcLoader.ifcManager.createSubset({
          modelID: currentIfcModel.modelID,
          ids: [expressID],
          material: highlightMaterial,
          scene: scene,
          removePrevious: true,
        });

        // Query BIM Properties
        const props = await ifcLoader.ifcManager.getItemProperties(currentIfcModel.modelID, expressID);
        displayBimProperties(props);
      } catch (err) {
        console.warn('Property query failed:', err);
      }
    }
  }
}

function displayBimProperties(props) {
  const panel = document.getElementById('inspector-panel');
  const container = document.getElementById('inspector-content');
  if (!props) return;

  panel.classList.add('visible');

  const typeName = props.__proto__?.constructor?.name || props.type || 'IFC Element';
  const nameVal = props.Name?.value || props.ObjectType?.value || 'Unnamed';
  const idVal = props.GlobalId?.value || props.expressID || '—';
  const descVal = props.Description?.value || '—';

  let html = `
    <table class="props-table">
      <tr><td class="prop-name">Type:</td><td class="prop-val"><strong style="color:#60a5fa;">${typeName}</strong></td></tr>
      <tr><td class="prop-name">Name:</td><td class="prop-val">${nameVal}</td></tr>
      <tr><td class="prop-name">GlobalId:</td><td class="prop-val" style="font-family:monospace;font-size:11px;">${idVal}</td></tr>
      <tr><td class="prop-name">Description:</td><td class="prop-val">${descVal}</td></tr>
    </table>
  `;

  // Additional raw keys
  const extraKeys = Object.keys(props).filter(
    (k) => !['expressID', 'type', 'GlobalId', 'Name', 'Description'].includes(k) && typeof props[k] === 'object' && props[k]?.value !== undefined
  );

  if (extraKeys.length > 0) {
    html += `<div style="margin-top:8px;font-size:11px;font-weight:600;color:#9ca3af;">Parameters:</div>`;
    html += `<table class="props-table">`;
    for (const key of extraKeys.slice(0, 8)) {
      html += `<tr><td class="prop-name">${key}:</td><td class="prop-val">${props[key].value}</td></tr>`;
    }
    html += `</table>`;
  }

  container.innerHTML = html;
}

// ==========================================
// 7. Loading IFC Files (Buffer or URL)
// ==========================================
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.classList.add('visible');
}

function hideLoading() {
  loadingOverlay.classList.remove('visible');
}

async function loadIfcFromBuffer(buffer, fileName) {
  showLoading(`Parsing ${fileName}...`);

  try {
    // Clear previous model
    if (currentModel) {
      houseContainer.remove(currentModel);
      currentModel = null;
    }
    if (currentIfcModel) {
      ifcLoader.ifcManager.removeSubset(currentIfcModel.modelID);
      currentIfcModel = null;
    }

    const ifcModel = await ifcLoader.parse(buffer);
    currentIfcModel = ifcModel;
    currentModel = ifcModel;

    // Enable shadows on loaded geometries
    ifcModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Auto-align model elevation Y=0 with ground level
    const box = new THREE.Box3().setFromObject(ifcModel);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Center model at Y ground level
    ifcModel.position.x = -center.x;
    ifcModel.position.y = -box.min.y;
    ifcModel.position.z = -center.z;

    houseContainer.add(ifcModel);

    // Update UI Status
    document.getElementById('model-status').textContent = fileName;
    document.getElementById('model-status').style.color = '#34d399';

    // Add version to dropdown if not present
    const select = document.getElementById('version-select');
    const newOpt = document.createElement('option');
    newOpt.value = fileName;
    newOpt.textContent = `Uploaded: ${fileName}`;
    select.appendChild(newOpt);
    select.value = fileName;

    fitCameraToObject(houseContainer);
  } catch (err) {
    console.error('Error loading IFC:', err);
    alert(`Failed to parse IFC file: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z, 15);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

  camera.position.set(center.x + cameraZ * 0.7, center.y + cameraZ * 0.5, center.z + cameraZ * 0.8);
  controls.target.copy(center);
  controls.update();
}

// ==========================================
// 8. Event Listeners & UI Binding
// ==========================================
// File Input
const fileInput = document.getElementById('file-input');
const btnUpload = document.getElementById('btn-upload');
btnUpload.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const buffer = new Uint8Array(reader.result);
    await loadIfcFromBuffer(buffer, file.name);
  };
  reader.readAsArrayBuffer(file);
});

// Drag & Drop Handling
const dropOverlay = document.getElementById('drop-overlay');

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('active');
});

window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) {
    dropOverlay.classList.remove('active');
  }
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('active');

  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].name.toLowerCase().endsWith('.ifc')) {
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = new Uint8Array(reader.result);
      await loadIfcFromBuffer(buffer, file.name);
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Please drop a valid .ifc file.');
  }
});

// Click inspection
canvas.addEventListener('click', pickBimElement);

// Close inspector
document.getElementById('btn-close-inspector')?.addEventListener('click', () => {
  document.getElementById('inspector-panel').classList.remove('visible');
  if (currentIfcModel) {
    ifcLoader.ifcManager.removeSubset(currentIfcModel.modelID);
  }
});

// Version selector
document.getElementById('version-select').addEventListener('change', (e) => {
  if (e.target.value === 'concept') {
    if (currentModel) houseContainer.remove(currentModel);
    if (currentIfcModel) {
      ifcLoader.ifcManager.removeSubset(currentIfcModel.modelID);
      currentIfcModel = null;
    }
    currentModel = createConceptModel();
    houseContainer.add(currentModel);
    document.getElementById('model-status').textContent = 'Concept massing';
    document.getElementById('model-status').style.color = '#60a5fa';
    document.getElementById('inspector-panel').classList.remove('visible');
  }
});

// Transform sliders
const posX = document.getElementById('pos-x');
const posZ = document.getElementById('pos-z');
const rotY = document.getElementById('rot-y');

posX.addEventListener('input', (e) => {
  houseContainer.position.x = parseFloat(e.target.value);
  document.getElementById('val-pos-x').textContent = `${e.target.value}m`;
});

posZ.addEventListener('input', (e) => {
  houseContainer.position.z = parseFloat(e.target.value);
  document.getElementById('val-pos-z').textContent = `${e.target.value}m`;
});

rotY.addEventListener('input', (e) => {
  houseContainer.rotation.y = (parseFloat(e.target.value) * Math.PI) / 180;
  document.getElementById('val-rot-y').textContent = `${e.target.value}°`;
});

// Sun & Season Simulator Controls
const sunSlider = document.getElementById('sun-slider');
const monthSelect = document.getElementById('month-select');
const btnSeasonSummer = document.getElementById('season-summer');
const btnSeasonEquinox = document.getElementById('season-equinox');
const btnSeasonWinter = document.getElementById('season-winter');

function setSeasonDay(day, activeBtn) {
  currentDayOfYear = day;
  if (monthSelect) monthSelect.value = String(day);
  [btnSeasonSummer, btnSeasonEquinox, btnSeasonWinter].forEach((btn) => btn?.classList.remove('btn-primary'));
  activeBtn?.classList.add('btn-primary');
  updateSun(currentDayOfYear, currentHour);
}

btnSeasonSummer?.addEventListener('click', () => setSeasonDay(172, btnSeasonSummer));
btnSeasonEquinox?.addEventListener('click', () => setSeasonDay(80, btnSeasonEquinox));
btnSeasonWinter?.addEventListener('click', () => setSeasonDay(355, btnSeasonWinter));

monthSelect?.addEventListener('change', (e) => {
  const day = parseInt(e.target.value, 10);
  currentDayOfYear = day;
  [btnSeasonSummer, btnSeasonEquinox, btnSeasonWinter].forEach((btn) => btn?.classList.remove('btn-primary'));
  if (day === 172) btnSeasonSummer?.classList.add('btn-primary');
  if (day === 80 || day === 266) btnSeasonEquinox?.classList.add('btn-primary');
  if (day === 355) btnSeasonWinter?.classList.add('btn-primary');
  updateSun(currentDayOfYear, currentHour);
});

sunSlider?.addEventListener('input', (e) => {
  currentHour = parseFloat(e.target.value);
  updateSun(currentDayOfYear, currentHour);
});

// Initial Sun: June 21, 14:00
updateSun(172, 14.0);

// Compass HUD Indicator & Click to Reset to North
const compassBadge = document.getElementById('compass-badge');
const compassDial = document.getElementById('compass-dial');

compassBadge?.addEventListener('click', () => {
  // Smoothly orient camera looking North (-Z) from South (+Z)
  camera.position.set(0, 32, 45);
  controls.target.set(0, 2, 0);
  controls.update();
});

function updateCompassHud() {
  if (!compassDial) return;
  // Get camera view vector projected onto XZ plane
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // Angle with North (-Z):
  const angle = Math.atan2(dir.x, -dir.z);
  compassDial.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`;
}

// Toolbar buttons
document.getElementById('btn-fit').addEventListener('click', () => {
  fitCameraToObject(siteContainer);
});

let gridVisible = true;
document.getElementById('btn-toggle-grid').addEventListener('click', (e) => {
  gridVisible = !gridVisible;
  gridHelper.visible = gridVisible;
  e.target.textContent = `Grid: ${gridVisible ? 'ON' : 'OFF'}`;
});

let plotVisible = true;
document.getElementById('btn-toggle-plot').addEventListener('click', (e) => {
  plotVisible = !plotVisible;
  plotGroup.visible = plotVisible;
  e.target.textContent = `Plot: ${plotVisible ? 'ON' : 'OFF'}`;
});

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateCompassHud();
  renderer.render(scene, camera);
}
animate();

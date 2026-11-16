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
renderer.localClippingEnabled = true;

// House Floor Slicing / Clipping Plane
const houseClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);

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
// 5. Room Data & Concept Floor Plan Generator
// ==========================================
const ROOMS_1NP = [
  { id: '1.01', name: 'Zádveří / Vstup', area: '7.2 m²', pos: [2.3, 1.1, -2.4], desc: 'Vstupní hala s vestavěnými skříněmi a krytým loubím k parkování' },
  { id: '1.02', name: 'Technická m. / TČ', area: '5.4 m²', pos: [2.3, 1.1, -4.7], desc: 'TČ, rekuperace + přímé venkovní dveře do severního dvora k dílně' },
  { id: '1.03', name: 'Koupelna s WC', area: '4.1 m²', pos: [0.2, 1.1, -2.4], desc: 'Bezbariérová koupelna se sprchovým koutem a WC (pro budoucí ložnici v 1.NP)' },
  { id: '1.04', name: 'Budoucí ložnice / Pracovna', area: '12.0 m²', pos: [-2.2, 1.1, -3.8], desc: 'Nyní pracovna/host, v budoucnu bezbariérová ložnice rodičů s oknem do zahrady' },
  { id: '1.05', name: 'Spíž & schodiště', area: '5.8 m²', pos: [0.38, 1.4, -0.6], desc: 'Spíž pod schody + nástup na schodiště' },
  { id: '1.06', name: 'Kuchyňský kout + Jídelna', area: '14.5 m²', pos: [2.1, 1.1, 3.2], desc: 'Kuchyň s ostrůvkem a novým pásovým oknem na východ nad linkou' },
  { id: '1.07', name: 'Obývací pokoj', area: '25.0 m²', pos: [-2.0, 1.1, 3.2], desc: 'Klidová denní část s krbem a velkým HS portálem na terasu' },
  { id: '1.08', name: 'Zahradní terasa (JZ)', area: '28.0 m²', pos: [-6.0, 0.35, 3.2], desc: 'Krytá venkovní terasa s jihozápadním sluncem a pergolou' },
];

const ROOMS_2NP = [
  { id: '2.01', name: 'Schodišťová hala', area: '6.8 m²', pos: [0.2, 3.9, 0.2], desc: 'Centrální chodba propojující všechny 4 pokoje a hygienické zázemí' },
  { id: '2.02', name: 'Pokoj 1 / Ložnice (SZ)', area: '14.6 m²', pos: [-2.2, 3.9, -3.8], desc: 'Prostorná ložnice s výhledem na západ do zahrady' },
  { id: '2.03', name: 'Pokoj 4 / Pracovna (SV)', area: '10.5 m²', pos: [2.3, 3.9, -4.4], desc: 'Nová 4. samostatná místnost v patře (dětský pokoj 3 / pracovna / host)' },
  { id: '2.04', name: 'Rodinná koupelna', area: '6.2 m²', pos: [2.3, 3.9, -2.0], desc: 'Vana, sprchový kout, 2 umyvadla, okno na východ' },
  { id: '2.05', name: 'Samostatné WC', area: '1.8 m²', pos: [2.3, 3.9, -0.4], desc: 'Závěsná toaleta s umývátkem a vlastním oknem' },
  { id: '2.06', name: 'Prádelna / Úklid', area: '2.2 m²', pos: [1.1, 3.9, -0.4], desc: 'Vyhrazené místo pro pračku a sušičku přímo v patře' },
  { id: '2.07', name: 'Dětský pokoj 2 (JZ)', area: '14.8 m²', pos: [-2.2, 3.9, 3.5], desc: 'Slunný JZ pokoj s rohovým osluněním a příčným větráním (Jih + Západ do zahrady)' },
  { id: '2.08', name: 'Dětský pokoj 3 (JV)', area: '14.8 m²', pos: [2.1, 3.9, 3.5], desc: 'Světlý JV pokoj s ranním sluncem a příčným větráním (Jih + Východ)' },
];

function createRoomBadge(name, area, color = '#ffffff') {
  const cvs = document.createElement('canvas');
  cvs.width = 256;
  cvs.height = 110;
  const ctx = cvs.getContext('2d');

  // Semi-transparent rounded background badge
  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 3;

  const r = 14;
  const x = 4, y = 4, w = 248, h = 102;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Room Name
  ctx.fillStyle = color;
  ctx.font = 'bold 23px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 40);

  // Room Area
  ctx.fillStyle = '#60a5fa';
  ctx.font = '600 21px monospace';
  ctx.fillText(area, 128, 76);

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

function createConceptModel() {
  const group = new THREE.Group();
  group.name = 'concept-house';

  const HOUSE_WIDTH = 8.0;   // X axis (-4.0 to +4.0)
  const HOUSE_LENGTH = 12.0; // Z axis (-6.0 to +6.0)
  const FLOOR_HEIGHT = 2.80;
  const WALL_THICKNESS = 0.38;
  const PART_THICKNESS = 0.16;

  // Architectural Materials (all respecting house clipping plane)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xf1f3f5,
    roughness: 0.65,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const partitionMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.7,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const wallCapMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.5,
    clippingPlanes: [houseClipPlane],
  });
  const woodFloorMat = new THREE.MeshStandardMaterial({
    color: 0xc4a47c, // warm natural oak
    roughness: 0.5,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const tileFloorMat = new THREE.MeshStandardMaterial({
    color: 0xd2d7dc, // modern light stone tile
    roughness: 0.4,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const terraceMat = new THREE.MeshStandardMaterial({
    color: 0x7c5e42, // thermo-wood deck
    roughness: 0.75,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.4,
    roughness: 0.1,
    metalness: 0.1,
    clippingPlanes: [houseClipPlane],
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // dark anthracite frames
    roughness: 0.5,
    clippingPlanes: [houseClipPlane],
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f38, // dark roof
    roughness: 0.45,
    metalness: 0.1,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const stairMat = new THREE.MeshStandardMaterial({
    color: 0x96744e,
    roughness: 0.5,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const furnitureMat = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    roughness: 0.65,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });
  const kitchenCounterMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // anthracite slate counter
    roughness: 0.4,
    clippingPlanes: [houseClipPlane],
    clipShadows: true,
  });

  // Wall helper
  function makeWall(w, h, d, x, y, z, mat = wallMat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Window helper
  function makeWindow(w, h, d, x, y, z) {
    const winGroup = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    frame.position.set(x, y + h / 2, z);
    winGroup.add(frame);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, h - 0.12, 0.04), glassMat);
    glass.position.set(x, y + h / 2, z);
    winGroup.add(glass);
    return winGroup;
  }

  // ----------------------------------------------------
  // SUB-GROUP 1: 1.NP (Přízemí)
  // ----------------------------------------------------
  const floor1Group = new THREE.Group();
  floor1Group.name = 'floor1-group';
  group.add(floor1Group);

  // 1.NP Floors
  // Wood floor in Living Room / Kitchen / Study
  const woodFloor1 = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.12, 6.4), woodFloorMat);
  woodFloor1.position.set(0, 0.06, 2.6);
  woodFloor1.receiveShadow = true;
  floor1Group.add(woodFloor1);

  const studyFloor = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 4.4), woodFloorMat);
  studyFloor.position.set(-2.05, 0.06, -3.6);
  studyFloor.receiveShadow = true;
  floor1Group.add(studyFloor);

  // Tile floor in Hallway / Tech / Bath / Under stairs
  const tileFloor1 = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.12, 4.4), tileFloorMat);
  tileFloor1.position.set(1.75, 0.06, -3.6);
  tileFloor1.receiveShadow = true;
  floor1Group.add(tileFloor1);

  // Garden Terrace (Adjacent to West wall, X = -4 to -8, Z = 0 to 6.5)
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.14, 6.8), terraceMat);
  terrace.position.set(-6.0, 0.07, 3.2);
  terrace.receiveShadow = true;
  floor1Group.add(terrace);

  // Pergola posts on terrace
  const postGeo = new THREE.BoxGeometry(0.14, 2.8, 0.14);
  const pergolaPosts = [
    [-7.9, 3.2 + 3.2],
    [-7.9, 3.2 - 3.2],
    [-4.15, 3.2 + 3.2],
    [-4.15, 3.2 - 3.2],
  ];
  pergolaPosts.forEach(([px, pz]) => {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(px, 1.4, pz);
    post.castShadow = true;
    floor1Group.add(post);
  });

  // 1.NP Exterior Perimeter Walls (Height 2.75 m)
  const H1 = 2.75;

  // North Wall (Z = -5.81, X: -4.0 to +4.0)
  floor1Group.add(makeWall(1.1, H1, WALL_THICKNESS, -3.45, 0, -5.81));
  floor1Group.add(makeWall(1.4, 0.9, WALL_THICKNESS, -2.2, 0, -5.81));                  // Parapet under Study/Bed window
  floor1Group.add(makeWindow(1.4, 1.3, WALL_THICKNESS + 0.02, -2.2, 0.9, -5.81));       // Study/Bedroom North window
  floor1Group.add(makeWall(1.4, H1 - 2.2, WALL_THICKNESS, -2.2, 2.2, -5.81));          // Lintel above Study/Bed window
  floor1Group.add(makeWall(3.4, H1, WALL_THICKNESS, 0.2, 0, -5.81));                    // Wall between window and TM door
  floor1Group.add(makeWindow(1.0, 2.15, WALL_THICKNESS + 0.02, 2.4, 0.0, -5.81));       // Tech room exterior door
  floor1Group.add(makeWall(1.0, H1 - 2.15, WALL_THICKNESS, 2.4, 2.15, -5.81));         // Lintel above TM door
  floor1Group.add(makeWall(1.1, H1, WALL_THICKNESS, 3.45, 0, -5.81));

  // South Wall (Z = +5.81, X: -4.0 to +4.0)
  floor1Group.add(makeWall(1.8, H1, WALL_THICKNESS, -3.1, 0, 5.81));
  floor1Group.add(makeWall(3.2, 0.05, WALL_THICKNESS, -0.6, 0, 5.81));                  // Threshold under French window
  floor1Group.add(makeWindow(3.2, 2.2, WALL_THICKNESS + 0.02, -0.6, 0.05, 5.81));       // Big Living Room French Window
  floor1Group.add(makeWall(3.2, H1 - 2.25, WALL_THICKNESS, -0.6, 2.25, 5.81));          // Lintel above French window
  floor1Group.add(makeWall(3.0, H1, WALL_THICKNESS, 2.5, 0, 5.81));

  // East Wall (X = +3.81, Z: -6.0 to +6.0)
  floor1Group.add(makeWall(WALL_THICKNESS, H1, 3.25, 3.81, 0, -4.375));
  floor1Group.add(makeWall(WALL_THICKNESS, 0.05, 1.1, 3.81, 0, -2.2));                  // Threshold under entry door
  floor1Group.add(makeWindow(WALL_THICKNESS + 0.02, 2.15, 1.1, 3.81, 0.05, -2.2));      // Main Entry Door
  floor1Group.add(makeWall(WALL_THICKNESS, H1 - 2.20, 1.1, 3.81, 2.20, -2.2));         // Lintel above entry door
  floor1Group.add(makeWall(WALL_THICKNESS, H1, 2.45, 3.81, 0, -0.425));                 // Wall between door and kitchen window
  floor1Group.add(makeWall(WALL_THICKNESS, 1.05, 2.2, 3.81, 0, 1.9));                   // Parapet under kitchen window
  floor1Group.add(makeWindow(WALL_THICKNESS + 0.02, 0.8, 2.2, 3.81, 1.05, 1.9));        // Kitchen East Ribbon Window
  floor1Group.add(makeWall(WALL_THICKNESS, H1 - 1.85, 2.2, 3.81, 1.85, 1.9));          // Lintel above kitchen window
  floor1Group.add(makeWall(WALL_THICKNESS, H1, 3.0, 3.81, 0, 4.5));

  // West Wall (X = -3.81, Z: -6.0 to +6.0)
  floor1Group.add(makeWall(WALL_THICKNESS, H1, 1.7, -3.81, 0, -5.15));
  floor1Group.add(makeWall(WALL_THICKNESS, 0.9, 1.4, -3.81, 0, -3.6));                   // Parapet under Study/Bed window
  floor1Group.add(makeWindow(WALL_THICKNESS + 0.02, 1.3, 1.4, -3.81, 0.9, -3.6));        // Study/Bedroom West Window
  floor1Group.add(makeWall(WALL_THICKNESS, H1 - 2.20, 1.4, -3.81, 2.20, -3.6));         // Lintel above Study/Bed window
  floor1Group.add(makeWall(WALL_THICKNESS, H1, 3.1, -3.81, 0, -1.35));                  // Wall between window and HS portal
  floor1Group.add(makeWall(WALL_THICKNESS, 0.05, 4.6, -3.81, 0, 2.5));                   // Threshold under HS portal
  floor1Group.add(makeWindow(WALL_THICKNESS + 0.02, 2.35, 4.6, -3.81, 0.05, 2.5));      // Sliding HS Portal to Terrace
  floor1Group.add(makeWall(WALL_THICKNESS, H1 - 2.40, 4.6, -3.81, 2.40, 2.5));          // Lintel above HS portal
  floor1Group.add(makeWall(WALL_THICKNESS, H1, 1.2, -3.81, 0, 5.4));

  // 1.NP Interior Partition Walls (Height 2.65 m)
  const HP = 2.65;
  // Full acoustic wall separating Study/Bedroom from Living Room (Z = -1.4)
  floor1Group.add(makeWall(3.5, HP, PART_THICKNESS, -2.05, 0, -1.4, partitionMat));
  // Longitudinal spine separating Study/Bedroom from central hallway (X = -0.3)
  floor1Group.add(makeWall(PART_THICKNESS, HP, 3.4, -0.3, 0, -4.1, partitionMat));
  floor1Group.add(makeWall(PART_THICKNESS, HP - 2.1, 1.0, -0.3, 2.1, -1.9, partitionMat)); // Door lintel to hallway
  // Wall separating Tech room from Vestibule (Z = -3.6)
  floor1Group.add(makeWall(2.8, HP, PART_THICKNESS, 2.4, 0, -3.6, partitionMat));
  // Wall separating Vestibule from Bathroom (X = +1.1)
  floor1Group.add(makeWall(PART_THICKNESS, HP, 2.2, 1.1, 0, -2.5, partitionMat));
  // Wall separating Hall from Kitchen/Dining (Z = -0.3)
  floor1Group.add(makeWall(2.6, HP, PART_THICKNESS, 2.5, 0, -0.3, partitionMat));

  // 1.NP Staircase (Ascending from Z = -2.00 to +0.85 at X = +0.375, landing safely in central 2.NP hallway)
  const stepCount = 16;
  const stairHeight = FLOOR_HEIGHT + 0.22; // Rise all the way to 2.NP floor slab (3.02 m)
  for (let s = 0; s < stepCount; s++) {
    const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.24), stairMat);
    stepMesh.position.set(0.375, (s + 0.5) * (stairHeight / stepCount), -2.00 + s * 0.19);
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    floor1Group.add(stepMesh);
  }

  // 1.NP Architectural Furniture Masses
  // Budoucí ložnice / Pracovna (1.04): Dvoulůžko + pracovní stůl + skříň
  const studyBed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.52, 2.0), furnitureMat);
  studyBed.position.set(-2.5, 0.26, -4.5);
  studyBed.castShadow = true;
  floor1Group.add(studyBed);

  const studyDesk = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.7), furnitureMat);
  studyDesk.position.set(-1.4, 0.37, -2.2);
  studyDesk.castShadow = true;
  floor1Group.add(studyDesk);

  const studyWardrobe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.1, 1.6), frameMat);
  studyWardrobe.position.set(-3.45, 1.05, -2.3);
  studyWardrobe.castShadow = true;
  floor1Group.add(studyWardrobe);

  // Koupelna 1.NP (1.03): sprchový kout
  const shower1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.9), glassMat);
  shower1.position.set(0.4, 1.0, -3.1);
  floor1Group.add(shower1);

  // Kitchen Island (2.2 x 0.9 x 0.9 m)
  const island = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 2.2), kitchenCounterMat);
  island.position.set(2.0, 0.45, 1.8);
  island.castShadow = true;
  floor1Group.add(island);

  // Kitchen Back Counter along East Wall
  const kitchenCounter = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 3.4), kitchenCounterMat);
  kitchenCounter.position.set(3.4, 0.45, 1.8);
  kitchenCounter.castShadow = true;
  floor1Group.add(kitchenCounter);

  // Dining Table + Chairs
  const diningTable = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.76, 2.0), furnitureMat);
  diningTable.position.set(2.0, 0.38, 4.5);
  diningTable.castShadow = true;
  floor1Group.add(diningTable);

  // Living Room L-Sofa
  const sofaBase1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 1.0), furnitureMat);
  sofaBase1.position.set(-2.2, 0.22, 4.4);
  const sofaBase2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.8), furnitureMat);
  sofaBase2.position.set(-3.0, 0.22, 3.0);
  floor1Group.add(sofaBase1);
  floor1Group.add(sofaBase2);

  // Coffee Table
  const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.2), furnitureMat);
  coffeeTable.position.set(-1.8, 0.17, 3.2);
  floor1Group.add(coffeeTable);

  // Tech Room Heat Pump unit
  const hvac = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), frameMat);
  hvac.position.set(2.8, 0.9, -5.0);
  hvac.castShadow = true;
  floor1Group.add(hvac);

  // ----------------------------------------------------
  // SUB-GROUP 2: Intermediate Ceiling Slab (Between 1.NP & 2.NP)
  // ----------------------------------------------------
  const ceiling1Group = new THREE.Group();
  ceiling1Group.name = 'ceiling1-group';
  group.add(ceiling1Group);

  // Slab with Staircase Hole
  const slabShape = new THREE.Shape();
  slabShape.moveTo(-HOUSE_WIDTH / 2, -HOUSE_LENGTH / 2);
  slabShape.lineTo(HOUSE_WIDTH / 2, -HOUSE_LENGTH / 2);
  slabShape.lineTo(HOUSE_WIDTH / 2, HOUSE_LENGTH / 2);
  slabShape.lineTo(-HOUSE_WIDTH / 2, HOUSE_LENGTH / 2);
  slabShape.closePath();

  // Staircase hole (X: -0.15 to +0.90, Z: -1.30 to +0.95, entirely inside central hall)
  // Shape coordinates: X is X, Y is -Z
  const stairHole = new THREE.Path();
  stairHole.moveTo(-0.15, -(-1.30));
  stairHole.lineTo(0.90, -(-1.30));
  stairHole.lineTo(0.90, -(0.95));
  stairHole.lineTo(-0.15, -(0.95));
  stairHole.closePath();
  slabShape.holes.push(stairHole);

  const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
    depth: 0.22,
    bevelEnabled: false,
  });
  slabGeo.rotateX(-Math.PI / 2);
  const ceilingSlab = new THREE.Mesh(slabGeo, wallMat);
  ceilingSlab.position.y = FLOOR_HEIGHT;
  ceilingSlab.receiveShadow = true;
  ceiling1Group.add(ceilingSlab);

  // ----------------------------------------------------
  // SUB-GROUP 3: 2.NP (Patro)
  // ----------------------------------------------------
  const floor2Group = new THREE.Group();
  floor2Group.name = 'floor2-group';
  group.add(floor2Group);

  const Y2 = FLOOR_HEIGHT + 0.22;
  const H2 = 2.65;

  // 2.NP Flooring with Staircase Hole (matching the slab opening below)
  const floor2Shape = new THREE.Shape();
  const halfW2 = 7.6 / 2;
  const halfL2 = 11.6 / 2;
  floor2Shape.moveTo(-halfW2, -halfL2);
  floor2Shape.lineTo(halfW2, -halfL2);
  floor2Shape.lineTo(halfW2, halfL2);
  floor2Shape.lineTo(-halfW2, halfL2);
  floor2Shape.closePath();

  // Staircase hole in 2.NP floor (strictly terminates before bedroom wall at Z = 1.4)
  const stairHole2 = new THREE.Path();
  stairHole2.moveTo(-0.15, -(-1.30));
  stairHole2.lineTo(0.90, -(-1.30));
  stairHole2.lineTo(0.90, -(0.95));
  stairHole2.lineTo(-0.15, -(0.95));
  stairHole2.closePath();
  floor2Shape.holes.push(stairHole2);

  const floor2Geo = new THREE.ExtrudeGeometry(floor2Shape, {
    depth: 0.08,
    bevelEnabled: false,
  });
  floor2Geo.rotateX(-Math.PI / 2);
  const floor2Mesh = new THREE.Mesh(floor2Geo, woodFloorMat);
  floor2Mesh.position.set(0, Y2, 0);
  floor2Mesh.receiveShadow = true;
  floor2Group.add(floor2Mesh);

  // 2.NP Staircase Balustrade / Railing (Zábradlí kolem schodišťového otvoru v patře)
  const railingHeight = 1.0;
  const railingGroup = new THREE.Group();

  // North segment along stair opening (Z = -1.30, X: -0.15 to 0.90 => length 1.05 m)
  const northRailLength = 1.05;
  const northRailHand = new THREE.Mesh(new THREE.BoxGeometry(northRailLength, 0.05, 0.05), frameMat);
  northRailHand.position.set(0.375, Y2 + railingHeight - 0.025, -1.30);
  railingGroup.add(northRailHand);

  const northRailGlass = new THREE.Mesh(new THREE.BoxGeometry(northRailLength - 0.04, railingHeight - 0.1, 0.02), glassMat);
  northRailGlass.position.set(0.375, Y2 + (railingHeight - 0.1) / 2 + 0.05, -1.30);
  railingGroup.add(northRailGlass);

  // West segment along stair opening (X = -0.15, Z: -1.30 to +0.95 => length 2.25 m)
  const westRailLength = 2.25;
  const westRailHand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, westRailLength), frameMat);
  westRailHand.position.set(-0.15, Y2 + railingHeight - 0.025, -0.175);
  railingGroup.add(westRailHand);

  const westRailGlass = new THREE.Mesh(new THREE.BoxGeometry(0.02, railingHeight - 0.1, westRailLength - 0.04), glassMat);
  westRailGlass.position.set(-0.15, Y2 + (railingHeight - 0.1) / 2 + 0.05, -0.175);
  railingGroup.add(westRailGlass);

  // Railing corner & intermediate posts
  const railingPostGeo = new THREE.BoxGeometry(0.04, railingHeight, 0.04);
  const postCoords = [
    [-0.15, -1.30],
    [0.90, -1.30],
    [-0.15, -0.175],
    [-0.15, 0.95],
  ];
  postCoords.forEach(([px, pz]) => {
    const post = new THREE.Mesh(railingPostGeo, frameMat);
    post.position.set(px, Y2 + railingHeight / 2, pz);
    post.castShadow = true;
    railingGroup.add(post);
  });
  floor2Group.add(railingGroup);

  // 2.NP Exterior Walls (Height 2.65 m, all openings precisely bounded by parapets and lintels)
  // North Wall (Z = -5.81, X: -4.0 to +4.0)
  floor2Group.add(makeWall(1.1, H2, WALL_THICKNESS, -3.45, Y2, -5.81));
  floor2Group.add(makeWall(1.4, 0.9, WALL_THICKNESS, -2.2, Y2, -5.81));                  // Parapet under Pokoj 1 (SZ) window
  floor2Group.add(makeWindow(1.4, 1.3, WALL_THICKNESS + 0.02, -2.2, Y2 + 0.9, -5.81)); // Pokoj 1 (SZ) window
  floor2Group.add(makeWall(1.4, H2 - 2.2, WALL_THICKNESS, -2.2, Y2 + 2.2, -5.81));     // Lintel above Pokoj 1 window
  floor2Group.add(makeWall(2.8, H2, WALL_THICKNESS, -0.1, Y2, -5.81));                  // Wall between North windows
  floor2Group.add(makeWall(1.4, 0.9, WALL_THICKNESS, 2.0, Y2, -5.81));                   // Parapet under Pokoj 4 (SV) window
  floor2Group.add(makeWindow(1.4, 1.3, WALL_THICKNESS + 0.02, 2.0, Y2 + 0.9, -5.81));  // Pokoj 4 (SV) window
  floor2Group.add(makeWall(1.4, H2 - 2.2, WALL_THICKNESS, 2.0, Y2 + 2.2, -5.81));      // Lintel above Pokoj 4 window
  floor2Group.add(makeWall(1.3, H2, WALL_THICKNESS, 3.35, Y2, -5.81));

  // South Wall (Z = +5.81, X: -4.0 to +4.0)
  floor2Group.add(makeWall(1.3, H2, WALL_THICKNESS, -3.35, Y2, 5.81));
  floor2Group.add(makeWall(1.8, 0.8, WALL_THICKNESS, -1.8, Y2, 5.81));                  // Parapet under JZ Kid room window
  floor2Group.add(makeWindow(1.8, 1.5, WALL_THICKNESS + 0.02, -1.8, Y2 + 0.8, 5.81)); // Dětský pokoj 2 (JZ)
  floor2Group.add(makeWall(1.8, H2 - 2.3, WALL_THICKNESS, -1.8, Y2 + 2.3, 5.81));      // Lintel above JZ window
  floor2Group.add(makeWall(1.8, H2, WALL_THICKNESS, 0.0, Y2, 5.81));                    // Wall separating Kid room windows
  floor2Group.add(makeWall(1.8, 0.8, WALL_THICKNESS, 1.8, Y2, 5.81));                   // Parapet under JV Kid room window
  floor2Group.add(makeWindow(1.8, 1.5, WALL_THICKNESS + 0.02, 1.8, Y2 + 0.8, 5.81));  // Dětský pokoj 3 (JV)
  floor2Group.add(makeWall(1.8, H2 - 2.3, WALL_THICKNESS, 1.8, Y2 + 2.3, 5.81));       // Lintel above JV window
  floor2Group.add(makeWall(1.3, H2, WALL_THICKNESS, 3.35, Y2, 5.81));

  // East Wall (X = +3.81, Z: -6.0 to +6.0)
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 1.0, 3.81, Y2, -5.5));
  floor2Group.add(makeWall(WALL_THICKNESS, 0.9, 1.2, 3.81, Y2, -4.4));                  // Parapet under Pokoj 4 East window
  floor2Group.add(makeWindow(WALL_THICKNESS + 0.02, 1.3, 1.2, 3.81, Y2 + 0.9, -4.4)); // Pokoj 4 East window
  floor2Group.add(makeWall(WALL_THICKNESS, H2 - 2.2, 1.2, 3.81, Y2 + 2.2, -4.4));      // Lintel above Pokoj 4 window
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 1.3, 3.81, Y2, -3.15));                  // Wall between Pokoj 4 and Bath
  floor2Group.add(makeWall(WALL_THICKNESS, 1.0, 1.2, 3.81, Y2, -1.9));                  // Parapet under Bathroom window
  floor2Group.add(makeWindow(WALL_THICKNESS + 0.02, 1.2, 1.2, 3.81, Y2 + 1.0, -1.9)); // Bathroom window
  floor2Group.add(makeWall(WALL_THICKNESS, H2 - 2.2, 1.2, 3.81, Y2 + 2.2, -1.9));      // Lintel above Bath window
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 1.1, 3.81, Y2, -0.75));                  // Wall between Bath and WC
  floor2Group.add(makeWall(WALL_THICKNESS, 1.3, 0.8, 3.81, Y2, 0.2));                   // Parapet under WC window
  floor2Group.add(makeWindow(WALL_THICKNESS + 0.02, 0.8, 0.8, 3.81, Y2 + 1.3, 0.2));  // WC window
  floor2Group.add(makeWall(WALL_THICKNESS, H2 - 2.1, 0.8, 3.81, Y2 + 2.1, 0.2));       // Lintel above WC window
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 2.4, 3.81, Y2, 1.8));                    // Wall between WC and Kid room 3
  floor2Group.add(makeWall(WALL_THICKNESS, 0.9, 1.2, 3.81, Y2, 3.6));                   // Parapet under Kid room 3 East window
  floor2Group.add(makeWindow(WALL_THICKNESS + 0.02, 1.3, 1.2, 3.81, Y2 + 0.9, 3.6));  // East Window (JV Kid room)
  floor2Group.add(makeWall(WALL_THICKNESS, H2 - 2.2, 1.2, 3.81, Y2 + 2.2, 3.6));      // Lintel above Kid room 3 window
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 1.8, 3.81, Y2, 5.1));

  // West Wall (X = -3.81, Z: -6.0 to +6.0)
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 1.45, -3.81, Y2, -5.275));
  floor2Group.add(makeWall(WALL_THICKNESS, 0.7, 1.5, -3.81, Y2, -3.8));                  // Parapet under Pokoj 1 West window
  floor2Group.add(makeWindow(WALL_THICKNESS + 0.02, 1.6, 1.5, -3.81, Y2 + 0.7, -3.8)); // Pokoj 1 (SZ) West window
  floor2Group.add(makeWall(WALL_THICKNESS, H2 - 2.3, 1.5, -3.81, Y2 + 2.3, -3.8));      // Lintel above Pokoj 1 window
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 6.05, -3.81, Y2, -0.025));               // Wall between Pokoj 1 and Kid room 2
  floor2Group.add(makeWall(WALL_THICKNESS, 0.9, 1.2, -3.81, Y2, 3.6));                  // Parapet under Kid room 2 West window
  floor2Group.add(makeWindow(WALL_THICKNESS + 0.02, 1.3, 1.2, -3.81, Y2 + 0.9, 3.6));  // West Window (JZ Kid room)
  floor2Group.add(makeWall(WALL_THICKNESS, H2 - 2.2, 1.2, -3.81, Y2 + 2.2, 3.6));      // Lintel above Kid room 2 window
  floor2Group.add(makeWall(WALL_THICKNESS, H2, 1.8, -3.81, Y2, 5.1));

  // 2.NP Partitions
  // Longitudinal spine separating Pokoj 1 from central hallway (X = -0.3)
  floor2Group.add(makeWall(PART_THICKNESS, H2, 3.4, -0.3, Y2, -4.1, partitionMat));
  floor2Group.add(makeWall(PART_THICKNESS, H2 - 2.1, 1.0, -0.3, Y2 + 2.1, -1.9, partitionMat)); // Doorway lintel
  // Wall separating Dětský pokoj 2 & 3 (X = 0.0)
  floor2Group.add(makeWall(PART_THICKNESS, H2, 4.4, 0.0, Y2, 3.6, partitionMat));
  // Separator between North rooms and South rooms (Z = +1.4)
  floor2Group.add(makeWall(3.5, H2, PART_THICKNESS, -2.05, Y2, 1.4, partitionMat)); // West
  floor2Group.add(makeWall(3.0, H2, PART_THICKNESS, 2.3, Y2, 1.4, partitionMat));   // East
  // Wall separating Pokoj 4 (SV) from Bathroom (Z = -3.0)
  floor2Group.add(makeWall(3.0, H2, PART_THICKNESS, 2.3, Y2, -3.0, partitionMat));
  // Wall separating Bathroom from WC / Laundry (Z = -0.9)
  floor2Group.add(makeWall(3.0, H2, PART_THICKNESS, 2.3, Y2, -0.9, partitionMat));
  // Wall separating WC from Laundry (X = +2.2, Z: -0.9 to +1.4)
  floor2Group.add(makeWall(PART_THICKNESS, H2, 2.3, 2.2, Y2, 0.25, partitionMat));
  // Hallway partition on East side (X = +0.8) with doorways
  floor2Group.add(makeWall(PART_THICKNESS, H2, 2.0, 0.8, Y2, -4.8, partitionMat));
  floor2Group.add(makeWall(PART_THICKNESS, H2 - 2.1, 0.9, 0.8, Y2 + 2.1, -3.35, partitionMat)); // Door Pokoj 4
  floor2Group.add(makeWall(PART_THICKNESS, H2, 0.4, 0.8, Y2, -2.7, partitionMat));
  floor2Group.add(makeWall(PART_THICKNESS, H2 - 2.1, 0.9, 0.8, Y2 + 2.1, -2.05, partitionMat)); // Door Bath
  floor2Group.add(makeWall(PART_THICKNESS, H2, 0.4, 0.8, Y2, -1.4, partitionMat));
  floor2Group.add(makeWall(PART_THICKNESS, H2 - 2.1, 1.6, 0.8, Y2 + 2.1, -0.4, partitionMat));  // Door WC & Laundry
  floor2Group.add(makeWall(PART_THICKNESS, H2, 0.8, 0.8, Y2, 1.0, partitionMat));

  // 2.NP Furniture Masses
  // Pokoj 1 (SZ): Master bed + desk + wardrobe
  const masterBed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.0), furnitureMat);
  masterBed.position.set(-2.4, Y2 + 0.28, -3.8);
  masterBed.castShadow = true;
  floor2Group.add(masterBed);

  const desk1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.7), furnitureMat);
  desk1.position.set(-1.4, Y2 + 0.37, -2.1);
  floor2Group.add(desk1);

  const wardrobe1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.1, 1.8), frameMat);
  wardrobe1.position.set(-3.45, Y2 + 1.05, -2.1);
  floor2Group.add(wardrobe1);

  // Pokoj 4 (SV - NOVÁ MÍSTNOST): Bed + desk + wardrobe
  const bed4 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.0), furnitureMat);
  bed4.position.set(2.8, Y2 + 0.25, -4.6);
  bed4.castShadow = true;
  floor2Group.add(bed4);

  const desk4 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.65), furnitureMat);
  desk4.position.set(1.7, Y2 + 0.37, -3.6);
  floor2Group.add(desk4);

  const wardrobe4 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.1, 1.2), frameMat);
  wardrobe4.position.set(3.45, Y2 + 1.05, -3.6);
  floor2Group.add(wardrobe4);

  // Dětské pokoje
  const kidBed1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.0), furnitureMat);
  kidBed1.position.set(-2.8, Y2 + 0.25, 4.5);
  floor2Group.add(kidBed1);

  const kidDesk1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.7), furnitureMat);
  kidDesk1.position.set(-1.6, Y2 + 0.37, 5.2);
  floor2Group.add(kidDesk1);

  const kidBed2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.0), furnitureMat);
  kidBed2.position.set(2.8, Y2 + 0.25, 4.5);
  floor2Group.add(kidBed2);

  const kidDesk2 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.7), furnitureMat);
  kidDesk2.position.set(1.6, Y2 + 0.37, 5.2);
  floor2Group.add(kidDesk2);

  // Bathroom Bathtub & Vanity
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 1.7), frameMat);
  tub.position.set(3.2, Y2 + 0.3, -2.0);
  floor2Group.add(tub);

  const bathVanity = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 1.2), furnitureMat);
  bathVanity.position.set(2.0, Y2 + 0.42, -2.0);
  floor2Group.add(bathVanity);

  // WC Toilet
  const wcMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.65), frameMat);
  wcMesh.position.set(3.3, Y2 + 0.23, 0.25);
  floor2Group.add(wcMesh);

  // Laundry: Washer / Dryer stack in 2.NP
  const laundryStack = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.7, 0.65), frameMat);
  laundryStack.position.set(1.4, Y2 + 0.85, 0.25);
  floor2Group.add(laundryStack);

  // ----------------------------------------------------
  // SUB-GROUP 4: Roof Structure (Sedlová střecha)
  // ----------------------------------------------------
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof-group';
  group.add(roofGroup);

  const ROOF_HEIGHT = 2.8;
  const roofShape = new THREE.Shape();
  const halfW = HOUSE_WIDTH / 2;
  roofShape.moveTo(-halfW, 0);
  roofShape.lineTo(halfW, 0);
  roofShape.lineTo(0, ROOF_HEIGHT);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: HOUSE_LENGTH,
    bevelEnabled: false,
  });
  roofGeo.translate(0, 0, -HOUSE_LENGTH / 2);

  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.y = FLOOR_HEIGHT * 2;
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);

  // ----------------------------------------------------
  // SUB-GROUP 5: 3D Room Badges / Labels
  // ----------------------------------------------------
  const labels1np = new THREE.Group();
  labels1np.name = 'labels-1np';
  ROOMS_1NP.forEach((r) => {
    const badge = createRoomBadge(r.name, r.area);
    badge.position.set(r.pos[0], r.pos[1], r.pos[2]);
    labels1np.add(badge);
  });
  group.add(labels1np);

  const labels2np = new THREE.Group();
  labels2np.name = 'labels-2np';
  ROOMS_2NP.forEach((r) => {
    const badge = createRoomBadge(r.name, r.area);
    badge.position.set(r.pos[0], r.pos[1], r.pos[2]);
    labels2np.add(badge);
  });
  group.add(labels2np);

  // Save references on the group for floor controllers
  group.floor1Group = floor1Group;
  group.ceiling1Group = ceiling1Group;
  group.floor2Group = floor2Group;
  group.roofGroup = roofGroup;
  group.labels1np = labels1np;
  group.labels2np = labels2np;

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

  // 4. Kryté loubí / zastřešený přechod mezi stáním a domem (4m mezera)
  const canopyGeo = new THREE.BoxGeometry(1.9, 0.12, 4.2);
  const canopy = new THREE.Mesh(canopyGeo, roofMat);
  canopy.position.set(4.45, 2.55, 5.5);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  group.add(canopy);

  // Chodník pod loubím
  const walkGeo = new THREE.BoxGeometry(1.8, 0.04, 4.2);
  const walkway = new THREE.Mesh(walkGeo, floorMat);
  walkway.position.set(4.45, 0.02, 5.5);
  walkway.receiveShadow = true;
  group.add(walkway);

  // Sloupy loubí
  const canopyPillarGeo = new THREE.BoxGeometry(0.14, 2.5, 0.14);
  const canopyPillars = [
    [5.3, 5.5],
    [5.3, 7.4],
    [3.6, 5.5],
    [3.6, 7.4],
  ];
  canopyPillars.forEach(([px, pz]) => {
    const pMesh = new THREE.Mesh(canopyPillarGeo, pillarMat);
    pMesh.position.set(px, 1.25, pz);
    pMesh.castShadow = true;
    group.add(pMesh);
  });

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

  // Switch to BIM tab and open sidebar
  switchSidebarTab('bim');
  toggleSidebar(true);
  const bimDot = document.getElementById('bim-badge-dot');
  if (bimDot) bimDot.style.display = 'block';

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

    // Enable shadows & clipping on loaded geometries
    ifcModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => {
              m.clippingPlanes = [houseClipPlane];
              m.clipShadows = true;
            });
          } else {
            child.material.clippingPlanes = [houseClipPlane];
            child.material.clipShadows = true;
          }
        }
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
  document.getElementById('inspector-panel')?.classList.remove('visible');
  const bimDot = document.getElementById('bim-badge-dot');
  if (bimDot) bimDot.style.display = 'none';
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

// ==========================================
// 9. Floor Plan & Dynamic Slicing Controller
// ==========================================
let currentFloorMode = 'all'; // 'all', '1np', '2np'
let labelsVisible = true;

const btnFloorAll = document.getElementById('btn-floor-all');
const btnFloor1np = document.getElementById('btn-floor-1np');
const btnFloor2np = document.getElementById('btn-floor-2np');
const btnFloorTopdown = document.getElementById('btn-floor-topdown');
const btnToggleLabels = document.getElementById('btn-toggle-labels');

const tabFloor1np = document.getElementById('tab-floor-1np');
const tabFloor2np = document.getElementById('tab-floor-2np');
const activeFloorBadge = document.getElementById('active-floor-badge');
const sliceSlider = document.getElementById('slice-slider');
const sliceVal = document.getElementById('slice-val');
const roomScheduleContainer = document.getElementById('room-schedule-container');

function updateRoomScheduleUI(mode) {
  const rooms = mode === '2np' ? ROOMS_2NP : ROOMS_1NP;
  if (roomScheduleContainer) {
    roomScheduleContainer.innerHTML = rooms
      .map(
        (r) => `
        <div class="room-item" data-id="${r.id}" title="${r.desc}">
          <span class="room-item-name">
            <span class="room-item-id">${r.id}</span>
            ${r.name}
          </span>
          <span class="room-item-area">${r.area}</span>
        </div>`
      )
      .join('');
  }
}

function setFloorMode(mode) {
  currentFloorMode = mode;

  // Update Toolbar Buttons
  [btnFloorAll, btnFloor1np, btnFloor2np].forEach((b) => b?.classList.remove('btn-primary'));
  if (mode === 'all') btnFloorAll?.classList.add('btn-primary');
  if (mode === '1np') btnFloor1np?.classList.add('btn-primary');
  if (mode === '2np') btnFloor2np?.classList.add('btn-primary');

  // Update Sidebar Buttons
  const btnSidebarAll = document.getElementById('btn-sidebar-all');
  const btnSidebar1np = document.getElementById('btn-sidebar-1np');
  const btnSidebar2np = document.getElementById('btn-sidebar-2np');
  [btnSidebarAll, btnSidebar1np, btnSidebar2np].forEach((b) => b?.classList.remove('btn-primary'));
  if (mode === 'all') btnSidebarAll?.classList.add('btn-primary');
  if (mode === '1np') btnSidebar1np?.classList.add('btn-primary');
  if (mode === '2np') btnSidebar2np?.classList.add('btn-primary');

  // Update Sidebar Tabs
  [tabFloor1np, tabFloor2np].forEach((t) => t?.classList.remove('btn-primary'));
  if (mode === '2np') {
    tabFloor2np?.classList.add('btn-primary');
  } else {
    tabFloor1np?.classList.add('btn-primary');
  }

  // Update Badge
  if (activeFloorBadge) {
    if (mode === 'all') activeFloorBadge.textContent = 'Celý dům';
    if (mode === '1np') activeFloorBadge.textContent = '1.NP Přízemí (74.5 m²)';
    if (mode === '2np') activeFloorBadge.textContent = '2.NP Patro (74.2 m²)';
  }

  updateRoomScheduleUI(mode);

  // Update 3D Model Visibility & Slicing Plane
  if (currentModel && currentModel.floor1Group) {
    if (mode === 'all') {
      currentModel.floor1Group.visible = true;
      currentModel.ceiling1Group.visible = true;
      currentModel.floor2Group.visible = true;
      currentModel.roofGroup.visible = true;
      currentModel.labels1np.visible = labelsVisible;
      currentModel.labels2np.visible = false;
      houseClipPlane.constant = 100.0;
      if (sliceSlider) sliceSlider.value = 8.5;
      if (sliceVal) sliceVal.textContent = 'Vše (bez řezu)';
    } else if (mode === '1np') {
      currentModel.floor1Group.visible = true;
      currentModel.ceiling1Group.visible = false;
      currentModel.floor2Group.visible = false;
      currentModel.roofGroup.visible = false;
      currentModel.labels1np.visible = labelsVisible;
      currentModel.labels2np.visible = false;
      houseClipPlane.constant = 2.75;
      if (sliceSlider) sliceSlider.value = 2.75;
      if (sliceVal) sliceVal.textContent = '2.75 m';
    } else if (mode === '2np') {
      currentModel.floor1Group.visible = true;
      currentModel.ceiling1Group.visible = true;
      currentModel.floor2Group.visible = true;
      currentModel.roofGroup.visible = false;
      currentModel.labels1np.visible = false;
      currentModel.labels2np.visible = labelsVisible;
      houseClipPlane.constant = 5.55;
      if (sliceSlider) sliceSlider.value = 5.55;
      if (sliceVal) sliceVal.textContent = '5.55 m';
    }
  } else {
    // Loaded IFC Model slicing
    if (mode === 'all') {
      houseClipPlane.constant = 100.0;
      if (sliceSlider) sliceSlider.value = 8.5;
      if (sliceVal) sliceVal.textContent = 'Vše (bez řezu)';
    } else if (mode === '1np') {
      houseClipPlane.constant = 2.75;
      if (sliceSlider) sliceSlider.value = 2.75;
      if (sliceVal) sliceVal.textContent = '2.75 m';
    } else if (mode === '2np') {
      houseClipPlane.constant = 5.55;
      if (sliceSlider) sliceSlider.value = 5.55;
      if (sliceVal) sliceVal.textContent = '5.55 m';
    }
  }
}

// Button Events
btnFloorAll?.addEventListener('click', () => setFloorMode('all'));
btnFloor1np?.addEventListener('click', () => setFloorMode('1np'));
btnFloor2np?.addEventListener('click', () => setFloorMode('2np'));

// Sidebar floor buttons sync
document.getElementById('btn-sidebar-all')?.addEventListener('click', () => setFloorMode('all'));
document.getElementById('btn-sidebar-1np')?.addEventListener('click', () => setFloorMode('1np'));
document.getElementById('btn-sidebar-2np')?.addEventListener('click', () => setFloorMode('2np'));
document.getElementById('btn-sidebar-topdown')?.addEventListener('click', () => btnFloorTopdown?.click());

// Sidebar fit button
document.getElementById('btn-fit-sidebar')?.addEventListener('click', () => {
  fitCameraToObject(siteContainer);
});

// Quick Sun button in top toolbar opens Sun tab in sidebar
document.getElementById('btn-quick-sun')?.addEventListener('click', () => {
  switchSidebarTab('sun');
  toggleSidebar(true);
});

tabFloor1np?.addEventListener('click', () => setFloorMode('1np'));
tabFloor2np?.addEventListener('click', () => setFloorMode('2np'));

btnToggleLabels?.addEventListener('click', () => {
  labelsVisible = !labelsVisible;
  btnToggleLabels.textContent = `🏷️ Místnosti: ${labelsVisible ? 'ON' : 'OFF'}`;
  btnToggleLabels.classList.toggle('btn-primary', labelsVisible);
  if (currentModel && currentModel.labels1np) {
    if (currentFloorMode === '2np') {
      currentModel.labels1np.visible = false;
      currentModel.labels2np.visible = labelsVisible;
    } else {
      currentModel.labels1np.visible = labelsVisible;
      currentModel.labels2np.visible = false;
    }
  }
});

btnFloorTopdown?.addEventListener('click', () => {
  if (currentFloorMode === 'all') {
    setFloorMode('1np');
  }
  const houseWorldPos = new THREE.Vector3();
  houseContainer.getWorldPosition(houseWorldPos);

  // Position camera directly overhead looking straight down
  camera.position.set(houseWorldPos.x, 26, houseWorldPos.z + 0.001);
  controls.target.copy(houseWorldPos);
  controls.update();
});

sliceSlider?.addEventListener('input', (e) => {
  const h = parseFloat(e.target.value);
  houseClipPlane.constant = h;
  if (sliceVal) sliceVal.textContent = `${h.toFixed(2)} m`;

  if (currentModel && currentModel.floor1Group) {
    if (h < 2.8) {
      currentModel.floor1Group.visible = true;
      currentModel.ceiling1Group.visible = false;
      currentModel.floor2Group.visible = false;
      currentModel.roofGroup.visible = false;
      currentModel.labels1np.visible = labelsVisible;
      currentModel.labels2np.visible = false;
      if (activeFloorBadge) activeFloorBadge.textContent = 'Řez 1.NP';
    } else if (h < 5.6) {
      currentModel.floor1Group.visible = true;
      currentModel.ceiling1Group.visible = true;
      currentModel.floor2Group.visible = true;
      currentModel.roofGroup.visible = false;
      currentModel.labels1np.visible = false;
      currentModel.labels2np.visible = labelsVisible;
      if (activeFloorBadge) activeFloorBadge.textContent = 'Řez 2.NP';
    } else {
      currentModel.floor1Group.visible = true;
      currentModel.ceiling1Group.visible = true;
      currentModel.floor2Group.visible = true;
      currentModel.roofGroup.visible = true;
      if (activeFloorBadge) activeFloorBadge.textContent = 'Řez střechou';
    }
  }
});

// Initial Floor setup
setFloorMode('all');

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

// ==========================================
// 10. Sidebar & Tab Navigation Controller
// ==========================================
const appSidebar = document.getElementById('app-sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const sidebarNavTabs = document.querySelectorAll('.sidebar-nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');

function toggleSidebar(forceState) {
  if (!appSidebar) return;
  const shouldOpen = typeof forceState === 'boolean' ? forceState : !appSidebar.classList.contains('open');
  appSidebar.classList.toggle('open', shouldOpen);
  sidebarBackdrop?.classList.toggle('open', shouldOpen);
  btnToggleSidebar?.classList.toggle('active', shouldOpen);
}

function switchSidebarTab(tabName) {
  sidebarNavTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  tabPanes.forEach((pane) => {
    pane.classList.toggle('active', pane.id === `tab-pane-${tabName}`);
  });
}

btnToggleSidebar?.addEventListener('click', () => toggleSidebar());
btnCloseSidebar?.addEventListener('click', () => toggleSidebar(false));
sidebarBackdrop?.addEventListener('click', () => toggleSidebar(false));

sidebarNavTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    switchSidebarTab(tab.dataset.tab);
  });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && appSidebar?.classList.contains('open')) {
    toggleSidebar(false);
  }
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

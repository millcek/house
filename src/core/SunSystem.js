import * as THREE from 'three';

const DIRECTIONS = [
  'S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV',
  'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ',
];

/**
 * Astronomical Solar Position Engine (50° N default) + Three.js Sunlight/Sky Controller.
 */
export class SunSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} store
   */
  constructor(scene, store) {
    this.scene = scene;
    this.store = store;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbf0, 1.3);
    this.sunLight.position.set(30, 45, 25);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 240;

    // Widen shadow camera frustum so long winter shadows (up to 30m) aren't clipped
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0003;
    this.scene.add(this.sunLight);

    // Hemisphere light for soft sky/ground bounce
    this.hemiLight = new THREE.HemisphereLight(0xebf2fa, 0x5a6351, 0.45);
    this.scene.add(this.hemiLight);
  }

  /**
   * Updates sun 3D position, shadow lighting, sky/fog, and pushes solar telemetry to store.
   * @param {number} dayOfYear (1..365)
   * @param {number} hour (decimal hour, e.g. 14.0)
   * @param {number} [latitudeDeg=50.0]
   */
  update(dayOfYear, hour, latitudeDeg = 50.0) {
    const rad = Math.PI / 180;
    const latRad = latitudeDeg * rad;

    // 1. Solární deklinace delta (-23.44° v zimě až +23.44° v létě)
    const delta = 23.44 * rad * Math.sin(((360 / 365) * (dayOfYear - 81)) * rad);

    // 2. Hodinový úhel H (15° za hodinu, 0 v solární poledne 12:00)
    const H = (hour - 12.0) * 15.0 * rad;

    // 3. Složky vektoru slunce v horizontální soustavě
    const xNorth = -Math.cos(delta) * Math.cos(H) * Math.sin(latRad) + Math.sin(delta) * Math.cos(latRad);
    const yEast = -Math.cos(delta) * Math.sin(H);
    const zUp = Math.cos(delta) * Math.cos(H) * Math.cos(latRad) + Math.sin(delta) * Math.sin(latRad);

    const elevationDeg = Math.asin(Math.max(-1, Math.min(1, zUp))) / rad;

    let azimuthDeg = Math.atan2(yEast, xNorth) / rad;
    if (azimuthDeg < 0) azimuthDeg += 360;

    // 3D scene coords: -Z = North, +Z = South, +X = East, -X = West
    const R = 90.0;
    this.sunLight.position.set(R * yEast, R * Math.max(0.01, zUp), -R * xNorth);

    const isDay = elevationDeg > 0;
    const isTwilight = elevationDeg > -5 && elevationDeg <= 0;

    if (isDay) {
      if (elevationDeg < 8) {
        this.sunLight.color.setHex(0xff8c42);
        this.sunLight.intensity = Math.max(0.4, (elevationDeg / 8) * 0.95);
        this.scene.background.setHex(0x9ca9ba);
        this.scene.fog.color.setHex(0x9ca9ba);
      } else if (elevationDeg < 22) {
        this.sunLight.color.setHex(0xffecd0);
        this.sunLight.intensity = 1.15;
        this.scene.background.setHex(0xaec8e2);
        this.scene.fog.color.setHex(0xaec8e2);
      } else {
        this.sunLight.color.setHex(0xfffef7);
        this.sunLight.intensity = 1.4;
        this.scene.background.setHex(0xb8d7f5);
        this.scene.fog.color.setHex(0xb8d7f5);
      }
      this.ambientLight.intensity = 0.45 + Math.min(0.3, (elevationDeg / 65) * 0.3);
    } else if (isTwilight) {
      this.sunLight.intensity = 0;
      this.ambientLight.intensity = 0.22;
      this.scene.background.setHex(0x3d4f63);
      this.scene.fog.color.setHex(0x3d4f63);
    } else {
      this.sunLight.intensity = 0;
      this.ambientLight.intensity = 0.12;
      this.scene.background.setHex(0x131a24);
      this.scene.fog.color.setHex(0x131a24);
    }

    const dirIndex = Math.round(azimuthDeg / 22.5) % 16;
    const directionName = DIRECTIONS[dirIndex];

    let summaryText = '';
    let summaryColor = '#fbbf24';

    if (!isDay) {
      summaryText = 'Noc (slunce pod obzorem)';
      summaryColor = '#9ca3af';
    } else if (dayOfYear > 330 || dayOfYear < 30) {
      const shadowRatio = (1 / Math.tan(Math.max(0.08, elevationDeg * rad))).toFixed(1);
      summaryText = `Zima: nízké slunce (${elevationDeg.toFixed(0)}°), stíny ${shadowRatio}× výšky domu!`;
      summaryColor = '#60a5fa';
    } else if (hour >= 13 && hour <= 18) {
      summaryText = `Odpolední slunce z ${directionName} přímo na zahradní terasu`;
      summaryColor = '#34d399';
    } else if (hour < 12) {
      summaryText = `Dopolední slunce z ${directionName} prosvětluje vjezd`;
      summaryColor = '#fbbf24';
    } else {
      summaryText = 'Západní podvečerní slunce';
      summaryColor = '#f97316';
    }

    this.store.setState({
      sun: {
        dayOfYear,
        hour,
        latitude: latitudeDeg,
        elevationDeg,
        azimuthDeg,
        directionName,
        isDay,
        summaryText,
        summaryColor,
      },
    });
  }
}

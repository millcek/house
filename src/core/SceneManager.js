import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { houseClipPlane } from './Materials.js';

/**
 * Manages the Three.js scene, camera, renderer, OrbitControls,
 * cadastral site container, house anchor container, and render loop.
 */
export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   * @param {number} [options.parcelRotationDeg=26.5]
   * @param {{x:number,z:number,rotY:number}} [options.defaultHousePos]
   */
  constructor(canvas, { parcelRotationDeg = 26.5, defaultHousePos = { x: 4.5, z: 1.0, rotY: 0 } } = {}) {
    this.canvas = canvas;
    this.clipPlane = houseClipPlane;
    this.tickCallbacks = new Set();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb0c8e0);
    this.scene.fog = new THREE.Fog(0xb0c8e0, 50, 160);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.5,
      1000
    );
    this.camera.position.set(25, 25, 35);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground
    this.controls.target.set(0, 2, 0);
    this.controls.update();

    // Cadastral Site Container
    this.siteContainer = new THREE.Group();
    this.siteContainer.rotation.y = THREE.MathUtils.degToRad(parcelRotationDeg);
    this.scene.add(this.siteContainer);

    // Plot Group (ground, roads, grid, boundary)
    this.plotGroup = new THREE.Group();
    this.siteContainer.add(this.plotGroup);

    // Setback lines Group
    this.setbackGroup = new THREE.Group();
    this.plotGroup.add(this.setbackGroup);

    // House Anchor Container
    this.houseContainer = new THREE.Group();
    this.setHouseTransform(defaultHousePos);
    this.siteContainer.add(this.houseContainer);

    this._handleResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._handleResize);
  }

  setHouseTransform({ x, z, rotY }) {
    if (typeof x === 'number') this.houseContainer.position.x = x;
    if (typeof z === 'number') this.houseContainer.position.z = z;
    if (typeof rotY === 'number') {
      this.houseContainer.rotation.y = THREE.MathUtils.degToRad(rotY);
    }
  }

  setClipHeight(height) {
    this.clipPlane.constant = height;
  }

  fitCameraToObject(object = this.siteContainer) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z, 15);
    const fov = this.camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

    this.camera.position.set(
      center.x + cameraZ * 0.7,
      center.y + cameraZ * 0.5,
      center.z + cameraZ * 0.8
    );
    this.controls.target.copy(center);
    this.controls.update();
  }

  alignCameraNorth() {
    this.camera.position.set(0, 32, 45);
    this.controls.target.set(0, 2, 0);
    this.controls.update();
  }

  setTopDownView(targetObject = this.houseContainer) {
    const worldPos = new THREE.Vector3();
    targetObject.getWorldPosition(worldPos);
    this.camera.position.set(worldPos.x, 26, worldPos.z + 0.001);
    this.controls.target.copy(worldPos);
    this.controls.update();
  }

  /**
   * Focuses camera on a local point inside houseContainer (e.g. a room centroid).
   * @param {[number, number, number]} localPos
   * @param {number} [distance=9]
   */
  focusHousePoint(localPos, distance = 9) {
    this.houseContainer.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3(...localPos).applyMatrix4(this.houseContainer.matrixWorld);

    const offsetDir = this.camera.position.clone().sub(this.controls.target);
    if (offsetDir.lengthSq() < 0.01) {
      offsetDir.set(0.6, 0.8, 0.7);
    }
    offsetDir.normalize().multiplyScalar(distance);
    if (offsetDir.y < 4) offsetDir.y = 5;

    this.controls.target.copy(worldPos);
    this.camera.position.copy(worldPos).add(offsetDir);
    this.controls.update();
  }

  /**
   * Returns current camera viewing angle relative to world North (-Z) in degrees.
   */
  getCameraAzimuthDeg() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const angle = Math.atan2(dir.x, -dir.z);
    return (angle * 180) / Math.PI;
  }

  onTick(callback) {
    this.tickCallbacks.add(callback);
    return () => this.tickCallbacks.delete(callback);
  }

  start() {
    const animate = () => {
      this._rafId = requestAnimationFrame(animate);
      this.controls.update();
      for (const cb of this.tickCallbacks) {
        cb();
      }
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  dispose() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._handleResize);
    this.controls.dispose();
    this.renderer.dispose();
  }

  _handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

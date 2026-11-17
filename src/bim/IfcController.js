import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

/**
 * Manages IFC file loading/parsing, concept variant switching,
 * and unified click raycasting for both IFC models and built-in Concept elements.
 */
export class IfcController {
  /**
   * @param {Object} deps
   * @param {import('../core/SceneManager.js').SceneManager} deps.sceneManager
   * @param {Object} deps.materials
   * @param {Object} deps.store
   * @param {Function} deps.buildConceptFn - `(variantId) => THREE.Group`
   * @param {THREE.Object3D} [deps.auxBuilding]
   */
  constructor({ sceneManager, materials, store, buildConceptFn, auxBuilding = null }) {
    this.sceneManager = sceneManager;
    this.materials = materials;
    this.store = store;
    this.buildConceptFn = buildConceptFn;
    this.auxBuilding = auxBuilding;

    this.ifcLoader = new IFCLoader();
    this.ifcLoader.ifcManager.setWasmPath('/wasm/');

    this.uploadedBuffers = new Map();
    this.currentModel = null;
    this.currentIfcModel = null;
    this.conceptHighlightMesh = null;
    this._highlightedSourceMesh = null;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this._pointerDownPos = null;

    this._bindCanvasEvents();
    this.store.subscribe(['site', 'sliceHeight', 'floorMode'], () =>
      queueMicrotask(() => this._syncConceptHighlightTransform())
    );
  }

  _bindCanvasEvents() {
    const canvas = this.sceneManager.canvas;

    canvas.addEventListener('pointerdown', (e) => {
      this._pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this._pointerDownPos) return;
      const dist = Math.hypot(e.clientX - this._pointerDownPos.x, e.clientY - this._pointerDownPos.y);
      this._pointerDownPos = null;
      if (dist <= 5 && e.button === 0) {
        this.pickElementAtEvent(e);
      }
    });
  }

  loadConceptVariant(variantId = 'concept') {
    this.clearSelection();
    this._clearCurrentModel();

    const model = this.buildConceptFn(variantId);
    this.currentModel = model;
    this.sceneManager.houseContainer.add(model);
    this.sceneManager.applyWallSlice(model);

    this.store.setState({
      activeModelId: variantId,
      selectedElement: null,
    });

    return model;
  }

  async loadIfcFromBuffer(buffer, fileName) {
    this.store.setState({
      loading: { active: true, text: `Parsing ${fileName}...` },
    });

    try {
      this.clearSelection();
      this._clearCurrentModel();

      this.uploadedBuffers.set(fileName, buffer);

      const ifcModel = await this.ifcLoader.parse(buffer);
      this.currentIfcModel = ifcModel;
      this.currentModel = ifcModel;

      // Enable shadows & clipping plane on loaded IFC geometries
      ifcModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              m.clippingPlanes = [this.sceneManager.clipPlane];
              m.clipShadows = true;
            }
          }
        }
      });

      // Auto-align model elevation Y=0 with ground level
      const box = new THREE.Box3().setFromObject(ifcModel);
      const center = new THREE.Vector3();
      box.getCenter(center);

      ifcModel.position.x = -center.x;
      ifcModel.position.y = -box.min.y;
      ifcModel.position.z = -center.z;

      this.sceneManager.houseContainer.add(ifcModel);

      const existing = this.store.getState().uploadedModels;
      const uploadedModels = existing.includes(fileName) ? existing : [...existing, fileName];

      this.store.setState({
        activeModelId: fileName,
        uploadedModels,
        selectedElement: null,
      });

      this.sceneManager.fitCameraToObject(this.sceneManager.houseContainer);
    } catch (err) {
      console.error('Error loading IFC:', err);
      alert(`Failed to parse IFC file: ${err.message}`);
    } finally {
      this.store.setState({
        loading: { active: false, text: '' },
      });
    }
  }

  async selectModel(modelId) {
    if (this.uploadedBuffers.has(modelId)) {
      const buffer = this.uploadedBuffers.get(modelId);
      await this.loadIfcFromBuffer(buffer, modelId);
      return;
    }
    this.loadConceptVariant(modelId);
  }

  async pickElementAtEvent(event) {
    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);

    if (this.currentIfcModel) {
      await this._pickIfcElement();
      return;
    }

    this._pickConceptElement();
  }

  async _pickIfcElement() {
    const intersects = this.raycaster.intersectObject(this.currentIfcModel, false);
    if (intersects.length === 0) return;

    const item = intersects[0];
    const expressID = this.ifcLoader.ifcManager.getExpressId(item.object.geometry, item.faceIndex);
    if (expressID === undefined) return;

    try {
      this.ifcLoader.ifcManager.createSubset({
        modelID: this.currentIfcModel.modelID,
        ids: [expressID],
        material: this.materials.highlight,
        scene: this.sceneManager.scene,
        removePrevious: true,
      });

      const props = await this.ifcLoader.ifcManager.getItemProperties(
        this.currentIfcModel.modelID,
        expressID
      );
      if (!props) return;

      const extraParams = {};
      const extraKeys = Object.keys(props).filter(
        (k) =>
          !['expressID', 'type', 'GlobalId', 'Name', 'Description'].includes(k) &&
          typeof props[k] === 'object' &&
          props[k]?.value !== undefined
      );
      for (const key of extraKeys.slice(0, 8)) {
        extraParams[key] = props[key].value;
      }

      this.store.setState({
        selectedElement: {
          type: props.__proto__?.constructor?.name || props.type || 'IFC Element',
          name: props.Name?.value || props.ObjectType?.value || 'Unnamed',
          globalId: props.GlobalId?.value || String(props.expressID || '—'),
          description: props.Description?.value || '—',
          parameters: extraParams,
        },
        activeTab: 'bim',
        sidebarOpen: true,
      });
    } catch (err) {
      console.warn('Property query failed:', err);
    }
  }

  _pickConceptElement() {
    const targets = [this.sceneManager.houseContainer];
    if (this.auxBuilding) targets.push(this.auxBuilding);

    const intersects = this.raycaster.intersectObjects(targets, true);
    const hit = intersects.find((i) => {
      if (!i.object.isMesh || !i.object.userData?.bim) return false;
      // Ensure all ancestor groups are visible and intersection point is below clip plane
      let obj = i.object;
      while (obj) {
        if (!obj.visible) return false;
        obj = obj.parent;
      }
      if (i.point.y > this.sceneManager.clipPlane.constant + 0.01) return false;
      return true;
    });

    if (!hit) return;

    const mesh = hit.object;
    const bim = mesh.userData.bim;
    this._highlightConceptMesh(mesh);

    this.store.setState({
      selectedElement: {
        type: bim.type,
        name: bim.name,
        globalId: mesh.uuid.slice(0, 12),
        description: bim.description || '—',
        parameters: {
          Podlaží: bim.floor || '—',
          ...(bim.parameters || {}),
        },
      },
      activeTab: 'bim',
      sidebarOpen: true,
    });
  }

  _highlightConceptMesh(mesh) {
    this._clearConceptHighlight();
    mesh.updateWorldMatrix(true, false);

    const highlight = new THREE.Mesh(mesh.geometry, this.materials.highlight);
    highlight.matrixAutoUpdate = false;
    highlight.matrix.copy(mesh.matrixWorld);
    highlight.renderOrder = 999;

    this.sceneManager.scene.add(highlight);
    this.conceptHighlightMesh = highlight;
    this._highlightedSourceMesh = mesh;
  }

  _syncConceptHighlightTransform() {
    if (this.conceptHighlightMesh && this._highlightedSourceMesh) {
      let visible = true;
      let obj = this._highlightedSourceMesh;
      while (obj) {
        if (!obj.visible) {
          visible = false;
          break;
        }
        obj = obj.parent;
      }
      this.conceptHighlightMesh.visible = visible;
      if (visible) {
        this._highlightedSourceMesh.updateWorldMatrix(true, false);
        this.conceptHighlightMesh.matrix.copy(this._highlightedSourceMesh.matrixWorld);
      }
    }
  }

  _clearConceptHighlight() {
    if (this.conceptHighlightMesh) {
      this.sceneManager.scene.remove(this.conceptHighlightMesh);
      this.conceptHighlightMesh = null;
    }
    this._highlightedSourceMesh = null;
  }

  clearSelection() {
    this._clearConceptHighlight();
    if (this.currentIfcModel) {
      this.ifcLoader.ifcManager.removeSubset(this.currentIfcModel.modelID);
    }
    this.store.setState({ selectedElement: null });
  }

  _clearCurrentModel() {
    if (this.currentModel) {
      this.sceneManager.houseContainer.remove(this.currentModel);
      this.currentModel = null;
    }
    if (this.currentIfcModel) {
      this.ifcLoader.ifcManager.removeSubset(this.currentIfcModel.modelID);
      this.currentIfcModel = null;
    }
  }
}

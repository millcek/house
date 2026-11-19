import * as THREE from 'three';

export const houseClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);

/**
 * Shared material palette for house models (clipping-aware) and site context.
 * @param {THREE.Plane} [clipPlane=houseClipPlane]
 */
export function createMaterials(clipPlane = houseClipPlane) {
  const clippingPlanes = [clipPlane];

  return {
    // House architectural materials (walls/partitions are sliced geometrically; other house materials use clipPlane)
    wall: new THREE.MeshStandardMaterial({
      color: 0xf1f3f5,
      roughness: 0.65,
    }),
    partition: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.7,
    }),
    slab: new THREE.MeshStandardMaterial({
      color: 0xf1f3f5,
      roughness: 0.65,
      clippingPlanes,
      clipShadows: true,
    }),
    wallCap: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.5,
      clippingPlanes,
    }),
    woodFloor: new THREE.MeshStandardMaterial({
      color: 0xc4a47c, // warm natural oak
      roughness: 0.5,
      clippingPlanes,
      clipShadows: true,
    }),
    tileFloor: new THREE.MeshStandardMaterial({
      color: 0xd2d7dc, // modern light stone tile
      roughness: 0.4,
      clippingPlanes,
      clipShadows: true,
    }),
    terrace: new THREE.MeshStandardMaterial({
      color: 0x7c5e42, // thermo-wood deck
      roughness: 0.75,
      clippingPlanes,
      clipShadows: true,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.4,
      roughness: 0.1,
      metalness: 0.1,
      clippingPlanes,
    }),
    frame: new THREE.MeshStandardMaterial({
      color: 0x1e293b, // dark anthracite frames
      roughness: 0.5,
      clippingPlanes,
      clipShadows: true,
    }),
    doorLeaf: new THREE.MeshStandardMaterial({
      color: 0xb89368, // warm oak interior door leaf
      roughness: 0.45,
      clippingPlanes,
      clipShadows: true,
    }),
    doorLeafExt: new THREE.MeshStandardMaterial({
      color: 0x273449, // insulated anthracite exterior entrance door
      roughness: 0.45,
      clippingPlanes,
      clipShadows: true,
    }),
    doorHandle: new THREE.MeshStandardMaterial({
      color: 0xcbd5e1, // brushed steel door handle
      roughness: 0.25,
      metalness: 0.8,
      clippingPlanes,
      clipShadows: true,
    }),
    roof: new THREE.MeshStandardMaterial({
      color: 0x2b2f38, // dark roof
      roughness: 0.45,
      metalness: 0.1,
      clippingPlanes,
      clipShadows: true,
    }),
    solarPanel: new THREE.MeshStandardMaterial({
      color: 0x111c26, // deep monocrystalline blue-black
      roughness: 0.15,
      metalness: 0.85,
      clippingPlanes,
      clipShadows: true,
    }),
    solarFrame: new THREE.MeshStandardMaterial({
      color: 0x334155, // dark aluminum mounting frame
      roughness: 0.35,
      metalness: 0.7,
      clippingPlanes,
      clipShadows: true,
    }),
    rainwaterTank: new THREE.MeshStandardMaterial({
      color: 0x1e293b, // durable cast-iron / dark polyetylene manhole cover
      roughness: 0.65,
      metalness: 0.3,
      clippingPlanes,
      clipShadows: true,
    }),
    stair: new THREE.MeshStandardMaterial({
      color: 0x96744e,
      roughness: 0.5,
      clippingPlanes,
      clipShadows: true,
    }),
    furniture: new THREE.MeshStandardMaterial({
      color: 0xdbe2ea,
      roughness: 0.65,
      clippingPlanes,
      clipShadows: true,
    }),
    kitchenCounter: new THREE.MeshStandardMaterial({
      color: 0x334155, // anthracite slate counter
      roughness: 0.4,
      clippingPlanes,
      clipShadows: true,
    }),

    // Site & auxiliary building materials (unclipped)
    ground: new THREE.MeshStandardMaterial({
      color: 0x567d46,
      roughness: 0.85,
      metalness: 0.05,
    }),
    road: new THREE.MeshStandardMaterial({
      color: 0x2d3139,
      roughness: 0.9,
    }),
    auxWall: new THREE.MeshStandardMaterial({
      color: 0xebedf0,
      roughness: 0.6,
    }),
    auxRoof: new THREE.MeshStandardMaterial({
      color: 0x2b2f38,
      roughness: 0.45,
      metalness: 0.1,
    }),
    auxPillar: new THREE.MeshStandardMaterial({
      color: 0x374151,
      roughness: 0.5,
    }),
    auxFloor: new THREE.MeshStandardMaterial({
      color: 0x4b5563,
      roughness: 0.8,
    }),

    // Highlight material for BIM / Concept element selection
    highlight: new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      depthTest: false,
      transparent: true,
      opacity: 0.5,
    }),
  };
}

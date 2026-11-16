import * as THREE from 'three';

function degToRad(deg = 0) {
  return (deg * Math.PI) / 180;
}

function createBoxPart(w, h, d, x, y, z, material, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds parametric furniture, fixtures, stairs, or pergola elements placed
 * at `pos: [x, z]` on `floorY` with optional `rotY` rotation (degrees).
 */
export function buildFurnitureItem(item, materials, floorY = 0, floorName = '1.NP') {
  const group = new THREE.Group();
  const [x, z] = item.pos || [0, 0];
  group.position.set(x, floorY, z);
  if (item.rotY) {
    group.rotation.y = degToRad(item.rotY);
  }

  const size = item.size || [];
  let labelType = 'IfcFurnishingElement';
  let desc = item.desc || 'Vybavení interiéru';

  switch (item.type) {
    case 'bed': {
      const [w = 1.8, h = 0.52, d = 2.0] = size;
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.furniture, true));
      break;
    }
    case 'desk': {
      const [w = 1.3, h = 0.75, d = 0.7] = size;
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.furniture, true));
      break;
    }
    case 'wardrobe': {
      const [w = 0.6, h = 2.1, d = 1.6] = size;
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.frame, true));
      break;
    }
    case 'shower': {
      const [w = 0.9, h = 2.0, d = 0.9] = size;
      labelType = 'IfcSanitaryTerminal';
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.glass, false));
      break;
    }
    case 'kitchenIsland':
    case 'kitchenCounter': {
      const [w = 1.0, h = 0.9, d = 2.2] = size;
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.kitchenCounter, true));
      break;
    }
    case 'diningTable': {
      const [w = 1.0, h = 0.76, d = 2.0] = size;
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.furniture, true));
      break;
    }
    case 'coffeeTable': {
      const [w = 0.8, h = 0.35, d = 1.2] = size;
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.furniture, false));
      break;
    }
    case 'lSofa': {
      const parts = item.parts || [
        { size: [2.6, 0.45, 1.0], offset: [0, 0] },
        { size: [1.0, 0.45, 1.8], offset: [-0.8, -1.4] },
      ];
      for (const part of parts) {
        const [pw, ph, pd] = part.size;
        const [ox, oz] = part.offset;
        group.add(createBoxPart(pw, ph, pd, ox, 0, oz, materials.furniture, false));
      }
      break;
    }
    case 'hvac': {
      const [w = 0.8, h = 1.8, d = 0.8] = size;
      labelType = 'IfcEnergyConversionDevice';
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.frame, true));
      break;
    }
    case 'bathtub': {
      const [w = 0.85, h = 0.6, d = 1.7] = size;
      labelType = 'IfcSanitaryTerminal';
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.frame, false));
      break;
    }
    case 'vanity': {
      const [w = 0.55, h = 0.85, d = 1.2] = size;
      labelType = 'IfcSanitaryTerminal';
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.furniture, false));
      break;
    }
    case 'wc': {
      const [w = 0.45, h = 0.45, d = 0.65] = size;
      labelType = 'IfcSanitaryTerminal';
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.frame, false));
      break;
    }
    case 'laundryStack': {
      const [w = 0.65, h = 1.7, d = 0.65] = size;
      labelType = 'IfcElectricAppliance';
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.frame, false));
      break;
    }
    case 'stairs': {
      labelType = 'IfcStair';
      const stepCount = item.stepCount ?? 14;
      const stepWidth = item.stepWidth ?? 0.95;
      const stepHeight = item.stepHeight ?? 0.18;
      const stepDepth = item.stepDepth ?? 0.26;
      const stepRise = (item.totalRise ?? 2.8) / stepCount;
      const stepRun = item.stepRun ?? 0.18;

      const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
      for (let s = 0; s < stepCount; s++) {
        const stepMesh = new THREE.Mesh(stepGeo, materials.stair);
        stepMesh.position.set(0, (s + 0.5) * stepRise, s * stepRun);
        stepMesh.castShadow = true;
        stepMesh.receiveShadow = true;
        group.add(stepMesh);
      }
      break;
    }
    case 'pergola': {
      labelType = 'IfcColumn (Pergola)';
      const postSize = item.postSize ?? 0.14;
      const postHeight = item.height ?? 2.8;
      const postGeo = new THREE.BoxGeometry(postSize, postHeight, postSize);
      for (const [px, pz] of item.posts || []) {
        const post = new THREE.Mesh(postGeo, materials.frame);
        post.position.set(px, postHeight / 2, pz);
        post.castShadow = true;
        group.add(post);
      }
      break;
    }
    default: {
      const [w = 1, h = 1, d = 1] = size;
      group.add(createBoxPart(w, h, d, 0, 0, 0, materials.furniture, true));
    }
  }

  const bimData = {
    type: labelType,
    name: item.name || item.type,
    floor: floorName,
    description: desc,
    parameters: {
      Pozice: `[${x.toFixed(1)}, ${z.toFixed(1)}] m`,
      ...(size.length === 3
        ? { Rozměry: `${size[0]} × ${size[2]} × ${size[1]} m` }
        : {}),
      ...(item.rotY ? { Natočení: `${item.rotY}°` } : {}),
    },
  };

  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.bim = bimData;
    }
  });

  return group;
}

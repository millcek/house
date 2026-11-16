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
      if (item.layout === 'u-turn') {
        const xStart = item.xStart ?? -0.5;
        const xLanding = item.xLanding ?? -2.5;
        const xEnd = item.xEnd ?? -3.6;
        const zFlight1 = item.zFlight1 ?? [-1.62, -0.75];
        const zFlight2 = item.zFlight2 ?? [-0.67, 0.2];
        const stepsPerFlight = item.stepsPerFlight ?? 8;
        const totalRise = item.totalRise ?? 3.02;

        const totalRisers = stepsPerFlight * 2 + 2;
        const riserHeight = totalRise / totalRisers;
        const stepRun = Math.abs(xStart - xLanding) / stepsPerFlight;
        const dir = xLanding <= xStart ? -1 : 1;
        const stepHeight = item.stepHeight ?? 0.17;
        const stepDepth = stepRun + 0.02;

        // Flight 1 (ascending from hallway edge xStart toward xLanding)
        const w1 = Math.abs(zFlight1[1] - zFlight1[0]);
        const z1Center = (zFlight1[0] + zFlight1[1]) / 2;
        const stepGeo1 = new THREE.BoxGeometry(stepDepth, stepHeight, w1);
        for (let s = 0; s < stepsPerFlight; s++) {
          const yTop = (s + 1) * riserHeight;
          const stepMesh = new THREE.Mesh(stepGeo1, materials.stair);
          stepMesh.position.set(
            xStart + dir * (s + 0.5) * stepRun,
            yTop - stepHeight / 2,
            z1Center
          );
          stepMesh.castShadow = true;
          stepMesh.receiveShadow = true;
          group.add(stepMesh);
        }

        // Mid-landing (Mezipodesta, riser stepsPerFlight + 1)
        const yLanding = (stepsPerFlight + 1) * riserHeight;
        const landingThickness = 0.18;
        const landingWidthX = Math.abs(xLanding - xEnd);
        const landingCenterX = (xEnd + xLanding) / 2;
        const zMin = Math.min(zFlight1[0], zFlight1[1], zFlight2[0], zFlight2[1]);
        const zMax = Math.max(zFlight1[0], zFlight1[1], zFlight2[0], zFlight2[1]);
        const landingWidthZ = zMax - zMin;
        const landingCenterZ = (zMin + zMax) / 2;
        const landingMesh = new THREE.Mesh(
          new THREE.BoxGeometry(landingWidthX, landingThickness, landingWidthZ),
          materials.stair
        );
        landingMesh.position.set(
          landingCenterX,
          yLanding - landingThickness / 2,
          landingCenterZ
        );
        landingMesh.castShadow = true;
        landingMesh.receiveShadow = true;
        group.add(landingMesh);

        // Flight 2 (ascending from mid-landing xLanding back toward hallway edge xStart)
        const w2 = Math.abs(zFlight2[1] - zFlight2[0]);
        const z2Center = (zFlight2[0] + zFlight2[1]) / 2;
        const stepGeo2 = new THREE.BoxGeometry(stepDepth, stepHeight, w2);
        for (let s = 0; s < stepsPerFlight; s++) {
          const yTop = (stepsPerFlight + 2 + s) * riserHeight;
          const stepMesh = new THREE.Mesh(stepGeo2, materials.stair);
          stepMesh.position.set(
            xLanding - dir * (s + 0.5) * stepRun,
            yTop - stepHeight / 2,
            z2Center
          );
          stepMesh.castShadow = true;
          stepMesh.receiveShadow = true;
          group.add(stepMesh);
        }

        // Central balustrade / divider in the stairwell gap between Flight 1 and Flight 2
        const gapCenterZ = (zFlight1[1] + zFlight2[0]) / 2;
        const gapWidth = Math.abs(zFlight2[0] - zFlight1[1]);
        const dividerThick = Math.max(0.03, Math.min(0.05, gapWidth > 0.01 ? gapWidth * 0.6 : 0.04));

        const addSlopedRail = (xA, yA, xB, yB) => {
          const dx = xB - xA;
          const dy = yB - yA;
          const railLen = Math.hypot(dx, dy);
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(railLen, 0.05, dividerThick + 0.01),
            materials.frame
          );
          rail.position.set((xA + xB) / 2, (yA + yB) / 2, gapCenterZ);
          rail.rotation.z = Math.atan2(dy, dx);
          rail.castShadow = true;
          group.add(rail);
        };

        for (let i = 0; i <= stepsPerFlight; i++) {
          const t = i / stepsPerFlight;
          const xPos = xStart + dir * i * stepRun;
          const yBottom = Math.max(0, i * riserHeight - 0.15);
          const yRail2 = totalRise + 0.9 - t * (totalRise - yLanding);
          const postH = yRail2 - yBottom;
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, postH, dividerThick),
            materials.frame
          );
          post.position.set(xPos, yBottom + postH / 2, gapCenterZ);
          post.castShadow = true;
          group.add(post);
        }

        addSlopedRail(xStart, riserHeight + 0.9, xLanding, yLanding + 0.9);
        addSlopedRail(xLanding, yLanding + 0.9, xStart, totalRise + 0.9);
        break;
      }

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
    case 'railing': {
      labelType = 'IfcRailing';
      const [w = 0.08, h = 1.0, d = 1.02] = size;
      const alongX = w >= d;
      const thickness = alongX ? d : w;
      const span = alongX ? w : d;

      // Top handrail & bottom rail
      group.add(
        createBoxPart(
          alongX ? span : thickness,
          0.05,
          alongX ? thickness : span,
          0,
          h - 0.05,
          0,
          materials.frame,
          true
        )
      );
      group.add(
        createBoxPart(
          alongX ? span : thickness * 0.8,
          0.04,
          alongX ? thickness * 0.8 : span,
          0,
          0.04,
          0,
          materials.frame,
          true
        )
      );

      // Glass infill panel
      const glassLen = Math.max(0.05, span - thickness);
      const glassH = Math.max(0.05, h - 0.13);
      group.add(
        createBoxPart(
          alongX ? glassLen : 0.02,
          glassH,
          alongX ? 0.02 : glassLen,
          0,
          0.08,
          0,
          materials.glass,
          false
        )
      );

      // End posts
      const offset = Math.max(0, span / 2 - thickness / 2);
      for (const sign of [-1, 1]) {
        group.add(
          createBoxPart(
            thickness,
            h,
            thickness,
            alongX ? sign * offset : 0,
            0,
            alongX ? 0 : sign * offset,
            materials.frame,
            true
          )
        );
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

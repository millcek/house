import * as THREE from 'three';

/**
 * Builds an extruded horizontal floor/ceiling slab with optional rectangular cutouts.
 *
 * @param {Object} slabDef
 * @param {number} slabDef.width
 * @param {number} slabDef.length
 * @param {number} slabDef.thickness
 * @param {number} slabDef.y
 * @param {Array<{x1:number,z1:number,x2:number,z2:number}>} [slabDef.holes]
 * @param {Object} materials
 */
export function buildSlab(slabDef, materials) {
  const { width, length, thickness, y, holes = [], name = 'Stropní deska' } = slabDef;
  const hw = width / 2;
  const hl = length / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hl);
  shape.lineTo(hw, -hl);
  shape.lineTo(hw, hl);
  shape.lineTo(-hw, hl);
  shape.closePath();

  // In Shape plane rotated by -PI/2 around X: Shape Y maps to -Z in 3D
  for (const hole of holes) {
    const path = new THREE.Path();
    path.moveTo(hole.x1, -hole.z1);
    path.lineTo(hole.x2, -hole.z1);
    path.lineTo(hole.x2, -hole.z2);
    path.lineTo(hole.x1, -hole.z2);
    path.closePath();
    shape.holes.push(path);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geo, materials.slab || materials.wall);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  mesh.userData.bim = {
    type: 'IfcSlab',
    name,
    floor: '1.NP / 2.NP',
    description: 'Železobetonová stropní deska s otvorem pro schodiště',
    parameters: {
      Plocha: `${(width * length).toFixed(1)} m²`,
      Tloušťka: `${thickness.toFixed(2)} m`,
      Úroveň: `${y.toFixed(2)} m`,
    },
  };

  return mesh;
}

/**
 * Builds an extruded gable roof along either the Z axis (default) or X axis,
 * separating the triangular gable masonry core (`gableMaterial`) from the
 * overhanging pitched roof shell (`material`).
 */
export function buildGableRoof(roofDef, material, gableMaterial = null) {
  const {
    width,
    length,
    height,
    y,
    ridgeAxis = 'z',
    name = 'Sedlová střecha',
    eaveOverhang = 0.45,
    gableOverhang = 0.35,
    thickness = 0.22,
  } = roofDef;

  const span = ridgeAxis === 'z' ? width : length;
  const run = ridgeAxis === 'z' ? length : width;
  const halfSpan = span / 2;

  const group = new THREE.Group();
  group.name = 'roof-assembly';
  group.position.y = y;

  const orientGeo = (geo, depth) => {
    if (ridgeAxis === 'x') {
      geo.rotateY(Math.PI / 2);
      geo.translate(-depth / 2, 0, 0);
    } else {
      geo.translate(0, 0, -depth / 2);
    }
    return geo;
  };

  // 1. Gable Wall Core (Štítové stěny)
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-halfSpan, 0);
  gableShape.lineTo(halfSpan, 0);
  gableShape.lineTo(0, height);
  gableShape.closePath();

  const gableGeo = orientGeo(
    new THREE.ExtrudeGeometry(gableShape, {
      depth: run,
      bevelEnabled: false,
    }),
    run
  );
  const gableMesh = new THREE.Mesh(gableGeo, gableMaterial || material);
  gableMesh.castShadow = true;
  gableMesh.receiveShadow = true;
  gableMesh.userData.bim = {
    type: 'IfcWallStandardCase (Štít)',
    name: 'Štítové zdivo střechy',
    floor: 'Střecha',
    description: 'Štítová stěna pod sedlovou střechou',
    parameters: {
      Rozpětí: `${span.toFixed(1)} m`,
      'Výška štítu': `${height.toFixed(2)} m`,
      Délka: `${run.toFixed(1)} m`,
    },
  };
  group.add(gableMesh);

  // 2. Pitched Roof Shell (Střešní plášť s přesahy)
  const slopeAngle = Math.atan2(height, halfSpan);
  const dyEave = eaveOverhang * (height / halfSpan);
  const dyThick = thickness / Math.cos(slopeAngle);
  const outerHalfSpan = halfSpan + eaveOverhang;
  const shellDepth = run + 2 * gableOverhang;

  const shellShape = new THREE.Shape();
  shellShape.moveTo(-outerHalfSpan, -dyEave);
  shellShape.lineTo(0, height);
  shellShape.lineTo(outerHalfSpan, -dyEave);
  shellShape.lineTo(outerHalfSpan, -dyEave + dyThick);
  shellShape.lineTo(0, height + dyThick);
  shellShape.lineTo(-outerHalfSpan, -dyEave + dyThick);
  shellShape.closePath();

  const shellGeo = orientGeo(
    new THREE.ExtrudeGeometry(shellShape, {
      depth: shellDepth,
      bevelEnabled: false,
    }),
    shellDepth
  );
  const shellMesh = new THREE.Mesh(shellGeo, material);
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  shellMesh.userData.bim = {
    type: 'IfcRoof',
    name,
    floor: 'Střecha',
    description: 'Sedlová střecha s přesahy okapů a štítů',
    parameters: {
      Půdorys: `${width.toFixed(1)} × ${length.toFixed(1)} m`,
      'Výška hřebene': `${height.toFixed(2)} m`,
      'Přesah okapu': `${eaveOverhang.toFixed(2)} m`,
      'Přesah štítu': `${gableOverhang.toFixed(2)} m`,
      'Směr hřebene': ridgeAxis.toUpperCase(),
    },
  };
  group.add(shellMesh);

  return group;
}

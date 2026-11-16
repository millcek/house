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

  const mesh = new THREE.Mesh(geo, materials.wall);
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
 * Builds an extruded gable roof along either the Z axis (default) or X axis.
 */
export function buildGableRoof(roofDef, material) {
  const {
    width,
    length,
    height,
    y,
    ridgeAxis = 'z',
    name = 'Sedlová střecha',
  } = roofDef;

  const span = ridgeAxis === 'z' ? width : length;
  const run = ridgeAxis === 'z' ? length : width;
  const halfSpan = span / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-halfSpan, 0);
  shape.lineTo(halfSpan, 0);
  shape.lineTo(0, height);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: run,
    bevelEnabled: false,
  });

  if (ridgeAxis === 'x') {
    geo.rotateY(Math.PI / 2);
    geo.translate(-run / 2, 0, 0);
  } else {
    geo.translate(0, 0, -run / 2);
  }

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.bim = {
    type: 'IfcRoof',
    name,
    floor: 'Střecha',
    description: 'Sedlová střecha',
    parameters: {
      Půdorys: `${width.toFixed(1)} × ${length.toFixed(1)} m`,
      'Výška hřebene': `${height.toFixed(2)} m`,
      'Směr hřebene': ridgeAxis.toUpperCase(),
    },
  };

  return mesh;
}

import * as THREE from 'three';

/**
 * Renders a 3D floating canvas-texture badge for a room.
 */
export function createRoomBadge(name, areaText, color = '#ffffff') {
  const cvs = document.createElement('canvas');
  cvs.width = 256;
  cvs.height = 110;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 3;

  const r = 14;
  const x = 4;
  const y = 4;
  const w = 248;
  const h = 102;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = 'bold 23px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 40);

  ctx.fillStyle = '#60a5fa';
  ctx.font = '600 21px monospace';
  ctx.fillText(areaText, 128, 76);

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

/**
 * Builds floor finish slabs (`woodFloor`, `tileFloor`, `terrace`) for a floor level.
 */
export function buildFloorFinishes(zones = [], materials, floorY = 0, floorName = '1.NP') {
  const group = new THREE.Group();
  group.name = `floor-finishes-${floorName}`;

  for (const zone of zones) {
    const [w, d] = zone.size;
    const thickness = zone.thickness ?? 0.12;
    const [x, z] = zone.pos;
    const mat = materials[zone.material] || materials.woodFloor;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), mat);
    mesh.position.set(x, floorY + thickness / 2, z);
    mesh.receiveShadow = true;
    mesh.userData.bim = {
      type: 'IfcCovering (Podlaha)',
      name: zone.name || 'Podlahová vrstva',
      floor: floorName,
      description: zone.material === 'terrace' ? 'Venkovní terasa' : 'Interiérová podlaha',
      parameters: {
        Rozměr: `${w.toFixed(1)} × ${d.toFixed(1)} m`,
        Plocha: `${(w * d).toFixed(1)} m²`,
        Tloušťka: `${thickness.toFixed(2)} m`,
      },
    };
    group.add(mesh);
  }

  return group;
}

/**
 * Computes normalized room schedule entries with auto-calculated areas
 * (from `dims: [w, d]` when present, or `areaSqm` / `area`) and floor total.
 */
export function computeRoomSchedule(rooms = []) {
  const normalized = rooms.map((room) => {
    let areaSqm = room.areaSqm;
    if (typeof areaSqm !== 'number' && Array.isArray(room.dims)) {
      areaSqm = Number((room.dims[0] * room.dims[1]).toFixed(1));
    }
    if (typeof areaSqm !== 'number' && typeof room.area === 'string') {
      areaSqm = parseFloat(room.area) || 0;
    }

    const areaText = room.area || `${areaSqm.toFixed(1)} m²`;
    return {
      ...room,
      areaSqm,
      area: areaText,
      interior: room.interior !== false,
    };
  });

  const interiorTotalSqm = normalized
    .filter((r) => r.interior)
    .reduce((sum, r) => sum + r.areaSqm, 0);

  return {
    rooms: normalized,
    interiorTotalSqm: Number(interiorTotalSqm.toFixed(1)),
  };
}

/**
 * Builds the 3D sprite labels group for a list of rooms.
 */
export function buildRoomLabels(rooms = []) {
  const group = new THREE.Group();
  const { rooms: normalized } = computeRoomSchedule(rooms);

  for (const room of normalized) {
    const badge = createRoomBadge(room.name, room.area, room.badgeColor);
    badge.position.set(room.pos[0], room.pos[1], room.pos[2]);
    group.add(badge);
  }

  return group;
}

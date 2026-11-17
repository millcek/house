import * as THREE from 'three';
import { buildWall } from './WallBuilder.js';
import { buildFloorFinishes, buildRoomLabels } from './RoomBuilder.js';
import { buildFurnitureItem } from './FurnitureCatalog.js';
import { buildSlab, buildGableRoof } from './SlabAndRoofBuilder.js';

function assembleFloorGroup(name, floorConfig, materials, floorLabel) {
  const group = new THREE.Group();
  group.name = name;

  const y = floorConfig.elevation ?? 0;

  if (floorConfig.finishes?.length) {
    group.add(buildFloorFinishes(floorConfig.finishes, materials, y, floorLabel));
  }

  for (const wall of floorConfig.walls || []) {
    group.add(buildWall(wall, materials, y, floorLabel));
  }

  const furnitureGroup = new THREE.Group();
  furnitureGroup.name = `furniture-${floorLabel.toLowerCase().replace('.', '')}`;

  for (const item of floorConfig.furniture || []) {
    const mesh = buildFurnitureItem(item, materials, y, floorLabel);
    if (
      item.type === 'stairs' ||
      item.type === 'canopy' ||
      item.type === 'pergola' ||
      item.type === 'railing' ||
      item.type === 'shaft'
    ) {
      group.add(mesh);
    } else {
      furnitureGroup.add(mesh);
    }
  }

  group.add(furnitureGroup);
  group.furnitureGroup = furnitureGroup;

  return group;
}

/**
 * Assembles a complete multi-story house model from a declarative design config.
 * Preserves named sub-group references (`floor1Group`, `ceiling1Group`, `floor2Group`,
 * `roofGroup`, `labels1np`, `labels2np`) for floor-mode toggling and slicing.
 *
 * @param {Object} designConfig
 * @param {Object} materials
 * @returns {THREE.Group}
 */
export function buildHouseModel(designConfig, materials) {
  const group = new THREE.Group();
  group.name = designConfig.id || 'concept-house';

  const floor1Group = assembleFloorGroup('floor1-group', designConfig.floor1, materials, '1.NP');
  group.add(floor1Group);

  const ceiling1Group = new THREE.Group();
  ceiling1Group.name = 'ceiling1-group';
  if (designConfig.ceilingSlab) {
    ceiling1Group.add(buildSlab(designConfig.ceilingSlab, materials));
  }
  group.add(ceiling1Group);

  const floor2Group = assembleFloorGroup('floor2-group', designConfig.floor2, materials, '2.NP');
  group.add(floor2Group);

  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof-group';
  if (designConfig.ceiling2Slab) {
    roofGroup.add(buildSlab(designConfig.ceiling2Slab, materials));
  }
  if (designConfig.roof) {
    roofGroup.add(buildGableRoof(designConfig.roof, materials.roof, materials.wall));
  }
  group.add(roofGroup);

  const labels1np = buildRoomLabels(designConfig.floor1?.rooms || [], designConfig.floor1);
  labels1np.name = 'labels-1np';
  group.add(labels1np);

  const labels2np = buildRoomLabels(designConfig.floor2?.rooms || [], designConfig.floor2);
  labels2np.name = 'labels-2np';
  group.add(labels2np);

  // References consumed by floor slicing controller
  group.floor1Group = floor1Group;
  group.ceiling1Group = ceiling1Group;
  group.floor2Group = floor2Group;
  group.roofGroup = roofGroup;
  group.labels1np = labels1np;
  group.labels2np = labels2np;
  group.furniture1np = floor1Group.furnitureGroup;
  group.furniture2np = floor2Group.furnitureGroup;
  group.designConfig = designConfig;

  return group;
}

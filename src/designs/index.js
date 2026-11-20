import { dreamHouseV1 } from './dreamHouseV1.js';
import { compactHouse5kk } from './compactHouse5kk.js';
import { bungalowHouse5kk } from './bungalowHouse5kk.js';
import {
  ASSEMBLY_6KK,
  ASSEMBLY_5KK,
  ASSEMBLY_BUNGALOW_5KK,
  ASSEMBLIES,
  getAssembly,
  listAssemblies,
  exportAssemblyAsJson,
} from './assemblies.js';

export {
  dreamHouseV1,
  compactHouse5kk,
  bungalowHouse5kk,
  ASSEMBLY_6KK,
  ASSEMBLY_5KK,
  ASSEMBLY_BUNGALOW_5KK,
  ASSEMBLIES,
  getAssembly,
  listAssemblies,
  exportAssemblyAsJson,
};

export const defaultDesign = dreamHouseV1;

export function getDesignVariant(id = 'concept') {
  const assembly = getAssembly(id);
  return assembly?.house || dreamHouseV1;
}

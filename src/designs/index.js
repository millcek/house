import { dreamHouseV1, dreamHouse5kk, dreamHouseOriginal } from './dreamHouseV1.js';

export const DESIGN_VARIANTS = {
  concept: dreamHouseV1,
  v5kk: dreamHouse5kk,
  original: dreamHouseOriginal,
};

export function getDesignVariant(id = 'concept') {
  return DESIGN_VARIANTS[id] || DESIGN_VARIANTS.concept;
}

export function listDesignVariants() {
  return Object.values(DESIGN_VARIANTS);
}

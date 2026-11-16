import { dreamHouseV1 } from './dreamHouseV1.js';

export const DESIGN_VARIANTS = {
  concept: dreamHouseV1,
};

export function getDesignVariant(id = 'concept') {
  return DESIGN_VARIANTS[id] || DESIGN_VARIANTS.concept;
}

export function listDesignVariants() {
  return Object.values(DESIGN_VARIANTS);
}

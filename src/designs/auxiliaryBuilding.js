export const auxiliaryBuildingConfig = {
  id: 'auxiliary-carport-workshop',
  parkWidth: 6,
  workshopWidth: 4,
  depth: 6.5,
  wallHeight: 2.7,
  roofType: 'mono',
  roofHeight: 0.45,
  position: [3.5, 0, -12.25],
  // Otvory dílny. wall: S (+z) | N (-z) | E (+x, ke stání) | W (-x).
  // offset = poloha středu otvoru od středu stěny (S/N podél x, E/W podél z), v metrech.
  workshopOpenings: [
    { id: 'D1', kind: 'door', wall: 'S', offset: 0, width: 1.4, height: 2.1, sill: 0, name: 'Dvoukřídlé dveře dílny' },
    { id: 'O1', kind: 'window', wall: 'W', offset: 0, width: 1.5, height: 1.2, sill: 0.9, name: 'Okno dílny (západ)' },
    { id: 'O2', kind: 'window', wall: 'N', offset: 0, width: 1.2, height: 0.6, sill: 1.9, name: 'Horní okno dílny (sever)' },
  ],
  canopy: {
    size: [1.9, 0.12, 3.96],
    pos: [4.05, 2.55, 5.23],
    walkWidth: 1.8,
    pillars: [
      [4.90, 3.55],
      [4.90, 6.85],
      [3.20, 3.55],
      [3.20, 6.85],
    ],
  },
  eastWalkway: {
    size: [1.2, 0.04, 7.6],
    pos: [5.70, 0.02, 8.85],
  },
};

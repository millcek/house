export const auxiliaryBuildingConfig = {
  id: 'auxiliary-carport-workshop',
  // Uspořádání v ose S-J: Dům (jih, z=-5..7) -> Stání (střed, z=-11..-5) -> Dílna (sever, z=-15..-11)
  layout: 'stacked-north-south',
  width: 6.5, // Šířka v ose X (x = 2.0 až 8.5, zarovnáno na východní líc domu)
  parkWidth: 6.5,
  workshopWidth: 6.5,
  parkDepth: 6.0, // Stání 6.5 × 6.0 m (39.0 m²)
  workshopDepth: 4.0, // Dílna 6.5 × 4.0 m (26.0 m²)
  depth: 10.0, // Celková hloubka v ose Z (stání 6 m + dílna 4 m)
  wallHeight: 2.85, // Světlá výška 2.65 m + stropní konstrukce
  roofType: 'flat', // Plochá střecha s atikou (hydroizolace 2× SBS pás s ochranným břidličným posypem / fólie mPVC)
  roofHeight: 0.22, // Výška atiky nad stropem
  position: [5.25, 0, -10.0],
  // Otvory dílny. wall: S (+z, do stání) | N (-z, do severní zahrady) | E (+x) | W (-x, přímo do západní zahrady)
  workshopOpenings: [
    { id: 'D1', kind: 'door', wall: 'S', offset: 0, width: 1.4, height: 2.1, sill: 0, name: 'Vstupní dvoukřídlé dveře dílny (ze stání)' },
    { id: 'D2', kind: 'door', wall: 'W', offset: -0.5, width: 0.9, height: 2.1, sill: 0, name: 'Zahradní dveře dílny (na západ do zahrady)' },
    { id: 'O1', kind: 'window', wall: 'N', offset: 0, width: 1.5, height: 1.2, sill: 0.9, name: 'Okno dílny (sever)' },
  ],
  canopy: null,
  eastWalkway: {
    size: [1.2, 0.04, 5.0],
    pos: [3.85, 0.02, 7.50],
  },
};

import { analyzeDesignLayout, formatAnalysisReport } from '../src/analysis/LayoutAnalyzer.js';

// Let's create a builder for compactHouse5kk that we can tune
export function createCompactHouse() {
  const W = 7.5;
  const L = 9.0;
  const T_EXT = 0.38;
  const T_LOAD = 0.20;
  const T_PART = 0.14;
  const T_SDK = 0.125;

  const X_WEST_WALL = -W / 2 + T_EXT / 2; // -3.56
  const X_EAST_WALL = W / 2 - T_EXT / 2; //  3.56
  const Z_NORTH_WALL = -L / 2 + T_EXT / 2; // -4.31
  const Z_SOUTH_WALL = L / 2 - T_EXT / 2; //  4.31

  const X_WEST_IN = -W / 2 + T_EXT; // -3.37
  const X_EAST_IN = W / 2 - T_EXT; //  3.37
  const Z_NORTH_IN = -L / 2 + T_EXT; // -4.12
  const Z_SOUTH_IN = L / 2 - T_EXT; //  4.12

  // Layout logic:
  // North zone: Z = -4.12 to Z = -0.10 (4.02 m depth)
  // South zone: Z = -0.10 to Z = 4.12 (4.22 m depth)
  // Let's place the stair in the central corridor:
  // xStart: 0.00, xLanding: -2.16, xEnd: -3.37 (at west wall)
  // Then the stair is on the west wall, just like in dreamHouseV1!
  // And the room to the north of it (Z = -4.12 to -2.00) is the Study (1.03) in 1.NP and Master Bedroom (2.02) in 2.NP!
  // And south of the stair is the Living Room!
  // Let's see:
  const Z_SPINE = -0.10;
  const Z_STUDY_STAIR = -2.00;
  const X_STAIR_HALL = -0.20;
  const X_EAST_ZONE = 1.05;
  const Z_BATH_VEST = -1.90;

  const STAIR_HOLE = {
    x1: X_WEST_IN,
    z1: Z_STUDY_STAIR + T_PART / 2, // -1.93
    x2: X_STAIR_HALL,
    z2: Z_SPINE - T_LOAD / 2, // -0.20
  };

  const SHAFT_HOLE = {
    x1: 1.15,
    z1: -4.10,
    x2: 1.60,
    z2: -3.65,
  };

  return {
    id: "compact-5kk",
    label: "Rodinný dům 5+kk (Úsporná kompaktní varianta -30 % · 111 m²)",
    code: "RD-5KK-COMPACT",
    footprint: { width: W, length: L },
    floorHeight: 2.95,
    wallThickness: T_EXT,
    partThickness: T_PART,
    ceiling1Sdk: true,
    STAIR_HOLE,
    SHAFT_HOLE,
    X_WEST_IN, X_EAST_IN, Z_NORTH_IN, Z_SOUTH_IN,
    Z_SPINE, Z_STUDY_STAIR, X_STAIR_HALL, X_EAST_ZONE, Z_BATH_VEST
  };
}

console.log(createCompactHouse());

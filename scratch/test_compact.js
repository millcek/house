import { dreamHouseV1 } from '../src/designs/dreamHouseV1.js';
import { analyzeDesignLayout } from '../src/analysis/LayoutAnalyzer.js';

console.log("Analyzing dreamHouseV1 baseline...");
const res1 = analyzeDesignLayout(dreamHouseV1);
console.log("dreamHouseV1:", res1.summary);

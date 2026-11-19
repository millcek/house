import { analyzeDesignLayout, formatAnalysisReport } from '../src/analysis/LayoutAnalyzer.js';
import { defaultDesign } from '../src/designs/index.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');

const report = analyzeDesignLayout(defaultDesign);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatAnalysisReport(report));
}

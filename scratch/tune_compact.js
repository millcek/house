import { compactHouse5kk } from '../src/designs/compactHouse5kk.js';
import { analyzeDesignLayout, formatAnalysisReport } from '../src/analysis/LayoutAnalyzer.js';

const res = analyzeDesignLayout(compactHouse5kk);
console.log('Errors:', res.summary.errors, 'Warnings:', res.summary.warnings, 'Info:', res.summary.info);
if (res.summary.errors > 0 || res.summary.warnings > 0) {
  console.log(formatAnalysisReport(res));
}

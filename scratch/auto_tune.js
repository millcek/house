import { analyzeDesignLayout } from '../src/analysis/LayoutAnalyzer.js';

function runCheck(compact) {
  const res = analyzeDesignLayout(compact);
  return {
    errors: res.summary.errors,
    warnings: res.summary.warnings,
    errList: (res.floor1?.errors || []).concat(res.floor2?.errors || []).map(e => e.message),
    warnList: (res.floor1?.warnings || []).concat(res.floor2?.warnings || []).map(w => w.message),
  };
}

// Let's test
import { buildCompactTuned } from './test_tuned_compact.js';
console.log(runCheck(buildCompactTuned()));

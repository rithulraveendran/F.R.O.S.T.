// ==============================================================================
// Challenger 1 Milestone 1 Master Verification Runner
// ==============================================================================

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

console.log('================================================================');
console.log('   F.R.O.S.T. CHALLENGER 1 EMPIRICAL VERIFICATION HARNESS      ');
console.log('================================================================\n');

const suites = [
    { name: 'Static Syntax & Manifest Validation', cmd: 'node --check background.js && node --check content.js && node --check constants.js && node -e "JSON.parse(require(\'fs\').readFileSync(\'manifest.json\', \'utf8\')); console.log(\'Manifest OK\');"' },
    { name: 'Empirical Dormancy & Quota Protection Suite', cmd: 'node tests/adversarial/m1_empirical_dormancy.test.js' },
    { name: 'Adversarial Stress & Edge Case Suite', cmd: 'node tests/adversarial/m1_stress_and_edge_cases.test.js' },
    { name: 'Content Script YouTube & Shorts Suite', cmd: 'node tests/adversarial/m1_content_script.test.js' }
];

let totalPassed = 0;
let totalFailed = 0;

for (const suite of suites) {
    console.log(`\n>>> RUNNING: ${suite.name}...`);
    try {
        const output = execSync(suite.cmd, { cwd: rootDir, encoding: 'utf8' });
        console.log(output.trim());
        totalPassed++;
    } catch (err) {
        console.error(`FAILED: ${suite.name}`);
        if (err.stdout) console.log(err.stdout.toString());
        if (err.stderr) console.error(err.stderr.toString());
        totalFailed++;
    }
}

console.log('\n================================================================');
console.log(`VERIFICATION SUMMARY: ${totalPassed} suites passed, ${totalFailed} suites failed.`);
console.log('================================================================\n');

if (totalFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

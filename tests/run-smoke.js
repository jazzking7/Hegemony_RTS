const { spawnSync } = require('node:child_process');

const smokeTests = [
  'advanced-infantry-smoke.js',
  'ai-macro-map-smoke.js',
  'build-menu-organization-smoke.js',
  'capital-aa-infantry-balance-smoke.js',
  'command-smoke.js',
  'directed-energy-smoke.js',
  'ew-smoke.js',
  'macro-research-fortress-smoke.js',
  'missile-smoke.js',
  'ui-live-refresh.js',
  'ux-navigation-smoke.js',
  'workflow-ux-smoke.js'
];

for (const testFile of smokeTests) {
  const result = spawnSync(process.execPath, [require.resolve(`./${testFile}`)], {
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\nAll ${smokeTests.length} game smoke suites passed.`);

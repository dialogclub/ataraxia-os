# CI verification for PR #1

The workflow `.github/workflows/verify.yml` runs on pull requests, pushes to main and claude/**, and manual dispatch. Ubuntu 24.04 jobs independently test Node.js 22 and 24 with read-only repository permissions and a 20-minute timeout.

## Reproduce

```
npm ci
npx --no-install playwright install --with-deps chromium
npm run verify
cp harness/report.json first-report.json
npm run harness:all
node scripts/compare-reports.mjs first-report.json harness/report.json
npm run build
npm run check
```

`verify` runs the infrastructure regression tests first, followed by the existing check, harness:all, build, and screens commands. The UI harness already builds and runs Chromium; installing just Node.js is insufficient. Playwright is an exact development dependency with an npm lockfile. Linux requires the browser and native libraries installed by `--with-deps`; headless mode needs no Xvfb or display server. No external model services or API keys are required for these local fixtures.

Each matrix job uploads both reports, the HTML build and screenshots even on failure. Repeated runs compare suite identities, check names and pass/fail outcomes. Timestamps, durations and timing text are deliberately excluded; this is functional reproducibility, not byte-identical reports or image regression. Engine determinism checks separately compare JSON results byte-for-byte. Screenshots are evidence artifacts, not pixel baselines.

## Fixes and test review

- Normalize Windows paths so the static scanner actually checks HTML, core/UI restrictions and DOM IDs.
- Use the locked local Playwright instead of machine-specific global installations.
- Request a free OS-assigned HTTP port, release the server even if Chromium fails to launch, and use a portable file URL for offline build checks.
- Existing scenarios include seeded stress runs, numeric golden fixtures, invalid/incomplete inputs, scale boundaries, crisis flags and real pointer clicks on stop/crisis buttons and questionnaire answers in three viewports (440x956, 393x852, 1280x800).
- Five deliberate failure controls passed: thrown exception, nondeterministic output, wrong golden value, Infinity output, and out-of-range Param detection. These establish failure detection, not scientific or clinical validity of the psychometric models.

## Local evidence (2026-11-01)

Windows, Node.js 22.14.0; clean `npm ci`; Playwright 1.64.1 / Chromium build 1248. Full `npm run verify` passed: 11 green harness suites, 0 red; standalone screenshot audit 138 passed, 0 failed; 37 PNG files produced. Initial missing-browser and installation-in-progress failures were resolved by completing browser installation and rerunning the exact verification command.

GitHub matrix execution is tracked in the PR conversation and Actions, separately from local evidence. No merge is performed by this workflow.

A second complete harness run passed 11/11 with zero red suites. The report comparison passed, followed by a successful final build and static check (47 modules, 3 HTML files; 67 DOM ID references checked against 107 IDs).

## Harness reliability follow-up (2026-11-01)

- `npm test` now runs 22 infrastructure regression tests and is included in `npm run verify`, including both CI matrix jobs.
- Async determinism, edge expectations, stress functions and golden values are awaited; rejected promises and explicit false expectations fail a check.
- Stress timing is judged by the 99th percentile against the budget; a single outlier is tolerated up to max(4 × budget, 50 ms) so GC or scheduler pauses on shared runners do not produce false reds, while systematic slowness or a hang still fails.
- Empty harnesses, empty fixture sets, fewer than two determinism runs, and invalid stress counts/budgets are rejected.
- Edge cases now scan declared Param ranges. This exposed a real stimulusGate bug: negative frequency was blocked but still emitted as an out-of-range measured Param. Invalid frequency/loudness now block and return a missing Param; 12 additional invalid-input cases cover negative/too-large numbers, Infinity, NaN, strings and null. Existing supported ranges and configured stimulation thresholds define this validation.
- On suite import/execution failure, the runner emits a red result and continues the other suites. It validates suite metadata and check/status consistency. At the start of an all-suite run it invalidates the previous report, so a malformed passport cannot leave an old success report looking current.
- Report comparison reads the current passport inventory instead of assuming exactly 11 suites. It rejects duplicates, missing/unexpected suites, metadata mismatches, empty/failed checks and incomplete reports.

Local Windows / Node 22.14.0 verification: 22 regression tests passed; all 11 harnesses green; standalone UI audit 138 passed, zero failed. The strengthened range check failed on the original stimulusGate output before the engine fix and passed afterwards. CI evidence for this follow-up is recorded in the PR conversation.

The follow-up repeat run also passed 11/11 suites. Comparison against current passports passed; final build and static checks passed (48 modules, 3 HTML files).

# Changelog

All notable changes to **Sheeta Operations Research** are documented in this file.

## [1.1.0] - 2026-11-24

### Fixed
- **Honest Branch & Bound Termination Statuses**: Replaced misleading `'optimal'` reporting when hitting depth, node, or time limits with explicit statuses (`depth_limit_reached`, `node_limit_reached`, `time_limit_reached`, `feasible_not_proven`, `cancelled`), exposing `bestBound`, `integralityGapPercent`, `openNodesRemaining`, and `limitsUsed` in both UI and reports.
- **Real Cooperative Cancellation**: Implemented `SharedArrayBuffer` / `Atomics` cancellation signaling (plus synchronous yield checkpoints and a `450ms` worker termination fallback) across Two-Phase Simplex, Branch & Bound, and Monte Carlo Simulation batches.
- **Wired Performance Settings**: Forwarded `maxNodes`, `maxDepth` (preserving `0` cleanly), `timeoutSeconds`, `eps`, `pivotEps`, `sparseEnabled`, and `branchingStrategy` end-to-end from `SettingsModal` → `App.tsx` → modules/workers → solvers, plus strict input validation via `validateAppSettings`.
- **Sparse CSR Matrix Support**: Added `CsrMatrix` Compressed Sparse Row engine (`src/engines/matrix.ts`) integrated into multi-pass presolve and Two-Phase Simplex pivot elimination on sparse models, reporting `matrixModeUsed`.
- **Strict PERT/CPM Validation & Multi-Critical-Path Support**: Added `PertValidationError` catching empty networks, empty/duplicate IDs, self-dependencies, unknown predecessors, invalid or non-finite durations, `a ≤ m ≤ b` violations, and dependency cycles; updated backward/forward path extraction to report all distinct critical paths up to `maxCriticalPaths` with overflow notice.
- **Genuine Binary PDF Export**: Replaced fake `.html` saves on native platforms with a pure client-side multi-page `%PDF-1.4` binary generator (`src/platform/pdfGenerator.ts`) wired to `CapacitorAdapter`, `TauriAdapter`, and `WebPlatformAdapter`.
- **Bundle Asset Cleanup**: Removed ~4.1 MB of accidental `public/assets/aistudio/` scratch images and added `scripts/verify-dist.js` post-build verification guard.

### Added
- **Dual Variables / Shadow Prices & Constraint Slacks Table**: Exposed constraint `LHS`, `RHS`, `Slack/Surplus`, and exact `Dual Value` (including presolve singleton/fixed-variable reconstruction via Envelope Theorem) in `LpResultsView` and `ReportModal`.
- **Offline Bundled Typography**: Bundled `@fontsource/cairo`, `@fontsource/plus-jakarta-sans`, and `@fontsource/jetbrains-mono` for 100% offline Arabic/English rendering.
- **Simulation Worker Pool**: Added hardware-bounded chunked worker pool execution (`getRecommendedPoolSize()`) with worker pool count indicator.
- **Strict Workspace JSON Import Validation**: Added schema and per-module payload validation in `importWorkspaceJson`.
- **100% Bilingual UI & Regression Test Suite**: Completed Arabic/English translation parity across all modules and modals, removed promotional wording, and added `src/tests/auditRegression.test.ts`.

## [1.0.0] - 2026-11-22

### Added
- Initial cross-platform release of Sheeta Operations Research across Web/PWA, Windows, Linux, and Android.

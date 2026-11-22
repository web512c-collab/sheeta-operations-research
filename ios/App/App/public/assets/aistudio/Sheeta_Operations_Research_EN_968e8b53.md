# Sheeta Operations Research — Application Blueprint and Build Plan

## 1. Identity and Overall Objective
- **Application name:** `Sheeta Operations Research`
- **Objective:** Build a complete, high-performance Operations Research web application that runs locally in the browser (`React + TypeScript + Tailwind CSS`), fully ready to be packaged and run as a Windows `.exe` executable via `Electron` or `Tauri`, targeting an efficiency of approximately **85% to 90%** on large and medium-to-large industrial models with a clear or sparse structure, through the following algorithmic and engineering optimizations.
- **Language and direction:** Full, instant support for Arabic (`AR` / `RTL`) and English (`EN` / `LTR`), with the selected language automatically persisted in `localStorage`.

---

## 2. System Architecture

### A. Presentation & UI/UX Layer
- A unified top bar containing the **Sheeta Operations Research** name, the language toggle (`AR / EN`), quick-access buttons for the modules, saved-problem management, `JSON` export/import, and report export.
- A responsive interface that works smoothly on mobile and desktop screens, with improved contrast, spacing, table and chart presentation, and status messages (running, completed, cancelled, safety-limit warning, error).
- A clear advanced settings panel (enable/disable `Presolve`, `Sparse` representation, `Web Workers`, branching strategy, and node/time limits) with practical default values and a ready-made medium/large sample problem for one-click performance testing.

### B. Mathematical & OR Solvers Layer
1. **Linear Programming:**
   - Support for Maximize (`Maximize`) and Minimize (`Minimize`) objectives and `<=`, `>=`, and `=` constraints, with a positive, zero, or negative right-hand side (`RHS`).
   - Implementation of **Two-Phase Simplex** instead of a fixed-value `Big-M` approach:
     - **Phase I:** Introduce artificial variables where needed and minimize their sum to zero to test feasibility (`Feasibility`) accurately; return `infeasible` immediately if zero cannot be reached or if any artificial variable remains positive within the tolerance margin.
     - **Phase II:** Optimize the original objective function with the artificial variables excluded.
   - Clear numerical precision constants (`EPS = 1e-7`, `PIVOT_EPS = 1e-9`), cleanup of values very close to zero (`|val| < 1e-9` become `0`), and a per-node iteration cap with `Bland's Rule` to prevent cycling.
   - Parent-node objects and arrays are never mutated by reference (`Immutable`), and conflicting direct bounds on the same variable are checked in advance.
   - **Graphical Method:** For two-variable problems (`x1, x2`), displaying the feasible region, the constraints, the intersection points, and the optimal solution.

2. **Integer & Binary Programming (Branch and Bound):**
   - An on/off toggle for Integer Programming (`Integer / Binary Programming`), keeping the Linear Programming relaxation solution (`LP Relaxation`) available for comparison.
   - Specification of each decision variable's type (`x1, x2, ... xn`): Continuous (`Continuous`), Integer (`Integer`), or Binary (`Binary`, with a value of `0` or `1`).
   - Use of the `LP` engine as the linear relaxation engine inside the `Branch and Bound` tree, pruning infeasible branches (`Infeasible`) or those worse than the best known integer solution (`Bound Pruning`), with safety limits on node count and tree depth and a clear alert when a limit is reached.
   - A direct comparison between the LP relaxation solution and the optimal integer solution, the integrality gap (`Integrality Gap`), plus statistics on explored, pruned, and accelerated nodes and execution time in milliseconds.

3. **Additional Operations Research Modules:**
   - **Transportation & Assignment:** Computing the optimal distribution and total cost, and displaying the tables.
   - **Project Network Management (PERT / CPM):** Computing earliest and latest times and slack, and identifying the critical path.
   - **Queuing Theory & EOQ:** Computing queuing performance measures and Economic Order Quantity (`EOQ`) models.

### C. Performance & Scalability Layer
- **Multi-Pass Presolve Engine (`Multi-Pass Presolve`):**
  - Runs before `LP` or `Branch and Bound` (with the ability to enable/disable it and view its report).
  - Applies successive safe passes: removing empty rows/constraints; handling empty columns in the constraints according to the objective function coefficient, the objective sense, and the bounds; detecting fixed variables (`Fixed Variables`), substituting them, and restoring them in the final solution; tightening bounds (`Bound Tightening`) and detecting infeasibility early; and saving a transformation map to reconstruct the original solution and display the number of variables and constraints before and after `Presolve`.
- **Sparse Representation (`Sparse Representation`):**
  - Support for representing large, sparse matrices by storing only the non-zero elements, reducing memory consumption and speeding up algebraic operations, while maintaining full compatibility with the dense representation (`Dense`) for charts and for small and medium problems.
- **`Branch and Bound` Accelerations:**
  - Branching-variable selection (`Most Fractional`, closest to `0.5`, or the first fractional variable, depending on the setting).
  - Branch exploration ordering (`Child Ordering`) to improve early pruning efficiency.
  - Fast initial integer solution generation (`Primal Heuristic`, by rounding the relaxed solution and testing its feasibility against the constraints) to raise the incumbent bound (`Incumbent`) early.
- **`Web Workers` Pool & Safe Cancellation:**
  - Moving the execution of large problems, `Branch and Bound`, and large scenario simulations to `Web Workers` (with multi-threaded pool support when available and a direct fallback path when needed).
  - A live status indicator and a **Cancel** (`Cancel`) button to safely stop long-running operations without freezing the UI or losing data, and displaying the best integer solution found up to the moment of cancellation with a clear indication of the manual stop.

### D. Persistence, Simulation & Reporting Layer
- **Persistent Storage (`IndexedDB` + `localStorage` fallback):** Automatic saving of problems, inputs, results, settings, scenarios, and language, with saved-problem management (saving with a name, description, and last-modified date; one-click recall; `Update` or `Save As New`; deletion with confirmation) and `JSON` export/import.
- **Scenario Simulation & Explorer (`Scenario Simulation & Explorer`):** A standalone module for generating large numbers of scenarios (from 10 to 500 scenarios or more per batch) through **Monte Carlo** (`Monte Carlo`) and **Sensitivity & Parameter Sweep** (`Sensitivity & Parameter Sweep`) analysis, with an interactive table supporting browsing, pagination (`Pagination`), search, and sorting; displaying the details of any scenario and sending it to its source module for editing and saving as a standalone problem; and showing a statistical summary (best scenario, worst scenario, mean, standard deviation) with a chart of the results distribution.
- **Reports, `PDF` Export & Clipboard Auto-Copy:** A comprehensive, well-organized report generator that includes the **Sheeta Operations Research** name, the inputs, the date and time, the results, the solution status, the `Presolve` summary, the statistics, the comparisons, and the scenarios in the selected language, with text/Markdown download (`.txt` / `.md`), formatted `PDF` export/print (`@media print`, `RTL/LTR`, and prevention of distorted page splitting), and automatic clipboard copying on generation/export with a clear notification, a manual copy button, and an option to enable/disable auto-copy.

---

## 3. Suggested Project Structure
- `src/types/` : Type and interface definitions (`OR`, `LP/IP`, `Presolve`, `Sparse`, `Simulation`, `Workspace`, `Report`, `i18n`).
- `src/i18n/` : The Arabic and English translation dictionary and direction management (`RTL/LTR`).
- `src/engines/` :
  - `simplexTwoPhase.ts` : The `Two-Phase Simplex` engine with support for dense and sparse matrices.
  - `presolve.ts` : The multi-pass presolve engine and transformation map.
  - `branchAndBound.ts` : The `Branch and Bound` algorithm with the accelerations, limits, and fast initial solution.
  - `transportationAssignment.ts` : The transportation and assignment modules.
  - `pertCpm.ts` : The `PERT / CPM` network module.
  - `queuingEoq.ts` : The queuing theory and `EOQ` modules.
  - `simulation.ts` : The Monte Carlo simulation engine, sensitivity analysis, and statistics.
  - `reportBuilder.ts` : The text and `HTML/PDF` report builder and clipboard copying.
- `src/workers/` : A `Web Worker` for running heavy computations and scenarios, with cancellation and progress support.
- `src/storage/` : The persistent storage layer via `IndexedDB` with a `localStorage` fallback and `JSON` export/import.
- `src/components/` : Module interfaces, the graphical-method chart, advanced performance settings, the saved-problem manager, the scenario explorer, and report preview/export.

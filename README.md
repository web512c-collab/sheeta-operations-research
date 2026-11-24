# Sheeta Operations Research

> **Quantitative Operations Research & Simulation Suite (v1.1.0)**  
> Complete cross-platform architecture running 100% offline from **ONE shared codebase** across 4 targets: Web/PWA, Windows, Linux, and Android.

---

## 🌐 Live Demo & Instant Web App

Access the production application directly in your browser with zero setup:

🔗 **[https://web512c-collab.github.io/sheeta-operations-research/](https://web512c-collab.github.io/sheeta-operations-research/)**

### 📲 How to Install as an Offline PWA

Install Sheeta Operations Research to run full-screen, standalone, and completely offline:

- **Android (Chrome, Edge, Samsung Internet):**
  - Tap the **"Install App"** button in the top navigation bar, or open the browser menu (`⋮`) and select **"Add to Home screen"** / **"Install application"**.
- **Desktop (Chrome, Edge, Brave, Firefox, Opera on Windows & Linux):**
  - Click the **Install** icon in your browser's URL address bar (or click the **"Install App"** button in the top bar).
- **100% Offline Capability:**
  - The Service Worker automatically precaches all mathematical engines, bundled fonts (`@fontsource`), and assets. Once installed or visited, the entire suite functions without an internet connection.

---

## 🚀 Supported Deployment Targets

| Target | Technology | Packaging Output | Primary Command |
| :--- | :--- | :--- | :--- |
| **Web & PWA** | Vite + React 19 + PWA | Installable SPA / Static Dist | `npm run build:pwa` |
| **Windows** | Tauri 2 (or Electron) | `.exe` / `.msi` (x64, ARM64) | `npm run tauri:build` |
| **Linux** | Tauri 2 (or Electron) | `.AppImage` / `.deb` (x64, ARM64) | `npm run tauri:build` |
| **Android** | Capacitor 8 | `.apk` / `.aab` | `npm run android:build` |

---

## 🏗️ Architecture & Platform Abstraction Layer (`src/platform/`)

The application enforces a strict separation between core business logic and native OS capabilities. All mathematical solvers, presolvers, simulation engines, and i18n modules are **100% platform-agnostic**.

All device interactions pass through the typed `PlatformAdapter` interface:

1. **Storage & Native Mirroring (`storage`)**:
   - Primary: Fast IndexedDB.
   - Secondary: `localStorage` fallback.
   - **Android WebView Eviction Safeguard**: On Android, WebView databases can be evicted by the operating system under low-disk pressure. The platform adapter mirrors workspace problems, settings, and language to native persistent storage (`Capacitor Preferences`) with an automatic startup restore routine and strict JSON backup schema validation (`version` + per-module payload checks).
2. **File Export & Import (`file`)**:
   - **Web / PWA**: Native `Blob` URL downloads and synthetic `<input type="file">`.
   - **Capacitor (Android)**: Native filesystem cache with system share sheet integration (`Filesystem` + `Share`).
   - **Tauri 2**: OS-native file save and open dialogs (`@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`).
   - **Electron**: IPC bridge to `dialog.showSaveDialog` and `dialog.showOpenDialog`.
3. **Clipboard (`clipboard`)**:
   - `navigator.clipboard` with multi-tier fallback to native plugin clipboard and legacy `document.execCommand`.
4. **Genuine Binary PDF & Print (`pdf`)**:
   - **Native / Desktop / Mobile (`Capacitor`, `Tauri`, `Electron`)**: Renders real multi-page binary `%PDF-1.4` files with embedded high-DPI JPEG page images using offline Canvas 2D typography supporting bidirectional **Arabic (RTL)** and **English (LTR)** text, and exports `.pdf` directly (Android opens the system Share Sheet with `application/pdf`).
   - **Web / PWA**: Supports both printable HTML (`window.print()`) and direct binary `.pdf` generation.
5. **Hardware & Lifecycle (`device`)**:
   - Haptic feedback (light, medium, heavy, success, error) mapped to native vibration APIs.
   - Status bar styling and theme synchronization.
   - Android hardware back button handler to dismiss modals and navigate cleanly.

---

## 📦 Build Commands

### 1. Web Application & PWA
```bash
# Start local development server (port 3000)
npm run dev

# Run unit tests (solvers, platform layer, and v1.1.0 audit regression suite)
npm test

# TypeScript type-check
npm run lint

# Build production static bundle + verify dist/ integrity
npm run build:pwa

# Preview built production distribution
npm run preview
```

### 2. Android (APK & App Bundle)
**Prerequisites:** Node.js 22+, JDK 21, Android Studio & Android SDK (API 36).
```bash
# Build web assets and sync to native Android project
npm run android:build

# Open project in Android Studio
npm run android:open

# Or build debug APK directly via command line
cd android && ./gradlew assembleDebug
```

### 3. Desktop: Windows & Linux (Tauri 2)
**Prerequisites:** Rust toolchain (`rustup`), platform build tools (`visualstudio2022-workload-vctools` on Windows, `build-essential` & `libwebkit2gtk-4.1-dev` on Linux).
```bash
# Run Tauri in dev mode with hot reload
npm run tauri:dev

# Build native desktop installers (.exe, .msi, .AppImage, .deb)
npm run tauri:build
```

### 4. Desktop: Alternative Electron Target
For teams that prefer Electron:
```bash
# Run Electron dev window
npm run electron:dev

# Package executable installers via electron-builder
npm run electron:build
```

---

## 🧮 Operations Research Solvers & Scale Guidance

- **Two-Phase Simplex & Sparse CSR**:
  - Phase I: Artificial variable minimization for feasibility testing.
  - Phase II: Optimal basis pursuit with Bland's Rule anti-cycling, cooperative cancellation (`SharedArrayBuffer` / `Atomics`), and exact shadow-price (dual variable) & slack/surplus extraction via basis inverse (`B⁻¹`).
  - **Numerical Scale & Dense Tableau Guidance**: Comfortable interactive solve scale in client JS memory is up to ~100–250 variables/constraints. When `sparseEnabled` is on and matrix density falls below `30%`, `CsrMatrix` sparse row storage accelerates multi-pass presolve scans and pivot-column elimination while preserving dense `B⁻¹` accuracy for duals.
- **Integer & Binary Programming (Branch and Bound)**:
  - Supports Continuous, Integer, and Binary ($0/1$) decision variables with user-configured `maxNodes`, `maxDepth` (including `0` for root-only), `timeoutSeconds`, `eps`, `pivotEps`, and `branchingStrategy`.
  - Reports honest termination statuses (`optimal`, `depth_limit_reached`, `node_limit_reached`, `time_limit_reached`, `feasible_not_proven`, `cancelled`, `infeasible`, `unbounded`), tracking `bestBound` and `integralityGapPercent` transparently.
- **Transportation & Assignment**:
  - Initial Basic Feasible Solution: Vogel's Approximation Method (VAM), Northwest Corner, Least Cost + MODI optimality.
  - Hungarian algorithm for optimal 1-to-1 matching.
- **Project Management (PERT / CPM)**:
  - Strict graph & duration validation (`EMPTY_NETWORK`, `EMPTY_ID`, `DUPLICATE_ID`, `SELF_DEPENDENCY`, `UNKNOWN_PREDECESSOR`, `INVALID_DURATION`, `INVALID_THREE_POINT`, `CYCLE_DETECTED`).
  - Forward/backward pass scheduling, slack analysis, and enumeration of all distinct critical paths (with overflow indicator if capped).
- **Queuing & Inventory (EOQ)**:
  - Queuing: $M/M/1$, $M/M/c$, $M/M/1/K$ models ($\rho$, $L_q$, $L$, $W_q$, $W$, $P_0$, $P_K$) with instability detection when $\rho \ge 1$.
  - Inventory: Classical EOQ, planned backorders, EPQ, and quantity discounts.
- **Monte Carlo Scenario Simulation**:
  - Gaussian, Uniform, and Triangular stochastic sampling + parameter sweeps dispatched across a bounded Web Worker pool (`getRecommendedPoolSize()`) with cooperative cancellation.

---

## 🔒 Security, Offline Guarantee & Android Permissions

- **Strict Content Security Policy (CSP)**: `connect-src 'self' data: blob:` blocks remote network requests while allowing local Web Workers and Blobs.
- **Zero Remote Font Dependencies**: Bundled `@fontsource/cairo`, `@fontsource/plus-jakarta-sans`, and `@fontsource/jetbrains-mono` ensure identical offline typography on WebView and Desktop.
- **Android `INTERNET` Permission Rationale**: `android.permission.INTERNET` and `android.permission.ACCESS_NETWORK_STATE` remain declared in `android/app/src/main/AndroidManifest.xml` solely because Capacitor serves the bundled local assets through Android WebView's local origin (`https://localhost`) and monitors offline/online state (`Network` listener). The application performs **zero external HTTP requests, zero analytics, and zero telemetry**.

### 📱 Android Manual Device / Emulator QA Checklist (v1.1.0)
- [ ] Export Executive Report to PDF on device and verify a valid binary `.pdf` file opens in a PDF viewer and shares cleanly via the Android Share Sheet.
- [ ] Set Branch & Bound Max Depth to `1` on the Multi-Plant Benchmark IP, solve, and verify an amber warning status (`Depth Limit Reached`) is shown alongside `bestBound` and Constraint Slacks & Shadow Prices.
- [ ] Start a long Branch & Bound or 500-scenario simulation run and tap **Cancel Run** mid-flight; verify clean cancellation without UI freeze.
- [ ] Toggle Airplane Mode, reload the app, verify Arabic/English fonts render offline, and confirm settings & saved problems persist across app restart.

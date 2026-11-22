# Sheeta Operations Research

> **Industrial-Grade Operations Research & Simulation Suite**  
> Complete cross-platform architecture running 100% offline from **ONE shared codebase** across 6 targets: Web/PWA, Windows, macOS, Linux, Android, and iOS.

---

## 🚀 Supported Deployment Targets

| Target | Technology | Packaging Output | Primary Command |
| :--- | :--- | :--- | :--- |
| **Web & PWA** | Vite + React 19 + PWA | Installable SPA / Static Dist | `npm run build:pwa` |
| **Windows** | Tauri 2 (or Electron) | `.exe` / `.msi` (x64, ARM64) | `npm run tauri:build` |
| **macOS** | Tauri 2 (or Electron) | `.dmg` / `.app` (Universal, M-series, Intel) | `npm run tauri:build` |
| **Linux** | Tauri 2 (or Electron) | `.AppImage` / `.deb` (x64, ARM64) | `npm run tauri:build` |
| **Android** | Capacitor 7 | `.apk` / `.aab` | `npm run android:build` |
| **iOS** | Capacitor 7 + Xcode | `.ipa` / Xcode Project | `npm run ios:build` |

---

## 🏗️ Architecture & Platform Abstraction Layer (`src/platform/`)

The application enforces a strict separation between core business logic and native OS capabilities. All mathematical solvers, presolvers, simulation engines, and i18n modules are **100% platform-agnostic**.

All device interactions pass through the typed `PlatformAdapter` interface:

1. **Storage & Native Mirroring (`storage`)**:
   - Primary: Fast IndexedDB.
   - Secondary: `localStorage` fallback.
   - **Mobile WKWebView Eviction Safeguard**: On iOS and Android, WebView databases can be evicted by the operating system under low-disk pressure. The platform adapter mirrors workspace problems, settings, and language to native persistent storage (`Capacitor Preferences`) with an automatic startup restore routine.
2. **File Export & Import (`file`)**:
   - **Web / PWA**: Native `Blob` URL downloads and synthetic `<input type="file">`.
   - **Capacitor (Android & iOS)**: Native filesystem cache with system share sheet integration (`Filesystem` + `Share`).
   - **Tauri 2**: OS-native file save and open dialogs (`@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`).
   - **Electron**: IPC bridge to `dialog.showSaveDialog` and `dialog.showOpenDialog`.
3. **Clipboard (`clipboard`)**:
   - `navigator.clipboard` with multi-tier fallback to native plugin clipboard and legacy `document.execCommand`.
4. **Print & Executive PDF (`pdf`)**:
   - Pure client-side printable HTML generator supporting bidirectional **Arabic (RTL)** and **English (LTR)** typography, font fallbacks, page break control, and tabular formatting.
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

# Run unit tests
npm test

# Build production static bundle and PWA service worker
npm run build:pwa

# Preview built production distribution
npm run preview
```

### 2. Android (APK & App Bundle)
**Prerequisites:** Node.js 20+, JDK 17, Android Studio & Android SDK (API 34+).
```bash
# Build web assets and sync to native Android project
npm run android:build

# Open project in Android Studio
npm run android:open

# Or build debug APK directly via command line
cd android && ./gradlew assembleDebug
```

### 3. iOS (.ipa)
**Prerequisites:** macOS, Xcode 15+, CocoaPods.
```bash
# Build web assets and sync to iOS Xcode workspace
npm run ios:build

# Open project in Xcode
npm run ios:open
```

### 4. Desktop: Windows, macOS, Linux (Tauri 2)
**Prerequisites:** Rust toolchain (`rustup`), platform build tools (`visualstudio2022-workload-vctools` on Windows, `build-essential` & `libwebkit2gtk-4.1-dev` on Linux).
```bash
# Run Tauri in dev mode with hot reload
npm run tauri:dev

# Build native desktop installers (.exe, .dmg, .AppImage, .deb)
npm run tauri:build
```

### 5. Desktop: Alternative Electron Target
For teams that prefer Electron:
```bash
# Run Electron dev window
npm run electron:dev

# Package executable installers via electron-builder
npm run electron:build
```

---

## 🧮 Operations Research Solvers Included

- **Two-Phase Simplex**:
  - Phase I: Artificial variable minimization for feasibility testing.
  - Phase II: Optimal basis pursuit with Bland's Rule anti-cycling.
  - Multi-pass presolve: Singleton row detection, duplicate elimination, bound tightening.
  - 2D Graphical Method: Feasible polygon rendering, level curves, corner evaluation.
- **Integer & Binary Programming (Branch and Bound)**:
  - Supports Continuous, Integer, and Binary ($0/1$) decision variables.
  - LP relaxation bounding, depth/node safety caps, best-bound pruning.
- **Transportation & Assignment**:
  - Initial Basic Feasible Solution: Vogel's Approximation Method (VAM), Northwest Corner, Least Cost.
  - Optimality: Modified Distribution Method (MODI / $u-v$ multipliers) with loop tracing.
  - Hungarian algorithm for optimal 1-to-1 matching.
- **Project Management (PERT / CPM)**:
  - Forward pass (Early Start / Early Finish), backward pass (Late Start / Late Finish).
  - Total Slack and Free Slack computation.
  - Critical path identification.
- **Queuing & Inventory (EOQ)**:
  - Queuing: $M/M/1$, $M/M/c$, $M/G/1$ models ($\rho$, $L_q$, $L$, $W_q$, $W$, $P_0$).
  - Inventory: Wilson Economic Order Quantity (EOQ), reorder point, total holding/ordering costs.
- **Monte Carlo Scenario Simulation**:
  - Gaussian, Uniform, and Triangular stochastic sampling.
  - Parameter sweeps and sensitivity analysis.

---

## 🔒 Security & Offline Guarantee

- **Strict Content Security Policy (CSP)**: Blocks unverified third-party scripts while allowing local Web Workers and Blobs.
- **Zero Remote Dependencies**: Fonts and icons fall back gracefully to local system typography (`Cairo` / `Noto Sans Arabic` / `Segoe UI` for Arabic; `Plus Jakarta Sans` / `system-ui` for Latin).
- **100% Offline Capable**: All linear programs and simulations compute locally in the browser/client without sending data to any external server.

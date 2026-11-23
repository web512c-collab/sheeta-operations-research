/**
 * Sheeta Operations Research - Cross-Platform Abstraction Layer
 * Core Type Definitions for Unified Multi-Target Support
 * 
 * Supports:
 * - Web (Static SPA + PWA)
 * - Android (Capacitor)
 * - Windows / Linux (Tauri 2 & Electron)
 */

export type PlatformType =
  | 'web'
  | 'capacitor-android'
  | 'tauri'
  | 'electron';

export interface FileExportOptions {
  filename: string;
  content: string;
  mimeType?: string;
}

export interface FileImportOptions {
  accept?: string;
  extensions?: string[];
}

export interface ShareOptions {
  title: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  /**
   * Persists critical data (problems, settings, language) to native storage
   * (Capacitor Preferences / SQLite) to prevent OS eviction in Android WebView.
   */
  syncNativeMirror(data: Record<string, string>): Promise<void>;
  /**
   * Restores stored data from the native mirror if WebView storage was cleared.
   */
  restoreFromNativeMirror(): Promise<Record<string, string> | null>;
}

export interface FileAdapter {
  exportFile(options: FileExportOptions): Promise<{ success: boolean; path?: string }>;
  importFile(options: FileImportOptions): Promise<{ filename: string; content: string } | null>;
  share(options: ShareOptions): Promise<boolean>;
}

export interface ClipboardAdapter {
  copy(text: string): Promise<boolean>;
  paste(): Promise<string>;
}

export interface PDFAdapter {
  print(): Promise<void>;
  exportPdf(title: string, htmlContent: string, isRtl?: boolean): Promise<{ success: boolean }>;
}

export interface DeviceAdapter {
  haptic(type?: 'light' | 'medium' | 'heavy' | 'success' | 'error'): Promise<void>;
  setStatusBar(style: 'light' | 'dark', backgroundColor?: string): Promise<void>;
  hideSplashScreen(): Promise<void>;
  onBackButton(callback: () => boolean | void): () => void;
  onAppStateChange(callback: (isActive: boolean) => void): () => void;
}

export interface NetworkAdapter {
  readonly isOnline: boolean;
  subscribe(callback: (isOnline: boolean) => void): () => void;
}

export interface PlatformAdapter {
  readonly type: PlatformType;
  readonly isNative: boolean;
  readonly isMobile: boolean;
  readonly isDesktop: boolean;
  readonly isPWA: boolean;
  readonly storage: StorageAdapter;
  readonly file: FileAdapter;
  readonly clipboard: ClipboardAdapter;
  readonly pdf: PDFAdapter;
  readonly device: DeviceAdapter;
  readonly network: NetworkAdapter;
  initialize(): Promise<void>;
}

/**
 * Sheeta Operations Research - Capacitor Platform Adapter (Android & iOS)
 * Implements mobile-specific bridges, native storage mirroring (to protect
 * against iOS WKWebView storage evictions), hardware back button handling,
 * native share sheet, and haptic feedback.
 */

import { Capacitor } from '@capacitor/core';
import {
  PlatformAdapter,
  PlatformType,
  StorageAdapter,
  FileAdapter,
  ClipboardAdapter,
  PDFAdapter,
  DeviceAdapter,
  NetworkAdapter,
  FileExportOptions,
  FileImportOptions,
  ShareOptions,
} from './types';
import { generatePrintableHtml } from './pdfGenerator';

const capacitorFileAdapter: FileAdapter = {
  async exportFile(options: FileExportOptions): Promise<{ success: boolean; path?: string }> {
    try {
      const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;

      // Try native Filesystem & Share if available
      if (plugins?.Filesystem && plugins?.Share) {
        const fileName = options.filename;
        const writeRes = await plugins.Filesystem.writeFile({
          path: fileName,
          data: options.content,
          directory: 'CACHE',
          encoding: 'utf8',
        });

        await plugins.Share.share({
          title: fileName,
          url: writeRes.uri,
          dialogTitle: `Export ${fileName}`,
        });
        return { success: true, path: writeRes.uri };
      }

      // Fallback to browser Blob download
      const blob = new Blob([options.content], { type: options.mimeType || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = options.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { success: true };
    } catch (err) {
      console.error('Capacitor export failed:', err);
      return { success: false };
    }
  },

  async importFile(options: FileImportOptions): Promise<{ filename: string; content: string } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (options.accept) {
        input.accept = options.accept;
      } else if (options.extensions) {
        input.accept = options.extensions.map((e) => `.${e}`).join(',');
      }

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const content = await file.text();
          resolve({ filename: file.name, content });
        } catch {
          resolve(null);
        }
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  },

  async share(options: ShareOptions): Promise<boolean> {
    const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
    if (plugins?.Share) {
      try {
        await plugins.Share.share({
          title: options.title,
          text: options.text,
          url: options.url,
          dialogTitle: options.dialogTitle || options.title,
        });
        return true;
      } catch {
        return false;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share(options);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  },
};

export class CapacitorPlatformAdapter implements PlatformAdapter {
  readonly type: PlatformType;
  readonly isNative = true;
  readonly isMobile = true;
  readonly isDesktop = false;
  readonly isPWA = false;

  constructor() {
    const platform = Capacitor.getPlatform();
    this.type = platform === 'ios' ? 'capacitor-ios' : 'capacitor-android';
  }

  readonly storage: StorageAdapter = {
    async getItem(key: string): Promise<string | null> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Preferences) {
          const res = await plugins.Preferences.get({ key });
          return res.value ?? localStorage.getItem(key);
        }
        return localStorage.getItem(key);
      } catch {
        return localStorage.getItem(key);
      }
    },

    async setItem(key: string, value: string): Promise<void> {
      try {
        localStorage.setItem(key, value);
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Preferences) {
          await plugins.Preferences.set({ key, value });
        }
      } catch {
        // storage quota
      }
    },

    async removeItem(key: string): Promise<void> {
      try {
        localStorage.removeItem(key);
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Preferences) {
          await plugins.Preferences.remove({ key });
        }
      } catch {
        // ignore
      }
    },

    async clear(): Promise<void> {
      try {
        localStorage.clear();
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Preferences) {
          await plugins.Preferences.clear();
        }
      } catch {
        // ignore
      }
    },

    async syncNativeMirror(data: Record<string, string>): Promise<void> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Preferences) {
          for (const [key, value] of Object.entries(data)) {
            await plugins.Preferences.set({ key: `native_mirror_${key}`, value });
          }
        }
        // Also keep in localStorage as double backup
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(`native_mirror_${key}`, value);
        }
      } catch (err) {
        console.warn('Capacitor native mirror sync failed:', err);
      }
    },

    async restoreFromNativeMirror(): Promise<Record<string, string> | null> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Preferences) {
          const keysRes = await plugins.Preferences.keys();
          const mirrorKeys: string[] = keysRes.keys.filter((k: string) => k.startsWith('native_mirror_'));
          if (mirrorKeys.length > 0) {
            const restored: Record<string, string> = {};
            for (const key of mirrorKeys) {
              const res = await plugins.Preferences.get({ key });
              if (res.value) {
                restored[key.replace('native_mirror_', '')] = res.value;
              }
            }
            return Object.keys(restored).length > 0 ? restored : null;
          }
        }

        // Fallback to localStorage mirror
        const fallbackMirror: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('native_mirror_')) {
            const val = localStorage.getItem(key);
            if (val) fallbackMirror[key.replace('native_mirror_', '')] = val;
          }
        }
        return Object.keys(fallbackMirror).length > 0 ? fallbackMirror : null;
      } catch {
        return null;
      }
    },
  };

  readonly file: FileAdapter = capacitorFileAdapter;

  readonly clipboard: ClipboardAdapter = {
    async copy(text: string): Promise<boolean> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Clipboard) {
          await plugins.Clipboard.write({ string: text });
          return true;
        }
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    async paste(): Promise<string> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Clipboard) {
          const res = await plugins.Clipboard.read();
          return res.value || '';
        }
        if (navigator.clipboard) {
          return await navigator.clipboard.readText();
        }
        return '';
      } catch {
        return '';
      }
    },
  };

  readonly pdf: PDFAdapter = {
    async print(): Promise<void> {
      if (typeof window !== 'undefined') {
        window.print();
      }
    },

    async exportPdf(title: string, htmlContent: string, isRtl: boolean = false): Promise<{ success: boolean }> {
      try {
        const fullDoc = generatePrintableHtml(title, htmlContent, isRtl);
        const fileName = `${title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}_report.html`;
        
        // On mobile, export formatted printable HTML and trigger native share sheet
        const result = await capacitorFileAdapter.exportFile({
          filename: fileName,
          content: fullDoc,
          mimeType: 'text/html;charset=utf-8',
        });
        return { success: result.success };
      } catch (err) {
        console.error('Capacitor PDF generation error:', err);
        return { success: false };
      }
    },
  };

  readonly device: DeviceAdapter = {
    async haptic(type = 'light'): Promise<void> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.Haptics) {
          if (type === 'heavy') {
            await plugins.Haptics.impact({ style: 'HEAVY' });
          } else if (type === 'medium') {
            await plugins.Haptics.impact({ style: 'MEDIUM' });
          } else if (type === 'success' || type === 'error') {
            await plugins.Haptics.notification({ type: type === 'success' ? 'SUCCESS' : 'ERROR' });
          } else {
            await plugins.Haptics.impact({ style: 'LIGHT' });
          }
          return;
        }
        if (navigator.vibrate) {
          navigator.vibrate(type === 'heavy' ? 50 : 25);
        }
      } catch {
        // ignore
      }
    },

    async setStatusBar(style: 'light' | 'dark', backgroundColor?: string): Promise<void> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.StatusBar) {
          await plugins.StatusBar.setStyle({ style: style === 'dark' ? 'DARK' : 'LIGHT' });
          if (backgroundColor) {
            await plugins.StatusBar.setBackgroundColor({ color: backgroundColor });
          }
        }
      } catch {
        // ignore
      }
    },

    async hideSplashScreen(): Promise<void> {
      try {
        const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
        if (plugins?.SplashScreen) {
          await plugins.SplashScreen.hide();
        }
      } catch {
        // ignore
      }
    },

    onBackButton(callback: () => boolean | void): () => void {
      const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
      let removeListener: (() => void) | null = null;

      if (plugins?.App) {
        plugins.App.addListener('backButton', (data: { canGoBack: boolean }) => {
          const handled = callback();
          if (!handled && !data.canGoBack) {
            plugins.App.exitApp();
          }
        }).then((handle: { remove: () => void }) => {
          removeListener = () => handle.remove();
        });
      }

      return () => {
        if (removeListener) removeListener();
      };
    },

    onAppStateChange(callback: (isActive: boolean) => void): () => void {
      const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
      let removeListener: (() => void) | null = null;

      if (plugins?.App) {
        plugins.App.addListener('appStateChange', (state: { isActive: boolean }) => {
          callback(state.isActive);
        }).then((handle: { remove: () => void }) => {
          removeListener = () => handle.remove();
        });
      } else {
        const handler = () => callback(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handler);
        removeListener = () => document.removeEventListener('visibilitychange', handler);
      }

      return () => {
        if (removeListener) removeListener();
      };
    },
  };

  readonly network: NetworkAdapter = {
    get isOnline(): boolean {
      if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        return navigator.onLine;
      }
      return true;
    },
    subscribe(callback: (isOnline: boolean) => void): () => void {
      const plugins = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins;
      if (plugins?.Network) {
        let handlePromise = plugins.Network.addListener('networkStatusChange', (status: { connected: boolean }) => {
          callback(status.connected);
        });
        return () => {
          handlePromise.then((h: { remove: () => void }) => h.remove());
        };
      }
      if (typeof window === 'undefined') {
        return () => {};
      }
      const onOnline = () => callback(true);
      const onOffline = () => callback(false);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    },
  };

  async initialize(): Promise<void> {
    await this.device.hideSplashScreen();
  }
}

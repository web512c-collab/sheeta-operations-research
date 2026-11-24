/**
 * Sheeta Operations Research - Capacitor Platform Adapter (Android)
 * Implements Android bridges, native storage mirroring, hardware back button handling,
 * real binary .pdf generation + Filesystem/Share export, and haptic feedback.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import type { ReportData } from '../engines/reportBuilder';
import { renderReportToPdfBytes, uint8ToBase64 } from './pdfGenerator';
import {
  ClipboardAdapter,
  DeviceAdapter,
  FileAdapter,
  FileExportOptions,
  FileImportOptions,
  NetworkAdapter,
  PDFAdapter,
  PlatformAdapter,
  PlatformType,
  ShareOptions,
  StorageAdapter,
} from './types';

function sanitizeFileSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'sheeta_or';
}

const capacitorFileAdapter: FileAdapter = {
  async exportFile(options: FileExportOptions): Promise<{ success: boolean; path?: string }> {
    try {
      if (Capacitor.isNativePlatform()) {
        const writeRes = await Filesystem.writeFile({
          path: options.filename,
          data: options.content,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        await Share.share({
          title: options.filename,
          url: writeRes.uri,
          files: [writeRes.uri],
          dialogTitle: options.filename,
        });
        return { success: true, path: writeRes.uri };
      }

      const blob = new Blob([options.content], { type: options.mimeType || 'text/plain;charset=utf-8' });
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
        input.accept = options.extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)).join(',');
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
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
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

    if (typeof navigator !== 'undefined' && navigator.share) {
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
  readonly type: PlatformType = 'capacitor-android';
  readonly isNative = true;
  readonly isMobile = true;
  readonly isDesktop = false;
  readonly isPWA = false;

  readonly storage: StorageAdapter = {
    async getItem(key: string): Promise<string | null> {
      try {
        if (Capacitor.isNativePlatform()) {
          const res = await Preferences.get({ key });
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
        if (Capacitor.isNativePlatform()) {
          await Preferences.set({ key, value });
        }
      } catch {
        // storage quota
      }
    },

    async removeItem(key: string): Promise<void> {
      try {
        localStorage.removeItem(key);
        if (Capacitor.isNativePlatform()) {
          await Preferences.remove({ key });
        }
      } catch {
        // ignore
      }
    },

    async clear(): Promise<void> {
      try {
        localStorage.clear();
        if (Capacitor.isNativePlatform()) {
          await Preferences.clear();
        }
      } catch {
        // ignore
      }
    },

    async syncNativeMirror(data: Record<string, string>): Promise<void> {
      try {
        if (Capacitor.isNativePlatform()) {
          for (const [key, value] of Object.entries(data)) {
            await Preferences.set({ key: `native_mirror_${key}`, value });
          }
        }
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(`native_mirror_${key}`, value);
        }
      } catch (err) {
        console.warn('Capacitor native mirror sync failed:', err);
      }
    },

    async restoreFromNativeMirror(): Promise<Record<string, string> | null> {
      try {
        if (Capacitor.isNativePlatform()) {
          const keysRes = await Preferences.keys();
          const mirrorKeys: string[] = keysRes.keys.filter((k: string) =>
            k.startsWith('native_mirror_')
          );
          if (mirrorKeys.length > 0) {
            const restored: Record<string, string> = {};
            for (const key of mirrorKeys) {
              const res = await Preferences.get({ key });
              if (res.value) {
                restored[key.replace('native_mirror_', '')] = res.value;
              }
            }
            return Object.keys(restored).length > 0 ? restored : null;
          }
        }

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

    async exportPdf(
      title: string,
      htmlContent: string,
      isRtl: boolean = false,
      structuredReport?: ReportData
    ): Promise<{ success: boolean }> {
      try {
        const pdfBytes = await renderReportToPdfBytes({
          title,
          htmlContent,
          reportData: structuredReport,
          isRtl,
        });
        const fileName = `${sanitizeFileSlug(title)}_report.pdf`;

        if (Capacitor.isNativePlatform()) {
          const base64Pdf = uint8ToBase64(pdfBytes);
          // Omit encoding so Capacitor Filesystem writes raw decoded binary PDF bytes
          const writeRes = await Filesystem.writeFile({
            path: fileName,
            data: base64Pdf,
            directory: Directory.Cache,
          });

          await Share.share({
            title,
            url: writeRes.uri,
            files: [writeRes.uri],
            dialogTitle: title,
          });
          return { success: true };
        }

        // Web fallback inside Capacitor context still downloads real application/pdf bytes
        const copyBytes = new Uint8Array(pdfBytes.byteLength);
        copyBytes.set(pdfBytes);
        const blob = new Blob([copyBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { success: true };
      } catch (err) {
        console.error('Capacitor real PDF export error:', err);
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
        const handlePromise = plugins.Network.addListener(
          'networkStatusChange',
          (status: { connected: boolean }) => {
            callback(status.connected);
          }
        );
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

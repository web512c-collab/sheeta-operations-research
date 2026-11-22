/**
 * Sheeta Operations Research - Web & PWA Platform Adapter
 * Implements standard browser and installable Progressive Web App capabilities.
 */

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
import { generatePrintableHtml, executePrint } from './pdfGenerator';

export class WebPlatformAdapter implements PlatformAdapter {
  readonly type: PlatformType = 'web';
  readonly isNative = false;
  readonly isMobile: boolean;
  readonly isDesktop: boolean;
  readonly isPWA: boolean;

  constructor() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    this.isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
    this.isDesktop = !this.isMobile;
    this.isPWA =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  }

  readonly storage: StorageAdapter = {
    async getItem(key: string): Promise<string | null> {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      try {
        localStorage.setItem(key, value);
      } catch {
        // storage quota exceeded or disabled
      }
    },
    async removeItem(key: string): Promise<void> {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
    async clear(): Promise<void> {
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
    },
    async syncNativeMirror(data: Record<string, string>): Promise<void> {
      // In web, localStorage acts as standard local storage
      try {
        for (const [k, v] of Object.entries(data)) {
          localStorage.setItem(`mirror_${k}`, v);
        }
      } catch {
        // ignore
      }
    },
    async restoreFromNativeMirror(): Promise<Record<string, string> | null> {
      try {
        const mirror: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('mirror_')) {
            const rawKey = key.replace('mirror_', '');
            const val = localStorage.getItem(key);
            if (val) mirror[rawKey] = val;
          }
        }
        return Object.keys(mirror).length > 0 ? mirror : null;
      } catch {
        return null;
      }
    },
  };

  readonly file: FileAdapter = {
    async exportFile(options: FileExportOptions): Promise<{ success: boolean; path?: string }> {
      try {
        const mime = options.mimeType || 'text/plain;charset=utf-8';
        const blob = new Blob([options.content], { type: mime });
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
        console.error('Web file export failed:', err);
        return { success: false };
      }
    },

    async importFile(options: FileImportOptions): Promise<{ filename: string; content: string } | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        if (options.accept) {
          input.accept = options.accept;
        } else if (options.extensions && options.extensions.length > 0) {
          input.accept = options.extensions.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`)).join(',');
        }

        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          try {
            const text = await file.text();
            resolve({ filename: file.name, content: text });
          } catch {
            resolve(null);
          }
        };

        input.oncancel = () => resolve(null);
        input.click();
      });
    },

    async share(options: ShareOptions): Promise<boolean> {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: options.title,
            text: options.text,
            url: options.url,
          });
          return true;
        } catch {
          // User dismissed share dialog or permission denied
          return false;
        }
      }
      return false;
    },
  };

  readonly clipboard: ClipboardAdapter = {
    async copy(text: string): Promise<boolean> {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          // fallback
        }
      }

      // Legacy execCommand fallback
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      } catch {
        return false;
      }
    },

    async paste(): Promise<string> {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return '';
        }
      }
      return '';
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
        await executePrint(fullDoc);
        return { success: true };
      } catch (err) {
        console.error('PDF generation error:', err);
        return { success: false };
      }
    },
  };

  readonly device: DeviceAdapter = {
    async haptic(type = 'light'): Promise<void> {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        const patterns: Record<string, number | number[]> = {
          light: 15,
          medium: 35,
          heavy: 60,
          success: [20, 40, 20],
          error: [40, 60, 40, 60],
        };
        try {
          navigator.vibrate(patterns[type] || 20);
        } catch {
          // ignore
        }
      }
    },

    async setStatusBar(style: 'light' | 'dark', backgroundColor?: string): Promise<void> {
      if (typeof document === 'undefined') return;
      const themeColor = backgroundColor || (style === 'dark' ? '#0f172a' : '#4f46e5');
      let metaTheme = document.querySelector('meta[name="theme-color"]');
      if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.setAttribute('name', 'theme-color');
        document.head.appendChild(metaTheme);
      }
      metaTheme.setAttribute('content', themeColor);
    },

    async hideSplashScreen(): Promise<void> {
      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 300);
      }
    },

    onBackButton(callback: () => boolean | void): () => void {
      const handler = () => {
        const preventDefault = callback();
        if (preventDefault) {
          window.history.pushState(null, '', window.location.href);
        }
      };
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    },

    onAppStateChange(callback: (isActive: boolean) => void): () => void {
      const handler = () => {
        callback(document.visibilityState === 'visible');
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
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

/**
 * Sheeta Operations Research - Tauri 2 Platform Adapter (Desktop: Windows, macOS, Linux)
 * Bridges native desktop dialogs, local filesystem, system notifications, and window controls.
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

function getTauriApi(): any {
  return (typeof window !== 'undefined' ? (window as any).__TAURI__ : null) || null;
}

export class TauriPlatformAdapter implements PlatformAdapter {
  readonly type: PlatformType = 'tauri';
  readonly isNative = true;
  readonly isMobile = false;
  readonly isDesktop = true;
  readonly isPWA = false;

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
        // quota
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
      try {
        for (const [k, v] of Object.entries(data)) {
          localStorage.setItem(`tauri_mirror_${k}`, v);
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
          if (key && key.startsWith('tauri_mirror_')) {
            const val = localStorage.getItem(key);
            if (val) mirror[key.replace('tauri_mirror_', '')] = val;
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
        const tauri = getTauriApi();
        // Check for native Tauri dialog & fs plugins
        if (tauri?.dialog?.save && tauri?.fs?.writeTextFile) {
          const filePath = await tauri.dialog.save({
            defaultPath: options.filename,
            filters: [
              {
                name: 'Files',
                extensions: [options.filename.split('.').pop() || '*'],
              },
            ],
          });

          if (filePath) {
            await tauri.fs.writeTextFile(filePath, options.content);
            return { success: true, path: filePath };
          }
          return { success: false };
        }

        // Standard browser Blob download fallback
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
        console.error('Tauri file export failed:', err);
        return { success: false };
      }
    },

    async importFile(options: FileImportOptions): Promise<{ filename: string; content: string } | null> {
      try {
        const tauri = getTauriApi();
        if (tauri?.dialog?.open && tauri?.fs?.readTextFile) {
          const selected = await tauri.dialog.open({
            multiple: false,
            filters: options.extensions
              ? [{ name: 'Allowed Files', extensions: options.extensions }]
              : undefined,
          });

          if (selected && typeof selected === 'string') {
            const content = await tauri.fs.readTextFile(selected);
            const filename = selected.split(/[\/\\]/).pop() || 'imported_problem';
            return { filename, content };
          }
          return null;
        }

        // Web input fallback
        return new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          if (options.accept) input.accept = options.accept;
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
      } catch {
        return null;
      }
    },

    async share(options: ShareOptions): Promise<boolean> {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(`${options.title}\n${options.text || ''}\n${options.url || ''}`);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
  };

  readonly clipboard: ClipboardAdapter = {
    async copy(text: string): Promise<boolean> {
      try {
        const tauri = getTauriApi();
        if (tauri?.clipboard?.writeText) {
          await tauri.clipboard.writeText(text);
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
        const tauri = getTauriApi();
        if (tauri?.clipboard?.readText) {
          return await tauri.clipboard.readText();
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
        await executePrint(fullDoc);
        return { success: true };
      } catch (err) {
        console.error('Tauri PDF print error:', err);
        return { success: false };
      }
    },
  };

  readonly device: DeviceAdapter = {
    async haptic(): Promise<void> {
      // Desktop: No haptics hardware
    },

    async setStatusBar(): Promise<void> {
      // Desktop: No mobile status bar
    },

    async hideSplashScreen(): Promise<void> {
      // Handled by Tauri core window setup
    },

    onBackButton(callback: () => boolean | void): () => void {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          callback();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    },

    onAppStateChange(callback: (isActive: boolean) => void): () => void {
      const onFocus = () => callback(true);
      const onBlur = () => callback(false);
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onBlur);
      return () => {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onBlur);
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
    // Tauri runtime initialized
  }
}

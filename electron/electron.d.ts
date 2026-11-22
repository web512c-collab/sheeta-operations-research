/**
 * Ambient type definitions for Electron desktop target
 */

declare module 'electron' {
  export interface BrowserWindowOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    title?: string;
    webPreferences?: {
      preload?: string;
      nodeIntegration?: boolean;
      contextIsolation?: boolean;
      sandbox?: boolean;
      webSecurity?: boolean;
    };
    autoHideMenuBar?: boolean;
    backgroundColor?: string;
    show?: boolean;
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowOptions);
    once(event: string, callback: () => void): void;
    on(event: string, callback: () => void): void;
    show(): void;
    loadFile(filePath: string): Promise<void>;
    loadURL(url: string): Promise<void>;
    webContents: {
      setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }): void;
      print(options?: { silent?: boolean; printBackground?: boolean }): void;
    };
    static getAllWindows(): BrowserWindow[];
  }

  export const app: {
    getVersion(): string;
    whenReady(): Promise<void>;
    quit(): void;
    on(event: string, callback: () => void): void;
  };

  export const dialog: {
    showSaveDialog(
      window: BrowserWindow,
      options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }
    ): Promise<{ canceled: boolean; filePath?: string }>;
    showOpenDialog(
      window: BrowserWindow,
      options: { properties?: string[]; filters?: { name: string; extensions: string[] }[] }
    ): Promise<{ canceled: boolean; filePaths: string[] }>;
  };

  export const ipcMain: {
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: any): void;
  };

  export const clipboard: {
    writeText(text: string): void;
    readText(): string;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };
}

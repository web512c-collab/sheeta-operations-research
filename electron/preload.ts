/**
 * Sheeta Operations Research - Electron Secure Preload Bridge
 * Uses contextBridge to expose only safe, typed native capabilities.
 */

import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getInfo(): Promise<{ platform: string; version: string }>;
  saveFile(options: { defaultPath: string; content: string; mimeType?: string }): Promise<{ success: boolean; filePath?: string }>;
  openFile(options?: { extensions?: string[] }): Promise<{ filename: string; content: string } | null>;
  copyText(text: string): Promise<boolean>;
  readText(): Promise<string>;
  print(): Promise<void>;
}

const api: ElectronAPI = {
  getInfo: () => ipcRenderer.invoke('platform:get-info'),
  saveFile: (options) => ipcRenderer.invoke('file:save', options),
  openFile: (options) => ipcRenderer.invoke('file:open', options),
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text),
  readText: () => ipcRenderer.invoke('clipboard:read'),
  print: () => ipcRenderer.invoke('print:page'),
};

contextBridge.exposeInMainWorld('electronAPI', api);

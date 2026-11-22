/**
 * Sheeta Operations Research - Electron Desktop Main Process
 * Manages native window lifecycle, security context isolation, IPC bridges,
 * file system operations, and native printing dialogs.
 */

import { app, BrowserWindow, dialog, ipcMain, clipboard, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Sheeta Operations Research',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    show: false,
  });

  // Graceful show once renderer paints
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in user's default browser, not in Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load the built dist index.html
  const indexPath = path.join(__dirname, '../dist/index.html');
  mainWindow.loadFile(indexPath).catch(() => {
    // In local dev fallback
    mainWindow?.loadURL('http://localhost:3000');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==========================================
// IPC Handlers for Native Desktop Abstraction
// ==========================================

ipcMain.handle('platform:get-info', () => {
  return {
    platform: process.platform,
    version: app.getVersion(),
  };
});

ipcMain.handle('file:save', async (_event: any, options: { defaultPath: string; content: string; mimeType?: string }) => {
  if (!mainWindow) return { success: false };

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath,
    filters: [
      { name: 'JSON Workspace Backup', extensions: ['json'] },
      { name: 'Markdown Report', extensions: ['md', 'txt'] },
      { name: 'HTML Report', extensions: ['html'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled || !filePath) {
    return { success: false };
  }

  try {
    fs.writeFileSync(filePath, options.content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('Electron save file error:', err);
    return { success: false };
  }
});

ipcMain.handle('file:open', async (_event: any, options?: { extensions?: string[] }) => {
  if (!mainWindow) return null;

  const filters = options?.extensions
    ? [{ name: 'Allowed Files', extensions: options.extensions }]
    : [{ name: 'JSON Workspace', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }];

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters,
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  try {
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    return { filename, content };
  } catch {
    return null;
  }
});

ipcMain.handle('clipboard:copy', (_event: any, text: string) => {
  try {
    clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('clipboard:read', (_event: any) => {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
});

ipcMain.handle('print:page', () => {
  mainWindow?.webContents.print({
    silent: false,
    printBackground: true,
  });
});

// Lifecycle events
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

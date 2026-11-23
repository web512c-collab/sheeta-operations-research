/**
 * Sheeta Operations Research - Platform Abstraction Layer Entry Point
 * Automatically detects the runtime target and binds the appropriate adapter.
 * 
 * Supported runtimes:
 * 1. Web & PWA
 * 2. Android (Capacitor)
 * 3. Desktop (Tauri 2: Windows, Linux)
 * 4. Desktop (Electron: Windows, Linux)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PlatformAdapter } from './types';
import { WebPlatformAdapter } from './webAdapter';
import { CapacitorPlatformAdapter } from './capacitorAdapter';
import { TauriPlatformAdapter } from './tauriAdapter';
import { ElectronPlatformAdapter } from './electronAdapter';

let activePlatform: PlatformAdapter | null = null;

export function detectPlatform(): PlatformAdapter {
  if (activePlatform) {
    return activePlatform;
  }

  // 1. Electron Desktop Detection
  if (
    typeof window !== 'undefined' &&
    ((window as any).electronAPI !== undefined || /electron/i.test(navigator.userAgent))
  ) {
    activePlatform = new ElectronPlatformAdapter();
    return activePlatform;
  }

  // 2. Tauri Desktop Detection
  if (
    typeof window !== 'undefined' &&
    ((window as any).__TAURI__ !== undefined || (window as any).__TAURI_INTERNALS__ !== undefined)
  ) {
    activePlatform = new TauriPlatformAdapter();
    return activePlatform;
  }

  // 3. Capacitor Native Mobile Detection (Android)
  if (Capacitor.isNativePlatform()) {
    activePlatform = new CapacitorPlatformAdapter();
    return activePlatform;
  }

  // 4. Default: Modern Web SPA & Offline-capable PWA
  activePlatform = new WebPlatformAdapter();
  return activePlatform;
}

export function getPlatform(): PlatformAdapter {
  return detectPlatform();
}

// React Context & Hook for Platform Integration
const PlatformContext = createContext<PlatformAdapter>(detectPlatform());

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [platform] = useState<PlatformAdapter>(() => detectPlatform());

  useEffect(() => {
    platform.initialize().catch((err) => {
      console.warn('Platform initialization warning:', err);
    });
  }, [platform]);

  return React.createElement(PlatformContext.Provider, { value: platform }, children);
};

export function usePlatform(): PlatformAdapter {
  return useContext(PlatformContext);
}

export * from './types';
export * from './pdfGenerator';

/**
 * Sheeta Operations Research
 * Persistent Storage Layer (IndexedDB with LocalStorage Fallback)
 */

import { AppSettings, SavedProblem } from '../types';

const DB_NAME = 'SheetaORDatabase';
const DB_VERSION = 1;
const STORE_PROBLEMS = 'saved_problems';
const STORE_SETTINGS = 'app_settings';

const LOCAL_STORAGE_PROBLEMS_KEY = 'sheeta_or_saved_problems';
const LOCAL_STORAGE_SETTINGS_KEY = 'sheeta_or_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  presolveEnabled: true,
  sparseEnabled: true,
  webWorkerEnabled: true,
  branchingStrategy: 'most_fractional',
  maxNodes: 2000,
  maxDepth: 60,
  timeoutSeconds: 30,
  eps: 1e-7,
  pivotEps: 1e-9,
  autoCopyReport: true,
  theme: 'light',
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db: IDBDatabase = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PROBLEMS)) {
        db.createObjectStore(STORE_PROBLEMS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ==========================================
// Saved Problems CRUD
// ==========================================

export async function saveProblem(problem: SavedProblem): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROBLEMS, 'readwrite');
      const store = tx.objectStore(STORE_PROBLEMS);
      const req = store.put(problem);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback to localStorage
    const current = getLocalProblems();
    const idx = current.findIndex((p) => p.id === problem.id);
    if (idx >= 0) {
      current[idx] = problem;
    } else {
      current.push(problem);
    }
    saveLocalProblems(current);
  }
}

export async function getSavedProblems(): Promise<SavedProblem[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROBLEMS, 'readonly');
      const store = tx.objectStore(STORE_PROBLEMS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getLocalProblems();
  }
}

export async function deleteSavedProblem(id: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROBLEMS, 'readwrite');
      const store = tx.objectStore(STORE_PROBLEMS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const current = getLocalProblems().filter((p) => p.id !== id);
    saveLocalProblems(current);
  }
}

function getLocalProblems(): SavedProblem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PROBLEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalProblems(problems: SavedProblem[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_PROBLEMS_KEY, JSON.stringify(problems));
  } catch {
    // quota exceeded or private mode
  }
}

// ==========================================
// Settings CRUD
// ==========================================

export async function loadSettings(): Promise<AppSettings> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.get('app_settings');
      req.onsuccess = () => {
        if (req.result && req.result.settings) {
          resolve({ ...DEFAULT_SETTINGS, ...req.result.settings });
        } else {
          resolve(loadLocalSettings());
        }
      };
      req.onerror = () => resolve(loadLocalSettings());
    });
  } catch {
    return loadLocalSettings();
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.put({ key: 'app_settings', settings });
      req.onsuccess = () => {
        saveLocalSettings(settings);
        resolve();
      };
      req.onerror = () => {
        saveLocalSettings(settings);
        resolve();
      };
    });
  } catch {
    saveLocalSettings(settings);
  }
}

function loadLocalSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveLocalSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ==========================================
// JSON Workspace Backup Export & Import
// ==========================================

export async function exportWorkspaceJson(): Promise<string> {
  const problems = await getSavedProblems();
  const settings = await loadSettings();

  const backup = {
    app: 'Sheeta Operations Research',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    settings,
    problems,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importWorkspaceJson(jsonStr: string): Promise<{ count: number }> {
  const data = JSON.parse(jsonStr);
  if (!data || !Array.isArray(data.problems)) {
    throw new Error('Invalid workspace backup JSON: missing problems array');
  }

  let count = 0;
  for (const prob of data.problems) {
    if (prob.id && prob.title && prob.module) {
      await saveProblem(prob);
      count++;
    }
  }

  if (data.settings) {
    await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  }

  return { count };
}

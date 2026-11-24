/**
 * Sheeta Operations Research
 * Persistent Storage Layer (IndexedDB with LocalStorage Fallback & Schema Validation)
 */

import { AppSettings, ORModuleType, SavedProblem } from '../types';

const DB_NAME = 'SheetaORDatabase';
const DB_VERSION = 1;
const STORE_PROBLEMS = 'saved_problems';
const STORE_SETTINGS = 'app_settings';

const LOCAL_STORAGE_PROBLEMS_KEY = 'sheeta_or_saved_problems';
const LOCAL_STORAGE_SETTINGS_KEY = 'sheeta_or_settings';

const SUPPORTED_MODULES: ReadonlySet<string> = new Set<ORModuleType>([
  'lp',
  'transportation',
  'pert',
  'queuing_eoq',
  'simulation',
]);

const SUPPORTED_BACKUP_VERSIONS: ReadonlySet<string> = new Set(['1.0.0', '1.1.0']);

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

export function validateAppSettings(raw: Partial<AppSettings>): {
  valid: boolean;
  error?: string;
  sanitized: AppSettings;
} {
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...raw };

  if (!Number.isInteger(merged.maxNodes) || merged.maxNodes < 1 || merged.maxNodes > 1000000) {
    return {
      valid: false,
      error: 'maxNodes must be an integer between 1 and 1,000,000.',
      sanitized: DEFAULT_SETTINGS,
    };
  }
  if (!Number.isInteger(merged.maxDepth) || merged.maxDepth < 0 || merged.maxDepth > 1000) {
    return {
      valid: false,
      error: 'maxDepth must be an integer between 0 and 1,000.',
      sanitized: DEFAULT_SETTINGS,
    };
  }
  if (!Number.isFinite(merged.timeoutSeconds) || merged.timeoutSeconds < 1 || merged.timeoutSeconds > 3600) {
    return {
      valid: false,
      error: 'timeoutSeconds must be between 1 and 3,600.',
      sanitized: DEFAULT_SETTINGS,
    };
  }
  if (!Number.isFinite(merged.eps) || merged.eps <= 0 || merged.eps >= 0.01) {
    return {
      valid: false,
      error: 'eps tolerance must be strictly between 0 and 0.01.',
      sanitized: DEFAULT_SETTINGS,
    };
  }
  if (!Number.isFinite(merged.pivotEps) || merged.pivotEps <= 0 || merged.pivotEps >= merged.eps) {
    return {
      valid: false,
      error: 'pivotEps must be strictly positive and smaller than eps.',
      sanitized: DEFAULT_SETTINGS,
    };
  }
  if (
    merged.branchingStrategy !== 'most_fractional' &&
    merged.branchingStrategy !== 'first_fractional'
  ) {
    merged.branchingStrategy = 'most_fractional';
  }
  if (merged.theme !== 'light' && merged.theme !== 'dark') {
    merged.theme = 'light';
  }

  return { valid: true, sanitized: merged };
}

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
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_STORAGE_PROBLEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalProblems(problems: SavedProblem[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PROBLEMS_KEY, JSON.stringify(problems));
    }
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
          resolve(validateAppSettings(req.result.settings).sanitized);
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
  const checked = validateAppSettings(settings);
  const toSave = checked.valid ? checked.sanitized : DEFAULT_SETTINGS;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.put({ key: 'app_settings', settings: toSave });
      req.onsuccess = () => {
        saveLocalSettings(toSave);
        resolve();
      };
      req.onerror = () => {
        saveLocalSettings(toSave);
        resolve();
      };
    });
  } catch {
    saveLocalSettings(toSave);
  }
}

function loadLocalSettings(): AppSettings {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
    const raw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const checked = validateAppSettings(parsed);
    return checked.valid ? checked.sanitized : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveLocalSettings(settings: AppSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    }
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
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    settings,
    problems,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importWorkspaceJson(jsonStr: string): Promise<{ count: number }> {
  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    throw new Error('Malformed JSON backup file: unable to parse JSON.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid workspace backup JSON: expected a JSON object.');
  }

  if (data.version !== undefined && !SUPPORTED_BACKUP_VERSIONS.has(String(data.version))) {
    throw new Error(
      `Unsupported backup schema version "${String(data.version)}". Supported versions: 1.0.0, 1.1.0.`
    );
  }

  if (data.app !== undefined && data.app !== 'Sheeta Operations Research') {
    throw new Error(`Invalid backup application signature: "${String(data.app)}".`);
  }

  if (!Array.isArray(data.problems)) {
    throw new Error('Invalid workspace backup JSON: missing problems array.');
  }

  if (data.settings !== undefined) {
    if (typeof data.settings !== 'object' || data.settings === null || Array.isArray(data.settings)) {
      throw new Error('Invalid workspace backup JSON: settings must be an object.');
    }
    const checked = validateAppSettings(data.settings);
    if (!checked.valid) {
      throw new Error(`Invalid settings in backup: ${checked.error}`);
    }
  }

  const validProblems: SavedProblem[] = [];
  for (let i = 0; i < data.problems.length; i++) {
    const prob = data.problems[i];
    if (
      !prob ||
      typeof prob !== 'object' ||
      typeof prob.id !== 'string' ||
      !prob.id.trim() ||
      typeof prob.title !== 'string' ||
      !prob.title.trim() ||
      typeof prob.module !== 'string' ||
      !SUPPORTED_MODULES.has(prob.module) ||
      prob.data === undefined
    ) {
      throw new Error(
        `Invalid problem entry at index ${i}: requires non-empty id, title, valid module, and data.`
      );
    }
    validProblems.push(prob as SavedProblem);
  }

  for (const prob of validProblems) {
    await saveProblem(prob);
  }

  if (data.settings) {
    await saveSettings(validateAppSettings(data.settings).sanitized);
  }

  return { count: validProblems.length };
}

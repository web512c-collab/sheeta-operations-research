/**
 * Sheeta Operations Research
 * Advanced Performance Settings & Benchmark Modal
 */

import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { AppSettings } from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { saveSettings, validateAppSettings } from '../../storage/db';
import { AlertCircle, Flame, Save, Zap } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onRunBenchmark: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onRunBenchmark,
}) => {
  const { t } = useI18n();
  const [form, setForm] = useState<AppSettings>(settings);
  const [epsStr, setEpsStr] = useState<string>(String(settings.eps));
  const [pivotEpsStr, setPivotEpsStr] = useState<string>(String(settings.pivotEps));
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  React.useEffect(() => {
    setForm(settings);
    setEpsStr(String(settings.eps));
    setPivotEpsStr(String(settings.pivotEps));
    setValidationErrors([]);
  }, [settings, isOpen]);

  const mapValidationMessage = (rawErr: string): string => {
    if (rawErr.includes('maxNodes')) return t.settings.validationRangeNodes;
    if (rawErr.includes('maxDepth')) return t.settings.validationRangeDepth;
    if (rawErr.includes('timeoutSeconds')) return t.settings.validationRangeTimeout;
    if (rawErr.includes('pivotEps')) return t.settings.validationRangePivotEps;
    if (rawErr.includes('eps')) return t.settings.validationRangeEps;
    return rawErr;
  };

  const handleSave = async () => {
    const parsedEps = Number(epsStr);
    const parsedPivotEps = Number(pivotEpsStr);
    const candidate: AppSettings = {
      ...form,
      eps: Number.isFinite(parsedEps) ? parsedEps : NaN,
      pivotEps: Number.isFinite(parsedPivotEps) ? parsedPivotEps : NaN,
    };

    const res = validateAppSettings(candidate);
    if (!res.valid) {
      setValidationErrors(res.error ? [mapValidationMessage(res.error)] : [t.settings.validationErrorTitle]);
      return;
    }

    setValidationErrors([]);
    await saveSettings(res.sanitized);
    onUpdateSettings(res.sanitized);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.settings.title} maxWidth="max-w-2xl">
      <div className="space-y-6">
        {validationErrors.length > 0 && (
          <div
            role="alert"
            className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 space-y-1"
          >
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{t.settings.validationErrorTitle}</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 ps-1">
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Algorithmic Toggles */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {t.settings.algorithmicOptimizations}
          </h3>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                {t.settings.presolveToggle}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">{t.settings.presolveDesc}</p>
            </div>
            <input
              type="checkbox"
              aria-label={t.settings.presolveToggle}
              checked={form.presolveEnabled}
              onChange={(e) => setForm({ ...form, presolveEnabled: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded"
            />
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                {t.settings.sparseToggle}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">{t.settings.sparseDesc}</p>
            </div>
            <input
              type="checkbox"
              aria-label={t.settings.sparseToggle}
              checked={form.sparseEnabled}
              onChange={(e) => setForm({ ...form, sparseEnabled: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded"
            />
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                {t.settings.workerToggle}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">{t.settings.workerDesc}</p>
            </div>
            <input
              type="checkbox"
              aria-label={t.settings.workerToggle}
              checked={form.webWorkerEnabled}
              onChange={(e) => setForm({ ...form, webWorkerEnabled: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded"
            />
          </div>
        </div>

        {/* Branch and Bound Strategy & Limits */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {t.settings.bAndBParams}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                {t.settings.branchingStrategy}
              </label>
              <select
                aria-label={t.settings.branchingStrategy}
                value={form.branchingStrategy}
                onChange={(e) => setForm({ ...form, branchingStrategy: e.target.value as any })}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value="most_fractional">{t.settings.mostFractional}</option>
                <option value="first_fractional">{t.settings.firstFractional}</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                {t.settings.maxNodes}
              </label>
              <input
                type="number"
                aria-label={t.settings.maxNodes}
                value={Number.isNaN(form.maxNodes) ? '' : form.maxNodes}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setForm({
                    ...form,
                    maxNodes: val === '' ? NaN : parseInt(val, 10),
                  });
                }}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                {t.settings.maxDepth}
              </label>
              <input
                type="number"
                aria-label={t.settings.maxDepth}
                value={Number.isNaN(form.maxDepth) ? '' : form.maxDepth}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setForm({
                    ...form,
                    maxDepth: val === '' ? NaN : parseInt(val, 10),
                  });
                }}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                {t.settings.timeout}
              </label>
              <input
                type="number"
                aria-label={t.settings.timeout}
                value={Number.isNaN(form.timeoutSeconds) ? '' : form.timeoutSeconds}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setForm({
                    ...form,
                    timeoutSeconds: val === '' ? NaN : parseInt(val, 10),
                  });
                }}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                {t.settings.epsTolerance}
              </label>
              <input
                type="text"
                aria-label={t.settings.epsTolerance}
                value={epsStr}
                onChange={(e) => setEpsStr(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                {t.settings.pivotEpsTolerance}
              </label>
              <input
                type="text"
                aria-label={t.settings.pivotEpsTolerance}
                value={pivotEpsStr}
                onChange={(e) => setPivotEpsStr(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Auto Copy Toggle */}
        <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
              {t.settings.autoCopy}
            </span>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t.settings.autoCopyDesc}
            </p>
          </div>
          <input
            type="checkbox"
            aria-label={t.settings.autoCopy}
            checked={form.autoCopyReport}
            onChange={(e) => setForm({ ...form, autoCopyReport: e.target.checked })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
        </div>

        {/* One-Click Benchmark Section */}
        <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-500" />
            <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
              {t.settings.benchmarkTitle}
            </h4>
          </div>
          <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
            {t.settings.benchmarkDesc}
          </p>
          <button
            type="button"
            onClick={() => {
              onRunBenchmark();
              onClose();
            }}
            className="mt-2 px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{t.settings.benchmarkBtn}</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {t.actions.close}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t.actions.saveSettings}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Sheeta Operations Research
 * Run Status Banner with Progress and Safe Cancellation
 */

import React from 'react';
import { RunStatus } from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, StopCircle } from 'lucide-react';

interface StatusBannerProps {
  status: RunStatus;
  customMessage?: string;
  onCancel?: () => void;
  progressPercent?: number;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  status,
  customMessage,
  onCancel,
  progressPercent,
}) => {
  const { t } = useI18n();

  if (status === 'idle') return null;

  return (
    <div
      className={`p-4 rounded-xl border mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
        status === 'running'
          ? 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
          : status === 'completed'
          ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
          : status === 'cancelled'
          ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
          : status === 'warning'
          ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
      }`}
    >
      <div className="flex items-center gap-3">
        {status === 'running' && <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />}
        {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
        {status === 'cancelled' && <StopCircle className="w-5 h-5 text-slate-500 shrink-0" />}
        {status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />}
        {status === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />}

        <div>
          <span className="font-semibold text-sm">
            {customMessage ||
              (status === 'running'
                ? t.status.running
                : status === 'completed'
                ? t.status.completed
                : status === 'cancelled'
                ? t.status.cancelled
                : status === 'warning'
                ? t.status.warning
                : t.status.error)}
          </span>
          {progressPercent !== undefined && status === 'running' && (
            <div className="w-48 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {status === 'running' && onCancel && (
        <button
          onClick={onCancel}
          className="self-start md:self-auto px-3.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60 hover:bg-rose-200 dark:hover:bg-rose-900 border border-rose-300 dark:border-rose-800 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
        >
          <StopCircle className="w-4 h-4" />
          {t.actions.cancel}
        </button>
      )}
    </div>
  );
};

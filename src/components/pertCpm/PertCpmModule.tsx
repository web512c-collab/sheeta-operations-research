/**
 * Sheeta Operations Research
 * Project Network Management (PERT / CPM) Module
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityDef, PertCpmResult, RunStatus } from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { SAMPLE_PERT_CPM } from '../../storage/sampleProblems';
import { solvePertCpm } from '../../engines/pertCpm';
import { StatusBanner } from '../common/StatusBanner';
import {
  Play,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';

interface PertCpmModuleProps {
  initialActivities?: ActivityDef[];
  syncVersion?: number;
  onUpdateActiveProblem?: (activities: ActivityDef[], results?: any) => void;
}

export const PertCpmModule: React.FC<PertCpmModuleProps> = ({
  initialActivities,
  syncVersion,
  onUpdateActiveProblem,
}) => {
  const { t } = useI18n();

  const [activities, setActivities] = useState<ActivityDef[]>(
    initialActivities || SAMPLE_PERT_CPM
  );
  const [durationMode, setDurationMode] = useState<'single' | 'three_point'>('three_point');
  const [result, setResult] = useState<PertCpmResult | null>(null);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [targetDays, setTargetDays] = useState<number>(30);
  const lastSyncRef = useRef<{ activities?: ActivityDef[]; version?: number }>({
    activities: initialActivities,
    version: syncVersion,
  });

  useEffect(() => {
    if (!initialActivities) return;
    if (syncVersion !== undefined) {
      if (lastSyncRef.current.version === syncVersion) return;
    } else if (lastSyncRef.current.activities === initialActivities) {
      return;
    }
    lastSyncRef.current = { activities: initialActivities, version: syncVersion };
    setActivities(initialActivities);
    if (initialActivities[0]?.durationMode) {
      setDurationMode(initialActivities[0].durationMode);
    }
    setResult(null);
    setStatus('idle');
    setStatusMessage('');
  }, [initialActivities, syncVersion]);

  const handleSolve = () => {
    setStatus('running');
    setStatusMessage(t.status.running);

    setTimeout(() => {
      try {
        const configured = activities.map((a) => ({ ...a, durationMode }));
        const res = solvePertCpm(configured);
        setResult(res);
        setTargetDays(Math.ceil(res.totalDuration * 1.1));
        setStatus('completed');
        setStatusMessage(t.status.optimal);

        if (onUpdateActiveProblem) {
          onUpdateActiveProblem(configured, res);
        }
      } catch (err: any) {
        setStatus('error');
        setStatusMessage(err?.message || 'Error computing project schedule');
      }
    }, 50);
  };

  const commitActivities = (updated: ActivityDef[]) => {
    setActivities(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const addActivity = () => {
    const nextCode = String.fromCharCode(65 + activities.length);
    const newAct: ActivityDef = {
      id: nextCode,
      name: `Activity ${nextCode}`,
      predecessors: activities.length > 0 ? [activities[activities.length - 1].id] : [],
      durationMode,
      duration: 5,
      optimistic: 3,
      mostLikely: 5,
      pessimistic: 9,
    };
    commitActivities([...activities, newAct]);
  };

  const removeActivity = (idx: number) => {
    if (activities.length <= 1) return;
    commitActivities(activities.filter((_, i) => i !== idx));
  };

  const updateActivity = (idx: number, patch: Partial<ActivityDef>) => {
    const updated = [...activities];
    updated[idx] = { ...updated[idx], ...patch };
    commitActivities(updated);
  };

  const calculatedProb =
    result && result.probabilityForTargetTime ? result.probabilityForTargetTime(targetDays) : 0;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t.pert.title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Forward and backward pass scheduling, slack analysis, and critical path identification.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => setDurationMode('single')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              durationMode === 'single'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.pert.singleTime}
          </button>
          <button
            onClick={() => setDurationMode('three_point')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              durationMode === 'three_point'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.pert.threePoint}
          </button>
        </div>
      </div>

      <StatusBanner status={status} customMessage={statusMessage} />

      {/* Activities Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Project Activities</span>
            <span className="text-xs text-slate-500 font-normal">({activities.length})</span>
          </h3>
          <button
            onClick={addActivity}
            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Activity</span>
          </button>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
              <tr>
                <th className="px-3 py-2 text-start">{t.pert.activityId}</th>
                <th className="px-3 py-2 text-start">{t.pert.activityName}</th>
                <th className="px-3 py-2 text-start">{t.pert.predecessors}</th>
                {durationMode === 'single' ? (
                  <th className="px-3 py-2 text-end">{t.pert.duration}</th>
                ) : (
                  <>
                    <th className="px-3 py-2 text-end">{t.pert.optimistic}</th>
                    <th className="px-3 py-2 text-end">{t.pert.mostLikely}</th>
                    <th className="px-3 py-2 text-end">{t.pert.pessimistic}</th>
                  </>
                )}
                <th className="px-3 py-2 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {activities.map((act, idx) => (
                <tr key={act.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    <input
                      type="text"
                      value={act.id}
                      onChange={(e) => updateActivity(idx, { id: e.target.value })}
                      className="w-14 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono font-bold"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={act.name}
                      onChange={(e) => updateActivity(idx, { name: e.target.value })}
                      className="w-56 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-medium"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={act.predecessors.join(', ')}
                      placeholder="e.g. A, B"
                      onChange={(e) =>
                        updateActivity(idx, {
                          predecessors: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="w-32 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono"
                    />
                  </td>
                  {durationMode === 'single' ? (
                    <td className="px-3 py-2 text-end">
                      <input
                        type="number"
                        step="any"
                        value={act.duration}
                        onChange={(e) =>
                          updateActivity(idx, { duration: parseFloat(e.target.value) || 0 })
                        }
                        className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono tabular-nums text-end"
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-end">
                        <input
                          type="number"
                          step="any"
                          value={act.optimistic ?? act.duration}
                          onChange={(e) =>
                            updateActivity(idx, { optimistic: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono tabular-nums text-end"
                        />
                      </td>
                      <td className="px-3 py-2 text-end">
                        <input
                          type="number"
                          step="any"
                          value={act.mostLikely ?? act.duration}
                          onChange={(e) =>
                            updateActivity(idx, { mostLikely: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono tabular-nums text-end"
                        />
                      </td>
                      <td className="px-3 py-2 text-end">
                        <input
                          type="number"
                          step="any"
                          value={act.pessimistic ?? act.duration}
                          onChange={(e) =>
                            updateActivity(idx, { pessimistic: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono tabular-nums text-end"
                        />
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-end">
                    <button
                      onClick={() => removeActivity(idx)}
                      disabled={activities.length <= 1}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleSolve}
          className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-sm flex items-center gap-2"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Compute Schedule & Critical Path</span>
        </button>
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.pert.totalDuration}</span>
              <p className="font-mono text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
                {result.totalDuration.toFixed(2)}{' '}
                <span className="text-sm font-normal text-slate-500">days</span>
              </p>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.pert.criticalPath}</span>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {result.criticalPath.map((id, idx) => (
                  <React.Fragment key={id}>
                    <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-mono font-bold text-xs rounded-md">
                      {id}
                    </span>
                    {idx < result.criticalPath.length - 1 && (
                      <span className="text-slate-400 text-xs font-bold">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.pert.projectStdDev} (σ)</span>
              <p className="font-mono text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1 tabular-nums">
                {result.projectStdDev.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-400">
                  (σ² = {result.projectVariance.toFixed(2)})
                </span>
              </p>
            </div>
          </div>

          {/* Full Activity Schedule Calculations */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
              Activity Timing & Slack Table
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold font-mono">
                  <tr>
                    <th className="px-3 py-2 text-start font-sans">{t.pert.activityId}</th>
                    <th className="px-3 py-2 text-start font-sans">{t.pert.activityName}</th>
                    <th className="px-3 py-2 text-end">{t.pert.expectedDuration}</th>
                    <th className="px-3 py-2 text-end">{t.pert.earlyStart}</th>
                    <th className="px-3 py-2 text-end">{t.pert.earlyFinish}</th>
                    <th className="px-3 py-2 text-end">{t.pert.lateStart}</th>
                    <th className="px-3 py-2 text-end">{t.pert.lateFinish}</th>
                    <th className="px-3 py-2 text-end">{t.pert.slack}</th>
                    <th className="px-3 py-2 text-center font-sans">{t.pert.critical}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {result.activities.map((act) => (
                    <tr
                      key={act.id}
                      className={
                        act.isCritical
                          ? 'bg-rose-50/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 font-bold'
                          : 'text-slate-700 dark:text-slate-300'
                      }
                    >
                      <td className="px-3 py-2 text-indigo-600 dark:text-indigo-400">{act.id}</td>
                      <td className="px-3 py-2 font-sans font-medium">{act.name}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{act.expectedDuration.toFixed(2)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{act.es.toFixed(1)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{act.ef.toFixed(1)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{act.ls.toFixed(1)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{act.lf.toFixed(1)}</td>
                      <td className="px-3 py-2 text-end tabular-nums font-bold">
                        {act.slack.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {act.isCritical ? (
                          <span className="px-2 py-0.5 bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 rounded text-[10px] font-bold">
                            {t.pert.yes}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">{t.pert.no}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gantt Timeline View */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
              {t.pert.ganttView}
            </h3>
            <div className="space-y-2 pt-2">
              {result.activities.map((act) => {
                const total = Math.max(1, result.totalDuration);
                const leftPercent = (act.es / total) * 100;
                const widthPercent = Math.max(2, (act.expectedDuration / total) * 100);

                return (
                  <div key={act.id} className="flex items-center gap-4 text-xs">
                    <div className="w-20 font-mono font-bold text-slate-700 dark:text-slate-300 truncate">
                      {act.id} ({act.expectedDuration.toFixed(1)}d)
                    </div>
                    <div dir="ltr" className="flex-1 bg-slate-100 dark:bg-slate-800 h-6 rounded-md relative overflow-hidden">
                      <div
                        className={`h-full rounded-md flex items-center px-2 text-[10px] text-white font-bold transition-all ${
                          act.isCritical ? 'bg-rose-500' : 'bg-indigo-500'
                        }`}
                        style={{
                          marginLeft: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                      >
                        {act.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Probability Calculator Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t.pert.probabilityCalc}
              </h3>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-600 dark:text-slate-400">{t.pert.targetDays}:</label>
                <input
                  type="number"
                  value={targetDays}
                  onChange={(e) => setTargetDays(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm"
                />
              </div>

              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-3">
                <span className="text-xs text-indigo-900 dark:text-indigo-200">{t.pert.probabilityResult}</span>
                <strong className="font-mono text-lg font-extrabold text-indigo-700 dark:text-indigo-300">
                  {(calculatedProb * 100).toFixed(2)}%
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

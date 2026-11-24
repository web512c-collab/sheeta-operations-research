/**
 * Sheeta Operations Research
 * Transportation & Hungarian Assignment Module
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AssignmentProblem,
  AssignmentResult,
  RunStatus,
  TransportationProblem,
  TransportationResult,
} from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import {
  SAMPLE_ASSIGNMENT,
  SAMPLE_TRANSPORTATION,
} from '../../storage/sampleProblems';
import {
  solveHungarianAssignment,
  solveTransportation,
} from '../../engines/transportation';
import { StatusBanner } from '../common/StatusBanner';
import { ArrowRight, CheckCircle2, Play, Plus, Trash2, Truck, Users } from 'lucide-react';

interface TransportationModuleProps {
  initialProblem?: TransportationProblem | AssignmentProblem;
  syncVersion?: number;
  onUpdateActiveProblem?: (problem: any, results?: any) => void;
}

function isAssignmentProblem(
  prob: TransportationProblem | AssignmentProblem
): prob is AssignmentProblem {
  return 'workers' in prob && Array.isArray(prob.workers);
}

export const TransportationModule: React.FC<TransportationModuleProps> = ({
  initialProblem,
  syncVersion,
  onUpdateActiveProblem,
}) => {
  const { t } = useI18n();

  const initialIsAssign = initialProblem ? isAssignmentProblem(initialProblem) : false;

  const [mode, setMode] = useState<'transportation' | 'assignment'>(
    initialIsAssign ? 'assignment' : 'transportation'
  );
  const [transportProblem, setTransportProblem] = useState<TransportationProblem>(
    initialProblem && !isAssignmentProblem(initialProblem)
      ? initialProblem
      : SAMPLE_TRANSPORTATION
  );
  const [assignProblem, setAssignProblem] = useState<AssignmentProblem>(
    initialProblem && isAssignmentProblem(initialProblem)
      ? initialProblem
      : SAMPLE_ASSIGNMENT
  );

  const [transportResult, setTransportResult] = useState<TransportationResult | null>(null);
  const [assignResult, setAssignResult] = useState<AssignmentResult | null>(null);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const lastSyncRef = useRef<{ problem?: TransportationProblem | AssignmentProblem; version?: number }>({
    problem: initialProblem,
    version: syncVersion,
  });

  useEffect(() => {
    if (!initialProblem) return;
    if (syncVersion !== undefined) {
      if (lastSyncRef.current.version === syncVersion) return;
    } else if (lastSyncRef.current.problem === initialProblem) {
      return;
    }
    lastSyncRef.current = { problem: initialProblem, version: syncVersion };

    if (isAssignmentProblem(initialProblem)) {
      setMode('assignment');
      setAssignProblem(initialProblem);
      setAssignResult(null);
    } else {
      setMode('transportation');
      setTransportProblem(initialProblem);
      setTransportResult(null);
    }
    setStatus('idle');
    setErrorDetail(null);
  }, [initialProblem, syncVersion]);

  const handleSolve = () => {
    setStatus('running');
    setErrorDetail(null);

    setTimeout(() => {
      try {
        if (mode === 'transportation') {
          const res = solveTransportation(transportProblem);
          setTransportResult(res);
          setStatus('completed');
          setErrorDetail(null);
          if (onUpdateActiveProblem) {
            onUpdateActiveProblem(transportProblem, res);
          }
        } else {
          const res = solveHungarianAssignment(assignProblem);
          setAssignResult(res);
          setStatus('completed');
          setErrorDetail(null);
          if (onUpdateActiveProblem) {
            onUpdateActiveProblem(assignProblem, res);
          }
        }
      } catch (err: any) {
        setStatus('error');
        setErrorDetail(err?.message || '');
      }
    }, 50);
  };

  const statusMessage =
    status === 'running'
      ? t.status.running
      : status === 'completed'
      ? t.status.optimal
      : status === 'error'
      ? errorDetail || t.transportation.solveError
      : '';

  const commitTransport = (updated: TransportationProblem) => {
    setTransportProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const commitAssign = (updated: AssignmentProblem) => {
    setAssignProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const addSource = () => {
    const nextIdx = transportProblem.sources.length + 1;
    const newSources = [
      ...transportProblem.sources,
      { id: `s${nextIdx}`, name: `${t.transportation.sourceName} ${nextIdx}`, capacity: 100 },
    ];
    const newCosts = [
      ...transportProblem.costs,
      new Array(transportProblem.destinations.length).fill(10),
    ];
    commitTransport({ ...transportProblem, sources: newSources, costs: newCosts });
  };

  const removeSource = (idx: number) => {
    if (transportProblem.sources.length <= 1) return;
    const newSources = transportProblem.sources.filter((_, i) => i !== idx);
    const newCosts = transportProblem.costs.filter((_, i) => i !== idx);
    commitTransport({ ...transportProblem, sources: newSources, costs: newCosts });
  };

  const addDestination = () => {
    const nextIdx = transportProblem.destinations.length + 1;
    const newDests = [
      ...transportProblem.destinations,
      { id: `d${nextIdx}`, name: `${t.transportation.destName} ${nextIdx}`, demand: 100 },
    ];
    const newCosts = transportProblem.costs.map((row) => [...row, 10]);
    commitTransport({ ...transportProblem, destinations: newDests, costs: newCosts });
  };

  const updateCost = (r: number, c: number, val: number) => {
    const newCosts = transportProblem.costs.map((row) => [...row]);
    newCosts[r][c] = val;
    commitTransport({ ...transportProblem, costs: newCosts });
  };

  const addWorkerAndTask = () => {
    const n = assignProblem.workers.length + 1;
    const newWorkers = [...assignProblem.workers, `${t.transportation.workers} ${n}`];
    const newTasks = [...assignProblem.tasks, `${t.transportation.tasks} ${n}`];
    const newCosts = assignProblem.costs.map((row) => [...row, 50]);
    newCosts.push(new Array(newTasks.length).fill(50));
    commitAssign({ ...assignProblem, workers: newWorkers, tasks: newTasks, costs: newCosts });
  };

  const removeWorkerAndTask = () => {
    if (assignProblem.workers.length <= 2) return;
    const newWorkers = assignProblem.workers.slice(0, -1);
    const newTasks = assignProblem.tasks.slice(0, -1);
    const newCosts = assignProblem.costs.slice(0, -1).map((row) => row.slice(0, -1));
    commitAssign({ ...assignProblem, workers: newWorkers, tasks: newTasks, costs: newCosts });
  };

  const updateAssignCost = (r: number, c: number, val: number) => {
    const newCosts = assignProblem.costs.map((row) => [...row]);
    newCosts[r][c] = val;
    commitAssign({ ...assignProblem, costs: newCosts });
  };

  const totalSupply = transportProblem.sources.reduce((sum, s) => sum + s.capacity, 0);
  const totalDemand = transportProblem.destinations.reduce((sum, d) => sum + d.demand, 0);
  const isBalanced = Math.abs(totalSupply - totalDemand) < 1e-4;

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {mode === 'transportation' ? t.transportation.transportationMode : t.transportation.assignmentMode}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {mode === 'transportation'
              ? t.transportation.transportationSubtitle
              : t.transportation.assignmentSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('transportation');
              if (onUpdateActiveProblem) onUpdateActiveProblem(transportProblem);
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
              mode === 'transportation'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>{t.transportation.transportationMode}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('assignment');
              if (onUpdateActiveProblem) onUpdateActiveProblem(assignProblem);
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
              mode === 'assignment'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t.transportation.assignmentMode}</span>
          </button>
        </div>
      </div>

      <StatusBanner status={status} customMessage={statusMessage} />

      {/* Mode 1: Transportation Problem */}
      {mode === 'transportation' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.transportation.method}
                </label>
                <select
                  aria-label={t.transportation.method}
                  value={transportProblem.method}
                  onChange={(e) =>
                    setTransportProblem({
                      ...transportProblem,
                      method: e.target.value as any,
                    })
                  }
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="vam">{t.transportation.vam}</option>
                  <option value="least_cost">{t.transportation.leastCost}</option>
                  <option value="northwest">{t.transportation.northwest}</option>
                </select>
              </div>

              <div className="text-xs text-slate-500 pt-4">
                {t.transportation.supplyLabel}{' '}
                <strong className="font-mono text-slate-900 dark:text-slate-100">{totalSupply}</strong> |{' '}
                {t.transportation.demandLabel}{' '}
                <strong className="font-mono text-slate-900 dark:text-slate-100">{totalDemand}</strong>
                {!isBalanced && (
                  <span className="ms-2 text-amber-600 dark:text-amber-400 font-semibold">
                    {totalSupply > totalDemand
                      ? t.transportation.autoDummyMarket
                      : t.transportation.autoDummySupplier}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addSource}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.transportation.addSource}</span>
              </button>
              <button
                type="button"
                onClick={addDestination}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.transportation.addDest}</span>
              </button>
            </div>
          </div>

          {/* Interactive Transportation Matrix */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.transportation.sources}</th>
                  {transportProblem.destinations.map((d, dIdx) => (
                    <th key={d.id} className="px-3 py-2 text-center">
                      <div className="flex flex-col items-center">
                        <input
                          type="text"
                          aria-label={`${t.transportation.destName} ${dIdx + 1}`}
                          value={d.name}
                          onChange={(e) => {
                            const newDests = transportProblem.destinations.map((dest, idx) =>
                              idx === dIdx ? { ...dest, name: e.target.value } : dest
                            );
                            commitTransport({ ...transportProblem, destinations: newDests });
                          }}
                          className="w-24 text-center px-1.5 py-0.5 bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 font-semibold"
                        />
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-[10px] text-slate-400">{t.transportation.demandPrefix}</span>
                          <input
                            type="number"
                            aria-label={`${t.transportation.demand} ${d.name}`}
                            value={d.demand}
                            onChange={(e) => {
                              const newDemand = parseFloat(e.target.value) || 0;
                              const newDests = transportProblem.destinations.map((dest, idx) =>
                                idx === dIdx ? { ...dest, demand: newDemand } : dest
                              );
                              commitTransport({ ...transportProblem, destinations: newDests });
                            }}
                            className="w-14 text-center px-1 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center">{t.transportation.capacity}</th>
                  <th className="px-3 py-2 text-end">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {transportProblem.sources.map((s, sIdx) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-medium">
                      <input
                        type="text"
                        aria-label={`${t.transportation.sourceName} ${sIdx + 1}`}
                        value={s.name}
                        onChange={(e) => {
                          const newSources = transportProblem.sources.map((src, idx) =>
                            idx === sIdx ? { ...src, name: e.target.value } : src
                          );
                          commitTransport({ ...transportProblem, sources: newSources });
                        }}
                        className="w-32 px-2 py-1 bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 font-semibold"
                      />
                    </td>
                    {transportProblem.destinations.map((d, dIdx) => (
                      <td key={d.id} className="px-3 py-2 text-center">
                        <div className="inline-flex flex-col items-center">
                          <input
                            type="number"
                            aria-label={`${s.name} -> ${d.name}`}
                            value={transportProblem.costs[sIdx]?.[dIdx] ?? 0}
                            onChange={(e) => updateCost(sIdx, dIdx, parseFloat(e.target.value) || 0)}
                            className="w-14 text-center px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono tabular-nums text-xs"
                          />
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        aria-label={`${t.transportation.capacity} ${s.name}`}
                        value={s.capacity}
                        onChange={(e) => {
                          const newCapacity = parseFloat(e.target.value) || 0;
                          const newSources = transportProblem.sources.map((src, idx) =>
                            idx === sIdx ? { ...src, capacity: newCapacity } : src
                          );
                          commitTransport({ ...transportProblem, sources: newSources });
                        }}
                        className="w-16 text-center px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono font-bold text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-end">
                      <button
                        type="button"
                        onClick={() => removeSource(sIdx)}
                        disabled={transportProblem.sources.length <= 1}
                        aria-label={`${t.actions.remove} ${s.name}`}
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
            type="button"
            onClick={handleSolve}
            className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{t.actions.solve}</span>
          </button>
        </div>
      )}

      {/* Mode 2: Hungarian Assignment Problem */}
      {mode === 'assignment' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.lp.objectiveSense}
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAssignProblem({ ...assignProblem, sense: 'minimize' })}
                    className={`px-3 py-1 text-xs font-semibold rounded-md ${
                      assignProblem.sense === 'minimize'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {t.lp.minimize}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignProblem({ ...assignProblem, sense: 'maximize' })}
                    className={`px-3 py-1 text-xs font-semibold rounded-md ${
                      assignProblem.sense === 'maximize'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {t.lp.maximize}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addWorkerAndTask}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.transportation.addDimension}</span>
              </button>
              <button
                type="button"
                onClick={removeWorkerAndTask}
                disabled={assignProblem.workers.length <= 2}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-40"
              >
                {t.transportation.removeDimension}
              </button>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.transportation.workers}</th>
                  {assignProblem.tasks.map((task, tIdx) => (
                    <th key={tIdx} className="px-3 py-2 text-center font-medium">
                      {task}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {assignProblem.workers.map((worker, wIdx) => (
                  <tr key={wIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2 font-sans font-medium">{worker}</td>
                    {assignProblem.tasks.map((task, tIdx) => (
                      <td key={tIdx} className="px-3 py-2 text-center">
                        <input
                          type="number"
                          aria-label={`${worker} -> ${task}`}
                          value={assignProblem.costs[wIdx]?.[tIdx] ?? 0}
                          onChange={(e) => updateAssignCost(wIdx, tIdx, parseFloat(e.target.value) || 0)}
                          className="w-16 text-center px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono tabular-nums text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleSolve}
            className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{t.actions.solve}</span>
          </button>
        </div>
      )}

      {/* Results for Transportation */}
      {mode === 'transportation' && transportResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t.transportation.allocationTable}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {transportProblem.method.toUpperCase()} — {t.transportation.allocationSubtitle}
              </p>
            </div>
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-xl">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t.transportation.totalCost}:</span>
              <span className="font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ${transportResult.totalCost.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.transportation.sourceDestHeader}</th>
                  {transportProblem.destinations.map((d) => (
                    <th key={d.id} className="px-3 py-2 text-center font-medium">
                      {d.name}
                    </th>
                  ))}
                  {transportResult.dummyAdded === 'destination' && (
                    <th className="px-3 py-2 text-center font-medium text-amber-600">
                      {t.transportation.dummyMarket}
                    </th>
                  )}
                  <th className="px-3 py-2 text-end">{t.transportation.totalSupply}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {transportProblem.sources.map((s, rIdx) => {
                  const rowSum = transportResult.allocations[rIdx]?.reduce((a, b) => a + b, 0) || 0;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-sans font-medium text-slate-800 dark:text-slate-200">
                        {s.name}
                      </td>
                      {transportProblem.destinations.map((_, cIdx) => {
                        const alloc = transportResult.allocations[rIdx]?.[cIdx] ?? 0;
                        const unitCost = transportProblem.costs[rIdx]?.[cIdx] ?? 0;
                        return (
                          <td key={cIdx} className="px-3 py-2 text-center">
                            <div
                              className={`p-1.5 rounded-md ${
                                alloc > 0
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 font-bold text-emerald-700 dark:text-emerald-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              <span className="text-sm tabular-nums">{alloc > 0 ? alloc : '-'}</span>
                              <span className="block text-[10px] text-slate-400 font-normal">
                                ({t.transportation.unitCostPrefix} ${unitCost})
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      {transportResult.dummyAdded === 'destination' && (
                        <td className="px-3 py-2 text-center">
                          <div className="p-1.5 rounded-md bg-amber-50 text-amber-700 font-bold">
                            {transportResult.allocations[rIdx]?.[transportProblem.destinations.length] || '-'}
                            <span className="block text-[10px] text-slate-400 font-normal">($0)</span>
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2 text-end font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                        {rowSum} / {s.capacity}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results for Hungarian Assignment */}
      {mode === 'assignment' && assignResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t.transportation.assignmentsResult}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.transportation.assignmentsSubtitle}
              </p>
            </div>
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-xl">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t.transportation.totalOptimalCost}:</span>
              <span className="font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ${assignResult.totalCost.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {assignResult.assignments.map((a, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>{a.workerName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 mb-2">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">{a.taskName}</span>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {t.transportation.unitCostPrefix}{' '}
                  <strong className="text-slate-900 dark:text-slate-100">${a.cost}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

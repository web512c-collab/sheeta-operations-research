/**
 * Sheeta Operations Research
 * Queuing Theory & Inventory (EOQ/EPQ) Module
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  EoqInputs,
  EoqModelType,
  EoqResult,
  QueuingInputs,
  QueuingModelType,
  QueuingResult,
  RunStatus,
} from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { SAMPLE_EOQ, SAMPLE_QUEUING } from '../../storage/sampleProblems';
import { solveEoq, solveQueuing } from '../../engines/queuingEoq';
import { StatusBanner } from '../common/StatusBanner';
import { Package, Play, Users } from 'lucide-react';

interface QueuingEoqModuleProps {
  initialQueuing?: QueuingInputs;
  initialEoq?: EoqInputs;
  preferredTab?: 'queuing' | 'eoq';
  syncVersion?: number;
  onUpdateActiveProblem?: (problem: any, results?: any, activeSubTab?: 'queuing' | 'eoq') => void;
}

export const QueuingEoqModule: React.FC<QueuingEoqModuleProps> = ({
  initialQueuing,
  initialEoq,
  preferredTab,
  syncVersion,
  onUpdateActiveProblem,
}) => {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'queuing' | 'eoq'>(preferredTab || 'queuing');

  // Queuing State
  const [queuingInputs, setQueuingInputs] = useState<QueuingInputs>(
    initialQueuing || SAMPLE_QUEUING
  );
  const [queuingResult, setQueuingResult] = useState<QueuingResult | null>(null);

  // EOQ State
  const [eoqInputs, setEoqInputs] = useState<EoqInputs>(initialEoq || SAMPLE_EOQ);
  const [eoqResult, setEoqResult] = useState<EoqResult | null>(null);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const lastSyncRef = useRef<{
    queuing?: QueuingInputs;
    eoq?: EoqInputs;
    version?: number;
  }>({
    queuing: initialQueuing,
    eoq: initialEoq,
    version: syncVersion,
  });

  useEffect(() => {
    if (syncVersion !== undefined) {
      if (lastSyncRef.current.version === syncVersion) return;
    } else if (
      lastSyncRef.current.queuing === initialQueuing &&
      lastSyncRef.current.eoq === initialEoq
    ) {
      return;
    }
    lastSyncRef.current = {
      queuing: initialQueuing,
      eoq: initialEoq,
      version: syncVersion,
    };

    if (initialQueuing) {
      setQueuingInputs(initialQueuing);
      setQueuingResult(null);
    }
    if (initialEoq) {
      setEoqInputs(initialEoq);
      setEoqResult(null);
    }
    if (preferredTab) {
      setActiveTab(preferredTab);
    }
    setStatus('idle');
    setStatusMessage('');
  }, [initialQueuing, initialEoq, preferredTab, syncVersion]);

  const updateQueuing = (updated: QueuingInputs) => {
    setQueuingInputs(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated, undefined, 'queuing');
  };

  const updateEoq = (updated: EoqInputs) => {
    setEoqInputs(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated, undefined, 'eoq');
  };

  const handleSolveQueuing = () => {
    setStatus('running');
    setStatusMessage(t.status.running);

    setTimeout(() => {
      try {
        const res = solveQueuing(queuingInputs);
        setQueuingResult(res);
        if (res.rho >= 1) {
          setStatus('warning');
          setStatusMessage('System is unstable: arrival rate λ exceeds total service capacity cμ (ρ >= 1).');
        } else {
          setStatus('completed');
          setStatusMessage(t.status.optimal);
        }
        if (onUpdateActiveProblem) {
          onUpdateActiveProblem(queuingInputs, res, 'queuing');
        }
      } catch (err: any) {
        setStatus('error');
        setStatusMessage(err?.message || 'Error solving queuing model');
      }
    }, 50);
  };

  const handleSolveEoq = () => {
    setStatus('running');
    setStatusMessage(t.status.running);

    setTimeout(() => {
      try {
        const res = solveEoq(eoqInputs);
        setEoqResult(res);
        setStatus('completed');
        setStatusMessage(t.status.optimal);
        if (onUpdateActiveProblem) {
          onUpdateActiveProblem(eoqInputs, res, 'eoq');
        }
      } catch (err: any) {
        setStatus('error');
        setStatusMessage(err?.message || 'Error solving EOQ model');
      }
    }, 50);
  };

  return (
    <div className="space-y-6">
      {/* Top Switcher Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {activeTab === 'queuing' ? t.queuingEoq.queuingTab : t.queuingEoq.eoqTab}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeTab === 'queuing'
              ? 'Analytical performance measures for service systems with single and multiple servers.'
              : 'Economic Order Quantity, Production Quantity, planned shortages, and quantity discounts.'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => {
              setActiveTab('queuing');
              if (onUpdateActiveProblem) onUpdateActiveProblem(queuingInputs, undefined, 'queuing');
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
              activeTab === 'queuing'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t.queuingEoq.queuingTab}</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('eoq');
              if (onUpdateActiveProblem) onUpdateActiveProblem(eoqInputs, undefined, 'eoq');
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
              activeTab === 'eoq'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>{t.queuingEoq.eoqTab}</span>
          </button>
        </div>
      </div>

      <StatusBanner status={status} customMessage={statusMessage} />

      {/* Tab 1: Queuing Theory */}
      {activeTab === 'queuing' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.modelType}
                </label>
                <select
                  value={queuingInputs.model}
                  onChange={(e) =>
                    updateQueuing({
                      ...queuingInputs,
                      model: e.target.value as QueuingModelType,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="mm1">{t.queuingEoq.mm1}</option>
                  <option value="mmc">{t.queuingEoq.mmc}</option>
                  <option value="mm1k">{t.queuingEoq.mm1k}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.arrivalRate}
                </label>
                <input
                  type="number"
                  step="any"
                  value={queuingInputs.arrivalRate}
                  onChange={(e) =>
                    updateQueuing({
                      ...queuingInputs,
                      arrivalRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.serviceRate}
                </label>
                <input
                  type="number"
                  step="any"
                  value={queuingInputs.serviceRate}
                  onChange={(e) =>
                    updateQueuing({
                      ...queuingInputs,
                      serviceRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>

              {queuingInputs.model === 'mmc' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    {t.queuingEoq.serversCount}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={queuingInputs.servers}
                    onChange={(e) =>
                      updateQueuing({
                        ...queuingInputs,
                        servers: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                  />
                </div>
              )}

              {queuingInputs.model === 'mm1k' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    {t.queuingEoq.capacityK}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={queuingInputs.capacity}
                    onChange={(e) =>
                      updateQueuing({
                        ...queuingInputs,
                        capacity: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleSolveQueuing}
              className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Compute Queuing Measures</span>
            </button>
          </div>

          {/* Queuing Results Display */}
          {queuingResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.utilization} (ρ)</span>
                  <p className="font-mono text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
                    {(queuingResult.rho * 100).toFixed(1)}%
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.p0}</span>
                  <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {(queuingResult.p0 * 100).toFixed(2)}%
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.lq}</span>
                  <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {queuingResult.lq.toFixed(2)}
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.l}</span>
                  <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {queuingResult.l.toFixed(2)}
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.wq}</span>
                  <p className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    {queuingResult.wq.toFixed(3)}
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.w}</span>
                  <p className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    {queuingResult.w.toFixed(3)}
                  </p>
                </div>
              </div>

              {/* State Probabilities Histogram */}
              {queuingResult.stateProbabilities.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                    State Probability Distribution (Pₙ: Probability of n customers in system)
                  </h3>
                  <div className="flex items-end gap-2 h-40 pt-6 px-2 border-b border-slate-200 dark:border-slate-800">
                    {queuingResult.stateProbabilities.map((sp) => {
                      const heightPercent = Math.min(100, sp.prob * 200);
                      return (
                        <div key={sp.n} className="flex-1 flex flex-col items-center gap-1 group">
                          <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(sp.prob * 100).toFixed(1)}%
                          </span>
                          <div
                            className="w-full bg-indigo-500 hover:bg-indigo-600 rounded-t-sm transition-all"
                            style={{ height: `${heightPercent}%` }}
                          />
                          <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-400">
                            {sp.n}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Inventory & EOQ */}
      {activeTab === 'eoq' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.eoqModel}
                </label>
                <select
                  value={eoqInputs.model}
                  onChange={(e) =>
                    updateEoq({
                      ...eoqInputs,
                      model: e.target.value as EoqModelType,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="classical">{t.queuingEoq.classicalEoq}</option>
                  <option value="backorder">{t.queuingEoq.backorderEoq}</option>
                  <option value="epq">{t.queuingEoq.epq}</option>
                  <option value="discounts">{t.queuingEoq.quantityDiscounts}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.annualDemand} (D)
                </label>
                <input
                  type="number"
                  value={eoqInputs.annualDemand}
                  onChange={(e) =>
                    updateEoq({
                      ...eoqInputs,
                      annualDemand: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.orderCost} (S)
                </label>
                <input
                  type="number"
                  value={eoqInputs.orderCost}
                  onChange={(e) =>
                    updateEoq({
                      ...eoqInputs,
                      orderCost: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.holdingCost} (H)
                </label>
                <input
                  type="number"
                  value={eoqInputs.holdingCost}
                  onChange={(e) =>
                    updateEoq({
                      ...eoqInputs,
                      holdingCost: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.unitCost} (C)
                </label>
                <input
                  type="number"
                  value={eoqInputs.unitCost}
                  onChange={(e) =>
                    updateEoq({
                      ...eoqInputs,
                      unitCost: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>

              {eoqInputs.model === 'backorder' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    {t.queuingEoq.backorderCost} (B)
                  </label>
                  <input
                    type="number"
                    value={eoqInputs.backorderCost ?? 10}
                    onChange={(e) =>
                      updateEoq({
                        ...eoqInputs,
                        backorderCost: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                  />
                </div>
              )}

              {eoqInputs.model === 'epq' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    {t.queuingEoq.productionRate} (P)
                  </label>
                  <input
                    type="number"
                    value={eoqInputs.productionRate ?? 30000}
                    onChange={(e) =>
                      updateEoq({
                        ...eoqInputs,
                        productionRate: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.queuingEoq.leadTime}
                </label>
                <input
                  type="number"
                  value={eoqInputs.leadTimeDays ?? 7}
                  onChange={(e) =>
                    updateEoq({
                      ...eoqInputs,
                      leadTimeDays: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>
            </div>

            <button
              onClick={handleSolveEoq}
              className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Compute Optimal Lot Size (EOQ)</span>
            </button>
          </div>

          {/* EOQ Results Display */}
          {eoqResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.optimalQty} (Q*)</span>
                  <p className="font-mono text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
                    {eoqResult.optimalQty.toFixed(0)}{' '}
                    <span className="text-xs font-normal text-slate-400">units</span>
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.maxInventory}</span>
                  <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {eoqResult.maxInventory.toFixed(0)}
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.ordersPerYear}</span>
                  <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {eoqResult.ordersPerYear.toFixed(2)}
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.cycleTime}</span>
                  <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {eoqResult.cycleTimeDays.toFixed(1)} d
                  </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                  <span className="text-xs text-slate-500">{t.queuingEoq.reorderPoint}</span>
                  <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {eoqResult.reorderPoint?.toFixed(0) ?? 0}
                  </p>
                </div>

                <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl shadow-xs">
                  <span className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">{t.queuingEoq.totalAnnualCost}</span>
                  <p className="font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    ${eoqResult.totalAnnualCost.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                  {t.queuingEoq.costBreakdown}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {eoqResult.costBreakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-xs text-slate-500">{item.name}</span>
                      <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                        ${item.value.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

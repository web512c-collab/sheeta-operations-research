/**
 * Sheeta Operations Research
 * Multi-Scenario Simulation & Explorer Module (Monte Carlo & Parameter Sweep)
 */

import React, { useState } from 'react';
import {
  DistributionType,
  ORModuleType,
  RunStatus,
  ScenarioRun,
  SimulationSummary,
  SimulationType,
  StochasticParam,
} from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { cancelCurrentRun, requestRunSimulation } from '../../workers/workerClient';
import { StatusBanner } from '../common/StatusBanner';
import { Modal } from '../common/Modal';
import { saveProblem } from '../../storage/db';
import {
  SAMPLE_EOQ,
  SAMPLE_PERT_CPM,
  SAMPLE_TRANSPORTATION,
  SAMPLE_TWO_VAR_LP,
} from '../../storage/sampleProblems';
import {
  ArrowLeftRight,
  BookmarkPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';

interface SimulationModuleProps {
  moduleProblems?: Partial<Record<ORModuleType, any>>;
  activeModuleProblem?: any;
  activeModuleType: ORModuleType;
  onSendToModule: (moduleType: ORModuleType, problemData: any) => void;
  enableWorker: boolean;
}

const PARAM_PRESETS: Record<string, StochasticParam[]> = {
  lp: [
    {
      id: 'lp_rhs_0',
      targetModule: 'lp',
      paramKey: 'rhs_0',
      label: 'Assembly Labor Hours (Constraint 1 RHS)',
      distribution: 'normal',
      min: 50,
      max: 150,
      mean: 100,
      stdDev: 15,
      mode: 100,
      sweepStart: 60,
      sweepEnd: 140,
      sweepSteps: 50,
    },
    {
      id: 'lp_rhs_1',
      targetModule: 'lp',
      paramKey: 'rhs_1',
      label: 'Raw Material Processing (Constraint 2 RHS)',
      distribution: 'normal',
      min: 40,
      max: 120,
      mean: 80,
      stdDev: 12,
      mode: 80,
      sweepStart: 50,
      sweepEnd: 110,
      sweepSteps: 50,
    },
    {
      id: 'lp_obj_0',
      targetModule: 'lp',
      paramKey: 'obj_0',
      label: 'Unit Profit - Product A (obj_0)',
      distribution: 'normal',
      min: 20,
      max: 60,
      mean: 40,
      stdDev: 6,
      mode: 40,
      sweepStart: 25,
      sweepEnd: 55,
      sweepSteps: 50,
    },
  ],
  transportation: [
    {
      id: 'trans_demand_0',
      targetModule: 'transportation',
      paramKey: 'demand_0',
      label: 'Market Demand at Giza Hub (D1)',
      distribution: 'normal',
      min: 150,
      max: 300,
      mean: 200,
      stdDev: 25,
      mode: 200,
      sweepStart: 150,
      sweepEnd: 250,
      sweepSteps: 50,
    },
    {
      id: 'trans_demand_1',
      targetModule: 'transportation',
      paramKey: 'demand_1',
      label: 'Market Demand at New Cairo (D2)',
      distribution: 'normal',
      min: 180,
      max: 350,
      mean: 250,
      stdDev: 30,
      mode: 250,
      sweepStart: 180,
      sweepEnd: 320,
      sweepSteps: 50,
    },
    {
      id: 'trans_supply_0',
      targetModule: 'transportation',
      paramKey: 'supply_0',
      label: 'Supply Capacity Plant Alexandria (S1)',
      distribution: 'normal',
      min: 200,
      max: 400,
      mean: 300,
      stdDev: 35,
      mode: 300,
      sweepStart: 200,
      sweepEnd: 400,
      sweepSteps: 50,
    },
  ],
  pert: [
    {
      id: 'pert_act_A',
      targetModule: 'pert',
      paramKey: 'act_A',
      label: 'Duration of Activity A (Concept & Feasibility)',
      distribution: 'uniform',
      min: 2,
      max: 8,
      mean: 4,
      stdDev: 1.5,
      mode: 4,
      sweepStart: 2,
      sweepEnd: 8,
      sweepSteps: 50,
    },
    {
      id: 'pert_act_B',
      targetModule: 'pert',
      paramKey: 'act_B',
      label: 'Duration of Activity B (System Architecture)',
      distribution: 'triangular',
      min: 3,
      max: 10,
      mean: 6,
      stdDev: 1.8,
      mode: 6,
      sweepStart: 3,
      sweepEnd: 9,
      sweepSteps: 50,
    },
  ],
  queuing_eoq: [
    {
      id: 'eoq_demand',
      targetModule: 'queuing_eoq',
      paramKey: 'annualDemand',
      label: 'Annual Inventory Demand (D)',
      distribution: 'normal',
      min: 8000,
      max: 16000,
      mean: 12000,
      stdDev: 1500,
      mode: 12000,
      sweepStart: 8000,
      sweepEnd: 16000,
      sweepSteps: 50,
    },
    {
      id: 'eoq_order_cost',
      targetModule: 'queuing_eoq',
      paramKey: 'orderCost',
      label: 'Order Placement Cost (S)',
      distribution: 'normal',
      min: 80,
      max: 250,
      mean: 150,
      stdDev: 25,
      mode: 150,
      sweepStart: 90,
      sweepEnd: 220,
      sweepSteps: 50,
    },
    {
      id: 'queuing_arrival',
      targetModule: 'queuing_eoq',
      paramKey: 'arrivalRate',
      label: 'Customer Arrival Rate (λ)',
      distribution: 'normal',
      min: 8,
      max: 14,
      mean: 10,
      stdDev: 1.2,
      mode: 10,
      sweepStart: 8,
      sweepEnd: 14,
      sweepSteps: 50,
    },
  ],
};

export const SimulationModule: React.FC<SimulationModuleProps> = ({
  moduleProblems,
  activeModuleProblem,
  activeModuleType,
  onSendToModule,
  enableWorker,
}) => {
  const { t } = useI18n();

  const [simType, setSimType] = useState<SimulationType>('monte_carlo');
  const [targetModule, setTargetModule] = useState<ORModuleType>(
    activeModuleType === 'simulation' ? 'lp' : activeModuleType
  );
  const [numScenarios, setNumScenarios] = useState<number>(50);

  // Stochastic Parameter definition
  const [param, setParam] = useState<StochasticParam>(PARAM_PRESETS.lp[0]);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [summary, setSummary] = useState<SimulationSummary | null>(null);

  // Explorer State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'best' | 'worst' | 'id'>('best');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [selectedScenario, setSelectedScenario] = useState<ScenarioRun | null>(null);

  const handleTargetModuleChange = (newMod: ORModuleType) => {
    setTargetModule(newMod);
    const presets = PARAM_PRESETS[newMod];
    if (presets && presets.length > 0) {
      setParam({ ...presets[0] });
    }
  };

  const handleRun = async () => {
    setStatus('running');
    setStatusMessage(t.status.running);
    setProgress(0);

    let baseProblem = moduleProblems?.[targetModule];
    if (!baseProblem) {
      if (targetModule === 'lp') {
        baseProblem =
          activeModuleProblem && 'variables' in activeModuleProblem
            ? activeModuleProblem
            : SAMPLE_TWO_VAR_LP;
      } else if (targetModule === 'transportation') {
        baseProblem =
          activeModuleProblem && 'sources' in activeModuleProblem
            ? activeModuleProblem
            : SAMPLE_TRANSPORTATION;
      } else if (targetModule === 'pert') {
        baseProblem =
          Array.isArray(activeModuleProblem) && activeModuleProblem.length > 0
            ? activeModuleProblem
            : SAMPLE_PERT_CPM;
      } else {
        baseProblem =
          activeModuleProblem &&
          ('annualDemand' in activeModuleProblem || 'arrivalRate' in activeModuleProblem)
            ? activeModuleProblem
            : SAMPLE_EOQ;
      }
    }

    try {
      const summaryResult = await requestRunSimulation(
        {
          type: simType,
          numScenarios,
          param: { ...param, targetModule },
          baseProblem,
        },
        enableWorker,
        (completed, total) => {
          setProgress(Math.round((completed / total) * 100));
        }
      );

      setSummary(summaryResult);
      setStatus('completed');
      setStatusMessage(`Completed ${summaryResult.totalScenarios} scenarios.`);
      setCurrentPage(1);
    } catch (err: any) {
      setStatus('error');
      setStatusMessage(err?.message || 'Error executing scenarios');
    }
  };

  const handleCancel = () => {
    cancelCurrentRun();
    setStatus('cancelled');
    setStatusMessage(t.status.cancelled);
  };

  // Filter & Sort scenarios
  const filteredScenarios = React.useMemo(() => {
    if (!summary) return [];
    let list = summary.scenarios.filter((s) => {
      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.id.toString().includes(q) ||
        Object.values(s.paramValues).some((v) => v.toString().includes(q))
      );
    });

    if (sortOrder === 'best') {
      list.sort((a, b) => b.objectiveValue - a.objectiveValue);
    } else if (sortOrder === 'worst') {
      list.sort((a, b) => a.objectiveValue - b.objectiveValue);
    } else {
      list.sort((a, b) => a.id - b.id);
    }

    return list;
  }, [summary, searchQuery, sortOrder]);

  const totalPages = Math.ceil(filteredScenarios.length / pageSize) || 1;
  const paginatedScenarios = filteredScenarios.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSaveScenarioAsProblem = async (scenario: ScenarioRun) => {
    const id = `scenario_${Date.now()}`;
    await saveProblem({
      id,
      title: `${scenario.title}`,
      module: targetModule,
      description: `Generated from Scenario #${scenario.id} with ${JSON.stringify(scenario.paramValues)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: scenario.problemSnapshot,
    });
    showToast(t.workspace.saveSuccess);
  };

  return (
    <div className="space-y-6">
      {/* Inline Toast Banner */}
      {toastMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>{t.simulation.title}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.simulation.description}</p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              onClick={() => setSimType('monte_carlo')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                simType === 'monte_carlo'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.simulation.monteCarlo}
            </button>
            <button
              onClick={() => setSimType('parameter_sweep')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                simType === 'parameter_sweep'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.simulation.parameterSweep}
            </button>
          </div>
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t.simulation.targetModule}
            </label>
            <select
              value={targetModule}
              onChange={(e) => handleTargetModuleChange(e.target.value as ORModuleType)}
              className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="lp">{t.modules.lp}</option>
              <option value="transportation">{t.modules.transportation}</option>
              <option value="pert">{t.modules.pert}</option>
              <option value="queuing_eoq">{t.modules.queuingEoq}</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t.simulation.numScenarios}
            </label>
            <select
              value={numScenarios}
              onChange={(e) => setNumScenarios(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="20">20 Scenarios (Fast Preview)</option>
              <option value="50">50 Scenarios (Standard Batch)</option>
              <option value="100">100 Scenarios (Robust Sample)</option>
              <option value="250">250 Scenarios (Industrial Large)</option>
              <option value="500">500 Scenarios (Extensive Monte Carlo)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t.simulation.distribution}
            </label>
            <select
              value={param.distribution}
              disabled={simType === 'parameter_sweep'}
              onChange={(e) =>
                setParam({ ...param, distribution: e.target.value as DistributionType })
              }
              className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50"
            >
              <option value="normal">{t.simulation.normal}</option>
              <option value="uniform">{t.simulation.uniform}</option>
              <option value="triangular">{t.simulation.triangular}</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                {t.simulation.varyParameter}
              </label>
              {PARAM_PRESETS[targetModule] && (
                <select
                  value={param.paramKey}
                  onChange={(e) => {
                    const found = PARAM_PRESETS[targetModule]?.find(
                      (p) => p.paramKey === e.target.value
                    );
                    if (found) setParam({ ...found });
                  }}
                  className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold bg-transparent border-0 cursor-pointer p-0 max-w-[120px] truncate"
                >
                  {PARAM_PRESETS[targetModule].map((p) => (
                    <option key={p.paramKey} value={p.paramKey}>
                      {p.label.split('(')[0].trim()}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <input
              type="text"
              value={param.label}
              onChange={(e) => setParam({ ...param, label: e.target.value })}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
            />
          </div>
        </div>

        {/* Range and Distribution Params */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Min Value</label>
            <input
              type="number"
              value={param.min}
              onChange={(e) => setParam({ ...param, min: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Max Value</label>
            <input
              type="number"
              value={param.max}
              onChange={(e) => setParam({ ...param, max: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
            />
          </div>
          {simType === 'monte_carlo' && (
            <>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Mean (μ)</label>
                <input
                  type="number"
                  value={param.mean}
                  onChange={(e) => setParam({ ...param, mean: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Std. Dev. (σ)</label>
                <input
                  type="number"
                  value={param.stdDev}
                  onChange={(e) => setParam({ ...param, stdDev: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tabular-nums"
                />
              </div>
            </>
          )}
        </div>

        <div className="pt-6">
          <button
            onClick={handleRun}
            disabled={status === 'running'}
            className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{status === 'running' ? 'Simulating Batch...' : t.actions.runSimulation}</span>
          </button>
        </div>
      </div>

      <StatusBanner
        status={status}
        customMessage={statusMessage}
        onCancel={handleCancel}
        progressPercent={progress}
      />

      {/* Simulation Results & Distribution */}
      {summary && (
        <div className="space-y-6">
          {/* Statistical Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.simulation.bestScenario}</span>
              <p className="font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                {summary.bestValue.toFixed(2)}
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.simulation.worstScenario}</span>
              <p className="font-mono text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                {summary.worstValue.toFixed(2)}
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.simulation.meanScenario}</span>
              <p className="font-mono text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
                {summary.meanValue.toFixed(2)}
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.simulation.median}</span>
              <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {summary.medianValue.toFixed(2)}
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <span className="text-xs text-slate-500">{t.simulation.stdDev}</span>
              <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {summary.stdDevValue.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Histogram Chart */}
          {summary.distributionBins.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                Frequency Distribution of Scenario Outcomes
              </h3>
              <div className="flex items-end gap-2 h-44 pt-6 px-2 border-b border-slate-200 dark:border-slate-800">
                {summary.distributionBins.map((bin, idx) => {
                  const maxCount = Math.max(...summary.distributionBins.map((b) => b.count), 1);
                  const heightPercent = (bin.count / maxCount) * 100;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {bin.count}
                      </span>
                      <div
                        className="w-full bg-indigo-500 hover:bg-indigo-600 rounded-t-sm transition-all"
                        style={{ height: `${Math.max(4, heightPercent)}%` }}
                      />
                      <span className="text-[9px] font-mono text-slate-400 truncate max-w-[36px]">
                        {bin.binStart.toFixed(0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scenario Explorer Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t.simulation.explorerTitle} ({filteredScenarios.length})
              </h3>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder={t.simulation.searchPlaceholder}
                    className="ps-8 pe-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg w-48 font-medium"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="best">{t.simulation.sortBest}</option>
                    <option value="worst">{t.simulation.sortWorst}</option>
                    <option value="id">Scenario # Order</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold font-mono">
                  <tr>
                    <th className="px-3 py-2 text-start font-sans">{t.simulation.scenarioId}</th>
                    <th className="px-3 py-2 text-start font-sans">{t.simulation.parameters}</th>
                    <th className="px-3 py-2 text-end">{t.simulation.objective}</th>
                    <th className="px-3 py-2 text-center font-sans">{t.simulation.feasibility}</th>
                    <th className="px-3 py-2 text-end font-sans">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {paginatedScenarios.map((sc) => (
                    <tr
                      key={sc.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => setSelectedScenario(sc)}
                    >
                      <td className="px-3 py-2 font-bold text-indigo-600 dark:text-indigo-400">
                        #{sc.id}
                      </td>
                      <td className="px-3 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                        {Object.entries(sc.paramValues)
                          .map(([, v]) => `${param.label}: ${v}`)
                          .join(', ')}
                      </td>
                      <td className="px-3 py-2 text-end font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {sc.objectiveValue.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {sc.isFeasible ? (
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded text-[10px] font-bold">
                            Feasible
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">
                            Infeasible
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedScenario(sc);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 bg-slate-100 dark:bg-slate-800 rounded-md"
                        >
                          {t.simulation.viewDetails}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-md disabled:opacity-30 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-md disabled:opacity-30 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Details Modal */}
      {selectedScenario && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedScenario(null)}
          title={`Scenario #${selectedScenario.id} Details`}
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">Objective Outcome</span>
              <p className="font-mono text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {selectedScenario.objectiveValue.toFixed(4)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{selectedScenario.summary}</p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Sampled Parameter Values
              </h4>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs">
                {Object.entries(selectedScenario.paramValues).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-0.5">
                    <span className="text-slate-500">{k}:</span>
                    <strong className="text-slate-900 dark:text-slate-100">{v}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  onSendToModule(targetModule, selectedScenario.problemSnapshot);
                  setSelectedScenario(null);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>{t.actions.sendToModule}</span>
              </button>

              <button
                onClick={() => handleSaveScenarioAsProblem(selectedScenario)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>Save Scenario to Workspace</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

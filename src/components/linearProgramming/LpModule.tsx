/**
 * Sheeta Operations Research
 * Linear & Integer Programming Main Module
 */

import React, { useState } from 'react';
import {
  BranchAndBoundResult,
  ConstraintDef,
  ConstraintOp,
  LpProblem,
  PresolveResult,
  RunStatus,
  SimplexSolution,
  VariableDef,
  VariableType,
} from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { GraphicalView } from './GraphicalView';
import { LpResultsView } from './LpResultsView';
import { StatusBanner } from '../common/StatusBanner';
import {
  cancelCurrentRun,
  requestSolveBb,
  requestSolveLp,
} from '../../workers/workerClient';
import {
  INDUSTRIAL_BENCHMARK_LP,
  SAMPLE_TWO_VAR_LP,
} from '../../storage/sampleProblems';
import {
  BarChart2,
  Eye,
  EyeOff,
  Flame,
  Plus,
  Play,
  Trash2,
} from 'lucide-react';

interface LpModuleProps {
  initialProblem?: LpProblem;
  syncVersion?: number;
  onUpdateActiveProblem?: (problem: LpProblem, results?: any) => void;
  enablePresolve: boolean;
  enableWorker: boolean;
  branchingStrategy: 'most_fractional' | 'first_fractional';
}

export const LpModule: React.FC<LpModuleProps> = ({
  initialProblem,
  syncVersion,
  onUpdateActiveProblem,
  enablePresolve,
  enableWorker,
  branchingStrategy,
}) => {
  const { t } = useI18n();

  const [problem, setProblem] = useState<LpProblem>(
    initialProblem || SAMPLE_TWO_VAR_LP
  );
  const [showGraphical, setShowGraphical] = useState(false);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [simplexSolution, setSimplexSolution] = useState<SimplexSolution | null>(null);
  const [bbResult, setBbResult] = useState<BranchAndBoundResult | null>(null);
  const [presolveResult, setPresolveResult] = useState<PresolveResult | null>(null);
  const lastSyncRef = React.useRef<{ problem?: LpProblem; version?: number }>({
    problem: initialProblem,
    version: syncVersion,
  });

  // Sync with active problem only when loaded/replaced externally
  React.useEffect(() => {
    if (!initialProblem) return;
    if (syncVersion !== undefined) {
      if (lastSyncRef.current.version === syncVersion) return;
    } else if (lastSyncRef.current.problem === initialProblem) {
      return;
    }
    lastSyncRef.current = { problem: initialProblem, version: syncVersion };
    setProblem(initialProblem);
    setSimplexSolution(null);
    setBbResult(null);
    setPresolveResult(null);
    setStatus('idle');
  }, [initialProblem, syncVersion]);

  // Handle Sense change
  const handleSenseChange = (sense: 'maximize' | 'minimize') => {
    const updated = { ...problem, sense };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  // Handle IP toggle
  const handleIpToggle = (isIntegerProgram: boolean) => {
    const updated = { ...problem, isIntegerProgram };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  // Variable management
  const addVariable = () => {
    const nextIdx = problem.variables.length + 1;
    const newVar: VariableDef = {
      id: `x${nextIdx}`,
      name: `x${nextIdx}`,
      type: 'continuous',
      objCoeff: 0,
      lowerBound: 0,
      upperBound: Infinity,
    };
    const updatedVars = [...problem.variables, newVar];

    // Add 0 coefficient for this new variable to all existing constraints
    const updatedConstraints = problem.constraints.map((c) => ({
      ...c,
      coeffs: [...c.coeffs, 0],
    }));

    const updated = {
      ...problem,
      variables: updatedVars,
      constraints: updatedConstraints,
    };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const removeVariable = (idx: number) => {
    if (problem.variables.length <= 1) return;
    const updatedVars = problem.variables.filter((_, i) => i !== idx);
    const updatedConstraints = problem.constraints.map((c) => ({
      ...c,
      coeffs: c.coeffs.filter((_, i) => i !== idx),
    }));

    const updated = {
      ...problem,
      variables: updatedVars,
      constraints: updatedConstraints,
    };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const updateVariable = (idx: number, patch: Partial<VariableDef>) => {
    const updatedVars = [...problem.variables];
    const prev = updatedVars[idx];
    const updatedVar = { ...prev, ...patch };

    // If type set to binary, auto-set LB=0, UB=1
    if (patch.type === 'binary') {
      updatedVar.lowerBound = 0;
      updatedVar.upperBound = 1;
    }

    updatedVars[idx] = updatedVar;
    const updated = { ...problem, variables: updatedVars };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  // Constraint management
  const addConstraint = () => {
    const nextIdx = problem.constraints.length + 1;
    const newConstraint: ConstraintDef = {
      id: `c${nextIdx}`,
      name: `Constraint ${nextIdx}`,
      coeffs: new Array(problem.variables.length).fill(0),
      op: '<=',
      rhs: 0,
    };
    const updated = {
      ...problem,
      constraints: [...problem.constraints, newConstraint],
    };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const removeConstraint = (idx: number) => {
    const updated = {
      ...problem,
      constraints: problem.constraints.filter((_, i) => i !== idx),
    };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const updateConstraint = (idx: number, patch: Partial<ConstraintDef>) => {
    const updatedConstraints = [...problem.constraints];
    updatedConstraints[idx] = { ...updatedConstraints[idx], ...patch };
    const updated = { ...problem, constraints: updatedConstraints };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  const updateConstraintCoeff = (cIdx: number, vIdx: number, val: number) => {
    const updatedConstraints = [...problem.constraints];
    const newCoeffs = [...updatedConstraints[cIdx].coeffs];
    newCoeffs[vIdx] = val;
    updatedConstraints[cIdx] = { ...updatedConstraints[cIdx], coeffs: newCoeffs };
    const updated = { ...problem, constraints: updatedConstraints };
    setProblem(updated);
    if (onUpdateActiveProblem) onUpdateActiveProblem(updated);
  };

  // Solve Action
  const handleSolve = async () => {
    setStatus('running');
    setStatusMessage(t.status.running);

    try {
      if (problem.isIntegerProgram) {
        const res = await requestSolveBb(
          problem,
          enablePresolve,
          { branchingStrategy, timeoutMs: 30000, maxNodes: 2000 },
          enableWorker
        );

        setBbResult(res.bb);
        setSimplexSolution(res.bb.lpRelaxation);
        setPresolveResult(res.presolve);

        if (res.bb.status === 'optimal') {
          setStatus('completed');
          setStatusMessage(t.status.optimal);
        } else if (res.bb.status === 'cancelled') {
          setStatus('cancelled');
          setStatusMessage(t.status.cancelled);
        } else if (res.bb.status === 'feasible_timeout') {
          setStatus('warning');
          setStatusMessage(res.bb.warning || t.status.warning);
        } else {
          setStatus('error');
          setStatusMessage(res.bb.warning || t.status.infeasible);
        }

        if (onUpdateActiveProblem) {
          onUpdateActiveProblem(problem, { bb: res.bb, presolve: res.presolve });
        }
      } else {
        const res = await requestSolveLp(problem, enablePresolve, enableWorker);

        setSimplexSolution(res.simplex);
        setBbResult(null);
        setPresolveResult(res.presolve);

        if (res.simplex.status === 'optimal') {
          setStatus('completed');
          setStatusMessage(t.status.optimal);
        } else if (res.simplex.status === 'unbounded') {
          setStatus('error');
          setStatusMessage(t.status.unbounded);
        } else if (res.simplex.status === 'iteration_limit') {
          setStatus('warning');
          setStatusMessage(t.status.iterationLimit);
        } else {
          setStatus('error');
          setStatusMessage(res.simplex.errorMessage || t.status.infeasible);
        }

        if (onUpdateActiveProblem) {
          onUpdateActiveProblem(problem, { simplex: res.simplex, presolve: res.presolve });
        }
      }
    } catch (err: any) {
      setStatus('error');
      setStatusMessage(err?.message || 'Error occurred during optimization');
    }
  };

  const handleCancel = () => {
    cancelCurrentRun();
    setStatus('cancelled');
    setStatusMessage(t.status.cancelled);
  };

  const handleLoadTwoVarDemo = () => {
    setProblem(SAMPLE_TWO_VAR_LP);
    setShowGraphical(true);
    setSimplexSolution(null);
    setBbResult(null);
    setPresolveResult(null);
    setStatus('idle');
    if (onUpdateActiveProblem) onUpdateActiveProblem(SAMPLE_TWO_VAR_LP);
  };

  const handleLoadBenchmark = () => {
    setProblem(INDUSTRIAL_BENCHMARK_LP);
    setShowGraphical(false);
    setSimplexSolution(null);
    setBbResult(null);
    setPresolveResult(null);
    setStatus('idle');
    if (onUpdateActiveProblem) onUpdateActiveProblem(INDUSTRIAL_BENCHMARK_LP);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t.modules.lp}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Two-Phase Simplex & Branch and Bound with Bland’s Rule and Multi-Pass Presolve.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Load Sample Demos */}
          <button
            onClick={handleLoadTwoVarDemo}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <BarChart2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>2D Graphical Demo</span>
          </button>

          <button
            onClick={handleLoadBenchmark}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Benchmark Problem</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <StatusBanner
        status={status}
        customMessage={statusMessage}
        onCancel={handleCancel}
      />

      {/* Main Formulation Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
        {/* Objective Sense & IP Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-center pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t.lp.objectiveSense}
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => handleSenseChange('maximize')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  problem.sense === 'maximize'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {t.lp.maximize}
              </button>
              <button
                type="button"
                onClick={() => handleSenseChange('minimize')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  problem.sense === 'minimize'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {t.lp.minimize}
              </button>
            </div>
          </div>

          {/* Integer / Binary Programming Toggle */}
          <div className="sm:col-span-1 lg:col-span-2 flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={problem.isIntegerProgram}
                onChange={(e) => handleIpToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
            </label>
            <div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {t.lp.isIntegerProgram}
              </span>
              <p className="text-xs text-slate-500">
                Solves via Branch and Bound with LP Relaxation side-by-side comparison.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Decision Variables */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>{t.lp.variablesHeader}</span>
              <span className="text-xs font-normal text-slate-500">
                ({problem.variables.length})
              </span>
            </h3>
            <button
              onClick={addVariable}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.actions.addVariable}</span>
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="px-3 py-2 text-start">{t.lp.varName}</th>
                  <th className="px-3 py-2 text-start">{t.lp.varType}</th>
                  <th className="px-3 py-2 text-start">{t.lp.objCoeff}</th>
                  <th className="px-3 py-2 text-start">{t.lp.lowerBound}</th>
                  <th className="px-3 py-2 text-start">{t.lp.upperBound}</th>
                  <th className="px-3 py-2 text-end">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {problem.variables.map((v, idx) => (
                  <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => updateVariable(idx, { name: e.target.value })}
                        className="w-28 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-medium"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={v.type}
                        onChange={(e) => updateVariable(idx, { type: e.target.value as VariableType })}
                        className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                      >
                        <option value="continuous">{t.lp.continuous}</option>
                        <option value="integer">{t.lp.integer}</option>
                        <option value="binary">{t.lp.binary}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        value={v.objCoeff}
                        onChange={(e) => updateVariable(idx, { objCoeff: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono tabular-nums text-end"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        disabled={v.type === 'binary'}
                        value={v.lowerBound}
                        onChange={(e) => updateVariable(idx, { lowerBound: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono tabular-nums text-end disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        disabled={v.type === 'binary'}
                        value={v.upperBound === Infinity ? '' : v.upperBound}
                        placeholder="∞"
                        onChange={(e) =>
                          updateVariable(idx, {
                            upperBound: e.target.value === '' ? Infinity : parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono tabular-nums text-end disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2 text-end">
                      <button
                        onClick={() => removeVariable(idx)}
                        disabled={problem.variables.length <= 1}
                        title="Delete variable"
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Constraints */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>{t.lp.constraintsHeader}</span>
              <span className="text-xs font-normal text-slate-500">
                ({problem.constraints.length})
              </span>
            </h3>
            <button
              onClick={addConstraint}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.actions.addConstraint}</span>
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="px-3 py-2 text-start">{t.lp.constraintName}</th>
                  {problem.variables.map((v) => (
                    <th key={v.id} className="px-3 py-2 text-end font-mono">
                      {v.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center">{t.lp.relation}</th>
                  <th className="px-3 py-2 text-end">{t.lp.rhs}</th>
                  <th className="px-3 py-2 text-end">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {problem.constraints.map((c, cIdx) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => updateConstraint(cIdx, { name: e.target.value })}
                        className="w-32 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-medium"
                      />
                    </td>
                    {problem.variables.map((v, vIdx) => (
                      <td key={v.id} className="px-3 py-2 text-end">
                        <input
                          type="number"
                          step="any"
                          value={c.coeffs[vIdx] ?? 0}
                          onChange={(e) =>
                            updateConstraintCoeff(cIdx, vIdx, parseFloat(e.target.value) || 0)
                          }
                          className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono tabular-nums text-end"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <select
                        value={c.op}
                        onChange={(e) => updateConstraint(cIdx, { op: e.target.value as ConstraintOp })}
                        className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                      >
                        <option value="<=">&le;</option>
                        <option value=">=">&ge;</option>
                        <option value="=">=</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-end">
                      <input
                        type="number"
                        step="any"
                        value={c.rhs}
                        onChange={(e) => updateConstraint(cIdx, { rhs: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono tabular-nums text-end"
                      />
                    </td>
                    <td className="px-3 py-2 text-end">
                      <button
                        onClick={() => removeConstraint(cIdx)}
                        title="Delete constraint"
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSolve}
              disabled={status === 'running'}
              className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{status === 'running' ? t.actions.solving : t.actions.solve}</span>
            </button>

            {problem.variables.length === 2 && (
              <button
                onClick={() => setShowGraphical(!showGraphical)}
                className={`px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all flex items-center gap-2 ${
                  showGraphical
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                {showGraphical ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{showGraphical ? t.actions.hideGraph : t.actions.viewGraph}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2D Graphical View */}
      {showGraphical && problem.variables.length === 2 && (
        <GraphicalView
          problem={problem}
          optimalPoint={
            simplexSolution?.status === 'optimal'
              ? simplexSolution.variableValues.slice(0, 2)
              : undefined
          }
          optimalValue={simplexSolution?.status === 'optimal' ? simplexSolution.objectiveValue : undefined}
        />
      )}

      {/* Results View */}
      <LpResultsView
        problem={problem}
        simplexSolution={simplexSolution}
        bbResult={bbResult}
        presolveResult={presolveResult}
      />
    </div>
  );
};

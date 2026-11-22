/**
 * Sheeta Operations Research
 * Linear & Integer Programming Solution Results View
 */

import React, { useState } from 'react';
import {
  BranchAndBoundResult,
  LpProblem,
  PresolveResult,
  SimplexSolution,
} from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { ChevronDown, ChevronUp, GitBranch, ShieldCheck } from 'lucide-react';

interface LpResultsViewProps {
  problem: LpProblem;
  simplexSolution?: SimplexSolution | null;
  bbResult?: BranchAndBoundResult | null;
  presolveResult?: PresolveResult | null;
}

export const LpResultsView: React.FC<LpResultsViewProps> = ({
  problem,
  simplexSolution,
  bbResult,
  presolveResult,
}) => {
  const { t } = useI18n();
  const [showPresolveReport, setShowPresolveReport] = useState(false);

  const isIntegerProgram = problem.isIntegerProgram;
  const activeSolution = isIntegerProgram && bbResult ? bbResult.bestIntegerSolution : simplexSolution?.variableValues;
  const activeObjective = isIntegerProgram && bbResult ? bbResult.bestObjectiveValue : simplexSolution?.objectiveValue;

  if (!simplexSolution && !bbResult) return null;

  return (
    <div className="space-y-6 mt-6">
      {/* Primary Optimal Objective & Variable Summary Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {isIntegerProgram ? t.lp.integerSolution : t.status.optimal}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{t.lp.twoPhaseExplanation}</p>
          </div>
          <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-xl">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t.lp.optimalValue}:</span>
            <span className="font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {activeObjective !== undefined ? activeObjective.toFixed(4) : 'N/A'}
            </span>
          </div>
        </div>

        {/* Decision Variables Values Table */}
        <div className="mt-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            {t.lp.variableValues}
          </h4>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.lp.varName}</th>
                  <th className="px-4 py-2.5 text-start">{t.lp.varType}</th>
                  <th className="px-4 py-2.5 text-end">{t.lp.objCoeff}</th>
                  <th className="px-4 py-2.5 text-end font-bold text-indigo-600 dark:text-indigo-400">
                    Optimal Value (x*)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {problem.variables.map((v, idx) => {
                  const val = activeSolution?.[idx] ?? 0;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                        {v.name}
                      </td>
                      <td className="px-4 py-2 font-sans capitalize text-slate-500 text-[11px]">
                        {v.type}
                      </td>
                      <td className="px-4 py-2 text-end text-slate-600 dark:text-slate-400 tabular-nums">
                        {v.objCoeff}
                      </td>
                      <td className="px-4 py-2 text-end font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-sm">
                        {val.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Side-by-Side Comparison: LP Relaxation vs. Integer Programming (Branch and Bound) */}
      {isIntegerProgram && bbResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t.lp.bAndBStats}
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{t.lp.lpRelaxation}</span>
              <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {bbResult.lpRelaxation.objectiveValue.toFixed(4)}
              </p>
            </div>

            <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{t.lp.integerSolution}</span>
              <p className="font-mono text-lg font-bold text-indigo-700 dark:text-indigo-300 mt-1 tabular-nums">
                {bbResult.bestObjectiveValue !== undefined ? bbResult.bestObjectiveValue.toFixed(4) : 'N/A'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{t.lp.integralityGap}</span>
              <p className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {bbResult.stats.integralityGapPercent.toFixed(2)}%
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{t.lp.executionTime}</span>
              <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {bbResult.stats.executionTimeMs.toFixed(1)} ms
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-slate-500">{t.lp.exploredNodes}:</span>{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">{bbResult.stats.exploredNodes}</strong>
            </div>
            <div>
              <span className="text-slate-500">{t.lp.prunedByBound}:</span>{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">{bbResult.stats.prunedByBound}</strong>
            </div>
            <div>
              <span className="text-slate-500">{t.lp.prunedInfeasible}:</span>{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">{bbResult.stats.prunedInfeasible}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Pass Presolve Report Panel */}
      {presolveResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t.presolve.title}
              </h3>
            </div>
            <button
              onClick={() => setShowPresolveReport(!showPresolveReport)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1"
            >
              <span>{showPresolveReport ? 'Hide Log' : t.actions.viewReport}</span>
              {showPresolveReport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block mb-1">{t.presolve.varsBeforeAfter}</span>
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {presolveResult.stats.originalVars} → {presolveResult.stats.reducedVars}
              </strong>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block mb-1">{t.presolve.constraintsBeforeAfter}</span>
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {presolveResult.stats.originalConstraints} → {presolveResult.stats.reducedConstraints}
              </strong>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block mb-1">{t.presolve.fixedVars}</span>
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {presolveResult.stats.fixedVariablesCount}
              </strong>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block mb-1">{t.presolve.tightenedBounds}</span>
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {presolveResult.stats.tightenedBoundsCount}
              </strong>
            </div>
          </div>

          {showPresolveReport && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-1.5 text-slate-700 dark:text-slate-300">
              {presolveResult.report.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-slate-400 select-none">›</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

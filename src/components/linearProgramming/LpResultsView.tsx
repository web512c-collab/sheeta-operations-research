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
import { AlertTriangle, ChevronDown, ChevronUp, GitBranch, ShieldCheck, Sliders } from 'lucide-react';

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

  if (!simplexSolution && !bbResult) return null;

  const isIntegerProgram = problem.isIntegerProgram;
  const activeSolution = isIntegerProgram && bbResult ? bbResult.bestIntegerSolution : simplexSolution?.variableValues;
  const activeObjective = isIntegerProgram && bbResult ? bbResult.bestObjectiveValue : simplexSolution?.objectiveValue;

  const isBbOptimal = Boolean(isIntegerProgram && bbResult && bbResult.status === 'optimal');
  const isBbIncomplete = Boolean(
    isIntegerProgram &&
      bbResult &&
      (bbResult.status === 'depth_limit_reached' ||
        bbResult.status === 'node_limit_reached' ||
        bbResult.status === 'time_limit_reached' ||
        bbResult.status === 'feasible_not_proven' ||
        bbResult.status === 'cancelled')
  );
  const isBbError = Boolean(
    isIntegerProgram &&
      bbResult &&
      (bbResult.status === 'infeasible' || bbResult.status === 'unbounded')
  );

  const isLpOptimal = Boolean(!isIntegerProgram && simplexSolution && simplexSolution.status === 'optimal');
  const isLpIncomplete = Boolean(
    !isIntegerProgram &&
      simplexSolution &&
      (simplexSolution.status === 'iteration_limit' || simplexSolution.status === 'cancelled')
  );
  const isLpError = Boolean(
    !isIntegerProgram &&
      simplexSolution &&
      (simplexSolution.status === 'infeasible' || simplexSolution.status === 'unbounded')
  );

  const isProvenOptimal = isIntegerProgram ? isBbOptimal : isLpOptimal;
  const isIncomplete = isIntegerProgram ? isBbIncomplete : isLpIncomplete;
  const isError = isIntegerProgram ? isBbError : isLpError;

  const getHeaderTitle = () => {
    if (isIntegerProgram && bbResult) {
      if (bbResult.status === 'optimal') return t.lp.integerSolution;
      if (bbResult.status === 'depth_limit_reached') return t.status.depthLimitReached;
      if (bbResult.status === 'node_limit_reached') return t.status.nodeLimitReached;
      if (bbResult.status === 'time_limit_reached') return t.status.timeLimitReached;
      if (bbResult.status === 'cancelled') return t.status.cancelled;
      if (bbResult.status === 'feasible_not_proven') return t.status.feasibleNotProven;
      if (bbResult.status === 'unbounded') return t.status.unbounded;
      return t.status.infeasible;
    }
    if (simplexSolution) {
      if (simplexSolution.status === 'optimal') return t.status.optimal;
      if (simplexSolution.status === 'iteration_limit') return t.status.iterationLimit;
      if (simplexSolution.status === 'cancelled') return t.status.cancelled;
      if (simplexSolution.status === 'unbounded') return t.status.unbounded;
      return t.status.infeasible;
    }
    return t.status.optimal;
  };

  const matrixMode = bbResult?.matrixModeUsed ?? simplexSolution?.matrixModeUsed;
  const constraintDetails = isIntegerProgram
    ? bbResult?.lpRelaxation?.constraintDetails
    : simplexSolution?.constraintDetails;

  return (
    <div className="space-y-6 mt-6">
      {/* Primary Objective & Variable Summary Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3
              className={`text-base font-bold ${
                isProvenOptimal
                  ? 'text-slate-900 dark:text-slate-100'
                  : isIncomplete
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {getHeaderTitle()}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{t.lp.twoPhaseExplanation}</p>
            {matrixMode && (
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                {t.lp.matrixModeUsed}:{' '}
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {matrixMode === 'sparse' ? t.lp.sparseMode : t.lp.denseMode}
                </span>
              </p>
            )}
          </div>
          <div
            className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${
              isProvenOptimal
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                : isIncomplete
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
            }`}
          >
            <span
              className={`text-xs font-semibold ${
                isProvenOptimal
                  ? 'text-emerald-800 dark:text-emerald-300'
                  : isIncomplete
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-rose-800 dark:text-rose-300'
              }`}
            >
              {isProvenOptimal ? t.lp.optimalValue : t.lp.bestFoundValue}:
            </span>
            <span
              className={`font-mono text-xl font-extrabold tabular-nums ${
                isProvenOptimal
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isIncomplete
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {!isError && activeObjective !== undefined ? activeObjective.toFixed(4) : 'N/A'}
            </span>
          </div>
        </div>

        {/* Honest Non-Optimal Warning Banner */}
        {isIncomplete && (
          <div
            role="alert"
            className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                {activeSolution ? t.lp.incumbentSolution : t.lp.noIncumbentFound}
              </p>
              <p>{t.lp.notProvenWarning}</p>
              {isIntegerProgram && bbResult && bbResult.bestBound !== undefined && (
                <p className="font-mono pt-1">
                  {t.lp.bestBound}: <strong>{bbResult.bestBound.toFixed(4)}</strong> •{' '}
                  {t.lp.integralityGap}:{' '}
                  <strong>
                    {bbResult.bestObjectiveValue !== undefined &&
                    Number.isFinite(bbResult.stats.integralityGapPercent)
                      ? `${bbResult.stats.integralityGapPercent.toFixed(2)}%`
                      : 'N/A'}
                  </strong>{' '}
                  • {t.lp.openNodesRemaining}: <strong>{bbResult.stats.openNodesRemaining ?? 0}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Decision Variables Values Table */}
        {!isError && activeSolution && (
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
                      {isProvenOptimal ? t.lp.optimalCol : t.lp.incumbentCol}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {problem.variables.map((v, idx) => {
                    const val = activeSolution[idx] ?? 0;
                    const typeLabel =
                      v.type === 'binary'
                        ? t.lp.binary
                        : v.type === 'integer'
                        ? t.lp.integer
                        : t.lp.continuous;
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                          {v.name}
                        </td>
                        <td className="px-4 py-2 font-sans text-slate-500 text-[11px]">
                          {typeLabel}
                        </td>
                        <td className="px-4 py-2 text-end text-slate-600 dark:text-slate-400 tabular-nums">
                          {v.objCoeff}
                        </td>
                        <td
                          className={`px-4 py-2 text-end font-bold tabular-nums text-sm ${
                            isProvenOptimal
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {val.toFixed(4)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Constraint Slacks & Shadow Prices (Dual Variables) */}
      {constraintDetails && constraintDetails.length > 0 && !isError && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t.lp.constraintSensitivity}
              {isIntegerProgram ? ` (${t.lp.lpRelaxation})` : ''}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">{t.lp.constraintSensitivityNote}</p>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.lp.constraintName}</th>
                  <th className="px-4 py-2.5 text-end">{t.lp.lhsCol}</th>
                  <th className="px-4 py-2.5 text-center">{t.lp.relation}</th>
                  <th className="px-4 py-2.5 text-end">{t.lp.rhsCol}</th>
                  <th className="px-4 py-2.5 text-center">{t.lp.kindCol}</th>
                  <th className="px-4 py-2.5 text-end">{t.lp.slackSurplusCol}</th>
                  <th className="px-4 py-2.5 text-end font-bold text-indigo-600 dark:text-indigo-400">
                    {t.lp.shadowPriceCol}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {constraintDetails.map((d) => {
                  const kindLabel =
                    d.kind === 'slack'
                      ? t.lp.slackKind
                      : d.kind === 'surplus'
                      ? t.lp.surplusKind
                      : t.lp.equalityKind;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                        {d.name}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-700 dark:text-slate-300">
                        {d.lhs.toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-500">{d.op}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-700 dark:text-slate-300">
                        {d.rhs.toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-center font-sans text-[11px] text-slate-500">
                        {kindLabel}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-700 dark:text-slate-300">
                        {d.slackOrSurplus.toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                        {d.dualValue.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison: LP Relaxation vs. Integer Programming (Branch and Bound) */}
      {isIntegerProgram && bbResult && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t.lp.bAndBStats}
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{t.lp.lpRelaxation}</span>
              <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {bbResult.lpRelaxation.status === 'optimal'
                  ? bbResult.lpRelaxation.objectiveValue.toFixed(4)
                  : 'N/A'}
              </p>
            </div>

            <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                {isBbOptimal ? t.lp.integerSolution : t.lp.bestFoundValue}
              </span>
              <p className="font-mono text-lg font-bold text-indigo-700 dark:text-indigo-300 mt-1 tabular-nums">
                {bbResult.bestObjectiveValue !== undefined ? bbResult.bestObjectiveValue.toFixed(4) : 'N/A'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{t.lp.bestBound}</span>
              <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {bbResult.bestBound !== undefined && Number.isFinite(bbResult.bestBound)
                  ? bbResult.bestBound.toFixed(4)
                  : 'N/A'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{t.lp.integralityGap}</span>
              <p className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {bbResult.bestObjectiveValue !== undefined &&
                Number.isFinite(bbResult.stats.integralityGapPercent)
                  ? `${bbResult.stats.integralityGapPercent.toFixed(2)}%`
                  : 'N/A'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{t.lp.executionTime}</span>
              <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {bbResult.stats.executionTimeMs.toFixed(1)} ms
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
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
            <div>
              <span className="text-slate-500">{t.lp.openNodesRemaining}:</span>{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {bbResult.stats.openNodesRemaining ?? 0}
              </strong>
            </div>
          </div>

          {bbResult.limitsUsed && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">
              <span className="font-sans font-semibold text-slate-600 dark:text-slate-300">
                {t.lp.limitsUsedTitle}:
              </span>{' '}
              maxNodes={bbResult.limitsUsed.maxNodes}, maxDepth={bbResult.limitsUsed.maxDepth}, timeout=
              {(bbResult.limitsUsed.timeoutMs / 1000).toFixed(0)}s, strategy={bbResult.limitsUsed.branchingStrategy},
              eps={bbResult.limitsUsed.eps}, pivotEps={bbResult.limitsUsed.pivotEps}
            </div>
          )}
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
              type="button"
              onClick={() => setShowPresolveReport(!showPresolveReport)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1"
            >
              <span>{showPresolveReport ? t.actions.hideReport : t.actions.viewReport}</span>
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

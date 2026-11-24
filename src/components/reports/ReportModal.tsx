/**
 * Sheeta Operations Research
 * Executive Report Modal with Binary PDF Export, Markdown/Text Download, and Auto-Copy
 */

import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { useI18n } from '../../i18n/i18nContext';
import { usePlatform } from '../../platform';
import {
  generateMarkdownReport,
  ReportData,
} from '../../engines/reportBuilder';
import { AlertTriangle, Check, Copy, Download, Printer } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: ReportData;
  autoCopyEnabled: boolean;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  reportData,
  autoCopyEnabled,
}) => {
  const { t, language, isRtl } = useI18n();
  const platform = usePlatform();
  const [copied, setCopied] = useState(false);

  const markdownText = React.useMemo(() => {
    return generateMarkdownReport({ ...reportData, language });
  }, [reportData, language]);

  // Handle auto-copy on open if enabled
  useEffect(() => {
    if (isOpen && autoCopyEnabled) {
      platform.clipboard.copy(markdownText).then((success) => {
        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        }
      });
    }
  }, [isOpen, autoCopyEnabled, markdownText, platform]);

  const handleManualCopy = async () => {
    const success = await platform.clipboard.copy(markdownText);
    if (success) {
      platform.device.haptic('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleDownload = async () => {
    const filename = `sheeta_or_report_${Date.now()}.md`;
    await platform.file.exportFile({
      filename,
      content: markdownText,
      mimeType: 'text/markdown;charset=utf-8',
    });
    platform.device.haptic('success');
  };

  const handlePrint = async () => {
    const reportElem = document.getElementById('printable-report');
    if (reportElem) {
      await platform.pdf.exportPdf(reportData.title, reportElem.innerHTML, isRtl, reportData);
    } else {
      await platform.pdf.print();
    }
  };

  const hasWarning = Boolean(reportData.warningMessage);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.reports.title} maxWidth="max-w-4xl">
      <div className="space-y-6">
        {/* Action Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.actions.printPdf}</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.actions.downloadText}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualCopy}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.actions.copied : t.actions.copyReport}</span>
            </button>
          </div>
        </div>

        {/* Printable & Scrollable Report Container */}
        <div
          id="printable-report"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="p-6 sm:p-8 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs space-y-6 text-slate-900 dark:text-slate-100 max-h-[60vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white text-xs font-black">
                  Σ
                </span>
                <h1 className="text-xl font-bold tracking-tight">{t.appName}</h1>
              </div>
              <h2 className="text-sm font-semibold text-slate-500 mt-1">
                {t.reports.title} — {reportData.title}
              </h2>
            </div>
            <div className="text-end text-xs text-slate-400 font-mono shrink-0">
              <span>{reportData.createdAt}</span>
            </div>
          </div>

          {/* Honest Warning Banner if search terminated prematurely */}
          {reportData.warningMessage && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="font-semibold leading-relaxed">{reportData.warningMessage}</span>
            </div>
          )}

          {/* Section 1: Problem Formulation */}
          <div className="page-break-inside-avoid">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
              {t.reports.formulation}
            </h3>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs whitespace-pre-wrap">
              {reportData.formulation}
            </div>
          </div>

          {/* Section 2: Presolve Summary if present */}
          {reportData.presolveSummary && (
            <div className="page-break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                {t.reports.presolveSummary}
              </h3>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                <p>
                  <strong>{t.reports.variablesLabel}</strong> {reportData.presolveSummary.originalVars} →{' '}
                  {reportData.presolveSummary.reducedVars}
                </p>
                <p>
                  <strong>{t.reports.constraintsLabel}</strong> {reportData.presolveSummary.originalConstraints} →{' '}
                  {reportData.presolveSummary.reducedConstraints}
                </p>
                {reportData.presolveSummary.log.length > 0 && (
                  <div className="pt-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {reportData.presolveSummary.log.map((s, idx) => (
                      <div key={idx}>• {s}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 3: Solution Results */}
          <div className="page-break-inside-avoid">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
              {t.reports.resultsSummary}
            </h3>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold gap-3">
                <span>{t.reports.solutionStatusLabel}</span>
                <span
                  className={`font-bold text-end ${
                    hasWarning
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {reportData.solutionStatus}
                </span>
              </div>
              {reportData.optimalObjective !== undefined && (
                <div className="flex items-center justify-between text-xs font-semibold border-t border-slate-200 dark:border-slate-800 pt-2">
                  <span>{t.reports.objectiveValueLabel}</span>
                  <span
                    className={`font-mono text-base font-extrabold ${
                      hasWarning
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {reportData.optimalObjective.toFixed(4)}
                  </span>
                </div>
              )}

              {reportData.variableAssignments && reportData.variableAssignments.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-500 block mb-2">
                    {t.reports.variableAllocationsLabel}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                    {reportData.variableAssignments.map((v) => (
                      <div
                        key={v.name}
                        className="p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex justify-between"
                      >
                        <span>{v.name}:</span>
                        <strong className="text-indigo-600 dark:text-indigo-400">{v.value.toFixed(4)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Constraint Sensitivity (Slacks & Shadow Prices) */}
          {reportData.constraintDetails && reportData.constraintDetails.length > 0 && (
            <div className="page-break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                {t.reports.constraintSensitivity}
              </h3>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="py-2 px-3 text-start">{t.lp.constraintName}</th>
                      <th className="py-2 px-3 text-end">{t.lp.lhsCol}</th>
                      <th className="py-2 px-3 text-end">{t.lp.rhsCol}</th>
                      <th className="py-2 px-3 text-end">{t.lp.slackSurplusCol}</th>
                      <th className="py-2 px-3 text-end">{t.lp.shadowPriceCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                    {reportData.constraintDetails.map((c) => (
                      <tr key={c.id} className="bg-white dark:bg-slate-950">
                        <td className="py-1.5 px-3 font-sans font-semibold">
                          {c.name} <span className="text-slate-400">({c.op})</span>
                        </td>
                        <td className="py-1.5 px-3 text-end">{c.lhs.toFixed(4)}</td>
                        <td className="py-1.5 px-3 text-end">{c.rhs.toFixed(4)}</td>
                        <td className="py-1.5 px-3 text-end">{c.slackOrSurplus.toFixed(4)}</td>
                        <td className="py-1.5 px-3 text-end text-indigo-600 dark:text-indigo-400 font-semibold">
                          {c.dualValue.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 5: Integer Comparison & Limits Used if present */}
          {reportData.comparison && (
            <div className="page-break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                {t.reports.comparisons}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block font-sans">{t.reports.lpRelaxationLabel}</span>
                  <strong>{reportData.comparison.lpRelaxationValue.toFixed(4)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">{t.reports.integerSolutionLabel}</span>
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    {reportData.comparison.integerSolutionValue !== undefined
                      ? reportData.comparison.integerSolutionValue.toFixed(4)
                      : '—'}
                  </strong>
                </div>
                {reportData.comparison.bestBound !== undefined && (
                  <div>
                    <span className="text-slate-400 block font-sans">{t.reports.bestBoundLabel}</span>
                    <strong>{reportData.comparison.bestBound.toFixed(4)}</strong>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 block font-sans">{t.reports.integralityGapLabel}</span>
                  <strong className="text-amber-600 dark:text-amber-400">
                    {reportData.comparison.integerSolutionValue === undefined
                      ? '—'
                      : Number.isFinite(reportData.comparison.integralityGapPercent)
                      ? `${reportData.comparison.integralityGapPercent.toFixed(2)}%`
                      : '∞'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">{t.reports.nodesExploredLabel}</span>
                  <strong>{reportData.comparison.exploredNodes}</strong>
                </div>
                {reportData.comparison.limitsUsed && (
                  <div className="col-span-2 sm:col-span-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                    <span className="font-sans font-semibold me-2">{t.reports.limitsUsedLabel}</span>{' '}
                    maxNodes={reportData.comparison.limitsUsed.maxNodes} | maxDepth=
                    {reportData.comparison.limitsUsed.maxDepth} | timeout=
                    {(reportData.comparison.limitsUsed.timeoutMs / 1000).toFixed(1)}s | eps=
                    {reportData.comparison.limitsUsed.eps}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 6: PERT Critical Paths if present */}
          {reportData.pertCriticalPaths && reportData.pertCriticalPaths.length > 0 && (
            <div className="page-break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                {t.reports.criticalPathsLabel}
              </h3>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs font-mono">
                {reportData.pertCriticalPaths.map((p, idx) => (
                  <div key={idx}>
                    {t.pert.pathLabel} #{idx + 1}: {p.join(' → ')}
                  </div>
                ))}
                {reportData.pertPathsCapped && (
                  <p className="font-sans text-amber-600 dark:text-amber-400 pt-1">
                    {t.pert.pathsCappedNotice}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Section 7: Simulation Stats if present */}
          {reportData.simulationStats && (
            <div className="page-break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                {t.reports.simulationSummary}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block font-sans">{t.simulation.numScenarios}:</span>
                  <strong>{reportData.simulationStats.totalScenarios}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">{t.simulation.bestScenario}:</span>
                  <strong>{reportData.simulationStats.bestValue.toFixed(4)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">{t.simulation.meanScenario}:</span>
                  <strong>{reportData.simulationStats.meanValue.toFixed(4)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">{t.simulation.stdDev}:</span>
                  <strong>{reportData.simulationStats.stdDevValue.toFixed(4)}</strong>
                </div>
                {reportData.simulationStats.workerPoolSize !== undefined && (
                  <div>
                    <span className="text-slate-400 block font-sans">{t.simulation.workerPoolBadge}</span>
                    <strong>{reportData.simulationStats.workerPoolSize}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
            {t.reports.confidentiality}
          </div>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Sheeta Operations Research
 * Executive Report Builder & Clipboard Utilities
 */

import { ConstraintSensitivity, Language, SolverLimitsUsed } from '../types';

export interface ReportData {
  title: string;
  moduleName: string;
  language: Language;
  createdAt: string;
  formulation: string;
  solutionStatus: string;
  warningMessage?: string;
  optimalObjective?: number;
  variableAssignments?: { name: string; value: number }[];
  constraintDetails?: ConstraintSensitivity[];
  presolveSummary?: {
    originalVars: number;
    reducedVars: number;
    originalConstraints: number;
    reducedConstraints: number;
    log: string[];
  };
  comparison?: {
    lpRelaxationValue: number;
    integerSolutionValue?: number;
    bestBound?: number;
    integralityGapPercent: number;
    exploredNodes: number;
    executionTimeMs: number;
    matrixModeUsed?: 'dense' | 'sparse';
    limitsUsed?: SolverLimitsUsed;
  };
  pertCriticalPaths?: string[][];
  pertPathsCapped?: boolean;
  simulationStats?: {
    totalScenarios: number;
    feasibleCount?: number;
    bestValue: number;
    worstValue: number;
    meanValue: number;
    stdDevValue: number;
    workerPoolSize?: number;
  };
  additionalNotes?: string[];
}

export function generateMarkdownReport(data: ReportData): string {
  const isAr = data.language === 'ar';
  const divider = '------------------------------------------------------------';

  const lines: string[] = [];
  lines.push(`# ${isAr ? 'منظومة شيتة لبحوث العمليات' : 'Sheeta Operations Research'}`);
  lines.push(`## ${isAr ? 'تقرير تنفيذي لحل المسألة' : 'Executive Operations Research Report'}`);
  lines.push(`**${isAr ? 'عنوان المسألة' : 'Problem Title'}:** ${data.title}`);
  lines.push(`**${isAr ? 'النموذج' : 'Module'}:** ${data.moduleName}`);
  lines.push(`**${isAr ? 'تاريخ التوليد' : 'Date & Time'}:** ${data.createdAt}`);
  lines.push(divider);

  // Formulation
  lines.push(`### ${isAr ? '1. صياغة المسألة والمدخلات الرياضية' : '1. Problem Formulation & Inputs'}`);
  lines.push(data.formulation);
  lines.push('');

  // Presolve Summary
  if (data.presolveSummary) {
    lines.push(
      `### ${isAr ? '2. ملخص الاختزال والمعالجة المسبقة (Presolve)' : '2. Multi-Pass Presolve Summary'}`
    );
    lines.push(
      `- ${isAr ? 'المتغيرات' : 'Variables'}: ${data.presolveSummary.originalVars} -> ${data.presolveSummary.reducedVars}`
    );
    lines.push(
      `- ${isAr ? 'القيود' : 'Constraints'}: ${data.presolveSummary.originalConstraints} -> ${data.presolveSummary.reducedConstraints}`
    );
    if (data.presolveSummary.log.length > 0) {
      lines.push(isAr ? 'خطوات الاختزال:' : 'Presolve Log:');
      data.presolveSummary.log.forEach((step) => lines.push(`  * ${step}`));
    }
    lines.push('');
  }

  // Solution
  lines.push(
    `### ${isAr ? '3. ملخص الحل وقيم متغيرات القرار' : '3. Solution Summary & Variable Assignments'}`
  );
  lines.push(`**${isAr ? 'حالة الحل' : 'Status'}:** ${data.solutionStatus}`);
  if (data.warningMessage) {
    lines.push(`**${isAr ? 'تنبيه' : 'Warning'}:** ${data.warningMessage}`);
  }
  if (data.optimalObjective !== undefined) {
    lines.push(
      `**${isAr ? 'قيمة دالة الهدف (Z)' : 'Objective Value (Z)'}:** ${data.optimalObjective.toFixed(4)}`
    );
  }
  if (data.variableAssignments && data.variableAssignments.length > 0) {
    lines.push(isAr ? 'قيم المتغيرات:' : 'Variable Values:');
    data.variableAssignments.forEach((v) => {
      lines.push(`- **${v.name}** = ${v.value.toFixed(4)}`);
    });
  }
  lines.push('');

  // Constraint Sensitivity (Slacks & Shadow Prices)
  if (data.constraintDetails && data.constraintDetails.length > 0) {
    lines.push(
      `### ${isAr ? '4. تحليل حساسية القيود (الفوائض والأسعار الظلية)' : '4. Constraint Sensitivity (Slacks & Shadow Prices)'}`
    );
    lines.push(
      isAr
        ? '| القيد | الطرف الأيسر | الطرف الأيمن | الفائض / النقص | السعر الظلي (Dual) |'
        : '| Constraint | LHS | RHS | Slack / Surplus | Shadow Price (Dual) |'
    );
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const c of data.constraintDetails) {
      lines.push(
        `| ${c.name} (${c.op}) | ${c.lhs.toFixed(4)} | ${c.rhs.toFixed(4)} | ${c.slackOrSurplus.toFixed(4)} | ${c.dualValue.toFixed(4)} |`
      );
    }
    lines.push('');
  }

  // Branch and Bound comparison
  if (data.comparison) {
    lines.push(
      `### ${isAr ? '5. مقارنة الحل الخطي بالحل الصحيح وحدود الخوارزمية' : '5. LP Relaxation vs. Integer Solution & Solver Limits'}`
    );
    lines.push(
      `- ${isAr ? 'قيمة الحل الخطي المرخي (LP Relaxation)' : 'LP Relaxation Value'}: ${data.comparison.lpRelaxationValue.toFixed(4)}`
    );
    if (data.comparison.integerSolutionValue !== undefined) {
      lines.push(
        `- ${isAr ? 'أفضل حل صحيح تم إيجاده (Incumbent)' : 'Best Integer Incumbent'}: ${data.comparison.integerSolutionValue.toFixed(4)}`
      );
    }
    if (data.comparison.bestBound !== undefined) {
      lines.push(
        `- ${isAr ? 'أفضل حد خارجي متبقٍ (Best Bound)' : 'Best Remaining Dual Bound'}: ${data.comparison.bestBound.toFixed(4)}`
      );
    }
    lines.push(
      `- ${isAr ? 'فجوة الحل الصحيح (Integrality Gap)' : 'Integrality Gap'}: ${data.comparison.integralityGapPercent.toFixed(2)}%`
    );
    lines.push(
      `- ${isAr ? 'العقد المستكشفة في الشجرة' : 'Explored Nodes'}: ${data.comparison.exploredNodes}`
    );
    lines.push(
      `- ${isAr ? 'زمن المعالجة' : 'Execution Time'}: ${data.comparison.executionTimeMs.toFixed(2)} ms`
    );
    if (data.comparison.matrixModeUsed) {
      lines.push(
        `- ${isAr ? 'وضع المصفوفة' : 'Matrix Mode'}: ${data.comparison.matrixModeUsed}`
      );
    }
    if (data.comparison.limitsUsed) {
      const lu = data.comparison.limitsUsed;
      lines.push(
        `- ${isAr ? 'الحدود المطبقة' : 'Limits Applied'}: maxNodes=${lu.maxNodes}, maxDepth=${lu.maxDepth}, timeout=${(lu.timeoutMs / 1000).toFixed(1)}s, strategy=${lu.branchingStrategy}, eps=${lu.eps}`
      );
    }
    lines.push('');
  }

  // PERT Critical Paths
  if (data.pertCriticalPaths && data.pertCriticalPaths.length > 0) {
    lines.push(
      `### ${isAr ? 'المسارات الحرجة المتميزة' : 'Distinct Critical Paths'}`
    );
    data.pertCriticalPaths.forEach((p, idx) => {
      lines.push(`${idx + 1}. ${p.join(' -> ')}`);
    });
    if (data.pertPathsCapped) {
      lines.push(
        isAr
          ? 'ملاحظة: تم إظهار الحد الأقصى للمسارات الحرجة فقط.'
          : 'Note: Critical path listing was capped at the configured maximum.'
      );
    }
    lines.push('');
  }

  // Simulation summary
  if (data.simulationStats) {
    lines.push(
      `### ${isAr ? 'ملخص محاكاة السيناريوهات ومونت كارلو' : 'Scenario Simulation Summary'}`
    );
    lines.push(
      `- ${isAr ? 'إجمالي السيناريوهات' : 'Total Scenarios'}: ${data.simulationStats.totalScenarios}`
    );
    if (data.simulationStats.feasibleCount !== undefined) {
      lines.push(
        `- ${isAr ? 'السيناريوهات الممكنة' : 'Feasible Scenarios'}: ${data.simulationStats.feasibleCount}`
      );
    }
    lines.push(
      `- ${isAr ? 'أفضل سيناريو' : 'Best Scenario'}: ${data.simulationStats.bestValue.toFixed(4)}`
    );
    lines.push(
      `- ${isAr ? 'أسوأ سيناريو' : 'Worst Scenario'}: ${data.simulationStats.worstValue.toFixed(4)}`
    );
    lines.push(
      `- ${isAr ? 'المتوسط الحسابي' : 'Mean Value'}: ${data.simulationStats.meanValue.toFixed(4)}`
    );
    lines.push(
      `- ${isAr ? 'الانحراف المعياري' : 'Standard Deviation'}: ${data.simulationStats.stdDevValue.toFixed(4)}`
    );
    if (data.simulationStats.workerPoolSize !== undefined) {
      lines.push(
        `- ${isAr ? 'حجم تجمع العمال المتوازي' : 'Worker Pool Size'}: ${data.simulationStats.workerPoolSize}`
      );
    }
    lines.push('');
  }

  if (data.additionalNotes && data.additionalNotes.length > 0) {
    lines.push(`### ${isAr ? 'ملاحظات إضافية' : 'Additional Notes'}`);
    data.additionalNotes.forEach((n) => lines.push(`- ${n}`));
    lines.push('');
  }

  lines.push(divider);
  lines.push(
    `_${
      isAr
        ? 'تم إنشاء هذا التقرير محليًا عبر منظومة شيتة لبحوث العمليات (Sheeta Operations Research).'
        : 'Generated locally by Sheeta Operations Research suite.'
    }_`
  );

  return lines.join('\n');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

export function downloadTextReport(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sheeta Operations Research
 * Executive Report Builder & Clipboard Utilities
 */

import { Language } from '../types';

export interface ReportData {
  title: string;
  moduleName: string;
  language: Language;
  createdAt: string;
  formulation: string;
  solutionStatus: string;
  optimalObjective?: number;
  variableAssignments?: { name: string; value: number }[];
  presolveSummary?: {
    originalVars: number;
    reducedVars: number;
    originalConstraints: number;
    reducedConstraints: number;
    log: string[];
  };
  comparison?: {
    lpRelaxationValue: number;
    integerSolutionValue: number;
    integralityGapPercent: number;
    exploredNodes: number;
    executionTimeMs: number;
  };
  simulationStats?: {
    totalScenarios: number;
    bestValue: number;
    worstValue: number;
    meanValue: number;
    stdDevValue: number;
  };
  additionalNotes?: string[];
}

export function generateMarkdownReport(data: ReportData): string {
  const isAr = data.language === 'ar';
  const divider = '------------------------------------------------------------';

  let lines: string[] = [];
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

  // Presolve Summary if available
  if (data.presolveSummary) {
    lines.push(`### ${isAr ? '2. ملخص الاختزال والمعالجة المسبقة (Presolve)' : '2. Multi-Pass Presolve Summary'}`);
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
  lines.push(`### ${isAr ? '3. ملخص الحل وقيم متغيرات القرار' : '3. Optimal Solution & Variable Assignments'}`);
  lines.push(`**${isAr ? 'حالة الحل' : 'Status'}:** ${data.solutionStatus}`);
  if (data.optimalObjective !== undefined) {
    lines.push(`**${isAr ? 'القيمة المثلى لدالة الهدف (Z*)' : 'Optimal Objective Value (Z*)'}:** ${data.optimalObjective.toFixed(4)}`);
  }
  if (data.variableAssignments && data.variableAssignments.length > 0) {
    lines.push(isAr ? 'قيم المتغيرات:' : 'Variable Values:');
    data.variableAssignments.forEach((v) => {
      lines.push(`- **${v.name}** = ${v.value.toFixed(4)}`);
    });
  }
  lines.push('');

  // Branch and Bound comparison if available
  if (data.comparison) {
    lines.push(`### ${isAr ? '4. مقارنة الحل الخطي بالحل الصحيح (Branch and Bound)' : '4. LP Relaxation vs. Integer Programming Comparison'}`);
    lines.push(`- ${isAr ? 'قيمة الحل الخطي المرخي (LP Relaxation)' : 'LP Relaxation Bound'}: ${data.comparison.lpRelaxationValue.toFixed(4)}`);
    lines.push(`- ${isAr ? 'قيمة الحل الأمثل بالأعداد الصحيحة (IP Solution)' : 'Optimal Integer Solution'}: ${data.comparison.integerSolutionValue.toFixed(4)}`);
    lines.push(`- ${isAr ? 'فجوة الحل الصحيح (Integrality Gap)' : 'Integrality Gap'}: ${data.comparison.integralityGapPercent.toFixed(2)}%`);
    lines.push(`- ${isAr ? 'العقد المستكشفة في الشجرة' : 'Explored Nodes'}: ${data.comparison.exploredNodes}`);
    lines.push(`- ${isAr ? 'زمن المعالجة' : 'Execution Time'}: ${data.comparison.executionTimeMs.toFixed(2)} ms`);
    lines.push('');
  }

  // Simulation summary if available
  if (data.simulationStats) {
    lines.push(`### ${isAr ? '5. ملخص محاكاة السيناريوهات ومونت كارلو' : '5. Scenario Simulation Summary'}`);
    lines.push(`- ${isAr ? 'إجمالي السيناريوهات' : 'Total Scenarios'}: ${data.simulationStats.totalScenarios}`);
    lines.push(`- ${isAr ? 'أفضل سيناريو' : 'Best Scenario'}: ${data.simulationStats.bestValue.toFixed(4)}`);
    lines.push(`- ${isAr ? 'أسوأ سيناريو' : 'Worst Scenario'}: ${data.simulationStats.worstValue.toFixed(4)}`);
    lines.push(`- ${isAr ? 'المتوسط الحسابي' : 'Mean Value'}: ${data.simulationStats.meanValue.toFixed(4)}`);
    lines.push(`- ${isAr ? 'الانحراف المعياري' : 'Standard Deviation'}: ${data.simulationStats.stdDevValue.toFixed(4)}`);
    lines.push('');
  }

  // Additional notes
  if (data.additionalNotes && data.additionalNotes.length > 0) {
    lines.push(`### ${isAr ? 'ملاحظات إضافية' : 'Additional Notes'}`);
    data.additionalNotes.forEach((n) => lines.push(`- ${n}`));
    lines.push('');
  }

  lines.push(divider);
  lines.push(`_${isAr ? 'تم إنشاء هذا التقرير محليًا عبر منظومة شيتة لبحوث العمليات (Sheeta Operations Research).' : 'Generated locally by Sheeta Operations Research suite.'}_`);

  return lines.join('\n');
}

/**
 * Copies text report to system clipboard and provides feedback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback using textarea
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

/**
 * Triggers download of text report as .txt or .md file
 */
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

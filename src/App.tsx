/**
 * Sheeta Operations Research
 * Main Application Shell & Integration Architecture
 */

import React, { useEffect, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/i18nContext';
import { PlatformProvider, usePlatform } from './platform';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import {
  ActivityDef,
  AppSettings,
  AssignmentProblem,
  AssignmentResult,
  BranchAndBoundResult,
  EoqInputs,
  EoqResult,
  LpProblem,
  ORModuleType,
  PertCpmResult,
  QueuingInputs,
  QueuingResult,
  SavedProblem,
  SimulationSummary,
  TransportationProblem,
  TransportationResult,
} from './types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './storage/db';
import { Navbar } from './components/common/Navbar';
import { LpModule } from './components/linearProgramming/LpModule';
import { TransportationModule } from './components/transportation/TransportationModule';
import { PertCpmModule } from './components/pertCpm/PertCpmModule';
import { QueuingEoqModule } from './components/queuingEoq/QueuingEoqModule';
import { SimulationModule } from './components/simulation/SimulationModule';
import { SavedProblemsModal } from './components/workspace/SavedProblemsModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { ReportModal } from './components/reports/ReportModal';
import { ReportData } from './engines/reportBuilder';
import {
  BENCHMARK_LP,
  SAMPLE_EOQ,
  SAMPLE_PERT_CPM,
  SAMPLE_QUEUING,
  SAMPLE_TRANSPORTATION,
  SAMPLE_TWO_VAR_LP,
} from './storage/sampleProblems';

function MainApp() {
  const { t, language } = useI18n();
  const platform = usePlatform();

  const [activeModule, setActiveModule] = useState<ORModuleType>('lp');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Active problem representations & results per module
  const [lpProblem, setLpProblem] = useState<LpProblem>(SAMPLE_TWO_VAR_LP);
  const [lpResults, setLpResults] = useState<any>(null);
  const [lpSyncVersion, setLpSyncVersion] = useState<number>(0);

  const [transportProblem, setTransportProblem] = useState<
    TransportationProblem | AssignmentProblem
  >(SAMPLE_TRANSPORTATION);
  const [transportResults, setTransportResults] = useState<
    TransportationResult | AssignmentResult | null
  >(null);
  const [transportSyncVersion, setTransportSyncVersion] = useState<number>(0);

  const [pertActivities, setPertActivities] = useState<ActivityDef[]>(SAMPLE_PERT_CPM);
  const [pertResults, setPertResults] = useState<PertCpmResult | null>(null);
  const [pertSyncVersion, setPertSyncVersion] = useState<number>(0);

  const [queuingInputs, setQueuingInputs] = useState<QueuingInputs>(SAMPLE_QUEUING);
  const [queuingResults, setQueuingResults] = useState<QueuingResult | null>(null);
  const [eoqInputs, setEoqInputs] = useState<EoqInputs>(SAMPLE_EOQ);
  const [eoqResults, setEoqResults] = useState<EoqResult | null>(null);
  const [queuingActiveTab, setQueuingActiveTab] = useState<'queuing' | 'eoq'>('queuing');
  const [queuingSyncVersion, setQueuingSyncVersion] = useState<number>(0);

  const [simulationSummary, setSimulationSummary] = useState<SimulationSummary | null>(null);

  // Modals state
  const [isSavedProblemsOpen, setIsSavedProblemsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Handle Android/Desktop Back/Escape button to close active modal
  useEffect(() => {
    return platform.device.onBackButton(() => {
      if (isReportOpen) {
        setIsReportOpen(false);
        return true;
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        return true;
      }
      if (isSavedProblemsOpen) {
        setIsSavedProblemsOpen(false);
        return true;
      }
      return false;
    });
  }, [platform, isReportOpen, isSettingsOpen, isSavedProblemsOpen]);

  // Load persistent settings on mount
  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      if (s.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });
  }, []);

  const handleToggleTheme = () => {
    const nextTheme: 'light' | 'dark' = settings.theme === 'dark' ? 'light' : 'dark';
    const updated: AppSettings = { ...settings, theme: nextTheme };
    setSettings(updated);
    saveSettings(updated);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const applyExternalProblem = (moduleType: ORModuleType, problemData: any) => {
    setActiveModule(moduleType);
    if (moduleType === 'lp') {
      setLpProblem(problemData);
      setLpResults(null);
      setLpSyncVersion((v) => v + 1);
    } else if (moduleType === 'transportation') {
      setTransportProblem(problemData);
      setTransportResults(null);
      setTransportSyncVersion((v) => v + 1);
    } else if (moduleType === 'pert') {
      setPertActivities(problemData);
      setPertResults(null);
      setPertSyncVersion((v) => v + 1);
    } else if (moduleType === 'queuing_eoq') {
      if (problemData && 'arrivalRate' in problemData) {
        setQueuingInputs(problemData);
        setQueuingResults(null);
        setQueuingActiveTab('queuing');
      } else {
        setEoqInputs(problemData);
        setEoqResults(null);
        setQueuingActiveTab('eoq');
      }
      setQueuingSyncVersion((v) => v + 1);
    }
  };

  const handleLoadProblem = (saved: SavedProblem) => {
    applyExternalProblem(saved.module, saved.data);
  };

  const handleRunBenchmark = () => {
    applyExternalProblem('lp', BENCHMARK_LP);
  };

  const handleSendSimulationScenario = (moduleType: ORModuleType, problemData: any) => {
    applyExternalProblem(moduleType, problemData);
  };

  const getLocalizedBbStatusLabel = (bb?: BranchAndBoundResult | null): string => {
    if (!bb) return t.status.idle;
    switch (bb.status) {
      case 'optimal':
        return t.status.optimal;
      case 'depth_limit_reached':
        return t.status.depthLimitReached;
      case 'node_limit_reached':
        return t.status.nodeLimitReached;
      case 'time_limit_reached':
        return t.status.timeLimitReached;
      case 'feasible_not_proven':
        return t.status.feasibleNotProven;
      case 'cancelled':
        return t.status.cancelled;
      case 'unbounded':
        return t.status.unbounded;
      case 'infeasible':
        return t.status.infeasible;
    }
  };

  const getLocalizedBbWarning = (bb?: BranchAndBoundResult | null): string | undefined => {
    if (!bb || bb.status === 'optimal' || bb.status === 'infeasible' || bb.status === 'unbounded') {
      return undefined;
    }
    if (bb.status === 'cancelled') {
      return t.status.cancelled;
    }
    return t.lp.notProvenWarning;
  };

  // Build report data for active module
  const currentReportData: ReportData = React.useMemo(() => {
    const nowStr = new Date().toLocaleString();

    if (activeModule === 'lp') {
      const isIp = lpProblem?.isIntegerProgram;
      const bb: BranchAndBoundResult | undefined = lpResults?.bb;
      const simplex = lpResults?.simplex;

      const optVal = isIp ? bb?.bestObjectiveValue : simplex?.objectiveValue;

      let statusText = t.status.idle;
      if (isIp && bb) {
        statusText = getLocalizedBbStatusLabel(bb);
      } else if (!isIp && simplex) {
        if (simplex.status === 'optimal') statusText = t.status.optimal;
        else if (simplex.status === 'infeasible') statusText = t.status.infeasible;
        else if (simplex.status === 'unbounded') statusText = t.status.unbounded;
        else if (simplex.status === 'iteration_limit') statusText = t.status.iterationLimit;
        else if (simplex.status === 'cancelled') statusText = t.status.cancelled;
      }

      const rawAssignments = isIp ? bb?.bestIntegerSolution : simplex?.variableValues;
      const varAssignments =
        rawAssignments && lpProblem?.variables
          ? lpProblem.variables.map((v, idx) => ({
              name: v.name,
              value: rawAssignments[idx] ?? 0,
            }))
          : undefined;

      const constraintDetails = isIp
        ? bb?.lpRelaxation?.constraintDetails
        : simplex?.constraintDetails;

      return {
        title: lpProblem?.title || t.lp.problemTitle,
        moduleName: isIp ? t.lp.isIntegerProgram : t.modules.lp,
        language,
        createdAt: nowStr,
        formulation: `Objective: ${lpProblem?.sense?.toUpperCase()} Z = ${lpProblem?.variables
          ?.map((v) => `${v.objCoeff} ${v.name}`)
          .join(' + ')}\n\nConstraints:\n${lpProblem?.constraints
          ?.map(
            (c) =>
              `${c.name}: ${c.coeffs
                .map((coeff: number, i: number) => `${coeff} ${lpProblem.variables[i]?.name}`)
                .join(' + ')} ${c.op} ${c.rhs}`
          )
          .join('\n')}`,
        solutionStatus: statusText,
        warningMessage: isIp ? getLocalizedBbWarning(bb) : undefined,
        optimalObjective: optVal,
        variableAssignments: varAssignments,
        constraintDetails,
        presolveSummary: lpResults?.presolve?.stats
          ? {
              originalVars: lpResults.presolve.stats.originalVars,
              reducedVars: lpResults.presolve.stats.reducedVars,
              originalConstraints: lpResults.presolve.stats.originalConstraints,
              reducedConstraints: lpResults.presolve.stats.reducedConstraints,
              log: lpResults.presolve.report || [],
            }
          : undefined,
        comparison:
          isIp && bb
            ? {
                lpRelaxationValue: bb.lpRelaxation.objectiveValue,
                integerSolutionValue: bb.bestObjectiveValue,
                bestBound: bb.bestBound,
                integralityGapPercent: bb.stats.integralityGapPercent,
                exploredNodes: bb.stats.exploredNodes,
                executionTimeMs: bb.stats.executionTimeMs,
                matrixModeUsed: bb.matrixModeUsed,
                limitsUsed: bb.limitsUsed,
              }
            : undefined,
      };
    }

    if (activeModule === 'transportation') {
      if (transportProblem && 'workers' in transportProblem) {
        const assignRes =
          transportResults && 'assignments' in transportResults ? transportResults : null;
        return {
          title: transportProblem.title || t.transportation.assignmentMode,
          moduleName: t.transportation.assignmentMode,
          language,
          createdAt: nowStr,
          formulation: `Sense: ${transportProblem.sense.toUpperCase()} | Workers: ${transportProblem.workers.length}, Tasks: ${transportProblem.tasks.length}`,
          solutionStatus: assignRes ? t.status.optimal : t.status.idle,
          optimalObjective: assignRes?.totalCost,
          additionalNotes: assignRes
            ? assignRes.assignments.map(
                (a) => `${a.workerName} → ${a.taskName} (${t.transportation.unitCostPrefix} ${a.cost})`
              )
            : undefined,
        };
      }

      const tProb = transportProblem as TransportationProblem;
      const tRes =
        transportResults && 'allocations' in transportResults ? transportResults : null;
      return {
        title: tProb?.title || t.transportation.transportationMode,
        moduleName: `${t.transportation.transportationMode} (${tProb?.method?.toUpperCase() || 'VAM'} + MODI)`,
        language,
        createdAt: nowStr,
        formulation: `Sources: ${tProb?.sources?.length || 0}, Destinations: ${
          tProb?.destinations?.length || 0
        }`,
        solutionStatus: tRes ? t.status.optimal : t.status.idle,
        optimalObjective: tRes?.totalCost,
        additionalNotes:
          tRes?.dummyAdded && tRes.dummyAdded !== 'none'
            ? [t.transportation.unbalancedWarning]
            : undefined,
      };
    }

    if (activeModule === 'pert') {
      return {
        title: t.pert.title,
        moduleName: t.modules.pert,
        language,
        createdAt: nowStr,
        formulation: `${t.pert.activitiesHeader}: ${pertActivities?.length || 0}`,
        solutionStatus: pertResults ? t.status.completed : t.status.idle,
        optimalObjective: pertResults?.totalDuration,
        pertCriticalPaths: pertResults?.criticalPaths,
        pertPathsCapped: pertResults?.pathsCapped,
        additionalNotes: pertResults
          ? [
              `${t.pert.criticalPath}: ${pertResults.criticalPath.join(' → ')}`,
              `${t.pert.projectStdDev}: ${pertResults.projectStdDev.toFixed(2)}`,
            ]
          : undefined,
      };
    }

    if (activeModule === 'queuing_eoq') {
      if (queuingActiveTab === 'queuing') {
        return {
          title: `${t.queuingEoq.queuingTab} (${queuingInputs.model.toUpperCase()})`,
          moduleName: t.modules.queuingEoq,
          language,
          createdAt: nowStr,
          formulation: `Model: ${queuingInputs.model.toUpperCase()}, λ = ${queuingInputs.arrivalRate}, μ = ${queuingInputs.serviceRate}, c = ${queuingInputs.servers}`,
          solutionStatus: queuingResults
            ? queuingResults.rho < 1 || queuingInputs.model === 'mm1k'
              ? t.status.completed
              : t.queuingEoq.unstableWarning
            : t.status.idle,
          optimalObjective: queuingResults?.w,
          additionalNotes: queuingResults
            ? [
                `${t.queuingEoq.utilization}: ${(queuingResults.rho * 100).toFixed(2)}%`,
                `${t.queuingEoq.p0}: ${(queuingResults.p0 * 100).toFixed(2)}%`,
                `${t.queuingEoq.lq}: ${queuingResults.lq.toFixed(4)}`,
                `${t.queuingEoq.l}: ${queuingResults.l.toFixed(4)}`,
                `${t.queuingEoq.wq}: ${queuingResults.wq.toFixed(4)}`,
                `${t.queuingEoq.w}: ${queuingResults.w.toFixed(4)}`,
              ]
            : undefined,
        };
      }

      return {
        title: `${t.queuingEoq.eoqTab} (${eoqInputs.model.toUpperCase()})`,
        moduleName: t.modules.queuingEoq,
        language,
        createdAt: nowStr,
        formulation: `Model: ${eoqInputs.model}, D = ${eoqInputs.annualDemand}, S = ${eoqInputs.orderCost}, H = ${eoqInputs.holdingCost}, C = ${eoqInputs.unitCost}`,
        solutionStatus: eoqResults ? t.status.completed : t.status.idle,
        optimalObjective: eoqResults?.totalAnnualCost,
        additionalNotes: eoqResults
          ? [
              `${t.queuingEoq.optimalQty}: ${eoqResults.optimalQty.toFixed(2)}`,
              `${t.queuingEoq.maxInventory}: ${eoqResults.maxInventory.toFixed(2)}`,
              `${t.queuingEoq.ordersPerYear}: ${eoqResults.ordersPerYear.toFixed(2)}`,
              `${t.queuingEoq.cycleTime}: ${eoqResults.cycleTimeDays.toFixed(1)} ${t.queuingEoq.daysShort}`,
              ...(eoqResults.reorderPoint !== undefined
                ? [`${t.queuingEoq.reorderPoint}: ${eoqResults.reorderPoint.toFixed(2)}`]
                : []),
            ]
          : undefined,
      };
    }

    return {
      title: t.simulation.title,
      moduleName: t.modules.simulation,
      language,
      createdAt: nowStr,
      formulation: simulationSummary
        ? `${t.simulation.completedPrefix} ${simulationSummary.totalScenarios} (${simulationSummary.feasibleCount} ${t.simulation.feasibleBadge}, ${simulationSummary.infeasibleCount} ${t.simulation.infeasibleBadge}).`
        : t.status.idle,
      solutionStatus: simulationSummary
        ? simulationSummary.cancelled
          ? t.status.cancelled
          : t.status.completed
        : t.status.idle,
      optimalObjective: simulationSummary?.meanValue,
      simulationStats: simulationSummary
        ? {
            totalScenarios: simulationSummary.totalScenarios,
            feasibleCount: simulationSummary.feasibleCount,
            bestValue: simulationSummary.bestValue,
            worstValue: simulationSummary.worstValue,
            meanValue: simulationSummary.meanValue,
            stdDevValue: simulationSummary.stdDevValue,
            workerPoolSize: simulationSummary.workerPoolSize,
          }
        : undefined,
    };
  }, [
    activeModule,
    language,
    t,
    settings,
    lpProblem,
    lpResults,
    transportProblem,
    transportResults,
    pertActivities,
    pertResults,
    queuingActiveTab,
    queuingInputs,
    queuingResults,
    eoqInputs,
    eoqResults,
    simulationSummary,
  ]);

  const activeProblemForSaving =
    activeModule === 'lp'
      ? lpProblem
      : activeModule === 'transportation'
      ? transportProblem
      : activeModule === 'pert'
      ? pertActivities
      : queuingActiveTab === 'queuing'
      ? queuingInputs
      : eoqInputs;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Top Bar Navigation */}
      <Navbar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        onOpenSavedProblems={() => setIsSavedProblemsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReport={() => setIsReportOpen(true)}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Offline Status Banner */}
      <OfflineIndicator />

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeModule === 'lp' && (
          <LpModule
            initialProblem={lpProblem}
            syncVersion={lpSyncVersion}
            onUpdateActiveProblem={(prob, res) => {
              setLpProblem(prob);
              if (res) setLpResults(res);
            }}
            settings={settings}
            enablePresolve={settings.presolveEnabled}
            enableWorker={settings.webWorkerEnabled}
            branchingStrategy={settings.branchingStrategy}
          />
        )}

        {activeModule === 'transportation' && (
          <TransportationModule
            initialProblem={transportProblem}
            syncVersion={transportSyncVersion}
            onUpdateActiveProblem={(prob, res) => {
              setTransportProblem(prob);
              if (res) setTransportResults(res);
            }}
          />
        )}

        {activeModule === 'pert' && (
          <PertCpmModule
            initialActivities={pertActivities}
            syncVersion={pertSyncVersion}
            onUpdateActiveProblem={(acts, res) => {
              setPertActivities(acts);
              if (res) setPertResults(res);
            }}
          />
        )}

        {activeModule === 'queuing_eoq' && (
          <QueuingEoqModule
            initialQueuing={queuingInputs}
            initialEoq={eoqInputs}
            preferredTab={queuingActiveTab}
            syncVersion={queuingSyncVersion}
            onUpdateActiveProblem={(prob, res, activeSubTab) => {
              if (activeSubTab) setQueuingActiveTab(activeSubTab);
              if ('arrivalRate' in prob) {
                setQueuingInputs(prob);
                if (res) setQueuingResults(res);
              } else {
                setEoqInputs(prob);
                if (res) setEoqResults(res);
              }
            }}
          />
        )}

        {activeModule === 'simulation' && (
          <SimulationModule
            moduleProblems={{
              lp: lpProblem,
              transportation: transportProblem,
              pert: pertActivities,
              queuing_eoq: queuingActiveTab === 'queuing' ? queuingInputs : eoqInputs,
            }}
            activeModuleProblem={activeProblemForSaving}
            activeModuleType={activeModule}
            onSendToModule={handleSendSimulationScenario}
            onUpdateSummary={setSimulationSummary}
            settings={settings}
            enableWorker={settings.webWorkerEnabled}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 dark:border-slate-800 py-6 px-4 bg-white/50 dark:bg-slate-900/50 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {t.appName}
          </span>
          <span>{t.footerEngines}</span>
        </div>
      </footer>

      {/* Modals */}
      <SavedProblemsModal
        isOpen={isSavedProblemsOpen}
        onClose={() => setIsSavedProblemsOpen(false)}
        activeProblemData={activeProblemForSaving}
        activeModule={activeModule}
        onLoadProblem={handleLoadProblem}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        onRunBenchmark={handleRunBenchmark}
      />

      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportData={currentReportData}
        autoCopyEnabled={settings.autoCopyReport}
      />
    </div>
  );
}

export default function App() {
  return (
    <PlatformProvider>
      <I18nProvider>
        <MainApp />
      </I18nProvider>
    </PlatformProvider>
  );
}

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
  INDUSTRIAL_BENCHMARK_LP,
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
    applyExternalProblem('lp', INDUSTRIAL_BENCHMARK_LP);
  };

  const handleSendSimulationScenario = (moduleType: ORModuleType, problemData: any) => {
    applyExternalProblem(moduleType, problemData);
  };

  // Build report data for active module
  const currentReportData: ReportData = React.useMemo(() => {
    const nowStr = new Date().toLocaleString();

    if (activeModule === 'lp') {
      const isIp = lpProblem?.isIntegerProgram;
      const optVal = isIp
        ? lpResults?.bb?.bestObjectiveValue
        : lpResults?.simplex?.objectiveValue;
      const status = isIp
        ? lpResults?.bb?.status || 'Solved'
        : lpResults?.simplex?.status || 'Solved';

      const varAssignments = lpProblem?.variables?.map((v, idx) => {
        const val = isIp
          ? lpResults?.bb?.bestIntegerSolution?.[idx]
          : lpResults?.simplex?.variableValues?.[idx];
        return { name: v.name, value: val ?? 0 };
      });

      return {
        title: lpProblem?.title || 'Linear Programming Problem',
        moduleName: isIp ? 'Integer / Binary Programming' : 'Linear Programming (Two-Phase Simplex)',
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
        solutionStatus: status,
        optimalObjective: optVal,
        variableAssignments: varAssignments,
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
          isIp && lpResults?.bb
            ? {
                lpRelaxationValue: lpResults.bb.lpRelaxation.objectiveValue,
                integerSolutionValue: lpResults.bb.bestObjectiveValue ?? 0,
                integralityGapPercent: lpResults.bb.stats.integralityGapPercent,
                exploredNodes: lpResults.bb.stats.exploredNodes,
                executionTimeMs: lpResults.bb.stats.executionTimeMs,
              }
            : undefined,
      };
    }

    if (activeModule === 'transportation') {
      if (transportProblem && 'workers' in transportProblem) {
        const assignRes =
          transportResults && 'assignments' in transportResults ? transportResults : null;
        return {
          title: transportProblem.title || 'Hungarian Assignment Problem',
          moduleName: 'Hungarian Assignment Model',
          language,
          createdAt: nowStr,
          formulation: `Sense: ${transportProblem.sense.toUpperCase()} | Workers: ${transportProblem.workers.length}, Tasks: ${transportProblem.tasks.length}`,
          solutionStatus: assignRes ? 'Optimal 1-to-1 Matching' : 'Not Solved Yet',
          optimalObjective: assignRes?.totalCost,
          additionalNotes: assignRes
            ? assignRes.assignments.map(
                (a) => `${a.workerName} → ${a.taskName} (Cost: ${a.cost})`
              )
            : undefined,
        };
      }

      const tProb = transportProblem as TransportationProblem;
      const tRes =
        transportResults && 'allocations' in transportResults ? transportResults : null;
      return {
        title: tProb?.title || 'Transportation Problem',
        moduleName: `Transportation Network (${tProb?.method?.toUpperCase() || 'VAM'} + MODI)`,
        language,
        createdAt: nowStr,
        formulation: `Sources: ${tProb?.sources?.length || 0}, Destinations: ${
          tProb?.destinations?.length || 0
        }`,
        solutionStatus: tRes ? 'Optimal Distribution' : 'Not Solved Yet',
        optimalObjective: tRes?.totalCost,
        additionalNotes: tRes?.dummyAdded
          ? [`Balancing dummy ${tRes.dummyAdded} added automatically.`]
          : undefined,
      };
    }

    if (activeModule === 'pert') {
      return {
        title: 'Project Schedule (PERT / CPM)',
        moduleName: 'Project Network Management',
        language,
        createdAt: nowStr,
        formulation: `Activities: ${pertActivities?.length || 0}`,
        solutionStatus: pertResults ? 'Schedule Computed' : 'Not Solved Yet',
        optimalObjective: pertResults?.totalDuration,
        additionalNotes: [
          `Critical Path: ${pertResults?.criticalPath?.join(' → ') || 'N/A'}`,
          `Project Standard Deviation: ${pertResults?.projectStdDev?.toFixed(2) || '0'}`,
        ],
      };
    }

    if (activeModule === 'queuing_eoq') {
      if (queuingActiveTab === 'queuing') {
        return {
          title: `Queuing System Analysis (${queuingInputs.model.toUpperCase()})`,
          moduleName: 'Queuing Theory',
          language,
          createdAt: nowStr,
          formulation: `Model: ${queuingInputs.model.toUpperCase()}, Arrival Rate λ = ${queuingInputs.arrivalRate}, Service Rate μ = ${queuingInputs.serviceRate}, Servers c = ${queuingInputs.servers}`,
          solutionStatus: queuingResults
            ? queuingResults.rho < 1
              ? 'Steady-State Computed'
              : 'Unstable System (ρ ≥ 1)'
            : 'Not Solved Yet',
          optimalObjective: queuingResults?.w,
          additionalNotes: queuingResults
            ? [
                `Server Utilization (ρ): ${(queuingResults.rho * 100).toFixed(2)}%`,
                `Empty System Probability (P₀): ${(queuingResults.p0 * 100).toFixed(2)}%`,
                `Expected Queue Length (Lq): ${queuingResults.lq.toFixed(4)}`,
                `Expected System Length (L): ${queuingResults.l.toFixed(4)}`,
                `Expected Queue Wait (Wq): ${queuingResults.wq.toFixed(4)}`,
                `Expected Total Time (W): ${queuingResults.w.toFixed(4)}`,
              ]
            : undefined,
        };
      }

      return {
        title: `Inventory Optimization (${eoqInputs.model.toUpperCase()})`,
        moduleName: 'Inventory Control & EOQ / EPQ',
        language,
        createdAt: nowStr,
        formulation: `Model: ${eoqInputs.model}, Annual Demand D = ${eoqInputs.annualDemand}, Order Cost S = ${eoqInputs.orderCost}, Holding Cost H = ${eoqInputs.holdingCost}, Unit Cost C = ${eoqInputs.unitCost}`,
        solutionStatus: eoqResults ? 'Optimal Policy Computed' : 'Not Solved Yet',
        optimalObjective: eoqResults?.totalAnnualCost,
        additionalNotes: eoqResults
          ? [
              `Optimal Order Quantity (Q*): ${eoqResults.optimalQty.toFixed(2)}`,
              `Max Inventory Level: ${eoqResults.maxInventory.toFixed(2)}`,
              `Orders Per Year: ${eoqResults.ordersPerYear.toFixed(2)}`,
              `Cycle Time: ${eoqResults.cycleTimeDays.toFixed(1)} days`,
              ...(eoqResults.reorderPoint !== undefined
                ? [`Reorder Point (ROP): ${eoqResults.reorderPoint.toFixed(2)}`]
                : []),
            ]
          : undefined,
      };
    }

    return {
      title: 'Monte Carlo & Scenario Simulation Analysis',
      moduleName: 'Simulation & Sensitivity Explorer',
      language,
      createdAt: nowStr,
      formulation: simulationSummary
        ? `Executed ${simulationSummary.totalScenarios} scenarios (${simulationSummary.feasibleCount} feasible, ${simulationSummary.infeasibleCount} infeasible).`
        : 'No simulation batch executed yet.',
      solutionStatus: simulationSummary ? 'Batch Completed' : 'Idle',
      optimalObjective: simulationSummary?.meanValue,
      simulationStats: simulationSummary
        ? {
            totalScenarios: simulationSummary.totalScenarios,
            bestValue: simulationSummary.bestValue,
            worstValue: simulationSummary.worstValue,
            meanValue: simulationSummary.meanValue,
            stdDevValue: simulationSummary.stdDevValue,
          }
        : undefined,
    };
  }, [
    activeModule,
    language,
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
          <span>
            Two-Phase Simplex • Branch and Bound • Multi-Pass Presolve • Monte Carlo Simulation
          </span>
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

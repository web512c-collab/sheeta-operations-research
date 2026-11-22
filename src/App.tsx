/**
 * Sheeta Operations Research
 * Main Application Shell & Integration Architecture
 */

import React, { useEffect, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/i18nContext';
import { PlatformProvider, usePlatform } from './platform';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { AppSettings, ORModuleType, SavedProblem } from './types';
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
  SAMPLE_TWO_VAR_LP,
} from './storage/sampleProblems';

function MainApp() {
  const { t, language } = useI18n();
  const platform = usePlatform();

  const [activeModule, setActiveModule] = useState<ORModuleType>('lp');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Active problem representations per module
  const [lpProblem, setLpProblem] = useState<any>(SAMPLE_TWO_VAR_LP);
  const [lpResults, setLpResults] = useState<any>(null);

  const [transportProblem, setTransportProblem] = useState<any>(null);
  const [transportResults, setTransportResults] = useState<any>(null);

  const [pertActivities, setPertActivities] = useState<any>(null);
  const [pertResults, setPertResults] = useState<any>(null);

  const [queuingInputs, setQueuingInputs] = useState<any>(null);
  const [eoqInputs, setEoqInputs] = useState<any>(null);

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

  const handleLoadProblem = (saved: SavedProblem) => {
    setActiveModule(saved.module);
    if (saved.module === 'lp') {
      setLpProblem(saved.data);
    } else if (saved.module === 'transportation') {
      setTransportProblem(saved.data);
    } else if (saved.module === 'pert') {
      setPertActivities(saved.data);
    } else if (saved.module === 'queuing_eoq') {
      if ('arrivalRate' in saved.data) {
        setQueuingInputs(saved.data);
      } else {
        setEoqInputs(saved.data);
      }
    }
  };

  const handleRunBenchmark = () => {
    setActiveModule('lp');
    setLpProblem(INDUSTRIAL_BENCHMARK_LP);
  };

  const handleSendSimulationScenario = (moduleType: ORModuleType, problemData: any) => {
    setActiveModule(moduleType);
    if (moduleType === 'lp') setLpProblem(problemData);
    else if (moduleType === 'transportation') setTransportProblem(problemData);
    else if (moduleType === 'pert') setPertActivities(problemData);
    else if (moduleType === 'queuing_eoq') {
      if ('arrivalRate' in problemData) setQueuingInputs(problemData);
      else setEoqInputs(problemData);
    }
  };

  // Build report data for active module
  const currentReportData: ReportData = React.useMemo(() => {
    if (activeModule === 'lp') {
      const isIp = lpProblem?.isIntegerProgram;
      const optVal = isIp
        ? lpResults?.bb?.bestObjectiveValue
        : lpResults?.simplex?.objectiveValue;
      const status = isIp
        ? lpResults?.bb?.status || 'Solved'
        : lpResults?.simplex?.status || 'Solved';

      const varAssignments = lpProblem?.variables?.map((v: any, idx: number) => {
        const val = isIp
          ? lpResults?.bb?.bestIntegerSolution?.[idx]
          : lpResults?.simplex?.variableValues?.[idx];
        return { name: v.name, value: val ?? 0 };
      });

      return {
        title: lpProblem?.title || 'Linear Programming Problem',
        moduleName: isIp ? 'Integer / Binary Programming' : 'Linear Programming (Two-Phase Simplex)',
        language,
        createdAt: new Date().toLocaleString(),
        formulation: `Objective: ${lpProblem?.sense?.toUpperCase()} Z = ${lpProblem?.variables
          ?.map((v: any) => `${v.objCoeff} ${v.name}`)
          .join(' + ')}\n\nConstraints:\n${lpProblem?.constraints
          ?.map(
            (c: any) =>
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
      return {
        title: transportProblem?.title || 'Transportation Problem',
        moduleName: 'Transportation & Assignment',
        language,
        createdAt: new Date().toLocaleString(),
        formulation: `Sources: ${transportProblem?.sources?.length || 0}, Destinations: ${
          transportProblem?.destinations?.length || 0
        }`,
        solutionStatus: 'Optimal Distribution',
        optimalObjective: transportResults?.totalCost,
      };
    }

    if (activeModule === 'pert') {
      return {
        title: 'Project Schedule (PERT / CPM)',
        moduleName: 'Project Network Management',
        language,
        createdAt: new Date().toLocaleString(),
        formulation: `Activities: ${pertActivities?.length || 8}`,
        solutionStatus: 'Schedule Computed',
        optimalObjective: pertResults?.totalDuration,
        additionalNotes: [
          `Critical Path: ${pertResults?.criticalPath?.join(' → ') || 'N/A'}`,
          `Project Standard Deviation: ${pertResults?.projectStdDev?.toFixed(2) || '0'}`,
        ],
      };
    }

    return {
      title: 'Operations Research Problem',
      moduleName: activeModule.toUpperCase(),
      language,
      createdAt: new Date().toLocaleString(),
      formulation: 'Formulation data available in module.',
      solutionStatus: 'Optimal',
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
  ]);

  const activeProblemForSaving =
    activeModule === 'lp'
      ? lpProblem
      : activeModule === 'transportation'
      ? transportProblem
      : activeModule === 'pert'
      ? pertActivities
      : queuingInputs || eoqInputs;

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
            onUpdateActiveProblem={(prob, res) => {
              setTransportProblem(prob);
              if (res) setTransportResults(res);
            }}
          />
        )}

        {activeModule === 'pert' && (
          <PertCpmModule
            initialActivities={pertActivities}
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
            onUpdateActiveProblem={(prob) => {
              if ('arrivalRate' in prob) setQueuingInputs(prob);
              else setEoqInputs(prob);
            }}
          />
        )}

        {activeModule === 'simulation' && (
          <SimulationModule
            moduleProblems={{
              lp: lpProblem,
              transportation: transportProblem,
              pert: pertActivities,
              queuing_eoq: queuingInputs || eoqInputs,
            }}
            activeModuleProblem={activeProblemForSaving}
            activeModuleType={activeModule}
            onSendToModule={handleSendSimulationScenario}
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

/**
 * Sheeta Operations Research
 * Top Bar Navigation adhering to Universal Frontend Design Top Bar Contract
 */

import React from 'react';
import { ORModuleType } from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import {
  BarChart3,
  BookOpen,
  FileDown,
  Globe,
  Moon,
  Network,
  Settings,
  Sparkles,
  Sun,
  Truck,
  Users2,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  activeModule: ORModuleType;
  onSelectModule: (module: ORModuleType) => void;
  onOpenSavedProblems: () => void;
  onOpenSettings: () => void;
  onOpenReport: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeModule,
  onSelectModule,
  onOpenSavedProblems,
  onOpenSettings,
  onOpenReport,
  theme,
  onToggleTheme,
}) => {
  const { t, language, toggleLanguage } = useI18n();

  const navItems: { id: ORModuleType; label: string; icon: React.ReactNode }[] = [
    { id: 'lp', label: t.modules.lpShort, icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'transportation', label: t.modules.transportationShort, icon: <Truck className="w-4 h-4" /> },
    { id: 'pert', label: t.modules.pertShort, icon: <Network className="w-4 h-4" /> },
    { id: 'queuing_eoq', label: t.modules.queuingEoqShort, icon: <Users2 className="w-4 h-4" /> },
    { id: 'simulation', label: t.modules.simulationShort, icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-6 h-16">
        {/* Zone 1: Brand Wordmark (Single text element, no pill clutter) */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-xs">
            Σ
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            {t.appName}
          </span>
        </div>

        {/* Zone 2: Navigation Links (Single-line whitespace-nowrap segmented tabs) */}
        <nav
          className="hidden md:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl"
          role="tablist"
        >
          {navItems.map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectModule(item.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Utility Controls & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* PWA Install Button (shows when installable) */}
          <PWAInstallButton />

          {/* Fast Language Toggle (Arabic RTL / English LTR) */}
          <button
            onClick={toggleLanguage}
            title={language === 'en' ? 'التحويل إلى العربية (RTL)' : 'Switch to English (LTR)'}
            aria-label="Toggle Language"
            className="px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="uppercase">{language === 'en' ? 'عربي' : 'EN'}</span>
          </button>

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={onToggleTheme}
            title="Toggle Light / Dark mode"
            aria-label="Toggle Theme"
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Saved Problems Workspace Button */}
          <button
            onClick={onOpenSavedProblems}
            title={t.workspace.savedProblems}
            aria-label="Saved Problems"
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            title={t.settings.title}
            aria-label="Settings"
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Primary Action Button: Export Executive Report */}
          <button
            onClick={onOpenReport}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-xs whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4" />
            <span>{t.actions.exportReport}</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation bar */}
      <div className="flex md:hidden overflow-x-auto px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 gap-1.5">
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};

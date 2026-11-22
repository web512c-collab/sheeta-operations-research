/**
 * Sheeta Operations Research - PWA Installation Component
 * Renders an install button for eligible browsers and an iOS "Add to Home Screen" modal/tip.
 */

import React, { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';
import { useI18n } from '../../i18n/i18nContext';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, installPWA } = usePWAInstall();
  const { language } = useI18n();
  const isRtl = language === 'ar';
  const [showIosTip, setShowIosTip] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={installPWA}
        title={isRtl ? 'تثبيت التطبيق على جهازك' : 'Install Sheeta OR as an App'}
        aria-label="Install App"
        className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">{isRtl ? 'تثبيت التطبيق' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowIosTip(!showIosTip)}
          title={isRtl ? 'إضافة إلى الشاشة الرئيسية' : 'Add to Home Screen'}
          aria-label="Install on iOS"
          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {showIosTip && (
          <div
            className={`absolute top-full mt-2 w-64 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 text-xs text-slate-800 dark:text-slate-200 ${
              isRtl ? 'left-0' : 'right-0'
            }`}
          >
            <div className="flex items-center justify-between font-bold mb-1.5">
              <span>{isRtl ? 'تثبيت على الآيفون والآيباد' : 'Install on iOS'}</span>
              <button
                onClick={() => setShowIosTip(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mb-2 text-slate-600 dark:text-slate-400">
              {isRtl
                ? 'لاستخدام التطبيق دون اتصال بكامل الشاشة:'
                : 'To run offline in full-screen mode:'}
            </p>
            <ol className="space-y-1.5 list-decimal list-inside text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-1.5">
                <span>1. {isRtl ? 'اضغط زر المشاركة' : 'Tap Share'}</span>
                <Share className="w-3 h-3 text-indigo-500 inline shrink-0" />
              </li>
              <li className="flex items-center gap-1.5">
                <span>2. {isRtl ? 'اختر "إضافة إلى الشاشة الرئيسية"' : 'Select "Add to Home Screen"'}</span>
                <PlusSquare className="w-3 h-3 text-indigo-500 inline shrink-0" />
              </li>
            </ol>
          </div>
        )}
      </div>
    );
  }

  return null;
};

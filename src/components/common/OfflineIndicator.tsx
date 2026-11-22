/**
 * Sheeta Operations Research - Offline Network Indicator
 * Informs the user when they are offline, highlighting that all OR engines
 * and solvers operate 100% locally in-browser without network dependence.
 */

import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { usePlatform } from '../../platform';
import { useI18n } from '../../i18n/i18nContext';

export const OfflineIndicator: React.FC = () => {
  const platform = usePlatform();
  const [isOnline, setIsOnline] = useState<boolean>(platform.network.isOnline);
  const { language } = useI18n();
  const isRtl = language === 'ar';

  useEffect(() => {
    const unsubscribe = platform.network.subscribe((online) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, [platform]);

  if (isOnline) {
    return null;
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 px-4 py-1.5 text-xs flex items-center justify-center gap-2 font-medium">
      <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <span>
        {isRtl
          ? 'وضع العمل دون اتصال • كافة خوارزميات بحوث العمليات تعمل محلياً 100%'
          : 'Offline mode active • All Operations Research solvers operate 100% locally'}
      </span>
    </div>
  );
};

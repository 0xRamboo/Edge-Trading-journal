import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'sidebar' }> = ({
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  const buttonClass =
    variant === 'sidebar'
      ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0';

  return (
    <>
      <button type="button" onClick={() => void handleClick()} className={buttonClass}>
        {isIOS ? <Smartphone className="h-3.5 w-3.5 shrink-0" /> : <Download className="h-3.5 w-3.5 shrink-0" />}
        <span>{isInstallable ? 'Install App' : isIOS ? 'Install on iOS' : 'Get App'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Install EdgeLedger on Desktop & Mobile
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Run EdgeLedger as a standalone app with offline access to your trades, charts, and plans.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 text-xs text-slate-700 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">iPhone / iPad (Safari)</p>
                <p>1. Open the Shared App URL directly in Safari (outside embedded previews).</p>
                <p>2. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</p>
                <p>3. Scroll down and tap <strong>Add to Home Screen</strong>.</p>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Android (Chrome)</p>
                  <p>Open the Shared App URL in Chrome, tap the menu (<strong>⋮</strong>), and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Windows / Mac / Linux (Chrome or Edge)</p>
                  <p>Open the Shared App URL in its own browser tab, then click the <strong>Install</strong> icon on the right side of the address bar (or browser menu → <strong>Install EdgeLedger</strong>).</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg no-print">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Offline Mode — Local journal data remains available</span>
    </div>
  );
};

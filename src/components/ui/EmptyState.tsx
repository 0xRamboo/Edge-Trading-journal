import React from 'react';
import { LucideIcon } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  showDemoOption?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryActionLabel,
  onPrimaryAction,
  showDemoOption = true,
}: EmptyStateProps) {
  const { loadDemoData, openTradeModal } = useJournal();

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-400">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {primaryActionLabel && onPrimaryAction ? (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            {primaryActionLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openTradeModal()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Log First Trade
          </button>
        )}
        {showDemoOption && (
          <button
            type="button"
            onClick={() => void loadDemoData()}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            Load Demo Data (~150 Trades)
          </button>
        )}
      </div>
    </div>
  );
}

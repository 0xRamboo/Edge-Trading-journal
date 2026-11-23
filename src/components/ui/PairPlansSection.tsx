import React, { useMemo, useState } from 'react';
import { Maximize2, Plus, Trash2, Upload, X } from 'lucide-react';
import { PairPlanEntry } from '../../types/trading';

interface PairPlansSectionProps {
  mode: 'daily' | 'weekly';
  pairPlans: PairPlanEntry[];
  onChange: (next: PairPlanEntry[]) => void;
  suggestedInstruments?: string[];
}

const DEFAULT_PAIRS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDJPY', 'BTCUSDT', 'ETHUSDT', 'NVDA', 'SPY'];

export function PairPlansSection({
  mode,
  pairPlans,
  onChange,
  suggestedInstruments = [],
}: PairPlansSectionProps) {
  const [newSymbol, setNewSymbol] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; title: string } | null>(null);

  const quickSuggestions = useMemo(() => {
    const merged = Array.from(new Set([...suggestedInstruments, ...DEFAULT_PAIRS]));
    const existing = new Set(pairPlans.map((p) => p.instrument.toUpperCase()));
    return merged.filter((sym) => !existing.has(sym)).slice(0, 8);
  }, [suggestedInstruments, pairPlans]);

  const addPair = (symbolRaw: string) => {
    const sym = symbolRaw.trim().toUpperCase();
    if (!sym) return;
    const entry: PairPlanEntry = {
      id: `pair-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      instrument: sym,
      bias: 'Neutral',
      keyLevels: '',
      planNotes: '',
      outcomeTag: 'Pending',
      outcomeReview: '',
    };
    onChange([...pairPlans, entry]);
    setNewSymbol('');
  };

  const updatePair = (id: string, patch: Partial<PairPlanEntry>) => {
    onChange(pairPlans.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePair = (id: string) => {
    onChange(pairPlans.filter((p) => p.id !== id));
  };

  const readImageFile = (file: File, onLoaded: (dataUrl: string) => void) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onLoaded(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePasteImage = (
    e: React.ClipboardEvent,
    id: string,
    field: 'preScreenshot' | 'afterScreenshot'
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          readImageFile(file, (url) => updatePair(id, { [field]: url }));
          break;
        }
      }
    }
  };

  const preLabel = mode === 'daily' ? 'Before (Pre-Market Chart)' : 'Before (Start-of-Week Chart)';
  const afterLabel = mode === 'daily' ? 'After (End-of-Day Chart)' : 'After (End-of-Week Chart)';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Pair-by-Pair Charts & Review ({pairPlans.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Attach Before & After chart screenshots per pair (upload, drop, or click a slot & paste Ctrl+V) to compare what you planned vs what happened.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPair(newSymbol);
              }
            }}
            placeholder="Add pair (e.g. XAUUSD)"
            className="w-40 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 font-mono text-xs uppercase text-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => addPair(newSymbol)}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" /> Add Pair
          </button>
        </div>
      </div>

      {/* Quick-add buttons for common pairs */}
      {quickSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 mr-1">Quick add:</span>
          {quickSuggestions.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => addPair(sym)}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              + {sym}
            </button>
          ))}
        </div>
      )}

      {pairPlans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-6 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
          No pair chart plans added for this {mode === 'daily' ? 'day' : 'week'} yet. Add a pair above to attach before & after screenshots and review notes.
        </div>
      ) : (
        <div className="space-y-5">
          {pairPlans.map((pair) => (
            <div
              key={pair.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-4"
            >
              {/* Pair Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={pair.instrument}
                    onChange={(e) => updatePair(pair.id, { instrument: e.target.value.toUpperCase() })}
                    className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-mono text-sm font-bold uppercase text-slate-900 dark:text-slate-100"
                  />

                  <select
                    value={pair.bias}
                    onChange={(e) =>
                      updatePair(pair.id, { bias: e.target.value as PairPlanEntry['bias'] })
                    }
                    className={`rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold ${
                      pair.bias === 'Bullish'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : pair.bias === 'Bearish'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <option value="Bullish">Bullish</option>
                    <option value="Bearish">Bearish</option>
                    <option value="Neutral">Neutral</option>
                    <option value="Range">Range</option>
                  </select>

                  <select
                    value={pair.outcomeTag}
                    onChange={(e) =>
                      updatePair(pair.id, { outcomeTag: e.target.value as PairPlanEntry['outcomeTag'] })
                    }
                    className={`rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium ${
                      pair.outcomeTag === 'Played Out'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : pair.outcomeTag === 'Invalidated' || pair.outcomeTag === 'Missed'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <option value="Pending">Outcome: Pending</option>
                    <option value="Played Out">Outcome: Played Out</option>
                    <option value="Invalidated">Outcome: Invalidated</option>
                    <option value="No Trigger">Outcome: No Trigger</option>
                    <option value="Missed">Outcome: Missed</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => removePair(pair.id)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>

              {/* Before vs After Screenshots + Notes */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* BEFORE */}
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{preLabel}</div>
                  <div
                    tabIndex={0}
                    onPaste={(e) => handlePasteImage(e, pair.id, 'preScreenshot')}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) readImageFile(file, (url) => updatePair(pair.id, { preScreenshot: url }));
                    }}
                    className="relative flex h-52 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    {pair.preScreenshot ? (
                      <>
                        <img
                          src={pair.preScreenshot}
                          alt={`${pair.instrument} pre-plan chart`}
                          onClick={() =>
                            setLightboxSrc({
                              src: pair.preScreenshot!,
                              title: `${pair.instrument} — ${preLabel}`,
                            })
                          }
                          className="h-full w-full cursor-zoom-in object-contain"
                        />
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxSrc({
                                src: pair.preScreenshot!,
                                title: `${pair.instrument} — ${preLabel}`,
                              })
                            }
                            className="rounded bg-black/70 p-1.5 text-white hover:bg-black"
                            title="Zoom Chart"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePair(pair.id, { preScreenshot: undefined })}
                            className="rounded bg-black/70 p-1.5 text-white hover:bg-red-600"
                            title="Remove Screenshot"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 p-4 text-center text-xs text-slate-500 hover:text-blue-500">
                        <Upload className="h-5 w-5" />
                        <span className="font-medium">Upload, drop, or click here & paste (Ctrl+V)</span>
                        <span className="text-[11px] text-slate-400">Marked-up TradingView / chart before session</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) readImageFile(f, (url) => updatePair(pair.id, { preScreenshot: url }));
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <input
                    type="text"
                    value={pair.keyLevels}
                    onChange={(e) => updatePair(pair.id, { keyLevels: e.target.value })}
                    placeholder="Key levels (e.g. Support 1.0810, Resistance 1.0900)"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs"
                  />
                  <textarea
                    rows={2}
                    value={pair.planNotes}
                    onChange={(e) => updatePair(pair.id, { planNotes: e.target.value })}
                    placeholder="Pre-plan narrative: setup conditions, sweep target, invalidation..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
                  />
                </div>

                {/* AFTER */}
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{afterLabel}</div>
                  <div
                    tabIndex={0}
                    onPaste={(e) => handlePasteImage(e, pair.id, 'afterScreenshot')}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) readImageFile(file, (url) => updatePair(pair.id, { afterScreenshot: url }));
                    }}
                    className="relative flex h-52 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    {pair.afterScreenshot ? (
                      <>
                        <img
                          src={pair.afterScreenshot}
                          alt={`${pair.instrument} after review chart`}
                          onClick={() =>
                            setLightboxSrc({
                              src: pair.afterScreenshot!,
                              title: `${pair.instrument} — ${afterLabel}`,
                            })
                          }
                          className="h-full w-full cursor-zoom-in object-contain"
                        />
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxSrc({
                                src: pair.afterScreenshot!,
                                title: `${pair.instrument} — ${afterLabel}`,
                              })
                            }
                            className="rounded bg-black/70 p-1.5 text-white hover:bg-black"
                            title="Zoom Chart"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePair(pair.id, { afterScreenshot: undefined })}
                            className="rounded bg-black/70 p-1.5 text-white hover:bg-red-600"
                            title="Remove Screenshot"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 p-4 text-center text-xs text-slate-500 hover:text-blue-500">
                        <Upload className="h-5 w-5" />
                        <span className="font-medium">Upload, drop, or click here & paste (Ctrl+V)</span>
                        <span className="text-[11px] text-slate-400">Result chart at end of {mode === 'daily' ? 'day' : 'week'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) readImageFile(f, (url) => updatePair(pair.id, { afterScreenshot: url }));
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <textarea
                    rows={4}
                    value={pair.outcomeReview}
                    onChange={(e) => updatePair(pair.id, { outcomeReview: e.target.value })}
                    placeholder={`What went well vs what went wrong on ${pair.instrument}? Did price respect your levels? Did you follow your plan?`}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal for Fullscreen Chart Inspection */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
          onClick={() => setLightboxSrc(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-6xl w-full rounded-xl border border-slate-700 bg-slate-950 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="font-mono text-xs font-semibold text-slate-200">{lightboxSrc.title}</span>
              <button
                type="button"
                onClick={() => setLightboxSrc(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={lightboxSrc.src}
              alt={lightboxSrc.title}
              className="max-h-[82vh] w-full rounded object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

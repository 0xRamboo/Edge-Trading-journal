import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Image as ImageIcon, Loader2, Save, Upload, X } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import { MarketType, Trade, TradeDirection } from '../../types/trading';
import { computeRiskAndR, computeTradeGrossPnl } from '../../utils/calculations';
import { localDateTimeToUtcIso, SUPPORTED_TIMEZONES } from '../../utils/timezone';

const TARGET_FIELDS = [
  { key: 'instrument', label: 'Instrument / Symbol *', required: true },
  { key: 'direction', label: 'Direction (LONG/SHORT) *', required: true },
  { key: 'openTime', label: 'Open Time *', required: true },
  { key: 'closeTime', label: 'Close Time', required: false },
  { key: 'entryPrice', label: 'Entry Price *', required: true },
  { key: 'exitPrice', label: 'Exit Price', required: false },
  { key: 'stopLoss', label: 'Stop Loss', required: false },
  { key: 'takeProfit', label: 'Take Profit', required: false },
  { key: 'size', label: 'Size / Volume *', required: true },
  { key: 'netPnl', label: 'Net P&L', required: false },
  { key: 'fees', label: 'Fees / Commission', required: false },
  { key: 'market', label: 'Market (forex/crypto/stocks)', required: false },
  { key: 'setup', label: 'Setup', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const;

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let curRow: string[] = [];
  let curField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        curField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        curField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        curRow.push(curField.trim());
        curField = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        curRow.push(curField.trim());
        if (curRow.some((c) => c.length > 0)) lines.push(curRow);
        curRow = [];
        curField = '';
      } else {
        curField += ch;
      }
    }
  }
  if (curField.length > 0 || curRow.length > 0) {
    curRow.push(curField.trim());
    if (curRow.some((c) => c.length > 0)) lines.push(curRow);
  }
  if (lines.length === 0) return { headers: [], rows: [] };
  return { headers: lines[0], rows: lines.slice(1) };
}

function autoGuessMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const lower = headers.map((h) => h.toLowerCase());
  const find = (patterns: string[]) => {
    const idx = lower.findIndex((h) => patterns.some((p) => h.includes(p)));
    return idx >= 0 ? headers[idx] : '';
  };
  map.instrument = find(['symbol', 'instrument', 'pair', 'ticker']);
  map.direction = find(['side', 'direction', 'type', 'action']);
  map.openTime = find(['open time', 'opentime', 'entry time', 'time', 'date']);
  map.closeTime = find(['close time', 'closetime', 'exit time']);
  map.entryPrice = find(['entry', 'open price', 'openprice', 'avg buy']);
  map.exitPrice = find(['exit', 'close price', 'closeprice']);
  map.stopLoss = find(['sl', 'stop loss', 'stoploss']);
  map.takeProfit = find(['tp', 'take profit', 'takeprofit']);
  map.size = find(['size', 'qty', 'quantity', 'volume', 'lots']);
  map.netPnl = find(['pnl', 'p&l', 'profit', 'net']);
  map.fees = find(['fee', 'commission', 'comm']);
  map.market = find(['market', 'asset']);
  map.setup = find(['setup']);
  map.notes = find(['note', 'comment']);
  return map;
}

export function TradeImportModal() {
  const {
    importModalState,
    closeImportModal,
    accounts,
    trades,
    csvPresets,
    settings,
    saveCsvPreset,
    saveTradesBulk,
    saveTrade,
    saveAccount,
    pushToast,
    selectedAccountId,
  } = useJournal();

  const { open, initialTab, backtestSessionId } = importModalState;
  const [tab, setTab] = useState<'csv' | 'screenshot'>(initialTab);

  React.useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  // CSV state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [csvAccountId, setCsvAccountId] = useState('');
  const [csvTimezone, setCsvTimezone] = useState(settings.timezone);
  const [presetName, setPresetName] = useState('');
  const [presetBroker, setPresetBroker] = useState('');
  const [importSummary, setImportSummary] = useState<{ added: number; skipped: number; errors: number; messages: string[] } | null>(null);

  // Screenshot AI extraction state
  const [ssImageUrl, setSsImageUrl] = useState('');
  const [ssMimeType, setSsMimeType] = useState('image/png');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedForm, setExtractedForm] = useState<{
    accountId: string;
    instrument: string;
    market: MarketType;
    direction: TradeDirection;
    entryPrice: string;
    exitPrice: string;
    stopLoss: string;
    takeProfit: string;
    size: string;
    openTime: string;
    closeTime: string;
    netPnl: string;
    fees: string;
    setup: string;
    notes: string;
  } | null>(null);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  React.useEffect(() => {
    if (open) {
      const def = selectedAccountId !== 'ALL' ? selectedAccountId : activeAccounts[0]?.id ?? '';
      setCsvAccountId(def);
      setCsvTimezone(settings.timezone);
      setImportSummary(null);
      setExtractError('');
    }
  }, [open, selectedAccountId, activeAccounts, settings.timezone]);

  if (!open) return null;

  const ensureAccountId = async (chosenId: string) => {
    if (chosenId) return chosenId;
    const autoAcc = {
      id: `acc-${Date.now()}`,
      name: 'Imported Account',
      broker: 'CSV / Screenshot',
      type: 'live' as const,
      startingBalance: 10000,
      currency: settings.displayCurrency || 'USD',
      commissionModel: 'zero' as const,
      commissionRate: 0,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    await saveAccount(autoAcc);
    return autoAcc.id;
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { headers, rows } = parseCsvText(text);
    setCsvHeaders(headers);
    setCsvRows(rows);
    setMapping(autoGuessMapping(headers));
    setImportSummary(null);
    e.target.value = '';
  };

  const applyPreset = (presetId: string) => {
    const p = csvPresets.find((x) => x.id === presetId);
    if (!p) return;
    setMapping(p.mapping);
    setCsvTimezone(p.timezone);
    pushToast('info', `Applied mapping preset "${p.name}".`);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      pushToast('error', 'Enter a preset name to save column mapping.');
      return;
    }
    await saveCsvPreset({
      id: `preset-${Date.now()}`,
      name: presetName.trim(),
      broker: presetBroker.trim() || 'Custom',
      timezone: csvTimezone,
      mapping,
      createdAt: new Date().toISOString(),
    });
    setPresetName('');
    setPresetBroker('');
    pushToast('success', 'Saved CSV mapping preset.');
  };

  const parseTimestamp = (raw: string): string => {
    if (!raw) return new Date().toISOString();
    // If already has Z or timezone offset, parse directly
    if (raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw)) {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
    // Normalize "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss" and apply csvTimezone
    const cleaned = raw.trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
      return localDateTimeToUtcIso(cleaned.slice(0, 16), csvTimezone);
    }
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
  };

  const handleCsvImport = async () => {
    if (csvRows.length === 0) return;
    const targetAccId = await ensureAccountId(csvAccountId);
    const colIdx = (field: string) => {
      const header = mapping[field];
      return header ? csvHeaders.indexOf(header) : -1;
    };

    const existingSigs = new Set(
      trades.map(
        (t) => `${t.instrument.toUpperCase()}|${t.direction}|${t.entryPrice}|${t.openTime.slice(0, 16)}`
      )
    );

    let added = 0;
    let skipped = 0;
    let errors = 0;
    const messages: string[] = [];
    const newTrades: Trade[] = [];

    csvRows.forEach((row, rIdx) => {
      try {
        const get = (f: string) => {
          const i = colIdx(f);
          return i >= 0 ? (row[i] ?? '').trim() : '';
        };
        const inst = get('instrument').toUpperCase();
        const rawDir = get('direction').toUpperCase();
        const direction: TradeDirection =
          rawDir.includes('SELL') || rawDir.includes('SHORT') ? 'SHORT' : 'LONG';
        const entryPrice = parseFloat(get('entryPrice'));
        const size = parseFloat(get('size'));
        const openIso = parseTimestamp(get('openTime'));

        if (!inst || !Number.isFinite(entryPrice) || !Number.isFinite(size) || size <= 0) {
          errors += 1;
          messages.push(`Row ${rIdx + 2}: missing instrument, entry price, or size.`);
          return;
        }

        const sig = `${inst}|${direction}|${entryPrice}|${openIso.slice(0, 16)}`;
        if (existingSigs.has(sig)) {
          skipped += 1;
          return;
        }
        existingSigs.add(sig);

        const exitStr = get('exitPrice');
        const exitPrice = exitStr ? parseFloat(exitStr) : null;
        const slStr = get('stopLoss');
        const stopLoss = slStr ? parseFloat(slStr) : null;
        const tpStr = get('takeProfit');
        const takeProfit = tpStr ? parseFloat(tpStr) : null;
        const closeRaw = get('closeTime');
        const closeIso = closeRaw ? parseTimestamp(closeRaw) : exitPrice !== null ? openIso : '';
        const feesVal = parseFloat(get('fees')) || 0;
        const rawMarket = get('market').toLowerCase();
        const market: MarketType =
          rawMarket === 'crypto' ? 'crypto' : rawMarket === 'stocks' ? 'stocks' : 'forex';
        const mult = market === 'forex' ? 100000 : 1;

        const explicitPnlStr = get('netPnl');
        const gross = computeTradeGrossPnl({
          direction,
          entryPrice,
          exitPrice,
          size,
          contractMultiplier: mult,
        });
        const netPnl = explicitPnlStr !== '' && Number.isFinite(parseFloat(explicitPnlStr))
          ? parseFloat(explicitPnlStr)
          : gross - feesVal;

        const risk = computeRiskAndR({
          entryPrice,
          stopLoss,
          takeProfit,
          size,
          contractMultiplier: mult,
          netPnl,
        });

        const holdMin =
          closeIso && openIso
            ? Math.max(0, Math.round((new Date(closeIso).getTime() - new Date(openIso).getTime()) / 60000))
            : 0;

        newTrades.push({
          id: `csv-${Date.now()}-${rIdx}`,
          accountId: targetAccId,
          market,
          instrument: inst,
          direction,
          status: exitPrice === null && explicitPnlStr === '' ? 'OPEN' : 'CLOSED',
          openTime: openIso,
          closeTime: closeIso,
          entryPrice,
          exitPrice,
          stopLoss,
          takeProfit,
          size,
          contractMultiplier: mult,
          initialRiskAmount: risk.initialRiskAmount,
          initialRiskPct: null,
          fees: feesVal,
          commission: 0,
          swap: 0,
          grossPnl: Number((netPnl + feesVal).toFixed(2)),
          netPnl: Number(netPnl.toFixed(2)),
          plannedRR: risk.plannedRR !== null ? Number(risk.plannedRR.toFixed(2)) : null,
          actualR: risk.actualR !== null ? Number(risk.actualR.toFixed(2)) : null,
          mae: null,
          mfe: null,
          holdingTimeMinutes: holdMin,
          setup: get('setup'),
          strategyId: '',
          session: 'London',
          emotionBefore: { score: 3, tag: 'Focused' },
          emotionDuring: { score: 3, tag: 'Calm' },
          emotionAfter: { score: 3, tag: 'Calm' },
          mistakeTags: [],
          customTags: ['csv-import'],
          rulesFollowed: true,
          checklistResult: { total: 0, completed: 0, requiredPassed: true, checkedRuleIds: [] },
          notes: get('notes'),
          screenshots: [],
          isBacktest: Boolean(backtestSessionId),
          backtestSessionId: backtestSessionId || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        added += 1;
      } catch {
        errors += 1;
        messages.push(`Row ${rIdx + 2}: parse failure.`);
      }
    });

    if (newTrades.length > 0) {
      await saveTradesBulk(newTrades);
    }
    setImportSummary({ added, skipped, errors, messages: messages.slice(0, 6) });
    pushToast('success', `CSV Import: ${added} added, ${skipped} duplicates skipped, ${errors} errors.`);
  };

  // Screenshot AI extraction
  const handleScreenshotFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSsMimeType(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      setSsImageUrl(dataUrl);
      setExtracting(true);
      setExtractError('');
      try {
        const res = await fetch('/api/ai/extract-trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: file.type || 'image/png',
            defaultCurrency: settings.displayCurrency,
            defaultTimezone: settings.timezone,
            provider: settings.aiProvider ?? 'auto',
            openRouterModel: settings.openRouterModel,
            groqModel: settings.groqModel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Extraction failed');
        const ex = data.extracted || {};
        setExtractedForm({
          accountId: csvAccountId,
          instrument: String(ex.instrument || 'EURUSD').toUpperCase(),
          market: ex.market === 'crypto' || ex.market === 'stocks' ? ex.market : 'forex',
          direction: String(ex.direction).toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
          entryPrice: ex.entryPrice ? String(ex.entryPrice) : '',
          exitPrice: ex.exitPrice ? String(ex.exitPrice) : '',
          stopLoss: ex.stopLoss ? String(ex.stopLoss) : '',
          takeProfit: ex.takeProfit ? String(ex.takeProfit) : '',
          size: ex.size ? String(ex.size) : '1',
          openTime: ex.openTime || new Date().toISOString().slice(0, 16),
          closeTime: ex.closeTime || new Date().toISOString().slice(0, 16),
          netPnl: ex.netPnl !== undefined ? String(ex.netPnl) : '0',
          fees: ex.fees !== undefined ? String(ex.fees) : '0',
          setup: ex.setup || '',
          notes: ex.extractionNotes || '',
        });
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : 'AI vision extraction failed.');
      } finally {
        setExtracting(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveExtracted = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractedForm) return;
    const targetAccId = await ensureAccountId(extractedForm.accountId);
    const ep = parseFloat(extractedForm.entryPrice) || 0;
    const xp = extractedForm.exitPrice ? parseFloat(extractedForm.exitPrice) : null;
    const sl = extractedForm.stopLoss ? parseFloat(extractedForm.stopLoss) : null;
    const tp = extractedForm.takeProfit ? parseFloat(extractedForm.takeProfit) : null;
    const sz = parseFloat(extractedForm.size) || 1;
    const feesVal = parseFloat(extractedForm.fees) || 0;
    const pnlVal = parseFloat(extractedForm.netPnl) || 0;
    const mult = extractedForm.market === 'forex' ? 100000 : 1;

    const risk = computeRiskAndR({
      entryPrice: ep,
      stopLoss: sl,
      takeProfit: tp,
      size: sz,
      contractMultiplier: mult,
      netPnl: pnlVal,
    });

    const openIso = parseTimestamp(extractedForm.openTime);
    const closeIso = extractedForm.closeTime ? parseTimestamp(extractedForm.closeTime) : '';

    await saveTrade({
      id: `ss-tr-${Date.now()}`,
      accountId: targetAccId,
      market: extractedForm.market,
      instrument: extractedForm.instrument.toUpperCase(),
      direction: extractedForm.direction,
      status: xp === null ? 'OPEN' : 'CLOSED',
      openTime: openIso,
      closeTime: closeIso,
      entryPrice: ep,
      exitPrice: xp,
      stopLoss: sl,
      takeProfit: tp,
      size: sz,
      contractMultiplier: mult,
      initialRiskAmount: risk.initialRiskAmount,
      initialRiskPct: null,
      fees: feesVal,
      commission: 0,
      swap: 0,
      grossPnl: pnlVal + feesVal,
      netPnl: pnlVal,
      plannedRR: risk.plannedRR !== null ? Number(risk.plannedRR.toFixed(2)) : null,
      actualR: risk.actualR !== null ? Number(risk.actualR.toFixed(2)) : null,
      mae: null,
      mfe: null,
      holdingTimeMinutes:
        closeIso && openIso
          ? Math.max(0, Math.round((new Date(closeIso).getTime() - new Date(openIso).getTime()) / 60000))
          : 0,
      setup: extractedForm.setup,
      strategyId: '',
      session: 'London',
      emotionBefore: { score: 3, tag: 'Focused' },
      emotionDuring: { score: 3, tag: 'Calm' },
      emotionAfter: { score: 3, tag: 'Calm' },
      mistakeTags: [],
      customTags: ['screenshot-import'],
      rulesFollowed: true,
      checklistResult: { total: 0, completed: 0, requiredPassed: true, checkedRuleIds: [] },
      notes: extractedForm.notes,
      screenshots: ssImageUrl ? [{ id: `ss-${Date.now()}`, stage: 'entry', dataUrl: ssImageUrl }] : [],
      isBacktest: Boolean(backtestSessionId),
      backtestSessionId: backtestSessionId || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    pushToast('success', `Saved ${extractedForm.instrument} trade with attached screenshot.`);
    setSsImageUrl('');
    setExtractedForm(null);
    closeImportModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import Trades</h2>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setTab('csv')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === 'csv'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV Upload
              </button>
              <button
                type="button"
                onClick={() => setTab('screenshot')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === 'screenshot'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> AI Screenshot Vision
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={closeImportModal}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'csv' ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Target Account
                  </label>
                  <select
                    value={csvAccountId}
                    onChange={(e) => setCsvAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {activeAccounts.length === 0 && <option value="">Default Account (Auto)</option>}
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.broker})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    CSV Source Timezone
                  </label>
                  <select
                    value={csvTimezone}
                    onChange={(e) => setCsvTimezone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Saved Broker Preset
                  </label>
                  <select
                    onChange={(e) => applyPreset(e.target.value)}
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="" disabled>
                      Load saved mapping...
                    </option>
                    {csvPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.broker})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 py-8 hover:border-blue-500 transition-colors">
                <Upload className="h-7 w-7 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Click to upload broker CSV file
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  Supports MT4/MT5, TradingView, IBKR, Bybit, Binance, or custom exports
                </span>
                <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
              </label>

              {csvHeaders.length > 0 && (
                <>
                  {/* Column Mapping */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Column Mapping ({csvRows.length} rows detected)
                      </h3>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="Preset name"
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs"
                        />
                        <input
                          type="text"
                          value={presetBroker}
                          onChange={(e) => setPresetBroker(e.target.value)}
                          placeholder="Broker"
                          className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSavePreset()}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Save className="h-3.5 w-3.5" /> Save Preset
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {TARGET_FIELDS.map((tf) => (
                        <div key={tf.key}>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            {tf.label}
                          </label>
                          <select
                            value={mapping[tf.key] ?? ''}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [tf.key]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          >
                            <option value="">— Ignore —</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div>
                    <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Preview (first 5 rows)
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                          <tr>
                            {csvHeaders.slice(0, 8).map((h) => (
                              <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                          {csvRows.slice(0, 5).map((r, i) => (
                            <tr key={i}>
                              {csvHeaders.slice(0, 8).map((_, c) => (
                                <td key={c} className="px-3 py-1.5 whitespace-nowrap text-slate-700 dark:text-slate-300">
                                  {r[c] ?? ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {importSummary && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm">
                      <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Import Complete: {importSummary.added} added · {importSummary.skipped} skipped (duplicates) ·{' '}
                        {importSummary.errors} errors
                      </div>
                      {importSummary.messages.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">
                          {importSummary.messages.map((m, idx) => (
                            <li key={idx}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleCsvImport()}
                      className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Run Import ({csvRows.length} rows)
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 py-8 hover:border-blue-500 transition-colors">
                {extracting ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Analyzing trade screenshot with AI vision...
                    </span>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="h-7 w-7 text-slate-400 mb-2" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Upload TradingView, MT5, or Exchange Execution Screenshot
                    </span>
                    <span className="mt-1 text-xs text-slate-500">
                      Extracts instrument, direction, entry/exit/SL/TP, size, time & P&L for confirmation
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={extracting}
                  onChange={handleScreenshotFile}
                  className="hidden"
                />
              </label>

              {extractError && (
                <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                  {extractError}
                </div>
              )}

              {ssImageUrl && extractedForm && (
                <form onSubmit={handleSaveExtracted} className="grid gap-6 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <img
                      src={ssImageUrl}
                      alt="Uploaded trade screenshot"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                    />
                  </div>
                  <div className="space-y-3 md:col-span-7">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Verify Extracted Trade Fields
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Account</label>
                        <select
                          value={extractedForm.accountId}
                          onChange={(e) => setExtractedForm({ ...extractedForm, accountId: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                        >
                          {activeAccounts.length === 0 && <option value="">Default Account (Auto)</option>}
                          {activeAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Instrument</label>
                        <input
                          type="text"
                          value={extractedForm.instrument}
                          onChange={(e) => setExtractedForm({ ...extractedForm, instrument: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs uppercase"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Direction</label>
                        <select
                          value={extractedForm.direction}
                          onChange={(e) =>
                            setExtractedForm({ ...extractedForm, direction: e.target.value as TradeDirection })
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                        >
                          <option value="LONG">LONG</option>
                          <option value="SHORT">SHORT</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Market</label>
                        <select
                          value={extractedForm.market}
                          onChange={(e) =>
                            setExtractedForm({ ...extractedForm, market: e.target.value as MarketType })
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                        >
                          <option value="forex">Forex</option>
                          <option value="crypto">Crypto</option>
                          <option value="stocks">Stocks</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Entry Price</label>
                        <input
                          type="number"
                          step="any"
                          value={extractedForm.entryPrice}
                          onChange={(e) => setExtractedForm({ ...extractedForm, entryPrice: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Exit Price</label>
                        <input
                          type="number"
                          step="any"
                          value={extractedForm.exitPrice}
                          onChange={(e) => setExtractedForm({ ...extractedForm, exitPrice: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Stop Loss</label>
                        <input
                          type="number"
                          step="any"
                          value={extractedForm.stopLoss}
                          onChange={(e) => setExtractedForm({ ...extractedForm, stopLoss: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Take Profit</label>
                        <input
                          type="number"
                          step="any"
                          value={extractedForm.takeProfit}
                          onChange={(e) => setExtractedForm({ ...extractedForm, takeProfit: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Size</label>
                        <input
                          type="number"
                          step="any"
                          value={extractedForm.size}
                          onChange={(e) => setExtractedForm({ ...extractedForm, size: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Net P&L</label>
                        <input
                          type="number"
                          step="any"
                          value={extractedForm.netPnl}
                          onChange={(e) => setExtractedForm({ ...extractedForm, netPnl: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Open Time</label>
                        <input
                          type="text"
                          value={extractedForm.openTime}
                          onChange={(e) => setExtractedForm({ ...extractedForm, openTime: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Close Time</label>
                        <input
                          type="text"
                          value={extractedForm.closeTime}
                          onChange={(e) => setExtractedForm({ ...extractedForm, closeTime: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Notes</label>
                      <textarea
                        rows={2}
                        value={extractedForm.notes}
                        onChange={(e) => setExtractedForm({ ...extractedForm, notes: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Confirm & Save Trade + Attach Screenshot
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

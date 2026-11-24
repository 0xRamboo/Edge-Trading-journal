import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Save, Upload, X } from 'lucide-react';
import { useJournal } from '../../context/JournalContext';
import { MarketType, Trade, TradeDirection } from '../../types/trading';
import {
  computeRiskAndR,
  computeTradeGrossPnl,
  inferMarketAndMultiplier,
  parsePositivePrice,
} from '../../utils/calculations';
import { parseApiJson, prepareScreenshotForVision } from '../../utils/api';
import { chunkPdfPages, extractPdfContent } from '../../utils/pdfImport';
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
  const [tab, setTab] = useState<'csv' | 'pdf' | 'screenshot'>(initialTab);

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

  // Screenshot & PDF AI extraction state
  type ExtractedTradeRow = {
    id: string;
    selected: boolean;
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
  };
  const [ssImageUrl, setSsImageUrl] = useState('');
  const [ssMimeType, setSsMimeType] = useState('image/png');
  const [ssAccountId, setSsAccountId] = useState('');
  const [attachSsToTrades, setAttachSsToTrades] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedRows, setExtractedRows] = useState<ExtractedTradeRow[]>([]);

  // PDF statement state
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfAccountId, setPdfAccountId] = useState('');
  const [pdfTimezone, setPdfTimezone] = useState(settings.timezone);
  const [pdfProgress, setPdfProgress] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfRows, setPdfRows] = useState<ExtractedTradeRow[]>([]);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  React.useEffect(() => {
    if (open) {
      const def = selectedAccountId !== 'ALL' ? selectedAccountId : activeAccounts[0]?.id ?? '';
      setCsvAccountId(def);
      setSsAccountId(def);
      setPdfAccountId(def);
      setCsvTimezone(settings.timezone);
      setPdfTimezone(settings.timezone);
      setImportSummary(null);
      setExtractError('');
      setPdfError('');
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

  const parseTimestamp = (raw: string, tzOverride?: string): string => {
    const tz = tzOverride || csvTimezone;
    if (!raw) return new Date().toISOString();
    // If already has Z or timezone offset, parse directly
    if (raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw)) {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
    // Normalize "YYYY.MM.DD HH:mm:ss" or "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss" and apply timezone
    const cleaned = raw
      .trim()
      .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')
      .replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
      return localDateTimeToUtcIso(cleaned.slice(0, 16), tz);
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

        const exitPrice = parsePositivePrice(get('exitPrice'));
        const stopLoss = parsePositivePrice(get('stopLoss'));
        const takeProfit = parsePositivePrice(get('takeProfit'));
        const closeRaw = get('closeTime');
        const closeIso = closeRaw ? parseTimestamp(closeRaw) : exitPrice !== null ? openIso : '';
        const feesVal = parseFloat(get('fees')) || 0;
        const rawMarket = get('market').toLowerCase();
        const { market, multiplier: mult } = inferMarketAndMultiplier(inst, rawMarket || undefined);

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
          direction,
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
    e.target.value = '';
    setExtracting(true);
    setExtractError('');
    setExtractedRows([]);
    try {
      const { dataUrl, mimeType } = await prepareScreenshotForVision(file);
      setSsMimeType(mimeType);
      setSsImageUrl(dataUrl);

      const res = await fetch('/api/ai/extract-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType,
          defaultCurrency: settings.displayCurrency,
          defaultTimezone: settings.timezone,
          provider: settings.aiProvider ?? 'auto',
          openRouterModel: settings.openRouterModel,
          groqModel: settings.groqModel,
        }),
      });
      const data = await parseApiJson<{
        trades?: Array<Record<string, unknown>>;
        extracted?: Record<string, unknown>;
      }>(res, 'Screenshot extraction failed');

      const rawItems = Array.isArray(data.trades) && data.trades.length > 0
        ? data.trades
        : data.extracted && Object.keys(data.extracted).length > 0
          ? [data.extracted]
          : [];

      if (rawItems.length === 0) {
        throw new Error('No trades were detected in this screenshot.');
      }

      const nowIsoShort = new Date().toISOString().slice(0, 16);
      const mappedRows: ExtractedTradeRow[] = rawItems.map((ex, idx) => {
        const closeStr = typeof ex.closeTime === 'string' && ex.closeTime ? ex.closeTime : nowIsoShort;
        const openStr = typeof ex.openTime === 'string' && ex.openTime ? ex.openTime : closeStr;
        const inst = String(ex.instrument || 'EURUSD').trim().toUpperCase();
        const inferred = inferMarketAndMultiplier(inst, typeof ex.market === 'string' ? ex.market : undefined);
        const ep = parsePositivePrice(ex.entryPrice);
        const xp = parsePositivePrice(ex.exitPrice);
        const sl = parsePositivePrice(ex.stopLoss);
        const tp = parsePositivePrice(ex.takeProfit);
        return {
          id: `ext-${Date.now()}-${idx}`,
          selected: true,
          instrument: inst,
          market: inferred.market,
          direction: String(ex.direction).toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
          entryPrice: ep !== null ? String(ep) : '',
          exitPrice: xp !== null ? String(xp) : '',
          stopLoss: sl !== null ? String(sl) : '',
          takeProfit: tp !== null ? String(tp) : '',
          size: ex.size !== undefined && ex.size !== null && Number(ex.size) > 0 ? String(ex.size) : '0.01',
          openTime: openStr,
          closeTime: closeStr,
          netPnl: ex.netPnl !== undefined && ex.netPnl !== null ? String(ex.netPnl) : '0',
          fees: ex.fees !== undefined && ex.fees !== null ? String(ex.fees) : '0',
          setup: typeof ex.setup === 'string' ? ex.setup : '',
          notes: typeof ex.extractionNotes === 'string' ? ex.extractionNotes : '',
        };
      });

      setExtractedRows(mappedRows);
      pushToast(
        'success',
        `Detected ${mappedRows.length} trade${mappedRows.length > 1 ? 's' : ''} from screenshot.`
      );
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'AI vision extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  const updateExtractedRow = (id: string, patch: Partial<ExtractedTradeRow>) => {
    setExtractedRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSaveExtracted = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenRows = extractedRows.filter((r) => r.selected);
    if (chosenRows.length === 0) {
      pushToast('error', 'Select at least one extracted trade to save.');
      return;
    }

    const targetAccId = await ensureAccountId(ssAccountId);
    const baseTs = Date.now();
    const tradesToSave: Trade[] = chosenRows.map((row, idx) => {
      const ep = parseFloat(row.entryPrice) || 0;
      const xp = parsePositivePrice(row.exitPrice);
      const sl = parsePositivePrice(row.stopLoss);
      const tp = parsePositivePrice(row.takeProfit);
      const sz = parseFloat(row.size) || 0.01;
      const feesVal = parseFloat(row.fees) || 0;
      const pnlVal = parseFloat(row.netPnl) || 0;
      const instUpper = row.instrument.trim().toUpperCase() || 'UNKNOWN';
      const { market, multiplier: mult } = inferMarketAndMultiplier(instUpper, row.market);

      const risk = computeRiskAndR({
        entryPrice: ep,
        stopLoss: sl,
        takeProfit: tp,
        size: sz,
        contractMultiplier: mult,
        netPnl: pnlVal,
        direction: row.direction,
      });

      const openIso = parseTimestamp(row.openTime);
      const closeIso = row.closeTime ? parseTimestamp(row.closeTime) : '';

      return {
        id: `ss-tr-${baseTs}-${idx}`,
        accountId: targetAccId,
        market,
        instrument: instUpper,
        direction: row.direction,
        status: xp === null && pnlVal === 0 ? 'OPEN' : 'CLOSED',
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
        setup: row.setup,
        strategyId: '',
        session: 'London',
        emotionBefore: { score: 3, tag: 'Focused' },
        emotionDuring: { score: 3, tag: 'Calm' },
        emotionAfter: { score: 3, tag: 'Calm' },
        mistakeTags: [],
        customTags: ['screenshot-import'],
        rulesFollowed: true,
        checklistResult: { total: 0, completed: 0, requiredPassed: true, checkedRuleIds: [] },
        notes: row.notes,
        screenshots:
          attachSsToTrades && ssImageUrl
            ? [{ id: `ss-${baseTs}-${idx}`, stage: 'entry', dataUrl: ssImageUrl }]
            : [],
        isBacktest: Boolean(backtestSessionId),
        backtestSessionId: backtestSessionId || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    if (tradesToSave.length === 1) {
      await saveTrade(tradesToSave[0]);
      pushToast('success', `Saved ${tradesToSave[0].instrument} trade from screenshot.`);
    } else {
      await saveTradesBulk(tradesToSave);
      pushToast('success', `Imported ${tradesToSave.length} trades from screenshot.`);
    }

    setSsImageUrl('');
    setExtractedRows([]);
    closeImportModal();
  };

  // PDF Statement extraction
  const mapRawExtractedItems = (rawItems: Array<Record<string, unknown>>, prefix: string): ExtractedTradeRow[] => {
    const nowIsoShort = new Date().toISOString().slice(0, 16);
    return rawItems.map((ex, idx) => {
      const closeStr = typeof ex.closeTime === 'string' && ex.closeTime ? ex.closeTime : nowIsoShort;
      const openStr = typeof ex.openTime === 'string' && ex.openTime ? ex.openTime : closeStr;
      const inst = String(ex.instrument || 'EURUSD').trim().toUpperCase();
      const inferred = inferMarketAndMultiplier(inst, typeof ex.market === 'string' ? ex.market : undefined);
      const ep = parsePositivePrice(ex.entryPrice);
      const xp = parsePositivePrice(ex.exitPrice);
      const sl = parsePositivePrice(ex.stopLoss);
      const tp = parsePositivePrice(ex.takeProfit);
      return {
        id: `${prefix}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        selected: true,
        instrument: inst,
        market: inferred.market,
        direction: String(ex.direction).toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
        entryPrice: ep !== null ? String(ep) : '',
        exitPrice: xp !== null ? String(xp) : '',
        stopLoss: sl !== null ? String(sl) : '',
        takeProfit: tp !== null ? String(tp) : '',
        size: ex.size !== undefined && ex.size !== null && Number(ex.size) > 0 ? String(ex.size) : '0.01',
        openTime: openStr,
        closeTime: closeStr,
        netPnl: ex.netPnl !== undefined && ex.netPnl !== null ? String(ex.netPnl) : '0',
        fees: ex.fees !== undefined && ex.fees !== null ? String(ex.fees) : '0',
        setup: typeof ex.setup === 'string' ? ex.setup : '',
        notes: typeof ex.extractionNotes === 'string' ? ex.extractionNotes : '',
      };
    });
  };

  const handlePdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPdfFileName(file.name);
    setPdfPageCount(0);
    setPdfExtracting(true);
    setPdfError('');
    setPdfRows([]);
    setPdfProgress('Reading PDF pages...');

    try {
      const pdfContent = await extractPdfContent(file);
      setPdfPageCount(pdfContent.pageCount);

      const collected: ExtractedTradeRow[] = [];

      const extractTextChunk = async (chunkText: string, label: string, depth = 0): Promise<ExtractedTradeRow[]> => {
        const res = await fetch('/api/ai/extract-pdf-trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfText: chunkText,
            fileName: file.name,
            defaultCurrency: settings.displayCurrency,
            defaultTimezone: pdfTimezone,
            provider: settings.aiProvider ?? 'auto',
            openRouterModel: settings.openRouterModel,
            groqModel: settings.groqModel,
          }),
        });
        const data = await parseApiJson<{
          trades?: Array<Record<string, unknown>>;
          truncated?: boolean;
        }>(res, 'PDF trade extraction failed');

        const lines = chunkText.split('\n').filter((l) => l.trim().length > 0);
        if (data.truncated && depth < 2 && lines.length >= 6) {
          const mid = Math.ceil(lines.length / 2);
          const firstHalf = lines.slice(0, mid).join('\n');
          const secondHalf = lines.slice(mid).join('\n');
          setPdfProgress(`Batch ${label} was dense — splitting into smaller sections to capture every trade...`);
          const a = await extractTextChunk(firstHalf, `${label}a`, depth + 1);
          const b = await extractTextChunk(secondHalf, `${label}b`, depth + 1);
          return [...a, ...b];
        }

        if (Array.isArray(data.trades) && data.trades.length > 0) {
          return mapRawExtractedItems(data.trades, `pdf-${label}`);
        }
        return [];
      };

      if (pdfContent.totalTextChars >= 80) {
        const chunks = chunkPdfPages(pdfContent.pagesText, 3500);
        for (let i = 0; i < chunks.length; i++) {
          setPdfProgress(
            `Parsing statement batch ${i + 1} of ${chunks.length} (${pdfContent.pageCount} page${pdfContent.pageCount === 1 ? '' : 's'})...`
          );
          const rowsFromChunk = await extractTextChunk(chunks[i], `b${i}`);
          collected.push(...rowsFromChunk);
        }
      } else if (pdfContent.scannedPageImages.length > 0) {
        for (let i = 0; i < pdfContent.scannedPageImages.length; i++) {
          const pg = pdfContent.scannedPageImages[i];
          setPdfProgress(
            `Scanned PDF detected — scanning page ${pg.pageNumber} of ${pdfContent.scannedPageImages.length} with AI vision...`
          );
          const res = await fetch('/api/ai/extract-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: pg.dataUrl,
              mimeType: pg.mimeType,
              defaultCurrency: settings.displayCurrency,
              defaultTimezone: pdfTimezone,
              provider: settings.aiProvider ?? 'auto',
              openRouterModel: settings.openRouterModel,
              groqModel: settings.groqModel,
            }),
          });
          const data = await parseApiJson<{ trades?: Array<Record<string, unknown>> }>(
            res,
            'Scanned PDF vision extraction failed'
          );
          if (Array.isArray(data.trades) && data.trades.length > 0) {
            collected.push(...mapRawExtractedItems(data.trades, `pdf-pg${pg.pageNumber}`));
          }
        }
      } else {
        throw new Error('Could not find readable text or pages in this PDF.');
      }

      const seenRowKeys = new Set<string>();
      const uniqueCollected = collected.filter((r) => {
        const k = `${r.instrument}|${r.direction}|${r.openTime}|${r.entryPrice}|${r.size}|${r.netPnl}`;
        if (seenRowKeys.has(k)) return false;
        seenRowKeys.add(k);
        return true;
      });

      if (uniqueCollected.length === 0) {
        throw new Error('No trades were detected in this PDF statement.');
      }

      setPdfRows(uniqueCollected);
      pushToast(
        'success',
        `Extracted ${uniqueCollected.length} trade${uniqueCollected.length === 1 ? '' : 's'} from ${file.name}.`
      );
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to parse PDF statement.');
    } finally {
      setPdfExtracting(false);
      setPdfProgress('');
    }
  };

  const updatePdfRow = (id: string, patch: Partial<ExtractedTradeRow>) => {
    setPdfRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSavePdfTrades = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenRows = pdfRows.filter((r) => r.selected);
    if (chosenRows.length === 0) {
      pushToast('error', 'Select at least one trade from the PDF to import.');
      return;
    }

    const targetAccId = await ensureAccountId(pdfAccountId);
    const baseTs = Date.now();

    const existingKeys = new Set(
      trades
        .filter((t) => t.accountId === targetAccId)
        .map((t) => `${t.instrument}|${t.direction}|${t.openTime.slice(0, 16)}|${t.entryPrice}|${t.size}`)
    );

    const toSave: Trade[] = [];
    let skipped = 0;

    chosenRows.forEach((row, idx) => {
      const ep = parseFloat(row.entryPrice) || 0;
      const xp = parsePositivePrice(row.exitPrice);
      const sl = parsePositivePrice(row.stopLoss);
      const tp = parsePositivePrice(row.takeProfit);
      const sz = parseFloat(row.size) || 0.01;
      const feesVal = parseFloat(row.fees) || 0;
      const pnlVal = parseFloat(row.netPnl) || 0;
      const instUpper = row.instrument.trim().toUpperCase() || 'UNKNOWN';
      const openIso = parseTimestamp(row.openTime, pdfTimezone);
      const closeIso = row.closeTime ? parseTimestamp(row.closeTime, pdfTimezone) : '';

      const dedupeKey = `${instUpper}|${row.direction}|${openIso.slice(0, 16)}|${ep}|${sz}`;
      if (existingKeys.has(dedupeKey)) {
        skipped += 1;
        return;
      }
      existingKeys.add(dedupeKey);

      const { market, multiplier: mult } = inferMarketAndMultiplier(instUpper, row.market);

      const risk = computeRiskAndR({
        entryPrice: ep,
        stopLoss: sl,
        takeProfit: tp,
        size: sz,
        contractMultiplier: mult,
        netPnl: pnlVal,
        direction: row.direction,
      });

      toSave.push({
        id: `pdf-tr-${baseTs}-${idx}`,
        accountId: targetAccId,
        market,
        instrument: instUpper,
        direction: row.direction,
        status: xp === null && pnlVal === 0 ? 'OPEN' : 'CLOSED',
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
        commission: feesVal,
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
        setup: row.setup,
        strategyId: '',
        session: 'London',
        emotionBefore: { score: 3, tag: 'Focused' },
        emotionDuring: { score: 3, tag: 'Calm' },
        emotionAfter: { score: 3, tag: 'Calm' },
        mistakeTags: [],
        customTags: ['pdf-import'],
        rulesFollowed: true,
        checklistResult: { total: 0, completed: 0, requiredPassed: true, checkedRuleIds: [] },
        notes: row.notes || (pdfFileName ? `Imported from ${pdfFileName}` : ''),
        screenshots: [],
        isBacktest: Boolean(backtestSessionId),
        backtestSessionId: backtestSessionId || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    if (toSave.length > 0) {
      await saveTradesBulk(toSave);
    }

    pushToast(
      'success',
      `PDF Import: ${toSave.length} added${skipped > 0 ? `, ${skipped} duplicates skipped` : ''}.`
    );
    setPdfRows([]);
    setPdfFileName('');
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
                onClick={() => setTab('pdf')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === 'pdf'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileText className="h-3.5 w-3.5" /> PDF Statement
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
          ) : tab === 'pdf' ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Target Account
                  </label>
                  <select
                    value={pdfAccountId}
                    onChange={(e) => setPdfAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {activeAccounts.length === 0 && <option value="">Default Account (Auto-Create)</option>}
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Statement Timestamp Timezone
                  </label>
                  <select
                    value={pdfTimezone}
                    onChange={(e) => setPdfTimezone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 py-8 hover:border-blue-500 transition-colors">
                {pdfExtracting ? (
                  <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {pdfProgress || 'Extracting trades from PDF...'}
                    </span>
                  </div>
                ) : (
                  <>
                    <FileText className="h-7 w-7 text-slate-400 mb-2" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 text-center px-4">
                      {pdfFileName
                        ? `${pdfFileName} (${pdfPageCount} page${pdfPageCount === 1 ? '' : 's'}) — Click to upload another PDF`
                        : 'Upload Broker / MT4 / MT5 / Exchange Statement PDF'}
                    </span>
                    <span className="mt-1 text-xs text-slate-500 text-center px-4">
                      Supports multi-page broker statements &amp; scanned PDFs (duplicates automatically skipped)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={pdfExtracting}
                  onChange={handlePdfFile}
                  className="hidden"
                />
              </label>

              {pdfError && (
                <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                  {pdfError}
                </div>
              )}

              {pdfRows.length > 0 && (() => {
                const selectedCount = pdfRows.filter((r) => r.selected).length;
                const allSelected = selectedCount === pdfRows.length;
                return (
                  <form onSubmit={handleSavePdfTrades} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Extracted {pdfRows.length} Trade{pdfRows.length === 1 ? '' : 's'} from PDF
                        </h3>
                        <p className="text-xs text-slate-500">
                          Review, edit, or uncheck any row before importing.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPdfRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })))
                        }
                        className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {pdfRows.map((row, idx) => (
                        <div
                          key={row.id}
                          className={`rounded-lg border p-3 transition-colors ${
                            row.selected
                              ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/70'
                              : 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/30 opacity-60'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={(e) => updatePdfRow(row.id, { selected: e.target.checked })}
                                className="rounded border-slate-300 dark:border-slate-700"
                              />
                              <span>Trade #{idx + 1}</span>
                            </label>
                            <span
                              className={`font-mono text-xs font-semibold ${
                                (parseFloat(row.netPnl) || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                              }`}
                            >
                              {(parseFloat(row.netPnl) || 0) >= 0 ? '+' : ''}
                              {row.netPnl || '0'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Instrument</label>
                              <input
                                type="text"
                                value={row.instrument}
                                onChange={(e) => updatePdfRow(row.id, { instrument: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs uppercase"
                                required={row.selected}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Direction</label>
                              <select
                                value={row.direction}
                                onChange={(e) =>
                                  updatePdfRow(row.id, { direction: e.target.value as TradeDirection })
                                }
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                              >
                                <option value="LONG">LONG</option>
                                <option value="SHORT">SHORT</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Market</label>
                              <select
                                value={row.market}
                                onChange={(e) =>
                                  updatePdfRow(row.id, { market: e.target.value as MarketType })
                                }
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                              >
                                <option value="forex">Forex</option>
                                <option value="crypto">Crypto</option>
                                <option value="stocks">Stocks</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Size</label>
                              <input
                                type="number"
                                step="any"
                                value={row.size}
                                onChange={(e) => updatePdfRow(row.id, { size: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Fees</label>
                              <input
                                type="number"
                                step="any"
                                value={row.fees}
                                onChange={(e) => updatePdfRow(row.id, { fees: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Net P&L</label>
                              <input
                                type="number"
                                step="any"
                                value={row.netPnl}
                                onChange={(e) => updatePdfRow(row.id, { netPnl: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Entry</label>
                              <input
                                type="number"
                                step="any"
                                value={row.entryPrice}
                                onChange={(e) => updatePdfRow(row.id, { entryPrice: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Exit</label>
                              <input
                                type="number"
                                step="any"
                                value={row.exitPrice}
                                onChange={(e) => updatePdfRow(row.id, { exitPrice: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">S/L</label>
                              <input
                                type="number"
                                step="any"
                                value={row.stopLoss}
                                placeholder="N/A"
                                onChange={(e) => updatePdfRow(row.id, { stopLoss: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">T/P</label>
                              <input
                                type="number"
                                step="any"
                                value={row.takeProfit}
                                placeholder="N/A"
                                onChange={(e) => updatePdfRow(row.id, { takeProfit: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Open Time</label>
                              <input
                                type="text"
                                value={row.openTime}
                                onChange={(e) => updatePdfRow(row.id, { openTime: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-0.5">Close Time</label>
                              <input
                                type="text"
                                value={row.closeTime}
                                onChange={(e) => updatePdfRow(row.id, { closeTime: e.target.value })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={selectedCount === 0}
                      className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Confirm &amp; Import {selectedCount} Selected Trade{selectedCount === 1 ? '' : 's'}
                    </button>
                  </form>
                );
              })()}
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
                    <span className="mt-1 text-xs text-slate-500 text-center px-4">
                      Supports both single chart setups and multi-trade broker/MT5 history lists
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

              {ssImageUrl && extractedRows.length === 1 && (() => {
                const row = extractedRows[0];
                return (
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
                            value={ssAccountId}
                            onChange={(e) => setSsAccountId(e.target.value)}
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
                            value={row.instrument}
                            onChange={(e) => updateExtractedRow(row.id, { instrument: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs uppercase"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Direction</label>
                          <select
                            value={row.direction}
                            onChange={(e) =>
                              updateExtractedRow(row.id, { direction: e.target.value as TradeDirection })
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
                            value={row.market}
                            onChange={(e) =>
                              updateExtractedRow(row.id, { market: e.target.value as MarketType })
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
                            value={row.entryPrice}
                            onChange={(e) => updateExtractedRow(row.id, { entryPrice: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Exit Price</label>
                          <input
                            type="number"
                            step="any"
                            value={row.exitPrice}
                            onChange={(e) => updateExtractedRow(row.id, { exitPrice: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Stop Loss</label>
                          <input
                            type="number"
                            step="any"
                            value={row.stopLoss}
                            onChange={(e) => updateExtractedRow(row.id, { stopLoss: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Take Profit</label>
                          <input
                            type="number"
                            step="any"
                            value={row.takeProfit}
                            onChange={(e) => updateExtractedRow(row.id, { takeProfit: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Size</label>
                          <input
                            type="number"
                            step="any"
                            value={row.size}
                            onChange={(e) => updateExtractedRow(row.id, { size: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Net P&L</label>
                          <input
                            type="number"
                            step="any"
                            value={row.netPnl}
                            onChange={(e) => updateExtractedRow(row.id, { netPnl: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Open Time</label>
                          <input
                            type="text"
                            value={row.openTime}
                            onChange={(e) => updateExtractedRow(row.id, { openTime: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Close Time</label>
                          <input
                            type="text"
                            value={row.closeTime}
                            onChange={(e) => updateExtractedRow(row.id, { closeTime: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Notes</label>
                        <textarea
                          rows={2}
                          value={row.notes}
                          onChange={(e) => updateExtractedRow(row.id, { notes: e.target.value })}
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
                );
              })()}

              {ssImageUrl && extractedRows.length > 1 && (() => {
                const selectedCount = extractedRows.filter((r) => r.selected).length;
                const allSelected = selectedCount === extractedRows.length;
                return (
                  <form onSubmit={handleSaveExtracted} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Detected {extractedRows.length} Trades from Screenshot
                        </h3>
                        <p className="text-xs text-slate-500">
                          Review, edit, or uncheck any row before importing.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <select
                          value={ssAccountId}
                          onChange={(e) => setSsAccountId(e.target.value)}
                          aria-label="Target Account"
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                        >
                          {activeAccounts.length === 0 && <option value="">Default Account (Auto)</option>}
                          {activeAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={attachSsToTrades}
                            onChange={(e) => setAttachSsToTrades(e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-700"
                          />
                          Attach screenshot
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setExtractedRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })))
                          }
                          className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-12">
                      <div className="lg:col-span-4">
                        <img
                          src={ssImageUrl}
                          alt="Uploaded trade history screenshot"
                          className="max-h-[420px] w-full rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                        />
                      </div>

                      <div className="lg:col-span-8 space-y-2 max-h-[420px] overflow-y-auto pr-1">
                        {extractedRows.map((row, idx) => (
                          <div
                            key={row.id}
                            className={`rounded-lg border p-3 transition-colors ${
                              row.selected
                                ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/70'
                                : 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/30 opacity-60'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) => updateExtractedRow(row.id, { selected: e.target.checked })}
                                  className="rounded border-slate-300 dark:border-slate-700"
                                />
                                <span>Trade #{idx + 1}</span>
                              </label>
                              <span
                                className={`font-mono text-xs font-semibold ${
                                  (parseFloat(row.netPnl) || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                }`}
                              >
                                {(parseFloat(row.netPnl) || 0) >= 0 ? '+' : ''}
                                {row.netPnl || '0'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Instrument</label>
                                <input
                                  type="text"
                                  value={row.instrument}
                                  onChange={(e) => updateExtractedRow(row.id, { instrument: e.target.value })}
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs uppercase"
                                  required={row.selected}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Direction</label>
                                <select
                                  value={row.direction}
                                  onChange={(e) =>
                                    updateExtractedRow(row.id, { direction: e.target.value as TradeDirection })
                                  }
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                                >
                                  <option value="LONG">LONG</option>
                                  <option value="SHORT">SHORT</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Market</label>
                                <select
                                  value={row.market}
                                  onChange={(e) =>
                                    updateExtractedRow(row.id, { market: e.target.value as MarketType })
                                  }
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                                >
                                  <option value="forex">Forex</option>
                                  <option value="crypto">Crypto</option>
                                  <option value="stocks">Stocks</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Size</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={row.size}
                                  onChange={(e) => updateExtractedRow(row.id, { size: e.target.value })}
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Entry</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={row.entryPrice}
                                  onChange={(e) => updateExtractedRow(row.id, { entryPrice: e.target.value })}
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Exit</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={row.exitPrice}
                                  onChange={(e) => updateExtractedRow(row.id, { exitPrice: e.target.value })}
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Net P&L</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={row.netPnl}
                                  onChange={(e) => updateExtractedRow(row.id, { netPnl: e.target.value })}
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5">Time</label>
                                <input
                                  type="text"
                                  value={row.closeTime || row.openTime}
                                  onChange={(e) =>
                                    updateExtractedRow(row.id, {
                                      closeTime: e.target.value,
                                      openTime: e.target.value,
                                    })
                                  }
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={selectedCount === 0}
                      className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Confirm & Import {selectedCount} Selected Trade{selectedCount === 1 ? '' : 's'}
                    </button>
                  </form>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

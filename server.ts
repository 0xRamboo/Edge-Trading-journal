import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const GEMINI_MODEL_NAME = 'gemini-4-hydrogen';
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const DEFAULT_GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

type ConcreteAiProvider = 'gemini' | 'openrouter' | 'groq';
type AiProvider = 'auto' | ConcreteAiProvider;

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

function isOpenRouterConfigured(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return Boolean(key && key !== 'MY_OPENROUTER_API_KEY');
}

function isGroqConfigured(): boolean {
  const key = process.env.GROQ_API_KEY;
  return Boolean(key && key !== 'MY_GROQ_API_KEY');
}

function normalizeProvider(raw: unknown): AiProvider {
  if (raw === 'gemini' || raw === 'openrouter' || raw === 'groq') return raw;
  return 'auto';
}

function sanitizeModelSlug(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^[a-zA-Z0-9._:/-]{3,120}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return fallback;
}

function getGroqVisionModel(raw: unknown): string {
  const slug = sanitizeModelSlug(raw, DEFAULT_GROQ_VISION_MODEL);
  if (/llama-4|vision/i.test(slug)) {
    return slug;
  }
  return DEFAULT_GROQ_VISION_MODEL;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

function escapeControlCharsInJsonStrings(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

function parseJsonWithRecovery(raw: string): { parsed: unknown; recoveredTruncated: boolean } {
  const cleaned = stripJsonFences(raw);
  if (!cleaned) return { parsed: {}, recoveredTruncated: false };

  try {
    return { parsed: JSON.parse(cleaned), recoveredTruncated: false };
  } catch {
    // Fall through to cleanup and truncated-array recovery
  }

  const sanitized = escapeControlCharsInJsonStrings(cleaned);
  const firstObj = sanitized.indexOf('{');
  const firstArr = sanitized.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);

  if (start >= 0) {
    const endChar = sanitized[start] === '[' ? ']' : '}';
    const lastEnd = sanitized.lastIndexOf(endChar);
    const candidate = (lastEnd > start ? sanitized.slice(start, lastEnd + 1) : sanitized.slice(start))
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return { parsed: JSON.parse(candidate), recoveredTruncated: false };
    } catch {
      // Fall through to object-by-object recovery
    }
  }

  // Recover complete trade objects from a truncated JSON array (e.g. Unterminated string mid-stream)
  const slice = start >= 0 ? sanitized.slice(start) : sanitized;
  const tradesKeyMatch = /"trades"\s*:\s*\[/i.exec(slice);
  const arrStart = tradesKeyMatch
    ? tradesKeyMatch.index + tradesKeyMatch[0].length - 1
    : slice.indexOf('[');
  const scanFrom = arrStart >= 0 ? arrStart + 1 : 0;
  const objects: Array<Record<string, unknown>> = [];

  let inString = false;
  let escaped = false;
  let depth = 0;
  let objStart = -1;

  for (let i = scanFrom; i < slice.length; i++) {
    const ch = slice[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && objStart !== -1) {
          const objText = slice.slice(objStart, i + 1).replace(/,\s*([}\]])/g, '$1');
          try {
            const obj = JSON.parse(objText) as unknown;
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
              objects.push(obj as Record<string, unknown>);
            }
          } catch {
            // Skip malformed object
          }
          objStart = -1;
        }
      }
    }
  }

  if (objects.length > 0) {
    return { parsed: { trades: objects }, recoveredTruncated: true };
  }

  throw new Error('AI response returned malformed or incomplete JSON. Please retry or switch AI Provider in Settings.');
}

async function callOpenAiCompatibleProvider(opts: {
  providerLabel: 'OpenRouter' | 'Groq';
  endpoint: typeof OPENROUTER_API_URL | typeof GROQ_API_URL;
  apiKey: string | undefined;
  missingKeyMessage: string;
  extraHeaders?: Record<string, string>;
  model: string;
  systemInstruction?: string;
  userText: string;
  imageDataUrl?: string;
  jsonMode?: boolean;
}): Promise<string> {
  if (!opts.apiKey || opts.apiKey === 'MY_OPENROUTER_API_KEY' || opts.apiKey === 'MY_GROQ_API_KEY') {
    throw new Error(opts.missingKeyMessage);
  }

  const messages: Array<{ role: string; content: unknown }> = [];
  if (opts.systemInstruction) {
    messages.push({ role: 'system', content: opts.systemInstruction });
  }
  if (opts.imageDataUrl) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        { type: 'text', text: opts.userText },
      ],
    });
  } else {
    messages.push({ role: 'user', content: opts.userText });
  }

  const sendRequest = async (modelId: string, useResponseFormat: boolean, includeMaxTokens = true) => {
    const body: Record<string, unknown> = {
      model: modelId,
      messages,
    };
    if (includeMaxTokens) {
      body.max_tokens = 8192;
    }
    if (useResponseFormat) {
      body.response_format = { type: 'json_object' };
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      ...(opts.extraHeaders ?? {}),
    };
    const res = await fetch(opts.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: {
        message?: string;
        metadata?: {
          raw?: string;
          provider_name?: string;
        };
      };
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    return { res, data };
  };

  let activeModel = opts.model;
  let { res, data } = await sendRequest(activeModel, Boolean(opts.jsonMode), true);

  // Retry without response_format / max_tokens if the chosen model rejects either option
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    ({ res, data } = await sendRequest(activeModel, false, false));
  }

  // Brief retry once on transient rate-limit / upstream busy responses
  if (!res.ok && (res.status === 429 || res.status === 503)) {
    const retryAfterSec = Number(res.headers.get('retry-after'));
    const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? Math.min(retryAfterSec * 1000, 2000)
      : 900;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    ({ res, data } = await sendRequest(activeModel, Boolean(opts.jsonMode)));
  }

  // If a specific OpenRouter :free model is rate-limited or unavailable upstream, fall back to OpenRouter's free router (works for both text and vision)
  if (
    !res.ok &&
    (res.status === 429 || res.status === 404 || res.status === 503) &&
    opts.providerLabel === 'OpenRouter' &&
    activeModel.endsWith(':free') &&
    activeModel !== 'openrouter/free'
  ) {
    activeModel = 'openrouter/free';
    ({ res, data } = await sendRequest(activeModel, false));
  }

  if (!res.ok) {
    const rawDetail = data?.error?.metadata?.raw;
    const upstreamName = data?.error?.metadata?.provider_name;
    const baseMsg = data?.error?.message || `${opts.providerLabel} API error (${res.status})`;
    const extraDetail = rawDetail && rawDetail !== baseMsg
      ? ` — ${upstreamName ? `${upstreamName}: ` : ''}${rawDetail}`
      : '';
    const rateLimitHint =
      res.status === 429 && opts.providerLabel === 'OpenRouter'
        ? ' (Tip: Free OpenRouter models are frequently rate-limited upstream. Try openrouter/free, switch Active AI Provider to Auto or Groq, or use a non-free model slug.)'
        : '';
    throw new Error(`${opts.providerLabel} (${res.status}): ${baseMsg}${extraDetail}${rateLimitHint}`);
  }

  return data?.choices?.[0]?.message?.content ?? '';
}

async function callOpenRouter(opts: {
  model: string;
  systemInstruction?: string;
  userText: string;
  imageDataUrl?: string;
  jsonMode?: boolean;
}): Promise<string> {
  const extraHeaders: Record<string, string> = {
    'X-Title': 'EdgeLedger Trading Journal',
  };
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    extraHeaders['HTTP-Referer'] = process.env.APP_URL;
  }
  return callOpenAiCompatibleProvider({
    providerLabel: 'OpenRouter',
    endpoint: OPENROUTER_API_URL,
    apiKey: process.env.OPENROUTER_API_KEY,
    missingKeyMessage: 'OPENROUTER_API_KEY is not configured in environment secrets.',
    extraHeaders,
    ...opts,
  });
}

async function callGroq(opts: {
  model: string;
  systemInstruction?: string;
  userText: string;
  imageDataUrl?: string;
  jsonMode?: boolean;
}): Promise<string> {
  return callOpenAiCompatibleProvider({
    providerLabel: 'Groq',
    endpoint: GROQ_API_URL,
    apiKey: process.env.GROQ_API_KEY,
    missingKeyMessage: 'GROQ_API_KEY is not configured in environment secrets.',
    ...opts,
  });
}

function resolveProviderOrder(requested: AiProvider): ConcreteAiProvider[] {
  if (requested === 'gemini') return ['gemini'];
  if (requested === 'openrouter') return ['openrouter'];
  if (requested === 'groq') return ['groq'];
  const order: ConcreteAiProvider[] = [];
  if (isGeminiConfigured()) order.push('gemini');
  if (isOpenRouterConfigured()) order.push('openrouter');
  if (isGroqConfigured()) order.push('groq');
  if (order.length === 0) {
    throw new Error(
      'No AI API key configured. Add GEMINI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY in Settings > Secrets.'
    );
  }
  return order;
}

function summarizeProviderFailure(prov: ConcreteAiProvider, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const label = prov === 'gemini' ? 'Gemini' : prov === 'openrouter' ? 'OpenRouter' : 'Groq';
  if (/API key not valid|Invalid API Key|UNAUTHENTICATED|401/i.test(raw)) {
    return `${label}: Invalid or expired API key in Settings > Secrets`;
  }
  if (/429|rate-limit|RESOURCE_EXHAUSTED/i.test(raw)) {
    return `${label}: Rate-limited upstream (429)`;
  }
  return raw.startsWith(label) ? raw : `${label}: ${raw}`;
}

async function executeWithProviderFallback(
  requestedProvider: AiProvider,
  handlers: Record<ConcreteAiProvider, () => Promise<string>>
): Promise<{ text: string; usedProvider: ConcreteAiProvider }> {
  const order = resolveProviderOrder(requestedProvider);
  const failures: string[] = [];
  let lastError: unknown;
  for (const prov of order) {
    try {
      const text = await handlers[prov]();
      return { text, usedProvider: prov };
    } catch (err) {
      lastError = err;
      failures.push(summarizeProviderFailure(prov, err));
    }
  }
  if (order.length > 1 && failures.length > 1) {
    throw new Error(`All configured AI providers failed — ${failures.join(' | ')}`);
  }
  throw lastError instanceof Error ? lastError : new Error('All configured AI providers failed.');
}

function handleAiError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unexpected AI service error';
  const status =
    message.includes('not configured') || message.includes('No AI API key') ? 503 :
    message.includes('401') || message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('Unauthorized') || message.includes('Invalid or expired API key') ? 502 :
    message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('rate') ? 429 :
    message.includes('400') || message.includes('INVALID') ? 400 : 500;
  res.status(status).json({ error: message });
}

const TRADE_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    instrument: { type: Type.STRING },
    market: { type: Type.STRING },
    direction: { type: Type.STRING },
    entryPrice: { type: Type.NUMBER },
    exitPrice: { type: Type.NUMBER },
    stopLoss: { type: Type.NUMBER },
    takeProfit: { type: Type.NUMBER },
    size: { type: Type.NUMBER },
    openTime: { type: Type.STRING },
    closeTime: { type: Type.STRING },
    netPnl: { type: Type.NUMBER },
    fees: { type: Type.NUMBER },
    setup: { type: Type.STRING },
    extractionNotes: { type: Type.STRING },
  },
};

function normalizeExtractedTradesJson(text: string): {
  trades: Array<{
    instrument: string;
    market: 'forex' | 'crypto' | 'stocks';
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    stopLoss: number;
    takeProfit: number;
    size: number;
    openTime: string;
    closeTime: string;
    netPnl: number;
    fees: number;
    setup: string;
    extractionNotes: string;
  }>;
  truncated: boolean;
} {
  const { parsed: rawParsed, recoveredTruncated } = parseJsonWithRecovery(text);
  const rawList: Array<Record<string, unknown>> = Array.isArray(rawParsed)
    ? (rawParsed as Array<Record<string, unknown>>)
    : rawParsed && typeof rawParsed === 'object' && Array.isArray((rawParsed as { trades?: unknown }).trades)
      ? ((rawParsed as { trades: Array<Record<string, unknown>> }).trades)
      : rawParsed && typeof rawParsed === 'object' && 'instrument' in (rawParsed as Record<string, unknown>)
        ? [rawParsed as Record<string, unknown>]
        : [];

  const toNum = (v: unknown, fallback = 0): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  };
  const normalizeIsoLike = (v: unknown): string => {
    if (typeof v !== 'string') return '';
    return v.trim().replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  };
  const inferMarket = (inst: string, rawMarket: unknown): 'forex' | 'crypto' | 'stocks' => {
    if (rawMarket === 'crypto' || rawMarket === 'stocks' || rawMarket === 'forex') {
      if (/(BTC|ETH|SOL|XRP|DOGE|ADA|BNB|AVAX|USDT|USDC)/i.test(inst)) return 'crypto';
      return rawMarket;
    }
    if (/(BTC|ETH|SOL|XRP|DOGE|ADA|BNB|AVAX|USDT|USDC)/i.test(inst)) return 'crypto';
    if (/(EUR|GBP|USD|JPY|AUD|NZD|CAD|CHF|XAU|XAG)/i.test(inst) && inst.length <= 8) return 'forex';
    return 'stocks';
  };

  const trades = rawList
    .map((item) => {
      const instrument = String(item.instrument ?? '').trim().toUpperCase();
      if (!instrument || /^(BALANCE|DEPOSIT|WITHDRAWAL|CREDIT|PROFIT|TOTAL|SUMMARY)$/i.test(instrument)) {
        return null;
      }
      const dirRaw = String(item.direction ?? '').toUpperCase();
      const direction: 'LONG' | 'SHORT' = dirRaw === 'SHORT' || dirRaw === 'SELL' ? 'SHORT' : 'LONG';
      const closeTime = normalizeIsoLike(item.closeTime);
      const openTime = normalizeIsoLike(item.openTime) || closeTime;
      return {
        instrument,
        market: inferMarket(instrument, item.market),
        direction,
        entryPrice: toNum(item.entryPrice, 0),
        exitPrice: toNum(item.exitPrice, 0),
        stopLoss: toNum(item.stopLoss, 0),
        takeProfit: toNum(item.takeProfit, 0),
        size: toNum(item.size, 0.01),
        openTime,
        closeTime,
        netPnl: toNum(item.netPnl, 0),
        fees: toNum(item.fees, 0),
        setup: typeof item.setup === 'string' ? item.setup : '',
        extractionNotes: typeof item.extractionNotes === 'string' ? item.extractionNotes : '',
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return { trades, truncated: recoveredTruncated };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '15mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Non-sensitive AI provider availability check
  app.get('/api/ai/providers', (_req: Request, res: Response) => {
    res.json({
      geminiConfigured: isGeminiConfigured(),
      openrouterConfigured: isOpenRouterConfigured(),
      groqConfigured: isGroqConfigured(),
      defaultOpenRouterModel: DEFAULT_OPENROUTER_MODEL,
      defaultGroqModel: DEFAULT_GROQ_MODEL,
    });
  });

  // 1. Extract trade fields from uploaded screenshot
  app.post('/api/ai/extract-trade', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType, defaultCurrency, defaultTimezone, provider, openRouterModel, groqModel } = req.body ?? {};
      if (typeof imageBase64 !== 'string' || imageBase64.length < 20) {
        return res.status(400).json({ error: 'Valid imageBase64 payload is required.' });
      }
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      const safeMime = typeof mimeType === 'string' && allowedMimeTypes.includes(mimeType)
        ? mimeType
        : 'image/png';

      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const imageDataUrl = `data:${safeMime};base64,${cleanBase64}`;

      const extractionPrompt = `Extract ALL trading executions / closed or open positions visible in this screenshot.
User defaults: Currency=${String(defaultCurrency || 'USD')}, Timezone=${String(defaultTimezone || 'Asia/Kathmandu')}.

CRITICAL INSTRUCTIONS:
1. If this screenshot is a multi-row trade history / positions / deals list (such as MetaTrader 4/5 Positions, Exness, Binance, Bybit, or broker history), you MUST extract EVERY visible trade row into the "trades" array in top-to-bottom order. Do NOT stop after 1 trade!
2. Skip non-trade summary or ledger rows such as "Balance", "Initial deposit", "Deposit", "Withdrawal", "Credit", or total Profit/Swap summary headers.
3. For MetaTrader / broker rows showing "SYMBOL buy/sell LOT" and "entryPrice -> exitPrice":
   - "buy" => direction="LONG", "sell" => direction="SHORT"
   - entryPrice = left number before arrow (→ or ->), exitPrice = right number after arrow
   - size = lot/volume (e.g., 0.01, 0.05)
   - netPnl = signed profit/loss number on the row (preserve negative signs!)
   - Convert timestamps like "2026.11.09 09:43:54" to ISO format "2026-11-09T09:43:54". If only one timestamp is shown per closed trade row, put it in BOTH closeTime and openTime.
4. For market, infer:
   - "crypto" for BTC/ETH/SOL/USDT/USDC/crypto pairs (e.g. BTCUSD, ETHUSDT)
   - "stocks" for stock tickers/indices (e.g. AAPL, NVDA, SPY, US30, NAS100)
   - "forex" for FX pairs and metals (e.g. EURUSD, AUDNZD, GBPUSD, USDJPY, XAUUSD, XAGUSD)
5. If a numeric field (like stopLoss, takeProfit, fees) is not visible, return 0 and briefly note what was missing in extractionNotes.

Return ONLY valid JSON object with shape:
{
  "trades": [
    {
      "instrument": "string",
      "market": "forex | crypto | stocks",
      "direction": "LONG | SHORT",
      "entryPrice": 0,
      "exitPrice": 0,
      "stopLoss": 0,
      "takeProfit": 0,
      "size": 0,
      "openTime": "YYYY-MM-DDTHH:MM:SS",
      "closeTime": "YYYY-MM-DDTHH:MM:SS",
      "netPnl": 0,
      "fees": 0,
      "setup": "",
      "extractionNotes": ""
    }
  ]
}`;

      const orModel = sanitizeModelSlug(openRouterModel, DEFAULT_OPENROUTER_MODEL);
      const groqVisionModel = getGroqVisionModel(groqModel);

      const { text, usedProvider } = await executeWithProviderFallback(normalizeProvider(provider), {
        gemini: async () => {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: {
              parts: [
                { inlineData: { mimeType: safeMime, data: cleanBase64 } },
                { text: extractionPrompt },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  trades: {
                    type: Type.ARRAY,
                    items: TRADE_ITEM_SCHEMA,
                  },
                },
              },
            },
          });
          return response.text ?? '{"trades":[]}';
        },
        openrouter: async () =>
          callOpenRouter({
            model: orModel,
            systemInstruction: 'You are a precise multi-trade execution vision parser. Always output valid JSON with a "trades" array containing every visible trade.',
            userText: extractionPrompt,
            imageDataUrl,
            jsonMode: true,
          }),
        groq: async () =>
          callGroq({
            model: groqVisionModel,
            systemInstruction: 'You are a precise multi-trade execution vision parser. Always output valid JSON with a "trades" array containing every visible trade.',
            userText: extractionPrompt,
            imageDataUrl,
            jsonMode: true,
          }),
      });

      const { trades: normalizedTrades, truncated } = normalizeExtractedTradesJson(text);

      res.json({
        trades: normalizedTrades,
        extracted: normalizedTrades[0] ?? {},
        truncated,
        usedProvider,
      });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 1b. Extract trade rows from broker/statement PDF text
  app.post('/api/ai/extract-pdf-trades', async (req: Request, res: Response) => {
    try {
      const { pdfText, fileName, defaultCurrency, defaultTimezone, provider, openRouterModel, groqModel } = req.body ?? {};
      if (typeof pdfText !== 'string' || pdfText.trim().length < 15) {
        return res.status(400).json({ error: 'Valid extracted PDF text is required.' });
      }
      if (pdfText.length > 120_000) {
        return res.status(400).json({ error: 'PDF chunk exceeds maximum supported length.' });
      }

      const pdfPrompt = `Extract ALL trading executions / closed or open positions from this broker statement PDF text (${String(fileName || 'statement.pdf')}).
User defaults: Currency=${String(defaultCurrency || 'USD')}, Timezone=${String(defaultTimezone || 'Asia/Kathmandu')}.

CRITICAL INSTRUCTIONS:
1. Extract EVERY real trade row (MT4/MT5 Positions/Closed Transactions/Deals, Exness, FTMO, cTrader, IBKR, Binance, TradingView, or custom broker statements) into the "trades" array in chronological or top-to-bottom order.
2. Ignore non-trade ledger/summary rows: Balance, Deposit, Withdrawal, Credit, Interest, Totals, Open Trades header, Working Orders / Cancelled limit orders (unless filled), and Account Summary tables.
3. Map "buy" / "long" => "LONG" and "sell" / "short" => "SHORT".
4. Preserve exact numeric entryPrice, exitPrice, stopLoss (S/L), takeProfit (T/P), size (Volume/Lots/Qty), and signed netPnl (Profit). If commission + swap are shown separately, sum their absolute cost into fees (positive fee number) or 0 if not shown.
5. Convert timestamps like "2026.11.09 09:43:54" or "2026-11-09 09:43" to ISO format "2026-11-09T09:43:54". If only one time exists, put it in both openTime and closeTime.
6. Infer market: "crypto" (BTC/ETH/SOL/USDT/USDC), "stocks" (AAPL/NVDA/SPY/US30/NAS100/indices), or "forex" (FX pairs & XAU/XAG metals).
7. Leave "setup" and "extractionNotes" as empty strings "" to keep output compact. Return COMPACT single-line JSON (no indentation or extra whitespace).

PDF STATEMENT TEXT:
${pdfText}

Return ONLY valid compact JSON:
{"trades":[{"instrument":"string","market":"forex","direction":"LONG","entryPrice":0,"exitPrice":0,"stopLoss":0,"takeProfit":0,"size":0,"openTime":"YYYY-MM-DDTHH:MM:SS","closeTime":"YYYY-MM-DDTHH:MM:SS","netPnl":0,"fees":0,"setup":"","extractionNotes":""}]}`;

      const orModel = sanitizeModelSlug(openRouterModel, DEFAULT_OPENROUTER_MODEL);
      const grModel = sanitizeModelSlug(groqModel, DEFAULT_GROQ_MODEL);
      const { text, usedProvider } = await executeWithProviderFallback(normalizeProvider(provider), {
        gemini: async () => {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: pdfPrompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  trades: {
                    type: Type.ARRAY,
                    items: TRADE_ITEM_SCHEMA,
                  },
                },
              },
            },
          });
          return response.text ?? '{"trades":[]}';
        },
        openrouter: async () =>
          callOpenRouter({
            model: orModel,
            systemInstruction: 'You are a precise broker statement PDF parser. Always output valid JSON with a "trades" array containing every trade row.',
            userText: pdfPrompt,
            jsonMode: true,
          }),
        groq: async () =>
          callGroq({
            model: grModel,
            systemInstruction: 'You are a precise broker statement PDF parser. Always output valid JSON with a "trades" array containing every trade row.',
            userText: pdfPrompt,
            jsonMode: true,
          }),
      });

      const { trades: normalizedTrades, truncated } = normalizeExtractedTradesJson(text);
      res.json({
        trades: normalizedTrades,
        truncated,
        usedProvider,
      });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 2. Single-trade AI review
  app.post('/api/ai/review-trade', async (req: Request, res: Response) => {
    try {
      const { trade, accountName, strategyName, baselineStats, provider, openRouterModel, groqModel } = req.body ?? {};
      if (!trade || typeof trade !== 'object') {
        return res.status(400).json({ error: 'Trade payload is required.' });
      }

      const systemInstruction =
        'Be honest, direct, quantitative, and concise. Only cite numbers present in the trade or baseline JSON.';
      const prompt = `You are a blunt, data-driven institutional trading performance coach.
Review this single trade strictly using the numbers and behavioral logs provided. Do NOT predict markets or give financial advice.

Account: ${String(accountName || 'Unknown')}
Strategy: ${String(strategyName || 'Unassigned')}
Trade JSON: ${JSON.stringify(trade)}
Trader Baseline Stats: ${JSON.stringify(baselineStats ?? {})}

Provide a structured, concise critique covering:
1. Execution & Risk Sizing (compare actualR vs plannedRR, initialRiskPct, fees drag)
2. Exit Efficiency (analyze MAE vs MFE if available — did they cut winners early or let losers run beyond planned SL?)
3. Behavioral & Rule Discipline (emotion before/during/after, mistakeTags, rulesFollowed, checklistResult)
4. Two concrete, actionable rules to reinforce or fix on the next similar setup.`;

      const orModel = sanitizeModelSlug(openRouterModel, DEFAULT_OPENROUTER_MODEL);
      const grModel = sanitizeModelSlug(groqModel, DEFAULT_GROQ_MODEL);
      const { text, usedProvider } = await executeWithProviderFallback(normalizeProvider(provider), {
        gemini: async () => {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: prompt,
            config: { systemInstruction },
          });
          return response.text ?? '';
        },
        openrouter: async () =>
          callOpenRouter({
            model: orModel,
            systemInstruction,
            userText: prompt,
          }),
        groq: async () =>
          callGroq({
            model: grModel,
            systemInstruction,
            userText: prompt,
          }),
      });

      res.json({ review: text, usedProvider });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 3. Weekly plan AI summary
  app.post('/api/ai/weekly-summary', async (req: Request, res: Response) => {
    try {
      const { weekPlan, actualStats, tradesSummary, provider, openRouterModel, groqModel } = req.body ?? {};
      if (!weekPlan || typeof weekPlan !== 'object') {
        return res.status(400).json({ error: 'Weekly plan payload is required.' });
      }

      const systemInstruction = 'Direct, objective performance analyst. Cite exact figures from the input.';
      const prompt = `Evaluate this trader's weekly plan vs actual execution. Use only the provided numbers. Do not predict markets.
Weekly Plan: ${JSON.stringify(weekPlan)}
Actual Week Stats: ${JSON.stringify(actualStats ?? {})}
Breakdown: ${JSON.stringify(tradesSummary ?? {})}

Write a crisp 3-paragraph assessment: (1) Plan vs Execution numbers, (2) Discipline & Risk limit adherence, (3) Focus adjustment for next week.`;

      const orModel = sanitizeModelSlug(openRouterModel, DEFAULT_OPENROUTER_MODEL);
      const grModel = sanitizeModelSlug(groqModel, DEFAULT_GROQ_MODEL);
      const { text, usedProvider } = await executeWithProviderFallback(normalizeProvider(provider), {
        gemini: async () => {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: prompt,
            config: { systemInstruction },
          });
          return response.text ?? '';
        },
        openrouter: async () =>
          callOpenRouter({
            model: orModel,
            systemInstruction,
            userText: prompt,
          }),
        groq: async () =>
          callGroq({
            model: grModel,
            systemInstruction,
            userText: prompt,
          }),
      });

      res.json({ summary: text, usedProvider });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 4. Full AI Analyser & Report generation
  app.post('/api/ai/report', async (req: Request, res: Response) => {
    try {
      const { periodLabel, accountLabel, currentStats, previousStats, breakdowns, provider, openRouterModel, groqModel } = req.body ?? {};
      if (!currentStats || typeof currentStats !== 'object') {
        return res.status(400).json({ error: 'currentStats payload is required.' });
      }

      const systemInstruction =
        'You are a quantitative trading performance auditor. Return clean structured JSON only.';
      const prompt = `Generate a rigorous performance audit report for this trader.
Period: ${String(periodLabel)}
Account Scope: ${String(accountLabel)}
Current Period Stats: ${JSON.stringify(currentStats)}
Previous Period Stats: ${JSON.stringify(previousStats ?? null)}
Detailed Breakdowns (setups, sessions, weekdays, hours, mistakes, rule compliance, overtrading, post-loss): ${JSON.stringify(breakdowns ?? {})}

STRICT RULES:
- Tone: honest, direct, and data-driven.
- Cite ONLY numbers present in the JSON above. Never invent statistics.
- Do NOT predict markets or give financial advice.
- Provide EXACTLY 3 specific, measurable action items for the next period.
- Return ONLY a JSON object with exact required keys:
  {
    "executiveSummary": string,
    "strengths": string[],
    "weaknesses": string[],
    "behavioralPatterns": string[],
    "bestAndWorst": string,
    "ruleComplianceAnalysis": string,
    "periodComparison": string,
    "actionItems": [string, string, string]
  }`;

      const orModel = sanitizeModelSlug(openRouterModel, DEFAULT_OPENROUTER_MODEL);
      const grModel = sanitizeModelSlug(groqModel, DEFAULT_GROQ_MODEL);
      const { text, usedProvider } = await executeWithProviderFallback(normalizeProvider(provider), {
        gemini: async () => {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                required: [
                  'executiveSummary',
                  'strengths',
                  'weaknesses',
                  'behavioralPatterns',
                  'bestAndWorst',
                  'ruleComplianceAnalysis',
                  'periodComparison',
                  'actionItems',
                ],
                properties: {
                  executiveSummary: { type: Type.STRING },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                  weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                  behavioralPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
                  bestAndWorst: { type: Type.STRING },
                  ruleComplianceAnalysis: { type: Type.STRING },
                  periodComparison: { type: Type.STRING },
                  actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
            },
          });
          return response.text ?? '{}';
        },
        openrouter: async () =>
          callOpenRouter({
            model: orModel,
            systemInstruction,
            userText: prompt,
            jsonMode: true,
          }),
        groq: async () =>
          callGroq({
            model: grModel,
            systemInstruction,
            userText: prompt,
            jsonMode: true,
          }),
      });

      const parsedRaw = parseJsonWithRecovery(text).parsed;
      const parsed = (parsedRaw && typeof parsedRaw === 'object' ? parsedRaw : {}) as Record<string, unknown>;
      const toStrArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)) : []);
      const report = {
        executiveSummary: typeof parsed.executiveSummary === 'string' ? parsed.executiveSummary : '',
        strengths: toStrArr(parsed.strengths),
        weaknesses: toStrArr(parsed.weaknesses),
        behavioralPatterns: toStrArr(parsed.behavioralPatterns),
        bestAndWorst: typeof parsed.bestAndWorst === 'string' ? parsed.bestAndWorst : '',
        ruleComplianceAnalysis: typeof parsed.ruleComplianceAnalysis === 'string' ? parsed.ruleComplianceAnalysis : '',
        periodComparison: typeof parsed.periodComparison === 'string' ? parsed.periodComparison : '',
        actionItems: toStrArr(parsed.actionItems).slice(0, 3),
      };
      res.json({ report, usedProvider });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 5. Journal AI Chat
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const { question, history, journalSnapshot, provider, openRouterModel, groqModel } = req.body ?? {};
      if (typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'Question string is required.' });
      }

      const safeHistory = Array.isArray(history)
        ? history.slice(-8).map((m: { role?: string; text?: string }) => ({
            role: m.role === 'model' ? 'model' : 'user',
            text: String(m.text ?? ''),
          }))
        : [];

      const historyBlock = safeHistory
        .map((m) => `${m.role === 'user' ? 'Trader' : 'Analyst'}: ${m.text}`)
        .join('\n');

      const systemInstruction =
        'Honest, direct trading performance analyst grounded strictly in the provided journal snapshot.';
      const prompt = `Trader Journal Data Snapshot (source of truth):
${JSON.stringify(journalSnapshot ?? {})}

Recent Conversation:
${historyBlock}

Trader Question: ${question.trim()}

Answer directly using only the numbers and patterns in the Trader Journal Data Snapshot. If a breakdown shows fewer than 30 trades, explicitly caveat the small sample size. Never predict market direction or give financial advice.`;

      const orModel = sanitizeModelSlug(openRouterModel, DEFAULT_OPENROUTER_MODEL);
      const grModel = sanitizeModelSlug(groqModel, DEFAULT_GROQ_MODEL);
      const { text, usedProvider } = await executeWithProviderFallback(normalizeProvider(provider), {
        gemini: async () => {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: prompt,
            config: { systemInstruction },
          });
          return response.text ?? '';
        },
        openrouter: async () =>
          callOpenRouter({
            model: orModel,
            systemInstruction,
            userText: prompt,
          }),
        groq: async () =>
          callGroq({
            model: grModel,
            systemInstruction,
            userText: prompt,
          }),
      });

      res.json({ answer: text, usedProvider });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // Never fall through to SPA HTML for /api/* routes
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Return JSON for body-parser / Express middleware errors on /api/*
  app.use((err: unknown, req: Request, res: Response, next: express.NextFunction) => {
    if (!req.path.startsWith('/api')) {
      return next(err);
    }
    const errObj = err as { type?: string; status?: number; message?: string };
    if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
      return res.status(413).json({
        error: 'Uploaded image is too large. Please upload a smaller or cropped chart screenshot.',
      });
    }
    const status = typeof errObj?.status === 'number' && errObj.status >= 400 ? errObj.status : 500;
    return res.status(status).json({ error: errObj?.message || 'Unexpected server error.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      plugins: [
        {
          name: 'edgeledger-attach-http-ws',
          config() {
            return {
              server: {
                allowedHosts: true,
                ws: { server: httpServer },
                ...(process.env.DISABLE_HMR === 'true' ? { hmr: false } : {}),
              },
            };
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EdgeLedger server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

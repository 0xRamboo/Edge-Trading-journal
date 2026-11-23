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

  const sendRequest = async (modelId: string, useResponseFormat: boolean) => {
    const body: Record<string, unknown> = {
      model: modelId,
      messages,
    };
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
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { res, data };
  };

  let activeModel = opts.model;
  let { res, data } = await sendRequest(activeModel, Boolean(opts.jsonMode));

  // Retry without response_format if the chosen model rejects json_object
  if (!res.ok && opts.jsonMode && (res.status === 400 || res.status === 422)) {
    ({ res, data } = await sendRequest(activeModel, false));
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

  // If a specific OpenRouter :free model is rate-limited upstream, fall back to OpenRouter's free router
  if (
    !res.ok &&
    res.status === 429 &&
    opts.providerLabel === 'OpenRouter' &&
    !opts.imageDataUrl &&
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

async function executeWithProviderFallback(
  requestedProvider: AiProvider,
  handlers: Record<ConcreteAiProvider, () => Promise<string>>
): Promise<{ text: string; usedProvider: ConcreteAiProvider }> {
  const order = resolveProviderOrder(requestedProvider);
  let lastError: unknown;
  for (const prov of order) {
    try {
      const text = await handlers[prov]();
      return { text, usedProvider: prov };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All configured AI providers failed.');
}

function handleAiError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unexpected AI service error';
  const status =
    message.includes('not configured') || message.includes('No AI API key') ? 503 :
    message.includes('401') || message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('Unauthorized') ? 403 :
    message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('rate') ? 429 :
    message.includes('400') || message.includes('INVALID') ? 400 : 500;
  res.status(status).json({ error: message });
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

      const extractionPrompt = `Extract trade execution details from this trading chart or broker order screenshot.
User defaults: Currency=${String(defaultCurrency || 'USD')}, Timezone=${String(defaultTimezone || 'Asia/Kathmandu')}.
Return precise numbers where visible. For direction, return LONG or SHORT. For market, infer forex, crypto, or stocks.
For openTime and closeTime, return ISO 8601 strings if timestamps are visible, otherwise empty string.
If a numeric field is not visible in the screenshot, return 0 and note what was missing in extractionNotes.
Return ONLY valid JSON with keys: instrument, market, direction, entryPrice, exitPrice, stopLoss, takeProfit, size, openTime, closeTime, netPnl, fees, setup, extractionNotes.`;

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
              },
            },
          });
          return response.text ?? '{}';
        },
        openrouter: async () =>
          callOpenRouter({
            model: orModel,
            systemInstruction: 'You are a precise trade execution vision parser. Always output valid JSON only.',
            userText: extractionPrompt,
            imageDataUrl,
            jsonMode: true,
          }),
        groq: async () =>
          callGroq({
            model: groqVisionModel,
            systemInstruction: 'You are a precise trade execution vision parser. Always output valid JSON only.',
            userText: extractionPrompt,
            imageDataUrl,
            jsonMode: true,
          }),
      });

      const parsed = JSON.parse(stripJsonFences(text) || '{}');
      res.json({ extracted: parsed, usedProvider });
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

      const rawText = stripJsonFences(text);
      const parsed = JSON.parse(rawText || '{}') as Record<string, unknown>;
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

import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
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

function handleAiError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unexpected AI service error';
  const status =
    message.includes('not configured') ? 503 :
    message.includes('403') || message.includes('PERMISSION_DENIED') ? 403 :
    message.includes('429') || message.includes('RESOURCE_EXHAUSTED') ? 429 :
    message.includes('400') || message.includes('INVALID') ? 400 : 500;
  res.status(status).json({ error: message });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // 1. Extract trade fields from uploaded screenshot
  app.post('/api/ai/extract-trade', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType, defaultCurrency, defaultTimezone } = req.body ?? {};
      if (typeof imageBase64 !== 'string' || imageBase64.length < 20) {
        return res.status(400).json({ error: 'Valid imageBase64 payload is required.' });
      }
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      const safeMime = typeof mimeType === 'string' && allowedMimeTypes.includes(mimeType)
        ? mimeType
        : 'image/png';

      // Strip data URL prefix if present
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: cleanBase64,
              },
            },
            {
              text: `Extract trade execution details from this trading chart or broker order screenshot.
User defaults: Currency=${String(defaultCurrency || 'USD')}, Timezone=${String(defaultTimezone || 'Asia/Kathmandu')}.
Return precise numbers where visible. For direction, return LONG or SHORT. For market, infer forex, crypto, or stocks.
For openTime and closeTime, return ISO 8601 strings if timestamps are visible, otherwise empty string.
If a numeric field is not visible in the screenshot, return 0 (or null-like 0) and note what was missing in extractionNotes.`,
            },
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

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ extracted: parsed });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 2. Single-trade AI review
  app.post('/api/ai/review-trade', async (req: Request, res: Response) => {
    try {
      const { trade, accountName, strategyName, baselineStats } = req.body ?? {};
      if (!trade || typeof trade !== 'object') {
        return res.status(400).json({ error: 'Trade payload is required.' });
      }

      const ai = getAiClient();
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

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: 'Be honest, direct, quantitative, and concise. Only cite numbers present in the trade or baseline JSON.',
        },
      });

      res.json({ review: response.text ?? '' });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 3. Weekly plan AI summary
  app.post('/api/ai/weekly-summary', async (req: Request, res: Response) => {
    try {
      const { weekPlan, actualStats, tradesSummary } = req.body ?? {};
      if (!weekPlan || typeof weekPlan !== 'object') {
        return res.status(400).json({ error: 'Weekly plan payload is required.' });
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Evaluate this trader's weekly plan vs actual execution. Use only the provided numbers. Do not predict markets.
Weekly Plan: ${JSON.stringify(weekPlan)}
Actual Week Stats: ${JSON.stringify(actualStats ?? {})}
Breakdown: ${JSON.stringify(tradesSummary ?? {})}

Write a crisp 3-paragraph assessment: (1) Plan vs Execution numbers, (2) Discipline & Risk limit adherence, (3) Focus adjustment for next week.`,
        config: {
          systemInstruction: 'Direct, objective performance analyst. Cite exact figures from the input.',
        },
      });

      res.json({ summary: response.text ?? '' });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 4. Full AI Analyser & Report generation
  app.post('/api/ai/report', async (req: Request, res: Response) => {
    try {
      const { periodLabel, accountLabel, currentStats, previousStats, breakdowns } = req.body ?? {};
      if (!currentStats || typeof currentStats !== 'object') {
        return res.status(400).json({ error: 'currentStats payload is required.' });
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Generate a rigorous performance audit report for this trader.
Period: ${String(periodLabel)}
Account Scope: ${String(accountLabel)}
Current Period Stats: ${JSON.stringify(currentStats)}
Previous Period Stats: ${JSON.stringify(previousStats ?? null)}
Detailed Breakdowns (setups, sessions, weekdays, hours, mistakes, rule compliance, overtrading, post-loss): ${JSON.stringify(breakdowns ?? {})}

STRICT RULES:
- Tone: honest, direct, and data-driven.
- Cite ONLY numbers present in the JSON above. Never invent statistics.
- Do NOT predict markets or give financial advice.
- Provide EXACTLY 3 specific, measurable action items for the next period.`,
        config: {
          systemInstruction: 'You are a quantitative trading performance auditor. Return clean structured JSON.',
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

      const rawText = (response.text ?? '{}').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
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
      res.json({ report });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 5. Journal AI Chat
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const { question, history, journalSnapshot } = req.body ?? {};
      if (typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'Question string is required.' });
      }

      const ai = getAiClient();
      const safeHistory = Array.isArray(history)
        ? history.slice(-8).map((m: { role?: string; text?: string }) => ({
            role: m.role === 'model' ? 'model' : 'user',
            text: String(m.text ?? ''),
          }))
        : [];

      const historyBlock = safeHistory
        .map((m) => `${m.role === 'user' ? 'Trader' : 'Analyst'}: ${m.text}`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Trader Journal Data Snapshot (source of truth):
${JSON.stringify(journalSnapshot ?? {})}

Recent Conversation:
${historyBlock}

Trader Question: ${question.trim()}

Answer directly using only the numbers and patterns in the Trader Journal Data Snapshot. If a breakdown shows fewer than 30 trades, explicitly caveat the small sample size. Never predict market direction or give financial advice.`,
        config: {
          systemInstruction: 'Honest, direct trading performance analyst grounded strictly in the provided journal snapshot.',
        },
      });

      res.json({ answer: response.text ?? '' });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EdgeLedger server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

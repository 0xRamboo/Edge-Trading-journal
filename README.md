# EdgeLedger

**EdgeLedger** is a local-first, multi-account trading journal, R-multiple analytics workbench, strategy playbook, backtesting sandbox, and AI performance coach built with React, TypeScript, Tailwind CSS, Recharts, IndexedDB, and Express.

---

## Key Features

### Dashboard (`Overview` & `Consistency` Tabs)
- **Overview**: Net P&L, Win Rate, Profit Factor, Expectancy, Average R / Planned R, Max Drawdown & Recovery Factor, Largest Win/Loss, Streaks, Equity Curve, Discipline Score breakdown, Drawdown curve, Daily Net P&L, Win/Loss split, Weekday performance, Monthly mini-calendar, Recent Executions, and per-broker Account Progress cards.
- **Consistency**:
  - **Prop-Firm Single-Day Consistency Rule Analyzer** with configurable profit-share caps (`20%`, `25%`, `30%`, `40%`, `50%`) showing compliance status and exact additional profit needed to dilute an oversized day.
  - **Daily Profit Concentration Chart** & **Rolling 5-Trade Stability** (rolling Win Rate % vs. Rules Followed %).
  - **Execution & Risk Habit Ledger** tracking rules followed, checklist completion, valid S/L attachment rate, max risk per trade, daily loss cap, daily trade cap, and position-size stability.
  - **Weekly & Daily Consistency Logs** with clickable daily rows that open the session execution drawer.

### Trade Journal & Multi-Format Importer
- **Manual Trade Logger**: Full entry/exit pricing, directional risk/R-multiple calculation, partial closes, fees/commissions/swap, setup tags, grades (`A+`–`C`), emotions, mistake tags, checklist evaluation, and chart screenshots.
- **Symbol-Aware R-Multiple Protection**: Automatically infers contract multipliers (Forex, Gold `XAU`, Silver `XAG`, JPY pairs, Crypto `BTCUSDm`, Indices) and marks `R` / `Planned R:R` as `N/A` whenever stop-loss is `0`, missing, or trailed to/past breakeven.
- **CSV Import**: Flexible column mapping for broker CSV exports with duplicate detection.
- **PDF Broker Statement Import**: Client-side PDF parsing via `pdfjs-dist` paired with chunked AI extraction (`POST /api/ai/extract-pdf-trades`), automatic truncation recovery, and duplicate skipping.
- **AI Screenshot Vision Import**: Compresses and extracts single-chart setups or multi-trade MT5/broker history lists (`POST /api/ai/extract-trade`).

### Deep Analytics & Risk Modeling
- **Breakdowns**: Segment performance by Setup, Strategy, Instrument, Session, Day of Week, Hour of Day, Month, Holding Time, Position Size, and Account/Broker (with `<30` low-sample warnings).
- **P&L Calendar & Period Rollups**: Monthly calendar grid with weekly rollups alongside monthly/yearly summaries.
- **Behavioral Diagnostics**: MAE/MFE scatter plot, cost of mistakes, rules followed vs. broken, emotional states, overtrading frequency, and win-rate degradation after consecutive losses.
- **Monte Carlo & Risk of Ruin**: 1,000-run equity path simulation over a 50-trade horizon (`p5`–`p95` bands and 25%-drawdown ruin probability).

### Planning, Rules, Playbook & Backtesting
- **Weekly Plan & Daily Plan**: Bias, watchlist, session levels, pre-market routines, and post-session reviews.
- **Checklist & Hard Risk Rules**: Customizable pre-trade checklist items plus max risk per trade (`%`), max daily loss, and max trades per day limits.
- **Strategy Playbook**: Document setup rules, entry triggers, invalidation criteria, and target R:R.
- **Backtesting Sandbox**: Isolated backtest log kept separate from live account metrics.

### AI Analyser & Performance Coach
- Server-side proxy routes keep all AI provider credentials out of the browser.
- Supports **Google Gemini** (`GEMINI_API_KEY`) as primary provider with optional **OpenRouter** (`OPENROUTER_API_KEY`) and **Groq** (`GROQ_API_KEY`) fallback routing.
- Generates trade reviews, weekly summaries, holistic journal diagnostic reports, and interactive journal Q&A.

### Storage, Backup & PWA
- **IndexedDB Persistence**: Accounts, live & backtest trades, strategies, plans, rules, and preferences are stored locally in the browser via IndexedDB.
- **JSON Backup & Restore**: Export/import complete workspace snapshots (ideal for archiving or syncing to Google Drive / cloud storage).
- **Installable PWA**: Configured with `vite-plugin-pwa` for production offline asset caching and desktop/mobile installability.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, Recharts, Motion
- **PDF Parsing**: `pdfjs-dist`
- **Backend**: Express (`server.ts` serving Vite middleware in dev and static `dist` in production)
- **AI SDKs / Providers**: `@google/genai`, OpenRouter API, Groq API
- **Persistence & PWA**: IndexedDB, `vite-plugin-pwa`

---

## Getting Started

### Prerequisites
- Node.js `>= 20`
- npm (or compatible Node package manager)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and add at least one AI provider key if you plan to use AI screenshot extraction, AI PDF statement parsing, or the AI Analyser:

```bash
cp .env.example .env
```

Available environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Recommended | Google Gemini API key for AI analysis, vision, and PDF extraction |
| `OPENROUTER_API_KEY` | Optional | OpenRouter API key for multi-model routing / fallback |
| `OPENROUTER_MODEL` | Optional | Default OpenRouter model (e.g. `google/gemini-2.5-flash`) |
| `GROQ_API_KEY` | Optional | Groq API key for fast inference fallback |
| `GROQ_MODEL` | Optional | Default Groq model (e.g. `llama-3.3-70b-versatile`) |
| `APP_URL` | Optional | Public URL where the app is hosted |
| `PORT` | Optional | Server port (defaults to `3000`) |

### 3. Run in Development
Starts the Express server with Vite middlewares on port `3000`:

```bash
npm run dev
```

### 4. Type-Check & Build for Production
```bash
npm run lint
npm run build
npm start
```

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Runs `tsx server.ts` (Express + Vite dev server on port 3000) |
| `npm run build` | Builds the production client bundle into `dist/` |
| `npm start` | Starts the production Express server (`node server.ts`) |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npm run preview` | Previews the Vite production build |
| `npm run clean` | Removes `dist/` and `server.js` |

---

## Server API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/ai/providers` | Returns configured AI provider availability (without exposing keys) |
| `POST` | `/api/ai/extract-trade` | Extracts single or multi-trade fields from uploaded chart/MT5 screenshots |
| `POST` | `/api/ai/extract-pdf-trades` | Extracts structured trade records from chunked broker PDF statement text |
| `POST` | `/api/ai/review-trade` | Generates an AI review for an individual trade |
| `POST` | `/api/ai/weekly-summary` | Summarizes weekly execution, habits, and P&L |
| `POST` | `/api/ai/report` | Generates a full journal diagnostic report |
| `POST` | `/api/ai/chat` | Interactive AI coach grounded in current journal metrics |

---

## Project Structure

```text
├── server.ts                          # Express server + AI proxy endpoints + Vite/static serving
├── index.html                         # App entry HTML
├── vite.config.ts                     # Vite + Tailwind v4 + PWA configuration
├── .env.example                       # Environment variable template
└── src/
    ├── App.tsx                        # Main workspace shell & page routing
    ├── main.tsx                       # React mount & production SW registration
    ├── db/
    │   └── indexedDb.ts               # Local IndexedDB persistence layer
    ├── context/
    │   └── JournalContext.tsx         # Global journal state, filtering, sanitization & CRUD
    ├── types/
    │   └── trading.ts                 # Domain types (Trade, Account, Strategy, Plans, Settings)
    ├── utils/
    │   ├── calculations.ts            # Performance, Consistency, Discipline, Breakdowns & Monte Carlo
    │   ├── currency.ts                # Currency conversion & R-multiple formatting
    │   ├── timezone.ts                # Timezone-aware date/week/session helpers
    │   └── sampleData.ts              # Optional 150-trade demo dataset generator
    ├── pages/
    │   ├── DashboardPage.tsx          # Overview & Consistency dashboard
    │   ├── JournalPage.tsx            # Filterable trade ledger
    │   ├── AnalysisPage.tsx           # Breakdowns, Calendar, Diagnostics & Monte Carlo
    │   ├── WeeklyPlanPage.tsx         # Weekly prep & review
    │   ├── DailyPlanPage.tsx          # Daily game plan & review
    │   ├── ChecklistPage.tsx          # Pre-trade checklist & hard risk rules
    │   ├── BacktestingPage.tsx        # Backtesting trade log
    │   ├── StrategyPage.tsx           # Strategy playbook
    │   └── AiAnalyserPage.tsx         # AI reports & performance coach chat
    └── components/
        ├── dashboard/                 # ConsistencyTab and dashboard subviews
        ├── drawers/                   # TradeDetailDrawer & DayTradesDrawer
        ├── layout/                    # Sidebar & Topbar
        ├── modals/                    # TradeEntryModal, TradeImportModal, AccountsModal, SettingsDataModal
        └── ui/                        # Shared UI primitives
```

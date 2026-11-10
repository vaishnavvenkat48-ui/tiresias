# Tiresias — Intelligent Knowledge Discovery and Visualization System

> Type any topic, get a map of everything related to it — with sources.

Tiresias reads **Wikidata and Wikipedia** (plus OpenAlex for research topics) and opens the result as an interactive, physics-driven **knowledge graph** within a few seconds — no AI on the critical path. **Gemini** then reviews the graph in the background and streams in a few clearly-marked additions. Every concept opens with a **Wikimedia Commons image**, Wikidata facts, YouTube lectures and research papers, and every link says where it came from.

![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite%205-61dafb) ![Graph](https://img.shields.io/badge/graph-React%20Flow%2012%20%2B%20d3--force-a855f7) ![Backend](https://img.shields.io/badge/backend-Express%20%2B%20MongoDB-47a248) ![AI](https://img.shields.io/badge/AI-Gemini-4285f4)

---

## ✨ What it does

| Area | Route | What you get |
|---|---|---|
| **Landing** | `/` | "Type any topic" search, real pre-built example graphs, how it works, what the three line styles mean |
| **Try it** | `/try?topic=` | Anonymous trial — a sources-only map with a light inspector; 3 per IP per day, no account needed |
| **Shared graph** | `/g/:shareId` | Read-only view of a graph someone shared; works logged out; links can be revoked |
| **Home** | `/dashboard` | Search, stats, your library, AI "Suggested for you", and **Activity** (7/30/90-day chart, top topics, recent feed) |
| **Explore** | `/explore` | Live pipeline progress → graph → AI additions merge in. Drag, expand, pin, hide, search; **Save** to library, **Share**, list view for screen readers; inspector with image, facts, overview, videos, papers |
| **Library** | `/graphs` | Graphs you explicitly saved; share, remove (with undo) or delete |
| **Ask Tiresias** | `/assistant` | Chat grounded in one of your graphs; saved conversations |
| **Profile / Settings** | `/profile`, `/settings` | Midnight / Porcelain / System theme, motion, graph defaults, password change, account deletion |

`/history`, `/analytics` and `/paths` redirect to Home (merged / shelved).

### Honest links — three tiers

| Line | Meaning | Where it comes from |
|---|---|---|
| **Solid** | Verified | A Wikidata statement directly connects the two concepts |
| **Dashed** | Related by search | Wikipedia "more like this" lists the articles as similar — a hint, not a fact |
| **Dotted** | AI's suggestion | Proposed by Gemini; never presented as sourced |

Provenance is computed server-side from retrieved evidence, never taken from the model. `npm run audit:provenance` re-checks every "verified" edge with a live SPARQL query — the last run over 20 topics found **100/100 verified links backed by a direct Wikidata statement** ([docs/provenance-audit.md](docs/provenance-audit.md)). That measures labelling accuracy, not whether the relationship is *interesting*.

### The knowledge graph
- **d3-force physics** (pauses when settled) with on/off and strength controls; drag single nodes or Shift-box groups; pin, hide, collapse; minimap, fullscreen, search-and-fly-to, keyboard shortcuts (`/ F E P H G Esc`).
- **Server-side expansion**: double-click asks the backend for new concepts around a node; positions and IDs are preserved; concepts already present become cross-links.
- **Accessible**: a list view presents the same graph as a nested outline usable with a screen reader or keyboard.
- **Persistence**: layout (positions, pins, hidden, physics) autosaves and is flushed on navigation/page close. Graphs only appear in your Library when you press **Save**.

## 🧠 How a graph is built

```
POST /api/graphs/generate/stream   (Server-Sent Events)
  stage ▸ resolve → wikipedia → wikidata → openalex → candidates → branches
  graph ▸ deterministic graph from sources (saved, enrichment: pending)   ← rendered now
  stage ▸ Gemini is reviewing the graph…
  enrich ▸ additions only: retrieved concepts placed, ≤4 suggestions, cross-links, notes
  done
```
- **Sources first**: the base graph needs no LLM, so it appears in a few seconds even when Gemini is slow, over quota or absent.
- **Model chain with hedging**: preferred model → fallbacks; a slow model is raced after `GEMINI_HEDGE_MS`; overloaded models are skipped; quota errors pause the provider.
- All provider calls have timeouts, retries (never on quota), circuit breakers, and a two-level cache (LRU + MongoDB TTL).

Full endpoint reference: **[`backend/docs/API_DOCS.md`](backend/docs/API_DOCS.md)**.

## 💸 Cost control (₹0 budget)

| Limit | Default | Env |
|---|---|---|
| Graph generations per user per day | 40 | `QUOTA_GENERATIONS_PER_USER` |
| Expansions per user per day | 150 | `QUOTA_EXPANSIONS_PER_USER` |
| AI chat / explain / suggestions per user per day | 80 | `QUOTA_AI_PER_USER` |
| Anonymous `/try` maps per IP per day | 3 | `QUOTA_TRY_PER_IP` |
| **Global Gemini calls per day** (hard cap) | 1500 | `GEMINI_DAILY_CALL_CAP` |

Public endpoints (`/api/public/*`) never call Gemini. When the global cap is hit, graphs are still built from sources and say so.

## 🧱 Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 5, Tailwind 3, React Router 6, Framer Motion, @xyflow/react 12, d3-force 3, Recharts, React Hook Form + Zod, Axios, Phosphor icons |
| Backend | Node 18+, Express 4, Mongoose 8, JWT (access + refresh), bcryptjs, express-validator, Zod, helmet, cors, express-rate-limit, morgan, native `fetch` |
| Data / APIs | MongoDB · Gemini · Wikidata · Wikipedia · OpenAlex · Crossref · YouTube Data API v3 · Wikimedia Commons · Openverse · Unsplash (optional) |

## 🚀 Setup

```bash
npm install            # root runner
npm run install:all    # frontend + backend
cp backend/.env.example backend/.env
npm run dev            # backend :5000 + frontend :5173
```

Open **http://localhost:5173**. `GET http://localhost:5000/api/health` shows which providers are configured.

| Variable | Needed? | Notes |
|---|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | prod: yes | long random strings |
| `MONGO_URI` | prod: yes | empty (or unreachable) in dev → **embedded MongoDB stored in `backend/.data/db`**, persists across restarts. `MONGO_EPHEMERAL=true` for a throwaway DB |
| `GEMINI_API_KEY` | recommended | Google AI Studio; without it graphs are sources-only |
| `YOUTUBE_API_KEY` | recommended | YouTube Data API v3 (~100 searches/day free) |
| quotas, `TRUST_PROXY`, `SERVE_FRONTEND`, `SEED_*` | optional | see `backend/.env.example` |

Wikidata, Wikipedia, Commons, Crossref and OpenAlex need no keys. `backend/.env` and `backend/.data/` are git-ignored — never commit them.

Useful scripts (in `backend/`): `npm run precache [-- --fresh]` warms the landing-page showcase · `npm run seed` creates a demo user from `SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD` (a random password is printed if unset).

## ✅ Testing

```bash
npm test                          # root: backend suite + browser E2E
cd backend && npm test            # 28 integration tests, real app + in-memory MongoDB, providers mocked
cd backend && npm run test:contract   # LIVE=1 — real Wikidata/Wikipedia/Commons/OpenAlex response shapes
cd backend && npm run audit:provenance # re-verify "verified" edges against Wikidata SPARQL
cd frontend && npm run test:e2e   # Playwright (system Chrome): sign up → map → inspect → save → share → open logged out; anonymous trial
```

The E2E test expects the dev servers to be running. The trial test accepts either a graph or the daily-limit screen, since the per-IP quota persists.

## ☁️ Deploy

`render.yaml` deploys one web service: the backend builds and serves `frontend/dist` (`VITE_API_URL=/api`) with health check `/api/health`. Set `MONGO_URI` (e.g. MongoDB Atlas free tier), `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `CLIENT_URL`, and `TRUST_PROXY=1`; JWT secrets are generated. Free instances sleep after inactivity — ping `/api/health` every ~10 min with a free uptime monitor (or use a paid plan) and run `npm run precache` after each deploy.

## ⚠️ Limits & notes

- Wikipedia text is **CC BY-SA 4.0** and is credited wherever it's shown; Wikidata is CC0; image creator/licence/source come from Commons metadata — Tiresias can't guarantee every image is free for every use.
- Free tiers: YouTube ≈ 100 searches/day; OpenAlex without a key shares a small daily budget; Gemini free-tier rate limits apply. All are cached and degrade gracefully.
- Learning Paths are shelved in the UI; the `/api/learning-paths` endpoints remain.

## 🛡️ Security

bcrypt-12 · short-lived access JWT + revocable refresh tokens · helmet CSP · CORS allowlist · global, auth, AI, per-IP and daily quotas · NoSQL sanitiser · express-validator on every input · owner checks on graphs and conversations · share links are random, read-only and revocable, exposing only the owner's display name · API keys only on the server, never returned or logged · no credentials in the repo (seed reads env) · production refuses to boot without real secrets and a database.

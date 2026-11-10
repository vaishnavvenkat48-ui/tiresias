# TIRESIAS — Project Context Window

> **Tiresias — Intelligent Knowledge Discovery and Visualization System.**
> One-line: *type any topic, get a map of everything related to it — with sources.*

**Status (2026-11-01, after the LLM-council review):** sources-first graph generation streamed over SSE, honest three-tier provenance (audited 100/100), explicit Save + share links, anonymous `/try`, daily quotas + a global Gemini cap, persistent embedded MongoDB, two themes only, Home/Analytics/History merged, Learning Paths shelved in the UI. Backend 28/28 mocked tests, 4/4 live contract tests, Playwright core-loop E2E passing.

> **§0 below is authoritative.** Sections §4–§6 were written before the council update; where they mention `Topic`/`Node` models, `/topics`, `/paths`, `/ai/ask`, `/users/stats`, seven "modes", favourites or an ephemeral DB, §0 wins.

---

## 0. Council update — what changed and the rules it set

**Generation (backend `services/graphGeneration.service.js`)** — `buildBase` (Wikidata/Wikipedia/OpenAlex only, no LLM; saved with `saved:false`, `enrichment:'pending'|'skipped'`) → `enrich` (Gemini proposes *additions only*, Zod-validated; never moves or relabels sourced data). `preview(topic)` = cached, sources-only, no DB (used by `/api/public`). `POST /graphs/generate/stream` emits `stage → graph → stage(ai) → enrich → done` (see `backend/docs/API_DOCS.md`).

**Provenance tiers** — `verified` (Wikidata statement) · `search_related` (Wikipedia morelike only) · `ai_suggested` · `user_added`. Decided server-side from evidence. Frontend line styles: solid / dashed / dotted (`graph/EdgeLayer.jsx` classes `prov-verified|prov-search|prov-ai`). `npm run audit:provenance` re-verifies with SPARQL.

**Cost & abuse** — `services/quota.service.js` (`UsageCounter` TTL collection): per-user daily `generate/expand/ai`, per-IP `try`, global `gemini` cap checked inside `gemini.client.generate`. `/api/public/*` never calls Gemini.

**Data** — no `MONGO_URI` (or unreachable) → embedded MongoDB on disk at `backend/.data/db`, port 27027; scripts reuse a running instance. `MONGO_EPHEMERAL=true` for a throwaway DB. `KnowledgeGraph` gained `saved`, `shareId`, `enrichment`; `Topic` and `Node` models and the legacy root `backend/{config,controllers,…}` folders are deleted.

**Frontend** — `PrefsContext` + `theme/palette.js` (one identity palette per theme; `ModeContext`/`theme/modes.js` deleted; ambient off by default). Routes: `/`, `/try`, `/g/:shareId`, `/login`, `/register`, `/dashboard` (Home + `#activity`), `/explore`, `/graphs` (Library = saved only), `/assistant`, `/profile`, `/settings`; `/history`, `/analytics`, `/paths` redirect. `pages/Explore.jsx` consumes the SSE stream (`graphsApi.generateStream`), shows real stages, merges `enrich` additions, has Save/Share, legend, first-run "click a concept" hint (`prefs.nodeHintSeen`) and an accessible list view. `pages/TryGraph.jsx` serves both `/try` and `/g/:shareId`. `NodeInspector` exports `TextCredit` (Wikipedia CC BY-SA / Wikidata CC0 / AI-written) and `Attribution` (image credit).

**Rules**
1. The graph must render without the LLM. Gemini output is additive and labelled.
2. Never label a link `verified` without a Wikidata statement.
3. Every new paid/quota'd call goes through `quota.service` and the Gemini cap.
4. Text from Wikipedia is always credited (CC BY-SA 4.0); images show creator/licence/source.
5. No credentials in the repo — seed reads `SEED_*` env; keys live only in `backend/.env`.

**Tests** — `backend: npm test` (mocked, 28) · `npm run test:contract` (LIVE=1) · `frontend: npm run test:e2e` (Playwright 1.55, system Chrome, needs dev servers). Root `npm test` runs both. Deploy: `render.yaml` (single service serving `frontend/dist`), keep-warm via an uptime pinger, `npm run precache` after deploy.

---

## 1. Monorepo layout & commands

```
tiresias/
├── CONTEXT.md            # this file
├── README.md             # setup + feature overview
├── render.yaml           # one-service deploy (API serves the built SPA)
├── package.json          # root runner (concurrently) · npm start · npm test
├── docs/                 # UX_AUDIT, BACKEND_PLAN, provenance-audit
├── backend/              # Express + Mongoose API (port 5000)
│   ├── src/              # implementation (see §0, §4)
│   ├── scripts/          # seed, precache, provenance-audit, provider checks
│   └── docs/API_DOCS.md
└── frontend/             # React 18 + Vite 5 app (port 5173) · e2e/ (Playwright)
```

| Command (from `tiresias/`) | What it does |
|---|---|
| `npm run install:all` | installs backend + frontend deps |
| `npm run dev` | backend :5000 + frontend :5173 concurrently |
| `npm start` | production: backend serves API + `frontend/dist` |
| `npm test` | backend tests + browser E2E |
| `cd backend && npm run seed` / `precache [-- --fresh]` / `audit:provenance` | demo data · warm showcase · re-verify provenance |

**Ports:** backend `5000`, frontend `5173`, embedded Mongo `27027`. Frontend API base = `VITE_API_URL`, else `/api` in production builds, else `http://localhost:5000/api`.

**Backend env:** see `backend/.env.example` (secrets, `MONGO_URI`, Gemini/YouTube keys, quotas, `GEMINI_DAILY_CALL_CAP`, `TRUST_PROXY`, `SERVE_FRONTEND`, `SEED_*`).

---

## 2. What the website does (functionality map)

| Route | Access | What it does | API |
|---|---|---|---|
| `/` Landing | public | Hero search (→ `/try` or `/explore`), real showcase graphs, how it works, the three line styles | `/public/showcase` |
| `/try?topic=` | public | Sources-only trial map + light inspector; 3/IP/day | `/public/try`, `/public/topic` |
| `/g/:shareId` | public | Read-only shared graph | `/public/graphs/:shareId` |
| `/login`, `/register` | public | `AuthShell`, RHF + Zod | `/auth/*` |
| `/dashboard` (Home) | auth | Search, stats, library preview, AI suggestions, `#activity` (chart, top topics, feed) | `/analytics/me`, `/analytics/me/activity`, `/graphs?saved=true`, `/ai/recommendations` |
| `/explore` | auth | Streamed generation, graph, inspector, Save, Share, list view. `?topic=`, `?graph=`, `&focus=` | `/graphs/generate/stream`, `/graphs/:id/*`, `/resources/*`, `/ai/explain` |
| `/graphs` (Library) | auth | Saved graphs; share, remove (undo), delete | `/graphs?saved=true`, `/graphs/:id/save|share` |
| `/assistant` | auth | Chat grounded on a graph; saved conversations | `/ai/chat`, `/ai/conversations` |
| `/profile`, `/settings` | auth | Profile, theme, motion, graph defaults, password, account deletion | `/users/*` |

**Auth flow (frontend):** `AuthContext` holds `{user, token}` in localStorage (`tiresias_token`/`tiresias_user`), rehydrates via `GET /auth/me`, and listens for the `tiresias:unauthorized` event that `services/api.js` dispatches on any 401. `ProtectedRoute` gates `AppLayout`. All pages are `React.lazy` code-split.

---

## 3. Frontend architecture (`frontend/src/`) — graph engine (unchanged)

- `graph/KnowledgeGraph.jsx` — self-contained graph component. Props `{graph, graphKey, layout, onLayoutChange, selectedId, onSelect, onExpand, onAction, expandingIds, compact}`; ref API `focusNode, fit, expandOrToggle, togglePin, hideBranch`. Changing `graphKey` resets; `layout` is only read on reset.
- `graph/useForceLayout.js` — d3 simulation; rAF loop runs only while `alpha > alphaMin` or a drag is active.
- `graph/EdgeLayer.jsx` — all edges in one SVG; resting edges merged into one `<path>` per style class. Don't switch back to per-edge components.
- `graph/model.js` — node/edge/layout contract, `normalizeNode/normalizeEdge`, `fromPersisted`, `emptyLayout`.
- **Design system (`styles/index.css` + `tailwind.config.js`)** — Midnight (dark) / Porcelain (light) neumorphism with skeuomorphic accents (`btn-primary` gloss, `switch`, `range`, `progress`, `kbd`, `frame`, `kg-canvas` bezel). Accent tokens `--accent, --accent-2, --accent-3, --ambient` are set from `theme/palette.js`.

---

## 4. Backend architecture (`backend/src/`)

**Stack:** Node 18+, Express 4, Mongoose 8, JWT (`jsonwebtoken`), bcryptjs, express-validator + Zod, helmet, cors, morgan, express-rate-limit, cookie-parser, dotenv. No native DB required for dev (memory fallback).

**Layer rule (strict):** `routes → controllers (thin HTTP only) → services (business logic) → repositories (Mongoose queries) → models`. Services never touch `req/res`; controllers never touch Mongoose directly; every major action calls `activity.service.track(...)`. Responses always `{success, message, data}` (+ `pagination` for lists) via `utils/response.js`.

```
src/app.js              # express wiring: helmet, CORS(CLIENT_URL), json, cookies,
                        # sanitize, morgan, rate-limits, routes, errorHandler
src/server.js           # listen + connectDB
src/config/             # db.js (5s-timeout connect + memory fallback + 503-friendly), env.js
src/constants/          # roles.js (USER/ADMIN), categories.js (7 values), activityTypes.js (14 events)
src/models/             # User, Topic, KnowledgeGraph (+Graph alias, same collection),
                        # Node, LearningPath, UserActivity
src/repositories/       # base.repository.js + user/topic/graph/activity wrappers
src/services/           # auth, user, topic, graph, analytics, activity,
                        # TopicClassificationService, wikipedia, youtube, ai/GeminiService.js
src/controllers/        # auth, user, topic, graph, analytics, ai (map HTTP ↔ services)
src/routes/             # auth, users, topic, graph, analytics, ai (auth + validate chains)
src/middleware/         # authMiddleware (+protect alias, authorize), validate,
                        # errorHandler (+notFound), requireDB (friendly 503),
                        # sanitize (NoSQL/prototype guard), activityTracker
src/validators/         # rules.js (express-validator) + schemas.js (Zod + validateZod)
src/utils/              # response, ApiError (AppError/BadRequest/Unauthorized/
                        # Forbidden/NotFound/Conflict), jwt (access+refresh),
                        # asyncHandler, pagination
src/jobs/               # analytics.job.js (rollup placeholder for node-cron)
```

**Models (key fields):**
- `User`: `name, username (lowercase, unique), email (unique), password (bcrypt-12, select:false)`, `profilePicture` (+`avatar` legacy alias, kept in sync), `joinedAt` (+timestamps), `role` (`USER|ADMIN`, setter uppercases legacy lowercase), `preferences{visualMode, theme, notifications, emailNotifications, productUpdates}`, `stats{topicsExplored, graphsCreated, aiInteractions (+legacy savedGraphs/learningPaths/aiSessions)}`, `savedGraphs[], learningPaths[], refreshTokens[]`. `toSafeJSON()` strips secrets and returns both new + legacy fields.
- `Topic`: `title, slug (auto), category (7-enum), description, summary, tags[], viewCount, createdBy` + text index.
- `KnowledgeGraph`: `title, owner, rootTopic(+rootTopicTitle, +legacy topic), category, description, nodes[]/edges[] (embedded: {id,label/title,description,type,depth,metadata})`, `generatedBy (ai|manual|wikipedia|mock), visibility (private|public), viewCount, savedBy[]`.
- `Node`: standalone mirror `{graphId, nodeId, title, label, description, type, depth, metadata, expansionCount}` (unique `graphId+nodeId`).
- `LearningPath`: `{userId (+owner alias), title, startingTopic (+topic alias), level, milestones[]/steps[] {title,description,resources[],status,order}, completionPercentage (auto)}`.
- `UserActivity` (append-only): `{userId, activityType (14-enum), targetId (polymorphic), targetModel, metadata, sessionDuration, timestamp}` + indexes.

**API (base `/api`, Bearer `<accessToken>` unless noted):**

| Method & path | Auth | Notes |
|---|---|---|
| `GET /health` | — | `{status, service, db, time}` inside envelope |
| `POST /auth/register {name,username,email,password}` | — | → `{token, accessToken, refreshToken, user}` + httpOnly cookie |
| `POST /auth/login {email,password}` | — | same shape; `USER_LOGIN` tracked |
| `GET /auth/me` | Bearer | envelope + legacy top-level `user` |
| `POST /auth/logout` | Bearer | pulls refresh token / clears all + cookie |
| `POST /auth/refresh {refreshToken}` | — | cookie or body; revoked tokens rejected |
| `GET /users/profile` · `PUT /users/profile` | Bearer | allowlist update; avatar↔profilePicture mirrored |
| `GET /users/stats` | Bearer | live user stats + collection totals |
| `GET /topics?page&limit&category&q` | Bearer | paginated `{items, pagination}` |
| `GET /topics/:id` | Bearer | viewCount++ + `TOPIC_VIEWED` |
| `POST /topics {title,category?,description?,tags?}` | Bearer | category auto-detected if omitted; `TOPIC_SEARCHED` + stats bump |
| `PUT /topics/:id` · `DELETE /topics/:id` | Bearer | |
| `GET /graphs?owner=me` | Bearer | non-admins see own + public |
| `GET /graphs/:id` | Bearer | owner/public/admin gate; viewCount++ |
| `POST /graphs {title,…nodes?,edges?,visibility?}` | Bearer | **omitted `nodes` auto-generates a mock AI graph**; mirrors nodes to `Node` collection |
| `PUT /graphs/:id` · `DELETE /graphs/:id` | Bearer | owner/admin only; PUT allowlists `title, description, category, nodes, edges, layout, visibility` |
| `POST /graphs/:id/expand/:nodeId` | Bearer | `NODE_EXPANDED` + expansionCount++ |
| `GET /analytics/dashboard` | Bearer | `{totals:{topics,graphs,users,activities,aiQueries,nodeExpansions,graphViews}}` |
| `GET /analytics/topics` · `/users` · `/activity?type=&page` | Bearer | top/byCategory; total/byRole/recent; feed + byType |
| `GET /analytics/me?days&tz` · `/analytics/me/activity` | Bearer | personal analytics (totals, categories, topTopics, timeline, hours) · own activity log |
| `GET /paths` · `GET/DELETE /paths/:id` | Bearer | owner-only learning paths |
| `POST /paths/:id/milestones` · `PATCH|DELETE /paths/:id/milestones/:index` | Bearer | add / set status / remove milestone |
| `POST /ai/ask {question,graphId?,focus?}` | Bearer | server-side grounding in the user's graph + recent topics; `AI_QUERY` + `aiInteractions++` |
| `POST /ai/summarize {topic}` · `POST /ai/learning-path {topic,level?}` | Bearer | learning-path persists a `LearningPath` doc |
| `GET /ai/wikipedia/search?q` · `/ai/wikipedia/summary/:title` | Bearer | live Wikipedia, mock fallback |
| `GET /ai/videos?topic` | Bearer | mock until `YOUTUBE_API_KEY` |

**Frontend-compat contract (do not break):** auth responses carry top-level `token` + `user` alongside `data` (frontend does `login({...res})` and `const {user} = await fetchMe()`); `PUT /users/profile` returns top-level `user`; `GET /users/stats` returns top-level `stats`. Error shape is always `{success:false, message}` (400/401/403/404/409/503).

**Security:** helmet, CORS allowlist, global + strict `/api/auth` rate limits, `sanitize` (strips `$`/`.`/`__proto__` keys), bcrypt-12, short access JWT + 30d refresh with revocation list, validated `MONGO_URI`/secrets via `env.js`.

---

### 4b. Retrieval + AI layer (added with the backend build-out)

```
src/utils/http.js            # fetch w/ timeout, UA, backoff retry (never on quota), per-provider circuit breaker, safe media URLs
src/utils/cache.js           # L1 LRU + Mongo ResourceCache (TTL index) + in-flight dedupe; TTLs per resource type
src/services/providers/      # wikidata (search/details/facts via API+SPARQL), wikipedia (summary/morelike),
                             # scholarly (OpenAlex works/topics + Crossref), media (YouTube, Commons, Openverse, Unsplash)
src/services/ai/gemini.client.js   # REST, JSON mode, model chain + 9 s hedging, corrective retry, breakers
src/services/ai/GeminiService.js   # explain, learning paths (stages), grounded chat, recommendations — each with an offline fallback
src/services/knowledgeRetrieval.service.js  # topic-sensitive fan-out → candidates + retrievedPairs (evidence)
src/services/graphGeneration.service.js     # retrieve → Gemini plan (refs k1..kn) → assemble/validate → provenance → save
src/services/graphExpansion.service.js      # owner check → concept retrieval → Gemini picks → append-only merge
src/services/graph/contract.js              # ids (c:<slug>), makeNode/makeEdge, validateGraph
src/services/resources.service.js           # topic card (P18 image + facts), images, videos, research (contextual queries)
```
New models: `ResourceCache` (TTL), `AIConversation`. Extended: KnowledgeGraph (node/edge `provenance`, `sources`, `relationship`; `isFavorite`, `topicKey`, `domain`, `wikidataId`, `generation`), LearningPath (`description`, `estimatedDuration`, `graphId`, milestone `concepts`), UserActivity (`graphId`, `nodeId`, `topic`, `category`).
New routes: `/graphs/generate`, `/graphs/:id/layout|favorite`, real `/graphs/:id/expand/:nodeId`; `/resources/*`; `/learning-paths/*` (alias `/paths`); `/ai/chat|explain|recommendations|conversations`; `/analytics/overview|activity|topics|categories|graphs` (user-scoped; platform views admin-only); `/activity`; `/users/preferences|password|account`.
Tests: `backend/tests/` (node:test + mongodb-memory-server, all providers mocked via a fake `fetch`). Live checks: `scripts/check-providers.js`, `scripts/live-api-check.js`.

**Frontend theme:** `PrefsContext.theme` ('dark' | 'light' | 'system') → `html[data-theme]` (also set pre-paint by an inline script in `index.html`); `ModeContext` writes the mode's palette for the *active theme* (`paletteFor(mode, theme)`). Explore no longer saves drafts: graphs come from `POST /graphs/generate`, expansions from the server, layout autosaves via `PATCH /graphs/:id/layout` (flushed on unmount/pagehide with `keepalive`).

## 5. Key cross-cutting systems

- **Category/mode alignment:** backend `TopicClassificationService.classify()` (regex keyword map) and frontend `detectMode()` (keyword lists in `theme/modes.js`) must stay in sync — both map to `Technology, History, Science, Philosophy, Business, Mythology, General`.
- **Activity tracking → analytics:** services emit `USER_REGISTERED/LOGIN/LOGOUT, TOPIC_SEARCHED/VIEWED, GRAPH_CREATED/VIEWED/SAVED, NODE_EXPANDED, LEARNING_PATH_GENERATED/VIEWED, AI_QUERY, VIDEO_RECOMMENDED, SESSION_HEARTBEAT`; `analytics.service` aggregates live counts + top/byCategory/byRole feeds.
- **Mock→live seams:** `GeminiService` (live when `GEMINI_API_KEY` is set; model `GEMINI_MODEL`, default `gemini-2.5-flash`; grounded template fallback otherwise), `youtube.service` (`YOUTUBE_API_KEY` → Data API v3; currently search links), graph generation (`frontend/src/graph/sources.js` — Wikipedia in the browser; swap for a backend generator without touching the UI). Charts and stats are live.

## 6. Rules for future changes

1. New endpoints: `model → repository → service → controller → route`, chain `authMiddleware (+authorize) → rules → validate → controller`; return via `sendSuccess/sendPaginated`; track activity.
2. New pages go inside `AppLayout` shell (sidebar/transitions stay consistent); new theme needs only a `MODES` entry + backend keyword row.
3. Never remove legacy response fields (`token/user/stats/avatar/topic/owner`) — old clients and localStorage depend on them.
4. Keep docs in sync: `backend/docs/API_DOCS.md` for endpoints, this file for architecture.
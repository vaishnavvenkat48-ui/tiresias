# Tiresias — Backend Implementation Plan (retrieval + AI pipeline)

> **Status (2026-11-01): implemented.** All milestones below are done; see `backend/docs/API_DOCS.md`.
> Verified by `npm test` (22 mocked integration tests), `npm run check:providers` and
> `npm run check:live` (34 live checks), plus a browser E2E run. Deviations from the plan:
> Gemini calls use REST directly (SDK removed) with **hedged** model fallback; `User.password`
> kept (not renamed to `passwordHash`) for compatibility; every generated graph is saved
> (favourites replace the old explicit "Save").

Written after reading README.md, CONTEXT.md and the code. The brief's suggested layout is
adapted to the **existing** layered backend rather than duplicated.

## 1. Current architecture (as found)

- Express 4 + Mongoose 8, strict layering `routes → controllers → services → repositories → models`,
  envelope `{ success, message, data }`, JWT access + refresh (revocable), bcrypt-12, helmet, CORS,
  rate limits, NoSQL sanitiser, express-validator. In-memory Mongo fallback in dev.
- Models: User, Topic, KnowledgeGraph (+`layout`), Node (mirror), LearningPath, UserActivity.
- AI: `services/ai/GeminiService.js` via `@google/generative-ai`, **single hard-coded model**,
  templates when the call fails. Probe on 2026-11-01: the configured key works, but
  `gemini-2.5-flash` is retired for new users and `gemini-3.8-flash`/`3.5-flash` return 503
  (high demand) while `gemini-flash-lite-latest` answers → a model **fallback chain** is required.
- Graph generation happens **in the browser** (Wikipedia `morelike:` search); the backend only stores
  what the client sends. Expansion endpoint only logs an event. YouTube is a mock. No images,
  Wikidata, OpenAlex or Crossref. No caching layer.
- Frontend contract to preserve: node `{id ('root' | 'c:<slug>'), label, description, depth, type,
  metadata:{parent,url,source,expanded}}`, edge `{id, source, target, type: subtopic|related}`,
  `layout {positions, pinned, hidden, physics, strength}`; auth responses with top-level `token/user`.

## 2. Target architecture

```
routes ─ controllers ─ services ─────────────┬─ repositories ─ models
                         │                   └─ providers/ (one module per external API)
                         ├─ knowledgeRetrieval.service   (topic-sensitive provider fan-out, normalise, dedupe)
                         ├─ graphGeneration.service      (retrieval → Gemini JSON → validate → provenance → save)
                         ├─ graphExpansion.service       (owner check → context → Gemini/Wikipedia → merge w/o dupes)
                         ├─ resources.service            (videos, images, research, topic card — cached)
                         └─ ai/gemini.client.js          (REST, JSON mode, model fallback, retry/backoff, quota breaker)
providers/: wikidata, wikipedia, openalex, crossref, youtube, wikimediaCommons, openverse, unsplash
utils/http.js: fetch with timeout, User-Agent, retry w/ exponential backoff (never on 4xx quota)
utils/cache.js: ResourceCache (Mongo TTL) + in-process LRU for hot keys
```

## 3. Schema changes (additive, backward compatible)

| Model | Change |
|---|---|
| KnowledgeGraph | `originalTopic`, `domain`, `isFavorite`, `theme`; node adds `category, parentId, sources[], provenance, pinned, position`; edge adds `relationship, description, provenance, sources[]`. `type`/`metadata` kept for the UI. |
| LearningPath | `description`, `estimatedDuration`; `stages` exposed as an alias of `milestones` in responses. |
| ResourceCache *(new)* | `{ key, query, resourceType, provider, results, expiresAt }`, TTL index on `expiresAt`, unique `key`. |
| AIConversation *(new)* | `{ userId, graphId, messages[{role, content, sources, createdAt}], context }`, capped to the last 40 messages. |
| UserActivity | add `graphId, nodeId, topic, category` convenience fields (indexed) next to `targetId/metadata`. |
| User | unchanged (`password` is bcrypt-hashed, `select:false` — kept for compatibility instead of renaming to `passwordHash`). |

Provenance values: `verified` (directly supported by a retrieved record — Wikidata statement, the
article's own "related" result, etc.), `ai_suggested` (proposed by Gemini from the retrieved context),
`user_added`. Sources are `{ provider, title, url }` built only from URLs the provider returned.

## 4. Endpoints (existing ones keep working)

- Graphs: `POST /graphs/generate`, `POST /graphs/:id/expand/:nodeId` (now really expands), `PATCH /graphs/:id`,
  `PATCH /graphs/:id/layout`, `POST /graphs/:id/favorite`; existing GET/POST/PUT/DELETE unchanged.
- Resources: `GET /resources/videos|images|research|topic?topic=`.
- Learning paths: `/learning-paths` (generate, list, get, PATCH, DELETE, PATCH `/:id/progress`) — `/paths` kept as alias.
- AI: `POST /ai/chat` (persisted conversations), `/ai/explain`, `/ai/recommendations`; `/ai/ask` kept.
- Analytics (user-scoped): `/analytics/overview|activity|topics|categories|graphs` with `from/to/days/category`;
  `/analytics/me*` kept. Global `/analytics/dashboard|users` become **admin-only**.
- Activity: `POST /activity`, `GET /activity/history`, `GET /activity/recent`.
- Users: `PATCH /users/profile`, `PATCH /users/preferences`, `PATCH /users/password`, `DELETE /users/account`.

## 5. Generation workflow

1. Validate topic (1–120 chars). 2. Reuse the user's existing graph for the same topic unless `fresh`.
3. Classify domain (keyword classifier, refined by Wikidata `instance of`).
4. Retrieve in parallel with per-provider timeouts: Wikidata entity + key statements + linked entities,
   Wikipedia summary + `morelike` neighbours; for Science/Technology/Philosophy also OpenAlex topics/works
   (+ Crossref only to enrich DOIs). Cache every provider response.
5. Normalise/dedupe candidate concepts (title slug) → context bundle.
6. Gemini (JSON response mode) organises **only** those candidates (plus a few clearly-marked AI
   suggestions) into nodes/edges. 7. Validate: unique ids, edges reference nodes, no self-loops,
   ≤ 40 nodes, labels sanitised; provenance computed server-side from the bundle, never trusted from the model.
8. If Gemini is unavailable/quota-exhausted → deterministic fallback graph from the retrieved records
   (all `verified`). 9. Save, track `GRAPH_CREATED` + `TOPIC_SEARCHED`, return the frontend contract.

## 6. Security / cost

Keys only in `backend/.env` (git-ignored); never logged or returned. Provider calls carry a
descriptive User-Agent (Wikimedia policy). Quota breaker: on 429/`RESOURCE_EXHAUSTED`/`quotaExceeded`
the provider is disabled until the reset window instead of retrying. YouTube results cached 7 days,
images/topic cards 7 days, research 3 days, Wikidata entities 14 days. Image URLs are only accepted
from provider responses and must be `https:` on an allow-listed host. Openverse/Unsplash optional.

## 7. Milestones

1 Foundation (env validation, http/cache utils, models) → 2 Providers → 3 Generation + expansion →
4 Resources → 5 Paths, AI chat, activity, analytics → 6 Frontend integration, automated tests
(node:test with mocked fetch) + live smoke, docs.

# Tiresias Backend — API Reference

Base URL: `http://localhost:5000/api` · Auth: `Authorization: Bearer <accessToken>` (all routes except `/health`, `/auth/register|login|refresh`).

Envelope: `{ "success": true, "message": "…", "data": … }` · errors `{ "success": false, "message": "…", "errors?": […] }` with 400 / 401 / 403 / 404 / 409 / 422 / 429 / 503.
Paginated lists: `data: { items, pagination: { page, limit, total, totalPages } }` (`?page=&limit=`, max 100).

## Health
| | |
|---|---|
| `GET /health` | `{ status, db, time, providers: { gemini, youtube, openalexKey, unsplash, keyless[], paused{} } }` — which integrations are configured (never the keys) and any paused by quota |

## Auth `/auth`
| Method | Path | Body → Response |
|---|---|---|
| POST | `/auth/register` | `{ name, username, email, password }` → `{ token, accessToken, refreshToken, user }` (+ httpOnly refresh cookie). 409 on duplicate email/username |
| POST | `/auth/login` | `{ email, password }` → same. 401 on bad credentials |
| GET | `/auth/me` | → `{ user }` |
| POST | `/auth/logout` | `{ refreshToken? }` (omit to revoke all sessions) |
| POST | `/auth/refresh` | `{ refreshToken }` or cookie → `{ accessToken }` |

Rate limit: 100 requests / 15 min on `/auth`.

## Users `/users`
| Method | Path | Notes |
|---|---|---|
| GET | `/users/profile` | `{ user }` |
| PUT · PATCH | `/users/profile` | `{ name?, username?, email?, avatar?, preferences? }` (preferences are merged) |
| PATCH | `/users/preferences` | `{ theme?: dark\|light\|system, visualMode?, notifications?, emailNotifications?, productUpdates? }` |
| PATCH | `/users/password` | `{ currentPassword, newPassword }` — strength-checked; signs out other sessions. 401 if current is wrong |
| DELETE | `/users/account` | `{ password }` — deletes the user **and** their graphs, paths, activity, conversations and quota counters |

## Knowledge graphs `/graphs`
| Method | Path | Notes |
|---|---|---|
| POST | `/graphs/generate/stream` | `{ topic, fresh? }` → **Server-Sent Events** (see below). The frontend uses this. Daily quota `generate` |
| POST | `/graphs/generate` | `{ topic, fresh? }` → `{ graph, reused, generation }` — same pipeline, single response (base + enrichment inline). Daily quota `generate`. 422 if nothing reliable is found |
| GET | `/graphs?owner=me&saved=true\|false&favorite=1&q=&category=` | user's graphs; `saved=true` = the Library |
| POST | `/graphs/:id/save` | `{ saved?: boolean }` (default true) — add to / remove from the Library. Generated graphs start with `saved: false` |
| POST | `/graphs/:id/share` | `{ enabled: boolean }` → `{ shareId }` — create (also saves) or revoke a read-only public link `/g/:shareId` |
| GET | `/graphs/:id` | owner / public / admin only (403 otherwise) |
| POST | `/graphs` | save client-supplied `{ title, nodes, edges, layout? }`; without `nodes` it runs the generation pipeline |
| PUT · PATCH | `/graphs/:id` | allowlisted fields: `title, description, category, nodes, edges, layout, visibility, isFavorite, saved, theme` (owner can't be reassigned) |
| PATCH | `/graphs/:id/layout` | `{ layout }` — lightweight autosave |
| POST | `/graphs/:id/favorite` | `{ favorite?: boolean }` (omit to toggle) |
| DELETE | `/graphs/:id` | owner/admin |
| POST | `/graphs/:id/expand/:nodeId` | → `{ nodes, edges, node, model, exhausted }` — **only the additions**. Existing ids, positions and pins are untouched; re-expanding returns different concepts; concepts already in the graph become `related` cross-links. Daily quota `expand` |

### SSE events (`/graphs/generate/stream`)
| Event | Data |
|---|---|
| `stage` | `{ stage, message }` — `resolve · wikipedia · wikidata · openalex · candidates · branches` then `ai · ai-done` |
| `graph` | `{ graph, reused }` — the saved sources-only graph (`enrichment: "pending" \| "skipped"`); render it now |
| `enrich` | `{ nodes, edges, updates[{id, relationship, description}], description, parentsExpanded, model }` — AI additions only; or `{ failed: true, note }` / `{ skipped: true }` |
| `done` | `{ enrichment, generation }` |
| `error` | `{ message, status }` (e.g. 422, 429) |

A 15 s `: keep-alive` comment is sent while waiting. If the client disconnects, enrichment still finishes and is saved.

### Graph contract (React Flow-compatible)
```jsonc
// node
{ "id": "root" | "c:<slug-of-label>", "label": "Event horizon", "description": "…", "depth": 1,
  "type": "root|concept|subtopic", "category": "Science", "parentId": "root",
  "provenance": "verified|search_related|ai_suggested|user_added",
  "sources": [{ "provider": "Wikidata", "title": "…", "url": "https://www.wikidata.org/wiki/Q…" }],
  "metadata": { "parent": "root", "url": "https://en.wikipedia.org/wiki/…", "source": "wikidata|wikipedia|openalex|ai", "expanded": false, "wikidataId": "Q…" } }
// edge
{ "id": "e:subtopic:root>c:event-horizon", "source": "root", "target": "c:event-horizon",
  "type": "subtopic|related", "relationship": "has part", "description": "AI note: …",
  "provenance": "verified|search_related|ai_suggested|user_added", "sources": [ … ] }
// graph extras
{ "layout": { "positions": { "root": { "x": 0, "y": 0 } }, "pinned": [], "hidden": [], "physics": true, "strength": 1 },
  "saved": false, "shareId": null, "enrichment": "none|pending|done|failed|skipped",
  "isFavorite": false, "domain": "Astrophysics", "wikidataId": "Q589",
  "generation": { "model": "gemini-…", "fallback": false, "providers": ["Wikipedia","Wikidata","OpenAlex","Gemini"], "ms": 3012, "note": null } }
```

**Provenance rules** — decided server-side, never taken from the model:
- a node is `verified` when it came from a provider record (it carries that record's URL); `ai_suggested` when Gemini proposed it (no sources).
- an edge is `verified` only when a **Wikidata statement** (selected properties, or inbound part-of / subclass-of / facet-of) connects the pair; `search_related` when the only evidence is Wikipedia `morelike:` similarity; otherwise `ai_suggested`. When the AI's wording differs from the evidenced relation it's kept as `description: "AI note: …"`.
- `npm run audit:provenance` re-checks verified edges with SPARQL `ASK` (last run: 100/100 confirmed, see `docs/provenance-audit.md`).

### Generation pipeline (sources first, AI second)
**Base** (no LLM): validate topic → reuse the user's graph for the same topic unless `fresh` → Wikipedia title + summary and Wikidata entity → Wikipedia `morelike:` neighbours → OpenAlex research topics where relevant → normalise & dedupe candidates → root + ≤ 8 primaries (verified relations ranked first, ≤ 5 from Wikidata for diversity) → second tier from Wikipedia neighbours of the first primaries (`search_related`) → structural validation → save (`saved: false`, `enrichment: pending`) → track `TOPIC_SEARCHED`.
**Enrich** (Gemini, optional): the model sees the base graph and spare candidates and returns **additions only** — retrieved candidates with a placement, ≤ 4 suggested concepts, cross-links, relationship notes, a description — validated with Zod. Nothing existing moves. On failure or when the daily cap is reached, `enrichment: failed|skipped` with a `generation.note`; the base graph stands.

## Resources `/resources` (cached server-side; 90 req/min/user)
| Path | Response |
|---|---|
| `GET /resources/topic?topic=&context=&wikidataId=` | `{ title, description, summary, image, facts[{label, values[]}], aliases, wikidataId, wikidataUrl, wikipediaUrl, sources }` — image: Wikidata P18 → Wikipedia lead image (Commons only) → Commons search |
| `GET /resources/images?topic=&context=` | `{ topic, query, images[{ id, title, description, thumbnail, imageUrl, creator, license, licenseUrl, sourceUrl, provider }] }` — Commons → Openverse → Unsplash (if key) |
| `GET /resources/videos?topic=&context=` | `{ videos[{ videoId, title, description, channel, publishedAt, thumbnail, url, embedUrl, provider }], note? }` — YouTube; cached 7 days per query |
| `GET /resources/research?topic=&context=` | `{ works[{ title, authors[], year, doi, abstract, openAccess, openAccessUrl, url, venue, citations, topics[], provider }] }` — OpenAlex + Crossref, deduped by DOI |

`context` (usually the graph's root topic) disambiguates short labels: "Origins" in a Roman Empire graph is searched as "Origins Roman Empire".

## Public `/public` (no account; never calls Gemini; per-IP rate limits)
| Method | Path | Notes |
|---|---|---|
| GET | `/public/showcase?topic=` | landing-page example → `{ topics[], graph }` (sources-only preview, cached; warm with `npm run precache`) |
| POST | `/public/try` | `{ topic }` → `{ graph, remaining }`. Daily per-IP quota (`QUOTA_TRY_PER_IP`, default 3) → 429 `{ code: "TRY_LIMIT" }` |
| GET | `/public/topic?topic=&context=&wikidataId=` | topic card (same shape as `/resources/topic`) |
| GET | `/public/graphs/:shareId` | read-only shared graph `{ title, description, category, nodes, edges, layout, sources, owner, updatedAt }` (owner = display name only) |

## Quotas
Per user per day: `generate` 40, `expand` 150, `ai` 80 (chat, explain, recommendations, learning-path generation). Global: `GEMINI_DAILY_CALL_CAP` 1500 Gemini calls/day. Exceeding a quota → `429 "Daily limit reached…"`. Counters live in the `UsageCounter` TTL collection and reset at UTC midnight.

## Learning paths `/learning-paths` (shelved in the UI)
| Method | Path | Notes |
|---|---|---|
| POST | `/learning-paths/generate` | `{ topic, level?: beginner\|intermediate\|advanced, graphId? }` — Gemini stages (grounded in the graph's concepts when `graphId` is given); offline fallback derives stages from the graph's primaries |
| GET | `/learning-paths` · `/learning-paths/:id` | each path includes `stages` (= `milestones`), `completedStages`, `progress`, `description`, `estimatedDuration` |
| PATCH | `/learning-paths/:id` | `{ title?, description?, estimatedDuration?, level?, order?: [indexes] }` |
| PATCH | `/learning-paths/:id/progress` | `{ index, status: pending\|in_progress\|completed }` |
| POST | `/learning-paths/:id/milestones` | `{ title, description?, resources?[] }` |
| PATCH · DELETE | `/learning-paths/:id/milestones/:index` | set status / remove |
| DELETE | `/learning-paths/:id` | |

## AI `/ai` (20 req/min/user)
| Method | Path | Notes |
|---|---|---|
| POST | `/ai/chat` | `{ message, conversationId?, graphId?, focus? }` → `{ conversationId, answer, sources[{type:'concept'\|'web', label, url?, origin}], provider, context }`. Context is built server-side from the user's graph (owner/public), selected node, recent topics and other graph titles; if the graph doesn't cover the question a Wikipedia reference is retrieved and labelled as such. History is persisted (last 40 messages) |
| GET · DELETE | `/ai/conversations` · `/ai/conversations/:id` | list / read / delete the user's own conversations |
| POST | `/ai/explain` | `{ topic, context?, wikidataId? }` → `{ summary, keyPoints[], analogy, nextConcepts[], sources, provider }` (cached 3 days) |
| POST | `/ai/recommendations` | → `{ recommendations[{ topic, reason, connectsTo[] }], provider }` from the user's history, graphs and unexplored branches |

`provider` is the Gemini model id that answered, or `offline` for the grounded fallback.

## Analytics `/analytics` (always scoped to the caller)
Filters on all: `?days=7|30|90|…` **or** `?from=YYYY-MM-DD&to=YYYY-MM-DD`, `?category=`, `?tz=<IANA>`.

| Path | Response |
|---|---|
| `/analytics/overview` | `{ totals: { topicsExplored, searches, graphsCreated, favorites, nodesDiscovered, nodeExpansions, aiQueries, learningPaths, pathCompletion, milestonesCompleted }, byType, recentTopics, meta }` |
| `/analytics/activity` | `{ timeline[{ day, searches, expansions, ai, graphs, resources }], hours[24], meta }` |
| `/analytics/topics` | `{ topTopics[{ name, value, last, category }], recentTopics }` |
| `/analytics/categories` | `{ categories[{ name, value }] }` |
| `/analytics/graphs` | `{ graphs[{ id, title, category, isFavorite, nodes, maxDepth, verifiedLinks, searchRelatedLinks, aiSuggestedLinks, expansions, views, lastActivity }] }` |
| `/analytics/me` · `/analytics/me/activity` | combined object used by the frontend · paginated own activity log |
| `/analytics/dashboard` · `/analytics/admin/{users,topics,activity}` | **ADMIN only** — platform-wide |

## Activity `/activity`
| Method | Path | Notes |
|---|---|---|
| POST | `/activity` | `{ action: NODE_SELECTED\|RESOURCE_OPENED\|TOPIC_VIEWED\|SESSION_HEARTBEAT, graphId?, nodeId?, topic?, category?, metadata? }` — server-only types are rejected (400) |
| GET | `/activity/history?type=&from=&to=&category=` | paginated |
| GET | `/activity/recent?limit=` | recent distinct topics |


## External providers & limits
| Provider | Key | Used for | Notes |
|---|---|---|---|
| Wikidata API + SPARQL | none | entities, statements, inbound links, facts, P18 image | bounded queries (`LIMIT`), cached 14 days |
| Wikipedia REST/Action API | none | titles, summaries, `morelike:` neighbours | cached 7 days |
| OpenAlex | optional `OPENALEX_API_KEY` | research topics, works | without a key requests share a small daily budget per IP |
| Crossref | none (`CROSSREF_MAILTO` optional) | DOI metadata, abstracts | |
| Wikimedia Commons | none | images + licence/attribution | only `https:` URLs on allow-listed hosts are returned |
| Openverse | optional token | image fallback | 7 s timeout; often slow — optional |
| Unsplash | optional `UNSPLASH_ACCESS_KEY` | photo enrichment | |
| YouTube Data API v3 | `YOUTUBE_API_KEY` | videos | `search.list` = 100 units; free quota ≈ 100 searches/day → results cached 7 days; on `quotaExceeded` YouTube is paused for 6 h |
| Gemini | `GEMINI_API_KEY` | plan, expansion picks, explain, chat, paths, recommendations | model chain + hedging; 503/timeout → model paused 10 min; quota → paused 30 min |

Failures never break a request: each provider call is wrapped, and the pipeline continues with whatever succeeded.

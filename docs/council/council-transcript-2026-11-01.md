# LLM Council Transcript — 2026-11-01

> Credential values found in `backend/scripts/seed.js` are **redacted** throughout this transcript.

## Original question
"review this website and think what can be better and what things are waste and focus on making the website even better in both backend and frontend"

## Framed question (sent to all five advisors)
Review Tiresias (an AI knowledge-graph explorer: Wikidata + Wikipedia + OpenAlex retrieval → Gemini organisation with verified/ai_suggested provenance → React Flow + d3-force graph; node inspector with Commons images, Wikidata facts, AI explanation, YouTube, papers). It has 13 frontend pages; dark and light neumorphism with skeuomorphic accents; 7 atmospheres × 2 themes; an Express/Mongo backend with caching, circuit breakers, Gemini model chain plus hedging, and 22 mocked tests; no frontend tests. Single developer, no users, not deployed. Known pain: overloaded Gemini flagship (≈3 s warm / ≈20 s cold), timer-based loading stages, in-memory Mongo in dev, auto-save of every topic, legacy backend folders and aliases, a hard-coded seed credential, analytics and history empty for new users. Give a prioritised view of what to cut, fix and improve.

## Advisor responses

### The Contrarian
The fatal flaw is that the core loop fails exactly when someone is watching: an overloaded Gemini, up to 20 s cold, and fake timer stages. Precompute and cache 20–30 showcase topics, put a cheap fast model first, and stream real partial results (Wikidata/Wikipedia nodes first, AI nodes after). If nothing renders in under 5 s, nothing else matters. A real-looking credential is committed in seed.js [REDACTED]: treat it as compromised, rotate it and purge it. In-memory Mongo means "persistence" that isn't real across six pages. Cut: Analytics custom date ranges, 7×2 themes down to 1×2, the metal knobs and glossy buttons, the legacy backend. Integrity risk: if AI-suggested nodes look the same as verified ones, the claim collapses. Quota trap: YouTube allows about 100 searches a day, so cache them or load on click. Auto-save pollutes the library. Zero frontend tests, so add one Playwright smoke test.

### The First Principles Thinker
"Make it better" is the wrong question; the right one is what Tiresias is for. With no users and no deployment, the real customer is an evaluator with about 5 minutes who needs one moment: topic, then a trustworthy graph, then click a node, then real knowledge with provenance. The core contradiction: the product claims "verified, not hallucinated" yet its critical path is an overloaded LLM, loading fakes progress and the landing page shows sample data. Cut Analytics, History, Home stats, Learning Paths, 5 of the 7 atmospheres, the legacy folders, aliases and mirror collections, the seed credentials, and auto-save-everything. Fix: invert the pipeline so the deterministic Wikidata-first graph renders immediately and Gemini becomes asynchronous enrichment; use real SSE events and persistent Mongo. Improve: make provenance the hero and add a small frontend test set for the core loop. "13 pages wrapped around a 1-page product."

### The Expansionist
The most valuable asset is buried: an AI knowledge tool that is honest about where facts come from. Make provenance the headline. Cut the legacy code, the mirror collections, the seed credentials, 5 of the 7 atmospheres and the fake stages. Fix persistence, use SSE progress to turn the cold start into a demo, and seed Analytics and History with an onboarding exploration. Upside: shareable and embeddable graphs; a graph-grounded assistant (it claimed the current one is generic, which is wrong); learning paths built from graph structure, with spaced repetition; cross-topic merging; exports (Obsidian, Anki, Mermaid, JSON-LD).

### The Outsider
"See how ideas connect" doesn't say what I get. Say: "Type any topic, get a map of everything related to it — with sources." Cut the signup wall: allow 1–3 anonymous topics and ask for signup on save. Cut the empty rooms and fold History into the library. Cut the decoration to one dark and one light theme. Fake stages destroy trust in the "verified" labels. Replace jargon with "Solid = backed by Wikipedia/Wikidata. Dotted = AI's guess." Silent auto-save should ask or announce. The inspector is the gem, so add a "click a node" hint.

### The Executor
Day 1: delete the seed credential [REDACTED] and rotate the password; move the legacy root folders out, run the tests and boot, and delete them if everything passes; grep for unused legacy aliases and collections and delete them; cut 7 atmospheres to 2 and turn ambient effects off by default. Day 2: persistent Mongo by default; explicit Save; real SSE events (about half a day); a non-flagship model first; cache YouTube. Week 2: one Playwright core-loop test; merge Home, Analytics and History into one dashboard; deploy (Render plus Atlas). Monday's first task: the credential.

## Peer reviews
Anonymisation mapping: **A = Executor, B = Outsider, C = Contrarian, D = Expansionist, E = First Principles.** Reviewers were also given a verified-current-state fact sheet.

**Reviewer 1.** Strongest: E. It names the evaluator audience and the structural fix; A is runner-up. Blind spot: D (a "generic chatbot" claim and a "styling detail" claim, both contradicted, plus five features for a solo developer); C is partly outdated. Missed by all: auditing whether "verified" edges are correct; rate limits once there is anonymous or public access; git-history purge; accessibility; contract tests against real APIs.

**Reviewer 2.** Strongest: E. A is runner-up but re-proposes existing YouTube caching. Blind spot: D (the same two errors and feature creep); C's YouTube and AI-styling warnings are already handled. Missed: a graph-quality benchmark; free-tier host sleep adding a second cold start; anonymous-access rate limits and protection for the Gemini key; graph accessibility.

**Reviewer 3.** Strongest: E. It fixes the cold start better than pinning a cheaper model, which hedging already covers, or precomputed topics. Blind spot: D. Missed: whether "verified" is actually true; abuse protection for anonymous use; keyboard and screen-reader access and reduced motion; Wikipedia CC BY-SA attribution; credential history.

**Reviewer 4.** Strongest: E. A is runner-up as the most actionable. Blind spot: D; C is partly outdated. Missed: server-side confirmation that each "verified" edge exists, plus a labelled test set; per-IP limits and a Gemini spending cap before deployment; performance and accessibility on mobile and low-end devices.

**Reviewer 5.** Strongest: E, with A as runner-up. Blind spot: D (two wrong claims and five new features with no users); C, A and B repeat problems that are already solved. Missed: a graph-quality benchmark; cost and abuse once deployed (keys, rate limits, Wikimedia User-Agent rules); purging the seed credential from git history.

## Fact-check passed to the chairman (from the codebase)
- YouTube is already click-to-load and cached 7 days. The assistant is already graph-grounded with citations and persisted conversations. Provenance is already visually distinct (dashed and dotted styling, a legend, badges, source URLs).
- Provenance is assigned server-side, so Gemini cannot mark anything verified. But a Wikipedia "morelike" search-similarity result counts as verified ("related to"), and expansion marks every new edge verified on that basis. "Verified" therefore means "a source links these," not "the stated relationship is true."
- Generation is not yet Wikidata-first: the graph returns only after Gemini's plan or the deterministic fallback.
- Already present: per-user per-minute rate limits, reduced motion, graph keyboard shortcuts, the mobile bottom sheet. Missing: daily quotas and spend caps, anonymous access, share links, screen-reader access to the graph, CC BY-SA attribution on summaries, frontend tests, SSE progress.
- The project folder is not a git repository locally.

## Chairman synthesis

### Where the Council Agrees
- **The core loop is the product.** It goes: topic, then a trustworthy graph, then click a node, then real knowledge with provenance. Everything else is wrapping; the 13 pages hide one page that works.
- **Latency undermines the main claim.** A flagship LLM on the critical path, about 20 s cold starts and fake timer stages contradict "verified, not hallucinated." Fake progress has to be replaced by real events.
- **Cut the decoration and dead weight.** Go from 7 atmospheres × 2 themes to 1 or 2 × 2, with ambient effects off by default. Delete the legacy backend folders and aliases. Drop or fold in the empty rooms (Analytics, History, Home stats, Learning Paths).
- **Persistence and saving are wrong.** In-memory Mongo makes six pages fake. Silent auto-save clutters the library, so saving should be explicit or at least announced.
- **The seed credential must go now.** Every advisor who raised it agreed.
- **Add at least one real frontend test on the core loop.** There are none today.

### Where the Council Clashes
- **Fix the cause or hide the latency.** The Contrarian and Executor would partly hide it (precomputed showcase topics, a cheaper model, SSE). First Principles would fix the structure: build the graph from Wikidata first and render it at once, then let Gemini add ai_suggested edges in the background. First Principles wins, and all five reviewers agreed. Caching and SSE help, but they don't fix the contradiction.
- **Shrink or expand.** The Expansionist wants sharing, embeds, exports, spaced repetition and cross-topic merging; everyone else wants to cut. Cutting wins: there is one developer and no users, and the Expansionist made two factual errors (it called the assistant generic and provenance just styling). Its one good point: once the app is deployed, a public share link is the cheapest way to get noticed.
- **The signup wall.** The Outsider wants anonymous trials. That is right for a demo, but only with per-IP limits and a spend cap; without them it is a liability.
- **The Assistant.** The Outsider would cut it. Keep it: it is already grounded in the user's graph and cites its sources.

### Blind Spots the Council Caught
- **"Verified" is weaker than it sounds.** A Wikipedia "morelike" search-similarity hit counts as verified, and expansion marks every new edge verified on that basis. So the badge means "a source links these," not "this relationship is true." Nobody checked whether verified edges are actually correct.
- **Deploying exposes cost and abuse.** There are per-minute limits but no daily quotas, no Gemini spend cap and nothing per-IP for anonymous use.
- **Free-tier hosting sleeps,** adding a second cold start on top of the Gemini one.
- **Wikipedia summary text isn't credited as CC BY-SA,** which is a licence-compliance gap.
- **Accessibility.** Screen readers can't use the graph canvas, and nobody has checked performance on low-end phones.
- **All 22 backend tests are mocked.** Nothing runs against the real Wikidata, Wikipedia or OpenAlex APIs.
- **Credential history.** If the credential was ever pushed anywhere, deleting the file isn't enough: rotate it and purge it from that history.

### The Recommendation
Make Tiresias a one-page product that keeps its promise, then put it online.
1. **Make the graph deterministic first.** Render the Wikidata and Wikipedia nodes immediately. Run Gemini in the background and stream its ai_suggested additions over real SSE events. Use a non-flagship model first and keep the existing fallback.
2. **Make "verified" honest.** Search-similarity results become a lower tier ("related, per search") or ai_suggested, and expansion must stop marking everything verified. Hand-check about 20 topics as a small benchmark of edge correctness.
3. **Cut.** Keep two themes, turn ambient effects off, and delete the legacy code once the tests pass. Merge Home, Analytics and History into one dashboard. Shelve Learning Paths. Make saving explicit.
4. **Fix the basics.** Use persistent Mongo by default. Make the legend plain-language ("Solid = backed by Wikipedia/Wikidata. Dotted = AI's guess."). Add CC BY-SA credit next to the summaries, and a "click a node" hint on first load.
5. **Ship.** Add daily quotas, a Gemini spend cap and per-IP limits, then allow anonymous trials of 1–3 topics. Precache the showcase topics. Add one Playwright core-loop test and one real-API contract test. Deploy with a keep-warm or paid tier so the host doesn't sleep. After that, add share links. No other new features until outside users exist.

### The One Thing to Do First
Delete the hard-coded seed credential, replace it with environment variables, and rotate that password wherever it is real. It takes ten minutes and it's the only item that does harm today. Then start the Wikidata-first inversion.

### Positions & axes (cut-scope, fix-reliability, add-features; 1–5)
- **Contrarian** (4, 5, 1): the core loop fails live; get the first render under 5 s with caching, a fast model and real streaming; cut themes, decoration and legacy code.
- **First Principles** (5, 5, 1): build for a 5-minute evaluator; invert to Wikidata first with asynchronous Gemini; make provenance the hero; cut the other 12 pages.
- **Expansionist** (2, 3, 5): provenance is the asset; fix persistence and progress, then add sharing, exports, spaced repetition and graph merging.
- **Outsider** (4, 2, 2): say plainly what users get; drop the signup wall, the empty pages and the jargon; stop fake loading and silent saves.
- **Executor** (4, 4, 1): an ordered plan: credential, legacy code, themes; then persistence, SSE and a fast model; then a Playwright test, a merged dashboard and deployment.

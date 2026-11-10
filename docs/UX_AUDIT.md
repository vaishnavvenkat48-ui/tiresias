# Tiresias — UX Audit (pre-redesign)

Audit of the frontend as it stood before the Dark Neumorphic redesign.
Each finding lists **what was wrong**, **why it matters**, and **what changed**.

## 1. Broken / inconsistent styling system

| Finding | Impact | Resolution |
|---|---|---|
| ~170 usages of classes that were never defined: `text-mode-*`, `bg-mode-*`, `neu-panel`, `neu-button-primary`, `shadow-neu-inner`, `shadow-glow`, `bg-grid`. Primary buttons ("Generate", "Sign in", "Get Started") rendered as **unstyled text**. | Primary actions were the least visible things on screen. | Rebuilt tokens in `styles/index.css` + `tailwind.config.js`; every class used in the app now exists. |
| `ModeContext` computed `vars` but **nothing applied them** — CSS `--mode-*` variables stayed Oracle forever. Only the canvas + inline graph styles changed. | "Adaptive Knowledge Mode" was half-working; chrome never re-themed. | Mode tokens are written to `<html>` and registered with `@property` so they cross-fade. |
| Manual mode override was persisted to localStorage but restored with `auto = true`. | After reload, UI claimed "Auto" while showing an overridden theme. | Override state is persisted and restored together. |
| Three competing visual metaphors: glassmorphism (`glass-panel`), half-done neumorphism, and leftover "editorial ledger" copy ("Plate I", "Folio", "Register", "N°02", "Glass OS"). `CONTEXT.md` documented a third palette (ink/parchment/brass) that no longer existed. | No coherent identity; labels that mean nothing to users. | One Dark Neumorphic language; plain-language labels. |
| Charts hard-coded the old oxblood/brass palette; Logo still oxblood. | Charts didn't match any theme. | Charts read theme tokens. |

## 2. Navigation & information architecture

| Finding | Resolution |
|---|---|
| Sidebar was numbered text (`01 Dashboard`…) with no icons; active-state code read `l.isActive` (always undefined). | Icon + label nav, grouped (Discover / Library / You), working active indicator. |
| Required sections missing: **History** didn't exist; **Saved Graphs / Analytics / Learning Paths** were one-line placeholders. | All implemented against real APIs. |
| No mobile navigation besides a drawer behind a hamburger. | Bottom tab bar on phones + drawer for the rest. |
| Landing "Explore Demo" linked to `/dashboard` (auth-gated) → bounced to login with no explanation. | CTA copy and targets fixed. |
| Navbar "Preview" anchor pointed at `#preview`, which didn't exist. | Section exists. |

## 3. Knowledge graph (core experience)

| Finding | Resolution |
|---|---|
| Static ring layout; nodes not draggable in a meaningful way, no physics. Looked like a mind-map. | `d3-force` simulation driving React Flow: repulsion, springs, collision, damping, auto-pause when settled. |
| A single click both **selected and collapsed/expanded** a node — users lost branches while just trying to read about them. | Click = select/inspect, double-click = expand, right-click = context menu. |
| "Expansion" only toggled 2 hard-coded leaves ("Applications", "History & Origins") for every node. | Real expansion: Wikipedia links for that concept, de-duplicated, with cross-links to existing nodes. |
| Graph was regenerated (randomly shuffled) every time the theme changed, because `mode.id` was a fetch dependency. | Graph data is independent of theme. |
| Nothing was persisted — every visit re-fetched and reshuffled. `POST /api/graphs` existed but was never called. | Save to library; positions, pins, hidden nodes, expansions and physics setting persist to MongoDB (`layout` field). Drafts persist locally. |
| Search only dimmed nodes, no way to jump to a match. | Search highlights and flies to matches (Enter cycles). |
| No loading/error/empty states beyond a spinner; Wikipedia failures silently produced mock data with no notice. | Skeleton, error banner with retry, "offline sample" badge when falling back. |
| Detail panel lived in a separate column far from the graph; graph capped at 560px tall. | Graph is the page; the inspector docks on the right (bottom sheet on mobile). |

## 4. Data honesty

| Finding | Resolution |
|---|---|
| Dashboard stats were hard-coded (`12, 4, 3, 27`), activity list and charts were dummy data, "updated 2h ago" was fiction. | Wired to `/users/stats`, `/analytics/me`, `/graphs`, `/paths`. Empty states when the user has no data yet. |
| Assistant sent `topic: 'General'` and knew nothing about the user's graphs. | Assistant can be grounded on a chosen saved graph + recent history (server builds the context). |
| Settings toggles ("Glassmorphism UI", "Reduce motion") did nothing; accent picker set an unused variable. | Settings control real things: atmosphere, motion, physics defaults, notification prefs (saved to profile). |

## 5. Accessibility

| Finding | Resolution |
|---|---|
| Small mono uppercase labels at 40% white (`fog`) — ~3:1 contrast. | Secondary text `#9299AD` (≥ 6:1 on base); tertiary only for non-essential meta. |
| Several icon-only buttons without labels; graph had no keyboard path. | Labels/tooltips on all icon buttons; graph shortcuts (`/` search, `F` fit, `Esc` close, `E` expand selected). |
| Reduced-motion only honoured by CSS; no user setting. | Setting + OS preference both respected (ambient canvas, Framer Motion, physics animation). |

## 6. Performance

| Finding | Resolution |
|---|---|
| One 1.1 MB JS bundle. | Route-level code splitting. |
| Graph styles were recomputed inline for every node on every render. | Memoised custom node/edge components; physics ticks only touch positions; the loop stops when the simulation cools. |

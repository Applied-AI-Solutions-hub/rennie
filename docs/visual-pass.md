# Rennie visual pass plan

Status: approved direction, awaiting implementation PRs.  
North star: [appliedai.solutions](https://appliedai.solutions/) — *Make room for your ideas.*  
Interaction reference: conversational assistant UX (chat-first, one clear question at a time, selectable choices) — not a feature wall or admin SaaS dashboard.

## Goal

Make Rennie feel like a high-quality **product**: calm, intentional, progressive. Features appear when they matter, usually through conversation or a single next step — not slammed onto Home as equal-weight cards.

Sparky and Applied AI Solutions stay. Architecture wallpaper, metric-tile grids, motto strips, and Command Center chrome go on a diet.

## Diagnosis

Three CSS eras stack today:

| Layer | Tendency |
| --- | --- |
| `style.css` | Command Center / dashboard DNA (hero wallpaper, summary cards, brandbar, dense chrome) |
| `polish.css` | Quieter conversation workspace (closer to the goal) |
| `finish.css` / `host-ui.css` | Shared finishing + Host screens |

That layering is why the app can feel SaaS-y even when Sparky chat is decent. Design QA already noted flat surfaces vs concept glow; the bigger issue is **product voice vs dashboard habit**, plus **feature density on first paint**.

## Interaction model (non-negotiable)

Borrow the operating feel of a modern chat assistant — not its branding:

1. **Chat / conversation is the center** — Home should not compete with Sparky as a second “control panel.”
2. **One question at a time** — Host setup, preferences, and empty states ask a clear question with a few concrete choices (buttons / chips), then advance.
3. **Progressive disclosure** — advanced metrics, lighting, integrations, and technical detail live behind “more” or later steps; they are not default wallpaper.
4. **No feature wall** — if a screen needs more than one primary action, it is unfinished.
5. **Honest states** — loading, offline, missing deps, empty; never decorative success before a real check passes.

Copy voice matches the website: open-source Windows workspace for tasks, files, and an existing agent. Early alpha, not a finished platform.

## Visual principles

1. One primary action per screen
2. Conversation and Host honesty beat marketing
3. Native desktop restraint — Segoe UI, Fluent icons, 4/8/12/16/24/32 spacing, short motion
4. Website tagline in-app over Command Center mottos
5. One token source — stop re-declaring `--bg`, radii, and accents in three files

## Token cleanup (P0 — do first)

Unify tokens (prefer extending `finish.css`):

- Surfaces: deep navy background, raised panel, subtle border
- Accent: one cyan for primary/focus (align site + current `#68cfff` / `#25baff` family)
- Type: 16px conversation, 14px controls, 12–13px secondary; drop 7–9px letterspaced mottos
- Radii: controls ~10, panels ~14–16, composer/dialogs ~20
- Shadow: rare, soft, elevation only

Document: do not reintroduce dashboard wallpaper behind readable text.

## Pass order

### P0 — Foundation
Collapse conflicting tokens; fix CSS load order so polish/finish win; add this doc’s anti-patterns as a short comment or checklist in design-standards if needed.

### P1 — Home (highest SaaS smell)
Replace card grids / architecture hero with a quiet landing:

- Short product line (*Make room for your ideas*)
- Today’s tasks/notes (real local work)
- **One** clear path into Sparky or Host — preferably as a conversational prompt with choices, not four summary tiles

Metrics and system chrome become secondary or hidden.

### P2 — Sparky conversation
Keep the `polish.css` direction. Tighten welcome copy to site voice. Suggestion chips should feel like helpful next questions, not a marketing feature matrix. Composer stays the hero (input + clear send; disabled when empty).

Where the product needs a decision (Host vs Client, retry connection, pick an agent), prefer **in-thread question cards** with a few options over dumping a settings panel.

### P3 — Host / setup
`host-ui.css` is already stronger. Soften decorative orbit glow if it reads gimmicky. Keep the stage list honest. Match foundation tokens. Each Host step should ask one thing and show one primary button.

### P4 — Settings / startup / dialogs
Drop architecture banner on preferences. Startup card = product calm, not splash marketing. Connection dialog stays truthful with retry.

### P5 — Chrome
Sidebar: fewer micro-labels, clearer nav. Header: less subtitle clutter. Footer: quiet version/maker credit, not a second dashboard.

### P6 — Motion and QA
Keep Motion / Web Awesome busy states; no endless glow. Capture 1440 / 1000 / 760 and reduced motion. Side-by-side vs website and current Sparky preview.

## Anti-patterns (ban)

- Architecture art under readable text
- All-caps letterspaced mottos
- Equal-weight card walls / feature slamming
- Fake progress or premature “you’re all set”
- Cyan glow as decoration
- Conflicting radii and accent re-declarations
- Inventing remote-pairing or provider-wizard UI that is not real yet

## Acceptance

- Someone arriving from appliedai.solutions feels continuity
- Home does not read as an admin console or feature dump
- Sparky and Host feel like the same product
- Decisions often arrive as a short question with choices
- Tokens are consistent; reduced motion respected; no horizontal overflow at compact sizes
- README and site claims still match the UI

## Ship as small PRs

1. Tokens + load order
2. Home
3. Sparky (including conversational choice patterns where setup intersects chat)
4. Host + settings/startup
5. Sidebar / header / footer

Each PR: before/after screenshots at 1440 and 1000.

## Out of scope for this pass

3D mascot, Rive, new product features, Tailscale app pairing, provider wizard implementation — visual and interaction honesty only.

## Related docs

- [design-standards.md](design-standards.md)
- [design-research.md](design-research.md)
- [design-qa.md](../design-qa.md) (repo root)
- [managed-host.md](managed-host.md)

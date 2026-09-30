# Quiet workspace design QA

final result: passed

## Target and evidence

The supplied Cursor/ChatGPT-style screenshot is a direction for Foxsocket's existing desktop app, not a request to reproduce another product's features or conversation content.

- Source visual: `.qa/quiet-reference.png` (user attachment, 1022 x 1065 pixels including 30 px desktop chrome).
- Electron captures: `.qa/quiet-conversation.png`, `.qa/quiet-empty.png`, `.qa/quiet-setup.png`, `.qa/quiet-settings.png`, `.qa/quiet-details.png`.
- Primary comparison: 1022 x 1035 CSS/pixel viewport, density 1. Source's desktop menu/chrome is excluded from layout judgments; Foxsocket retains native window chrome.
- Additional captures: `.qa/quiet-1440.png`, `.qa/quiet-760.png` at 1440 x 900 and 760 x 600.
- Reference and implementation were opened together for full-view and readable sidebar, response, and composer comparison. Different product content and conversation length are intentional. No synthesized brand assets were required.

## Findings and iteration

Initial rendered pass found two P2 issues: the model screen placed app updates above the primary model controls, and setup/model buttons crowded preceding explanatory text. Moved the update section below settings and added 12 px CTA spacing. The palette conversion also muted the connected indicator; restored a restrained semantic green. Recaptured conversation and settings and compared again. No remaining P0/P1/P2 findings.

## Required surfaces

- Typography: Segoe UI, 13 px sidebar labels, 14 px chrome, 15 px messages; modest heading hierarchy. Reference's compact desktop density is retained without copying its text.
- Spacing: 240–252 px sidebar, 52–56 px header, centered conversation capped at 780 px, persistent composer. Details are hidden by default and available through a labeled toggle. No viewport overflow in six routes at three sizes.
- Colors: opaque neutral charcoal surfaces, subtle gray borders, restrained blue links and semantic status colors. No decorative gradients, shadows, glass blur, sliding content, scale feedback, or logo entrance animation in the active workspace.
- Images: existing Foxsocket vector brand mark and Fluent icons remain sharp at compact sizes. Mascot is confined to the small assistant entry; large decorative mascot/orbit treatments are removed.
- Copy: Foxsocket setup, model selection, error/retry controls and device labels remain product-specific. Empty conversation copy directs users to local setup.

## Validation

Passed: workspace smoke (navigation, drafts, chat formatting/error recovery, tasks, preferences), local setup smoke (progress, errors, retry, verified reply, persistence), update smoke, Host smoke, and design smoke (six routes at three sizes, details toggle, no content animation, visible composer, no console errors). Fixture-based checks do not assert actual local inference or Lenovo installation.

## Follow-up polish

No blocking follow-ups. Native OS window chrome intentionally differs from the reference; the app does not implement its IDE/repository-specific features.

# Foxsocket feature review

Purpose: make a local assistant easy to set up, give it a clear identity, and help it perform useful work through compatible skills and tools. Free services are the default.

Reviewed the running Electron app in an isolated profile at 1268 by 666 pixels. No live user profile or physical lighting device was changed. Existing notes, tasks, conversation history, and old settings are retained.

| Feature | Real benefit today | Decision |
| --- | --- | --- |
| Chat and conversation history | Ask questions, draft, plan, and continue conversations | Keep central; fix the reported multi-turn failure |
| Local setup and model selection | Install a local backend/model without API keys | Keep central; fix progress visibility and cancellation |
| Agent name and role | Would make identity and purpose consistent | Next milestone; naming is not implemented by this cleanup |
| OpenClaw skill discovery | Would reuse existing capabilities instead of inventing another ecosystem | Next milestone; distinguish instructions from available execution tools |
| This PC diagnostics | Helps explain local model performance/setup | Keep as support information, not the product's main purpose |
| Folder shortcuts and notes | Open selected folders and save manual notes | Keep existing data; clarify that selecting a folder does not grant the model file access |
| Tasks | A manual checklist beside conversations | Keep existing data; lower priority until linked to actual agent work |
| Backup, help, restart behavior | Recovery and reliable daily use | Keep |
| Hosted model providers | Optional model choice for users with existing accounts | Keep optional; do not imply free use or a required subscription |
| RGB lighting and workspace color modes | Unrelated hardware controls | Removed from UI, main-process actions, preload API, and dependencies |
| Phone/tablet pairing placeholders | No working pairing in this build | Removed from This PC and details; keep future plans outside active UI |

## Screen observations

1. Chat: the main action and composer are clear. Mixed My assistant/Sparky labels weaken identity; naming should resolve that. Folder access is currently a shortcut, not model context.
2. This PC: setup and hardware information are useful, but lighting and speculative device cards added unrelated content below them. Removed those sections and the tray's lighting modes.
3. Folders: working shortcuts and local notes, but no file-reading capability for the local model. Do not market this as an agent-connected project workspace yet.
4. Tasks: working manual checklist. It does not currently schedule or execute agent work.
5. Models: useful local setup entry, but hosted key forms and general app settings compete with it. A later pass should group optional providers separately and give app settings their own clear home.

## Limits and priorities

Screenshots establish layout and visible content, not accessibility compliance or model quality. Some secondary text appears small at this viewport; keyboard focus and screen-reader behavior need a dedicated pass. The existing UI smoke checks cover navigation, task persistence, chat error recovery, and several window sizes.

Next work from PR #33 remains: multi-turn reliability, progress/cancel/retry, per-agent naming, and a searchable OpenClaw-compatible skills experience. This cleanup does not claim those features are complete.

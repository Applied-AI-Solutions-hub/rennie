# Applied AI Command Center — first-release design

Status: historical design proposal, September 9, 2026. This is not a current implementation or authorization record. See the [documentation index](README.md) for current guidance.

## Purpose
An installed Windows application that joins daily priorities, PC status, device lighting and background work. It must operate independently of Codex and provide a reusable foundation for Applied AI Solutions.

## Evidence and unresolved capability checks
Hardware, lighting controllers, installed services and gateway availability must be assessed on each test device. No individual developer machine inventory is a product requirement.

SignalRGB documents a local API, with most endpoints requiring Pro. Installed-version support, entitlement and device capabilities must be verified before choosing this adapter. Do not promise mouse lighting, battery telemetry or remapping based solely on HID detection.
Source: https://docs.signalrgb.com/developer/signalrgb-api/introduction/
WSL supports systemd service management, but startup, sleep recovery and gateway availability require separate validation.
Source: https://learn.microsoft.com/en-us/windows/wsl/systemd

## Visual specification
Use the supplied dashboard image for layout and the architectural brand image for atmosphere. Reuse supplied SVG assets, preserve canonical A geometry, use v0.2 palette as proposed baseline and retain v0.1 app icon exports after visual inspection. Palette: background #0A0F1A, surfaces #0F172A, primary #0084FF, cyan #00E5F6, secondary text #94A3B8, green #00D98B, amber #FFB020. Confirm contrast before finalizing. Avoid artwork behind dense text. Reserve glows for selection and small accents. Every icon gets a label or accessible name; statuses use text as well as color. Support keyboard navigation, reduced motion, display scaling and a compact window layout.

## Home screen
Left navigation: Home, Devices & Lighting, Tasks, Files, System, Integrations, Settings. Agents & Sessions appears when configured.
Top: compact logo, command/search field, notifications, user menu. Search initially covers local tasks and app commands; natural-language execution is a later capability.
Main: Today with three priorities, quick note and focus timer; active mode with editable actions; PC snapshot; recent meaningful activity.
Right: service health with last check time, selected devices and pending actions.
Bottom or tray: persistent mode selector and gateway state. Small branded welcome artwork may collapse after onboarding. No fabricated agent counts or percentage progress.

## Core behavior
Tasks: create, edit, complete, reorder and persist locally; optional due dates and timer. Restore state after restart.
PC status: CPU/GPU load, memory, storage and uptime when a verified data provider exists. Temperatures are optional capabilities. Timestamp readings and show stale/unavailable explicitly. Event history distinguishes planned restart from unexplained interruption.
Devices: identify model, connection, controller, supported actions and last result. Show unsupported controls disabled with explanation. Assign one lighting owner per device; never silently change ownership.
Modes: Focus, Gaming, Relax, Away are editable presets. Each lists desired lighting, timer and dashboard actions. Preview and apply deliberately; record results per action. Partial failure is visible. Manual device override remains until the next explicit mode change, unless user chooses another policy. Undo restores known prior reversible settings; task completion and external actions are not implicitly reversed.
Files: only user-selected folders; open, browse and show outputs. Gateway transfers show destination, progress and failure. No broad automatic indexing.
Agents: separate optional integration; show real job state and evidence. External communications and consequential actions use explicit scope/approval. No credentials embedded in task records or exports.

## Desktop and gateway architecture
Desktop interface owns interaction and presentation. A Windows companion owns permitted telemetry and device adapters. A separate optional gateway owns queued jobs, schedules and integrations; it may run in the existing Ubuntu environment after validation. Personal tasks, settings and PC status remain usable if gateway is unavailable.
Use typed, versioned messages between components and a capability registry rather than hardware-specific conditions scattered through screens. Keep personal configuration separate from reusable application code. Store local tasks, modes and activity in a versioned database with migration and backup strategy; use OS credential storage for secrets.
Default communications are local and authenticated. Remote access is opt-in; installed Tailscale is not evidence that access is configured. Gateway must not expose arbitrary shell execution as an unrestricted dashboard command.
Desktop framework and gateway language remain open until a small implementation feasibility evaluation is authorized. Linux is optional, not a prerequisite for everyday controls.

## Lifecycle
Close window: minimize to tray when enabled, with first-use explanation. Tray: Open, modes, pause automations, status, Quit. Distinguish quitting the UI from stopping background work. Startup with Windows is opt-in and documented as sign-in startup for initial scope. Before-sign-in hosting is a separate requirement. PC sleep or power-off means local gateway is unavailable; do not promise 24/7 availability.
After restart: restore tasks and UI state, reconnect with bounded retry, mark interrupted jobs, and avoid replaying non-idempotent actions. Resume missed schedules using an explicit per-rule skip/run-once policy. Never reset mouse or lighting settings merely because UI reopens.

## Implementation sequence, after authorization
1. Asset audit, screen specification and interactive design prototype with clearly labeled sample data.
2. Installed desktop shell, local task persistence, tray controls and verified basic telemetry.
3. One verified lighting adapter and one actual device; confirm entitlement and absence of controller conflict.
4. Modes across supported devices, partial failure handling and override behavior.
5. Optional gateway connection in validated Ubuntu environment, files and one bounded job integration.
6. Installer/update work, recovery tests, backup/export and product documentation.
Each increment must remain usable independently. Broader device adapters and multi-PC support follow measured demand.

## Acceptance criteria for eventual implementation
- Brand assets remain crisp at supported scaling and controls work by keyboard.
- Tasks survive application and Windows restart.
- Metrics match trusted providers within documented tolerance; disconnected feeds never appear current.
- Lighting commands affect only chosen supported devices and report actual outcomes.
- Unsupported mouse features remain unavailable without misleading controls.
- Modes report partial failures and respect manual override.
- Tray, sign-in startup, quit and sleep recovery follow documented behavior.
- Gateway outage does not block local tasks or PC status; interrupted actions do not execute twice.
- Installer supports clean upgrade and uninstall with explicit data retention choice.
- Idle CPU/memory budget is measured and agreed before release; no continuously busy polling.

## Product path
Keep adapters, branding tokens and personal settings separate. Maintain versioned source, documented device support and licenses for dependencies/assets. Before public distribution, add signed packaging, update verification, broader hardware testing, onboarding, diagnostic export with redaction and support documentation. Preserve local operation and make cloud/AI accounts optional integrations.

## Decisions needed
Current lighting application and controlled zones; mouse retail model; desired first three daily actions; gateway purpose (agents, remote access, automation or files); whether availability beyond Windows sign-in is required. These do not block screen planning, but they block a verified device integration commitment.

## Historical scope

Personal device inventories, screenshots and local incident notes are omitted. Assess optional hardware on each test device; integration failures must not block core conversation and workspace behavior. This proposal does not establish implemented or released functionality.

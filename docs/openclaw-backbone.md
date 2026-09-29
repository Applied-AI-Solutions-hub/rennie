# OpenClaw backbone and installer fixes (0.6.0-alpha.7)

**Date:** 2026-09-26 · **Branch:** `feature/openclaw-backbone`, based on `design/quiet-workspace` at `de5f277` (alpha.6) · **Made by:** Claude (Claude Code), at the owner's request. This page is the record of what changed, why, what was verified, and what still needs a real Windows test.

## Decision

Owner direction on 2026-09-26: **OpenClaw is the backbone.** Foxsocket installs it and helps someone with no technical background set up and develop their assistant. Foxsocket does not maintain its own separate agent (chat, memory, skills).

Alpha.6 had made native Ollama chat the main path, with OpenClaw optional through Ubuntu/WSL. That is replaced. OpenClaw runs natively on Windows ([docs](https://docs.openclaw.ai/platforms/windows)), so a beginner no longer needs WSL, virtualization settings, administrator rights for Linux, or a restart. The Ubuntu/WSL path is kept as an advanced option.

## How setup works now

One button runs six steps. The app shows each step, marks the one that stopped if something fails, and keeps progress across restarts.

| Step | What happens | Code |
| --- | --- | --- |
| Check this PC | Free disk space and memory are checked **before anything downloads**. The model is recommended from memory (under 8 GB → the small model). | `preflight.cjs` |
| Install Ollama | Official installer, resumable download, signature pinned to the exact publisher `Ollama Inc.`, installer deleted after use. | `local-runtime.cjs`, `download.cjs` |
| Download the model | Ollama pull with a no-progress watchdog and automatic retries; no total time limit. | `local-model.cjs` |
| Check the model answers | Two basic checks at temperature 0 with a fixed seed, so results are repeatable. | `local-model.cjs`, `local-chat.cjs` |
| Install and set up OpenClaw | OpenClaw's official `install.ps1`, downloaded from the exact 2026.9.3 release commit and run only if its SHA-256 matches the reviewed copy, with `-Tag 2026.9.3 -NoOnboard`. Then non-interactive onboarding: `--auth-choice ollama`, local Ollama URL, chosen model, loopback gateway installed as a Scheduled Task, channels/skills/search skipped. An existing OpenClaw configuration is **never** re-onboarded. The optional assistant name is saved with `openclaw agents set-identity`. | `openclaw-native.cjs` |
| First reply through OpenClaw | `openclaw agent --session-key agent:<id>:foxsocket-setup-check --message-file … --json`. A real reply means ready. An odd answer is reported but does not block, because the install itself works. The model OpenClaw actually answered with is shown; if an existing OpenClaw setup was kept and uses a different model, the page says so. | `openclaw-native.cjs`, `local-model.cjs` |

*Models → Test connection* sends a real message through OpenClaw when chat goes there. When the direct local route is selected it checks only Ollama and never switches chat to OpenClaw. Reopening Foxsocket only checks that the gateway is running, so it never adds messages to the assistant.

After setup, chat goes to OpenClaw (provider id `openclaw` in `foxsocket-providers.cjs`). OpenClaw keeps the conversation, memory and skills; Foxsocket sends only the new message. Hosted providers (ChatGPT, Claude, Grok) and direct local chat stay available in Models.

**Troubleshooting uses OpenClaw's own tools.** *Run OpenClaw doctor* shows `openclaw doctor --json` findings in plain language. *Let OpenClaw fix what it can* runs `openclaw doctor --fix --non-interactive`, only when the user clicks it. If the OpenClaw installer fails, its output is kept under *Technical details* and common causes (Node.js not installable, security policy, no internet, disk full) are explained.

### Safety properties

- OpenClaw's installer script is not code-signed and the `openclaw.ai` copy changes with every release (it had already changed by 2026-09-27). Foxsocket downloads it from the release commit (`1391f7c`, which OpenClaw 2026.9.3 reports as its own build) and deletes it without running if its SHA-256 differs from the reviewed copy. Updating OpenClaw means reviewing the new script and updating the version, commit and hash together in `openclaw-native.cjs`. Raised in Codex review on PR #34.
- Chat reads every reply shape OpenClaw 2026.9.3 actually produces. Its documented `agent --json` shape (`ok`/`final`) is not what it returns: via the gateway it is `{status, result: {payloads: [{text}], meta: {agentMeta}}}`, and with `--local` just `{payloads, meta}`. Found on 2026-09-28 by running native OpenClaw against a local model; before the fix every real reply would have been rejected.
- A configuration Foxsocket creates gets OpenClaw's lean mode (`agents.defaults.experimental.localModelLean`). Measured 2026-09-28: the prompt fell from 24,004 to 10,172 tokens. That is the difference between a CPU-only first reply in a few minutes and a 10-minute timeout. An existing configuration is never changed.
- Downloads ask for uncompressed bytes. GitHub gzips text files, which made the reported size disagree with the received bytes; found by downloading the real pinned installer, and fixed before it reached a tester.
- OpenClaw is started as `node.exe <OpenClaw entry script>`, never through `cmd.exe`, so no argument is ever interpreted by a shell. Chat text is written to a temporary file (`--message-file`) and deleted afterwards; it never appears on a command line. Covered by `openclaw-native.test.cjs`.
- After OpenClaw's installer changes the user PATH, Foxsocket reads the new PATH from the registry, so the fresh install is found without restarting the app.
- The gateway binds to loopback only. No API keys or tokens are passed to onboarding.
- Checking the gateway starts a node process, and the app refreshes its status every 30 seconds, so a gateway answer is reused for up to 2 minutes. Setup, repair and any failed chat force a fresh check. OpenClaw's install location is looked up once and cached.
- Assistant names are limited to 40 letters, numbers, spaces, periods, apostrophes and dashes.

## Findings from the 2026-09-26 installer review, and what changed

| # | Finding | Status |
| --- | --- | --- |
| 1 | The unsigned installer is blocked outright by Smart App Control (Lenovo, PR #33). | **Open — needs the owner.** Code cannot fix this. The free SignPath Foundation application ([windows-signing.md](windows-signing.md)) has not been submitted. |
| 2 | On slower internet the downloads could never finish: a hard 30-minute limit on the 1.57 GB Ollama installer, restarts from zero on retry, a 60-minute limit on the model, and no stall detection (the silent 96% hang). | **Fixed.** `download.cjs` resumes with HTTP Range, aborts only after 60 s without data, and retries automatically. The model pull aborts only after 180 s without progress and retries; Ollama keeps finished layers. Neither has a total time limit. |
| 3 | The installer asked "Host or Client" (Client leads nowhere) and showed 14 technical readiness lines. | **Fixed.** One-click, per-user installer with no pages and no administrator prompt; the Host role is written automatically; the app opens when done. `build/readiness.ps1` was removed. |
| 4 | Nothing checked free space or memory before about 3.8 GB of downloads. | **Fixed.** `preflight.cjs`; the setup page shows memory, free space and the real total download. |
| 5 | Answer checks ran with randomness, so a working install could be marked failed at random; the error pointed to a non-existent "balanced" model. | **Fixed.** Temperature 0 and seed 42. The message now says the install worked and names the Recommended model. Through OpenClaw, a working reply counts as ready and an odd answer is reported separately. |
| 6 | Two things start Ollama (its own startup entry and Foxsocket), and its installer opens a welcome window. | **Open.** Ollama's standalone zip (documented for embedding) would give Foxsocket sole ownership, but needs GPU-package selection (AMD needs an extra download) and self-managed updates. |
| 7a | The Ollama signature check accepted any valid certificate whose name contained "Ollama". | **Fixed.** Pinned to CN and O = `Ollama Inc.`. Verified against the real signed `ollama.exe` on the development PC. |
| 7b | The Ubuntu helper reported every failure as "check internet / virtualization". | **Fixed.** `Get-WslProblem` maps WSL error codes (virtualization off, feature pending restart, kernel update, disk full, network, clock) to specific instructions. |
| 7c | The Ubuntu helper raised the administrator prompt the moment its window opened. | **Fixed.** It waits for a click on first open and continues automatically only after a restart. |

## Verification done on 2026-09-26

On the development PC (Windows 11). **Nothing was installed on it**; the owner's working OpenClaw (in WSL) and Ollama were only read.

- **Unit tests:** 76 Node tests pass in 3 consecutive runs (`download`, `preflight`, `openclaw-native`, `local-model`, `local-runtime`, `local-chat`, `setup`, `host-manager`, `updates`, `windows-signing`). PowerShell helper tests pass (`host-setup`, `host-progress`, `host-setup-ui`).
- **Real app (Electron) smoke tests,** isolated profiles, with Ollama and OpenClaw replaced by stand-ins: `local-smoke` (the whole flow including naming, OpenClaw doctor, chat routed to OpenClaw, 1440 and 760 px widths), `setup-progress-smoke`, `local-lifecycle-smoke`, `workspace-smoke`, `design-smoke`, `local-chat-smoke`, and the isolated development launch (`--dev-smoke`). `local-smoke` is now also a CI step.
- **Startup is not slowed down:** the PC summary (which contacts Ollama and reads the registry and disk) is a separate request (`local-pc`) that loads after the window is already showing. An earlier draft blocked first paint on it; the development-launch check caught that before commit.
- **Real system, read-only:** the pinned signature check accepts the real signed `ollama.exe` and rejects look-alike publisher names and an unsigned file; registry PATH discovery finds the real user PATH, npm folder and `node.exe`. The OpenClaw flags come from `--help` of OpenClaw 2026.9.3 (the pinned version), and the `openclaw doctor --json` shape and exit code were confirmed on a live install on 2026-09-21.
- **Installer build:** `pnpm dist:dev` compiled the unsigned development installer with `oneClick=true perMachine=false` (about 104 MB); `download.cjs`, `preflight.cjs`, `openclaw-native.cjs` and the new `local-ui.js` are inside the packaged app. The packaged app was not launched, because it would use the development PC's real Foxsocket profile.

## Not verified yet — must be tested on the Lenovo or a clean PC

1. Native OpenClaw install through `install.ps1`: Node.js through winget (expect a Windows permission prompt) or its portable fallback, Git, and how long it takes.
2. Whether Smart App Control or other policy blocks `install.ps1` or runs it in PowerShell Constrained Language Mode.
3. Non-interactive onboarding with `--auth-choice ollama` against a real Ollama and `llama3.2:3b`. The flags come from CLI help and docs; this exact combination has not run.
4. The `openclaw agent --json` output shape (`ok`, `status`, `final`, `model`, `provider`), taken from docs and not yet observed live.
5. Gateway Scheduled Task start after a Windows restart, then a reply.
6. Answer quality of `llama3.2:3b` under OpenClaw's own, larger agent prompt. Small models may struggle; setup reports odd answers but does not block.
7. The one-click installer: fresh install, upgrade over an alpha.6 install, and uninstall.

## Next steps

- **Owner:** submit the SignPath Foundation application. Without signing, no beginner on a protected Windows 11 PC can run the installer.
- **Lenovo:** run the test plan in [LENOVO-START-HERE.md](../LENOVO-START-HERE.md) and report on the active pull request.
- **Development:** decide on Ollama's standalone zip (finding 6); build the skills library on OpenClaw skills (PR #33 milestone) instead of a separate catalog.

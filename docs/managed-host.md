# Managed Host build

## Alpha.4 architecture

Native Windows local chat is the primary Host setup. `local-main.cjs` connects the Electron UI to a persisted `local-model.cjs` state machine and the Windows Ollama installer/startup adapter in `local-runtime.cjs`. Setup installs only after the user's Set up local model action, streams download progress, and verifies the exact model with a finished visible reply. A completed setup is reverified once after reopening; periodic status checks do not generate repeated replies. Missing runtime/model state never triggers an implicit download. Saved errors and interrupted stages remain available through Resume setup.

The installer now opens model setup instead of automatically installing Ubuntu. The older OpenClaw service manager below remains an optional integration; it cannot block direct-provider/local chat. Hosted account access is displayed separately from readiness and a real chat reply is required for readiness in the current app session.

Tests: `node --test local-model.test.cjs local-runtime.test.cjs`, `pnpm exec electron local-smoke.cjs`, plus the existing Host/workspace/update tests. Runtime install, downloads and inference are mocked in automation. Real Ollama installation, model inference and Windows reboot recovery must be verified on the Lenovo.

## Optional OpenClaw manager

The Host page replaces the terminal-command walkthrough with a live control screen. The public starter is a clean Sparky persona, with an editable name and a user-selected model. It must never be populated by exporting the owner's working Sparky agent.

## Implemented

- The optional Ubuntu/OpenClaw page opens the bundled Windows/Ubuntu setup window. It enables WSL with a Windows permission prompt, saves progress through a restart, and installs Ubuntu 24.04 for the original Windows user. A new environment gets a regular `foxsocket` Linux account and systemd automatically; existing environments are preserved.
- Host navigation, responsive control screen, real prerequisite/service/startup checks, progress and recoverable errors.
- Hidden execution through WSL `--exec`. OpenClaw arguments stay positional, including chat messages containing shell metacharacters.
- Reuse an existing configured agent. If the CLI is missing, a supported Linux environment can install pinned OpenClaw 2026.9.3 with the official user-prefix installer.
- Register or enable the Linux user service without killing an unidentified foreground gateway or overwriting an existing agent configuration.
- Enable lingering and a per-user hidden Windows logon task to keep WSL available. The task is self-contained and does not depend on the app window or a helper file in the install directory.
- Check that the unit is active/enabled, has a restart policy, can run without a terminal, and has a responding gateway. Provider inference and remote pairing are separate checks.
- Existing agent selection and connection remain available. Tailscale status is shown separately from app pairing.
- Drafts in this version survive app restarts using local storage.

IPC: `host-status` reads the current operation; `host-check(distro)` starts inspection; `host-prepare(distro)` starts preparation; `host-progress` reports safe structured state. Credentials and raw CLI output are not sent to the renderer. The manager serializes operations.

## Public starter decision

`starter-agent.json` is a bundled, app-owned starter manifest, not an OpenClaw configuration and not yet an automatically provisioned agent. Its agent ID is independent of its display name. The user's selected provider/model must be configured before the first conversation test. The starter contains no credentials, personal memory, Discord identity, private network identity, or data copied from the owner's agent.

The public setup must guide this complete path:

1. Inspect the PC and choose Host or Client.
2. Prepare Linux and the runtime, with explicit Windows permission/restart handling.
3. Name the starter agent and choose cloud or local execution.
4. For cloud execution, select a supported model and connect the user's own provider account. For local execution, assess memory/GPU/storage and show the model download before starting it. Model licenses and required runtime support must be checked before bundling.
5. Review permissions, provision the starter, and verify an actual model reply.
6. Prepare and verify the background service.
7. Sign in to Tailscale and pair authorized devices. A connected tailnet alone does not prove app pairing.

## Not complete

The embedded OpenClaw provider account wizard, starter provisioning, model downloads, remote app pairing, and mobile clients are not implemented by this patch. Existing provider configuration is reused. Missing configuration is an explicit incomplete state, never a green setup result. New provider access may require browser sign-in, a key, a subscription, or usage charges.

Startup is configured after Windows sign-in, not before login. The PC must be awake for remote access. Actual Windows reboot and fresh-PC provisioning still need testing. Do not publish this patch as a finished beginner onboarding flow.

## Validation

Run `node --test host-manager.test.cjs setup.test.cjs updates.test.cjs`, `pnpm test:ui`, `pnpm exec electron host-smoke.cjs`, and `pnpm exec electron updates-smoke.cjs`. Host UI checks cover progress, retry, existing agent selection, honest Tailscale status, and 1440/1000/760 pixel widths.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File build/host-setup.test.ps1` for isolated prerequisite orchestration tests. These mock Windows servicing and WSL; they do not replace a fresh Windows VM test covering real UAC, download, reboot/sign-in recovery, default Linux user and systemd. The installer must also be built with `pnpm dist` to validate the NSIS hooks and bundled helper files.

Background Windows startup recovery and actual reboot behavior have not passed end-to-end validation. A stopped task was observed during development; this remains a release limitation.

The Electron lifecycle checks (`pnpm exec electron host-lifecycle-smoke.cjs` and the same command with `--preparing`) verify that normal close exits the app and that an active preparation job finishes before exit. These isolated checks do not prove actual Windows startup recovery.

# Rennie

Formerly Foxsocket. Rennie is the product and the default name for new agents; existing names such as Sparky are preserved.

**Your agent. Your devices. Connected.**

Open-source personal AI desktop workspace by [Applied AI Solutions](https://appliedai.solutions), with its fox mascot.

This is an **early Windows alpha** for testers. It is not a finished agent hosting platform yet.

> **Lenovo testing blocked: the alpha.6 installer is unsigned and Windows Application Control rejected it.** Do not retry that artifact. [PR #33](https://github.com/Applied-AI-Solutions-hub/foxsocket/pull/33) tracks the fixes and [shared test instructions](LENOVO-START-HERE.md). New distributable builds require verified publisher signatures; [one-time signing setup](docs/windows-signing.md) is still pending. The public alpha.2 release below is historical and does not fix this policy block.

## Quick start (Windows testers)

**Developing Rennie now:** the Lenovo is an owner-selected development PC. Use the current PR's **Foxsocket-Windows-UNSIGNED-DEVELOPMENT** artifact, or run `pnpm dev:fresh` from source. [Development setup and Windows policy instructions](docs/development.md). Free public signing is a separate task and does not prevent development.

**The published installer below predates the rename and still uses Foxsocket branding. A Rennie installer has not been released yet.**

1. Download the installer: [**Foxsocket.Setup.0.6.0-alpha.2.exe**](https://github.com/Applied-AI-Solutions-hub/foxsocket/releases/download/v0.6.0-alpha.2/Foxsocket.Setup.0.6.0-alpha.2.exe)
2. Run it, pick an install location, then launch the legacy Foxsocket alpha.
3. Choose **Host** to assess this PC for running an agent (or **Client** if you are joining another Host).
4. On the Host page, inspect what is missing — that readiness report is a core test.

Release page (notes + checksums): [v0.6.0-alpha.2](https://github.com/Applied-AI-Solutions-hub/foxsocket/releases/tag/v0.6.0-alpha.2)

Optional integrity check: download [`SHA256SUMS.txt`](https://github.com/Applied-AI-Solutions-hub/foxsocket/releases/download/v0.6.0-alpha.2/SHA256SUMS.txt) from the same release.

### Installer notes

- No GitHub account, Git, Node.js, or OneDrive is required to install the app.
- Windows x64 only. The installer is **unsigned**. If Windows or SmartScreen blocks it, **record the exact message** in your test report — do **not** disable Windows protection.
- Prefer the `.exe` installer. The source ZIP on the release is for developers.

## What to test

Focus on these paths:

- Install, launch, resize, close, and reopen
- Local tasks, notes, working folders, and settings persisting across restarts
- Host readiness on a fresh PC, including missing-dependency states
- Connecting an **existing configured** OpenClaw agent in WSL
- Public GitHub update checks on startup

## What works vs what does not

### In this alpha

- **OpenClaw is the backbone (alpha.7 development build).** One setup button installs Ollama and a local model, then installs OpenClaw natively on Windows (no Ubuntu/WSL), configures it for that model, and confirms a first reply through OpenClaw. Chat then goes through OpenClaw. See [what changed and what is still being tested](docs/openclaw-backbone.md).
- One-click installer with no questions; disk space and memory checked before any download; downloads that resume after a stall with no time limit; OpenClaw doctor and repair from the setup page.
- Native Windows local-model setup with Ollama installation, model downloads, a real selected-model reply check, and persistent Resume setup navigation.
- Desktop install and workspace basics (tasks, notes, folders, settings)
- Host readiness / service controls for an existing OpenClaw setup
- Clean **Rennie** starter manifest (rename allowed; no personal credentials or memory bundled)
- Startup update checks against the public GitHub release

### Not finished yet

- Signed installers (pending the free SignPath Foundation application); unsigned builds are blocked by Smart App Control
- Fresh-PC validation of the native OpenClaw install and onboarding, and revalidation after restarting Windows
- End-to-end “fresh PC → first agent reply through OpenClaw” remains an acceptance test on the Lenovo
- Remote application pairing, iPhone/iPad clients, and cross-device conversation sync
- Treating a connected Tailscale network as app pairing (Tailscale is the intended private path; pairing itself is not implemented)
- Proven Windows background-task recovery and reboot persistence
- The new 3D mascot model (not integrated)

Rennie focuses on local model setup and an agent workspace. RGB lighting controls are not part of the app.

More Host detail: [Host implementation status](docs/managed-host.md).

## Report a test result

[Open an issue](https://github.com/Applied-AI-Solutions-hub/rennie/issues/new) and include:

- App version (`0.6.0-alpha.2` or what About shows)
- Windows version
- Host or Client
- Steps, expected result, actual result
- Exact SmartScreen / blocker text if install was blocked

**Do not** paste tokens, conversations, personal paths, IP addresses, or account details in screenshots or logs.

## Build from source (developers)

Windows with Node.js 22+ and pnpm 11:

```powershell
git clone https://github.com/Applied-AI-Solutions-hub/rennie.git
cd rennie
pnpm install --frozen-lockfile
pnpm start
```

- `pnpm dist` — Windows installer into `release`
- `node --test host-manager.test.cjs setup.test.cjs updates.test.cjs` and `pnpm test:ui` — checks

See [Contributing](CONTRIBUTING.md) and [Host implementation status](docs/managed-host.md).

## License

Original code is [MIT](LICENSE). See [third-party notices](THIRD-PARTY-NOTICES.md).

Existing package and application identifiers stay stable for profile compatibility, so some internal names still refer to Applied AI Command Center.

## Documentation

See the [documentation index](docs/README.md) for current guides, design proposals and historical release notes.

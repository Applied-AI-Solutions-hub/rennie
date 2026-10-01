# Rennie

**Your agent. Your devices. Connected.**

Open-source personal AI desktop workspace by [Applied AI Solutions](https://appliedai.solutions), with its fox mascot.

This is an **early Windows alpha (0.7.0-alpha.1)** for testers. It is not a finished agent hosting platform yet. What it takes to reach beta: [beta criteria](docs/beta-criteria.md).

## Quick start (Windows testers)

**No Rennie installer has been released yet.** Installers are unsigned until the free SignPath Foundation signing is set up ([signing status](docs/windows-signing.md)), and Smart App Control blocks unsigned installers.

- **Development PCs:** use the **Rennie-Windows-UNSIGNED-DEVELOPMENT** artifact from the current pull request's CI run, or run `pnpm dev:fresh` from source. See [development setup and Windows policy instructions](docs/development.md) and the [testing guide](docs/testing.md).

### Installer notes

- No GitHub account, Git, Node.js, or OneDrive is required to install the app.
- Windows x64 only. Development installers are **unsigned**. If Windows or SmartScreen blocks one, **record the exact message** in your test report — do **not** disable Windows protection.

## What to test

Focus on these paths:

- Install, launch, resize, close, and reopen
- Local tasks, notes, working folders, and settings persisting across restarts
- Host readiness on a fresh PC, including missing-dependency states
- Connecting an **existing configured** OpenClaw agent in WSL
- Public GitHub update checks on startup

## What works vs what does not

### In this alpha

- **OpenClaw is the backbone.** One setup button downloads a pinned, checksum-verified llama.cpp engine and a model chosen for this PC (Ollama for setups made before 0.7.0-alpha.1), then installs OpenClaw natively on Windows (no Ubuntu/WSL), configures it for that model, and confirms a first reply through OpenClaw. Chat then goes through OpenClaw. See [what changed and what is still being tested](docs/openclaw-backbone.md).
- One-click installer with no questions; disk space and memory checked before any download; downloads that resume after a stall with no time limit; OpenClaw doctor and repair from the setup page.
- Native Windows local-model setup: resumable, verified downloads, a model server that listens on this PC only with a per-install key and starts at sign-in, a real reply check, and persistent Resume setup navigation.
- Desktop install and workspace basics (tasks, notes, folders, settings)
- Host readiness / service controls for an existing OpenClaw setup
- Clean **Rennie** starter agent (you can rename it; no personal credentials or memory bundled)
- Startup update checks against the public GitHub release

### Not finished yet

- Signed installers (pending the free SignPath Foundation application); Smart App Control may block unsigned builds
- Fresh-PC validation of the native OpenClaw install and onboarding, and revalidation after restarting Windows
- End-to-end “fresh PC → first agent reply through OpenClaw” on a real consumer PC; the [sandbox](docs/testing.md) covers it on a throwaway Windows VM
- Remote application pairing, iPhone/iPad clients, and cross-device conversation sync
- Treating a connected Tailscale network as app pairing (Tailscale is the intended private path; pairing itself is not implemented)
- Proven Windows background-task recovery and reboot persistence
- The new 3D mascot model (not integrated)

Rennie focuses on local model setup and an agent workspace. RGB lighting controls are not part of the app.

More Host detail: [Host implementation status](docs/managed-host.md).

## Report a test result

[Open an issue](https://github.com/Applied-AI-Solutions-hub/rennie/issues/new) and include:

- App version (`0.7.0-alpha.1` or what About shows)
- Windows version
- Host or Client
- Steps, expected result, actual result
- Exact SmartScreen / blocker text if install was blocked

**Do not** paste tokens, conversations, personal paths, IP addresses, or account details in screenshots or logs.

## Build from source (developers)

Windows with Node.js 22.12 or later (CI uses 24) and pnpm 11:

```powershell
git clone https://github.com/Applied-AI-Solutions-hub/rennie.git
cd rennie
pnpm install --frozen-lockfile
pnpm start
```

- `pnpm dist` — Windows installer into `release`
- `pnpm test` — unit tests; `pnpm test:ui` — the workspace smoke test

| Folder | What it holds |
|---|---|
| `src/` | The app: main process, window, styles, `assets/` and the starter `agent/` |
| `test/unit/` | Unit tests (`node --test`) and PowerShell tests for the build scripts |
| `test/smoke/` | Tests that open the real app window with stand-ins (`electron test/smoke/<name>.cjs`) |
| `build/` | Installer scripts, the UI bundler and the sandbox acceptance script |
| `docs/` | Guides, the [testing guide](docs/testing.md) and an archive of earlier plans |

See [Contributing](CONTRIBUTING.md) and [Host implementation status](docs/managed-host.md).

## License

Original code is [MIT](LICENSE). See [third-party notices](THIRD-PARTY-NOTICES.md).

The program is `Rennie.exe` and the profile is `%APPDATA%\Rennie`. A profile from an earlier version is moved there automatically the first time Rennie starts.

## Documentation

See the [documentation index](docs/README.md) for current guides, design proposals and historical release notes.

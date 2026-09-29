# Shared Lenovo handoff — 0.7.0-alpha.1

**0.7.0-alpha.1 is the first build series from this repository.** Rennie was previously Foxsocket. It started as the alpha.7 development build with the Rennie name. Builds from the community-fixes pull request (#10) onward also change:

- **Installer file name:** `Rennie-Setup-0.7.0-alpha.1.exe` (no spaces), matching the name in SHA256SUMS.txt.
- **Chat after a failed save** (for example, a full disk): the message is not sent, the conversation says so, and you can send again. Chat no longer stays locked.
- **Optional WSL Host path:** a Linux environment that is slow to start is reported as "took too long to respond", not as OpenClaw missing.
- **Smaller installer:** retired files and bundle-only libraries are no longer packaged. Report anything that looks unstyled or missing.
- **New model engine (llama.cpp) for new setups:** Rennie downloads a pinned, checksum-verified llama.cpp build and a model chosen for this PC, instead of installing Ollama. On a PC without an NVIDIA GPU, which includes this Lenovo, that is Qwen3.5 4B running on the processor (about 2.7 GB). The engine and model are kept in `%LOCALAPPDATA%\Rennie\engine`. The model server listens on this PC only, needs a per-install key, and starts at sign-in through a Task Scheduler task named **Rennie model server**. OpenClaw connects to it with its llama.cpp connector. A setup that already works on Ollama keeps using Ollama for now.

**The owner has chosen to use Lenovo as a development PC.** Continue development with the **Foxsocket-Windows-UNSIGNED-DEVELOPMENT** CI artifact or `pnpm dev:fresh`. See [development setup](docs/development.md) (DEVELOPMENT.md in the artifact) for the explicit owner-controlled Windows setting and commands. No signing account is needed for development.

Match the commit and checksum from the artifact, not just the version. Free public signing remains separate and pending; the alpha.6 installer was blocked by Smart App Control for being unsigned, and 0.7.0-alpha.1 is unsigned too. The app is named Rennie, but its program file is still `Foxsocket.exe` and it keeps the existing Foxsocket profile folder, so settings and agents from an earlier install should carry over. Not yet verified: when upgrading over an earlier install, record the install folder before and after, and whether the old one is removed.

## What changed since alpha.6

Full record: [docs/openclaw-backbone.md](docs/openclaw-backbone.md). In short:

- **OpenClaw is now the backbone.** After Ollama and the model are ready, Rennie installs OpenClaw **natively on Windows** (no Ubuntu/WSL) with OpenClaw's official installer pinned to 2026.9.3, configures it for the local model, starts its gateway, and confirms a first reply through OpenClaw. Chat then goes to OpenClaw.
- **One-click installer.** No Host/Client page and no readiness page; installs for the current user and opens the app.
- **Downloads resume and have no time limit.** Stalls are detected (60 s without data for the Ollama installer, 180 s without progress for the model) and retried automatically, continuing where they stopped.
- **Disk and memory are checked before any download.** The model is recommended from memory.
- **Answer checks are repeatable** (temperature 0, fixed seed).
- **Troubleshooting:** *Run OpenClaw doctor* and *Let OpenClaw fix what it can*; installer output under *Technical details*.
- Optional assistant name, saved as the OpenClaw agent identity.

## Test the exact installer

The user requires a clean install for each Lenovo iteration. Record the actual baseline before testing (Rennie or Foxsocket, Ollama, OpenClaw, Node.js and `%USERPROFILE%\.openclaw` present or not); do not call a partially cleaned state pristine. Preserve unrelated user data and any existing agent profile. Do not manually install a backend to hide a failure.

1. Verify SHA256SUMS.txt (it names the exact installer file) and BUILD-INFO.json. Launch the installer from Explorer. Expected: no questions, no administrator prompt, the app opens. Record the install path and any Windows security message.
2. On the setup page, record what "This PC" reports (memory, free space, planned download) and the recommended model.
3. Enter an assistant name, then choose **Set up my assistant**. Record the exact model.
4. Watch the six steps. Record: which steps name llama.cpp or Ollama; progress during downloads; whether any console window appears; any **Windows permission prompt for Node.js** (approve it and record the wording); how long the OpenClaw step takes; whether anything else opens.
5. **New and highest-risk step:** the OpenClaw install and setup. If it stops, record the message, expand **Technical details** and copy the installer output into the report (redact paths and names), then choose **Run OpenClaw doctor** and record the findings. Note whether Smart App Control is on; it may block or restrict OpenClaw's PowerShell installer.
6. On success, record the first reply shown, then **Start a conversation**. Ask: `This is an installation test. What is 7 plus 5? Answer in one short sentence.`, then in the same chat `Reply with only the word blue.`, then an ordinary question of your own. Record the replies.
7. Confirm the name you entered appears in the sidebar. From a terminal, `openclaw agents list` should show it; note the output.
8. Close and reopen the app; send another message. Then restart Windows. **Before opening Rennie**, record whether a console window appeared at sign-in, and whether Task Scheduler shows **Rennie model server** as run at sign-in (open Task Scheduler, Task Scheduler Library). Then reopen Rennie and send a message. Record whether the model server and OpenClaw's gateway came back by themselves.
9. Interrupt a download once (disconnect the network for a minute during the model download) and confirm it resumes by itself; record what the screen said.
10. Uninstall Rennie; record the result. OpenClaw, the **Rennie model server** task and `%LOCALAPPDATA%\Rennie\engine` stay (removing them on uninstall is not built yet); record what is left.

## Report on the active pull request

Post the report as a comment on the active pull request in this repository. Include version/commit/checksum, Windows version and Smart App Control state, starting baseline, install path, "This PC" readings, selected model, each step's result and duration, Node.js permission prompt behavior, OpenClaw doctor findings if any, exact replies, reopen/restart results, download-interruption behavior, and any manual intervention. Separate passed, failed and untested items. Omit credentials, private paths and unrelated conversations.

## Known open work

- Signing (SignPath Foundation application not yet submitted). Without it, protected consumer PCs cannot run the installer.
- Answer quality of Qwen3.5 4B on the processor under OpenClaw's agent prompt is measured only on the development PC (first reply about 2 minutes, then about 10 s); untested on the Lenovo.
- The sign-in task has not yet been run on a real sign-in. That is steps 8 and 10 above.
- Ollama is started both by its own startup entry and by Rennie; its welcome window still opens (see finding 6 in the record).
- Cancel controls for a running download, and the skills library (to be built on OpenClaw skills).

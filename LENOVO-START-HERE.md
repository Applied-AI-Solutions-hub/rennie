# Lenovo acceptance test — Rennie 0.7.0-alpha.1

This is the acceptance test for issue #5: a clean PC with no NVIDIA GPU goes from installer to a working assistant on the llama.cpp engine, survives a restart, an upgrade and an uninstall, and never exposes its model server. A pass covers the CPU half of beta criterion 2, plus criteria 3 and 4 ([docs/beta-criteria.md](docs/beta-criteria.md)). It does not cover signing (criterion 1) or the NVIDIA half of criterion 2.

**The owner has chosen to use the Lenovo as a development PC**, with Smart App Control off for unsigned development builds. See [development setup](docs/development.md) (DEVELOPMENT.md in the artifact). No signing account is needed. Don't present that setting as a requirement for customers.

## What this build does

Rennie was previously Foxsocket; this is the first build series from this repository.

- **One-click installer.** It asks no questions, installs for the current user without an administrator prompt, and opens the app. The installer file is `Rennie-Setup-0.7.0-alpha.1.exe` (no spaces), matching SHA256SUMS.txt. The program file is still `Foxsocket.exe`, and the profile folder is still `%APPDATA%\Foxsocket`.
- **New model engine (llama.cpp).** On a PC without an NVIDIA GPU, which includes this Lenovo, Rennie downloads the processor build of PrismML's llama.cpp (about 19 MB) and Qwen3.5 4B (about 2.7 GB). Both are pinned and checked against published checksums. They live in `%LOCALAPPDATA%\Rennie\engine`.
- **Model server.** It listens on this PC only (`127.0.0.1:18080`) and needs a per-install key, which it reads from a file, so the key never appears in a process list. It starts at sign-in through a Task Scheduler task named **Rennie model server**, with no window.
- **OpenClaw is the assistant.** Rennie installs OpenClaw 2026.9.3 natively on Windows (no Ubuntu/WSL), adds OpenClaw's llama.cpp connector, points it at the model server, and confirms a first reply through OpenClaw. Chat then goes through OpenClaw.
- **Uninstall** removes the sign-in task, the running server and the engine folder. OpenClaw stays, because it's a separate program. **An upgrade** keeps the engine and model.
- **Other behavior.** Downloads resume after a stall with no time limit. Disk space is checked before anything downloads. A failed save of a chat message no longer locks chat. OpenClaw doctor and repair are on the setup page.

Full records: [docs/engine-plan.md](docs/engine-plan.md) and [docs/openclaw-backbone.md](docs/openclaw-backbone.md).

## Before you start

1. **Get the installer.** Download the **Foxsocket-Windows-UNSIGNED-DEVELOPMENT** artifact from the Windows validation run of the most recently merged pull request. At the time of writing that is #13 (commit `92a9c7d`, the same code as `main` at `0f3c82f`); its artifact expires on 13 October 2026. Extract it. Check that `BUILD-INFO.json` shows that commit and `"signature_status": "NotSigned"`, and that the installer's SHA-256 matches `SHA256SUMS.txt`.
2. **Record the baseline.** Note whether each of these is present: Rennie or Foxsocket (installed app), `%APPDATA%\Foxsocket`, `%LOCALAPPDATA%\Rennie`, `%USERPROFILE%\.openclaw`, Ollama, Node.js, and a **Rennie model server** task in Task Scheduler. A partially cleaned PC is not "clean"; say what was left.
3. **Make the test clean without losing anything.** This test needs no earlier Rennie setup and no OpenClaw configuration. An existing OpenClaw configuration is kept and keeps its own model, and a finished Ollama setup keeps Ollama. So:
   - Uninstall any earlier Rennie or Foxsocket.
   - Rename `%APPDATA%\Foxsocket` to `Foxsocket.before-acceptance` and `%USERPROFILE%\.openclaw` to `.openclaw.before-acceptance`. **Don't delete them.**
   - Leave Ollama installed if it's there; this build doesn't use it.
4. **Record** the Windows version, the Smart App Control state, free space on C:, and memory.

## Part A — Install and set up

5. **Install.** Launch the installer from Explorer.
   - *Expected:* no questions, no administrator prompt, and the app opens.
   - *Record:* the install folder and any Windows security message.
6. **"This PC".** On the setup page, read the "This PC" section.
   - *Expected:* it recommends **Qwen3.5 4B** with the reason "No supported GPU; using the processor", and plans a download of about 2.8 GB: the engine (19 MB), the model (2.7 GB) and OpenClaw (about 0.2 GB). Setup needs about 6.4 GB free on C:.
   - *Record:* memory, free space, the planned download, the recommendation and its reason.
7. **Start setup.** Enter an assistant name, keep Qwen3.5 4B, and choose **Set up my assistant**.
   - *Expected:* six steps, in this order:
     1. Check this PC
     2. Download the llama.cpp engine
     3. Download the AI model
     4. Start the model and check that it answers
     5. Install and set up OpenClaw
     6. Get a first reply through OpenClaw
   - *Record:* the start time.
8. **Interrupt the model download once.** During **Download the AI model**, disconnect the network for about a minute, then reconnect.
   - *Expected:* the screen says it's retrying, and the download continues where it stopped without you doing anything.
   - *Record:* what the screen said.
9. **Watch the rest of setup.**
   - *Expected:*
     - No console window appears at any point.
     - Windows may ask permission to install Node.js for OpenClaw. Approve it and record the wording.
     - The OpenClaw step can take 5–15 minutes.
     - The first reply through OpenClaw can take several minutes on the processor; over 10 minutes is a finding.
   - *Record:* each step's duration, anything else that opened, and the first reply shown.
10. **If setup stops.** Record the message. Expand **Technical details** and copy the output into the report, with paths and names redacted. Then choose **Run OpenClaw doctor** and record its findings. If it offers a repair, try **Let OpenClaw fix what it can** once and record what happened. Don't install anything by hand to get past a failure.

## Part B — Chat

11. **Ask three questions.** Choose **Start a conversation**. Ask `This is an installation test. What is 7 plus 5? Answer in one short sentence.`, then in the same chat `Reply with only the word blue.`, then an ordinary question of your own.
    - *Expected:* 12, then blue, then a sensible answer.
    - *Record:* the replies and roughly how long each took.
12. **Check the assistant's name.** Confirm the name you entered appears in the sidebar. In a terminal, `openclaw agents list` should show it; record the output.

## Part C — Is it private? (read-only checks)

Run these in PowerShell. They only read.

13. **Listening address.**
    ```powershell
    Get-NetTCPConnection -State Listen -LocalPort 18080 | Select-Object LocalAddress
    ```
    *Expected:* only `127.0.0.1`.
14. **Where the server runs from, and how it gets its key.**
    ```powershell
    Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" | Select-Object ExecutablePath, CommandLine | Format-List
    ```
    *Expected:*
    - The path is under `%LOCALAPPDATA%\Rennie\engine`.
    - The command line has `--api-key-file` and `--no-webui`, and **no** `--api-key` followed by a value.
15. **What OpenClaw points at.**
    ```powershell
    Select-String -Path "$env:USERPROFILE\.openclaw\openclaw.json" -Pattern 'llama-cpp|127.0.0.1:18080|localModelLean' | Select-Object -ExpandProperty Line
    ```
    *Expected:* the `llama-cpp` provider at `http://127.0.0.1:18080/v1`, `llama-cpp/qwen3.5-4b` as the model, and lean mode on. Don't paste any line that contains a key or token.
16. **The key isn't in the address bar.** Open `http://127.0.0.1:18080/v1/models` in a browser.
    *Expected:* an authentication error, because the key isn't given.

## Part D — Reopen and restart

17. **Reopen the app.** Close Rennie and reopen it, then send a message.
    *Expected:* a reply, with no setup steps repeated.
18. **Restart Windows.** Restart and sign in. **Before opening Rennie:**
    - Record whether any window appeared at sign-in. *Expected:* none.
    - Run this and record the result:
      ```powershell
      Get-ScheduledTaskInfo -TaskName 'Rennie model server' | Select-Object LastRunTime, LastTaskResult
      ```
      *Expected:* it ran at sign-in.
    - Repeat step 14. *Expected:* the server is already running.
19. **After the restart.** Open Rennie and send a message.
    - *Expected:* a reply.
    - *Record:* whether the model server and OpenClaw's gateway came back by themselves, and how long the first reply took.

## Part E — Upgrade

20. **Run the same installer again** over the installed app. electron-builder treats that as an upgrade.
    - *Expected:*
      - The app reopens.
      - Nothing is downloaded again: the engine and model in `%LOCALAPPDATA%\Rennie\engine` are kept, and the **Rennie model server** task still exists.
      - A message gets a reply.
    - *Record:* the install folder before and after, whether any download started, and the reply.
21. **Optional, issue #6.** If an older Foxsocket alpha installer is at hand, repeat this test starting from that alpha installed instead of a clean PC. Record the install folder before and after, and whether a second folder or shortcut appears.

## Part F — Uninstall

22. **Uninstall Rennie** from Windows Settings, then check what remains.
    - *Expected:*
      - The **Rennie model server** task is gone.
      - No `llama-server.exe` is running (step 14 returns nothing).
      - `%LOCALAPPDATA%\Rennie` is gone.
      - OpenClaw and `%USERPROFILE%\.openclaw` remain, because they belong to OpenClaw.
    - *Record:* anything else that remains.
23. **Restore what you renamed in step 3**, if you want your earlier setup back. Remove the test's OpenClaw configuration first, if you're restoring the old one.

## Report

Post the report as a comment on issue #5, and on the active pull request if there is one. Include:

- **Build:** the commit, checksum and signature status from `BUILD-INFO.json`.
- **PC:** the Windows version, Smart App Control state, and the baseline from steps 2–4.
- **Results by part:** passed, failed or untested for each of Parts A–F, with the step number, what you expected, what happened, and how long it took.
- **Exact wording:** of error messages, the Node.js prompt and OpenClaw doctor findings.
- **Manual steps:** anything you had to do by hand.

Leave out credentials, keys, tokens, private paths and unrelated conversations.

## Known open work

- **Signing:** the SignPath Foundation application hasn't been submitted (#3). Without it, protected consumer PCs can't run the installer.
- **NVIDIA half of beta criterion 2:** the 8 GB+ and 12 GB+ NVIDIA tiers need their own run on an NVIDIA PC.
- **Answer quality on the processor:** Qwen3.5 4B under OpenClaw's agent prompt was measured only on the development PC (first reply about 2 minutes, then about 10 s).
- **Ollama:** it's removed only after this test passes (#4, step 4). Until then, a setup that already works on Ollama keeps it.
- **Not built yet:** cancel controls for a running download, and the skills library (to be built on OpenClaw skills).

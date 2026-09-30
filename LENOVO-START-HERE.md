# Lenovo acceptance test — Rennie 0.7.0-alpha.1

This is the acceptance test for issue #5 on a PC with no NVIDIA GPU. Each beta criterion ([docs/beta-criteria.md](docs/beta-criteria.md)) is credited only when the parts listed for it have been run and passed. If a part is skipped, report its criterion as untested.

| Criterion | Credited when these pass |
|---|---|
| 2, CPU half: clean PC to first reply | Before you start (with OpenClaw absent), A, B, C and D |
| 3: recovery, uninstall, upgrade | D, F, G and H |
| 4: troubleshooting | E |

This test does not cover signing (criterion 1) or the NVIDIA half of criterion 2.

**The owner has chosen to use the Lenovo as a development PC**, with Smart App Control off for unsigned development builds. See [development setup](docs/development.md) (DEVELOPMENT.md in the artifact). No signing account is needed. Don't present that setting as a requirement for customers.

## What this build does

Rennie was previously Foxsocket; this is the first build series from this repository.

- **One-click installer.** It asks no questions, installs for the current user without an administrator prompt, and opens the app. The installer file is `Rennie-Setup-0.7.0-alpha.1.exe` (no spaces), matching SHA256SUMS.txt. The program is `Rennie.exe` and the profile folder is `%APPDATA%\Rennie`. A profile from an earlier Foxsocket install (`%APPDATA%\Foxsocket`) is moved there automatically the first time Rennie starts. Builds up to commit `3ad8c05` still used `Foxsocket.exe` and `%APPDATA%\Foxsocket`; if you're testing one of those, the old names are expected.
- **New model engine (llama.cpp).** On a PC without an NVIDIA GPU, which includes this Lenovo, Rennie downloads the processor build of PrismML's llama.cpp (about 19 MB) and Qwen3.5 4B (about 2.7 GB). Both are pinned and checked against published checksums. They live in `%LOCALAPPDATA%\Rennie\engine`.
- **Model server.** It listens on this PC only (`127.0.0.1:18080`) and needs a per-install key, which it reads from a file, so the key never appears in a process list. It starts at sign-in through a Task Scheduler task named **Rennie model server**, with no window.
- **OpenClaw is the assistant.** Rennie installs OpenClaw 2026.9.3 natively on Windows (no Ubuntu/WSL), adds OpenClaw's llama.cpp connector, points it at the model server, and confirms a first reply through OpenClaw. Chat then goes through OpenClaw.
- **Uninstall** removes the sign-in task, Rennie's running server and the engine folder. OpenClaw stays, because it's a separate program. **An upgrade** keeps the engine and model.
- **Other behavior.** Downloads resume after a stall with no time limit. Disk space is checked before anything downloads. A failed save of a chat message no longer locks chat. OpenClaw doctor and repair are on the setup page.

Full records: [docs/engine-plan.md](docs/engine-plan.md) and [docs/openclaw-backbone.md](docs/openclaw-backbone.md).

## Before you start

1. **Get the installer.** Download the **Foxsocket-Windows-UNSIGNED-DEVELOPMENT** artifact from the latest Windows validation run of the pull request you're testing. For the rename (`Rennie.exe`, `%APPDATA%\Rennie` and the profile move that Part H checks), that's #15 or anything merged after it; earlier builds still use `Foxsocket.exe` and `%APPDATA%\Foxsocket`. Artifacts expire 14 days after their run. Extract it. Check that `BUILD-INFO.json` shows that pull request's latest commit as `tested_head_sha` and `"signature_status": "NotSigned"`, and that the installer's SHA-256 matches `SHA256SUMS.txt`.
2. **Record the baseline.** Note whether each of these is present:
   - Rennie or Foxsocket (the installed app), `%APPDATA%\Rennie`, `%APPDATA%\Foxsocket` and `%LOCALAPPDATA%\Rennie`;
   - OpenClaw: `openclaw --version` in a new terminal, and `%USERPROFILE%\.openclaw`;
   - Node.js (`node --version`), Ollama, and a **Rennie model server** task in Task Scheduler.

   A partially cleaned PC is not "clean"; say what was left.
3. **Make the PC clean without losing anything.** The clean pass needs no earlier Rennie setup and no OpenClaw at all. An existing OpenClaw configuration is kept and keeps its own model; an installed OpenClaw is reused, which skips OpenClaw's installer; and a finished Ollama setup keeps Ollama. So:
   - Uninstall any earlier Rennie or Foxsocket. Keep its installer if you have it, for Part H.
   - Rename `%APPDATA%\Rennie` and `%APPDATA%\Foxsocket` (whichever exist) to `Rennie.before-acceptance` and `Foxsocket.before-acceptance`, and `%USERPROFILE%\.openclaw` to `.openclaw.before-acceptance`. **Don't delete them.**
   - If `openclaw --version` works, remove the OpenClaw program with `npm uninstall -g openclaw` and record it. If you'd rather keep it, go on, but report the OpenClaw installation in step 9 as **untested**. Then the CPU half of criterion 2 is only partly shown.
   - Node.js may stay. If it's present, report the Node.js permission prompt in step 9 as not applicable.
   - Leave Ollama installed if it's there; this build doesn't use it.
4. **Record** the Windows version, the Smart App Control state, free space on C:, and memory.

## Part A — Install and set up

5. **Install.** Launch the installer from Explorer.
   - *Expected:* no questions, no administrator prompt, and the app opens.
   - *Record:* the install folder and any Windows security message.
6. **"This PC".** On the setup page, read the "This PC" section.
   - *Expected:* it recommends **Qwen3.5 4B** with the reason "No supported GPU; using the processor". It plans a download of about 2.8 GB: the engine (19 MB), the model (2.7 GB) and OpenClaw (about 0.2 GB). Setup needs about 6.4 GB free on C:.
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
     - OpenClaw's installer runs, unless OpenClaw was kept in step 3.
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
14. **Where Rennie's server runs from, and how it gets its key.**
    ```powershell
    $engine = Join-Path $env:LOCALAPPDATA 'Rennie\engine'
    Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" | Where-Object { $_.ExecutablePath -like "$engine\*" } | Select-Object ExecutablePath, CommandLine | Format-List
    ```
    *Expected:*
    - One process.
    - The command line has `--api-key-file` and `--no-webui`, and **no** `--api-key` followed by a value.

    This is Rennie's server only; any other llama-server on the PC is ignored.
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
    - Repeat step 14. *Expected:* one process, so the server is already running.
19. **After the restart.** Open Rennie and send a message.
    - *Expected:* a reply.
    - *Record:* whether the model server and OpenClaw's gateway came back by themselves, and how long the first reply took.

## Part E — Troubleshooting (required for criterion 4)

Break one thing at a time on purpose. For each case, record Rennie's exact words. It should say what stopped and what to do in plain language; a generic or misleading message is a finding.

20. **The model server stops.** End Rennie's server:
    ```powershell
    $engine = Join-Path $env:LOCALAPPDATA 'Rennie\engine'
    Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" | Where-Object { $_.ExecutablePath -like "$engine\*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    ```
    Then send a message.
    - *Expected:* the message doesn't get a normal reply, and Rennie explains what failed.
    - Open **This PC** and record what it says about the model server. Choose **Resume setup** if it's offered.
    - *Expected:* the server starts again (step 14 shows one process), and the next message gets a reply.
21. **OpenClaw's gateway stops.** In a terminal, run `openclaw gateway stop`, then send a message. If that command doesn't exist, record the error and skip to step 22.
    - *Expected:* no normal reply, and Rennie explains that OpenClaw didn't answer.
    - Choose **Run OpenClaw doctor** and record its findings. Then choose **Let OpenClaw fix what it can**, or **Resume setup** if no repair is offered.
    - *Expected:* the gateway runs again, and the next message gets a reply.
    - *Record:* each message and finding, and whether the repair worked without typing commands.

## Part F — Upgrade to the same build

22. **Run the same installer again** over the installed app. electron-builder treats that as an upgrade.
    - *Expected:*
      - The app reopens.
      - Nothing is downloaded again: the engine and model in `%LOCALAPPDATA%\Rennie\engine` are kept, and the **Rennie model server** task still exists.
      - A message gets a reply.
    - *Record:* the install folder before and after, whether any download started, and the reply.

## Part G — Uninstall

23. **Uninstall Rennie** from Windows Settings, then check what remains.
    - *Expected:*
      - The **Rennie model server** task is gone.
      - Step 14 returns nothing, because no server runs from Rennie's folder. A llama-server belonging to another program doesn't count.
      - `%LOCALAPPDATA%\Rennie` is gone.
      - OpenClaw and `%USERPROFILE%\.openclaw` remain, because they belong to OpenClaw.
    - *Record:* anything else that remains.

## Part H — Upgrade from the previous alpha (required for criterion 3)

Criterion 3 asks that upgrading from the previous alpha keeps the user's profile and agent. Reinstalling the same build (Part F) doesn't show that.

24. **Install the previous alpha.** Starting from the state Part G left, install the most recent earlier alpha you have: the published 0.6.0-alpha.2 installer the owner keeps, or an alpha.7 development build. Record which one.
25. **Give it something to keep.** In that alpha, set an assistant name if it offers one, add a task and a note, and send or keep at least one conversation. Record exactly what you created. Close it.
26. **Install this build over it.**
    - *Expected:*
      - One install folder: record it before and after, and whether the old one is removed.
      - One set of Start menu and desktop shortcuts.
      - The app opens with the tasks, notes and conversation from step 25 still there.
      - The profile is now in `%APPDATA%\Rennie`, and `%APPDATA%\Foxsocket` is gone: it was moved, not copied.
      - The program is `Rennie.exe`, and `Foxsocket.exe` is gone from the install folder.
      - If "start when I sign in" was on in the old alpha, it still starts Rennie after the next sign-in.
      - The assistant name is kept.
27. **Set up the assistant from there** (steps 6–11).
    - *Expected:* the same results as the clean pass. OpenClaw's existing configuration from Part A is reused, and its model stays `llama-cpp/qwen3.5-4b`.
    - *Record:* anything that differs from the clean pass. This also covers issue #6.
28. **Clean up.** Uninstall, then restore what you renamed in step 3 if you want your earlier setup back. Remove the test's `%USERPROFILE%\.openclaw` first, if you're restoring the old one.

## Report

Post the report as a comment on issue #5, and on the active pull request if there is one. Include:

- **Build:** the commit, checksum and signature status from `BUILD-INFO.json`.
- **PC:** the Windows version, Smart App Control state, and the baseline from steps 2–4, including whether OpenClaw and Node.js were present.
- **Results by part:** passed, failed or untested for each of Parts A–H, with the step number, what you expected, what happened, and how long it took.
- **Criteria:** for each of criteria 2 (CPU), 3 and 4, whether it's shown, partly shown or untested, per the table at the top.
- **Exact wording:** of error messages, the Node.js prompt and OpenClaw doctor findings.
- **Manual steps:** anything you had to do by hand.

Leave out credentials, keys, tokens, private paths and unrelated conversations.

## Known open work

- **Signing:** the SignPath Foundation application hasn't been submitted (#3). Without it, protected consumer PCs can't run the installer.
- **NVIDIA half of beta criterion 2:** the 8 GB+ and 12 GB+ NVIDIA tiers need their own run on an NVIDIA PC.
- **Answer quality on the processor:** Qwen3.5 4B under OpenClaw's agent prompt was measured only on the development PC (first reply about 2 minutes, then about 10 s).
- **Ollama:** it's removed only after this test passes (#4, step 4). Until then, a setup that already works on Ollama keeps it.
- **Not built yet:** cancel controls for a running download, and the skills library (to be built on OpenClaw skills).

# Testing Rennie

Rennie is tested in three layers. Each layer covers what the one before it can't.

| Layer | When it runs | What it covers | What it can't show |
|---|---|---|---|
| **PR checks** (`windows-test-installer.yml`) | Every pull request | Unit tests, app smoke tests with stand-ins, the unsigned development installer | Anything that needs a real model, OpenClaw or an installed app |
| **Sandbox** (`windows-sandbox-acceptance.yml`) | A pull request with the `sandbox` label, or started by hand from the Actions tab | The real installed app on a throwaway Windows VM: install, processor setup through OpenClaw, chat, privacy checks, reopen, recovery, reinstall, uninstall, and an upgrade from the build before the rename | A GPU, a real Windows sign-in or restart, Smart App Control, a consumer PC |
| **Development PC** (below) | Before a merge that changes setup, the engine or the installer | The NVIDIA path, a real restart, Smart App Control, and an upgrade of a real installed copy | A clean consumer PC with no earlier setup |

The Lenovo is no longer part of testing (owner decision, 2026-09-30). Its procedure is kept in [archive/LENOVO-START-HERE.md](archive/LENOVO-START-HERE.md).

## Beta criteria

Each [beta criterion](beta-criteria.md) is credited only when the parts listed for it have run and passed. Report a skipped part as **untested**.

| Criterion | Credited when these pass |
|---|---|
| 2, processor half: clean PC to first reply | Sandbox Parts A–D. The sandbox is a VM, not a consumer PC; say so when crediting it. |
| 2, NVIDIA half | Development PC steps 1–6 |
| 3: recovery, uninstall, upgrade | Sandbox Parts D–H, plus development PC step 7 (real restart) |
| 4: troubleshooting | Sandbox Part E |
| 1: signing | Not covered until the SignPath Foundation application (#3) is done |

## Run the sandbox

Add the `sandbox` label to the pull request. Each push to a labelled pull request runs it again. A run takes about an hour, most of it the first reply on the VM's processor.

The report is attached to the run as an artifact and printed in the job log. Each line says `PASS`, `FAIL`, `INFO`, `LIMITED` or `UNTESTED`. The sandbox never records keys: it reports yes/no answers and statuses, and blanks secrets in log lines it attaches.

## Development PC

The development PC has an NVIDIA GPU (RTX 5060 Ti, 16 GB) and Smart App Control **on**. Rennie runs there every day, so the test upgrades the real installed copy.

**Rules:**
- Back up `%APPDATA%\Rennie` before installing a test build. The backup can hold a gateway token: keep it private.
- Test chats appear in the owner's real history.
- Never change Smart App Control or any other Windows security setting. If it blocks a build, record the exact message and stop.
- Deleting anything (leftover files, old models) needs the owner's approval.

**Steps:**

1. **Build.** Download the **Rennie-Windows-UNSIGNED-DEVELOPMENT** artifact from the pull request's checks, or build it from source (see [development setup](development.md)). Check that `BUILD-INFO.json` shows the pull request's latest commit and that the installer's SHA-256 matches `SHA256SUMS.txt`.
2. **Install over the current copy.** Close Rennie and run the installer. *Record:* whether Smart App Control or any other Windows message appeared, and the install folder.
3. **Reopen.** *Expected:* no setup steps repeat. The engine and model in `%LOCALAPPDATA%\Rennie\engine` are kept, and nothing downloads again.
4. **This PC.** *Expected:* the recommendation is **Bonsai 2 27B** on the NVIDIA GPU (11.5 GiB or more of video memory).
5. **Chat.** Ask `This is an installation test. What is 7 plus 5? Answer in one short sentence.`, then `Reply with only the word blue.`. *Expected:* 12, then blue, each within seconds. *Record:* the times.
6. **Privacy checks.** In PowerShell (they only read):
   ```powershell
   # Listens on this PC only: expect 127.0.0.1
   Get-NetTCPConnection -State Listen -LocalPort 18080 | Select-Object LocalAddress
   # Rennie's server, and how it gets its key: expect one process, --api-key-file and --no-webui, and no --api-key followed by a value
   $engine = Join-Path $env:LOCALAPPDATA 'Rennie\engine'
   Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" | Where-Object { $_.ExecutablePath -like "$engine\*" } | Select-Object ExecutablePath, CommandLine | Format-List
   ```
   Then open `http://127.0.0.1:18080/v1/models` in a browser. *Expected:* an authentication error.
7. **Restart Windows.** Sign in, and before opening Rennie:
   - *Expected:* no window appears at sign-in.
   - `Get-ScheduledTaskInfo -TaskName 'Rennie model server' | Select-Object LastRunTime, LastTaskResult` shows it ran at sign-in, and step 6's process check shows one server.
   - Open Rennie and send a message. *Record:* how long the first reply took.
8. **Interrupted download** (only when a change touches downloads): start setup for a model that isn't downloaded yet, disconnect the network for about a minute during the model download, then reconnect. *Expected:* the screen says it's retrying and the download continues by itself.

## Report

Post results as a comment on the pull request, and on issue #5 when they credit a beta criterion. Include the build (commit, checksum, signature status), the PC, each step's result (passed, failed or untested) with times, and the exact wording of any error. Leave out keys, tokens, private paths, network addresses and unrelated conversations.

## Working from more than one checkout

Use a separate Git checkout per machine or agent, fetch before starting, and submit changes through a branch and pull request. Don't use cloud-folder sync instead of Git, and don't commit or push someone else's uncommitted work. A cloned checkout doesn't carry gateway access, credentials, conversation history or hardware settings.

## Known open work

- **Signing:** the SignPath Foundation application (#3). Until then, protected consumer PCs may block the installer.
- **Processor path on real hardware:** only the sandbox VM covers it now.
- **First reply on the processor:** sandbox run 36806197972 passed setup and upgrade but exceeded the 17-minute test deadline after a simulated restart. Its subsequent repair failure happened while the earlier request could still be running, so it needs an independent rerun. Authentication retries now share the original 15-minute reply budget, and the sandbox stops if its own deadline expires rather than starting repair against an unresolved request. These changes bound the wait; they do not establish a latency improvement. A warm-up at sign-in is planned.
- **OpenClaw background jobs:** OpenClaw runs its own heartbeat every 30 minutes, which can wake the model.
- **Ollama:** kept only for installs already set up on it; removal is planned.

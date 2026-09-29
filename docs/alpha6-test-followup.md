# Alpha.6 response to Lenovo alpha.5 testing

**Subsequent Lenovo result: blocked before launch.** The matching unsigned alpha.6 installer was rejected by Windows Application Control. The local results below do not establish Lenovo acceptance. [Signing pipeline fix and remaining publisher setup](windows-signing.md); [current handoff](../LENOVO-START-HERE.md).

The alpha.5 report is on PR #33 (comment 5798811090). This follow-up addresses the three reported issues without changing the working Sparky profile.

## Live local-model evidence

Used a separate Ollama server on loopback port 11555 and a separate model directory. Downloaded official llama3.2:1b and llama3.2:3b there. No cloud inference or credentials. Tests ran on the development PC with an RTX 5060 Ti, not the Lenovo; these are behavioral results, not Lenovo performance guarantees.

Two requests were compared at temperature 0.4 using the normal chat token budget: the reported 7-plus-5 installation question and `Reply with only the word blue.`

| Model/context | Arithmetic | One-word instruction |
| --- | --- | --- |
| 1B, no system context | Failed (claimed no mathematical capability) | Failed (`No.`) |
| 1B, alpha.5 bundled context | Failed (graph-related answer) | Failed (repeated context) |
| 1B, short neutral context | Passed (`7 plus 5 equals 12.`) | Failed (claimed no response to provide) |
| 3B, no system context | Passed | Passed |
| 3B, alpha.5 bundled context | Passed | Failed (added colon fences) |
| 3B, short neutral context | Passed (`The answer is 12.`) | Passed (`blue`) |

The new setup verifier then passed both checks with the recommended 3B model. The Electron chat UI passed arithmetic and instruction requests through the real IPC handler and Ollama transport in an isolated profile, after renderer reload and after a new Electron process reopened the saved profile. The test asserts the selected model is 3B, the conversation is persisted, and the agent graph is unchanged. These small checks are not a general quality benchmark.

## Changes

- New local-chat prompt builder is shared between normal chat and setup checks. Local chat excludes bundled identity/graph context and does not absorb model-written graph updates. Existing files are retained; no memory is silently deleted.
- Fresh bundled starter files contain no owner, device, or model facts. Existing 1B selections are retained, while fresh setup recommends 3B. The small model is clearly labeled as limited quality.
- An arbitrary response does not pass readiness. Both arithmetic and one-word checks must pass, and errors include a bounded reply excerpt so testing can distinguish connectivity from answer failures.
- Electron-builder's directory page was appending the new app name to legacy paths. Directory rewriting is disabled; valid registered installation paths are retained exactly. A fresh install uses the default Foxsocket location. Stale app-identity registration is pruned only when known app executable files are absent. User-data files are not deleted.
- Ollama's upstream installer has an unconditional postinstall app launch (https://github.com/ollama/ollama/blob/main/app/ollama.iss). Foxsocket explains before/during setup that its separate welcome window needs no action. No unsupported installer flag or process-killing workaround was added.

## Checks and remaining acceptance

Passed 35 Node tests, normal chat transport/UI regression, local setup UI regression, workspace UI regression, PowerShell prerequisite/progress tests, and a compiled NSIS registration harness using disposable registry keys and executable fixtures. The harness checks stale, valid legacy, and valid already-nested locations. Installer compilation passed; the matching GitHub artifact is linked in PR #33 once CI completes.

Still needs Lenovo testing: fresh-profile installation, actual legacy upgrade/uninstall/reinstall, system restart and reply after sign-in, model-layer download/retry observations, and the complete layout/navigation acceptance matrix. Already nested installations are preserved rather than moved. A protected stale machine-wide registry entry may require administrator privileges to remove; do not claim that scenario was exercised by the current-user harness.

# Beta criteria

Rennie stays in **alpha** until every item below is met. Each one needs a recorded test result: what was tested, on which kind of PC, with which build, and what happened.

| # | Criterion | Status |
|---|---|---|
| 1 | **Signed installer.** The Windows installer is signed through the free [SignPath Foundation](https://signpath.org/) program and installs with Smart App Control turned on. | Not met: the application has not been submitted yet. |
| 2 | **Clean PC to first reply.** On a clean Windows PC: install Rennie, set up the local model engine, set up OpenClaw, and get a first reply. Tested on a CPU-only PC and on a PC with an NVIDIA GPU. This includes the move to the llama.cpp engine described in [engine-plan.md](engine-plan.md). | Not met. |
| 3 | **Recovery.** After restarting Windows, Rennie and OpenClaw come back and reply. Uninstalling works. Upgrading from the previous alpha keeps the user's profile and agent. | Not met. |
| 4 | **Troubleshooting.** OpenClaw doctor and repair are tested against real setup failures, and Rennie explains what went wrong in plain language. | Not met. |
| 5 | **No open data-loss or security issues.** | Not met: review pending. |

## Versions

- Alphas are numbered `0.7.0-alpha.N`. The first beta is expected to be about `0.8.0-beta.1`.
- Development builds from pull requests are **unsigned** and meant for owner-configured development PCs. Don't disable Windows protection to run them.

## History

Earlier releases and their history are kept in an archived predecessor repository; see the [archive](archive/) for the plans and reviews that led here.

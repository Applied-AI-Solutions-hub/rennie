# Moving the model engine to llama.cpp: test results and plan

**Date:** 2026-09-28 · **Branch:** `plan/llama-cpp-engine` (from `feature/openclaw-backbone`) · **Made by:** Claude (Claude Code), at the owner's request after the owner chose llama.cpp over Ollama. Nothing here is implemented yet; this is the measured basis for the implementation.

## Decision summary

1. **Engine: PrismML's llama.cpp build, run by Foxsocket** ("Option B"). It is the only engine that runs the best model we tested (Bonsai 2 27B), it also runs standard GGUF models, and because it is MIT-licensed Foxsocket can later compile and sign its own copy. OpenClaw connects to it through its llama.cpp plugin's "existing server" mode. Verified end to end on Windows, including tool use.
2. **The model depends on the PC** (details under *Model tiers*):
   - NVIDIA GPU with 12 GB or more of video memory: **Bonsai 2 27B, `PQ2_0` file**.
   - Everything else, including PCs with no GPU: **Qwen3.5 4B** (standard `Q4_K_M` file).
3. **OpenClaw's lean mode is required** for local models: it cut OpenClaw's prompt from 24,004 to 10,172 tokens.
4. **Not recommended:** Ternary Bonsai 8B and the 1-bit Bonsai 8B. They were fast, but they ignore output-format instructions and reuse the prompt cache poorly on the CPU.

## How it was tested

Development PC: AMD Ryzen 7 7800X3D (8 cores), 31 GB RAM, NVIDIA RTX 5060 Ti 16 GB (driver 616.92), Windows 11. Everything ran in a separate test folder on port 18080, isolated from the PC's own tools. Every download was checked against its published SHA-256.

| Component | Version |
| --- | --- |
| PrismML llama.cpp | release `prism-b10743-adfffbe` (2026-09-25): CUDA 12.4 and CPU builds |
| Official llama.cpp | `b11223` (2026-09-27): CPU build, for the compatibility check |
| OpenClaw | 2026.9.3 (the version Foxsocket pins) plus `@openclaw/llama-cpp-provider@2026.9.3`, installed only inside the test folder |
| Models | Bonsai 2 27B (`PTQ1_0` 5.95 GB, `PQ2_0` 7.21 GB), Ternary Bonsai 8B `PQ2_0` 2.18 GB, Bonsai 8B 1-bit `Q1_0` 1.16 GB, Qwen3.5 4B and 9B `Q4_K_M` (unsloth, 2.74 / 5.68 GB), Nemotron 3 Nano 4B `Q4_K_M` |

The scripts and raw results are in [`engine-lab/`](engine-lab):

- `bench.cjs`: load, memory, speed, the setup checks, 5 tool calls, and thinking cost.
- `eval.cjs`: 15 everyday tasks, auto-graded.
- `eval-hard.cjs`: 14 harder tasks, including choosing between 4 tools.
- Results: `*.jsonl`. The first `eval-hard` runs scored every model wrong on "sort" because of a grader bug; the scores below are corrected.

## Results

### Speed and memory (GPU, 32K context)

| Model | File | Video memory | Tokens/s | Setup checks | Tool calls |
| --- | ---: | ---: | ---: | :---: | :---: |
| Bonsai 2 27B `PQ2_0` | 7.21 GB | 9.1 GB | 47.5 | 3/3 | 5/5 |
| Bonsai 2 27B `PTQ1_0` | 5.95 GB | 8.0 GB | 15.4 | 3/3 | 5/5 |
| Qwen3.5 9B | 5.68 GB | 6.2 GB | 70.6 | 3/3 | 5/5 |
| Qwen3.5 4B | 2.74 GB | 3.9 GB | 113.8 | 3/3 | 5/5 |
| Ternary Bonsai 8B | 2.18 GB | 6.8 GB | 154.5 | 3/3 | 5/5 |
| Bonsai 8B 1-bit | 1.16 GB | 5.9 GB | 64.3 | 3/3 | 5/5 |
| Nemotron 3 Nano 4B | 2.84 GB | 3.3 GB | 114.5 | 3/3 | **0/5** |

On this RTX 50-series card `PQ2_0` is 3x faster than `PTQ1_0`. PrismML says `PTQ1_0` is the faster one on 40-series cards; that hasn't been checked here.

### CPU only (the no-GPU case)

| Model | Reading the prompt | Writing |
| --- | ---: | ---: |
| Qwen3.5 4B | 113 tok/s | 18 tok/s |
| Nemotron 3 Nano 4B | 109 | 19 |
| Qwen3.5 9B | 69 | 10 |
| Ternary Bonsai 8B | 67 | 23 |
| Bonsai 8B 1-bit | 51 | 30 |
| Bonsai 2 27B | **3.3** | **2.8** |

Reading OpenClaw's prompt is the bottleneck without a GPU. Bonsai 2 is GPU-only in practice.

### Quality

With thinking off (15 everyday tasks, then 14 harder ones):

| Model | Everyday | Harder |
| --- | :---: | :---: |
| Bonsai 2 27B | 13/15 | 12/14 |
| Qwen3.5 9B | 13/15 | 12/14 |
| Qwen3.5 4B | 11/15 | **13/14** |
| Ternary Bonsai 8B | 11/15 | 7/14 |
| Bonsai 8B 1-bit | 11/15 | not run |
| Nemotron 3 Nano 4B | 6/15 | not run |

With thinking on ("medium"), the harder 14 tasks, total time across all 14:

| Model | Score | Time |
| --- | :---: | ---: |
| **Bonsai 2 27B** | **14/14** | **33 s** |
| Qwen3.5 9B | 13/14 | 64 s |
| Qwen3.5 4B | 12/14 | 178 s (ran out of room twice) |

These are small probes, so treat single-point differences as ties. Two results are clear:

- **Ternary Bonsai 8B ignores "reply with just the number"** and explains its working instead.
- **Bonsai 2 thinks both best and fastest**, which matches PrismML's results, all of which were measured with thinking on.

### Through OpenClaw (lean mode; time until the reply)

| Model and hardware | First reply after start | A new conversation | A file-writing task |
| --- | ---: | ---: | ---: |
| Bonsai 2 27B `PQ2_0`, GPU | 16 s | 3 s | 4 s (file correct) |
| Qwen3.5 4B, CPU only | 109 s | 9 s | 16 s (file correct) |
| Ternary Bonsai 8B, CPU only | 209 s | 70 s | not run |
| Bonsai 8B 1-bit, CPU only, **without** lean mode | timed out at 600 s | | |

A new conversation reuses the cached OpenClaw prompt. Bonsai 2 and Qwen3.5, which share a hybrid architecture, reuse all but about 520 tokens; Ternary Bonsai 8B has to re-read about 2,800 tokens. So on CPU-only PCs the only long wait is the first reply after the model server starts. Foxsocket can hide that by sending a warm-up request in the background.

### Compatibility and security

- **Official llama.cpp can't load** Ternary Bonsai 8B `PQ2_0` or Bonsai 2 ("failed to load model"). It does load Bonsai 8B 1-bit and standard models. PrismML's build loads all of them.
- **Ollama's stored models don't load in llama.cpp.** Ollama writes its own metadata (`qwen35.rope.dimension_sections` length mismatch), so switching means downloading standard GGUF files.
- **Both PrismML's and the official Windows builds are unsigned** (`NotSigned`), so Smart App Control blocks either one on protected PCs. Only Option B can fix this: compile the MIT-licensed source in Foxsocket's CI and sign it with Foxsocket's signing once approved. SignPath's acceptance of this still has to be confirmed.
- **The API key works:** requests with no key or a wrong key get `401`; the correct key gets a reply.

### OpenClaw findings, all on native Windows

- `onboard --auth-choice llama-cpp-existing-server --custom-base-url http://127.0.0.1:<port>/v1 --custom-model-id <id> --llama-server-api-key <key>` works once the plugin is installed. It printed "runs great on WSL2", which users never see.
- **Tool use works end to end:** the agent wrote files in its workspace with Bonsai 8B, Bonsai 2 and Qwen3.5 4B.
- **OpenClaw's real `agent --json` reply shape differs from its docs.** Fixed in PR #34, commit `98bf8d4`.
- **`agent --local` crashes on exit** (a libuv `UV_HANDLE_CLOSING` assertion) after answering. The gateway path doesn't crash, and it's what Foxsocket uses.
- **Bonsai 2's template declares `supports_reasoning_effort`**, which OpenClaw's plugin wants for tool calls. Qwen3.5 and Bonsai 8B don't declare it, yet their tool calls still worked through OpenClaw.

## Model tiers

| PC | Model | Why |
| --- | --- | --- |
| NVIDIA GPU with at least 12 GB video memory | Bonsai 2 27B `PQ2_0` (7.2 GB) | Best quality, fastest thinking, 16 s cold / 3 s per new conversation. It needs about 9 GB of video memory at 32K context. |
| NVIDIA GPU with 8–11 GB | Qwen3.5 9B (5.7 GB) | Ties Bonsai 2 with thinking off. It uses 6.2 GB of video memory at 32K context, more than a 6 GB card has, so 6 GB cards use the processor tier. |
| No NVIDIA GPU, 8 GB of RAM or more | Qwen3.5 4B (2.7 GB) | Fastest prompt reading on a CPU and the best cache reuse; 13/14 on the harder tasks with thinking off. |
| Under 8 GB of RAM | Qwen3.5 4B, with a warning | Anything smaller failed tool calls or instructions. |

Not tested yet: AMD and Intel GPUs. The Lenovo has an AMD 780M integrated GPU. PrismML lists open Vulkan problems for Bonsai files, so those PCs should use the CPU tier until tested.

## Using a model on your devices from Sparky

Each device runs `llama-server` with an API key. The host running Sparky adds that device as an OpenClaw llama.cpp provider:

```
openclaw onboard --auth-choice llama-cpp-existing-server --custom-base-url http://<device-tailnet-ip>:<port>/v1 --llama-server-api-key <key> …
```

Only the local half of this was tested: the API key, and OpenClaw reaching a llama-server. Reaching another device needs the server bound to that device's Tailscale address plus a Windows Firewall rule limited to the tailnet. Neither has been set up or tested, and both need the owner's approval.

## Implementation plan

1. **Engine module** (`llama-runtime.cjs`), replacing `local-runtime.cjs` (Ollama):
   - Choose the build: CUDA 12.4 if an NVIDIA driver of 551.78 or newer is present, otherwise CPU.
   - Download the pinned release and check its SHA-256; unpack it under `%LOCALAPPDATA%\Foxsocket\llama`.
   - Download the model from Hugging Face and check its SHA-256, using `download.cjs`, which handled 30 GB of real downloads in this test.
   - Run `llama-server` as a per-user Scheduled Task at sign-in, bound to loopback, with `-c 32768 --jinja -fa on -np 1 --reasoning-format deepseek --api-key <per-install key>` and `-ngl 99` on a GPU.
   - Check `/health`, and send a warm-up request after start.

   **Status (2026-09-29): module written, not yet wired into setup.** `llama-runtime.cjs` has unit tests in `llama-runtime.test.cjs` and was checked once against the real pinned CPU build on the development PC. That check verified the model's checksum, started the server, got "12" for 7 + 5, got 401 without the key or with a wrong key, confirmed it listened on 127.0.0.1 only, and stopped the server cleanly. Differences from the sketch above:
   - **Three tiers:** Bonsai 2 27B at 12 GB or more of video memory, Qwen3.5 9B at 8 GB or more (its measured footprint is 6,191 MiB), and otherwise Qwen3.5 4B on the processor. AMD and Intel GPUs use the processor tier.
   - **Pinned downloads:** Hugging Face files are pinned to a repository revision, not `main`.
   - **Key file:** the key is passed with `--api-key-file`, so it never appears in a process list. The web UI is off (`--no-webui`).
   - **Model alias:** the model is served under a fixed alias. Rennie treats a server as its own only when it accepts this install's key and serves that alias, so another program on port 18080 is never mistaken for it.
   - **Left for step 2:** starting the server from setup and at sign-in (a Scheduled Task), and the install location. The warm-up request is covered in practice by OpenClaw's first reply check.

   **Step 2 (2026-09-29): wired in.** New setups use llama.cpp; a setup already working on Ollama keeps it until step 4.
   - **Install location:** `%LOCALAPPDATA%\Rennie\engine`.
   - **Sign-in task:** a per-user Task Scheduler task, **Rennie model server**, runs `conhost.exe --headless llama-server …` at sign-in, so no window appears. It doesn't restart automatically: a server Rennie stops on purpose stays stopped, and Rennie starts it again whenever it opens.
   - **Stopping:** `stop()` ends only `llama-server.exe` copies running from that folder.
   - **OpenClaw:** OpenClaw gets the pinned `@openclaw/llama-cpp-provider`, is onboarded with `llama-cpp-existing-server`, and receives the key only through `LLAMA_SERVER_API_KEY`. Lean mode is on, and `thinkingDefault` is `medium` for Bonsai 2.
   - **Keys:** only starting the server creates the key; checks and chat never write anything.
   - **Checked on the development PC with the real pinned CPU build:** start, the two reply checks ("7 plus 5 equals 12.", "blue"), direct chat, and stop.
   - **Not run for real yet:** the sign-in task and OpenClaw onboarding against the connector. Both change the Windows account, so they are part of the Lenovo acceptance (#5).
2. **OpenClaw setup:**
   - Install `@openclaw/llama-cpp-provider`.
   - Onboard with `llama-cpp-existing-server`.
   - Set `agents.defaults.experimental.localModelLean true`.
   - For Bonsai 2, set the reasoning effort to `medium`.
3. **Setup UI:** the tier is chosen from the GPU and memory, with the planned download shown up front: 0.6 GB for the CUDA build plus the model.
4. **Tests:** reuse this lab's checks as unit and smoke tests, then run the Lenovo acceptance, especially the AMD and CPU tier and restart behavior.
5. **Signing:** build PrismML llama.cpp from source in CI at a pinned commit, bundle it in the installer, and sign it once SignPath is approved.
6. **Remove Ollama:** only after the Lenovo acceptance passes.

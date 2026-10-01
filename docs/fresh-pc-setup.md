# Setting up your assistant

## What you are setting up

Your assistant runs entirely on this PC. Rennie installs and connects two free programs for you:

- **llama.cpp** runs the AI model on this PC.
- **OpenClaw** is the assistant itself. It uses the model, remembers your conversations and can learn skills.

No API key is required. There are no accounts to create and no commands to type.

## Install

1. Run the Rennie installer. It installs for your Windows account only, asks no questions and needs no administrator permission. Rennie opens when it finishes.
2. On the setup page, Rennie shows how much memory and free space this PC has, and how much setup will download. If there isn't enough free space, it tells you how much to free up **before** anything downloads.
3. Optionally, give your assistant a name. You can skip this.
4. Keep the recommended model, then choose **Set up my assistant**. Rennie recommends one from this PC's hardware:
   - **Ternary Bonsai 2 27B** for NVIDIA graphics cards with 12 GB or more of video memory (about 7.2 GB to download);
   - **Qwen3.5 9B** for NVIDIA graphics cards with 8 GB or more (about 5.7 GB);
   - **Qwen3.5 4B** for every other PC. It runs on the processor (about 2.7 GB).

## What happens next

The progress list shows six steps and marks each one as it finishes:

1. **Check this PC**: memory and free space.
2. **Download the llama.cpp engine**, which runs the AI model.
3. **Download the AI model.**
4. **Start the model and check that it answers.**
5. **Install and set up OpenClaw.** This can take 5–15 minutes. Windows may ask permission to install Node.js, which OpenClaw needs; choose **Yes**.
6. **Get a first reply through OpenClaw.** Your assistant answers a test question. On the processor, this first reply can take several minutes; later replies are quicker.

Then choose **Start a conversation**.

Downloads survive a slow or unstable connection. If the connection pauses, Rennie waits, retries and continues where the download stopped. There is no time limit, so a slow connection just takes longer.

## If something stops

- The step that stopped is marked **Stopped here**, with a plain explanation of what happened and what to do.
- Choose **Resume setup** to continue. Finished steps and finished downloads are kept.
- If the problem is in OpenClaw, choose **Run OpenClaw doctor**. OpenClaw checks itself and lists anything that needs attention. **Let OpenClaw fix what it can** runs OpenClaw's own repair tool; your conversations are kept.
- **Technical details** shows the installer's output. It stays on this PC.
- If you close Rennie during setup, it asks whether to keep going or exit and resume later.

## After a restart

The model starts in the background when you sign in to Windows, with no window. When you reopen Rennie, it checks that the model and OpenClaw are running and starts them if needed. It never downloads or installs anything during that check.

Record any security or SmartScreen message without turning off Windows protection. Don't paste private paths, credentials or unredacted logs into public test reports.

## If OpenClaw is already set up on this PC

Rennie uses your existing OpenClaw setup and doesn't change its settings, its model or your assistant's name.

## Removing Rennie

Uninstalling Rennie removes the model, the engine and the sign-in task. OpenClaw stays, because it's a separate program with your conversations in it.

## Other options

- **Models** has hosted providers (ChatGPT, Claude, Grok). Their API access can be billed separately from a chat subscription.
- **Advanced: OpenClaw in Ubuntu** runs OpenClaw inside Windows Subsystem for Linux. It needs virtualization turned on and may need administrator permission and a restart. Most people don't need it.

Pairing other devices and syncing conversations between them aren't available in this alpha.

## References

- OpenClaw on Windows: https://docs.openclaw.ai/platforms/windows
- llama.cpp (PrismML build): https://github.com/PrismML-Eng/llama.cpp
- Models and their licenses: https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf, https://huggingface.co/unsloth/Qwen3.5-9B-GGUF, https://huggingface.co/unsloth/Qwen3.5-4B-GGUF

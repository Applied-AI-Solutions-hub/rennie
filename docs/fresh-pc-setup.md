# Fresh-PC setup: beginner walkthrough

## What you are setting up

Your assistant runs entirely on this PC. Two free programs do the work, and Foxsocket installs and connects both for you:

- **Ollama** runs the AI model on this PC.
- **OpenClaw** is the assistant itself. It uses the model, remembers your conversations and can learn skills.

No API key is required. There are no accounts to create and no commands to type.

## Install

1. Run the Foxsocket installer. It installs for your Windows account only, asks no questions and needs no administrator permission. Foxsocket opens when it finishes.
2. On the setup page, Foxsocket first shows how much memory and free space this PC has and how much setup will download (about 3.8 GB on a fresh PC). If there is not enough free space, it tells you how much to free up **before** anything downloads.
3. Optionally, give your assistant a name. You can skip this.
4. Keep the recommended model, which Foxsocket picks from this PC's memory, then choose **Set up my assistant**.

## What happens next

The progress list shows six steps and marks each one as it finishes:

1. **Check this PC** — memory and free space.
2. **Install Ollama** — downloaded from its official website, signature checked, installed for your account. Ollama may open its own welcome window; nothing is needed there, so come back to Foxsocket.
3. **Download the AI model** — about 2 GB for the recommended model.
4. **Check that the model answers** — two short test questions.
5. **Install and set up OpenClaw** — this usually takes 5–15 minutes. Windows may ask permission to install Node.js, which OpenClaw needs; choose **Yes**.
6. **Get a first reply through OpenClaw** — your assistant answers a test question.

Then choose **Start a conversation**.

Downloads survive a slow or unstable connection. If the connection pauses, Foxsocket waits, retries and continues where the download stopped. There is no time limit, so a slow connection just takes longer.

## If something stops

- The step that stopped is marked **Stopped here**, with a plain explanation of what happened and what to do.
- Choose **Resume setup** to continue. Finished steps and finished downloads are kept.
- If the problem is in OpenClaw, choose **Run OpenClaw doctor**. OpenClaw checks itself and lists anything that needs attention. **Let OpenClaw fix what it can** runs OpenClaw's own repair tool; your conversations are kept.
- **Technical details** shows the installer's output. It stays on this PC.
- If you close Foxsocket during setup, it asks whether to keep going or exit and resume later.

After Windows restarts, reopen Foxsocket. It checks that Ollama and OpenClaw are running and starts them if needed. It never downloads or installs anything during that check.

Record any security or SmartScreen message without disabling Windows protection. Do not paste private paths, credentials or unredacted logs into public test reports.

## If OpenClaw is already set up on this PC

Foxsocket uses your existing OpenClaw setup and does not change its settings, its model or your assistant's name.

## Other options

- **Models** has hosted providers (ChatGPT, Claude, Grok). Their API access can be billed separately from a chat subscription.
- **Advanced: OpenClaw in Ubuntu** runs OpenClaw inside Windows Subsystem for Linux. It needs virtualization turned on and may need administrator permission and a restart. Most people do not need it.

Client pairing and remote-device conversation sync are not implemented in this alpha.

## References

- OpenClaw on Windows: https://docs.openclaw.ai/platforms/windows
- Ollama Windows requirements: https://docs.ollama.com/windows
- Llama 3.2 models and license: https://ollama.com/library/llama3.2
- What changed in alpha.7 and what is still being tested: docs/openclaw-backbone.md

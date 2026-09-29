# Next build: Host / Client setup

Implement the accepted storyboard around a user who starts with a fresh Windows PC. Product naming must not block the work. See naming.md for the provisional brand configuration.

## Build sequence and completion criteria

1. **Brand foundation (implemented here).** One configuration supplies public product labels; agent and storage identity remain separate. Verify alternate names in the UI and installer configuration.
2. **Local setup record (engine implemented).** Stable device ID, device name, Host/Client role, and resume step are persisted. Installer role seeds fresh setup without overwriting existing choices. A saved role is never reported as a working connection. Guided app screens still need wiring.
3. **Host readiness.** Detect existing OpenClaw configuration and test a real response. Add installation/provider setup for new Hosts separately. Ask users to choose permissions and name their agents. Do not distribute shared credentials.
4. **Private pairing.** Detect Tailscale; offer its official installer if absent. Pair only after authenticated Host approval. Implement expiry, rejection, revocation, and limited application permissions. Do not expose raw OpenRGB or a shell as a general remote interface.
5. **Client conversation.** Route a Client's messages to a selected authorized agent on its Host. Retain local history and drafts. Explain offline Hosts and recover without losing a message or submitting it twice.
6. **Device experience.** Discover capabilities on the owning PC. Put hardware and lighting inside device details. Keep unsupported hardware out of the first-conversation critical path.

## Design target

Welcome → Choose this PC's role → Prepare connection → Approve pairing → Select an existing agent → Conversation workspace. New Host owners branch through provider configuration, agent naming, and permissions. Keep startup, waiting, error, denied, offline, and success states as part of each feature.

Do not implement decorative success screens that claim setup is complete before the real service is verified. iPhone and iPad clients follow once the connection protocol and Windows journey are proven.

## Fresh-PC test

Use an independent test device with no prior OpenClaw or Tailscale configuration to validate the fresh-Host journey. The installer and public setup copy must use the current computer's detected details and the user's chosen name; no test-machine name is baked into the product. Test prerequisite decisions, runtime installation, provider choice, a real reply, close/reopen, restart, and recovery. Test Client pairing separately later.

The installer now includes role selection and a read-only Windows inventory before app installation. It checks OS, architecture, CPU, RAM, system-drive storage, graphics names, virtualization indicators, restart flags, registered WSL distributions, and Windows command/file presence for Node, OpenClaw, and Tailscale. It does not install prerequisites, inspect credentials, start Linux distributions, verify inference, or certify model compatibility. Missing data is displayed as unknown. Native page layout and clean-PC behavior need manual acceptance.

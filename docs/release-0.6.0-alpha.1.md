# 0.6.0-alpha.1 - fresh Host trial

This pre-release replaces the old dashboard with a conversation workspace, generated mascot, Fluent controls, persistent conversations, workspace folders, tasks and device details. Product naming remains provisional: Sidekick and Relay are candidates; labels are centralized in branding.js.

The Windows installer includes an Applied AI Solutions fade-in/fade-out signature, Host/Client role choice and a read-only PC readiness report. Local Host setup continues inside the app with saved steps, detected Linux environments, official installation commands, provider onboarding guidance and actual agent discovery. Commands are copied and run by the user in interactive terminals. Credentials stay in OpenClaw/provider prompts.

Choose Host on the fresh test PC. Complete Ubuntu, OpenClaw and provider setup, choose the detected agent, then send a short message. Verify the reply remains after closing/reopening, and check the background Host again after a Windows restart.

Limits: remote Client pairing and automatic Tailscale provisioning are not implemented. The Windows installer is unsigned. Existing local data IDs are preserved; export a backup before testing an upgrade. This build was verified locally and with simulated missing prerequisites, not yet on the fresh test PC.

Validation: seven setup tests and the Electron workspace smoke suite passed, including offline/draft recovery and three window sizes. NSIS installer compiled successfully. See design-qa.md for visual evidence and limitations.

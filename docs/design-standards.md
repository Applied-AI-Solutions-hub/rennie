# Applied AI desktop design standards

The existing Applied AI mark, architectural artwork, dark surfaces, and cyan accent are the visual foundation. Conversation stays central. Detail must support a real action or explain a real state.

- Spacing: 4, 8, 12, 16, 24, and 32 pixels. Group related controls; give separate tasks more space.
- Type: 16px conversation text; 14px control labels; 12-13px explanations. Use tiny uppercase text only for short decorative labels.
- Surfaces: 10px control corners, 14-16px panels, and 20px composer/dialog corners. Use restrained borders and shadows for hierarchy.
- Color: cyan for primary actions and focus, green for a confirmed connection, amber for unavailable services. Every state also needs text.
- Interaction: clear hover, keyboard focus, pressed, disabled, and busy states. Respect reduced-motion preferences. No endless decorative animation.
- Startup: show the real workspace-loading state, dismiss when saved data loads, and offer retry on failure. Do not fake percentages or delay entry for branding. Gateway checks continue independently.
- Connections: explain the current state, provide a retry action, and preserve access to local tasks and notes while offline.
- Settings: group appearance, opening/closing, and data. Descriptions must match the saved behavior. Closing to tray remains optional.
- Conversation: retain drafts, readable message widths, escaped formatting, clear pending state, and a disabled send button for empty input.

Version 0.5.0 implements these details in finish.css and finish.js, extending the existing desktop UI. Browser previews use simulated services; the packaged application uses real IPC. Automatic service management, accounts, multi-device sync, and a complete startup service orchestrator are future work.

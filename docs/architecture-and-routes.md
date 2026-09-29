# Architecture and routes

Scope: public source at main commit `64da418`, reviewed 2026-09-11. This describes product code, not a maintainer's installed machine. The published Windows prerelease is separately versioned; consult its release notes. Open PRs are not installed functionality.

## Components

| Component | Source | Responsibility |
|---|---|---|
| Electron main process | [main.js](../main.js) | Window lifecycle, persistent workspace state, privileged IPC and chat invocation |
| Renderer bridge | [preload.js](../preload.js) | Exposes the permitted IPC interface |
| Workspace | [workspace.js](../workspace.js), [workspace-main.js](../workspace-main.js) | Conversation workspace and local actions |
| Host management | [host-manager.js](../host-manager.js), [host-main.js](../host-main.js) | WSL inspection and supported preparation operations |
| Setup | [setup.js](../setup.js), [starter-agent.json](../starter-agent.json) | Local setup record and clean starter manifest |
| Release checks | [updates.js](../updates.js), [updates-main.js](../updates-main.js) | GitHub release discovery; does not install updates |
| Optional lighting | [lighting.js](../lighting.js) | Local OpenRGB integration; hardware support must be checked per device |

The desktop renderer is not a public web or remote-control API. Local IPC handlers are implementation interfaces, not network routes. Read the source modules for their current argument contracts rather than using a historical route inventory.

## Agent conversation

Desktop chat invokes the OpenClaw CLI through WSL, using the selected connection and a saved application session key. The existing agent configuration selects the model and tools; a model observed on one developer's PC is not a product default or hardware requirement.

OpenClaw integrations such as Discord can have separate session histories from the desktop. A shared agent identity does not establish synchronized conversations, equal effective tool availability, or application pairing. Tool discovery, authorization and execution need separate evidence.

See [Host status](managed-host.md) and [fresh-PC setup](fresh-pc-setup.md) for implemented boundaries. A clean starter manifest does not provision a working model or copy an owner's personal assistant.

## Local data and lifecycle

Workspace state is saved as `state.json` in Electron's `userData` directory. The existing package/profile identity is retained for compatibility. A source checkout, an installed payload and a user profile are distinct; never overwrite a user's profile while replacing code.

The source refuses to replace unreadable saved state with empty defaults. Backup export exists; confirm the specific release's import/recovery capabilities before relying on them. A chat timeout does not prove upstream work was cancelled, so do not blindly resubmit consequential actions.

Host service startup and application startup are separate. Configuring a task or observing a running service is not proof of cold-boot recovery. Optional lighting needs a separate compatible local OpenRGB server and must not be treated as a prerequisite for conversation.

## Documentation boundary

Keep actual machine inventories, network names, account/session IDs, personal incidents, startup entries, runtime credentials and local deployment paths in private operating records. Public docs describe reproducible product behavior and explicitly scoped test evidence. Historical personal-machine notes have been removed from this page; they are not current product requirements.

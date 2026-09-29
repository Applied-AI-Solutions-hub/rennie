# Free Windows signing and the Lenovo policy block

**Project preference: use free services. No paid signing account, subscription, or billable trial is authorized.** The Azure-specific integration has been removed.

Alpha.6's matching installer was NotSigned and Windows Application Control blocked it before launch. Its setup/chat fixes remain untested on Lenovo.

## Chosen route: SignPath Foundation

[SignPath Foundation](https://signpath.org/) offers free signing for qualifying open-source projects. Foxsocket has an MIT license and an existing public release, making it a candidate; eligibility has not been confirmed, and no application has been submitted.

The [program requirements](https://signpath.org/terms.html) require review before integration:
- Confirm all components qualify, repository ownership, contributor MFA, and the project's verifiable reputation.
- Identify maintainers, reviewers, and release approvers; publish an accurate code signing policy and privacy information.
- Each release needs manual signing approval and verifiable build provenance.
- The Foundation controls the signing identity. Do not claim Applied AI Solutions is the certificate issuer or that SignPath sponsors us before acceptance.
- Upstream binaries cannot simply be re-signed under the project's subscription. Confirm how the modified Electron app, NSIS installer/uninstaller, native libraries, and PowerShell resources will be handled. Bundling permission alone does not establish Windows Application Control compatibility.

Start from the Apply link on the Foundation website. Account setup, terms acceptance, and submission must use the owner's accurate information. No enrollment or acceptance is implied by these repository changes.

## Current build behavior

Development continues independently: use `pnpm dev:fresh` or `pnpm dist:dev`. The owner has selected the Lenovo as a development PC. See [development setup](development.md).

- PR CI compiles with explicit FOXSOCKET_UNSIGNED_VALIDATION=1 and publishes a clearly labelled UNSIGNED-DEVELOPMENT artifact for owner-configured development PCs.
- The trusted-distribution command `pnpm dist` fails with a pending-free-signing message. The explicit `pnpm dist:dev` command works without signing. Old Azure environment settings cannot silently activate a paid provider.
- The manual Windows signed installer workflow is a status-only failure until the free integration is approved and implemented. It contains no signing credentials or upload step.
- Signature verification scripts and the NSIS embedded-uninstaller check remain available for the future integration; they do not mean an installer has been signed.
- After enrollment, integrate the approved SignPath artifact policy and protected release approval, preserve upstream signatures, check each executable against its expected signer, and hash the final signed installer. Record version, commit, signatures, and hashes in BUILD-INFO.json.

If SignPath is unavailable, investigate free Microsoft Store MSIX distribution and compatibility with Foxsocket's backend setup before considering any paid alternative. There is no automatic paid fallback.

## Acceptance still required

Keep Windows protection enabled. Test the signed installer from Explorer on the Lenovo, then clean installation, startup, local model setup/chat, restart, and uninstall. Optional Ubuntu setup and its scripts/dependencies need separate testing. Signing alone does not prove compatibility with every Windows policy.

Each Lenovo iteration requires the user's requested clean install. The previous cleanup was incomplete because the agent's execution policy denied deleting leftover model/cache backups. That separate issue is not fixed by signing. Record the actual baseline and preserve unrelated Sparky data.

Reference: [Microsoft code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).

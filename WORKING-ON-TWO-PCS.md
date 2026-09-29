# Working across development and test PCs

Canonical repository: https://github.com/Applied-AI-Solutions-hub/rennie

Use a separate local Git checkout on each device. Fetch before starting, preserve uncommitted work, and submit scoped changes through a branch and pull request. Do not use cloud-folder synchronization as a substitute for Git merges. Do not automatically commit or push another contributor's work.

Install dependencies with `pnpm install --frozen-lockfile`; use `pnpm start` for development and `pnpm dist` to build a Windows installer. See [Contributing](CONTRIBUTING.md) and [setup guidance](docs/fresh-pc-setup.md).

Test on an explicitly designated test device and profile. Do not replace a personal assistant installation to test product changes without the owner's explicit authorization. Each device needs its own verified configuration; a cloned checkout does not transfer gateway access, credentials, conversation history, hardware settings or application pairing.

Track the source commit, built artifact version, installed version and test results separately. Preserve private user data and recovery backups. Remote/mobile pairing and fresh-PC provisioning remain subject to the limitations in [Host status](docs/managed-host.md).

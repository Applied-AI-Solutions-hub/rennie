# Foxsocket development: no signing account required

The owner has chosen to use the Lenovo as a development PC. Free unsigned builds are supported while public distribution signing is handled separately.

## Lenovo Windows setup

For the reported Smart App Control block, the owner can open **Windows Security → App & browser control → Smart App Control settings** and select **Off** to allow unsigned development software. This changes protection for the device, not just Foxsocket. Keep Microsoft Defender/antivirus and the firewall enabled. Foxsocket never changes this setting.

Microsoft documents this setting and the absence of an individual-app allow list in its [Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions). The ability to turn it back on depends on Windows update level; check the warning displayed on the Lenovo before confirming. If the setting is locked or another managed Application Control policy still blocks execution, record that exact policy instead of assuming this setting resolved it.

This is a development-machine choice. Do not present it as an installation requirement for future customers.

## Test the installer

Download the **Foxsocket-Windows-UNSIGNED-DEVELOPMENT** artifact from the current PR's Windows validation run. Extract it and check version, commit, signature status, and SHA256SUMS before launching. This build installs the real app and can exercise installer behavior; it is not signed or approved for protected consumer PCs.

Use a clean Foxsocket installation for each Lenovo iteration as requested. Preserve unrelated data and record remaining runtime/model caches. The previously incomplete cleanup must not be represented as a pristine Windows baseline.

## Run and change the app from source

With Node.js 24 and pnpm 11.19.0 installed, open the repository checkout and run:

```powershell
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm dev:fresh
```

This launches the real application with new app data under .qa/dev-fresh-* on each run. It does not erase previous profiles. It shares installed runtimes, model caches, and devices with the PC, so it is not a clean installer test.

For a persistent development profile that can test reopening, use **pnpm dev**. It uses .qa/dev-profile instead of the installed app's profile. Do not use pnpm start for isolated testing.

To build the unsigned installer locally, use **pnpm dist:dev**. The output is under release. It requires no certificate, subscription, or approval from a signing provider. Application Control can still block either the installer or Electron on a protected PC.

## What remains separate

Public signed distribution still needs a free signing solution. Tests on the development Lenovo establish development behavior only, not acceptance with Smart App Control enforced.

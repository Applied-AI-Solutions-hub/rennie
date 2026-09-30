# Rennie development: no signing account required

Free unsigned builds are supported for development while public distribution signing (the free SignPath Foundation program, #3) is handled separately. Unsigned builds are for development PCs only; don't present them as ready for customers.

## Smart App Control

Windows' Smart App Control can block unsigned software, and it has no allow list for single apps. Rennie never changes this or any other Windows security setting, and neither should anyone testing it on the owner's behalf. If a build is blocked, record the exact message and stop.

On the development PC (Smart App Control on), an unsigned 0.7.0-alpha.1 development build installed and ran without a block on 2026-09-30. That is one observation, not a guarantee: a blocked build is still possible, and a protected consumer PC needs the signed installer.

Microsoft documents the setting in its [Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions).

## Test the installer

Download the **Rennie-Windows-UNSIGNED-DEVELOPMENT** artifact from the current pull request's Windows validation run. Check the version, commit, signature status and SHA256SUMS before launching. It installs the real app. Follow the [testing guide](testing.md) for what to check and how to report it.

## Run and change the app from source

With Node.js 24 and pnpm 11.19.0 installed, open the repository checkout and run:

```powershell
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm dev:fresh
```

This launches the real application with new app data under .qa/dev-fresh-* on each run. It does not erase previous profiles. It shares installed runtimes, model caches and devices with the PC, so it is not a clean installer test.

For a persistent development profile that can test reopening, use **pnpm dev**. It uses .qa/dev-profile instead of the installed app's profile. Do not use pnpm start for isolated testing.

To build the unsigned installer locally, use **pnpm dist:dev**. The output is under release. electron-builder asks pnpm for the dependency list, so pnpm must be on the PATH: if it isn't installed globally, run `npx pnpm@11.19.0 run dist:dev`. No certificate, subscription or signing approval is needed.

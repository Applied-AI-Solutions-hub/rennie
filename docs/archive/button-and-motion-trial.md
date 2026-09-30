# Button and motion trial — 0.3.1

All runtime assets are bundled locally. The renderer's existing restrictive content security policy remains unchanged; it does not fetch libraries from a CDN.

## What to try

- Switch between Home, Tasks, Sparky and the other pages: Motion supplies a 220ms entrance transition.
- Press a native navigation button or dashboard card: Motion supplies a small press/release effect. Hover borders and shadows use short CSS transitions.
- Choose folder, check the lighting connection, check the gateway, or export a backup: Web Awesome Core buttons show loading state while their existing action runs, prevent repeat activation, and recover after errors.
- Open Settings: the Web Awesome switch controls interface motion. The preference is stored locally on this PC. Windows reduced-motion preference overrides decorative effects.
- Use Settings → Welcome animation → Replay: Anime.js briefly animates the supplied Applied AI logo. It also plays when returning to Home. It is finite and leaves the logo at its original scale and brightness.

## Implementation

`ui-effects.js` owns animation lifecycle and preference handling. Motion animates content/button transforms; Anime.js owns only the brand mark. Active effects are canceled and cleaned up when the interface rerenders, the window is hidden, or reduced motion becomes active. There are no continuous background animations.

`build-ui.mjs` bundles selected imports with esbuild and collects licenses for bundled dependencies into `assets/vendor/THIRD-PARTY-NOTICES.txt`. `pnpm start`, `pnpm package`, and `pnpm dist` build these local assets automatically.

Libraries tested: Motion 13.2.0, Anime.js 4.5.0, Web Awesome Core 3.12.0. Versions and integrity hashes are recorded in `pnpm-lock.yaml`.

Sources: https://github.com/motiondivision/motion ; https://github.com/juliangarnier/anime ; https://github.com/shoelace-style/webawesome

## Verification

An isolated Electron profile was used to check navigation, task creation/completion/deletion, focus timer, command shortcut, Web Awesome busy state with stable button width, repeat-click prevention, recovery after a simulated IPC failure, press-animation cleanup, both animation engines, motion preference, keyboard operation of the switch, and emulated system reduced motion. No renderer console errors or HTTP/HTTPS requests were observed. Layout was checked at 1536×1024 and 1000×720; no horizontal overflow was found.

No Sparky/Discord message or physical lighting change was made during these tests. The folder action was replaced with a delayed test failure in the test process only. The installed app uses its original native folder picker.

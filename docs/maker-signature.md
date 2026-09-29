# Applied AI Solutions installer signature

Future interactive Windows installers using this template open with the existing Applied AI logo and wordmark: approximately 450ms fade in, 900ms hold, 450ms fade out. Clicking dismisses the splash early. Silent installations skip it. There is no audio or invented progress indicator. AdvSplash updates on an approximately 32ms timer, so requested timings are approximate.

The maker signature is independent of the public product name, agent name, and mascot. Sidekick, Relay, or another selected name does not replace Applied AI Solutions in this credit.

Reuse build/maker-splash.nsh and the generated build/applied-ai-maker.bmp across NSIS installers. Insert AppliedAIMakerSplash into an existing customInit macro if one already exists. The current include is build/installer.nsh, discovered by electron-builder.

Artwork comes from assets/canonical-mark.svg and assets/wordmark.svg. The build-only Sharp renderer trims transparent padding, centers the existing artwork, and writes PNG and 24-bit BMP. Run pnpm render:maker; pnpm dist also does this automatically, without requiring an open desktop window. Review build/applied-ai-maker.png after changes. build/maker-splash.html previews the generated image using equivalent CSS timings; native NSIS rendering still needs visual acceptance on Windows.

The browser preview respects reduced motion. Native reduced-motion behavior has not yet been implemented or verified and remains a release check.

This establishes a reusable Windows convention in this repository. It does not retroactively alter published installers or other repositories. macOS and Apple mobile products need platform-appropriate maker treatments; an iPhone/iPad App Store installation cannot use NSIS.

Sources: [NSIS AdvSplash implementation](https://github.com/NSIS-Dev/NSIS/blob/master/Contrib/AdvSplash/advsplash.c), [electron-builder NSIS hooks](https://www.electron.build/nsis.html).

# Next-build design research

Research date: September 10, 2026. Sidekick and Relay remain naming candidates.

The biggest improvement will come from faithfully translating the approved screens into working UI. The repository already includes Motion, Anime.js, and Web Awesome. More libraries alone will not establish layout, typography, or complete interactions.

## Useful tools

| Resource | Use in our app | Recommendation |
| --- | --- | --- |
| [Motion](https://github.com/motiondivision/motion) | Panel transitions and button feedback; supports plain JavaScript | Keep as the main UI animation library. Core is MIT; premium products are separate. |
| [Web Awesome](https://github.com/shoelace-style/webawesome) | Consistent buttons, dialogs, and form controls | Theme its free MIT components to match our design; verify keyboard behavior in the app. |
| [Rive runtimes](https://github.com/rive-app/help-center/blob/master/runtimes/overview.md) | Mascot reactions to listening, thinking, success, and connection trouble | Consider after the workspace is faithful. Official runtimes are MIT and support web and mobile platforms. Finished animation assets and editor terms are separate. |
| [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) | Detect layout and styling regressions | Add once actual implementation screenshots are approved. Keep the test environment consistent because OS, fonts, and rendering affect results. |
| [NSIS AdvSplash](https://github.com/NSIS-Dev/NSIS/blob/master/Contrib/AdvSplash/advsplash.c) | Applied AI logo fade before Windows setup | Use the plugin already bundled with our installer toolchain. |
| [DeepSite on Hugging Face](https://huggingface.co/spaces/enzostvs/deepsite) | Disposable UI experiments | Optional. Its README declares MIT and lists code-generation models. Generated output still requires design review and real desktop integration. |

## Design rules to apply

Microsoft Fluent uses a spacing system based on four pixels. For our app, proposed shared values are 4/8/12/16/24/32/48, with optical corrections for icons and text. Match the approved sidebar, conversation width, composer position, and panel proportions. Collapse the details panel on smaller windows instead of compressing the conversation. [Fluent layout guidance](https://fluent2.microsoft.design/layout)

Fluent recommends purposeful, quick motion, fades for top-level navigation, and a no-motion option. Our proposed defaults are approximately 120ms for button feedback and 180–240ms for menus and panels. These numbers are our starting choices, subject to visual review. The installer logo has its separate brief fade sequence. Avoid delaying usable content to simulate loading. [Fluent motion guidance](https://fluent2.microsoft.design/motion)

Define default, hover, focus, pressed, disabled, busy, and failure states. Preserve typed messages on failure. Connection badges must reflect observed state. Use a restrained cyan accent, readable secondary text, consistent corner sizes, and the existing company artwork.

## Preventing another mismatch between concept and build

1. Convert the approved workspace image into shared dimensions, colors, typography, and spacing variables.
2. Build the working conversation screen, anchored composer, sidebar, and collapsible details panel first.
3. Compare actual screenshots side by side with the concept at the target size, a smaller laptop window, and Windows scaling of 125% and 150%. Correct visible proportion differences before calling it finished.
4. Once the real screen is accepted, save its screenshots as regression baselines. Automated comparison protects the accepted result; it cannot judge whether the initial concept was faithfully implemented.
5. Exercise keyboard navigation, reduced motion, loading, empty, offline, error, and recovery paths. Then test the packaged installer and first launch on the designated test device.

## Implementation boundary

This research proposed integrating the maker splash using the original SVG assets; inspect current source and release evidence for implementation status. Native animation still needs visual acceptance before release. No installer has been installed or published for this research task. Rive, DeepSite, and screenshot regression tests are recommendations, not completed integrations. Host pairing and new onboarding remain upcoming work.

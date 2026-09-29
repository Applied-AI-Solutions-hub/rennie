# GitHub release checks

The desktop app checks the configured GitHub repository each time its process starts and when reopening a running tray instance. Requests run in the main process, time out after 12 seconds and never delay the workspace. Concurrent requests coalesce. Settings > App updates includes manual checking and the result/time; a new-version banner opens the verified repository release page. Checks do not download or execute installers.

Versions use semantic precedence, including prereleases. Preview builds see preview and stable releases; stable builds skip previews. Drafts, invalid tags and releases without an uploaded Windows executable are skipped. A newer local build is never offered a downgrade. Git commits are not installable versions; publish a versioned GitHub release with its installer.

The Rennie repository is public (verified 2026-09-11). Public release checks need no GitHub token. Do not request credentials from public testers for this path. Some historical source includes private-repository credential support; that is not required for Rennie public releases and should not be treated as a setup step.

Missing/expired access, rate limiting, network failure and no installers each have distinct states. None is reported as up to date. Startup checks work offline by failing quietly; saved work remains available. Mobile distribution and remote application pairing remain planned. They are separate from desktop release discovery.

Validation: updates.test.cjs covers semantic comparison, release filtering, link origin, auth/offline/rate failures, downgrade prevention, concurrent checks, token non-disclosure and timeouts. updates-smoke.cjs verifies a real Electron launch triggers one check and displays the update notice/settings/manual recheck/error states.

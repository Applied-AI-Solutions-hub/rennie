// PR builds compile only. Installers for people must use a verified publisher.
module.exports = function windowsSigning(env) {
  if (env.FOXSOCKET_UNSIGNED_VALIDATION === '1') {
    if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME !== 'pull_request') {
      throw new Error('Unsigned CI packaging is only permitted for pull_request validation.');
    }
    return { forceCodeSigning: false, signExecutable: false };
  }
  // Free signing is the chosen route. Do not silently fall back to a paid provider.
  // SignPath enrollment and artifact-policy approval must precede integration.
  throw new Error('Free Windows signing is pending SignPath Foundation approval and integration. See docs/windows-signing.md. No distributable installer will be built.');
};

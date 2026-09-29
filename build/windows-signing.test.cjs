const { test } = require('node:test');
const assert = require('node:assert/strict');
const signing = require('./windows-signing.cjs');

test('distribution remains blocked until free signing is integrated', () => {
  assert.throws(() => signing({}), /pending SignPath Foundation approval and integration/);
});
test('legacy Azure configuration cannot silently select a paid service', () => {
  assert.throws(() => signing({ WINDOWS_SIGNING_PUBLISHER: 'Example', AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/', AZURE_SIGNING_PROFILE: 'public-trust', AZURE_SIGNING_ACCOUNT: 'example' }), /Free Windows signing is pending/);
});
test('unsigned validation cannot be enabled in a dispatched CI release', () => {
  assert.throws(() => signing({ FOXSOCKET_UNSIGNED_VALIDATION: '1', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch' }), /only permitted/);
  assert.equal(signing({ FOXSOCKET_UNSIGNED_VALIDATION: '1', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request' }).signExecutable, false);
});

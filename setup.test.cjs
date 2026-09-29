const { test } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('./setup');

test('installer role seeds a fresh setup without overwriting existing choices', () => {
  const fresh = setup.fromInstaller(null, { role: 'host' });
  assert.equal(fresh.role, 'host');
  assert.equal(fresh.step, 'requirements');
  assert.equal(setup.fromInstaller(fresh, { role: 'client' }), fresh);
  assert.equal(setup.fromInstaller(null, { role: 'unknown' }).role, null);
});

test('device identity and resume choices survive serialization and role changes', () => {
  const initial = setup.record(null, 'Lenovo');
  const saved = setup.update(initial, { role: 'host', deviceName: 'My Lenovo', agentName: 'Nova', step: 'provider' });
  const reopened = setup.record(JSON.parse(JSON.stringify(saved)));
  assert.equal(reopened.deviceId, initial.deviceId);
  assert.equal(reopened.step, 'provider');
  const client = setup.update(reopened, { role: 'client' });
  assert.equal(client.step, 'requirements');
  assert.equal(client.agentName, 'Nova');
});
test('renderer cannot supply readiness, change device identity, or store credentials', () => {
  for (const key of ['ready', 'deviceId', 'token', 'apiKey']) {
    assert.throws(() => setup.update(null, { [key]: 'anything' }));
  }
  assert.throws(() => setup.update(null, { role: 'administrator' }));
  assert.throws(() => setup.update(null, { role: 'constructor' }));
  assert.throws(() => setup.update(null, { deviceName: '  ' }));
  assert.throws(() => setup.update(null, { role: 'client', step: 'provider' }));
  assert.throws(() => setup.record({ schemaVersion: 99 }));
});
test('fresh Windows PC reports missing prerequisites without executing installers', async () => {
  const calls = [];
  const result = await setup.inspect({ platform: 'win32', env: {}, exists: () => false, execute: async (exe, args) => {
    calls.push([exe, args]); return { ok: false, reason: 'unavailable' };
  } });
  assert.equal(result.tailscale.status, 'not-installed');
  assert.deepEqual(result.wsl.distributions, []);
  assert.equal(result.readiness, 'not-verified');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([exe, args]) => exe === 'where.exe' || (exe === 'wsl.exe' && args[0] === '--list')));
});
test('discovery reports sign-in separately and excludes private network output', async () => {
  const result = await setup.inspect({ platform: 'win32', env: {}, exists: () => true, execute: async (exe, args) => {
    if (exe.endsWith('tailscale.exe')) return { ok: true, output: JSON.stringify({ BackendState: 'NeedsLogin', AuthURL: 'private-login-url', Peer: { private: 'private-peer' } }) };
    if (exe === 'where.exe') return { ok: true, output: 'C:\\private-path\\openclaw.cmd' };
    return { ok: true, output: args.includes('--running') ? '' : 'Ubuntu-24.04\r\nOpenClawGateway\r\n' };
  } });
  assert.equal(result.tailscale.status, 'sign-in-required');
  assert.equal(result.wsl.distributions.length, 2);
  assert.ok(result.wsl.distributions.every(x => !x.running));
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('gateway reachability never substitutes for an inference test', async () => {
  const execute = async (exe, args) => {
    if (args.includes('--list')) return { ok: true, output: 'OpenClawGateway\r\n' };
    if (args.includes('--version')) return { ok: true, output: 'OpenClaw 2026.9.10' };
    return { ok: true, output: 'CLI notice\n{"ok":true,"secret":"not-for-renderer"}' };
  };
  const result = await setup.inspectWslHost('OpenClawGateway', { execute });
  assert.equal(result.gateway, 'reachable');
  assert.equal(result.inference, 'not-tested');
  assert.equal(result.ready, false);
  assert.ok(!JSON.stringify(result).includes('not-for-renderer'));
  await assert.rejects(() => setup.inspectWslHost('not-installed', { execute }));
});
test('malformed health output produces recoverable unavailable status', async () => {
  const execute = async (exe, args) => ({ ok: true, output: args.includes('--list') ? 'Ubuntu-24.04' : args.includes('--version') ? '2026.9.10' : 'not json' });
  const result = await setup.inspectWslHost('Ubuntu-24.04', { execute });
  assert.equal(result.gateway, 'unavailable');
  assert.equal(result.ready, false);
});

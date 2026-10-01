// Local onboarding data and read-only prerequisites. No install scripts or credentials.
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const {clawArgs}=require('./host-manager');

const steps = {
  host: ['role', 'requirements', 'runtime', 'provider', 'agent', 'service', 'conversation'],
  client: ['role', 'requirements', 'network', 'pairing', 'conversation']
};
const links = Object.freeze({
  openclaw: 'https://docs.openclaw.ai/platforms/windows',
  onboarding: 'https://docs.openclaw.ai/start/wizard',
  tailscale: 'https://tailscale.com/docs/install/windows'
});
function record(previous, deviceName = os.hostname()) {
  if (previous && previous.schemaVersion !== 1) throw Error('This setup record needs a newer app version.');
  return previous || {
    schemaVersion: 1, deviceId: crypto.randomUUID(), deviceName,
    role: null, step: 'role', agentName: 'Rennie', updatedAt: Date.now()
  };
}
function update(previous, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('Invalid setup choices.');
  const next = { ...record(previous) };
  for (const key of Object.keys(patch)) {
    if (!['role', 'step', 'deviceName', 'agentName'].includes(key)) throw Error('That setup field cannot be changed.');
  }
  if ('role' in patch) {
    if (typeof patch.role !== 'string' || !Object.hasOwn(steps, patch.role)) throw Error('Choose Host or Client.');
    if (patch.role !== next.role) next.step = 'requirements';
    next.role = patch.role;
  }
  for (const key of ['deviceName', 'agentName']) {
    if (!(key in patch)) continue;
    if (typeof patch[key] !== 'string' || !patch[key].trim() || patch[key].trim().length > 64 || /[\u0000-\u001f\u007f]/.test(patch[key])) {
      throw Error('Enter a name between 1 and 64 characters.');
    }
    next[key] = patch[key].trim();
  }
  if ('step' in patch) {
    if (!(steps[next.role] || ['role']).includes(patch.step)) throw Error('Unknown setup step.');
    next.step = patch.step;
  }
  next.updatedAt = Date.now();
  return next;
}
function fromInstaller(previous, choices) {
  if (previous) return record(previous);
  const initial = record(null);
  return ['host', 'client'].includes(choices?.role) ? update(initial, { role: choices.role }) : initial;
}
function run(exe, args, { encoding = 'utf8', timeout = 8000 } = {}) {
  return new Promise(resolve => {
    execFile(exe, args, { windowsHide: true, shell: false, timeout, maxBuffer: 512 * 1024, encoding }, (error, stdout) => {
      // Raw stderr can contain paths, credentials, and CLI diagnostics. Keep it out of reports.
      resolve({ ok: !error, output: error ? '' : String(stdout || ''), reason: error ? (error.killed ? 'timeout' : 'unavailable') : null });
    });
  });
}
function distroNames(result) {
  return result.ok ? result.output.replace(/\0/g, '').split(/\r?\n/).map(x => x.trim()).filter(Boolean) : [];
}
function version(result) {
  return result.ok ? result.output.match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0] || null : null;
}
async function inspect({ execute = run, exists = fs.existsSync, env = process.env, platform = process.platform } = {}) {
  if (platform !== 'win32') return { platform, checkedAt: Date.now(), supported: false, readiness: 'not-verified' };
  const ts = path.join(env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
  const [installed, running, native, network] = await Promise.all([
    execute('wsl.exe', ['--list', '--quiet'], { encoding: 'utf16le' }),
    execute('wsl.exe', ['--list', '--running', '--quiet'], { encoding: 'utf16le' }),
    execute('where.exe', ['openclaw']),
    exists(ts) ? execute(ts, ['status', '--json']) : Promise.resolve({ ok: false, reason: 'not-installed' })
  ]);
  let networkState = network.reason === 'not-installed' ? 'not-installed' : 'unavailable';
  if (network.ok) {
    try {
      const status = JSON.parse(network.output);
      networkState = status.BackendState === 'Running' ? 'connected' : status.BackendState === 'NeedsLogin' ? 'sign-in-required' : 'not-connected';
    } catch { networkState = 'unavailable'; }
  }
  const active = new Set(distroNames(running));
  // Listing distros does not start them. Discovery never starts an arbitrary Linux distro.
  return {
    platform, supported: true, checkedAt: Date.now(), readiness: 'not-verified',
    wsl: { status: installed.ok ? 'available' : 'unavailable', distributions: distroNames(installed).map(name => ({ name, running: active.has(name) })) },
    openclaw: { nativeCommandFound: native.ok && !!native.output.trim(), status: 'not-verified' },
    tailscale: { status: networkState, requiredForLocalHost: false }
  };
}
async function inspectWslHost(distro, options = {}) {
  const execute = options.execute || run;
  if (typeof distro !== 'string' || distro.length > 100 || /[\u0000-\u001f]/.test(distro)) throw Error('Choose an installed Linux environment.');
  const installed = distroNames(await execute('wsl.exe', ['--list', '--quiet'], { encoding: 'utf16le' }));
  if (!installed.includes(distro)) throw Error('That Linux environment is not installed.');
  const runtime = await execute('wsl.exe', clawArgs(distro, ['--version']));
  if (!version(runtime)) return { distro, runtime: 'unavailable', gateway: 'not-checked', inference: 'not-tested', ready: false };
  const health = await execute('wsl.exe', clawArgs(distro, ['health', '--json']));
  let gateway = 'unavailable';
  if (health.ok) {
    try {
      const start = health.output.indexOf('{');
      const result = JSON.parse(health.output.slice(start));
      gateway = result.ok === true ? 'reachable' : 'unavailable';
    } catch { gateway = 'unavailable'; }
  }
  // A healthy gateway is not evidence of provider access or a real assistant reply.
  return { distro, version: version(runtime), runtime: 'installed', gateway, inference: 'not-tested', ready: false };
}
module.exports = { record, fromInstaller, update, inspect, inspectWslHost, links, steps };

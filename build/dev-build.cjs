const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
console.log('Building an UNSIGNED DEVELOPMENT installer. Windows Application Control may block it.');
console.log('No signing account is required and no Windows security settings are changed.');
const env = { ...process.env, FOXSOCKET_UNSIGNED_VALIDATION: '1' };
for (const args of [
  ['build-ui.mjs'],
  ['build/render-maker.cjs'],
  [require.resolve('electron-builder/cli.js'), '--config', 'electron-builder.cjs', '--win', 'nsis', '--publish', 'never'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { files } = require('../../package.json').build;
const src = path.join(__dirname, '..', '..', 'src');
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
// Everything under src/ ships (package.json build.files), so src/ itself must hold only live files.
const list = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(dir, e.name)) : [path.relative(src, path.join(dir, e.name)).replace(/\\/g, '/')]);

test('the installer ships src/ and only the repository files the app reads at run time', () => {
  assert.ok(files.includes('src/**/*'));
  assert.deepEqual(files.filter(f => !f.startsWith('src/') && !f.startsWith('!src/')).sort(), ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'build/host-startup.ps1', 'docs/fresh-pc-setup.md']);
});

test('every stylesheet in src/ is one index.html links', () => {
  for (const file of list(src).filter(f => f.endsWith('.css'))) assert.ok(html.includes(`href="${file}"`), `${file} ships but is never loaded`);
});

test('retired shell files stay out of src/', () => {
  for (const file of ['app.js', 'style.css', 'polish.css', 'finish.css', 'finish.js']) assert.ok(!fs.existsSync(path.join(src, file)), `${file} is dead code and must not ship`);
});

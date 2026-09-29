const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { files } = require('./package.json').build;
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('installer ships only the stylesheets index.html links', () => {
  for (const file of files.filter(f => f.endsWith('.css'))) assert.ok(html.includes(`href="${file}"`), `${file} is packaged but never loaded`);
});

test('retired shell files stay out of the installer', () => {
  for (const file of ['app.js', 'style.css', 'polish.css', 'finish.css', 'finish.js']) assert.ok(!files.includes(file), `${file} is dead code and must not ship`);
});

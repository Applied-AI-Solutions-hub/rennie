const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const pkg = require('./package.json');

// build-ui.mjs inlines everything ui-effects.js imports, so those libraries must not ship in app.asar.
test('bundle-time UI libraries are devDependencies, not packaged runtime dependencies', () => {
  const source = readFileSync(`${__dirname}/ui-effects.js`, 'utf8');
  const specifiers = [...source.matchAll(/^import (?:.+? from )?'([^'.][^']*)'/gm)].map(match => match[1]);
  const names = new Set(specifiers.map(spec => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/')));
  assert.ok(names.size > 0);
  for (const name of names) {
    assert.ok(Object.hasOwn(pkg.devDependencies, name), `${name} must be a devDependency`);
    assert.ok(!Object.hasOwn(pkg.dependencies ?? {}, name), `${name} is bundled by esbuild and must not be a dependency`);
  }
});

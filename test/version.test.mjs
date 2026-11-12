import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A release bumps the version in package.json and src/engine.js and names the changelog's section for it by hand,
// so a test keeps the three in step: a missed one fails here and not in the dist that ships.

const read = (path)=> readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('package.json, engineVersion and the newest changelog section name the same version', () =>
{
    const version = JSON.parse(read('package.json')).version;
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(read('src/engine.js').match(/const engineVersion = '([^']+)'/)?.[1], version, 'engineVersion');
    assert.equal(read('CHANGELOG.md').match(/^## (\d+\.\d+\.\d+) - \d{4}-\d\d-\d\d$/m)?.[1], version,
        'the newest dated section of CHANGELOG.md');
});

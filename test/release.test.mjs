import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The release build defines ASSERT and LOG as empty functions, but a call's arguments are still
// evaluated before the call, so a release build would pay for every isVector3, isValid and message
// string in the engine. The build guards each call with false&& so nothing runs and the minifier
// drops it. This checks that no unguarded call survived.

const release = readFileSync(new URL('../dist/littlejs.release.js', import.meta.url), 'utf8');

test('the release build guards every ASSERT and LOG call so their arguments are never evaluated', () =>
{
    const live = (name)=> (release.match(new RegExp(`(?<!false&&)(?<!function )\\b${name}\\(`, 'g')) || []).length;
    assert.equal(live('ASSERT'), 0, 'ASSERT calls with live arguments');
    assert.equal(live('ASSERT_VECTOR3_VALID'), 0, 'assert helper calls left in, they are empty but still calls');
    assert.equal(live('LOG'), 0, 'LOG calls with live arguments');
    assert.ok(release.includes('false&&ASSERT('), 'the guard is present, so the regex is checking the right thing');
});

test('the release build still defines ASSERT and LOG as empty functions for anything that calls them', () =>
{
    assert.match(release, /function ASSERT\s*\(\)\s*\{\}/);
    assert.match(release, /function LOG\s*\(\)\s*\{\}/);
});

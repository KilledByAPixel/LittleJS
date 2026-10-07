import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The script build puts the engine's top level names beside the game's, so a helper of its own a game could name the
// same is kept inside what uses it: a game's own colorHex, a common name, is not a redeclaration

test('a game declares its own colorHex beside the script build, and a color still writes its hex', () =>
{
    const { run } = loadEngine();
    run('const colorHex = (c)=> "game " + c;');
    assert.equal(run('colorHex(1)'), 'game 1');
    assert.equal(run('rgb(1, .5, 0, .2).toString()'), '#ff800033');
    assert.equal(run('rgb(0, 1/255, 1).toString(false)'), '#0001ff');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// An assert that fails throws an error that says what went wrong: its message and the values given with it, where it
// threw a bare 'Assert failed!' and left the message in the console, so the example browser's error box, a game's
// error overlay or a test only saw that.

const { run } = loadEngine();
run('console.assert = ()=> {}'); // the console's copy is not what is under test
const thrown = (code)=> run(`(()=> { try { ${code} } catch (e) { return e.message; } })()`);

test('the error carries the message and the values given', ()=>
{
    assert.equal(thrown(`ASSERT(false, 'tile: size must be above 0', 5)`), 'Assert failed: tile: size must be above 0 5');
    assert.match(thrown(`ASSERT(false, 'pos must be a vec2', vec2(1, 2))`), /^Assert failed: pos must be a vec2 \(.*1.*2.*\)$/);
    assert.equal(thrown(`ASSERT(false, 'a plain object', {a: 1})`), 'Assert failed: a plain object {"a":1}');
});

test('an assert with no message keeps the old text, and one that passes throws nothing', ()=>
{
    assert.equal(thrown('ASSERT(false)'), 'Assert failed!');
    assert.equal(thrown('ASSERT(true, "fine")'), undefined);
});

test('a real mistake shows its message where the error is caught', ()=>
{
    assert.match(thrown('vec2(0).add(1)'), /^Assert failed: .+/);
});

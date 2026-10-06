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

test('no assert in the engine or its plugins is left without a message', async ()=>
{
    const { readFileSync, readdirSync } = await import('node:fs');
    const files = [...readdirSync('src').map((f)=> 'src/' + f), ...readdirSync('plugins').map((f)=> 'plugins/' + f)]
        .filter((f)=> f.endsWith('.js'));
    const bare = [];
    for (const file of files)
    {
        // an ASSERT( whose whole call has no comma outside its brackets is one argument, the condition alone
        const text = readFileSync(file, 'utf8');
        for (let at = text.indexOf('ASSERT('); at >= 0; at = text.indexOf('ASSERT(', at + 1))
        {
            if (/function\s+$/.test(text.slice(Math.max(0, at - 9), at))) continue; // the definition
            let depth = 0, comma = false, i = at + 6;
            for (; i < text.length; ++i)
            {
                const c = text[i];
                if (c === '(' || c === '[' || c === '{') ++depth;
                else if (c === ')' || c === ']' || c === '}') { if (!--depth) break; }
                else if (c === ',' && depth === 1) { comma = true; break; }
            }
            comma || bare.push(file + ':' + text.slice(0, at).split('\n').length);
        }
    }
    assert.deepEqual(bare, []);
});

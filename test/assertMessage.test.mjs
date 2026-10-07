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

test('common mistakes say what to do', ()=>
{
    const said = (code)=> thrown(code) ?? '';
    assert.match(said('keyIsDown(65)'), /keyIsDown: keyboard keys are codes like 'KeyA'/);
    assert.match(said(`mouseIsDown('left')`), /mouseIsDown: button is 0 \(left\)/);
    assert.match(said(`vec2('1', '2')`), /vec2: x and y must be numbers/);
    assert.match(said('vec2(1).add(1)'), /vec2: x and y must be numbers/);
    assert.match(said('setGravity(-.01)'), /setGravity: newGravity is a vec2, like vec2\(0, -\.01\)/);
    assert.match(said('setCanvasFixedSize(1280, 720)'), /setCanvasFixedSize: size is a vec2/);
    assert.match(said(`new Timer('5')`), /Timer: time must be a number of seconds/);
    assert.match(said(`new Color().setHex('#12')`), /setHex: use #rgb/);
    assert.match(said('drawText("hi", vec2(), vec2(1))'), /drawText: size is a number/);
    assert.match(said('new ParticleEmitter(vec2(), 0, 1, 0, 100, PI, undefined, 5)'),
        /ParticleEmitter: an argument is not a color, they may be out of order; its name and value: colorStartA/);
    assert.match(said('RED.a = .5'), /engine constants like RED can not be changed, change a copy/);
});

test('a color given as 0 to 255 warns once in a debug build', ()=>
{
    const warnings = [];
    const { run: runWarn } = loadEngine({ console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    runWarn('rgb(255, 0, 0); hsl(.5, 100, 50); rgb(1.5, 1, 1)');
    assert.equal(warnings.length, 1, warnings.join(' | '));
    assert.match(warnings[0], /0 to 1 here, not 0 to 255/);
});

test('a value given with an assert is kept short, an object of a class is named by it, and none can break the message', ()=>
{
    const big = thrown(`ASSERT(false, 'a level', {objects: [...Array(1000)].map((_, i)=> ({id: i, pos: [i, i]}))})`);
    assert.ok(big.length < 300, 'a big plain object cut short: ' + big.length);
    assert.match(big, /…$/);
    assert.equal(thrown(`ASSERT(false, 'an object', new (class Thing {}))`), 'Assert failed: an object [Thing]');
    assert.match(thrown(`ASSERT(false, 'no prototype', Object.create(null))`), /^Assert failed: no prototype /);
});

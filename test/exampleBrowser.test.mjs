import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The example browser loads an example's file when it is selected. A file that arrives after another example was
// selected is not shown: the example selected last is the one that shows, whatever order the files come in.
// The browser's own loadFile runs here, with the network and the page in its place.

const source = readFileSync(new URL('../examples/shorts.js', import.meta.url), 'utf8');
const start = source.indexOf('let loadFileCount'), end = source.indexOf('\nfunction stepExample(', start);
assert.ok(start >= 0 && end > start, 'loadFile is where the test looks for it');

function load()
{
    const pending = new Map, loaded = [], errors = [];
    const context = vm.createContext({
        codeMirror: undefined, textareaCode: {value: '', disabled: false},
        codeIsJS: true, inputTimeout: undefined, clearTimeout() {},
        setFrameControlsEnabled(value) { context.controlsEnabled = value; },
        setCode(text, filename) { loaded.push({text, filename}); },
        setErrorMessage(message) { errors.push(message); },
        fetch(filename) { return new Promise((resolve)=> pending.set(filename, resolve)); },
    });
    vm.runInContext(source.slice(start, end), context);
    const respond = (name, text, ok=true)=> pending.get(name)({ok, async text() { return text; }});
    return {context, loaded, errors, respond};
}

test('of two examples selected one after the other, the second shows, though the first arrives last', async ()=>
{
    const {context, loaded, respond} = load();
    const a = context.loadFile('shorts/first.js', false), b = context.loadFile('shorts/second.js', false);
    respond('shorts/second.js', 'SECOND'); await b;
    respond('shorts/first.js', 'FIRST'); await a;
    assert.deepEqual(loaded.map((x)=> x.text), ['SECOND']);
    assert.equal(context.textareaCode.value, 'SECOND');
});

test('a short still loading when a large example is selected does not take its place', async ()=>
{
    const {context, loaded, respond} = load();
    const slow = context.loadFile('shorts/slow.js', false);
    await context.loadFile('platformer/index.html', true);
    respond('shorts/slow.js', 'SLOW SHORT'); await slow;
    assert.deepEqual(loaded.map((x)=> x.filename), ['platformer/index.html']);
    assert.deepEqual([context.textareaCode.disabled, context.controlsEnabled], [true, false]);
});

test('a file that fails to load after another example was selected shows no error', async ()=>
{
    const {context, errors, respond} = load();
    const a = context.loadFile('shorts/gone.js', false), b = context.loadFile('shorts/second.js', false);
    respond('shorts/second.js', 'SECOND'); await b;
    respond('shorts/gone.js', '', false); await a;
    assert.deepEqual(errors, []);
});

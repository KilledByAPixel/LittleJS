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
    const exampleInfoBox = {innerHTML: 'OLD', style: {display: 'block'}, scrollTop: 50};
    const context = vm.createContext({
        exampleInfoBox,
        codeMirror: undefined, textareaCode: {value: '', disabled: false},
        codeIsJS: true, inputTimeout: undefined, clearTimeout() {},
        setFrameControlsEnabled(value) { context.controlsEnabled = value; },
        setCode(text, filename) { loaded.push({text, filename}); },
        setErrorMessage(message) { errors.push(message); },
        fetch(filename) { return new Promise((resolve)=> pending.set(filename, resolve)); },
    });
    vm.runInContext(source.slice(start, end), context);
    const respond = (name, text, ok=true)=> pending.get(name)({ok, async text() { return text; }});
    return {context, loaded, errors, respond, exampleInfoBox};
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

// A short ends with its write-up, a block comment that starts with the line /* info. The browser takes it off the
// code it shows and runs, and shows it in a box of its own, its markdown turned into html.

test('a short is split into its code and the info block that ends it', ()=>
{
    const {context} = load();
    const split = (text)=> ({...context.splitExampleInfo(text)});
    assert.deepEqual(split('let a;\n\n/* info\nHello\n\n## More\n*/\n'),
        {code: 'let a;\n', info: 'Hello\n\n## More'});
    assert.deepEqual(split('let a;\r\n\r\n/* info\r\nHello\r\nthere\r\n*/\r\n'),
        {code: 'let a;\n', info: 'Hello\nthere'}, 'CRLF');
    assert.deepEqual(split('let a;\n'), {code: 'let a;\n', info: ''}, 'no block');
    const notLast = 'let a;\n/* info\nHello\n*/\nlet b;\n';
    assert.deepEqual(split(notLast), {code: notLast, info: ''}, 'a block that is not last is left alone');
    const other = 'let a; /* info about a */\n';
    assert.deepEqual(split(other), {code: other, info: ''}, 'only a line that is exactly the marker counts');
});

test('the info markdown becomes html', ()=>
{
    const {context} = load();
    const render = context.renderExampleInfo;
    assert.equal(render('One\ntwo\n\nThree'), '<p>One two</p><p>Three</p>');
    assert.equal(render('# A\n## B\n### C'), '<h2>A</h2><h3>B</h3><h4>C</h4>');
    assert.equal(render('- one\n  more\n- two\n\nAfter'), '<ul><li>one more</li><li>two</li></ul><p>After</p>',
        'an indented line goes on with the item above it');
    assert.equal(render('1. one\n2. two'), '<ol><li>one</li><li>two</li></ol>');
    assert.equal(render('Text\n- item'), '<p>Text</p><ul><li>item</li></ul>');
    assert.equal(render('a `x*2` and `y*3` b'), '<p>a <code>x*2</code> and <code>y*3</code> b</p>',
        'a star inside code is not italic');
    assert.equal(render('**bold** and *it*'), '<p><b>bold</b> and <i>it</i></p>');
    assert.equal(render('```\nif (a < b)\n    c();\n\n*x*\n```\nAfter'),
        '<pre>if (a &lt; b)\n    c();\n\n*x*</pre><p>After</p>');
    assert.equal(render('[docs](https://x.com/a?b=1) [short](?example=Shapes)'),
        '<p><a href="https://x.com/a?b=1" target="_blank" rel="noopener">docs</a> ' +
        '<a href="?example=Shapes" target="_blank" rel="noopener">short</a></p>');
});

test('info text can not add markup or a script link', ()=>
{
    const {context} = load();
    const render = context.renderExampleInfo;
    assert.equal(render('<script>alert(1)</script> & "q"'),
        '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</p>');
    assert.equal(render('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
    assert.equal(render('`<b>`'), '<p><code>&lt;b&gt;</code></p>');
});

test('a short shows its code without the info block, and the box shows the info', async ()=>
{
    const {context, loaded, respond, exampleInfoBox} = load();
    const a = context.loadFile('shorts/a.js', false);
    respond('shorts/a.js', 'let a;\n\n/* info\nHello\n*/\n'); await a;
    assert.deepEqual(loaded.map((x)=> x.text), ['let a;\n']);
    assert.equal(context.textareaCode.value, 'let a;\n');
    assert.deepEqual([exampleInfoBox.innerHTML, exampleInfoBox.style.display, exampleInfoBox.scrollTop],
        ['<p>Hello</p>', 'block', 0]);

    const b = context.loadFile('shorts/b.js', false);
    respond('shorts/b.js', 'let b;\n'); await b;
    assert.deepEqual([exampleInfoBox.innerHTML, exampleInfoBox.style.display], ['', 'none'], 'no block, no box');
});

test('a short that fails to load does not keep the info of the one before it', async ()=>
{
    const {context, errors, respond, exampleInfoBox} = load();
    const a = context.loadFile('shorts/a.js', false);
    respond('shorts/a.js', 'let a;\n/* info\nHello\n*/\n'); await a;
    const gone = context.loadFile('shorts/gone.js', false);
    respond('shorts/gone.js', '', false); await gone;
    assert.equal(errors.length, 1);
    assert.deepEqual([exampleInfoBox.innerHTML, exampleInfoBox.style.display], ['', 'none']);
});

test('a full example hides the info box of the short before it', async ()=>
{
    const {context, respond, exampleInfoBox} = load();
    const a = context.loadFile('shorts/a.js', false);
    respond('shorts/a.js', 'let a;\n/* info\nHello\n*/\n'); await a;
    await context.loadFile('platformer/index.html', true);
    assert.deepEqual([exampleInfoBox.innerHTML, exampleInfoBox.style.display], ['', 'none']);
});

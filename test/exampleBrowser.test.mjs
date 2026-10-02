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
    const exampleInfoBox = {innerHTML: 'OLD', scrollTop: 50};
    const context = vm.createContext({
        exampleInfoBox, exampleList: [],
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
    assert.equal(render('(*it*) and a*b times c*d, 2*3*4, 2 * 3 * 4'),
        '<p>(<i>it</i>) and a*b times c*d, 2*3*4, 2 * 3 * 4</p>', 'a star in the middle of words or sums is a star');
    assert.equal(render('```\nif (a < b)\n    c();\n\n*x*\n```\nAfter'),
        '<pre>if (a &lt; b)\n    c();\n\n*x*</pre><p>After</p>');
    assert.equal(render('[docs](https://x.com/a?b=1) [short](?example=Shapes)'),
        '<p><a href="https://x.com/a?b=1" target="_blank" rel="noopener">docs</a> ' +
        '<a href="?example=Shapes">short</a></p>', 'a link to another example stays in the page');
});

test('in See also an example name links to the example, the longest name first, and nowhere else', ()=>
{
    const {context} = load();
    const names = ['Tile Layer', 'Box2D Tile Layer', 'Texture', 'Texture Sheet'];
    const html = context.renderExampleInfo(
        'Tile Layer is above.\n\n## See also\nBox2D Tile Layer and Tile Layer, Texture Sheet and `Texture`.', names);
    assert.equal(html, '<p>Tile Layer is above.</p><h3>See also</h3><p>' +
        '<a href="?example=Box2D%20Tile%20Layer">Box2D Tile Layer</a> and <a href="?example=Tile%20Layer">Tile Layer</a>, ' +
        '<a href="?example=Texture%20Sheet">Texture Sheet</a> and <code>Texture</code>.</p>');
});

test('engine names in code link to their docs entry', ()=>
{
    const {context} = load();
    const docs = context.buildDocsLinks([
        {n: 'drawTile', k: 'function', p: 'Draw.html', a: 'drawTile', ns: 'Draw'},
        {n: 'drawTile', k: 'function', p: 'TileLayers.TileLayer.html', a: 'drawTile', ns: 'TileLayers'},
        {n: 'Light3D', k: 'class', p: 'Render3D.Light3D.html', a: '', ns: 'Render3D'},
        {n: 'pos', k: 'member', p: 'Engine.EngineObject.html', a: 'pos', ns: 'Engine'},
        {n: 'pos', k: 'member', p: 'Draw.TileInfo.html', a: 'pos', ns: 'Draw'},
        {n: 'pick', k: 'function', p: 'Render3D.Render3DPlugin.html', a: 'pick', ns: 'Render3D'},
        {n: 'render3D', k: 'constant', p: 'Render3D.html', a: 'render3D', ns: 'Render3D'},
        {n: 'Draw', k: 'namespace', p: 'Draw.html', a: '', ns: 'Draw'},
    ]);
    assert.deepEqual(Object.fromEntries(docs), {
        drawTile: '../docs/Draw.html#drawTile', Light3D: '../docs/Render3D.Light3D.html',
        pick: '../docs/Render3D.Render3DPlugin.html#pick', render3D: '../docs/Render3D.html#render3D'},
        'a name two classes share is not linked, and the one a namespace has wins over a class\'s');
    const render = (s)=> context.renderExampleInfo(s, [], docs);
    const a = (name)=> `<a href="${docs.get(name)}" target="_blank" rel="noopener">${name}</a>`;
    assert.equal(render('`drawTile(pos, size)` and `new Light3D(vec3(), 12)` and `.pick()`'),
        `<p><code>${a('drawTile')}(pos, size)</code> and <code>new ${a('Light3D')}(vec3(), 12)</code> ` +
        `and <code>.${a('pick')}()</code></p>`);
    assert.equal(render('`render3D.pick` and `o.pos` and `pos` and `x*2` and `render3D.shadows = true`'),
        `<p><code>${a('render3D')}.${a('pick')}</code> and <code>o.pos</code> and <code>pos</code> and <code>x*2</code> ` +
        `and <code>${a('render3D')}.shadows = true</code></p>`);
    assert.equal(render("`'fire'` and `{scale: 3}` and `-.01`"),
        "<p><code>'fire'</code> and <code>{scale: 3}</code> and <code>-.01</code></p>", 'not code that starts with no name');
    assert.equal(context.renderExampleInfo('`drawTile`'), '<p><code>drawTile</code></p>', 'no docs, no links');
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
    assert.deepEqual([exampleInfoBox.innerHTML, exampleInfoBox.scrollTop], ['<p>Hello</p>', 0]);

    // a short with no block yet shows what the list says about it, so the box is never empty
    const b = context.loadFile('shorts/b.js', false, 'About b');
    respond('shorts/b.js', 'let b;\n'); await b;
    assert.equal(exampleInfoBox.innerHTML, '<p>About b</p>');

    // and a short's own block is shown in place of that
    const c = context.loadFile('shorts/c.js', false, 'About c');
    respond('shorts/c.js', 'let c;\n/* info\nIts own\n*/\n'); await c;
    assert.equal(exampleInfoBox.innerHTML, '<p>Its own</p>');
});

test('a short that fails to load shows the info the list has for it, not the short before it', async ()=>
{
    const {context, errors, respond, exampleInfoBox} = load();
    const a = context.loadFile('shorts/a.js', false);
    respond('shorts/a.js', 'let a;\n/* info\nHello\n*/\n'); await a;
    const gone = context.loadFile('shorts/gone.js', false, 'About gone');
    respond('shorts/gone.js', '', false); await gone;
    assert.equal(errors.length, 1);
    assert.equal(exampleInfoBox.innerHTML, '<p>About gone</p>');
});

test('a full example shows the info the list has for it, not the short before it', async ()=>
{
    const {context, respond, exampleInfoBox} = load();
    const a = context.loadFile('shorts/a.js', false);
    respond('shorts/a.js', 'let a;\n/* info\nHello\n*/\n'); await a;
    await context.loadFile('platformer/index.html', true, 'A platformer.\n\n## Controls\n- Jump');
    assert.equal(exampleInfoBox.innerHTML, '<p>A platformer.</p><h3>Controls</h3><ul><li>Jump</li></ul>');
});

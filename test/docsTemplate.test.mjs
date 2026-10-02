import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// The docs template, tools/docs/render.js, is checked on what jsdoc makes of
// test/fixtures/docsFixture.js: jsdoc is a devDependency, so it is here after
// npm install; without it the file skips, and fails where CI is set.

const require = createRequire(import.meta.url);
const { render, buildModel, typeHtml, tagTypes, highlight } = require('../tools/docs/render.js');
const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = fileURLToPath(new URL('fixtures/docsFixture.js', import.meta.url));
const config = fileURLToPath(new URL('fixtures/docsFixture.json', import.meta.url));
const hasJSDoc = existsSync(new URL('../node_modules/jsdoc/package.json', import.meta.url));
if (!hasJSDoc && process.env.CI)
    throw new Error('jsdoc is not installed');
const skip = hasJSDoc ? false : 'jsdoc is not installed';

// jsdoc exits non-zero on the tuple type the fixture has on purpose, and still
// prints the doclets, so take stdout either way
function fixtureDoclets()
{
    const command = `npx jsdoc -X -c "${config}" "${fixture}"`;
    let out;
    try { out = execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout; }
    return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
}
const doclets = hasJSDoc ? fixtureDoclets() : [];
const options = { readme: '<h1>Home</h1><h2 id="start">Start</h2><img src="examples/logo.png">', version: '9.9.9', root,
    repo: 'https://github.com/KilledByAPixel/LittleJS', title: 'LittleJS Docs',
    menu: [{ title: 'GitHub', link: 'https://github.com/KilledByAPixel/LittleJS' }] };
const site = hasJSDoc ? render(doclets, options) : { pages: {}, search: [] };

// a doclet made by hand, for the model tests that need no jsdoc
const make = (kind, longname, extra={}) =>
{
    const name = longname.split(/[.#]/).pop();
    const memberof = longname.slice(0, longname.length - name.length - 1) || undefined;
    return { kind, name, longname, memberof, scope: longname.includes('#') ? 'instance' : memberof ? 'static' : 'global',
        meta: { filename: 'f.js', lineno: 1, path: root + 'src' }, comment: '', ...extra };
};

test('namespaces sort into the Engine and Plugins groups, unknown ones last in Plugins', ()=>
{
    const model = buildModel(['Zed', 'Draw', 'ZzFXM', 'Engine', 'Alpha'].map(n => make('namespace', n)));
    assert.deepEqual(model.groups.map(g => [g.name, g.namespaces.map(ns => ns.name)]),
        [['Engine', ['Engine', 'Draw']], ['Plugins', ['ZzFXM', 'Alpha', 'Zed']]]);
});

test('classes nest under their namespace, alphabetical, and entries under their owner', ()=>
{
    const model = buildModel([make('namespace', 'Engine'), make('class', 'Engine.Vector2'), make('class', 'Engine.Color'),
        make('function', 'Engine.Vector2#add'), make('function', 'Engine.vec2'), make('member', 'Engine.Vector2#x')]);
    const engine = model.namespaces[0];
    assert.deepEqual(engine.classes.map(c => c.name), ['Color', 'Vector2']);
    assert.deepEqual(engine.entries.map(e => e.name), ['vec2']);
    assert.deepEqual(engine.classes[1].entries.map(e => e.name), ['add', 'x']);
    assert.equal(engine.classes[1].page, 'Engine.Vector2.html');
});

test('a symbol with no namespace in its chain, an undocumented, ignored or private one, is left out', ()=>
{
    const model = buildModel([make('namespace', 'Engine'), make('function', 'editor3DStrokeBegin'), make('member', 'e.target'),
        make('function', 'Engine.secret', { access: 'private' }), make('function', 'Engine.hidden', { ignore: true }),
        make('function', 'Engine.bare', { undocumented: true }), make('function', 'Engine.shown')]);
    assert.deepEqual(model.namespaces[0].entries.map(e => e.name), ['shown']);
});

test('two doclets with one longname give one entry, the one with a description', ()=>
{
    const model = buildModel([make('namespace', 'T'), make('class', 'T.Tween'),
        make('member', 'T.Tween#start'), make('member', 'T.Tween#start', { description: '<p>where it starts</p>' })]);
    const entries = model.namespaces[0].classes[0].entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].doclet.description, '<p>where it starts</p>');
});

test('a static entry named like an instance one gets the -static anchor', ()=>
{
    const model = buildModel([make('namespace', 'T'), make('class', 'T.Thing'),
        make('function', 'T.Thing#move'), make('function', 'T.Thing.move'), make('function', 'T.Thing.unit')]);
    const entries = model.namespaces[0].classes[0].entries;
    assert.deepEqual(entries.map(e => [e.name, e.static, e.anchor]), [['move', false, 'move'], ['move', true, 'move-static'], ['unit', true, 'unit']]);
});

test('inheritance resolves by short name both ways', ()=>
{
    const model = buildModel([make('namespace', 'Engine'), make('class', 'Engine.EngineObject'), make('namespace', 'Box2D'),
        make('class', 'Box2D.Box2dObject', { augments: ['EngineObject'] }), make('class', 'Box2D.Box2dStaticObject', { augments: ['Box2dObject'] })]);
    const [engineObject] = model.namespaces[0].classes;
    const [box, staticBox] = model.namespaces[1].classes;
    assert.equal(box.parent, engineObject);
    assert.deepEqual(engineObject.children.map(c => c.name), ['Box2dObject']);
    assert.equal(staticBox.parent, box);
});

test('links map short names of classes and typedefs to their pages, and a name documented twice is an error', ()=>
{
    const model = buildModel([make('namespace', 'Engine'), make('class', 'Engine.Vector2'), make('typedef', 'Engine.GameCallback')]);
    assert.equal(model.links.get('Vector2'), 'Engine.Vector2.html');
    assert.equal(model.links.get('GameCallback'), 'Engine.html#GameCallback');
    assert.throws(()=> buildModel([make('namespace', 'A'), make('namespace', 'B'), make('class', 'A.Light'), make('class', 'B.Light')]), /Light/);
});

test('a kind the site has no page for is a warning, not a page', ()=>
{
    const model = buildModel([make('namespace', 'Engine'), make('event', 'Engine.event:boom'), make('mixin', 'Engine.Mixed')]);
    assert.equal(model.warnings.length, 2);
    assert.match(model.warnings[0], /event Engine.event:boom is not rendered/);
});

test('the fixture parses: two namespaces, two classes, an internal function left out', { skip }, ()=>
{
    const model = buildModel(doclets);
    assert.deepEqual(model.namespaces.map(ns => ns.name), ['Fixture', 'FixturePlugin']);
    assert.deepEqual(model.namespaces[0].classes.map(c => c.name), ['BigThing', 'Thing']);
    assert.equal(model.classes.find(c => c.name == 'BigThing').parent.name, 'Thing');
    assert.ok(!JSON.stringify(model.namespaces.map(ns => ns.entries.map(e => e.name))).includes('fixtureInternal'));
});

test('typeHtml links known names, escapes the rest, and drops the dot of Array.<T>', ()=>
{
    const links = new Map([['Vector2', 'Engine.Vector2.html'], ['EditorTool', 'Editor.html#EditorTool']]);
    assert.equal(typeHtml(['Array.<Vector2>'], links), 'Array&lt;<a href="Engine.Vector2.html">Vector2</a>&gt;');
    assert.equal(typeHtml(['Color', 'undefined'], links), 'Color<span class="sep">|</span>undefined');
    assert.equal(typeHtml(['Object.<string, {action: function(boolean): any}>'], links),
        'Object&lt;string, {action: function(boolean): any}&gt;');
    assert.equal(typeHtml(['Object.<string, EditorTool>'], links), 'Object&lt;string, <a href="Editor.html#EditorTool">EditorTool</a>&gt;');
    assert.equal(typeHtml([], links), '');
});

test('tagTypes reads the braces of a tag jsdoc rejected, nested braces included', ()=>
{
    const comment = `/** Give a block faces
     *  @param {number} type - 1 to 255
     *  @param {number|{top?: number, side: number}} faces - per face
     *  @param {[Vector2, Vector2, number]} [span] - a tuple
     *  @return {a is Array<any>} */`;
    const types = tagTypes(comment);
    assert.deepEqual(types.get('type'), { type: 'number', optional: false, description: '1 to 255' });
    assert.equal(types.get('faces').type, 'number|{top?: number, side: number}');
    assert.deepEqual(types.get('span'), { type: '[Vector2, Vector2, number]', optional: true, description: 'a tuple' });
    assert.deepEqual(types.get('@return'), { type: 'a is Array<any>', optional: false, description: '' });
});

test('tagTypes keeps a description that runs over lines and reads a default inside the brackets', ()=>
{
    const types = tagTypes(`/** x
     *  @param {[number, number]} [range=[0, 1]] - low and high,
     *    a pair
     *  @return {void} */`);
    assert.deepEqual(types.get('range'), { type: '[number, number]', optional: true, description: 'low and high, a pair' });
});

test('highlight marks comments, strings, numbers and keywords and escapes html', ()=>
{
    assert.equal(highlight("const a = 'x<y'; // 2"),
        '<span class="k">const</span> a = <span class="s">\'x&lt;y\'</span>; <span class="c">// 2</span>');
    assert.equal(highlight('f(1.5e3, "q")'), 'f(<span class="n">1.5e3</span>, <span class="s">"q"</span>)');
    assert.equal(highlight('/* a\nb */ x'), '<span class="c">/* a\nb */</span> x');
});

test('the homepage is the README under the shell, with the outline from its headings', { skip }, ()=>
{
    const home = site.pages['index.html'];
    assert.ok(home.startsWith('<!DOCTYPE html>'));
    assert.ok(home.includes('<title>LittleJS Docs</title>'));
    assert.ok(home.includes('<img src="examples/logo.png">'), 'README html is kept as jsdoc made it');
    assert.ok(home.includes('<a href="#start">Start</a>'), 'the outline lists the README headings');
    assert.ok(home.includes('href="https://github.com/KilledByAPixel/LittleJS"'), 'the menu links');
    assert.ok(home.includes('9.9.9'), 'the version shows');
    assert.ok(home.includes('localStorage.getItem(\'theme\')'), 'the theme is set before the stylesheet');
    assert.ok(!home.includes('src="http'), 'no external scripts');
});

test('the sidebar has both groups, each namespace with its classes, the current one open', { skip }, ()=>
{
    const home = site.pages['index.html'];
    // both fixture namespaces are unknown to the order lists, so they are Plugins and the Engine group is empty
    assert.ok(home.includes('<h2>Plugins</h2>') && !home.includes('<h2>Engine</h2>'), 'an empty group has no heading');
    assert.ok(/<details[^>]*>\s*<summary><a href="Fixture.html">Fixture<\/a><\/summary>\s*<ul>\s*<li><a href="Fixture.BigThing.html">BigThing<\/a><\/li>\s*<li><a href="Fixture.Thing.html">Thing<\/a><\/li>/.test(home));
    assert.ok(!home.includes('<details open'), 'no namespace is open on the homepage');
});

test('a namespace page has the description, the index and the entries by kind', { skip }, ()=>
{
    const page = site.pages['Fixture.html'];
    assert.ok(page.includes('<h1>Fixture</h1>'));
    assert.ok(page.includes('<li>a bullet in the description</li>'), 'the description is the markdown html');
    // the index: classes link to their pages, the rest to anchors on this page
    assert.ok(/<section class="index">[\s\S]*<h3>Classes<\/h3>[\s\S]*<a href="Fixture.BigThing.html">BigThing<\/a>[\s\S]*<h3>Functions<\/h3>[\s\S]*<a href="#makeThing">makeThing<\/a>[\s\S]*<h3>Constants<\/h3>[\s\S]*<a href="#fixtureSize">fixtureSize<\/a>[\s\S]*<h3>Typedefs<\/h3>[\s\S]*<a href="#DoneCallback">DoneCallback<\/a>/.test(page));
    assert.ok(page.includes('<h2 id="functions">Functions</h2>'));
    assert.ok(page.includes('<details open><summary><a href="Fixture.html" class="current">Fixture</a>'), 'the sidebar opens the current namespace');
});

test('a function entry: signature, params with optional and default, the tuple type as text, returns, example, source', { skip }, ()=>
{
    const page = site.pages['Fixture.html'];
    const entry = page.slice(page.indexOf('<div class="entry" id="makeThing">'), page.indexOf('</div><!-- /entry -->', page.indexOf('id="makeThing"')));
    assert.ok(entry.includes('<span class="name">makeThing</span>(pos, <span class="opt">size</span>, <span class="opt">span</span>, …rest)'), entry);
    assert.ok(entry.includes('→ <a href="Fixture.Thing.html">Thing</a>'), 'the return type links');
    assert.ok(entry.includes('<dt><code>size</code> number <span class="opt">optional, default 1</span></dt><dd><p>how big</p></dd>'));
    assert.ok(entry.includes('<dt><code>span</code> [Vector2, Vector2, number] <span class="opt">optional</span></dt><dd><p>a tuple jsdoc rejects</p></dd>'), 'the tuple jsdoc rejected is read from the comment, with its optional flag and description');
    assert.ok(entry.includes('<dd class="returns"><p>the thing</p></dd>'));
    assert.ok(entry.includes('<pre><code><span class="c">// make one</span>\n<span class="k">const</span> t = makeThing(vec2(<span class="n">1</span>), <span class="n">2</span>);</code></pre>'));
    assert.ok(entry.includes('<a class="src" href="https://github.com/KilledByAPixel/LittleJS/blob/v9.9.9/test/fixtures/docsFixture.js#L'), 'the source link goes to the tag');
});

test('a constant shows its type and default once, a typedef its properties, a callback its params', { skip }, ()=>
{
    const page = site.pages['Fixture.html'];
    assert.ok(page.includes('<span class="name">fixtureSize</span> : number <span class="opt">default 3</span>'), page.slice(page.indexOf('id="fixtureSize"'), page.indexOf('id="fixtureSize"') + 400));
    assert.ok(page.includes('<dt><code>speed</code> number</dt><dd><p>how fast</p></dd>'));
    assert.ok(page.includes('<dt><code>tint</code> Color<span class="sep">|</span>undefined</dt>'));
    assert.ok(page.includes('<span class="name">DoneCallback</span>(thing)'));
    assert.ok(page.includes('<dt><code>thing</code> <a href="Fixture.Thing.html">Thing</a></dt>'));
});

test('a plugin namespace page links the other namespace\'s class in a nested type', { skip }, ()=>
{
    const page = site.pages['FixturePlugin.html'];
    assert.ok(page.includes('<dt><code>table</code> Object&lt;string, {action: function(boolean): any}&gt;</dt>'));
    assert.ok(page.includes('<dt><code>thing</code> <a href="Fixture.Thing.html">Thing</a></dt>'));
});

test('a class page: crumb, description, inheritance, constructor first, index, members then methods, badges', { skip }, ()=>
{
    const page = site.pages['Fixture.Thing.html'];
    assert.ok(page.includes('<p class="crumb"><a href="Fixture.html">Fixture</a></p><h1>Thing</h1>'));
    assert.ok(page.includes('<div class="desc"><p>A thing in the fixture</p></div>'), 'classdesc is the class description');
    assert.ok(page.includes('<p class="inherit">Extended by <a href="Fixture.BigThing.html">BigThing</a></p>'));
    assert.ok(page.indexOf('<h2 id="constructor">Constructor</h2>') < page.indexOf('<section class="index">'), 'the constructor comes first');
    assert.ok(page.includes('<span class="name">new Thing</span>(pos)'));
    assert.ok(page.includes('<p>Create a thing</p>'), 'the constructor description is the doclet description');
    assert.ok(page.indexOf('<h2 id="members">Members</h2>') < page.indexOf('<h2 id="methods">Methods</h2>'));
    assert.ok(page.includes('<span class="badge static">static</span>'));
    assert.ok(page.includes('<span class="badge deprecated">deprecated</span>'));
    assert.ok(page.includes('<p class="deprecated">Deprecated since 1.0, use move</p>'));
    assert.ok(!page.includes('Deprecated true'), 'a bare @deprecated has no text');
    assert.ok(page.includes('id="move-static"'), 'the static twin has its own anchor');
});

test('a member with @property and @type shows the type once and the property text as its description', { skip }, ()=>
{
    const page = site.pages['Fixture.Thing.html'];
    const entry = page.slice(page.indexOf('<div class="entry" id="pos">'), page.indexOf('</div><!-- /entry -->', page.indexOf('id="pos"')));
    assert.ok(entry.includes('<span class="name">pos</span> : Vector2'), entry);
    assert.ok(entry.includes('<div class="desc"><p>where it is</p></div>'));
    assert.ok(!entry.includes('<dl'), 'no properties list repeating the type');
});

test('a member with @property and no @type takes the type from its one property', { skip }, ()=>
{
    const page = site.pages['Fixture.Thing.html'];
    const entry = page.slice(page.indexOf('<div class="entry" id="speed">'), page.indexOf('</div><!-- /entry -->', page.indexOf('id="speed"')));
    assert.ok(entry.includes('<span class="name">speed</span> : number'), entry);
    assert.ok(entry.includes('<div class="desc"><p>how fast, a property with no @type</p></div>'));
});

test('a subclass page says what it extends and lists the inherited names as links to the parent', { skip }, ()=>
{
    const page = site.pages['Fixture.BigThing.html'];
    assert.ok(page.includes('<p class="inherit">Extends <a href="Fixture.Thing.html">Thing</a></p>'));
    assert.ok(/<h3>Inherited from <a href="Fixture.Thing.html">Thing<\/a><\/h3><ul class="inherited">(<li><a href="Fixture.Thing.html#[\w-]+">\w+<\/a><\/li>)+<\/ul>/.test(page));
    assert.ok(page.includes('href="Fixture.Thing.html#move">move</a>') && page.includes('href="Fixture.Thing.html#pos">pos</a>'));
});

test('the search rows cover every page and entry with their namespace, and no internal name', { skip }, ()=>
{
    const rows = site.search;
    assert.deepEqual(rows.find(r => r.n == 'Thing'), { n: 'Thing', k: 'class', p: 'Fixture.Thing.html', a: '', ns: 'Fixture' });
    assert.deepEqual(rows.find(r => r.n == 'move' && r.k == 'function'), { n: 'move', k: 'function', p: 'Fixture.Thing.html', a: 'move', ns: 'Fixture' });
    assert.deepEqual(rows.find(r => r.n == 'makeThing'), { n: 'makeThing', k: 'function', p: 'Fixture.html', a: 'makeThing', ns: 'Fixture' });
    assert.ok(rows.some(r => r.n == 'FixturePlugin' && r.k == 'namespace' && r.p == 'FixturePlugin.html'));
    assert.ok(!rows.some(r => r.n == 'fixtureInternal'));
});

test('every page is emitted: the home, two namespaces, two classes, nothing else', { skip }, ()=>
{
    assert.deepEqual(Object.keys(site.pages).sort(), ['Fixture.BigThing.html', 'Fixture.Thing.html', 'Fixture.html', 'FixturePlugin.html', 'index.html']);
});

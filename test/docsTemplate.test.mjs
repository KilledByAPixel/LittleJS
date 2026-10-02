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
    assert.equal(types.get('type'), 'number');
    assert.equal(types.get('faces'), 'number|{top?: number, side: number}');
    assert.equal(types.get('span'), '[Vector2, Vector2, number]');
    assert.equal(types.get('@return'), 'a is Array<any>');
});

test('highlight marks comments, strings, numbers and keywords and escapes html', ()=>
{
    assert.equal(highlight("const a = 'x<y'; // 2"),
        '<span class="k">const</span> a = <span class="s">\'x&lt;y\'</span>; <span class="c">// 2</span>');
    assert.equal(highlight('f(1.5e3, "q")'), 'f(<span class="n">1.5e3</span>, <span class="s">"q"</span>)');
    assert.equal(highlight('/* a\nb */ x'), '<span class="c">/* a\nb */</span> x');
});

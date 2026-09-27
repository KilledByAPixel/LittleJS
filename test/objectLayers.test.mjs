import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A game adds its object types by the names they have in Tiled, and objectLayersLoad makes the objects a map's
// object layers hold, in debug and release builds alike. Each test runs its own copy of the script build.

// a headless engine, the debug build or the release one
function engine(file)
{
    const warnings = [];
    const loaded = loadEngine({ console: { ...console, warn: (text)=> warnings.push(text) } }, '', file);
    loaded.run('setHeadlessMode(true)');
    return { ...loaded, warnings };
}

// a map 4 cells high at 16 pixels a cell, with an object layer holding these objects
const map = (objects, extra={})=> `({ width: 4, height: 4, tilewidth: 16, tileheight: 16, ...${JSON.stringify(extra)},
    layers: [{ type: 'tilelayer', width: 4, height: 4, data: new Array(16).fill(0) },
        { type: 'objectgroup', name: 'Objects', objects: ${JSON.stringify(objects)} }] })`;

// a coin class, as a game has, that keeps where it was made
const coinCode = `class Coin { constructor(pos) { this.pos = pos; this.value = 0; } }`;

test('a type added by name is made at its object\'s world position, its Tiled properties over its defaults', () =>
{
    const { run } = engine();
    const made = run(`${coinCode}
        objectLayersAddType('Coin', Coin, { value: 1, bonus: false, label: 'a', tint: hsl(0, 0, 1) });
        const objects = objectLayersLoad(${map([
            { id: 1, type: 'Coin', point: true, x: 24, y: 8 },
            { id: 2, type: 'Coin', point: true, x: 8, y: 56, properties: [
                { name: 'value', type: 'int', value: 5 }, { name: 'bonus', type: 'bool', value: true },
                { name: 'label', type: 'string', value: 'b' }, { name: 'tint', type: 'color', value: '#80ff0000' }] }])});
        objects.map((o)=> [o instanceof Coin, o.pos.x, o.pos.y, o.value, o.bonus, o.label, o.tint.r, o.tint.g, o.tint.a]);`);
    const [first, second] = JSON.parse(JSON.stringify(made));
    assert.deepEqual(first, [true, 1.5, 3.5, 1, false, 'a', 1, 1, 1]);
    assert.deepEqual(second.slice(0, 8), [true, .5, .5, 5, true, 'b', 1, 0]);
    assert.ok(Math.abs(second[8] - 0x80 / 255) < 1e-6, 'the alpha of #80ff0000');
});

test('an arrow function is called, not made with new, and what made nothing is left out of the list', () =>
{
    const { run } = engine();
    const result = run(`let start;
        objectLayersAddType('PlayerStart', (pos)=> { start = pos; });
        const made = objectLayersLoad(${map([{ id: 1, type: 'PlayerStart', point: true, x: 40, y: 24 }])});
        [made.length, start.x, start.y];`);
    assert.deepEqual([...result], [0, 2.5, 2.5]);
});

test('a Color or Vector2 default is copied for each object', () =>
{
    const { run } = engine();
    const same = run(`${coinCode}
        objectLayersAddType('Coin', Coin, { tint: hsl(0, 0, 1), offset: vec2(1, 2) });
        const [a, b] = objectLayersLoad(${map([{ id: 1, type: 'Coin', x: 0, y: 0 }, { id: 2, type: 'Coin', x: 0, y: 0 }])});
        [a.tint === b.tint, a.offset === b.offset];`);
    assert.deepEqual([...same], [false, false]);
});

test('a Tiled 1.9 map\'s class field names the type, and an empty color property is left at its default', () =>
{
    const { run } = engine();
    const made = run(`${coinCode}
        objectLayersAddType('Coin', Coin, { tint: hsl(0, 0, 1) });
        objectLayersLoad(${map([{ id: 1, class: 'Coin', x: 0, y: 0,
            properties: [{ name: 'tint', type: 'color', value: '' }] }])}).map((o)=> o.tint.r);`);
    assert.deepEqual([...made], [1]);
});

test('objects in nested groups are made, and tile layers are left alone', () =>
{
    const { run } = engine();
    const count = run(`${coinCode}
        objectLayersAddType('Coin', Coin);
        objectLayersLoad({ width: 1, height: 1, layers: [
            { type: 'tilelayer', data: [0] },
            { type: 'group', layers: [{ type: 'group', layers: [
                { type: 'objectgroup', objects: [{ id: 1, type: 'Coin', x: 0, y: 0 }] }] }] },
            { type: 'objectgroup', objects: [{ id: 2, type: 'Coin', x: 0, y: 0 }] }] }).length;`);
    assert.equal(count, 2);
});

test('a map with no tile size places objects by cells', () =>
{
    const { run } = engine();
    const pos = run(`${coinCode}
        objectLayersAddType('Coin', Coin);
        const [coin] = objectLayersLoad({ width: 8, height: 8,
            layers: [{ type: 'objectgroup', objects: [{ id: 1, type: 'Coin', x: 3, y: 2 }] }] });
        [coin.pos.x, coin.pos.y];`);
    assert.deepEqual([...pos], [3, 6]);
});

test('an object of a type not added is skipped, with one warning in debug builds and none in release', () =>
{
    for (const file of [undefined, 'littlejs.release.js'])
    {
        const { run, warnings } = engine(file);
        const made = run(`objectLayersLoad(${map([{ id: 1, type: 'Ghost', x: 0, y: 0 }])}).length`);
        assert.equal(made, 0);
        assert.equal(warnings.filter((text)=> text.includes('Ghost')).length, file ? 0 : 1);
    }
});

test('adding a name again replaces it', () =>
{
    const { run } = engine();
    const kind = run(`class A { constructor() { this.kind = 'a'; } } class B { constructor() { this.kind = 'b'; } }
        objectLayersAddType('Thing', A); objectLayersAddType('Thing', B);
        objectLayersLoad(${map([{ id: 1, type: 'Thing', x: 0, y: 0 }])})[0].kind;`);
    assert.equal(kind, 'b');
});

test('a map with no object layers, or no layers at all, makes nothing', () =>
{
    const { run } = engine();
    assert.equal(run(`objectLayersLoad({ width: 1, height: 1, layers: [{ type: 'tilelayer', data: [0] }] }).length`), 0);
    assert.equal(run(`objectLayersLoad({ width: 1, height: 1 }).length`), 0);
});

test('the release build makes the same objects', () =>
{
    const { run } = engine('littlejs.release.js');
    const made = run(`${coinCode}
        objectLayersAddType('Coin', Coin, { value: 1 });
        objectLayersLoad(${map([{ id: 1, type: 'Coin', x: 24, y: 8,
            properties: [{ name: 'value', type: 'int', value: 3 }] }])}).map((o)=> [o.pos.x, o.pos.y, o.value]);`);
    assert.deepEqual(JSON.parse(JSON.stringify(made)), [[1.5, 3.5, 3]]);
});

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

test('a string x,y is a Vector2 where the default is one, and keeps a number default where it is not', () =>
{
    const { run } = engine();
    const values = run(`${coinCode}
        objectLayersAddType('Coin', Coin, { offset: vec2(1, 2), value: 0 });
        const string = (name, value)=> ({ name, type: 'string', value });
        const [a, b] = objectLayersLoad(${map([
            { id: 1, type: 'Coin', x: 0, y: 0 }, { id: 2, type: 'Coin', x: 0, y: 0 }])
            .replace('"id":1,', '"id":1,"properties":[{"name":"offset","type":"string","value":"2,-3.5"},' +
                '{"name":"value","type":"string","value":"2,3"}],')
            .replace('"id":2,', '"id":2,"properties":[{"name":"offset","type":"string","value":"up"}],')});
        [isVector2(a.offset), a.offset.x, a.offset.y, a.value, b.offset.x, b.offset.y];`);
    // text over a number default keeps the default, as the 3D loader does (full pass 13 L-E4)
    assert.deepEqual([...values], [true, 2, -3.5, 0, 1, 2], 'one it can not read keeps the default');
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

test('a Vector2 string must be exactly two numbers, anything else keeps the default', () =>
{
    const { run } = engine();
    const values = run(`${coinCode}
        objectLayersAddType('Coin', Coin, { offset: vec2(1, 2) });
        const coin = (id, value)=> ({ id, type: 'Coin', x: 0, y: 0,
            properties: [{ name: 'offset', type: 'string', value }] });
        objectLayersLoad({ width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{ type: 'objectgroup',
            objects: ['7,', ',', '1,2,3', '', ' 2 , 3 '].map((v, i)=> coin(i + 1, v)) }] })
            .map((c)=> [c.offset.x, c.offset.y]);`);
    assert.deepEqual(JSON.parse(JSON.stringify(values)), [[1, 2], [1, 2], [1, 2], [1, 2], [2, 3]]);
});

test('a Tiled list, its items kept as {type, value}, is read as a list, in a class and a list too', () =>
{
    // as Tiled 1.11 writes a list property, issue 188
    const { run, warnings } = engine();
    const item = (type, value, extra={})=> ({ type, value, ...extra });
    const r = JSON.parse(run(`(()=>
    {
        const defaults = { counts: [0], tints: [hsl(0, 0, 1)], spots: [vec2()], grid: [[0]], waves: [{ n: 1, k: 2 }],
            cfg: { hp: 5, drops: ['a'] }, raw: [1] };
        objectLayersAddType('Unit', class { constructor(pos) { this.pos = pos; } }, defaults);
        const [unit] = objectLayersLoad(${map([{ id: 1, type: 'Unit', x: 0, y: 0, properties: [
            { name: 'counts', type: 'list', value: [item('int', 3), item('int', 4)] },
            { name: 'tints', type: 'list', value: [item('color', '#ff00ff00')] },
            { name: 'spots', type: 'list', value: [item('string', '2,3')] },
            { name: 'grid', type: 'list', value: [item('list', [item('int', 7), item('int', 8)])] },
            { name: 'waves', type: 'list', value: [item('class', { n: 6 }, { propertytype: 'Wave' })] },
            { name: 'cfg', type: 'class', value: { drops: [item('string', 'b'), item('string', 'c')] } },
            { name: 'raw', type: 'float', value: [5, 6] }] }])});
        return JSON.stringify({ counts: unit.counts, tint: [unit.tints[0].r, unit.tints[0].g, unit.tints[0] instanceof Color],
            spot: [unit.spots[0].x, unit.spots[0].y, unit.spots[0] instanceof Vector2], grid: unit.grid,
            waves: unit.waves, cfg: unit.cfg, raw: unit.raw });
    })()`));
    assert.deepEqual(r, { counts: [3, 4], tint: [0, 1, true], spot: [2, 3, true], grid: [[7, 8]],
        waves: [{ n: 6, k: 2 }], cfg: { hp: 5, drops: ['b', 'c'] }, raw: [5, 6] });
    assert.deepEqual(warnings, []);
});

test('a Tiled property named as a method of the object is left out, so update still runs', () =>
{
    for (const file of [undefined, 'littlejs.release.js'])
    {
        const { run, warnings } = engine(file);
        run(`class Door { constructor(pos) { this.pos = pos; } update() { return 'runs'; } }
            objectLayersAddType('Door', Door, { locked: false });
            var [door] = objectLayersLoad(${map([{ id: 1, type: 'Door', point: true, x: 8, y: 8, properties: [
                { name: 'update', type: 'string', value: 'x' }, { name: 'locked', type: 'bool', value: true }] }])});`);
        assert.deepEqual([run('door.update()'), run('door.locked')], ['runs', true], file);
        file || assert.ok(warnings.some((w)=> /update/.test(w)), 'a debug build says why');
    }
});

test('an object default: a plain one merges member by member, a class with a copy method takes only its own fields,'
    + ' one with none is kept', () =>
{
    const { run, warnings } = engine();
    const r = JSON.parse(run(`(()=>
    {
        class Stat { constructor() { this.hp = 5; } get twice() { return this.hp * 2; }
            copy() { const s = new Stat; s.hp = this.hp; return s; } }
        class Bare { constructor() { this.n = 1; } }
        const defaults = { cfg: { hp: 5, armor: 2 }, stat: new Stat, bare: new Bare, tint: hsl(0, 0, 1) };
        objectLayersAddType('Unit', class { constructor(pos) { this.pos = pos; } }, defaults);
        const [unit] = objectLayersLoad(${map([{ id: 1, type: 'Unit', x: 0, y: 0, properties: [
            { name: 'cfg', type: 'class', value: { hp: 9 } },
            { name: 'stat', type: 'class', value: { hp: 7, twice: 1, extra: 3 } },
            { name: 'bare', type: 'class', value: { n: 4 } },
            { name: 'tint', type: 'class', value: { r: .5 } }] }])});
        return JSON.stringify({ cfg: unit.cfg, hp: unit.stat.hp, twice: unit.stat.twice, isStat: unit.stat instanceof Stat,
            extra: 'extra' in unit.stat, own: unit.stat !== defaults.stat, kept: defaults.stat.hp,
            bare: unit.bare.n, shared: unit.bare === defaults.bare, tint: [unit.tint.r, unit.tint.g],
            color: unit.tint instanceof Color });
    })()`));
    assert.deepEqual(r, { cfg: { hp: 9, armor: 2 }, hp: 7, twice: 14, isStat: true, extra: false, own: true, kept: 5,
        bare: 1, shared: true, tint: [.5, 1], color: true });
    assert.ok(warnings.some((w)=> /twice is not a field/.test(w)) && warnings.some((w)=> /no copy method/.test(w)));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// setTextIcon names a tile that text shows between colons: a line is split into its text and its icons, and only a
// registered name is one, so other text with colons draws as it always has

test('a line splits into text and the registered icons, in order', () =>
{
    const { run } = loadEngine();
    const runs = JSON.parse(run(`
        setTextIcon('coin', new TileInfo(vec2(), vec2(8)));
        setTextIcon('heart', new TileInfo(vec2(8, 0), vec2(8)));
        const show = (line)=> { const r = textIconRuns(line); return r && r.map((x)=> typeof x == 'string' ? x : x.pos.x); };
        JSON.stringify([show('Gold: :coin: 25'), show(':heart::coin:'), show(':coin:'), show('a :nope: b :coin:')])
    `));
    assert.deepEqual(runs, [['Gold: ', 0, ' 25'], [8, 0], [0], ['a :nope: b ', 0]]);
});

test('a line with no registered icon is left to the plain path, colons and all', () =>
{
    const { run } = loadEngine();
    const runs = JSON.parse(run(`
        setTextIcon('coin', new TileInfo(vec2(), vec2(8)));
        JSON.stringify([textIconRuns('Time: 5:30'), textIconRuns(':nope:'), textIconRuns('a:b:c')])
    `));
    assert.deepEqual(runs, [null, null, null]);
});

test('a closing colon can open the next name', () =>
{
    const { run } = loadEngine();
    const runs = JSON.parse(run(`
        setTextIcon('coin', new TileInfo(vec2(), vec2(8)));
        JSON.stringify(textIconRuns('x:nope:coin: y').map((x)=> typeof x == 'string' ? x : 'icon'))
    `));
    assert.deepEqual(runs, ['x:nope', 'icon', ' y']);
});

test('no tile takes a name off, and names are checked', () =>
{
    const { run } = loadEngine();
    assert.equal(run(`setTextIcon('coin', new TileInfo); setTextIcon('coin'); textIcons.size`), 0);
    assert.throws(()=> run(`setTextIcon('a coin', new TileInfo)`));
    assert.throws(()=> run(`setTextIcon('coin', 5)`));
});

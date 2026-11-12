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

test('ImageFont text shows icons, as tall as a character, the line centered by its whole width', () =>
{
    const { run } = loadEngine();
    const draws = JSON.parse(run(`
        const draws = [];
        drawTile = (pos, size, tileInfo, color)=> draws.push([pos.x, pos.y, size.x, size.y, tileInfo.pos.x, color.a]);
        const font = new ImageFont(new TileInfo(vec2(), vec2(8), new TextureInfo({width: 128, height: 64})));
        setTextIcon('wide', new TileInfo(vec2(64, 0), vec2(16, 8)));
        font.drawTextScreen('A:wide:', vec2(100, 50), 10, true, rgb(1, 0, 0, .5));
        font.drawTextScreen('A:nope:', vec2(100, 50), 10, false);
        JSON.stringify(draws)
    `));
    // 'A' 10 wide and the icon 20 wide, twice as wide as it is tall, 30 in all from 85 to 115
    assert.deepEqual(draws[0], [89.5, 49.5, 10, 10, 8, .5], 'the A, glyph 33, column 1 of 16, in the text color');
    assert.deepEqual(draws[1], [104.5, 49.5, 20, 10, 64, .5], 'the icon, its own colors faded with the text');
    assert.equal(draws.length, 9, 'a name not registered stays text, seven glyphs');
});

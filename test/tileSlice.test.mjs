import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// TileSlice draws a tile as a box of any size, a nine-slice, a three-slice or the whole tile stretched, and the UI
// system draws a widget's background with one in place of its rectangle

test('a TileSlice draws with the nine-slice, three-slice or plain tile draw its slice count asks for', () =>
{
    const { run } = loadEngine();
    const calls = run(`
        const calls = [];
        drawNineSlice = (pos, size, tileInfo, color, border, additive, extra, angle, useWebGL, screenSpace)=>
            calls.push(['nine', border, screenSpace]);
        drawThreeSlice = (pos, size, tileInfo, color, border, additive, extra, angle, useWebGL, screenSpace)=>
            calls.push(['three', border, screenSpace]);
        drawTile = (pos, size, tileInfo, color, angle, mirror, additive, useWebGL, screenSpace)=>
            calls.push(['tile', size.x, screenSpace]);
        const t = new TileInfo(vec2(), vec2(8));
        for (const slices of [9, 3, 1])
        {
            const slice = new TileSlice(t, slices, 4);
            slice.draw(vec2(), vec2(10), WHITE);
            slice.drawScreen(vec2(), vec2(10), WHITE);
        }
        calls.map(c=> c.join(' '));
    `);
    assert.deepEqual([...calls], ['nine 4 false', 'nine 4 true', 'three 4 false', 'three 4 true', 'tile 10 false',
        'tile 10 true']);
});

test('a TileSlice asserts a slice count other than 9, 3 or 1', () =>
{
    const { run } = loadEngine();
    assert.throws(()=> run('new TileSlice(new TileInfo(vec2(), vec2(8)), 4)'), /Assert failed/);
});

// a headless engine running the UI system, stepped by hand
async function loadUI()
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    engine.run('new UISystemPlugin');
    return engine;
}

test('a UI object with a slice draws it in its state color in place of its rectangle', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const draws = [];
        uiSystem.drawRect = ()=> draws.push('rect');
        TileSlice.prototype.drawScreen = function(pos, size, color) { draws.push('slice ' + color); };
        const plain = new UIObject(vec2(), vec2(100, 50));
        plain.render();
        const sliced = new UIObject(vec2(), vec2(100, 50));
        sliced.slice = new TileSlice(new TileInfo(vec2(), vec2(8)));
        sliced.color = RED;
        sliced.render();
        draws;
    `);
    assert.deepEqual([...result], ['rect', 'slice ' + '#ff0000ff']);
});

test('UI objects start with the default slice, a slider handle with the default handle slice or its own slice', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const panel = new TileSlice(new TileInfo(vec2(), vec2(8))), knob = new TileSlice(new TileInfo(vec2(8, 0), vec2(8)), 1);
        const before = new UIButton(vec2(), vec2(100, 50));
        uiSystem.defaultSlice = panel;
        const button = new UIButton(vec2(), vec2(100, 50));
        const slider = new UISlider(vec2(), vec2(200, 40));
        const drawn = [];
        TileSlice.prototype.drawScreen = function() { drawn.push(this === panel ? 'panel' : this === knob ? 'knob' : '?'); };
        uiSystem.drawRect = ()=> drawn.push('rect');
        uiSystem.drawText = ()=> {};
        slider.render();
        const withoutHandle = drawn.splice(0).join();
        uiSystem.defaultHandleSlice = knob;
        const slider2 = new UISlider(vec2(), vec2(200, 40));
        slider2.render();
        [before.slice === undefined, button.slice === panel, withoutHandle, drawn.join()];
    `);
    assert.deepEqual([...result], [true, true, 'panel,panel', 'panel,knob']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a release build goes on past a frame that throws; one that threw between a layer's redrawStart and redrawEnd has
// the redraw closed for it, or every frame after would draw into the layer with the layer's camera

test('a frame that throws inside a layer redraw has it closed, the screen and its camera back', async () =>
{
    const frames = [];
    const console = {log() {}, warn() {}, error() {}};
    const { run } = loadEngine({console, requestAnimationFrame: (f)=> frames.push(f)}, '', 'littlejs.release.js');
    run(`setHeadlessMode(true);
        var layer, failed = 0;
        engineInit(()=>
        {
            setCameraPos(vec2(7, 3));
            layer = new CanvasLayer(vec2(), vec2(4));
            // a headless layer has no canvas and draws nothing, this one is given a stand-in and its own redraw
            layer.canvas = {width: 64, height: 64};
            layer.context = {};
            delete layer.redrawStart;
            delete layer.redrawEnd;
        }, ()=>
        {
            if (failed++) return;
            layer.redrawStart();
            throw new Error('thrown in the middle of a redraw');
        });`);
    for (let i = 0; i < 20 && !run('layer'); ++i)
        await new Promise((resolve)=> setImmediate(resolve));
    for (let i = 0; i < 5 && run('failed') < 2; ++i)
        frames.shift()?.(performance.now() + i * 100);

    assert.ok(run('failed') >= 2, 'the game went on after the frame that threw');
    assert.equal(run('drawContext === mainContext'), true, 'drawing goes to the screen again');
    assert.deepEqual(JSON.parse(run('JSON.stringify(cameraPos)')), {x: 7, y: 3}, 'with the game\'s camera');
    assert.equal(run('canvasLayerRedraws.length'), 0);
});

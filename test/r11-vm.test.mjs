import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// review round 11: UI presses that start edits, focus moved between fields, clicks on HTML form controls, and
// tile maps loaded with no image, each test on its own copy of the script build

// a headless engine running the UI system, stepped by hand
async function loadUI()
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true)');
    await engine.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    engine.run('new UISystemPlugin');
    return engine;
}

test('a button whose onPress starts an edit gets its release', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const field = new UITextInput(vec2(0, 200), vec2(200, 50), 'abc');
        const button = new UIButton(vec2(0, 0), vec2(200, 50), 'Rename');
        let presses = 0, releases = 0;
        button.onPress = ()=> { ++presses; field.click(); };
        button.onRelease = ()=> ++releases;
        engineStep();
        mousePosScreen = button.nativePos.copy();
        inputData[0][0] = 3; engineStep(); inputData[0][0] = 1; engineStep();
        inputData[0][0] = 4; engineStep(); inputData[0][0] = 0; engineStep();
        [presses, releases, field.isKeyInputObject()];`);
    assert.deepEqual([...result], [1, 1, true]);
});

test('moving the edit from one text field to another ends the first with onChange', async () =>
{
    const { run } = await loadUI();
    const result = run(`
        const a = new UITextInput(vec2(0, 0), vec2(200, 50), 'a'), b = new UITextInput(vec2(0, 100), vec2(200, 50), 'b');
        let changesA = 0;
        a.onChange = ()=> ++changesA;
        a.click(); engineStep();
        b.click(); engineStep();
        [changesA, b.isKeyInputObject(), a.isKeyInputObject()];`);
    assert.deepEqual([...result], [1, true, false]);
});

test('a mouse click on an HTML form control is left to it', () =>
{
    const { handlers } = loadEngine();
    let cancelled = false;
    const field = { tagName: 'INPUT', type: 'text', closest: ()=> field };
    handlers.mousedown({ button: 0, x: 10, y: 10, target: field, cancelable: true, preventDefault() { cancelled = true; } });
    assert.equal(cancelled, false, 'so it can take focus, place the caret or be dragged');
    const canvas = { tagName: 'CANVAS', closest: ()=> null };
    handlers.mousedown({ button: 0, x: 10, y: 10, target: canvas, cancelable: true, preventDefault() { cancelled = true; } });
    assert.equal(cancelled, true, 'a click on the game is still cancelled');
});

test('tileLayersLoad works in a game with no image loaded', () =>
{
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const result = run(`
        const layers = tileLayersLoad({ width: 2, height: 1, layers: [{ data: [1, 0], width: 2, height: 1 }] }, undefined, 0, 0, false);
        [layers.length, layers[0].tileInfo === undefined, tileCollisionGetData(vec2(.5, .5))];`);
    assert.deepEqual([...result], [1, true, 1]);
});

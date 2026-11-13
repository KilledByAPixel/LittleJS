import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 6 of 2026-11-13: property objects with a member named copy, code layer save keys, the touch gamepad
// through a clear and a hand over, number guards, a retried Box2D load, the headless font, the path finder from far
// away, digits while a game's tool is held, sound on a hidden or blurred page, Tiled templates, addChild in release

const builds = ['littlejs.js', 'littlejs.release.js'];

test('a property object with a member named copy, or __proto__, is copied as data, in a 3D level and a Tiled map', ()=>
{
    for (const file of builds)
    {
        const { run } = loadEngine({}, '', file);
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            const seen = [];
            level3DAddType('Talker', (pos, properties)=> (seen.push(properties.lines), new EngineObject3D(pos)),
                {lines: []});
            const made = level3DLoad({objects: [
                {type: 'Talker', properties: {lines: [{speaker: 'Bob', copy: 'Hello'}]}},
                {type: 'Talker', properties: {lines: JSON.parse('[{"__proto__": {"x": 1}}]')}}]});
            const tiled = [];
            objectLayersAddType('Sign', (pos)=> { const o = new EngineObject(pos); tiled.push(o); return o; }, {text: {}});
            objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
                objects: [{id: 1, type: 'Sign', x: 0, y: 0, width: 16, height: 16,
                    properties: [{name: 'text', type: 'class', value: {copy: 'Hi', size: 2}}]}]}]});
            JSON.stringify({made: made.length, first: seen[0], own: seen[1][0].x === undefined && Object.keys(seen[1][0]).join(), tiled: tiled.map((o)=> o.text)})`));
        assert.equal(result.made, 2, file + ': the level loads');
        assert.deepEqual(result.first, [{speaker: 'Bob', copy: 'Hello'}], file);
        assert.equal(result.own, '__proto__', file + ': __proto__ is a member, not the prototype');
        assert.deepEqual(result.tiled, [{copy: 'Hi', size: 2}], file + ': and in Tiled');
    }
});

test('a layer made in code again in the place of one gone keeps its own save file key', async ()=>
{
    const { run } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const keys = JSON.parse(run(`
        var a = new TileLayer(vec2(), vec2(8, 4)); a.renderOrder = 0;
        var b = new TileLayer(vec2(), vec2(8, 4)); b.renderOrder = 1;
        levelEditor.open();
        var before = editorLayers().map((layer)=> layer.record.key);
        levelEditor.close();
        a.destroy(); engineObjectsUpdate();
        var a2 = new TileLayer(vec2(), vec2(8, 4)); a2.renderOrder = 0;
        levelEditor.open();
        JSON.stringify([before, editorLayers().map((layer)=> layer.record.key)])`));
    assert.notEqual(keys[0][0], keys[0][1]);
    assert.deepEqual(keys[1].slice().sort(), keys[0].slice().sort(), 'the new layer takes the number of the one gone');
});

// a touch device with the touch gamepad on, and a real gamepad
function touchEngine(pad)
{
    const { run } = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> [pad] } });
    run('touchGamepadInit = ()=> {}; setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3)');
    return run;
}
const newPad = ()=> ({ mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) });
const button = (run)=> run('[gamepadIsDown(0), gamepadWasPressed(0), gamepadWasReleased(0)].join()');

test('inputClearKey on a held touch gamepad button keeps it up until the finger lifts, as a key', ()=>
{
    const run = touchEngine(newPad());
    run(`touchGamepadTimer.set(); touchGamepadButtons[0] = touchGamepadButtonsPressed[0] = 1;
        touchGamepadPointerRole.set(7, 'face0'); inputUpdate()`);
    assert.equal(button(run), 'true,true,false', 'pressed');
    run('inputUpdatePost(); inputUpdate(); inputClearKey(0, 1); inputUpdatePost(); inputUpdate()');
    assert.equal(button(run), 'false,false,false', 'held through the clear, not pressed again');
    run('inputUpdatePost(); touchGamepadPointerUp({pointerId: 7}); inputUpdate()');
    assert.equal(button(run), 'false,false,false', 'and let go with no release');
    run(`inputUpdatePost(); touchGamepadButtons[0] = touchGamepadButtonsPressed[0] = 1;
        touchGamepadPointerRole.set(8, 'face0'); inputUpdate()`);
    assert.equal(button(run), 'true,true,false', 'a new touch presses it');
});

test('a touch gamepad button held as a real gamepad takes over is let go, and the lift does not take it back', ()=>
{
    const pad = newPad();
    const run = touchEngine(pad);
    run(`touchGamepadTimer.set(); touchGamepadButtons[0] = touchGamepadButtonsPressed[0] = 1;
        touchGamepadPointerRole.set(7, 'face0'); inputUpdate(); inputUpdatePost(); inputUpdate(); inputUpdatePost()`);
    assert.equal(button(run), 'true,false,false', 'held on the touch gamepad');
    pad.buttons[3] = { pressed: true, value: 1 };
    run('inputUpdate()');
    assert.equal(run('touchGamepadTimer.isSet()'), false, 'the real gamepad has it');
    assert.equal(button(run), 'false,false,true', 'the touch button is let go');
    run('inputUpdatePost()');
    pad.buttons[3] = { pressed: false, value: 0 };
    run('inputUpdate(); inputUpdatePost(); touchGamepadPointerUp({pointerId: 7}); inputUpdate()');
    assert.equal(run('touchGamepadTimer.isSet()'), false, 'lifting the finger leaves it with the real gamepad');
});

test('formatTime shows 0:00 for no time, and minutes past 2^31 seconds', ()=>
{
    const { run } = loadEngine();
    assert.deepEqual(JSON.parse(run('JSON.stringify([formatTime(NaN), formatTime(undefined), formatTime(Infinity), ' +
        'formatTime(125), formatTime(-61), formatTime(2 ** 40)])')),
        ['0:00', '0:00', '0:00', '2:05', '-1:01', Math.trunc(2 ** 40 / 60) + ':' + String(2 ** 40 % 60).padStart(2, '0')]);
});

test('a builder given a count that is not a number, or too few, makes no point that is not a number', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    const bad = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        const nan = (mesh)=> mesh.points.some((p)=> !isFinite(p.x + p.y + p.z));
        JSON.stringify([nan(buildBox(1, .2, NaN)), nan(buildCapsule(1, 2, 8, .5)), nan(buildSphere(1, 8, .5)),
            nan(buildTorus(1, .3, 8, .5)), nan(buildCylinder(1, 1, 8, false, true, .2, NaN))])`));
    assert.deepEqual(bad, [false, false, false, false, false]);
});

test('a Box2D load that failed is tried again by the next call', async ()=>
{
    const { run } = loadEngine();
    run('var loads = 0; globalThis.Box2D = async ()=> { ++loads; throw new Error("no wasm"); };');
    const first = await run('box2dInit().then(()=> "ok", (e)=> e.message)');
    const second = await run('box2dInit().then(()=> "ok", (e)=> e.message)');
    assert.deepEqual([first, second, run('loads')], ['no wasm', 'no wasm', 2]);
});

test('the engine\'s own font draws nothing in headless mode, as the other draws, with no error', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run(`engineImageFont.drawText('hi', vec2(), 1); engineImageFont.drawTextScreen('hi', vec2(), 1)`);
    assert.equal(run('engineImageFont instanceof ImageFont'), true);
});

test('the nearest clear node from far outside the grid looks only from the rings that reach it', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`var pf = new PathFinder(vec2(3, 3)), looks = 0;
        const getNode = pf.getNode.bind(pf); pf.getNode = (x, y)=> (++looks, getNode(x, y));
        const node = pf.getNearestClearNode(vec2(300, 1.5), Infinity);
        JSON.stringify({x: node?.pos?.x ?? node?.x, looks})`));
    assert.ok(result.looks < 20000, 'looks ' + result.looks);
    const near = run(`pf.getNearestClearNode(vec2(1.5, 1.5), 3) === pf.getNode(1, 1)`);
    assert.equal(near, true, 'from inside it is the cell it is in');
});

test('a digit or 0 while a game\'s tool is held waits for its release', async ()=>
{
    const { run } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const step = ()=> run('engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;');
    run(`var map = { width: 3, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1, source: 't.tsx' }],
            layers: [
                { type: 'tilelayer', name: 'back', width: 3, height: 2, data: [0, 0, 0, 0, 0, 0] },
                { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [0, 0, 0, 0, 0, 0] }] };
        var layers = tileLayersLoad(map, undefined, 0, 2);
        levelEditor.open(); editorLayer = editorLayerRecord(layers[1]); editorObjectLayer = undefined;
        var log = [];
        levelEditor.addTool('Dots', { onPress(at) { log.push('press'); levelEditor.edit2D.paint(at.cell, 5); },
            onRelease() { log.push('release'); } });
        levelEditor.tool = 'Dots';
        editorBrush = editorStampTile(editorTileToGid(2));
        mousePosScreen = worldToScreen(vec2(1.5, .5)); editorMouseOnPanel = false; inputData[0][0] = 3;`);
    step();
    run('inputData[0][0] = 1; inputData[0].Digit1 = 3; inputData[0].Digit0 = 3;');
    step();
    run('mousePosScreen = worldToScreen(vec2(2.5, .5));');
    step();
    run('inputData[0][0] = 4;');
    step();
    const result = JSON.parse(run('JSON.stringify({log, open: editorIsOpen, tool: levelEditor.tool, back: map.layers[0].data})'));
    assert.deepEqual(result, {log: ['press', 'release'], open: true, tool: 'Dots', back: [0, 0, 0, 0, 0, 0]});
});

test('speech pauses on a hidden page with no audio context, and a video is muted on a blurred one', ()=>
{
    const calls = [];
    const speechSynthesis = { pause: ()=> calls.push('pause'), resume: ()=> calls.push('resume') };
    const document = { hidden: false, addEventListener() {}, hasFocus: ()=> true, body: { appendChild() {} },
        createElement: ()=> ({style: {}, paused: true, currentTime: 0, duration: 10,
            pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
            remove() {}, removeAttribute() {}, load() {}}) };
    const { run } = loadEngine({ speechSynthesis, document });
    run('audioContext = undefined; document.hidden = true; audioPageChange(); document.hidden = false; audioPageChange();');
    assert.deepEqual(calls, ['pause', 'resume'], 'speech, with no context');
    run('setHeadlessMode(true)'); // the UI plugin is made after the engine starts, which headless mode stands in for
    const paused = JSON.parse(run(`new UISystemPlugin; var video = new UIVideo(vec2(), vec2(100), 'clip.mp4', false);
        video.play(); setSoundPauseWhenBlurred(true);
        document.hasFocus = ()=> false; uiVideosPageChange(); const blurred = [video.video.paused, video.video.muted];
        document.hasFocus = ()=> true; uiVideosPageChange();
        JSON.stringify([blurred, video.video.muted])`));
    // a blurred window still shows it, so it plays on muted, see full pass 7
    assert.deepEqual(paused, [[false, true], false], 'the video, muted while blurred and heard again after');
});

test('an object placed from a Tiled template is skipped with a warning saying so', ()=>
{
    const warnings = [];
    const { run } = loadEngine({ console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    run(`objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
        objects: [{id: 3, template: 'crate.tx', x: 0, y: 0}]}]})`);
    assert.ok(warnings.some((w)=> w.includes('crate.tx') && w.includes('Detach templates')), warnings.join('\n'));
});

test('addChild in a release build leaves out a destroyed child', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    assert.equal(run(`const parent = new EngineObject(), child = new EngineObject(); child.destroy();
        parent.addChild(child); parent.children.length`), 0);
});

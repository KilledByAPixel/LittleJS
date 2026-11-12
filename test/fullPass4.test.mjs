import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// full pass 4 before 1.30: the fixes a headless test can hold

// a standard gamepad, its buttons set by the test
const pad = { mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, ()=> ({pressed: false, value: 0})) };

test('a gamepad button held while the page is not focused stays down in a debug build, which still reads pads', () =>
{
    const { run } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    run('screenToWorld = screenToWorldDelta = (v)=> v; document.hasFocus = ()=> false;');
    pad.buttons[0].pressed = true;
    const down = [];
    for (let i = 0; i < 4; ++i)
    {
        run('inputUpdate()');
        down.push(run('gamepadIsDown(0, 0)'));
        run('inputUpdatePost()');
    }
    pad.buttons[0].pressed = false;
    assert.deepEqual(down, [true, true, true, true]);
});

test('a 3D level property whose default is null takes an object or a list from the file', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run(`var got; level3DAddType('Thing', (pos, p)=> { got = p; }, {target: null, path: null});
        level3DLoad({objects: [{id: 1, type: 'Thing', pos: [0, 0, 0], properties: {target: {a: 1}, path: [1, 2]}}]});`);
    assert.equal(run('JSON.stringify([got.target, got.path])'), '[{"a":1},[1,2]]');
});

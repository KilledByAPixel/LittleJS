import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// full pass 3 before 1.30: the fixes a headless test can hold

async function load3D()
{
    const engine = loadEngine();
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}

test('a ray starting on a block face and going away from it misses the block, either way along the axis', async () =>
{
    const { run } = await load3D();
    run(`var map = new VoxelMap(vec3(), vec3(8, 1, 1)); map.setVoxel(vec3(5, 0, 0), 1); map.setVoxel(vec3(2, 0, 0), 1);
        var hit = (x, d)=> map.raycast(new Ray3D(vec3(x, .5, .5), vec3(d, 0, 0)))?.distance ?? null;`);
    assert.equal(run('hit(5, -1)'), 2, 'from the low face of block 5 going down, block 2 two units on, not 5 at 0');
    assert.equal(run('hit(3, 1)'), 2, 'from the high face of block 2 going up, block 5 two units on');
    assert.equal(run('hit(6, 1)'), null, 'leaving block 5 by its high face, nothing');
    assert.equal(run('hit(6, -1)'), 0, 'going into block 5 from its high face, at once');
});

test('a 3D level property of null takes the default, as any value of the wrong type does', async () =>
{
    const { run } = await load3D();
    run(`var got; level3DAddType('Thing', (pos, p)=> { got = p; }, {size: vec3(1, 2, 3), tag: 'a', data: {a: 1}});
        level3DLoad({objects: [{id: 1, type: 'Thing', pos: [0, 0, 0], properties: {data: null, tag: null}}]});`);
    assert.equal(run('JSON.stringify([got.data, got.tag])'), '[{"a":1},"a"]');
});

test('an OBJ face with a uv or normal index the file does not have is refused, not a TypeError', async () =>
{
    const { run } = await load3D();
    const error = run(`(()=> { try { parseOBJ('v 0 0 0\\nv 1 0 0\\nv 0 1 0\\nf 1/5 2/5 3/5'); return 'none'; }
        catch (e) { return e.name + ' ' + e.message; } })()`);
    assert.ok(!error.startsWith('TypeError'), error);
    assert.match(error, /uv or normal index/);
});

test('a particle effect on a child emitter turns it from its parent, its localAngle the effect\'s angle', async () =>
{
    const { run } = await load3D();
    const local = run(`(()=> {
        const parent = new EngineObject(vec2(), vec2(1)); parent.angle = 1;
        const emitter = new ParticleEmitter(vec2()); parent.addChild(emitter, vec2(), .5);
        const effect = particleEffectSanitize({settings: {angle: .25}});
        particleEffectApply(emitter, effect);
        parent.updateTransforms();
        return [emitter.localAngle, emitter.angle]; })()`);
    assert.ok(Math.abs(local[0] - .25) < 1e-9 && Math.abs(local[1] - 1.25) < 1e-9, String(local));
});

test('a held slider destroyed by its onUpdate stops following the mouse and calling onChange', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run('new UISystemPlugin');
    const changes = run(`(()=> {
        let changes = 0, held = false;
        const slider = new UISlider(vec2(), vec2(400, 50)); engineStep();
        slider.onChange = ()=> ++changes;
        slider.onUpdate = ()=> held && slider.destroy();
        const at = (x, state)=> { mousePosScreen = slider.nativePos.add(vec2(x - 500, 0)); inputData[0][0] = state;
            engineStep(); };
        at(500, 3); held = true; at(600, 1); at(700, 1);
        return changes; })()`);
    assert.equal(changes, 0);
});

// a standard gamepad, its sticks and buttons set by the test
const pad = { mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, ()=> ({pressed: false, value: 0})) };
function loadPad()
{
    const engine = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    engine.context.screenToWorld = engine.context.screenToWorldDelta = (v)=> v; // no camera here
    return { ...engine, poll: ()=> engine.run('inputUpdate(); inputUpdatePost();') };
}

test('the gamepad dead zone is round: a diagonal reads as a straight push of its length does, at its own angle', () =>
{
    const { run, poll } = loadPad();
    pad.axes = [.3, .3, 0, 0]; // .42 out, past the .3 dead zone
    poll();
    const diagonal = JSON.parse(run('JSON.stringify(gamepadStick(0, 0))'));
    pad.axes = [Math.hypot(.3, .3), 0, 0, 0];
    poll();
    const straight = run('gamepadStick(0, 0).x');
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - straight) < 1e-9, `${JSON.stringify(diagonal)} ${straight}`);
    assert.ok(Math.abs(diagonal.x + diagonal.y) < 1e-9, 'pointing down right at 45 degrees, y up');
    pad.axes = [.5, .35, 0, 0];
    poll();
    const angle = run('gamepadStick(0, 0).angle()'), want = Math.atan2(.5, -.35); // engine angles: 0 up, clockwise
    assert.ok(Math.abs(angle - want) < 1e-9, `${angle} is not ${want}`);
    pad.axes = [.2, 0, 0, 0];
    poll();
    assert.equal(run('gamepadStick(0, 0).length()'), 0, 'inside the dead zone');
    pad.axes = [0, 0, 0, 0];
});

test('a gamepad button cleared while held stays up until it is let go, as a key does', () =>
{
    const { run, poll } = loadPad();
    pad.buttons[0].pressed = true;
    poll();
    assert.equal(run('gamepadIsDown(0, 0)'), true);
    run('inputClearKey(0, 1)');
    poll(); poll();
    assert.deepEqual([run('gamepadIsDown(0, 0)'), run('gamepadWasPressed(0, 0)')], [false, false], 'held, but cleared');
    pad.buttons[0].pressed = false;
    poll();
    pad.buttons[0].pressed = true;
    run('inputUpdate()'); // read before inputUpdatePost, which ends the frame's presses
    assert.deepEqual([run('gamepadIsDown(0, 0)'), run('gamepadWasPressed(0, 0)')], [true, true], 'pressed again');
    run('inputUpdatePost()');
    pad.buttons[0].pressed = false;
});

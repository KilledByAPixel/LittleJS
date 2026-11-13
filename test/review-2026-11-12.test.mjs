import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// The external review of 2026-11-12, and two left from full pass 5: a D-pad button held as touch takes over is let
// go, a body grown in its collision callback meets what it grew into, the UI context is put back when a widget throws,
// the editor draws over the light system, and the mesh builders round a fraction of a side down with a warning

test('a D-pad button held on a real gamepad as the touch gamepad takes over is let go', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const pad = {mapping: 'standard', axes: [0, 0, 0, 0],
            buttons: Array.from({length: 17}, ()=> ({pressed: false, value: 0}))};
        const { run } = loadEngine({window: {ontouchstart: null}, navigator: {getGamepads: ()=> [pad]}}, '', file);
        run('touchGamepadInit = ()=> {}; setTouchGamepadEnable(true); setTouchGamepadCenterButtonSize(50)');
        pad.buttons[12] = {pressed: true, value: 1};
        run('inputUpdate(); inputUpdatePost()');
        assert.equal(run('gamepadIsDown(12, 0)'), true, file + ': held on the real gamepad');
        pad.buttons[12] = {pressed: false, value: 0};
        // touched before the real gamepad is read again
        run(`paused = true; touchGamepadPointerDown({pointerType: 'touch', pointerId: 1, preventDefault(){}},
            {setPointerCapture(){}}); paused = false; inputUpdate()`);
        assert.equal(run('touchGamepadTimer.isSet()'), true, file + ': the touch gamepad has it');
        assert.equal(run('gamepadWasReleased(12, 0)'), true, file + ': let go as touch takes over');
        run('inputUpdatePost(); inputUpdate()');
        assert.equal(run('gamepadIsDown(12, 0)'), false, file + ': and stays up');
    }
});

test('a body grown in its collision callback meets the solids it grew into, with the grid and without', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    for (const grid of [false, true])
    {
        const { run } = loadEngine({}, '', file);
        const contacts = run(`setHeadlessMode(true); new Render3DPlugin; setGravity(vec2());
            engineCollideGridMin = ${grid ? 0 : Infinity};
            const make = (name, x)=>
            {
                const o = new EngineObject3D(vec3(x, 0, 0), render3D.boxMesh);
                o.name = name; o.mass = 0; o.setCollision(true, true, false); o.collideWithObject = ()=> false;
                return o;
            };
            const grow = make('grow', 0), edge = make('edge', 4), player = make('player', 0);
            player.mass = 1;
            const contacts = [];
            player.collideWithObject = (other)=>
            {
                contacts.push(other.name);
                other === grow && (player.size3D = vec3(10));
                return false;
            };
            engineObjectsUpdate();
            contacts.join()`);
        assert.equal(contacts, 'grow,edge', `${file}, grid ${grid}`);
    }
});

test('a UI widget that throws while drawing leaves the UI context as it found it', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const result = run(`new UISystemPlugin;
        let depth = 0;
        uiSystem.uiContext = {save: ()=> ++depth, restore: ()=> --depth}; // headless has no canvas
        const widget = new UIObject(vec2(), vec2(10));
        widget.render = ()=> { throw new Error('widget'); };
        let thrown = '';
        try { pluginList.at(-1).render(); } catch (e) { thrown = e.message; }
        [thrown, depth]`);
    assert.deepEqual([...result], ['widget', 0]);
});

test('the editor draws after the plugins, so the light system does not darken it', ()=>
{
    const read = (path)=> readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    const engine = read('src/engine.js');
    const plugins = engine.indexOf('pluginList.forEach(plugin=>plugin.render?.());');
    const editor = engine.indexOf('editorRenderPost();');
    assert.ok(plugins > 0 && editor > plugins, 'called after the plugins draw');
    const { run } = loadEngine();
    assert.equal(run('pluginList.some((p)=> p.update === editorUpdate && p.render)'), false,
        'and not as a plugin of its own');
    assert.equal(run('typeof editorRenderPost'), 'function');
    assert.equal(loadEngine({}, '', 'littlejs.release.js').run('typeof editorRenderPost'), 'function',
        'stubbed in release');
});

test('mesh builders round a fraction of a count down with a warning, so a sphere is never left open', ()=>
{
    const warnings = [];
    const { run } = loadEngine({ console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    const result = run(`setHeadlessMode(true); new Render3DPlugin;
        const box = (m)=> { const b = m.getBounds(); return [b.min.y, b.max.y].map((v)=> +v.toFixed(3)); };
        const same = (a, b)=> a.points.length === b.points.length;
        JSON.stringify({sphere: box(buildSphere(1, 8, 4.5)), same: same(buildSphere(1, 8, 4.5), buildSphere(1, 8, 4)),
            capsule: box(buildCapsule(1, 2, 8, 2.5)), torus: same(buildTorus(1, .3, 8, 6.5), buildTorus(1, .3, 8, 6)),
            whole: same(buildSphere(1, 8, 4), buildSphere(1, 8, 4))})`);
    assert.deepEqual(JSON.parse(result), {sphere: [-.5, .5], same: true, capsule: [-1, 1], torus: true, whole: true});
    assert.ok(warnings.some((w)=> w.includes('rings 4.5')), 'says so: ' + warnings);
    assert.ok(warnings.some((w)=> w.includes('tube sides 6.5')), 'says so: ' + warnings);
    assert.equal(warnings.filter((w)=> w.includes(' 4 down')).length, 0, 'not for a whole number');
});

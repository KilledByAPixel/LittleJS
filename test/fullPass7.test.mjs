import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 7 of 2026-11-13: a level's scene block does not carry into the next level, and the lows: a video on a
// blurred window, a held tool when the editor closes, counts with no end, a bullet ending on a face, the touch
// gamepad hand over in any slot, property names every object has, and a light system made again

test('a level with no scene block shows the scene the game set, not the last level\'s', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            render3D.fogStart = 10; render3D.fogEnd = 20; render3D.shadows = false;
            const sky = render3D.sky, sun = render3D.sunDirection.copy();
            level3DLoad({scene: {fog: [1, 2], shadows: true, sky: ['#ff0000', '#00ff00', '#0000ff'],
                sunDirection: [1, 0, 0], lensFlare: true}, objects: []});
            const during = [render3D.fogEnd, render3D.shadows, render3D.sky !== sky, level3DSunHasFlare()];
            level3DLoad({objects: []});
            JSON.stringify({during, after: [render3D.fogStart, render3D.fogEnd, render3D.shadows, render3D.sky === sky,
                render3D.sunDirection.subtract(sun).length(), level3DSunHasFlare()]})`));
        assert.deepEqual(result.during, [2, true, true, true], file + ': the level\'s block');
        assert.deepEqual(result.after, [10, 20, false, true, 0, false], file + ': the game\'s scene again');
    }
});

test('a blurred window mutes a video and leaves it playing, a hidden page pauses it', ()=>
{
    const document = { hidden: false, addEventListener() {}, hasFocus: ()=> true, body: { appendChild() {} },
        createElement: ()=> ({style: {}, paused: true, muted: false, currentTime: 0, duration: 10,
            pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
            remove() {}, removeAttribute() {}, load() {}}) };
    const { run } = loadEngine({ document });
    run('setHeadlessMode(true); setSoundPauseWhenBlurred(true)');
    const states = JSON.parse(run(`new UISystemPlugin; var a = new UIVideo(vec2(), vec2(100), 'a.mp4', false); a.play();
        const state = ()=> [a.isPlaying(), a.video.muted];
        document.hasFocus = ()=> false; uiVideosPageChange(); const blurred = state();
        var b = new UIVideo(vec2(), vec2(100), 'b.mp4', false); b.play(); b.update(); const startedBlurred = b.video.muted;
        document.hasFocus = ()=> true; uiVideosPageChange(); const back = [...state(), b.video.muted];
        document.hidden = true; uiVideosPageChange(); const hidden = state();
        document.hidden = false; uiVideosPageChange();
        JSON.stringify({blurred, startedBlurred, back, hidden, shown: state()})`));
    assert.deepEqual(states, {blurred: [true, true], startedBlurred: true, back: [true, false, false],
        hidden: [false, false], shown: [true, false]});
});

test('closing the editor with a game\'s tool held gives the tool its release, a digit then is taken', async ()=>
{
    const { run } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const step = ()=> run('engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;');
    run(`var map = { width: 3, height: 2, tilewidth: 16, tileheight: 16, tilesets: [{ firstgid: 1, source: 't.tsx' }],
            layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [0, 0, 0, 0, 0, 0] }] };
        var layers = tileLayersLoad(map, undefined, 0, 2);
        levelEditor.open(); var log = [];
        levelEditor.addTool('Dots', { onPress() { log.push('press'); }, onRelease() { log.push('release'); } });
        levelEditor.tool = 'Dots';
        mousePosScreen = worldToScreen(vec2(1.5, .5)); editorMouseOnPanel = false; inputData[0][0] = 3;`);
    step();
    run('inputData[0][0] = 1; var before = [debugPhysics, debugParticles, debugRaycast]; inputData[0].Digit3 = 3;');
    step();
    const views = run('JSON.stringify([debugPhysics, debugParticles, debugRaycast]) === JSON.stringify(before)');
    run('levelEditor.close()');
    assert.deepEqual(JSON.parse(run('JSON.stringify({log, open: editorIsOpen, held: editorToolHeld})')),
        {log: ['press', 'release'], open: false, held: false});
    assert.equal(views, true, 'the digit changed no debug view');
});

test('counts with no end, and formatTime of -Infinity', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        const ok = (mesh)=> mesh.points.every((p)=> isFinite(p.x + p.y + p.z));
        JSON.stringify([ok(buildSphere(1, Infinity, Infinity)), ok(buildCapsule(1, 2, Infinity, Infinity)),
            ok(buildTorus(1, .3, Infinity, Infinity)), ok(buildLathe([[1, 0], [1, 1]], Infinity)),
            formatTime(-Infinity), formatTime(-.5), formatTime(-61)])`));
    assert.deepEqual(result, [true, true, true, true, '0:00', '0:00', '-1:01']);
});

test('a bullet whose move ends exactly on a tile face is stopped and asked in that frame', ()=>
{
    for (const [pos, velocity] of [['vec2(8, 5.5)', 'vec2(1, 0)'], ['vec2(4.5, 2)', 'vec2(0, -.5)']])
    {
        const { run } = loadEngine();
        const result = JSON.parse(run(`setHeadlessMode(true); setGravity(vec2());
            var layer = new TileCollisionLayer(vec2(), vec2(20, 10), tile(), 0, false);
            for (let y = 0; y < 10; ++y) layer.setCollisionData(vec2(10, y));
            for (let x = 0; x < 20; ++x) layer.setCollisionData(vec2(x, 0));
            var bullet = new EngineObject(${pos}, vec2(.2));
            bullet.setCollision(false, false); bullet.isBullet = true; bullet.damping = 1;
            bullet.velocity = ${velocity};
            var asked = []; bullet.collideWithTile = ()=> (asked.push(engineObjectsUpdateCount), true);
            engineObjectsUpdate(); engineObjectsUpdate();
            JSON.stringify({asked, inWall: !!tileCollisionTest(bullet.pos), x: bullet.pos.x, y: bullet.pos.y})`));
        assert.ok(result.asked.length && !result.inWall, JSON.stringify(result));
        assert.ok(result.x < 10 && result.y > 1, 'stopped short of the face: ' + JSON.stringify(result));
    }
});

test('a touch button held as a real gamepad in slot 1 takes over is released on it, and the pad\'s on a take back', ()=>
{
    const pad = { mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) };
    const { run } = loadEngine({ window: { ontouchstart: null }, navigator: { getGamepads: ()=> [null, pad] } });
    run(`touchGamepadInit = ()=> {}; setTouchGamepadEnable(true); setTouchGamepadDisplayTime(3);
        touchGamepadTimer.set(); touchGamepadButtons[0] = touchGamepadButtonsPressed[0] = 1;
        touchGamepadPointerRole.set(7, 'face0'); inputUpdate(); inputUpdatePost(); inputUpdate(); inputUpdatePost()`);
    pad.buttons[3] = { pressed: true, value: 1 };
    run('inputUpdate()');
    assert.equal(run('gamepadPrimary'), 1);
    assert.equal(run('gamepadWasReleased(0)'), true, 'touch A let go on the pad the game reads');
    run('inputUpdatePost()');
    pad.buttons[3] = { pressed: false, value: 0 };
    pad.buttons[1] = { pressed: true, value: 1 };
    run('inputUpdate(); inputUpdatePost()');
    assert.equal(run('gamepadIsDown(1, 1)'), true, 'B held on the real pad');
    run(`touchGamepadHandedOver = false; touchGamepadTimer.set(); touchGamepadPointerRole.set(8, 'face2');
        touchGamepadButtons[2] = touchGamepadButtonsPressed[2] = 1;`);
    pad.buttons[1] = { pressed: false, value: 0 };
    run('inputUpdate()');
    assert.deepEqual([run('gamepadIsDown(1, 1)'), run('gamepadWasReleased(1, 1)')], [false, true],
        'the real pad\'s B is let go as touch takes back over');
});

test('a property named like a member of every object is kept, and __proto__ is a property, in 3D and Tiled', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        let seen;
        level3DAddType('P', (pos, properties)=> (seen = properties, new EngineObject3D(pos)), {});
        level3DLoad({objects: [{type: 'P',
            properties: JSON.parse('{"constructor": "c", "toString": 5, "__proto__": {"x": 1}}')}]});
        let tiled;
        objectLayersAddType('Q', (pos)=> (tiled = new EngineObject(pos)), {});
        objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            objects: [{id: 1, type: 'Q', x: 0, y: 0, properties: [{name: '__proto__', value: 'p'}]}]}]});
        JSON.stringify({three: [seen.constructor, seen.toString, seen.x ?? null, Object.keys(seen).sort().join()],
            tiled: [tiled instanceof EngineObject, Object.getOwnPropertyDescriptor(tiled, '__proto__')?.value]})`));
    assert.deepEqual(result.three, ['c', 5, null, '__proto__,constructor,toString']);
    assert.deepEqual(result.tiled, [true, 'p'], 'the object is still what it was made, its __proto__ a property');
});

test('a light system made again in a release build keeps the sun', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    assert.equal(run(`setHeadlessMode(true); new LightSystemPlugin; const sun = new DirectionalLight();
        new LightSystemPlugin; lightSystem.directionalLight === sun`), true);
});

// the improvements of the same pass

test('restarting a game many times leaves every engine list the size it was after the first', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run(`new Render3DPlugin;
        var restart = ()=>
        {
            engineObjectsDestroy();
            const layer = new TileCollisionLayer(vec2(), vec2(8), tile(), 0, false);
            layer.setCollisionData(vec2(1, 0));
            for (let i = 0; i < 5; ++i)
            {
                const o = new EngineObject(vec2(i, 3), vec2(1)); o.setCollision();
                const child = new EngineObject(); o.addChild(child);
            }
            new ParticleEmitter(vec2(2, 2));
            const solid = new EngineObject3D(vec3(), render3D.boxMesh); solid.setCollision(); solid.mass = 0;
            new HeightMap([[0, 0], [0, 0]], vec2(4), 1, undefined, vec3(0, 0, 40));
            engineStep(3);
        };
        var sizes = ()=> JSON.stringify([engineObjects.length, engineObjectsCollide.length, tileCollisionLayers.length,
            render3DLevel.length, pluginList.length, glShaderObjects.length]);
        restart(); var first = sizes();
        for (let i = 0; i < 40; ++i) restart();`);
    assert.equal(run('sizes()'), run('first'));
});

test('a key name that does not start with a capital, and a color where drawLine takes a width, assert', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    for (const code of [`keyIsDown('space')`, `keyWasPressed('keyA')`, `keyWasReleased('arrowUp')`])
        assert.throws(()=> run(code), /with a capital/, code);
    assert.equal(run(`keyIsDown('Space') || keyIsDown('Digit1') || keyIsDown('F1')`), false, 'real codes pass');
    assert.throws(()=> run('drawLine(vec2(), vec2(1), RED)'), /width must be a number/);
});

test('isIntersecting, in plain numbers now, gives what it gave before on lines and boxes of every kind', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`
        // the Liang-Barsky test as it was, with vectors
        const before = (start, end, pos, size)=>
        {
            const boxMin = pos.subtract(size.scale(.5)), boxMax = boxMin.add(size), delta = end.subtract(start);
            const a = start.subtract(boxMin), b = start.subtract(boxMax);
            const p = [-delta.x, delta.x, -delta.y, delta.y], q = [a.x, -b.x, a.y, -b.y];
            let tMin = 0, tMax = 1;
            for (let i = 4; i--;)
            {
                if (p[i])
                {
                    const t = q[i] / p[i];
                    if (p[i] < 0) { if (t > tMax) return false; tMin = max(t, tMin); }
                    else { if (t < tMin) return false; tMax = min(t, tMax); }
                }
                else if (q[i] < 0) return false;
            }
            return true;
        };
        const random = new RandomGenerator(7), pick = ()=> random.int(4) ? random.float(-3, 3) : random.int(-2, 3);
        let differ = 0, hits = 0;
        for (let i = 0; i < 20000; ++i)
        {
            const args = [vec2(pick(), pick()), vec2(pick(), pick()), vec2(pick(), pick()), vec2(abs(pick()), abs(pick()))];
            const now = isIntersecting(...args);
            now !== before(...args) && ++differ;
            hits += now;
        }
        JSON.stringify({differ, hits})`));
    assert.equal(result.differ, 0);
    assert.ok(result.hits > 1000 && result.hits < 19000, 'both answers come up: ' + result.hits);
});

test('the gradient circle draws its rim where it did, from points it keeps', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(false); glEnable = true; glContext = {};
        let drawn = []; glDrawColoredPoints = (points, colors)=> drawn.push([points.map((p)=> [p.x, p.y]), [...colors]]);
        drawEllipseGradient(vec2(1, 2), vec2(4, 2), RED, BLUE, .3, true, false);
        drawEllipseGradient(vec2(1, 2), vec2(4, 2), RED, BLUE, .3, true, false);
        const offset = drawEllipseGradientOffset - 2, sides = glCircleSides, c = cos(-.3), s = sin(-.3);
        const rim = (a)=> { const lx = sin(a) * 2, ly = cos(a); return [1 + lx*c - ly*s, 2 + lx*s + ly*c]; };
        const expected = (offset)=>
        {
            const points = [rim((offset%sides)/sides*PI*2)];
            for (let i = sides; i-- > 0;)
                points.push([1, 2], rim(((i+offset)%sides)/sides*PI*2));
            return points;
        };
        JSON.stringify({ok: [0, 1].map((k)=> JSON.stringify(drawn[k][0]) === JSON.stringify(expected(offset + k))),
            colors: drawn[0][1].length === sides*2 + 1 && drawn[0][1][1] === RED.rgbaInt() &&
                drawn[0][1][0] === BLUE.rgbaInt()})`));
    assert.deepEqual(result, {ok: [true, true], colors: true});
});

test('Back from a prefab makes each of its instances once, speech is not queued while the page is paused, and the ' +
    'first person camera looks with its dragButton', async ()=>
{
    {
        const { run } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
        run('setHeadlessMode(true)');
        await run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
        const made = run(`var level = {littlejs3D: 1, prefabs: {Hut: {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}},
                objects: [1, 2, 3, 4, 5].map((id)=> ({id, type: 'Hut', pos: [id * 3, 0, 0]}))};
            level3DLoad(level); levelEditor.open();
            editor3DPrefabEnter(1);
            editor3DChange((list)=> { list[0].pos = [0, 1, 0]; }); editor3DStrokeEnd();
            let made = 0; const makeParts = Prefab3D.prototype.makeParts;
            Prefab3D.prototype.makeParts = function() { ++made; return makeParts.call(this); };
            editor3DPrefabBack();
            Prefab3D.prototype.makeParts = makeParts;
            made`);
        assert.equal(made, 5, 'one for each instance');
    }
    {
        let spoken = 0;
        class SpeechSynthesisUtterance {}
        const speechSynthesis = { speak: ()=> ++spoken, cancel() {}, pause() {}, resume() {} };
        const document = { hidden: true, addEventListener() {}, hasFocus: ()=> true };
        const { run } = loadEngine({ speechSynthesis, SpeechSynthesisUtterance, document });
        run(`speak('hello')`);
        assert.equal(spoken, 0, 'hidden, it says nothing');
        run(`document.hidden = false; speak('hello')`);
        assert.equal(spoken, 1);
    }
    {
        const { run } = loadEngine();
        run('setHeadlessMode(true); new Render3DPlugin');
        const turned = run(`const camera = new FirstPersonCamera3D(vec3()); camera.lockPointer = false;
            camera.dragButton = 2; const yaw = camera.yaw;
            mouseDeltaScreen = vec2(50, 0); inputData[0][0] = 1; camera.updateCamera?.() ?? camera.update();
            const left = camera.yaw === yaw;
            inputData[0][0] = 0; inputData[0][2] = 1; camera.updateCamera?.() ?? camera.update();
            JSON.stringify([left, camera.yaw !== yaw])`);
        assert.deepEqual(JSON.parse(turned), [true, true], 'the left button does nothing, the right looks');
    }
});

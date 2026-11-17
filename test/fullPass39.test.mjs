import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// Full pass 39 of 2026-11-17: a glTF one-shot turned back, set to loop or stopped while played with a blend each
// update; a Timer of whole frames; the solid follow-down and a callback, a wall or a coin; a MeshCollider lift and a
// settle; setProperty with list items and a class with an accessor; a wrong list item's shared default; 2D tool
// presses taken back or released first; an atlas name warning for groups left out; a release build's negative sound
// rate; a second player's pad; the keyboard under the input capture; the module build's imports

async function engine(extra={}, with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} },
        ()=> globalThis.onUpdate?.(), ()=> {}, ()=> {}, ()=> {})`);
    return e;
}

const boxes = `globalThis.makeBox = (pos, size, rot, mass=0)=> { const b = new EngineObject3D(pos, render3D.boxMesh);
        b.size3D = size; rot && (b.rotation3D = rot); b.setCollision(); b.mass = mass; return b; };
    globalThis.makeBody = (pos)=> { const b = new EngineObject3D(pos); b.size3D = vec3(1); b.setCollision();
        b.mass = 1; return b; };`;

test('a glTF one-shot played with a blend each update goes on when turned backward or to loop, and starts again'
    + ' after stop, while the same way again holds it (G1, G3)', ()=>
{
    const { run } = loadEngine();
    const r = JSON.parse(run(`(()=>
    {
        const part = new GLTFPart('box', buildBox(vec3(1)), WHITE, undefined, false);
        part.node = 0;
        const tree = {nodes: [{name: 'root'}], parents: [undefined], restInverse: [new Matrix4], restPose: []};
        const channel = ()=> ({node: 0, path: 'translation', interpolation: 'LINEAR',
            times: new Float32Array([0, 1]), values: new Float32Array([0, 0, 0, 0, 5, 0]), components: 3});
        const model = new GLTFModel([part], [new GLTFAnimation('door', [channel()])], tree);
        const o = model.createObject();
        timeDelta = 1/60;
        const run = (n, loop, speed)=> { for (let f = 0; f < n; ++f) { o.play('door', loop, speed, .2); o.update();
            ++frame; } return +o.parts[0].pos3D.y.toFixed(3); };
        const opened = run(90, false, 1), held = run(30, false, 1), closed = run(90, false, -1);
        const poses = new Set;
        for (let f = 0; f < 60; ++f) { o.play('door', true, 1, .2); o.update(); ++frame;
            poses.add(o.animationTime.toFixed(3)); }
        o.stop();
        o.play('door', false, 1, .2);
        const afterStop = [o.animationPlaying, o.animationTime];
        o.destroy(true);
        return JSON.stringify({opened, held, closed, poses: poses.size, afterStop});
    })()`));
    assert.equal(r.opened, 5);
    assert.equal(r.held, 5, 'the same way again holds it');
    assert.equal(r.closed, 0, 'turned backward it closes');
    assert.ok(r.poses > 30, 'set to loop it plays: ' + r.poses);
    assert.deepEqual(r.afterStop, [true, 0], 'after stop it starts again');
});

test('a Timer of a whole number of frames set again on elapse keeps an even beat (K1)', async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(await run(`(async ()=>
    {
        const lengths = [.05, .1, .3], timers = lengths.map(()=> new Timer), gaps = lengths.map(()=> new Set);
        const last = lengths.map(()=> 0);
        onUpdate = ()=> timers.forEach((t, i)=>
        {
            if (t.isSet() && !t.elapsed()) return;
            t.isSet() && gaps[i].add(frame - last[i]); last[i] = frame; t.set(lengths[i]);
        });
        for (let f = 0; f < 3600; ++f) engineStep(1);
        return JSON.stringify(gaps.map((g)=> [...g]));
    })()`));
    assert.deepEqual(r, [[3], [6], [18]]);
});

test('the solid follow-down lets a callback have the last word, and passes a wall or a coin to reach the ramp'
    + ' (C1, C2)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);' + boxes);
    for (const answer of [true, false])
    {
        const r = JSON.parse(run(`(()=>
        {
            let B, calls = 0;
            makeBox(vec3(3, -.5, 0), vec3(6, 1, 6));
            const lava = makeBox(vec3(-2, -.58, 0), vec3(4, 1, 6));
            lava.collideWithObject = (o)=> { if (o === B) { ++calls; o.pos3D = vec3(5, 3, 0); o.velocity3D = vec3(); }
                return ${answer}; };
            B = makeBody(vec3(1, .5, 0));
            for (let f = 0; f < 20; ++f) engineObjectsUpdate();
            let at;
            for (let f = 0; f < 40 && !at; ++f)
            {
                B.velocity3D.x = -.1;
                const before = calls;
                engineObjectsUpdate();
                calls > before && (at = [B.pos3D.x, B.pos3D.y, B.groundObject === lava]);
            }
            engineObjectsDestroy();
            return JSON.stringify(at);
        })()`));
        assert.deepEqual(r, [5, 3, false], `lava answering ${answer}: respawned where the callback put it`);
    }
    const stomp = JSON.parse(run(`(()=>
    {
        makeBox(vec3(3, -.5, 0), vec3(6, 1, 6));
        makeBox(vec3(-3, -1.5, 0), vec3(6, 1, 6));
        const E = makeBox(vec3(-.6, -.5, 0), vec3(1, .9, 1), undefined, 1);
        const B = makeBody(vec3(1, .5, 0));
        let calls = 0;
        E.collideWithObject = (o)=> { if (o === B && o.pos3D.y > E.pos3D.y + .5) { ++calls; o.velocity3D.y = .25; }
            return true; };
        for (let f = 0; f < 20; ++f) engineObjectsUpdate();
        let vy;
        for (let f = 0; f < 40 && vy === undefined; ++f)
        {
            B.velocity3D.x = -.1;
            const before = calls;
            engineObjectsUpdate();
            calls > before && (vy = B.velocity3D.y);
        }
        engineObjectsDestroy();
        return JSON.stringify(vy);
    })()`));
    assert.ok(stomp > .2, 'the stomp bounce is kept: ' + stomp);
    const extras = {
        wall: `()=> makeBox(vec3(-2, 0, 2), vec3(20, 8, 1))`,
        coin: `()=> { const c = makeBox(vec3(-.6, -.1, 0), vec3(.3, .3, .3)); c.collideWithObject = ()=> false;
            return c; }`,
    };
    for (const [name, extra] of Object.entries(extras))
        for (const bodyFirst of [false, true])
        {
            const air = +run(`(()=>
            {
                const L = 10, c = Math.cos(.3), s = Math.sin(.3);
                let B;
                ${bodyFirst ? 'B = makeBody(vec3(1.5, .6, 0));' : ''}
                (${extra})();
                makeBox(vec3(3, -.5, 0), vec3(6, 1, 6));
                makeBox(vec3(-L/2 * c + .5 * s, -L/2 * s - .5 * c, 0), vec3(L, 1, 6), vec3(0, 0, .3));
                ${bodyFirst ? '' : 'B = makeBody(vec3(1.5, .6, 0));'}
                const vz = '${name}' === 'wall' ? .02 : 0;
                for (let f = 0; f < 30; ++f) { B.velocity3D.z = vz; engineObjectsUpdate(); }
                let air = 0;
                for (let f = 0; f < 60; ++f)
                {
                    B.velocity3D.x = -.08; B.velocity3D.z = vz; engineObjectsUpdate();
                    B.groundObject || ++air;
                }
                engineObjectsDestroy();
                return air;
            })()`);
            assert.equal(air, 0, `${name} listed first${bodyFirst ? ', body first' : ''}`);
        }
});

test('a body on a MeshCollider lift going down, pushed by a crate, keeps the ground (C3)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);');
    for (const vy of [-.4, -.6])
        for (const crateFirst of [false, true])
        {
            const air = +run(`(()=>
            {
                const L = new MeshCollider(buildBox(vec3(12, 2, 6)), vec3(0, 1, 0));
                let C;
                const crate = ()=> { C = new EngineObject3D(vec3(1.2, 2.5, 0)); C.size3D = vec3(1); C.setCollision();
                    C.mass = 4; };
                ${crateFirst} && crate();
                const B = new EngineObject3D(vec3(0, 2.5, 0)); B.size3D = vec3(1); B.setCollision(); B.mass = 1;
                ${crateFirst} || crate();
                for (let f = 0; f < 10; ++f) engineObjectsUpdate();
                B.velocity3D.y = ${vy};
                let air = 0;
                for (let f = 0; f < 20; ++f)
                {
                    L.velocity3D = vec3(0, ${vy}, 0);
                    C.velocity3D.x = -.2; C.velocity3D.y = ${vy}; C.pos3D.x = B.pos3D.x + 1.05; C.pos3D.y = B.pos3D.y;
                    engineObjectsUpdate();
                    B.groundObject === L || ++air;
                }
                engineObjectsDestroy();
                return air;
            })()`);
            assert.equal(air, 0, `lift ${vy}${crateFirst ? ', crate first' : ''}`);
        }
});

test('edit3D.setProperty refuses a list item that leaves out a member of the default\'s, takes a class with an'
    + ' accessor given through it, and a wrong list item\'s shared default is said (D1, D2, O3)', async ()=>
{
    const { run } = await engine({}, true);
    const r = JSON.parse(run(`(()=>
    {
        const warned = [], warn = console.warn;
        console.warn = (text)=> warned.push(text);
        class Speed { constructor() { this._s = 3; } get speed() { return this._s; } set speed(v) { this._s = v; }
            copy() { const s = new Speed; s._s = this._s; return s; } }
        class Same { constructor() { this.n = 1; } copy() { return this; } }
        level3DAddType('S', class extends EngineObject3D { constructor(pos) { super(pos); } },
            {stops: [{at: vec3(), wait: 1}], cfg: {stops: [{wait: 1}]}, acc: new Speed, same: [new Same]});
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'S', pos: [0, 0, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D, said = [];
        const tryIt = (name, value)=>
        {
            try { return edit.change((list)=> edit.setProperty(list[0], name, value)); }
            catch (e) { said.push(e.message.replace(/^Assert failed: setProperty: /, '')); }
        };
        tryIt('stops', [{at: vec3(1, 2, 3)}]);
        tryIt('cfg', {stops: [{}]});
        const acc = tryIt('acc', {speed: 9});
        edit.strokeEnd();
        const game = editor3DInstances.get(1).acc.speed;
        levelEditor.close();
        level3DLoad({littlejs3D: 1, objects: [{id: 2, type: 'S', pos: [0, 0, 0], properties: {same: ['x']}}]});
        console.warn = warn;
        return JSON.stringify({said, acc, game, shared: warned.filter((w)=> w.includes('same[0]') &&
            w.includes('gives back no new object')).length});
    })()`));
    assert.deepEqual(r.said, ['stops leaves out a member of its default, which the load would put back',
        'cfg leaves out a member of its default, which the load would put back']);
    assert.equal(r.acc, true);
    assert.equal(r.game, 9);
    assert.equal(r.shared, 1);
});

test('a 2D tool press taken back by the right button or Escape, or released first, gives the brush none of it (E3,'
    + ' E4)', async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(run(`(()=>
    {
        const map = {width: 4, height: 4, tilewidth: 16, tileheight: 16, nextobjectid: 1, nextlayerid: 3,
            orientation: 'orthogonal', layers: [{type: 'tilelayer', id: 1, name: 'ground', width: 4, height: 4,
            data: new Array(16).fill(1)}, {type: 'tilelayer', id: 2, name: 'top', width: 4, height: 4,
            data: new Array(16).fill(0)}]};
        tileLayersLoad(map); levelEditor.open();
        const rec = editorMapList.find((r)=> r.map === map), top = rec.layers[1];
        editorSelectLayer(top);
        const log = [];
        let onRelease = ()=> {};
        levelEditor.addTool('T', {onPress(at) { log.push('press' + (at.lastCell ? '@' : '')); },
            onDrag() { log.push('drag'); }, onRelease() { log.push('release'); onRelease(); }});
        editorBrush.tile = 6;
        mousePosScreen = worldToScreen(vec2(2.5, 2.5)); editorMouseScreen = mousePosScreen.copy();
        const out = {};
        for (const how of ['right', 'escape'])
        {
            levelEditor.tool = 'T'; editorUpdate();
            inputData[0][0] = 3; editorUpdate(); inputData[0][0] = 1; editorUpdate();
            how == 'right' ? (inputData[0][2] = 3) : (inputData[0][debugKey] = 3);
            editorUpdate(); inputData[0][2] = 0; inputData[0][debugKey] = 0;
            levelEditor.tool = undefined; inputData[0][0] = 1; editorUpdate(); editorUpdate();
            inputData[0][0] = 0; editorUpdate();
            out[how] = top.source.data.join('');
        }
        levelEditor.tool = 'T'; editorUpdate(); log.length = 0;
        inputData[0][0] = 3; editorUpdate(); inputData[0][0] = 1; editorUpdate();
        inputData[0][0] = 7; editorUpdate(); inputData[0][0] = 0; editorUpdate();
        out.again = log.join();
        onRelease = ()=> { levelEditor.tool = undefined; };
        log.length = 0;
        inputData[0][0] = 3; editorUpdate(); inputData[0][0] = 1; editorUpdate();
        inputData[0][0] = 7; editorUpdate(); inputData[0][0] = 1; editorUpdate(); inputData[0][0] = 0; editorUpdate();
        out.putDown = log.join();
        out.painted = top.source.data.join('');
        return JSON.stringify(out);
    })()`));
    assert.equal(r.right, '0000000000000000');
    assert.equal(r.escape, '0000000000000000');
    assert.equal(r.again, 'press,drag,release,press,release', 'the second press is given no last cell');
    assert.equal(r.putDown, 'press,drag,release', 'no press after a release that put the tool down');
    assert.equal(r.painted, '0000000000000000');
});

test('an atlas frame named as another sprite is said only for a sprite the atlas keeps (P1)', async ()=>
{
    const contextOf = (canvas)=> new Proxy({}, { get: (t, k)=> k === 'canvas' ? canvas :
        typeof k === 'string' ? ()=> ({}) : undefined, set: ()=> true });
    const { run } = loadEngine({
        Image: class { set src(v) { this.width = this.height = 256; Promise.resolve().then(()=> this.onload()); } },
        OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext()
            { return contextOf(this); } },
    });
    run('glEnable = false; engineInitialized = true; var warns = []; console.warn = (...a)=> warns.push(a.join(" "));');
    let x = 0, n = 0;
    const frame = (out)=> ({frame: {x: out ? 300 : (x += 8) % 240, y: 0, w: 8, h: 8}, rotated: false,
        spriteSourceSize: {x: 0, y: 0, w: 8, h: 8}, sourceSize: {w: 8, h: 8}});
    const load = async (out)=>
    {
        const frames = {};
        for (const name of ['run_0', 'run_1', 'run_2', 'run_1_0', 'run_1_1'])
            frames[name] = frame(name === out);
        run(`warns.length = 0; loadAtlas('b${n++}.png', ${JSON.stringify({frames})})`);
        await run('spritesReady()');
        return JSON.parse(run('JSON.stringify(warns.filter((w)=> w.includes("as another sprite is")))'));
    };
    assert.deepEqual(await load(), ['loadAtlas: frame 1 of run is named run_1 as another sprite is, which that name ' +
        'gives; read it as run.frame(1)']);
    assert.deepEqual(await load('run_1_1'), [], 'the other run_1 left out');
    assert.deepEqual(await load('run_2'), [], 'run left out');
});

test('a release build keeps a sound rate below 0 as 0 (K2)', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    const r = JSON.parse(run(`(()=>
    {
        const instance = new SoundInstance(Object.create(Sound.prototype), 1, -2, 0, false, true);
        const made = instance.rate;
        instance.setRate(-1);
        return JSON.stringify([made, instance.rate]);
    })()`));
    assert.deepEqual(r, [0, 0]);
});

test('a second player\'s pad gets no release for a button the first one held as it dropped out (I1)', ()=>
{
    const pad = ()=> ({ mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, ()=> ({ pressed: false, value: 0 })) });
    const pads = [pad(), pad()];
    const { run } = loadEngine({ navigator: { getGamepads: ()=> pads } });
    run('touchGamepadInit = ()=> {};');
    const step = ()=> { run('inputUpdate()'); const s = run(`JSON.stringify([gamepadPrimary,
        gamepadWasReleased(1, 0), gamepadWasReleased(1, 1)])`); run('inputUpdatePost()'); return JSON.parse(s); };
    pads[0].buttons[1].pressed = true;
    step();
    pads[1].buttons[0].pressed = true;
    step();
    pads[0] = null;
    assert.deepEqual(step(), [1, true, false], 'the lost pad reads the release, the other player\'s does not');
});

test('keys held under the input capture do not make the keyboard the last input device (I2)', ()=>
{
    const { run } = loadEngine();
    const r = run(`(()=>
    {
        touchGamepadInit = ()=> {};
        lastInputDevice = 'gamepad';
        inputCapture(true);
        inputData[0].KeyW = 1;
        inputUpdate();
        const captured = lastInputDevice;
        inputCapture(false);
        inputUpdate();
        return captured + ' ' + lastInputDevice;
    })()`);
    assert.equal(r, 'gamepad keyboard');
});

test('the module example build rewrites every import of the engine for its zip (B1)', ()=>
{
    const text = fs.readFileSync('examples/module/build.mjs', 'utf8');
    const body = text.slice(text.indexOf('function moduleFixStep'));
    const fixes = [...body.slice(0, body.indexOf('\n}')).matchAll(/code = code\.replace\((\/.*?\/g), *\n?\s*("[^"]*")\);/g)];
    const fix = (code)=> fixes.reduce((code, [, re, to])=> code.replace(eval(re), JSON.parse(to)), code);
    for (const line of ["import * as LJS from '../../dist/littlejs.esm.js';",
        "import { engineInit, vec2 } from '../../dist/littlejs.esm.js';",
        'import * as E from "../../dist/littlejs.esm.min.js";'])
        assert.match(fix(line), /from '\.\/littlejs\.esm\.min\.js'/, line);
    assert.equal(fix("import { Player } from '../player.js';"), "import { Player } from './player.js';");
});

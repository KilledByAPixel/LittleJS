import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// Full pass 40 of 2026-11-17: the solid follow-down with a callback that writes the speed, at a ramp's foot, by a
// solid its callback moved and onto one that is not solid itself; setProperty and the merge with an accessor class;
// an editor closed by a game's tool, key or onUpdate; a refused attach; the Timer's other readings; the 3D press let
// go and pressed again; a held glTF one-shot while the game is held; the module
// build's import forms

async function engine(with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); var seen = []; engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} },
        ()=> globalThis.onUpdate?.(), ()=> globalThis.onUpdatePost?.(), ()=> {}, ()=> {})`);
    return e;
}

const boxes = `globalThis.makeBox = (pos, size, rot, mass=0)=> { const b = new EngineObject3D(pos, render3D.boxMesh);
        b.size3D = size; rot && (b.rotation3D = rot); b.setCollision(); b.mass = mass; return b; };
    globalThis.makeBody = (pos)=> { const b = new EngineObject3D(pos); b.size3D = vec3(1); b.setCollision();
        b.mass = 1; return b; };
    globalThis.makeRamp = (x0, y0, L, slope)=> { const c = Math.cos(slope), s = Math.sin(slope);
        return makeBox(vec3(x0 - L/2 * c + .5 * s, y0 - L/2 * s - .5 * c, 0), vec3(L, 1, 6), vec3(0, 0, slope)); };`;

test('a body walking down a turned ramp keeps the ground with callbacks that write its speed, at the ramp\'s foot,'
    + ' and on a ramp that is not solid itself (C1, C2, C4)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);' + boxes);
    const walk = (bodyCallback, rampCallback, rampSolid=true)=> +run(`(()=>
    {
        const R = makeBox(vec3(0, 0, 0), vec3(20, 1, 3), vec3(0, 0, .3));
        R.isSolid = ${rampSolid};
        ${rampCallback ? `R.collideWithObject = ${rampCallback};` : ''}
        const B = makeBody(vec3(5 * Math.cos(.3), 5 * Math.sin(.3) + 1.2, 0));
        ${bodyCallback ? `B.collideWithObject = ${bodyCallback};` : ''}
        for (let f = 0; f < 30; ++f) engineObjectsUpdate();
        let air = 0;
        for (let f = 0; f < 60; ++f) { B.velocity3D.x = -.08; engineObjectsUpdate(); B.groundObject || ++air; }
        engineObjectsDestroy();
        return air;
    })()`);
    assert.equal(walk(), 0, 'plain');
    assert.equal(walk('function(o, push) { if (push.y > 0 && this.velocity3D.y < 0) this.velocity3D.y = 0; return true; }'),
        0, 'zeroes its fall in place');
    assert.equal(walk('function(o, push) { if (push.y > 0) this.velocity3D = vec3(this.velocity3D.x, 0, ' +
        'this.velocity3D.z); return true; }'), 0, 'zeroes its fall with a new vector');
    assert.equal(walk(undefined, '(o)=> { o.velocity3D.z += .001; return true; }'), 0, 'a conveyor ramp');
    assert.equal(walk(undefined, undefined, false), 0, 'a ramp that is not solid, the body solid');
    for (const order of ['ab', 'ba'])
    {
        const air = +run(`(()=>
        {
            const parts = [()=> makeRamp(0, 0, 10, .3),
                ()=> makeBox(vec3(-14, -10 * Math.sin(.3) - .5, 0), vec3(12, 1, 6))];
            (${order === 'ab'} ? parts : parts.reverse()).forEach((f)=> f());
            const B = makeBody(vec3(-3, -.4, 0));
            for (let f = 0; f < 40; ++f) engineObjectsUpdate();
            let air = 0;
            for (let f = 0; f < 120; ++f) { B.velocity3D.x = -.08; engineObjectsUpdate(); B.groundObject || ++air; }
            engineObjectsDestroy();
            return air;
        })()`);
        assert.equal(air, 0, `a ramp into a floor, order ${order}`);
    }
});

test('the follow-down does not land on a solid where its callback moved it from (C3)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);' + boxes);
    const r = JSON.parse(run(`(()=>
    {
        const R = makeBox(vec3(0, 0, 0), vec3(20, 1, 3), vec3(0, 0, .3));
        const B = makeBody(vec3(5 * Math.cos(.3), 5 * Math.sin(.3) + 1.2, 0));
        for (let f = 0; f < 30; ++f) engineObjectsUpdate();
        let moves = 0, landedOnMoved = 0;
        R.collideWithObject = ()=> { ++moves; R.pos3D = R.pos3D.add(vec3(0, -5, 0)); return true; };
        for (let f = 0; f < 3; ++f)
        {
            B.velocity3D.x = -.08;
            const before = moves;
            engineObjectsUpdate();
            moves > before && B.groundObject === R && B.pos3D.y > R.pos3D.y + 3 && ++landedOnMoved;
        }
        engineObjectsDestroy();
        return JSON.stringify({moves, landedOnMoved});
    })()`));
    assert.ok(r.moves > 0, 'the callback ran');
    assert.equal(r.landedOnMoved, 0);
});

test('an editor closed by a game tool\'s press, a game key or the game\'s onUpdate gives the game none of that'
    + ' frame\'s input, and the 2D editor edits nothing after (D2, E1)', async ()=>
{
    const tileMap = `{ width: 3, height: 2, tilewidth: 16, tileheight: 16, layers: [
        { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 0, 0, 0, 0, 2] }] }`;
    const clearPressed = `for (const device of inputData) for (const i in device) device[i] &= 1;`;
    {
        const { run } = await engine(true);
        run(`onUpdatePost = ()=> { mouseWasPressed(0) && seen.push('click'); keyWasPressed('KeyP') && seen.push('P'); };
            level3DLoad({objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}); engineStep(2); levelEditor.open();
            levelEditor.addTool('PlayHere', { onPress() { levelEditor.close(); } });
            levelEditor.tool = 'PlayHere';
            editor3DCamera.pos = vec3(10, 20, 10); editor3DCamera.rotation = vec3(-PI / 2, 0, 0);
            mousePosScreen = mainCanvasSize.scale(.5); editor3DMouseOnPanel = false;
            engineStep(); inputData[0][0] = 3; engineStep(); ${clearPressed}
            inputData[0][0] = 0; levelEditor.open(); levelEditor.tool = undefined;
            levelEditor.addKey('KeyK', ()=> levelEditor.close());
            engineStep(); inputData[0].KeyK = 3; engineStep(); ${clearPressed}`);
        assert.equal(run('JSON.stringify([levelEditor.isOpen, seen])'), '[false,[]]', '3D');
    }
    {
        const { run } = await engine();
        const r = JSON.parse(run(`(()=>
        {
            onUpdatePost = ()=> mouseWasPressed(0) && seen.push('click');
            const map = ${tileMap};
            tileLayersLoad(map); levelEditor.open();
            levelEditor.addTool('PlayHere', { onPress() { levelEditor.close(); } });
            levelEditor.tool = 'PlayHere'; mousePosScreen = worldToScreen(vec2(1.5, .5)); editorMouseOnPanel = false;
            engineStep(); inputData[0][0] = 3; engineStep(); ${clearPressed} inputData[0][0] = 0;
            const toolClose = [levelEditor.isOpen, seen.length];
            levelEditor.tool = undefined; levelEditor.open(); editorBrush.tile = 6;
            levelEditor.onUpdate = ()=> mouseWasPressed(0) && levelEditor.close();
            engineStep(); inputData[0][0] = 3; engineStep(); ${clearPressed} inputData[0][0] = 0; engineStep();
            return JSON.stringify({toolClose, open: levelEditor.isOpen, seen, data: map.layers[0].data.join(''),
                stroke: !!editorStroke});
        })()`));
        assert.deepEqual(r.toolClose, [false, 0], '2D tool press');
        assert.equal(r.open, false);
        assert.deepEqual(r.seen, []);
        assert.equal(r.data, '100002', 'nothing painted after onUpdate closed it');
        assert.equal(r.stroke, false);
    }
});

test('a refused attach leaves the child with its old parent (O1)', ()=>
{
    for (const build of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', build);
        const r = run(`(()=>
        {
            setHeadlessMode(true);
            const a = new EngineObject(vec2()), b = new EngineObject(vec2()), c = new EngineObject(vec2());
            a.addChild(c);
            const dead = new EngineObject(vec2()); dead.destroy();
            const tries = [()=> dead.attach(c), ()=> c.attach(a)];
            for (const t of tries) try { t(); } catch { }
            return String(c.parent === a && a.children.includes(c) && !a.parent);
        })()`);
        assert.equal(r, 'true', build);
    }
});

test('a Timer reads the same end in elapsed, get, getPercent and toString (K1)', async ()=>
{
    const { run } = await engine();
    const r = JSON.parse(await run(`(async ()=>
    {
        const t = new Timer;
        let off = 0, n = 0;
        onUpdate = ()=>
        {
            if (t.isSet() && !t.elapsed()) return;
            if (t.isSet())
            {
                ++n;
                (t.get() < 0 || t.getPercent() < 1 || t < 0 || t.toString().includes('before')) && ++off;
            }
            t.set(.05);
        };
        for (let f = 0; f < 3600; ++f) engineStep(1);
        return JSON.stringify({n, off});
    })()`));
    assert.ok(r.n > 1000);
    assert.equal(r.off, 0);
});

test('a 3D tool press let go and pressed again is not made when the release put the tool down or closed the editor'
    + ' (E2)', async ()=>
{
    const { run } = await engine(true);
    run(`var level = {objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        var log = [], onRelease = ()=> {};
        levelEditor.addTool('Posts', { onPress(at) { log.push('press'); levelEditor.edit3D.place('Cylinder', at.pos); },
            onDrag() { log.push('drag'); }, onRelease() { log.push('release'); onRelease(); } });
        editor3DCamera.pos = vec3(10, 20, 10); editor3DCamera.rotation = vec3(-PI / 2, 0, 0);
        mousePosScreen = mainCanvasSize.scale(.5); editor3DMouseOnPanel = false;`);
    for (const how of ['putDown', 'close'])
    {
        const r = JSON.parse(run(`(()=>
        {
            levelEditor.isOpen || levelEditor.open(); levelEditor.tool = 'Posts'; log.length = 0;
            const before = level.objects.length;
            onRelease = ${how == 'putDown' ? '()=> { levelEditor.tool = undefined; }' : '()=> levelEditor.close()'};
            const step = ()=> { engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1; };
            step();
            for (const state of [3, 1, 7, 1, 0]) { inputData[0][0] = state; step(); }
            onRelease = ()=> {};
            return JSON.stringify({log, placed: level.objects.length - before});
        })()`));
        assert.deepEqual(r, {log: ['press', 'drag', 'release'], placed: 1}, how);
    }
});

test('a glTF one-shot played with a blend each update stays at its end while the game is paused or at time scale 0'
    + ' (G1)', async ()=>
{
    const { run } = await engine(true);
    const r = JSON.parse(run(`(()=>
    {
        const part = new GLTFPart('box', buildBox(vec3(1)), WHITE, undefined, false);
        part.node = 0;
        const tree = {nodes: [{name: 'root'}], parents: [undefined], restInverse: [new Matrix4], restPose: []};
        const channel = {node: 0, path: 'translation', interpolation: 'LINEAR', times: new Float32Array([0, .5]),
            values: new Float32Array([0, 0, 0, 0, -5, 0]), components: 3};
        const o = new GLTFModel([part], [new GLTFAnimation('die', [channel])], tree).createObject();
        onUpdatePost = ()=> o.play('die', false, 1, .1);
        engineStep(60);
        const ended = o.animationTime;
        setPaused(true); engineStep(30); setPaused(false);
        const paused = o.animationTime;
        setTimeScale(0); engineStep(30); setTimeScale(1);
        const frozen = o.animationTime;
        engineStep(5);
        const after = o.animationTime;
        onUpdatePost = undefined;
        o.destroy(true);
        return JSON.stringify([ended, paused, frozen, after]);
    })()`));
    assert.deepEqual(r, [.5, .5, .5, .5]);
});

test('the module example build rewrites the engine import with any spacing, a bare import and import() (B3)', ()=>
{
    const text = fs.readFileSync('examples/module/build.mjs', 'utf8');
    const body = text.slice(text.indexOf('function moduleFixStep'));
    const fixes = [...body.slice(0, body.indexOf('\n}')).matchAll(/code = code\.replace\((\/.*?\/g), *\n?\s*("[^"]*")\);/g)];
    const fix = (code)=> fixes.reduce((code, [, re, to])=> code.replace(eval(re), JSON.parse(to)), code);
    assert.equal(fix("import {vec2} from'../../dist/littlejs.esm.js';"), "import {vec2} from'./littlejs.esm.min.js';");
    assert.equal(fix("import '../../dist/littlejs.esm.js';"), "import './littlejs.esm.min.js';");
    assert.equal(fix("const LJS = await import( '../../dist/littlejs.esm.js');"),
        "const LJS = await import( './littlejs.esm.min.js');");
});

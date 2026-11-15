import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 19 of 2026-11-15: the MeshCollider V rule beside a corner of walls, a V ending in a wall, a steep chute
// and a V whose floor rises; a pinch after a refused placement; the one way stood box carried with a move; the
// Restart button and a refused changePart; strip normals where faces cancel; effects written with colors;
// setDebugKey's check; the camera controls and a press on a plain UI panel

async function engine2D(extra={})
{
    const e = loadEngine({ location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}

const tick = ()=> new Promise((resolve)=> setTimeout(resolve, 10));
const finger = (identifier, x, y)=> ({ identifier, clientX: x, clientY: y, target: {} });
const touchFire = (handlers, type, touches, changed=touches)=> handlers[type]({ type, touches, changedTouches: changed,
    target: {}, cancelable: true, preventDefault() {} });

// a scene of MeshCollider quads and a 1 x 2 body walked through it, giving where the body ends
const meshScene = (shape, start, velocity, frames)=> `(()=>
{
    setHeadlessMode(true); render3D || new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
    const V = (x, y, z)=> vec3(x, y, z);
    const quads = (list)=>
    {
        const mesh = new Mesh, points = [], indices = [];
        for (const [a, b, c, d] of list)
        {
            const o = points.length; points.push(a, b, c, d); indices.push(o, o+1, o+2, o, o+2, o+3);
        }
        mesh.addTriangles(points, indices);
        return mesh;
    };
    const floorQuad = (x0, z0, x1, z1, y=0)=> [V(x0,y,z0), V(x0,y,z1), V(x1,y,z1), V(x1,y,z0)];
    const wall = (x0, z0, x1, z1, y0=0, y1=4)=> [V(x0,y0,z0), V(x1,y0,z1), V(x1,y1,z1), V(x0,y1,z0)];
    const vTrough = (x0, x1, k, rise=0, top=3)=>
    {
        const w = top / k, list = [];
        for (let x = x0; x < x1 - 1e-9; ++x)
        {
            const xa = x, xb = min(x1, x + 1), ya = rise * xa, yb = rise * xb;
            list.push([V(xa, ya, 0), V(xb, yb, 0), V(xb, yb + top, w), V(xa, ya + top, w)]);
            list.push([V(xa, ya, 0), V(xa, ya + top, -w), V(xb, yb + top, -w), V(xb, yb, 0)]);
        }
        return list;
    };
    const level = new MeshCollider(quads(${shape}));
    const o = new EngineObject3D(${start}, buildBox()); o.size3D = vec3(1, 2, 1);
    o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
    const velocity = ${velocity}, lowest = {foot: Infinity};
    for (let f = 0; f < ${frames}; ++f)
    {
        if (velocity) o.velocity3D.x = velocity.x, o.velocity3D.z = velocity.z;
        engineObjectsUpdate();
        lowest.foot = min(lowest.foot, o.pos3D.y - 1 - (typeof creaseAt === 'function' ? creaseAt(o.pos3D.x) : 0));
    }
    const result = {x: o.pos3D.x, y: o.pos3D.y, z: o.pos3D.z, ground: !!o.groundObject};
    o.destroy(); level.destroy(); engineObjectsUpdate();
    return JSON.stringify(result);
})()`;

test('the MeshCollider V rule leaves a corner of walls, an end wall and a steep chute alone, and rises with a V', ()=>
{
    const { run } = loadEngine();
    const go = (...a)=> JSON.parse(run(meshScene(...a)));
    // a 45 degree corner of walls, walked into along its middle: held outside both walls, on the floor
    const a = 22.5 * Math.PI / 180, ca = Math.cos(a).toFixed(6), sa = Math.sin(a).toFixed(6);
    for (const speed of [.05, .2])
    {
        const corner = go(`[floorQuad(-4, -8, 10, 8), wall(0, 0, 8 * ${ca}, 8 * ${sa}), wall(0, 0, 8 * ${ca}, -8 * ${sa})]`,
            'vec3(5, 1.02, 0)', `vec3(-${speed}, 0, 0)`, 120);
        assert.ok(corner.x > .5 / Math.sin(a) - .05 && Math.abs(corner.y - 1) < .05, 'corner at ' + speed + ': ' +
            JSON.stringify(corner));
    }
    // a V ending in a wall at x 3, its floor flat or rising: stopped at the wall, in the V
    for (const rise of [0, .1])
    for (const speed of [.05, .2, .5])
    {
        const end = go(`[...vTrough(-6, 3, 1.8, ${rise}), wall(3, -4, 3, 4, -2, 6)]`, `vec3(-3, ${-3 * rise + 1.6}, 0)`,
            `vec3(${speed}, 0, 0)`, 120);
        assert.ok(end.x <= 2.51 && end.y > 1, 'end wall, rise ' + rise + ' at ' + speed + ': ' + JSON.stringify(end));
    }
    // a chute whose crease falls more steeply than groundAngle: it slides down it, not held
    const chute = go('vTrough(-10, 10, 1.8, -1.2, 3)', 'vec3(0, 1.3, 0)', 'undefined', 60);
    assert.ok(chute.x > 5, 'slid down the chute to ' + chute.x);
    // walking up a V whose floor rises .3: it rises with the floor, its foot above the crease, not sunk in
    run('var creaseAt = (x)=> x * .3;');
    const up = go('vTrough(-10, 10, 1.8, .3, 3)', 'vec3(-2, -.6 + 1.6, 0)', 'vec3(.1, 0, 0)', 40);
    assert.ok(Math.abs(up.x - 2) < .1, 'made its walk, at ' + up.x);
    assert.ok(up.y - 1 - up.x * .3 > .4, 'foot above the crease ' + (up.y - 1 - up.x * .3));
    assert.ok(Math.abs(up.z) < .01, 'in the middle of the V ' + up.z);
});

test('a pinch after a refused object placement undoes nothing', async ()=>
{
    const { run, handlers } = await engine2D({ window: { ontouchstart: null } });
    run(`class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
        objectLayersAddType('Coin', Coin, {});
        var map = {width: 8, height: 8, tilewidth: 16, tileheight: 16, nextobjectid: 1,
            layers: [{type: 'tilelayer', name: 'a', width: 8, height: 8, data: new Array(64).fill(0)},
            {type: 'objectgroup', name: 'things', objects: []}]};
        var waits = [];
        tileLayersLoad(map, undefined, 0, 0); objectLayersLoad(map);
        levelEditor.onRestart = async ()=> { await new Promise((resolve)=> waits.push(resolve));
            tileLayersLoad(map, undefined, 0, 0); objectLayersLoad(map); };
        levelEditor.open();
        var record = editorLayers()[0].record;
        editorResize(record, 10, 8); // its restart waits, so placements are refused
        editorSelectLayer(editorLayers().find((l)=> l.isObjects)); editorMouseOnPanel = false;
        editorObjectBrush = [{type: 'Coin', properties: [], offset: vec2()}];`);
    const step = ()=> run(`engineStep(); for (const i in inputData[0]) inputData[0][i] &= 1;
        mouseWheel = touchPinch = inputWheelPinch = 0; inputPinchReleased = false;`);
    const fire = (...a)=> touchFire(handlers, ...a);
    fire('touchstart', [finger(3, 620, 380)]); step();
    fire('touchstart', [finger(3, 620, 380), finger(4, 820, 380)], [finger(4, 820, 380)]); step();
    fire('touchend', [], [finger(3, 620, 380), finger(4, 820, 380)]); step();
    assert.deepEqual(JSON.parse(run('JSON.stringify([map.width, editorUndoList.length, map.layers[1].objects.length])')),
        [10, 1, 0], 'the resize kept, nothing placed');
    run('waits.shift()()'); await tick();
});

test('a grown body on one way tiles keeps standing when the game moves it up a little or snaps it', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); setGravity(vec2(0, -.02));
        const l = new TileCollisionLayer(vec2(0, 0), vec2(14, 10), tile(), 0, false);
        for (let x = 0; x < 14; ++x) l.setCollisionData(vec2(x, 0), 1);
        l.setOneWay(7);
        for (let x = 2; x < 12; ++x) l.setData(vec2(x, 4), new TileLayerData(7)), l.setCollisionData(vec2(x, 4), 1);
        const P = new EngineObject(vec2(5, 5.5), vec2(.6, .6)); P.setCollision();
        for (let f = 0; f < 40; ++f) engineObjectsUpdate();
        P.size = vec2(.6, .8); // grown about its center, sunk into the platform
        for (let f = 0; f < 40; ++f) { P.pos.y = Math.round(P.pos.y * 16) / 16 + 1e-9; engineObjectsUpdate(); }
        return JSON.stringify({y: P.pos.y, ground: P.groundObject === l});
    })()`));
    assert.ok(result.y > 4.5, 'fell to ' + result.y);
    assert.equal(result.ground, true);
});

test('the Restart button waits for a resize\'s restart, and changePart is refused inside Edit prefab', async ()=>
{
    const { run } = await engine2D();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'a', width: 4, height: 3, data: new Array(12).fill(0)}]};
        var waits = [], restarts = 0;
        tileLayersLoad(map, undefined, 0, 0);
        levelEditor.onRestart = async ()=> { ++restarts; engineObjectsDestroy();
            await new Promise((resolve)=> waits.push(resolve)); tileLayersLoad(map, undefined, 0, 0); };
        levelEditor.open();
        editorResize(editorLayers()[0].record, 5, 3);
        editorRestart();`);
    assert.equal(run('restarts'), 1, 'the button waited');
    run('waits.shift()()'); await tick();

    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const inside = e.run(`(()=>
    {
        level3DLoad({objects: [{id: 1, type: 'P'}], prefabs: {P: {objects: [{id: 1, type: 'Box'}]}}}); engineStep(2);
        levelEditor.open();
        editor3DSelection.clear(); editor3DSelection.add(1);
        editor3DPrefabEnter();
        const entered = editor3DPrefabStack.length;
        const result = levelEditor.edit3D.changePart('prefabs', (p)=> ({...p, Q: {objects: [{id: 1, type: 'Sphere'}]}}));
        return JSON.stringify([entered, result]);
    })()`);
    assert.deepEqual(JSON.parse(inside), [1, false]);
});

test('strip normals point up where faces cancel, effects keep their colors through text, setDebugKey checks', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        // two triangles back to back, the same points wound both ways, as a strip
        const mesh = new Mesh([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 0, 0), vec3(0, 0, 0)]);
        mesh.computeNormals(true);
        const zero = mesh.normals.filter((n)=> !n.length()).length;
        // a color written as JSON writes it, an object, reads back as the color
        const effect = particleEffectSanitize({name: 'red', settings: {colorStartA: rgb(1, 0, 0, 1)}});
        const text = particleEffectsText([{...effect, settings: {...effect.settings, colorStartA: rgb(1, 0, 0, 1)}}]);
        const back = particleEffectsParse(text)[0].settings.colorStartA;
        const loose = particleEffectsParse(JSON.stringify({version: 1, effects: [{name: 'b',
            settings: {colorStartA: {r: 0, g: 0, b: 1, a: 1}}}]}))[0].settings.colorStartA;
        let asserted = false;
        try { setDebugKey('\`'); } catch (e) { asserted = true; }
        setDebugKey('Backquote'); setDebugKey('');
        return JSON.stringify({zero, back: [...back], loose: [...loose], asserted});
    })()`));
    assert.equal(result.zero, 0);
    assert.deepEqual(result.back, [1, 0, 0, 1]);
    assert.deepEqual(result.loose, [0, 0, 1, 1]);
    assert.equal(result.asserted, true);
});

test('a camera control does not turn while a press that began on a plain UI panel is dragged', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true); new Render3DPlugin; new UISystemPlugin({});
        const panel = new UIObject(vec2(200, 200), vec2(200, 200)); // not interactive, a background
        const control = new CameraControl3D(vec3(), 10);
        const turn = (x, y)=>
        {
            const yaw = control.yaw;
            mousePosScreen = vec2(x, y); inputData[0][0] = 3;
            pluginList.forEach((p)=> p.update?.());
            inputData[0][0] = 1; mouseDeltaScreen = vec2(40, 0); mousePosScreen = vec2(x + 40, y);
            pluginList.forEach((p)=> p.update?.()); control.update();
            inputData[0][0] = 0; mouseDeltaScreen = vec2(); pluginList.forEach((p)=> p.update?.());
            return control.yaw - yaw;
        };
        return JSON.stringify({onPanel: turn(200, 200), off: turn(700, 500)});
    })()`));
    assert.equal(result.onPanel, 0);
    assert.notEqual(result.off, 0);
});

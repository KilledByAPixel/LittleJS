import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// The low items still open after review pass 10, triaged in .claude/review-pass10/open-lows-triage.md: input that
// loses a release or presses twice, fullscreen's unhandled promise, Canvas2D ignoring a texture's pixelated setting,
// a shadow of non-solid markers, context state a game leaves on the main canvas, NaN colors in release, texture
// deletes that leave the engine's caches, and mainCanvasSize made again every frame.

// a headless engine whose input steps as a browser's does: pressed and released cleared after each update
function inputEngine(extra)
{
    const engine = loadEngine(extra);
    engine.step = ()=> engine.run(`for (const device of inputData) for (const i in device) device[i] &= 1;`);
    return engine;
}

test('a release and a new press of a key in one frame keep both, down, pressed and released', ()=>
{
    const { run, handlers, step } = inputEngine();
    handlers.keydown(keyEvent('Space'));
    step();
    handlers.keyup(keyEvent('Space'));
    handlers.keydown(keyEvent('Space'));
    assert.deepEqual([...run(`[keyIsDown('Space'), keyWasPressed('Space'), keyWasReleased('Space')]`)], [true, true, true]);
});

test('a second keydown of a key already held, not a repeat, does not press it again', ()=>
{
    const { run, handlers, step } = inputEngine();
    handlers.keydown(keyEvent('KeyZ'));
    step();
    handlers.keydown(keyEvent('KeyZ'));
    assert.equal(run(`keyWasPressed('KeyZ')`), false);
    assert.equal(run(`keyIsDown('KeyZ')`), true);
});

test('toggleFullscreen refused by the browser leaves no unhandled promise', async ()=>
{
    const { run } = loadEngine();
    let unhandled = 0;
    const count = ()=> ++unhandled;
    process.on('unhandledRejection', count);
    try
    {
        run(`document.fullscreenElement = null; mainCanvas = { parentElement:
            { requestFullscreen: ()=> Promise.reject(new Error('needs a user gesture')) } }; toggleFullscreen();`);
        await new Promise((resolve)=> setTimeout(resolve, 20));
    }
    finally { process.off('unhandledRejection', count); }
    assert.equal(unhandled, 0);
});

test('Canvas2D draws a texture smooth or pixelated as the texture says', ()=>
{
    // a context that keeps its smoothing through save and restore, as a canvas does, set off as the engine sets it
    // for pixelated tiles
    const smooth = [], saved = [];
    const context = new Proxy({ imageSmoothingEnabled: false, drawImage() { smooth.push(context.imageSmoothingEnabled); },
        save() { saved.push(context.imageSmoothingEnabled); }, restore() { context.imageSmoothingEnabled = saved.pop(); } },
        { get: (target, key)=> key in target ? target[key] : ()=> {}, set: (target, key, value)=> (target[key] = value, true) });
    const { run } = loadEngine({ context, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 });
    run(`glEnable = false; setTilesPixelated(true); mainContext = drawContext = context;
        var image = { width: 16, height: 16 }, own = new TextureInfo(image), smoothed = new TextureInfo(image);
        smoothed.setPixelated(false);
        drawTile(vec2(), vec2(1), new TileInfo(vec2(), vec2(16), smoothed), WHITE, 0, false, undefined, false);
        drawTile(vec2(), vec2(1), new TileInfo(vec2(), vec2(16), own), WHITE, 0, false, undefined, false);`);
    assert.deepEqual(smooth, [true, false], 'the smooth texture smooth, one that does not say pixelated as the tiles');
});

test('a tile layer\'s shadow is cast by solid cells only, not by negative markers', ()=>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); var layer = new TileCollisionLayer(vec2(), vec2(4, 1));
        layer.setCollisionData(vec2(0, 0), -1); layer.setCollisionData(vec2(2, 0), 1);
        var drawn = []; drawTile = (pos, size)=> drawn.push(pos.x);
        setCameraPos(vec2(2, .5)); setCameraScale(1); layer.renderShadow();`);
    assert.deepEqual([...run('drawn')], [2.5], 'only the positive cell');
});

test('each frame the main canvas starts with no alpha, filter or shadow a game left on it', ()=>
{
    const context = { setTransform() {}, clearRect() {}, fillRect() {}, globalAlpha: 1, filter: 'none',
        shadowColor: 'rgba(0,0,0,0)', shadowBlur: 0 };
    const { run } = loadEngine({ context, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 });
    run(`mainCanvas = { width: 100, height: 100, style: {} }; mainContext = context; canvasFixedSize = vec2(100);
        engineUpdateCanvas(); context.globalAlpha = .5; context.filter = 'blur(2px)'; context.shadowBlur = 4;
        context.shadowColor = '#000'; engineUpdateCanvas();`);
    assert.equal(context.globalAlpha, 1);
    assert.equal(context.filter, 'none');
    assert.equal(context.shadowColor, 'rgba(0,0,0,0)');
});

test('mainCanvasSize is the same vector frame to frame with a fixed canvas size', ()=>
{
    const context = { setTransform() {}, clearRect() {}, fillRect() {} };
    const { run } = loadEngine({ context, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 });
    run(`mainCanvas = { width: 100, height: 100, style: {} }; mainContext = context; canvasFixedSize = vec2(100);
        engineUpdateCanvas(); var first = mainCanvasSize; engineUpdateCanvas();`);
    assert.equal(run('mainCanvasSize === first'), true);
    assert.equal(run('mainCanvasSize.x'), 100);
});

test('a color with a NaN channel is black as text in a release build too', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    assert.equal(run('new Color(NaN, 0, 0).toString()'), '#000');
});

test('glDeleteTexture draws what is batched with it and leaves the engine holding nothing of it', ()=>
{
    const gl = new Proxy({ isContextLost: ()=> false }, { get: (target, key)=> key in target ? target[key] : ()=> ({}) });
    const { run } = loadEngine({ gl });
    run(`glContext = gl; var texture = {}, flushes = 0; glFlush = ()=> ++flushes;
        glActiveTexture = texture; glMipmapsStale.add(texture); glDeleteTexture(texture);`);
    assert.equal(run('flushes'), 1, 'its batch drawn first');
    assert.equal(run('glActiveTexture'), undefined);
    assert.equal(run('glMipmapsStale.has(texture)'), false);
});

test('a tween whose callback throws does not stop the other tweens moving, and the error still comes out', ()=>
{
    const { run } = loadEngine();
    run(`var moved = 0; new Tween(()=> ++moved, 0, 1, 10); var bad = new Tween(()=> {}, 0, 1, 10);
        moved = 0; bad.callback = ()=> { throw new Error('bad'); };`);
    assert.throws(()=> run('tweenUpdate(.1)'), /bad/);
    assert.equal(run('moved'), 1, 'the older tween moved this update too');
});

test('parseGLTF reads a GLB given as a typed array, even a view part way into a bigger buffer', async ()=>
{
    const { run } = loadEngine({ ArrayBuffer, Uint8Array, TextDecoder, DataView });
    const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], nodes: [] }));
    const padded = json.length + (4 - json.length % 4) % 4;
    const glb = new Uint8Array(12 + 8 + padded).fill(32);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546C67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.length, true);
    view.setUint32(12, padded, true); view.setUint32(16, 0x4E4F534A, true);
    glb.set(json, 20);
    const big = new Uint8Array(glb.length + 7);
    big.set(glb, 7);
    for (const bytes of [glb, big.subarray(7)])
    {
        const model = await loadEngine({ ArrayBuffer, Uint8Array, TextDecoder, DataView, bytes }).run('parseGLTF(bytes)');
        assert.ok(model && Array.isArray(model.parts), 'a model');
    }
});

test('the nearest clear node is found as a full search finds it, every distance and tie the same', ()=>
{
    const { run } = loadEngine();
    run(`var finder = new PathFinder(vec2(30, 30)), random = new RandomGenerator(5);
        finder.isWalkable = (x, y)=> random.float() < .15; finder.buildNodeData();
        var brute = (pos, range)=>
        {
            const c = finder.worldToTile(pos);
            let best = null, bestD = 0;
            for (let dy = -range; dy <= range; ++dy) for (let dx = -range; dx <= range; ++dx)
            {
                const n = finder.getNode(c.x + dx, c.y + dy);
                if (!n || !n.isClear()) continue;
                const d = (n.posWorld.x - pos.x)**2 + (n.posWorld.y - pos.y)**2;
                if (!best || d < bestD) best = n, bestD = d;
            }
            return best;
        };`);
    const mismatches = run(`(()=> { let bad = 0; const r = new RandomGenerator(9);
        for (let i = 0; i < 300; ++i)
        {
            const pos = vec2(r.float(0, 30), r.float(0, 30)), range = r.int(0, 8);
            const found = finder.getNearestClearNode(pos, range), best = brute(pos, range);
            const d = (n)=> n ? (n.posWorld.x - pos.x)**2 + (n.posWorld.y - pos.y)**2 : -1;
            if (d(found) !== d(best)) ++bad;
        }
        return bad; })()`);
    assert.equal(mismatches, 0);
});

test('Matrix4.getRotation gives back a turn just short of straight up or down', ()=>
{
    const { run } = loadEngine();
    for (const pitch of [Math.PI/2 - 1e-4, -Math.PI/2 + 2e-4, Math.PI/2 - 1e-3])
    {
        const r = run(`(()=> { const r = Matrix4.rotation(vec3(${pitch}, .3, .2)).getRotation(); return [r.x, r.y, r.z]; })()`);
        assert.ok(Math.abs(r[0] - pitch) < 1e-6 && Math.abs(r[1] - .3) < 1e-4 && Math.abs(r[2] - .2) < 1e-4, `${pitch}: ${[...r]}`);
    }
});

test('a glTF accessor off its values\' alignment says so, naming the accessor', async ()=>
{
    const { run } = loadEngine({ ArrayBuffer, atob, Response, fetch });
    run(`var bad = { asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ bufferView: 0, byteOffset: 1, componentType: 5126, count: 3, type: 'VEC3' }],
        bufferViews: [{ buffer: 0, byteLength: 40 }],
        buffers: [{ byteLength: 40, uri: 'data:application/octet-stream;base64,' + 'A'.repeat(56) }] };`);
    await assert.rejects(run('parseGLTF(bad)'), /accessor 0 is not aligned/);
});

test('the 3D particle emitter\'s internal methods are private in the d.ts, and parseAtlas says what its groups hold', async ()=>
{
    const { readFileSync } = await import('node:fs');
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    assert.match(dts, /private particleCall\b/);
    assert.match(dts, /private particleCollide\b/);
    assert.match(dts, /function parseAtlas\(data: any\): \{\s*name: string;/);
});

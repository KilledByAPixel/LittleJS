import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';
import {
    EngineObject, TileCollisionLayer, engineObjectsUpdate, setGravity, tileCollisionRaycast, zzfxG,
    audioDefaultSampleRate, tile, vec2,
} from '../dist/littlejs.esm.js';

// Code a coverage run on 2026-10-04 found never executed: an object's tile collision against a wall, a ledge and a
// ceiling; the ear clipping of a concave polygon; the zzfx wave shapes past the triangle and repeatTime; a raycast
// over two collision layers; the release loop going on past an error; the gamepad axis filter for a non standard
// pad; and a GLB image read from its bufferView

///////////////////////////////////////////////////////////////////////////////
// EngineObject tile collision

// an object of size 1 with only level collision, a layer of 10 by 10 with the given solid cells, gravity set; all
// of it taken down after, so the tests do not see each other's layers or gravity
function tileScene(cells, gravityY, f)
{
    const layer = new TileCollisionLayer(vec2(), vec2(10), tile(), 0, false);
    for (const [x, y] of cells)
        layer.setCollisionData(vec2(x, y), 1);
    const o = new EngineObject(vec2(), vec2(1));
    o.collideLevel = true;
    o.damping = 1;
    setGravity(vec2(0, gravityY));
    try { f(o, layer); }
    finally
    {
        setGravity(vec2());
        layer.destroy();
        o.destroy();
        engineObjectsUpdate();
    }
}

test('an object moving into a wall tile goes back to its old x and bounces by the larger restitution', () =>
{
    tileScene([[5, 2]], 0, (o, layer)=>
    {
        o.pos = vec2(4.4, 2.5);
        o.velocity = vec2(.2, 0);
        o.restitution = .25;
        layer.restitution = .5; // the layer's, the larger, is used
        o.updatePhysics();
        assert.equal(o.pos.x, 4.4);
        assert.equal(o.pos.y, 2.5);
        assert.equal(o.velocity.x, -(.2 * .5));
        assert.equal(o.velocity.y, 0);
    });
});

test('an object walking into a tile whose top is less than .1 above its bottom is lifted onto it and keeps its speed', () =>
{
    tileScene([[5, 1]], -.01, (o)=>
    {
        o.pos = vec2(4.4, 2.45); // bottom at 1.95, the tile's top at 2
        o.velocity = vec2(.2, 0);
        o.updatePhysics();
        assert.equal(o.pos.y, Math.floor(2.45 - .5 + 1) + .5 + 1e-3, 'standing just above the tile');
        assert.equal(o.pos.x, 4.4 + .2, 'not pushed back');
        assert.equal(o.velocity.x, .2);
    });

    // a tile a step too tall stops it as a wall does
    tileScene([[5, 1]], -.01, (o)=>
    {
        o.pos = vec2(4.4, 2.3); // bottom at 1.8
        o.velocity = vec2(.2, 0);
        o.updatePhysics();
        assert.equal(o.pos.x, 4.4);
        assert.equal(o.velocity.x, -0);
    });
});

test('an object moving up into a ceiling goes back to its old y, is not on the ground, and bounces down', () =>
{
    tileScene([[2, 3]], -.01, (o)=>
    {
        o.pos = vec2(2.5, 2.4);
        o.velocity = vec2(0, .3);
        o.restitution = .5;
        o.updatePhysics();
        assert.equal(o.pos.y, 2.4);
        assert.equal(o.pos.x, 2.5);
        assert.equal(o.groundObject, undefined);
        assert.equal(o.velocity.y, (.3 - .01) * -.5);
    });
});

///////////////////////////////////////////////////////////////////////////////
// glPolyStrip ear clipping

test('glPolyStrip clips a concave polygon into triangles that cover it exactly, either winding, leaving the points as given', () =>
{
    const { run } = loadEngine();
    // an L of area 3, counter clockwise, and the same L clockwise
    const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    for (const points of [L, L.slice().reverse()])
    {
        const result = JSON.parse(run(`{
            const points = ${JSON.stringify(points)}.map(([x, y])=> vec2(x, y));
            const given = points.slice();
            const strip = glPolyStrip(points);
            JSON.stringify({
                strip: strip.map((p)=> [p.x, p.y]),
                same: points.length === given.length && points.every((p, i)=> p === given[i]),
                values: points.map((p)=> [p.x, p.y]),
            });
        }`));
        assert.equal(result.same, true, 'the caller\'s array keeps its points in its order');
        assert.deepEqual(result.values, points, 'and the points their values');

        // each three in a row of the strip is a triangle, the bridges between them have no area
        const s = result.strip;
        assert.notEqual(s.length, points.length, 'clipped, not zigzagged as a convex polygon is');
        let area = 0, triangles = 0;
        for (let k = 0; k + 2 < s.length; ++k)
        {
            const [a, b, c] = [s[k], s[k+1], s[k+2]];
            const doubled = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
            if (doubled < 1e-12) continue;
            ++triangles;
            area += doubled / 2;
            const x = (a[0] + b[0] + c[0]) / 3, y = (a[1] + b[1] + c[1]) / 3;
            assert.ok(x > 0 && y > 0 && x < 2 && y < 2 && !(x > 1 && y > 1), 'triangle inside the L, at ' + [x, y]);
        }
        assert.equal(triangles, points.length - 2);
        assert.ok(Math.abs(area - 3) < 1e-12, 'area ' + area);
    }
});

///////////////////////////////////////////////////////////////////////////////
// zzfxG wave shapes and repeatTime

// the samples zzfxG makes at volume 1 with no randomness, attack, release or effects, from its own formulas: the
// wave of each shape, its curve, and the ramp of the 9 samples it starts with in place of no attack
function zzfxReference(shape, shapeCurve, frequency, length)
{
    const PI2 = Math.PI*2, f = frequency * ((1 + 0) * PI2 / audioDefaultSampleRate);
    const wave = [null, null,
        (t)=> 1-(2*t/PI2%2+2)%2,                       // 2 saw
        (t)=> Math.max(Math.min(Math.tan(t), 1), -1),  // 3 tan
        (t)=> Math.sin(t**3),                          // 4 noise
        (t)=> t/PI2%1 < shapeCurve/2 ? 1 : -1][shape]; // 5 square duty
    const out = new Float32Array(length);
    for (let i = 0, t = 0; i < length; ++i, t += f)
    {
        const s = wave(t);
        out[i] = (shape > 4 ? s : Math.sign(s) * Math.abs(s) ** shapeCurve) * (i < 9 ? i/9 : 1);
    }
    return out;
}

test('zzfxG makes the saw, tan, noise and square wave shapes its formulas give', () =>
{
    for (const [shape, curve] of [[2, 1], [2, 2], [3, 1], [4, 1], [5, .5], [5, 1]])
    {
        const samples = zzfxG(1, 0, 440, 0, 200/audioDefaultSampleRate, 0, shape, curve);
        assert.ok(samples.length > 200, 'samples ' + samples.length);
        assert.deepEqual([...samples], [...zzfxReference(shape, curve, 440, samples.length)], 'shape ' + shape + ' curve ' + curve);
        for (const s of samples)
            assert.ok(Math.abs(s) <= 1, 'shape ' + shape + ' within -1 to 1');
    }

    // tan is clamped, so it reaches 1 and -1 and holds there
    const tan = zzfxG(1, 0, 440, 0, 200/audioDefaultSampleRate, 0, 3);
    assert.ok(tan.includes(1) && tan.includes(-1));

    // the square's curve is its duty: at .5 it is up a quarter of each cycle
    const square = zzfxG(1, 0, 441, 0, 1, 0, 5, .5).subarray(9);
    const up = square.filter((s)=> s === 1).length / square.length;
    assert.ok(Math.abs(up - .25) < .01, 'up ' + up);
});

test('zzfxG with repeatTime starts its slide over every repeatTime, so the pitch repeats with that period', () =>
{
    // a saw's step from one sample to the next is its frequency, -f/PI, wherever it does not wrap
    const repeatTime = .01, period = repeatTime * audioDefaultSampleRate | 0;
    const steps = (samples)=> Array.from(samples.subarray(9, -1), (s, i)=> samples[i + 10] - s);
    const wraps = (d)=> d > 1;
    const drift = (repeat)=>
    {
        const d = steps(zzfxG(1, 0, 220, 0, .05, 0, 2, 1, 1, 0, 0, 0, repeat));
        let most = 0;
        for (let i = 0; i + period < d.length; ++i)
            if (!wraps(d[i]) && !wraps(d[i + period]))
                most = Math.max(most, Math.abs(d[i + period] - d[i]));
        return most;
    };
    assert.ok(drift(repeatTime) < 1e-5, 'repeats, ' + drift(repeatTime));
    assert.ok(drift(0) > 1e-4, 'without it the slide goes on, ' + drift(0));
});

///////////////////////////////////////////////////////////////////////////////
// tileCollisionRaycast over two layers

test('tileCollisionRaycast over two layers gives the nearer hit and fills the normal of that layer\'s tile', () =>
{
    // the ray meets the near tile on its left side and the far one on its bottom
    const start = vec2(.5, .5), end = vec2(9.5, 4.1);
    for (const nearFirst of [true, false])
    {
        const layers = [];
        const make = (x, y)=>
        {
            const layer = new TileCollisionLayer(vec2(), vec2(10), tile(), 0, false);
            layer.setCollisionData(vec2(x, y), 1);
            layers.push(layer);
        };
        try
        {
            nearFirst ? (make(3, 1), make(4, 2)) : (make(4, 2), make(3, 1));
            const normal = vec2(7, 7);
            const hit = tileCollisionRaycast(start, end, undefined, normal);
            assert.ok(hit, 'a hit');
            assert.ok(Math.abs(hit.x - 3) < 1e-9 && Math.abs(hit.y - 1.5) < 1e-9, 'the near tile, ' + hit);
            assert.deepEqual([normal.x, normal.y], [-1, 0], 'its side, ' + (nearFirst ? 'near' : 'far') + ' layer first');

            // what the caller was given is its own, changing it changes no later raycast
            normal.set(5, 5);
            hit.set(5, 5);
            const again = vec2();
            const hitAgain = tileCollisionRaycast(start, end, undefined, again);
            assert.ok(Math.abs(hitAgain.x - 3) < 1e-9 && Math.abs(hitAgain.y - 1.5) < 1e-9);
            assert.deepEqual([again.x, again.y], [-1, 0]);
            assert.deepEqual([normal.x, normal.y], [5, 5], 'the first normal is not written again');
        }
        finally { for (const layer of layers) layer.destroy(); engineObjectsUpdate(); }
    }

    // the far tile alone is met on its bottom, a different normal
    const layer = new TileCollisionLayer(vec2(), vec2(10), tile(), 0, false);
    layer.setCollisionData(vec2(4, 2), 1);
    try
    {
        const normal = vec2();
        tileCollisionRaycast(start, end, undefined, normal);
        assert.deepEqual([normal.x, normal.y], [0, -1]);
    }
    finally { layer.destroy(); engineObjectsUpdate(); }
});

///////////////////////////////////////////////////////////////////////////////
// the release loop going on past an error

test('the release loop logs an error a frame throws once however often it repeats, and goes on to the next frame', async () =>
{
    const frames = [], errors = [];
    const console = {log() {}, warn() {}, error: (...args)=> errors.push(args)};
    const { run } = loadEngine({console, requestAnimationFrame: (f)=> frames.push(f)}, '', 'littlejs.release.js');
    // the first update runs inside engineInit, the next two throw the same error, the fourth another
    await run(`setHeadlessMode(true); var updates = 0;
        engineInit(()=> {}, ()=>
        {
            ++updates;
            if (updates === 2 || updates === 3) throw new Error('boom');
            if (updates === 4) throw new Error('bang');
        })`);
    assert.equal(run('updates'), 1);

    // run scheduled frames until the game has updated that many times, each one asking for the next
    let timeMS = 0;
    const until = (count)=>
    {
        for (let i = 0; run('updates') < count; ++i)
        {
            assert.ok(i < 10, 'updates ' + run('updates'));
            assert.equal(frames.length, 1, 'one frame asked for');
            frames.shift()(timeMS += 1e3/60);
        }
    };
    until(2);
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0].message, 'boom');
    until(3);
    assert.equal(errors.length, 1, 'the same error again is not logged again');
    until(4);
    assert.equal(errors.length, 2, 'a different one is');
    assert.equal(errors[1][0].message, 'bang');
    until(5);
    assert.equal(frames.length, 1, 'still running');
});

///////////////////////////////////////////////////////////////////////////////
// the gamepad axis filter

test('a non standard gamepad\'s axis resting off center reads 0 until it has rested centered long enough', () =>
{
    const pad = { mapping: '', axes: [.5, 0], buttons: [] };
    const { run, context } = loadEngine({ navigator: { getGamepads: ()=> [pad] } });
    context.screenToWorld = context.screenToWorldDelta = (v)=> v; // no camera here
    const poll = (x, times=1)=> { pad.axes[0] = x; for (let i = times; i--;) run('inputUpdate(); inputUpdatePost();'); };
    const stick = ()=> run('gamepadStick(0, 0).x');
    const frames = run('gamepadAxisCenteredFrames');

    poll(.5, 60);
    assert.equal(stick(), 0, 'resting at .5 reads centered');
    poll(0, frames);
    poll(.9);
    assert.equal(stick(), 0, 'not centered long enough yet, and the count starts over');
    poll(0, frames + 1);
    poll(.9);
    assert.equal(stick(), 1, 'trusted once it rested centered more than ' + frames + ' polls');
    poll(.5);
    assert.ok(Math.abs(stick() - .4) < 1e-9, 'and stays trusted, .5 past the dead zone');

    // with the filter off it reads at once
    const { run: run2, context: context2 } = loadEngine({ navigator: { getGamepads: ()=> [{ mapping: '', axes: [.5, 0], buttons: [] }] } });
    context2.screenToWorld = context2.screenToWorldDelta = (v)=> v;
    run2('gamepadAxisFilterEnable = false; inputUpdate(); inputUpdatePost();');
    assert.ok(Math.abs(run2('gamepadStick(0, 0).x') - .4) < 1e-9);
});

///////////////////////////////////////////////////////////////////////////////
// a GLB image embedded by bufferView

// a valid 1 by 1 png
const PNG = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82]);

// a GLB of a textured triangle: its positions then the png in the BIN chunk, the image by its bufferView
function makeGLB()
{
    const positions = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
    const pad4 = (n)=> n + 3 & ~3;
    const bin = new Uint8Array(pad4(positions.length + PNG.length));
    bin.set(positions);
    bin.set(PNG, positions.length);
    const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: bin.length}],
        bufferViews: [{buffer: 0, byteLength: positions.length},
            {buffer: 0, byteOffset: positions.length, byteLength: PNG.length}],
        accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3'}],
        images: [{bufferView: 1, mimeType: 'image/png'}],
        textures: [{source: 0}],
        // blended, so the texture is decoded as it is and not read back through WebGL to set its alpha
        materials: [{alphaMode: 'BLEND', pbrMetallicRoughness: {baseColorTexture: {index: 0}}}],
        meshes: [{primitives: [{attributes: {POSITION: 0}, material: 0}]}],
        nodes: [{mesh: 0}],
        scenes: [{nodes: [0]}],
    };
    let text = JSON.stringify(json);
    text += ' '.repeat(pad4(text.length) - text.length);
    const jsonBytes = new TextEncoder().encode(text);
    const glb = new Uint8Array(12 + 8 + jsonBytes.length + 8 + bin.length);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546C67, true); // glTF
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.length, true);
    view.setUint32(12, jsonBytes.length, true);
    view.setUint32(16, 0x4E4F534A, true); // JSON
    glb.set(jsonBytes, 20);
    const binAt = 20 + jsonBytes.length;
    view.setUint32(binAt, bin.length, true);
    view.setUint32(binAt + 4, 0x004E4942, true); // BIN
    glb.set(bin, binAt + 8);
    return glb.buffer;
}

test('a GLB image embedded by bufferView is decoded from those bytes of the BIN chunk, with its mime type', async () =>
{
    const blobs = [];
    const createImageBitmap = async (blob)=> (blobs.push(blob), {width: 1, height: 1, blob});
    // ArrayBuffer from this realm, so the vm's parseGLTF knows the bytes made here for what they are
    const { run } = loadEngine({ArrayBuffer, TextDecoder, Blob, createImageBitmap, glb: makeGLB()});
    run(`glContext = {}; glCreateTexture = ()=> ({});`);
    const texture = await run('parseGLTF(glb).then(model=> model.parts[0].textureInfo)');
    assert.equal(blobs.length, 1, 'one image decoded');
    assert.equal(blobs[0].type, 'image/png');
    assert.deepEqual(new Uint8Array(await blobs[0].arrayBuffer()), PNG, 'the png\'s bytes, from its offset in the chunk');
    assert.ok(texture, 'the part has a texture');
    assert.equal(texture.image.blob, blobs[0], 'made from that image');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, EngineObject3D, TileCollisionLayer, TileLayer, TileLayerData, TileInfo, TextureInfo, ImageFont,
    Ray3D, vec2, vec3, tile, PI } = LJS;

// review round 10: tile floors and flipped gravity, relative side bounces, the empty texture slot, tweens on destroyed
// objects, packed tilesets and fonts, 3D picking from inside a box and of flat objects, orbits straight down,
// orthographic rays, OBJ uvs, and ZzFX at its extremes

LJS.setEngineManualStep(true);
await LJS.engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
new LJS.Render3DPlugin;

const clearObjects = ()=> { LJS.engineObjectsDestroy(); LJS.engineObjectsUpdate(); };
const withGravity = (g, f)=> { const old = LJS.gravity.copy(); LJS.setGravity(g); try { f(); } finally { LJS.setGravity(old); clearObjects(); } };
const near = (a, b, eps=1e-6)=> Math.abs(a - b) <= eps;

test('a tile collision layer made with no image loaded has no tile, instead of asserting', () =>
{
    assert.equal(LJS.textureInfos[0], undefined, 'no images');
    const layer = new TileCollisionLayer(vec2(), vec2(4));
    assert.equal(layer.tileInfo, undefined);
    layer.setCollisionData(vec2(1, 1));
    assert.equal(LJS.tileCollisionGetData(vec2(1.5, 1.5)), 1, 'collision works without it');
    layer.destroy();
    clearObjects();
});

test('an object dropped onto a tile floor on an offset layer lands on it, not in it', () => withGravity(vec2(0, -.01), ()=>
{
    // .1 above the floor at y 0, where the steps land a hair under the grid line
    const layer = new TileCollisionLayer(vec2(-10, -10), vec2(40, 20), tile(), 0, false);
    for (let x = 40; x--;) layer.setCollisionData(vec2(x, 9));
    const box = new EngineObject(vec2(0, .6), vec2(1));
    box.setCollision();
    LJS.engineStep(120);
    assert.ok(near(box.pos.y, .5, .01), 'resting on the floor: ' + box.pos.y);
    layer.destroy();
}));

test('a side hit on a static solid moving away bounces relative to it, like a hit on its top', () => withGravity(vec2(), ()=>
{
    const paddle = new EngineObject(vec2(2, 0), vec2(1, 4));
    paddle.mass = 0;
    paddle.setCollision();
    paddle.velocity = vec2(.3, 0);
    const ball = new EngineObject(vec2(0, 0), vec2(.5));
    ball.setCollision();
    ball.restitution = 1;
    ball.velocity = vec2(.5, 0);
    for (let i = 30; i-- && ball.velocity.x > .4;) LJS.engineStep();
    assert.ok(near(ball.velocity.x, .1), 'it leaves at .3 - (.5 - .3): ' + ball.velocity.x);
}));

test('under flipped gravity an object walks along a ceiling of solids with small seams, as it does along a floor', () =>
    withGravity(vec2(0, -.01), ()=>
{
    for (let i = 0; i < 14; ++i)
    {
        const solid = new EngineObject(vec2(i, 2 - i * .002), vec2(1));
        solid.mass = 0;
        solid.setCollision();
    }
    const walker = new EngineObject(vec2(-1, .999), vec2(1));
    walker.setCollision();
    walker.gravityScale = -1;
    for (let i = 120; i--;)
    {
        walker.velocity.x = .1;
        LJS.engineStep();
    }
    assert.ok(walker.pos.x > 10, 'it walked along under them: ' + walker.pos.x);
}));

test('a texture loaded into slot 0 after an engineInit with no images replaces the placeholder', async () =>
{
    // what engineInit leaves in slot 0 when it gets no images, headless skips it
    const placeholder = LJS.textureInfos[0] = new TextureInfo({width: 0, height: 0}, false);
    const HeadlessImage = globalThis.Image;
    globalThis.Image = class { width = 0; height = 0; }; // an image with no source has no size
    try { await assert.doesNotReject(LJS.loadTexture(0)); }
    finally { globalThis.Image = HeadlessImage; }
    assert.notEqual(LJS.textureInfos[0], placeholder);
});

test('a property tween stops once its object is destroyed, even one that loops', () =>
{
    const o = new EngineObject(vec2());
    const tween = LJS.tweenProperty(o, 'pos.x', 0, 10, 1).pingPong();
    LJS.tweenUpdate(.25);
    assert.equal(tween.isActive(), true);
    o.destroy();
    LJS.tweenUpdate(.25);
    assert.equal(tween.isActive(), false, 'stopped, not writing to a destroyed object for good');
    clearObjects();
});

test('an ImageFont keeps its tile, so a loadSprite tile filled in later is seen; a tile layer asserts on an empty one', () =>
{
    const empty = new TileInfo(vec2(), vec2()); // what loadSprite hands out before the image loads
    const font = new ImageFont(empty);
    assert.equal(font.tileInfo, empty);
    assert.throws(()=> new TileLayer(vec2(), vec2(4), empty), /Assert failed/);
});

test('3D picking from inside a mesh\'s box finds what stands inside it first', () =>
{
    const room = new EngineObject3D(vec3(), LJS.buildBox(vec3(20, 4, 20)));
    const crate = new EngineObject3D(vec3(0, .5, -8), LJS.buildBox());
    try
    {
        const eye = vec3(0, 1.7, 0), ray = new Ray3D(eye, crate.pos3D.subtract(eye));
        assert.equal(LJS.render3D.pick(ray)?.object, crate, 'the crate, not the room around the eye');
        const hits = LJS.engineObjectsRaycast3D(ray);
        assert.equal(hits[0], crate);
        assert.ok(hits.includes(room), 'the room\'s far wall after it');
    }
    finally { clearObjects(); }
});

test('an object flattened to nothing on one axis can still be picked', () =>
{
    const card = new EngineObject3D(vec3(5, 0, 0), LJS.buildBox());
    card.scale3D = vec3(4, 0, 4);
    try { assert.equal(LJS.render3D.pick(new Ray3D(vec3(5, 10, 0), vec3(0, -1, 0)))?.object, card); }
    finally { clearObjects(); }
});

test('an orbit straight down turns with its yaw', () =>
{
    const camera = LJS.render3D.camera;
    camera.orbit(vec3(), 10, 1, PI/2);
    assert.ok(near(camera.rotation.y, 1), 'the yaw is the orbit\'s: ' + camera.rotation.y);
    assert.ok(near(camera.rotation.x, -PI/2), 'looking straight down');
    camera.orbit(vec3(), 10, 0, .5);
});

test('an orthographic ray starts on the near plane, so what is drawn behind the camera can be picked', () =>
{
    const r = LJS.render3D, camera = r.camera;
    const saved = [camera.pos.copy(), camera.rotation.copy(), camera.orthographic, camera.near, camera.far];
    camera.pos = vec3();
    camera.rotation = vec3(-PI/2, 0, 0); // straight down
    camera.orthographic = 10;
    camera.near = -50;
    camera.far = 50;
    const box = new EngineObject3D(vec3(0, 5, 0), LJS.buildBox());
    try
    {
        const ray = r.screenToRay(vec2(50), vec2(100)); // the middle of a canvas, headless has none
        assert.ok(near(ray.origin.y, 50), 'on the near plane, 50 behind the camera: ' + ray.origin);
        assert.equal(r.pick(ray, [box])?.object, box);
    }
    finally
    {
        [camera.pos, camera.rotation, camera.orthographic, camera.near, camera.far] = saved;
        clearObjects();
    }
});

test('parseOBJ reads a vt line with only u, v defaults to 0', () =>
{
    const mesh = LJS.parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0.5\nf 1/1 2/1 3/1\n');
    for (const uv of mesh.uvs)
        assert.ok(near(uv.x, .5) && near(uv.y, 1), 'uv ' + uv);
});

test('ZzFX stays finite with a filter above a quarter of the sample rate, and at volume 0 with a delay', () =>
{
    const finite = (samples)=> samples.every(Number.isFinite);
    assert.ok(finite(LJS.zzfxG(1, 0, 220, 0, .2, .1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 12000)), 'filter 12000');
    assert.ok(finite(LJS.zzfxG(1, 0, 220, 0, .2, .1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -12000)), 'filter -12000');
    assert.ok(finite(LJS.zzfxG(0, 0, 220, 0, .2, .1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, .1)), 'volume 0 with delay');
});

test('a 3D object starts with the size of its mesh, so a built floor or wall is solid all over', () =>
{
    const wall = new EngineObject3D(vec3(), LJS.buildBox(vec3(10, 3, 1)));
    const sprite = new EngineObject3D(vec3(), undefined, new TileInfo(vec2(), vec2(8)));
    const unit = new EngineObject3D(vec3(), LJS.render3D.boxMesh);
    try
    {
        assert.deepEqual([wall.size3D.x, wall.size3D.y, wall.size3D.z], [10, 3, 1]);
        assert.deepEqual([sprite.size3D.x, sprite.size3D.y, sprite.size3D.z], [1, 1, 1], 'a sprite keeps 1');
        assert.deepEqual([unit.size3D.x, unit.size3D.y, unit.size3D.z], [1, 1, 1], 'the unit box is as before');
        assert.ok(LJS.engineObjectsCollect3D(vec3(4, 1, 0), 0).includes(wall), 'collected at its end');
    }
    finally { clearObjects(); }
});

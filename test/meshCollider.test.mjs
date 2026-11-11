import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// MeshCollider makes a mesh's triangles part of the 3D level: an object with collideLevel collides with it as a
// capsule, or a sphere, lands on it and stands, slides along a wall, walks up a low step and down a slope, and
// does not pass through it however fast it goes; particles and picking hit it too

// a fresh headless 3D engine with gravity, a box object of a size, and a way to step and read it
function engine()
{
    const { run } = loadEngine();
    run(`headlessMode = true; new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        var body = (pos, size=vec3(1))=>
        {
            const o = new EngineObject3D(pos, buildBox());
            o.size3D = size;
            o.setCollision(false, false, true); // the level only
            o.mass = 1;
            o.restitution = 0;
            return o;
        };
        var step = (n=1)=> { for (let i = 0; i < n; ++i) engineObjectsUpdate(); };`);
    const json = (code)=> JSON.parse(run(`JSON.stringify(${code})`));
    return { run, json };
}
const near = (a, b, epsilon=1e-3)=> assert.ok(Math.abs(a - b) < epsilon, `${a} is not ${b}`);

test('a box falling onto a floor lands on it and stands, grounded on it', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(20), 1)); var o = body(vec3(0, 3, 0)); step(120);`);
    const [y, vy, ground] = json('[o.pos3D.y, o.velocity3D.y, o.groundObject === deck]');
    near(y, .5, .03); // its round bottom, half its height above the floor
    assert.ok(Math.abs(vy) < .03 && ground, JSON.stringify([vy, ground]));
});

test('it stands still on a ramp within its groundAngle, and slides down a steeper one', () =>
{
    const { run, json } = engine();
    run(`var gentle = new MeshCollider(buildGrid(vec2(20), 1)); gentle.rotation3D = vec3(0, 0, .3);
        var o = body(vec3(0, 3, 0)); step(60); var before = o.pos3D.copy(); step(120);`);
    assert.ok(json('o.pos3D.distance(before)') < .01, 'no creep');
    assert.ok(json('o.groundObject === gentle'));
    const { run: run2, json: json2 } = engine();
    run2(`var steep = new MeshCollider(buildGrid(vec2(20), 1)); steep.rotation3D = vec3(0, 0, 1.1);
        var o = body(vec3(0, 3, 0)); step(60); var before = o.pos3D.copy(); step(60);`);
    assert.ok(json2('o.pos3D.distance(before)') > .5, 'it slides');
});

test('a wall stops a mover at its side and takes the speed into it', () =>
{
    const { run, json } = engine();
    run(`render3D.gravity = vec3();
        var wall = new MeshCollider(buildBox(vec3(1, 10, 10)), vec3(5, 0, 0));
        var o = body(vec3(0, 0, 0)); o.velocity3D = vec3(.2, 0, 0); step(60);`);
    const [x, vx] = json('[o.pos3D.x, o.velocity3D.x]');
    near(x, 4, .02); // the wall's face at 4.5, half the box's width short of it
    assert.ok(vx <= 1e-9, vx);
});

test('a fast mover does not pass through a thin wall', () =>
{
    const { run, json } = engine();
    run(`render3D.gravity = vec3();
        var wall = new MeshCollider(buildBox(vec3(.05, 10, 10)), vec3(3, 0, 0));
        var o = body(vec3(0, 0, 0), vec3(.4)); o.velocity3D = vec3(2.5, 0, 0); o.clampSpeed = false; step(3);`);
    assert.ok(json('o.pos3D.x') < 3, json('o.pos3D.x'));
});

test('it walks up a step lower than its round bottom, and a taller one stops it', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(40), 1));
        var low = new MeshCollider(buildBox(vec3(10, .2, 10)), vec3(7, .1, -12));
        var tall = new MeshCollider(buildBox(vec3(10, 1.5, 10)), vec3(7, .75, 12));
        var a = body(vec3(0, .5, -12)), b = body(vec3(0, .5, 12));
        for (let i = 0; i < 120; ++i) { a.velocity3D.x = b.velocity3D.x = .05; step(); }`);
    assert.ok(json('a.pos3D.x') > 4 && json('a.pos3D.y') > .6, 'up the low step: ' + json('[a.pos3D.x, a.pos3D.y]'));
    assert.ok(json('b.pos3D.x') < 2.1, 'stopped at the tall one: ' + json('b.pos3D.x'));
});

test('walking down a slope it stays on it, grounded every frame', () =>
{
    const { run, json } = engine();
    run(`var ramp = new MeshCollider(buildGrid(vec2(40), 1)); ramp.rotation3D = vec3(0, 0, .4);
        var o = body(vec3(-8, 6, 0)); step(60);
        var grounded = 0;
        for (let i = 0; i < 60; ++i) { o.velocity3D.x = .15; step(); o.groundObject === ramp && ++grounded; }`);
    assert.equal(json('grounded'), 60);
});

test('a sphere collides as its sphere', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(20), 1)); var o = body(vec3(0, 3, 0), vec3(2));
        o.collideAsSphere3D = true; step(120);`);
    near(json('o.pos3D.y'), 1, .03);
});

test('a collider moved after it was made collides where it is now', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(20), 1)); var o = body(vec3(0, 6, 0)); step(5);
        deck.pos3D = vec3(0, 3, 0); step(120);`);
    near(json('o.pos3D.y'), 3.5, .03);
});

test('a mesh given its vertex data collides as any mesh does', () =>
{
    const { run, json } = engine();
    run(`const floats = new Float32Array(4 * RENDER3D_VERTEX_FLOATS), ints = new Uint32Array(floats.buffer);
        [[-10, -10], [10, -10], [10, 10], [-10, 10]].forEach(([x, z], i)=>
            meshWriteVertex(floats, ints, i * RENDER3D_VERTEX_FLOATS, x, 0, z, 0, 1, 0, 0, 0, -1));
        var deck = new MeshCollider(new Mesh().setVertexData(floats, new Uint16Array([0, 2, 1, 0, 3, 2])));
        var o = body(vec3(0, 3, 0)); step(120);`);
    near(json('o.pos3D.y'), .5, .03);
});

test('a particle move meets it, and a pick finds it', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(20), 1), vec3(0, 1, 0));
        var hit = deck.levelSegment3D(vec3(0, 2, 0), vec3(0, 0, 0));
        var miss = deck.levelSegment3D(vec3(0, 3, 0), vec3(0, 2, 0));
        var pick = render3D.pick(new Ray3D(vec3(0, 10, 0), vec3(0, -1, 0)), [deck]);`);
    const [distance, normal, missed, picked] = json('[hit.distance, hit.normal.y, miss === undefined, pick?.distance]');
    near(distance, .5);
    near(normal, 1); // facing back along the move
    assert.ok(missed);
    near(picked, 9);
});

test('it draws nothing, and leaves the level when destroyed', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(20), 1)); var inLevel = render3DLevel.includes(deck);
        deck.destroy(true);`);
    assert.ok(json('inLevel') && !json('render3DLevel.includes(deck)'));
});

test('a fast landing on a finely divided floor comes straight down, with no push sideways off the edges beside it', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(20), vec2(40)));
        var o = body(vec3(.25, 3, .175)); o.velocity3D = vec3(0, -.9, 0); o.clampSpeed = false; step(30);`);
    const [x, z, vx, vz] = json('[o.pos3D.x, o.pos3D.z, o.velocity3D.x, o.velocity3D.z]');
    near(x, .25, .01), near(z, .175, .01);
    assert.ok(Math.abs(vx) < 1e-6 && Math.abs(vz) < 1e-6, JSON.stringify([vx, vz]));
});

test('walking up stairs lower than its round foot it stays grounded, so it can always jump', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(40), 1));
        for (let i = 0; i < 8; ++i)
            new MeshCollider(buildBox(vec3(1, .3 * (i + 1), 4)), vec3(3 + i, .15 * (i + 1), 0));
        var o = body(vec3(0, 1, 0), vec3(.8, 1.6, .8)); step(30);
        var off = 0;
        for (let i = 0; i < 70; ++i) { o.velocity3D.x = .15; step(); o.groundObject || ++off; }`);
    assert.ok(json('o.pos3D.y') > 2, 'it climbed: ' + json('o.pos3D.y'));
    assert.ok(json('off') < 4, 'off the ground ' + json('off') + ' frames');
});

test('a particle starting on a face and moving off it is not stopped, and a pick from inside a box hits its walls', () =>
{
    const { run, json } = engine();
    run(`var deck = new MeshCollider(buildGrid(vec2(20), 1));
        var leaving = deck.levelSegment3D(vec3(.3, 0, .2), vec3(.3, .5, .2));
        var room = new MeshCollider(buildBox(vec3(10)), vec3(50, 0, 0));
        var inside = render3D.pick(new Ray3D(vec3(50, 0, 0), vec3(1, 0, 0)), [room]);`);
    assert.equal(json('leaving === undefined'), true);
    near(json('inside.distance'), 5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// collideWithTile's isHit: true for the tiles the object overlaps where its move put it, or a bullet's ray goes into,
// false for the places the physics only tries after that to find which side it hit, and for the game's own tests.
// Each test has a wall one tile thick at x 10, from y 0 to 10, and a floor at y 0.
const level = (setup='')=> `
    setHeadlessMode(true);
    setGravity(vec2());
    var layer = new TileCollisionLayer(vec2(), vec2(20, 10), tile(), 0, false);
    for (let y = 0; y < 10; ++y)
        layer.setCollisionData(vec2(10, y));
    for (let x = 0; x < 20; ++x)
        layer.setCollisionData(vec2(x, 0));
    var calls = [];
    class Box extends EngineObject
    {
        collideWithTile(data, pos, isHit)
        {
            calls.push({frame: step, x: pos.x, y: pos.y, isHit});
            return data > 0;
        }
    }
    var box = new Box(vec2(8, 5.5), vec2(1));
    box.setCollision(false, false);
    box.damping = 1;
    var step = 0;
    var frames = (count)=> { for (let i = count; i--;) { ++step; engineObjectsUpdate(); } };
    ${setup}`;

test('a box moving into a wall is told of the hit once a frame, and the places tried after it are not hits', () =>
{
    const { run } = loadEngine();
    run(level(`box.velocity = vec2(.25, 0);`)); // its right edge is on the wall at frame 6, in it at 7
    run(`frames(10)`);
    const calls = run(`calls`);
    const hits = calls.filter((c)=> c.isHit), tries = calls.filter((c)=> !c.isHit);
    assert.ok(hits.length, 'it hit the wall');
    assert.ok(tries.length, 'the physics tried other places too, ' + JSON.stringify(calls));
    for (const hit of hits)
        assert.equal(hit.x, 10, 'a hit is the wall tile');
    const framesHit = new Set(hits.map((c)=> c.frame));
    assert.equal(framesHit.size, hits.length, 'one hit a frame: ' + JSON.stringify(hits));
    assert.equal(hits[0].frame, 7, 'the first hit is the frame it went into the wall');
});

test('a box in the air is asked nothing', () =>
{
    const { run } = loadEngine();
    run(level(`box.velocity = vec2(0, .1);`));
    run(`frames(5)`);
    assert.equal(run(`calls.length`), 0);
});

test('a box resting on the floor under gravity is told of a hit every frame', () =>
{
    const { run } = loadEngine();
    run(level(`setGravity(vec2(0, -.02)); box.pos = vec2(4.5, 1.6);`));
    run(`frames(30)`);
    const hits = run(`calls.filter((c)=> c.isHit && c.frame > 10)`);
    assert.equal(hits.length, 20, 'once in each of the last 20 frames');
    for (const hit of hits)
        assert.equal(hit.y, 0, 'the floor');
});

test('every tile a bullet is asked about is a hit', () =>
{
    const { run } = loadEngine();
    run(level(`box.size = vec2(.2); box.isBullet = true; box.velocity = vec2(.5, 0);`));
    run(`frames(10)`);
    const calls = run(`calls`);
    assert.ok(calls.length, 'it hit the wall');
    assert.ok(calls.every((c)=> c.isHit), JSON.stringify(calls));
});

test('the game\'s own tests and raycasts with the object are not hits', () =>
{
    const { run } = loadEngine();
    run(level());
    run(`tileCollisionTest(vec2(10.5, 5.5), vec2(1), box);
        tileCollisionRaycast(vec2(5, 5.5), vec2(15, 5.5), box);`);
    const calls = run(`calls`);
    assert.ok(calls.length >= 2, JSON.stringify(calls));
    assert.ok(calls.every((c)=> !c.isHit), JSON.stringify(calls));
});

test('a callback that throws in a hit leaves no hit behind for the next test', () =>
{
    const { run } = loadEngine();
    run(level(`box.velocity = vec2(2.5, 0); box.clampSpeed = false;
        var thrown = false;
        box.collideWithTile = function(data, pos, isHit)
        {
            calls.push({frame: step, x: pos.x, y: pos.y, isHit});
            if (isHit && !thrown) { thrown = true; throw new Error('from the game'); }
            return data > 0;
        };`));
    assert.throws(()=> run(`frames(1)`), /from the game/);
    run(`calls.length = 0; tileCollisionTest(vec2(10.5, 5.5), vec2(1), box);`);
    assert.ok(run(`calls.length && calls.every((c)=> !c.isHit)`), JSON.stringify(run(`calls`)));
});

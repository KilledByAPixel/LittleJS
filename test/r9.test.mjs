import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, EngineObject3D, TileCollisionLayer, ImageFont, TileInfo, TextureInfo, PathFinder, Ray3D,
    vec2, vec3, tile } = LJS;

// review round 9: moving static solids bounce what they hit and carry stacks, riders keep up with a platform going
// down, a flipped gravityScale lands on ceilings, tile callbacks get their own positions, image fonts follow their
// tile's columns, the path finder's heap, and 3D picking by the box of a mesh

LJS.setEngineManualStep(true);
await LJS.engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
new LJS.Render3DPlugin;

const clearObjects = ()=> { LJS.engineObjectsDestroy(); LJS.engineObjectsUpdate(); };
const withGravity = (g, f)=> { const old = LJS.gravity.copy(); LJS.setGravity(g); try { f(); } finally { LJS.setGravity(old); clearObjects(); } };
const solid = (pos, size, mass=1)=> { const o = new EngineObject(pos, size); o.mass = mass; o.setCollision(); return o; };

test('a static paddle moved into a ball by setting pos bounces it, not stops it', () => withGravity(vec2(), ()=>
{
    // the pong short: the ball has just passed the paddle's top edge when the paddle is swiped under it
    const paddle = solid(vec2(9, 1), vec2(4, .5), 0);
    const ball = solid(vec2(10.2, 1.4), vec2(.5));
    ball.restitution = 1;
    ball.velocity = vec2(.2, -.2);
    LJS.engineStep();
    paddle.pos = vec2(10.4, 1.4); // under the ball now
    LJS.engineStep();
    assert.ok(ball.velocity.y > .19, 'it bounces up: ' + ball.velocity);
    assert.ok(ball.pos.y > 1.6, 'out of the paddle: ' + ball.pos);
}));

test('a rider stays on a static platform moving down', () => withGravity(vec2(0, -.01), ()=>
{
    const platform = solid(vec2(0, 0), vec2(4, 1), 0);
    platform.velocity = vec2(0, -.05);
    const rider = solid(vec2(0, 1.01), vec2(1));
    let grounded = 0;
    for (let i = 120; i--;)
    {
        LJS.engineStep();
        rider.groundObject && ++grounded;
    }
    assert.ok(grounded > 100, 'grounded on most frames, not bobbing above it: ' + grounded);
    assert.ok(Math.abs(rider.pos.y - platform.pos.y - 1) < .06, 'and on it at the end');
}));

test('a stack on a rising static platform rides together in any creation order', () =>
{
    for (const order of ['platform first', 'platform last'])
    withGravity(vec2(0, -.01), ()=>
    {
        const makePlatform = ()=> { const p = solid(vec2(0, 0), vec2(4, 1), 0); p.velocity = vec2(0, .05); return p; };
        const platform = order === 'platform first' ? makePlatform() : undefined;
        const a = solid(vec2(0, 1.001), vec2(1));
        const b = solid(vec2(0, 2.002), vec2(1));
        const p = platform || makePlatform();
        LJS.engineStep(120);
        assert.ok(a.pos.y > p.pos.y + .9, order + ': the lower box is on the platform, not through it');
        assert.ok(b.pos.y > a.pos.y + .9, order + ': the upper box is on the lower one, not inside it');
    });
});

test('an object with a negative gravityScale lands on a ceiling, grounded like on a floor', () => withGravity(vec2(0, -.01), ()=>
{
    const layer = new TileCollisionLayer(vec2(), vec2(4, 8), tile(), 0, false);
    for (let x = 4; x--;) layer.setCollisionData(vec2(x, 6));
    const o = new EngineObject(vec2(2, 3), vec2(1));
    o.setCollision();
    o.gravityScale = -1;
    LJS.engineStep(80);
    assert.ok(Math.abs(o.pos.y - 5.5) < .01, 'resting under the ceiling: ' + o.pos.y);
    assert.equal(o.groundObject, layer);
    layer.destroy();
}));

test('tile collision callbacks each get their own position, one they can keep', () =>
{
    const layer = new TileCollisionLayer(vec2(20, 0), vec2(4), tile(), 0, false);
    for (let x = 3; x--;) layer.setCollisionData(vec2(x, 0));
    const seen = [];
    LJS.tileCollisionTest(vec2(21.5, .5), vec2(3, 1), (data, pos)=> { seen.push(pos); return false; });
    assert.deepEqual(seen.map(p=> p.x + ',' + p.y), ['20,0', '21,0', '22,0']);
    const rayed = [];
    LJS.tileCollisionRaycast(vec2(19.5, .5), vec2(23.5, .5), (data, pos)=> { rayed.push(pos); return false; });
    assert.equal(new Set(rayed).size, rayed.length, 'the raycast too');
    layer.destroy();
    clearObjects();
});

test('an ImageFont whose tile has columns finds its glyphs in them, like a font packed by loadSprite', () =>
{
    const texture = new TextureInfo({width: 2048, height: 64}, false);
    const font = new ImageFont(new TileInfo(vec2(100, 8), vec2(8), texture, 0, 0, 16)); // 16 glyphs a row at x 100
    assert.deepEqual(font.getGlyphPos(0).toString(), vec2(100, 8).toString(), 'the space');
    assert.deepEqual(font.getGlyphPos(33).toString(), vec2(108, 24).toString(), "'A' on the third row");

    // a font with no columns counts along the texture's grid, as before
    const grid = new ImageFont(new TileInfo(vec2(), vec2(8), new TextureInfo({width: 256, height: 24}, false), 1));
    assert.deepEqual(grid.getGlyphPos(25).toString(), vec2(1, 11).toString(), 'wraps at the texture width, 25 a row');
});

test('the path finder finds the shortest path, and gives up on a walled in goal quickly', () =>
{
    // a maze with one gap, so the path has to go round
    const size = 64, pf = new PathFinder(vec2(size));
    pf.smoothPath = false;
    pf.isWalkable = (x, y)=> !(x === 32 && y > 0);
    const path = pf.findPath(vec2(10.5, 40.5), vec2(50.5, 40.5));
    assert.ok(path.length, 'found');
    let length = 0;
    for (let i = 1; i < path.length; ++i) length += path[i].distance(path[i-1]);
    // through the gap at (32, 0), which is entered and left straight since a diagonal can not cut the wall's corner:
    // (10,40) to (31,0), two steps across, then (33,0) to (50,40), each leg 40 straight and the rest diagonal
    const shortest = 82 + 38 * (Math.SQRT2 - 1);
    assert.ok(Math.abs(length - shortest) < 1e-6, 'the shortest way round: ' + length + ' ' + shortest);

    // a goal inside a closed ring on a big map, the whole map is searched
    const big = new PathFinder(vec2(256));
    big.smoothPath = false;
    const ring = (x, y)=> Math.max(Math.abs(x - 250), Math.abs(y - 250)) === 1;
    big.isWalkable = (x, y)=> !ring(x, y);
    const start = performance.now();
    assert.deepEqual(big.findPath(vec2(.5), vec2(250.5)), []);
    const time = performance.now() - start;
    assert.ok(time < 1500, 'a heap, not a scan of the open list each step: ' + time.toFixed(0) + 'ms');
});

test('3D picking hits the box of a mesh, so a big floor does not win over what stands on it', () =>
{
    const floor = new EngineObject3D(vec3(), LJS.render3D.planeMesh);
    floor.scale3D = vec3(60, 1, 60);
    const box = new EngineObject3D(vec3(3, .5, 0), LJS.buildBox());
    try
    {
        const eye = vec3(0, 6, 12), ray = new Ray3D(eye, box.pos3D.subtract(eye));
        assert.equal(LJS.render3D.pick(ray)?.object, box, 'the box, not the floor it stands on');
        const hits = LJS.engineObjectsRaycast3D(ray);
        assert.equal(hits[0], box);
        assert.ok(hits.includes(floor), 'the floor after it');
    }
    finally { clearObjects(); }
});

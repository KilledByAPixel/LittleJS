import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

const abs = Math.abs;

// A bullet, isBullet, moves through the tiles as a point along a ray: it can not pass through a tile at any speed,
// collideWithTile sees it where the ray goes into the tile, and it stops at the surface and bounces off it.
// Each test has a wall one tile thick at x 10, from y 0 to 10, and a floor at y 0.
const level = (setup='')=> `
    setHeadlessMode(true);
    setGravity(vec2());
    var layer = new TileCollisionLayer(vec2(), vec2(20, 10), tile(), 0, false);
    for (let y = 0; y < 10; ++y)
        layer.setCollisionData(vec2(10, y));
    for (let x = 0; x < 20; ++x)
        layer.setCollisionData(vec2(x, 0));
    var bullet = new EngineObject(vec2(2, 5), vec2(.2));
    bullet.setCollision(false, false);
    bullet.isBullet = true;
    bullet.damping = 1;
    var frames = (count)=> { for (let i = count; i--;) engineObjectsUpdate(); };
    ${setup}`;

test('a bullet faster than a tile a frame stops at the wall, where a box would pass through it', () =>
{
    const { run } = loadEngine();
    run(level(`bullet.velocity = vec2(5, 0); bullet.clampSpeed = false;`));
    const x = run(`frames(4); bullet.pos.x`);
    assert.ok(abs(x - 10) < .01, 'it stands at the wall\'s face, ' + x);

    const box = loadEngine();
    box.run(level(`bullet.isBullet = false; bullet.velocity = vec2(5, 0); bullet.clampSpeed = false;`));
    assert.ok(box.run(`frames(4); bullet.pos.x`) > 11, 'a box at that speed jumps the wall');
});

test('a bullet is not held to objectMaxSpeed for the tiles', () =>
{
    const { run } = loadEngine();
    run(level(`bullet.velocity = vec2(3, 0);`));
    assert.equal(run(`frames(1); bullet.velocity.x`), 3);
});

test('collideWithTile sees the bullet where the ray goes into the tile', () =>
{
    const { run } = loadEngine();
    run(level(`
        var seen = [];
        bullet.collideWithTile = (data, pos)=> (seen.push([bullet.pos.x, bullet.pos.y, pos.x, pos.y]), true);
        bullet.velocity = vec2(4, 1);`));
    const seen = JSON.parse(run(`frames(3); JSON.stringify(seen)`));
    assert.equal(seen.length, 1, 'asked once, about the tile it hit');
    const [x, y, tileX, tileY] = seen[0];
    assert.equal(tileX, 10, 'the wall tile');
    assert.equal(tileY, 7); // (10, 7) is the bottom left of the tile at row 7
    assert.ok(abs(x - 10) < 1e-9 && abs(y - 7) < 1e-9, 'at the wall\'s face on its line, ' + [x, y]);
});

test('a bullet bounces off a wall by its restitution and slides along it with none', () =>
{
    const { run } = loadEngine();
    run(level(`bullet.velocity = vec2(3, 1); bullet.restitution = 1;`));
    const [vx, vy] = JSON.parse(run(`frames(3); JSON.stringify([bullet.velocity.x, bullet.velocity.y])`));
    assert.deepEqual([vx, vy], [-3, 1], 'turned back, its speed along the wall kept');

    const slide = loadEngine();
    slide.run(level(`bullet.velocity = vec2(3, 1);`));
    const [sx, sy] = JSON.parse(slide.run(`frames(3); JSON.stringify([bullet.velocity.x, bullet.velocity.y])`));
    assert.deepEqual([sx, sy], [0, 1], 'stopped against the wall, still moving along it');
});

test('a falling bullet lands on the floor and stands on it', () =>
{
    const { run } = loadEngine();
    run(level(`setGravity(vec2(0, -.05)); bullet.velocity = vec2(0, -2);`));
    const [y, ground] = JSON.parse(run(`frames(30); JSON.stringify([bullet.pos.y, bullet.groundObject === layer])`));
    assert.ok(abs(y - 1) < .01, 'on the floor\'s top, ' + y);
    assert.ok(ground, 'standing on the layer');
});

test('a bullet passes a tile its collideWithTile lets through, and a one way tile from its open side', () =>
{
    const { run } = loadEngine();
    run(level(`bullet.collideWithTile = (data, pos)=> pos.x != 10; bullet.velocity = vec2(4, 0);`));
    assert.ok(run(`frames(3); bullet.pos.x`) > 13, 'through the wall its callback lets it pass');

    const oneWay = loadEngine();
    oneWay.run(level(`
        for (let y = 0; y < 10; ++y)
            layer.setData(vec2(10, y), new TileLayerData(3));
        layer.setOneWay(3, vec2(1, 0));
        bullet.velocity = vec2(4, 0);`));
    assert.ok(oneWay.run(`frames(3); bullet.pos.x`) > 13, 'through a wall that is one way to the right');
    oneWay.run(`bullet.velocity = vec2(-4, 0)`);
    assert.ok(abs(oneWay.run(`frames(3); bullet.pos.x`) - 11) < .01, 'and stopped by it coming back');
});

test('a bullet that starts inside a tile moves out of it freely', () =>
{
    const { run } = loadEngine();
    run(level(`bullet.pos = vec2(10.5, 5); bullet.velocity = vec2(1, 0);`));
    assert.ok(abs(run(`frames(1); bullet.pos.x`) - 11.5) < 1e-9);
});

// a bullet over several layers: one of its own setup, with no wall at x 10
const layers = (setup)=> `
    setHeadlessMode(true);
    setGravity(vec2());
    var make = (cells, data=1, restitution=0)=>
    {
        const l = new TileCollisionLayer(vec2(), vec2(20, 10), tile(), 0, false);
        for (const [x, y] of cells)
        {
            l.setData(vec2(x, y), new TileLayerData(data));
            l.setCollisionData(vec2(x, y), data);
        }
        l.restitution = restitution;
        return l;
    };
    var bullet = new EngineObject(vec2(2, 1.5), vec2(.2));
    bullet.setCollision(false, false);
    bullet.isBullet = true;
    bullet.damping = 1;
    bullet.clampSpeed = false;
    var frames = (count)=> { for (let i = count; i--;) engineObjectsUpdate(); };
    ${setup}`;

test('a bullet that went into a one way tile it passes is still stopped by the wall after it', () =>
{
    const { run } = loadEngine();
    run(layers(`
        const pass = make([[1, 1]], 5);
        pass.setOneWay(5, vec2(1, 0));
        make([[2, 1]]);
        bullet.pos = vec2(.5, 1.5);
        bullet.velocity = vec2(.6, 0);`));
    const x = run(`frames(4); bullet.pos.x`);
    assert.ok(abs(x - 2) < .01, 'stopped at the wall at x 2, ' + x);

    // and one that starts inside a solid tile moves out of it, then is stopped by the next
    const { run: run2 } = loadEngine();
    run2(layers(`make([[1, 1], [5, 1]]); bullet.pos = vec2(1.5, 1.5); bullet.velocity = vec2(10, 0);`));
    assert.ok(abs(run2(`frames(1); bullet.pos.x`) - 5) < .01, 'out of the tile it was in, stopped by the next');
});

test('a bullet bounces by the layer it hit, not one its collideWithTile let through', () =>
{
    for (const ignoredFirst of [true, false])
    {
        const { run } = loadEngine();
        run(layers(`
            const ignored = () => make([[5, 1]], 1, 1);
            const blocking = () => make([[5, 1]], 2, 0);
            ${ignoredFirst} ? (ignored(), blocking()) : (blocking(), ignored());
            bullet.collideWithTile = (data)=> data === 2;
            bullet.velocity = vec2(10, 0);`));
        const [x, vx] = JSON.parse(run(`frames(1); JSON.stringify([bullet.pos.x, bullet.velocity.x])`));
        assert.ok(abs(x - 5) < .01, `ignored layer first ${ignoredFirst}: at the wall, ${x}`);
        assert.equal(vx, 0, `ignored layer first ${ignoredFirst}: no bounce, the layer it hit has none`);
    }
});

test('a bullet\'s collideWithTile is asked about the nearest tile first, across layers', () =>
{
    for (const farFirst of [true, false])
    {
        const { run } = loadEngine();
        run(layers(`
            ${farFirst} ? (make([[8, 1]]), make([[4, 1]])) : (make([[4, 1]]), make([[8, 1]]));
            var impacts = [];
            bullet.collideWithTile = (data, pos)=>
            {
                if (bullet.destroyed) return true;
                impacts.push([pos.x, bullet.pos.x]);
                bullet.destroy();
                return true;
            };
            bullet.velocity = vec2(10, 0);`));
        assert.equal(run(`frames(1); JSON.stringify(impacts)`), '[[4,4]]', `far layer first ${farFirst}`);
    }

    // a near wall it lets through, and the far one stops it
    const { run } = loadEngine();
    run(layers(`make([[4, 1]], 3); make([[8, 1]]); bullet.collideWithTile = (data)=> data != 3;
        bullet.velocity = vec2(10, 0);`));
    assert.ok(abs(run(`frames(1); bullet.pos.x`) - 8) < .01, 'through the near wall to the far one');
});

test('a long move through empty space walks only the cells near the layers, and still hits a wall far off', () =>
{
    const { run } = loadEngine();
    run(layers(`
        make([[3, 1]]); // near the start
        var far = new TileCollisionLayer(vec2(5000, 0), vec2(4, 4), tile(), 0, false);
        far.setCollisionData(vec2(1, 1));
        var visits = 0;
        const walk = lineTest;
        lineTest = (a, b, test, normal)=> walk(a, b, (cell)=> (++visits, test(cell)), normal);
        bullet.collideWithTile = (data, pos)=> pos.x > 100; // through the near wall
        bullet.velocity = vec2(10000, 0);`));
    const [x, visits] = JSON.parse(run(`frames(1); JSON.stringify([bullet.pos.x, visits])`));
    assert.ok(abs(x - 5001) < .01, 'stopped by the far wall, ' + x);
    assert.ok(visits < 40, 'the cells near the two layers, not the 5000 between, ' + visits);
});

test('a steep shot that starts on a tile\'s face bounces off that face, not off the one its slope suggests', () =>
{
    // on the wall's face at x 10, going right and steeply up
    const { run } = loadEngine();
    run(level(`bullet.pos = vec2(10, 5.5); bullet.velocity = vec2(1, 2); bullet.restitution = 1;`));
    const [vx, vy] = JSON.parse(run(`frames(1); JSON.stringify([bullet.velocity.x, bullet.velocity.y])`));
    assert.deepEqual([vx, vy], [-1, 2], 'turned back off the side, its climb kept');
    assert.ok(run(`frames(5); bullet.pos.x`) < 6, 'and it left the wall');

    // the same going left from a whole number position, onto a tile's right face
    const left = loadEngine();
    left.run(level(`bullet.pos = vec2(11, 5.5); bullet.velocity = vec2(-1, -2); bullet.restitution = 1;`));
    assert.deepEqual(JSON.parse(left.run(`frames(1); JSON.stringify([bullet.velocity.x, bullet.velocity.y])`)), [1, -2]);
});

test('a bullet rolling along the floor under gravity goes as far as a box does', () =>
{
    const { run } = loadEngine();
    run(level(`setGravity(vec2(0, -.01)); bullet.pos = vec2(2, 1.1); bullet.friction = 1;
        bullet.velocity = vec2(.1, 0);`));
    const x = run(`frames(30); bullet.pos.x`);
    assert.ok(abs(x - 5) < .05, 'about 30 times .1 along, ' + x);
});

test('a bullet of no size is not held to objectMaxSpeed with solid collision on, one with a size is', () =>
{
    const { run } = loadEngine();
    run(level(`bullet.size = vec2(); bullet.setCollision(); bullet.isBullet = true; bullet.velocity = vec2(3, 0);`));
    assert.equal(run(`frames(1); bullet.velocity.x`), 3);
    const sized = loadEngine();
    sized.run(level(`bullet.setCollision(); bullet.isBullet = true; bullet.velocity = vec2(3, 0);`));
    assert.equal(sized.run(`frames(1); bullet.velocity.x`), 1);
});

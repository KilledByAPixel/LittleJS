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

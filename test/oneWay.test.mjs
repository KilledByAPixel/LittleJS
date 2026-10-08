import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

const abs = Math.abs;

// One way tiles and objects: a platform is passed through moving its way and blocks only what was wholly on its far
// side before it moved. Each test makes a level of its own: a floor at y 0 and a platform row at y 5, from x 0 to 20.
const level = (setup='')=> `
    setHeadlessMode(true);
    setGravity(vec2(0, -.02));
    var layer = new TileCollisionLayer(vec2(), vec2(20, 12), tile(), 0, false);
    for (let x = 0; x < 20; ++x)
    {
        layer.setData(vec2(x, 0), new TileLayerData(1));
        layer.setCollisionData(vec2(x, 0));
    }
    for (let x = 5; x < 15; ++x)
    {
        layer.setData(vec2(x, 5), new TileLayerData(5));
        layer.setCollisionData(vec2(x, 5));
    }
    layer.setOneWay(5);
    var body = new EngineObject(vec2(10, 9), vec2(1));
    body.setCollision();
    var frames = (count)=> { for (let i = count; i--;) engineObjectsUpdate(); };
    ${setup}`;

test('an object falling onto a one way platform lands on it', () =>
{
    const { run } = loadEngine();
    run(level());
    const [y, ground] = JSON.parse(run(`frames(120); JSON.stringify([body.pos.y, body.groundObject === layer])`));
    assert.ok(abs(y - 6.5) < .01, 'standing on the platform at y 6.5, ' + y);
    assert.ok(ground);
});

test('an object jumping up from below goes through it and lands on top', () =>
{
    const { run } = loadEngine();
    run(level('body.pos = vec2(10, 1.5);'));
    const result = JSON.parse(run(`
        frames(5);
        const onFloor = abs(body.pos.y - 1.5) < .01;
        body.velocity = vec2(0, .7); // up past the platform
        let highest = 0;
        for (let i = 120; i--;)
            engineObjectsUpdate(), highest = max(highest, body.pos.y);
        JSON.stringify([onFloor, highest, body.pos.y])`));
    const [onFloor, highest, y] = result;
    assert.ok(onFloor, 'it starts on the floor');
    assert.ok(highest > 7, 'it rose above the platform, ' + highest);
    assert.ok(abs(y - 6.5) < .01, 'and came down on top of it, ' + y);
});

test('an object moving sideways at the platform\'s height goes through its end', () =>
{
    const { run } = loadEngine();
    run(level('setGravity(vec2()); body.pos = vec2(2, 5.5);'));
    const x = run(`body.velocity = vec2(.2, 0); frames(60); body.pos.x`);
    assert.ok(x > 13, 'it went along through the platform, ' + x);
});

test('a tile that is not one way stays solid from below', () =>
{
    const { run } = loadEngine();
    run(level('layer.oneWayTiles.delete(5); body.pos = vec2(10, 1.5);'));
    const highest = run(`
        frames(5);
        body.velocity = vec2(0, .7);
        let highest = 0;
        for (let i = 60; i--;)
            engineObjectsUpdate(), highest = max(highest, body.pos.y);
        highest`);
    assert.ok(highest < 4.6, 'it bumped its head under the platform, ' + highest);
});

test('collideWithTile is not asked about a one way tile passed through, and false drops through it', () =>
{
    const { run } = loadEngine();
    run(level(`
        var asked = [];
        var drop = false;
        body.collideWithTile = (data, pos)=> (asked.push(pos.y), !(drop && pos.y == 5)); // drop through, not the floor
        body.pos = vec2(10, 1.5);`));
    const result = JSON.parse(run(`
        frames(5);
        asked.length = 0;
        body.velocity = vec2(0, .7);
        frames(15); // rising through the platform
        const askedRising = asked.filter((y)=> y == 5).length;
        frames(120); // down onto it
        const landed = abs(body.pos.y - 6.5) < .01;
        drop = true;
        frames(60);
        JSON.stringify([askedRising, landed, body.pos.y])`));
    const [askedRising, landed, y] = result;
    assert.equal(askedRising, 0, 'not asked about the platform on the way up');
    assert.ok(landed, 'it landed on the platform');
    assert.ok(abs(y - 1.5) < .01, 'returning false dropped it to the floor, ' + y);
});

test('a one way tile is turned and mirrored as its art is', () =>
{
    // a tile passed through to the right, in all 8 of its turns and mirrors, against a box wholly on each side
    const { run } = loadEngine();
    const results = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        const layer = new TileCollisionLayer(vec2(), vec2(3, 3), tile(), 0, false);
        layer.setOneWay(7, vec2(1, 0));
        const sides = [[vec2(1, 0), vec2(2.5, 1.5)], [vec2(-1, 0), vec2(.5, 1.5)],
            [vec2(0, 1), vec2(1.5, 2.5)], [vec2(0, -1), vec2(1.5, .5)]];
        const results = [];
        for (let mirror = 0; mirror < 2; ++mirror)
        for (let direction = 0; direction < 4; ++direction)
        {
            layer.setData(vec2(1, 1), new TileLayerData(7, direction, !!mirror));
            // the side it blocks from is the one a box there does not pass
            const blocking = sides.filter(([side, pos])=>
                !tileCollisionOneWayPass(layer, 1, 1, pos.x, pos.y, 1, 1)).map(([side])=> [side.x, side.y]);
            results.push([direction, mirror, blocking]);
        }
        return JSON.stringify(results);
    })()`));
    for (const [direction, mirror, blocking] of results)
    {
        // the way, mirrored first, then turned a quarter clockwise for each step: right, down, left, up
        let way = mirror ? [-1, 0] : [1, 0];
        for (let i = direction; i--;)
            way = [way[1], -way[0]];
        assert.deepEqual(blocking, [way.map((v)=> v + 0)], `direction ${direction}, mirror ${mirror}`);
    }
});

test('a raycast is stopped by a one way tile only coming from its far side', () =>
{
    const { run } = loadEngine();
    run(level());
    const [down, up] = JSON.parse(run(`JSON.stringify([
        tileCollisionRaycast(vec2(10.5, 9), vec2(10.5, 3)),
        tileCollisionRaycast(vec2(10.5, 3), vec2(10.5, 9))])`));
    assert.ok(down && abs(down.y - 6) < .01, 'down from above it hits the top, ' + JSON.stringify(down));
    assert.equal(up, null, 'up from below it goes through'); // undefined, as JSON
});

test('tileCollisionTest goes by an object\'s pos, and with no object a one way tile is solid', () =>
{
    const { run } = loadEngine();
    run(level());
    const [above, below, none] = JSON.parse(run(`
        const box = vec2(10.5, 5.5), size = vec2(1);
        body.pos = vec2(10.5, 6.5);
        const above = !!tileCollisionTest(box, size, body);
        body.pos = vec2(10.5, 4.5);
        const below = !!tileCollisionTest(box, size, body);
        JSON.stringify([above, below, !!tileCollisionTest(box, size)])`));
    assert.equal(above, true, 'an object above it finds it solid');
    assert.equal(below, false, 'one below it does not');
    assert.equal(none, true, 'with no object it is solid');
});

test('particles land on a one way tile and rise through it', () =>
{
    const { run } = loadEngine();
    run(level());
    const [fromAbove, fromBelow, floor] = JSON.parse(run(`JSON.stringify([
        tileCollisionGetDataFrom(vec2(10.5, 5.9), 10.5, 6.1),
        tileCollisionGetDataFrom(vec2(10.5, 5.1), 10.5, 4.9),
        tileCollisionGetDataFrom(vec2(10.5, .5), 10.5, -1)])`));
    assert.equal(fromAbove, 1, 'falling onto it, it is solid');
    assert.equal(fromBelow, 0, 'rising into it, it is not');
    assert.equal(floor, 1, 'a tile that is not one way is solid from anywhere');
});

test('a one way object is landed on, jumped through, and carries a rider as it rises', () =>
{
    const { run } = loadEngine();
    run(level(`
        layer.oneWayTiles.delete(5);
        for (let x = 5; x < 15; ++x)
            layer.clearCollisionData(vec2(x, 5));
        var platform = new EngineObject(vec2(10, 5.5), vec2(6, 1));
        platform.setCollision();
        platform.mass = 0;
        platform.oneWay = vec2(0, 1);`));
    const result = JSON.parse(run(`
        frames(120);
        const landed = abs(body.pos.y - 6.5) < .01 && body.groundObject === platform;
        // from the floor, up through it
        body.pos = vec2(10, 1.5), body.velocity = vec2();
        frames(5);
        body.velocity = vec2(0, .7);
        let highest = 0;
        for (let i = 120; i--;)
            engineObjectsUpdate(), highest = max(highest, body.pos.y);
        const jumped = highest > 7 && abs(body.pos.y - 6.5) < .01;
        // the platform rises with the rider on it
        platform.velocity = vec2(0, .05);
        frames(40);
        platform.velocity = vec2();
        frames(30);
        JSON.stringify([landed, jumped, body.pos.y - platform.pos.y])`));
    const [landed, jumped, riding] = result;
    assert.ok(landed, 'it landed on the platform');
    assert.ok(jumped, 'it jumped up through it and landed back on top');
    assert.ok(abs(riding - 1) < .01, 'it rode the platform up, ' + riding);
});

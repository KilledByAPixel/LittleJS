import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The built in physics knocked around for a long time: objects of many sizes, whole number sizes whose edges land on
// grid lines among them, in a walled room of tiles with blocks inside, colliding with the tiles and with each other,
// kicked every so often, gravity turning over now and then. After every frame no object may be inside a solid tile
// or outside the room, which is what an object pushed into a wall, through a floor or out of the level looks like.

// a room of size w by h, walls one tile thick, blocks in it from the seed, and count objects in clear places
const room = (seed, count, w=24, h=16)=> `
    setHeadlessMode(true);
    const random = new RandomGenerator(${seed});
    var layer = new TileCollisionLayer(vec2(), vec2(${w}, ${h}), tile(), 0, false);
    for (let x = 0; x < ${w}; ++x)
    for (let y = 0; y < ${h}; ++y)
        if (!x || !y || x == ${w - 1} || y == ${h - 1} || random.float() < .08)
            layer.setCollisionData(vec2(x, y), 1);
    // sizes that end on grid lines, just under them, a platformer's, and any
    const sizes = [vec2(1), vec2(2), vec2(1, 2), vec2(2, 1), vec2(.99995), vec2(.999), vec2(.6, .95), vec2(.5)];
    var bodies = [];
    for (let tries = 0; bodies.length < ${count} && tries < 5000; ++tries)
    {
        const size = random.float() < .7 ? sizes[random.int(sizes.length)].copy() :
            vec2(random.float(.2, 2.2), random.float(.2, 2.2));
        // whole and half positions put edges on grid lines too
        const pos = random.float() < .5 ?
            vec2(random.int(2, ${w - 2}) + (random.float() < .5 ? .5 : 0), random.int(2, ${h - 2}) + (random.float() < .5 ? .5 : 0)) :
            vec2(random.float(2, ${w - 2}), random.float(2, ${h - 2}));
        if (tileCollisionTest(pos, size) || bodies.some((o)=> isOverlapping(pos, size, o.pos, o.size)))
            continue;
        const o = new EngineObject(pos, size);
        const collide = random.float() < .7;
        o.setCollision(collide, collide && random.float() < .7); // a solid collides too
        o.mass = random.float(.5, 2);
        // half move exactly: across in eighths of a unit, with nothing to blur that, so their edges keep landing on
        // grid lines as whole sizes moving at round speeds do in a game
        o.exact = random.float() < .5;
        o.restitution = o.exact ? random.int(2) : random.float() < .5 ? 0 : random.float(0, .9);
        o.friction = o.exact ? 1 : random.float(.5, 1);
        o.damping = o.exact || random.float() < .5 ? 1 : random.float(.9, 1);
        bodies.push(o);
    }
    var step = (frame)=>
    {
        // every so often kick some of them hard, and now and then turn gravity over or off
        if (frame % 23 == 0)
            for (const o of bodies)
                if (random.float() < .3)
                    o.velocity = random.float() < .15 ? vec2(random.float(-1, 1), random.float(-1, 1)) : // as fast as it goes
                        vec2(o.exact ? random.int(-5, 6) / 8 : random.float(-.6, .6), random.float(-.6, .6));
        // the exact ones also walk, their speed set every frame as a player's is
        for (const o of bodies)
            if (o.exact && frame % 23 < 15)
                o.velocity.x = (bodies.indexOf(o) % 9 - 4) / 8;
        if (frame % 157 == 0)
            setGravity(vec2(0, [-.01, .01, -.02, 0][random.int(4)]));
        if (frame % 211 == 0)
            for (const o of bodies)
                o.gravityScale = random.float() < .2 ? -1 : 1;
        engineObjectsUpdate();
    };
    // a hair inside the object's box, so one resting flush against a tile does not count
    var trouble = ()=>
    {
        for (const o of bodies)
        {
            const inner = vec2(abs(o.size.x) - 1e-6, abs(o.size.y) - 1e-6);
            if (tileCollisionTest(o.pos, inner))
                return 'inside a tile: ' + bodies.indexOf(o) + ' at ' + o.pos + ' size ' + o.size;
            if (!(o.pos.x > 1 && o.pos.x < ${w - 1} && o.pos.y > 1 && o.pos.y < ${h - 1}))
                return 'out of the room: ' + bodies.indexOf(o) + ' at ' + o.pos + ' size ' + o.size;
        }
    };`;

for (const seed of [1, 2, 3, 4, 5, 6])
test(`objects knocked around a room of tiles never end a frame inside a tile or outside the room, seed ${seed}`, () =>
{
    const { run } = loadEngine();
    run(room(seed, 40));
    const result = run(`
        let found;
        for (let frame = 0; frame < 3000 && !found; ++frame)
        {
            step(frame);
            const t = trouble();
            if (t) found = 'frame ' + frame + ', ' + t;
        }
        setGravity(vec2());
        found || 'clean'`);
    assert.equal(result, 'clean');
});

test('a wall snap with an edge on a grid line does not step the object into the tile behind it', () =>
{
    // the scene from review pass 12: a wall ahead, a block behind and below, the leading edge on a grid line
    const { run } = loadEngine();
    const result = JSON.parse(run(`
        setHeadlessMode(true);
        setGravity(vec2(0, -.01));
        const layer = new TileCollisionLayer(vec2(), vec2(10), tile(), 0, false);
        for (let i = 0; i < 10; ++i)
            layer.setCollisionData(vec2(5, i), 1), layer.setCollisionData(vec2(i, 0), 1);
        layer.setCollisionData(vec2(3, 1), 1);
        const o = new EngineObject(vec2(4.5, 2.6), vec2(1));
        o.collideLevel = true;
        o.damping = 1;
        const path = [];
        for (let i = 20; i--;)
        {
            o.velocity = vec2(.1, o.velocity.y || -.2);
            o.updatePhysics();
            path.push(!!tileCollisionTest(o.pos, vec2(1 - 1e-6)));
        }
        setGravity(vec2());
        JSON.stringify({inside: path.indexOf(true), y: o.pos.y, ground: o.groundObject === layer})`));
    assert.equal(result.inside, -1, 'never inside a tile');
    assert.ok(Math.abs(result.y - 1.5) < 1e-3, 'it lands on the floor: ' + result.y);
    assert.equal(result.ground, true);
});

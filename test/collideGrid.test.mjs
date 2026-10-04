import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Object to object collision finds what is near each mover through a grid once there are many solids, rather than
// checking every pair; it must resolve every contact exactly as checking every pair does, in the same order, so a
// game plays the same either way: the same scene is run both ways and compared value for value, frame by frame.

// a scene of movers and fixed solids of many sizes, some fixed ones moving, made the same in each engine
const scene = (count, grid)=> `
    setHeadlessMode(true);
    engineCollideGridMin = ${grid ? 0 : 1e9};
    setGravity(vec2(0, -.01));
    const random = new RandomGenerator(7);
    var bodies = [];
    for (let i = 0; i < ${count}; ++i)
    {
        const fixed = random.float() < .2;
        const o = new EngineObject(vec2(random.float(-40, 40), random.float(-30, 30)),
            vec2(random.float(.3, fixed ? 12 : 2), random.float(.3, fixed ? 3 : 2)));
        o.setCollision(true, random.float() < .8);
        o.mass = fixed ? 0 : random.float(.5, 2);
        o.restitution = random.float(0, .8);
        o.velocity = vec2(random.float(-.3, .3), random.float(-.3, .3));
        if (fixed && random.float() < .3)
            o.velocity = vec2(random.float(-.05, .05), 0); // a moving platform
        bodies.push(o);
    }
    // a floor and walls so they pile up
    for (const [x, y, w, h] of [[0, -32, 90, 2], [-46, 0, 2, 70], [46, 0, 2, 70]])
    {
        const wall = new EngineObject(vec2(x, y), vec2(w, h));
        wall.setCollision(); wall.mass = 0; bodies.push(wall);
    }
    var state = ()=> bodies.map((o)=> [o.pos.x, o.pos.y, o.velocity.x, o.velocity.y, o.groundObject ? bodies.indexOf(o.groundObject) : -1]);`;

test('collision through the grid resolves every contact exactly as checking every pair does', () =>
{
    const grid = loadEngine(), all = loadEngine();
    grid.run(scene(400, true));
    all.run(scene(400, false));
    for (let frame = 0; frame < 120; ++frame)
    {
        grid.run('engineObjectsUpdate()');
        all.run('engineObjectsUpdate()');
        const a = JSON.stringify(grid.run('state()')), b = JSON.stringify(all.run('state()'));
        if (a !== b)
            assert.fail('frame ' + frame + ' differs');
    }
});

test('with many solids the grid checks far fewer boxes than every pair', () =>
{
    const counts = {};
    for (const [name, grid] of [['grid', true], ['all', false]])
    {
        const { run } = loadEngine();
        run(scene(1000, grid));
        run(`var checks = 0; const overlap = EngineObject.prototype.isOverlappingObject;
            EngineObject.prototype.isOverlappingObject = function(o) { ++checks; return overlap.call(this, o); };
            engineObjectsUpdate();`);
        counts[name] = run('checks');
    }
    assert.ok(counts.grid * 10 < counts.all, JSON.stringify(counts));
});

test('the grid follows a collision callback that moves the other object far away, or destroys it', () =>
{
    const runs = [true, false].map((grid)=>
    {
        const engine = loadEngine();
        engine.run(scene(300, grid) + `
            bodies.forEach((o, i)=>
            {
                if (i % 7 == 0) // throws what it touches across the room
                    o.collideWithObject = (other)=> (other.mass && other.pos.set(-other.pos.x, other.pos.y + 5), true);
                if (i % 11 == 0) // breaks what it touches
                    o.collideWithObject = (other)=> (other.mass && other.size.x < .5 && other.destroy(), true);
            });`);
        return engine;
    });
    for (let frame = 0; frame < 90; ++frame)
    {
        const [a, b] = runs.map(({ run })=> (run('engineObjectsUpdate()'), JSON.stringify(run('state()'))));
        if (a !== b)
            assert.fail('frame ' + frame + ' differs');
    }
});

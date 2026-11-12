import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// 3D solid collision finds what is near each solid through a grid once there are many, rather than checking every
// one before it; it must resolve every contact exactly as checking every pair does, in the same order, so a game
// plays the same either way: the same scene is run both ways and compared value for value, frame by frame.

// a scene of movers and fixed solids, boxes, turned boxes and spheres of many sizes, some fixed ones moving, piling
// onto a floor between walls, a room of a given half width, made the same in each engine
const scene = (count, grid, room=12)=> `
    setHeadlessMode(true);
    new Render3DPlugin;
    engineCollideGridMin = ${grid ? 0 : 1e9};
    render3D.gravity = vec3(0, -.01, 0);
    const random = new RandomGenerator(7);
    var bodies = [];
    for (let i = 0; i < ${count}; ++i)
    {
        const fixed = random.float() < .2;
        const o = new EngineObject3D(vec3(random.float(-${room}, ${room}), random.float(-8, 20), random.float(-${room}, ${room})));
        o.size3D = vec3(random.float(.3, fixed ? 8 : 2), random.float(.3, fixed ? 2 : 2), random.float(.3, fixed ? 8 : 2));
        o.collideAsSphere3D = !fixed && random.float() < .3;
        random.float() < .2 && (o.rotation3D = vec3(0, random.float(0, 3), random.float(-.3, .3)));
        o.setCollision(true, random.float() < .8);
        o.mass = fixed ? 0 : random.float(.5, 2);
        o.restitution = random.float(0, .8);
        o.velocity3D = vec3(random.float(-.3, .3), random.float(-.3, .3), random.float(-.3, .3));
        if (fixed && random.float() < .3)
            o.velocity3D = vec3(random.float(-.05, .05), 0, 0); // a moving platform
        bodies.push(o);
    }
    // a floor and walls so they pile up
    for (const [x, y, z, w, h, d] of [[0, -10, 0, ${room * 2.5}, 2, ${room * 2.5}], [${-room * 1.25}, 0, 0, 2, 40, ${room * 2.5}],
        [${room * 1.25}, 0, 0, 2, 40, ${room * 2.5}], [0, 0, ${-room * 1.25}, ${room * 2.5}, 40, 2],
        [0, 0, ${room * 1.25}, ${room * 2.5}, 40, 2]])
    {
        const wall = new EngineObject3D(vec3(x, y, z));
        wall.size3D = vec3(w, h, d);
        wall.setCollision();
        wall.mass = 0;
        bodies.push(wall);
    }
    var state = ()=> bodies.map((o)=> [o.pos3D.x, o.pos3D.y, o.pos3D.z, o.velocity3D.x, o.velocity3D.y, o.velocity3D.z,
        o.groundObject ? bodies.indexOf(o.groundObject) : -1, o.destroyed]);`;

// run a scene both ways and fail at the first frame they differ
function compare(count, extra='', frames=120)
{
    const grid = loadEngine(), all = loadEngine();
    grid.run(scene(count, true) + extra);
    all.run(scene(count, false) + extra);
    for (let frame = 0; frame < frames; ++frame)
    {
        grid.run('engineObjectsUpdate()');
        all.run('engineObjectsUpdate()');
        const a = JSON.stringify(grid.run('state()')), b = JSON.stringify(all.run('state()'));
        if (a !== b)
            assert.fail('frame ' + frame + ' differs');
    }
}

test('3D collision through the grid resolves every contact exactly as checking every pair does', () =>
{
    compare(400);
});

test('the grid follows a collision callback that moves the other object far away, or destroys it', () =>
{
    compare(300, `
        bodies.forEach((o, i)=>
        {
            if (i % 7 == 0) // throws what it touches across the room
                o.collideWithObject = (other)=> (other.mass && other.pos3D.set(-other.pos3D.x, other.pos3D.y + 5,
                    other.pos3D.z), true);
            if (i % 11 == 0) // breaks what it touches
                o.collideWithObject = (other)=> (other.mass && other.size3D.x < .5 && other.destroy(), true);
        });`);
});

test('with many solids the grid tests far fewer pairs than every pair', () =>
{
    const counts = {};
    for (const [name, grid] of [['grid', true], ['all', false]])
    {
        const { run } = loadEngine();
        run(scene(1000, grid, 40)); // spread out, as a level is
        run(`var checks = 0; const reach = render3DSolidReach;
            render3DSolidReach = (o)=> (++checks, reach(o));
            engineObjectsUpdate();`);
        counts[name] = run('checks');
    }
    assert.ok(counts.grid * 10 < counts.all, JSON.stringify(counts));
});

test('an updatePhysics called by hand outside the engine pass checks every pair, not a grid made for the pass', () =>
{
    const { run } = loadEngine();
    run(scene(100, true));
    run('engineObjectsUpdate()');
    // moved far after the pass, the grid of that pass would not know it is now on top of the first body
    assert.equal(run(`
        const mover = bodies.find((o)=> o.mass && !o.collideAsSphere3D);
        const target = bodies.find((o)=> o !== mover && bodies.indexOf(o) < bodies.indexOf(mover) && o.isSolid);
        mover.pos3D = target.pos3D.copy();
        mover.velocity3D = vec3();
        let met = false;
        mover.collideWithObject = (other)=> (other === target && (met = true), true);
        mover.updatePhysics();
        met`), true);
});

test('the grid follows a callback that moves the other far away and lets the pair pass', () =>
{
    compare(300, `
        bodies.forEach((o, i)=>
        {
            if (i % 7 == 0)
                o.collideWithObject = (other)=> (other.mass && other.pos3D.set(-other.pos3D.x, other.pos3D.y + 5,
                    other.pos3D.z), false);
        });`);
});

test('the grid follows an updatePhysics override that moves its object after the engine physics', () =>
{
    compare(300, `
        bodies.forEach((o, i)=>
        {
            if (i % 5 == 0 && o.mass)
                o.updatePhysics = function()
                {
                    EngineObject3D.prototype.updatePhysics.call(this);
                    if (this.pos3D.y < -6) this.pos3D = vec3(-this.pos3D.x, 15, -this.pos3D.z);
                };
        });`);
});

test('the grid follows a callback that grows the other and lets the pair pass', () =>
{
    compare(300, `
        bodies.forEach((o, i)=>
        {
            if (i % 7 == 0)
                o.collideWithObject = (other)=> (other.mass && other.size3D.x < 3 &&
                    (other.size3D = other.size3D.scale(1.5)), false);
        });`);
});

test('a solid a collision callback teleports is tested where it went for the rest of its turn, grid or not', () =>
{
    for (const grid of [false, true])
    {
        const { run } = loadEngine();
        const contacts = JSON.parse(run(`
            setHeadlessMode(true);
            new Render3DPlugin;
            engineCollideGridMin = ${grid ? 0 : 1e9};
            const make = (name, x)=>
            {
                const o = new EngineObject3D(vec3(x, 0, 0), render3D.boxMesh);
                o.name = name; o.mass = 0; o.setCollision(true, true, false); o.collideWithObject = ()=> false;
                return o;
            };
            const portal = make('portal', 0), oldTrigger = make('oldTrigger', 0), arrival = make('arrival', 10);
            const player = make('player', 0);
            player.mass = 1;
            const contacts = [];
            player.collideWithObject = (other)=>
            {
                contacts.push(other.name);
                other === portal && (player.pos3D.x = 10);
                return false;
            };
            engineObjectsUpdate();
            JSON.stringify(contacts)`));
        assert.deepEqual(contacts, ['portal', 'arrival'], 'grid ' + grid);
    }
});

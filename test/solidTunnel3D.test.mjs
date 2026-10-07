import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A fast object hitting a thin solid in 3D is stopped on the side it came from, as in 2D, where it was pushed out by
// least overlap, which once it passed the solid's middle sent it on out the far side at full speed: it went through
// anything thinner than its own size when moving faster than half of the two sizes a frame.

// a static box of the given size at the origin and a mover of size .5 coming at it along an axis at a speed
function shoot(boxSize, start, velocity, frames=8)
{
    const { run } = loadEngine();
    return JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        const wall = new EngineObject3D(vec3(), undefined); wall.size3D = ${boxSize}; wall.setCollision(); wall.mass = 0;
        const ball = new EngineObject3D(${start}, undefined); ball.size3D = vec3(.5); ball.setCollision(); ball.mass = 1;
        ball.damping = 1;
        for (let i = ${frames}; i--;) { ball.velocity3D = ${velocity}; engineObjectsUpdate(); }
        JSON.stringify({x: ball.pos3D.x, y: ball.pos3D.y, z: ball.pos3D.z})`));
}

test('a fast mover is stopped by a thin wall on the side it came from', ()=>
{
    const at = shoot('vec3(.05, 2, 2)', 'vec3(-1, 0, 0)', 'vec3(.3, 0, 0)');
    assert.ok(at.x < 0, 'it stays on its side: ' + at.x);
    assert.ok(Math.abs(at.x + .275) < 1e-6, 'against the wall');
});

test('one at .6 a frame is stopped by a wall .5 thick, from either side and along z', ()=>
{
    assert.ok(shoot('vec3(.5, 2, 2)', 'vec3(-1.5, 0, 0)', 'vec3(.6, 0, 0)').x < 0);
    assert.ok(shoot('vec3(.5, 2, 2)', 'vec3(1.5, 0, 0)', 'vec3(-.6, 0, 0)').x > 0);
    assert.ok(shoot('vec3(2, 2, .5)', 'vec3(0, 0, -1.5)', 'vec3(0, 0, .6)').z < 0);
});

test('a fast fall onto a thin floor lands on it', ()=>
{
    const at = shoot('vec3(4, .05, 4)', 'vec3(0, 1, 0)', 'vec3(0, -.4, 0)');
    assert.ok(Math.abs(at.y - .275) < 1e-6, 'standing on it: ' + at.y);
});

for (const wallsFirst of [true, false])
for (const seed of [1, 2, 3])
test(`objects knocked around a room of solid walls never leave it, walls made ${wallsFirst ? 'first' : 'last'}, seed ${seed}`, ()=>
{
    // six walls 1 thick around a room 8 across, and 30 movers of many sizes, kicked up to the speed cap, colliding
    // with the walls; after every frame each one is still inside. A move longer than the mover's size and the
    // wall's thickness together skips it with no overlap at all, in 2D too, so the walls are thick enough that every
    // move overlaps, many of them past the wall's middle, which pushing by least overlap sent through. The movers
    // push each other, a few of them heavy, under gravity, so piles press into the floor and the walls, and none may
    // end a frame even partly in a wall. Objects update in the order they were made, and a pair is resolved in the
    // turn of the later one, so the room is built before the movers and after them
    const { run } = loadEngine();
    const result = run(`setHeadlessMode(true); new Render3DPlugin; setGravity(vec2());
        const random = new RandomGenerator(${seed}), half = 4, w = half + .5;
        const makeWalls = ()=>
        {
            for (const [pos, size] of [[vec3(w, 0, 0), vec3(1, 10, 10)], [vec3(-w, 0, 0), vec3(1, 10, 10)],
                [vec3(0, w, 0), vec3(10, 1, 10)], [vec3(0, -w, 0), vec3(10, 1, 10)],
                [vec3(0, 0, w), vec3(10, 10, 1)], [vec3(0, 0, -w), vec3(10, 10, 1)]])
            {
                const wall = new EngineObject3D(pos); wall.size3D = size; wall.setCollision(); wall.mass = 0;
            }
        };
        ${wallsFirst ? 'makeWalls();' : ''}
        render3D.gravity = vec3(0, -.01, 0);
        const bodies = [];
        for (let i = 0; i < 30; ++i)
        {
            const o = new EngineObject3D(vec3(random.float(-3, 3), random.float(-3, 3), random.float(-3, 3)));
            o.size3D = random.float() < .5 ? vec3(random.float(.2, 1)) : vec3(random.float(.2, 1), random.float(.2, 1), random.float(.2, 1));
            o.collideAsSphere3D = random.float() < .3;
            o.setCollision(true, random.float() < .7); o.mass = random.float() < .2 ? 20 : random.float(.5, 2);
            o.restitution = random.float(0, .9); o.damping = 1;
            bodies.push(o);
        }
        ${wallsFirst ? '' : 'makeWalls();'}
        let found;
        for (let frame = 0; frame < 900 && !found; ++frame)
        {
            if (frame % 20 == 0)
                for (const o of bodies)
                    if (random.float() < .4)
                        o.velocity3D = vec3(random.float(-1, 1), random.float(-1, 1), random.float(-1, 1));
            engineObjectsUpdate();
            for (const o of bodies)
            {
                // all of it inside, a hair allowed for one resting against a wall
                const s = o.size3D, e = o.collideAsSphere3D ? vec3(Math.max(s.x, s.y, s.z) / 2) : s.scale(.5);
                if (!(Math.abs(o.pos3D.x) + e.x < half + 1e-4 && Math.abs(o.pos3D.y) + e.y < half + 1e-4 &&
                    Math.abs(o.pos3D.z) + e.z < half + 1e-4))
                    found = 'frame ' + frame + ': ' + bodies.indexOf(o) + ' at ' + o.pos3D + ' size ' + s;
            }
        }
        found || 'clean'`);
    assert.equal(result, 'clean');
});

test('a mover shoved into a wall by another is settled against it at once, a pair asked once a frame', ()=>
{
    // b rests by the wall, a heavy a runs into it from behind and shoves it in; b is put back against the wall the
    // same frame, the wall heard about b once, and a wall that lets b through, as a one way one does, keeps it
    for (const letThrough of [false, true])
    {
        const { run } = loadEngine();
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            const wall = new EngineObject3D(vec3(1, 0, 0)); wall.size3D = vec3(1, 4, 4); wall.setCollision(); wall.mass = 0;
            let asked = 0;
            wall.collideWithObject = (o)=> (o === b && ++asked, !${letThrough});
            const b = new EngineObject3D(vec3(.25, 0, 0)); b.size3D = vec3(.5); b.setCollision(); b.mass = 1; b.damping = 1;
            const a = new EngineObject3D(vec3(-.5, 0, 0)); a.size3D = vec3(.5); a.setCollision(); a.mass = 20; a.damping = 1;
            a.velocity3D = vec3(.4, 0, 0);
            engineObjectsUpdate();
            JSON.stringify({b: b.pos3D.x, asked})`));
        if (letThrough)
            assert.ok(result.b > .25, 'a wall that lets it through keeps it: ' + result.b);
        else
        {
            assert.ok(Math.abs(result.b - .25) < 1e-6, 'back against the wall: ' + result.b);
            assert.equal(result.asked, 1, 'the wall heard about it once');
        }
    }
});

test('a mover pushed into the floor by one before it in the list, in its own turn, stays on the floor', ()=>
{
    // a heavy b sinks into a light a resting on the floor; b is earlier in the list, so a meets it in a's own turn,
    // after a met the floor: a stays on the floor and b takes the whole push, sideways as well as down
    for (const [ax, label] of [[0, 'straight'], [.1, 'off center']])
    {
        const { run } = loadEngine();
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            const ground = new EngineObject3D(vec3(0, -.5, 0)); ground.size3D = vec3(4, 1, 4); ground.setCollision(); ground.mass = 0;
            const b = new EngineObject3D(vec3(0, .55, 0)); b.size3D = vec3(.5); b.setCollision(); b.mass = 20; b.damping = 1;
            const a = new EngineObject3D(vec3(${ax}, .25, 0)); a.size3D = vec3(.5); a.setCollision(); a.mass = 1; a.damping = 1;
            engineObjectsUpdate();
            JSON.stringify({a: a.pos3D.y, b: b.pos3D.y})`));
        assert.ok(Math.abs(result.a - .25) < 1e-6, label + ': a on the floor: ' + result.a);
        assert.ok(result.b > .75 - 1e-6, label + ': b on a: ' + result.b);
    }
});

test('a box resting on a turned ramp stays put, whichever of the two updates first', ()=>
{
    // the settle after a push tested the box against the ramp that pushed it, found a rounding error of overlap and
    // pushed it along the ramp's slanted normal, a little downhill each time, where standing holds it
    for (const boxFirst of [true, false])
    {
        const { run } = loadEngine();
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);
            const makeRamp = ()=> { const r = new EngineObject3D(vec3()); r.size3D = vec3(10, 1, 4);
                r.rotation3D = vec3(0, 0, .3); r.setCollision(); r.mass = 0; };
            ${boxFirst ? '' : 'makeRamp();'}
            const box = new EngineObject3D(vec3(0, 1, 0)); box.size3D = vec3(.5); box.setCollision(); box.mass = 1;
            ${boxFirst ? 'makeRamp();' : ''}
            for (let i = 60; i--;) engineObjectsUpdate(); // it lands
            const x = box.pos3D.x; let on = 0;
            for (let i = 300; i--;) { engineObjectsUpdate(); on += !!box.groundObject; }
            JSON.stringify({landed: x, moved: box.pos3D.x - x, on})`));
        const label = boxFirst ? 'box first' : 'ramp first';
        assert.ok(Math.abs(result.landed) < .01, label + ': it lands where it fell: ' + result.landed);
        assert.ok(Math.abs(result.moved) < 1e-3, label + ': and stays: ' + result.moved);
        assert.equal(result.on, 300, label + ': standing all along');
    }
});

// two objects of the given sizes, masses and speeds along x, made in the given order, a's speed and b's kept each
// frame; true when a ends the frames still on its side of b
function pass(order, a, b, frames=6)
{
    const { run } = loadEngine();
    return run(`setHeadlessMode(true); new Render3DPlugin;
        const make = (o)=> { const e = new EngineObject3D(vec3(o.x, 0, 0)); e.size3D = vec3(o.size, o.size, 2);
            e.setCollision(); e.mass = o.mass; e.damping = 1; e.restitution = 0; e.speed = o.speed; return e; };
        const specA = ${JSON.stringify(a)}, specB = ${JSON.stringify(b)};
        const first = make(${order == 'ab' ? 'specA' : 'specB'}), second = make(${order == 'ab' ? 'specB' : 'specA'});
        const a = ${order == 'ab' ? 'first' : 'second'}, b = ${order == 'ab' ? 'second' : 'first'};
        for (let i = ${frames}; i--;)
        {
            a.velocity3D = vec3(a.speed, 0, 0);
            b.velocity3D = vec3(b.speed, 0, 0);
            engineObjectsUpdate();
        }
        a.pos3D.x < b.pos3D.x`);
}

test('two movers do not pass through each other, whichever was made first', ()=>
{
    // head on at .3 each, a closing speed of .6, which 2D holds to 1; and one at .6 into one at rest
    for (const order of ['ab', 'ba'])
    {
        assert.ok(pass(order, {x: -1, size: .5, mass: 1, speed: .3}, {x: 1, size: .5, mass: 1, speed: -.3}),
            'head on, ' + order);
        assert.ok(pass(order, {x: -1, size: .5, mass: 1, speed: .6}, {x: 0, size: .5, mass: 1, speed: 0}),
            'into one at rest, ' + order);
    }
});

test('a thin platform rising into a falling box carries it, whichever was made first', ()=>
{
    // closing at .4 a frame, under the .6 of the two sizes, past which 2D goes through too
    for (const platformFirst of [true, false])
    {
        const { run } = loadEngine();
        const y = run(`setHeadlessMode(true); new Render3DPlugin;
            const makePlatform = ()=> { const p = new EngineObject3D(vec3(0, -1, 0)); p.size3D = vec3(4, .1, 4);
                p.setCollision(); p.mass = 0; p.velocity3D = vec3(0, .2, 0); return p; };
            ${platformFirst ? 'var platform = makePlatform();' : ''}
            const box = new EngineObject3D(vec3(0, .5, 0)); box.size3D = vec3(.5); box.setCollision(); box.mass = 1;
            box.damping = 1; box.velocity3D = vec3(0, -.2, 0);
            ${platformFirst ? '' : 'var platform = makePlatform();'}
            for (let i = 8; i--;) engineObjectsUpdate();
            box.pos3D.y - platform.pos3D.y`);
        assert.ok(y > .3 - 1e-6, (platformFirst ? 'platform first' : 'box first') + ': the box stays on top: ' + y);
    }
});

test('a heavy pusher shoving a crate into a wall leaves both on their sides, in every order', ()=>
{
    // A of mass 20 driven at .1 a frame into crate B of mass 1, which is pushed into a fixed wall .2 thick
    for (const order of ['ABW', 'WAB', 'WBA', 'BAW'])
    {
        const { run } = loadEngine();
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            const made = {};
            for (const name of '${order}')
            {
                const [x, size, mass] = name == 'A' ? [-1, .5, 20] : name == 'B' ? [0, .5, 1] : [.6, .2, 0];
                const o = made[name] = new EngineObject3D(vec3(x, 0, 0)); o.size3D = vec3(size, 2, 2);
                o.setCollision(); o.mass = mass; o.damping = 1; o.restitution = 0;
            }
            for (let i = 30; i--;) { made.A.velocity3D = vec3(.1, 0, 0); engineObjectsUpdate(); }
            JSON.stringify({a: made.A.pos3D.x, b: made.B.pos3D.x})`));
        assert.ok(result.b < .5 - .25 + 1e-6, order + ': the crate stays this side of the wall: ' + result.b);
        assert.ok(result.a < result.b - .5 + 1e-6, order + ': the pusher stays behind the crate: ' + result.a);
    }
});

test('a wall is asked about an object once a frame, also when it is made after the two that push', ()=>
{
    // crate, pusher, wall: the settle asks the wall about the crate pushed into it, and the wall's own turn asked again
    for (const letThrough of [false, true])
    {
        const { run } = loadEngine();
        const asked = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            const b = new EngineObject3D(vec3(.25, 0, 0)); b.size3D = vec3(.5); b.setCollision(); b.mass = 1; b.damping = 1;
            const a = new EngineObject3D(vec3(-.5, 0, 0)); a.size3D = vec3(.5); a.setCollision(); a.mass = 20; a.damping = 1;
            const wall = new EngineObject3D(vec3(1, 0, 0)); wall.size3D = vec3(1, 4, 4); wall.setCollision(); wall.mass = 0;
            const counts = [];
            let asked = 0;
            wall.collideWithObject = (o)=> (o === b && ++asked, !${letThrough});
            for (let i = 4; i--;)
            {
                asked = 0; a.velocity3D = vec3(.4, 0, 0);
                engineObjectsUpdate();
                counts.push(asked);
            }
            JSON.stringify(counts)`));
        assert.ok(asked.every((n)=> n <= 1), (letThrough ? 'one way' : 'solid') + ': asked once a frame at most: ' + asked);
    }
});

test('a wall that blocks solids but is not solid itself holds a shoved crate too, in every order', ()=>
{
    // setCollision(true, false): it stops a solid that meets it, as a pair does, and the settle must agree
    for (const order of ['ABW', 'WAB', 'WBA', 'BAW', 'BWA', 'AWB'])
    {
        const { run } = loadEngine();
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            const made = {};
            for (const name of '${order}')
            {
                const [x, size, mass] = name == 'A' ? [-1, .5, 20] : name == 'B' ? [0, .5, 1] : [1, 1, 0];
                const o = made[name] = new EngineObject3D(vec3(x, 0, 0)); o.size3D = vec3(size, 2, 2);
                o.setCollision(true, name != 'W'); o.mass = mass; o.damping = 1; o.restitution = 0;
            }
            let worst = -9;
            for (let i = 30; i--;)
            {
                made.A.velocity3D = vec3(.4, 0, 0); engineObjectsUpdate();
                worst = Math.max(worst, made.B.pos3D.x);
            }
            JSON.stringify({b: worst, a: made.A.pos3D.x, bEnd: made.B.pos3D.x})`));
        assert.ok(result.b < .25 + 1e-6, order + ': the crate never goes into the wall: ' + result.b);
        assert.ok(result.a < result.bEnd - .5 + 1e-6, order + ': the pusher stays behind the crate: ' + JSON.stringify(result));
    }
});

test('a crate shoved into a voxel wall by a pusher is settled against the wall, not left inside the block', ()=>
{
    // the settle after a push saw the solid objects only, and the level's blocks were left to the crate's next turn
    for (const pusherFirst of [true, false])
    {
        const { run } = loadEngine();
        const worst = run(`setHeadlessMode(true); new Render3DPlugin;
            const map = new VoxelMap(vec3(0, -4, -4), vec3(16, 8, 8));
            for (let y = 0; y < 8; ++y) for (let z = 0; z < 8; ++z) map.setVoxel(vec3(10, y, z), 1); // a wall at x 10 to 11
            const make = (x, size, mass)=> { const o = new EngineObject3D(vec3(x, 0, 0)); o.size3D = vec3(size, 2, 2);
                o.setCollision(); o.mass = mass; o.damping = 1; o.restitution = 0; return o; };
            const a = ${pusherFirst} ? make(5, .5, 20) : undefined, b = make(8, .5, 1), pusher = a || make(5, .5, 20);
            let worst = 0;
            for (let i = 40; i--;) { pusher.velocity3D = vec3(.4, 0, 0); engineObjectsUpdate(); worst = Math.max(worst, b.pos3D.x); }
            map.destroy();
            worst`);
        assert.ok(worst < 9.75 + 1e-6, (pusherFirst ? 'pusher first' : 'crate first') + ': the crate stays out of the wall: ' + worst);
    }
});

test('a crate a collision callback teleports past a height map ridge stays there, and its pusher is not carried back', ()=>
{
    // the settle's level step swept from where the crate began the pass to where the callback put it, so the ridge
    // between stopped it there, and the pusher then took back what the crate could not move
    for (const pusherFirst of [true, false])
    {
        const { run } = loadEngine();
        const ends = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            const row = []; for (let i = 0; i < 41; ++i) row.push(i == 20 ? 1 : 0); // a ridge 5 tall at x 0
            const ground = new HeightMap([row, row, row], vec2(40, 4), 5);
            const make = (x, mass)=> { const o = new EngineObject3D(vec3(x, .6, 0)); o.size3D = vec3(1);
                o.setCollision(); o.mass = mass; o.damping = 1; o.restitution = 0; return o; };
            const a = ${pusherFirst} ? make(-9, 20) : undefined, b = make(-8, 1), pusher = a || make(-9, 20);
            let teleported = false;
            b.collideWithObject = (o)=> { if (!teleported) { teleported = true; b.pos3D = vec3(8, .6, 0); } return true; };
            for (let i = 5; i--;) { pusher.velocity3D = vec3(.3, 0, 0); engineObjectsUpdate(); }
            ground.destroy();
            JSON.stringify({pusher: pusher.pos3D.x, crate: b.pos3D.x, teleported})`));
        const order = pusherFirst ? 'pusher first' : 'crate first';
        assert.ok(ends.teleported, order + ': the two met');
        assert.ok(ends.crate > 7, order + ': the crate stays where it was sent: ' + ends.crate);
        assert.ok(ends.pusher > -9, order + ': the pusher is not carried back: ' + ends.pusher);
    }
});

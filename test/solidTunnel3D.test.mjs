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

for (const seed of [1, 2, 3])
test(`objects knocked around a room of solid walls never leave it, seed ${seed}`, ()=>
{
    // six walls 1 thick around a room 8 across, and 30 movers of many sizes, kicked up to the speed cap, colliding
    // with the walls; after every frame each one is still inside. A move longer than the mover's size and the
    // wall's thickness together skips it with no overlap at all, in 2D too, so the walls are thick enough that every
    // move overlaps, many of them past the wall's middle, which pushing by least overlap sent through. The movers
    // push each other, a few of them heavy, under gravity, so piles press into the floor and the walls, and none may
    // end a frame even partly in a wall
    const { run } = loadEngine();
    const result = run(`setHeadlessMode(true); new Render3DPlugin; setGravity(vec2());
        const random = new RandomGenerator(${seed}), half = 4, w = half + .5;
        for (const [pos, size] of [[vec3(w, 0, 0), vec3(1, 10, 10)], [vec3(-w, 0, 0), vec3(1, 10, 10)],
            [vec3(0, w, 0), vec3(10, 1, 10)], [vec3(0, -w, 0), vec3(10, 1, 10)],
            [vec3(0, 0, w), vec3(10, 10, 1)], [vec3(0, 0, -w), vec3(10, 10, 1)]])
        {
            const wall = new EngineObject3D(pos); wall.size3D = size; wall.setCollision(); wall.mass = 0;
        }
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

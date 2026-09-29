import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Render3DPlugin, ParticleEmitter3D, HeightMap, VoxelMap, vec2, vec3, WHITE, PI } from '../dist/littlejs.esm.js';

// 3D particles as the 2D ones: callbacks when one is made, moves, hits the level and goes, and, opted in, collision
// with the level's height maps and voxel maps. A particle is numbers in the emitter's array, so a callback gets a
// view of one, an object the emitter reuses, whose changes are written back.

new Render3DPlugin;
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} is not ${b}`);

// an emitter that makes nothing on its own, straight down, one particle at a time by hand; each lives 10 seconds
function makeEmitter(pos=vec3(0, 5, 0), speed=0, gravity=0)
{
    const e = new ParticleEmitter3D(pos, 0, 0, 0, 0, undefined, WHITE, WHITE, WHITE, WHITE, 10, .1, .1, speed, 1,
        gravity, 0, 0);
    e.rotation3D.x = PI; // it emits along its own up, aimed down
    return e;
}
const particle = (e, i=0)=> { const d = e.particleData, k = i * 21; return {
    pos: vec3(d[k], d[k+1], d[k+2]), velocity: vec3(d[k+3], d[k+4], d[k+5]), age: d[k+17], life: d[k+16] }; };

test('the create callback gets each particle as it is made, and what it changes is kept', ()=>
{
    const e = makeEmitter(), made = [];
    e.particleCreateCallback = (p)=>
    {
        made.push([p.pos.y, p.emitter === e, p.lifeTime]);
        p.velocity.x = 2;
    };
    e.emitParticle();
    e.emitParticle();
    assert.deepEqual(made.map((m)=> m[1]), [true, true]);
    near(made[0][0], 5);
    near(made[0][2], 10);
    near(particle(e, 1).velocity.x, 2);
    e.destroy(true);
});

test('the update callback gets each particle after it moves, and can move it', ()=>
{
    const e = makeEmitter(vec3(0, 5, 0), .5), seen = [];
    e.particleUpdateCallback = (p)=>
    {
        seen.push(p.pos.y);
        p.pos.z = 3;
    };
    e.emitParticle();
    e.update();
    near(seen[0], 4.5, 'after the move');
    near(particle(e).pos.z, 3);
    near(particle(e).age, 1/60, 'it aged');
    e.destroy(true);
});

test('the destroy callback gets a particle as its life runs out, and destroy() from a callback ends it at once', ()=>
{
    const e = makeEmitter(), gone = [];
    e.particleDestroyCallback = (p)=> gone.push(p.pos.y);
    e.particleTime = 1/60 * 1.5; // gone after its second update
    e.emitParticle();
    e.update();
    assert.deepEqual([e.particleCount, gone.length], [1, 0]);
    e.update();
    assert.deepEqual([e.particleCount, gone.length], [0, 1]);

    e.particleTime = 10;
    e.particleUpdateCallback = (p)=> p.pos.y < 5.5 && p.destroy();
    e.emitParticle();
    e.update();
    assert.deepEqual([e.particleCount, gone.length], [0, 2], 'destroyed in the update that asked');
    e.destroy(true);
});

test('with collideLevel off particles pass through a height map, on they stop on it', ()=>
{
    const ground = new HeightMap([[0, 0], [0, 0]], vec2(10), 1);
    const e = makeEmitter(vec3(0, .3, 0), .5);
    e.emitParticle();
    e.update();
    near(particle(e).pos.y, -.2, 'through');

    e.collideLevel = true;
    e.emitParticle();
    e.update();
    const p = particle(e, 1);
    near(p.pos.y, 1e-3, 'on the surface');
    near(p.velocity.y, 0, 'restitution 0 stops the fall');
    ground.destroy();
    e.destroy(true);
});

test('a particle bounces off a slope by the emitter\'s restitution and slides by its friction', ()=>
{
    const ground = new HeightMap([[0, 0], [0, 0]], vec2(10), 1);
    const e = makeEmitter(vec3(0, .3, 0), .5);
    e.collideLevel = true;
    e.restitution = .5;
    e.friction = 1;
    e.particleCreateCallback = (p)=> { p.velocity.x = .2; };
    e.emitParticle();
    e.update();
    const p = particle(e);
    near(p.velocity.y, .25, 'half the speed it came in with, back up');
    near(p.velocity.x, .2, 'no friction along it');
    near(p.pos.x, .2 * .6, 'as far along as the move went before the hit');
    ground.destroy();
    e.destroy(true);
});

test('the collide callback decides: false lets the particle through, and it gets the level and the point', ()=>
{
    const ground = new HeightMap([[0, 0], [0, 0]], vec2(10), 1), hits = [];
    const e = makeEmitter(vec3(1, .3, 0), .5);
    e.collideLevel = true;
    e.particleCollideCallback = (p, level, pos)=>
    {
        hits.push([level === ground, pos.x, pos.y]);
        return false;
    };
    e.emitParticle();
    e.update();
    assert.deepEqual(hits.map((h)=> h[0]), [true]);
    near(hits[0][1], 1);
    near(hits[0][2], 0);
    near(particle(e).pos.y, -.2, 'let through');

    // rain that ends where it lands
    e.particleCollideCallback = (p)=> p.destroy();
    e.emitParticle();
    e.update();
    assert.equal(e.particleCount, 1, 'the one that landed is gone, the first is still falling under it');
    ground.destroy();
    e.destroy(true);
});

test('a particle that starts under the ground is let go, as in 2D', ()=>
{
    const ground = new HeightMap([[0, 0], [0, 0]], vec2(10), 1);
    const e = makeEmitter(vec3(0, -1, 0), .5);
    e.collideLevel = true;
    e.emitParticle();
    e.update();
    near(particle(e).pos.y, -1.5);
    ground.destroy();
    e.destroy(true);
});

test('a particle off the edge of a height map falls past it', ()=>
{
    const ground = new HeightMap([[0, 0], [0, 0]], vec2(10), 1);
    const e = makeEmitter(vec3(8, .3, 0), .5);
    e.collideLevel = true;
    e.emitParticle();
    e.update();
    near(particle(e).pos.y, -.2);
    ground.destroy();
    e.destroy(true);
});

test('a particle lands on top of a voxel block and bounces off its side', ()=>
{
    const map = new VoxelMap(vec3(), vec3(8));
    map.setVoxel(vec3(2, 0, 2), 1);
    const e = makeEmitter(vec3(2.5, 1.3, 2.5), .5);
    e.collideLevel = true;
    e.emitParticle();
    e.update();
    near(particle(e).pos.y, 1 + 1e-3, 'on the block');

    e.restitution = 1;
    e.rotation3D = vec3(0, 0, -PI / 2); // along +X, into the block's side
    e.pos3D = vec3(1.7, .5, 2.5);
    e.emitParticle();
    e.update();
    const p = particle(e, 1);
    near(p.pos.x, 2 - 1e-3, 'at the side');
    near(p.velocity.x, -.5, 'bounced straight back');
    map.destroy();
    e.destroy(true);
});

// review 3: a callback that emits can grow the arrays under the update, and runs the create callback inside itself

test('a callback that emits when the emitter is full keeps what every particle was given, and ages them all', ()=>
{
    for (const start of [63, 64]) // 64 fills the first arrays, one more grows them
    {
        const e = makeEmitter(vec3(0, 5, 0));
        for (let i = start; i--;) e.emitParticle();
        let first = true;
        e.particleUpdateCallback = (p)=>
        {
            if (first) { first = false; e.emitParticle(); }
            p.pos.x = 123;
        };
        e.update();
        assert.equal(e.particleCount, start + 1);
        for (let i = 0; i < start; ++i)
        {
            const p = particle(e, i);
            near(p.pos.x, 123, `particle ${i} of ${start} kept its move`);
            near(p.age, 1/60, `particle ${i} of ${start} aged`);
        }
        e.destroy(true);
    }
});

test('a particle made inside another\'s callback gets its own view, the one being updated keeps its values', ()=>
{
    const e = makeEmitter(vec3(0, 5, 0));
    e.emitParticle();
    e.particleCreateCallback = (p)=> { p.pos.y = 7; };
    let first = true;
    e.particleUpdateCallback = (p)=>
    {
        if (first) { first = false; e.emitParticle(); }
        p.pos.x = 3;
    };
    e.update();
    const updated = particle(e, 0), made = particle(e, 1);
    near(updated.pos.x, 3);
    near(updated.pos.y, 5, 'not the made one\'s 7');
    near(made.pos.y, 7);
    e.destroy(true);
});

test('a destroy callback that emits while the arrays grow leaves every particle whole, trails and all', ()=>
{
    const e = makeEmitter(vec3(0, 5, 0));
    e.particleTime = 1/60 * .5; // gone in the first update
    e.trailTime = 3/60;
    e.update(); // the trail storage is made
    for (let i = 64; i--;) e.emitParticle();
    e.particleTime = 10;
    e.particleDestroyCallback = ()=> { e.emitParticle(); };
    e.update();
    assert.equal(e.particleCount, 64, 'each one that went made one');
    for (let i = 0; i < 64; ++i)
    {
        const p = particle(e, i);
        near(p.life, 10, 'the new ones, moved into the slots of the ones that went');
        near(p.pos.y, 5);
        assert.equal(p.age, 0);
    }
    e.destroy(true);
});

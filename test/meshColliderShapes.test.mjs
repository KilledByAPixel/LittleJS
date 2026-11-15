import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The MeshCollider's V rule against the shapes beside the one it was written for, the kit any change to it runs on
// (review passes 18 to 21 found each fix of it breaking a shape beside it): a corner of walls, a V ending in a wall,
// a steep chute, a V whose floor rises, a riser across a V, a ramp in a V's crease, a V of faces almost upright, a jump
// into an A-frame roof, and standing still in a V.
// Each scene is quads and triangles of one MeshCollider and a 1 x 2 x 1 body, its velocity set every frame.

const { run } = loadEngine();
run(`setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
    var V = (x, y, z)=> vec3(x, y, z);
    // a mesh of polygons, each fanned into triangles; the collider pushes by the side the body is on
    var polys = (list)=>
    {
        const mesh = new Mesh, points = [], indices = [];
        for (const p of list)
        {
            const o = points.length;
            points.push(...p);
            for (let i = 1; i + 1 < p.length; ++i) indices.push(o, o + i, o + i + 1);
        }
        mesh.addTriangles(points, indices);
        return mesh;
    };
    var floorQuad = (x0, z0, x1, z1, y=0)=> [V(x0,y,z0), V(x0,y,z1), V(x1,y,z1), V(x1,y,z0)];
    var wall = (x0, z0, x1, z1, y0=0, y1=4)=> [V(x0,y0,z0), V(x1,y0,z1), V(x1,y1,z1), V(x0,y1,z0)];
    // a V along x, sides rising k a unit across, its crease at base + rise * x, the sides up to top above the crease
    var vTrough = (x0, x1, k, rise=0, top=3, base=0)=>
    {
        const w = top / k, list = [];
        for (let x = x0; x < x1 - 1e-9; ++x)
        {
            const xa = x, xb = min(x1, x + 1), ya = base + rise * xa, yb = base + rise * xb;
            list.push([V(xa, ya, 0), V(xb, yb, 0), V(xb, yb + top, w), V(xa, ya + top, w)]);
            list.push([V(xa, ya, 0), V(xa, ya + top, -w), V(xb, yb + top, -w), V(xb, yb, 0)]);
        }
        return list;
    };
    // a V whose crease follows a profile of [x, height] points, its sides rising k a unit across to top above it
    var vProfile = (points, k=1.8, top=3)=>
    {
        const w = top / k, list = [];
        for (let i = 0; i + 1 < points.length; ++i)
        {
            const [xa, ya] = points[i], [xb, yb] = points[i+1];
            list.push([V(xa, ya, 0), V(xb, yb, 0), V(xb, yb + top, w), V(xa, ya + top, w)]);
            list.push([V(xa, ya, 0), V(xa, ya + top, -w), V(xb, yb + top, -w), V(xb, yb, 0)]);
        }
        return list;
    };
    // a body walked through a collider of polygons: where it ends, its frames on the ground, the most it rose in a
    // frame, and each frame's own check
    var walk = (list, start, velocity, frames, each)=>
    {
        const level = new MeshCollider(polys(list));
        const o = new EngineObject3D(start, buildBox()); o.size3D = vec3(1, 2, 1);
        o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
        const result = {on: 0, rise: 0, airOn: 0, lowFoot: Infinity};
        for (let f = 0; f < frames; ++f)
        {
            if (velocity) o.velocity3D.x = velocity.x, o.velocity3D.z = velocity.z;
            each && each(o, f, result);
            const y = o.pos3D.y;
            engineObjectsUpdate();
            o.groundObject && ++result.on;
            result.rise = max(result.rise, o.pos3D.y - y);
        }
        result.x = o.pos3D.x, result.y = o.pos3D.y, result.z = o.pos3D.z;
        o.destroy(); level.destroy(); engineObjectsUpdate();
        return JSON.stringify(result);
    };`);
const go = (code)=> JSON.parse(run(code));

test('a corner of walls holds a body walked into it, outside both walls and on the floor', ()=>
{
    for (const A of [90, 45, 20])
    for (const speed of [.05, .2])
    {
        const half = A / 2 * Math.PI / 180, c = Math.cos(half).toFixed(6), s = Math.sin(half).toFixed(6);
        const r = go(`walk([floorQuad(-4, -8, 10, 8), wall(0, 0, 8 * ${c}, 8 * ${s}), wall(0, 0, 8 * ${c}, -8 * ${s})],
            V(5, 1.02, 0), V(-${speed}, 0, 0), 120)`);
        // a capsule wedges a little into a sharp corner, as it has since the MeshCollider was made, never through it
        assert.ok(r.x > .5 / Math.sin(half) - .4 && Math.abs(r.y - 1) < .05, A + ' at ' + speed + ': ' + JSON.stringify(r));
    }
});

test('a V ending in a wall stops a body at the wall, its floor flat, rising or falling', ()=>
{
    for (const rise of [0, .1, -.1])
    for (const speed of [.05, .2, .5])
    {
        const r = go(`walk([...vTrough(-6, 3, 1.8, ${rise}), wall(3, -4, 3, 4, -2, 6)], V(-3, ${-3 * rise + 1.6}, 0),
            V(${speed}, 0, 0), 120)`);
        assert.ok(r.x <= 2.51 && r.y > 1 && r.on > 90, 'rise ' + rise + ' at ' + speed + ': ' + JSON.stringify(r));
    }
});

test('a chute whose crease falls more steeply than groundAngle slides a body down it', ()=>
{
    const r = go('walk(vTrough(-10, 10, 1.8, -1.2), V(0, 1.3, 0), undefined, 60)');
    assert.ok(r.x > 5, 'slid to ' + r.x);
});

test('a body stands still in a V whose floor slopes, and walks up a rising one with its foot above the crease', ()=>
{
    const still = go('walk(vTrough(-10, 10, 1.8, .3), V(0, 1.6, 0), V(0, 0, 0), 90)');
    assert.ok(Math.abs(still.x) < 1e-6 && still.on > 80, 'stood ' + JSON.stringify(still));
    const up = go('walk(vTrough(-10, 10, 1.8, .3), V(-2, 1, 0), V(.1, 0, 0), 40)');
    assert.ok(Math.abs(up.x - 2) < .1, 'made its walk, at ' + up.x);
    assert.ok(up.y - 1 - up.x * .3 > .4, 'foot above the crease ' + (up.y - 1 - up.x * .3));
    assert.ok(Math.abs(up.z) < .01 && up.on > 35, 'in the middle, on the ground ' + JSON.stringify(up));
});

test('a riser across a V holds a body walking into it, with no pop up and over', ()=>
{
    for (const riser of [.6, 1])
    for (const speed of [.05, .2])
    {
        // a lower V to x 0, a higher one past it, and the riser's face between them across the V
        const r = go(`(()=>
        {
            const r = ${riser}, T = 3, k = 1.8;
            const lo = vTrough(-6, 0, k, 0, T), hi = vTrough(0, 8, k, 0, T - r, r);
            const face = [[V(0, 0, 0), V(0, T, T / k), V(0, T, (T - r) / k), V(0, r, 0)],
                [V(0, 0, 0), V(0, r, 0), V(0, T, -(T - r) / k), V(0, T, -T / k)]];
            return walk([...lo, ...hi, ...face], V(-3, 1.6, 0), V(${speed}, 0, 0), 90);
        })()`);
        // held before it, at most riding a little up its face, never popped up a frame
        assert.ok(r.x < .3 && r.rise < .25 && r.y < 1.2 + riser, 'riser ' + riser + ' at ' + speed + ': ' +
            JSON.stringify(r));
    }
});

test('a body that jumps into an A-frame roof is not set on the ground in the air', ()=>
{
    for (const [A, w] of [[3.2, 1.2], [2.6, .8]])
    {
        const r = go(`walk([[V(-10, ${A - 1}, ${w}), V(10, ${A - 1}, ${w}), V(10, ${A}, 0), V(-10, ${A}, 0)],
            [V(-10, ${A - 1}, -${w}), V(-10, ${A}, 0), V(10, ${A}, 0), V(10, ${A - 1}, -${w})], floorQuad(-10, -4, 10, 4)],
            V(0, 1.01, 0), undefined, 90, (o, f, result)=>
            {
                f === 2 && (o.velocity3D.y = .35);
                if (o.groundObject && o.pos3D.y > 1.05) { ++result.airOn; o.velocity3D.y = .35; }
            })`);
        assert.equal(r.airOn, 0, 'roof ' + A + ': ' + JSON.stringify(r));
    }
});

test('a body walking slowly up a ramp in a V\'s crease goes over its top onto the level V', ()=>
{
    for (const angle of [30, 44])
    for (const speed of [.03, .05, .2])
    {
        const height = 1.2, run = height / Math.tan(angle * Math.PI / 180);
        const r = go(`walk(vProfile([[-8, 0], [0, 0], [${run}, ${height}], [${run + 40}, ${height}]]), V(-3, 1.6, 0),
            V(${speed}, 0, 0), ${Math.ceil((run + 4) / speed) + 30})`); // frames to walk past its top
        assert.ok(r.x > run + .3 && r.y > 1 + height - .1, angle + ' at ' + speed + ': ' + JSON.stringify(r));
    }
});

test('a body walking along a V of faces almost upright keeps its height, not sunk into them', ()=>
{
    for (const k of [11, 20])
    for (const rise of [0, .1])
    {
        // a 1 wide body rests about where the V is 1 wide, half k above the crease
        const rest = .5 * k, at = (x)=> 1 + rise * x;
        const still = go(`walk(vProfile([[-10, -10 * ${rise}], [10, 10 * ${rise}]], ${k}, 12), V(-3, ${rest - 3 * rise + 1}, 0),
            V(0, 0, 0), 60)`);
        const walked = go(`walk(vProfile([[-10, -10 * ${rise}], [10, 10 * ${rise}]], ${k}, 12), V(-3, ${rest - 3 * rise + 1}, 0),
            V(.1, 0, 0), 90)`);
        const held = still.y - at(still.x), kept = walked.y - at(walked.x);
        assert.ok(Math.abs(kept - held) < .05, 'k ' + k + ' rise ' + rise + ': stood ' + held + ' walked ' + kept);
    }
});

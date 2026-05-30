import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawCrescent, vec2, WHITE, BLACK } from '../dist/littlejs.esm.js';

// Build a mock 2D canvas context that captures the polygon drawPoly traces.
// drawPoly's canvas2D path emits each vertex via context.lineTo(x, y) in local
// space (the transform is applied through translate/rotate/scale, which we
// record but do not apply), so the captured points ARE the generated geometry.
function captureCrescent(...args)
{
    const points = [];
    let rotation = 0;
    const ctx =
    {
        save(){}, restore(){}, translate(){}, scale(){},
        rotate(a){ rotation = a; },
        beginPath(){}, closePath(){}, fill(){}, stroke(){},
        lineTo(x, y){ points.push(vec2(x, y)); },
        set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){},
    };
    // pad leading params through lineColor (index 7) so the trailing render
    // flags + context land in the correct slots regardless of how many args
    // the caller supplied; undefined lets drawCrescent's own defaults apply
    while (args.length < 8)
        args.push(undefined);
    drawCrescent(...args, false, false, ctx);  // useWebGL=false, screenSpace=false, context=ctx
    return { points, rotation };
}

// signed polygon area via the shoelace formula
function polygonArea(points)
{
    let area = 0;
    for (let i = 0; i < points.length; i++)
    {
        const a = points[i], b = points[(i+1) % points.length];
        area += a.x*b.y - b.x*a.y;
    }
    return area/2;
}

test('drawCrescent is exported as a function', () =>
{
    assert.equal(typeof drawCrescent, 'function');
});

test('drawCrescent builds 2*(glCircleSides/2 + 1) points', () =>
{
    // glCircleSides (32) -> segs 16 -> 17 points per arc -> 34
    const { points } = captureCrescent(vec2(0,0), 1, .25, WHITE, 0, false, 0, BLACK);
    assert.equal(points.length, 34);
});

test('crescent horns sit at (+/-radius, 0)', () =>
{
    const size = 4, radius = size/2;
    const { points } = captureCrescent(vec2(0,0), size, .25, WHITE, 0, false, 0, BLACK);
    // segs = glCircleSides/2 = 16; index 0 is the right horn, index 16 the left
    assert.ok(Math.abs(points[0].x - radius) < 1e-9 && Math.abs(points[0].y) < 1e-9);
    assert.ok(Math.abs(points[16].x + radius) < 1e-9 && Math.abs(points[16].y) < 1e-9);
});

test('new moon (percent 0) has ~zero area', () =>
{
    const { points } = captureCrescent(vec2(0,0), 1, 0, WHITE, 0, false, 0, BLACK);
    assert.ok(Math.abs(polygonArea(points)) < 1e-9);
});

test('full moon (percent .5) approximates a full circle and flips orientation', () =>
{
    const size = 2, radius = size/2;
    const { points, rotation } = captureCrescent(vec2(0,0), size, .5, WHITE, 0, false, 0, BLACK);
    const area = Math.abs(polygonArea(points));
    // glCircleSides (32); a 32-gon's area is slightly under PI*radius^2
    assert.ok(Math.abs(area - Math.PI*radius*radius) < 0.05);
    // second half of the cycle flips orientation by PI
    assert.ok(Math.abs(Math.abs(rotation) - Math.PI) < 1e-9);
});

test('first quarter (percent .25) has a flat terminator on the axis', () =>
{
    const { points } = captureCrescent(vec2(0,0), 1, .25, WHITE, 0, false, 0, BLACK);
    // inner arc is the second half of the point list; all its y values are ~0
    const inner = points.slice(points.length/2);
    for (const p of inner)
        assert.ok(Math.abs(p.y) < 1e-9);
});

test('invert negates the terminator curve (flips illuminated side)', () =>
{
    // check both halves of the cycle: .1 (first half) and .6 (second half)
    for (const percent of [.1, .6])
    {
        const a = captureCrescent(vec2(0,0), 1, percent, WHITE, 0, false, 0, BLACK);
        const b = captureCrescent(vec2(0,0), 1, percent, WHITE, 0, true,  0, BLACK);
        const ia = a.points.slice(a.points.length/2);
        const ib = b.points.slice(b.points.length/2);
        for (let i = 0; i < ia.length; i++)
            assert.ok(Math.abs(ia[i].y + ib[i].y) < 1e-9);
    }
});

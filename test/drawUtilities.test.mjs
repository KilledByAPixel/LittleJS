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
    // pad leading params through `sides` (index 8) so the trailing render flags
    // + context land in the correct slots regardless of how many args the
    // caller supplied; undefined lets drawCrescent's own defaults apply
    while (args.length < 9)
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

test('drawCrescent builds 2*(sides/2 + 1) points', () =>
{
    // default sides = glCircleSides (32) -> segs 16 -> 17 points per arc -> 34
    const { points } = captureCrescent(vec2(0,0), 1, .25, WHITE, 0, false, 0, BLACK);
    assert.equal(points.length, 34);

    // explicit sides = 8 -> segs 4 -> 5 points per arc -> 10
    const { points: few } = captureCrescent(vec2(0,0), 1, .25, WHITE, 0, false, 0, BLACK, 8);
    assert.equal(few.length, 10);
});

test('crescent horns sit at (+/-radius, 0)', () =>
{
    const r = 2;
    const { points } = captureCrescent(vec2(0,0), r, .25, WHITE, 0, false, 0, BLACK, 8);
    // index 0 is the right horn, index 4 (end of outer arc) is the left horn
    assert.ok(Math.abs(points[0].x - r) < 1e-9 && Math.abs(points[0].y) < 1e-9);
    assert.ok(Math.abs(points[4].x + r) < 1e-9 && Math.abs(points[4].y) < 1e-9);
});

test('new moon (percent 0) has ~zero area', () =>
{
    const { points } = captureCrescent(vec2(0,0), 1, 0, WHITE, 0, false, 0, BLACK);
    assert.ok(Math.abs(polygonArea(points)) < 1e-9);
});

test('full moon (percent .5) approximates a full circle and flips orientation', () =>
{
    const r = 1;
    const { points, rotation } = captureCrescent(vec2(0,0), r, .5, WHITE, 0, false, 0, BLACK);
    const area = Math.abs(polygonArea(points));
    // default sides = glCircleSides (32); a 32-gon's area is slightly under PI*r^2
    assert.ok(Math.abs(area - Math.PI*r*r) < 0.05);
    // second half of the cycle flips orientation by PI
    assert.ok(Math.abs(Math.abs(rotation) - Math.PI) < 1e-9);
});

test('first quarter (percent .25) has a flat terminator on the axis', () =>
{
    const { points } = captureCrescent(vec2(0,0), 1, .25, WHITE, 0, false, 0, BLACK, 8);
    // inner arc is the second half of the point list; all its y values are ~0
    const inner = points.slice(points.length/2);
    for (const p of inner)
        assert.ok(Math.abs(p.y) < 1e-9);
});

test('invert negates the terminator curve (flips illuminated side)', () =>
{
    const a = captureCrescent(vec2(0,0), 1, .1, WHITE, 0, false, 0, BLACK, 8);
    const b = captureCrescent(vec2(0,0), 1, .1, WHITE, 0, true,  0, BLACK, 8);
    const ia = a.points.slice(a.points.length/2);
    const ib = b.points.slice(b.points.length/2);
    for (let i = 0; i < ia.length; i++)
        assert.ok(Math.abs(ia[i].y + ib[i].y) < 1e-9);
});

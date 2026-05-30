import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCrescentPoints, drawCrescent, vec2, WHITE, BLACK } from '../dist/littlejs.esm.js';

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

test('getCrescentPoints and drawCrescent are exported as functions', () =>
{
    assert.equal(typeof getCrescentPoints, 'function');
    assert.equal(typeof drawCrescent, 'function');
});

test('getCrescentPoints builds 2*(sides/2 + 1) points', () =>
{
    // default sides = glCircleSides (32) -> segs 16 -> 17 points per arc -> 34
    assert.equal(getCrescentPoints(vec2(0,0), 1, .25).length, 34);
    // explicit sides = 8 -> segs 4 -> 5 points per arc -> 10
    assert.equal(getCrescentPoints(vec2(0,0), 1, .25, 0, false, 8).length, 10);
});

test('size is the diameter (outer arc reaches +/- size/2)', () =>
{
    const size = 4, radius = size/2;
    // first quarter has no phase rotation, so the horns sit on the x axis
    const points = getCrescentPoints(vec2(0,0), size, .25);
    // segs = glCircleSides/2 = 16; index 0 is the right horn, index 16 the left
    assert.ok(Math.abs(points[0].x - radius) < 1e-9 && Math.abs(points[0].y) < 1e-9);
    assert.ok(Math.abs(points[16].x + radius) < 1e-9 && Math.abs(points[16].y) < 1e-9);
});

test('new moon (percent 0) has ~zero area', () =>
{
    assert.ok(Math.abs(polygonArea(getCrescentPoints(vec2(0,0), 2, 0))) < 1e-9);
});

test('full moon (percent .5) approximates a full circle', () =>
{
    const size = 2, radius = size/2;
    const area = Math.abs(polygonArea(getCrescentPoints(vec2(0,0), size, .5)));
    // a 32-gon's area is slightly under PI*radius^2
    assert.ok(Math.abs(area - Math.PI*radius*radius) < 0.05);
});

test('first quarter (percent .25) has a flat terminator on the axis', () =>
{
    const points = getCrescentPoints(vec2(0,0), 1, .25);
    // inner arc is the second half of the point list; all its y values are ~0
    const inner = points.slice(points.length/2);
    for (const p of inner)
        assert.ok(Math.abs(p.y) < 1e-9);
});

test('pos offsets every point', () =>
{
    const at0 = getCrescentPoints(vec2(0,0), 2, .3);
    const at = getCrescentPoints(vec2(5,-4), 2, .3);
    for (let i = 0; i < at0.length; i++)
    {
        assert.ok(Math.abs(at[i].x - (at0[i].x + 5)) < 1e-9);
        assert.ok(Math.abs(at[i].y - (at0[i].y - 4)) < 1e-9);
    }
});

test('angle rotates the points clockwise', () =>
{
    const radius = 1;
    // the right horn at (radius,0) rotates clockwise by PI/2 to (0,-radius)
    const points = getCrescentPoints(vec2(0,0), 2*radius, .25, Math.PI/2);
    assert.ok(Math.abs(points[0].x) < 1e-9 && Math.abs(points[0].y + radius) < 1e-9);
});

test('invert flips the illuminated side', () =>
{
    // first quarter is the upper half disc; inverting flips it to the lower half
    const up = getCrescentPoints(vec2(0,0), 2, .25, 0, false);
    const down = getCrescentPoints(vec2(0,0), 2, .25, 0, true);
    for (const p of up)
        assert.ok(p.y >= -1e-9);
    for (const p of down)
        assert.ok(p.y <= 1e-9);
});

test('drawCrescent passes the crescent polygon to the canvas', () =>
{
    // drive the canvas2D path with a mock context and confirm it traces the polygon
    const points = [];
    const ctx =
    {
        save(){}, restore(){}, translate(){}, rotate(){}, scale(){},
        beginPath(){}, closePath(){}, fill(){}, stroke(){},
        lineTo(x, y){ points.push(vec2(x, y)); },
        set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){},
    };
    // useWebGL=false, screenSpace=false, context=ctx
    drawCrescent(vec2(0,0), 2, .25, WHITE, 0, false, 0, BLACK, false, false, ctx);
    assert.equal(points.length, 34);
});

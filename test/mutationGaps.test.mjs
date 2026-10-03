import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';
import { vec2, rgb, hsl, isPowerOfTwo, isIntersecting, collideBoxBox, lineTest, formatTime, RandomGenerator,
    PathFinder, Tween, tweenUpdate, Ease } from '../dist/littlejs.esm.js';

// Assertions a mutation run of 2026-10-03 found missing: each test fails on a small change to the code it names, a
// flipped sign or comparison, a swapped term or a changed constant, that every other test let through.

const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-9, message ?? `${a} is not ${b}`);
const xy = (v)=> [v.x, v.y];

test('math helpers: a fraction is no power of two, a diagonal misses a box corner, a tie pushes along x', () =>
{
    assert.equal(isPowerOfTwo(.5), false);
    assert.equal(isPowerOfTwo(4), true);
    assert.equal(isIntersecting(vec2(0, 9), vec2(9, 0), vec2(3, 3), vec2(2, 2)), false, 'passes the corner');
    assert.equal(isIntersecting(vec2(0, 7), vec2(7, 0), vec2(3, 3), vec2(2, 2)), true, 'cuts the corner');
    assert.deepEqual(xy(collideBoxBox(vec2(0, 0), vec2(2), vec2(1, 1), vec2(2))), [-1, 0]);
});

test('Vector2: distance between two points, cross sign, direction of a diagonal, lerp clamped, clampLength copies', () =>
{
    assert.equal(vec2(1, 2).distanceSquared(vec2(4, 6)), 25);
    assert.equal(vec2(1, 2).cross(vec2(3, 4)), -2);
    assert.equal(vec2(1, 1).direction(), 0, 'a tie is up');
    assert.deepEqual(xy(vec2(0).lerp(vec2(10), 2)), [10, 10]);
    assert.deepEqual(xy(vec2(0).lerp(vec2(10), -1)), [0, 0]);
    const v = vec2(1, 0), clamped = v.clampLength(5);
    assert.ok(clamped !== v && clamped.x === 1);
    assert.deepEqual(xy(vec2(1, 0).rotate(Math.PI / 2)).map((n)=> Math.round(n * 1e9) / 1e9), [0, -1], 'clockwise');
});

test('lineTest: a ray moving left hits inside the cell it hits, and one ending on a cell\'s edge does not hit it', () =>
{
    const wall = (pos)=> pos.x === 2;
    const hit = lineTest(vec2(5.5, .5), vec2(.5, .5), wall);
    assert.equal(Math.floor(hit.x), 2);
    near(hit.x, 3 - 1e-9);
    assert.equal(lineTest(vec2(.5, .5), vec2(2, .5), wall), undefined);
    assert.equal(Math.floor(lineTest(vec2(.5, .5), vec2(2.01, .5), wall).x), 2);
});

test('formatTime: a second below zero and ten above', () =>
{
    assert.equal(formatTime(-1), '-0:01');
    assert.equal(formatTime(10), '0:10');
    assert.equal(formatTime(69), '1:09');
});

test('Color: hsl of blue, the hue of a pink, a lerp a quarter of the way with alpha, a hex of one digit', () =>
{
    const blue = hsl(.6, 1, .5);
    [blue.r, blue.g, blue.b].forEach((value, i)=> near(value, [0, .4, 1][i]));
    assert.equal(Math.round(rgb(1, 0, .5).HSLA()[0] * 1e4) / 1e4, .9167);
    const c = rgb(0, 0, 0, 0).lerp(rgb(1, 1, 1, 1), .25);
    [c.r, c.a].forEach((value)=> near(value, .25));
    assert.equal(rgb(16/255, 0, 0, 1).toString(), '#100000ff');
});

test('RandomGenerator: a seeded sequence of each kind comes out the same', () =>
{
    const r = new RandomGenerator(12345), round = (n)=> Math.round(n * 1e6) / 1e6;
    const out = [];
    for (let i = 4; i--;)
        out.push(r.sign(), r.bool(), round(r.float()), round(r.angle()), ...xy(r.direction()).map(round));
    assert.deepEqual(out, GOLDEN_RANDOM);
});

// what RandomGenerator(12345) gave when this test was written, sign, bool, float, angle, direction four times
const GOLDEN_RANDOM = [
    1, true, .121696, .115551, -.946729, .322031,
    1, true, .325333, -2.32522, .835175, .549985,
    -1, true, .625259, 1.590559, .517189, .855871,
    -1, false, .144599, -2.755545, -.991787, .127903];

test('Timer: paused, a real time timer runs and a game timer does not', async () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run('var real = new Timer(10, true), game = new Timer(10); setPaused(true); engineStep(60);');
    assert.ok(run('real.get()') > -9.1, 'about a second of real time went by');
    assert.equal(run('game.get()'), -10);
});

test('Tween: a bounce part way, and a tween with a hair left is not done', () =>
{
    near(Ease.BOUNCE(.3), 1 - 7.5625 * (.7 - 6 / 11) ** 2 - .75);
    let done = 0;
    new Tween(()=> {}, 0, 1, 1).then(()=> ++done);
    tweenUpdate(.9995);
    assert.equal(done, 0);
    tweenUpdate(.001);
    assert.equal(done, 1);
});

// a headless engine and two objects, with no gravity unless asked
function physics(code)
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); objectDefaultRestitution = 0; objectDefaultFriction = 1;' + code);
    return run;
}

test('physics: friction on the ground is the slipperier of the two, against the ground\'s speed', () =>
{
    const run = physics(`var ground = new EngineObject(vec2(0, -10), vec2(1)); ground.mass = 0; ground.friction = .1;
        ground.velocity = vec2(.2, 0); var rider = new EngineObject(vec2(10, 10), vec2(1)); rider.friction = .9;
        rider.groundObject = ground; rider.updatePhysics();`);
    near(run('rider.velocity.x'), .2 - .2 * .9);
});

test('physics: a mover that is not solid still hears of the solid it overlaps', () =>
{
    const run = physics(`var heard = 0; var wall = new EngineObject(vec2(0), vec2(2)); wall.mass = 0;
        wall.setCollision(); var mover = new EngineObject(vec2(.5, 0), vec2(1)); mover.setCollision(true, false);
        mover.collideWithObject = ()=> !!++heard; engineObjectsUpdate();`);
    assert.equal(run('heard'), 1);
});

test('physics: a box landing on a floor stands just above it, not in it', () =>
{
    const run = physics(`var ground = new EngineObject(vec2(0), vec2(4, 1)); ground.mass = 0; ground.setCollision();
        var box = new EngineObject(vec2(0, 1.05), vec2(1)); box.setCollision(); box.velocity = vec2(0, -.1);
        setGravity(vec2(0, -.01)); engineObjectsUpdate();`);
    assert.equal(run('box.pos.y'), 1 + .001);
    assert.deepEqual([run('isOverlapping(box.pos, box.size, ground.pos, ground.size)'), run('box.groundObject === ground'),
        run('box.velocity.y')], [false, true, 0]);
});

// a box of mass 1 moving right at .1 into one of mass 3 at rest, side by side
const hitCode = (restitution)=> `var a = new EngineObject(vec2(0), vec2(1)); a.setCollision(); a.velocity = vec2(.1, 0);
    a.restitution = ${restitution}; var b = new EngineObject(vec2(1.05, 0), vec2(1)); b.setCollision(); b.mass = 3;
    engineObjectsUpdate();`;

test('physics: an elastic hit keeps momentum and energy, an inelastic one leaves both moving together', () =>
{
    let run = physics(hitCode(1));
    const [va, vb] = [run('a.velocity.x'), run('b.velocity.x')];
    near(va + 3 * vb, .1, 'momentum');
    near(va * va + 3 * vb * vb, .01, 'energy');
    near(va, -.05);
    run = physics(hitCode(0));
    near(run('a.velocity.x'), .025);
    near(run('b.velocity.x'), .025);
});

// an open grid, or one with walls, searched from one cell to another with no smoothing
function search(size, from, to, isWalkable)
{
    const pf = new PathFinder(vec2(...size));
    isWalkable && (pf.isWalkable = isWalkable);
    pf.buildNodeData();
    pf.smoothPath = false;
    const ok = pf.aStarSearch(pf.getNode(...from), pf.getNode(...to));
    return {pf, ok, end: pf.getNode(...to)};
}

// the cost of the cheapest way between two cells by Dijkstra, eight ways, no corner cut past a wall
function cheapest(width, height, from, to, isWalkable)
{
    const key = (x, y)=> x + y * width, cost = new Map([[key(...from), 0]]), open = [[...from, 0]];
    while (open.length)
    {
        open.sort((a, b)=> b[2] - a[2]);
        const [x, y, c] = open.pop();
        if (c > cost.get(key(x, y))) continue;
        for (let dy = -1; dy <= 1; ++dy)
        for (let dx = -1; dx <= 1; ++dx)
        {
            const nx = x + dx, ny = y + dy, ok = (x, y)=> x >= 0 && y >= 0 && x < width && y < height && isWalkable(x, y);
            if (!(dx || dy) || !ok(nx, ny) || dx && dy && (!ok(nx, y) || !ok(x, ny))) continue;
            const next = c + (dx && dy ? Math.SQRT2 : 1);
            if (next < (cost.get(key(nx, ny)) ?? Infinity))
                cost.set(key(nx, ny), next), open.push([nx, ny, next]);
        }
    }
    return cost.get(key(...to));
}

test('PathFinder: a diagonal step costs the square root of two, and the path found is the cheapest', () =>
{
    near(search([3, 3], [0, 0], [2, 2]).end.g, 2 * Math.SQRT2);
    const wall = (x, y)=> x !== 4 || y === 5; // a wall down column 4 with a gap at the top
    const {ok, end} = search([8, 6], [0, 0], [7, 0], wall);
    assert.equal(ok, true);
    near(end.g, cheapest(8, 6, [0, 0], [7, 0], wall));
});

test('PathFinder: a diagonal is refused when only its up or down neighbor is a wall', () =>
{
    near(search([2, 2], [0, 0], [1, 1], (x, y)=> !(x === 0 && y === 1)).end.g, 2, 'around by the side');
    near(search([2, 2], [0, 0], [1, 1], (x, y)=> !(x === 1 && y === 0)).end.g, 2);
});

test('PathFinder: open ground is crossed straight, and two equal routes always give the same path', () =>
{
    const path = (pf)=> pf.findPath(vec2(.5, 2.5), vec2(6.5, 2.5)).map((p)=> p.y);
    const {pf} = search([7, 5], [0, 2], [6, 2]);
    assert.deepEqual(path(pf), Array(7).fill(2.5));
    // equal scores go to the cell nearer the goal, so a crossing with many equal ways opens one cell a step
    assert.equal(search([12, 12], [0, 0], [11, 6]).pf.nodes.filter((node)=> node.isClosed).length, 11);
    const around = search([5, 3], [0, 1], [4, 1], (x, y)=> !(x === 2 && y === 1)).pf;
    const route = ()=> JSON.stringify(around.findPath(vec2(.5, 1.5), vec2(4.5, 1.5)));
    assert.equal(route(), route());
});

test('PathFinder: a maxLoop of just the expansions needed still finds the goal', () =>
{
    const first = search([6, 6], [0, 0], [5, 3]);
    const expanded = first.pf.nodes.filter((node)=> node.isClosed).length;
    const pf = first.pf;
    pf.maxLoop = expanded;
    assert.equal(pf.aStarSearch(pf.getNode(0, 0), pf.getNode(5, 3)), true);
    assert.equal(pf.searchGaveUp, false);
});

test('nearestPowerOfTwo is a whole power of two not less than the value, 1 for a value of 1 or less', async () =>
{
    const { nearestPowerOfTwo } = await import('../dist/littlejs.esm.js');
    assert.equal(nearestPowerOfTwo(67108864.00000006), 134217728, 'just above a power, where log2 rounds to it');
    assert.deepEqual([nearestPowerOfTwo(5), nearestPowerOfTwo(64), nearestPowerOfTwo(.3), nearestPowerOfTwo(0)],
        [8, 64, 1, 1]);
    assert.equal(isPowerOfTwo(nearestPowerOfTwo(.3)), true);
});

test('noise2D gives what it gave wherever it worked, and stays noise far out in y', async () =>
{
    const { noise2D, smoothStep, lerp } = await import('../dist/littlejs.esm.js');
    // the noise as it was, its rows apart by a large prime times y
    const hash = (i)=>
    {
        let h = (i | 0) ^ 0x9e3779b9;
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        h ^= h >>> 16;
        return (h >>> 0) / 2**32;
    };
    const old = (x, y)=>
    {
        const ix = Math.floor(x), iy = Math.floor(y), fx = smoothStep(x - ix), fy = smoothStep(y - iy);
        const h = (a, b)=> hash(a + b * 374761393);
        return lerp(lerp(h(ix, iy), h(ix + 1, iy), fx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), fx), fy);
    };
    for (const [x, y] of [[0, 0], [1.5, 2.25], [-37.2, 1e4 + .3], [123.4, -2e7], [5e6, 7e6]])
        assert.equal(noise2D(x, y), old(x, y), `${x}, ${y}`);
    const far = new Set(Array.from({length: 20}, (_, x)=> noise2D(x + .5, 3e8)));
    assert.ok(far.size > 15, 'a row far out is not one value');
});

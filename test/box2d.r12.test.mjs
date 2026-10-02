import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { box2dInit, box2d, Box2dObject, Box2dStaticObject, PathFinder, RandomGenerator, vec2, setEngineManualStep,
    engineInit, engineStep } from '../dist/littlejs.esm.js';

// review round 12: the Box2D queries pass through sensors like raycast, joint setters are typed void, and a path
// finder that returns a path did not give up

const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await box2dInit();
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{});

test('boxCast, boxCastAll and pointCast pass through sensors unless includeSensors is set', () =>
{
    // a static trigger zone, and a dynamic coin whose pickup sensor reaches past its body
    const zone = new Box2dStaticObject(vec2(5, 0));
    zone.addBox(vec2(4), vec2(), 0, 0, 0, 0, true);
    const coin = new Box2dObject(vec2(20, 0));
    coin.addCircle(.5);
    coin.addCircle(3, vec2(), 0, 0, 0, true);
    engineStep();

    assert.equal(box2d.boxCast(vec2(5, 0), vec2(1)), undefined);
    assert.equal(box2d.boxCast(vec2(5, 0), vec2(1), true), zone);
    assert.deepEqual(box2d.boxCastAll(vec2(5, 0), vec2(1)), []);
    assert.deepEqual(box2d.boxCastAll(vec2(5, 0), vec2(1), true), [zone]);
    assert.equal(box2d.pointCast(vec2(5, 0), false), undefined);
    assert.equal(box2d.pointCast(vec2(5, 0), false, true), zone);
    assert.equal(box2d.pointCast(vec2(21, 0)), undefined, 'only the coin\'s sensor is under the point');
    assert.equal(box2d.pointCast(vec2(20.2, 0)), coin, 'its body still is');
    zone.destroy(); coin.destroy();
    engineStep();
});

test('the joint setters are typed as returning nothing', () =>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    for (const name of ['enableLimit(enable?: boolean)', 'setLimits(min: number, max: number)',
        'enableMotor(enable?: boolean)', 'setMotorSpeed(speed: number)', 'setMaxMotorTorque(torque: number)',
        'setMaxMotorForce(force: number)'])
    {
        const lines = dts.split('\n').filter(line=> line.includes(name + ':'));
        assert.ok(lines.length, name + ' is in the d.ts');
        for (const line of lines)
            assert.match(line, /: void;/, line.trim());
    }
});

test('a path finder that returns a path did not give up', () =>
{
    const random = new RandomGenerator(77);
    let searches = 0;
    for (let trial = 0; trial < 40; ++trial)
    {
        const W = random.int(6, 20), H = random.int(6, 20);
        const walls = new Set, costs = new Map;
        for (let i = W*H*random.float(0, .3); i-- > 0;) walls.add(random.int(W) + random.int(H)*W);
        for (let i = W*H*random.float(0, .4); i-- > 0;) costs.set(random.int(W) + random.int(H)*W, random.float(.5, 6));
        const finder = new PathFinder(vec2(W, H));
        finder.isWalkable = (x, y)=> !walls.has(x + y*W);
        finder.getCost = (x, y)=> costs.get(x + y*W) || 0;
        const start = vec2(random.int(W)+.5, random.int(H)+.5), end = vec2(random.int(W)+.5, random.int(H)+.5);
        for (let maxLoop = 1; maxLoop < W*H; ++maxLoop)
        {
            finder.maxLoop = maxLoop;
            const path = finder.findPath(start, end);
            ++searches;
            assert.ok(!(finder.searchGaveUp && path.length), 'grid ' + trial + ' maxLoop ' + maxLoop);
        }
    }
    assert.ok(searches > 1000);
});

test('a joint whose object is destroyed says so, and isActive is false instead of throwing', async () =>
{
    const { Box2dRopeJoint } = await import('../dist/littlejs.esm.js');
    const anchor = new Box2dStaticObject(vec2(40, 10)), enemy = new Box2dObject(vec2(40, 5));
    enemy.addBox(vec2(1));
    const rope = new Box2dRopeJoint(anchor, enemy);
    engineStep();
    assert.equal(rope.isDestroyed(), false);
    enemy.destroy();
    engineStep();
    assert.equal(rope.isDestroyed(), true);
    assert.equal(rope.isActive(), false);
    anchor.destroy();
    engineStep();
});

test('circleCast passes over objects made only of sensors unless includeSensors is set', () =>
{
    const pickup = new Box2dObject(vec2(60, 0));
    pickup.addCircle(1, vec2(), 0, 0, 0, true);
    const crate = new Box2dObject(vec2(61, 0));
    crate.addBox(vec2(1));
    engineStep();
    assert.deepEqual(box2d.circleCastAll(vec2(60.5, 0), 4), [crate]);
    assert.equal(box2d.circleCastAll(vec2(60.5, 0), 4, true).length, 2);
    pickup.destroy(); crate.destroy();
    engineStep();
});

test('a path finder searched with rebuild false before it was ever built builds its grid first', () =>
{
    const finder = new PathFinder(vec2(8));
    const path = finder.findPath(vec2(.5), vec2(6.5), false);
    assert.ok(path.length >= 2);
});

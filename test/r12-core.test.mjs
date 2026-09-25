import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setEngineManualStep, setHeadlessMode, engineInit, engineStep, EngineObject, ParticleEmitter,
    engineObjects, setGravity, vec2, PI } from '../dist/littlejs.esm.js';

// review round 12: local space particle gravity, and the update order in headless mode

setHeadlessMode(true);
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});

test('local space particles fall down in the world whichever way their emitter is turned', () =>
{
    setGravity(vec2(0, -.01));
    for (const angle of [0, PI/2, PI])
    {
        // a local space emitter with gravityScale 1, one particle made at rest
        const e = new ParticleEmitter(vec2(), angle, 0, 0, 0, 0, undefined, undefined, undefined, undefined,
            undefined, 1, .1, .1, 0, 0, 1, 1, 1, 0, 0, 0, false, false, true, 0, true);
        const p = e.emitParticle();
        engineStep(30);
        // where the render draws it, the local pos turned by the emitter's angle
        const world = p.pos.rotate(e.angle);
        assert.ok(Math.abs(world.x) < 1e-9, 'no sideways drift at angle ' + angle + ': ' + world);
        assert.ok(world.y < -4, 'it fell down at angle ' + angle + ': ' + world);
        e.destroy(true);
        engineStep();
    }
    setGravity(vec2());
});

test('objects update in render order in headless mode too, as they do in the browser', () =>
{
    const order = [];
    const back = new EngineObject(vec2()), front = new EngineObject(vec2());
    back.renderOrder = 10; front.renderOrder = 0;
    back.update = ()=> order.push('back');
    front.update = ()=> order.push('front');
    engineStep();
    assert.deepEqual(order, ['front', 'back']);
    back.destroy(); front.destroy();
    engineStep();
});

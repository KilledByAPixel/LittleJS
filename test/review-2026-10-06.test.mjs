import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The review of 2026-10-06 (.claude/review-2026-10-06): a 3D emitter that outlives its scaled parent keeps the
// parent's scale, a UI object updates once a pass however it moves between parents during it, and a particle's
// create callback reads the emitter's scale however it was emitted. Each in the debug and the release build.

const builds = ['littlejs.js', 'littlejs.release.js'];

for (const file of builds)
test(`a 3D emitter whose scaled parent is destroyed goes on falling as it did, ${file}`, () =>
{
    const { run } = loadEngine({}, 'setHeadlessMode(true)', file);
    const seen = JSON.parse(run(`
        new Render3DPlugin;
        const parent = new EngineObject3D(vec3(10, 0, 0));
        parent.scale3D = vec3(4);
        parent.rotation3D = vec3(0, .5, 0);
        const emitter = new ParticleEmitter3D(vec3(1, 2, 3));
        emitter.emitRate = 0; emitter.speed = 0; emitter.randomness = 0;
        emitter.gravity = -.01; emitter.particleTime = 10;
        parent.addChild(emitter);
        emitter.emitParticle(); emitter.update();
        const world = emitter.getWorldPos3D(), first = emitter.particleData[4];
        parent.destroy(); emitter.update();
        const after = emitter.getWorldPos3D();
        JSON.stringify({first, next: emitter.particleData[4] - first, alive: !emitter.destroyed,
            moved: world.distance(after), scale: emitter.scale3D.x})`));
    assert.ok(Math.abs(seen.first + .04) < 1e-6, 'four times the fall with its parent: ' + seen.first);
    assert.ok(Math.abs(seen.next + .04) < 1e-6, 'and after it is gone: ' + seen.next);
    assert.equal(seen.alive, true, 'it lives on to finish its particles');
    assert.ok(seen.moved < 1e-6, 'it stays where it was in the world');
    assert.ok(Math.abs(seen.scale - 4) < 1e-6, 'its world scale is its own now: ' + seen.scale);
});

for (const file of builds)
test(`a UI object detached or moved in its own update updates once that pass, either order made, ${file}`, () =>
{
    for (const childFirst of [true, false])
    for (const move of [false, true])
    {
        const { run } = loadEngine({}, 'setHeadlessMode(true)', file);
        const calls = run(`
            new UISystemPlugin;
            const make = ()=> new UIObject(vec2(), vec2(10));
            let child, parent, other;
            if (${childFirst}) child = make(), parent = make(), other = make();
            else parent = make(), other = make(), child = make();
            parent.addChild(child);
            let calls = 0;
            child.onUpdate = ()=>
            {
                ++calls;
                child.parent?.removeChild(child);
                ${move} && other.addChild(child);
            };
            pluginList.at(-1).update();
            calls`);
        assert.equal(calls, 1, `child made ${childFirst ? 'first' : 'last'}, ${move ? 'moved' : 'detached'}`);
    }
});

for (const file of builds)
test(`a particle's create callback reads the emitter's scale, emitted by hand, by update or from a callback, ${file}`, () =>
{
    const { run } = loadEngine({}, 'setHeadlessMode(true)', file);
    const seen = JSON.parse(run(`
        new Render3DPlugin;
        const emitter = new ParticleEmitter3D;
        emitter.emitRate = 0; emitter.scale3D = vec3(4);
        const seen = [];
        emitter.particleCreateCallback = (p)=> seen.push(p.scale);
        emitter.emitParticle(); // before its first update
        emitter.update();
        let nested = false;
        emitter.particleCreateCallback = (p)=>
        {
            seen.push(p.scale);
            if (!nested) { nested = true; emitter.emitParticle(); }
        };
        emitter.emitParticle();
        JSON.stringify(seen)`));
    assert.deepEqual(seen, [4, 4, 4]);
});

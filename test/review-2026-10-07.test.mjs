import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The engine review of 2026-10-07: 3D physics honors setEnablePhysicsSolver as 2D does, and a Shader can be let go of

test('with the physics solver off, 3D resolves no solids, caps no speed and keeps out of no level, as 2D', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin; setGravity(vec2());
        setEnablePhysicsSolver(false);
        let touches = 0;
        const wall = new EngineObject3D(vec3()); wall.size3D = vec3(1); wall.setCollision(); wall.mass = 0;
        wall.collideWithObject = ()=> (++touches, true);
        const box = new EngineObject3D(vec3(.75, 0, 0)); box.size3D = vec3(1); box.setCollision(); box.mass = 1;
        const fast = new EngineObject3D(vec3(50, 0, 0)); fast.setCollision(); fast.mass = 1; fast.damping = 1;
        fast.velocity3D = vec3(5, 0, 0);
        const ground = new HeightMap([[0, 0], [0, 0]], vec2(20), 1, undefined, vec3(0, 0, 40));
        const under = new EngineObject3D(vec3(0, -3, 40)); under.setCollision(); under.mass = 1;
        engineObjectsUpdate();
        const off = {box: box.pos3D.x, touches, fast: fast.pos3D.x - 50, under: under.pos3D.y};
        setEnablePhysicsSolver(true);
        engineObjectsUpdate();
        const on = {box: box.pos3D.x, touches, under: under.pos3D.y};
        ground.destroy();
        JSON.stringify({off, on})`));
    assert.deepEqual(result.off, {box: .75, touches: 0, fast: 5, under: -3}, 'left as the game moves them');
    assert.ok(result.on.box >= 1 - 1e-6 && result.on.touches === 1, 'back on, the solids resolve: ' + JSON.stringify(result.on));
    assert.ok(result.on.under > -1, 'and the level keeps it out: ' + result.on.under);
});

test('a Shader can be let go of: dispose takes it off the engine\'s list, more than once is fine', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    const before = run('glShaderObjects.length');
    run(`var shaders = [];
        for (let i = 100; i--;)
        {
            const o = new EngineObject(vec2(), vec2(1));
            o.shader = new Shader('void mainImage(out vec4 c, vec2 uv) { c = vec4(1); }');
            shaders.push(o.shader);
        }
        engineObjectsDestroy();`);
    assert.equal(run('glShaderObjects.length'), before + 100, 'kept while not let go of');
    run('for (const shader of shaders) shader.dispose(); shaders[0].dispose();');
    assert.equal(run('glShaderObjects.length'), before, 'let go of, twice for one');
    assert.equal(run('shaders[0].program'), undefined);
});

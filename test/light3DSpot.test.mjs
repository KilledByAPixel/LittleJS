import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A Light3D with a cone is a spotlight: it shines along its own forward, inside coneAngle, fading over the part of
// the cone coneSoftness says. render3D.shadowLight makes one spotlight cast the shadows in place of the sun.

function load()
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin;');
    return run;
}
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-3, message ?? `${a} is not ${b}`);
const list = (run, code)=> [...run(`[...${code}]`)];

// how much of a light reaches a point, by the four numbers the shader gets for its cone
const coneCode = `var reach = (light, x, y, z)=>
{
    const c = render3DLightCone(light), p = light.getWorldPos3D(), u = vec3(x, y, z).subtract(p).normalize();
    return clamp(c[0] * u.x + c[1] * u.y + c[2] * u.z - c[3]);
};`;

test('a light with no cone shines every way', ()=>
{
    const run = load();
    run(coneCode + 'var lamp = new Light3D(vec3(0, 5, 0), 10);');
    assert.deepEqual([run('lamp.coneAngle'), run('lamp.coneSoftness')], [0, .2]);
    assert.deepEqual(list(run, 'render3DLightCone(lamp)'), [0, 0, 0, -1]);
    assert.deepEqual([run('reach(lamp, 0, 0, 0)'), run('reach(lamp, 9, 9, 9)')], [1, 1]);
});

test('a cone shines along the light\'s forward, full inside its soft edge and nothing outside the cone', ()=>
{
    const run = load();
    // forward is -z, a cone 30 degrees to each side with the outer fifth of it fading
    run(coneCode + `var lamp = new Light3D(vec3(), 10); lamp.coneAngle = PI / 6;
        var along = (degrees)=> reach(lamp, sin(degrees * PI / 180), 0, -cos(degrees * PI / 180));`);
    near(run('along(0)'), 1);
    near(run('along(23.9)'), 1, 'inside where the fade starts, 24 degrees');
    assert.ok(run('along(27)') > .2 && run('along(27)') < .8, 'in the fade');
    near(run('along(30)'), 0);
    near(run('along(90)'), 0);
    near(run('reach(lamp, 0, 0, 5)'), 0, 'behind it');
    run('lamp.coneSoftness = 1');
    assert.ok(run('along(15)') > .1 && run('along(15)') < .9, 'a soft cone fades from its middle');
    run('lamp.coneSoftness = 0');
    near(run('along(29)'), 1, 'a hard one is full to its edge');
});

test('the cone turns with the light and with what the light is attached to', ()=>
{
    const run = load();
    run(coneCode + `var lamp = new Light3D(vec3(0, 5, 0), 10); lamp.coneAngle = .3;
        lamp.rotation3D = vec3(-PI / 2, 0, 0); // pitched to look straight down`);
    near(run('reach(lamp, 0, 0, 0)'), 1);
    near(run('reach(lamp, 5, 5, 0)'), 0);
    run(`var holder = new EngineObject3D(vec3(3, 0, 0)); holder.rotation3D = vec3(0, PI / 2, 0);
        var torch = new Light3D(vec3(), 10); torch.coneAngle = .3; holder.addChild(torch);`);
    near(run('reach(torch, -2, 0, 0)'), 1, 'the holder is turned to face -x');
    near(run('reach(torch, 3, 0, -5)'), 0);
});

test('render3D.shadowLight makes a spotlight the shadow caster: the map looks down its cone', ()=>
{
    const run = load();
    run(`var lamp = new Light3D(vec3(0, 10, 0), 20); lamp.coneAngle = .5; lamp.rotation3D = vec3(-PI / 2, 0, 0);
        var clip = (x, y, z)=> { const m = render3D.shadowMatrix.m;
            const w = m[3] * x + m[7] * y + m[11] * z + m[15];
            return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, w]; };
        render3D.updateShadowMatrix();`);
    near(list(run, 'clip(0, 0, 0)')[2], 1, 'the sun\'s map is flat, no perspective');
    assert.equal(run('render3DShadowCaster()'), undefined);
    run('render3D.shadowLight = lamp; render3D.updateShadowMatrix();');
    assert.equal(run('render3DShadowCaster() === lamp'), true);
    const center = list(run, 'clip(0, 0, 0)');
    near(center[0], 0), near(center[1], 0), near(center[2], 10, 'as far from the light as the point is');
    assert.ok(Math.abs(list(run, 'clip(4, 0, 0)')[0]) < 1, 'inside the cone, 4 across at 10 down');
    assert.ok(Math.abs(list(run, 'clip(9, 0, 0)')[0]) > 1, 'outside it');
});

test('a light that can not cast, off, gone or with no cone, leaves the shadows to the sun', ()=>
{
    const run = load();
    run('var lamp = new Light3D(vec3(0, 10, 0), 20); render3D.shadowLight = lamp;');
    assert.equal(run('render3DShadowCaster()'), undefined, 'no cone');
    run('lamp.coneAngle = .5');
    assert.equal(run('render3DShadowCaster() === lamp'), true);
    run('lamp.intensity = 0');
    assert.equal(run('render3DShadowCaster()'), undefined, 'off');
    run('lamp.intensity = 1; lamp.destroy()');
    assert.equal(run('render3DShadowCaster()'), undefined, 'destroyed');
});

test('the shadow light keeps its place among the lights sent when there are more than fit', ()=>
{
    const run = load();
    run(`for (let i = 0; i < 12; ++i) new Light3D(vec3(i, 0, 0), 5);
        var lamp = new Light3D(vec3(500, 0, 0), 20); lamp.coneAngle = .5; render3D.shadowLight = lamp;
        var lights = render3DCollectLights();`);
    assert.equal(run('lights.length'), 8);
    assert.equal(run('lights.includes(lamp)'), true, 'far from the camera, but it casts the shadows');
});

test('a level\'s Light is a spotlight with a cone, in degrees, aimed by its rotation, and can cast the shadows', ()=>
{
    const run = load();
    run(coneCode + `var made = level3DLoad({objects: [
        {id: 1, type: 'Light', pos: [0, 5, 0], rotation: [-90, 0, 0], properties: {cone: 30, softness: .5, shadows: true}},
        {id: 2, type: 'Light', pos: [4, 5, 0]}]});`);
    near(run('made[0].coneAngle'), Math.PI / 6);
    assert.equal(run('made[0].coneSoftness'), .5);
    near(run('reach(made[0], 0, 0, 0)'), 1, 'looking down');
    near(run('reach(made[0], 9, 5, 0)'), 0);
    assert.equal(run('render3D.shadowLight === made[0]'), true);
    assert.deepEqual([run('made[1].coneAngle'), run('reach(made[1], 9, 9, 9)')], [0, 1], 'a plain light as before');
});

test('a light\'s glow draws nothing where its texture can not be made', ()=>
{
    const run = load();
    // WebGL is there, and the canvas the glow is drawn on is not
    run(`var lamp = new Light3D(vec3(0, 5, 0), 10); lamp.glow = 2; var draws = 0;
        render3D.drawBillboard = ()=> ++draws; glContext = {}; lamp.render3D();`);
    assert.equal(run('draws'), 0, 'no plain square in place of the glow');
});

test('a spotlight that casts the shadows lights no wider than its shadow map covers', ()=>
{
    const run = load();
    // 86 degrees to each side, wider than a shadow map can look; forward is -z
    run(coneCode + `var lamp = new Light3D(vec3(), 10); lamp.coneAngle = 1.5; lamp.coneSoftness = 0;
        var along = (degrees)=> reach(lamp, sin(degrees * PI / 180), 0, -cos(degrees * PI / 180));`);
    near(run('along(82)'), 1, 'on its own it lights its whole cone');
    run('render3D.shadowLight = lamp');
    near(run('along(82)'), 0, 'as the shadow light it stops where its map does');
    near(run('along(70)'), 1);
});

test('a spotlight shadow bias is world units at any radius and distance', ()=>
{
    const run = load();
    for (const radius of [5, 25, 200])
    {
        run(`render3D.shadowLight?.destroy(); var lamp = new Light3D(vec3(), ${radius}); lamp.coneAngle = .5;
            render3D.shadowLight = lamp; render3D.updateShadowMatrix();
            var depth = (z)=> { const m = render3D.shadowMatrix.m, w = -m[11] * z + m[15];
                return (-m[10] * z + m[14]) / w * .5; };`);
        // the lookup moves the depth by shadowDepthBias over the distance squared, as much as shadowBias moves it
        for (const z of [radius * .1, radius * .7])
        {
            const e = z * 1e-4, slope = run(`(depth(${z + e}) - depth(${z})) / ${e}`);
            const step = slope * run('render3D.shadowBias'), lookup = run('render3D.shadowDepthBias') / (z * z);
            assert.ok(Math.abs(step / lookup - 1) < .05, `radius ${radius} at ${z}: ${step} vs ${lookup}`);
        }
    }
});

test('a shadow light with a tiny radius still has a shadow map that works', ()=>
{
    const run = load();
    run(`var lamp = new Light3D(vec3(0, 1, 0), .02); lamp.coneAngle = .5; render3D.shadowLight = lamp;
        render3D.updateShadowMatrix();`);
    assert.ok(run('render3D.shadowDepthBias > 0 && isFinite(render3D.shadowDepthBias)'), 'a bias that is a number');
    assert.ok(list(run, 'render3D.shadowMatrix.m').every(Number.isFinite), 'and a matrix of numbers');
});

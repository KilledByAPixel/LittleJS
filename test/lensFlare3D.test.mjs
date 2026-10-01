import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// LensFlare3D - the sun's lens flare: a glow at the sun and a row of discs and rings along the line from the sun
// through the middle of the screen, fading out when the sun leaves the screen or goes behind something.

// a camera at the origin looking down -z on a 1000 pixel square canvas
function load()
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new Render3DPlugin;
        render3D.camera.pos = vec3(); render3D.camera.rotation = vec3();
        var sun = (x, y, z)=> { render3D.sunDirection = vec3(x, y, z); render3D.updateMatrices(); };
        var shown = (flare)=> flare.getScreenElements().map((e)=> [e.pos.x, e.pos.y, e.size, e.color.a]);
        var steps = (flare, n)=> { for (let i = 0; i < n; ++i) flare.update(); };`);
    return run;
}
const near = (a, b, message, epsilon=.5)=> assert.ok(Math.abs(a - b) < epsilon, message ?? `${a} is not ${b}`);
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));

test('a flare has a glow at the sun and count ghosts, the same ones each time for a seed', ()=>
{
    const run = load();
    run('var flare = new LensFlare3D;');
    assert.deepEqual([run('flare.flareSize'), run('flare.count'), run('flare.intensity'), run('flare.saturation')],
        [1, 7, 1, 1]);
    const elements = json(run, 'flare.getElements()');
    assert.equal(elements.length, 9, 'a glow and a core at the sun, and 7 ghosts');
    assert.deepEqual([elements[0].at, elements[1].at], [0, 0]);
    assert.ok(elements.slice(2).every((e)=> e.at > 0 && e.size > 0), 'ghosts away from the sun');
    assert.deepEqual(json(run, 'new LensFlare3D().getElements()'), elements, 'the same for the same seed');
    run('flare.seed = 5');
    assert.notDeepEqual(json(run, 'flare.getElements()'), elements, 'another seed, another flare');
    run('flare.count = 3');
    assert.equal(run('flare.getElements().length'), 5);
});

test('saturation is how colorful the ghosts are, none makes them the flare\'s own color', ()=>
{
    const run = load();
    run('var flare = new LensFlare3D(1, 7, 1, 0);');
    assert.ok(json(run, 'flare.getElements()').slice(2).every((e)=> e.color.r === e.color.g && e.color.g === e.color.b));
    run('flare.saturation = 1');
    assert.ok(json(run, 'flare.getElements()').slice(2).some((e)=> e.color.r !== e.color.g));
});

test('the elements lie on the line from the sun through the middle of the screen', ()=>
{
    const run = load();
    run(`var flare = new LensFlare3D;
        flare.elements = [{at: 0, size: .1, color: WHITE, shape: 'glow'}, {at: 1, size: .1, color: WHITE, shape: 'disc'},
            {at: 2, size: .1, color: WHITE, shape: 'ring'}];
        sun(0, 0, -1);`);
    for (const [x, y] of json(run, 'shown(flare)'))
        near(x, 500), near(y, 500, 'the sun dead ahead, everything in the middle');
    run('sun(.3, .2, -1)');
    const [atSun, middle, across] = json(run, 'shown(flare)');
    assert.ok(atSun[0] > 600 && atSun[1] < 450, 'the sun right and up: ' + atSun);
    near(middle[0], 500), near(middle[1], 500);
    near(across[0], 1000 - atSun[0]), near(across[1], 1000 - atSun[1], 'as far past the middle as the sun is from it');
});

test('size scales the elements with the screen, intensity their brightness', ()=>
{
    const run = load();
    run(`var flare = new LensFlare3D; flare.elements = [{at: 0, size: .1, color: rgb(1, 1, 1, .5), shape: 'glow'}];
        sun(0, 0, -1);`);
    assert.deepEqual(json(run, 'shown(flare)')[0].slice(2), [100, .5], 'a tenth of the screen height');
    run('flare.flareSize = 2; flare.intensity = .5;');
    assert.deepEqual(json(run, 'shown(flare)')[0].slice(2), [200, .25]);
});

test('no flare with the sun behind the camera, and it fades as the sun leaves the screen', ()=>
{
    const run = load();
    run('var flare = new LensFlare3D; sun(0, 0, 1);');
    assert.equal(run('flare.getScreenElements().length'), 0);
    run('sun(0, 0, -1)');
    const full = json(run, 'shown(flare)')[0][3];
    run('sun(.62, 0, -1)'); // just past the edge of the screen
    const edge = json(run, 'shown(flare)')[0]?.[3] ?? 0;
    assert.ok(edge > 0 && edge < full, 'dimmer past the edge: ' + edge);
    run('sun(2, 0, -1)');
    assert.equal(run('flare.getScreenElements().length'), 0, 'well off the screen');
});

test('the flare fades out when something hides the sun, and back when it shows again', ()=>
{
    const run = load();
    run(`var flare = new LensFlare3D; sun(0, 0, -1); steps(flare, 20);`);
    assert.equal(run('flare.visible'), 1);
    run(`var wall = new EngineObject3D(vec3(0, 0, -20), render3D.boxMesh); wall.scale3D = vec3(10); flare.update();`);
    assert.ok(run('flare.visible') < 1 && run('flare.visible') > 0, 'it fades, it does not pop');
    run('steps(flare, 20)');
    assert.equal(run('flare.visible'), 0);
    assert.equal(run('flare.getScreenElements().length'), 0);
    run('wall.pos3D = vec3(50, 0, -20); steps(flare, 20);');
    assert.equal(run('flare.visible'), 1, 'the wall moved aside');
});

test('what is see-through does not hide the sun, and the test can be turned off', ()=>
{
    const run = load();
    run(`var flare = new LensFlare3D; sun(0, 0, -1);
        var glass = new EngineObject3D(vec3(0, 0, -20), render3D.boxMesh); glass.scale3D = vec3(10);
        glass.transparent = true; steps(flare, 20);`);
    assert.equal(run('flare.visible'), 1);
    run('glass.transparent = false; steps(flare, 20);');
    assert.equal(run('flare.visible'), 0);
    run('flare.occlusion = false; steps(flare, 20);');
    assert.equal(run('flare.visible'), 1);
});

test('see-through blocks of a voxel map do not hide the sun, the blocks behind them do', ()=>
{
    const run = load();
    // a row of blocks along the way to the sun: glass in front, a place for a stone block behind it
    run(`var flare = new LensFlare3D; sun(0, 0, -1);
        var map = new VoxelMap(vec3(-.5, -.5, -8), vec3(1, 1, 4), new TileInfo(vec2(), vec2(16), new TextureInfo(undefined, false)));
        map.setBlockType(1, 0, {transparent: true});
        map.setBlockType(2, 0, {seeThrough: true});
        map.setVoxel(vec3(0, 0, 3), 1); map.setVoxel(vec3(0, 0, 2), 2);
        steps(flare, 20);`);
    assert.equal(run('flare.isSunHidden()'), false);
    assert.equal(run('flare.visible'), 1, 'glass and leaves let the sun through');
    run('map.setVoxel(vec3(0, 0, 0), 3); steps(flare, 20);');
    assert.equal(run('flare.visible'), 0, 'a solid block behind them hides it');
    assert.equal(run('!!render3D.pick(new Ray3D(vec3(), vec3(0, 0, -1)))'), true, 'picking still finds the glass');
    run('map.destroy()');
});

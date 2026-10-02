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

test('an object the camera is inside, a room or the player\'s own body, does not hide the sun', ()=>
{
    const run = load();
    run(`var flare = new LensFlare3D; sun(0, 0, -1);
        var room = new EngineObject3D(vec3(), render3D.boxMesh); room.scale3D = vec3(30); steps(flare, 20);`);
    assert.equal(run('flare.visible'), 1, 'inside the room');
    run('room.pos3D = vec3(0, 0, -40); steps(flare, 20);');
    assert.equal(run('flare.visible'), 0, 'the same box ahead of the camera hides it');
});

// a flare of a red lamp 10 ahead of the camera, the sun off to the side
const lampCode = `sun(1, 0, 0); var lamp = new Light3D(vec3(0, 0, -10), 10, rgb(1, 0, 0));
    var flare = new LensFlare3D; flare.light = lamp;`;

test('a flare with a light is that light\'s: at its place on the screen, in its color, whatever the sun does', ()=>
{
    const run = load();
    run(lampCode);
    const at = json(run, 'flare.getSunScreenPos()');
    near(at.x, 500); near(at.y, 500);
    const first = json(run, 'flare.getScreenElements()[0]');
    assert.deepEqual([first.color.r > 0, first.color.g, first.color.b], [true, 0, 0]);
    run('lamp.pos3D = vec3(0, 0, 10)');
    assert.equal(run('flare.getScreenElements().length'), 0, 'behind the camera');
});

test('a light\'s flare is smaller from farther than the light reaches, and goes with the light', ()=>
{
    const run = load();
    run(lampCode);
    const size = run('shown(flare)[0][2]');
    run('lamp.radius = 5');
    near(run('shown(flare)[0][2]'), size / 2, 'twice as far as it reaches, half the size');
    run('lamp.pos3D = vec3(0, 0, -3)');
    near(run('shown(flare)[0][2]'), size, 'no bigger up close');
    run('lamp.destroy(); steps(flare, 20);');
    assert.deepEqual([run('flare.visible'), run('flare.getScreenElements().length')], [0, 0]);
});

test('a light\'s flare is hidden by what is in front of the light, not by what is behind it or the lamp around it', ()=>
{
    const run = load();
    run(lampCode + `var box = new EngineObject3D(vec3(0, 0, -20), render3D.boxMesh); steps(flare, 20);`);
    assert.equal(run('flare.visible'), 1, 'a box behind the light');
    run('box.pos3D = vec3(0, 0, -10); steps(flare, 20);');
    assert.equal(run('flare.visible'), 1, 'the lamp the light is in');
    run('box.pos3D = vec3(0, 0, -5); steps(flare, 20);');
    assert.equal(run('flare.visible'), 0, 'a box in front of it');
});

test('a spotlight\'s flare shows from inside its beam only', ()=>
{
    const run = load();
    run(lampCode + 'lamp.coneAngle = .5;'); // it shines down -z, away from the camera
    assert.equal(run('flare.getScreenElements().length'), 0);
    run('lamp.rotation3D = vec3(0, PI, 0)');
    assert.ok(run('flare.getScreenElements().length') > 0, 'turned to shine at the camera');
});

test('a light tagged with flare has a flare of its own, which goes with the light', ()=>
{
    const run = load();
    run(`sun(1, 0, 0); var lamp = new Light3D(vec3(0, 0, -10), 10, rgb(1, 0, 0)); var count = engineObjects.length;`);
    assert.equal(run('lamp.flare'), undefined, 'no flare until asked for');
    run('lamp.flare = true');
    assert.deepEqual([run('lamp.flare instanceof LensFlare3D'), run('lamp.flare.light === lamp'),
        run('engineObjects.length - count')], [true, true, 1]);
    assert.ok(run('lamp.flare.getScreenElements().length') > 0);
    run('var made = lamp.flare; lamp.flare = true;');
    assert.equal(run('lamp.flare === made'), true, 'tagged twice, still the one flare');

    // a flare of the game's own in its place: the old one goes
    run('var mine = new LensFlare3D(2, 3); lamp.flare = mine;');
    assert.deepEqual([run('lamp.flare === mine'), run('mine.light === lamp'), run('made.destroyed')], [true, true, true]);
    run('lamp.flare = false');
    assert.deepEqual([run('lamp.flare'), run('mine.destroyed')], [undefined, true]);

    run('lamp.flare = true; made = lamp.flare; lamp.destroy();');
    assert.equal(run('made.destroyed'), true, 'destroyed with its light');
});

test('a level\'s Light has a flare property', ()=>
{
    const run = load();
    run(`level3DLoad({objects: [{id: 1, type: 'Light', pos: [0, 0, -10], properties: {flare: true}},
        {id: 2, type: 'Light', pos: [3, 0, -10]}]});
        var lights = engineObjects.filter((o)=> o instanceof Light3D);`);
    assert.deepEqual(json(run, 'lights.map((o)=> o.flare instanceof LensFlare3D)'), [true, false]);
});

test('the made flare takes its ghosts from shapes, and glowSize and ghostSize scale its parts', ()=>
{
    const run = load();
    run('var flare = new LensFlare3D;');
    const before = json(run, 'flare.getElements()');
    run(`flare.shapes = ['hex']`);
    const hex = json(run, 'flare.getElements()');
    assert.ok(hex.slice(2).every((e)=> e.shape === 'hex'));
    assert.deepEqual(hex.map((e)=> [e.at, e.size]), before.map((e)=> [e.at, e.size]), 'the same arrangement');
    run(`flare.shapes = ['ring', 'streak']`);
    const shapes = new Set(json(run, 'flare.getElements()').slice(2).map((e)=> e.shape));
    assert.deepEqual([...shapes].sort(), ['ring', 'streak']);
    run('flare.shapes = undefined; flare.ghostSize = 2; flare.glowSize = .5;');
    const scaled = json(run, 'flare.getElements()');
    near(scaled[0].size, before[0].size / 2, undefined, 1e-9);
    near(scaled[5].size, before[5].size * 2, undefined, 1e-9);
    run('flare.glowSize = 0');
    assert.equal(run('flare.getElements().length'), 7, 'no glow at the sun, the ghosts alone');
});

test('an element may be a tile of the game\'s own, turned, and wider than it is tall', ()=>
{
    const run = load();
    run(`var flare = new LensFlare3D, art = tile(3, 16);
        flare.elements = [{at: 0, size: vec2(.4, .1), color: WHITE, tileInfo: art, angle: 1}];
        sun(0, 0, -1);`);
    const [e] = json(run, 'flare.getScreenElements()');
    assert.deepEqual([e.size.x, e.size.y, e.angle, run('flare.getScreenElements()[0].tileInfo === art')],
        [400, 100, 1, true]);
    run('lamp = new Light3D(vec3(0, 0, -10), 5); flare.light = lamp;');
    assert.deepEqual(json(run, 'flare.getScreenElements()[0].size'), {x: 200, y: 50}, 'a vector size scales as a number does');
});

test('every shape has a tile in the flare texture, and a name that is not a shape is the glow', ()=>
{
    assert.deepEqual(json(load(), 'render3DFlareShapes'), ['glow', 'disc', 'ring', 'hex', 'streak', 'star']);
});

test('the flare of a persistent light stays with it through a scene change', ()=>
{
    const run = load();
    run(`var lamp = new Light3D(vec3(0, 0, -10), 10); lamp.persistent = true; lamp.flare = true;
        var made = lamp.flare, other = new Light3D(vec3(3, 0, -10), 10); other.flare = true; var gone = other.flare;
        setScene({});`);
    assert.deepEqual([run('made.destroyed'), run('lamp.flare === made'), run('engineObjects.includes(made)')],
        [false, true, true]);
    assert.deepEqual([run('other.destroyed'), run('gone.destroyed')], [true, true], 'a light that goes takes its flare');
});

test('a flare destroyed on its own is no longer the flare of its light, and true makes another', ()=>
{
    const run = load();
    run('var lamp = new Light3D(vec3(0, 0, -10), 10); lamp.flare = true; var made = lamp.flare; made.destroy();');
    assert.equal(run('lamp.flare'), undefined);
    run('lamp.flare = true');
    assert.deepEqual([run('lamp.flare instanceof LensFlare3D'), run('lamp.flare !== made'), run('lamp.flare.destroyed')],
        [true, true, false]);
});

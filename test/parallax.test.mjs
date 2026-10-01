import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// ParallaxLayer - a background image that follows the camera by a part of its movement, repeated across the view.
// The canvas is 1000 pixels square, so at a camera scale of 10 the view is 100 units across.

function load()
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); cameraScale = 10; cameraPos = vec2();
        var xs = (layer)=> layer.getDrawPositions().map((p)=> p.x);`);
    return run;
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));

test('a layer follows the camera by its parallax, 0 with the world and 1 with the screen', ()=>
{
    const run = load();
    run('var layer = new ParallaxLayer(vec2(0, 5), vec2(40, 20), .5); layer.wrapX = false; cameraPos = vec2(10, 3);');
    assert.deepEqual(json(run, 'layer.getDrawPositions()'), [{x: 5, y: 4}], 'half way to the camera from its place');
    run('layer.parallax = vec2(1, 0)');
    assert.deepEqual(json(run, 'layer.getDrawPositions()'), [{x: 10, y: 5}], 'each way by its own amount');
    run('layer.parallax = vec2()');
    assert.deepEqual(json(run, 'layer.getDrawPositions()'), [{x: 0, y: 5}], 'none, a thing in the world');
    assert.deepEqual(json(run, 'layer.pos'), {x: 0, y: 5}, 'its own place is not moved');
});

test('a wrapped layer repeats across the whole view and no further', ()=>
{
    const run = load();
    run('var layer = new ParallaxLayer(vec2(), vec2(40, 20), 0);');
    assert.deepEqual(json(run, 'xs(layer)'), [-40, 0, 40], 'the view is -50 to 50, three of them cover it');
    run('cameraPos = vec2(1000, 0)');
    assert.deepEqual(json(run, 'xs(layer)'), [960, 1000, 1040], 'wherever the camera is');
    run('layer.size = vec2(40, 30); layer.wrapY = true');
    assert.equal(run('layer.getDrawPositions().length'), 3 * 5, 'and up and down too when asked');
    run('layer.wrapX = layer.wrapY = false');
    assert.deepEqual(json(run, 'xs(layer)'), [0], 'one image when not wrapped');
});

test('a layer that does not follow the zoom keeps its size and its shift on the screen', ()=>
{
    const run = load();
    run(`var layer = new ParallaxLayer(vec2(), vec2(40, 20), .5); layer.wrapX = false; layer.zoomFollow = 0;
        cameraPos = vec2(10, 0);`);
    assert.deepEqual(json(run, '[layer.getDrawSize(), layer.getDrawPositions()[0]]'), [{x: 40, y: 20}, {x: 5, y: 0}]);
    run('cameraScale = 20');
    assert.deepEqual(json(run, '[layer.getDrawSize(), layer.getDrawPositions()[0]]'), [{x: 20, y: 10}, {x: 7.5, y: 0}],
        'zoomed in twice it is half the size in the world, and half as far from the camera');
    run('layer.zoomFollow = 1');
    assert.deepEqual(json(run, 'layer.getDrawSize()'), {x: 40, y: 20}, 'following the zoom it is a thing of the world');
});

test('the mountains ridge ends at the height it starts at, so the image repeats with no step', ()=>
{
    const run = load();
    const ridge = json(run, '[...parallaxRidge(512, 256, new RandomGenerator(7))]');
    assert.equal(ridge.length, 513);
    assert.ok(Math.abs(ridge[0] - ridge[512]) < 1e-3);
    assert.ok(ridge.every((y)=> y >= 0 && y <= 256), 'inside the image');
    assert.ok(Math.max(...ridge) - Math.min(...ridge) > 10, 'and it is not flat');
    assert.deepEqual(json(run, '[...parallaxRidge(512, 256, new RandomGenerator(7))]'), ridge, 'the same for a seed');
});

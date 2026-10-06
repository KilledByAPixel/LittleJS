import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// Environment cube maps: makeCubeMap asks a function the color of each direction and lays the six faces out as WebGL
// reads them (test/browser/environment.html checks the sampling on real pixels), and a headless game can set
// render3D.environment and render3D.skyBox with no WebGL to draw them.

// the color a direction is given: its x, y and z as red, green and blue, from -1 to 1 made 0 to 1
const directionColor = (d)=> LJS.rgb(d.x * .5 + .5, d.y * .5 + .5, d.z * .5 + .5);
const pixel = (cube, face, x, y)=> [...cube.faces[face].slice((x + y * cube.size) * 4, (x + y * cube.size) * 4 + 4)];

test('makeCubeMap makes six faces of size by size pixels, each its function\'s color for that way', ()=>
{
    const cube = LJS.makeCubeMap(4, directionColor);
    assert.ok(cube instanceof LJS.CubeMap);
    assert.equal(cube.size, 4);
    assert.equal(cube.faces.length, 6);
    assert.ok(cube.faces.every((face)=> face.length === 4 * 4 * 4));
    // the middle of each face looks along its axis, +x, -x, +y, -y, +z and -z in turn
    const axes = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
    axes.forEach(([axis, sign], face)=>
    {
        const middle = [0, 1, 2].map((c)=> (pixel(cube, face, 1, 1)[c] + pixel(cube, face, 2, 2)[c]) / 2);
        assert.ok(sign > 0 ? middle[axis] > 220 : middle[axis] < 35, `face ${face} looks along ${sign > 0 ? '+' : '-'}${'xyz'[axis]}`);
    });
});

test('a cube map face is laid out as WebGL reads it: on +x the first column is +z and the first row +y', ()=>
{
    const cube = LJS.makeCubeMap(8, directionColor);
    const [r, g, b] = pixel(cube, 0, 0, 0);
    assert.ok(r > 128 && g > 128 && b > 128, 'the top left of +x looks up and toward +z');
    const [r2, g2, b2] = pixel(cube, 0, 7, 7);
    assert.ok(r2 > 128 && g2 < 128 && b2 < 128, 'its bottom right down and toward -z');
});

test('a cube map is the world around for reflections and the sky, and a headless game sets it with no WebGL', ()=>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new Render3DPlugin;
        var cube = makeCubeMap(2, (d)=> WHITE);
        render3D.environment = render3D.skyBox = cube;
        new EngineObject3D(vec3(), render3D.boxMesh).reflectivity = 1;`);
    assert.doesNotThrow(()=> run('engineObjectsUpdate(); render3D.render?.()'));
    assert.equal(run('cube.glTexture'), undefined, 'no texture made without WebGL');
    assert.doesNotThrow(()=> run('cube.dispose()'));
});

test('loadCubeMap takes six images', async ()=>
{
    const { run } = loadEngine();
    await assert.rejects(run('loadCubeMap(["a.png"])'));
});

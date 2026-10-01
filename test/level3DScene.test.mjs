import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A 3D level can set the scene: its sky, ambient light, sun, fog and shadows, in a scene block beside its objects.
// level3DLoad applies what the block has, a level without one leaves what the game set alone.
const { vec3, hsl, level3DLoad } = LJS;
new LJS.Render3DPlugin;
const render3D = LJS.render3D;
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-3, message ?? `${a} is not ${b}`);

// the renderer back to a known setup, as a game's own code would leave it
function gameSetup()
{
    render3D.sky = undefined;
    render3D.ambientColor = hsl(0, 0, .3);
    render3D.ambientGroundColor = undefined;
    render3D.setFog(0, 0, hsl(0, 0, .5));
    render3D.sunDirection = vec3(-.3, 1, .5);
    render3D.sunColor = hsl(0, 0, 1);
    render3D.shadows = false;
}

test('a level with no scene block leaves the scene alone', ()=>
{
    gameSetup();
    level3DLoad({objects: []});
    assert.equal(render3D.sky, undefined);
    assert.equal(render3D.fogEnd, 0);
    assert.equal(render3D.shadows, false);
    near(render3D.sunDirection.y, 1);
});

test('a scene block sets the sky, ambient, sun, fog and shadows', ()=>
{
    gameSetup();
    level3DLoad({scene: {sky: ['#ff0000', '#00ff00', '#0000ff'], ambient: .25, sunDirection: [1, 2, 3],
        sunColor: '#ff8000', fog: [10, 50], shadows: true}, objects: []});
    assert.ok(render3D.sky, 'a sky dome');
    near(render3D.ambientColor.r, .25), near(render3D.ambientColor.g, 0);
    near(render3D.ambientGroundColor.b, .25);
    near(render3D.fogColor.g, 1, 'the fog takes the horizon');
    assert.deepEqual([render3D.sunDirection.x, render3D.sunDirection.y, render3D.sunDirection.z], [1, 2, 3]);
    near(render3D.sunColor.g, .502);
    assert.deepEqual([render3D.fogStart, render3D.fogEnd], [10, 50]);
    assert.equal(render3D.shadows, true);
});

test('a fog color of its own wins over the horizon, and ambient is .5 when not given', ()=>
{
    gameSetup();
    level3DLoad({scene: {sky: ['#ffffff', '#00ff00', '#000000'], fogColor: '#ff0000'}});
    near(render3D.fogColor.r, 1), near(render3D.fogColor.g, 0);
    near(render3D.ambientColor.r, .5);
});

test('a block may hold only some settings, the rest stay as the game set them', ()=>
{
    gameSetup();
    level3DLoad({scene: {fog: [5, 20]}});
    assert.equal(render3D.sky, undefined);
    assert.deepEqual([render3D.fogStart, render3D.fogEnd], [5, 20]);
    near(render3D.fogColor.r, .5);
    assert.equal(render3D.shadows, false);
});

test('what a file gets wrong is left as it was', ()=>
{
    gameSetup();
    level3DLoad({scene: {sky: ['red', '#00ff00'], ambient: 'x', sunDirection: [0, 0, 0], sunColor: 5,
        fog: [1, 'far'], fogColor: null, shadows: 'yes'}});
    assert.equal(render3D.sky, undefined);
    near(render3D.sunDirection.y, 1, 'a sun with no direction is not a direction');
    near(render3D.sunColor.r, 1);
    assert.equal(render3D.fogEnd, 0);
    assert.equal(render3D.shadows, false);
    for (const scene of [5, 'sky', null, []])
        assert.doesNotThrow(()=> level3DLoad({scene}));
});

test('a second level replaces the first one\'s sky, and leaves a sky the game made alone', ()=>
{
    gameSetup();
    const own = render3D.setSky();
    let disposed = 0;
    const dispose = own.dispose.bind(own);
    own.dispose = ()=> { ++disposed; dispose(); };
    level3DLoad({scene: {sky: ['#ff0000', '#00ff00', '#0000ff']}});
    const first = render3D.sky;
    assert.notEqual(first, own);
    assert.equal(disposed, 0, 'the game\'s own dome is not disposed, it may put it back');
    level3DLoad({scene: {sky: ['#0000ff', '#00ff00', '#ff0000']}});
    assert.notEqual(render3D.sky, first);
});

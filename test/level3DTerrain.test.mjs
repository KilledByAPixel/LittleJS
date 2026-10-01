import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A 3D level can hold a terrain, in a terrain block beside its objects: where its center is, its size in the world,
// how tall a full height is, its color, and its heights, rows of 0 to 1. level3DLoad makes a HeightMap of it.
const { HeightMap, level3DLoad } = LJS;
new LJS.Render3DPlugin;
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-3, message ?? `${a} is not ${b}`);
const terrainOf = (level)=> level3DLoad(level).find((o)=> o instanceof HeightMap);

test('a level with no terrain block makes no terrain', ()=>
{
    assert.equal(terrainOf({objects: []}), undefined);
});

test('a terrain block makes a height map of its place, size, height, color and heights', ()=>
{
    const map = terrainOf({terrain: {pos: [1, -2, 3], size: [8, 4], height: 10, color: '#ff8000',
        heights: [[0, 0, 0], [0, .5, 0], [1, 1, 1]]}});
    assert.deepEqual([map.pos3D.x, map.pos3D.y, map.pos3D.z], [1, -2, 3]);
    assert.deepEqual([map.mapSize.x, map.mapSize.y, map.height, map.rows, map.columns], [8, 4, 10, 3, 3]);
    near(map.color.g, .502);
    near(map.getHeight(1, 3), -2 + 5, 'the middle, half of its height over its center');
    near(map.getHeight(1, 5), -2 + 10, 'the last row is at +z');
    map.destroy();
});

test('a terrain with no place, height or color is at the origin, 1 tall and white', ()=>
{
    const map = terrainOf({terrain: {size: [4, 4], heights: [[0, 0], [0, 0]]}});
    assert.deepEqual([map.pos3D.y, map.height, map.color.r, map.color.b], [0, 1, 1, 1]);
    map.destroy();
});

test('what a file gets wrong makes no terrain, or a flatter one, and never throws', ()=>
{
    const flat = [[0, 0], [0, 0]];
    for (const terrain of [5, 'hill', null, [], {}, {size: [4, 4]}, {size: [0, 4], heights: flat},
        {size: [4], heights: flat}, {size: [4, 4], heights: [[0, 0]]}, {size: [4, 4], heights: [[0], [0]]},
        {size: [4, 4], heights: [[0, 0], [0]]}, {size: [4, 4], heights: 'flat'},
        {size: [4, 4], heights: Array.from({length: 300}, ()=> Array(300).fill(0))}])
        assert.equal(terrainOf({terrain}), undefined, JSON.stringify(terrain)?.slice(0, 60));
    // a height that is not a number is 0, and one out of range is brought into it
    const map = terrainOf({terrain: {size: [4, 4], heights: [[5, 'x'], [-1, .5]]}});
    assert.deepEqual(map.heights, [[1, 0], [0, .5]]);
    map.destroy();
});

test('the level\'s own heights are not the map\'s, sculpting a map leaves the level as it was', ()=>
{
    const heights = [[0, 0], [0, 0]];
    const map = terrainOf({terrain: {size: [4, 4], heights}});
    map.heights[0][0] = 1;
    assert.equal(heights[0][0], 0);
    map.destroy();
});

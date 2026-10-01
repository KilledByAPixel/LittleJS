import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A 3D level can hold a map of blocks, in a voxels block beside its objects: where its corner is, its size in
// cells, and its blocks as runs, a count and a type at a time. level3DLoad makes a VoxelMap of it.
const { vec2, vec3, VoxelMap, TileInfo, TextureInfo, level3DLoad, level3DVoxelSetup } = LJS;
new LJS.Render3DPlugin;

const mapOf = (level)=> level3DLoad(level).find((o)=> o instanceof VoxelMap);

test('a level with no voxels block makes no map', ()=>
{
    assert.equal(mapOf({objects: []}), undefined);
});

test('a voxels block makes a map at its corner, of its size, with its blocks', ()=>
{
    // 4 by 2 by 3: the first row of 4 is type 1, then 5 empty, then 2 of type 7, the rest empty
    const map = mapOf({voxels: {pos: [-2, 0, 5], size: [4, 2, 3], blocks: [4, 1, 5, 0, 2, 7]}});
    assert.deepEqual([map.pos3D.x, map.pos3D.y, map.pos3D.z], [-2, 0, 5]);
    assert.deepEqual([map.mapSize.x, map.mapSize.y, map.mapSize.z], [4, 2, 3]);
    assert.deepEqual([...map.data.slice(0, 12)], [1, 1, 1, 1, 0, 0, 0, 0, 0, 7, 7, 0]);
    assert.equal(map.getVoxel(vec3(1, 0, 1)), 7, 'cells go along x, then y, then z');
    assert.equal(map.data.slice(12).some((v)=> v), false, 'what the runs do not reach is empty');
    map.destroy();
});

test('a map with no blocks is empty, and its corner is the origin when not given', ()=>
{
    const map = mapOf({voxels: {size: [2, 2, 2]}});
    assert.deepEqual([map.pos3D.x, map.data.length, map.data.some((v)=> v)], [0, 8, false]);
    map.destroy();
});

test('what a file gets wrong makes no map, or an emptier one, and never throws', ()=>
{
    for (const voxels of [5, 'map', null, [], {}, {size: [0, 2, 2]}, {size: [2, 2]}, {size: [2, 'x', 2]},
        {size: [2.5, 2, 2]}, {size: [4096, 4096, 4096]}])
        assert.equal(mapOf({voxels}), undefined, JSON.stringify(voxels));
    // runs that are not numbers stop the blocks there, a type out of range is empty, too many runs are cut off
    const map = mapOf({voxels: {size: [2, 2, 1], blocks: [1, 3, 1, 999, 1, 2, 'x', 4, 50, 9]}});
    assert.deepEqual([...map.data], [3, 0, 2, 0]);
    map.destroy();
    const full = mapOf({voxels: {size: [2, 1, 1], blocks: [50, 9]}});
    assert.deepEqual([...full.data], [9, 9]);
    full.destroy();
});

test('level3DVoxelSetup gives the sheet and sets up each map a level makes', ()=>
{
    const sheet = new TileInfo(vec2(), vec2(16), new TextureInfo(undefined, false), 0, 0);
    let seen;
    level3DVoxelSetup(sheet, (map)=> { seen = map; map.setBlockType(1, {top: 2, side: 3}); });
    const map = mapOf({voxels: {size: [2, 2, 2]}});
    assert.equal(map.tileInfo, sheet);
    assert.equal(seen, map);
    assert.deepEqual(map.blockType(1).faces, [3, 3, 2, 3, 3, 3]);
    map.destroy();
    level3DVoxelSetup();
    const plain = mapOf({voxels: {size: [2, 2, 2]}});
    assert.notEqual(plain.tileInfo, sheet, 'no setup, the default sheet again');
    plain.destroy();
});

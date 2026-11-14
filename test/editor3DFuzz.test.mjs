import { test } from 'node:test';
import assert from 'node:assert/strict';

// A seeded fuzz of the 3D level editor, from full passes 7 to 9, in test/fixtures/editor3DFuzz.mjs: random edits must
// keep the live objects, the prefabs, the block map, the terrain and the renderer's scene in line with the level, and
// an autosave must bring it all back. The flags in its url add the game changing its own scene, in place too, sky
// boxes and environments loading late, and a level whose autosave waits; the scene paths broke in passes 7, 8 and 9.
// One seed can be run on its own with
//   node -e "import('./test/fixtures/editor3DFuzz.mjs?mid&inplace').then(async (m)=> console.log(await m.fuzz(false, 1, 60, 400)))"
// from the repo root, after node --import ./test/setup.mjs for the DOM stubs

const fuzzWith = async (flags)=> (await import('./fixtures/editor3DFuzz.mjs' + flags)).fuzz;

test('random edits keep the objects of the 3D editor in line with the level, and an autosave brings it all back', async ()=>
{
    assert.deepEqual(await (await fuzzWith(''))(false, 12, 60), []);
});

test('the same with the game changing its own scene while the editor works', async ()=>
{
    assert.deepEqual(await (await fuzzWith(''))(true, 12, 60, 101), []);
});

test('the same with the game changing the scene mid level, in place as a day cycle does', async ()=>
{
    // from seed 1, 4 of these 12 failed before the fix
    assert.deepEqual(await (await fuzzWith('?mid&inplace'))(false, 12, 60), []);
});

test('the same with sky boxes, environments and lens flares in the scene edits, their loads landing late', async ()=>
{
    assert.deepEqual(await (await fuzzWith('?cube&mid'))(false, 12, 60, 301), []);
});

test('the same on a level whose autosave waits, reloaded through another level loading', async ()=>
{
    assert.deepEqual(await (await fuzzWith('?big'))(false, 3, 60, 401), []);
});

test('the seeds that once lost the map a game holds keep it, 100 edits each (full pass 13)', async ()=>
{
    const fuzz = await fuzzWith('');
    assert.deepEqual(await fuzz(false, 1, 100, 60020), []);
    for (const seed of [61001, 61009, 61038])
        assert.deepEqual(await fuzz(true, 1, 100, seed), []);
    assert.deepEqual(await (await fuzzWith('?mid&inplace'))(false, 1, 100, 62016), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { tile, vec2, TileInfo, TextureInfo, SpriteAnimation } = LJS;

// frames step along a row and carry on at the start of the next row of the sheet, counted as tile() counts them,
// so an animation can cross a row; a tile with columns set wraps by those columns as before

LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});

const sheet = new TextureInfo({width: 80, height: 72}, false); // 10 columns and 9 rows of 8 pixel tiles
const at = (tileInfo)=> [tileInfo.pos.x, tileInfo.pos.y];

test('a frame that fits stays on its row', () =>
{
    assert.deepEqual(at(tile(0, 8, sheet).frame(3)), [24, 0]);
});

test('a frame past the edge carries on at the start of the next row, as tile() counts', () =>
{
    assert.deepEqual(at(tile(8, 8, sheet).frame(2)), at(tile(10, 8, sheet)));
    assert.deepEqual(at(tile(8, 8, sheet).frame(5)), at(tile(13, 8, sheet)));
    assert.deepEqual(at(tile(8, 8, sheet).frame(15)), at(tile(23, 8, sheet)));
});

test('padded tiles wrap on the padded grid', () =>
{
    const padded = new TextureInfo({width: 100, height: 90}, false); // 10 columns of 8 pixel tiles padded by 1
    assert.deepEqual(at(tile(8, 8, padded, 1).frame(2)), at(tile(10, 8, padded, 1)));
});

test('an animation crosses a row', () =>
{
    const run = new SpriteAnimation(tile(8, 8, sheet), 6, .1);
    LJS.engineStep(15); // two and a half frames in, on frame 2
    assert.equal(run.frame, 2);
    assert.deepEqual(at(run.tileInfo), at(tile(10, 8, sheet)));
});

test('a tile with columns set wraps by them, from its first frame, as before', () =>
{
    const strip = new TileInfo(vec2(16, 0), vec2(8), sheet, 0, 0, 2);
    assert.deepEqual(at(strip.frame(3)), [24, 8]);
});

test('a frame past the bottom of the sheet is still caught', () =>
{
    assert.throws(()=> tile(89, 8, sheet).frame(1), /beyond texture/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TextureSheet, TileInfo, loadSprite, spritesReady, textureSheets, vec2 } from '../dist/littlejs.esm.js';

// tests cover the packing math, drawImage needs a real canvas so it is not tested here

test('texture sheet system is exported', () =>
{
    assert.equal(typeof TextureSheet, 'function');
    assert.equal(typeof loadSprite, 'function');
    assert.equal(typeof spritesReady, 'function');
    assert.ok(Array.isArray(textureSheets));
});

test('a sheet has bounds even with no canvas', () =>
{
    const sheet = new TextureSheet(256);
    assert.equal(sheet.textureInfo.size.x, 256);
    assert.equal(sheet.textureInfo.sizeInverse.x, 1/256);
});

test('first image is placed inside the padding', () =>
{
    const sheet = new TextureSheet(256);
    const tile = sheet.tryAdd(vec2(16), vec2(16), 1);
    assert.deepEqual([tile.pos.x, tile.pos.y], [1, 1]);
    assert.deepEqual([tile.size.x, tile.size.y], [16, 16]);
    assert.equal(tile.padding, 1);
    assert.equal(tile.bleed, 0);
});

test('a tile with no columns keeps frames on a single row', () =>
{
    // default TileInfo behavior must be unchanged for tiles made by tile()
    const sheet = new TextureSheet(256);
    const tile = sheet.tryAdd(vec2(16), vec2(16), 1);
    assert.equal(tile.columns, 1);
    tile.setColumns(0);
    assert.deepEqual([tile.frame(2).pos.x, tile.frame(2).pos.y], [1 + 2*18, 1]);
});

test('images advance the cursor by the full padded cell', () =>
{
    const sheet = new TextureSheet(256);
    sheet.tryAdd(vec2(16), vec2(16), 1);
    const tile = sheet.tryAdd(vec2(16), vec2(16), 1);
    // first cell is 16 + 1*2 wide, so the second starts at 18 then pads to 19
    assert.equal(tile.pos.x, 19);
    assert.equal(tile.pos.y, 1);
});

test('frame size defaults to the whole image', () =>
{
    const sheet = new TextureSheet(256);
    const tile = sheet.tryAdd(vec2(32, 24));
    assert.deepEqual([tile.size.x, tile.size.y], [32, 24]);
});

test('a horizontal strip packs into one row', () =>
{
    const sheet = new TextureSheet(256);
    // 64x16 source of 16x16 frames is 4 frames in a single row
    const tile = sheet.tryAdd(vec2(64, 16), vec2(16), 1);
    assert.deepEqual([tile.size.x, tile.size.y], [16, 16]);
    assert.equal(tile.columns, 4);

    // frame() must land on the same cells the packer reserved
    assert.deepEqual([tile.frame(0).pos.x, tile.frame(0).pos.y], [1, 1]);
    assert.deepEqual([tile.frame(3).pos.x, tile.frame(3).pos.y], [1 + 3*18, 1]);

    // the next image starts after the whole block
    assert.equal(sheet.tryAdd(vec2(16), vec2(16), 1).pos.x, 4*18 + 1);
});

test('a grid source keeps its layout and frames wrap to the next row', () =>
{
    const sheet = new TextureSheet(256);
    // 32x32 source of 16x16 frames is a 2x2 grid
    const tile = sheet.tryAdd(vec2(32), vec2(16), 1);
    assert.equal(tile.columns, 2);

    // frames 0 and 1 are the top row, 2 and 3 wrap down to the second
    assert.deepEqual([tile.frame(1).pos.x, tile.frame(1).pos.y], [1 + 18, 1]);
    assert.deepEqual([tile.frame(2).pos.x, tile.frame(2).pos.y], [1, 1 + 18]);
    assert.deepEqual([tile.frame(3).pos.x, tile.frame(3).pos.y], [1 + 18, 1 + 18]);

    // the block is only 2 cells wide, so the next image starts there
    assert.equal(sheet.tryAdd(vec2(16), vec2(16), 1).pos.x, 2*18 + 1);
});

test('a row wider than the sheet is narrowed to fit', () =>
{
    // 6 frames of 16px at padding 1 is 108px wide, too wide for a 64px sheet
    const sheet = new TextureSheet(64);
    const tile = sheet.tryAdd(vec2(96, 16), vec2(16), 1);
    // only 3 cells of 18px fit in 64, so it wraps at 3 instead of asserting
    assert.equal(tile.columns, 3);
    assert.deepEqual([tile.frame(3).pos.x, tile.frame(3).pos.y], [1, 1 + 18]);
});

test('a big grid atlas that used to be too wide now packs', () =>
{
    // 256x256 of 16x16 frames is 256 frames, 4608px if flattened to one row
    const sheet = new TextureSheet(1024);
    const tile = sheet.tryAdd(vec2(256), vec2(16), 1);
    assert.equal(tile.columns, 16);
    // 16 columns of 18px is 288 wide, 16 rows of 18px is 288 tall
    assert.equal(sheet.cursor.x, 288);
    assert.equal(tile.frame(255).pos.y, 1 + 15*18);
});

test('an image that does not fit wraps to a new row', () =>
{
    const sheet = new TextureSheet(64);
    sheet.tryAdd(vec2(48), vec2(48), 0); // 48 wide, 48 tall
    const tile = sheet.tryAdd(vec2(32, 8), vec2(32, 8), 0);
    // only 16px left on the first row, so it drops below the tallest cell so far
    assert.deepEqual([tile.pos.x, tile.pos.y], [0, 48]);
});

test('row height comes from the tallest image in the row', () =>
{
    const sheet = new TextureSheet(64);
    sheet.tryAdd(vec2(16, 8), vec2(16, 8), 0);
    sheet.tryAdd(vec2(16, 32), vec2(16, 32), 0);
    sheet.tryAdd(vec2(16, 4), vec2(16, 4), 0);
    // fill the row so the next image wraps
    const tile = sheet.tryAdd(vec2(32, 8), vec2(32, 8), 0);
    assert.deepEqual([tile.pos.x, tile.pos.y], [0, 32]);
});

test('a full sheet refuses instead of overflowing', () =>
{
    const sheet = new TextureSheet(32);
    assert.ok(sheet.tryAdd(vec2(32), vec2(32), 0));
    assert.equal(sheet.tryAdd(vec2(32), vec2(32), 0), undefined);
});

test('a failed tryAdd leaves the sheet unchanged', () =>
{
    // loadSprite probes full sheets before making a new one, so a failed
    // probe must not move the cursor or forget the current row height
    const sheet = new TextureSheet(64);
    sheet.tryAdd(vec2(32), vec2(32), 0);
    assert.equal(sheet.tryAdd(vec2(64, 48), vec2(64, 48), 0), undefined);

    // the next image still lands beside the first on the same row
    const tile = sheet.tryAdd(vec2(32), vec2(32), 0);
    assert.deepEqual([tile.pos.x, tile.pos.y], [32, 0]);

    // and wrapping still clears the first row instead of overlapping it
    const tile2 = sheet.tryAdd(vec2(16), vec2(16), 0);
    assert.deepEqual([tile2.pos.x, tile2.pos.y], [0, 32]);
});

test('every field the packer sets survives being copied onto a pending tile', () =>
{
    // loadSprite hands back a placeholder and fills it in once the image loads,
    // so a field the packer sets but the copy misses silently breaks at runtime
    const sheet = new TextureSheet(256);
    const packed = sheet.tryAdd(vec2(32), vec2(16), 1);
    const pending = new TileInfo(vec2(), vec2(), undefined, 1, 0);
    Object.assign(pending, packed);
    for (const key of Object.keys(packed))
        assert.deepEqual(pending[key], packed[key], `${key} was not carried over`);
    // columns in particular, since losing it makes frame() run off the sheet
    assert.equal(pending.columns, 2);
    assert.deepEqual([pending.frame(2).pos.x, pending.frame(2).pos.y], [1, 1 + 18]);
});

test('loadSprite returns an empty tile in headless mode', () =>
{
    const tile = loadSprite('missing.png');
    assert.deepEqual([tile.size.x, tile.size.y], [0, 0]);
});

test('spritesReady resolves when nothing is loading', async () =>
{
    await spritesReady();
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TextureSheet, TileInfo, loadSprite, loadAtlas, parseAtlas, spritesReady, textureSheets, vec2 } from '../dist/littlejs.esm.js';

// build a TexturePacker style frame entry
function texturePackerFrame(x, y, w, h, extra={})
{
    return {frame: {x, y, w, h}, rotated: false, trimmed: false,
        spriteSourceSize: {x: 0, y: 0, w, h}, sourceSize: {w, h}, ...extra};
}

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

test('source padding derives the grid from padded source cells', () =>
{
    // a 72x18 source of 16px frames with 1px baked in padding is 4 cells of 18px
    const sheet = new TextureSheet(256);
    const tile = sheet.tryAdd(vec2(72, 18), vec2(16), 1, 1);
    assert.equal(tile.columns, 4);
    assert.deepEqual([tile.size.x, tile.size.y], [16, 16]);
    // the packed block is 4 cells of the sheet's own padded size
    assert.equal(sheet.cursor.x, 4*18);
});

test('source padding works with grid sources', () =>
{
    // a 36x36 source of 16px frames with 1px source padding is a 2x2 grid
    const sheet = new TextureSheet(256);
    const tile = sheet.tryAdd(vec2(36), vec2(16), 0, 1);
    assert.equal(tile.columns, 2);
    assert.deepEqual([tile.frame(3).pos.x, tile.frame(3).pos.y], [16, 16]);
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

test('loadAtlas returns an empty object in headless mode', () =>
{
    assert.deepEqual(loadAtlas('atlas.png', 'atlas.json'), {});
});

test('parseAtlas groups numbered TexturePacker hash frames', () =>
{
    const groups = parseAtlas({frames: {
        'run_0.png': texturePackerFrame(0, 0, 16, 16),
        'run_1.png': texturePackerFrame(16, 0, 16, 16),
        'player.png': texturePackerFrame(32, 0, 24, 24),
    }});
    assert.deepEqual(groups.map(g=> [g.name, g.frames.length]),
        [['run', 2], ['player', 1]]);
    // frames are sorted by their trailing number
    assert.deepEqual([groups[0].frames[0].pos.x, groups[0].frames[1].pos.x], [0, 16]);
});

test('parseAtlas accepts the TexturePacker array layout', () =>
{
    const groups = parseAtlas({frames: [
        {filename: 'jump-1.png', ...texturePackerFrame(0, 0, 8, 8)},
        {filename: 'jump-2.png', ...texturePackerFrame(8, 0, 8, 8)},
    ]});
    assert.deepEqual(groups.map(g=> [g.name, g.frames.length]), [['jump', 2]]);
});

test('parseAtlas does not group non-contiguous or mismatched frames', () =>
{
    const groups = parseAtlas({frames: {
        'a_0.png': texturePackerFrame(0, 0, 8, 8),
        'a_2.png': texturePackerFrame(8, 0, 8, 8),  // gap in indices
        'b_0.png': texturePackerFrame(0, 8, 8, 8),
        'b_1.png': texturePackerFrame(8, 8, 16, 16), // different source size
    }});
    assert.deepEqual(groups.map(g=> g.name).sort(), ['a_0', 'a_2', 'b_0', 'b_1']);
});

test('parseAtlas keeps all digit and digit-ending names individual', () =>
{
    const groups = parseAtlas({frames: {
        '10.png': texturePackerFrame(0, 0, 8, 8),
        'player2.png': texturePackerFrame(8, 0, 8, 8),
    }});
    assert.deepEqual(groups.map(g=> g.name).sort(), ['10', 'player2']);
});

test('parseAtlas captures trim offset and rotated flag', () =>
{
    const groups = parseAtlas({frames: {
        'gem.png': {frame: {x: 4, y: 6, w: 10, h: 12}, rotated: true, trimmed: true,
            spriteSourceSize: {x: 3, y: 5, w: 10, h: 12}, sourceSize: {w: 16, h: 20}},
    }});
    const f = groups[0].frames[0];
    assert.deepEqual([f.pos.x, f.pos.y, f.size.x, f.size.y], [4, 6, 10, 12]);
    assert.deepEqual([f.offset.x, f.offset.y], [3, 5]);
    assert.deepEqual([f.sourceSize.x, f.sourceSize.y], [16, 20]);
    assert.equal(f.rotated, true);
});

test('parseAtlas uses Aseprite frame tags as animations', () =>
{
    const groups = parseAtlas({
        frames: {
            'hero 0.ase': texturePackerFrame(0, 0, 16, 16),
            'hero 1.ase': texturePackerFrame(16, 0, 16, 16),
            'hero 2.ase': texturePackerFrame(32, 0, 16, 16),
            'hero 3.ase': texturePackerFrame(48, 0, 16, 16),
        },
        meta: {frameTags: [
            {name: 'walk', from: 0, to: 2, direction: 'forward'},
        ]},
    });
    // walk covers frames 0-2, frame 3 is untagged so it stays individual
    assert.deepEqual(groups.map(g=> [g.name, g.frames.length]),
        [['walk', 3], ['hero 3', 1]]);
});

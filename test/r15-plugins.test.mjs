import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAtlas, TextureSheet, PathFinder, vec2 } from '../dist/littlejs.esm.js';

// review round 15: the texture sheet and path finder plugins

test('atlas frames named by folder, like TexturePacker makes, group under the folder name', () =>
{
    const frame = (x)=> ({ frame: { x, y: 0, w: 16, h: 16 }, sourceSize: { w: 16, h: 16 } });
    const names = ['walk/0001.png', 'walk/0002.png', 'walk/0003.png', 'idle.png'];
    const groups = parseAtlas({ frames: Object.fromEntries(names.map((name, i)=> [name, frame(i * 16)])) });
    assert.deepEqual(groups.map(g=> [g.name, g.frames.length]), [['walk', 3], ['idle', 1]]);
});

test('a sprite with padding baked in and no frame size packs as the image less its padding', () =>
{
    const sheet = new TextureSheet(64);
    const tileInfo = sheet.tryAdd(vec2(20), undefined, 1, 2);
    assert.ok(tileInfo, 'packed');
    assert.deepEqual([tileInfo.size.x, tileInfo.size.y], [16, 16]);
});

test('getNearestClearNode builds the node data of a finder never built, as findPath does', () =>
{
    const finder = new PathFinder(vec2(10));
    const node = finder.getNearestClearNode(vec2(5), 10, false);
    assert.ok(node, 'found a clear node on an open grid');
});
